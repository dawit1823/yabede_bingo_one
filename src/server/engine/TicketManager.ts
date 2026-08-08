import { BingoTicket, BingoRoom, UserProfile, WalletTransaction } from '../../types.js';
import { db } from '../db.js';
import { adminDb } from '../firebaseAdmin.js';
import { generateCardMatrixByNumber } from '../../lib/bingoUtils.js';

export interface CardReservation {
  id: string;
  roomId: string;
  cardNumber: number;
  userId: string;
  username: string;
  status: 'RESERVED' | 'SOLD';
  createdAt: string;
  expiresAt: number;
}

export class TicketManager {
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

    const resId = `${roomId}_${cardNum}`;
    const resRef = adminDb.collection('cardReservations').doc(resId);
    const snap = await resRef.get();

    if (snap.exists) {
      const existing = snap.data() as CardReservation;
      if (existing.status === 'SOLD') {
        throw new Error('This Bingo card has already been selected by another player.');
      }
      if (
        existing.status === 'RESERVED' &&
        existing.userId !== userId &&
        existing.expiresAt &&
        existing.expiresAt > Date.now()
      ) {
        throw new Error('This Bingo card is currently being reserved by another player.');
      }
    }

    const reservation: CardReservation = {
      id: resId,
      roomId,
      cardNumber: cardNum,
      userId,
      username,
      status: 'RESERVED',
      createdAt: new Date().toISOString(),
      expiresAt: Date.now() + 30000,
    };

    await resRef.set(reservation);
    return reservation;
  }

  /**
   * Cancels a user's temporary reservation.
   */
  public async cancelReservation(roomId: string, cardNumber: number, userId: string): Promise<boolean> {
    const cardNum = Number(cardNumber);
    const resId = `${roomId}_${cardNum}`;
    const resRef = adminDb.collection('cardReservations').doc(resId);
    const snap = await resRef.get();

    if (snap.exists) {
      const data = snap.data() as CardReservation;
      if (data.status === 'RESERVED' && data.userId === userId) {
        await resRef.delete();
        return true;
      }
    }
    return false;
  }

  /**
   * Buys a ticket atomically (or toggles deselect if owned).
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

    // Check if user already owns this card in this active round (toggle deselect)
    const existingTicket = Array.from(db.tickets.values()).find(
      (t) => t.roomId === roomId && t.cardNumber === cardNum && t.userId === userId && t.status === 'ACTIVE'
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

      room.ticketsSold = Math.max(0, (room.ticketsSold || 1) - 1);
      const totalSales = room.ticketsSold * room.ticketPrice;
      room.prizePool = Math.round(totalSales * 0.80);
      room.platformFee = Math.round(totalSales * 0.20);

      // Delete reservation document from Firestore
      adminDb.collection('cardReservations').doc(`${roomId}_${cardNum}`).delete().catch(console.warn);
      adminDb.collection('tickets').doc(existingTicket.id).delete().catch(console.warn);

      return { action: 'DESELECTED', newBalance };
    }

    // Otherwise, purchase ticket
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

    room.ticketsSold = (room.ticketsSold || 0) + 1;
    const totalSales = room.ticketsSold * room.ticketPrice;
    room.prizePool = Math.round(totalSales * 0.80);
    room.platformFee = Math.round(totalSales * 0.20);

    // Save ticket and reservation to Firestore asynchronously
    adminDb.collection('tickets').doc(ticketId).set(newTicket).catch(console.warn);
    adminDb.collection('cardReservations').doc(`${roomId}_${cardNum}`).set({
      id: `${roomId}_${cardNum}`,
      roomId,
      cardNumber: cardNum,
      userId,
      username: user.username,
      status: 'SOLD',
      purchasedAt: new Date().toISOString(),
    }).catch(console.warn);

    // Persist wallet transaction to Firestore
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
    adminDb.collection('transactions').doc(walletTx.id).set(walletTx).catch(console.warn);
    adminDb.collection('users').doc(userId).set({ walletBalance: newBalance }, { merge: true }).catch(console.warn);

    return { action: 'PURCHASED', ticket: newTicket, newBalance };
  }

  /**
   * Clears tickets and reservations for a room when starting a new game round.
   */
  public async clearTicketsForRoom(roomId: string): Promise<void> {
    for (const [id, ticket] of db.tickets.entries()) {
      if (ticket.roomId === roomId && ticket.status === 'ACTIVE') {
        ticket.status = 'COMPLETED';
        adminDb.collection('tickets').doc(ticket.id).update({ status: 'COMPLETED' }).catch(console.warn);
      }
    }

    try {
      const snap = await adminDb.collection('cardReservations').where('roomId', '==', roomId).get();
      if (!snap.empty) {
        const batch = adminDb.batch();
        snap.docs.forEach((doc) => batch.delete(adminDb.collection('cardReservations').doc(doc.id)));
        await batch.commit();
      }
    } catch (err: any) {
      console.warn(`⚠️ [TicketManager] Error clearing reservations for ${roomId}:`, err.message);
    }
  }
}

export const ticketManager = new TicketManager();
