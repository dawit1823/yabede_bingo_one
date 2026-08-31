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
  patternName: string;
  winningCells: [number, number][];
  daubedMatrix: boolean[][];
  completedHorizontalRow: boolean;
  completedHorizontalRowIndices: number[];
  completedVerticalColumn: boolean;
  completedVerticalColumnIndices: number[];
  completedMainDiagonal: boolean;
  completedReverseDiagonal: boolean;
  completedFourCorners: boolean;
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
 * CRITICAL WINNING RULES:
 * The ONLY valid winning patterns are:
 * 1. Horizontal Row (Any of the 5 rows: all 5 cells marked)
 * 2. Vertical Column (Any of the 5 columns: all 5 cells marked)
 * 3. Main Diagonal (Top-left to bottom-right: [0][0], [1][1], [2][2], [3][3], [4][4])
 * 4. Reverse Diagonal (Top-right to bottom-left: [0][4], [1][3], [2][2], [3][1], [4][0])
 * 5. Four Corners ([0][0], [0][4], [4][0], [4][4] - ALL 4 marked, sufficient on its own)
 *
 * Center cell [2][2] is ALWAYS automatically marked.
 *
 * WIN = completedHorizontalRow
 *    OR completedVerticalColumn
 *    OR completedMainDiagonal
 *    OR completedReverseDiagonal
 *    OR completedFourCorners
 */
export function evaluateBingoCard(
  ticketOrMatrix: { matrix?: (number | 'FREE')[][]; cardNumber?: number } | (number | 'FREE')[][],
  drawnBalls: number[]
): BingoEvaluationResult {
  const defaultEmptyResult: BingoEvaluationResult = {
    isWinner: false,
    matchedPattern: null,
    patternName: '',
    winningCells: [],
    daubedMatrix: Array(5).fill(null).map(() => Array(5).fill(false)),
    completedHorizontalRow: false,
    completedHorizontalRowIndices: [],
    completedVerticalColumn: false,
    completedVerticalColumnIndices: [],
    completedMainDiagonal: false,
    completedReverseDiagonal: false,
    completedFourCorners: false,
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
      const val = matrix[r] ? matrix[r][c] : undefined;
      daubedMatrix[r][c] = isCardCellMarked(val, r, c, drawnSet);
    }
  }

  // 1. Horizontal Rows
  const completedHorizontalRowIndices: number[] = [];
  for (let r = 0; r < 5; r++) {
    if (daubedMatrix[r][0] && daubedMatrix[r][1] && daubedMatrix[r][2] && daubedMatrix[r][3] && daubedMatrix[r][4]) {
      completedHorizontalRowIndices.push(r);
    }
  }
  const completedHorizontalRow = completedHorizontalRowIndices.length > 0;

  // 2. Vertical Columns
  const completedVerticalColumnIndices: number[] = [];
  for (let c = 0; c < 5; c++) {
    if (daubedMatrix[0][c] && daubedMatrix[1][c] && daubedMatrix[2][c] && daubedMatrix[3][c] && daubedMatrix[4][c]) {
      completedVerticalColumnIndices.push(c);
    }
  }
  const completedVerticalColumn = completedVerticalColumnIndices.length > 0;

  // 3. Main Diagonal
  const completedMainDiagonal =
    daubedMatrix[0][0] &&
    daubedMatrix[1][1] &&
    daubedMatrix[2][2] &&
    daubedMatrix[3][3] &&
    daubedMatrix[4][4];

  // 4. Reverse Diagonal
  const completedReverseDiagonal =
    daubedMatrix[0][4] &&
    daubedMatrix[1][3] &&
    daubedMatrix[2][2] &&
    daubedMatrix[3][1] &&
    daubedMatrix[4][0];

  // 5. Four Corners
  const completedFourCorners =
    Boolean(daubedMatrix[0][0]) &&
    Boolean(daubedMatrix[0][4]) &&
    Boolean(daubedMatrix[4][0]) &&
    Boolean(daubedMatrix[4][4]);

  // FINAL STRICT WINNING CONDITION
  const isWinner =
    completedHorizontalRow ||
    completedVerticalColumn ||
    completedMainDiagonal ||
    completedReverseDiagonal ||
    completedFourCorners;

  const winningCellsSet = new Set<string>();
  const winningCells: [number, number][] = [];

  const addWinningCell = (r: number, c: number) => {
    const key = `${r},${c}`;
    if (!winningCellsSet.has(key)) {
      winningCellsSet.add(key);
      winningCells.push([r, c]);
    }
  };

  if (completedHorizontalRow) {
    for (const r of completedHorizontalRowIndices) {
      for (let c = 0; c < 5; c++) addWinningCell(r, c);
    }
  }

  if (completedVerticalColumn) {
    for (const c of completedVerticalColumnIndices) {
      for (let r = 0; r < 5; r++) addWinningCell(r, c);
    }
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

  let matchedPattern: WinningPattern | null = null;
  let patternName = '';

  if (isWinner) {
    if (completedFourCorners) {
      matchedPattern = 'FOUR_CORNERS';
      patternName = 'Four Corners';
    } else if (completedHorizontalRow) {
      matchedPattern = 'HORIZONTAL_ROW';
      patternName = `Horizontal Row ${completedHorizontalRowIndices[0] + 1}`;
    } else if (completedVerticalColumn) {
      matchedPattern = 'VERTICAL_COLUMN';
      patternName = `Vertical Column ${completedVerticalColumnIndices[0] + 1}`;
    } else if (completedMainDiagonal) {
      matchedPattern = 'MAIN_DIAGONAL';
      patternName = 'Main Diagonal';
    } else if (completedReverseDiagonal) {
      matchedPattern = 'REVERSE_DIAGONAL';
      patternName = 'Reverse Diagonal';
    }
  }

  return {
    isWinner,
    matchedPattern,
    patternName,
    winningCells,
    daubedMatrix,
    completedHorizontalRow,
    completedHorizontalRowIndices,
    completedVerticalColumn,
    completedVerticalColumnIndices,
    completedMainDiagonal,
    completedReverseDiagonal,
    completedFourCorners,
  };
}

/**
 * Validates a card against a specific pattern or general winning rules.
 */
export function checkWinningPattern(
  ticket: { matrix?: (number | 'FREE')[][]; cardNumber?: number } | (number | 'FREE')[][],
  drawnBalls: number[],
  pattern?: WinningPattern | null
): boolean {
  const result = evaluateBingoCard(ticket, drawnBalls);
  if (!result.isWinner) return false;
  if (!pattern) return true;

  if (pattern === 'FOUR_CORNERS' || (pattern as string) === 'CORNERS') {
    return result.completedFourCorners;
  }
  if (pattern === 'HORIZONTAL_ROW') {
    return result.completedHorizontalRow;
  }
  if (pattern === 'VERTICAL_COLUMN') {
    return result.completedVerticalColumn;
  }
  if (pattern === 'MAIN_DIAGONAL') {
    return result.completedMainDiagonal;
  }
  if (pattern === 'REVERSE_DIAGONAL') {
    return result.completedReverseDiagonal;
  }
  if (pattern === 'ONE_LINE') {
    return (
      result.completedHorizontalRow ||
      result.completedVerticalColumn ||
      result.completedMainDiagonal ||
      result.completedReverseDiagonal
    );
  }
  if (
    pattern === 'ONE_LINE_FAST_AND_CORNERS' ||
    (pattern as string) === 'ONE_LINE_AND_CORNERS' ||
    pattern === 'FULL_HOUSE'
  ) {
    return result.isWinner;
  }

  return result.isWinner;
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

