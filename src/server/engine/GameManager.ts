import { Server as SocketIOServer } from 'socket.io';
import { gameEngine } from './GameEngine.ts';
import { db } from '../db.js';

export class GameManager {
  public setSocketServer(io: SocketIOServer) {
    gameEngine.ws.setIO(io);
  }

  public async initEngine(io?: SocketIOServer) {
    await gameEngine.start(io);
  }

  public async restoreStateFromFirestore() {
    await gameEngine.rooms.restoreStateFromFirestore();
  }

  public startBallDrawCycle(roomId: string) {
    gameEngine.ballDrawer.startBallDrawCycle(roomId);
  }

  public async resetRoomForNextRound(roomId: string) {
    const room = gameEngine.rooms.getRoom(roomId);
    if (room) {
      await gameEngine.ballDrawer.resetAndCreateNextGame(room);
    }
  }
}

export const gameManager = new GameManager();
