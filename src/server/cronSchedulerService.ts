/**
 * Continuous Room Lifecycle Scheduler for Real-Time Bingo
 * Integrates with GameManager for in-memory game engine execution and checkpoint persistence.
 */

import { gameManager } from './engine/GameManager.js';

export class RoomLifecycleCronService {
  public initScheduler(io: any) {
    console.log('🚀 [RoomScheduler] Starting Real-Time Bingo Lifecycle Engine...');
    gameManager.initEngine(io).catch((err) => {
      console.error('🔥 [RoomScheduler] Failed to initialize GameManager:', err);
    });
  }
}

export const roomLifecycleCronService = new RoomLifecycleCronService();
