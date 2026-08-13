import { BingoRoom } from '../../types.js';
import { db } from '../db.js';
import { roomInitializer, OFFICIAL_ROOM_CONFIGS } from './RoomInitializer.js';
import { firestoreRepository } from './FirestoreRepository.js';
import { logger } from '../logger.js';

export class RoomManager {
  /**
   * Retrieves a room by ID from memory.
   * Auto-recreates official room if missing.
   */
  public getRoom(roomId: string): BingoRoom | undefined {
    let room = db.rooms.get(roomId);
    if (!room) {
      const config = OFFICIAL_ROOM_CONFIGS.find((c) => c.id === roomId);
      if (config) {
        roomInitializer.initializeOfficialRooms(db.rooms).catch(console.warn);
        room = db.rooms.get(roomId);
      }
    }
    return room;
  }

  /**
   * Retrieves all rooms from memory.
   * Ensures all four official rooms are initialized.
   */
  public getAllRooms(): BingoRoom[] {
    // Check if any official room is missing
    const hasAllOfficial = OFFICIAL_ROOM_CONFIGS.every((c) => db.rooms.has(c.id));
    if (!hasAllOfficial) {
      roomInitializer.initializeOfficialRooms(db.rooms).catch(console.warn);
    }
    return Array.from(db.rooms.values());
  }

  /**
   * Saves or updates a room in memory and Firestore.
   */
  public setRoom(room: BingoRoom): void {
    db.rooms.set(room.id, room);
    firestoreRepository.saveRoomSnapshot(room).catch(console.warn);
  }

  /**
   * Updates partial properties on an existing room.
   */
  public updateRoom(roomId: string, updates: Partial<BingoRoom>): BingoRoom | undefined {
    const room = this.getRoom(roomId);
    if (!room) return undefined;

    Object.assign(room, updates);
    db.rooms.set(roomId, room);
    return room;
  }

  /**
   * Restores state from Firestore on server startup, falling back to auto-initialization.
   */
  public async restoreStateFromFirestore(): Promise<void> {
    try {
      const dbRooms = await firestoreRepository.getGameRooms();
      if (dbRooms && dbRooms.length > 0) {
        for (const room of dbRooms) {
          db.rooms.set(room.id, room);
        }
        logger.info(`[RoomManager] Restored ${dbRooms.length} rooms from Firestore.`);
      }
    } catch (err: any) {
      logger.warn('[RoomManager] Firestore restore warning:', err.message);
    }

    // Always ensure the 4 official rooms are present
    await roomInitializer.initializeOfficialRooms(db.rooms);
  }
}

export const roomManager = new RoomManager();
