import { BingoTicket, BingoRoom, UserProfile, WalletTransaction, CardReservation } from '../../types.js';
import { db } from '../db.js';
import { adminDb } from '../firebaseAdmin.js';
import { generateCardMatrixByNumber } from '../../lib/bingoUtils.js';
import { adminService } from '../adminService.js';
import { firestoreGuard } from '../firestoreGuard.js';
import { logger } from '../logger.js';

export class TicketManager {
  // Authoritative in-memory reservation cache for instant checks, zero Firestore quota consumption
  private inMemoryReservations: Map<string, CardReservation> = new Map();

  /**
   * Generates a composite key using roomId + gameReferenceId + cardNumber to strictly isolate rounds.
   */
  private getReservationKey(roomId: string, gameReferenceId: string | undefined, cardNumber: number): string {
    return `${roomId}_${gameReferenceId || 'round'}_${cardNumber}`;
  }

  /**
   * Resolves either an official Bingo room or a private group room.
   */
  public getRoomOrGroup(roomId: string): BingoRoom | null {
    const room = db.rooms.get(roomId);
    if (room) return room;
    const group = db.privateGroups.get(roomId);
    if (group) {
      return {
        id: group.id,
        name: group.name,
        description: `Private Group Game (${group.code})`,
        icon: '🎟️',
        ticketPrice: group.ticketPrice,
        minPlayers: 2,
        maxPlayers: group.maxPlayers,
        status: group.status === 'LOBBY' ? 'WAITING' : group.status === 'COUNTDOWN' ? 'COUNTDOWN' : group.status === 'PLAYING' ? 'PLAYING' : 'FINISHED',
        currentBall: group.currentBall ?? null,
        drawnBalls: group.drawnBalls || [],
        winningPatterns: [group.winningPattern],
        prizePool: group.prizePool,
        countdownSeconds: group.countdownSeconds || 0,
        activePlayersCount: (db.groupMembers.get(group.id) || []).length,
        gameReferenceId: group.gameReferenceId,
        createdAt: group.createdAt,
      };
    }
    return null;
  }

  /**
   * Retrieves active card reservations for a room (authoritative in-memory for maximum speed & 0 Firestore quota).
   */
  public getRoomReservations(roomId: string, gameReferenceId?: string): Record<number, CardReservation> {
    const resMap: Record<number, CardReservation> = {};
    const now = Date.now();

    for (const [key, res] of this.inMemoryReservations.entries()) {
      if (res.roomId === roomId) {
        // Filter by gameReferenceId to isolate rounds logically
        if (gameReferenceId && res.gameReferenceId && res.gameReferenceId !== gameReferenceId) {
          continue;
        }
        // Prune expired temporary reservations from memory
        if (res.status === 'RESERVED' && res.expiresAt && res.expiresAt < now) {
          this.inMemoryReservations.delete(key);
          continue;
        }
        resMap[res.cardNumber] = res;
      }
    }

    // Merge in-memory active tickets as SOLD to ensure consistency
    for (const ticket of db.tickets.values()) {
      if (
        ticket.roomId === roomId &&
        ticket.status === 'ACTIVE' &&
        (!gameReferenceId || !ticket.gameReferenceId || ticket.gameReferenceId === gameReferenceId)
      ) {
        if (!resMap[ticket.cardNumber]) {
          resMap[ticket.cardNumber] = {
            id: `${roomId}_${ticket.cardNumber}`,
            roomId: ticket.roomId,
            gameReferenceId: ticket.gameReferenceId,
            cardNumber: ticket.cardNumber,
            userId: ticket.userId,
            username: ticket.username,
            status: 'SOLD',
            purchasedAt: ticket.boughtAt,
            createdAt: ticket.boughtAt,
          };
        }
      }
    }

    return resMap;
  }

  /**
   * Temporary hold on a card for a user for 30 seconds.
   * Authoritative in Render memory ONLY. Zero Firestore writes.
   */
  public async reserveCard(
    roomId: string,
    cardNumber: number,
    userId: string,
    username: string
  ): Promise<CardReservation> {
    const cardNum = Number(cardNumber);
    if (isNaN(cardNum) || cardNum < 1 || cardNum > 400) {
      throw new Error('Card number must be an integer between 1 and 400');
    }

    const room = this.getRoomOrGroup(roomId);
    if (!room) throw new Error('Room not found');
    if (room.status === 'PLAYING' || room.status === 'FINISHED' || room.status === 'RESETTING') {
      throw new Error('Ticket sales are closed for this round. Please wait for the next game.');
    }

    const gameRefId = room.gameReferenceId;
    const resKey = this.getReservationKey(roomId, gameRefId, cardNum);
    const now = Date.now();
    const existing = this.inMemoryReservations.get(resKey);

    if (existing) {
      if (existing.status === 'SOLD') {
        throw new Error('This Bingo card has already been selected by another player.');
      }
      if (
        existing.status === 'RESERVED' &&
        existing.userId !== userId &&
        existing.expiresAt &&
        existing.expiresAt > now
      ) {
        throw new Error('This Bingo card is currently being reserved by another player.');
      }
      // If expired, remove from memory
      if (existing.status === 'RESERVED' && existing.expiresAt && existing.expiresAt <= now) {
        this.inMemoryReservations.delete(resKey);
      }
    }

    // Also check if another player already owns this card in db.tickets for this round
    const existingTicket = Array.from(db.tickets.values()).find(
      (t) =>
        t.roomId === roomId &&
        t.cardNumber === cardNum &&
        t.status === 'ACTIVE' &&
        (!gameRefId || !t.gameReferenceId || t.gameReferenceId === gameRefId)
    );
    if (existingTicket && existingTicket.userId !== userId) {
      throw new Error('This Bingo card has already been selected by another player.');
    }

    const reservation: CardReservation = {
      id: resKey,
      roomId,
      gameReferenceId: room.gameReferenceId,
      cardNumber: cardNum,
      userId,
      username,
      status: 'RESERVED',
      createdAt: new Date().toISOString(),
      reservedAt: new Date().toISOString(),
      expiresAt: now + 30000,
    };

    // Stored strictly in memory - NEVER written to Firestore
    this.inMemoryReservations.set(resKey, reservation);

    return reservation;
  }

  /**
   * Cancels a user's temporary reservation in memory.
   * Zero Firestore writes.
   */
  public async cancelReservation(roomId: string, cardNumber: number, userId: string): Promise<boolean> {
    const cardNum = Number(cardNumber);
    const room = this.getRoomOrGroup(roomId);
    const gameRefId = room?.gameReferenceId;
    const resKey = this.getReservationKey(roomId, gameRefId, cardNum);
    const existing = this.inMemoryReservations.get(resKey);

    if (existing && existing.status === 'RESERVED' && existing.userId === userId) {
      this.inMemoryReservations.delete(resKey);
      return true;
    }

    // Also scan in memory for any active reservation matching roomId, cardNumber, userId
    for (const [key, res] of this.inMemoryReservations.entries()) {
      if (res.roomId === roomId && res.cardNumber === cardNum && res.userId === userId && res.status === 'RESERVED') {
        this.inMemoryReservations.delete(key);
        return true;
      }
    }

    return false;
  }

  /**
   * Buys a ticket atomically (or toggles deselect if already owned in current round).
   * Converts in-memory reservation to durable ticket ownership and persists ticket & balance to Firestore.
   */
  public async buyTicket(
    roomId: string,
    cardNumber: number,
    userId: string
  ): Promise<{ action: 'SELECTED' | 'DESELECTED'; ticket?: BingoTicket; newBalance: number }> {
    const cardNum = Number(cardNumber);
    if (isNaN(cardNum) || cardNum < 1 || cardNum > 400) {
      throw new Error('Card number must be an integer between 1 and 400');
    }

    const room = this.getRoomOrGroup(roomId);
    if (!room) throw new Error('Room not found');
    if (room.status === 'PLAYING' || room.status === 'FINISHED' || room.status === 'RESETTING') {
      throw new Error('Ticket sales are closed for this round. Please wait for the next game.');
    }

    const gameRefId = room.gameReferenceId;
    const resKey = this.getReservationKey(roomId, gameRefId, cardNum);

    // Check if user already owns this card in this active round (toggle deselect)
    const existingTicket = Array.from(db.tickets.values()).find(
      (t) =>
        t.roomId === roomId &&
        t.cardNumber === cardNum &&
        t.userId === userId &&
        (t.gameReferenceId === room.gameReferenceId || !t.gameReferenceId) &&
        t.status === 'ACTIVE'
    );

    const user = db.getUserById(userId);
    if (!user) throw new Error('User not found');

    const sysSettings = adminService.getSystemSettings();
    const platformFeePct = sysSettings.platformFeePercent ?? 20;
    const prizePct = sysSettings.prizePercentage ?? 80;

    if (existingTicket) {
      // --- REFUND / DESELECT ---
      const currentBalance = user.walletBalance || 0;
      const newBalance = currentBalance + room.ticketPrice;

      // Update in-memory user balance
      user.walletBalance = newBalance;
      db.users.set(userId, user);

      // Remove in-memory ticket & reservation
      db.tickets.delete(existingTicket.id);
      this.inMemoryReservations.delete(resKey);

      // Recalculate room financial stats (80% prize pool / 20% platform fee)
      room.ticketsSold = Math.max(0, (room.ticketsSold || 1) - 1);
      const totalSales = room.ticketsSold * room.ticketPrice;
      room.prizePool = Math.round(totalSales * (prizePct / 100));
      room.platformFee = Math.round(totalSales * (platformFeePct / 100));

      // Update private group member count if applicable
      if (roomId.startsWith('grp_') || db.privateGroups.has(roomId)) {
        const members = db.groupMembers.get(roomId);
        if (members) {
          const mem = members.find((m) => m.userId === userId);
          if (mem) {
            mem.ticketCount = Math.max(0, (mem.ticketCount || 1) - 1);
          }
        }
      }

      // Record refund transaction in in-memory ledger
      const refundTx: WalletTransaction = {
        id: `tx_refund_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
        userId,
        amount: room.ticketPrice,
        balanceAfter: newBalance,
        type: 'REFUND',
        status: 'COMPLETED',
        reference: `REFUND-${cardNum}-${roomId}`,
        description: `Released Bingo Card #${cardNum} in ${room.name}`,
        gameReferenceId: room.gameReferenceId,
        createdAt: new Date().toISOString(),
      };
      db.transactions.unshift(refundTx);

      // Single atomic batch: delete ticket, persist refund transaction, update user balance
      firestoreGuard.safeWrite('ticketDeselect', 'buyTicket-deselect', async () => {
        const batch = adminDb.batch();
        batch.delete(adminDb.collection('tickets').doc(existingTicket.id));
        batch.set(adminDb.collection('transactions').doc(refundTx.id), refundTx);
        batch.set(
          adminDb.collection('users').doc(userId),
          { walletBalance: newBalance, updatedAt: new Date().toISOString() },
          { merge: true }
        );
        await batch.commit();
      }, true);

      return { action: 'DESELECTED', newBalance };
    }

    // --- PURCHASE ---
    // Check max tickets limit (max 50 cards per player per room)
    const maxCards = sysSettings.maxCardsPerPlayer || 50;
    const userActiveTickets = Array.from(db.tickets.values()).filter(
      (t) =>
        t.roomId === roomId &&
        t.userId === userId &&
        t.status === 'ACTIVE' &&
        (!room.gameReferenceId || !t.gameReferenceId || t.gameReferenceId === room.gameReferenceId)
    );
    if (userActiveTickets.length >= maxCards) {
      throw new Error(`Maximum limit of ${maxCards} cards per player reached for this round.`);
    }

    // Check if another player owns or holds this card in current round
    const existingRes = this.inMemoryReservations.get(resKey);
    const now = Date.now();
    if (existingRes && (!existingRes.gameReferenceId || existingRes.gameReferenceId === room.gameReferenceId)) {
      if (existingRes.status === 'SOLD' && existingRes.userId !== userId) {
        throw new Error('This Bingo card has already been selected by another player.');
      }
      if (
        existingRes.status === 'RESERVED' &&
        existingRes.userId !== userId &&
        existingRes.expiresAt &&
        existingRes.expiresAt > now
      ) {
        throw new Error('This Bingo card is currently being reserved by another player.');
      }
    }

    // Double check active tickets across all users for this card in current round
    const anotherUserTicket = Array.from(db.tickets.values()).find(
      (t) =>
        t.roomId === roomId &&
        t.cardNumber === cardNum &&
        t.status === 'ACTIVE' &&
        (!room.gameReferenceId || !t.gameReferenceId || t.gameReferenceId === room.gameReferenceId)
    );
    if (anotherUserTicket && anotherUserTicket.userId !== userId) {
      throw new Error('This Bingo card has already been selected by another player.');
    }

    if (user.walletBalance < room.ticketPrice) {
      throw new Error(`Insufficient wallet balance (${user.walletBalance} Birr available, ${room.ticketPrice} Birr required)`);
    }

    const newBalance = user.walletBalance - room.ticketPrice;
    user.walletBalance = newBalance;
    user.totalGamesPlayed = (user.totalGamesPlayed || 0) + 1;
    db.users.set(userId, user);

    // Matrix generation with auto-daub center
    const matrix = generateCardMatrixByNumber(cardNum);
    const daubed = Array(5)
      .fill(false)
      .map(() => Array(5).fill(false));
    daubed[2][2] = true;

    const ticketId = `tkt_${roomId}_${cardNum}_${Date.now()}`;
    const newTicket: BingoTicket = {
      id: ticketId,
      roomId,
      gameReferenceId: room.gameReferenceId,
      cardNumber: cardNum,
      userId,
      username: user.username,
      matrix,
      daubed,
      status: 'ACTIVE',
      purchasePrice: room.ticketPrice,
      boughtAt: new Date().toISOString(),
    };

    db.tickets.set(newTicket.id, newTicket);

    // Convert in-memory reservation to SOLD state
    const reservationData: CardReservation = {
      id: resKey,
      roomId,
      gameReferenceId: room.gameReferenceId,
      cardNumber: cardNum,
      userId,
      username: user.username,
      status: 'SOLD',
      purchasedAt: newTicket.boughtAt,
      createdAt: newTicket.boughtAt,
    };
    this.inMemoryReservations.set(resKey, reservationData);

    // Recalculate room financial stats (80% prize pool / 20% platform fee)
    room.ticketsSold = (room.ticketsSold || 0) + 1;
    const totalSales = room.ticketsSold * room.ticketPrice;
    room.prizePool = Math.round(totalSales * (prizePct / 100));
    room.platformFee = Math.round(totalSales * (platformFeePct / 100));

    // Update private group member count if applicable
    if (roomId.startsWith('grp_') || db.privateGroups.has(roomId)) {
      const members = db.groupMembers.get(roomId);
      if (members) {
        const mem = members.find((m) => m.userId === userId);
        if (mem) {
          mem.ticketCount = (mem.ticketCount || 0) + 1;
          mem.status = 'READY';
        }
      }
    }

    // Record purchase transaction in in-memory ledger
    const walletTx: WalletTransaction = {
      id: `tx_buy_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
      userId,
      amount: -room.ticketPrice,
      balanceAfter: newBalance,
      type: 'TICKET_PURCHASE',
      status: 'COMPLETED',
      reference: `TKT-${cardNum}-${roomId}`,
      description: `Bought Bingo Card #${cardNum} in ${room.name}`,
      gameReferenceId: room.gameReferenceId,
      createdAt: new Date().toISOString(),
    };
    db.transactions.unshift(walletTx);

    // Single atomic batch: persist durable ticket, wallet transaction, and user balance
    firestoreGuard.safeWrite('ticketPurchase', 'buyTicket-purchase', async () => {
      const batch = adminDb.batch();
      batch.set(adminDb.collection('tickets').doc(ticketId), newTicket);
      batch.set(adminDb.collection('transactions').doc(walletTx.id), walletTx);
      batch.set(
        adminDb.collection('users').doc(userId),
        {
          walletBalance: newBalance,
          totalGamesPlayed: user.totalGamesPlayed,
          updatedAt: new Date().toISOString(),
        },
        { merge: true }
      );
      await batch.commit();
    }, true);

    return { action: 'SELECTED', ticket: newTicket, newBalance };
  }

  /**
   * Clears tickets and reservations in memory for a room when starting a new game round.
   * Round isolation is strictly achieved logically via gameReferenceId and in-memory cleanup.
   */
  public async clearTicketsForRoom(roomId: string): Promise<void> {
    logger.debug(`[TicketManager] Resetting in-memory tickets & reservations for room ${roomId}`);

    // 1. Mark in-memory active tickets as COMPLETED so they are excluded from the new round
    for (const [id, ticket] of db.tickets.entries()) {
      if (ticket.roomId === roomId && ticket.status === 'ACTIVE') {
        ticket.status = 'COMPLETED';
        db.tickets.delete(id);
      }
    }

    // 2. Clear in-memory reservations for this room
    for (const [key, res] of this.inMemoryReservations.entries()) {
      if (res.roomId === roomId) {
        this.inMemoryReservations.delete(key);
      }
    }
  }
}

export const ticketManager = new TicketManager();
