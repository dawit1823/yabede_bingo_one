/**
 * Firestore Access Guard & Usage Protection Layer
 * 
 * Provides:
 * - Resource-exhausted (Quota exceeded, Error code 8) circuit breaker protection
 * - Prevention of retry storms for non-critical operations (room snapshots, stats, reservations)
 * - Controlled bounded exponential backoff retry for critical financial operations (purchases, refunds, deposits, withdrawals)
 * - Clear, high-visibility quota exhaustion logging
 * - Safe fallback execution to keep the in-memory game engine running smoothly
 */

import { logger } from './logger.js';

export interface FirestoreMetrics {
  reads: number;
  writes: number;
  queries: number;
  errors: number;
  quotaExceededCount: number;
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
    queries: 0,
    errors: 0,
    quotaExceededCount: 0,
    isThrottled: false,
    throttleUntilMs: 0,
  };

  // 60-second cooldown window when quota is exhausted before re-enabling non-critical ops
  private readonly THROTTLE_DURATION_MS = 60000;

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
   * Records a read operation and logs frequency.
   */
  public recordRead(collectionName: string, count = 1): void {
    this.metrics.reads += count;
    if (this.metrics.reads % 100 === 0) {
      logger.debug(`[FirestoreUsage] op=read collection=${collectionName} reads=${count} totalReads=${this.metrics.reads}`);
    }
  }

  /**
   * Records a write/batch operation.
   */
  public recordWrite(collectionName: string, count = 1): void {
    this.metrics.writes += count;
    if (this.metrics.writes % 100 === 0) {
      logger.debug(`[FirestoreUsage] op=write collection=${collectionName} writes=${count} totalWrites=${this.metrics.writes}`);
    }
  }

  /**
   * Records a query execution.
   */
  public recordQuery(collectionName: string): void {
    this.metrics.queries += 1;
  }

  /**
   * Handles errors from Firestore operations.
   * Activates circuit-breaker throttling if RESOURCE_EXHAUSTED (code 8) is detected.
   */
  public handleError(operation: string, collectionName: string, err: any, critical = false): void {
    this.metrics.errors += 1;
    const isQuota = this.isQuotaError(err);
    const msg = err?.message || String(err);

    if (isQuota) {
      this.metrics.quotaExceededCount += 1;
      this.metrics.isThrottled = true;
      this.metrics.throttleUntilMs = Date.now() + this.THROTTLE_DURATION_MS;
      logger.warn(
        `🚨 [FirestoreGuard] RESOURCE_EXHAUSTED (Code 8: Quota exceeded) on ${operation} for ${collectionName}. ` +
        `Circuit breaker active: Non-critical Firestore writes throttled for ${this.THROTTLE_DURATION_MS / 1000}s. ` +
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
      return await fn();
    } catch (err: any) {
      this.handleError(operationName, collectionName, err, false);
      return fallbackValue;
    }
  }

  /**
   * Executes a Firestore write with error catching and throttling check.
   * 
   * Non-critical writes (critical=false):
   * - Immediately skipped during quota throttling without retrying.
   * - Fails silently or returns false without triggering any retry loop or storm.
   * 
   * Critical financial writes (critical=true):
   * - Bypasses quota-throttled skipping.
   * - Uses controlled, bounded exponential backoff (max 2 retries) with jitter.
   * - If all retries fail, logs error clearly and safely returns false (or throws if critical).
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
   * Returns current usage metrics summary for monitoring.
   */
  public getMetrics(): FirestoreMetrics {
    return { ...this.metrics };
  }
}

export const firestoreGuard = new FirestoreGuard();
