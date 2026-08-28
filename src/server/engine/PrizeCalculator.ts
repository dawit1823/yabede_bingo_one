import { BingoRoom, GameWinner, WalletTransaction } from '../../types.js';
import { db } from '../db.js';
import { adminDb } from '../firebaseAdmin.js';
import { adminService } from '../adminService.js';
import { logger } from '../logger.js';
import { firestoreGuard } from '../firestoreGuard.js';

export class PrizeCalculator {
  private static finalizedGames: Set<string> = new Set();
  private static paidTickets: Set<string> = new Set();

  /**
   * Helper to verify if a gameReferenceId has already completed payout.
   */
  public static isGameFinalized(gameReferenceId?: string): boolean {
    if (!gameReferenceId) return false;
    return PrizeCalculator.finalizedGames.has(gameReferenceId);
  }

  /**
   * Helper to verify if a specific ticket has already received payout.
   */
  public static isTicketPaid(ticketId?: string): boolean {
    if (!ticketId) return false;
    return PrizeCalculator.paidTickets.has(ticketId);
  }

  /**
   * Calculates payouts for room winners, splits the prize pool among multiple winners,
   * updates user wallets, and records financial transactions.
   * STRICT GUARANTEES:
   * - Zero confirmed tickets = 0 prizePool, 0 payout, 0 balance change.
   * - Non-purchased / unconfirmed / cancelled / previous-round tickets cannot win or receive payouts.
   * - Idempotent: Same gameReferenceId or ticketId cannot be paid twice.
   */
  public async calculateAndDistributePayouts(
    room: BingoRoom,
    winners: GameWinner[]
  ): Promise<{ calculatedWinners: GameWinner[]; transactions: WalletTransaction[] }> {
    const gameRef = room.gameReferenceId || room.id;

    // Idempotency check: Never pay the same gameReferenceId twice
    if (PrizeCalculator.finalizedGames.has(gameRef)) {
      logger.warn(`[GAME] Payout skipped: gameReferenceId ${gameRef} has already been finalized/paid.`);
      return { calculatedWinners: [], transactions: [] };
    }

    // 1. Gather all genuine, confirmed tickets sold for THIS EXACT gameReferenceId
    const confirmedTickets = Array.from(db.tickets.values()).filter(
      (t) =>
        t.roomId === room.id &&
        t.gameReferenceId === room.gameReferenceId &&
        (t.status === 'ACTIVE' || t.status === 'BINGO_CLAIMED') &&
        typeof t.purchasePrice === 'number' &&
        t.purchasePrice > 0 &&
        Boolean(t.userId)
    );

    const ticketsSold = confirmedTickets.length;

    // If zero confirmed tickets were purchased, NO WINNER AND NO PAYOUT IS POSSIBLE
    if (ticketsSold === 0 || !winners || winners.length === 0) {
      PrizeCalculator.finalizedGames.add(gameRef);
      room.prizePool = 0;
      room.platformFee = 0;
      room.ticketsSold = 0;
      room.lastWinners = [];

      // Finalize all round tickets as LOST
      if (confirmedTickets.length > 0) {
        const nowIso = new Date().toISOString();
        const batch = adminDb.batch();
        for (const tkt of confirmedTickets) {
          tkt.status = 'COMPLETED';
          (tkt as any).winningStatus = 'LOST';
          (tkt as any).prizeWon = 0;
          batch.set(
            adminDb.collection('tickets').doc(tkt.id),
            { status: 'COMPLETED', winningStatus: 'LOST', prizeWon: 0, updatedAt: nowIso },
            { merge: true }
          );
        }
        firestoreGuard.safeWrite('tickets', 'finalizeNoWinnerTickets', async () => {
          await batch.commit();
        }, false).catch(console.warn);
      }

      logger.info(`[GAME] Game finalized with no payouts (ticketsSold=${ticketsSold}, winners=${winners?.length || 0}) room=${room.id} gameRef=${gameRef}`);
      return { calculatedWinners: [], transactions: [] };
    }

    // 2. Validate every claimed winner against the confirmed tickets for this game
    const validWinners: GameWinner[] = [];
    for (const rawWinner of winners) {
      if (!rawWinner.ticketId || !rawWinner.userId) {
        logger.warn(`[GAME] Payout skipped for invalid winner payload: missing ticketId/userId`);
        continue;
      }

      if (PrizeCalculator.paidTickets.has(rawWinner.ticketId)) {
        logger.warn(`[GAME] Payout skipped for ticket ${rawWinner.ticketId}: already paid.`);
        continue;
      }

      const matchingTicket = confirmedTickets.find(
        (t) =>
          t.id === rawWinner.ticketId &&
          t.userId === rawWinner.userId &&
          (t.cardNumber === rawWinner.cardNumber || rawWinner.cardNumber === undefined)
      );

      if (!matchingTicket) {
        logger.warn(
          `[GAME] Payout rejected: winner ${rawWinner.userId} has no confirmed matching ticket for room=${room.id} gameRef=${gameRef}`
        );
        continue;
      }

      const user = db.getUserById(rawWinner.userId);
      if (!user) {
        logger.warn(`[GAME] Payout rejected: user ${rawWinner.userId} does not exist in database`);
        continue;
      }

      validWinners.push({
        ...rawWinner,
        cardNumber: matchingTicket.cardNumber || rawWinner.cardNumber || 1,
        ticketPrice: matchingTicket.purchasePrice || room.ticketPrice,
      });
    }

    // If no validated winners remain after ticket verification
    if (validWinners.length === 0) {
      PrizeCalculator.finalizedGames.add(gameRef);
      room.prizePool = 0;
      room.platformFee = 0;
      room.lastWinners = [];
      logger.info(`[GAME] Game finalized without verified winners room=${room.id} gameRef=${gameRef}`);
      return { calculatedWinners: [], transactions: [] };
    }

    // 3. Authoritative financial calculation (Winner Prize Pool = Total Sales - Platform Rake Fee)
    const sysSettings = adminService.getSystemSettings();
    const platformFeePct = typeof sysSettings.platformFeePercent === 'number' ? sysSettings.platformFeePercent : 20;
    const prizePct = typeof sysSettings.prizePercentage === 'number' ? sysSettings.prizePercentage : (100 - platformFeePct);

    // Use verified tickets or room ticket counter to calculate exact ticket sales
    const effectiveTicketsSold = Math.max(ticketsSold, room.ticketsSold || 0);
    const totalTicketSales = effectiveTicketsSold * room.ticketPrice;
    const finalPlatformFee = Math.round(totalTicketSales * (platformFeePct / 100));
    const calculatedPrizePool = Math.max(0, totalTicketSales - finalPlatformFee);
    
    // Ensure the awarded prize pool matches the active room prize pool exactly
    const finalPrizePool = room.prizePool > 0 && Math.abs(room.prizePool - calculatedPrizePool) <= 1
      ? room.prizePool
      : calculatedPrizePool;
    const prizePerWinner = validWinners.length > 0
      ? Math.max(0, Math.floor(finalPrizePool / validWinners.length))
      : 0;

    // If prize per winner is 0 (e.g. 0 Birr pool)
    if (prizePerWinner <= 0) {
      PrizeCalculator.finalizedGames.add(gameRef);
      room.prizePool = 0;
      room.platformFee = 0;
      room.lastWinners = [];
      return { calculatedWinners: [], transactions: [] };
    }

    const nowIso = new Date().toISOString();
    const calculatedWinners: GameWinner[] = [];
    const transactions: WalletTransaction[] = [];
    const batch = adminDb.batch();

    for (const winner of validWinners) {
      const winnerWithPrize: GameWinner = {
        ...winner,
        prizeAmount: prizePerWinner,
        totalPrizePool: finalPrizePool,
        wonAt: nowIso,
      };
      calculatedWinners.push(winnerWithPrize);
      PrizeCalculator.paidTickets.add(winner.ticketId);

      // Mark ticket as claimed in memory
      const tkt = db.tickets.get(winner.ticketId);
      if (tkt) {
        tkt.status = 'BINGO_CLAIMED';
        (tkt as any).winningStatus = 'WON';
        (tkt as any).prizeWon = prizePerWinner;
      }

      // Debit platform / credit winner wallet in memory and record transaction
      const { user: updatedUser, transaction: tx } = db.updateWalletBalance(
        winner.userId,
        prizePerWinner,
        'GAME_WIN',
        `Won Bingo Prize in ${room.name} (Card #${winner.cardNumber})`,
        `WIN-${room.id}-${winner.cardNumber}-${winner.ticketId}`,
        gameRef
      );
      transactions.push(tx);

      // Batch update user wallet, wallet doc, transaction, and winner record in Firestore
      batch.set(
        adminDb.collection('users').doc(winner.userId),
        { walletBalance: updatedUser.walletBalance, totalWins: updatedUser.totalWins, updatedAt: nowIso },
        { merge: true }
      );
      batch.set(
        adminDb.collection('wallets').doc(winner.userId),
        { userId: winner.userId, balance: updatedUser.walletBalance, updatedAt: nowIso },
        { merge: true }
      );
      batch.set(adminDb.collection('transactions').doc(tx.id), tx);
      batch.set(adminDb.collection('winners').doc(`win_${room.id}_${winner.userId}_${Date.now()}`), winnerWithPrize);
    }

    // 4. Finalize all tickets for this round as WON or LOST (never left PENDING)
    const validWinnerTicketIds = new Set(validWinners.map((w) => w.ticketId));
    for (const tkt of confirmedTickets) {
      if (!validWinnerTicketIds.has(tkt.id)) {
        tkt.status = 'COMPLETED';
        (tkt as any).winningStatus = 'LOST';
        (tkt as any).prizeWon = 0;
        batch.set(
          adminDb.collection('tickets').doc(tkt.id),
          { status: 'COMPLETED', winningStatus: 'LOST', prizeWon: 0, updatedAt: nowIso },
          { merge: true }
        );
      } else {
        batch.set(
          adminDb.collection('tickets').doc(tkt.id),
          { status: 'BINGO_CLAIMED', winningStatus: 'WON', prizeWon: prizePerWinner, updatedAt: nowIso },
          { merge: true }
        );
      }
    }

    // Update room object in memory
    room.prizePool = finalPrizePool;
    room.platformFee = finalPlatformFee;
    room.lastWinners = calculatedWinners;

    // Batch update room document in Firestore
    batch.set(adminDb.collection('rooms').doc(room.id), room, { merge: true });

    // Mark gameReferenceId as finalized
    PrizeCalculator.finalizedGames.add(gameRef);

    // Guarded critical batch write to Firestore (with controlled retry and backoff)
    await firestoreGuard.safeWrite(
      'payouts',
      'calculateAndDistributePayouts',
      async () => {
        await batch.commit();
      },
      true
    );

    logger.info(`[GAME] Payouts committed room=${room.id} gameRef=${gameRef} winners=${calculatedWinners.length} prizePerWinner=${prizePerWinner}`);
    return { calculatedWinners, transactions };
  }
}

export const prizeCalculator = new PrizeCalculator();
