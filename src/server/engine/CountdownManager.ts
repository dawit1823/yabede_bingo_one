import { roomManager } from './RoomManager.js';
import { ballDrawer } from './BallDrawer.js';
import { firestoreRepository } from './FirestoreRepository.js';
import { webSocketGateway } from './WebSocketGateway.js';
import { db } from '../db.js';
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
          logger.debug(`[COUNTDOWN END] room=${room.id}`);

          // 1. Authoritative verification of confirmed ticket purchases in memory
          const confirmedTickets = Array.from(db.tickets.values()).filter(
            (t) =>
              t.roomId === room.id &&
              room.gameReferenceId &&
              t.gameReferenceId === room.gameReferenceId &&
              t.status === 'ACTIVE' &&
              typeof t.purchasePrice === 'number' &&
              t.purchasePrice > 0 &&
              Boolean(t.userId)
          );

          const confirmedCount = confirmedTickets.length;
          const uniqueActivePlayers = new Set(confirmedTickets.map((t) => t.userId)).size;
          const requiredMinPlayers = settings.minPlayers || room.minPlayers || 1;

          room.ticketsSold = confirmedCount;
          room.activePlayersCount = uniqueActivePlayers;

          if (confirmedCount >= requiredMinPlayers) {
            logger.info(`[GAME] Started room=${room.id} gameRef=${room.gameReferenceId || room.id} tickets=${confirmedCount} players=${uniqueActivePlayers}`);
            room.status = 'PLAYING';
            room.countdownSeconds = 0;
            room.startedAt = new Date().toISOString();

            // Save game start checkpoint to Firestore
            await firestoreRepository.saveGameStartCheckpoint(room);

            // Broadcast status change immediately to all clients
            webSocketGateway.broadcastRoomUpdate(room);
            webSocketGateway.broadcastCountdown(
              room.id,
              0,
              'PLAYING',
              room.startedAt,
              room.endsAt
            );

            // Start ball drawing cycle
            ballDrawer.startBallDrawCycle(room.id);
          } else {
            logger.info(`[GAME] Reset countdown room=${room.id} tickets=${confirmedCount} minRequired=${requiredMinPlayers}`);
            const startTime = new Date(now).toISOString();
            const endTime = new Date(now + defaultDurationMs).toISOString();

            room.status = 'WAITING';
            room.countdownSeconds = defaultDurationSec;
            room.startedAt = startTime;
            room.endsAt = endTime;

            webSocketGateway.broadcastRoomUpdate(room);
            webSocketGateway.broadcastCountdown(
              room.id,
              defaultDurationSec,
              'WAITING',
              startTime,
              endTime
            );
          }
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

