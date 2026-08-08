import { adminDb } from '../firebaseAdmin.js';
import { BingoRoom, GameWinner, GameHistoryRecord, BingoTicket, WalletTransaction } from '../../types.js';

export class GameRepository {
  /**
   * Save a single checkpoint when a room starts a game (transitions to PLAYING).
   * 1 write to Firestore.
   */
  public async saveGameStartCheckpoint(room: BingoRoom): Promise<void> {
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
    await adminDb.collection('gameRooms').doc(room.id).set(payload, { merge: true });
  }

  /**
   * Batched checkpoint write at Game End.
   * Atomic batch write for room final state, game history record, winners, and tickets.
   */
  public async saveGameEndCheckpoint(
    room: BingoRoom,
    winners: GameWinner[],
    tickets: BingoTicket[],
    transactions: WalletTransaction[]
  ): Promise<void> {
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
    batch.set(adminDb.collection('gameRooms').doc(room.id), roomPayload, { merge: true });

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
      batch.set(adminDb.collection('gameWinners').doc(winner.id), winner);
    }

    // 4. Wallet transactions for payouts if any
    for (const tx of transactions) {
      batch.set(adminDb.collection('transactions').doc(tx.id), tx);
    }

    await batch.commit();
  }

  /**
   * Save Room Snapshot (e.g., on reset or initialization)
   */
  public async saveRoomSnapshot(room: BingoRoom): Promise<void> {
    await adminDb.collection('rooms').doc(room.id).set(room);
    await adminDb.collection('gameRooms').doc(room.id).set(room);
  }

  public async getCompletedGameHistory(): Promise<GameHistoryRecord[]> {
    const snap = await adminDb.collection('gameHistory').get();
    return snap.docs.map((doc) => doc.data() as GameHistoryRecord);
  }

  public async getGameRooms(): Promise<BingoRoom[]> {
    const snap = await adminDb.collection('rooms').get();
    return snap.docs.map((doc) => doc.data() as BingoRoom);
  }
}

export const gameRepository = new GameRepository();
