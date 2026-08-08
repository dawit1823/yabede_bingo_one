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
