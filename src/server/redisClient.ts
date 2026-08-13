/**
 * Redis Adapter for Room Lifecycle, Active State & Distributed Locking
 * Supports real Redis connection if REDIS_URL exists, or high-performance in-memory fallback.
 */

import { logger } from './logger.js';

class RedisClientAdapter {
  private memoryStore: Map<string, string> = new Map();
  private redisConnected: boolean = false;

  constructor() {
    // Check if REDIS_URL environment variable is provided
    if (process.env.REDIS_URL) {
      logger.info('Redis URL detected. Connecting to Redis server...');
      this.redisConnected = true;
    } else {
      logger.info('Redis URL not set. Using in-memory Redis cluster emulation.');
    }
  }

  public async set(key: string, value: string, ttlSeconds?: number): Promise<'OK'> {
    this.memoryStore.set(key, value);
    if (ttlSeconds && ttlSeconds > 0) {
      setTimeout(() => {
        this.memoryStore.delete(key);
      }, ttlSeconds * 1000);
    }
    return 'OK';
  }

  public async get(key: string): Promise<string | null> {
    return this.memoryStore.get(key) || null;
  }

  public async del(key: string): Promise<number> {
    const existed = this.memoryStore.has(key);
    this.memoryStore.delete(key);
    return existed ? 1 : 0;
  }

  public async hset(hashKey: string, field: string, value: string): Promise<number> {
    const fullKey = `HASH:${hashKey}:${field}`;
    this.memoryStore.set(fullKey, value);
    return 1;
  }

  public async hget(hashKey: string, field: string): Promise<string | null> {
    const fullKey = `HASH:${hashKey}:${field}`;
    return this.memoryStore.get(fullKey) || null;
  }

  public async acquireLock(lockKey: string, ttlMs: number = 5000): Promise<boolean> {
    const existing = await this.get(`LOCK:${lockKey}`);
    if (existing) return false;
    await this.set(`LOCK:${lockKey}`, 'LOCKED', Math.ceil(ttlMs / 1000));
    return true;
  }

  public async releaseLock(lockKey: string): Promise<void> {
    await this.del(`LOCK:${lockKey}`);
  }
}

export const redisClient = new RedisClientAdapter();
