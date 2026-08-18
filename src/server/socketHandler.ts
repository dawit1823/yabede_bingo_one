/**
 * Socket.IO Real-Time Engine Handler
 * Multi-room Bingo, Live Ball Drawing, Chat & Wallet Broadcasting
 */

import { Server as HttpServer } from 'http';
import { Server as SocketIOServer, Socket } from 'socket.io';
import { db } from './db.js';
import { adminDb } from './firebaseAdmin.js';
import { adminService } from './adminService.js';
import {
  drawNextBall,
  processBingoClaim,
  createTicket,
  autoCheckRoomWinners,
  drawNextPrivateGroupBall,
  autoCheckPrivateGroupWinners
} from './bingoEngine.js';
import { roomLifecycleCronService } from './cronSchedulerService.js';
import { ticketManager } from './engine/TicketManager.js';
import { ChatMessage } from '../types.js';

let ioInstance: SocketIOServer | null = null;

export function getIO(): SocketIOServer | null {
  return ioInstance;
}

export function broadcastCardUpdate(
  roomId: string,
  cardNumber: number,
  reservation: any,
  action: 'RESERVED' | 'CANCELLED' | 'SELECTED' | 'DESELECTED' | 'EXPIRED',
  room?: any
) {
  if (ioInstance) {
    ioInstance.to(roomId).emit('card:updated', {
      roomId,
      cardNumber,
      reservation,
      action,
      room,
    });
    ioInstance.to(roomId).emit('card:reservation_updated', {
      roomId,
      cardNumber,
      reservation,
      action,
    });
    if (room) {
      ioInstance.to(roomId).emit('room:updated', { room });
    }
  }
}

export function setupSocketIO(httpServer: HttpServer): SocketIOServer {
  const envFrontend = process.env.FRONTEND_URL || '';
  const allowedOrigins = [
    'https://melodic-ganache-8bad94.netlify.app',
    'http://localhost:3000',
    'http://localhost:5173',
    'http://127.0.0.1:3000',
    'http://127.0.0.1:5173',
  ];

  if (envFrontend) {
    envFrontend.split(',').forEach((url) => {
      const clean = url.trim().replace(/\/+$/, '');
      if (clean && !allowedOrigins.includes(clean)) {
        allowedOrigins.push(clean);
      }
    });
  }

  const io = new SocketIOServer(httpServer, {
    cors: {
      origin: (origin, callback) => {
        if (!origin) return callback(null, true);
        if (allowedOrigins.includes(origin) || allowedOrigins.includes('*')) {
          return callback(null, true);
        }
        // Allow netlify apps and development hosts automatically
        if (
          origin.endsWith('.netlify.app') ||
          origin.includes('localhost') ||
          origin.includes('127.0.0.1') ||
          origin.includes('run.app')
        ) {
          return callback(null, true);
        }
        return callback(null, true);
      },
      methods: ['GET', 'POST'],
      credentials: true,
    },
    transports: ['websocket', 'polling'],
    pingInterval: 10000,
    pingTimeout: 5000,
  });

  ioInstance = io;

  // Initialize NestJS Room Lifecycle Cron Service with Redis
  roomLifecycleCronService.initScheduler(io);

  // Track room draw intervals
  const roomIntervals: Map<string, NodeJS.Timeout> = new Map();

  const broadcastOnlineCount = () => {
    io.emit('online:users_count', { count: io.engine.clientsCount || 1 });
  };

  io.on('connection', (socket: Socket) => {
    console.log('[Socket.IO] client connected:', socket.id);
    let currentUserId: string | null = null;
    broadcastOnlineCount();

    // Send authoritative settings immediately on connection/reconnection
    const currentSettings = adminService.getSystemSettings();
    const currentBonusPrograms = adminService.getBonusPrograms();
    const currentRegistrationBonus = adminService.getRegistrationBonusAmount();
    socket.emit('settings:updated', {
      settings: currentSettings,
      bonusPrograms: currentBonusPrograms,
      registrationBonusCredit: currentRegistrationBonus,
    });

    socket.on('settings:get', () => {
      socket.emit('settings:updated', {
        settings: adminService.getSystemSettings(),
        bonusPrograms: adminService.getBonusPrograms(),
        registrationBonusCredit: adminService.getRegistrationBonusAmount(),
      });
    });

    // Auth & identify user socket
    socket.on('auth:identify', (data: { userId: string }) => {
      currentUserId = data.userId;
      const user = db.getUserById(data.userId);
      if (user) {
        socket.emit('auth:success', { user });
      }
      socket.emit('settings:updated', {
        settings: adminService.getSystemSettings(),
        bonusPrograms: adminService.getBonusPrograms(),
        registrationBonusCredit: adminService.getRegistrationBonusAmount(),
      });
      broadcastOnlineCount();
    });

    // Room Join
    socket.on('room:join', async (data: { roomId: string; userId?: string }) => {
      const { roomId } = data;
      let room = db.rooms.get(roomId);
      let isPrivateGroup = false;

      if (!room) {
        const details = db.getPrivateGroupByIdOrCode(roomId);
        if (details?.group) {
          isPrivateGroup = true;
          const grp = details.group;
          room = {
            id: grp.id,
            name: grp.name,
            description: `Private Group Game`,
            icon: '🎟️',
            ticketPrice: grp.ticketPrice,
            minPlayers: 2,
            maxPlayers: grp.maxPlayers,
            status: grp.status === 'LOBBY' ? 'WAITING' : grp.status === 'COUNTDOWN' ? 'COUNTDOWN' : grp.status === 'PLAYING' ? 'PLAYING' : 'FINISHED',
            currentBall: grp.currentBall ?? null,
            drawnBalls: grp.drawnBalls || [],
            winningPatterns: [grp.winningPattern],
            prizePool: grp.prizePool,
            countdownSeconds: grp.countdownSeconds || 0,
            activePlayersCount: grp.activePlayersCount || 0,
            ticketsSold: grp.ticketsSold || 0,
            createdAt: grp.createdAt,
          };
        }
      }
      if (!room) return;

      socket.join(roomId);
      if (isPrivateGroup || roomId.startsWith('grp_')) {
        socket.join(`private_grp_${roomId}`);
      }

      // Send initial room snapshot (scoped strictly to current round's gameReferenceId and ACTIVE status)
      const existingTickets = currentUserId
        ? Array.from(db.tickets.values()).filter(
            (t) =>
              t.roomId === roomId &&
              t.userId === currentUserId &&
              t.status === 'ACTIVE' &&
              (!room.gameReferenceId || !t.gameReferenceId || t.gameReferenceId === room.gameReferenceId)
          )
        : [];

      // Fetch active card reservations for room from in-memory TicketManager
      const reservationsMap = ticketManager.getRoomReservations(roomId, room.gameReferenceId);

      socket.emit('room:snapshot', {
        room,
        tickets: existingTickets,
        reservations: reservationsMap,
        messages: db.chatMessages.get(roomId) || [],
      });

      // Broadcast updated player count
      io.to(roomId).emit('room:updated', { room });
    });

    // Room Leave
    socket.on('room:leave', (data: { roomId: string }) => {
      socket.leave(data.roomId);
    });

    // Buy Ticket
    socket.on('ticket:buy', (data: { roomId: string; userId: string; count?: number }) => {
      const { roomId, userId, count = 1 } = data;
      const room = db.rooms.get(roomId);
      if (!room) return socket.emit('error', { message: 'Room not found' });

      try {
        const purchasedTickets = [];
        for (let i = 0; i < count; i++) {
          const ticket = createTicket(roomId, userId);
          purchasedTickets.push(ticket);
        }

        const user = db.getUserById(userId);

        socket.emit('ticket:bought', {
          tickets: purchasedTickets,
          userBalance: user?.walletBalance,
        });

        // Broadcast live wallet balance update
        io.emit('wallet:updated', {
          userId,
          newBalance: user?.walletBalance,
        });

        // Broadcast room prize pool & ticket updates
        io.to(roomId).emit('room:updated', { room });
      } catch (err: any) {
        socket.emit('error', { message: err.message || 'Failed to buy ticket' });
      }
    });

    // Claim Bingo (Manual backup claim)
    socket.on('bingo:claim', (data: { ticketId: string; userId: string }) => {
      const { ticketId, userId } = data;
      const result = processBingoClaim(ticketId, userId);

      if (result.success && result.winner) {
        const ticket = db.tickets.get(ticketId);
        const roomId = ticket?.roomId;
        const room = roomId ? db.rooms.get(roomId) : null;
        const user = db.getUserById(userId);

        if (roomId) {
          io.to(roomId).emit('game:winner', {
            winner: result.winner,
            room,
            message: result.message,
          });
        }

        io.emit('wallet:updated', {
          userId,
          newBalance: user?.walletBalance,
        });

        socket.emit('bingo:claim_success', result);
      } else {
        socket.emit('bingo:claim_failed', { message: result.message });
      }
    });

    // Chat Message
    socket.on('chat:send', (data: { roomId: string; userId: string; text: string }) => {
      const { roomId, userId, text } = data;
      const user = db.getUserById(userId);
      if (!user || !text.trim()) return;

      const msg: ChatMessage = {
        id: `msg_${Date.now()}`,
        roomId,
        userId,
        username: user.username,
        text: text.trim(),
        timestamp: new Date().toISOString(),
      };

      const roomMsgs = db.chatMessages.get(roomId) || [];
      roomMsgs.push(msg);
      if (roomMsgs.length > 50) roomMsgs.shift();
      db.chatMessages.set(roomId, roomMsgs);

      io.to(roomId).emit('chat:message', msg);
    });

    // --- PRIVATE GROUP SOCKET EVENTS ---
    socket.on('private_group:join', (data: { groupId: string; userId?: string }) => {
      const { groupId } = data;
      const details = db.getPrivateGroupByIdOrCode(groupId);
      if (!details.group) return;

      const roomName = `private_grp_${details.group.id}`;
      socket.join(roomName);
      socket.join(details.group.id);

      const userTickets = currentUserId
        ? Array.from(db.tickets.values()).filter((t) => t.roomId === details.group!.id && t.userId === currentUserId)
        : [];

      socket.emit('private_group:snapshot', {
        group: details.group,
        members: details.members,
        tickets: userTickets,
        messages: details.messages,
      });

      io.to(details.group.id).to(roomName).emit('private_group:updated', {
        group: details.group,
        members: details.members,
      });
    });

    socket.on('private_group:leave', (data: { groupId: string }) => {
      socket.leave(`private_grp_${data.groupId}`);
      socket.leave(data.groupId);
    });

    socket.on('private_group:chat', (data: { groupId: string; userId: string; text: string }) => {
      const { groupId, userId, text } = data;
      const user = db.getUserById(userId);
      if (!user || !text.trim()) return;

      const msgs = db.groupMessages.get(groupId) || [];
      const msg = {
        id: `gmsg_${Date.now()}`,
        groupId,
        userId,
        username: user.username,
        text: text.trim(),
        timestamp: new Date().toISOString(),
      };

      msgs.push(msg);
      if (msgs.length > 50) msgs.shift();
      db.groupMessages.set(groupId, msgs);

      io.to(groupId).to(`private_grp_${groupId}`).emit('private_group:message', msg);
    });

    socket.on('disconnect', () => {
      console.log('[Socket.IO] client disconnected:', socket.id);
      broadcastOnlineCount();
    });
  });

  // Global Room Engine Loops (Live Ball Drawing for Private Groups)
  setInterval(() => {
    // --- Private Groups Loop Engine ---
    db.privateGroups.forEach((group) => {
      // Ball Draw handling during active PLAYING private group (strictly initiated by Host Start action)
      if (group.status === 'PLAYING') {
        if (!roomIntervals.has(`grp_${group.id}`)) {
          const settings = adminService.getSystemSettings();
          const drawIntervalMs = (settings.ballDrawIntervalSeconds || 3) * 1000;

          const interval = setInterval(() => {
            if (group.status !== 'PLAYING') {
              clearInterval(interval);
              roomIntervals.delete(`grp_${group.id}`);
              return;
            }

            const ball = drawNextPrivateGroupBall(group.id);
            if (ball !== null) {
              const payload = {
                groupId: group.id,
                roomId: group.id,
                ball,
                drawnBalls: group.drawnBalls,
              };

              io.to(group.id).to(`private_grp_${group.id}`).emit('private_group:ball_drawn', payload);
              io.to(group.id).to(`private_grp_${group.id}`).emit('ball:drawn', payload);
              io.to(group.id).to(`private_grp_${group.id}`).emit('game:ball_drawn', payload);

              // Server-side Automatic Winner Detection for Private Group
              const { winners, group: updatedGrp } = autoCheckPrivateGroupWinners(group.id);
              if (winners && winners.length > 0) {
                for (const winner of winners) {
                  const winnerUser = db.getUserById(winner.userId);

                  io.to(group.id).to(`private_grp_${group.id}`).emit('private_group:winner', {
                    winner,
                    group: updatedGrp,
                    message: `🎉 BINGO! ${winner.username} won ${winner.prizeAmount} Birr in ${group.name}!`,
                  });

                  io.emit('game:winner', {
                    winner,
                    room: { id: group.id, name: group.name, ticketPrice: group.ticketPrice, prizePool: group.prizePool },
                    message: `🎉 BINGO! ${winner.username} won ${winner.prizeAmount} Birr in ${group.name}!`,
                  });

                  io.emit('wallet:updated', {
                    userId: winner.userId,
                    newBalance: winnerUser?.walletBalance,
                  });
                }

                io.to(group.id).to(`private_grp_${group.id}`).emit('private_group:waiting_host', {
                  groupId: group.id,
                  group: updatedGrp,
                  timeoutSeconds: 60,
                  winners,
                });

                io.to(group.id).to(`private_grp_${group.id}`).emit('private_group:updated', {
                  group: updatedGrp,
                  members: db.groupMembers.get(group.id) || [],
                });

                clearInterval(interval);
                roomIntervals.delete(`grp_${group.id}`);
              }
            } else {
              group.status = 'FINISHED';
              clearInterval(interval);
              roomIntervals.delete(`grp_${group.id}`);
              io.to(group.id).to(`private_grp_${group.id}`).emit('private_group:ended', { groupId: group.id, group });
            }
          }, drawIntervalMs);

          roomIntervals.set(`grp_${group.id}`, interval);
        }
      }

      // Check Host Decision Timeout (60 Seconds)
      if (group.status === 'WAITING_HOST_DECISION') {
        if (group.hostDecisionTimeout && Date.now() > group.hostDecisionTimeout) {
          db.closePrivateGroupGame(group.id, 'SYSTEM');
          io.to(`private_grp_${group.id}`).emit('private_group:closed', {
            groupId: group.id,
            group,
            message: 'Host did not respond within 60 seconds. Private Group session closed.',
          });
          io.to(`private_grp_${group.id}`).emit('private_group:updated', {
            group,
            members: db.groupMembers.get(group.id) || [],
          });
        }
      }

      // Check Host Disconnect Timeout (60 Seconds)
      if ((group as any).hostDisconnectTimeout && Date.now() > (group as any).hostDisconnectTimeout) {
        (group as any).hostDisconnectTimeout = undefined;
        db.closePrivateGroupGame(group.id, 'SYSTEM');
        io.to(`private_grp_${group.id}`).emit('private_group:closed', {
          groupId: group.id,
          group,
          message: 'Host disconnected and did not return within 60 seconds. Private Group session closed.',
        });
        io.to(`private_grp_${group.id}`).emit('private_group:updated', {
          group,
          members: db.groupMembers.get(group.id) || [],
        });
      }
    });
  }, 1000);

  return io;
}
