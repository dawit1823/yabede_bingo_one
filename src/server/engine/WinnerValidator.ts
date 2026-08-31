import { BingoRoom, BingoTicket, GameWinner, WinningPattern } from '../../types.js';
import { db } from '../db.js';
import { evaluateBingoCard, checkWinningPattern, BingoEvaluationResult } from '../../lib/bingoUtils.js';

export class WinnerValidator {
  /**
   * Checks if a specific ticket matches a given winning pattern against drawn numbers.
   * STRICT 75-Ball 5x5 rules:
   * 1. Horizontal Row (any of 5 rows)
   * 2. Vertical Column (any of 5 columns)
   * 3. Main Diagonal
   * 4. Reverse Diagonal
   * 5. Four Corners
   * Center cell [2][2] is ALWAYS automatically marked.
   */
  public checkWinningPattern(
    ticket: BingoTicket | { matrix?: (number | 'FREE')[][]; cardNumber?: number } | (number | 'FREE')[][],
    drawnBalls: number[],
    pattern?: WinningPattern | null
  ): boolean {
    return checkWinningPattern(ticket, drawnBalls, pattern);
  }

  /**
   * Evaluates complete winning details for a Bingo card.
   */
  public evaluateBingoCard(
    ticket: BingoTicket | { matrix?: (number | 'FREE')[][]; cardNumber?: number } | (number | 'FREE')[][],
    drawnBalls: number[]
  ): BingoEvaluationResult {
    return evaluateBingoCard(ticket, drawnBalls);
  }

  /**
   * Automatically checks all active tickets in a room for valid winning patterns.
   * STRICTLY verifies:
   * 1. Room is in PLAYING status with valid gameReferenceId
   * 2. Only confirmed, purchased tickets matching the exact current gameReferenceId are checked
   * 3. Ticket status must be ACTIVE (not cancelled, refunded, or previous game)
   * 4. User must exist in the database
   * 5. If multiple cards complete a valid pattern on this draw, all simultaneous winners are collected
   */
  public autoCheckRoomWinners(roomId: string): { winners: GameWinner[]; room: BingoRoom | undefined } {
    const room = db.rooms.get(roomId);
    if (!room || room.status !== 'PLAYING' || !room.gameReferenceId) {
      return { winners: [], room: undefined };
    }

    // Zero drawn balls means no pattern can possibly be won
    if (!room.drawnBalls || room.drawnBalls.length === 0) {
      return { winners: [], room };
    }

    // STRICT: Only evaluate tickets that are ACTIVE, have purchasePrice > 0, belong to THIS exact room and gameReferenceId
    const activeTickets = Array.from(db.tickets.values()).filter(
      (t) =>
        t.roomId === roomId &&
        t.gameReferenceId === room.gameReferenceId &&
        t.status === 'ACTIVE' &&
        typeof t.purchasePrice === 'number' &&
        t.purchasePrice > 0 &&
        Boolean(t.userId)
    );

    // If zero confirmed purchased tickets exist for this game, NO WINNER CAN BE DETECTED
    if (activeTickets.length === 0) {
      return { winners: [], room };
    }

    const winners: GameWinner[] = [];
    const nowIso = new Date().toISOString();

    for (const ticket of activeTickets) {
      // Verify user actually exists in the database
      const user = db.getUserById(ticket.userId);
      if (!user) continue;

      const evalResult = this.evaluateBingoCard(ticket, room.drawnBalls);
      if (evalResult.isWinner) {
        const pattern = evalResult.matchedPattern || 'ONE_LINE';
        const winnerRecord: GameWinner = {
          id: `win_${roomId}_${ticket.id}_${pattern}`,
          roomId,
          gameReferenceId: room.gameReferenceId,
          ticketId: ticket.id,
          userId: ticket.userId,
          username: user.username || ticket.username || 'Player',
          cardNumber: ticket.cardNumber || 1,
          ticketPrice: ticket.purchasePrice || room.ticketPrice,
          pattern,
          prizeAmount: 0, // Calculated authoritatively by PrizeCalculator
          wonAt: nowIso,
        };
        winners.push(winnerRecord);
        ticket.status = 'BINGO_CLAIMED';
      }
    }

    return { winners, room };
  }
}

export const winnerValidator = new WinnerValidator();
