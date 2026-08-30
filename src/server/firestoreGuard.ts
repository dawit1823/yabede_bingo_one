/**
 * Firestore Access Guard & Usage Protection Layer
 * 
 * Provides:
 * - Resource-exhausted (Quota exceeded, Error code 8) circuit breaker protection
 * - Lightweight in-memory diagnostic counters (reads, writes, deletes, queries, active listeners)
 * - Zero extra Firestore writes or queries for metric collection
 * - Periodic logging of aggregated diagnostics in development/debug modes without spamming production
 * - Controlled bounded exponential backoff retry for critical financial operations
 * - Safe fallback execution to keep the in-memory game engine running smoothly
 */

import { logger } from './logger.js';

export interface FirestoreMetrics {
  reads: number;
  writes: number;
  deletes: number;
  queries: number;
  activeListeners: number;
  errors: number;
  quotaExceededCount: number;
  consecutiveQuotaErrors: number;
  isThrottled: boolean;
  throttleUntilMs: number;
}

export interface RetryOptions {
  maxRetries?: number;
  initialDelayMs?: number;
  maxDelayMs?: number;
  factor?: number;
}

class FirestoreGuard {
  private metrics: FirestoreMetrics = {
    reads: 0,
    writes: 0,
    deletes: 0,
    queries: 0,
    activeListeners: 0,
    errors: 0,
    quotaExceededCount: 0,
    consecutiveQuotaErrors: 0,
    isThrottled: false,
    throttleUntilMs: 0,
  };

  // Consecutive quota errors tracker for exponential backoff window
  private consecutiveQuotaErrors = 0;

  // Periodic diagnostic logging timer
  private diagnosticInterval: NodeJS.Timeout | null = null;

  constructor() {
    this.startPeriodicDiagnostics();
  }

  /**
   * Calculates exponential backoff throttle window based on consecutive RESOURCE_EXHAUSTED errors.
   * Step ladder: 60s (1m) -> 300s (5m) -> 900s (15m) -> 1800s (30m max).
   */
  private getThrottleDurationMs(consecutiveErrors: number): number {
    if (consecutiveErrors <= 1) return 60 * 1000; // 60 seconds
    if (consecutiveErrors === 2) return 5 * 60 * 1000; // 5 minutes
    if (consecutiveErrors === 3) return 15 * 60 * 1000; // 15 minutes
    return 30 * 60 * 1000; // 30 minutes cap
  }

  /**
   * Helper to inspect whether an error is a Firestore RESOURCE_EXHAUSTED / code 8 error.
   */
  public isQuotaError(err: any): boolean {
    if (!err) return false;
    const msg = err?.message || String(err);
    const code = err?.code;
    return (
      code === 8 ||
      code === 'RESOURCE_EXHAUSTED' ||
      msg.includes('RESOURCE_EXHAUSTED') ||
      msg.includes('Quota exceeded') ||
      msg.includes('8 RESOURCE_EXHAUSTED')
    );
  }

  /**
   * Resets consecutive error streak when operations succeed outside the throttle window.
   */
  public recordSuccess(): void {
    if (this.consecutiveQuotaErrors > 0 && !this.metrics.isThrottled) {
      this.consecutiveQuotaErrors = 0;
      this.metrics.consecutiveQuotaErrors = 0;
    }
  }

  /**
   * Records a read operation counter in memory.
   */
  public recordRead(collectionName?: string, count = 1): void {
    this.metrics.reads += count;
  }

  /**
   * Records a write/set/update operation counter in memory.
   */
  public recordWrite(collectionName?: string, count = 1): void {
    this.metrics.writes += count;
  }

  /**
   * Records a delete operation counter in memory.
   */
  public recordDelete(collectionName?: string, count = 1): void {
    this.metrics.deletes += count;
  }

  /**
   * Records a query execution counter in memory.
   */
  public recordQuery(collectionName?: string): void {
    this.metrics.queries += 1;
  }

  /**
   * Increments active listener counter when a realtime listener is attached.
   * Returns a cleanup callback that decrements the listener counter when unsubscribed.
   */
  public registerListener(collectionName?: string): () => void {
    this.metrics.activeListeners += 1;
    let released = false;
    return () => {
      if (!released) {
        released = true;
        this.metrics.activeListeners = Math.max(0, this.metrics.activeListeners - 1);
      }
    };
  }

  /**
   * Handles errors from Firestore operations.
   * Activates circuit-breaker throttling with exponential backoff if RESOURCE_EXHAUSTED (code 8) is detected.
   */
  public handleError(operation: string, collectionName: string, err: any, critical = false): void {
    this.metrics.errors += 1;
    const isQuota = this.isQuotaError(err);
    const msg = err?.message || String(err);

    if (isQuota) {
      this.metrics.quotaExceededCount += 1;
      this.consecutiveQuotaErrors += 1;
      this.metrics.consecutiveQuotaErrors = this.consecutiveQuotaErrors;
      const throttleDurationMs = this.getThrottleDurationMs(this.consecutiveQuotaErrors);
      this.metrics.isThrottled = true;
      this.metrics.throttleUntilMs = Date.now() + throttleDurationMs;
      logger.warn(
        `🚨 [FirestoreGuard] RESOURCE_EXHAUSTED (Code 8: Quota exceeded, strike #${this.consecutiveQuotaErrors}) on ${operation} for ${collectionName}. ` +
        `Circuit breaker active: Non-critical Firestore operations throttled for ${throttleDurationMs / 1000}s. ` +
        `Critical operation flag: ${critical}`
      );
    } else {
      logger.warn(`⚠️ [FirestoreGuard] Error on ${operation} for ${collectionName}: ${msg}`);
    }
  }

  /**
   * Checks if Firestore operations should currently be throttled to prevent quota hammering.
   */
  public isQuotaThrottled(): boolean {
    if (!this.metrics.isThrottled) return false;
    if (Date.now() > this.metrics.throttleUntilMs) {
      this.metrics.isThrottled = false;
      logger.info('✅ [FirestoreGuard] Quota throttle cooldown period ended. Resuming standard operations.');
      return false;
    }
    return true;
  }

  /**
   * Executes a Firestore read with error catching and metrics tracking.
   * Returns fallback value if read fails or is throttled.
   */
  public async safeRead<T>(
    collectionName: string,
    operationName: string,
    fn: () => Promise<T>,
    fallbackValue: T
  ): Promise<T> {
    if (this.isQuotaThrottled()) {
      logger.debug(`[FirestoreGuard] Skipping non-critical read '${operationName}' on '${collectionName}' due to quota throttle.`);
      return fallbackValue;
    }
    try {
      this.recordRead(collectionName);
      const res = await fn();
      this.recordSuccess();
      return res;
    } catch (err: any) {
      this.handleError(operationName, collectionName, err, false);
      return fallbackValue;
    }
  }

  /**
   * Executes a Firestore write/update with error catching and throttling check.
   */
  public async safeWrite(
    collectionName: string,
    operationName: string,
    fn: () => Promise<any>,
    critical = false,
    retryOptions?: RetryOptions
  ): Promise<boolean> {
    // 1. Non-critical: Drop write immediately when throttled to prevent quota exhaustion retry storms
    if (!critical) {
      if (this.isQuotaThrottled()) {
        logger.debug(`[FirestoreGuard] Dropping non-critical write '${operationName}' on '${collectionName}' (Quota throttled).`);
        return false;
      }
      try {
        this.recordWrite(collectionName);
        await fn();
        this.recordSuccess();
        return true;
      } catch (err: any) {
        this.handleError(operationName, collectionName, err, false);
        return false;
      }
    }

    // 2. Critical financial writes: Controlled, bounded retry with exponential backoff & jitter
    const maxRetries = retryOptions?.maxRetries ?? 2; // Strict limit: max 2 retries (3 attempts total)
    const initialDelay = retryOptions?.initialDelayMs ?? 1000;
    const maxDelay = retryOptions?.maxDelayMs ?? 5000;
    const factor = retryOptions?.factor ?? 2;

    let attempt = 0;
    while (attempt <= maxRetries) {
      try {
        this.recordWrite(collectionName);
        await fn();
        this.recordSuccess();
        return true;
      } catch (err: any) {
        attempt += 1;
        const isQuota = this.isQuotaError(err);
        this.handleError(operationName, collectionName, err, true);

        if (attempt > maxRetries) {
          logger.error(
            `❌ [FirestoreGuard] Critical financial operation '${operationName}' on '${collectionName}' failed after ${attempt} attempts. ` +
            `Error: ${err?.message || err}`
          );
          return false;
        }

        // Calculate backoff with jitter
        const baseDelay = Math.min(initialDelay * Math.pow(factor, attempt - 1), maxDelay);
        const jitter = Math.floor(Math.random() * 500);
        const delayMs = baseDelay + jitter;

        logger.warn(
          `⏳ [FirestoreGuard] Retrying critical write '${operationName}' (attempt ${attempt}/${maxRetries}) in ${delayMs}ms... ` +
          `(Quota error: ${isQuota})`
        );

        await new Promise((resolve) => setTimeout(resolve, delayMs));
      }
    }

    return false;
  }

  /**
   * Executes a Firestore delete with error catching and metrics tracking.
   */
  public async safeDelete(
    collectionName: string,
    operationName: string,
    fn: () => Promise<any>,
    critical = false
  ): Promise<boolean> {
    if (!critical && this.isQuotaThrottled()) {
      logger.debug(`[FirestoreGuard] Dropping non-critical delete '${operationName}' on '${collectionName}' (Quota throttled).`);
      return false;
    }
    try {
      this.recordDelete(collectionName);
      await fn();
      this.recordSuccess();
      return true;
    } catch (err: any) {
      this.handleError(operationName, collectionName, err, critical);
      return false;
    }
  }

  /**
   * Executes a Firestore query with error catching and metrics tracking.
   */
  public async safeQuery<T>(
    collectionName: string,
    operationName: string,
    fn: () => Promise<T>,
    fallbackValue: T
  ): Promise<T> {
    if (this.isQuotaThrottled()) {
      logger.debug(`[FirestoreGuard] Skipping query '${operationName}' on '${collectionName}' due to quota throttle.`);
      return fallbackValue;
    }
    try {
      this.recordQuery(collectionName);
      const res = await fn();
      this.recordSuccess();
      return res;
    } catch (err: any) {
      this.handleError(operationName, collectionName, err, false);
      return fallbackValue;
    }
  }

  /**
   * Returns formatted string representation of in-memory metrics.
   */
  public getFormattedMetrics(): string {
    return (
      `[FirestoreMetrics]\n` +
      `reads=${this.metrics.reads}\n` +
      `writes=${this.metrics.writes}\n` +
      `deletes=${this.metrics.deletes}\n` +
      `queries=${this.metrics.queries}\n` +
      `activeListeners=${this.metrics.activeListeners}\n` +
      `consecutiveQuotaErrors=${this.consecutiveQuotaErrors}`
    );
  }

  /**
   * Returns current in-memory usage metrics summary for monitoring or debug APIs.
   */
  public getMetrics(): FirestoreMetrics {
    return { ...this.metrics, consecutiveQuotaErrors: this.consecutiveQuotaErrors };
  }

  /**
   * Resets in-memory counters (useful for unit tests or snapshot intervals).
   */
  public resetMetrics(): void {
    this.metrics.reads = 0;
    this.metrics.writes = 0;
    this.metrics.deletes = 0;
    this.metrics.queries = 0;
    this.metrics.errors = 0;
    this.metrics.quotaExceededCount = 0;
    this.metrics.consecutiveQuotaErrors = 0;
    this.consecutiveQuotaErrors = 0;
  }

  /**
   * Starts periodic diagnostic logging if in development, test, or when DEBUG/INFO logging is enabled.
   * Does NOT make any Firestore calls.
   */
  private startPeriodicDiagnostics(): void {
    const isDev = process.env.NODE_ENV !== 'production';
    const isDebug = (process.env.LOG_LEVEL || '').toUpperCase() === 'DEBUG';

    // In dev or debug mode, log aggregated metrics every 60 seconds
    const intervalMs = isDebug ? 30000 : 60000;

    if (isDev || isDebug) {
      this.diagnosticInterval = setInterval(() => {
        // Only log if there has been any activity
        const hasActivity =
          this.metrics.reads > 0 ||
          this.metrics.writes > 0 ||
          this.metrics.deletes > 0 ||
          this.metrics.queries > 0 ||
          this.metrics.activeListeners > 0;

        if (hasActivity || isDebug) {
          console.log(`\n${this.getFormattedMetrics()}\n`);
        }
      }, intervalMs);

      // Unref timer so it doesn't hold open process shutdown
      if (this.diagnosticInterval.unref) {
        this.diagnosticInterval.unref();
      }
    }
  }
}

export const firestoreGuard = new FirestoreGuard();
