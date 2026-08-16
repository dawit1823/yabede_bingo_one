import crypto from 'crypto';
import { db, generateGameReferenceId } from '../db.js';
import { adminDb } from '../firebaseAdmin.js';
import { roomManager } from './RoomManager.js';
import { winnerValidator } from './WinnerValidator.js';
import { prizeCalculator } from './PrizeCalculator.js';
import { firestoreRepository } from './FirestoreRepository.js';
import { ticketManager } from './TicketManager.js';
import { webSocketGateway } from './WebSocketGateway.js';
import { adminService } from '../adminService.js';
import { logger } from '../logger.js';
import { BingoRoom } from '../../types.js';

export class BallDrawer {
  private activeIntervals: Map<string, NodeJS.Timeout> = new Map();
  private activeTimeouts: Map<string, NodeJS.Timeout> = new Map();

  /**
   * Starts ball drawing for a room in PLAYING state.
   * Draws the first ball after a short delay, then draws a ball every interval.
   */
  public startBallDrawCycle(roomId: string): void {
    if (this.activeIntervals.has(roomId) || this.activeTimeouts.has(roomId)) {
      return; // Already running
    }

    logger.info(`[GAME] Ball draw cycle started room=${roomId}`);

    const settings = adminService.getSystemSettings();
    const drawIntervalMs = (settings.ballDrawIntervalSeconds || 3) * 1000;

    const drawSingleBall = async () => {
      const room = roomManager.getRoom(roomId);

      if (!room || room.status !== 'PLAYING') {
        this.stopBallDrawCycle(roomId);
        return false;
      }

      if (room.drawnBalls.length >= 75) {
        logger.info(`[GAME] Finished room=${roomId} (All 75 balls drawn)`);
        this.stopBallDrawCycle(roomId);
        await this.handleGameCompletion(room, []);
        return false;
      }

      // Draw next random unique ball (1 to 75)
      let nextBall: number;
      do {
        nextBall = crypto.randomInt(1, 76);
      } while (room.drawnBalls.includes(nextBall));

      room.drawnBalls.push(nextBall);
      room.currentBall = nextBall;

      logger.debug(`[GAME] Ball drawn room=${roomId} ball=${nextBall} count=${room.drawnBalls.length}`);

      // Broadcast ball draw to all clients
      webSocketGateway.broadcastBallDrawn(roomId, nextBall, room.drawnBalls);

      // Check for winning tickets
      const { winners } = winnerValidator.autoCheckRoomWinners(roomId);

      if (winners.length > 0) {
        logger.info(`[GAME] Winners detected room=${roomId} count=${winners.length}`);
        this.stopBallDrawCycle(roomId);
        await this.handleGameCompletion(room, winners);
        return false;
      }

      return true;
    };

    // First ball drawn after a short 1.5s delay
    const initialTimeout = setTimeout(async () => {
      this.activeTimeouts.delete(roomId);
      const shouldContinue = await drawSingleBall();

      if (shouldContinue) {
        // Subsequent balls every configured interval seconds
        const interval = setInterval(async () => {
          await drawSingleBall();
        }, drawIntervalMs);

        this.activeIntervals.set(roomId, interval);
      }
    }, 1500);

    this.activeTimeouts.set(roomId, initialTimeout);
  }

  /**
   * Stops the ball draw loop/timeout for a room.
   */
  public stopBallDrawCycle(roomId: string): void {
    const timeout = this.activeTimeouts.get(roomId);
    if (timeout) {
      clearTimeout(timeout);
      this.activeTimeouts.delete(roomId);
    }

    const interval = this.activeIntervals.get(roomId);
    if (interval) {
      clearInterval(interval);
      this.activeIntervals.delete(roomId);
    }

    logger.debug(`[GAME] Stopped ball draw cycle room=${roomId}`);
  }

  /**
   * Handles game completion, prize distribution, checkpoint persistence, and schedules the next game.
   */
  private async handleGameCompletion(room: BingoRoom, rawWinners: any[]): Promise<void> {
    room.status = 'FINISHED';

    const roomTickets = Array.from(db.tickets.values()).filter((t) => t.roomId === room.id);

    // Calculate payouts & update wallets
    const { calculatedWinners, transactions } = await prizeCalculator.calculateAndDistributePayouts(
      room,
      rawWinners
    );

    // Persist checkpoint to Firestore
    await firestoreRepository.saveGameEndCheckpoint(room, calculatedWinners, roomTickets, transactions);

    // Broadcast winner event to socket clients
    for (const winner of calculatedWinners) {
      webSocketGateway.broadcastWinner(room.id, winner, room);
      // Send private wallet update to winner
      const user = db.getUserById(winner.userId);
      if (user) {
        webSocketGateway.emitWalletUpdated(winner.userId, user.walletBalance);
      }
    }

    // Schedule game reset after result screen duration to allow players to celebrate
    const settings = adminService.getSystemSettings();
    const resultDelayMs = (settings.resultScreenDurationSeconds || 8) * 1000;
    setTimeout(async () => {
      await this.resetAndCreateNextGame(room);
    }, resultDelayMs);
  }

  /**
   * Resets room data and automatically creates the next game round.
   */
  public async resetAndCreateNextGame(room: BingoRoom): Promise<void> {
    logger.debug(`[GAME] Resetting game round room=${room.id}`);

    const settings = adminService.getSystemSettings();
    const countdownSec = settings.countdownDurationSeconds || 45;

    room.status = 'RESETTING';
    await ticketManager.clearTicketsForRoom(room.id);

    const nowMs = Date.now();
    const newGameRef = generateGameReferenceId(room.ticketPrice, room.id);

    room.gameReferenceId = newGameRef;
    room.drawnBalls = [];
    room.currentBall = null;
    room.prizePool = 0;
    room.platformFee = 0;
    room.ticketsSold = 0;
    room.activePlayersCount = 0;
    room.lastWinners = [];
    room.countdownSeconds = countdownSec;
    room.startedAt = new Date(nowMs).toISOString();
    room.endsAt = new Date(nowMs + countdownSec * 1000).toISOString();
    room.status = 'WAITING';

    // Persist updated room state to Firestore
    await firestoreRepository.saveRoomSnapshot(room);

    // Reset roomStats in Firestore
    const resetStats = {
      roomId: room.id,
      gameReferenceId: newGameRef,
      prizePool: 0,
      platformFee: 0,
      ticketsSold: 0,
      totalSales: 0,
      activePlayersCount: 0,
      updatedAt: new Date().toISOString(),
    };
    adminDb.collection(`rooms/${room.id}/roomStats`).doc('current').set(resetStats, { merge: true }).catch(console.warn);
    adminDb.collection(`gameRooms/${room.id}/roomStats`).doc('current').set(resetStats, { merge: true }).catch(console.warn);

    // Notify clients of game reset & card availability
    webSocketGateway.broadcastGameReset(room.id, room);
    webSocketGateway.broadcastRoomUpdate(room);
    webSocketGateway.broadcastCountdown(room.id, countdownSec, 'WAITING', room.startedAt, room.endsAt);

    const io = webSocketGateway.getIO();
    if (io) {
      io.to(room.id).emit('room:snapshot', {
        room,
        tickets: [],
        reservations: {},
        messages: db.chatMessages.get(room.id) || [],
      });
      io.to(room.id).emit('card:updated', {
        roomId: room.id,
        action: 'RESET_ALL',
        reservations: {},
        room,
      });
    }

    logger.info(`[GAME] Next game round initialized room=${room.id} gameRef=${newGameRef}`);
  }
}

export const ballDrawer = new BallDrawer();
