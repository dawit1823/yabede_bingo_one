import { generateCardMatrixByNumber } from '../../lib/bingoUtils.js';
import { checkWinningPattern } from '../bingoEngine.js';
import { BingoTicket, WinningPattern } from '../../types.js';

export class BingoService {
  public generateTicketMatrix(cardNumber: number): (number | 'FREE')[][] {
    return generateCardMatrixByNumber(cardNumber);
  }

  public verifyBingoClaim(
    ticket: BingoTicket,
    drawnBalls: number[],
    patterns: WinningPattern[]
  ): { isValid: boolean; matchedPattern: WinningPattern | null } {
    for (const pattern of patterns) {
      if (checkWinningPattern(ticket, drawnBalls, pattern)) {
        return { isValid: true, matchedPattern: pattern };
      }
    }
    return { isValid: false, matchedPattern: null };
  }
}

export const bingoService = new BingoService();
