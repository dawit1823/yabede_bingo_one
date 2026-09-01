/**
 * 75-Ball Bingo Engine & Ticket Generation / Validation
 * Server-Authoritative Logic
 */

import crypto from 'crypto';
import { db, OFFICIAL_ROOMS, generateGameReferenceId } from './db.js';
import { adminDb } from './firebaseAdmin.js';
import { adminService } from './adminService.js';
import { logger } from './logger.js';
import { firestoreGuard } from './firestoreGuard.js';
import { ticketManager } from './engine/TicketManager.js';
import { ballDrawer } from './engine/BallDrawer.js';
import { webSocketGateway } from './engine/WebSocketGateway.js';
import { getIO } from './socketHandler.js';
import { BingoRoom, BingoTicket, GameWinner, WinningPattern, WalletTransaction } from '../types.js';
import { generateCardMatrixByNumber, evaluateBingoCard, checkWinningPattern as unifiedCheckWinningPattern } from '../lib/bingoUtils.js';

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

  // Increase room prize pool based on total sales minus platform rake fee
  const sysSettings = adminService.getSystemSettings();
  const platformFeePct = sysSettings.platformFeePercent ?? 20;
  room.ticketsSold = (room.ticketsSold || 0) + 1;
  const totalSales = room.ticketsSold * room.ticketPrice;
  const finalPlatformFee = Math.round(totalSales * (platformFeePct / 100));
  room.platformFee = finalPlatformFee;
  room.prizePool = Math.max(0, totalSales - finalPlatformFee);
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
  ticket: BingoTicket | (number | 'FREE')[][],
  drawnBalls: number[],
  pattern?: WinningPattern | null
): boolean {
  return unifiedCheckWinningPattern(ticket, drawnBalls, pattern);
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

  // STRICT: Ticket must belong to the active gameReferenceId of the room
  if (!room.gameReferenceId || ticket.gameReferenceId !== room.gameReferenceId) {
    return { success: false, message: 'Ticket belongs to a different game round' };
  }

  // STRICT: Ticket must be active (not cancelled, refunded, or already claimed)
  if (ticket.status !== 'ACTIVE' || typeof ticket.purchasePrice !== 'number' || ticket.purchasePrice <= 0) {
    return { success: false, message: 'Ticket is not in active playable status' };
  }

  const user = db.getUserById(userId);
  if (!user) return { success: false, message: 'User not found' };

  // Check valid pattern against drawn balls
  const allowedPatterns: WinningPattern[] = (Array.isArray(room.winningPatterns) && room.winningPatterns.length > 0)
    ? room.winningPatterns
    : ['ONE_LINE', 'TWO_LINES', 'FOUR_CORNERS', 'ONE_LINE_AND_CORNERS', 'FULL_HOUSE'];

  const evalResult = evaluateBingoCard(ticket, room.drawnBalls);
  const matchedPattern: WinningPattern | null = evalResult.matchedPatterns.find((p) => allowedPatterns.includes(p)) || null;

  if (!matchedPattern) {
    return { success: false, message: 'Bingo claim failed: Pattern requirements not met yet!' };
  }

  // Calculate prize share based on confirmed tickets sold for this gameReferenceId
  const confirmedTickets = Array.from(db.tickets.values()).filter(
    (t) =>
      t.roomId === room.id &&
      t.gameReferenceId === room.gameReferenceId &&
      (t.status === 'ACTIVE' || t.status === 'BINGO_CLAIMED') &&
      typeof t.purchasePrice === 'number' &&
      t.purchasePrice > 0
  );

  const effectiveTicketsCount = Math.max(confirmedTickets.length, room.ticketsSold || 0);
  const totalTicketSales = effectiveTicketsCount * room.ticketPrice;
  if (totalTicketSales <= 0) {
    return { success: false, message: 'Zero confirmed tickets in game round' };
  }

  const sysSettings = adminService.getSystemSettings();
  const platformFeePct = typeof sysSettings.platformFeePercent === 'number' ? sysSettings.platformFeePercent : 20;
  const finalPlatformFee = Math.round(totalTicketSales * (platformFeePct / 100));
  const calculatedPrizePool = Math.max(0, totalTicketSales - finalPlatformFee);
  const totalPrizePool = room.prizePool > 0 ? room.prizePool : calculatedPrizePool;

  const prizeShare = Math.max(1, totalPrizePool);

  ticket.status = 'BINGO_CLAIMED';

  // Credit user wallet ledger
  db.updateWalletBalance(
    userId,
    prizeShare,
    'GAME_WIN',
    `Bingo Win (${matchedPattern}) in ${room.name}!`,
    `WIN-${room.id}-${ticket.id}`,
    room.gameReferenceId
  );

  const winner: GameWinner = {
    id: `win_${Date.now()}_${Math.floor(Math.random() * 10000)}`,
    roomId: room.id,
    gameReferenceId: room.gameReferenceId,
    userId,
    ticketId: ticket.id,
    cardNumber: ticket.cardNumber || 1,
    ticketPrice: ticket.purchasePrice || room.ticketPrice,
    username: user.username || ticket.username || 'Player',
    pattern: matchedPattern,
    prizeAmount: prizeShare,
    totalPrizePool,
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
  if (!room || room.status !== 'PLAYING' || !room.gameReferenceId) return { winners: [], room: room! };

  // STRICT: Only active confirmed tickets for current gameReferenceId
  const roomTickets = Array.from(db.tickets.values()).filter(
    (t) =>
      t.roomId === roomId &&
      t.gameReferenceId === room.gameReferenceId &&
      t.status === 'ACTIVE' &&
      typeof t.purchasePrice === 'number' &&
      t.purchasePrice > 0 &&
      Boolean(t.userId)
  );

  if (roomTickets.length === 0 || !room.drawnBalls || room.drawnBalls.length === 0) {
    return { winners: [], room };
  }

  const winningTickets: { ticket: BingoTicket; pattern: WinningPattern }[] = [];
  const allowedPatterns: WinningPattern[] = (Array.isArray(room.winningPatterns) && room.winningPatterns.length > 0)
    ? room.winningPatterns
    : ['ONE_LINE', 'TWO_LINES', 'FOUR_CORNERS', 'ONE_LINE_AND_CORNERS', 'FULL_HOUSE'];

  for (const ticket of roomTickets) {
    const evalResult = evaluateBingoCard(ticket, room.drawnBalls);
    const matched = evalResult.matchedPatterns.find((p) => allowedPatterns.includes(p));
    if (matched) {
      winningTickets.push({ ticket, pattern: matched });
    }
  }

  if (winningTickets.length === 0) {
    return { winners: [], room };
  }

  // Formula: Prize Pool = Total Sales - Platform Rake Fee (or Total Sales * Prize %)
  const effectiveTicketsCount = Math.max(roomTickets.length, room.ticketsSold || 0);
  const totalTicketSales = effectiveTicketsCount * room.ticketPrice;
  const sysSettings = adminService.getSystemSettings();
  const platformFeePct = typeof sysSettings.platformFeePercent === 'number' ? sysSettings.platformFeePercent : 20;
  const finalPlatformFee = Math.round(totalTicketSales * (platformFeePct / 100));
  const calculatedPrizePool = Math.max(0, totalTicketSales - finalPlatformFee);
  const totalPrizePool = room.prizePool > 0 ? room.prizePool : calculatedPrizePool;

  if (totalPrizePool <= 0) {
    return { winners: [], room };
  }

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
      room.gameReferenceId
    );

    const winner: GameWinner = {
      id: `win_${Date.now()}_${Math.floor(Math.random() * 10000)}`,
      roomId: room.id,
      gameReferenceId: room.gameReferenceId,
      userId: ticket.userId,
      ticketId: ticket.id,
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
  }

  // Mark all remaining active tickets in this room as COMPLETED/LOST
  const roundRefId = room.gameReferenceId;
  const justLostTicketIds = new Set<string>();
  Array.from(db.tickets.values()).forEach((tkt) => {
    if (tkt.roomId === room.id && (tkt.gameReferenceId === roundRefId || !roundRefId) && tkt.status === 'ACTIVE') {
      tkt.status = 'COMPLETED';
      (tkt as any).winningStatus = 'LOST';
      (tkt as any).prizeWon = 0;
      justLostTicketIds.add(tkt.id);
    }
  });

  // Single atomic batch: persist winners, winning tickets, transactions, and room status
  if (foundWinners.length > 0) {
    firestoreGuard.safeWrite('winners', 'checkBingoWinForRoom', async () => {
      const batch = adminDb.batch();

      for (const winner of foundWinners) {
        batch.set(adminDb.collection('winners').doc(winner.id), winner);
        const tkt = db.tickets.get(winner.ticketId);
        if (tkt) {
          batch.set(adminDb.collection('tickets').doc(tkt.id), tkt, { merge: true });
        }
      }

      // Only write tickets that were JUST transitioned to COMPLETED/LOST in this round
      justLostTicketIds.forEach((tktId) => {
        const tkt = db.tickets.get(tktId);
        if (tkt) {
          batch.set(adminDb.collection('tickets').doc(tkt.id), tkt, { merge: true });
        }
      });

      const roomUpdates = {
        status: 'FINISHED',
        lastWinners: foundWinners,
        updatedAt: new Date().toISOString(),
      };
      batch.set(adminDb.collection('rooms').doc(room.id), roomUpdates, { merge: true });

      await batch.commit();
    }, true);
  }

  return { winners: foundWinners, room };
}

/**
 * Resets active bingo room states and card reservations for a new round
 * while strictly PRESERVING all historical ticket records and winners.
 */
export async function clearAndResetAllBingoGames(): Promise<BingoRoom[]> {
  logger.info('[BingoEngine] Resetting active Bingo game rounds...');

  const settings = adminService.getSystemSettings();
  const countdownSec = settings.countdownDurationSeconds || 45;
  const nowMs = Date.now();
  const startTime = new Date(nowMs).toISOString();
  const endTime = new Date(nowMs + countdownSec * 1000).toISOString();

  // 1. Stop all active ball draw cycles and wipe reservations/tickets
  const allCurrentRooms = Array.from(db.rooms.values());
  for (const r of allCurrentRooms) {
    ballDrawer.stopBallDrawCycle(r.id);
  }

  for (const template of OFFICIAL_ROOMS) {
    ballDrawer.stopBallDrawCycle(template.id);
    await ticketManager.clearTicketsForRoom(template.id);
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
      platformFee: 0,
      countdownSeconds: countdownSec,
      activePlayersCount: 0,
      ticketsSold: 0,
      lastWinners: [],
      createdAt: startTime,
      startedAt: startTime,
      endsAt: endTime,
    };

    db.rooms.set(room.id, room);
    resetRooms.push(room);

    webSocketGateway.broadcastGameReset(room.id, room);
    webSocketGateway.broadcastRoomUpdate(room);
    webSocketGateway.broadcastCountdown(room.id, countdownSec, 'WAITING', startTime, endTime);
  }

  const io = webSocketGateway.getIO() || getIO();
  if (io) {
    io.emit('rooms:updated', { rooms: resetRooms });
    for (const room of resetRooms) {
      io.to(room.id).emit('room:snapshot', {
        room,
        tickets: [],
        reservations: {},
        messages: db.chatMessages.get(room.id) || [],
      });
      io.to(room.id).emit('card:updated', {
        roomId: room.id,
        action: 'RESET_ALL',
        reservations: {},
        room,
      });
    }
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
    const evalResult = evaluateBingoCard(ticket, group.drawnBalls);
    if (evalResult.isWinner) {
      winningTickets.push(ticket);
    }
  }

  if (winningTickets.length === 0) {
    return { winners: [], group };
  }

  // Recalculate stats & prize pool to ensure 100% accuracy (Sales - 1%)
  db.recalculatePrivateGroupStats(group.id);
  const totalPrizePool = group.prizePool;
  const isHostBonusRule = group.prizeDistribution === 'HOST_10_WINNER_90';
  const totalHostBonus = isHostBonusRule ? Math.max(1, Math.floor(totalPrizePool * 0.1)) : 0;
  const totalWinnerPool = isHostBonusRule ? totalPrizePool - totalHostBonus : totalPrizePool;
  const winnerShare = Math.max(1, Math.floor(totalWinnerPool / winningTickets.length));

  const hostUser = db.getUserById(group.hostId);
  const hostUsername = hostUser?.username || 'Host';

  // Credit Host Bonus if rule configured
  if (totalHostBonus > 0 && !group.hostBonusPaid) {
    db.updateWalletBalance(
      group.hostId,
      totalHostBonus,
      'HOST_BONUS',
      `Host 10% Organizer Bonus for Private Group "${group.name}"`,
      `GRP-HOST-${group.id}-${group.gameReferenceId || Date.now()}`,
      group.gameReferenceId
    );
    group.hostBonus = totalHostBonus;
    group.hostName = hostUsername;
    group.hostBonusPaid = true;
  }

  const foundWinners: GameWinner[] = [];

  for (const ticket of winningTickets) {
    ticket.status = 'BINGO_CLAIMED';
    (ticket as any).winningStatus = 'WON';

    const user = db.getUserById(ticket.userId);
    const username = ticket.username || user?.username || 'Player';
    const photoUrl = user?.photoUrl || undefined;
    const ticketPrice = ticket.purchasePrice || group.ticketPrice;

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

    const winner: GameWinner = {
      id: `win_grp_${Date.now()}_${Math.floor(Math.random() * 10000)}`,
      roomId: group.id,
      gameReferenceId: group.gameReferenceId || ticket.gameReferenceId,
      userId: ticket.userId,
      ticketId: ticket.id,
      username,
      photoUrl,
      cardNumber: ticket.cardNumber || 1,
      ticketPrice,
      pattern: group.winningPattern,
      prizeAmount: winnerShare,
      totalPrizePool,
      wonAt: new Date().toISOString(),
    };
    (winner as any).hostBonus = totalHostBonus;
    (winner as any).hostName = hostUsername;
    (winner as any).prizeDistribution = group.prizeDistribution;

    db.winners.unshift(winner);
    foundWinners.push(winner);
  }

  // Mark all other active tickets for this round as COMPLETED/LOST and track their IDs
  const justLostTicketIds = new Set<string>();
  Array.from(db.tickets.values()).forEach((tkt) => {
    if (tkt.roomId === group.id && tkt.status === 'ACTIVE') {
      tkt.status = 'COMPLETED';
      (tkt as any).winningStatus = 'LOST';
      (tkt as any).prizeWon = 0;
      justLostTicketIds.add(tkt.id);
    }
  });

  // Set group status to WAITING_HOST_DECISION and set host decision timeout (60s)
  group.status = 'WAITING_HOST_DECISION';
  group.lastWinners = foundWinners;
  group.hostDecisionTimeout = Date.now() + 60000; // 60 seconds host timeout

  // Single atomic batch: persist winners, winning tickets, newly lost tickets, and group status
  if (foundWinners.length > 0) {
    firestoreGuard.safeWrite('groupWinners', 'checkBingoWinForGroupGame', async () => {
      const batch = adminDb.batch();

      for (const winner of foundWinners) {
        batch.set(adminDb.collection('winners').doc(winner.id), winner);
        const tkt = db.tickets.get(winner.ticketId);
        if (tkt) {
          batch.set(adminDb.collection('tickets').doc(tkt.id), tkt, { merge: true });
        }
      }

      // Only write tickets that were JUST transitioned to COMPLETED/LOST in this round
      justLostTicketIds.forEach((tktId) => {
        const tkt = db.tickets.get(tktId);
        if (tkt) {
          batch.set(adminDb.collection('tickets').doc(tkt.id), tkt, { merge: true });
        }
      });

      const groupUpdates = {
        status: 'WAITING_HOST_DECISION',
        lastWinners: foundWinners,
        hostDecisionTimeout: group.hostDecisionTimeout,
        updatedAt: new Date().toISOString(),
      };
      batch.set(adminDb.collection('groupGames').doc(group.id), groupUpdates, { merge: true });

      await batch.commit();
    }, true);
  }

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

  return { winners: foundWinners, group };
}

