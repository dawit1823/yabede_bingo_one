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
    if (!ticket || !ticket.matrix) return false;

    // Create boolean daubed matrix based on drawn numbers + FREE space
    const daubedMatrix: boolean[][] = ticket.matrix.map((row) =>
      row.map((cell) => cell === 'FREE' || drawnBalls.includes(cell as number))
    );

    if (pattern === 'FOUR_CORNERS') {
      return (
        daubedMatrix[0][0] &&
        daubedMatrix[0][4] &&
        daubedMatrix[4][0] &&
        daubedMatrix[4][4]
      );
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

    return false;
  }

  /**
   * Automatically checks all active tickets in a room for valid winning patterns.
   * Supports multiple simultaneous winners.
   */
  public autoCheckRoomWinners(roomId: string): { winners: GameWinner[]; room: BingoRoom | undefined } {
    const room = db.rooms.get(roomId);
    if (!room || room.status !== 'PLAYING') {
      return { winners: [], room: undefined };
    }

    const activeTickets = Array.from(db.tickets.values()).filter(
      (t) => t.roomId === roomId && (t.status === 'ACTIVE' || t.status === 'BINGO_CLAIMED')
    );

    if (activeTickets.length === 0) {
      return { winners: [], room };
    }

    const winningPatterns: WinningPattern[] = room.winningPatterns || ['ONE_LINE', 'TWO_LINES', 'FOUR_CORNERS', 'FULL_HOUSE'];
    const winners: GameWinner[] = [];
    const nowIso = new Date().toISOString();

    for (const ticket of activeTickets) {
      for (const pattern of winningPatterns) {
        if (this.checkWinningPattern(ticket, room.drawnBalls, pattern)) {
          const user = db.getUserById(ticket.userId);
          const winnerRecord: GameWinner = {
            id: `win_${roomId}_${ticket.id}_${pattern}`,
            roomId,
            gameReferenceId: room.gameReferenceId || room.id,
            ticketId: ticket.id,
            userId: ticket.userId,
            username: user ? user.username : ticket.username || 'Player',
            cardNumber: ticket.cardNumber || 1,
            pattern,
            prizeAmount: 0, // Will be calculated by PrizeCalculator
            wonAt: nowIso,
          };
          winners.push(winnerRecord);
          ticket.status = 'BINGO_CLAIMED';
          break; // Avoid multi-pattern double count for same ticket in single check
        }
      }
    }

    return { winners, room };
  }
}

export const winnerValidator = new WinnerValidator();
