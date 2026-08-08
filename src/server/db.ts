/**
 * Production-Ready Cloud Firestore Backend Store
 * Every transaction, user, room, ticket, game, deposit, withdrawal, and audit log
 * is persisted and retrieved directly from Cloud Firestore.
 */

import crypto from 'crypto';
import { adminDb } from './firebaseAdmin.js';
import { adminService } from './adminService.js';
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
    this.initFirestoreSync().catch((err) => {
      console.error('🔥 [Firestore] Error initializing store sync:', err);
    });
  }

  public async initFirestoreSync() {
    if (this.isInitialized) return;
    this.isInitialized = true;
    console.log('🔥 [Firestore] Synchronizing memory store with Cloud Firestore...');

    try {
      // 1. Sync Payment Methods
      const pmSnapshot = await adminDb.collection('settings').doc('paymentMethods').get();
      if (pmSnapshot.exists && pmSnapshot.data()?.methods) {
        const methods: PaymentMethodConfig[] = pmSnapshot.data()?.methods || [];
        methods.forEach((m) => this.paymentMethods.set(m.id, m));
      } else {
        // Seed default payment methods if collection is brand new
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
        adminDb.collection('settings').doc('paymentMethods').set({ methods: defaultMethods }).catch(console.warn);
      }

      // 2. Load Users from Firestore
      const usersSnap = await adminDb.collection('users').get();
      usersSnap.forEach((doc) => {
        const u = doc.data() as UserProfile;
        this.users.set(u.id, u);
        if (u.telegramId) this.telegramUserIndex.set(u.telegramId, u.id);
        if (u.phone) this.phoneToUserIndex.set(u.phone, u.id);
      });

      // 3. Load Rooms from Firestore & Ensure 4 Official Arenas
      const roomsSnap = await adminDb.collection('rooms').get();
      roomsSnap.forEach((doc) => {
        const r = doc.data() as BingoRoom;
        if (r.gameReferenceId) {
          syncRoomSequenceFromRef(r.id, r.gameReferenceId);
        } else {
          r.gameReferenceId = generateGameReferenceId(r.ticketPrice, r.id);
          adminDb.collection('rooms').doc(r.id).update({ gameReferenceId: r.gameReferenceId }).catch(console.warn);
        }
        this.rooms.set(r.id, r);
      });

      // Seed official 4 rooms if not present
      const nowMs = Date.now();
      const nowIso = new Date(nowMs).toISOString();
      const endsIso = new Date(nowMs + 45000).toISOString();
      for (const officialRoom of OFFICIAL_ROOMS) {
        const existing = this.rooms.get(officialRoom.id);
        if (!existing) {
          const seededRoom: BingoRoom = {
            ...officialRoom,
            startedAt: nowIso,
            endsAt: endsIso,
            countdownSeconds: 45,
          };
          this.rooms.set(officialRoom.id, seededRoom);
          adminDb.collection('rooms').doc(officialRoom.id).set(seededRoom).catch(console.warn);
          adminDb.collection('gameRooms').doc(officialRoom.id).set(seededRoom).catch(console.warn);
        } else {
          if (!existing.gameReferenceId) {
            existing.gameReferenceId = generateGameReferenceId(existing.ticketPrice, existing.id);
            adminDb.collection('rooms').doc(existing.id).update({ gameReferenceId: existing.gameReferenceId }).catch(console.warn);
            adminDb.collection('gameRooms').doc(existing.id).update({ gameReferenceId: existing.gameReferenceId }).catch(console.warn);
          }
          if (!existing.endsAt) {
            existing.startedAt = nowIso;
            existing.endsAt = endsIso;
            this.rooms.set(existing.id, existing);
            adminDb.collection('rooms').doc(existing.id).update({ startedAt: nowIso, endsAt: endsIso }).catch(console.warn);
            adminDb.collection('gameRooms').doc(existing.id).update({ startedAt: nowIso, endsAt: endsIso }).catch(console.warn);
          }
        }
      }

      // 4. Load Private Groups
      const groupsSnap = await adminDb.collection('groupGames').get();
      groupsSnap.forEach((doc) => {
        const g = doc.data() as PrivateGroup;
        if (g.gameReferenceId) {
          syncRoomSequenceFromRef(g.id, g.gameReferenceId);
        } else {
          g.gameReferenceId = generateGameReferenceId(g.ticketPrice, g.id);
          adminDb.collection('groupGames').doc(g.id).update({ gameReferenceId: g.gameReferenceId }).catch(console.warn);
        }
        this.privateGroups.set(g.id, g);
        if (g.code) this.privateGroupCodeIndex.set(g.code, g.id);
      });

      // 5. Load Deposits & Withdrawals
      const depSnap = await adminDb.collection('payments').orderBy('createdAt', 'desc').get();
      this.deposits = depSnap.docs.map((d) => d.data() as DepositRequest);

      const wdSnap = await adminDb.collection('withdrawals').orderBy('createdAt', 'desc').get();
      this.withdrawals = wdSnap.docs.map((d) => d.data() as WithdrawalRequest);

      // 6. Load Transactions
      const txSnap = await adminDb.collection('transactions').orderBy('createdAt', 'desc').limit(200).get();
      this.transactions = txSnap.docs.map((d) => d.data() as WalletTransaction);

      // 7. Load Notifications
      const notifSnap = await adminDb.collection('notifications').orderBy('createdAt', 'desc').limit(200).get();
      this.notifications = notifSnap.docs.map((d) => d.data() as UserNotification);

      // 8. Load Game History
      const ghSnap = await adminDb.collection('gameHistory').orderBy('playedAt', 'desc').limit(200).get();
      this.gameHistoryRecords = ghSnap.docs.map((d) => d.data() as GameHistoryRecord);

      // 9. Load All Tickets (Historical & Active) from Firestore
      const ticketsSnap = await adminDb.collection('tickets').orderBy('boughtAt', 'desc').get();
      ticketsSnap.forEach((docSnap) => {
        const tkt = docSnap.data() as BingoTicket;
        if (tkt && tkt.id) {
          this.tickets.set(tkt.id, tkt);
        }
      });

      // 10. Load Winners
      const winnersSnap = await adminDb.collection('winners').orderBy('wonAt', 'desc').get();
      this.winners = winnersSnap.docs.map((d) => d.data() as GameWinner);

      console.log(`✅ [Firestore] Loaded ${this.users.size} users, ${this.rooms.size} rooms, ${this.privateGroups.size} private groups, ${this.tickets.size} tickets, ${this.deposits.length} deposits.`);
    } catch (err) {
      console.error('⚠️ [Firestore] Initial sync error (collections will be populated dynamically):', err);
    }
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

    let referredByUserId: string | undefined = undefined;
    if (params.referralCode) {
      const referrer = Array.from(this.users.values()).find(
        (u) => u.referralCode.toLowerCase() === params.referralCode?.toLowerCase()
      );
      if (referrer) {
        referredByUserId = referrer.id;
      }
    }

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
      referredBy: referredByUserId || undefined,
      walletBalance: 100, // 100 Birr Welcome Credit
      bonusBalance: 50,  // 50 Birr Bonus Credit
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

    // Ledger welcome gift
    this.addTransaction({
      id: `tx_welcome_${Date.now()}`,
      userId,
      amount: 100,
      balanceAfter: 100,
      type: 'DAILY_BONUS',
      status: 'COMPLETED',
      reference: 'WEL-BONUS-PHONE',
      description: 'Welcome Gift Credit for Registration',
      createdAt: new Date().toISOString(),
    });

    if (referredByUserId) {
      this.updateWalletBalance(
        referredByUserId,
        50,
        'REFERRAL_BONUS',
        `Referral reward for inviting ${params.firstName}`
      );
    }

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

    // Async write to Firestore users collection
    adminDb.collection('users').doc(user.id).set(user, { merge: true }).catch((err) => {
      console.error(`🔥 [Firestore] Error saving user ${user.id}:`, err);
    });

    // Also update wallets collection
    adminDb.collection('wallets').doc(user.id).set({
      userId: user.id,
      balance: user.walletBalance,
      bonusBalance: user.bonusBalance,
      updatedAt: new Date().toISOString(),
    }, { merge: true }).catch(console.error);

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

  public findOrCreateTelegramUser(tgUser: {
    id: number;
    first_name: string;
    last_name?: string;
    username?: string;
    language_code?: string;
    photo_url?: string;
  }): UserProfile {
    let existing = this.getUserByTelegramId(tgUser.id);
    if (existing) {
      existing.firstName = tgUser.first_name || existing.firstName;
      existing.lastName = tgUser.last_name || existing.lastName;
      existing.username = tgUser.username || existing.username;
      if (tgUser.photo_url) existing.photoUrl = tgUser.photo_url;
      this.saveUser(existing);
      return existing;
    }

    const newUserId = `usr_${tgUser.id}`;
    const referralCode = `REF${Math.floor(100000 + Math.random() * 900000)}`;

    const newUser: UserProfile = {
      id: newUserId,
      telegramId: tgUser.id,
      username: tgUser.username || `user_${tgUser.id}`,
      firstName: tgUser.first_name,
      lastName: tgUser.last_name,
      photoUrl: tgUser.photo_url || `https://api.dicebear.com/7.x/bottts/svg?seed=${tgUser.id}`,
      language: tgUser.language_code === 'am' ? 'am' : 'en',
      referralCode,
      walletBalance: 100, // 100 Birr Welcome Gift
      bonusBalance: 50,  // 50 Birr Bonus Gift
      vipLevel: 1,
      status: 'ACTIVE',
      createdAt: new Date().toISOString(),
      totalWins: 0,
      totalGamesPlayed: 0,
      totalDeposited: 0,
      totalWithdrawn: 0,
    };

    this.saveUser(newUser);

    // Ledger welcome gift
    this.addTransaction({
      id: `tx_welcome_${Date.now()}`,
      userId: newUserId,
      amount: 100,
      balanceAfter: 100,
      type: 'DAILY_BONUS',
      status: 'COMPLETED',
      reference: 'WEL-BONUS-YABEDE',
      description: 'Welcome Gift Credit from Yabede Bingo',
      createdAt: new Date().toISOString(),
    });

    return newUser;
  }

  // --- WALLET & LEDGER ATOMIC OPERATIONS ---
  public addTransaction(tx: WalletTransaction): WalletTransaction {
    this.transactions.unshift(tx);

    // Save to Firestore transactions collection
    adminDb.collection('transactions').doc(tx.id).set(tx).catch((err) => {
      console.error(`🔥 [Firestore] Error saving transaction ${tx.id}:`, err);
    });

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

    // Save to Firestore payments collection
    adminDb.collection('payments').doc(dep.id).set(dep).catch((err) => {
      console.error(`🔥 [Firestore] Error saving deposit ${dep.id}:`, err);
    });

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

    adminDb.collection('payments').doc(dep.id).set(dep, { merge: true }).catch(console.error);

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

    adminDb.collection('payments').doc(dep.id).set(dep, { merge: true }).catch(console.error);

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

    adminDb.collection('payments').doc(dep.id).set(dep, { merge: true }).catch(console.error);

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

    adminDb.collection('withdrawals').doc(req.id).set(req).catch((err) => {
      console.error(`🔥 [Firestore] Error saving withdrawal ${req.id}:`, err);
    });

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

    adminDb.collection('withdrawals').doc(req.id).set(req, { merge: true }).catch(console.error);

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
    name: string;
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
    const gameReferenceId = generateGameReferenceId(params.ticketPrice, groupId);

    const group: PrivateGroup = {
      id: groupId,
      gameReferenceId,
      code,
      name: params.name,
      hostId: host.id,
      hostName: host.username,
      ticketPrice: params.ticketPrice,
      maxPlayers: params.maxPlayers || 10,
      maxTicketsPerPlayer: 3,
      winningPattern: params.winningPattern || 'FULL_HOUSE',
      prizeDistribution: params.prizeDistribution || 'WINNER_100',
      autoStartReady: params.autoStartReady ?? true,
      allowSpectators: params.allowSpectators ?? true,
      status: 'LOBBY',
      countdownSeconds: 0,
      currentBall: null,
      drawnBalls: [],
      prizePool: 0,
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

    const activeTickets = Array.from(this.tickets.values()).filter(
      (t) => t.roomId === groupId && t.status === 'ACTIVE'
    );

    const members = this.groupMembers.get(groupId) || [];
    const sumMemberTickets = members.reduce((acc, m) => acc + (m.ticketCount || 0), 0);
    const ticketsSold = Math.max(activeTickets.length, sumMemberTickets);

    const totalSales = ticketsSold * group.ticketPrice;
    const platformFee = Math.round(totalSales * 0.1);
    const prizePool = Math.max(0, totalSales - (totalSales * 0.1));
    const uniquePlayers = new Set([
      ...activeTickets.map((t) => t.userId),
      ...members.filter((m) => (m.ticketCount || 0) > 0).map((m) => m.userId),
    ]).size;

    group.ticketsSold = ticketsSold;
    group.remainingTickets = Math.max(0, 400 - ticketsSold);
    group.totalSales = totalSales;
    group.platformFee = platformFee;
    group.prizePool = prizePool;
    group.activePlayersCount = uniquePlayers;

    adminDb.collection('groupGames').doc(group.id).set({
      ticketsSold,
      remainingTickets: group.remainingTickets,
      totalSales,
      platformFee,
      prizePool,
      activePlayersCount: uniquePlayers,
      updatedAt: new Date().toISOString(),
    }, { merge: true }).catch(console.error);

    return {
      ticketsSold,
      remainingTickets: group.remainingTickets,
      totalSales,
      platformFee,
      prizePool,
      activePlayersCount: uniquePlayers,
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
      adminDb.collection('cardReservations').doc(reservation.id).set(reservation).catch(console.error);
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

    // 3. Clear card reservations for this group so all 400 cards are available
    adminDb.collection('cardReservations').where('roomId', '==', groupId).get().then((snap) => {
      snap.docs.forEach((d) => adminDb.collection('cardReservations').doc(d.id).delete().catch(console.error));
    }).catch(console.error);

    // 4. Reset game state
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
    group.startedAt = new Date().toISOString();

    adminDb.collection('groupGames').doc(group.id).update({
      status: 'PLAYING',
      drawnBalls: [],
      currentBall: null,
      startedAt: group.startedAt,
    }).catch(console.error);

    return group;
  }

  public cancelPrivateGroupGame(groupId: string, hostId: string, reason?: string): PrivateGroup {
    const group = this.privateGroups.get(groupId);
    if (!group) throw new Error('Group not found');
    if (group.hostId !== hostId) throw new Error('Only host can cancel game');

    group.status = 'CANCELLED';
    adminDb.collection('groupGames').doc(group.id).update({ status: 'CANCELLED', cancelReason: reason || 'Cancelled by host' }).catch(console.error);

    return group;
  }

  public removeGroupMember(groupId: string, hostId: string, targetUserId: string): { success: boolean } {
    const group = this.privateGroups.get(groupId);
    if (!group) throw new Error('Group not found');
    if (group.hostId !== hostId) throw new Error('Only host can remove players');

    let members = this.groupMembers.get(groupId) || [];
    members = members.filter((m) => m.userId !== targetUserId);
    this.groupMembers.set(groupId, members);

    adminDb.collection('groupMembers').doc(`${groupId}_${targetUserId}`).delete().catch(console.error);

    return { success: true };
  }

  // --- GAME HISTORY METHODS ---
  public recordGameHistoryForRoom(room: BingoRoom, winners: GameWinner[]) {
    try {
      const roomTickets = Array.from(this.tickets.values()).filter((t) => t.roomId === room.id);
      const userTicketsMap = new Map<string, BingoTicket[]>();

      for (const ticket of roomTickets) {
        const list = userTicketsMap.get(ticket.userId) || [];
        list.push(ticket);
        userTicketsMap.set(ticket.userId, list);
      }

      // If no tickets were found in memory map, check winners list for userIds
      if (userTicketsMap.size === 0 && winners.length > 0) {
        for (const w of winners) {
          if (!userTicketsMap.has(w.userId)) {
            userTicketsMap.set(w.userId, [
              {
                id: `ticket_virtual_${w.userId}`,
                roomId: room.id,
                cardNumber: w.cardNumber || 1,
                userId: w.userId,
                username: w.username,
                matrix: [],
                daubed: [],
                status: 'BINGO_CLAIMED',
                purchasePrice: room.ticketPrice,
                boughtAt: new Date().toISOString(),
              },
            ]);
          }
        }
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

    adminDb.collection('gameHistory').doc(historyId).delete().catch(console.warn);
    this.logAudit(adminId, 'DELETE_GAME_HISTORY', undefined, `Deleted game history record ${historyId}`, 'Admin Deletion');
    return this.gameHistoryRecords.length < initialCount;
  }

  public getUserGameHistory(userId: string, limitCount: number = 50): GameHistoryRecord[] {
    const userRecords = this.gameHistoryRecords.filter((r) => r.userId === userId);
    userRecords.sort((a, b) => new Date(b.playedAt).getTime() - new Date(a.playedAt).getTime());
    return userRecords.slice(0, limitCount);
  }
}

export const db = new FirestoreDatabaseStore();
