import { roomManager } from './RoomManager.js';
import { ballDrawer } from './BallDrawer.js';
import { firestoreRepository } from './FirestoreRepository.js';
import { webSocketGateway } from './WebSocketGateway.js';
import { db } from '../db.js';
import { adminDb } from '../firebaseAdmin.js';
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

      for (const room of rooms) {
        if (room.status !== 'WAITING' && room.status !== 'COUNTDOWN') {
          continue;
        }

        const now = Date.now();
        const endsAtMs = room.endsAt ? new Date(room.endsAt).getTime() : now + defaultDurationMs;
        const remainingSeconds = Math.max(0, Math.ceil((endsAtMs - now) / 1000));

        room.countdownSeconds = remainingSeconds;

        logger.debug(`[COUNTDOWN] room=${room.id} seconds=${remainingSeconds} status=${room.status}`);

        if (remainingSeconds <= 0) {
          logger.debug(`[COUNTDOWN END] room=${room.id}`);

          // 1. Authoritative verification of confirmed ticket purchases (ACTIVE or BINGO_CLAIMED) in memory
          const confirmedTickets = Array.from(db.tickets.values()).filter(
            (t) =>
              t.roomId === room.id &&
              (t.status === 'ACTIVE' || t.status === 'BINGO_CLAIMED') &&
              (!room.gameReferenceId || !t.gameReferenceId || t.gameReferenceId === room.gameReferenceId)
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

            firestoreRepository.saveRoomSnapshot(room).catch((err) => logger.warn('[Firestore] Room snapshot save error:', err.message));
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

