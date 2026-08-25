import { roomManager } from './RoomManager.js';
import { ballDrawer } from './BallDrawer.js';
import { webSocketGateway } from './WebSocketGateway.js';
import { gameRecoveryManager } from './GameRecoveryManager.js';
import { adminService } from '../adminService.js';
import { logger } from '../logger.js';

export class CountdownManager {
  private tickerInterval: NodeJS.Timeout | null = null;

  /**
   * Starts the 1-second server ticker loop for all rooms.
   */
  public startTicker(): void {
    if (this.tickerInterval) return;

    logger.info('[CountdownManager] Starting countdown ticker...');

    this.tickerInterval = setInterval(async () => {
      const rooms = roomManager.getAllRooms();
      const settings = adminService.getSystemSettings();
      const defaultDurationSec = settings.countdownDurationSeconds || 45;
      const defaultDurationMs = defaultDurationSec * 1000;
      const resultDurationSec = settings.resultScreenDurationSeconds || 15;

      for (const room of rooms) {
        // --- 1. HANDLE RESULT SCREEN COUNTDOWN (FINISHED) ---
        if (room.status === 'FINISHED') {
          const now = Date.now();
          if (!room.startedAt || !room.endsAt) {
            room.startedAt = new Date(now).toISOString();
            room.endsAt = new Date(now + resultDurationSec * 1000).toISOString();
            room.countdownSeconds = resultDurationSec;
          }
          const endsAtMs = new Date(room.endsAt).getTime();
          const remainingSeconds = Math.max(0, Math.ceil((endsAtMs - now) / 1000));

          room.countdownSeconds = remainingSeconds;

          if (remainingSeconds <= 0) {
            logger.info(`[RESULT SCREEN END] room=${room.id} - resetting and transitioning to next round`);
            await ballDrawer.resetAndCreateNextGame(room, true);
          } else {
            // Broadcast live 1s result screen ticker to clients (zero Firestore writes)
            webSocketGateway.broadcastCountdown(
              room.id,
              remainingSeconds,
              'FINISHED',
              room.startedAt,
              room.endsAt
            );
          }
          continue;
        }

        // --- 2. HANDLE PRE-GAME CARD SELECTION COUNTDOWN (WAITING / COUNTDOWN) ---
        if (room.status !== 'WAITING' && room.status !== 'COUNTDOWN') {
          continue;
        }

        const now = Date.now();
        if (!room.startedAt || !room.endsAt) {
          room.startedAt = new Date(now).toISOString();
          room.endsAt = new Date(now + defaultDurationMs).toISOString();
          room.countdownSeconds = defaultDurationSec;
        }

        const endsAtMs = new Date(room.endsAt).getTime();
        const remainingSeconds = Math.max(0, Math.ceil((endsAtMs - now) / 1000));

        room.countdownSeconds = remainingSeconds;

        logger.debug(`[COUNTDOWN] room=${room.id} seconds=${remainingSeconds} status=${room.status}`);

        if (remainingSeconds <= 0) {
          logger.info(`[COUNTDOWN END] room=${room.id} - delegating atomic game start to GameRecoveryManager`);
          await gameRecoveryManager.attemptStartGame(room.id);
        } else {
          room.status = 'COUNTDOWN';

          // Broadcast ticker to clients
          webSocketGateway.broadcastCountdown(
            room.id,
            remainingSeconds,
            room.status,
            room.startedAt,
            room.endsAt
          );
        }
      }
    }, 1000);
  }

  /**
   * Stops the ticker loop.
   */
  public stopTicker(): void {
    if (this.tickerInterval) {
      clearInterval(this.tickerInterval);
      this.tickerInterval = null;
      logger.info('[CountdownManager] Stopped countdown ticker.');
    }
  }
}

export const countdownManager = new CountdownManager();

