import { roomManager } from './RoomManager.js';
import { ballDrawer } from './BallDrawer.js';
import { firestoreRepository } from './FirestoreRepository.js';
import { webSocketGateway } from './WebSocketGateway.js';
import { db } from '../db.js';
import { adminDb } from '../firebaseAdmin.js';
import { adminService } from '../adminService.js';

export class CountdownManager {
  private tickerInterval: NodeJS.Timeout | null = null;

  /**
   * Starts the 1-second server ticker loop for all rooms.
   */
  public startTicker(): void {
    if (this.tickerInterval) return;

    console.log('⏱️ [CountdownManager] Starting 1-second server-side countdown ticker...');

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

        if (remainingSeconds % 10 === 0 || remainingSeconds <= 5) {
          console.log(`[COUNTDOWN] ${remainingSeconds}s | [ROOM STATUS] ${room.status} | [ROOM ID] ${room.id} | [CURRENT GAME ID] ${room.gameReferenceId || (room as any).currentGameId || 'N/A'}`);
        }

        if (remainingSeconds <= 0) {
          console.log(`\n[COUNTDOWN END] Countdown reached zero for room ${room.id} (${room.name})`);
          console.log(`[START GAME CALLED] Room ID: ${room.id} | [CURRENT GAME ID] ${room.gameReferenceId || (room as any).currentGameId || 'N/A'}`);

          // 1. Verify confirmed ticket purchases (ACTIVE or BINGO_CLAIMED) in memory
          const memoryTickets = Array.from(db.tickets.values()).filter(
            (t) => t.roomId === room.id && (t.status === 'ACTIVE' || t.status === 'BINGO_CLAIMED')
          );

          let confirmedTickets = memoryTickets;

          // 2. Fallback to query Firestore if memory count is 0
          if (confirmedTickets.length === 0) {
            try {
              const fsTicketsSnap = await adminDb
                .collection('tickets')
                .where('roomId', '==', room.id)
                .where('status', '==', 'ACTIVE')
                .get();

              if (!fsTicketsSnap.empty) {
                const fsTickets = fsTicketsSnap.docs.map((d) => d.data() as any);
                fsTickets.forEach((t) => db.tickets.set(t.id, t));
                confirmedTickets = fsTickets;
              }
            } catch (err: any) {
              console.warn(`⚠️ [CountdownManager] Firestore tickets query error for ${room.id}:`, err.message);
            }
          }

          const confirmedCount = confirmedTickets.length;
          const uniqueActivePlayers = new Set(confirmedTickets.map((t) => t.userId)).size;
          const requiredMinPlayers = settings.minPlayers || room.minPlayers || 1;

          room.ticketsSold = confirmedCount;
          room.activePlayersCount = uniqueActivePlayers;

          console.log(`[ROOM STATUS] ${room.status}`);
          console.log(`[CONFIRMED TICKETS] ${confirmedCount}`);
          console.log(`[ACTIVE PLAYERS] ${uniqueActivePlayers}`);
          console.log(`[MIN PLAYERS] ${requiredMinPlayers}`);

          if (confirmedCount >= requiredMinPlayers) {
            console.log(`[ACTIVE GAME] YES - Starting Live Game for room ${room.id}`);
            console.log(`🚀 [CountdownManager] Transitioning room ${room.id} to PLAYING status`);
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
            console.log(`[BALL DRAW START] Triggering ball drawer for room ${room.id}`);
            ballDrawer.startBallDrawCycle(room.id);
          } else {
            console.log(`[START GAME EXIT] Insufficient confirmed tickets (${confirmedCount} < ${requiredMinPlayers}). Resetting countdown...`);
            const startTime = new Date(now).toISOString();
            const endTime = new Date(now + defaultDurationMs).toISOString();

            room.status = 'WAITING';
            room.countdownSeconds = defaultDurationSec;
            room.startedAt = startTime;
            room.endsAt = endTime;

            firestoreRepository.saveRoomSnapshot(room).catch(console.warn);
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

          // Log countdown progress at key milestones
          if (remainingSeconds % 15 === 0 || remainingSeconds <= 5) {
            console.log(`⏱️ [CountdownManager] Room ${room.id} (${room.name}): ${remainingSeconds}s remaining [Status: ${room.status}, Tickets sold: ${room.ticketsSold || 0}]`);
          }

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
      console.log('⏹️ [CountdownManager] Stopped countdown ticker.');
    }
  }
}

export const countdownManager = new CountdownManager();

