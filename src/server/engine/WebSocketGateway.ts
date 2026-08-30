import { Server as SocketIOServer } from 'socket.io';
import { BingoRoom, BingoTicket, GameWinner } from '../../types.js';

let ioInstance: SocketIOServer | null = null;

export class WebSocketGateway {
  /**
   * Sets the Socket.IO instance.
   */
  public setIO(io: SocketIOServer): void {
    ioInstance = io;
  }

  /**
   * Gets the Socket.IO instance.
   */
  public getIO(): SocketIOServer | null {
    return ioInstance;
  }

  /**
   * Broadcasts room update snapshot to all connected clients.
   */
  public broadcastRoomUpdate(room: BingoRoom): void {
    if (!ioInstance) return;
    ioInstance.emit('room:updated', { room });
    ioInstance.to(room.id).emit('room:updated', { room });
  }

  /**
   * Broadcasts 1-second countdown update for a room.
   */
  public broadcastCountdown(
    roomId: string,
    seconds: number,
    status: string,
    startedAt?: string,
    endsAt?: string
  ): void {
    if (!ioInstance) return;
    const payload = { roomId, seconds, countdownSeconds: seconds, status, startedAt, endsAt };
    ioInstance.emit('room:countdown', payload);
    ioInstance.to(roomId).emit('room:countdown', payload);
  }

  /**
   * Broadcasts ball draw event.
   */
  public broadcastBallDrawn(roomId: string, ball: number, drawnBalls: number[]): void {
    if (!ioInstance) return;
    ioInstance.emit('ball:drawn', { roomId, ball, drawnBalls });
    ioInstance.to(roomId).emit('ball:drawn', { roomId, ball, drawnBalls });
    ioInstance.emit('game:ball_drawn', { roomId, ball, drawnBalls });
    ioInstance.to(roomId).emit('game:ball_drawn', { roomId, ball, drawnBalls });
  }

  /**
   * Broadcasts winner notification.
   */
  public broadcastWinner(roomId: string, winner: GameWinner, room: BingoRoom): void {
    if (!ioInstance) return;
    const payload = {
      winner,
      winners: [winner],
      prizeAmount: winner.prizeAmount,
      pattern: winner.pattern,
      room,
      roomId,
    };
    ioInstance.emit('game:winner', payload);
    ioInstance.to(roomId).emit('game:winner', payload);
  }

  /**
   * Emits private wallet balance update to a specific user.
   */
  public emitWalletUpdated(userId: string, newBalance: number): void {
    if (!ioInstance) return;
    ioInstance.emit('wallet:updated', { userId, newBalance });
  }

  /**
   * Broadcasts card/reservation state updates.
   */
  public broadcastCardUpdate(
    roomId: string,
    cardNumber: number,
    reservation: any,
    action: string,
    room?: BingoRoom
  ): void {
    if (!ioInstance) return;
    ioInstance.emit('card:updated', { roomId, cardNumber, reservation, action, room });
    ioInstance.to(roomId).emit('card:updated', { roomId, cardNumber, reservation, action, room });
  }

  /**
   * Broadcasts game reset event.
   */
  public broadcastGameReset(roomId: string, room: BingoRoom): void {
    if (!ioInstance) return;
    ioInstance.emit('game:reset', { roomId, room });
    ioInstance.to(roomId).emit('game:reset', { roomId, room });
  }

  /**
   * Broadcasts game start failure and cancellation event.
   */
  public broadcastGameStartFailed(roomId: string, reason: string, room?: BingoRoom): void {
    if (!ioInstance) return;
    const payload = { roomId, reason, room, status: 'START_FAILED' };
    ioInstance.emit('game:start_failed', payload);
    ioInstance.to(roomId).emit('game:start_failed', payload);
    ioInstance.emit('room:game_start_failed', payload);
    ioInstance.to(roomId).emit('room:game_start_failed', payload);
  }

  /**
   * Broadcasts ticket refund completion event for a room.
   */
  public broadcastGameRefunded(roomId: string, reason: string, refundedCount: number, totalRefunded: number): void {
    if (!ioInstance) return;
    const payload = { roomId, reason, refundedCount, totalRefunded, timestamp: new Date().toISOString() };
    ioInstance.emit('room:refunded', payload);
    ioInstance.to(roomId).emit('room:refunded', payload);
  }

  /**
   * Broadcasts game recovery / clean reset event.
   */
  public broadcastGameRecovered(roomId: string, room: BingoRoom, message?: string): void {
    if (!ioInstance) return;
    const payload = { roomId, room, message: message || 'Game round recovered and reset to new game' };
    ioInstance.emit('game:recovered', payload);
    ioInstance.to(roomId).emit('game:recovered', payload);
  }
}

export const webSocketGateway = new WebSocketGateway();
