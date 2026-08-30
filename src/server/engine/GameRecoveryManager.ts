import { BingoRoom, BingoTicket, WalletTransaction } from '../../types.js';
import { db, generateGameReferenceId } from '../db.js';
import { roomManager } from './RoomManager.js';
import { ballDrawer } from './BallDrawer.js';
import { ticketManager } from './TicketManager.js';
import { webSocketGateway } from './WebSocketGateway.js';
import { firestoreRepository } from './FirestoreRepository.js';
import { adminService } from '../adminService.js';
import { logger } from '../logger.js';

export class GameRecoveryManager {
  private startingLocks: Set<string> = new Set();
  private refundedTicketIds: Set<string> = new Set();
  private isWatchdogRunning: boolean = false;
  private watchdogInterval: NodeJS.Timeout | null = null;

  /**
   * Atomically verifies and starts a game round for a room.
   * STRICT GUARANTEES:
   * 1. Backend-controlled lifecycle (independent of frontend timer).
   * 2. Atomic state transition lock to prevent duplicate starts / race conditions.
   * 3. Confirmed tickets validation for current gameReferenceId.
   * 4. If start fails at any point, automatically transitions to START_FAILED,
   *    executes idempotent refunds for all confirmed tickets, and cleanly resets room.
   */
  public async attemptStartGame(
    roomId: string
  ): Promise<{ started: boolean; reason?: string; error?: string }> {
    if (this.startingLocks.has(roomId)) {
      logger.debug(`[GameRecovery] Start lock active for room ${roomId}, ignoring duplicate start attempt`);
      return { started: false, reason: 'LOCKED' };
    }

    this.startingLocks.add(roomId);

    try {
      const room = roomManager.getRoom(roomId);
      if (!room) {
        logger.warn(`[GameRecovery] Cannot start game: Room not found ${roomId}`);
        return { started: false, reason: 'ROOM_NOT_FOUND' };
      }

      // Check if room is already in an active playing or finished state
      if (room.status === 'PLAYING' || room.status === 'FINISHED' || room.status === 'RESETTING') {
        logger.debug(`[GameRecovery] Room ${roomId} is already in ${room.status} status`);
        return { started: false, reason: `ALREADY_${room.status}` };
      }

      // Atomically transition room status to STARTING
      room.status = 'STARTING';
      webSocketGateway.broadcastRoomUpdate(room);

      // Ensure room has a valid gameReferenceId
      if (!room.gameReferenceId) {
        room.gameReferenceId = generateGameReferenceId(room.ticketPrice, room.id);
      }

      // 1. Authoritative verification of confirmed ticket purchases in memory
      const confirmedTickets = Array.from(db.tickets.values()).filter(
        (t) =>
          t.roomId === roomId &&
          (t.gameReferenceId === room.gameReferenceId || !t.gameReferenceId) &&
          t.status === 'ACTIVE' &&
          typeof t.purchasePrice === 'number' &&
          t.purchasePrice > 0 &&
          Boolean(t.userId)
      );

      const confirmedCount = confirmedTickets.length;
      const settings = adminService.getSystemSettings();
      const requiredMinPlayers = Math.max(1, room.minPlayers || settings.minPlayers || 2);

      logger.info(
        `[GameRecovery] Validating game start room=${roomId} gameRef=${room.gameReferenceId} ticketsSold=${confirmedCount} requiredMin=${requiredMinPlayers}`
      );

      // 2. If minimum required players is not met, keep tickets selected and reset countdown
      if (confirmedCount < requiredMinPlayers) {
        logger.info(
          `[GameRecovery] Min players not reached for room=${roomId} (${confirmedCount}/${requiredMinPlayers}). Resetting countdown.`
        );
        const countdownSec = settings.countdownDurationSeconds || 45;
        const nowMs = Date.now();
        room.status = 'WAITING';
        room.countdownSeconds = countdownSec;
        room.startedAt = new Date(nowMs).toISOString();
        room.endsAt = new Date(nowMs + countdownSec * 1000).toISOString();

        webSocketGateway.broadcastRoomUpdate(room);
        webSocketGateway.broadcastCountdown(room.id, countdownSec, 'WAITING', room.startedAt, room.endsAt);
        return { started: false, reason: 'MIN_PLAYERS_NOT_MET' };
      }

      // 3. Verify user existence for each confirmed ticket
      for (const t of confirmedTickets) {
        const user = db.getUserById(t.userId);
        if (!user) {
          logger.warn(`[GameRecovery] Ticket ${t.id} has invalid user ${t.userId}, skipping player validation failure`);
        }
      }

      // 4. Calculate authoritative financial stats
      const platformFeePct = settings.platformFeePercent ?? 20;
      const totalSales = confirmedCount * room.ticketPrice;
      const platformFee = Math.round(totalSales * (platformFeePct / 100));
      const prizePool = Math.max(0, totalSales - platformFee);

      room.ticketsSold = confirmedCount;
      room.prizePool = prizePool;
      room.platformFee = platformFee;
      room.drawnBalls = [];
      room.currentBall = null;
      room.countdownSeconds = 0;
      room.startedAt = new Date().toISOString();
      room.endsAt = undefined;
      room.status = 'PLAYING';

      // 5. Save atomic game start checkpoint in Firestore
      await firestoreRepository.saveGameStartCheckpoint(room);

      // 6. Start the authoritative ball draw cycle
      ballDrawer.startBallDrawCycle(room.id);

      // 7. Broadcast game start to all connected clients
      webSocketGateway.broadcastRoomUpdate(room);
      webSocketGateway.broadcastCountdown(room.id, 0, 'PLAYING', room.startedAt, undefined);

      const io = webSocketGateway.getIO();
      if (io) {
        io.emit('rooms:updated', { rooms: Array.from(db.rooms.values()) });
        io.emit('room:status_changed', { roomId: room.id, status: 'PLAYING', gameReferenceId: room.gameReferenceId });
        io.to(room.id).emit('room:status_changed', {
          roomId: room.id,
          status: 'PLAYING',
          gameReferenceId: room.gameReferenceId,
        });
      }

      logger.info(
        `[GameRecovery] Game successfully started room=${roomId} gameRef=${room.gameReferenceId} ticketsSold=${confirmedCount} prizePool=${prizePool}`
      );

      return { started: true };
    } catch (err: any) {
      logger.error(`[GameRecovery] Critical error during game start room=${roomId}:`, err);

      const room = roomManager.getRoom(roomId);
      if (room) {
        room.status = 'START_FAILED';
        webSocketGateway.broadcastGameStartFailed(room.id, err.message || 'Game start error', room);

        // Automatic idempotent refund for all confirmed tickets of the failed game
        await this.refundFailedGameTickets(
          room.id,
          room.gameReferenceId,
          `Game failed to start due to a technical error: ${err.message || 'Internal error'}`
        );

        // Recover and create a fresh next round
        await ballDrawer.resetAndCreateNextGame(room, true);
        webSocketGateway.broadcastGameRecovered(room.id, room, 'Recovered from failed game start');
      }

      return { started: false, error: err.message };
    } finally {
      this.startingLocks.delete(roomId);
    }
  }

  /**
   * Idempotently refunds all confirmed ticket purchases for a failed or cancelled game round.
   * STRICT IDEMPOTENCY:
   * - Checks ticket ID and transaction ledger so no user/ticket is ever refunded twice.
   * - Records proper WalletTransaction in ledger with unique reference.
   * - Updates user wallet balance, in-app notification, and emits real-time WebSocket event.
   * - Persists batch write to Firestore.
   */
  public async refundFailedGameTickets(
    roomId: string,
    gameReferenceId?: string,
    reason: string = 'Game start failed'
  ): Promise<{ refundedCount: number; totalRefunded: number }> {
    const room = roomManager.getRoom(roomId);
    const nowIso = new Date().toISOString();
    const gameRef = gameReferenceId || room?.gameReferenceId;

    logger.info(
      `[GameRecovery] Processing ticket refunds for room=${roomId} gameRef=${gameRef} reason="${reason}"`
    );

    // Find all active/pending tickets matching roomId and gameReferenceId
    const ticketsToRefund = Array.from(db.tickets.values()).filter(
      (t) =>
        t.roomId === roomId &&
        (!gameRef || !t.gameReferenceId || t.gameReferenceId === gameRef) &&
        t.status !== 'REFUNDED' &&
        t.status !== 'COMPLETED' &&
        t.status !== 'BINGO_CLAIMED'
    );

    if (ticketsToRefund.length === 0) {
      logger.info(`[GameRecovery] No unrefunded tickets found for room=${roomId} gameRef=${gameRef}`);
      return { refundedCount: 0, totalRefunded: 0 };
    }

    const refundedTickets: BingoTicket[] = [];
    const transactions: WalletTransaction[] = [];
    let totalRefunded = 0;

    for (const ticket of ticketsToRefund) {
      // Strictly verify ticket has not been refunded yet
      if (this.refundedTicketIds.has(ticket.id) || ticket.status === 'REFUNDED') {
        logger.debug(`[GameRecovery] Ticket ${ticket.id} already refunded, skipping.`);
        continue;
      }

      // Check transaction ledger to prevent duplicate refund transactions
      const refundRef = `REFUND_FAIL_${ticket.id}`;
      const existingTx = db.transactions.find((tx) => tx.reference === refundRef);
      if (existingTx) {
        logger.debug(`[GameRecovery] Refund transaction ${refundRef} already exists, skipping.`);
        ticket.status = 'REFUNDED';
        this.refundedTicketIds.add(ticket.id);
        continue;
      }

      const refundAmount = ticket.purchasePrice || room?.ticketPrice || 0;
      if (refundAmount <= 0) {
        ticket.status = 'REFUNDED';
        this.refundedTicketIds.add(ticket.id);
        continue;
      }

      const user = db.getUserById(ticket.userId);
      if (!user) {
        logger.warn(`[GameRecovery] User ${ticket.userId} not found for ticket ${ticket.id}`);
        continue;
      }

      // Credit user wallet balance
      const newBalance = (user.walletBalance || 0) + refundAmount;
      user.walletBalance = newBalance;
      db.users.set(user.id, user);

      // Mark ticket as REFUNDED
      ticket.status = 'REFUNDED';
      ticket.refundedAt = nowIso;
      ticket.refundReason = reason;
      this.refundedTicketIds.add(ticket.id);
      refundedTickets.push(ticket);

      // Create ledger transaction
      const tx: WalletTransaction = {
        id: `tx_ref_${Date.now()}_${ticket.id}`,
        userId: user.id,
        username: user.username,
        amount: refundAmount,
        balanceAfter: newBalance,
        type: 'GAME_REFUND',
        status: 'COMPLETED',
        reference: refundRef,
        description: `Refund for Bingo Card #${ticket.cardNumber} in ${room?.name || 'Game'} (${reason})`,
        gameReferenceId: gameRef,
        createdAt: nowIso,
      };
      db.transactions.unshift(tx);
      transactions.push(tx);

      // Add in-app notification
      db.addNotification({
        userId: user.id,
        title: '💰 Ticket Purchase Refunded',
        message: `Your ${refundAmount} Birr ticket for ${room?.name || 'Bingo'} (Card #${ticket.cardNumber}) has been refunded. Reason: ${reason}.`,
        type: 'SYSTEM',
      });

      // Emit real-time WebSocket wallet update
      webSocketGateway.emitWalletUpdated(user.id, newBalance);
      totalRefunded += refundAmount;
    }

    // Persist batch refund in Firestore
    if (room && (refundedTickets.length > 0 || transactions.length > 0)) {
      await firestoreRepository.saveGameRefundBatch(room, refundedTickets, transactions, reason).catch((err) => {
        logger.error(`[GameRecovery] Failed to commit Firestore refund batch:`, err);
      });
    }

    // Clear reservations in memory for this room
    if (room) {
      room.prizePool = 0;
      room.platformFee = 0;
      room.ticketsSold = 0;
      room.activePlayersCount = 0;
      await ticketManager.clearTicketsForRoom(roomId);
    }

    // Broadcast refund event to all room participants
    webSocketGateway.broadcastGameRefunded(roomId, reason, refundedTickets.length, totalRefunded);

    logger.info(
      `[GameRecovery] Completed refunds for room=${roomId} refundedCount=${refundedTickets.length} totalAmount=${totalRefunded} Birr`
    );

    return { refundedCount: refundedTickets.length, totalRefunded };
  }

  /**
   * Watchdog process to detect stuck games, expired countdowns, and dead ball draw loops.
   */
  public async checkAndRecoverStuckGames(): Promise<void> {
    const allRooms = Array.from(db.rooms.values());
    const now = Date.now();

    for (const room of allRooms) {
      try {
        // CASE 1: Room stuck in STARTING status for more than 10 seconds
        if (room.status === 'STARTING') {
          const startedAtMs = room.startedAt ? new Date(room.startedAt).getTime() : 0;
          if (now - startedAtMs > 10000) {
            logger.warn(`[Watchdog] Room ${room.id} stuck in STARTING status for >10s. Triggering recovery.`);
            await this.refundFailedGameTickets(room.id, room.gameReferenceId, 'Watchdog detected stuck game start');
            await ballDrawer.resetAndCreateNextGame(room, true);
            webSocketGateway.broadcastGameRecovered(room.id, room, 'Recovered from stuck start');
            continue;
          }
        }

        // CASE 2: Room in COUNTDOWN or WAITING with expired countdown (>8s past endsAt)
        if (
          (room.status === 'COUNTDOWN' || room.status === 'WAITING') &&
          room.endsAt &&
          now > new Date(room.endsAt).getTime() + 8000
        ) {
          logger.warn(`[Watchdog] Room ${room.id} countdown expired ${room.endsAt}. Attempting game start.`);
          await this.attemptStartGame(room.id);
          continue;
        }

        // CASE 3: Room in START_FAILED or CANCELLED with leftover state
        if (room.status === 'START_FAILED' || room.status === 'CANCELLED') {
          logger.warn(`[Watchdog] Room ${room.id} in ${room.status} state. Resetting.`);
          await this.refundFailedGameTickets(room.id, room.gameReferenceId, `Recovering from ${room.status} state`);
          await ballDrawer.resetAndCreateNextGame(room, true);
          continue;
        }

        // CASE 4: Room in PLAYING status but ball draw loop is inactive
        if (room.status === 'PLAYING') {
          const isDrawActive = ballDrawer.isCycleActive(room.id);
          const drawnCount = (room.drawnBalls || []).length;

          if (!isDrawActive && drawnCount < 75) {
            const startedAtMs = room.startedAt ? new Date(room.startedAt).getTime() : 0;
            if (now - startedAtMs > 15000) {
              logger.warn(`[Watchdog] Room ${room.id} is PLAYING but ball draw is inactive. Resuming ball drawer.`);
              ballDrawer.startBallDrawCycle(room.id);
            }
          }
        }
      } catch (roomErr) {
        logger.error(`[Watchdog] Error inspecting room ${room.id}:`, roomErr);
      }
    }
  }

  /**
   * System startup recovery to inspect restored database and heal any interrupted games.
   */
  public async recoverOnStartup(): Promise<void> {
    logger.info('[GameRecovery] Running startup integrity check on all bingo rooms...');
    const allRooms = Array.from(db.rooms.values());

    for (const room of allRooms) {
      try {
        // If room was in STARTING or START_FAILED before server restart
        if (room.status === 'STARTING' || room.status === 'START_FAILED' || room.status === 'CANCELLED') {
          logger.warn(`[GameRecovery] Recovering room ${room.id} left in ${room.status} on boot`);
          await this.refundFailedGameTickets(room.id, room.gameReferenceId, 'Server restart recovery');
          await ballDrawer.resetAndCreateNextGame(room, true);
          continue;
        }

        // If room was in PLAYING, verify if it is viable or needs clean reset
        if (room.status === 'PLAYING') {
          const tickets = Array.from(db.tickets.values()).filter(
            (t) => t.roomId === room.id && t.gameReferenceId === room.gameReferenceId && t.status === 'ACTIVE'
          );
          if (tickets.length === 0) {
            logger.info(`[GameRecovery] Room ${room.id} in PLAYING has no active tickets on boot. Resetting.`);
            await ballDrawer.resetAndCreateNextGame(room, true);
          } else {
            logger.info(`[GameRecovery] Room ${room.id} in PLAYING has ${tickets.length} active tickets. Resuming ball drawer.`);
            ballDrawer.startBallDrawCycle(room.id);
          }
          continue;
        }

        // For WAITING or COUNTDOWN rooms, ensure proper timer
        if (room.status === 'WAITING' || room.status === 'COUNTDOWN') {
          const nowMs = Date.now();
          const countdownSec = adminService.getSystemSettings().countdownDurationSeconds || 45;
          room.countdownSeconds = countdownSec;
          room.startedAt = new Date(nowMs).toISOString();
          room.endsAt = new Date(nowMs + countdownSec * 1000).toISOString();
          room.status = 'WAITING';
        }
      } catch (err) {
        logger.error(`[GameRecovery] Startup recovery failed for room ${room.id}:`, err);
      }
    }

    // Start background watchdog timer
    this.startWatchdog();
    logger.info('[GameRecovery] Startup recovery completed and watchdog initialized.');
  }

  /**
   * Starts periodic watchdog loop (every 5 seconds).
   */
  public startWatchdog(): void {
    if (this.isWatchdogRunning) return;
    this.isWatchdogRunning = true;

    this.watchdogInterval = setInterval(async () => {
      await this.checkAndRecoverStuckGames();
    }, 5000);
  }

  /**
   * Stops background watchdog loop.
   */
  public stopWatchdog(): void {
    if (this.watchdogInterval) {
      clearInterval(this.watchdogInterval);
      this.watchdogInterval = null;
    }
    this.isWatchdogRunning = false;
  }
}

export const gameRecoveryManager = new GameRecoveryManager();
