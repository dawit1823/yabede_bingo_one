import { BingoRoom } from '../../types.js';
import { generateGameReferenceId } from '../db.js';
import { firestoreRepository } from './FirestoreRepository.js';
import { adminService } from '../adminService.js';
import { logger } from '../logger.js';

export interface OfficialRoomConfig {
  id: string;
  name: string;
  description: string;
  icon: string;
  ticketPrice: number;
}

export const OFFICIAL_ROOM_CONFIGS: OfficialRoomConfig[] = [
  {
    id: 'room_10',
    name: '10 Birr Bingo',
    description: 'Bronze 75-Ball Arena • 10 Birr Ticket • 400 Cards',
    icon: '🟢',
    ticketPrice: 10,
  },
  {
    id: 'room_50',
    name: '50 Birr Bingo',
    description: 'Silver 75-Ball Arena • 50 Birr Ticket • 400 Cards',
    icon: '🔵',
    ticketPrice: 50,
  },
  {
    id: 'room_100',
    name: '100 Birr Bingo',
    description: 'Gold 75-Ball Arena • 100 Birr Ticket • 400 Cards',
    icon: '🟠',
    ticketPrice: 100,
  },
  {
    id: 'room_200',
    name: '200 Birr Bingo',
    description: 'VIP Diamond Arena • 200 Birr Ticket • 400 Cards',
    icon: '🔴',
    ticketPrice: 200,
  },
];

export class RoomInitializer {
  /**
   * Idempotent initialization of the four official Bingo rooms.
   * If any official room is missing from memory or Firestore, creates it automatically.
   */
  public async initializeOfficialRooms(memoryRooms: Map<string, BingoRoom>): Promise<BingoRoom[]> {
    logger.info('[RoomInitializer] Initializing official Bingo rooms...');

    const settings = adminService.getSystemSettings();
    const countdownSec = settings.countdownDurationSeconds || 45;
    const maxP = settings.maxPlayers || 400;
    const minP = settings.minPlayers || 1;

    const nowMs = Date.now();
    const startTime = new Date(nowMs).toISOString();
    const endTime = new Date(nowMs + countdownSec * 1000).toISOString();

    const initializedRooms: BingoRoom[] = [];

    for (const config of OFFICIAL_ROOM_CONFIGS) {
      let existing = memoryRooms.get(config.id);

      if (!existing) {
        const gameRef = generateGameReferenceId(config.ticketPrice, config.id);
        const newRoom: BingoRoom = {
          id: config.id,
          gameReferenceId: gameRef,
          name: config.name,
          description: config.description,
          icon: config.icon,
          ticketPrice: config.ticketPrice,
          minPlayers: minP,
          maxPlayers: maxP,
          status: 'WAITING',
          currentBall: null,
          drawnBalls: [],
          winningPatterns: ['ONE_LINE', 'TWO_LINES', 'FOUR_CORNERS', 'FULL_HOUSE'],
          prizePool: 0,
          platformFee: 0,
          countdownSeconds: countdownSec,
          activePlayersCount: 0,
          ticketsSold: 0,
          createdAt: new Date().toISOString(),
          startedAt: startTime,
          endsAt: endTime,
        };

        memoryRooms.set(config.id, newRoom);
        initializedRooms.push(newRoom);

        // Immediately write snapshot to Firestore so collections are recreated if deleted
        firestoreRepository.saveRoomSnapshot(newRoom).catch((err) => {
          logger.warn(`[RoomInitializer] Snapshot write error for ${config.id}:`, err.message);
        });

        logger.debug(`[RoomInitializer] Auto-initialized room: ${config.name} (${config.id})`);
      } else {
        // Ensure endsAt, startedAt, and gameReferenceId are set
        if (!existing.gameReferenceId) {
          existing.gameReferenceId = generateGameReferenceId(existing.ticketPrice, existing.id);
        }
        if (!existing.endsAt) {
          existing.startedAt = startTime;
          existing.endsAt = endTime;
          existing.countdownSeconds = 45;
        }
        memoryRooms.set(config.id, existing);
        initializedRooms.push(existing);

        // Persist update snapshot to Firestore
        firestoreRepository.saveRoomSnapshot(existing).catch(console.warn);
      }
    }

    return initializedRooms;
  }
}

export const roomInitializer = new RoomInitializer();
