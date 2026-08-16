import { adminDb } from '../firebaseAdmin.js';
import { BingoRoom, GameWinner, GameHistoryRecord, BingoTicket, WalletTransaction } from '../../types.js';
import { firestoreGuard } from '../firestoreGuard.js';
import { logger } from '../logger.js';

export class FirestoreRepository {
  /**
   * Saves or updates a room snapshot in Firestore 'rooms' collection.
   */
  public async saveRoomSnapshot(room: BingoRoom): Promise<void> {
    await firestoreGuard.safeWrite('rooms', 'saveRoomSnapshot', async () => {
      const roomPayload = {
        ...room,
        updatedAt: new Date().toISOString(),
      };
      await adminDb.collection('rooms').doc(room.id).set(roomPayload, { merge: true });
    });
  }

  /**
   * Save a single checkpoint when a room starts a game (transitions to PLAYING).
   */
  public async saveGameStartCheckpoint(room: BingoRoom): Promise<void> {
    await firestoreGuard.safeWrite('rooms', 'saveGameStartCheckpoint', async () => {
      const payload = {
        status: 'PLAYING',
        gameReferenceId: room.gameReferenceId,
        startedAt: room.startedAt,
        endsAt: null,
        ticketsSold: room.ticketsSold,
        prizePool: room.prizePool,
        platformFee: room.platformFee,
        updatedAt: new Date().toISOString(),
      };
      await adminDb.collection('rooms').doc(room.id).set(payload, { merge: true });
    });
  }

  /**
   * Batched checkpoint write at Game End.
   * Persists room state, history record, winners, and transactions in a single atomic batch.
   */
  public async saveGameEndCheckpoint(
    room: BingoRoom,
    winners: GameWinner[],
    tickets: BingoTicket[],
    transactions: WalletTransaction[]
  ): Promise<void> {
    await firestoreGuard.safeWrite('gameEndCheckpoint', 'saveGameEndCheckpoint', async () => {
      const batch = adminDb.batch();

      // 1. Room state
      const roomPayload = {
        status: 'FINISHED',
        countdownSeconds: room.countdownSeconds,
        startedAt: room.startedAt,
        endsAt: room.endsAt,
        drawnBalls: room.drawnBalls,
        currentBall: room.currentBall,
        lastWinners: winners,
        updatedAt: new Date().toISOString(),
      };
      batch.set(adminDb.collection('rooms').doc(room.id), roomPayload, { merge: true });

      // 2. Game history record
      const historyId = `gh_${room.gameReferenceId}_${Date.now()}`;
      const firstWinner = winners[0];
      const historyRecord: GameHistoryRecord = {
        id: historyId,
        gameReferenceId: room.gameReferenceId,
        roomId: room.id,
        roomName: room.name,
        roomIcon: room.icon,
        ticketPrice: room.ticketPrice,
        userId: firstWinner?.userId || 'system',
        cardNumbers: winners.map((w) => w.cardNumber || 0),
        ticketsCount: room.ticketsSold || tickets.length,
        outcome: winners.length > 0 ? 'WON' : 'LOST',
        winningPattern: firstWinner?.pattern || null,
        prizeWon: firstWinner?.prizeAmount || 0,
        totalPrizePool: room.prizePool || 0,
        totalPlayersCount: room.activePlayersCount || 0,
        totalTicketsSold: room.ticketsSold || tickets.length,
        drawnBallsCount: (room.drawnBalls || []).length,
        drawnBalls: room.drawnBalls || [],
        winners,
        playedAt: new Date().toISOString(),
      };
      batch.set(adminDb.collection('gameHistory').doc(historyId), historyRecord);

      // 3. Winners records
      for (const winner of winners) {
        batch.set(adminDb.collection('winners').doc(winner.id), winner);
      }

      // 4. Wallet transactions for payouts if any
      for (const tx of transactions) {
        batch.set(adminDb.collection('transactions').doc(tx.id), tx);
      }

      await batch.commit();
    }, true); // Critical game-end write
  }

  /**
   * Retrieves official rooms from Firestore safely.
   */
  public async getGameRooms(): Promise<BingoRoom[]> {
    return firestoreGuard.safeRead<BingoRoom[]>('rooms', 'getGameRooms', async () => {
      const snap = await adminDb.collection('rooms').limit(10).get();
      return snap.docs.map((doc) => doc.data() as BingoRoom);
    }, []);
  }
}

export const firestoreRepository = new FirestoreRepository();
