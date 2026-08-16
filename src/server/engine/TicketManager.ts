import { BingoTicket, BingoRoom, UserProfile, WalletTransaction, CardReservation } from '../../types.js';
import { db } from '../db.js';
import { adminDb } from '../firebaseAdmin.js';
import { generateCardMatrixByNumber } from '../../lib/bingoUtils.js';
import { adminService } from '../adminService.js';
import { firestoreGuard } from '../firestoreGuard.js';
import { logger } from '../logger.js';

export class TicketManager {
  // Fast in-memory reservation cache for instant checks and quota savings
  private inMemoryReservations: Map<string, CardReservation> = new Map();

  /**
   * Retrieves active card reservations for a room (in-memory for maximum speed & 0 Firestore quota).
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
        // Check expiration for temporary holds
        if (res.status === 'RESERVED' && res.expiresAt && res.expiresAt < now) {
          this.inMemoryReservations.delete(key);
          continue;
        }
        resMap[res.cardNumber] = res;
      }
    }

    return resMap;
  }

  /**
   * Temporary hold on a card for a user for 30 seconds.
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

    const room = db.rooms.get(roomId);
    if (!room) throw new Error('Room not found');
    if (room.status === 'PLAYING' || room.status === 'FINISHED' || room.status === 'RESETTING') {
      throw new Error('Ticket sales are closed for this round. Please wait for the next game.');
    }

    const resKey = `${roomId}_${cardNum}`;
    const now = Date.now();
    const existing = this.inMemoryReservations.get(resKey);

    if (existing) {
      if (!existing.gameReferenceId || existing.gameReferenceId === room.gameReferenceId) {
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
      }
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

    // Store in memory cache
    this.inMemoryReservations.set(resKey, reservation);

    // Save to Firestore cardReservations with usage guard
    firestoreGuard.safeWrite('cardReservations', 'reserveCard', async () => {
      await adminDb.collection('cardReservations').doc(resKey).set(reservation);
    });

    return reservation;
  }

  /**
   * Cancels a user's temporary reservation.
   */
  public async cancelReservation(roomId: string, cardNumber: number, userId: string): Promise<boolean> {
    const cardNum = Number(cardNumber);
    const resKey = `${roomId}_${cardNum}`;
    const existing = this.inMemoryReservations.get(resKey);

    if (existing && existing.status === 'RESERVED' && existing.userId === userId) {
      this.inMemoryReservations.delete(resKey);

      firestoreGuard.safeWrite('cardReservations', 'cancelReservation', async () => {
        await adminDb.collection('cardReservations').doc(resKey).delete();
      });
      return true;
    }
    return false;
  }

  /**
   * Buys a ticket atomically (or toggles deselect if already owned in current round).
   */
  public async buyTicket(
    roomId: string,
    cardNumber: number,
    userId: string
  ): Promise<{ action: 'PURCHASED' | 'DESELECTED'; ticket?: BingoTicket; newBalance: number }> {
    const cardNum = Number(cardNumber);
    if (isNaN(cardNum) || cardNum < 1 || cardNum > 400) {
      throw new Error('Card number must be an integer between 1 and 400');
    }

    const room = db.rooms.get(roomId);
    if (!room) throw new Error('Room not found');
    if (room.status === 'PLAYING' || room.status === 'FINISHED' || room.status === 'RESETTING') {
      throw new Error('Ticket sales are closed for this round. Please wait for the next game.');
    }

    const resKey = `${roomId}_${cardNum}`;

    // Check if user already owns this card in this active round (toggle deselect)
    const existingTicket = Array.from(db.tickets.values()).find(
      (t) =>
        t.roomId === roomId &&
        t.cardNumber === cardNum &&
        t.userId === userId &&
        (t.gameReferenceId === room.gameReferenceId || !t.gameReferenceId) &&
        t.status === 'ACTIVE'
    );

    if (existingTicket) {
      // Refund / Deselect
      const user = db.getUserById(userId);
      const currentBalance = user ? user.walletBalance : 0;
      const newBalance = currentBalance + room.ticketPrice;

      db.updateWalletBalance(
        userId,
        room.ticketPrice,
        'REFUND',
        `Deselected Bingo Card #${cardNum} in ${room.name}`,
        `REFUND-${cardNum}-${roomId}`,
        room.gameReferenceId
      );

      db.tickets.delete(existingTicket.id);
      this.inMemoryReservations.delete(resKey);

      room.ticketsSold = Math.max(0, (room.ticketsSold || 1) - 1);
      const totalSales = room.ticketsSold * room.ticketPrice;
      const settings = adminService.getSystemSettings();
      const platformFeePct = settings.platformFeePercent ?? 20;
      const prizePct = settings.prizePercentage ?? 80;
      room.prizePool = Math.round(totalSales * (prizePct / 100));
      room.platformFee = Math.round(totalSales * (platformFeePct / 100));

      // Batch persist deselect to Firestore
      firestoreGuard.safeWrite('ticketDeselect', 'buyTicket-deselect', async () => {
        const batch = adminDb.batch();
        batch.delete(adminDb.collection('cardReservations').doc(resKey));
        batch.delete(adminDb.collection('tickets').doc(existingTicket.id));
        batch.set(adminDb.collection('users').doc(userId), { walletBalance: newBalance }, { merge: true });
        await batch.commit();
      });

      return { action: 'DESELECTED', newBalance };
    }

    // Check if another player owns or holds this card in current round
    const existingRes = this.inMemoryReservations.get(resKey);
    if (existingRes && (!existingRes.gameReferenceId || existingRes.gameReferenceId === room.gameReferenceId)) {
      if (existingRes.status === 'SOLD' && existingRes.userId !== userId) {
        throw new Error('This Bingo card has already been selected by another player.');
      }
    }

    const user = db.getUserById(userId);
    if (!user) throw new Error('User not found');
    if (user.walletBalance < room.ticketPrice) {
      throw new Error(`Insufficient wallet balance (${user.walletBalance} Birr available, ${room.ticketPrice} Birr required)`);
    }

    const newBalance = user.walletBalance - room.ticketPrice;

    // Deduct user balance in memory
    db.updateWalletBalance(
      userId,
      -room.ticketPrice,
      'TICKET_PURCHASE',
      `Bought Bingo Card #${cardNum} in ${room.name}`,
      `TKT-${cardNum}-${roomId}`,
      room.gameReferenceId
    );

    const matrix = generateCardMatrixByNumber(cardNum);
    const ticketId = `tkt_${roomId}_${cardNum}_${Date.now()}`;

    const newTicket: BingoTicket = {
      id: ticketId,
      roomId,
      gameReferenceId: room.gameReferenceId,
      cardNumber: cardNum,
      userId,
      username: user.username,
      matrix,
      daubed: Array(5).fill(false).map(() => Array(5).fill(false)),
      status: 'ACTIVE',
      purchasePrice: room.ticketPrice,
      boughtAt: new Date().toISOString(),
    };

    db.tickets.set(newTicket.id, newTicket);

    const reservationData: CardReservation = {
      id: resKey,
      roomId,
      gameReferenceId: room.gameReferenceId,
      cardNumber: cardNum,
      userId,
      username: user.username,
      status: 'SOLD',
      purchasedAt: new Date().toISOString(),
      createdAt: new Date().toISOString(),
    };
    this.inMemoryReservations.set(resKey, reservationData);

    room.ticketsSold = (room.ticketsSold || 0) + 1;
    const totalSales = room.ticketsSold * room.ticketPrice;
    const settings = adminService.getSystemSettings();
    const platformFeePct = settings.platformFeePercent ?? 20;
    const prizePct = settings.prizePercentage ?? 80;
    room.prizePool = Math.round(totalSales * (prizePct / 100));
    room.platformFee = Math.round(totalSales * (platformFeePct / 100));

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

    // Save ticket, reservation, and balance atomically to Firestore
    firestoreGuard.safeWrite('ticketPurchase', 'buyTicket-purchase', async () => {
      const batch = adminDb.batch();
      batch.set(adminDb.collection('tickets').doc(ticketId), newTicket);
      batch.set(adminDb.collection('cardReservations').doc(resKey), reservationData);
      batch.set(adminDb.collection('transactions').doc(walletTx.id), walletTx);
      batch.set(adminDb.collection('users').doc(userId), { walletBalance: newBalance }, { merge: true });
      await batch.commit();
    }, true); // Critical ticket purchase write

    return { action: 'PURCHASED', ticket: newTicket, newBalance };
  }

  /**
   * Clears tickets and reservations in memory for a room when starting a new game round.
   * Eliminates expensive 400-document Firestore write loops.
   * Round isolation is strictly achieved logically via gameReferenceId.
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
