import { BingoRoom, GameWinner, WalletTransaction } from '../../types.js';
import { db } from '../db.js';
import { adminDb } from '../firebaseAdmin.js';
import { adminService } from '../adminService.js';

export class PrizeCalculator {
  /**
   * Calculates payouts for room winners, splits the prize pool among multiple winners,
   * updates user wallets, and records financial transactions.
   */
  public async calculateAndDistributePayouts(
    room: BingoRoom,
    winners: GameWinner[]
  ): Promise<{ calculatedWinners: GameWinner[]; transactions: WalletTransaction[] }> {
    if (winners.length === 0) {
      return { calculatedWinners: [], transactions: [] };
    }

    // 1. Calculate pool and prize per winner
    const ticketsSold = room.ticketsSold || 1;
    const totalTicketSales = ticketsSold * room.ticketPrice;
    const grossPrizePool = Math.round(totalTicketSales * 0.80);
    // Minimum prize pool guaranteed equals 1.5x ticket price if pool is low
    const finalPrizePool = Math.max(grossPrizePool, Math.round(room.ticketPrice * 1.5));
    const prizePerWinner = Math.round(finalPrizePool / winners.length);

    const nowIso = new Date().toISOString();
    const calculatedWinners: GameWinner[] = [];
    const transactions: WalletTransaction[] = [];

    for (const winner of winners) {
      const winnerWithPrize: GameWinner = {
        ...winner,
        prizeAmount: prizePerWinner,
        wonAt: nowIso,
      };
      calculatedWinners.push(winnerWithPrize);

      // 2. Debit platform / credit winner wallet in memory
      const user = db.getUserById(winner.userId);
      const currentBalance = user ? user.walletBalance : 0;
      const newBalance = currentBalance + prizePerWinner;

      db.updateWalletBalance(
        winner.userId,
        prizePerWinner,
        'GAME_WIN',
        `Won Bingo Prize in ${room.name} (#${winner.cardNumber})`,
        `WIN-${room.id}-${winner.cardNumber}`,
        room.gameReferenceId
      );

      // 3. Create wallet transaction object
      const tx: WalletTransaction = {
        id: `tx_win_${Date.now()}_${Math.floor(Math.random() * 10000)}`,
        userId: winner.userId,
        amount: prizePerWinner,
        balanceAfter: newBalance,
        type: 'GAME_WIN',
        status: 'COMPLETED',
        reference: `WIN-${room.id}-${winner.cardNumber}`,
        description: `Won Bingo Prize (${winner.pattern}) in ${room.name}`,
        gameReferenceId: room.gameReferenceId,
        createdAt: nowIso,
      };
      transactions.push(tx);

      // 4. Async update user wallet in Firestore
      adminDb.collection('users').doc(winner.userId).set(
        {
          walletBalance: newBalance,
          updatedAt: nowIso,
        },
        { merge: true }
      ).catch((err) => {
        console.warn(`⚠️ [PrizeCalculator] Firestore user balance sync error for ${winner.userId}:`, err.message);
      });
    }

    // Update room object in memory
    const sysSettings = adminService.getSystemSettings();
    const platformFeePct = sysSettings.platformFeePercent ?? 20;
    room.prizePool = finalPrizePool;
    room.platformFee = Math.round(totalTicketSales * (platformFeePct / 100));
    room.lastWinners = calculatedWinners;

    return { calculatedWinners, transactions };
  }
}

export const prizeCalculator = new PrizeCalculator();
