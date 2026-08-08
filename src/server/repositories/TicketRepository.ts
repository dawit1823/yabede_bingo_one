import { adminDb } from '../firebaseAdmin.js';
import { BingoTicket } from '../../types.js';

export class TicketRepository {
  public async batchSaveTickets(tickets: BingoTicket[]): Promise<void> {
    if (tickets.length === 0) return;
    const batch = adminDb.batch();
    for (const ticket of tickets) {
      const ref = adminDb.collection('tickets').doc(ticket.id);
      batch.set(ref, ticket);
    }
    await batch.commit();
  }

  public async saveTicket(ticket: BingoTicket): Promise<void> {
    await adminDb.collection('tickets').doc(ticket.id).set(ticket);
  }

  public async getTicketsForRoom(roomId: string): Promise<BingoTicket[]> {
    const snap = await adminDb.collection('tickets').where('roomId', '==', roomId).get();
    return snap.docs.map((doc) => doc.data() as BingoTicket);
  }

  public async getTicketsForUser(userId: string): Promise<BingoTicket[]> {
    const snap = await adminDb.collection('tickets').where('userId', '==', userId).get();
    return snap.docs.map((doc) => doc.data() as BingoTicket);
  }

  public async getAllTickets(): Promise<BingoTicket[]> {
    const snap = await adminDb.collection('tickets').get();
    return snap.docs.map((doc) => doc.data() as BingoTicket);
  }

  public async saveCardReservation(roomId: string, cardNumber: number, userId: string): Promise<void> {
    const resId = `${roomId}_${cardNumber}`;
    await adminDb.collection('cardReservations').doc(resId).set({
      id: resId,
      roomId,
      cardNumber,
      userId,
      reservedAt: new Date().toISOString(),
    });
  }

  public async deleteCardReservationsForRoom(roomId: string): Promise<void> {
    const snap = await adminDb.collection('cardReservations').where('roomId', '==', roomId).get();
    if (snap.empty) return;
    const batch = adminDb.batch();
    snap.docs.forEach((d) => batch.delete(adminDb.collection('cardReservations').doc(d.id)));
    await batch.commit();
  }
}

export const ticketRepository = new TicketRepository();
