/**
 * 75-Ball Bingo Engine & Ticket Generation / Validation
 * Server-Authoritative Logic
 */

import crypto from 'crypto';
import { db, OFFICIAL_ROOMS, generateGameReferenceId } from './db.js';
import { adminDb } from './firebaseAdmin.js';
import { adminService } from './adminService.js';
import { logger } from './logger.js';
import { BingoRoom, BingoTicket, GameWinner, WinningPattern, WalletTransaction } from '../types.js';
import { generateCardMatrixByNumber } from '../lib/bingoUtils.js';

export function generateBingoTicketMatrix(): (number | 'FREE')[][] {
  const getRandomUniqueRange = (min: number, max: number, count: number): number[] => {
    const nums: number[] = [];
    while (nums.length < count) {
      const n = crypto.randomInt(min, max + 1);
      if (!nums.includes(n)) {
        nums.push(n);
      }
    }
    return nums.sort((a, b) => a - b);
  };

  const colB = getRandomUniqueRange(1, 15, 5);
  const colI = getRandomUniqueRange(16, 30, 5);
  const colN = getRandomUniqueRange(31, 45, 4); // Center is FREE
  const colG = getRandomUniqueRange(46, 60, 5);
  const colO = getRandomUniqueRange(61, 75, 5);

  const matrix: (number | 'FREE')[][] = Array(5)
    .fill(null)
    .map(() => Array(5).fill(0));

  for (let row = 0; row < 5; row++) {
    matrix[row][0] = colB[row];
    matrix[row][1] = colI[row];

    if (row === 2) {
      matrix[row][2] = 'FREE';
    } else {
      matrix[row][2] = colN[row > 2 ? row - 1 : row];
    }

    matrix[row][3] = colG[row];
    matrix[row][4] = colO[row];
  }

  return matrix;
}

export function createTicket(roomId: string, userId: string): BingoTicket {
  const room = db.rooms.get(roomId);
  if (!room) throw new Error('Room not found');

  // Check balance & debit wallet
  db.updateWalletBalance(
    userId,
    -room.ticketPrice,
    'TICKET_PURCHASE',
    `Bought Bingo Ticket for ${room.name}`,
    `TICKET-ROOM-${roomId}`,
    room.gameReferenceId
  );

  const matrix = generateBingoTicketMatrix();
  const daubed = Array(5)
    .fill(false)
    .map(() => Array(5).fill(false));

  // Auto daub FREE center
  daubed[2][2] = true;

  const ticket: BingoTicket = {
    id: `tkt_${Date.now()}_${Math.floor(Math.random() * 10000)}`,
    roomId,
    gameReferenceId: room.gameReferenceId,
    userId,
    matrix,
    daubed,
    status: 'ACTIVE',
    purchasePrice: room.ticketPrice,
    boughtAt: new Date().toISOString(),
  };

  db.tickets.set(ticket.id, ticket);

  // Increase room prize pool
  const sysSettings = adminService.getSystemSettings();
  const platformFeePct = sysSettings.platformFeePercent ?? 20;
  const prizePct = sysSettings.prizePercentage ?? 80;
  room.prizePool += Math.round(room.ticketPrice * (prizePct / 100));
  room.platformFee = (room.platformFee || 0) + Math.round(room.ticketPrice * (platformFeePct / 100));
  room.activePlayersCount += 1;

  return ticket;
}

export function drawNextBall(roomId: string): number | null {
  const room = db.rooms.get(roomId);
  if (!room || room.status !== 'PLAYING') return null;

  if (room.drawnBalls.length >= 75) {
    room.status = 'FINISHED';
    return null;
  }

  let nextBall: number;
  do {
    nextBall = crypto.randomInt(1, 76);
  } while (room.drawnBalls.includes(nextBall));

  room.drawnBalls.push(nextBall);
  room.currentBall = nextBall;

  return nextBall;
}

export function checkWinningPattern(
  ticket: BingoTicket,
  drawnBalls: number[],
  pattern: WinningPattern
): boolean {
  // Create daubed matrix based on drawn numbers + FREE space
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

  // Count completed lines (horizontal, vertical, diagonals)
  let lineCount = 0;

  // Rows
  for (let r = 0; r < 5; r++) {
    if (daubedMatrix[r].every((c) => c)) lineCount++;
  }

  // Columns
  for (let c = 0; c < 5; c++) {
    if (daubedMatrix.every((row) => row[c])) lineCount++;
  }

  // Diagonals
  if (
    daubedMatrix[0][0] &&
    daubedMatrix[1][1] &&
    daubedMatrix[2][2] &&
    daubedMatrix[3][3] &&
    daubedMatrix[4][4]
  ) {
    lineCount++;
  }

  if (
    daubedMatrix[0][4] &&
    daubedMatrix[1][3] &&
    daubedMatrix[2][2] &&
    daubedMatrix[3][1] &&
    daubedMatrix[4][0]
  ) {
    lineCount++;
  }

  if (pattern === 'ONE_LINE') return lineCount >= 1;
  if (pattern === 'TWO_LINES') return lineCount >= 2;

  return false;
}

export function processBingoClaim(
  ticketId: string,
  userId: string
): { success: boolean; winner?: GameWinner; message: string } {
  const ticket = db.tickets.get(ticketId);
  if (!ticket) return { success: false, message: 'Ticket not found' };
  if (ticket.userId !== userId) return { success: false, message: 'Not ticket owner' };

  const room = db.rooms.get(ticket.roomId);
  if (!room) return { success: false, message: 'Room not found' };
  if (room.status !== 'PLAYING') return { success: false, message: 'Game is not active' };

  const user = db.getUserById(userId);
  if (!user) return { success: false, message: 'User not found' };

  // Check valid pattern against drawn balls
  let matchedPattern: WinningPattern | null = null;
  for (const pattern of room.winningPatterns) {
    if (checkWinningPattern(ticket, room.drawnBalls, pattern)) {
      matchedPattern = pattern;
      break;
    }
  }

  if (!matchedPattern) {
    return { success: false, message: 'Bingo claim failed: Pattern requirements not met yet!' };
  }

  // Calculate prize share based on pattern
  let prizeShare = Math.round(room.prizePool * 0.5); // Default 50% for 1st pattern
  if (matchedPattern === 'FULL_HOUSE') {
    prizeShare = room.prizePool;
  }

  ticket.status = 'BINGO_CLAIMED';

  // Credit user wallet ledger
  db.updateWalletBalance(
    userId,
    prizeShare,
    'GAME_WIN',
    `Bingo Win (${matchedPattern}) in ${room.name}!`,
    `WIN-${room.id}-${ticket.id}`,
    room.gameReferenceId || ticket.gameReferenceId
  );

  const winner: GameWinner = {
    id: `win_${Date.now()}`,
    roomId: room.id,
    gameReferenceId: room.gameReferenceId || ticket.gameReferenceId,
    userId,
    username: user.username,
    pattern: matchedPattern,
    prizeAmount: prizeShare,
    wonAt: new Date().toISOString(),
  };

  db.winners.unshift(winner);

  // If Full House won, room finishes
  if (matchedPattern === 'FULL_HOUSE') {
    room.status = 'FINISHED';
  }

  return {
    success: true,
    winner,
    message: `🎉 BINGO! You won ${prizeShare} Birr with ${matchedPattern}!`,
  };
}

export function autoCheckRoomWinners(roomId: string): { winners: GameWinner[]; room: BingoRoom } {
  const room = db.rooms.get(roomId);
  if (!room || room.status !== 'PLAYING') return { winners: [], room: room! };

  const roomTickets = Array.from(db.tickets.values()).filter(
    (t) => t.roomId === roomId && t.status === 'ACTIVE'
  );

  const winningTickets: { ticket: BingoTicket; pattern: WinningPattern }[] = [];

  for (const ticket of roomTickets) {
    for (const pattern of room.winningPatterns) {
      if (checkWinningPattern(ticket, room.drawnBalls, pattern)) {
        winningTickets.push({ ticket, pattern });
        break; // Only count highest/first pattern for a ticket on this draw
      }
    }
  }

  if (winningTickets.length === 0) {
    return { winners: [], room };
  }

  // Formula: Prize Pool = (Total Value of All Tickets Sold) × 80%
  const ticketsSold = room.ticketsSold || roomTickets.length;
  const totalTicketSales = ticketsSold * room.ticketPrice;
  const totalPrizePool = Math.round(totalTicketSales * 0.80);

  // Split prize pool equally among all simultaneous winners on this draw
  const splitPrizeAmount = Math.max(1, Math.floor(totalPrizePool / winningTickets.length));

  const foundWinners: GameWinner[] = [];

  for (const { ticket, pattern } of winningTickets) {
    ticket.status = 'BINGO_CLAIMED';
    (ticket as any).winningStatus = 'WON';
    (ticket as any).prizeWon = splitPrizeAmount;

    const user = db.getUserById(ticket.userId);
    const username = ticket.username || user?.username || 'Player';
    const photoUrl = user?.photoUrl || undefined;
    const ticketPrice = ticket.purchasePrice || room.ticketPrice;

    // Credit user's wallet
    db.updateWalletBalance(
      ticket.userId,
      splitPrizeAmount,
      'GAME_WIN',
      `Bingo Prize Win (${pattern}) Card #${ticket.cardNumber || '?'} in ${room.name}`,
      `WIN-${room.id}-${ticket.id}`,
      room.gameReferenceId || ticket.gameReferenceId
    );

    const winner: GameWinner = {
      id: `win_${Date.now()}_${Math.floor(Math.random() * 10000)}`,
      roomId: room.id,
      gameReferenceId: room.gameReferenceId || ticket.gameReferenceId,
      userId: ticket.userId,
      username,
      photoUrl,
      cardNumber: ticket.cardNumber || 1,
      ticketPrice,
      pattern,
      prizeAmount: splitPrizeAmount,
      totalPrizePool,
      wonAt: new Date().toISOString(),
    };

    db.winners.unshift(winner);
    foundWinners.push(winner);

    // Sync updated ticket, winner, and wallet transaction to Firestore
    adminDb.collection('tickets').doc(ticket.id).set(ticket, { merge: true }).catch(console.warn);
    adminDb.collection('winners').doc(winner.id).set(winner).catch(console.warn);

    const winnerTx: WalletTransaction = {
      id: `tx_win_${Date.now()}_${Math.floor(Math.random() * 10000)}`,
      userId: ticket.userId,
      amount: splitPrizeAmount,
      balanceAfter: user ? user.walletBalance : splitPrizeAmount,
      type: 'GAME_WIN',
      status: 'COMPLETED',
      reference: `WIN-${room.id}-${ticket.id}`,
      description: `Bingo Prize Won (${pattern}) Card #${ticket.cardNumber || '?'} in ${room.name}`,
      createdAt: new Date().toISOString(),
    };
    adminDb.collection('transactions').doc(winnerTx.id).set(winnerTx).catch(console.warn);
  }

  // Mark all other tickets for this game round as LOST / COMPLETED
  const roundRefId = room.gameReferenceId;
  Array.from(db.tickets.values()).forEach((tkt) => {
    if (tkt.roomId === room.id && (!roundRefId || tkt.gameReferenceId === roundRefId) && tkt.status === 'ACTIVE') {
      tkt.status = 'COMPLETED';
      (tkt as any).winningStatus = 'LOST';
      (tkt as any).prizeWon = 0;
      adminDb.collection('tickets').doc(tkt.id).set(tkt, { merge: true }).catch(console.warn);
    }
  });

  // Set room status to FINISHED and record lastWinners
  room.status = 'FINISHED';
  room.lastWinners = foundWinners;

  db.recordGameHistoryForRoom(room, foundWinners);

  const roomUpdates = {
    status: 'FINISHED',
    lastWinners: foundWinners,
    updatedAt: new Date().toISOString(),
  };

  adminDb.collection('rooms').doc(room.id).update(roomUpdates).catch(console.warn);
  adminDb.collection('gameRooms').doc(room.id).update(roomUpdates).catch(console.warn);

  const finalStats = {
    roomId: room.id,
    prizePool: room.prizePool,
    platformFee: room.platformFee || 0,
    ticketsSold: room.ticketsSold || 0,
    totalSales: (room.ticketsSold || 0) * room.ticketPrice,
    activePlayersCount: room.activePlayersCount || 0,
    updatedAt: new Date().toISOString(),
  };
  adminDb.collection(`rooms/${room.id}/roomStats`).doc('current').set(finalStats, { merge: true }).catch(console.warn);
  adminDb.collection(`gameRooms/${room.id}/roomStats`).doc('current').set(finalStats, { merge: true }).catch(console.warn);

  return { winners: foundWinners, room };
}

/**
 * Resets active bingo room states and card reservations for a new round
 * while strictly PRESERVING all historical ticket records and winners.
 */
export async function clearAndResetAllBingoGames(): Promise<BingoRoom[]> {
  logger.info('[BingoEngine] Resetting active Bingo game rounds...');

  try {
    // 1. Delete active card reservations only (clears seat selections for current round)
    const cardResSnap = await adminDb.collection('cardReservations').get();
    const deleteResPromises = cardResSnap.docs.map((docSnap) => adminDb.collection('cardReservations').doc(docSnap.id).delete());
    await Promise.all(deleteResPromises);
  } catch (err: any) {
    console.warn('⚠️ [BingoEngine] Reset warning during cardReservations deletion:', err.message);
  }

  // 2. Re-seed/Reset the 4 official Bingo game arenas with fresh gameReferenceIds
  const resetRooms: BingoRoom[] = [];
  for (const template of OFFICIAL_ROOMS) {
    const newRefId = generateGameReferenceId(template.ticketPrice, template.id);
    const room: BingoRoom = {
      ...template,
      gameReferenceId: newRefId,
      status: 'WAITING',
      currentBall: null,
      drawnBalls: [],
      prizePool: 0,
      countdownSeconds: 45,
      activePlayersCount: 0,
      ticketsSold: 0,
      lastWinners: [],
      createdAt: new Date().toISOString(),
    };

    db.rooms.set(room.id, room);
    resetRooms.push(room);

    adminDb.collection('rooms').doc(room.id).set(room).catch(console.warn);
    adminDb.collection('gameRooms').doc(room.id).set(room).catch(console.warn);
  }

  logger.info('[BingoEngine] Active Bingo game rounds reset successfully.');
  return resetRooms;
}

// --- PRIVATE GROUP BINGO ENGINE ---
export function drawNextPrivateGroupBall(groupId: string): number | null {
  const group = db.privateGroups.get(groupId);
  if (!group || group.status !== 'PLAYING') return null;

  if (group.drawnBalls.length >= 75) {
    group.status = 'FINISHED';
    return null;
  }

  let nextBall: number;
  do {
    nextBall = crypto.randomInt(1, 76);
  } while (group.drawnBalls.includes(nextBall));

  group.drawnBalls.push(nextBall);
  group.currentBall = nextBall;

  return nextBall;
}

export function autoCheckPrivateGroupWinners(groupId: string): { winners: GameWinner[]; group: any } {
  const group = db.privateGroups.get(groupId);
  if (!group || (group.status !== 'PLAYING' && group.status !== 'COUNTDOWN')) return { winners: [], group: group! };

  const groupTickets = Array.from(db.tickets.values()).filter(
    (t) => t.roomId === groupId && t.status === 'ACTIVE'
  );

  const winningTickets: BingoTicket[] = [];
  for (const ticket of groupTickets) {
    if (checkWinningPattern(ticket, group.drawnBalls, group.winningPattern)) {
      winningTickets.push(ticket);
    }
  }

  if (winningTickets.length === 0) {
    return { winners: [], group };
  }

  // Recalculate stats & prize pool to ensure 100% accuracy (Sales - 1%)
  db.recalculatePrivateGroupStats(group.id);
  const totalPrizePool = group.prizePool;
  const basePrizeShare = Math.max(1, Math.floor(totalPrizePool / winningTickets.length));

  const foundWinners: GameWinner[] = [];

  for (const ticket of winningTickets) {
    ticket.status = 'BINGO_CLAIMED';
    (ticket as any).winningStatus = 'WON';

    const user = db.getUserById(ticket.userId);
    const username = ticket.username || user?.username || 'Player';
    const photoUrl = user?.photoUrl || undefined;
    const ticketPrice = ticket.purchasePrice || group.ticketPrice;

    let winnerShare = basePrizeShare;
    let hostBonus = 0;

    if (group.prizeDistribution === 'HOST_10_WINNER_90') {
      winnerShare = Math.round(basePrizeShare * 0.9);
      hostBonus = basePrizeShare - winnerShare;
    }

    (ticket as any).prizeWon = winnerShare;

    // Credit Winner
    db.updateWalletBalance(
      ticket.userId,
      winnerShare,
      'GAME_WIN',
      `Private Group Bingo Win (${group.winningPattern}) Card #${ticket.cardNumber || '?'} in "${group.name}"!`,
      `GRP-WIN-${group.id}-${ticket.id}`,
      group.gameReferenceId || ticket.gameReferenceId
    );

    // Credit Host Bonus if rule configured
    if (hostBonus > 0 && group.hostId !== ticket.userId) {
      db.updateWalletBalance(
        group.hostId,
        hostBonus,
        'HOST_BONUS',
        `Host 10% Share Bonus for Private Group "${group.name}"`,
        `GRP-HOST-${group.id}-${ticket.id}`,
        group.gameReferenceId || ticket.gameReferenceId
      );
    }

    const winner: GameWinner = {
      id: `win_grp_${Date.now()}_${Math.floor(Math.random() * 10000)}`,
      roomId: group.id,
      gameReferenceId: group.gameReferenceId || ticket.gameReferenceId,
      userId: ticket.userId,
      username,
      photoUrl,
      cardNumber: ticket.cardNumber || 1,
      ticketPrice,
      pattern: group.winningPattern,
      prizeAmount: winnerShare,
      totalPrizePool,
      wonAt: new Date().toISOString(),
    };

    db.winners.unshift(winner);
    foundWinners.push(winner);

    // Sync ticket, winner, and wallet tx to Firestore
    adminDb.collection('tickets').doc(ticket.id).set(ticket, { merge: true }).catch(console.warn);
    adminDb.collection('winners').doc(winner.id).set(winner).catch(console.warn);

    const winnerTx: WalletTransaction = {
      id: `tx_win_grp_${Date.now()}_${Math.floor(Math.random() * 10000)}`,
      userId: ticket.userId,
      amount: winnerShare,
      balanceAfter: user ? user.walletBalance : winnerShare,
      type: 'GAME_WIN',
      status: 'COMPLETED',
      reference: `GRP-WIN-${group.id}-${ticket.id}`,
      description: `Private Group Prize Won (${group.winningPattern}) Card #${ticket.cardNumber || '?'} in "${group.name}"`,
      createdAt: new Date().toISOString(),
    };
    adminDb.collection('transactions').doc(winnerTx.id).set(winnerTx).catch(console.warn);
  }

  // Mark all other tickets for this round as COMPLETED
  Array.from(db.tickets.values()).forEach((tkt) => {
    if (tkt.roomId === group.id && tkt.status === 'ACTIVE') {
      tkt.status = 'COMPLETED';
      (tkt as any).winningStatus = 'LOST';
      (tkt as any).prizeWon = 0;
      adminDb.collection('tickets').doc(tkt.id).set(tkt, { merge: true }).catch(console.warn);
    }
  });

  // Set group status to WAITING_HOST_DECISION and set host decision timeout (60s)
  group.status = 'WAITING_HOST_DECISION';
  group.lastWinners = foundWinners;
  group.hostDecisionTimeout = Date.now() + 60000; // 60 seconds host timeout

  // Record game history
  const roomFormatForHistory: BingoRoom = {
    id: group.id,
    name: group.name,
    icon: '🎟️',
    description: `Private Group Game (Code: ${group.code})`,
    ticketPrice: group.ticketPrice,
    prizePool: group.prizePool,
    minPlayers: 2,
    maxPlayers: group.maxPlayers,
    activePlayersCount: group.activePlayersCount || 0,
    countdownSeconds: 0,
    status: 'FINISHED',
    drawnBalls: group.drawnBalls,
    currentBall: group.currentBall,
    winningPatterns: [group.winningPattern],
    createdAt: group.createdAt,
    gameReferenceId: group.gameReferenceId,
  };
  db.recordGameHistoryForRoom(roomFormatForHistory, foundWinners);

  const groupUpdates = {
    status: 'WAITING_HOST_DECISION',
    lastWinners: foundWinners,
    hostDecisionTimeout: group.hostDecisionTimeout,
    updatedAt: new Date().toISOString(),
  };

  adminDb.collection('groupGames').doc(group.id).update(groupUpdates).catch(console.warn);

  return { winners: foundWinners, group };
}

