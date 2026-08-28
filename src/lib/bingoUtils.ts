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

/**
 * Masks a user's display name for Public Arena group chats to protect privacy.
 * Displays only first letter, last letter, and replaces every character in between with '*'.
 *
 * Examples:
 * - "Dawit Solomon" -> "D***********n"
 * - "Abebe Kebede" -> "A**********e"
 * - "John" -> "J**n"
 * - "Dawit" -> "D***t"
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

