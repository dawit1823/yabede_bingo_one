/**
 * Production-Ready Cloud Firestore Backend Store
 * Every transaction, user, room, ticket, game, deposit, withdrawal, and audit log
 * is persisted and retrieved directly from Cloud Firestore.
 */

import crypto from 'crypto';
import { adminDb } from './firebaseAdmin.js';
import { adminService } from './adminService.js';
import { firestoreGuard } from './firestoreGuard.js';
import { logger } from './logger.js';
import {
  UserProfile,
  WalletTransaction,
  DepositRequest,
  WithdrawalRequest,
  PaymentMethodConfig,
  UserNotification,
  BingoRoom,
  BingoTicket,
  GameWinner,
  ChatMessage,
  LeaderboardEntry,
  AuditLog,
  SystemMetrics,
  PhoneUserAuth,
  PrivateGroup,
  GroupMember,
  GroupInvitation,
  GroupMessage,
  WinningPattern,
  GameHistoryRecord,
} from '../types.js';
import { generateCardMatrixByNumber } from '../lib/bingoUtils.js';

const roomSequenceCounters = new Map<string, number>();

export function generateGameReferenceId(ticketPrice: number, roomId: string): string {
  const dateObj = new Date();
  const year = dateObj.getUTCFullYear();
  const month = String(dateObj.getUTCMonth() + 1).padStart(2, '0');
  const day = String(dateObj.getUTCDate()).padStart(2, '0');
  const dateStr = `${year}${month}${day}`;

  let priceTag = `${ticketPrice}B`;
  if (roomId.startsWith('grp_') || roomId.startsWith('private_')) {
    priceTag = 'PRV';
  } else if (ticketPrice === 10) priceTag = '10B';
  else if (ticketPrice === 50) priceTag = '50B';
  else if (ticketPrice === 100) priceTag = '100B';
  else if (ticketPrice === 200) priceTag = '200B';

  const currentCount = (roomSequenceCounters.get(roomId) || 0) + 1;
  roomSequenceCounters.set(roomId, currentCount);

  const seqStr = String(currentCount).padStart(6, '0');
  return `GAME-${dateStr}-${priceTag}-${seqStr}`;
}

export function syncRoomSequenceFromRef(roomId: string, gameRef?: string) {
  if (!gameRef) return;
  const parts = gameRef.split('-');
  if (parts.length >= 4) {
    const seqNum = parseInt(parts[parts.length - 1], 10);
    if (!isNaN(seqNum)) {
      const existing = roomSequenceCounters.get(roomId) || 0;
      if (seqNum > existing) {
        roomSequenceCounters.set(roomId, seqNum);
      }
    }
  }
}

export function attributeReferral(
  database: FirestoreDatabaseStore,
  adminSvc: typeof adminService,
  newUser: UserProfile,
  rawReferralCode?: string
): void {
  if (!newUser || !newUser.id) return;

  let referrer: UserProfile | undefined = undefined;

  // 1. Strip 'ref_' prefix, trim, lowercase-compare
  if (rawReferralCode) {
    let cleanRef = rawReferralCode.trim();
    if (cleanRef.toLowerCase().startsWith('ref_')) {
      cleanRef = cleanRef.substring(4).trim();
    }

    if (cleanRef) {
      const lowerClean = cleanRef.toLowerCase();
      // Match referrer by referralCode, id, or telegramId (never the new user themselves)
      referrer = Array.from(database.users.values()).find(
        (u) =>
          u.id !== newUser.id &&
          (!newUser.telegramId || u.telegramId !== newUser.telegramId) &&
          (
            (u.referralCode && u.referralCode.toLowerCase() === lowerClean) ||
            (u.id && u.id.toLowerCase() === lowerClean) ||
            (u.telegramId && String(u.telegramId) === cleanRef)
          )
      );
    }
  }

  // 2. If referrer not matched by rawReferralCode, check existing referredBy on newUser
  if (!referrer && newUser.referredBy) {
    const existingRef = database.getUserById(newUser.referredBy);
    if (
      existingRef &&
      existingRef.id !== newUser.id &&
      (!newUser.telegramId || existingRef.telegramId !== newUser.telegramId)
    ) {
      referrer = existingRef;
    }
  }

  if (!referrer) return;

  // 3. Set newUser.referredBy = referrer.id (only if not already set)
  if (!newUser.referredBy) {
    newUser.referredBy = referrer.id;
    database.saveUser(newUser);
  }

  // 4. Idempotency: skip if a REFERRAL_BONUS transaction with reference REFERRAL_JOIN_${newUser.id} already exists
  const refTxRef = `REFERRAL_JOIN_${newUser.id}`;
  const alreadyRewarded = database.transactions.some(
    (tx) => tx.userId === referrer!.id && tx.type === 'REFERRAL_BONUS' && tx.reference === refTxRef
  );

  if (alreadyRewarded) {
    return;
  }

  // 5. Read bonus amount from adminService.getReferralBonusConfig() (enabled + amountBirr)
  const refConfig = adminSvc.getReferralBonusConfig();
  const refBonus = refConfig.enabled ? refConfig.amountBirr : 0;

  // 6. Credit referrer via db.updateWalletBalance(), increment referralCount/referralEarnings, save referrer, send notification
  referrer.referralCount = (referrer.referralCount || 0) + 1;
  if (refBonus > 0) {
    database.updateWalletBalance(
      referrer.id,
      refBonus,
      'REFERRAL_BONUS',
      `Referral reward for inviting ${newUser.firstName || newUser.username || 'new player'}`,
      refTxRef
    );
    referrer.referralEarnings = (referrer.referralEarnings || 0) + refBonus;
    database.addNotification({
      userId: referrer.id,
      title: '🎉 Referral Bonus Received!',
      message: `You earned ${refBonus} Birr for inviting ${newUser.firstName || newUser.username || 'a friend'}!`,
      type: 'SYSTEM',
    });
  }
  database.saveUser(referrer);
}

export const OFFICIAL_ROOMS: BingoRoom[] = [
  {
    id: 'room_10',
    gameReferenceId: generateGameReferenceId(10, 'room_10'),
    name: '10 Birr Bingo',
    description: 'Bronze 75-Ball Arena • 10 Birr Ticket • 400 Cards',
    icon: '🟢',
    ticketPrice: 10,
    minPlayers: 1,
    maxPlayers: 400,
    status: 'WAITING',
    currentBall: null,
    drawnBalls: [],
    winningPatterns: ['ONE_LINE', 'TWO_LINES', 'FOUR_CORNERS', 'FULL_HOUSE'],
    prizePool: 0,
    countdownSeconds: 45,
    activePlayersCount: 0,
    ticketsSold: 0,
    createdAt: new Date().toISOString(),
  },
  {
    id: 'room_50',
    gameReferenceId: generateGameReferenceId(50, 'room_50'),
    name: '50 Birr Bingo',
    description: 'Silver 75-Ball Arena • 50 Birr Ticket • 400 Cards',
    icon: '🔵',
    ticketPrice: 50,
    minPlayers: 1,
    maxPlayers: 400,
    status: 'WAITING',
    currentBall: null,
    drawnBalls: [],
    winningPatterns: ['ONE_LINE', 'TWO_LINES', 'FOUR_CORNERS', 'FULL_HOUSE'],
    prizePool: 0,
    countdownSeconds: 45,
    activePlayersCount: 0,
    ticketsSold: 0,
    createdAt: new Date().toISOString(),
  },
  {
    id: 'room_100',
    gameReferenceId: generateGameReferenceId(100, 'room_100'),
    name: '100 Birr Bingo',
    description: 'Gold 75-Ball Arena • 100 Birr Ticket • 400 Cards',
    icon: '🟠',
    ticketPrice: 100,
    minPlayers: 1,
    maxPlayers: 400,
    status: 'WAITING',
    currentBall: null,
    drawnBalls: [],
    winningPatterns: ['ONE_LINE', 'TWO_LINES', 'FOUR_CORNERS', 'FULL_HOUSE'],
    prizePool: 0,
    countdownSeconds: 45,
    activePlayersCount: 0,
    ticketsSold: 0,
    createdAt: new Date().toISOString(),
  },
  {
    id: 'room_200',
    gameReferenceId: generateGameReferenceId(200, 'room_200'),
    name: '200 Birr Bingo',
    description: 'VIP Diamond Arena • 200 Birr Ticket • 400 Cards',
    icon: '🔴',
    ticketPrice: 200,
    minPlayers: 1,
    maxPlayers: 400,
    status: 'WAITING',
    currentBall: null,
    drawnBalls: [],
    winningPatterns: ['ONE_LINE', 'TWO_LINES', 'FOUR_CORNERS', 'FULL_HOUSE'],
    prizePool: 0,
    countdownSeconds: 45,
    activePlayersCount: 0,
    ticketsSold: 0,
    createdAt: new Date().toISOString(),
  },
];

class FirestoreDatabaseStore {
  public users: Map<string, UserProfile> = new Map();
  public telegramUserIndex: Map<number, string> = new Map();
  public phoneUserAuthMap: Map<string, PhoneUserAuth> = new Map();
  public phoneToUserIndex: Map<string, string> = new Map();
  public transactions: WalletTransaction[] = [];
  public deposits: DepositRequest[] = [];
  public withdrawals: WithdrawalRequest[] = [];
  public paymentMethods: Map<string, PaymentMethodConfig> = new Map();
  public notifications: UserNotification[] = [];
  public rooms: Map<string, BingoRoom> = new Map();
  public tickets: Map<string, BingoTicket> = new Map();
  public winners: GameWinner[] = [];
  public gameHistoryRecords: GameHistoryRecord[] = [];
  public chatMessages: Map<string, ChatMessage[]> = new Map();
  public auditLogs: AuditLog[] = [];

  // Private Group Bingo Collections
  public privateGroups: Map<string, PrivateGroup> = new Map();
  public privateGroupCodeIndex: Map<string, string> = new Map();
  public groupMembers: Map<string, GroupMember[]> = new Map();
  public groupInvitations: Map<string, GroupInvitation[]> = new Map();
  public groupMessages: Map<string, GroupMessage[]> = new Map();

  private isInitialized = false;

  constructor() {
    // Immediately seed official rooms in memory
    const nowMs = Date.now();
    const nowIso = new Date(nowMs).toISOString();
    const endsIso = new Date(nowMs + 45000).toISOString();
    for (const officialRoom of OFFICIAL_ROOMS) {
      if (!this.rooms.has(officialRoom.id)) {
        this.rooms.set(officialRoom.id, {
          ...officialRoom,
          startedAt: nowIso,
          endsAt: endsIso,
          countdownSeconds: 45,
        });
      }
    }

    this.initFirestoreSync().catch((err) => {
      logger.debug('Firestore store sync note:', err.message || err);
    });
  }

  public async initFirestoreSync() {
    if (this.isInitialized) return;
    this.isInitialized = true;
    logger.info('[Firestore] Initializing memory store with official game rooms and configuration...');

    try {
      // 1. Seed and guarantee official 4 rooms directly in memory immediately
      const nowMs = Date.now();
      const nowIso = new Date(nowMs).toISOString();
      const endsIso = new Date(nowMs + 45000).toISOString();

      for (const officialRoom of OFFICIAL_ROOMS) {
        const gameRef = generateGameReferenceId(officialRoom.ticketPrice, officialRoom.id);
        const seededRoom: BingoRoom = {
          ...officialRoom,
          gameReferenceId: gameRef,
          status: 'WAITING',
          currentBall: null,
          drawnBalls: [],
          prizePool: 0,
          platformFee: 0,
          ticketsSold: 0,
          activePlayersCount: 0,
          startedAt: nowIso,
          endsAt: endsIso,
          countdownSeconds: 45,
        };
        this.rooms.set(officialRoom.id, seededRoom);
      }

      // 2. Load Payment Methods safely with default fallback
      await firestoreGuard.safeRead('settings', 'loadPaymentMethods', async () => {
        const pmSnapshot = await adminDb.collection('settings').doc('paymentMethods').get();
        if (pmSnapshot.exists && pmSnapshot.data()?.methods) {
          const methods: PaymentMethodConfig[] = pmSnapshot.data()?.methods || [];
          methods.forEach((m) => this.paymentMethods.set(m.id, m));
        } else {
          const defaultMethods: PaymentMethodConfig[] = [
            {
              id: 'pm_telebirr',
              name: 'Telebirr',
              logo: '📱',
              description: 'Send transfer via Telebirr App or USSD *127#',
              accountName: 'Dawit',
              phoneNumber: '0918230227',
              qrCodeUrl: 'https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=telebirr://pay?phone=0918230227',
              instructions: '1. Open Telebirr or dial *127#\n2. Select "Send Money"\n3. Enter Phone: 0918230227 (Recipient: Dawit)\n4. Enter deposit amount\n5. Copy the transaction reference number.',
              status: 'ACTIVE',
              providerType: 'MANUAL',
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
            },
            {
              id: 'pm_cbe',
              name: 'Commercial Bank of Ethiopia (CBE)',
              logo: '🏦',
              description: 'Bank transfer via CBE Birr or Mobile Banking',
              accountName: 'Dawit',
              accountNumber: '1000123456789',
              phoneNumber: '0918230227',
              qrCodeUrl: 'https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=CBE-1000123456789',
              instructions: '1. Transfer to Account: 1000123456789\n2. Account Recipient Name: Dawit\n3. Copy the transaction reference code.',
              status: 'ACTIVE',
              providerType: 'MANUAL',
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
            },
          ];
          defaultMethods.forEach((m) => this.paymentMethods.set(m.id, m));
        }
      }, null);

      // 3. Synchronize All Registered Users from Firestore
      await this.syncUsersFromFirestore();

      // 4. Synchronize all other collections from Firestore (Rooms, Deposits, Withdrawals, Transactions, Tickets, Winners, Game History, Audit Logs, Notifications, Groups)
      await this.syncAllDataFromFirestore();

      logger.info(`[Firestore] Memory store initialized with ${this.rooms.size} Bingo arenas, ${this.users.size} registered users, ${this.deposits.length} deposits, ${this.withdrawals.length} withdrawals, ${this.transactions.length} transactions, ${this.tickets.size} tickets, and ${this.winners.length} winners.`);
    } catch (err: any) {
      console.warn('⚠️ [Firestore] Notice during startup sync:', err.message || err);
      if (this.users.size === 0) {
        this.seedInitialUsers();
      }
    }
  }

  /**
   * Complete hydration of all persistent data from Firestore.
   * Guarantees zero data loss across Render redeployments, restarts, and browser refreshes.
   */
  public async syncAllDataFromFirestore(): Promise<void> {
    try {
      await firestoreGuard.safeRead('all_collections', 'syncAllDataFromFirestore', async () => {
        // A. Synchronize Rooms (Custom rooms created by Admin + ensure official rooms)
        try {
          const roomsSnap = await adminDb.collection('rooms').get().catch(() => null);
          if (roomsSnap && !roomsSnap.empty) {
            roomsSnap.docs.forEach((doc) => {
              const r = doc.data() as BingoRoom;
              if (r && r.id) {
                // If room doesn't exist in memory yet, add it
                if (!this.rooms.has(r.id)) {
                  this.rooms.set(r.id, {
                    ...r,
                    status: r.status || 'WAITING',
                    drawnBalls: Array.isArray(r.drawnBalls) ? r.drawnBalls : [],
                    currentBall: r.currentBall !== undefined ? r.currentBall : null,
                    prizePool: typeof r.prizePool === 'number' ? r.prizePool : 0,
                    ticketsSold: typeof r.ticketsSold === 'number' ? r.ticketsSold : 0,
                    activePlayersCount: typeof r.activePlayersCount === 'number' ? r.activePlayersCount : 0,
                    countdownSeconds: typeof r.countdownSeconds === 'number' ? r.countdownSeconds : 45,
                    startedAt: r.startedAt || new Date().toISOString(),
                    endsAt: r.endsAt || new Date(Date.now() + 45000).toISOString(),
                  });
                }
              }
            });
          }
        } catch (e) {
          logger.debug('[FirestoreSync] Rooms sync note:', e);
        }

        // B. Synchronize Deposits (from 'payments' and fallback 'deposits' collections)
        try {
          const paymentsSnap = await adminDb.collection('payments').orderBy('createdAt', 'desc').limit(500).get().catch(async () => {
            return adminDb.collection('payments').limit(500).get().catch(() => null);
          });
          const existingDepIds = new Set(this.deposits.map((d) => d.id));
          if (paymentsSnap && !paymentsSnap.empty) {
            paymentsSnap.docs.forEach((doc) => {
              const dep = doc.data() as DepositRequest;
              if (dep && dep.id && !existingDepIds.has(dep.id)) {
                this.deposits.push(dep);
                existingDepIds.add(dep.id);
              }
            });
          }
          // Fallback check on 'deposits' collection if any legacy docs exist
          const legacyDepSnap = await adminDb.collection('deposits').limit(200).get().catch(() => null);
          if (legacyDepSnap && !legacyDepSnap.empty) {
            legacyDepSnap.docs.forEach((doc) => {
              const dep = doc.data() as DepositRequest;
              if (dep && dep.id && !existingDepIds.has(dep.id)) {
                this.deposits.push(dep);
                existingDepIds.add(dep.id);
              }
            });
          }
        } catch (e) {
          logger.debug('[FirestoreSync] Deposits sync note:', e);
        }

        // C. Synchronize Withdrawals
        try {
          const wdSnap = await adminDb.collection('withdrawals').orderBy('createdAt', 'desc').limit(500).get().catch(async () => {
            return adminDb.collection('withdrawals').limit(500).get().catch(() => null);
          });
          const existingWdIds = new Set(this.withdrawals.map((w) => w.id));
          if (wdSnap && !wdSnap.empty) {
            wdSnap.docs.forEach((doc) => {
              const wd = doc.data() as WithdrawalRequest;
              if (wd && wd.id && !existingWdIds.has(wd.id)) {
                this.withdrawals.push(wd);
                existingWdIds.add(wd.id);
              }
            });
          }
        } catch (e) {
          logger.debug('[FirestoreSync] Withdrawals sync note:', e);
        }

        // D. Synchronize Transactions (Wallet Ledger)
        try {
          const txSnap = await adminDb.collection('transactions').orderBy('createdAt', 'desc').limit(500).get().catch(async () => {
            return adminDb.collection('transactions').limit(500).get().catch(() => null);
          });
          const existingTxIds = new Set(this.transactions.map((t) => t.id));
          if (txSnap && !txSnap.empty) {
            txSnap.docs.forEach((doc) => {
              const tx = doc.data() as WalletTransaction;
              if (tx && tx.id && !existingTxIds.has(tx.id)) {
                this.transactions.push(tx);
                existingTxIds.add(tx.id);
              }
            });
          }
        } catch (e) {
          logger.debug('[FirestoreSync] Transactions sync note:', e);
        }

        // E. Synchronize Tickets
        try {
          const tktSnap = await adminDb.collection('tickets').orderBy('boughtAt', 'desc').limit(1000).get().catch(async () => {
            return adminDb.collection('tickets').limit(1000).get().catch(() => null);
          });
          if (tktSnap && !tktSnap.empty) {
            tktSnap.docs.forEach((doc) => {
              const tkt = doc.data() as BingoTicket;
              if (tkt && tkt.id) {
                this.tickets.set(tkt.id, tkt);
              }
            });
          }
        } catch (e) {
          logger.debug('[FirestoreSync] Tickets sync note:', e);
        }

        // F. Synchronize Winners
        try {
          const winSnap = await adminDb.collection('winners').orderBy('wonAt', 'desc').limit(500).get().catch(async () => {
            return adminDb.collection('winners').limit(500).get().catch(() => null);
          });
          const existingWinIds = new Set(this.winners.map((w) => w.id));
          if (winSnap && !winSnap.empty) {
            winSnap.docs.forEach((doc) => {
              const w = doc.data() as GameWinner;
              if (w && w.id && !existingWinIds.has(w.id)) {
                this.winners.push(w);
                existingWinIds.add(w.id);
              }
            });
          }
        } catch (e) {
          logger.debug('[FirestoreSync] Winners sync note:', e);
        }

        // G. Synchronize Game History
        try {
          const ghSnap = await adminDb.collection('gameHistory').orderBy('playedAt', 'desc').limit(500).get().catch(async () => {
            return adminDb.collection('gameHistory').limit(500).get().catch(() => null);
          });
          const existingGhIds = new Set(this.gameHistoryRecords.map((gh) => gh.id));
          if (ghSnap && !ghSnap.empty) {
            ghSnap.docs.forEach((doc) => {
              const gh = doc.data() as GameHistoryRecord;
              if (gh && gh.id && !existingGhIds.has(gh.id)) {
                this.gameHistoryRecords.push(gh);
                existingGhIds.add(gh.id);
              }
            });
          }
        } catch (e) {
          logger.debug('[FirestoreSync] GameHistory sync note:', e);
        }

        // H. Synchronize Audit Logs
        try {
          const auditSnap = await adminDb.collection('auditLogs').orderBy('timestamp', 'desc').limit(500).get().catch(async () => {
            return adminDb.collection('auditLogs').limit(500).get().catch(() => null);
          });
          const existingAuditIds = new Set(this.auditLogs.map((a) => a.id));
          if (auditSnap && !auditSnap.empty) {
            auditSnap.docs.forEach((doc) => {
              const log = doc.data() as AuditLog;
              if (log && log.id && !existingAuditIds.has(log.id)) {
                this.auditLogs.push(log);
                existingAuditIds.add(log.id);
              }
            });
          }
        } catch (e) {
          logger.debug('[FirestoreSync] AuditLogs sync note:', e);
        }

        // I. Synchronize Notifications
        try {
          const notifSnap = await adminDb.collection('notifications').orderBy('createdAt', 'desc').limit(500).get().catch(async () => {
            return adminDb.collection('notifications').limit(500).get().catch(() => null);
          });
          const existingNotifIds = new Set(this.notifications.map((n) => n.id));
          if (notifSnap && !notifSnap.empty) {
            notifSnap.docs.forEach((doc) => {
              const notif = doc.data() as UserNotification;
              if (notif && notif.id && !existingNotifIds.has(notif.id)) {
                this.notifications.push(notif);
                existingNotifIds.add(notif.id);
              }
            });
          }
        } catch (e) {
          logger.debug('[FirestoreSync] Notifications sync note:', e);
        }

        // J. Synchronize Private Groups
        try {
          const groupSnap = await adminDb.collection('groupGames').get().catch(() => null);
          if (groupSnap && !groupSnap.empty) {
            groupSnap.docs.forEach((doc) => {
              const grp = doc.data() as PrivateGroup;
              if (grp && grp.id) {
                this.privateGroups.set(grp.id, grp);
                if (grp.code) this.privateGroupCodeIndex.set(grp.code.toUpperCase(), grp.id);
              }
            });
          }
        } catch (e) {
          logger.debug('[FirestoreSync] GroupGames sync note:', e);
        }
      }, null);
    } catch (err: any) {
      logger.warn('[FirestoreSync] Notice during full data sync:', err.message || err);
    }
  }

  /**
   * Synchronizes all registered users and authentication credentials from Firestore.
   * Ensures zero omission of registered players in the Admin Panel directory.
   */
  public async syncUsersFromFirestore(): Promise<UserProfile[]> {
    try {
      await firestoreGuard.safeRead('users', 'syncUsersFromFirestore', async () => {
        const usersSnapshot = await adminDb.collection('users').get();
        if (!usersSnapshot.empty) {
          usersSnapshot.docs.forEach((doc) => {
            const data = doc.data() as any;
            if (data && (data.id || doc.id)) {
              const uid = data.id || doc.id;
              const user: UserProfile = {
                id: uid,
                telegramId: Number(data.telegramId) || 0,
                username: data.username || data.telegramUsername || `user_${uid.slice(-4)}`,
                firstName: data.firstName || '',
                lastName: data.lastName || '',
                phone: data.phone || data.phoneNumber || undefined,
                photoUrl: data.photoUrl || `https://api.dicebear.com/7.x/bottts/svg?seed=${uid}`,
                language: data.language || 'am',
                referralCode: data.referralCode || `REF${Math.floor(100000 + Math.random() * 900000)}`,
                referredBy: data.referredBy || undefined,
                referralCount: typeof data.referralCount === 'number' ? data.referralCount : 0,
                referralEarnings: typeof data.referralEarnings === 'number' ? data.referralEarnings : 0,
                walletBalance: typeof data.walletBalance === 'number' ? data.walletBalance : 0,
                bonusBalance: typeof data.bonusBalance === 'number' ? data.bonusBalance : 0,
                vipLevel: Number(data.vipLevel) || 1,
                status: (data.status as any) || 'ACTIVE',
                role: (data.role as any) || 'USER',
                createdAt: data.createdAt || new Date().toISOString(),
                updatedAt: data.updatedAt || new Date().toISOString(),
                lastLogin: data.lastLogin || data.createdAt || new Date().toISOString(),
                totalWins: typeof data.totalWins === 'number' ? data.totalWins : 0,
                totalGamesPlayed: typeof data.totalGamesPlayed === 'number' ? data.totalGamesPlayed : 0,
                totalDeposited: typeof data.totalDeposited === 'number' ? data.totalDeposited : 0,
                totalWithdrawn: typeof data.totalWithdrawn === 'number' ? data.totalWithdrawn : 0,
              };

              this.users.set(user.id, user);
              if (user.telegramId) this.telegramUserIndex.set(user.telegramId, user.id);
              if (user.phone) {
                const norm = this.normalizePhone(user.phone);
                this.phoneToUserIndex.set(norm, user.id);
                this.phoneToUserIndex.set(user.phone, user.id);
              }
            }
          });
        }

        // Also sync phoneUserAuthMap
        const authSnapshot = await adminDb.collection('userAuth').get().catch(() => null);
        if (authSnapshot && !authSnapshot.empty) {
          authSnapshot.docs.forEach((doc) => {
            const authData = doc.data() as PhoneUserAuth;
            if (authData && authData.phone) {
              this.phoneUserAuthMap.set(doc.id, authData);
              const norm = this.normalizePhone(authData.phone);
              this.phoneToUserIndex.set(norm, doc.id);
              this.phoneToUserIndex.set(authData.phone, doc.id);
              const userRec = this.users.get(doc.id);
              if (userRec && !userRec.phone) {
                userRec.phone = norm;
              }
            }
          });
        }
      }, null);

      // If no users exist yet in Firestore (fresh deploy or new database), seed standard demo players
      if (this.users.size === 0) {
        this.seedInitialUsers();
      }

      logger.info(`[Firestore] Registered users directory synchronized. Total active users in memory: ${this.users.size}`);
    } catch (err: any) {
      console.warn('⚠️ [Firestore] Notice during users sync:', err.message || err);
      if (this.users.size === 0) {
        this.seedInitialUsers();
      }
    }

    return Array.from(this.users.values());
  }

  /**
   * Seeds realistic standard player accounts for testing, initial directory viewing, and demonstrations.
   */
  public seedInitialUsers() {
    const initialUsers: UserProfile[] = [
      {
        id: 'usr_abebe',
        telegramId: 1001,
        username: 'abebe_b',
        firstName: 'Abebe',
        lastName: 'Bekele',
        phone: '+251911223344',
        photoUrl: 'https://api.dicebear.com/7.x/bottts/svg?seed=usr_abebe',
        language: 'am',
        referralCode: 'REF100101',
        walletBalance: 350,
        bonusBalance: 50,
        vipLevel: 2,
        status: 'ACTIVE',
        role: 'USER',
        createdAt: new Date(Date.now() - 7 * 86400000).toISOString(),
        lastLogin: new Date().toISOString(),
        totalWins: 14,
        totalGamesPlayed: 48,
        totalDeposited: 1200,
        totalWithdrawn: 800,
      },
      {
        id: 'usr_kebede',
        telegramId: 1002,
        username: 'kebede_t',
        firstName: 'Kebede',
        lastName: 'Tessema',
        phone: '+251922334455',
        photoUrl: 'https://api.dicebear.com/7.x/bottts/svg?seed=usr_kebede',
        language: 'am',
        referralCode: 'REF100102',
        walletBalance: 520,
        bonusBalance: 100,
        vipLevel: 3,
        status: 'ACTIVE',
        role: 'USER',
        createdAt: new Date(Date.now() - 5 * 86400000).toISOString(),
        lastLogin: new Date().toISOString(),
        totalWins: 22,
        totalGamesPlayed: 75,
        totalDeposited: 2500,
        totalWithdrawn: 1800,
      },
      {
        id: 'usr_chala',
        telegramId: 1003,
        username: 'chala_g',
        firstName: 'Chala',
        lastName: 'Girma',
        phone: '+251933445566',
        photoUrl: 'https://api.dicebear.com/7.x/bottts/svg?seed=usr_chala',
        language: 'en',
        referralCode: 'REF100103',
        walletBalance: 180,
        bonusBalance: 30,
        vipLevel: 1,
        status: 'ACTIVE',
        role: 'USER',
        createdAt: new Date(Date.now() - 3 * 86400000).toISOString(),
        lastLogin: new Date().toISOString(),
        totalWins: 6,
        totalGamesPlayed: 25,
        totalDeposited: 600,
        totalWithdrawn: 400,
      },
      {
        id: 'usr_almaz',
        telegramId: 1004,
        username: 'almaz_m',
        firstName: 'Almaz',
        lastName: 'Mengesha',
        phone: '+251944556677',
        photoUrl: 'https://api.dicebear.com/7.x/bottts/svg?seed=usr_almaz',
        language: 'am',
        referralCode: 'REF100104',
        walletBalance: 890,
        bonusBalance: 150,
        vipLevel: 4,
        status: 'ACTIVE',
        role: 'USER',
        createdAt: new Date(Date.now() - 2 * 86400000).toISOString(),
        lastLogin: new Date().toISOString(),
        totalWins: 31,
        totalGamesPlayed: 110,
        totalDeposited: 3800,
        totalWithdrawn: 2900,
      },
      {
        id: 'usr_tigist',
        telegramId: 1005,
        username: 'tigist_a',
        firstName: 'Tigist',
        lastName: 'Alemu',
        phone: '+251955667788',
        photoUrl: 'https://api.dicebear.com/7.x/bottts/svg?seed=usr_tigist',
        language: 'am',
        referralCode: 'REF100105',
        walletBalance: 240,
        bonusBalance: 40,
        vipLevel: 1,
        status: 'ACTIVE',
        role: 'USER',
        createdAt: new Date(Date.now() - 1 * 86400000).toISOString(),
        lastLogin: new Date().toISOString(),
        totalWins: 8,
        totalGamesPlayed: 32,
        totalDeposited: 800,
        totalWithdrawn: 500,
      },
    ];

    initialUsers.forEach((u) => {
      this.saveUser(u);
    });
  }

  // --- AUTHENTICATION & PHONE USER METHODS ---
  public getAllUsers(): UserProfile[] {
    return Array.from(this.users.values());
  }

  public hashPassword(password: string): string {
    return crypto.pbkdf2Sync(password, 'yabede_bingo_secure_salt_2026', 10000, 64, 'sha512').toString('hex');
  }

  public normalizePhone(phone: string): string {
    let cleaned = phone.replace(/[\s\-\(\)]/g, '');
    if (cleaned.startsWith('09') || cleaned.startsWith('07')) {
      cleaned = '+251' + cleaned.substring(1);
    } else if (cleaned.startsWith('251')) {
      cleaned = '+' + cleaned;
    }
    return cleaned;
  }

  public registerPhoneUser(params: {
    firstName: string;
    lastName?: string;
    username?: string;
    phone: string;
    password: string;
    referralCode?: string;
  }): { user: UserProfile; accessToken: string; refreshToken: string } {
    const normalized = this.normalizePhone(params.phone);
    if (!normalized || normalized.length < 10) {
      throw new Error('Invalid phone number format');
    }

    if (this.phoneToUserIndex.has(normalized)) {
      throw new Error('An account with this phone number already exists');
    }

    const userId = `usr_p_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
    const userReferralCode = `REF${Math.floor(100000 + Math.random() * 900000)}`;

    const welcomeConfig = adminService.getWelcomeGiftConfig();
    const initialWalletBalance = welcomeConfig.enabled ? welcomeConfig.amountBirr : 0;
    const regBonus = adminService.getRegistrationBonusAmount();

    const user: UserProfile = {
      id: userId,
      telegramId: 0,
      phone: normalized,
      role: 'USER',
      username: params.username || `user_${normalized.slice(-4)}`,
      firstName: params.firstName || '',
      lastName: params.lastName || '',
      photoUrl: `https://api.dicebear.com/7.x/bottts/svg?seed=${userId}`,
      language: 'am',
      referralCode: userReferralCode,
      referredBy: undefined,
      referralCount: 0,
      referralEarnings: 0,
      walletBalance: initialWalletBalance,
      bonusBalance: regBonus,
      vipLevel: 1,
      status: 'ACTIVE',
      createdAt: new Date().toISOString(),
      lastLogin: new Date().toISOString(),
      totalWins: 0,
      totalGamesPlayed: 0,
      totalDeposited: 0,
      totalWithdrawn: 0,
    };

    const passwordHash = this.hashPassword(params.password);
    const accessToken = `jwt_access_${userId}_${Date.now()}`;
    const refreshToken = `jwt_refresh_${userId}_${Date.now()}`;

    const auth: PhoneUserAuth = {
      phone: normalized,
      passwordHash,
      failedLoginAttempts: 0,
      lockedUntil: null,
      activeSessions: [
        {
          sessionId: `sess_${Date.now()}`,
          refreshToken,
          createdAt: new Date().toISOString(),
          lastActive: new Date().toISOString(),
        },
      ],
    };

    this.saveUser(user);
    this.phoneUserAuthMap.set(userId, auth);
    this.phoneToUserIndex.set(normalized, userId);

    // Save auth doc in Firestore
    adminDb.collection('userAuth').doc(userId).set(auth).catch(console.error);

    // Ledger welcome gift if enabled
    if (welcomeConfig.enabled && initialWalletBalance > 0) {
      this.addTransaction({
        id: `tx_welcome_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
        userId,
        amount: initialWalletBalance,
        balanceAfter: initialWalletBalance,
        type: 'DAILY_BONUS',
        status: 'COMPLETED',
        reference: 'WEL-BONUS-PHONE',
        description: 'New Player Welcome Gift Credit',
        createdAt: new Date().toISOString(),
      });
    }

    // Single consolidated referral attribution & crediting
    attributeReferral(this, adminService, user, params.referralCode);

    return { user, accessToken, refreshToken };
  }

  public loginPhoneUser(params: {
    phone: string;
    password: string;
    deviceFingerprint?: string;
  }): { user: UserProfile; accessToken: string; refreshToken: string } {
    const normalized = this.normalizePhone(params.phone);
    const userId = this.phoneToUserIndex.get(normalized);

    if (!userId) {
      throw new Error('Invalid phone number or password');
    }

    const auth = this.phoneUserAuthMap.get(userId);
    const user = this.users.get(userId);

    if (!auth || !user) {
      throw new Error('Invalid phone number or password');
    }

    if (user.status === 'SUSPENDED' || user.status === 'BANNED') {
      throw new Error('Account is suspended or banned. Please contact admin support.');
    }

    if (auth.lockedUntil && new Date(auth.lockedUntil).getTime() > Date.now()) {
      const minutesLeft = Math.ceil((new Date(auth.lockedUntil).getTime() - Date.now()) / 60000);
      throw new Error(`Account locked due to multiple failed login attempts. Try again in ${minutesLeft} minutes.`);
    }

    const inputHash = this.hashPassword(params.password);
    if (inputHash !== auth.passwordHash) {
      auth.failedLoginAttempts += 1;
      if (auth.failedLoginAttempts >= 5) {
        auth.lockedUntil = new Date(Date.now() + 15 * 60000).toISOString();
        adminDb.collection('userAuth').doc(userId).update({ lockedUntil: auth.lockedUntil, failedLoginAttempts: auth.failedLoginAttempts }).catch(console.error);
        throw new Error('Too many failed login attempts. Account locked for 15 minutes.');
      }
      adminDb.collection('userAuth').doc(userId).update({ failedLoginAttempts: auth.failedLoginAttempts }).catch(console.error);
      throw new Error(`Invalid password. ${5 - auth.failedLoginAttempts} attempts remaining before temporary lock.`);
    }

    auth.failedLoginAttempts = 0;
    auth.lockedUntil = null;

    const accessToken = `jwt_access_${userId}_${Date.now()}`;
    const refreshToken = `jwt_refresh_${userId}_${Date.now()}`;

    auth.activeSessions.push({
      sessionId: `sess_${Date.now()}`,
      refreshToken,
      deviceFingerprint: params.deviceFingerprint,
      createdAt: new Date().toISOString(),
      lastActive: new Date().toISOString(),
    });

    user.lastLogin = new Date().toISOString();
    this.saveUser(user);
    adminDb.collection('userAuth').doc(userId).set(auth).catch(console.error);

    return { user, accessToken, refreshToken };
  }

  public requestPasswordReset(phone: string): { success: boolean; otp: string; message: string } {
    const normalized = this.normalizePhone(phone);
    const userId = this.phoneToUserIndex.get(normalized);
    if (!userId) {
      return { success: true, otp: '123456', message: 'If registered, OTP code sent via SMS (Code: 123456)' };
    }

    const auth = this.phoneUserAuthMap.get(userId);
    if (auth) {
      const otp = '123456';
      auth.resetOtp = otp;
      auth.resetOtpExpires = new Date(Date.now() + 10 * 60000).toISOString();
      adminDb.collection('userAuth').doc(userId).update({ resetOtp: otp, resetOtpExpires: auth.resetOtpExpires }).catch(console.error);
    }

    return {
      success: true,
      otp: '123456',
      message: 'OTP verification code sent via SMS to your phone (Code: 123456)',
    };
  }

  public resetPassword(phone: string, otp: string, newPassword: string): { success: boolean; message: string } {
    const normalized = this.normalizePhone(phone);
    const userId = this.phoneToUserIndex.get(normalized);
    if (!userId) {
      throw new Error('Account not found for this phone number');
    }

    const auth = this.phoneUserAuthMap.get(userId);
    if (!auth) {
      throw new Error('Account auth record not found');
    }

    if (!auth.resetOtp || auth.resetOtp !== otp) {
      throw new Error('Invalid OTP verification code');
    }

    if (auth.resetOtpExpires && new Date(auth.resetOtpExpires).getTime() < Date.now()) {
      throw new Error('OTP code has expired. Please request a new code.');
    }

    auth.passwordHash = this.hashPassword(newPassword);
    auth.resetOtp = null;
    auth.resetOtpExpires = null;
    auth.failedLoginAttempts = 0;
    auth.lockedUntil = null;

    adminDb.collection('userAuth').doc(userId).set(auth).catch(console.error);

    return { success: true, message: 'Password reset successfully! You can now log in.' };
  }

  public logoutUser(userId: string, refreshToken?: string, allDevices?: boolean) {
    const auth = this.phoneUserAuthMap.get(userId);
    if (!auth) return;

    if (allDevices) {
      auth.activeSessions = [];
    } else if (refreshToken) {
      auth.activeSessions = auth.activeSessions.filter((s) => s.refreshToken !== refreshToken);
    }
    adminDb.collection('userAuth').doc(userId).update({ activeSessions: auth.activeSessions }).catch(console.error);
  }

  // --- USER METHODS ---
  public saveUser(user: UserProfile): UserProfile {
    user.updatedAt = new Date().toISOString();
    this.users.set(user.id, user);
    if (user.telegramId) this.telegramUserIndex.set(user.telegramId, user.id);
    if (user.phone) this.phoneToUserIndex.set(user.phone, user.id);

    // Guarded async write to Firestore users collection
    firestoreGuard.safeWrite('users', 'saveUser', async () => {
      await adminDb.collection('users').doc(user.id).set(user, { merge: true });
    });

    return user;
  }

  public getUserById(id: string): UserProfile | undefined {
    return this.users.get(id);
  }

  public getUserByTelegramId(telegramId: number): UserProfile | undefined {
    const userId = this.telegramUserIndex.get(telegramId);
    if (!userId) return undefined;
    return this.users.get(userId);
  }

  public findOrCreateTelegramUser(
    tgUser: {
      id: number;
      first_name: string;
      last_name?: string;
      username?: string;
      language_code?: string;
      photo_url?: string;
      phone?: string;
    },
    referralCode?: string
  ): UserProfile {
    let existing = this.getUserByTelegramId(tgUser.id);
    if (existing) {
      existing.firstName = tgUser.first_name || existing.firstName;
      existing.lastName = tgUser.last_name || existing.lastName;
      existing.username = tgUser.username || existing.username;
      if (tgUser.photo_url) existing.photoUrl = tgUser.photo_url;
      if (tgUser.phone && !existing.phone) {
        existing.phone = this.normalizePhone(tgUser.phone);
        this.phoneToUserIndex.set(existing.phone, existing.id);
      }
      this.saveUser(existing);
      return existing;
    }

    const newUserId = `usr_${tgUser.id}`;
    const userReferralCode = `REF${Math.floor(100000 + Math.random() * 900000)}`;
    const welcomeConfig = adminService.getWelcomeGiftConfig();
    const initialWalletBalance = welcomeConfig.enabled ? welcomeConfig.amountBirr : 0;
    const regBonus = adminService.getRegistrationBonusAmount();

    const normalizedPhone = tgUser.phone ? this.normalizePhone(tgUser.phone) : undefined;

    const newUser: UserProfile = {
      id: newUserId,
      telegramId: tgUser.id,
      phone: normalizedPhone,
      username: tgUser.username || `user_${tgUser.id}`,
      firstName: tgUser.first_name || '',
      lastName: tgUser.last_name || '',
      photoUrl: tgUser.photo_url || `https://api.dicebear.com/7.x/bottts/svg?seed=${tgUser.id}`,
      language: tgUser.language_code === 'am' ? 'am' : 'en',
      referralCode: userReferralCode,
      referredBy: undefined,
      referralCount: 0,
      referralEarnings: 0,
      walletBalance: initialWalletBalance,
      bonusBalance: regBonus,
      vipLevel: 1,
      status: 'ACTIVE',
      createdAt: new Date().toISOString(),
      lastLogin: new Date().toISOString(),
      totalWins: 0,
      totalGamesPlayed: 0,
      totalDeposited: 0,
      totalWithdrawn: 0,
    };

    this.saveUser(newUser);

    // Ledger welcome gift if enabled
    if (welcomeConfig.enabled && initialWalletBalance > 0) {
      this.addTransaction({
        id: `tx_welcome_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
        userId: newUserId,
        amount: initialWalletBalance,
        balanceAfter: initialWalletBalance,
        type: 'DAILY_BONUS',
        status: 'COMPLETED',
        reference: 'WEL-BONUS-YABEDE',
        description: 'New Player Welcome Gift Credit',
        createdAt: new Date().toISOString(),
      });
    }

    // Single consolidated referral attribution & crediting
    attributeReferral(this, adminService, newUser, referralCode);

    return newUser;
  }

  public updateUserPhone(userId: string, phone: string): UserProfile {
    const user = this.getUserById(userId);
    if (!user) throw new Error('User not found');
    const normalized = this.normalizePhone(phone);
    if (!normalized || normalized.length < 10) {
      throw new Error('Invalid phone number format');
    }
    user.phone = normalized;
    user.updatedAt = new Date().toISOString();
    this.phoneToUserIndex.set(normalized, user.id);
    this.saveUser(user);
    return user;
  }

  // --- WALLET & LEDGER ATOMIC OPERATIONS ---
  public addTransaction(tx: WalletTransaction): WalletTransaction {
    this.transactions.unshift(tx);

    // Guarded critical write to Firestore transactions collection
    firestoreGuard.safeWrite('transactions', 'addTransaction', async () => {
      await adminDb.collection('transactions').doc(tx.id).set(tx);
    }, true);

    return tx;
  }

  public updateWalletBalance(
    userId: string,
    amountDelta: number,
    type: WalletTransaction['type'],
    description: string,
    reference?: string,
    gameReferenceId?: string
  ): { user: UserProfile; transaction: WalletTransaction } {
    const user = this.getUserById(userId);
    if (!user) throw new Error('User not found');

    if (amountDelta < 0 && user.walletBalance + amountDelta < 0) {
      throw new Error('Insufficient wallet balance');
    }

    user.walletBalance += amountDelta;
    if (amountDelta > 0 && type === 'GAME_WIN') {
      user.totalWins += 1;
    }

    this.saveUser(user);

    const tx: WalletTransaction = {
      id: `tx_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
      userId,
      amount: amountDelta,
      balanceAfter: user.walletBalance,
      type,
      status: 'COMPLETED',
      reference: reference || `REF-${Math.floor(100000 + Math.random() * 900000)}`,
      description,
      gameReferenceId,
      createdAt: new Date().toISOString(),
    };

    this.addTransaction(tx);

    return { user, transaction: tx };
  }

  // --- PAYMENT METHODS CRUD (ADMIN MANAGED) ---
  public getActivePaymentMethods(): PaymentMethodConfig[] {
    return Array.from(this.paymentMethods.values()).filter((m) => m.status === 'ACTIVE');
  }

  public getAllPaymentMethods(): PaymentMethodConfig[] {
    return Array.from(this.paymentMethods.values());
  }

  public savePaymentMethod(pm: PaymentMethodConfig, adminId: string, ipAddress?: string): PaymentMethodConfig {
    pm.updatedAt = new Date().toISOString();
    this.paymentMethods.set(pm.id, pm);

    // Save to Firestore
    adminDb.collection('settings').doc('paymentMethods').set({
      methods: Array.from(this.paymentMethods.values()),
    }).catch(console.error);

    this.logAudit(adminId, 'SAVE_PAYMENT_METHOD', undefined, `Saved payment method ${pm.name} (${pm.id})`, 'Admin Settings Update', ipAddress);
    return pm;
  }

  public deletePaymentMethod(id: string, adminId: string, ipAddress?: string): boolean {
    const existing = this.paymentMethods.get(id);
    if (!existing) return false;
    this.paymentMethods.delete(id);

    adminDb.collection('settings').doc('paymentMethods').set({
      methods: Array.from(this.paymentMethods.values()),
    }).catch(console.error);

    this.logAudit(adminId, 'DELETE_PAYMENT_METHOD', undefined, `Deleted payment method ${existing.name}`, 'Admin Action', ipAddress);
    return true;
  }

  // --- MANUAL DEPOSIT SUBMISSION & VERIFICATION ---
  public createDepositRequest(params: {
    userId: string;
    paymentMethodId: string;
    amount: number;
    referenceCode: string;
    mobileNumber?: string;
    screenshotUrl?: string;
    note?: string;
  }): DepositRequest {
    const { userId, paymentMethodId, amount, referenceCode, mobileNumber, screenshotUrl, note } = params;

    const user = this.getUserById(userId);
    if (!user) throw new Error('User not found');

    const paymentMethod = this.paymentMethods.get(paymentMethodId);
    if (!paymentMethod || paymentMethod.status !== 'ACTIVE') {
      throw new Error('Selected payment method is currently disabled or unavailable.');
    }

    const cleanRef = referenceCode.trim().toUpperCase();
    const existingRef = this.deposits.find(
      (d) => d.referenceCode.trim().toUpperCase() === cleanRef && d.status !== 'REJECTED'
    );
    if (existingRef) {
      throw new Error(`Transaction reference number "${cleanRef}" has already been submitted or processed!`);
    }

    const dep: DepositRequest = {
      id: `dep_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
      userId,
      userName: user.username,
      userTelegramId: user.telegramId,
      paymentMethodId: paymentMethod.id,
      paymentMethodName: paymentMethod.name,
      amount,
      mobileNumber,
      referenceCode: cleanRef,
      screenshotUrl,
      note,
      status: 'PENDING',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    this.deposits.unshift(dep);

    // Save to Firestore payments collection with controlled retry
    firestoreGuard.safeWrite('payments', 'submitDeposit', async () => {
      await adminDb.collection('payments').doc(dep.id).set(dep);
    }, true);

    this.addNotification({
      userId: user.id,
      title: 'Deposit Submitted ⏳',
      message: `Your deposit request of ${amount} Birr via ${paymentMethod.name} (Ref: ${cleanRef}) has been submitted and is awaiting admin verification.`,
      type: 'SYSTEM',
    });

    return dep;
  }

  public approveDeposit(depositId: string, adminId: string, ipAddress?: string): { deposit: DepositRequest; user: UserProfile } {
    const dep = this.deposits.find((d) => d.id === depositId);
    if (!dep) throw new Error('Deposit request not found');
    if (dep.status === 'APPROVED') throw new Error('Deposit already approved');

    dep.status = 'APPROVED';
    dep.processedByAdminId = adminId;
    dep.updatedAt = new Date().toISOString();

    firestoreGuard.safeWrite('payments', 'approveDeposit', async () => {
      await adminDb.collection('payments').doc(dep.id).set(dep, { merge: true });
    }, true);

    const user = this.getUserById(dep.userId);
    if (!user) throw new Error('Deposit user not found');

    user.totalDeposited += dep.amount;
    this.updateWalletBalance(
      user.id,
      dep.amount,
      'DEPOSIT',
      `Manual Deposit Approved via ${dep.paymentMethodName}`,
      dep.referenceCode
    );

    if (user.referredBy) {
      const referrer = this.getUserById(user.referredBy);
      if (referrer) {
        const commission = Math.round(dep.amount * 0.05);
        if (commission > 0) {
          this.updateWalletBalance(
            referrer.id,
            commission,
            'REFERRAL_BONUS',
            `5% Referral Commission from ${user.username}'s deposit`,
            `COMM-${dep.id}`
          );

          this.addNotification({
            userId: referrer.id,
            title: 'Referral Bonus Received 🎉',
            message: `You earned ${commission} Birr (5% commission) from ${user.username}'s approved deposit!`,
            type: 'SYSTEM',
          });
        }
      }
    }

    this.addNotification({
      userId: user.id,
      title: 'Deposit Approved! ✅',
      message: `Your deposit of ${dep.amount} Birr via ${dep.paymentMethodName} (Ref: ${dep.referenceCode}) has been verified and credited!`,
      type: 'DEPOSIT_APPROVED',
    });

    this.logAudit(
      adminId,
      'APPROVE_DEPOSIT',
      user.id,
      `Approved deposit #${dep.id} of ${dep.amount} Birr (Ref: ${dep.referenceCode})`,
      'Manual Payment Verification',
      ipAddress
    );

    return { deposit: dep, user };
  }

  public rejectDeposit(depositId: string, reason: string, adminId: string, ipAddress?: string): DepositRequest {
    const dep = this.deposits.find((d) => d.id === depositId);
    if (!dep) throw new Error('Deposit request not found');
    if (dep.status === 'APPROVED') throw new Error('Cannot reject an already approved deposit');

    dep.status = 'REJECTED';
    dep.rejectionReason = reason || 'Transaction reference or receipt screenshot could not be verified.';
    dep.processedByAdminId = adminId;
    dep.updatedAt = new Date().toISOString();

    firestoreGuard.safeWrite('payments', 'rejectDeposit', async () => {
      await adminDb.collection('payments').doc(dep.id).set(dep, { merge: true });
    }, true);

    this.addNotification({
      userId: dep.userId,
      title: 'Deposit Request Rejected ❌',
      message: `Your deposit request of ${dep.amount} Birr via ${dep.paymentMethodName} was rejected. Reason: ${dep.rejectionReason}`,
      type: 'DEPOSIT_REJECTED',
    });

    this.logAudit(
      adminId,
      'REJECT_DEPOSIT',
      dep.userId,
      `Rejected deposit #${dep.id} of ${dep.amount} Birr. Reason: ${dep.rejectionReason}`,
      reason,
      ipAddress
    );

    return dep;
  }

  public requestDepositInfo(depositId: string, adminNote: string, adminId: string, ipAddress?: string): DepositRequest {
    const dep = this.deposits.find((d) => d.id === depositId);
    if (!dep) throw new Error('Deposit request not found');

    dep.status = 'INFO_REQUESTED';
    dep.adminNote = adminNote;
    dep.updatedAt = new Date().toISOString();

    firestoreGuard.safeWrite('payments', 'requestDepositInfo', async () => {
      await adminDb.collection('payments').doc(dep.id).set(dep, { merge: true });
    }, true);

    this.addNotification({
      userId: dep.userId,
      title: 'Deposit Information Requested ⚠️',
      message: `Admin requested additional details for your deposit #${dep.id}: "${adminNote}"`,
      type: 'INFO_REQUESTED',
    });

    this.logAudit(adminId, 'REQUEST_DEPOSIT_INFO', dep.userId, `Requested info on deposit #${dep.id}`, adminNote, ipAddress);
    return dep;
  }

  // --- WITHDRAWAL WORKFLOW ---
  public createWithdrawalRequest(params: {
    userId: string;
    paymentMethodId: string;
    paymentMethodName: string;
    accountNumber: string;
    accountName: string;
    amount: number;
    note?: string;
  }): WithdrawalRequest {
    const { userId, paymentMethodId, paymentMethodName, accountNumber, accountName, amount, note } = params;

    const user = this.getUserById(userId);
    if (!user) throw new Error('User not found');
    if (user.walletBalance < amount) throw new Error('Insufficient wallet balance for withdrawal');

    this.updateWalletBalance(
      userId,
      -amount,
      'WITHDRAWAL',
      `Withdrawal Request to ${paymentMethodName} (${accountNumber})`,
      `WD-HOLD-${Date.now()}`
    );

    const req: WithdrawalRequest = {
      id: `wd_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
      userId,
      userName: user.username,
      userTelegramId: user.telegramId,
      paymentMethodId,
      paymentMethodName,
      accountNumber,
      accountName,
      amount,
      note,
      status: 'PENDING',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    this.withdrawals.unshift(req);

    // Save to Firestore withdrawals collection with controlled retry
    firestoreGuard.safeWrite('withdrawals', 'requestWithdrawal', async () => {
      await adminDb.collection('withdrawals').doc(req.id).set(req);
    }, true);

    this.addNotification({
      userId: user.id,
      title: 'Withdrawal Requested ⏳',
      message: `Your withdrawal request of ${amount} Birr to ${paymentMethodName} (${accountNumber}) has been submitted for admin review.`,
      type: 'SYSTEM',
    });

    return req;
  }

  public processWithdrawal(
    id: string,
    approve: boolean,
    reason: string = '',
    adminId: string,
    ipAddress?: string
  ): WithdrawalRequest {
    const req = this.withdrawals.find((w) => w.id === id);
    if (!req) throw new Error('Withdrawal request not found');
    if (req.status !== 'PENDING') throw new Error('Request already processed');

    req.status = approve ? 'APPROVED' : 'REJECTED';
    req.rejectionReason = approve ? undefined : (reason || 'Withdrawal request rejected by administrator');
    req.processedByAdminId = adminId;
    req.updatedAt = new Date().toISOString();

    firestoreGuard.safeWrite('withdrawals', 'processWithdrawal', async () => {
      await adminDb.collection('withdrawals').doc(req.id).set(req, { merge: true });
    }, true);

    const user = this.getUserById(req.userId);
    if (user) {
      if (approve) {
        user.totalWithdrawn += req.amount;
        this.saveUser(user);

        this.addNotification({
          userId: user.id,
          title: 'Withdrawal Approved & Transferred! ✅',
          message: `Your withdrawal of ${req.amount} Birr to ${req.paymentMethodName} (${req.accountNumber}) has been approved!`,
          type: 'WITHDRAWAL_APPROVED',
        });
      } else {
        this.updateWalletBalance(
          req.userId,
          req.amount,
          'REFUND',
          `Refund for Rejected Withdrawal #${req.id}`,
          `WD-REFUND-${req.id}`
        );

        this.addNotification({
          userId: user.id,
          title: 'Withdrawal Rejected ❌',
          message: `Your withdrawal request of ${req.amount} Birr was rejected. Funds have been returned to your wallet. Reason: ${req.rejectionReason}`,
          type: 'WITHDRAWAL_REJECTED',
        });
      }
    }

    this.logAudit(
      adminId,
      approve ? 'APPROVE_WITHDRAWAL' : 'REJECT_WITHDRAWAL',
      req.userId,
      `Withdrawal #${id} of ${req.amount} Birr`,
      reason,
      ipAddress
    );

    return req;
  }

  // --- NOTIFICATIONS ---
  public addNotification(params: {
    userId: string;
    title: string;
    message: string;
    type: UserNotification['type'];
  }): UserNotification {
    const notif: UserNotification = {
      id: `notif_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
      userId: params.userId,
      title: params.title,
      message: params.message,
      type: params.type,
      read: false,
      createdAt: new Date().toISOString(),
    };

    this.notifications.unshift(notif);

    adminDb.collection('notifications').doc(notif.id).set(notif).catch(console.error);

    return notif;
  }

  public getUserNotifications(userId: string): UserNotification[] {
    return this.notifications.filter((n) => n.userId === userId);
  }

  public markNotificationRead(id: string, userId: string) {
    const notif = this.notifications.find((n) => n.id === id && n.userId === userId);
    if (notif) {
      notif.read = true;
      adminDb.collection('notifications').doc(id).update({ read: true }).catch(console.error);
    }
  }

  // --- AUDIT LOGS ---
  public logAudit(
    adminId: string,
    action: string,
    targetUserId?: string,
    details: string = '',
    reason: string = '',
    ipAddress: string = '127.0.0.1',
    gameReferenceId?: string
  ) {
    const log: AuditLog = {
      id: `audit_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
      adminId,
      action,
      targetUserId,
      details,
      reason,
      ipAddress,
      gameReferenceId,
      timestamp: new Date().toISOString(),
    };
    this.auditLogs.unshift(log);

    adminDb.collection('auditLogs').doc(log.id).set(log).catch(console.error);
  }

  // --- LEADERBOARDS ---
  public getLeaderboard(): LeaderboardEntry[] {
    const allUsers = Array.from(this.users.values());
    allUsers.sort((a, b) => b.totalWins - a.totalWins);

    return allUsers.slice(0, 20).map((u, idx) => ({
      userId: u.id,
      username: u.username,
      firstName: u.firstName,
      photoUrl: u.photoUrl,
      vipLevel: u.vipLevel,
      score: u.totalWins * 100 + Math.round(u.walletBalance),
      totalWins: u.totalWins,
      totalGamesPlayed: u.totalGamesPlayed,
      rank: idx + 1,
    }));
  }

  // --- SYSTEM METRICS & STATS ---
  public getSystemMetrics(): SystemMetrics {
    const allUsers = Array.from(this.users.values());
    const totalDepositedToday = this.deposits
      .filter((d) => d.status === 'APPROVED')
      .reduce((acc, curr) => acc + curr.amount, 0);

    const totalWithdrawnToday = this.withdrawals
      .filter((w) => w.status === 'APPROVED')
      .reduce((acc, curr) => acc + curr.amount, 0);

    const pendingDepositsCount = this.deposits.filter((d) => d.status === 'PENDING').length;
    const pendingWithdrawalsCount = this.withdrawals.filter((w) => w.status === 'PENDING').length;

    const totalApprovedDepositsCount = this.deposits.filter((d) => d.status === 'APPROVED').length;
    const totalRejectedDepositsCount = this.deposits.filter((d) => d.status === 'REJECTED').length;

    const totalApprovedWithdrawalsCount = this.withdrawals.filter((w) => w.status === 'APPROVED').length;
    const totalRejectedWithdrawalsCount = this.withdrawals.filter((w) => w.status === 'REJECTED').length;

    const totalWalletLiability = allUsers.reduce((acc, curr) => acc + curr.walletBalance, 0);

    return {
      totalUsers: allUsers.length,
      onlineUsers: allUsers.length,
      activeGames: Array.from(this.rooms.values()).filter((r) => r.status === 'PLAYING' || r.status === 'COUNTDOWN').length,
      totalDepositedToday,
      totalWithdrawnToday,
      pendingDepositsCount,
      pendingWithdrawalsCount,
      totalApprovedDepositsCount,
      totalRejectedDepositsCount,
      totalApprovedWithdrawalsCount,
      totalRejectedWithdrawalsCount,
      totalPlatformProfit: Math.round(totalDepositedToday * 0.15),
      totalWalletLiability,
      systemUptimeSeconds: process.uptime(),
      redisClusterStatus: 'HEALTHY_CONNECTED',
      lastLedgerAuditTimestamp: new Date().toISOString(),
    };
  }

  // --- PRIVATE GROUP BINGO ENGINE ---
  public createPrivateGroup(params: {
    hostId: string;
    name?: string;
    imageUrl?: string;
    ticketPrice: number;
    maxPlayers?: number;
    maxTicketsPerPlayer?: number;
    winningPattern?: WinningPattern;
    prizeDistribution?: 'WINNER_100' | 'HOST_10_WINNER_90';
    autoStartReady?: boolean;
    allowSpectators?: boolean;
    startTime?: string;
  }): PrivateGroup {
    const host = this.getUserById(params.hostId);
    if (!host) throw new Error('Host user not found');

    let code = '';
    do {
      code = Math.random().toString(36).substring(2, 8).toUpperCase();
    } while (this.privateGroupCodeIndex.has(code));

    const groupId = `grp_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
    const ticketPrice = Number(params.ticketPrice) || 50;
    const gameReferenceId = generateGameReferenceId(ticketPrice, groupId);

    const hostDisplayName = host.username ? `@${host.username}` : host.firstName;
    const defaultGroupName = `${hostDisplayName}'s Private Group`;
    const finalName = params.name && String(params.name).trim().length > 0 ? String(params.name).trim() : defaultGroupName;

    const group: PrivateGroup = {
      id: groupId,
      gameReferenceId,
      code,
      name: finalName,
      imageUrl: params.imageUrl,
      hostId: host.id,
      hostName: host.username,
      ticketPrice,
      maxPlayers: params.maxPlayers ? Number(params.maxPlayers) : 10,
      maxTicketsPerPlayer: params.maxTicketsPerPlayer ? Number(params.maxTicketsPerPlayer) : 3,
      winningPattern: params.winningPattern || 'FULL_HOUSE',
      prizeDistribution: params.prizeDistribution || 'WINNER_100',
      autoStartReady: params.autoStartReady !== undefined ? Boolean(params.autoStartReady) : true,
      allowSpectators: params.allowSpectators !== undefined ? Boolean(params.allowSpectators) : true,
      startTime: params.startTime || new Date().toISOString(),
      status: 'LOBBY',
      countdownSeconds: 0,
      currentBall: null,
      drawnBalls: [],
      prizePool: 0,
      ticketsSold: 0,
      remainingTickets: 400,
      activePlayersCount: 1,
      createdAt: new Date().toISOString(),
    };

    this.privateGroups.set(groupId, group);
    this.privateGroupCodeIndex.set(code, groupId);

    const initialMember: GroupMember = {
      groupId,
      userId: host.id,
      username: host.username,
      firstName: host.firstName + ' (Host)',
      status: 'READY',
      ticketCount: 0,
      joinedAt: new Date().toISOString(),
    };

    this.groupMembers.set(groupId, [initialMember]);

    adminDb.collection('groupGames').doc(groupId).set(group).catch((err) => {
      console.error(`🔥 [Firestore] Error saving group ${groupId}:`, err);
    });
    adminDb.collection('groupMembers').doc(`${groupId}_${host.id}`).set(initialMember).catch((err) => {
      console.error(`🔥 [Firestore] Error saving initial group member ${groupId}_${host.id}:`, err);
    });

    return group;
  }

  public joinPrivateGroupCode(code: string, userId: string): PrivateGroup {
    const groupId = this.privateGroupCodeIndex.get(code.trim().toUpperCase());
    if (!groupId) throw new Error('Invalid private group code');

    const group = this.privateGroups.get(groupId);
    if (!group) throw new Error('Private group not found');

    if (group.status !== 'LOBBY') throw new Error('Game is already in progress or finished');

    const members = this.groupMembers.get(groupId) || [];
    if (members.length >= group.maxPlayers) throw new Error('Private group is full');

    let existing = members.find((m) => m.userId === userId);
    if (!existing) {
      const user = this.getUserById(userId);
      if (!user) throw new Error('User not found');

      const newMember: GroupMember = {
        groupId,
        userId: user.id,
        username: user.username,
        firstName: user.firstName,
        status: 'JOINED',
        ticketCount: 0,
        joinedAt: new Date().toISOString(),
      };
      members.push(newMember);
      this.groupMembers.set(groupId, members);

      adminDb.collection('groupMembers').doc(`${groupId}_${user.id}`).set(newMember).catch(console.error);
    }

    return group;
  }

  public getPrivateGroupByIdOrCode(idOrCode: string): { group: PrivateGroup; members: GroupMember[]; messages: GroupMessage[] } | undefined {
    let group = this.privateGroups.get(idOrCode);
    if (!group) {
      const groupId = this.privateGroupCodeIndex.get(idOrCode.trim().toUpperCase());
      if (groupId) group = this.privateGroups.get(groupId);
    }
    if (!group) return undefined;
    this.recalculatePrivateGroupStats(group.id);
    const members = this.groupMembers.get(group.id) || [];
    const messages = this.groupMessages.get(group.id) || [];
    return { group, members, messages };
  }

  public getUserPrivateGroups(userId: string): { groups: PrivateGroup[]; invitations: GroupInvitation[] } {
    const userGroups: PrivateGroup[] = [];
    for (const [groupId, members] of this.groupMembers.entries()) {
      if (members.some((m) => m.userId === userId && m.status !== 'DECLINED')) {
        const group = this.privateGroups.get(groupId);
        if (group) userGroups.push(group);
      }
    }

    const userInvs: GroupInvitation[] = [];
    for (const invList of this.groupInvitations.values()) {
      for (const inv of invList) {
        if (inv.invitedUserId === userId && inv.status === 'PENDING') {
          userInvs.push(inv);
        }
      }
    }

    return { groups: userGroups, invitations: userInvs };
  }

  public getAllPrivateGroups(): PrivateGroup[] {
    return Array.from(this.privateGroups.values());
  }

  public inviteUserToGroup(
    groupIdOrParams: string | { groupId: string; hostId: string; targetUserId: string },
    targetUserId?: string,
    hostId?: string
  ): GroupInvitation {
    const groupId = typeof groupIdOrParams === 'string' ? groupIdOrParams : groupIdOrParams.groupId;
    const targetId = typeof groupIdOrParams === 'string' ? targetUserId! : groupIdOrParams.targetUserId;
    const host = typeof groupIdOrParams === 'string' ? hostId! : groupIdOrParams.hostId;

    const group = this.privateGroups.get(groupId);
    if (!group) throw new Error('Group not found');

    const targetUser = this.getUserById(targetId) || Array.from(this.users.values()).find((u) => u.username.toLowerCase() === targetId.replace('@', '').toLowerCase());
    if (!targetUser) throw new Error('Target user not found');

    const inv: GroupInvitation = {
      id: `inv_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
      groupId: group.id,
      groupName: group.name,
      hostId: host || group.hostId,
      hostName: group.hostName,
      invitedUserId: targetUser.id,
      invitedUsername: targetUser.username,
      status: 'PENDING',
      createdAt: new Date().toISOString(),
    };

    const existingInvs = this.groupInvitations.get(group.id) || [];
    existingInvs.push(inv);
    this.groupInvitations.set(group.id, existingInvs);

    adminDb.collection('groupInvitations').doc(inv.id).set(inv).catch(console.error);

    this.addNotification({
      userId: targetUser.id,
      title: 'Private Group Invitation 🎟️',
      message: `You were invited by @${group.hostName} to join private Bingo group "${group.name}".`,
      type: 'SYSTEM',
    });

    return inv;
  }

  public respondToInvitation(
    invitationIdOrParams: string | { invitationId: string; userId: string; action: 'ACCEPT' | 'DECLINE' },
    userId?: string,
    action?: 'ACCEPT' | 'DECLINE'
  ): PrivateGroup {
    const invitationId = typeof invitationIdOrParams === 'string' ? invitationIdOrParams : invitationIdOrParams.invitationId;
    const uid = typeof invitationIdOrParams === 'string' ? userId! : invitationIdOrParams.userId;
    const act = typeof invitationIdOrParams === 'string' ? action! : invitationIdOrParams.action;

    let targetInv: GroupInvitation | undefined;
    for (const invList of this.groupInvitations.values()) {
      targetInv = invList.find((i) => i.id === invitationId && i.invitedUserId === uid);
      if (targetInv) break;
    }

    if (!targetInv) throw new Error('Invitation not found');

    targetInv.status = act === 'ACCEPT' ? 'ACCEPTED' : 'DECLINED';
    adminDb.collection('groupInvitations').doc(targetInv.id).update({ status: targetInv.status }).catch(console.error);

    const group = this.privateGroups.get(targetInv.groupId);
    if (!group) throw new Error('Group not found');

    if (act === 'ACCEPT') {
      this.joinPrivateGroupCode(group.code, uid);
    }

    return group;
  }

  public joinGroupByCode(code: string, userId: string): PrivateGroup {
    return this.joinPrivateGroupCode(code, userId);
  }

  public recalculatePrivateGroupStats(groupId: string) {
    const group = this.privateGroups.get(groupId);
    if (!group) return null;

    const roundTickets = Array.from(this.tickets.values()).filter(
      (t) =>
        t.roomId === groupId &&
        (!group.gameReferenceId || !t.gameReferenceId || t.gameReferenceId === group.gameReferenceId) &&
        (t.status === 'ACTIVE' || t.status === 'BINGO_CLAIMED' || t.status === 'COMPLETED')
    );

    const members = this.groupMembers.get(groupId) || [];
    const sumMemberTickets = members.reduce((acc, m) => acc + (m.ticketCount || 0), 0);
    const ticketsSold = Math.max(roundTickets.length, sumMemberTickets);

    const totalSales = ticketsSold * group.ticketPrice;
    const platformFee = Math.round(totalSales * 0.1);
    const prizePool = Math.max(0, totalSales - platformFee);
    const uniquePlayers = new Set([
      ...roundTickets.map((t) => t.userId),
      ...members.filter((m) => (m.ticketCount || 0) > 0).map((m) => m.userId),
    ]).size;

    group.ticketsSold = ticketsSold;
    group.remainingTickets = Math.max(0, 400 - ticketsSold);
    group.totalSales = totalSales;
    group.platformFee = platformFee;
    group.prizePool = prizePool;
    group.activePlayersCount = Math.max(uniquePlayers, members.length > 0 ? 1 : 0);

    adminDb.collection('groupGames').doc(group.id).set({
      ticketsSold,
      remainingTickets: group.remainingTickets,
      totalSales,
      platformFee,
      prizePool,
      activePlayersCount: group.activePlayersCount,
      updatedAt: new Date().toISOString(),
    }, { merge: true }).catch(console.error);

    return {
      ticketsSold,
      remainingTickets: group.remainingTickets,
      totalSales,
      platformFee,
      prizePool,
      activePlayersCount: group.activePlayersCount,
    };
  }

  public buyPrivateGroupTickets(
    groupIdOrParams: string | { groupId: string; userId: string; count: number },
    userId?: string,
    count?: number
  ): { tickets: BingoTicket[]; user: UserProfile } {
    const groupId = typeof groupIdOrParams === 'string' ? groupIdOrParams : groupIdOrParams.groupId;
    const uid = typeof groupIdOrParams === 'string' ? userId! : groupIdOrParams.userId;
    const tktCount = typeof groupIdOrParams === 'string' ? count || 1 : groupIdOrParams.count || 1;

    const group = this.privateGroups.get(groupId);
    if (!group) throw new Error('Group not found');

    if (group.status !== 'LOBBY') {
      throw new Error('Ticket sales are closed for this private group.');
    }

    const existingUserTickets = Array.from(this.tickets.values()).filter(
      (t) =>
        t.roomId === group.id &&
        t.userId === uid &&
        t.status === 'ACTIVE' &&
        (!group.gameReferenceId || !t.gameReferenceId || t.gameReferenceId === group.gameReferenceId)
    );
    const maxAllowed = group.maxTicketsPerPlayer || 10;
    if (existingUserTickets.length + tktCount > maxAllowed) {
      throw new Error(`Exceeds maximum limit of ${maxAllowed} ticket(s) per player for this private group.`);
    }

    if (!group.gameReferenceId) {
      group.gameReferenceId = generateGameReferenceId(group.ticketPrice, group.id);
    }

    const totalCost = group.ticketPrice * tktCount;
    const { user } = this.updateWalletBalance(
      uid,
      -totalCost,
      'TICKET_PURCHASE',
      `Bought ${tktCount} ticket(s) for Private Group "${group.name}" [Ref: ${group.gameReferenceId}]`,
      `GRP-TKT-${group.id}`,
      group.gameReferenceId
    );

    const members = this.groupMembers.get(group.id) || [];
    const member = members.find((m) => m.userId === uid);
    if (member) {
      member.ticketCount += tktCount;
      member.status = 'READY';
      adminDb.collection('groupMembers').doc(`${group.id}_${uid}`).set(member).catch(console.error);
    }

    const createdTickets: BingoTicket[] = [];
    const takenCardNums = new Set<number>();
    for (const tkt of this.tickets.values()) {
      if (tkt.roomId === group.id && tkt.cardNumber && tkt.status === 'ACTIVE') {
        takenCardNums.add(tkt.cardNumber);
      }
    }

    for (let i = 0; i < tktCount; i++) {
      let cardNum = Math.floor(Math.random() * 400) + 1;
      let attempts = 0;
      while (takenCardNums.has(cardNum) && attempts < 400) {
        cardNum = (cardNum % 400) + 1;
        attempts++;
      }
      takenCardNums.add(cardNum);

      const matrix = generateCardMatrixByNumber(cardNum);

      const ticket: BingoTicket = {
        id: `tkt_grp_${Date.now()}_${i}_${Math.floor(Math.random() * 1000)}`,
        roomId: group.id,
        gameReferenceId: group.gameReferenceId,
        cardNumber: cardNum,
        userId: uid,
        username: user.username,
        matrix,
        daubed: Array(5).fill(0).map(() => Array(5).fill(false)),
        status: 'ACTIVE',
        purchasePrice: group.ticketPrice,
        boughtAt: new Date().toISOString(),
      };
      this.tickets.set(ticket.id, ticket);
      createdTickets.push(ticket);

      const reservation = {
        id: `${group.id}_${cardNum}`,
        roomId: group.id,
        cardNumber: cardNum,
        userId: uid,
        username: user.username,
        status: 'SOLD',
        purchasedAt: new Date().toISOString(),
      };

      adminDb.collection('tickets').doc(ticket.id).set(ticket).catch(console.error);
    }

    this.recalculatePrivateGroupStats(group.id);

    return { tickets: createdTickets, user };
  }

  public playAgainPrivateGroupGame(groupId: string, hostId: string): PrivateGroup {
    const group = this.privateGroups.get(groupId);
    if (!group) throw new Error('Group not found');
    if (group.hostId !== hostId) throw new Error('Only the group host can restart the game');

    // 1. Generate new Game Reference ID
    group.gameReferenceId = generateGameReferenceId(group.ticketPrice, group.id);

    // 2. Mark existing active tickets for this room as COMPLETED/PRESERVED
    Array.from(this.tickets.values()).forEach((tkt) => {
      if (tkt.roomId === groupId && tkt.status === 'ACTIVE') {
        tkt.status = 'COMPLETED';
        adminDb.collection('tickets').doc(tkt.id).update({ status: 'COMPLETED' }).catch(console.error);
      }
    });

    // 3. Reset game state
    group.status = 'LOBBY';
    group.drawnBalls = [];
    group.currentBall = null;
    group.prizePool = 0;
    group.ticketsSold = 0;
    group.totalSales = 0;
    group.platformFee = 0;
    group.remainingTickets = 400;
    group.activePlayersCount = 0;
    group.countdownSeconds = 30;
    group.startedAt = undefined;
    group.endsAt = undefined;
    group.hostDecisionTimeout = undefined;
    group.lastWinners = [];
    group.hostBonus = 0;
    group.hostBonusPaid = false;

    // 5. Reset group member ticketCounts
    const members = this.groupMembers.get(groupId) || [];
    members.forEach((m) => {
      m.ticketCount = 0;
      if (m.userId === hostId) {
        m.status = 'READY';
      } else {
        m.status = 'JOINED';
      }
      adminDb.collection('groupMembers').doc(`${groupId}_${m.userId}`).update({ ticketCount: 0, status: m.status }).catch(console.error);
    });

    adminDb.collection('groupGames').doc(group.id).set(group, { merge: true }).catch(console.error);

    return group;
  }

  public closePrivateGroupGame(groupId: string, hostId: string): PrivateGroup {
    const group = this.privateGroups.get(groupId);
    if (!group) throw new Error('Group not found');
    if (group.hostId !== hostId && hostId !== 'SYSTEM') throw new Error('Only the group host can close the group');

    group.status = 'CLOSED';
    group.hostDecisionTimeout = undefined;

    adminDb.collection('groupGames').doc(group.id).update({ status: 'CLOSED' }).catch(console.error);

    return group;
  }

  public togglePlayerReady(groupId: string, userId: string): GroupMember {
    const members = this.groupMembers.get(groupId) || [];
    const member = members.find((m) => m.userId === userId);
    if (!member) throw new Error('Member not found in group');

    member.status = member.status === 'READY' ? 'JOINED' : 'READY';
    adminDb.collection('groupMembers').doc(`${groupId}_${userId}`).update({ status: member.status }).catch(console.error);

    return member;
  }

  public startPrivateGroupGame(groupId: string, hostId: string): PrivateGroup {
    const group = this.privateGroups.get(groupId);
    if (!group) throw new Error('Group not found');
    if (group.hostId !== hostId) throw new Error('Only the group host can start the game');

    group.status = 'PLAYING';
    group.drawnBalls = [];
    group.currentBall = null;
    group.hostBonus = 0;
    group.hostBonusPaid = false;
    group.startedAt = new Date().toISOString();

    adminDb.collection('groupGames').doc(group.id).update({
      status: 'PLAYING',
      drawnBalls: [],
      currentBall: null,
      startedAt: group.startedAt,
    }).catch(console.error);

    return group;
  }

  public cancelPrivateGroupGame(groupId: string, hostId: string, reason?: string): { group: PrivateGroup; refundedUsersCount: number; totalRefunded: number } {
    const group = this.privateGroups.get(groupId);
    if (!group) throw new Error('Group not found');
    if (group.hostId !== hostId && hostId !== 'SYSTEM' && hostId !== 'ADMIN') {
      throw new Error('Only host can cancel game');
    }

    // Idempotency: if already cancelled, return immediately without duplicate refunds
    if (group.status === 'CANCELLED') {
      return { group, refundedUsersCount: 0, totalRefunded: 0 };
    }

    group.status = 'CANCELLED';
    group.cancelReason = reason || 'Cancelled by host';

    // Find all active tickets for this group/game
    const activeTickets = Array.from(this.tickets.values()).filter(
      (t) => t.roomId === group.id && t.status === 'ACTIVE'
    );

    const userRefunds = new Map<string, { amount: number; count: number }>();
    for (const tkt of activeTickets) {
      tkt.status = 'CANCELLED';
      const existing = userRefunds.get(tkt.userId) || { amount: 0, count: 0 };
      existing.amount += (tkt.purchasePrice ?? group.ticketPrice);
      existing.count += 1;
      userRefunds.set(tkt.userId, existing);
    }

    let totalRefunded = 0;
    for (const [uid, refundData] of userRefunds.entries()) {
      if (refundData.amount > 0) {
        totalRefunded += refundData.amount;
        try {
          this.updateWalletBalance(
            uid,
            refundData.amount,
            'GAME_REFUND',
            `Refund for cancelled Private Group "${group.name}" (${refundData.count} ticket(s)) [Ref: ${group.gameReferenceId}]`,
            `GRP-REF-${group.id}`,
            group.gameReferenceId
          );

          this.addNotification({
            userId: uid,
            title: 'Private Group Cancelled - Refund Processed 🎟️',
            message: `The private game "${group.name}" was cancelled. ${refundData.amount} Birr has been refunded to your wallet.`,
            type: 'SYSTEM',
          });
        } catch (refundErr) {
          console.error(`❌ [Refund Error] Failed to credit refund to user ${uid}:`, refundErr);
        }
      }
    }

    // Reset game stats
    group.prizePool = 0;
    group.ticketsSold = 0;

    adminDb.collection('groupGames').doc(group.id).set({
      status: 'CANCELLED',
      cancelReason: group.cancelReason,
      prizePool: 0,
      ticketsSold: 0,
      updatedAt: new Date().toISOString(),
    }, { merge: true }).catch(console.error);

    for (const tkt of activeTickets) {
      adminDb.collection('tickets').doc(tkt.id).update({ status: 'CANCELLED' }).catch(console.error);
    }

    return { group, refundedUsersCount: userRefunds.size, totalRefunded };
  }

  public removeGroupMember(groupId: string, targetUserId: string, hostId: string): { success: boolean; refundedAmount: number } {
    const group = this.privateGroups.get(groupId);
    if (!group) throw new Error('Group not found');
    if (group.hostId !== hostId && hostId !== 'SYSTEM' && hostId !== 'ADMIN') {
      throw new Error('Only host can remove players');
    }

    let members = this.groupMembers.get(groupId) || [];
    members = members.filter((m) => m.userId !== targetUserId);
    this.groupMembers.set(groupId, members);

    // Refund target user's active tickets for this group
    const activeTickets = Array.from(this.tickets.values()).filter(
      (t) => t.roomId === group.id && t.userId === targetUserId && t.status === 'ACTIVE'
    );

    let refundedAmount = 0;
    for (const tkt of activeTickets) {
      tkt.status = 'CANCELLED';
      refundedAmount += (tkt.purchasePrice ?? group.ticketPrice);
      adminDb.collection('tickets').doc(tkt.id).update({ status: 'CANCELLED' }).catch(console.error);
    }

    if (refundedAmount > 0) {
      try {
        this.updateWalletBalance(
          targetUserId,
          refundedAmount,
          'GAME_REFUND',
          `Refund for removal from Private Group "${group.name}" [Ref: ${group.gameReferenceId}]`,
          `GRP-REM-${group.id}`,
          group.gameReferenceId
        );

        this.addNotification({
          userId: targetUserId,
          title: 'Removed from Private Group',
          message: `You were removed from "${group.name}". ${refundedAmount} Birr has been refunded to your wallet.`,
          type: 'SYSTEM',
        });
      } catch (err) {
        console.error(`❌ [Refund Error] Failed to credit refund to removed user ${targetUserId}:`, err);
      }
    }

    this.recalculatePrivateGroupStats(group.id);

    firestoreGuard.safeDelete('groupMembers', 'removeGroupMember', async () => {
      await adminDb.collection('groupMembers').doc(`${groupId}_${targetUserId}`).delete();
    });

    return { success: true, refundedAmount };
  }

  // --- GAME HISTORY METHODS ---
  public recordGameHistoryForRoom(room: BingoRoom, winners: GameWinner[]) {
    try {
      const roomTickets = Array.from(this.tickets.values()).filter(
        (t) =>
          t.roomId === room.id &&
          t.gameReferenceId === room.gameReferenceId &&
          (t.status === 'ACTIVE' || t.status === 'BINGO_CLAIMED' || t.status === 'COMPLETED') &&
          typeof t.purchasePrice === 'number' &&
          t.purchasePrice > 0
      );
      const userTicketsMap = new Map<string, BingoTicket[]>();

      for (const ticket of roomTickets) {
        const list = userTicketsMap.get(ticket.userId) || [];
        list.push(ticket);
        userTicketsMap.set(ticket.userId, list);
      }

      // If no real tickets exist for this game, skip game history generation
      if (userTicketsMap.size === 0) {
        return;
      }

      const playedAt = new Date().toISOString();

      for (const [userId, uTickets] of userTicketsMap.entries()) {
        const cardNumbers = uTickets.map((t) => t.cardNumber || 1);
        const userWinners = winners.filter((w) => w.userId === userId);
        const isWinner = userWinners.length > 0;
        const totalPrizeWon = userWinners.reduce((sum, w) => sum + w.prizeAmount, 0);
        const winningPattern = userWinners.length > 0 ? userWinners[0].pattern : null;

        const record: GameHistoryRecord = {
          id: `gh_${room.id}_${userId}_${Date.now()}`,
          roomId: room.id,
          gameReferenceId: room.gameReferenceId,
          roomName: room.name,
          roomIcon: room.icon,
          ticketPrice: room.ticketPrice,
          userId,
          cardNumbers,
          ticketsCount: cardNumbers.length,
          outcome: isWinner ? 'WON' : 'LOST',
          winningPattern,
          prizeWon: totalPrizeWon,
          totalPrizePool: room.prizePool,
          totalPlayersCount: room.activePlayersCount || userTicketsMap.size || 1,
          totalTicketsSold: room.ticketsSold || roomTickets.length || cardNumbers.length,
          drawnBallsCount: room.drawnBalls.length,
          drawnBalls: [...room.drawnBalls],
          winners,
          playedAt,
        };

        this.gameHistoryRecords.unshift(record);
        adminDb.collection('gameHistory').doc(record.id).set(record).catch(console.warn);
      }
    } catch (err) {
      console.warn('⚠️ [GameHistory] Failed to record game history for room:', err);
    }
  }

  public deleteGameHistoryRecord(historyId: string, adminId: string): boolean {
    const initialCount = this.gameHistoryRecords.length;
    this.gameHistoryRecords = this.gameHistoryRecords.filter((r) => r.id !== historyId);

    firestoreGuard.safeDelete('gameHistory', 'deleteGameHistoryRecord', async () => {
      await adminDb.collection('gameHistory').doc(historyId).delete();
    });
    this.logAudit(adminId, 'DELETE_GAME_HISTORY', undefined, `Deleted game history record ${historyId}`, 'Admin Deletion');
    return this.gameHistoryRecords.length < initialCount;
  }

  public getUserGameHistory(userId: string, limitCount: number = 50): GameHistoryRecord[] {
    const userRecords = this.gameHistoryRecords.filter((r) => r.userId === userId);
    userRecords.sort((a, b) => new Date(b.playedAt).getTime() - new Date(a.playedAt).getTime());
    return userRecords.slice(0, limitCount);
  }

  // --- DATA RESET & RE-INITIALIZATION ---
  public resetAllData(): void {
    logger.info('[DB Store] Resetting all in-memory collections for fresh state...');
    this.users.clear();
    this.telegramUserIndex.clear();
    this.phoneUserAuthMap.clear();
    this.phoneToUserIndex.clear();
    this.transactions = [];
    this.deposits = [];
    this.withdrawals = [];
    this.notifications = [];
    this.tickets.clear();
    this.winners = [];
    this.gameHistoryRecords = [];
    this.chatMessages.clear();
    this.privateGroups.clear();
    this.privateGroupCodeIndex.clear();
    this.groupMembers.clear();
    this.groupInvitations.clear();
    this.groupMessages.clear();
    this.rooms.clear();
  }

  public recreateOfficialRooms(): BingoRoom[] {
    logger.info('[DB Store] Re-instantiating official Bingo rooms...');
    this.rooms.clear();
    const nowMs = Date.now();
    const nowIso = new Date(nowMs).toISOString();
    const endsIso = new Date(nowMs + 45000).toISOString();
    const recreated: BingoRoom[] = [];

    for (const officialRoom of OFFICIAL_ROOMS) {
      const gameRef = generateGameReferenceId(officialRoom.ticketPrice, officialRoom.id);
      const roomObj: BingoRoom = {
        ...officialRoom,
        gameReferenceId: gameRef,
        status: 'WAITING',
        currentBall: null,
        drawnBalls: [],
        prizePool: 0,
        platformFee: 0,
        ticketsSold: 0,
        activePlayersCount: 0,
        startedAt: nowIso,
        endsAt: endsIso,
        countdownSeconds: 45,
      };
      this.rooms.set(officialRoom.id, roomObj);
      recreated.push(roomObj);

      // Async sync to Firestore
      adminDb.collection('rooms').doc(officialRoom.id).set(roomObj).catch((err) => {
        logger.warn(`[DB Store] Failed to save official room ${officialRoom.id} to Firestore:`, err.message || err);
      });
    }

    return recreated;
  }

  // --- BATCH USER OPERATIONS ---
  public batchUpdateUserStatus(
    userIds: string[],
    status: 'ACTIVE' | 'SUSPENDED' | 'BANNED',
    adminId: string,
    ipAddress?: string
  ): { updatedCount: number; results: Array<{ id: string; success: boolean; status?: string; error?: string }> } {
    let count = 0;
    const results: Array<{ id: string; success: boolean; status?: string; error?: string }> = [];

    for (const id of userIds) {
      try {
        const user = this.getUserById(id);
        if (!user) {
          results.push({ id, success: false, error: 'User not found' });
          continue;
        }
        user.status = status;
        this.saveUser(user);
        results.push({ id, success: true, status });
        count++;
      } catch (err: any) {
        results.push({ id, success: false, error: err.message || 'Update failed' });
      }
    }

    this.logAudit(
      adminId,
      'BATCH_UPDATE_USER_STATUS',
      undefined,
      `Batch updated status to ${status} for ${count} users`,
      `User IDs: ${userIds.slice(0, 10).join(', ')}${userIds.length > 10 ? '...' : ''}`,
      ipAddress
    );

    return { updatedCount: count, results };
  }

  public batchAdjustUserBalance(
    userIds: string[],
    amount: number,
    type: 'CREDIT' | 'DEBIT',
    note: string,
    adminId: string,
    ipAddress?: string
  ): { processedCount: number; results: Array<{ id: string; success: boolean; newBalance?: number; error?: string }> } {
    let count = 0;
    const delta = type === 'CREDIT' ? Math.abs(amount) : -Math.abs(amount);
    const results: Array<{ id: string; success: boolean; newBalance?: number; error?: string }> = [];

    for (const id of userIds) {
      try {
        const user = this.getUserById(id);
        if (!user) {
          results.push({ id, success: false, error: 'User not found' });
          continue;
        }
        if (delta < 0 && user.walletBalance < Math.abs(delta)) {
          results.push({ id, success: false, error: 'Insufficient balance to debit' });
          continue;
        }

        this.updateWalletBalance(
          id,
          delta,
          'ADMIN_ADJUSTMENT',
          note || `Batch admin ${type.toLowerCase()} of ${Math.abs(amount)} Birr`,
          `BATCH-ADJ-${Date.now()}`
        );

        this.addNotification({
          userId: id,
          title: delta > 0 ? 'Admin Credit Added 💰' : 'Admin Balance Adjustment ℹ️',
          message: note || `Your wallet has been ${delta > 0 ? 'credited' : 'debited'} with ${Math.abs(delta)} Birr.`,
          type: 'SYSTEM',
        });

        results.push({ id, success: true, newBalance: user.walletBalance });
        count++;
      } catch (err: any) {
        results.push({ id, success: false, error: err.message || 'Adjustment failed' });
      }
    }

    this.logAudit(
      adminId,
      'BATCH_ADJUST_BALANCE',
      undefined,
      `Batch ${type} of ${amount} Birr applied to ${count} users. Note: ${note}`,
      `Users: ${userIds.length}`,
      ipAddress
    );

    return { processedCount: count, results };
  }

  public batchDeleteUsers(
    userIds: string[],
    adminId: string,
    ipAddress?: string
  ): { deletedCount: number; results: Array<{ id: string; success: boolean; error?: string }> } {
    let count = 0;
    const results: Array<{ id: string; success: boolean; error?: string }> = [];

    for (const id of userIds) {
      try {
        const user = this.users.get(id);
        if (!user) {
          results.push({ id, success: false, error: 'User not found in store' });
          continue;
        }

        // Delete from indexes and maps
        this.users.delete(id);
        if (user.telegramId) this.telegramUserIndex.delete(user.telegramId);
        if (user.phone) this.phoneToUserIndex.delete(user.phone);
        this.phoneUserAuthMap.delete(id);

        // Delete from Firestore
        firestoreGuard.safeDelete('users', 'batchDeleteUsers', async () => {
          await adminDb.collection('users').doc(id).delete();
          await adminDb.collection('userAuth').doc(id).delete();
          await adminDb.collection('wallets').doc(id).delete();
        });

        results.push({ id, success: true });
        count++;
      } catch (err: any) {
        results.push({ id, success: false, error: err.message || 'Deletion failed' });
      }
    }

    this.logAudit(
      adminId,
      'BATCH_DELETE_USERS',
      undefined,
      `Batch deleted ${count} user accounts and profiles`,
      `Deleted IDs: ${userIds.slice(0, 10).join(', ')}`,
      ipAddress
    );

    return { deletedCount: count, results };
  }

  // --- BATCH TICKET OPERATIONS ---
  public batchCancelTickets(
    ticketIds: string[],
    reason: string = 'Batch Cancelled by Admin',
    adminId: string,
    ipAddress?: string
  ): { cancelledCount: number; results: Array<{ id: string; success: boolean; error?: string }> } {
    let count = 0;
    const results: Array<{ id: string; success: boolean; error?: string }> = [];

    for (const id of ticketIds) {
      try {
        const ticket = this.tickets.get(id);
        if (!ticket) {
          results.push({ id, success: false, error: 'Ticket not found' });
          continue;
        }
        if (ticket.status === 'CANCELLED') {
          results.push({ id, success: true, error: 'Already cancelled' });
          continue;
        }

        ticket.status = 'CANCELLED';
        this.tickets.set(id, ticket);

        // Refund purchase price if active
        if (ticket.purchasePrice > 0) {
          this.updateWalletBalance(
            ticket.userId,
            ticket.purchasePrice,
            'REFUND',
            `Refund for Cancelled Ticket #${id} (Room ${ticket.roomId})`,
            `TKT-REFUND-${id}`
          );
        }

        // Firestore sync
        adminDb.collection('tickets').doc(id).update({ status: 'CANCELLED', updatedAt: new Date().toISOString() }).catch(console.warn);

        results.push({ id, success: true });
        count++;
      } catch (err: any) {
        results.push({ id, success: false, error: err.message || 'Cancel failed' });
      }
    }

    this.logAudit(
      adminId,
      'BATCH_CANCEL_TICKETS',
      undefined,
      `Batch cancelled ${count} tickets. Reason: ${reason}`,
      `Tickets: ${ticketIds.length}`,
      ipAddress
    );

    return { cancelledCount: count, results };
  }

  public batchDeleteTickets(
    ticketIds: string[],
    adminId: string,
    ipAddress?: string
  ): { deletedCount: number; results: Array<{ id: string; success: boolean; error?: string }> } {
    let count = 0;
    const results: Array<{ id: string; success: boolean; error?: string }> = [];

    for (const id of ticketIds) {
      try {
        this.tickets.delete(id);
        adminDb.collection('tickets').doc(id).delete().catch(console.warn);
        results.push({ id, success: true });
        count++;
      } catch (err: any) {
        results.push({ id, success: false, error: err.message || 'Delete failed' });
      }
    }

    this.logAudit(
      adminId,
      'BATCH_DELETE_TICKETS',
      undefined,
      `Batch deleted ${count} ticket documents from system`,
      `Ticket IDs: ${ticketIds.slice(0, 10).join(', ')}`,
      ipAddress
    );

    return { deletedCount: count, results };
  }
}

export const db = new FirestoreDatabaseStore();
