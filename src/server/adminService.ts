/**
 * Secure Single-Administrator Service Engine
 * Strictly handles dawitsolomon1823@gmail.com (SuperAdmin)
 */

import crypto from 'crypto';
import { adminDb, adminAuth } from './firebaseAdmin.js';
import { emailService } from './emailService.js';
import { db } from './db.js';
import { AuditLog, UserProfile, SystemMetrics, BonusProgram } from '../types.js';
import { firestoreGuard } from './firestoreGuard.js';
import config from '../../firebase-applet-config.json' with { type: 'json' };

export interface AdminProfile {
  adminId: string;
  email: string; // 'dawitsolomon1823@gmail.com'
  phone: string; // '0918230227'
  displayName: string;
  role: 'SuperAdmin';
  createdDate: string;
  lastLogin?: string;
  lastPasswordChange?: string;
  lastLoginIp?: string;
  lastDevice?: string;
  accountStatus: 'ACTIVE' | 'LOCKED';
}

export interface DetailedAuditLog {
  id: string;
  adminId: string;
  email: string;
  action: string;
  dateTime: string;
  ipAddress?: string;
  deviceInfo?: string;
  browser?: string;
  result: 'SUCCESS' | 'FAILED';
  targetRecord?: string;
  description: string;
}

export interface SystemSettingsConfig {
  // Game Settings
  countdownDurationSeconds: number;
  ballDrawIntervalSeconds: number;
  resultScreenDurationSeconds: number;
  maxCardsPerPlayer: number;
  maxPlayers: number;
  minPlayers: number;
  autoRestartGame: boolean;
  autoResetCards: boolean;
  prizePercentage: number;
  platformFeePercent: number;
  allowSpectators: boolean;
  cardReservationTimeoutSeconds: number;
  winningPatterns: string[];
  privateGroupMaxPlayers: number;
  privateGroupMaxTicketsPerPlayer: number;

  // Wallet Settings
  minDepositBirr: number;
  maxDepositBirr: number;
  minWithdrawalBirr: number;
  maxWithdrawalBirr: number;
  autoApproveDeposits: boolean;
  autoApproveWithdrawals: boolean;

  // Referral Settings
  referralRewardBirr: number;
  welcomeBonusBirr: number;
  maxReferralBonusBirr: number;

  // Security Settings
  maintenanceMode: boolean;
  enableRegistration: boolean;
  enableLogin: boolean;
  enableWithdrawals: boolean;
  enableDeposits: boolean;

  // Platform defaults
  ticketPrices: number[];
  announcements: { id: string; title: string; message: string; createdAt: string }[];
}

export interface SettingsHistoryRecord {
  id: string;
  updatedBy: string;
  changes: Record<string, { old: any; new: any }>;
  timestamp: string;
}

export class AdminService {
  public static FIXED_ADMIN_EMAIL = 'dawitsolomon1823@gmail.com';
  public static FIXED_ADMIN_PHONE = '0918230227';
  public static FIXED_ADMIN_ID = 'usr_admin_super';

  private adminProfile: AdminProfile | null = null;
  private passwordHash: string | null = null;
  private failedLoginAttempts = 0;
  private lockedUntil: number | null = null;

  // Pending 2FA sessions: token -> { code, expires, ipAddress, deviceInfo }
  private pending2FASessions: Map<
    string,
    { code: string; expires: number; ipAddress?: string; deviceInfo?: string }
  > = new Map();

  // Pending Password Reset sessions: resetCode -> { expires }
  private pendingResetSessions: Map<string, { code: string; expires: number }> = new Map();

  // Active Admin Tokens: token -> { createdAt, expiresAt }
  private activeAdminTokens: Set<string> = new Set();

  private systemSettings: SystemSettingsConfig = {
    // Game Settings Defaults
    countdownDurationSeconds: 45,
    ballDrawIntervalSeconds: 3,
    resultScreenDurationSeconds: 15,
    maxCardsPerPlayer: 50,
    maxPlayers: 400,
    minPlayers: 1,
    autoRestartGame: true,
    autoResetCards: true,
    prizePercentage: 80,
    platformFeePercent: 20,
    allowSpectators: true,
    cardReservationTimeoutSeconds: 60,
    winningPatterns: ['CORNER', 'LINE', 'FULL_HOUSE'],
    privateGroupMaxPlayers: 50,
    privateGroupMaxTicketsPerPlayer: 10,

    // Wallet Settings Defaults
    minDepositBirr: 50,
    maxDepositBirr: 100000,
    minWithdrawalBirr: 100,
    maxWithdrawalBirr: 50000,
    autoApproveDeposits: false,
    autoApproveWithdrawals: false,

    // Referral Settings Defaults
    referralRewardBirr: 25,
    welcomeBonusBirr: 100,
    maxReferralBonusBirr: 5000,

    // Security Settings Defaults
    maintenanceMode: false,
    enableRegistration: true,
    enableLogin: true,
    enableWithdrawals: true,
    enableDeposits: true,

    ticketPrices: [10, 50, 100, 200],
    announcements: [],
  };

  private settingsHistory: SettingsHistoryRecord[] = [];
  private detailedAuditLogs: DetailedAuditLog[] = [];

  private bonusPrograms: BonusProgram[] = [
    {
      id: 'welcome_bonus',
      name: 'New Player Welcome Gift',
      type: 'WELCOME',
      enabled: true,
      amountBirr: 100,
      description: 'Credited instantly upon registration and phone verification.',
    },
    {
      id: 'registration_bonus',
      name: 'Registration Bonus Credit',
      type: 'REGISTRATION',
      enabled: true,
      amountBirr: 50,
      description: 'Bonus balance granted to new user accounts.',
    },
    {
      id: 'referral_bonus',
      name: 'Friend Referral Reward',
      type: 'REFERRAL',
      enabled: true,
      amountBirr: 25,
      maxBonusBirr: 5000,
      description: 'Reward granted to user who invites a friend.',
    },
    {
      id: 'deposit_bonus',
      name: 'VIP Deposit Match Bonus',
      type: 'DEPOSIT',
      enabled: true,
      amountBirr: 10,
      isPercentage: true,
      minDepositBirr: 500,
      maxBonusBirr: 2000,
      description: 'Bonus match percentage on deposits meeting min threshold.',
    },
    {
      id: 'daily_streak',
      name: 'Daily Claim Streak Bonus',
      type: 'DAILY',
      enabled: true,
      amountBirr: 25,
      description: 'Daily login reward for active players.',
    },
    {
      id: 'lucky_wheel',
      name: 'Mega Lucky Spin Wheel',
      type: 'SPIN',
      enabled: true,
      amountBirr: 20,
      maxBonusBirr: 1000,
      description: 'Random wheel spin prizes for active depositors.',
    },
  ];

  constructor() {
    setImmediate(() => {
      this.initializeSuperAdmin().catch((err) => {
        console.error('🔥 [AdminService] Error initializing SuperAdmin:', err);
      });
    });
  }

  /**
   * Verifies credentials against Firebase Authentication
   */
  public async verifyFirebaseAuthPassword(email: string, pass: string): Promise<boolean> {
    try {
      const res = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${config.apiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: email,
          password: pass,
          returnSecureToken: true,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        return !!data.idToken;
      }
    } catch (err: any) {
      console.warn('⚠️ [AdminService] Firebase Auth check exception:', err.message);
    }
    return false;
  }

  /**
   * Registers dawitsolomon1823@gmail.com on Firebase Authentication
   */
  public async registerAdminInFirebaseAuth(): Promise<void> {
    const email = AdminService.FIXED_ADMIN_EMAIL;
    try {
      const res = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=${config.apiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: email,
          password: 'AdminSuperPassword2026!',
          returnSecureToken: true,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        console.log(`✅ [AdminService] Successfully registered ${email} on Firebase Authentication.`);
      } else if (data.error?.message === 'EMAIL_EXISTS') {
        console.log(`✅ [AdminService] ${email} is registered & active on Firebase Authentication.`);
      } else {
        console.warn(`⚠️ [AdminService] Firebase Auth registration response:`, data.error?.message);
      }
    } catch (err: any) {
      console.error(`❌ [AdminService] Error registering admin in Firebase Auth:`, err.message);
    }
  }

  /**
   * Initializes the single administrator account on application startup
   */
  public async initializeSuperAdmin(): Promise<AdminProfile> {
    // 1. Establish deterministic in-memory defaults immediately
    const defaultPasswordHash = this.hashPassword('Admin123456!');
    this.passwordHash = defaultPasswordHash;
    this.adminProfile = {
      adminId: AdminService.FIXED_ADMIN_ID,
      email: AdminService.FIXED_ADMIN_EMAIL,
      phone: AdminService.FIXED_ADMIN_PHONE,
      displayName: 'Super Administrator',
      role: 'SuperAdmin',
      createdDate: '2026-01-01T00:00:00.000Z',
      lastPasswordChange: '2026-01-01T00:00:00.000Z',
      accountStatus: 'ACTIVE',
    };

    // Ensure admin user exists in memory db
    const adminUserObj: UserProfile = {
      id: AdminService.FIXED_ADMIN_ID,
      telegramId: 99999999,
      phone: '+251918230227',
      role: 'ADMIN',
      username: 'yabede_admin',
      firstName: 'Dawit',
      lastName: 'Solomon',
      photoUrl: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150',
      language: 'en',
      referralCode: 'YABEDEVIP',
      walletBalance: 25000,
      bonusBalance: 5000,
      vipLevel: 5,
      status: 'ACTIVE',
      createdAt: '2026-01-01T00:00:00.000Z',
      totalWins: 142,
      totalGamesPlayed: 320,
      totalDeposited: 30000,
      totalWithdrawn: 5000,
    };
    if (typeof db !== 'undefined' && db?.users) {
      db.users.set(AdminService.FIXED_ADMIN_ID, adminUserObj);
    }

    // 2. Fetch or sync admin profile from Firestore via firestoreGuard
    await firestoreGuard.safeRead('admins', 'initializeSuperAdmin', async () => {
      const docRef = adminDb.collection('admins').doc(AdminService.FIXED_ADMIN_EMAIL);
      const snap = await docRef.get();

      if (snap.exists) {
        const data = snap.data();
        if (data) {
          this.adminProfile = {
            adminId: AdminService.FIXED_ADMIN_ID,
            email: AdminService.FIXED_ADMIN_EMAIL,
            phone: AdminService.FIXED_ADMIN_PHONE,
            displayName: data.displayName || 'Super Administrator',
            role: 'SuperAdmin',
            createdDate: data.createdDate || '2026-01-01T00:00:00.000Z',
            lastLogin: data.lastLogin || undefined,
            lastPasswordChange: data.lastPasswordChange || '2026-01-01T00:00:00.000Z',
            lastLoginIp: data.lastLoginIp || undefined,
            lastDevice: data.lastDevice || undefined,
            accountStatus: data.accountStatus || 'ACTIVE',
          };
          if (data.passwordHash) {
            this.passwordHash = data.passwordHash;
          }
        }
      }
    }, null);

    // 3. Load Settings safely
    await firestoreGuard.safeRead('settings', 'loadSettings', async () => {
      const settingsSnap = await adminDb.collection('settings').doc('platformConfig').get();
      if (settingsSnap.exists) {
        this.systemSettings = { ...this.systemSettings, ...settingsSnap.data() };
      }
    }, null);

    return this.adminProfile!;
  }

  public hashPassword(pass: string): string {
    return crypto.pbkdf2Sync(pass, 'superadmin_fixed_salt_2026', 10000, 64, 'sha512').toString('hex');
  }

  public getAdminProfile(): AdminProfile | null {
    return this.adminProfile;
  }

  /**
   * Validates whether a token belongs to an active Admin session
   */
  public isTokenValid(token: string): boolean {
    if (!token) return false;
    return this.activeAdminTokens.has(token);
  }

  /**
   * Admin Password Authentication & Direct Login (2FA removed)
   */
  public async loginStep1(
    email: string,
    password: string,
    ipAddress?: string,
    deviceInfo?: string,
    browser?: string
  ): Promise<{ token: string; admin: AdminProfile }> {
    if (!email || !password) {
      throw new Error('Email and password are required.');
    }

    if (!this.adminProfile || !this.passwordHash) {
      await this.initializeSuperAdmin();
    }
    // 1. Strictly enforce fixed single email
    if (email.trim().toLowerCase() !== AdminService.FIXED_ADMIN_EMAIL.toLowerCase()) {
      await this.logAction('LOGIN_ATTEMPT', 'FAILED', `Unauthorized email attempted login: ${email}`, ipAddress, deviceInfo, browser);
      throw new Error('Access Denied: Unrecognized administrator email address.');
    }

    // 2. Check Lockout Status
    if (this.lockedUntil && Date.now() < this.lockedUntil) {
      const minutesRemaining = Math.ceil((this.lockedUntil - Date.now()) / 60000);
      throw new Error(`Account locked due to multiple failed login attempts. Please try again in ${minutesRemaining} minutes.`);
    }

    // 3. Verify Password (check both Firebase Auth and local hash)
    const firebaseAuthValid = await this.verifyFirebaseAuthPassword(AdminService.FIXED_ADMIN_EMAIL, password);
    const localHashValid = this.hashPassword(password) === this.passwordHash;

    if (!firebaseAuthValid && !localHashValid) {
      this.failedLoginAttempts += 1;
      await this.logAction('LOGIN_FAILED', 'FAILED', `Incorrect password entered (Attempt ${this.failedLoginAttempts}/3)`, ipAddress, deviceInfo, browser);

      if (this.failedLoginAttempts >= 3) {
        this.lockedUntil = Date.now() + 15 * 60 * 1000; // 15 min lock
        await emailService.sendSecurityAlert('ACCOUNT_LOCKOUT', `Administrator account locked after ${this.failedLoginAttempts} failed login attempts from IP ${ipAddress || 'unknown'}.`);
        throw new Error('Too many failed login attempts. Administrator login locked for 15 minutes. Security alert sent to dawitsolomon1823@gmail.com.');
      }

      throw new Error('Invalid administrator password.');
    }

    // Sync local password hash if authenticated via Firebase Auth
    if (firebaseAuthValid && !localHashValid) {
      this.passwordHash = this.hashPassword(password);
      await firestoreGuard.safeWrite('admins', 'syncAdminPasswordHash', async () => {
        await adminDb.collection('admins').doc(AdminService.FIXED_ADMIN_EMAIL).set(
          {
            passwordHash: this.passwordHash,
            lastPasswordChange: new Date().toISOString(),
          },
          { merge: true }
        );
      });
      console.log('✅ [AdminService] Synchronized local password hash with Firebase Auth.');
    }

    // Reset failed counter on successful password
    this.failedLoginAttempts = 0;
    this.lockedUntil = null;

    // Issue SuperAdmin Token directly
    const adminToken = `admin_jwt_${Date.now()}_${Math.floor(Math.random() * 100000)}`;
    this.activeAdminTokens.add(adminToken);

    const now = new Date().toISOString();
    if (this.adminProfile) {
      this.adminProfile.lastLogin = now;
      this.adminProfile.lastLoginIp = ipAddress || '127.0.0.1';
      this.adminProfile.lastDevice = deviceInfo || 'Web Browser';

      // Update Firestore profile
      await firestoreGuard.safeWrite('admins', 'updateAdminLoginMetadata', async () => {
        await adminDb.collection('admins').doc(AdminService.FIXED_ADMIN_EMAIL).set(
          {
            lastLogin: now,
            lastLoginIp: ipAddress,
            lastDevice: deviceInfo,
          },
          { merge: true }
        );
      });
    }

    await this.logAction('ADMIN_LOGIN', 'SUCCESS', 'Administrator successfully logged in', ipAddress, deviceInfo, browser);

    return {
      token: adminToken,
      admin: this.adminProfile!,
    };
  }

  /**
   * Step 2: Validate 2FA OTP Code and Grant Access
   */
  public async loginStep2(
    step2Token: string,
    otpCode: string,
    ipAddress?: string,
    deviceInfo?: string,
    browser?: string
  ): Promise<{ token: string; admin: AdminProfile }> {
    const session = this.pending2FASessions.get(step2Token);

    if (!session || Date.now() > session.expires) {
      await this.logAction('2FA_FAILED', 'FAILED', 'Expired or invalid 2FA session token', ipAddress, deviceInfo, browser);
      throw new Error('Verification session expired. Please start login again.');
    }

    if (session.code !== otpCode.trim()) {
      await this.logAction('2FA_FAILED', 'FAILED', 'Incorrect 2FA verification code entered', ipAddress, deviceInfo, browser);
      throw new Error('Invalid 2-step verification code.');
    }

    // Clean up used 2FA session
    this.pending2FASessions.delete(step2Token);

    // Issue SuperAdmin Token
    const adminToken = `admin_jwt_${Date.now()}_${Math.floor(Math.random() * 100000)}`;
    this.activeAdminTokens.add(adminToken);

    const now = new Date().toISOString();
    if (this.adminProfile) {
      this.adminProfile.lastLogin = now;
      this.adminProfile.lastLoginIp = ipAddress || '127.0.0.1';
      this.adminProfile.lastDevice = deviceInfo || 'Web Browser';

      // Update Firestore profile
      await firestoreGuard.safeWrite('admins', 'updateAdmin2FALoginMetadata', async () => {
        await adminDb.collection('admins').doc(AdminService.FIXED_ADMIN_EMAIL).set(
          {
            lastLogin: now,
            lastLoginIp: ipAddress,
            lastDevice: deviceInfo,
          },
          { merge: true }
        );
      });
    }

    await this.logAction('ADMIN_LOGIN', 'SUCCESS', 'Administrator successfully logged in via 2-Step Verification', ipAddress, deviceInfo, browser);

    return {
      token: adminToken,
      admin: this.adminProfile!,
    };
  }

  /**
   * Forgot Password - Request Reset Code
   */
  public async requestPasswordReset(ipAddress?: string): Promise<{ success: boolean; message: string }> {
    const code = Math.floor(100000 + Math.random() * 900000).toString();
    const expires = Date.now() + 15 * 60 * 1000; // 15 mins

    this.pendingResetSessions.set(code, { code, expires });

    await emailService.sendPasswordResetCode(code);
    await this.logAction('PASSWORD_RESET_REQUESTED', 'SUCCESS', `Password reset code sent to ${AdminService.FIXED_ADMIN_EMAIL}`, ipAddress);

    return {
      success: true,
      message: `Password reset confirmation code sent to ${AdminService.FIXED_ADMIN_EMAIL}`,
    };
  }

  /**
   * Forgot Password - Confirm Reset Code & Set New Password
   */
  public async confirmPasswordReset(
    resetCode: string,
    newPassword: string,
    ipAddress?: string,
    deviceInfo?: string,
    browser?: string
  ): Promise<{ success: boolean; message: string }> {
    const session = this.pendingResetSessions.get(resetCode.trim());

    if (!session || Date.now() > session.expires) {
      await this.logAction('PASSWORD_RESET_FAILED', 'FAILED', 'Invalid or expired password reset code', ipAddress, deviceInfo, browser);
      throw new Error('Invalid or expired password reset confirmation code.');
    }

    if (newPassword.length < 8) {
      throw new Error('New password must be at least 8 characters long.');
    }

    this.passwordHash = this.hashPassword(newPassword);
    this.pendingResetSessions.delete(resetCode.trim());

    // Sync Firebase Auth user password if available
    try {
      if (adminAuth && adminAuth.getUserByEmail) {
        const user = await adminAuth.getUserByEmail(AdminService.FIXED_ADMIN_EMAIL);
        if (user && user.uid) {
          await adminAuth.updateUser(user.uid, { password: newPassword });
          console.log('✅ [AdminService] Firebase Auth password synchronized for:', AdminService.FIXED_ADMIN_EMAIL);
        }
      }
    } catch (fbErr: any) {
      console.warn('⚠️ [AdminService] Firebase Auth password sync note:', fbErr.message);
    }

    const now = new Date().toISOString();
    if (this.adminProfile) {
      this.adminProfile.lastPasswordChange = now;
    }

    await firestoreGuard.safeWrite('admins', 'updateAdminPasswordReset', async () => {
      await adminDb.collection('admins').doc(AdminService.FIXED_ADMIN_EMAIL).set(
        {
          passwordHash: this.passwordHash,
          lastPasswordChange: now,
        },
        { merge: true }
      );
    });

    // Logout all existing admin tokens
    this.activeAdminTokens.clear();

    await emailService.sendSecurityAlert('PASSWORD_CHANGED', `Password for SuperAdmin ${AdminService.FIXED_ADMIN_EMAIL} was successfully changed. All active sessions terminated.`);
    await this.logAction('PASSWORD_CHANGED', 'SUCCESS', 'Administrator password updated via email verification', ipAddress, deviceInfo, browser);

    return {
      success: true,
      message: 'Password reset successfully! Please log in with your new password.',
    };
  }

  /**
   * Logs an Admin Action to Audit Trail in Firestore
   */
  public async logAction(
    action: string,
    result: 'SUCCESS' | 'FAILED',
    description: string,
    ipAddress?: string,
    deviceInfo?: string,
    browser?: string,
    targetRecord?: string
  ): Promise<DetailedAuditLog> {
    const log: DetailedAuditLog = {
      id: `audit_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
      adminId: AdminService.FIXED_ADMIN_ID,
      email: AdminService.FIXED_ADMIN_EMAIL,
      action,
      dateTime: new Date().toISOString(),
      ipAddress: ipAddress || '127.0.0.1',
      deviceInfo: deviceInfo || 'Web Container',
      browser: browser || 'Chrome/Client',
      result,
      targetRecord: targetRecord || undefined,
      description,
    };

    this.detailedAuditLogs.unshift(log);
    if (this.detailedAuditLogs.length > 200) {
      this.detailedAuditLogs = this.detailedAuditLogs.slice(0, 200);
    }

    firestoreGuard.safeWrite('auditLogs', 'logAction', async () => {
      await adminDb.collection('auditLogs').doc(log.id).set(log);
    });

    return log;
  }

  public getAuditLogs(): DetailedAuditLog[] {
    return this.detailedAuditLogs;
  }

  public getSystemSettings(): SystemSettingsConfig {
    return this.systemSettings;
  }

  public getSettingsHistory(): SettingsHistoryRecord[] {
    return this.settingsHistory;
  }

  public validateSystemSettings(settings: Partial<SystemSettingsConfig>): { valid: boolean; error?: string } {
    if (settings.prizePercentage !== undefined && (settings.prizePercentage < 0 || settings.prizePercentage > 100)) {
      return { valid: false, error: 'Prize percentage must be between 0 and 100%' };
    }
    if (settings.platformFeePercent !== undefined && (settings.platformFeePercent < 0 || settings.platformFeePercent > 100)) {
      return { valid: false, error: 'Platform fee percentage must be between 0 and 100%' };
    }
    if (
      settings.prizePercentage !== undefined &&
      settings.platformFeePercent !== undefined &&
      settings.prizePercentage + settings.platformFeePercent !== 100
    ) {
      return { valid: false, error: 'Prize percentage and Platform fee percentage must total 100%' };
    }
    if (
      settings.minDepositBirr !== undefined &&
      settings.maxDepositBirr !== undefined &&
      settings.minDepositBirr > settings.maxDepositBirr
    ) {
      return { valid: false, error: 'Minimum deposit cannot exceed maximum deposit' };
    }
    if (
      settings.minWithdrawalBirr !== undefined &&
      settings.maxWithdrawalBirr !== undefined &&
      settings.minWithdrawalBirr > settings.maxWithdrawalBirr
    ) {
      return { valid: false, error: 'Minimum withdrawal cannot exceed maximum withdrawal' };
    }
    if (settings.countdownDurationSeconds !== undefined && Number(settings.countdownDurationSeconds) < 5) {
      return { valid: false, error: 'Countdown duration must be at least 5 seconds' };
    }
    if (settings.resultScreenDurationSeconds !== undefined && Number(settings.resultScreenDurationSeconds) < 3) {
      return { valid: false, error: 'Result screen duration must be at least 3 seconds' };
    }
    if (settings.ballDrawIntervalSeconds !== undefined && Number(settings.ballDrawIntervalSeconds) < 1) {
      return { valid: false, error: 'Ball draw interval must be at least 1 second' };
    }
    if (settings.minPlayers !== undefined && Number(settings.minPlayers) < 1) {
      return { valid: false, error: 'Minimum players must be at least 1' };
    }
    if (settings.maxPlayers !== undefined && Number(settings.maxPlayers) < 1) {
      return { valid: false, error: 'Maximum players must be at least 1' };
    }
    if (settings.maxCardsPerPlayer !== undefined && Number(settings.maxCardsPerPlayer) < 1) {
      return { valid: false, error: 'Max cards per player must be at least 1' };
    }
    if (settings.cardReservationTimeoutSeconds !== undefined && Number(settings.cardReservationTimeoutSeconds) < 10) {
      return { valid: false, error: 'Card reservation timeout must be at least 10 seconds' };
    }
    return { valid: true };
  }

  public async updateSystemSettings(
    newSettings: Partial<SystemSettingsConfig>,
    updatedBy: string = AdminService.FIXED_ADMIN_EMAIL,
    ipAddress?: string
  ): Promise<{ success: boolean; settings: SystemSettingsConfig; error?: string }> {
    const parsedSettings: Partial<SystemSettingsConfig> = { ...newSettings };
    const numericKeys: (keyof SystemSettingsConfig)[] = [
      'countdownDurationSeconds',
      'ballDrawIntervalSeconds',
      'resultScreenDurationSeconds',
      'maxCardsPerPlayer',
      'maxPlayers',
      'minPlayers',
      'prizePercentage',
      'platformFeePercent',
      'cardReservationTimeoutSeconds',
      'privateGroupMaxPlayers',
      'privateGroupMaxTicketsPerPlayer',
      'minDepositBirr',
      'maxDepositBirr',
      'minWithdrawalBirr',
      'maxWithdrawalBirr',
      'referralRewardBirr',
      'welcomeBonusBirr',
      'maxReferralBonusBirr',
    ];

    for (const key of numericKeys) {
      const val = (parsedSettings as any)[key];
      if (val !== undefined && val !== null && val !== '') {
        (parsedSettings as any)[key] = Number(val);
      }
    }

    if (parsedSettings.platformFeePercent !== undefined && parsedSettings.prizePercentage === undefined) {
      parsedSettings.prizePercentage = Math.max(0, 100 - Number(parsedSettings.platformFeePercent));
    } else if (parsedSettings.prizePercentage !== undefined && parsedSettings.platformFeePercent === undefined) {
      parsedSettings.platformFeePercent = Math.max(0, 100 - Number(parsedSettings.prizePercentage));
    }

    const combined = {
      ...this.systemSettings,
      ...parsedSettings,
      version: ((this.systemSettings as any).version || 0) + 1,
      updatedAt: new Date().toISOString(),
      updatedBy,
    };
    const validation = this.validateSystemSettings(combined);
    if (!validation.valid) {
      return { success: false, settings: this.systemSettings, error: validation.error };
    }

    const changes: Record<string, { old: any; new: any }> = {};
    for (const key of Object.keys(parsedSettings) as (keyof SystemSettingsConfig)[]) {
      if (JSON.stringify(this.systemSettings[key]) !== JSON.stringify(parsedSettings[key])) {
        changes[key] = {
          old: this.systemSettings[key],
          new: parsedSettings[key],
        };
      }
    }

    if (parsedSettings.welcomeBonusBirr !== undefined) {
      const regProg = this.bonusPrograms.find(
        (p) => p.id === 'registration_bonus' || p.type === 'REGISTRATION' || p.name === 'Registration Bonus Credit'
      );
      if (regProg) {
        regProg.amountBirr = Number(parsedSettings.welcomeBonusBirr);
        firestoreGuard.safeWrite('settings', 'updateWelcomeBonusConfig', async () => {
          await adminDb.collection('settings').doc('bonusConfigs').set({ programs: this.bonusPrograms });
        });
      }
    }

    this.systemSettings = combined;

    // Record history
    if (Object.keys(changes).length > 0) {
      const historyRec: SettingsHistoryRecord = {
        id: `set_hist_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
        updatedBy,
        changes,
        timestamp: new Date().toISOString(),
      };
      this.settingsHistory.unshift(historyRec);
      firestoreGuard.safeWrite('settingsHistory', 'recordSettingsHistory', async () => {
        await adminDb.collection('settingsHistory').doc(historyRec.id).set(historyRec);
      });
    }

    await firestoreGuard.safeWrite('settings', 'updatePlatformConfig', async () => {
      await adminDb.collection('settings').doc('platformConfig').set(this.systemSettings, { merge: true });
    });
    await this.logAction('SETTINGS_CHANGE', 'SUCCESS', `Updated system settings: ${Object.keys(changes).join(', ')}`, ipAddress);

    return { success: true, settings: this.systemSettings };
  }

  public getBonusPrograms(): BonusProgram[] {
    return this.bonusPrograms;
  }

  public getWelcomeGiftConfig(): { enabled: boolean; amountBirr: number } {
    const prog = this.bonusPrograms.find(
      (p) => p.id === 'welcome_bonus' || p.type === 'WELCOME' || p.name === 'New Player Welcome Gift'
    );
    if (prog) {
      return {
        enabled: prog.enabled !== false,
        amountBirr: typeof prog.amountBirr === 'number' ? Math.max(0, prog.amountBirr) : 0,
      };
    }
    return {
      enabled: true,
      amountBirr: typeof this.systemSettings.welcomeBonusBirr === 'number' ? this.systemSettings.welcomeBonusBirr : 100,
    };
  }

  public getRegistrationBonusAmount(): number {
    const regProg = this.bonusPrograms.find(
      (p) => p.id === 'registration_bonus' || p.type === 'REGISTRATION' || p.name === 'Registration Bonus Credit'
    );
    if (regProg) {
      if (regProg.enabled === false) return 0;
      return typeof regProg.amountBirr === 'number' ? Math.max(0, regProg.amountBirr) : 0;
    }
    if (typeof this.systemSettings.welcomeBonusBirr === 'number') {
      return this.systemSettings.welcomeBonusBirr;
    }
    return 50;
  }

  public getReferralBonusConfig(): { enabled: boolean; amountBirr: number; maxBonusBirr?: number } {
    const refProg = this.bonusPrograms.find(
      (p) => p.id === 'referral_bonus' || p.type === 'REFERRAL' || p.name === 'Friend Referral Reward'
    );
    if (refProg) {
      return {
        enabled: refProg.enabled !== false,
        amountBirr: typeof refProg.amountBirr === 'number' ? Math.max(0, refProg.amountBirr) : 0,
        maxBonusBirr: refProg.maxBonusBirr,
      };
    }
    return {
      enabled: true,
      amountBirr: typeof this.systemSettings.referralRewardBirr === 'number' ? this.systemSettings.referralRewardBirr : 25,
      maxBonusBirr: this.systemSettings.maxReferralBonusBirr || 5000,
    };
  }

  public getReferralBonusAmount(): number {
    const config = this.getReferralBonusConfig();
    return config.enabled ? config.amountBirr : 0;
  }

  public async updateBonusPrograms(
    programs: BonusProgram[],
    updatedBy: string = AdminService.FIXED_ADMIN_EMAIL,
    ipAddress?: string
  ): Promise<{ success: boolean; bonusPrograms: BonusProgram[]; error?: string }> {
    for (const prog of programs) {
      if (prog.amountBirr !== undefined && prog.amountBirr < 0) {
        return { success: false, bonusPrograms: this.bonusPrograms, error: `Invalid amount for ${prog.name}` };
      }
      if (prog.minDepositBirr !== undefined && prog.minDepositBirr < 0) {
        return { success: false, bonusPrograms: this.bonusPrograms, error: `Invalid min deposit for ${prog.name}` };
      }
      if (prog.maxBonusBirr !== undefined && prog.maxBonusBirr < 0) {
        return { success: false, bonusPrograms: this.bonusPrograms, error: `Invalid max bonus for ${prog.name}` };
      }
      prog.updatedAt = new Date().toISOString();
    }

    this.bonusPrograms = programs;

    const regProg = programs.find(
      (p) => p.id === 'registration_bonus' || p.type === 'REGISTRATION' || p.name === 'Registration Bonus Credit'
    );
    if (regProg && typeof regProg.amountBirr === 'number') {
      this.systemSettings.welcomeBonusBirr = regProg.amountBirr;
      firestoreGuard.safeWrite('settings', 'syncPlatformConfigWelcomeBonus', async () => {
        await adminDb.collection('settings').doc('platformConfig').set(this.systemSettings, { merge: true });
      });
    }

    await firestoreGuard.safeWrite('settings', 'updateBonusPrograms', async () => {
      await adminDb.collection('settings').doc('bonusConfigs').set({ programs: this.bonusPrograms });
    });
    await this.logAction('BONUS_SETTINGS_CHANGE', 'SUCCESS', `Updated ${programs.length} bonus program configurations`, ipAddress);

    return { success: true, bonusPrograms: this.bonusPrograms };
  }

  /**
   * Calculates Real-Time Dashboard Metrics
   */
  public async getDashboardMetrics(): Promise<SystemMetrics> {
    const allUsers = (typeof db !== 'undefined' && db?.getAllUsers) ? db.getAllUsers() : [];
    const deposits = (typeof db !== 'undefined' && db?.deposits) ? db.deposits : [];
    const withdrawals = (typeof db !== 'undefined' && db?.withdrawals) ? db.withdrawals : [];
    const rooms = (typeof db !== 'undefined' && db?.rooms) ? Array.from(db.rooms.values()) : [];

    const pendingDeposits = deposits.filter((d) => d.status === 'PENDING').length;
    const pendingWithdrawals = withdrawals.filter((w) => w.status === 'PENDING').length;

    const approvedDeposits = deposits.filter((d) => d.status === 'APPROVED');
    const totalDepositedToday = approvedDeposits.reduce((acc, d) => acc + d.amount, 0);

    const approvedWithdrawals = withdrawals.filter((w) => w.status === 'APPROVED');
    const totalWithdrawnToday = approvedWithdrawals.reduce((acc, w) => acc + w.amount, 0);

    const totalTicketsSold = rooms.reduce((acc, r) => acc + (r.ticketsSold || 0), 0);
    const prizePool = rooms.reduce((acc, r) => acc + r.prizePool, 0);

    const totalWalletLiability = allUsers.reduce((acc, u) => acc + (u.walletBalance || 0), 0);
    const platformProfit = totalDepositedToday * (this.systemSettings.platformFeePercent / 100);

    return {
      totalUsers: allUsers.length,
      onlineUsers: Math.max(1, allUsers.filter((u) => u.status === 'ACTIVE').length),
      activeGames: rooms.filter((r) => r.status === 'PLAYING' || r.status === 'COUNTDOWN').length,
      totalDepositedToday,
      totalWithdrawnToday,
      pendingDepositsCount: pendingDeposits,
      pendingWithdrawalsCount: pendingWithdrawals,
      totalApprovedDepositsCount: approvedDeposits.length,
      totalRejectedDepositsCount: deposits.filter((d) => d.status === 'REJECTED').length,
      totalApprovedWithdrawalsCount: approvedWithdrawals.length,
      totalRejectedWithdrawalsCount: withdrawals.filter((w) => w.status === 'REJECTED').length,
      totalPlatformProfit: Math.round(platformProfit * 100) / 100,
      totalWalletLiability,
      systemUptimeSeconds: Math.floor(process.uptime()),
      lastLedgerAuditTimestamp: new Date().toISOString(),
    };
  }

  /**
   * SuperAdmin Controlled Full Data Reset
   * Permanently wipes application test/generated data from Firestore and memory.
   * STRICTLY PROTECTS:
   * - SuperAdmin auth & admin document in 'admins'
   * - System configuration in 'settings' (platformConfig, bonusConfigs, paymentMethods)
   * - Firebase Auth credentials
   * - Indexes
   */
  public async resetAllApplicationData(
    confirmationPhrase: string,
    adminEmail: string,
    ipAddress?: string
  ): Promise<{
    success: boolean;
    message: string;
    deletedCounts: Record<string, number>;
    preservedItems: string[];
    officialRooms: string[];
    timestamp: string;
  }> {
    if (confirmationPhrase !== 'RESET ALL DATA') {
      throw new Error('Invalid confirmation phrase. You must enter "RESET ALL DATA" exactly.');
    }

    if (adminEmail.toLowerCase() !== AdminService.FIXED_ADMIN_EMAIL.toLowerCase()) {
      throw new Error('Permission denied: Only the primary Super Administrator (dawitsolomon1823@gmail.com) can execute a full system reset.');
    }

    console.warn(`🚨 [SUPERADMIN] Initiating controlled full data reset requested by ${adminEmail} (IP: ${ipAddress})`);

    const collectionsToReset = [
      'users',
      'userAuth',
      'wallets',
      'tickets',
      'gameHistory',
      'winners',
      'transactions',
      'deposits',
      'withdrawals',
      'payments',
      'groupGames',
      'groupMembers',
      'groupInvitations',
      'groupMessages',
      'chatMessages',
      'notifications',
      'referrals',
      'userActivities',
    ];

    const deletedCounts: Record<string, number> = {};

    // Helper to batch delete all documents in a collection
    const deleteEntireCollection = async (collectionName: string): Promise<number> => {
      let count = 0;
      try {
        let hasMore = true;
        while (hasMore) {
          const snap = await adminDb.collection(collectionName).limit(300).get();
          if (snap.empty) {
            hasMore = false;
            break;
          }
          const batch = adminDb.batch();
          snap.docs.forEach((doc) => batch.delete(doc.ref));
          await batch.commit();
          count += snap.size;
          if (snap.size < 300) {
            hasMore = false;
          }
        }
      } catch (err: any) {
        console.warn(`[Data Reset] Collection ${collectionName} deletion note:`, err.message || err);
      }
      return count;
    };

    // 1. Delete each collection from Firestore
    for (const coll of collectionsToReset) {
      const numDeleted = await deleteEntireCollection(coll);
      deletedCounts[coll] = numDeleted;
    }

    // 2. Wipe memory store
    db.resetAllData();

    // 3. Recreate default official rooms in memory & Firestore
    const officialRooms = db.recreateOfficialRooms();

    // 4. Ensure SuperAdmin admin account and system configurations remain intact
    await this.initializeSuperAdmin();

    const timestamp = new Date().toISOString();

    // 5. Audit log the reset
    await this.logAction(
      'SUPERADMIN_FULL_DATA_RESET',
      'SUCCESS',
      `Full system data reset executed. Wiped ${Object.values(deletedCounts).reduce((a, b) => a + b, 0)} test documents across ${collectionsToReset.length} collections. Official rooms re-initialized.`,
      ipAddress
    );

    return {
      success: true,
      message: 'All application test data has been safely reset and official Bingo rooms re-initialized from zero.',
      deletedCounts,
      preservedItems: [
        `SuperAdmin Account (${AdminService.FIXED_ADMIN_EMAIL})`,
        'Firebase Authentication Admin Credentials',
        'System Settings (platformConfig, bonusConfigs)',
        'Payment Methods (Telebirr, CBE, etc.)',
        'Database Schema & Indexes',
      ],
      officialRooms: officialRooms.map((r) => r.name || r.id),
      timestamp,
    };
  }
}

export const adminService = new AdminService();
