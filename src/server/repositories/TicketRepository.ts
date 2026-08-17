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
    const snap = await adminDb.collection('tickets').orderBy('boughtAt', 'desc').limit(100).get().catch(async () => {
      return adminDb.collection('tickets').limit(100).get();
    });
    return snap.docs.map((doc) => doc.data() as BingoTicket);
  }
}

export const ticketRepository = new TicketRepository();
