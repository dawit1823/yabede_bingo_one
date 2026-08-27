import { BingoRoom, BingoTicket, GameWinner, WinningPattern } from '../../types.js';
import { db } from '../db.js';

export class WinnerValidator {
  /**
   * Checks if a specific ticket matches a given winning pattern against drawn numbers.
   */
  public checkWinningPattern(
    ticket: BingoTicket,
    drawnBalls: number[],
    pattern: WinningPattern
  ): boolean {
    if (!ticket || !ticket.matrix || !Array.isArray(ticket.matrix)) return false;
    if (!Array.isArray(drawnBalls) || drawnBalls.length === 0) return false;

    // Create boolean daubed matrix based on drawn numbers + FREE space
    const daubedMatrix: boolean[][] = ticket.matrix.map((row) =>
      row.map((cell) => cell === 'FREE' || drawnBalls.includes(cell as number))
    );

    const hasCorners =
      Boolean(daubedMatrix[0][0]) &&
      Boolean(daubedMatrix[0][4]) &&
      Boolean(daubedMatrix[4][0]) &&
      Boolean(daubedMatrix[4][4]);

    if (pattern === 'FOUR_CORNERS' || pattern === 'CORNERS') {
      return hasCorners;
    }

    if (pattern === 'FULL_HOUSE') {
      return daubedMatrix.every((row) => row.every((cell) => cell));
    }

    // Count completed lines (rows, columns, diagonals)
    let lineCount = 0;

    // Rows
    for (let r = 0; r < 5; r++) {
      if (daubedMatrix[r].every((c) => c)) lineCount++;
    }

    // Columns
    for (let c = 0; c < 5; c++) {
      if (daubedMatrix.every((row) => row[c])) lineCount++;
    }

    // Main diagonal
    if ([0, 1, 2, 3, 4].every((i) => daubedMatrix[i][i])) lineCount++;

    // Anti diagonal
    if ([0, 1, 2, 3, 4].every((i) => daubedMatrix[i][4 - i])) lineCount++;

    if (pattern === 'ONE_LINE') {
      return lineCount >= 1;
    }

    if (pattern === 'TWO_LINES') {
      return lineCount >= 2;
    }

    if (pattern === 'ONE_LINE_FAST_AND_CORNERS' || pattern === 'ONE_LINE_AND_CORNERS') {
      return lineCount >= 1 || hasCorners;
    }

    return false;
  }

  /**
   * Automatically checks all active tickets in a room for valid winning patterns.
   * STRICTLY verifies:
   * 1. Room is in PLAYING status with valid gameReferenceId
   * 2. Only confirmed, purchased tickets matching the exact current gameReferenceId are checked
   * 3. Ticket status must be ACTIVE (not cancelled, refunded, or previous game)
   * 4. User must exist in the database
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

    const winningPatterns: WinningPattern[] = room.winningPatterns || ['ONE_LINE', 'TWO_LINES', 'FOUR_CORNERS', 'FULL_HOUSE'];
    const winners: GameWinner[] = [];
    const nowIso = new Date().toISOString();

    for (const ticket of activeTickets) {
      // Verify user actually exists in the database
      const user = db.getUserById(ticket.userId);
      if (!user) continue;

      for (const pattern of winningPatterns) {
        if (this.checkWinningPattern(ticket, room.drawnBalls, pattern)) {
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
          break; // Avoid multi-pattern double count for same ticket in a single ball draw
        }
      }
    }

    return { winners, room };
  }
}

export const winnerValidator = new WinnerValidator();
