import { Server as SocketIOServer } from 'socket.io';
import { roomManager, RoomManager } from './RoomManager.ts';
import { ticketManager, TicketManager } from './TicketManager.ts';
import { winnerValidator, WinnerValidator } from './WinnerValidator.ts';
import { prizeCalculator, PrizeCalculator } from './PrizeCalculator.ts';
import { ballDrawer, BallDrawer } from './BallDrawer.ts';
import { countdownManager, CountdownManager } from './CountdownManager.ts';
import { firestoreRepository, FirestoreRepository } from './FirestoreRepository.ts';
import { webSocketGateway, WebSocketGateway } from './WebSocketGateway.ts';
import { BingoRoom } from '../../types.js';

export class GameEngine {
  public readonly rooms: RoomManager = roomManager;
  public readonly tickets: TicketManager = ticketManager;
  public readonly winnerValidator: WinnerValidator = winnerValidator;
  public readonly prizeCalculator: PrizeCalculator = prizeCalculator;
  public readonly ballDrawer: BallDrawer = ballDrawer;
  public readonly countdown: CountdownManager = countdownManager;
  public readonly firestore: FirestoreRepository = firestoreRepository;
  public readonly ws: WebSocketGateway = webSocketGateway;

  private isStarted = false;

  /**
   * Initializes and boots the production Bingo Game Engine.
   * Safe to call multiple times (idempotent).
   */
  public async start(io?: SocketIOServer): Promise<void> {
    if (io) {
      this.ws.setIO(io);
    }

    if (this.isStarted) {
      console.log('⚡ [GameEngine] Already started.');
      return;
    }

    console.log('🚀 [GameEngine] Booting Yabede Bingo Production Game Engine...');

    // 1. Restore state & auto-initialize official rooms
    await this.rooms.restoreStateFromFirestore();

    // 2. Start server countdown ticker
    this.countdown.startTicker();

    this.isStarted = true;
    console.log('✅ [GameEngine] Bingo Game Engine is running smoothly.');
  }

  /**
   * Stops the engine tickers and ball draw intervals.
   */
  public stop(): void {
    this.countdown.stopTicker();
    const rooms = this.rooms.getAllRooms();
    for (const room of rooms) {
      this.ballDrawer.stopBallDrawCycle(room.id);
    }
    this.isStarted = false;
    console.log('⏹️ [GameEngine] Bingo Game Engine stopped.');
  }

  /**
   * Utility to clear and reset all games (e.g., admin action).
   */
  public async clearAndResetAllGames(): Promise<void> {
    const rooms = this.rooms.getAllRooms();
    for (const room of rooms) {
      this.ballDrawer.stopBallDrawCycle(room.id);
      await this.ballDrawer.resetAndCreateNextGame(room);
    }
  }
}

export const gameEngine = new GameEngine();
