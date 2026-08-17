import { BingoRoom } from '../../types.js';
import { db } from '../db.js';
import { roomInitializer } from './RoomInitializer.js';
import { firestoreRepository } from './FirestoreRepository.js';
import { logger } from '../logger.js';

export class RoomManager {
  /**
   * Retrieves a room by ID ONLY from memory.
   * NEVER triggers Firestore reads or writes.
   */
  public getRoom(roomId: string): BingoRoom | undefined {
    return db.rooms.get(roomId);
  }

  /**
   * Retrieves all rooms ONLY from memory.
   * NEVER triggers Firestore reads or writes.
   */
  public getAllRooms(): BingoRoom[] {
    return Array.from(db.rooms.values());
  }

  /**
   * Saves or updates a room in memory ONLY.
   * Live game state (countdown, balls, player counts) is NEVER written to Firestore.
   */
  public setRoom(room: BingoRoom): void {
    db.rooms.set(room.id, room);
  }

  /**
   * Updates partial properties on an existing room in memory ONLY.
   */
  public updateRoom(roomId: string, updates: Partial<BingoRoom>): BingoRoom | undefined {
    const room = db.rooms.get(roomId);
    if (!room) return undefined;

    Object.assign(room, updates);
    db.rooms.set(roomId, room);
    return room;
  }

  /**
   * Explicitly persists durable room configurations (e.g. admin settings changes).
   * Should ONLY be called for permanent configuration updates, not live gameplay.
   */
  public async persistDurableRoomConfig(room: BingoRoom): Promise<void> {
    await firestoreRepository.saveRoomSnapshot(room);
    logger.info(`[RoomManager] Persisted durable config for room: ${room.id}`);
  }

  /**
   * Initializes official rooms once directly in memory on server startup with zero Firestore read overhead.
   */
  public async restoreStateFromFirestore(): Promise<void> {
    // Initialize the 4 official rooms directly in memory
    await roomInitializer.initializeOfficialRooms(db.rooms);
    logger.info(`[RoomManager] Initialized ${db.rooms.size} official rooms in memory.`);
  }
}

export const roomManager = new RoomManager();

