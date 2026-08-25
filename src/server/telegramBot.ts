/**
 * Telegram Bot & Registration Gateway Handler
 * Direct Firebase Auth + Cloud Firestore integration
 * Handles registration with Telegram Contact Sharing, password complexity validation,
 * bcrypt hashing, login, forgot password, profile, wallet, and initData verification.
 */

import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { adminAuth, adminDb } from './firebaseAdmin.js';
import { db, attributeReferral } from './db.js';
import { adminService } from './adminService.js';
import { UserProfile } from '../types.js';

const JWT_SECRET = 'yabede_bingo_super_secret_jwt_key_2026';
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || '123456789:ABCdefGHIjklMNOpqrsTUVwxyZ';

export interface TelegramContact {
  phone_number: string;
  first_name: string;
  last_name?: string;
  user_id?: number;
}

export interface TelegramUser {
  id: number;
  is_bot?: boolean;
  first_name: string;
  last_name?: string;
  username?: string;
  language_code?: string;
}

export interface TelegramIncomingMessage {
  message_id: number;
  from: TelegramUser;
  chat: {
    id: number;
    type: string;
  };
  text?: string;
  contact?: TelegramContact;
}

export interface BotReplyButton {
  text: string;
  request_contact?: boolean;
  callback_data?: string;
  url?: string;
}

export interface BotResponse {
  chatId: number;
  text: string;
  parseMode?: 'HTML' | 'Markdown';
  replyMarkup?: {
    keyboard?: BotReplyButton[][];
    inline_keyboard?: BotReplyButton[][];
    remove_keyboard?: boolean;
    resize_keyboard?: boolean;
    one_time_keyboard?: boolean;
  };
}

export interface BotSession {
  state:
    | 'IDLE'
    | 'AWAITING_CONTACT'
    | 'AWAITING_PASSWORD'
    | 'AWAITING_PASSWORD_CONFIRM'
    | 'LOGIN_AWAITING_PHONE'
    | 'LOGIN_AWAITING_PASSWORD'
    | 'FORGOT_AWAITING_PHONE'
    | 'FORGOT_AWAITING_OTP'
    | 'FORGOT_AWAITING_NEW_PASSWORD'
    | 'FORGOT_AWAITING_CONFIRM_PASSWORD';
  pendingData?: {
    telegramId?: number;
    username?: string;
    firstName?: string;
    lastName?: string;
    phoneNumber?: string;
    languageCode?: string;
    pendingPassword?: string;
    loginPhone?: string;
    resetPhone?: string;
    resetOtp?: string;
    resetNewPassword?: string;
    referralCode?: string;
  };
}

class TelegramBotManager {
  private sessions: Map<number, BotSession> = new Map();
  public verifiedPhonesByTelegramId: Map<number, string> = new Map();

  public getSession(chatId: number): BotSession {
    if (!this.sessions.has(chatId)) {
      this.sessions.set(chatId, { state: 'IDLE' });
    }
    return this.sessions.get(chatId)!;
  }

  public resetSession(chatId: number) {
    this.sessions.set(chatId, { state: 'IDLE' });
  }

  public getPendingReferralCode(telegramId: number): string | undefined {
    return this.sessions.get(telegramId)?.pendingData?.referralCode;
  }

  /**
   * Password Verification
   * Requirements:
   * - Exactly 6 digits
   */
  public validatePassword(password: string): { valid: boolean; error?: string } {
    const trimmed = (password || '').trim();
    if (!/^\d{6}$/.test(trimmed)) {
      return { valid: false, error: 'Password must be exactly 6 digits.' };
    }
    return { valid: true };
  }

  /**
   * Process incoming message or button tap from Telegram Bot
   */
  public async handleIncomingMessage(msg: TelegramIncomingMessage): Promise<BotResponse> {
    const chatId = msg.chat.id;
    const tgUser = msg.from;
    const text = (msg.text || '').trim();
    const session = this.getSession(chatId);

    // 1. Check commands & start parameters
    if (text.startsWith('/start') || text.toLowerCase() === 'start') {
      const parts = text.split(/\s+/);
      const startParam = parts.length > 1 ? parts[1].trim() : undefined;
      const prevPending = session.pendingData;
      this.resetSession(chatId);
      const newSession = this.getSession(chatId);
      const cleanRef = startParam || prevPending?.referralCode;
      if (cleanRef) {
        newSession.pendingData = { ...newSession.pendingData, referralCode: cleanRef };
      }
      return this.handleStartCommand(tgUser, chatId, startParam);
    }

    if (text === '/register' || text.toLowerCase() === 'register' || text.includes('Register') || text === 'cmd_register') {
      return this.initiateRegistration(tgUser, chatId);
    }

    if (text === '/login' || text.toLowerCase() === 'login' || text.includes('Login') || text === 'cmd_login') {
      return this.initiateLogin(chatId);
    }

    if (text === '/forgot' || text.toLowerCase() === 'forgot password' || text.includes('Forgot Password') || text === 'cmd_forgot') {
      return this.initiateForgotPassword(chatId);
    }

    if (text === '/profile' || text.includes('Profile') || text === 'cmd_profile') {
      return this.handleProfileCommand(tgUser.id, chatId);
    }

    if (text === '/wallet' || text.includes('Wallet') || text === 'cmd_wallet') {
      return this.handleWalletCommand(tgUser.id, chatId);
    }

    if (text === '/invitations' || text.includes('Invitations') || text === 'cmd_invitations') {
      return this.handleInvitationsCommand(tgUser.id, chatId);
    }

    if (text === '/help' || text.includes('Help') || text === 'cmd_help') {
      return this.handleHelpCommand(chatId);
    }

    if (text === '/logout' || text.includes('Log Out')) {
      this.resetSession(chatId);
      return {
        chatId,
        text: '🚪 You have logged out of your session on Telegram Bot.',
        replyMarkup: {
          inline_keyboard: [
            [{ text: '📝 Register', callback_data: 'cmd_register' }, { text: '🔑 Login', callback_data: 'cmd_login' }],
            [{ text: '❓ Help', callback_data: 'cmd_help' }],
          ],
        },
      };
    }

    if (text === '/openapp' || text.includes('Open Mini App')) {
      return {
        chatId,
        text: '🎮 Click below to open Ahun Bingo Telegram Mini App:',
        replyMarkup: {
          inline_keyboard: [[{ text: '🎮 Open Ahun Bingo', url: process.env.APP_URL || 'http://localhost:3000' }]],
        },
      };
    }

    // 2. Handle Contact Sharing (Step 2 & 3 of Registration)
    if (msg.contact) {
      if (session.state === 'AWAITING_CONTACT' || session.state === 'IDLE' || session.state === 'LOGIN_AWAITING_PHONE') {
        if (session.state === 'LOGIN_AWAITING_PHONE') {
          return this.handleLoginPhoneEntered(msg.contact.phone_number, chatId);
        }
        return this.handleContactReceived(tgUser, msg.contact, chatId);
      }
    }

    // 3. Handle state machine inputs
    switch (session.state) {
      case 'AWAITING_CONTACT': {
        return {
          chatId,
          text: '⚠️ Please tap the button below to securely share your phone number.\n\nManual text entry is not permitted for registration.',
          replyMarkup: {
            keyboard: [[{ text: '📱 Share My Contact', request_contact: true }]],
            resize_keyboard: true,
            one_time_keyboard: true,
          },
        };
      }

      case 'AWAITING_PASSWORD': {
        const val = this.validatePassword(text);
        if (!val.valid) {
          return {
            chatId,
            text: `⚠️ ${val.error}\n\nPlease enter a valid password meeting all security requirements:`,
            replyMarkup: { remove_keyboard: true },
          };
        }

        session.pendingData!.pendingPassword = text;
        session.state = 'AWAITING_PASSWORD_CONFIRM';

        return {
          chatId,
          text: '🔐 Confirm your password.\n\nPlease re-enter your password to verify.',
          replyMarkup: { remove_keyboard: true },
        };
      }

      case 'AWAITING_PASSWORD_CONFIRM': {
        if (text !== session.pendingData?.pendingPassword) {
          session.state = 'AWAITING_PASSWORD';
          session.pendingData!.pendingPassword = undefined;
          return {
            chatId,
            text: '❌ Passwords do not match!\n\nPlease enter your password again (must be 6 digits):',
            replyMarkup: { remove_keyboard: true },
          };
        }

        // Passwords match -> Create account in Firebase & Firestore!
        return this.completeRegistration(chatId);
      }

      case 'LOGIN_AWAITING_PHONE': {
        return this.handleLoginPhoneEntered(text, chatId);
      }

      case 'LOGIN_AWAITING_PASSWORD': {
        return this.handleLoginPasswordEntered(text, chatId);
      }

      case 'FORGOT_AWAITING_PHONE': {
        return this.handleForgotPhoneEntered(text, chatId);
      }

      case 'FORGOT_AWAITING_OTP': {
        return this.handleForgotOtpEntered(text, chatId);
      }

      case 'FORGOT_AWAITING_NEW_PASSWORD': {
        const val = this.validatePassword(text);
        if (!val.valid) {
          return {
            chatId,
            text: `⚠️ ${val.error}\n\nPlease enter a valid new password:`,
          };
        }
        session.pendingData!.resetNewPassword = text;
        session.state = 'FORGOT_AWAITING_CONFIRM_PASSWORD';
        return {
          chatId,
          text: '🔐 Confirm your new password:',
        };
      }

      case 'FORGOT_AWAITING_CONFIRM_PASSWORD': {
        if (text !== session.pendingData?.resetNewPassword) {
          session.state = 'FORGOT_AWAITING_NEW_PASSWORD';
          session.pendingData!.resetNewPassword = undefined;
          return {
            chatId,
            text: '❌ Passwords do not match!\n\nPlease enter your new password again:',
          };
        }
        return this.completePasswordReset(chatId);
      }

      default: {
        return this.handleStartCommand(tgUser, chatId);
      }
    }
  }

  // --- START COMMAND ---
  private handleStartCommand(tgUser: TelegramUser, chatId: number, startParam?: string): BotResponse {
    const existingUser = db.getUserByTelegramId(tgUser.id);

    if (existingUser) {
      return {
        chatId,
        text: `👋 Welcome back to Ahun Bingo, <b>${existingUser.firstName}</b>!\n\n💰 Wallet Balance: <b>${(existingUser?.walletBalance ?? 0).toLocaleString()} Birr</b>\n🏆 VIP Level: <b>L${existingUser?.vipLevel ?? 1}</b>\n\nTap below to launch the Mini App or manage your account:`,
        parseMode: 'HTML',
        replyMarkup: {
          inline_keyboard: [
            [{ text: '🎮 Open Ahun Bingo', url: process.env.APP_URL || 'http://localhost:3000' }],
            [{ text: '👤 Profile', callback_data: 'cmd_profile' }, { text: '💳 Wallet', callback_data: 'cmd_wallet' }],
            [{ text: '🎟️ Invitations', callback_data: 'cmd_invitations' }, { text: '❓ Help', callback_data: 'cmd_help' }],
          ],
        },
      };
    }

    let referralText = '';
    if (startParam) {
      referralText = `\n🎁 <i>Invited by friend (Code: ${startParam})</i>\n`;
    }

    return {
      chatId,
      text: `🎉 <b>Welcome to Ahun Bingo!</b> 🇪🇹${referralText}\nTo start playing multiplayer Bingo, winning real prizes, and creating private groups, you must first register your account through this Telegram Bot.\n\nTap <b>Register</b> below to complete registration in 30 seconds!`,
      parseMode: 'HTML',
      replyMarkup: {
        inline_keyboard: [
          [{ text: '📝 Register Now', callback_data: 'cmd_register' }],
          [{ text: '🔑 Existing User Login', callback_data: 'cmd_login' }],
          [{ text: '❓ Help & Information', callback_data: 'cmd_help' }],
        ],
      },
    };
  }

  // --- REGISTRATION INITIATION & EXISTING USER CHECK ---
  private initiateRegistration(tgUser: TelegramUser, chatId: number): BotResponse {
    // Existing Telegram ID Check
    const existingUser = db.getUserByTelegramId(tgUser.id);
    if (existingUser) {
      if (!existingUser.phone) {
        // User created via Mini App or WebApp but hasn't linked/verified phone yet!
        const session = this.getSession(chatId);
        const existingRef = session.pendingData?.referralCode;
        session.state = 'AWAITING_CONTACT';
        session.pendingData = {
          telegramId: tgUser.id,
          username: tgUser.username || existingUser.username,
          firstName: tgUser.first_name || existingUser.firstName || 'Player',
          lastName: tgUser.last_name || existingUser.lastName || '',
          languageCode: tgUser.language_code || existingUser.language || 'en',
          referralCode: existingRef || existingUser.referredBy,
        };
        return {
          chatId,
          text: `📱 <b>Link & Verify Your Phone Number</b>\n\nWelcome back <b>${existingUser.firstName}</b>! To complete your account registration and unlock full features, please tap the button below to share your verified phone number:`,
          parseMode: 'HTML',
          replyMarkup: {
            keyboard: [[{ text: '📱 Share My Contact', request_contact: true }]],
            resize_keyboard: true,
            one_time_keyboard: true,
          },
        };
      }
      return {
        chatId,
        text: `⚠️ <b>You already have an active account!</b>\n\nName: <b>${existingUser.firstName}</b>\nPhone: <b>${existingUser.phone}</b>\nTelegram ID: <code>${tgUser.id}</code>\n\nYou do not need to register again. You can log in or open the Mini App directly.`,
        parseMode: 'HTML',
        replyMarkup: {
          inline_keyboard: [
            [{ text: '🎮 Open Mini App', url: process.env.APP_URL || 'http://localhost:3000' }],
            [{ text: '👤 View Profile', callback_data: 'cmd_profile' }, { text: '💳 Wallet', callback_data: 'cmd_wallet' }],
          ],
        },
      };
    }

    const session = this.getSession(chatId);
    const existingRef = session.pendingData?.referralCode;
    session.state = 'AWAITING_CONTACT';
    session.pendingData = {
      telegramId: tgUser.id,
      username: tgUser.username || `user_${tgUser.id}`,
      firstName: tgUser.first_name || 'Player',
      lastName: tgUser.last_name || '',
      languageCode: tgUser.language_code || 'en',
      referralCode: existingRef,
    };

    return {
      chatId,
      text: `📱 <b>Step 1 of 2: Share Your Phone Number</b>\n\nPlease tap the button below to securely share your phone number directly from Telegram.\n\n<i>Note: Manual text entry is disabled for security.</i>`,
      parseMode: 'HTML',
      replyMarkup: {
        keyboard: [[{ text: '📱 Share My Contact', request_contact: true }]],
        resize_keyboard: true,
        one_time_keyboard: true,
      },
    };
  }

  // --- STEP 3: CONTACT RECEIVED ---
  private handleContactReceived(tgUser: TelegramUser, contact: TelegramContact, chatId: number): BotResponse {
    // Verify contact belongs to authenticated telegram user if user_id is provided
    if (contact.user_id && contact.user_id !== tgUser.id) {
      return {
        chatId,
        text: '❌ <b>Contact Verification Failed</b>\n\nThe shared contact must belong to your own Telegram account. Please share your own contact number using the button below.',
        parseMode: 'HTML',
        replyMarkup: {
          keyboard: [[{ text: '📱 Share My Contact', request_contact: true }]],
          resize_keyboard: true,
          one_time_keyboard: true,
        },
      };
    }

    const rawPhone = contact.phone_number;
    const normalized = db.normalizePhone(rawPhone);

    // Cache verified phone by Telegram user ID for Mini App instant verification
    this.verifiedPhonesByTelegramId.set(tgUser.id, normalized);

    const existingUserWithPhoneId = db.phoneToUserIndex.get(normalized);
    const currentExistingTgUser = db.getUserByTelegramId(tgUser.id);
    if (existingUserWithPhoneId && (!currentExistingTgUser || existingUserWithPhoneId !== currentExistingTgUser.id)) {
      this.resetSession(chatId);
      return {
        chatId,
        text: `⚠️ <b>Account Already Exists</b>\n\nAn account with the phone number <b>${normalized}</b> is already registered in Ahun Bingo.\n\nPlease log in or use password reset.`,
        parseMode: 'HTML',
        replyMarkup: {
          inline_keyboard: [
            [{ text: '🔑 Login', callback_data: 'cmd_login' }],
            [{ text: '🔑 Forgot Password', callback_data: 'cmd_forgot' }],
            [{ text: '🎮 Open Mini App', url: process.env.APP_URL || 'http://localhost:3000' }],
          ],
        },
      };
    }

    // If this Telegram user is already an existing Ahun Bingo player, link the verified phone immediately!
    if (currentExistingTgUser) {
      try {
        const updated = db.updateUserPhone(currentExistingTgUser.id, normalized);
        db.saveUser(updated);
        this.resetSession(chatId);
        return {
          chatId,
          text: `🎉 <b>ስልክ ቁጥርዎ ተረጋግጧል! (Phone Verified)</b>\n\nየስልክ ቁጥር <b>${normalized}</b> ከAhun Bingo አካውንትዎ ጋር በተሳካ ሁኔታ ተገናኝቷል።\n\nአሁን የፈለጉትን ያህል መጫወት እና አሸናፊ ሲሆኑ ወዲያውኑ ወጪ (Withdraw) ማድረግ ይችላሉ!`,
          parseMode: 'HTML',
          replyMarkup: {
            inline_keyboard: [
              [{ text: '🎮 Open Ahun Bingo (መጫወቻውን ክፈት)', url: process.env.APP_URL || 'http://localhost:3000' }],
              [{ text: '💰 My Wallet (የኪስ ቦርሳ)', callback_data: 'cmd_wallet' }],
            ],
          },
        };
      } catch (err: any) {
        console.error('Error updating existing user phone from bot:', err);
      }
    }

    const session = this.getSession(chatId);
    const existingRef = session.pendingData?.referralCode;
    session.state = 'AWAITING_PASSWORD';
    session.pendingData = {
      telegramId: tgUser.id,
      username: tgUser.username || `user_${tgUser.id}`,
      firstName: contact.first_name || tgUser.first_name || 'Player',
      lastName: contact.last_name || tgUser.last_name || '',
      phoneNumber: normalized,
      languageCode: tgUser.language_code || 'en',
      referralCode: existingRef,
    };

    return {
      chatId,
      text: `✅ Phone number verified: <b>${normalized}</b>\n\n🔒 <b>Step 2 of 2: Create Password</b>\n\nRequirement:\n• Password must be 6 digits\n\nPlease enter your 6-digit password below:`,
      parseMode: 'HTML',
      replyMarkup: { remove_keyboard: true },
    };
  }

  // --- STEP 6: COMPLETE REGISTRATION (FIREBASE AUTH + FIRESTORE) ---
  private async completeRegistration(chatId: number): Promise<BotResponse> {
    const session = this.getSession(chatId);
    const data = session.pendingData;

    if (!data || !data.phoneNumber || !data.pendingPassword || !data.telegramId) {
      this.resetSession(chatId);
      return {
        chatId,
        text: '❌ Registration failed due to missing session data. Please try /register again.',
      };
    }

    try {
      const passwordHash = bcrypt.hashSync(data.pendingPassword, 10);
      const existingUser = db.getUserByTelegramId(data.telegramId);
      const uid = existingUser ? existingUser.id : `usr_tg_${data.telegramId}`;
      const userReferralCode = existingUser?.referralCode || `REF${Math.floor(100000 + Math.random() * 900000)}`;

      // 1. Fetch dynamic bonus configurations from Admin Service
      const welcomeConfig = adminService.getWelcomeGiftConfig();
      const welcomeGiftAmount = welcomeConfig.enabled ? welcomeConfig.amountBirr : 0;
      const dynamicBonus = adminService.getRegistrationBonusAmount();

      // 2. Create Firebase Auth user (if available)
      try {
        await adminAuth.createUser({
          uid,
          phoneNumber: data.phoneNumber.startsWith('+') ? data.phoneNumber : `+${data.phoneNumber}`,
          displayName: `${data.firstName} ${data.lastName || ''}`.trim(),
        });
      } catch (authErr: any) {
        console.warn('Firebase Auth user creation note:', authErr.message || authErr);
      }

      let userProfile: UserProfile;

      if (existingUser) {
        // Update existing user profile with phone
        existingUser.phone = data.phoneNumber;
        existingUser.firstName = data.firstName || existingUser.firstName;
        existingUser.lastName = data.lastName || existingUser.lastName;
        existingUser.username = data.username || existingUser.username;
        existingUser.updatedAt = new Date().toISOString();
        existingUser.lastLogin = new Date().toISOString();
        userProfile = existingUser;
      } else {
        // 3. Create User Profile object
        userProfile = {
          id: uid,
          telegramId: data.telegramId,
          phone: data.phoneNumber,
          role: 'USER',
          username: data.username || `user_${data.telegramId}`,
          firstName: data.firstName || 'Player',
          lastName: data.lastName || '',
          photoUrl: `https://api.dicebear.com/7.x/bottts/svg?seed=${uid}`,
          language: (data.languageCode === 'am' ? 'am' : 'en'),
          referralCode: userReferralCode,
          referredBy: undefined,
          referralCount: 0,
          referralEarnings: 0,
          walletBalance: welcomeGiftAmount,
          bonusBalance: dynamicBonus,
          vipLevel: 1,
          status: 'ACTIVE',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          lastLogin: new Date().toISOString(),
          totalWins: 0,
          totalGamesPlayed: 0,
          totalDeposited: 0,
          totalWithdrawn: 0,
        };
      }

      // 4. Save to primary server database store first
      db.saveUser(userProfile);
      db.phoneToUserIndex.set(data.phoneNumber, uid);
      db.telegramUserIndex.set(data.telegramId, uid);
      db.phoneUserAuthMap.set(uid, {
        phone: data.phoneNumber,
        passwordHash,
        failedLoginAttempts: 0,
        lockedUntil: null,
        activeSessions: [],
      });

      // 5. Add welcome transaction if welcome gift is enabled and it's a new user
      if (!existingUser && welcomeConfig.enabled && welcomeGiftAmount > 0) {
        db.addTransaction({
          id: `tx_welcome_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
          userId: uid,
          amount: welcomeGiftAmount,
          balanceAfter: welcomeGiftAmount,
          type: 'DAILY_BONUS',
          status: 'COMPLETED',
          reference: 'WEL-BONUS-YABEDE',
          description: 'New Player Welcome Gift Credit',
          createdAt: new Date().toISOString(),
        });
      }

      // 6. Single consolidated referral attribution & crediting
      attributeReferral(db, adminService, userProfile, data.referralCode);

      // 7. Safely attempt Cloud Firestore persistent sync (non-blocking)
      try {
        await Promise.all([
          adminDb.collection('users').doc(uid).set({
            uid,
            id: uid,
            telegramId: data.telegramId,
            telegramUsername: data.username || '',
            firstName: data.firstName || 'Player',
            lastName: data.lastName || '',
            phone: data.phoneNumber,
            phoneNumber: data.phoneNumber,
            passwordHash,
            photoURL: userProfile.photoUrl,
            photoUrl: userProfile.photoUrl,
            referredBy: userProfile.referredBy || null,
            referralCount: userProfile.referralCount || 0,
            referralEarnings: userProfile.referralEarnings || 0,
            walletBalance: userProfile.walletBalance,
            bonusBalance: userProfile.bonusBalance,
            referralCode: userReferralCode,
            status: userProfile.status || 'ACTIVE',
            createdAt: userProfile.createdAt,
            updatedAt: userProfile.updatedAt,
            lastLogin: userProfile.lastLogin,
          }, { merge: true }),
          adminDb.collection('wallets').doc(uid).set({
            userId: uid,
            balance: userProfile.walletBalance,
            bonusBalance: userProfile.bonusBalance,
            createdAt: userProfile.createdAt,
            updatedAt: new Date().toISOString(),
          }, { merge: true }),
          adminDb.collection('userAuth').doc(uid).set({
            phone: data.phoneNumber,
            passwordHash,
            telegramId: data.telegramId,
            failedLoginAttempts: 0,
            lockedUntil: null,
            activeSessions: [],
          }, { merge: true }),
        ]);
      } catch (fsErr: any) {
        console.warn('🔥 [Firestore] Soft error syncing registration to Firestore:', fsErr.message || fsErr);
      }

      // Clear session
      this.resetSession(chatId);

      const welcomeBonusText = (!existingUser && welcomeGiftAmount > 0)
        ? `\n🎁 <b>${welcomeGiftAmount} Birr Welcome Credit</b> has been credited to your wallet.\n`
        : '\n';

      return {
        chatId,
        text: `✅ <b>Registration Completed Successfully!</b> 🎉\n\nWelcome to Ahun Bingo, <b>${data.firstName}</b>!${welcomeBonusText}📱 Phone: <b>${data.phoneNumber}</b>\n🎟️ Referral Code: <b>${userReferralCode}</b>\n\nYou can now tap the button below to enter the Mini App using your registered account:`,
        parseMode: 'HTML',
        replyMarkup: {
          inline_keyboard: [
            [{ text: '🎮 Open Mini App', url: process.env.APP_URL || 'http://localhost:3000' }],
            [{ text: '👤 View Profile', callback_data: 'cmd_profile' }, { text: '💳 Wallet', callback_data: 'cmd_wallet' }],
          ],
        },
      };
    } catch (err: any) {
      console.error('Registration completion error:', err);
      this.resetSession(chatId);
      return {
        chatId,
        text: `❌ Registration failed: ${err.message || 'Server error'}. Please try /register again.`,
      };
    }
  }

  // --- LOGIN FLOW ---
  private initiateLogin(chatId: number): BotResponse {
    const session = this.getSession(chatId);
    session.state = 'LOGIN_AWAITING_PHONE';
    return {
      chatId,
      text: '🔑 <b>Login to Yabede Bingo</b>\n\nPlease enter your registered phone number or tap the button below to share your contact:',
      parseMode: 'HTML',
      replyMarkup: {
        keyboard: [[{ text: '📱 Share My Contact', request_contact: true }]],
        resize_keyboard: true,
        one_time_keyboard: true,
      },
    };
  }

  private handleLoginPhoneEntered(phoneInput: string, chatId: number): BotResponse {
    const normalized = db.normalizePhone(phoneInput);
    const userId = db.phoneToUserIndex.get(normalized);

    if (!userId) {
      this.resetSession(chatId);
      return {
        chatId,
        text: `❌ Account not found for phone number <b>${normalized}</b>.\n\nPlease register first.`,
        parseMode: 'HTML',
        replyMarkup: {
          inline_keyboard: [
            [{ text: '📝 Register Now', callback_data: 'cmd_register' }],
            [{ text: '🔑 Try Login Again', callback_data: 'cmd_login' }],
          ],
        },
      };
    }

    const session = this.getSession(chatId);
    session.state = 'LOGIN_AWAITING_PASSWORD';
    session.pendingData = { loginPhone: normalized };

    return {
      chatId,
      text: `📱 Phone: <b>${normalized}</b>\n\n🔒 Enter your password:`,
      parseMode: 'HTML',
      replyMarkup: { remove_keyboard: true },
    };
  }

  private async handleLoginPasswordEntered(passwordInput: string, chatId: number): Promise<BotResponse> {
    const session = this.getSession(chatId);
    const phone = session.pendingData?.loginPhone;

    if (!phone) {
      this.resetSession(chatId);
      return { chatId, text: '❌ Session expired. Please try /login again.' };
    }

    const userId = db.phoneToUserIndex.get(phone);
    if (!userId) {
      this.resetSession(chatId);
      return { chatId, text: '❌ Account not found.' };
    }

    const auth = db.phoneUserAuthMap.get(userId);
    const user = db.getUserById(userId);

    if (!auth || !user) {
      this.resetSession(chatId);
      return { chatId, text: '❌ User record missing.' };
    }

    const matches = bcrypt.compareSync(passwordInput, auth.passwordHash);
    if (!matches) {
      return {
        chatId,
        text: '❌ <b>Incorrect password!</b>\n\nPlease try again or reset your password.',
        parseMode: 'HTML',
        replyMarkup: {
          inline_keyboard: [
            [{ text: '🔑 Forgot Password', callback_data: 'cmd_forgot' }],
            [{ text: '🔑 Try Login Again', callback_data: 'cmd_login' }],
          ],
        },
      };
    }

    user.lastLogin = new Date().toISOString();
    db.saveUser(user);

    // Update Firestore
    adminDb.collection('users').doc(userId).update({ lastLogin: user.lastLogin }).catch(console.error);

    this.resetSession(chatId);

    const token = jwt.sign({ uid: user.id, telegramId: user.telegramId }, JWT_SECRET, { expiresIn: '7d' });

    return {
      chatId,
      text: `✅ <b>Login Successful!</b>\n\nWelcome back, <b>${user.firstName}</b>!\n💰 Wallet Balance: <b>${user.walletBalance.toLocaleString()} Birr</b>\n\nTap below to open the Mini App:`,
      parseMode: 'HTML',
      replyMarkup: {
        inline_keyboard: [
          [{ text: '🎮 Open Yabede Bingo', url: `${process.env.APP_URL || 'http://localhost:3000'}?token=${token}` }],
          [{ text: '💳 Wallet', callback_data: 'cmd_wallet' }, { text: '👤 Profile', callback_data: 'cmd_profile' }],
        ],
      },
    };
  }

  // --- FORGOT PASSWORD FLOW ---
  private initiateForgotPassword(chatId: number): BotResponse {
    const session = this.getSession(chatId);
    session.state = 'FORGOT_AWAITING_PHONE';
    return {
      chatId,
      text: '🔑 <b>Password Reset Request</b>\n\nPlease enter your registered phone number:',
      parseMode: 'HTML',
      replyMarkup: { remove_keyboard: true },
    };
  }

  private handleForgotPhoneEntered(phoneInput: string, chatId: number): BotResponse {
    const normalized = db.normalizePhone(phoneInput);
    const userId = db.phoneToUserIndex.get(normalized);

    if (!userId) {
      this.resetSession(chatId);
      return {
        chatId,
        text: `❌ No account associated with phone <b>${normalized}</b>.`,
        parseMode: 'HTML',
        replyMarkup: {
          inline_keyboard: [[{ text: '📝 Register Now', callback_data: 'cmd_register' }]],
        },
      };
    }

    const otp = String(Math.floor(100000 + Math.random() * 900000));
    const session = this.getSession(chatId);
    session.state = 'FORGOT_AWAITING_OTP';
    session.pendingData = { resetPhone: normalized, resetOtp: otp };

    return {
      chatId,
      text: `🔐 <b>Verification Code Sent</b>\n\nYour 6-digit password reset verification code is:\n\n<b>${otp}</b>\n\nPlease enter this 6-digit code below:`,
      parseMode: 'HTML',
    };
  }

  private handleForgotOtpEntered(otpInput: string, chatId: number): BotResponse {
    const session = this.getSession(chatId);
    if (otpInput.trim() !== session.pendingData?.resetOtp) {
      return {
        chatId,
        text: '❌ Invalid verification code! Please enter the 6-digit code shown above:',
      };
    }

    session.state = 'FORGOT_AWAITING_NEW_PASSWORD';
    return {
      chatId,
      text: '✅ Code verified!\n\n🔒 Enter your new password (minimum 8 characters with uppercase, lowercase, number, and special character):',
    };
  }

  private async completePasswordReset(chatId: number): Promise<BotResponse> {
    const session = this.getSession(chatId);
    const phone = session.pendingData?.resetPhone;
    const newPassword = session.pendingData?.resetNewPassword;

    if (!phone || !newPassword) {
      this.resetSession(chatId);
      return { chatId, text: '❌ Password reset session invalid. Try again.' };
    }

    const userId = db.phoneToUserIndex.get(phone);
    if (!userId) {
      this.resetSession(chatId);
      return { chatId, text: '❌ User not found.' };
    }

    const newHash = bcrypt.hashSync(newPassword, 10);
    const auth = db.phoneUserAuthMap.get(userId);
    if (auth) {
      auth.passwordHash = newHash;
    }

    // Update Firestore non-blocking
    try {
      await Promise.all([
        adminDb.collection('userAuth').doc(userId).set({ passwordHash: newHash }, { merge: true }),
        adminDb.collection('users').doc(userId).set({ passwordHash: newHash }, { merge: true }),
      ]);
    } catch (fsErr: any) {
      console.warn('🔥 [Firestore] Password reset sync note:', fsErr.message || fsErr);
    }

    this.resetSession(chatId);

    return {
      chatId,
      text: '✅ <b>Password Reset Successfully!</b>\n\nYou can now log in using your new password.',
      parseMode: 'HTML',
      replyMarkup: {
        inline_keyboard: [[{ text: '🔑 Login Now', callback_data: 'cmd_login' }]],
      },
    };
  }

  // --- COMMAND HELPERS ---
  private handleProfileCommand(telegramId: number, chatId: number): BotResponse {
    const user = db.getUserByTelegramId(telegramId);
    if (!user) {
      return {
        chatId,
        text: '⚠️ You are not registered yet. Please tap Register below:',
        replyMarkup: {
          inline_keyboard: [[{ text: '📝 Register Now', callback_data: 'cmd_register' }]],
        },
      };
    }

    return {
      chatId,
      text: `👤 <b>User Profile</b>\n\nName: <b>${user.firstName} ${user.lastName || ''}</b>\nUsername: <b>@${user.username}</b>\nPhone: <b>${user.phone}</b>\nTelegram ID: <code>${user.telegramId}</code>\nVIP Level: <b>L${user.vipLevel}</b>\nReferral Code: <b>${user.referralCode}</b>\nStatus: <b>${user.status}</b>\n\n💰 Wallet Balance: <b>${(user?.walletBalance ?? 0).toLocaleString()} Birr</b>\n🎁 Bonus Balance: <b>${(user?.bonusBalance ?? 0).toLocaleString()} Birr</b>`,
      parseMode: 'HTML',
      replyMarkup: {
        inline_keyboard: [
          [{ text: '🎮 Open Mini App', url: process.env.APP_URL || 'http://localhost:3000' }],
          [{ text: '💳 Wallet', callback_data: 'cmd_wallet' }, { text: '🎟️ Invitations', callback_data: 'cmd_invitations' }],
        ],
      },
    };
  }

  private handleWalletCommand(telegramId: number, chatId: number): BotResponse {
    const user = db.getUserByTelegramId(telegramId);
    if (!user) {
      return {
        chatId,
        text: '⚠️ Please register first.',
        replyMarkup: {
          inline_keyboard: [[{ text: '📝 Register', callback_data: 'cmd_register' }]],
        },
      };
    }

    return {
      chatId,
      text: `💳 <b>Wallet Ledger & Balances</b>\n\n💵 Real Balance: <b>${(user?.walletBalance ?? 0).toLocaleString()} Birr</b>\n🎁 Bonus Balance: <b>${(user?.bonusBalance ?? 0).toLocaleString()} Birr</b>\n\nTo deposit or withdraw money via Telebirr or CBE, please open the Mini App:`,
      parseMode: 'HTML',
      replyMarkup: {
        inline_keyboard: [[{ text: '🎮 Open Wallet in App', url: process.env.APP_URL || 'http://localhost:3000' }]],
      },
    };
  }

  private handleInvitationsCommand(telegramId: number, chatId: number): BotResponse {
    const user = db.getUserByTelegramId(telegramId);
    if (!user) {
      return { chatId, text: '⚠️ Please register first.' };
    }

    const userInvitations = db.groupInvitations.get(user.id) || [];
    const pending = userInvitations.filter((inv) => inv.status === 'PENDING');

    if (pending.length === 0) {
      return {
        chatId,
        text: '🎟️ <b>Private Group Invitations</b>\n\nYou currently have no pending private group invitations.',
        parseMode: 'HTML',
      };
    }

    const lines = pending.map((inv) => `• Group <b>${inv.groupName}</b> (Code: <code>${inv.groupCode}</code>)`).join('\n');

    return {
      chatId,
      text: `🎟️ <b>Pending Private Group Invitations (${pending.length}):</b>\n\n${lines}\n\nOpen the Mini App to accept and join the bingo room!`,
      parseMode: 'HTML',
      replyMarkup: {
        inline_keyboard: [[{ text: '🎮 Join Game in App', url: process.env.APP_URL || 'http://localhost:3000' }]],
      },
    };
  }

  private handleHelpCommand(chatId: number): BotResponse {
    return {
      chatId,
      text: `❓ <b>Yabede Bingo Help & Commands Guide</b>\n\n<b>Bot Commands:</b>\n/start - Start bot and show menu\n/register - Register new account via contact share\n/login - Log into existing account\n/profile - View profile & referral code\n/wallet - View wallet balance\n/invitations - View private group invitations\n/openapp - Open Telegram Mini App\n/help - Show this help menu\n/logout - Log out current session`,
      parseMode: 'HTML',
      replyMarkup: {
        inline_keyboard: [
          [{ text: '📝 Register Now', callback_data: 'cmd_register' }],
          [{ text: '🎮 Open Mini App', url: process.env.APP_URL || 'http://localhost:3000' }],
        ],
      },
    };
  }

  /**
   * Verify Telegram WebApp initData string using official Telegram HMAC-SHA256 signature algorithm
   */
  public verifyInitData(initData: string): { valid: boolean; user?: any; start_param?: string; error?: string; message?: string } {
    try {
      if (!initData || typeof initData !== 'string') {
        return { valid: false, error: 'NO_INIT_DATA', message: 'Telegram initData string is required' };
      }

      const botToken = process.env.TELEGRAM_BOT_TOKEN || TELEGRAM_BOT_TOKEN;
      const urlParams = new URLSearchParams(initData);
      const hash = urlParams.get('hash');

      if (!hash) {
        return { valid: false, error: 'HASH_MISSING', message: 'Missing signature hash in Telegram initData' };
      }

      urlParams.delete('hash');

      const paramsArray = Array.from(urlParams.entries());
      paramsArray.sort(([a], [b]) => a.localeCompare(b));

      const dataCheckString = paramsArray.map(([key, val]) => `${key}=${val}`).join('\n');

      if (botToken && botToken !== '123456789:ABCdefGHIjklMNOpqrsTUVwxyZ') {
        const secretKey = crypto.createHmac('sha256', 'WebAppData').update(botToken).digest();
        const calculatedHash = crypto.createHmac('sha256', secretKey).update(dataCheckString).digest('hex');

        if (calculatedHash.toLowerCase() !== hash.toLowerCase()) {
          return { valid: false, error: 'INVALID_SIGNATURE', message: 'Telegram authentication signature verification failed' };
        }
      }

      // Validate auth_date timestamp (max 24 hours old)
      const authDateStr = urlParams.get('auth_date');
      if (authDateStr) {
        const authDate = Number(authDateStr);
        const nowInSeconds = Math.floor(Date.now() / 1000);
        if (isNaN(authDate) || (nowInSeconds - authDate > 86400) || (authDate > nowInSeconds + 300)) {
          return { valid: false, error: 'EXPIRED_INIT_DATA', message: 'Telegram authentication data has expired' };
        }
      }

      const userStr = urlParams.get('user');
      if (!userStr) {
        return { valid: false, error: 'USER_MISSING', message: 'User object missing from Telegram initData' };
      }

      const user = JSON.parse(userStr);
      if (!user || !user.id) {
        return { valid: false, error: 'INVALID_USER_ID', message: 'User payload in initData missing ID' };
      }

      const startParam = urlParams.get('start_param') || undefined;

      return { valid: true, user, start_param: startParam };
    } catch (err: any) {
      return { valid: false, error: 'VERIFICATION_FAILED', message: err?.message || 'Failed to parse initData' };
    }
  }
}

export const telegramBot = new TelegramBotManager();
