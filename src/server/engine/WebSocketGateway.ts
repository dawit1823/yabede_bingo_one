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
    ioInstance.emit('room:countdown', { roomId, seconds, status, startedAt, endsAt });
    ioInstance.to(roomId).emit('room:countdown', { roomId, seconds, status, startedAt, endsAt });
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
    ioInstance.emit('game:winner', { winner, room });
    ioInstance.to(roomId).emit('game:winner', { winner, room });
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
}

export const webSocketGateway = new WebSocketGateway();
