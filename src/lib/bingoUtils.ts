/**
 * Deterministic Bingo Card Generator & Pattern Utilities
 * Every Card Number (#001 to #400) generates an exact, consistent 5x5 Bingo Matrix
 * across all client devices and backend verification engines.
 */

export function generateCardMatrixByNumber(cardNumber: number): (number | 'FREE')[][] {
  // Deterministic generator seeded by cardNumber
  const seed = cardNumber * 9301 + 49297;
  const pseudoRandom = (step: number) => {
    const x = Math.sin(seed + step * 1000) * 10000;
    return x - Math.floor(x);
  };

  const getUniqueNumbers = (min: number, max: number, count: number, offset: number): number[] => {
    const pool = Array.from({ length: max - min + 1 }, (_, i) => min + i);
    const result: number[] = [];
    let step = offset;
    while (result.length < count) {
      const idx = Math.floor(pseudoRandom(step++) * pool.length);
      result.push(pool.splice(idx, 1)[0]);
    }
    return result.sort((a, b) => a - b);
  };

  const colB = getUniqueNumbers(1, 15, 5, 1);
  const colI = getUniqueNumbers(16, 30, 5, 10);
  const colN = getUniqueNumbers(31, 45, 4, 20); // 4 numbers + FREE
  const colG = getUniqueNumbers(46, 60, 5, 30);
  const colO = getUniqueNumbers(61, 75, 5, 40);

  const matrix: (number | 'FREE')[][] = Array(5)
    .fill(null)
    .map(() => Array(5).fill(0));

  for (let r = 0; r < 5; r++) {
    matrix[r][0] = colB[r];
    matrix[r][1] = colI[r];
    if (r === 2) {
      matrix[r][2] = 'FREE';
    } else {
      matrix[r][2] = colN[r > 2 ? r - 1 : r];
    }
    matrix[r][3] = colG[r];
    matrix[r][4] = colO[r];
  }

  return matrix;
}

export function formatCardNumber(num: number): string {
  return `#${num.toString().padStart(3, '0')}`;
}

/**
 * Transforms a PrivateGroup object into a full BingoRoom object.
 * Prevents missing property crashes in React components.
 */
export function formatPrivateGroupToRoom(group: any, existingRoom?: any): any {
  if (!group) return null;

  const winningPatterns = Array.isArray(group.winningPatterns) && group.winningPatterns.length > 0
    ? group.winningPatterns
    : group.winningPattern
    ? [group.winningPattern]
    : existingRoom?.winningPatterns || ['FULL_HOUSE'];

  const roomFormat = {
    id: group.id,
    gameReferenceId: group.gameReferenceId || existingRoom?.gameReferenceId,
    name: group.name || existingRoom?.name || 'Private Group Game',
    icon: group.icon || existingRoom?.icon || '🎟️',
    description: group.description || existingRoom?.description || `Private Group Game (Code: ${group.code || ''})`,
    ticketPrice: typeof group.ticketPrice === 'number' ? group.ticketPrice : existingRoom?.ticketPrice || 10,
    prizePool: typeof group.prizePool === 'number' ? group.prizePool : existingRoom?.prizePool || 0,
    platformFee: typeof group.platformFee === 'number' ? group.platformFee : existingRoom?.platformFee || 0,
    minPlayers: group.minPlayers || 2,
    maxPlayers: group.maxPlayers || existingRoom?.maxPlayers || 100,
    activePlayersCount: typeof group.activePlayersCount === 'number' ? group.activePlayersCount : group.playerCount || existingRoom?.activePlayersCount || 0,
    ticketsSold: typeof group.ticketsSold === 'number' ? group.ticketsSold : existingRoom?.ticketsSold || 0,
    countdownSeconds: typeof group.countdownSeconds === 'number' ? group.countdownSeconds : existingRoom?.countdownSeconds || 0,
    status: group.status === 'PLAYING'
      ? 'PLAYING'
      : group.status === 'WAITING_HOST_DECISION'
      ? 'WAITING_HOST_DECISION'
      : group.status === 'FINISHED'
      ? 'FINISHED'
      : group.status === 'COUNTDOWN'
      ? 'COUNTDOWN'
      : 'WAITING',
    drawnBalls: Array.isArray(group.drawnBalls) ? group.drawnBalls : existingRoom?.drawnBalls || [],
    currentBall: group.currentBall !== undefined ? group.currentBall : existingRoom?.currentBall ?? null,
    winningPatterns,
    lastWinners: Array.isArray(group.lastWinners) ? group.lastWinners : existingRoom?.lastWinners || [],
    createdAt: group.createdAt || existingRoom?.createdAt || new Date().toISOString(),
    hostId: group.hostId || existingRoom?.hostId,
    hostName: group.hostName || existingRoom?.hostName,
    hostBonus: typeof group.hostBonus === 'number' ? group.hostBonus : existingRoom?.hostBonus,
    hostBonusPaid: group.hostBonusPaid ?? existingRoom?.hostBonusPaid,
    prizeDistribution: group.prizeDistribution || existingRoom?.prizeDistribution || 'WINNER_100',
    code: group.code || existingRoom?.code,
  };

  return roomFormat;
}

/**
 * Calculates accurate remaining time in seconds based on backend endsAt timestamp.
 * Prevents client-side clock drift and guarantees sync across all devices.
 */
export function getRemainingSeconds(room?: { endsAt?: string | number | null; countdownSeconds?: number; status?: string } | null): number {
  if (!room) return 0;
  if (room.status === 'PLAYING') return 0;
  if (room.endsAt) {
    const endsAtMs = typeof room.endsAt === 'number' ? room.endsAt : new Date(room.endsAt).getTime();
    if (!isNaN(endsAtMs) && endsAtMs > 0) {
      const remainingMs = endsAtMs - Date.now();
      return Math.max(0, Math.ceil(remainingMs / 1000));
    }
  }
  return Math.max(0, room.countdownSeconds || 0);
}

import { WinningPattern } from '../types.js';

export interface BingoEvaluationResult {
  isWinner: boolean;
  matchedPattern: WinningPattern | null;
  matchedPatterns: WinningPattern[];
  patternName: string;
  winningCells: [number, number][];
  daubedMatrix: boolean[][];
  completedLinesCount: number;
  completedHorizontalRows: number[];
  completedVerticalColumns: number[];
  completedMainDiagonal: boolean;
  completedReverseDiagonal: boolean;
  completedFourCorners: boolean;
  completedFullHouse: boolean;
}

/**
 * Checks if a specific cell in a 5x5 card is marked.
 * The FREE center cell [2][2] is ALWAYS automatically treated as marked.
 */
export function isCardCellMarked(
  cellVal: number | 'FREE' | string | null | undefined,
  r: number,
  c: number,
  drawnBallsSet: Set<number>
): boolean {
  if (r === 2 && c === 2) return true;
  if (cellVal === 'FREE' || cellVal === 0 || cellVal === '0') return true;
  if (typeof cellVal === 'number') return drawnBallsSet.has(cellVal);
  if (typeof cellVal === 'string') {
    const parsed = parseInt(cellVal, 10);
    return !isNaN(parsed) && drawnBallsSet.has(parsed);
  }
  return false;
}

/**
 * Authoritative 75-ball 5x5 Bingo Evaluation.
 *
 * CRITICAL WINNING RULES (5 Essential Patterns):
 * 1. ONE_LINE: Any 1 complete line (5 horizontal rows, 5 vertical columns, main diagonal, reverse diagonal). Center FREE is automatically marked.
 * 2. TWO_LINES: Any 2 different complete lines (from the 12 possible lines).
 * 3. FOUR_CORNERS: All 4 corner cells (0,0), (0,4), (4,0), (4,4) marked.
 * 4. ONE_LINE_AND_CORNERS: BOTH at least one valid line AND all 4 corners marked on the same ticket.
 * 5. FULL_HOUSE: All 24 numbers + FREE center cell (all 25 cells) marked.
 */
export function evaluateBingoCard(
  ticketOrMatrix: { matrix?: (number | 'FREE')[][]; cardNumber?: number; daubed?: boolean[][] } | (number | 'FREE')[][],
  drawnBalls: number[],
  manualDaubMatrix?: boolean[][]
): BingoEvaluationResult {
  const defaultEmptyResult: BingoEvaluationResult = {
    isWinner: false,
    matchedPattern: null,
    matchedPatterns: [],
    patternName: '',
    winningCells: [],
    daubedMatrix: Array(5).fill(null).map(() => Array(5).fill(false)),
    completedLinesCount: 0,
    completedHorizontalRows: [],
    completedVerticalColumns: [],
    completedMainDiagonal: false,
    completedReverseDiagonal: false,
    completedFourCorners: false,
    completedFullHouse: false,
  };

  if (!ticketOrMatrix) return defaultEmptyResult;

  let matrix: (number | 'FREE')[][];
  if (Array.isArray(ticketOrMatrix)) {
    if (ticketOrMatrix.length === 5) {
      matrix = ticketOrMatrix;
    } else {
      return defaultEmptyResult;
    }
  } else if (
    ticketOrMatrix &&
    'matrix' in ticketOrMatrix &&
    Array.isArray(ticketOrMatrix.matrix) &&
    ticketOrMatrix.matrix.length === 5
  ) {
    matrix = ticketOrMatrix.matrix;
  } else if (
    ticketOrMatrix &&
    'cardNumber' in ticketOrMatrix &&
    typeof ticketOrMatrix.cardNumber === 'number'
  ) {
    matrix = generateCardMatrixByNumber(ticketOrMatrix.cardNumber);
  } else {
    return defaultEmptyResult;
  }

  if (!Array.isArray(drawnBalls) || drawnBalls.length === 0) {
    return defaultEmptyResult;
  }

  const drawnSet = new Set<number>(drawnBalls);

  const daubedMatrix: boolean[][] = Array(5)
    .fill(null)
    .map(() => Array(5).fill(false));

  for (let r = 0; r < 5; r++) {
    for (let c = 0; c < 5; c++) {
      if (r === 2 && c === 2) {
        daubedMatrix[r][c] = true;
        continue;
      }
      const cellVal = matrix[r] ? matrix[r][c] : undefined;
      if (cellVal === 'FREE' || cellVal === 0 || (cellVal as any) === '0') {
        daubedMatrix[r][c] = true;
        continue;
      }
      if (typeof cellVal === 'number' && drawnSet.has(cellVal)) {
        if (manualDaubMatrix) {
          daubedMatrix[r][c] = Boolean(manualDaubMatrix[r]?.[c]);
        } else {
          daubedMatrix[r][c] = true;
        }
      } else {
        daubedMatrix[r][c] = false;
      }
    }
  }

  // 1. Horizontal Rows (Any of the 5 rows)
  const completedHorizontalRows: number[] = [];
  for (let r = 0; r < 5; r++) {
    if (daubedMatrix[r][0] && daubedMatrix[r][1] && daubedMatrix[r][2] && daubedMatrix[r][3] && daubedMatrix[r][4]) {
      completedHorizontalRows.push(r);
    }
  }

  // 2. Vertical Columns (Any of the 5 columns)
  const completedVerticalColumns: number[] = [];
  for (let c = 0; c < 5; c++) {
    if (daubedMatrix[0][c] && daubedMatrix[1][c] && daubedMatrix[2][c] && daubedMatrix[3][c] && daubedMatrix[4][c]) {
      completedVerticalColumns.push(c);
    }
  }

  // 3. Main Diagonal (Top-left to bottom-right: 0,0 -> 4,4)
  const completedMainDiagonal =
    Boolean(daubedMatrix[0][0]) &&
    Boolean(daubedMatrix[1][1]) &&
    Boolean(daubedMatrix[2][2]) &&
    Boolean(daubedMatrix[3][3]) &&
    Boolean(daubedMatrix[4][4]);

  // 4. Reverse Diagonal (Top-right to bottom-left: 0,4 -> 4,0)
  const completedReverseDiagonal =
    Boolean(daubedMatrix[0][4]) &&
    Boolean(daubedMatrix[1][3]) &&
    Boolean(daubedMatrix[2][2]) &&
    Boolean(daubedMatrix[3][1]) &&
    Boolean(daubedMatrix[4][0]);

  // Count of distinct completed lines (5 rows + 5 cols + 2 diagonals)
  const completedLinesCount =
    completedHorizontalRows.length +
    completedVerticalColumns.length +
    (completedMainDiagonal ? 1 : 0) +
    (completedReverseDiagonal ? 1 : 0);

  // 5. Four Corners (All four corner cells)
  const completedFourCorners =
    Boolean(daubedMatrix[0][0]) &&
    Boolean(daubedMatrix[0][4]) &&
    Boolean(daubedMatrix[4][0]) &&
    Boolean(daubedMatrix[4][4]);

  // 6. Full House (All 25 cells daubed)
  const completedFullHouse = daubedMatrix.every((row) => row.every((cell) => cell));

  // Determine all matched patterns according to strict 5 rules
  const matchedPatterns: WinningPattern[] = [];
  if (completedFullHouse) {
    matchedPatterns.push('FULL_HOUSE');
  }
  if (completedLinesCount >= 1 && completedFourCorners) {
    matchedPatterns.push('ONE_LINE_AND_CORNERS');
  }
  if (completedLinesCount >= 2) {
    matchedPatterns.push('TWO_LINES');
  }
  if (completedLinesCount >= 1) {
    matchedPatterns.push('ONE_LINE');
  }
  if (completedFourCorners) {
    matchedPatterns.push('FOUR_CORNERS');
  }

  const isWinner = matchedPatterns.length > 0;
  const matchedPattern: WinningPattern | null = matchedPatterns[0] || null;

  let patternName = '';
  if (completedFullHouse) {
    patternName = 'Full House';
  } else if (completedLinesCount >= 1 && completedFourCorners) {
    patternName = 'One Line + Four Corners';
  } else if (completedLinesCount >= 2) {
    patternName = `${completedLinesCount} Lines`;
  } else if (completedLinesCount === 1) {
    if (completedMainDiagonal) patternName = 'Main Diagonal Line';
    else if (completedReverseDiagonal) patternName = 'Reverse Diagonal Line';
    else if (completedHorizontalRows.length > 0) patternName = `Horizontal Row ${completedHorizontalRows[0] + 1}`;
    else if (completedVerticalColumns.length > 0) patternName = `Vertical Column ${completedVerticalColumns[0] + 1}`;
    else patternName = 'One Line';
  } else if (completedFourCorners) {
    patternName = 'Four Corners';
  }

  const winningCellsSet = new Set<string>();
  const winningCells: [number, number][] = [];

  const addWinningCell = (r: number, c: number) => {
    const key = `${r},${c}`;
    if (!winningCellsSet.has(key)) {
      winningCellsSet.add(key);
      winningCells.push([r, c]);
    }
  };

  if (completedFullHouse) {
    for (let r = 0; r < 5; r++) {
      for (let c = 0; c < 5; c++) addWinningCell(r, c);
    }
  } else {
    for (const r of completedHorizontalRows) {
      for (let c = 0; c < 5; c++) addWinningCell(r, c);
    }
    for (const c of completedVerticalColumns) {
      for (let r = 0; r < 5; r++) addWinningCell(r, c);
    }
    if (completedMainDiagonal) {
      for (let i = 0; i < 5; i++) addWinningCell(i, i);
    }
    if (completedReverseDiagonal) {
      for (let i = 0; i < 5; i++) addWinningCell(i, 4 - i);
    }
    if (completedFourCorners) {
      addWinningCell(0, 0);
      addWinningCell(0, 4);
      addWinningCell(4, 0);
      addWinningCell(4, 4);
    }
  }

  return {
    isWinner,
    matchedPattern,
    matchedPatterns,
    patternName,
    winningCells,
    daubedMatrix,
    completedLinesCount,
    completedHorizontalRows,
    completedVerticalColumns,
    completedMainDiagonal,
    completedReverseDiagonal,
    completedFourCorners,
    completedFullHouse,
  };
}

/**
 * Validates a card against a specific pattern or general winning rules.
 */
export function checkWinningPattern(
  ticket: { matrix?: (number | 'FREE')[][]; cardNumber?: number; daubed?: boolean[][] } | (number | 'FREE')[][],
  drawnBalls: number[],
  pattern?: WinningPattern | null,
  manualDaubMatrix?: boolean[][]
): boolean {
  const result = evaluateBingoCard(ticket, drawnBalls, manualDaubMatrix);
  if (!result.isWinner) return false;
  if (!pattern) return result.isWinner;

  switch (pattern) {
    case 'ONE_LINE':
      return result.completedLinesCount >= 1;
    case 'TWO_LINES':
      return result.completedLinesCount >= 2;
    case 'FOUR_CORNERS':
      return result.completedFourCorners;
    case 'ONE_LINE_AND_CORNERS':
      return result.completedLinesCount >= 1 && result.completedFourCorners;
    case 'FULL_HOUSE':
      return result.completedFullHouse;
    default:
      return false;
  }
}

/**
 * Masks a user's display name for Public Arena group chats to protect privacy.
 * Displays only first letter, last letter, and replaces every character in between with '*'.
 */
export function maskChatUsername(name?: string): string {
  if (!name || typeof name !== 'string') return 'P****r';
  const clean = name.trim();
  if (clean.length === 0) return 'P****r';
  if (clean.length === 1) return `${clean}*`;
  if (clean.length === 2) return `${clean[0]}*${clean[1]}`;
  if (clean.length === 3) return `${clean[0]}*${clean[2]}`;

  const stars = '*'.repeat(clean.length - 2);
  return `${clean[0]}${stars}${clean[clean.length - 1]}`;
}

