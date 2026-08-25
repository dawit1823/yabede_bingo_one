import { Server as SocketIOServer } from 'socket.io';
import { roomManager, RoomManager } from './RoomManager.ts';
import { ticketManager, TicketManager } from './TicketManager.ts';
import { winnerValidator, WinnerValidator } from './WinnerValidator.ts';
import { prizeCalculator, PrizeCalculator } from './PrizeCalculator.ts';
import { ballDrawer, BallDrawer } from './BallDrawer.ts';
import { countdownManager, CountdownManager } from './CountdownManager.ts';
import { firestoreRepository, FirestoreRepository } from './FirestoreRepository.ts';
import { webSocketGateway, WebSocketGateway } from './WebSocketGateway.ts';
import { db } from '../db.js';
import { logger } from '../logger.js';
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
      return;
    }

    logger.info('[GameEngine] Booting Bingo Game Engine...');

    // 1. Restore state & auto-initialize official rooms
    await this.rooms.restoreStateFromFirestore();

    // 2. Start server countdown ticker
    this.countdown.startTicker();

    // 3. Crash recovery: resume ball drawing for official rooms and private groups in PLAYING status
    for (const room of this.rooms.getAllRooms()) {
      if (room.status === 'PLAYING') {
        logger.info(`[GameEngine] Room ${room.id} was PLAYING on restart. Resuming ball drawer cycle...`);
        this.ballDrawer.startBallDrawCycle(room.id);
      }
    }

    for (const group of db.getAllPrivateGroups()) {
      if (group.status === 'PLAYING') {
        logger.info(`[GameEngine] Private group ${group.id} was PLAYING on restart. Resuming ball drawer cycle...`);
        this.ballDrawer.startBallDrawCycle(group.id);
      }
    }

    this.isStarted = true;
    logger.info('[GameEngine] Bingo Game Engine is running.');
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
    logger.info('[GameEngine] Bingo Game Engine stopped.');
  }

  /**
   * Utility to clear and reset all games (e.g., admin action).
   */
  public async clearAndResetAllGames(): Promise<void> {
    const rooms = this.rooms.getAllRooms();
    for (const room of rooms) {
      this.ballDrawer.stopBallDrawCycle(room.id);
      await this.ballDrawer.resetAndCreateNextGame(room, true);
    }
  }
}

export const gameEngine = new GameEngine();
