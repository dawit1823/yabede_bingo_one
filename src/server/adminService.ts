/**
 * Secure Single-Administrator Service Engine
 * Strictly handles dawitsolomon1823@gmail.com (SuperAdmin)
 */

import crypto from 'crypto';
import { adminDb, adminAuth } from './firebaseAdmin.js';
import { emailService } from './emailService.js';
import { db } from './db.js';
import { AuditLog, UserProfile, SystemMetrics, BonusProgram } from '../types.js';
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
    this.initializeSuperAdmin().catch((err) => {
      console.error('🔥 [AdminService] Error initializing SuperAdmin:', err);
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
    // 1. Ensure admin account is registered on Firebase Authentication
    await this.registerAdminInFirebaseAuth();

    const docRef = adminDb.collection('admins').doc(AdminService.FIXED_ADMIN_EMAIL);
    const snap = await docRef.get();

    if (snap.exists) {
      const data = snap.data();
      this.adminProfile = {
        adminId: AdminService.FIXED_ADMIN_ID,
        email: AdminService.FIXED_ADMIN_EMAIL,
        phone: AdminService.FIXED_ADMIN_PHONE,
        displayName: data.displayName || 'Super Administrator',
        role: 'SuperAdmin',
        createdDate: data.createdDate || new Date().toISOString(),
        lastLogin: data.lastLogin || undefined,
        lastPasswordChange: data.lastPasswordChange || new Date().toISOString(),
        lastLoginIp: data.lastLoginIp || undefined,
        lastDevice: data.lastDevice || undefined,
        accountStatus: data.accountStatus || 'ACTIVE',
      };
      this.passwordHash = data.passwordHash || this.hashPassword('Admin123456!');
    } else {
      // Auto-create administrator account
      const now = new Date().toISOString();
      this.passwordHash = this.hashPassword('Admin123456!');
      this.adminProfile = {
        adminId: AdminService.FIXED_ADMIN_ID,
        email: AdminService.FIXED_ADMIN_EMAIL,
        phone: AdminService.FIXED_ADMIN_PHONE,
        displayName: 'Super Administrator',
        role: 'SuperAdmin',
        createdDate: now,
        lastPasswordChange: now,
        accountStatus: 'ACTIVE',
      };

      await docRef.set({
        ...this.adminProfile,
        passwordHash: this.passwordHash,
      });

      console.log(`✅ [AdminService] Initialized SuperAdmin account for ${AdminService.FIXED_ADMIN_EMAIL}`);
    }

    // Ensure user profile in Firestore
    const userDocRef = adminDb.collection('users').doc(AdminService.FIXED_ADMIN_ID);
    const userSnap = await userDocRef.get();

    if (!userSnap.exists) {
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
        createdAt: new Date().toISOString(),
        totalWins: 142,
        totalGamesPlayed: 320,
        totalDeposited: 30000,
        totalWithdrawn: 5000,
      };
      await userDocRef.set(adminUserObj);
      db.users.set(AdminService.FIXED_ADMIN_ID, adminUserObj);
    }

    // Load Settings
    const settingsSnap = await adminDb.collection('settings').doc('platformConfig').get();
    if (settingsSnap.exists) {
      this.systemSettings = { ...this.systemSettings, ...settingsSnap.data() };
    } else {
      await adminDb.collection('settings').doc('platformConfig').set(this.systemSettings);
    }

    // Load Bonus Configurations
    try {
      const bonusSnap = await adminDb.collection('settings').doc('bonusConfigs').get();
      if (bonusSnap.exists && bonusSnap.data()?.programs) {
        this.bonusPrograms = bonusSnap.data()!.programs;
      } else {
        await adminDb.collection('settings').doc('bonusConfigs').set({ programs: this.bonusPrograms });
      }
    } catch (e) {
      console.warn('⚠️ [AdminService] Error loading bonusConfigs:', e);
    }

    // Load Audit Logs
    const auditSnap = await adminDb.collection('auditLogs').orderBy('dateTime', 'desc').limit(100).get();
    this.detailedAuditLogs = auditSnap.docs.map((d) => d.data() as DetailedAuditLog);

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
   * Step 1: Admin Password Authentication & 2FA Dispatch
   */
  public async loginStep1(
    email: string,
    password: string,
    ipAddress?: string,
    deviceInfo?: string,
    browser?: string
  ): Promise<{ requires2FA: boolean; step2Token: string; message: string }> {
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
      await adminDb.collection('admins').doc(AdminService.FIXED_ADMIN_EMAIL).set(
        {
          passwordHash: this.passwordHash,
          lastPasswordChange: new Date().toISOString(),
        },
        { merge: true }
      );
      console.log('✅ [AdminService] Synchronized local password hash with Firebase Auth.');
    }

    // Reset failed counter on successful password
    this.failedLoginAttempts = 0;
    this.lockedUntil = null;

    // 4. Generate 6-Digit 2FA OTP Code
    const otpCode = Math.floor(100000 + Math.random() * 900000).toString();
    const step2Token = `step2_${Date.now()}_${Math.floor(Math.random() * 10000)}`;
    const expires = Date.now() + 10 * 60 * 1000; // 10 minutes

    this.pending2FASessions.set(step2Token, {
      code: otpCode,
      expires,
      ipAddress,
      deviceInfo,
    });

    // Send email notification with OTP
    await emailService.sendLoginVerificationCode(otpCode, ipAddress, deviceInfo);

    return {
      requires2FA: true,
      step2Token,
      message: `2-Step Verification code dispatched to ${AdminService.FIXED_ADMIN_EMAIL}`,
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
      await adminDb.collection('admins').doc(AdminService.FIXED_ADMIN_EMAIL).set(
        {
          lastLogin: now,
          lastLoginIp: ipAddress,
          lastDevice: deviceInfo,
        },
        { merge: true }
      );
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

    await adminDb.collection('admins').doc(AdminService.FIXED_ADMIN_EMAIL).set(
      {
        passwordHash: this.passwordHash,
        lastPasswordChange: now,
      },
      { merge: true }
    );

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

    adminDb.collection('auditLogs').doc(log.id).set(log).catch(console.error);

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
    if (settings.countdownDurationSeconds !== undefined && settings.countdownDurationSeconds < 5) {
      return { valid: false, error: 'Countdown duration must be at least 5 seconds' };
    }
    return { valid: true };
  }

  public async updateSystemSettings(
    newSettings: Partial<SystemSettingsConfig>,
    updatedBy: string = AdminService.FIXED_ADMIN_EMAIL,
    ipAddress?: string
  ): Promise<{ success: boolean; settings: SystemSettingsConfig; error?: string }> {
    const combined = { ...this.systemSettings, ...newSettings };
    const validation = this.validateSystemSettings(combined);
    if (!validation.valid) {
      return { success: false, settings: this.systemSettings, error: validation.error };
    }

    const changes: Record<string, { old: any; new: any }> = {};
    for (const key of Object.keys(newSettings) as (keyof SystemSettingsConfig)[]) {
      if (JSON.stringify(this.systemSettings[key]) !== JSON.stringify(newSettings[key])) {
        changes[key] = {
          old: this.systemSettings[key],
          new: newSettings[key],
        };
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
      adminDb.collection('settingsHistory').doc(historyRec.id).set(historyRec).catch(console.warn);
    }

    await adminDb.collection('settings').doc('platformConfig').set(this.systemSettings);
    await this.logAction('SETTINGS_CHANGE', 'SUCCESS', `Updated system settings: ${Object.keys(changes).join(', ')}`, ipAddress);

    return { success: true, settings: this.systemSettings };
  }

  public getBonusPrograms(): BonusProgram[] {
    return this.bonusPrograms;
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
    await adminDb.collection('settings').doc('bonusConfigs').set({ programs: this.bonusPrograms });
    await this.logAction('BONUS_SETTINGS_CHANGE', 'SUCCESS', `Updated ${programs.length} bonus program configurations`, ipAddress);

    return { success: true, bonusPrograms: this.bonusPrograms };
  }

  /**
   * Calculates Real-Time Dashboard Metrics
   */
  public async getDashboardMetrics(): Promise<SystemMetrics> {
    const allUsers = db.getAllUsers();
    const deposits = db.deposits;
    const withdrawals = db.withdrawals;
    const rooms = Array.from(db.rooms.values());

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
}

export const adminService = new AdminService();
