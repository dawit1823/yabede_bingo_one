/**
 * Continuous Room Lifecycle Scheduler for Real-Time Bingo
 * Integrates with GameManager for in-memory game engine execution and checkpoint persistence.
 */

import { gameManager } from './engine/GameManager.js';
import { logger } from './logger.js';

export class RoomLifecycleCronService {
  public initScheduler(io: any) {
    logger.info('[RoomScheduler] Starting Bingo Lifecycle Engine...');
    gameManager.initEngine(io).catch((err) => {
      logger.error('[RoomScheduler] Failed to initialize GameManager:', err);
    });
  }
}

export const roomLifecycleCronService = new RoomLifecycleCronService();
