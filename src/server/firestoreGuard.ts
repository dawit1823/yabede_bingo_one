/**
 * Firestore Access Guard & Usage Protection Layer
 * 
 * Provides:
 * - Metrics tracking (reads, writes, queries, errors, RESOURCE_EXHAUSTED)
 * - Circuit breaker & backoff protection when quotas are exceeded
 * - Safe fallback execution to keep real-time in-memory game engine running smoothly
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

  private readonly THROTTLE_DURATION_MS = 30000; // 30s cooldown when quota is exhausted

  /**
   * Records a read operation and logs if in high frequency.
   */
  public recordRead(collectionName: string, count = 1): void {
    this.metrics.reads += count;
    if (this.metrics.reads % 50 === 0) {
      logger.debug(`[FirestoreUsage] operation=read collection=${collectionName} reads=${count} totalReads=${this.metrics.reads}`);
    }
  }

  /**
   * Records a write/batch operation.
   */
  public recordWrite(collectionName: string, count = 1): void {
    this.metrics.writes += count;
    if (this.metrics.writes % 50 === 0) {
      logger.debug(`[FirestoreUsage] operation=write collection=${collectionName} writes=${count} totalWrites=${this.metrics.writes}`);
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
  public handleError(operation: string, collectionName: string, err: any): void {
    this.metrics.errors += 1;
    const msg = err?.message || String(err);
    const isQuotaError = msg.includes('RESOURCE_EXHAUSTED') || msg.includes('Quota exceeded') || err?.code === 8;

    if (isQuotaError) {
      this.metrics.quotaExceededCount += 1;
      this.metrics.isThrottled = true;
      this.metrics.throttleUntilMs = Date.now() + this.THROTTLE_DURATION_MS;
      logger.warn(`⚠️ [FirestoreGuard] RESOURCE_EXHAUSTED on ${operation} for ${collectionName}. Throttling non-critical Firestore operations for 30s.`);
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
      logger.info('[FirestoreGuard] Quota throttle cooldown period ended. Resuming standard operations.');
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
      return fallbackValue;
    }
    try {
      this.recordRead(collectionName);
      return await fn();
    } catch (err: any) {
      this.handleError(operationName, collectionName, err);
      return fallbackValue;
    }
  }

  /**
   * Executes a Firestore write with error catching and throttling check.
   */
  public async safeWrite(
    collectionName: string,
    operationName: string,
    fn: () => Promise<any>,
    critical = false
  ): Promise<boolean> {
    if (!critical && this.isQuotaThrottled()) {
      return false;
    }
    try {
      this.recordWrite(collectionName);
      await fn();
      return true;
    } catch (err: any) {
      this.handleError(operationName, collectionName, err);
      return false;
    }
  }

  /**
   * Returns current usage metrics summary for monitoring.
   */
  public getMetrics(): FirestoreMetrics {
    return { ...this.metrics };
  }
}

export const firestoreGuard = new FirestoreGuard();
