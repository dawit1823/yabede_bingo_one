/**
 * Express REST API Router for Yabede Bingo
 * Manual Payment Approval System, Wallet Ledger, Payment Methods, Admin & System Audit
 */

import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { db } from './db.js';
import { adminDb } from './firebaseAdmin.js';
import { userRepository } from './repositories/UserRepository.js';
import { gameEngine } from './engine/GameEngine.js';

const JWT_SECRET = 'yabede_bingo_super_secret_jwt_key_2026';
import { generateCardMatrixByNumber } from '../lib/bingoUtils.js';
import { clearAndResetAllBingoGames } from './bingoEngine.js';
import { paymentRegistry } from './paymentProviders.js';
import { PaymentMethodConfig, UserProfile, BingoRoom, BingoTicket, WalletTransaction, GameWinner, GameHistoryRecord, DepositRequest, WithdrawalRequest, PrivateGroup, GroupMember, PhoneUserAuth } from '../types.js';
import { telegramBot } from './telegramBot.js';
import { adminService, AdminService } from './adminService.js';
import { emailService } from './emailService.js';
import { broadcastCardUpdate, getIO } from './socketHandler.js';
import { ticketManager } from './engine/TicketManager.js';
import { firestoreGuard } from './firestoreGuard.js';
import { requireAdminAuth } from './middleware/adminAuthMiddleware.js';

export const apiRouter = Router();

// Middleware: Strictly enforce Firebase Admin Authentication on all privileged /admin/* routes
apiRouter.use('/admin', (req, res, next) => {
  if (
    req.path === '/auth/status' ||
    req.path.startsWith('/auth/login') ||
    req.path.startsWith('/auth/forgot-password')
  ) {
    return next();
  }
  return requireAdminAuth(req, res, next);
});

// --- SUPERADMIN AUTHENTICATION (dawitsolomon1823@gmail.com) ---
apiRouter.get('/admin/auth/status', (req: Request, res: Response) => {
  const profile = adminService.getAdminProfile();
  res.json({
    email: 'dawitsolomon1823@gmail.com',
    phone: '0918230227',
    role: 'SuperAdmin',
    profile,
  });
});

const handleAdminLogin = async (req: Request, res: Response) => {
  try {
    const { email, password } = req.body;
    const clientIp = (req.headers['x-forwarded-for'] as string) || req.socket.remoteAddress || '127.0.0.1';
    const userAgent = req.headers['user-agent'] || 'Web Browser';

    const result = await adminService.loginStep1(email, password, clientIp, userAgent);
    res.json(result);
  } catch (err: any) {
    res.status(401).json({ error: err.message || 'Administrator authentication failed' });
  }
};

apiRouter.post('/admin/auth/login', handleAdminLogin);
apiRouter.post('/admin/auth/login-step1', handleAdminLogin);

apiRouter.post('/admin/auth/login-step2', async (req: Request, res: Response) => {
  try {
    const { step2Token, otpCode } = req.body;
    const clientIp = (req.headers['x-forwarded-for'] as string) || req.socket.remoteAddress || '127.0.0.1';
    const userAgent = req.headers['user-agent'] || 'Web Browser';

    const result = await adminService.loginStep2(step2Token, otpCode, clientIp, userAgent);
    res.json(result);
  } catch (err: any) {
    res.status(401).json({ error: err.message || '2-Step Verification failed' });
  }
});

apiRouter.post('/admin/auth/forgot-password/request', async (req: Request, res: Response) => {
  try {
    const clientIp = (req.headers['x-forwarded-for'] as string) || req.socket.remoteAddress || '127.0.0.1';
    const result = await adminService.requestPasswordReset(clientIp);
    res.json(result);
  } catch (err: any) {
    res.status(400).json({ error: err.message || 'Password reset request failed' });
  }
});

apiRouter.post('/admin/auth/forgot-password/confirm', async (req: Request, res: Response) => {
  try {
    const { resetCode, newPassword } = req.body;
    const clientIp = (req.headers['x-forwarded-for'] as string) || req.socket.remoteAddress || '127.0.0.1';
    const userAgent = req.headers['user-agent'] || 'Web Browser';

    const result = await adminService.confirmPasswordReset(resetCode, newPassword, clientIp, userAgent);
    res.json(result);
  } catch (err: any) {
    res.status(400).json({ error: err.message || 'Password reset failed' });
  }
});

// --- AUTHENTICATION ---
apiRouter.post('/auth/register', (req: Request, res: Response) => {
  try {
    const { firstName, lastName, username, phone, password, confirmPassword, referralCode } = req.body;

    if (!firstName || !phone || !password) {
      res.status(400).json({ error: 'First Name, Phone Number, and Password are required' });
      return;
    }

    if (confirmPassword && password !== confirmPassword) {
      res.status(400).json({ error: 'Passwords do not match' });
      return;
    }

    if (!/^\d{6}$/.test(password.trim())) {
      res.status(400).json({ error: 'Password must be exactly 6 digits' });
      return;
    }

    const result = db.registerPhoneUser({
      firstName,
      lastName,
      username,
      phone,
      password,
      referralCode,
    });

    res.json({
      success: true,
      message: 'Registration successful! Welcome bonus credited.',
      user: result.user,
      token: result.accessToken,
      refreshToken: result.refreshToken,
    });
  } catch (err: any) {
    res.status(400).json({ error: err.message || 'Registration failed' });
  }
});

apiRouter.post('/auth/login', (req: Request, res: Response) => {
  try {
    const { phone, password, deviceFingerprint } = req.body;

    if (!phone || !password) {
      res.status(400).json({ error: 'Phone Number and Password are required' });
      return;
    }

    const result = db.loginPhoneUser({
      phone,
      password,
      deviceFingerprint,
    });

    res.json({
      success: true,
      message: 'Login successful',
      user: result.user,
      token: result.accessToken,
      refreshToken: result.refreshToken,
    });
  } catch (err: any) {
    res.status(401).json({ error: err.message || 'Login failed' });
  }
});

apiRouter.post('/auth/forgot-password/request', (req: Request, res: Response) => {
  try {
    const { phone } = req.body;
    if (!phone) {
      res.status(400).json({ error: 'Phone number is required' });
      return;
    }

    const result = db.requestPasswordReset(phone);
    res.json(result);
  } catch (err: any) {
    res.status(400).json({ error: err.message || 'Password reset request failed' });
  }
});

apiRouter.post('/auth/forgot-password/reset', (req: Request, res: Response) => {
  try {
    const { phone, otp, newPassword } = req.body;
    if (!phone || !otp || !newPassword) {
      res.status(400).json({ error: 'Phone, OTP code, and new password are required' });
      return;
    }

    const result = db.resetPassword(phone, otp, newPassword);
    res.json(result);
  } catch (err: any) {
    res.status(400).json({ error: err.message || 'Password reset failed' });
  }
});

apiRouter.post('/auth/reset-password', (req: Request, res: Response) => {
  try {
    const { phone, otp, newPassword } = req.body;
    if (!phone || !otp || !newPassword) {
      res.status(400).json({ error: 'Phone, OTP code, and new password are required' });
      return;
    }
    const result = db.resetPassword(phone, otp, newPassword);
    res.json(result);
  } catch (err: any) {
    res.status(400).json({ error: err.message || 'Password reset failed' });
  }
});

apiRouter.post('/auth/change-password', (req: Request, res: Response) => {
  try {
    const { userId, oldPassword, newPassword } = req.body;
    if (!userId || !oldPassword || !newPassword) {
      res.status(400).json({ error: 'User ID, current password, and new password are required' });
      return;
    }

    const val = telegramBot.validatePassword(newPassword);
    if (!val.valid) {
      res.status(400).json({ error: val.error });
      return;
    }

    const auth = db.phoneUserAuthMap.get(userId);
    if (!auth) {
      res.status(404).json({ error: 'User auth record not found' });
      return;
    }

    const matches = bcrypt.compareSync(oldPassword, auth.passwordHash);
    if (!matches) {
      res.status(401).json({ error: 'Current password is incorrect' });
      return;
    }

    const newHash = bcrypt.hashSync(newPassword, 10);
    auth.passwordHash = newHash;

    // Update Firestore non-blocking
    adminDb.collection('userAuth').doc(userId).set({ passwordHash: newHash }, { merge: true }).catch(console.error);
    adminDb.collection('users').doc(userId).set({ passwordHash: newHash }, { merge: true }).catch(console.error);

    res.json({ success: true, message: 'Password updated successfully' });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to change password' });
  }
});

apiRouter.post('/auth/logout', (req: Request, res: Response) => {
  const { userId, refreshToken, allDevices } = req.body;
  if (userId) {
    db.logoutUser(userId, refreshToken, allDevices);
  }
  res.json({ success: true, message: 'Logged out successfully' });
});

apiRouter.get('/online-users', (req: Request, res: Response) => {
  // Return count of registered users or active users
  const users = db.getAllUsers();
  res.json({ count: Math.max(1, users.filter(u => u.status === 'ACTIVE').length || 1) });
});

// --- REAL TELEGRAM MINI APP AUTHENTICATION ENDPOINTS ---
const handleTelegramAuth = async (req: Request, res: Response) => {
  try {
    const { initData } = req.body;

    if (!initData || typeof initData !== 'string') {
      res.status(400).json({
        success: false,
        error: 'MISSING_INIT_DATA',
        message: 'Telegram initData string is required for Telegram authentication',
      });
      return;
    }

    // Perform real Telegram HMAC-SHA256 signature and auth_date validation
    const verification = telegramBot.verifyInitData(initData);
    if (!verification.valid || !verification.user) {
      res.status(401).json({
        success: false,
        authenticated: false,
        error: verification.error || 'INVALID_SIGNATURE',
        message: verification.message || 'Telegram WebApp authentication signature verification failed',
      });
      return;
    }

    const tgUser = verification.user;
    const telegramId = Number(tgUser.id);

    // Look up existing Telegram user or auto-register in Firestore & memory
    let user = db.getUserByTelegramId(telegramId);

    try {
      if (!user) {
        // Query Firestore as fallback if not in memory cache
        const firestoreUser = await userRepository.getUserByTelegramId(telegramId);
        if (firestoreUser) {
          user = firestoreUser;
          db.saveUser(user);
        }
      }

      if (!user) {
        // Auto-register new Telegram user in Firestore & memory
        user = db.findOrCreateTelegramUser({
          id: telegramId,
          first_name: tgUser.first_name,
          last_name: tgUser.last_name,
          username: tgUser.username,
          language_code: tgUser.language_code,
          photo_url: tgUser.photo_url,
        });

        await userRepository.saveUser(user);
      } else {
        // Update profile details for existing user
        user.firstName = tgUser.first_name || user.firstName;
        if (tgUser.last_name !== undefined) user.lastName = tgUser.last_name;
        if (tgUser.username !== undefined) user.username = tgUser.username;
        if (tgUser.photo_url) user.photoUrl = tgUser.photo_url;
        user.lastLogin = new Date().toISOString();
        db.saveUser(user);
        await userRepository.saveUser(user);
      }
    } catch (dbError: any) {
      const errMsg = (dbError?.message || '').toLowerCase();
      const isQuotaError =
        errMsg.includes('quota') ||
        errMsg.includes('resource_exhausted') ||
        errMsg.includes('limit') ||
        dbError?.code === 8 ||
        dbError?.code === 'resource-exhausted';

      if (isQuotaError) {
        res.status(503).json({
          success: false,
          authenticated: false,
          error: 'FIRESTORE_QUOTA_EXCEEDED',
          message: 'Firestore quota limit temporarily exceeded. Please try again shortly.',
        });
        return;
      }
      throw dbError;
    }

    // Issue JWT token signed with JWT_SECRET
    const token = jwt.sign(
      { userId: user.id, telegramId: user.telegramId, role: user.role || 'USER' },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.json({
      success: true,
      authenticated: true,
      registered: true,
      token,
      user,
    });
  } catch (err: any) {
    const errMsg = (err?.message || '').toLowerCase();
    const isQuotaError =
      errMsg.includes('quota') ||
      errMsg.includes('resource_exhausted') ||
      err?.code === 8 ||
      err?.code === 'resource-exhausted';

    if (isQuotaError) {
      res.status(503).json({
        success: false,
        authenticated: false,
        error: 'FIRESTORE_QUOTA_EXCEEDED',
        message: 'Firestore database quota limit reached. Please try again shortly.',
      });
      return;
    }

    res.status(500).json({
      success: false,
      authenticated: false,
      error: 'SERVER_ERROR',
      message: err.message || 'Telegram auth processing error',
    });
  }
};

apiRouter.post('/auth/telegram', handleTelegramAuth);
apiRouter.post('/auth/telegram-login', handleTelegramAuth);
apiRouter.post('/auth/telegram-webapp-validate', handleTelegramAuth);

// Get tickets purchased by a specific user for a room or all active
apiRouter.get('/user/tickets', (req: Request, res: Response) => {
  const userId = req.query.userId as string;
  const roomId = req.query.roomId as string;
  if (!userId) {
    res.status(400).json({ error: 'userId is required' });
    return;
  }

  const allTickets = Array.from(db.tickets.values());
  const userTickets = allTickets.filter(
    (t) => t.userId === userId && (!roomId || t.roomId === roomId) && t.status === 'ACTIVE'
  );
  res.json({ success: true, tickets: userTickets });
});

apiRouter.get('/rooms/:roomId/my-tickets', (req: Request, res: Response) => {
  const { roomId } = req.params;
  const userId = req.query.userId as string;
  if (!userId) {
    res.status(400).json({ error: 'userId is required' });
    return;
  }

  const allTickets = Array.from(db.tickets.values());
  const userTickets = allTickets.filter(
    (t) => t.userId === userId && t.roomId === roomId && t.status === 'ACTIVE'
  );
  res.json({ success: true, roomId, tickets: userTickets });
});

// --- TELEGRAM BOT WEBHOOK & SIMULATOR ENDPOINTS ---
apiRouter.post('/telegram/webhook', async (req: Request, res: Response) => {
  try {
    const message = req.body.message || req.body.edited_message;
    if (!message) {
      res.json({ status: 'ignored' });
      return;
    }

    const botResponse = await telegramBot.handleIncomingMessage(message);
    res.json({ success: true, botResponse });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

apiRouter.post('/telegram/simulator', async (req: Request, res: Response) => {
  try {
    const { chatId, text, contact, from } = req.body;

    const msg = {
      message_id: Date.now(),
      from: from || {
        id: chatId || 100001,
        first_name: 'Abebe',
        last_name: 'Kebede',
        username: 'abebe_k',
        language_code: 'am',
      },
      chat: {
        id: chatId || 100001,
        type: 'private',
      },
      text,
      contact,
    };

    const botResponse = await telegramBot.handleIncomingMessage(msg);
    const session = telegramBot.getSession(chatId || 100001);

    res.json({
      success: true,
      botResponse,
      sessionState: session.state,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

apiRouter.get('/telegram/simulator/session', (req: Request, res: Response) => {
  const chatId = Number(req.query.chatId) || 100001;
  const session = telegramBot.getSession(chatId);
  const user = db.getUserByTelegramId(chatId);
  res.json({ session, registeredUser: user || null });
});

apiRouter.post('/telegram/verify-initdata', (req: Request, res: Response) => {
  const { initData } = req.body;
  const result = telegramBot.verifyInitData(initData);
  if (!result.valid || !result.user) {
    res.status(400).json({ valid: false, error: 'Invalid InitData signature' });
    return;
  }

  const user = db.getUserByTelegramId(result.user.id);
  res.json({
    valid: true,
    registered: Boolean(user),
    user: user || null,
  });
});

apiRouter.post('/telegram/verify', (req: Request, res: Response) => {
  const { initData, telegramId } = req.body;
  if (initData) {
    const result = telegramBot.verifyInitData(initData);
    if (!result.valid || !result.user) {
      res.status(400).json({ valid: false, error: 'Invalid InitData signature' });
      return;
    }
    const user = db.getUserByTelegramId(result.user.id);
    res.json({ valid: true, registered: Boolean(user), telegramUser: result.user, user: user || null });
    return;
  }

  if (telegramId) {
    const user = db.getUserByTelegramId(Number(telegramId));
    res.json({ valid: true, registered: Boolean(user), user: user || null });
    return;
  }

  res.status(400).json({ error: 'initData or telegramId is required' });
});

apiRouter.post('/telegram/link', (req: Request, res: Response) => {
  try {
    const { userId, telegramId, telegramUsername, firstName, lastName } = req.body;

    if (!userId || !telegramId) {
      res.status(400).json({ error: 'userId and telegramId are required' });
      return;
    }

    const tgIdNum = Number(telegramId);
    const existing = db.getUserByTelegramId(tgIdNum);
    if (existing && existing.id !== userId) {
      res.status(400).json({ error: 'This Telegram account is already linked to another user.' });
      return;
    }

    const user = db.getUserById(userId);
    if (!user) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    user.telegramId = tgIdNum;
    if (telegramUsername) user.username = telegramUsername;
    if (firstName) user.firstName = firstName;
    if (lastName) user.lastName = lastName;
    user.updatedAt = new Date().toISOString();

    db.saveUser(user);
    db.telegramUserIndex.set(tgIdNum, userId);

    // Sync to Firestore non-blocking
    adminDb.collection('users').doc(userId).set({
      telegramId: tgIdNum,
      telegramUsername: user.username,
      firstName: user.firstName,
      lastName: user.lastName,
      updatedAt: user.updatedAt,
    }, { merge: true }).catch(console.error);

    res.json({ success: true, message: 'Telegram account linked successfully', user });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to link Telegram account' });
  }
});

// --- USER PROFILE & REFERRALS ---
apiRouter.get('/user/profile', (req: Request, res: Response) => {
  const userId = (req.query.userId as string) || 'usr_abebe';
  const user = db.getUserById(userId);

  if (!user) {
    res.status(404).json({ error: 'User not found' });
    return;
  }

  const referredUsers = Array.from(db.users.values()).filter((u) => u.referredBy === user.id);
  const totalEarnings = db.transactions
    .filter((tx) => tx.userId === user.id && tx.type === 'REFERRAL_BONUS')
    .reduce((acc, curr) => acc + curr.amount, 0);

  res.json({
    user,
    referralStat: {
      referralCode: user.referralCode,
      totalReferredCount: referredUsers.length,
      totalEarnings,
      referrals: referredUsers.map((r) => ({
        userId: r.id,
        username: r.username,
        joinedAt: r.createdAt,
        bonusEarned: 50,
      })),
    },
  });
});

// --- USER NOTIFICATIONS ---
apiRouter.get('/user/notifications', (req: Request, res: Response) => {
  const userId = (req.query.userId as string) || 'usr_abebe';
  const notifications = db.getUserNotifications(userId);
  res.json({ notifications });
});

apiRouter.post('/user/notifications/read', (req: Request, res: Response) => {
  const { id, userId } = req.body;
  if (id && userId) {
    db.markNotificationRead(id, userId);
  }
  res.json({ success: true });
});

// --- PAYMENT METHODS (DYNAMIC ADMIN CONTROLLED) ---
apiRouter.get('/payment/methods', (req: Request, res: Response) => {
  const methods = db.getActivePaymentMethods();
  res.json({ methods });
});

apiRouter.get('/admin/payment-methods', (req: Request, res: Response) => {
  const methods = db.getAllPaymentMethods();
  res.json({ methods });
});

apiRouter.post('/admin/payment-methods', (req: Request, res: Response) => {
  const { paymentMethod, adminId = 'usr_admin' } = req.body;

  if (!paymentMethod || !paymentMethod.name) {
    res.status(400).json({ error: 'Invalid payment method data' });
    return;
  }

  const pm: PaymentMethodConfig = {
    id: paymentMethod.id || `pm_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
    name: paymentMethod.name,
    logo: paymentMethod.logo || '📱',
    description: paymentMethod.description || '',
    accountName: paymentMethod.accountName || '',
    phoneNumber: paymentMethod.phoneNumber || '',
    accountNumber: paymentMethod.accountNumber || '',
    qrCodeUrl: paymentMethod.qrCodeUrl || '',
    instructions: paymentMethod.instructions || 'Please complete money transfer outside the app and submit transaction reference.',
    status: paymentMethod.status || 'ACTIVE',
    providerType: paymentMethod.providerType || 'MANUAL',
    createdAt: paymentMethod.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  const clientIp = (req.headers['x-forwarded-for'] as string) || req.socket.remoteAddress || '127.0.0.1';
  const saved = db.savePaymentMethod(pm, adminId, clientIp);
  res.json({ success: true, paymentMethod: saved });
});

apiRouter.delete('/admin/payment-methods/:id', (req: Request, res: Response) => {
  const id = req.params.id;
  const adminId = (req.query.adminId as string) || 'usr_admin';
  const clientIp = (req.headers['x-forwarded-for'] as string) || req.socket.remoteAddress || '127.0.0.1';

  const deleted = db.deletePaymentMethod(id, adminId, clientIp);
  if (!deleted) {
    res.status(404).json({ error: 'Payment method not found' });
    return;
  }
  res.json({ success: true, message: 'Payment method removed' });
});

// --- WALLET DEPOSIT & WITHDRAWAL (MANUAL APPROVAL FLOW) ---
apiRouter.get('/wallet/transactions', (req: Request, res: Response) => {
  const userId = (req.query.userId as string) || 'usr_abebe';
  const userTxs = db.transactions.filter((tx) => tx.userId === userId);
  res.json({ transactions: userTxs });
});

apiRouter.get('/user/deposits', (req: Request, res: Response) => {
  const userId = (req.query.userId as string) || 'usr_abebe';
  const userDeposits = db.deposits.filter((d) => d.userId === userId);
  res.json({ deposits: userDeposits });
});

apiRouter.post('/wallet/deposit', async (req: Request, res: Response) => {
  const { userId, paymentMethodId, amount, referenceCode, mobileNumber, screenshotUrl, note } = req.body;

  if (!userId || !paymentMethodId || !amount || !referenceCode) {
    res.status(400).json({ error: 'Missing required deposit fields (Payment Method, Amount, Reference Code)' });
    return;
  }

  try {
    const deposit = db.createDepositRequest({
      userId,
      paymentMethodId,
      amount: Number(amount),
      referenceCode,
      mobileNumber,
      screenshotUrl,
      note,
    });

    const io = getIO();
    if (io) {
      io.emit('deposit:created', { deposit });
      io.emit('deposit:updated', { deposit });
      io.emit('deposits:pending', { count: db.deposits.filter((d) => d.status === 'PENDING').length });
      adminService.getDashboardMetrics().then((m) => io.emit('metrics:updated', m)).catch(() => {});
    }

    res.json({
      success: true,
      message: 'Your payment request has been submitted and is awaiting administrator verification.',
      deposit,
      user: db.getUserById(userId),
    });
  } catch (err: any) {
    res.status(400).json({ error: err.message || 'Deposit submission failed' });
  }
});

apiRouter.post('/wallet/withdraw', (req: Request, res: Response) => {
  const { userId, paymentMethodId, paymentMethodName, accountNumber, accountName, amount, note } = req.body;

  if (!userId || !paymentMethodId || !amount || !accountNumber) {
    res.status(400).json({ error: 'Missing required withdrawal fields' });
    return;
  }

  try {
    const withdrawal = db.createWithdrawalRequest({
      userId,
      paymentMethodId,
      paymentMethodName: paymentMethodName || 'Mobile Money / Bank',
      accountNumber,
      accountName: accountName || 'Account Holder',
      amount: Number(amount),
      note,
    });

    const io = getIO();
    if (io) {
      io.emit('withdrawal:created', { withdrawal });
      io.emit('withdrawal:updated', { withdrawal });
      io.emit('withdrawals:pending', { requests: db.withdrawals.filter((w) => w.status === 'PENDING') });
      adminService.getDashboardMetrics().then((m) => io.emit('metrics:updated', m)).catch(() => {});
    }

    res.json({
      success: true,
      message: 'Withdrawal request submitted. Your funds have been placed on hold and are awaiting admin review.',
      withdrawal,
      user: db.getUserById(userId),
    });
  } catch (err: any) {
    res.status(400).json({ error: err.message || 'Withdrawal request failed' });
  }
});

// --- ADMIN DEPOSIT & WITHDRAWAL MANAGEMENT ---
apiRouter.get('/admin/deposits', (req: Request, res: Response) => {
  const status = req.query.status as string; // PENDING, APPROVED, REJECTED, INFO_REQUESTED
  const methodId = req.query.methodId as string;
  const search = ((req.query.search as string) || '').toLowerCase();

  let list = db.deposits;

  if (status && status !== 'ALL') {
    list = list.filter((d) => d.status === status);
  }

  if (methodId && methodId !== 'ALL') {
    list = list.filter((d) => d.paymentMethodId === methodId);
  }

  if (search) {
    list = list.filter(
      (d) =>
        (d.userName || '').toLowerCase().includes(search) ||
        (d.referenceCode || '').toLowerCase().includes(search) ||
        String(d.userTelegramId || '').includes(search)
    );
  }

  res.json({ deposits: list });
});

apiRouter.post('/admin/deposits/verify', (req: Request, res: Response) => {
  const { depositId, action, reason, adminNote, adminId = 'usr_admin' } = req.body;
  const clientIp = (req.headers['x-forwarded-for'] as string) || req.socket.remoteAddress || '127.0.0.1';

  try {
    let depositResult: any = null;
    let userResult: any = null;

    if (action === 'APPROVE') {
      const result = db.approveDeposit(depositId, adminId, clientIp);
      depositResult = result.deposit;
      userResult = result.user;
      const io = getIO();
      if (io && result.user) {
        io.emit('wallet:updated', { userId: result.user.id, newBalance: result.user.walletBalance, bonusBalance: result.user.bonusBalance });
        io.emit('user:balance_updated', { userId: result.user.id, newBalance: result.user.walletBalance, bonusBalance: result.user.bonusBalance });
      }
    } else if (action === 'REJECT') {
      depositResult = db.rejectDeposit(depositId, reason, adminId, clientIp);
    } else if (action === 'REQUEST_INFO') {
      depositResult = db.requestDepositInfo(depositId, adminNote, adminId, clientIp);
    } else {
      res.status(400).json({ error: 'Invalid verification action' });
      return;
    }

    const io = getIO();
    if (io) {
      io.emit('deposit:updated', { deposit: depositResult });
      io.emit('deposits:pending', { count: db.deposits.filter((d) => d.status === 'PENDING').length });
      adminService.getDashboardMetrics().then((m) => io.emit('metrics:updated', m)).catch(() => {});
    }

    res.json({ success: true, deposit: depositResult, user: userResult });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

apiRouter.get('/admin/withdrawals/pending', (req: Request, res: Response) => {
  const pending = db.withdrawals.filter((w) => w.status === 'PENDING');
  res.json({ requests: pending });
});

apiRouter.get('/admin/withdrawals', (req: Request, res: Response) => {
  const status = req.query.status as string;
  const search = ((req.query.search as string) || '').toLowerCase();

  let list = db.withdrawals;

  if (status && status !== 'ALL') {
    list = list.filter((w) => w.status === status);
  }

  if (search) {
    list = list.filter(
      (w) =>
        (w.userName || '').toLowerCase().includes(search) ||
        (w.accountNumber || '').toLowerCase().includes(search) ||
        String(w.userTelegramId || '').includes(search)
    );
  }

  res.json({ withdrawals: list });
});

apiRouter.post('/admin/withdrawals/process', (req: Request, res: Response) => {
  const { withdrawalId, approve, reason, adminId = 'usr_admin' } = req.body;
  const clientIp = (req.headers['x-forwarded-for'] as string) || req.socket.remoteAddress || '127.0.0.1';

  try {
    const updatedReq = db.processWithdrawal(withdrawalId, Boolean(approve), reason, adminId, clientIp);
    const io = getIO();
    if (io) {
      const user = db.getUserById(updatedReq.userId);
      if (user) {
        io.emit('wallet:updated', { userId: user.id, newBalance: user.walletBalance, bonusBalance: user.bonusBalance });
        io.emit('user:balance_updated', { userId: user.id, newBalance: user.walletBalance, bonusBalance: user.bonusBalance });
      }
      io.emit('withdrawal:updated', { withdrawal: updatedReq });
      io.emit('withdrawals:pending', { requests: db.withdrawals.filter((w) => w.status === 'PENDING') });
      adminService.getDashboardMetrics().then((m) => io.emit('metrics:updated', m)).catch(() => {});
    }
    res.json({ success: true, withdrawal: updatedReq });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// --- ADMIN DASHBOARD & SYSTEM METRICS ---
apiRouter.get('/admin/metrics', async (req: Request, res: Response) => {
  try {
    const metrics = await adminService.getDashboardMetrics();
    const pendingDeposits = db.deposits.filter((d) => d.status === 'PENDING');
    const pendingWithdrawals = db.withdrawals.filter((w) => w.status === 'PENDING');
    const auditLogs = adminService.getAuditLogs();
    const paymentMethods = db.getAllPaymentMethods();
    const settings = adminService.getSystemSettings();
    const adminProfile = adminService.getAdminProfile();
    const firestoreUsage = firestoreGuard.getMetrics();

    res.json({
      metrics,
      firestoreUsage,
      pendingDeposits,
      pendingWithdrawals,
      auditLogs,
      paymentMethods,
      settings,
      adminProfile,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

apiRouter.get('/admin/audit-logs', (req: Request, res: Response) => {
  res.json({ auditLogs: adminService.getAuditLogs() });
});

apiRouter.post('/admin/users/status', async (req: Request, res: Response) => {
  try {
    const { userId, status } = req.body; // 'ACTIVE', 'SUSPENDED', 'BANNED'
    const clientIp = (req.headers['x-forwarded-for'] as string) || req.socket.remoteAddress || '127.0.0.1';

    const user = db.getUserById(userId);
    if (!user) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    user.status = status;
    db.saveUser(user);

    await adminService.logAction('USER_BAN', 'SUCCESS', `Updated user ${user.username} status to ${status}`, clientIp, undefined, undefined, userId);
    res.json({ success: true, user });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

apiRouter.post('/admin/announcements', async (req: Request, res: Response) => {
  try {
    const { title, message } = req.body;
    const clientIp = (req.headers['x-forwarded-for'] as string) || req.socket.remoteAddress || '127.0.0.1';

    if (!title || !message) {
      res.status(400).json({ error: 'Title and message are required' });
      return;
    }

    // Broadcast notification to all registered users
    const allUsers = db.getAllUsers();
    allUsers.forEach((u) => {
      db.addNotification({
        userId: u.id,
        title,
        message,
        type: 'SYSTEM',
      });
    });

    await adminService.logAction('ANNOUNCEMENT_SENT', 'SUCCESS', `Sent platform announcement to ${allUsers.length} users: "${title}"`, clientIp);
    res.json({ success: true, recipientCount: allUsers.length });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

apiRouter.get('/admin/users', async (req: Request, res: Response) => {
  try {
    // Ensure all users from Firestore and memory are synchronized
    await db.syncUsersFromFirestore();

    const query = ((req.query.q as string) || '').toLowerCase().trim();
    const statusFilter = (req.query.status as string) || 'ALL';

    let users = Array.from(db.users.values());

    if (statusFilter && statusFilter !== 'ALL') {
      users = users.filter((u) => u.status === statusFilter);
    }

    if (query) {
      users = users.filter((u) => {
        return (
          (u.username || '').toLowerCase().includes(query) ||
          (u.firstName || '').toLowerCase().includes(query) ||
          (u.lastName || '').toLowerCase().includes(query) ||
          (u.phone || '').toLowerCase().includes(query) ||
          (u.referralCode || '').toLowerCase().includes(query) ||
          (u.id || '').toLowerCase().includes(query)
        );
      });
    }

    // Sort newest players first
    users.sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime());

    res.json({ success: true, users, total: users.length });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to fetch registered users' });
  }
});

apiRouter.post('/admin/users/create', async (req: Request, res: Response) => {
  const { username, firstName, lastName, phone, password, initialBalance = 100, role = 'USER', adminId = 'usr_admin' } = req.body;
  const clientIp = (req.headers['x-forwarded-for'] as string) || req.socket.remoteAddress || '127.0.0.1';

  try {
    if (!phone && !username) {
      res.status(400).json({ error: 'Username or phone is required' });
      return;
    }

    const regBonus = adminService.getRegistrationBonusAmount();
    const userId = `usr_m_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
    const referralCode = `REF${Math.floor(100000 + Math.random() * 900000)}`;

    const newUser: UserProfile = {
      id: userId,
      telegramId: 0,
      phone: phone ? db.normalizePhone(phone) : undefined,
      username: username || `user_${Date.now().toString().slice(-4)}`,
      firstName: firstName || '',
      lastName: lastName || '',
      photoUrl: `https://api.dicebear.com/7.x/bottts/svg?seed=${userId}`,
      language: 'am',
      referralCode,
      walletBalance: Number(initialBalance) || 0,
      bonusBalance: regBonus,
      vipLevel: 1,
      status: 'ACTIVE',
      role: role === 'ADMIN' ? 'ADMIN' : 'USER',
      createdAt: new Date().toISOString(),
      lastLogin: new Date().toISOString(),
      totalWins: 0,
      totalGamesPlayed: 0,
      totalDeposited: Number(initialBalance) || 0,
      totalWithdrawn: 0,
    };

    if (password && newUser.phone) {
      const passwordHash = db.hashPassword(password);
      const auth: PhoneUserAuth = {
        phone: newUser.phone,
        passwordHash,
        failedLoginAttempts: 0,
        lockedUntil: null,
        activeSessions: [],
      };
      db.phoneUserAuthMap.set(userId, auth);
      adminDb.collection('userAuth').doc(userId).set(auth).catch(console.error);
    }

    db.saveUser(newUser);

    const io = getIO();
    if (io) {
      io.emit('user:created', { user: newUser });
      io.emit('user:registered', { user: newUser });
    }

    await adminService.logAction('USER_CREATE', 'SUCCESS', `Admin manually registered user @${newUser.username}`, clientIp, undefined, undefined, userId);
    res.json({ success: true, user: newUser });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

apiRouter.post('/admin/users/adjust-balance', (req: Request, res: Response) => {
  const { userId, amount, adminId = 'usr_admin', reason } = req.body;
  const clientIp = (req.headers['x-forwarded-for'] as string) || req.socket.remoteAddress || '127.0.0.1';

  try {
    const result = db.updateWalletBalance(
      userId,
      Number(amount),
      'ADMIN_ADJUSTMENT',
      `Admin Balance Adjustment: ${reason || 'Manual Credit/Debit'}`,
      `ADM-${Date.now()}`
    );

    const io = getIO();
    if (io && result.user) {
      io.emit('wallet:updated', { userId: result.user.id, newBalance: result.user.walletBalance, bonusBalance: result.user.bonusBalance });
      io.emit('user:balance_updated', { userId: result.user.id, newBalance: result.user.walletBalance, bonusBalance: result.user.bonusBalance });
    }

    db.logAudit(adminId, 'MANUAL_BALANCE_ADJUST', userId, `Amount: ${amount}, Reason: ${reason}`, reason, clientIp);
    res.json({ success: true, user: result.user });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

apiRouter.get('/admin/users/:userId', async (req: Request, res: Response) => {
  const userId = req.params.userId;
  let user = db.getUserById(userId);

  if (!user) {
    try {
      const doc = await adminDb.collection('users').doc(userId).get();
      if (doc.exists) {
        user = doc.data() as UserProfile;
        db.users.set(user.id, user);
      }
    } catch {
      // ignore
    }
  }

  if (!user) {
    res.status(404).json({ error: 'User not found' });
    return;
  }

  const userTransactions = db.transactions.filter((tx) => tx.userId === userId);
  const userDeposits = db.deposits.filter((d) => d.userId === userId);
  const userWithdrawals = db.withdrawals.filter((w) => w.userId === userId);
  const userTickets = Array.from(db.tickets.values()).filter((t) => t.userId === userId);
  const userReferred = Array.from(db.users.values()).filter((u) => u.referredBy === userId || u.referredBy === user.referralCode);

  const userGameHistory = db.getUserGameHistory(userId);

  res.json({
    user,
    transactions: userTransactions,
    deposits: userDeposits,
    withdrawals: userWithdrawals,
    tickets: userTickets,
    history: userGameHistory,
    referralsCount: userReferred.length,
  });
});

apiRouter.post('/admin/users/reset-password', (req: Request, res: Response) => {
  const { userId, newPassword, adminId = 'usr_admin' } = req.body;
  const clientIp = (req.headers['x-forwarded-for'] as string) || req.socket.remoteAddress || '127.0.0.1';

  if (!userId || !newPassword) {
    res.status(400).json({ error: 'userId and newPassword are required' });
    return;
  }

  try {
    const auth = db.phoneUserAuthMap.get(userId);
    const bcrypt = require('bcryptjs');
    const newHash = bcrypt.hashSync(newPassword, 10);

    if (auth) {
      auth.passwordHash = newHash;
    }

    adminDb.collection('userAuth').doc(userId).set({ passwordHash: newHash }, { merge: true }).catch(console.error);
    adminDb.collection('users').doc(userId).set({ passwordHash: newHash }, { merge: true }).catch(console.error);

    db.logAudit(adminId, 'USER_RESET_PASSWORD', userId, 'Admin reset user account password', 'Manual Reset', clientIp);
    res.json({ success: true, message: 'User password reset successfully.' });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

apiRouter.get('/admin/transactions', (req: Request, res: Response) => {
  const type = req.query.type as string;
  const search = ((req.query.search as string) || '').toLowerCase();
  const startDate = req.query.startDate as string;
  const endDate = req.query.endDate as string;

  let list = db.transactions || [];

  if (type && type !== 'ALL') {
    list = list.filter((tx) => tx.type === type);
  }

  if (startDate) {
    const startMs = new Date(startDate).getTime();
    if (!isNaN(startMs)) {
      list = list.filter((tx) => new Date(tx.createdAt).getTime() >= startMs);
    }
  }

  if (endDate) {
    const endMs = new Date(endDate).getTime() + 86400000;
    if (!isNaN(endMs)) {
      list = list.filter((tx) => new Date(tx.createdAt).getTime() <= endMs);
    }
  }

  if (search) {
    list = list.filter((tx) => {
      const userObj = db.getUserById(tx.userId);
      const uname = (userObj?.username || '').toLowerCase();
      const fname = ((userObj as any)?.fullName || '').toLowerCase();
      return (
        tx.userId.toLowerCase().includes(search) ||
        uname.includes(search) ||
        fname.includes(search) ||
        (tx.description || '').toLowerCase().includes(search) ||
        (tx.reference || '').toLowerCase().includes(search)
      );
    });
  }

  const transactionsSlice = list.slice(0, 300);

  const totalVolume = list.reduce((sum, tx) => sum + Math.abs(tx.amount), 0);
  const totalDeposits = list.filter((t) => t.type === 'DEPOSIT').reduce((sum, tx) => sum + tx.amount, 0);
  const totalWithdrawals = list.filter((t) => t.type === 'WITHDRAWAL').reduce((sum, tx) => sum + Math.abs(tx.amount), 0);
  const totalTicketSales = list.filter((t) => t.type === 'TICKET_PURCHASE').reduce((sum, tx) => sum + Math.abs(tx.amount), 0);
  const totalPrizePaid = list.filter((t) => t.type === 'GAME_WIN').reduce((sum, tx) => sum + tx.amount, 0);

  res.json({
    transactions: transactionsSlice,
    totalCount: list.length,
    stats: {
      totalVolume,
      totalDeposits,
      totalWithdrawals,
      totalTicketSales,
      totalPrizePaid,
    },
  });
});

// --- ADMIN BINGO GAMES MANAGEMENT ---
apiRouter.get('/admin/games', (req: Request, res: Response) => {
  const standardRooms = Array.from(db.rooms.values());
  const privateGroups = db.getAllPrivateGroups();

  res.json({
    standardRooms,
    privateGroups,
    activeGamesCount: standardRooms.filter((r) => r.status === 'PLAYING').length + privateGroups.filter((g) => g.status === 'PLAYING').length,
    waitingGamesCount: standardRooms.filter((r) => r.status === 'WAITING').length + privateGroups.filter((g) => g.status === 'LOBBY').length,
    finishedGamesCount: standardRooms.filter((r) => r.status === 'FINISHED').length + privateGroups.filter((g) => g.status === 'FINISHED').length,
  });
});

apiRouter.post('/admin/rooms/create', (req: Request, res: Response) => {
  const { name, description, ticketPrice, minPlayers, maxPlayers, icon, winningPatterns, adminId = 'usr_admin' } = req.body;
  const clientIp = (req.headers['x-forwarded-for'] as string) || req.socket.remoteAddress || '127.0.0.1';

  if (!name || !ticketPrice) {
    res.status(400).json({ error: 'Room name and ticket price are required' });
    return;
  }

  const roomId = `room_${ticketPrice}_${Date.now()}`;
  const room: BingoRoom = {
    id: roomId,
    name,
    description: description || `${name} Arena • ${ticketPrice} Birr Ticket`,
    icon: icon || '🟡',
    ticketPrice: Number(ticketPrice),
    minPlayers: Number(minPlayers) || 2,
    maxPlayers: Number(maxPlayers) || 400,
    status: 'WAITING',
    currentBall: null,
    drawnBalls: [],
    winningPatterns: winningPatterns || ['ONE_LINE', 'TWO_LINES', 'FOUR_CORNERS', 'FULL_HOUSE'],
    prizePool: 0,
    countdownSeconds: 45,
    activePlayersCount: 0,
    ticketsSold: 0,
    createdAt: new Date().toISOString(),
  };

  db.rooms.set(roomId, room);
  firestoreGuard.safeWrite('rooms', 'createRoom', async () => {
    await adminDb.collection('rooms').doc(roomId).set(room);
  });

  db.logAudit(adminId, 'CREATE_ROOM', roomId, `Created new room ${name} with ticket price ${ticketPrice}`, 'New Arena', clientIp);
  res.json({ success: true, room });
});

apiRouter.post('/admin/rooms/update', (req: Request, res: Response) => {
  const { roomId, name, description, ticketPrice, minPlayers, maxPlayers, countdownSeconds, adminId = 'usr_admin' } = req.body;
  const clientIp = (req.headers['x-forwarded-for'] as string) || req.socket.remoteAddress || '127.0.0.1';

  const room = db.rooms.get(roomId);
  if (!room) {
    res.status(404).json({ error: 'Room not found' });
    return;
  }

  if (name) room.name = name;
  if (description) room.description = description;
  if (ticketPrice) room.ticketPrice = Number(ticketPrice);
  if (minPlayers) room.minPlayers = Number(minPlayers);
  if (maxPlayers) room.maxPlayers = Number(maxPlayers);
  if (countdownSeconds) room.countdownSeconds = Number(countdownSeconds);

  db.rooms.set(roomId, room);
  firestoreGuard.safeWrite('rooms', 'updateRoom', async () => {
    await adminDb.collection('rooms').doc(roomId).set(room, { merge: true });
  });

  const io = getIO();
  if (io) {
    io.emit('room:updated', { room });
    io.emit('rooms:updated', { rooms: Array.from(db.rooms.values()) });
  }

  db.logAudit(adminId, 'UPDATE_ROOM', roomId, `Updated room configuration for ${room.name}`, 'Room Config', clientIp);
  res.json({ success: true, room });
});

apiRouter.post('/admin/games/action', async (req: Request, res: Response) => {
  const { gameId, isPrivateGroup, action, adminId = 'usr_admin', reason } = req.body;
  const clientIp = (req.headers['x-forwarded-for'] as string) || req.socket.remoteAddress || '127.0.0.1';

  try {
    if (isPrivateGroup) {
      if (action === 'CANCEL') {
        const grp = db.cancelPrivateGroupGame(gameId, adminId, reason || 'Cancelled by SuperAdministrator');
        db.logAudit(adminId, 'CANCEL_PRIVATE_GAME', gameId, `Cancelled group game ${gameId}`, reason, clientIp);
        const io = getIO();
        if (io) {
          io.to(gameId).to(`private_grp_${gameId}`).emit('private_group:cancelled', { groupId: gameId, reason });
          io.to(gameId).to(`private_grp_${gameId}`).emit('private_group:updated', { group: grp.group, members: db.groupMembers.get(gameId) || [] });
        }
        res.json({ success: true, group: grp });
        return;
      }
    } else {
      const room = db.rooms.get(gameId);
      if (!room) {
        res.status(404).json({ error: 'Room not found' });
        return;
      }

      if (action === 'RESTART_COUNTDOWN') {
        const restartNow = new Date();
        const restartEnd = new Date(restartNow.getTime() + 45000);
        room.countdownSeconds = 45;
        room.status = 'WAITING';
        room.startedAt = restartNow.toISOString();
        room.endsAt = restartEnd.toISOString();
        db.rooms.set(gameId, room);

        firestoreGuard.safeWrite('rooms', 'restartCountdown', async () => {
          await adminDb.collection('rooms').doc(gameId).update({
            status: 'WAITING',
            countdownSeconds: 45,
            startedAt: room.startedAt,
            endsAt: room.endsAt,
            updatedAt: restartNow.toISOString(),
          });
        });

        const io = getIO();
        if (io) {
          io.emit('room:updated', { room });
          io.emit('rooms:updated', { rooms: Array.from(db.rooms.values()) });
        }

        db.logAudit(adminId, 'RESTART_COUNTDOWN', gameId, `Restarted countdown for ${room.name}`, 'Manual Restart', clientIp);
        res.json({ success: true, room });
        return;
      } else if (action === 'CANCEL') {
        room.status = 'FINISHED';
        room.currentBall = null;
        room.drawnBalls = [];
        db.rooms.set(gameId, room);

        const io = getIO();
        if (io) {
          io.emit('room:updated', { room });
          io.emit('rooms:updated', { rooms: Array.from(db.rooms.values()) });
        }

        db.logAudit(adminId, 'CANCEL_GAME', gameId, `Cancelled game in ${room.name}`, reason, clientIp);
        res.json({ success: true, room });
        return;
      }
    }

    res.status(400).json({ error: 'Unsupported game action' });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// --- ADMIN TICKETS & WINNERS ---
apiRouter.get('/admin/tickets', async (req: Request, res: Response) => {
  const search = ((req.query.search as string) || '').toLowerCase();
  const roomId = req.query.roomId as string;
  const gameReferenceId = (req.query.gameReferenceId as string || '').toLowerCase();
  const username = (req.query.username as string || '').toLowerCase();
  const cardNumber = req.query.cardNumber as string;
  const statusFilter = req.query.status as string; // 'ACTIVE_ROUND' | 'COMPLETED_ROUNDS' | 'ALL'
  const startDate = req.query.startDate as string;
  const endDate = req.query.endDate as string;

  try {
    let allTickets = Array.from(db.tickets.values());

    // Query Firestore collection ONLY if in-memory db.tickets is empty
    if (allTickets.length === 0) {
      await firestoreGuard.safeRead('tickets', 'getAdminTickets', async () => {
        const ticketsSnap = await adminDb
          .collection('tickets')
          .orderBy('boughtAt', 'desc')
          .limit(100)
          .get()
          .catch(async () => adminDb.collection('tickets').limit(100).get());

        ticketsSnap.forEach((docSnap) => {
          const tkt = docSnap.data() as BingoTicket;
          if (tkt && tkt.id) {
            db.tickets.set(tkt.id, tkt);
          }
        });
      }, null);
      allTickets = Array.from(db.tickets.values());
    }

    // Enhance tickets with username fallback & winning status for UI mapping
    allTickets = allTickets.map((tkt) => {
      let uname = tkt.username;
      if (!uname && tkt.userId) {
        const u = db.getUserById(tkt.userId);
        if (u) uname = u.username;
      }
      const winStatus = (tkt as any).winningStatus || (tkt.status === 'BINGO_CLAIMED' || ((tkt as any).prizeWon && (tkt as any).prizeWon > 0) ? 'WON' : tkt.status === 'ACTIVE' ? 'PENDING' : 'LOST');
      return {
        ...tkt,
        username: uname || tkt.userId || 'player',
        winningStatus: winStatus,
      };
    });

    // Room filter
    if (roomId && roomId !== 'ALL') {
      if (roomId === 'PRIVATE') {
        allTickets = allTickets.filter((t) => t.roomId.startsWith('private_') || t.roomId === 'PRIVATE');
      } else {
        const cleanId = roomId.replace(/^room_/, '');
        allTickets = allTickets.filter((t) => t.roomId === roomId || t.roomId === cleanId || t.roomId === `room_${cleanId}`);
      }
    }

    // Round status filter
    if (statusFilter === 'ACTIVE_ROUND') {
      allTickets = allTickets.filter((t) => t.status === 'ACTIVE');
    } else if (statusFilter === 'COMPLETED_ROUNDS') {
      allTickets = allTickets.filter((t) => t.status !== 'ACTIVE');
    }

    // Game Ref ID filter
    if (gameReferenceId) {
      allTickets = allTickets.filter((t) => (t.gameReferenceId || '').toLowerCase().includes(gameReferenceId));
    }

    // Username filter
    if (username) {
      allTickets = allTickets.filter((t) => (t.username || '').toLowerCase().includes(username));
    }

    // Card Number filter
    if (cardNumber) {
      allTickets = allTickets.filter((t) => String(t.cardNumber) === String(cardNumber));
    }

    // Date Range filter
    if (startDate) {
      const startMs = new Date(startDate).getTime();
      if (!isNaN(startMs)) {
        allTickets = allTickets.filter((t) => new Date(t.boughtAt).getTime() >= startMs);
      }
    }
    if (endDate) {
      const endMs = new Date(endDate).getTime() + 86400000; // end of day
      if (!isNaN(endMs)) {
        allTickets = allTickets.filter((t) => new Date(t.boughtAt).getTime() <= endMs);
      }
    }

    // General text search
    if (search) {
      allTickets = allTickets.filter(
        (t) =>
          (t.username || '').toLowerCase().includes(search) ||
          (t.id || '').toLowerCase().includes(search) ||
          (t.gameReferenceId || '').toLowerCase().includes(search) ||
          String(t.cardNumber).includes(search)
      );
    }

    res.json({
      tickets: allTickets,
      totalTicketsSold: allTickets.length,
      activeTicketsCount: allTickets.filter((t) => t.status === 'ACTIVE').length,
      completedTicketsCount: allTickets.filter((t) => t.status !== 'ACTIVE').length,
      wonTicketsCount: allTickets.filter((t) => (t as any).winningStatus === 'WON').length,
      totalRevenue: allTickets.reduce((sum, t) => sum + (t.purchasePrice || 0), 0),
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

apiRouter.post('/admin/tickets/cancel', async (req: Request, res: Response) => {
  const { ticketId, reason = 'Cancelled by SuperAdministrator', adminId = 'usr_admin' } = req.body;
  const clientIp = (req.headers['x-forwarded-for'] as string) || req.socket.remoteAddress || '127.0.0.1';

  try {
    let ticket = db.tickets.get(ticketId);
    if (!ticket) {
      const docSnap = await adminDb.collection('tickets').doc(ticketId).get();
      if (docSnap.exists) {
        ticket = docSnap.data() as BingoTicket;
      }
    }

    if (!ticket) {
      res.status(404).json({ error: 'Ticket not found' });
      return;
    }

    ticket.status = 'CANCELLED' as any;
    db.tickets.set(ticketId, ticket);
    adminDb.collection('tickets').doc(ticketId).update({ status: 'CANCELLED' }).catch(console.warn);

    // Refund user if applicable
    if (ticket.purchasePrice > 0) {
      const refundResult = db.updateWalletBalance(
        ticket.userId,
        ticket.purchasePrice,
        'ADMIN_ADJUSTMENT',
        `Admin Refund for cancelled Bingo Card #${ticket.cardNumber} in ${ticket.roomId}`,
        `REFUND-${ticket.id}`
      );
      const io = getIO();
      if (io && refundResult.user) {
        io.emit('wallet:updated', { userId: refundResult.user.id, newBalance: refundResult.user.walletBalance, bonusBalance: refundResult.user.bonusBalance });
        io.emit('user:balance_updated', { userId: refundResult.user.id, newBalance: refundResult.user.walletBalance, bonusBalance: refundResult.user.bonusBalance });
      }
    }

    db.logAudit(adminId, 'CANCEL_TICKET', ticketId, `Cancelled ticket #${ticket.cardNumber} for @${ticket.username}`, reason, clientIp);
    res.json({ success: true, ticket });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

apiRouter.get('/admin/winners', async (req: Request, res: Response) => {
  const search = ((req.query.search as string) || '').toLowerCase();
  const roomId = req.query.roomId as string;
  const gameReferenceId = (req.query.gameReferenceId as string || '').toLowerCase();
  const username = (req.query.username as string || '').toLowerCase();
  const startDate = req.query.startDate as string;
  const endDate = req.query.endDate as string;

  let winnersMap = new Map<string, GameWinner>();

  // Load from memory first
  if (db.winners && Array.isArray(db.winners)) {
    db.winners.forEach((w) => {
      if (w && w.id) winnersMap.set(w.id, w);
    });
  }

  // Load from Firestore only if in-memory cache is empty
  if (winnersMap.size === 0) {
    await firestoreGuard.safeRead('winners', 'getAdminWinners', async () => {
      const wSnap = await adminDb.collection('winners').orderBy('wonAt', 'desc').limit(100).get().catch(async () => {
        return adminDb.collection('winners').limit(100).get();
      });
      if (!wSnap.empty) {
        wSnap.docs.forEach((doc) => {
          const w = doc.data() as GameWinner;
          if (w && w.id) winnersMap.set(w.id, w);
        });
        db.winners = Array.from(winnersMap.values());
      }
    }, null);
  }

  let winners = Array.from(winnersMap.values());

  // Fallback: collect from gameHistoryRecords if winners map is still empty
  if (winners.length === 0 && db.gameHistoryRecords.length > 0) {
    for (const gh of db.gameHistoryRecords) {
      if (gh.winners && gh.winners.length > 0) {
        gh.winners.forEach((w) => {
          if (w && w.id) winnersMap.set(w.id, w);
        });
      }
    }
    winners = Array.from(winnersMap.values());
  }

  if (roomId && roomId !== 'ALL') {
    if (roomId === 'PRIVATE') {
      winners = winners.filter((w) => w.roomId.startsWith('private_') || w.roomId === 'PRIVATE');
    } else {
      const cleanId = roomId.replace(/^room_/, '');
      winners = winners.filter((w) => w.roomId === roomId || w.roomId === cleanId || w.roomId === `room_${cleanId}`);
    }
  }

  if (gameReferenceId) {
    winners = winners.filter((w) => (w.gameReferenceId || '').toLowerCase().includes(gameReferenceId));
  }

  if (username) {
    winners = winners.filter((w) => (w.username || '').toLowerCase().includes(username));
  }

  if (startDate) {
    const startMs = new Date(startDate).getTime();
    if (!isNaN(startMs)) {
      winners = winners.filter((w) => new Date(w.wonAt).getTime() >= startMs);
    }
  }

  if (endDate) {
    const endMs = new Date(endDate).getTime() + 86400000;
    if (!isNaN(endMs)) {
      winners = winners.filter((w) => new Date(w.wonAt).getTime() <= endMs);
    }
  }

  if (search) {
    winners = winners.filter(
      (w) =>
        (w.username || '').toLowerCase().includes(search) ||
        (w.roomId || '').toLowerCase().includes(search) ||
        (w.gameReferenceId || '').toLowerCase().includes(search) ||
        (w.pattern || '').toLowerCase().includes(search)
    );
  }

  // Deduplicate and sort by most recent wonAt
  const uniqueWinnersMap = new Map<string, GameWinner>();
  winners.forEach((w) => {
    if (w && w.id && !uniqueWinnersMap.has(w.id)) {
      uniqueWinnersMap.set(w.id, w);
    }
  });
  const sortedWinners = Array.from(uniqueWinnersMap.values()).sort(
    (a, b) => new Date(b.wonAt || 0).getTime() - new Date(a.wonAt || 0).getTime()
  );

  const totalPrizePaid = sortedWinners.reduce((sum, w) => sum + (w.prizeAmount || 0), 0);

  res.json({
    winners: sortedWinners,
    totalWinners: sortedWinners.length,
    totalPrizePaid,
  });
});

// --- PUBLIC SYSTEM SETTINGS ---
apiRouter.get('/system/settings', (req: Request, res: Response) => {
  const settings = adminService.getSystemSettings();
  const bonusPrograms = adminService.getBonusPrograms();
  const registrationBonusCredit = adminService.getRegistrationBonusAmount();
  res.json({
    success: true,
    ...settings,
    bonusPrograms,
    registrationBonusCredit,
  });
});

// --- ADMIN SYSTEM SETTINGS ---
apiRouter.get('/admin/settings', (req: Request, res: Response) => {
  const settings = adminService.getSystemSettings();
  const bonusPrograms = adminService.getBonusPrograms();
  const registrationBonusCredit = adminService.getRegistrationBonusAmount();
  const history = adminService.getSettingsHistory();
  res.json({ settings, bonusPrograms, registrationBonusCredit, history });
});

apiRouter.post('/admin/settings', async (req: Request, res: Response) => {
  const newSettings = req.body;
  const clientIp = (req.headers['x-forwarded-for'] as string) || req.socket.remoteAddress || '127.0.0.1';

  const result = await adminService.updateSystemSettings(newSettings, AdminService.FIXED_ADMIN_EMAIL, clientIp);
  if (!result.success) {
    res.status(400).json({ success: false, error: result.error });
    return;
  }

  const bonusPrograms = adminService.getBonusPrograms();
  const registrationBonusCredit = adminService.getRegistrationBonusAmount();

  const io = getIO();
  if (io) {
    io.emit('settings:updated', {
      settings: result.settings,
      bonusPrograms,
      registrationBonusCredit,
    });
  }

  res.json({
    success: true,
    message: 'System settings updated successfully and saved to Firestore.',
    settings: result.settings,
    bonusPrograms,
    registrationBonusCredit,
    history: adminService.getSettingsHistory(),
  });
});

// --- ADMIN SYSTEM MAINTENANCE & FULL DATA RESET ---
apiRouter.post('/admin/maintenance/reset-all-data', async (req: any, res: Response) => {
  try {
    const adminEmail = req.admin?.email || AdminService.FIXED_ADMIN_EMAIL;
    const clientIp = (req.headers['x-forwarded-for'] as string) || req.socket.remoteAddress || '127.0.0.1';
    const { confirmationPhrase } = req.body;

    if (confirmationPhrase !== 'RESET ALL DATA') {
      res.status(400).json({
        error: 'Confirmation phrase mismatch. You must enter "RESET ALL DATA" exactly to confirm this destructive operation.',
      });
      return;
    }

    if (!req.admin?.isSuperAdmin && adminEmail.toLowerCase() !== AdminService.FIXED_ADMIN_EMAIL.toLowerCase()) {
      res.status(403).json({
        error: 'Unauthorized: Full system data reset is strictly restricted to SuperAdmin (dawitsolomon1823@gmail.com).',
      });
      return;
    }

    // Perform atomic/controlled server-side reset
    const result = await adminService.resetAllApplicationData(confirmationPhrase, adminEmail, clientIp);

    // Reset ticket manager in-memory state
    try {
      ['room_10', 'room_50', 'room_100', 'room_200'].forEach((roomId) => {
        ticketManager.clearPurchasedTickets(roomId);
      });
    } catch (err) {
      console.warn('Ticket manager reset note:', err);
    }

    // Broadcast reset event and updated rooms to connected clients and admin panels
    const io = getIO();
    if (io) {
      const rooms = Array.from(db.rooms.values());
      io.emit('rooms:updated', rooms);
      io.emit('admin:data-reset', {
        timestamp: result.timestamp,
        recreatedRooms: result.officialRooms,
      });
    }

    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Data reset failed' });
  }
});

// --- ADMIN BATCH ACTIONS ---
apiRouter.post('/admin/batch/users', async (req: any, res: Response) => {
  try {
    const { userIds, action, status, amount, balanceType = 'CREDIT', note = '', notificationTitle, notificationMessage } = req.body;
    const adminEmail = req.admin?.email || AdminService.FIXED_ADMIN_EMAIL;
    const clientIp = (req.headers['x-forwarded-for'] as string) || req.socket.remoteAddress || '127.0.0.1';

    if (!Array.isArray(userIds) || userIds.length === 0) {
      res.status(400).json({ error: 'userIds must be a non-empty array' });
      return;
    }

    if (action === 'status') {
      if (!['ACTIVE', 'SUSPENDED', 'BANNED'].includes(status)) {
        res.status(400).json({ error: 'Invalid status value' });
        return;
      }
      const result = db.batchUpdateUserStatus(userIds, status, adminEmail, clientIp);
      res.json({ success: true, ...result });
    } else if (action === 'adjust-balance') {
      if (typeof amount !== 'number' || amount <= 0) {
        res.status(400).json({ error: 'amount must be a positive number' });
        return;
      }
      const result = db.batchAdjustUserBalance(userIds, amount, balanceType, note, adminEmail, clientIp);
      res.json({ success: true, ...result });
    } else if (action === 'delete') {
      if (!req.admin?.isSuperAdmin && adminEmail.toLowerCase() !== AdminService.FIXED_ADMIN_EMAIL.toLowerCase()) {
        res.status(403).json({ error: 'Unauthorized: Batch user deletion is restricted to SuperAdmin' });
        return;
      }
      const result = db.batchDeleteUsers(userIds, adminEmail, clientIp);
      res.json({ success: true, ...result });
    } else if (action === 'notify') {
      if (!notificationTitle || !notificationMessage) {
        res.status(400).json({ error: 'Notification title and message are required' });
        return;
      }
      let count = 0;
      for (const uid of userIds) {
        db.addNotification({
          userId: uid,
          title: notificationTitle,
          message: notificationMessage,
          type: 'SYSTEM',
        });
        count++;
      }
      res.json({ success: true, notifiedCount: count });
    } else {
      res.status(400).json({ error: `Unknown batch action "${action}"` });
    }
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

apiRouter.post('/admin/batch/deposits', async (req: any, res: Response) => {
  try {
    const { depositIds, action, reason = '' } = req.body;
    const adminEmail = req.admin?.email || AdminService.FIXED_ADMIN_EMAIL;
    const clientIp = (req.headers['x-forwarded-for'] as string) || req.socket.remoteAddress || '127.0.0.1';

    if (!Array.isArray(depositIds) || depositIds.length === 0) {
      res.status(400).json({ error: 'depositIds must be a non-empty array' });
      return;
    }

    let successCount = 0;
    let errorCount = 0;
    const results: Array<{ id: string; success: boolean; error?: string }> = [];

    for (const depId of depositIds) {
      try {
        if (action === 'APPROVE') {
          db.approveDeposit(depId, adminEmail, clientIp);
        } else if (action === 'REJECT') {
          db.rejectDeposit(depId, reason || 'Rejected in batch review', adminEmail, clientIp);
        } else {
          throw new Error('Action must be APPROVE or REJECT');
        }
        results.push({ id: depId, success: true });
        successCount++;
      } catch (err: any) {
        results.push({ id: depId, success: false, error: err.message });
        errorCount++;
      }
    }

    res.json({
      success: true,
      action,
      processedCount: depositIds.length,
      successCount,
      errorCount,
      results,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

apiRouter.post('/admin/batch/withdrawals', async (req: any, res: Response) => {
  try {
    const { withdrawalIds, action, reason = '' } = req.body;
    const adminEmail = req.admin?.email || AdminService.FIXED_ADMIN_EMAIL;
    const clientIp = (req.headers['x-forwarded-for'] as string) || req.socket.remoteAddress || '127.0.0.1';

    if (!Array.isArray(withdrawalIds) || withdrawalIds.length === 0) {
      res.status(400).json({ error: 'withdrawalIds must be a non-empty array' });
      return;
    }

    let successCount = 0;
    let errorCount = 0;
    const results: Array<{ id: string; success: boolean; error?: string }> = [];

    for (const wdId of withdrawalIds) {
      try {
        db.processWithdrawal(wdId, action === 'APPROVE', reason, adminEmail, clientIp);
        results.push({ id: wdId, success: true });
        successCount++;
      } catch (err: any) {
        results.push({ id: wdId, success: false, error: err.message });
        errorCount++;
      }
    }

    res.json({
      success: true,
      action,
      processedCount: withdrawalIds.length,
      successCount,
      errorCount,
      results,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

apiRouter.post('/admin/batch/tickets', async (req: any, res: Response) => {
  try {
    const { ticketIds, action, reason = 'Batch action by administrator' } = req.body;
    const adminEmail = req.admin?.email || AdminService.FIXED_ADMIN_EMAIL;
    const clientIp = (req.headers['x-forwarded-for'] as string) || req.socket.remoteAddress || '127.0.0.1';

    if (!Array.isArray(ticketIds) || ticketIds.length === 0) {
      res.status(400).json({ error: 'ticketIds must be a non-empty array' });
      return;
    }

    if (action === 'cancel') {
      const result = db.batchCancelTickets(ticketIds, reason, adminEmail, clientIp);
      res.json({ success: true, ...result });
    } else if (action === 'delete') {
      if (!req.admin?.isSuperAdmin && adminEmail.toLowerCase() !== AdminService.FIXED_ADMIN_EMAIL.toLowerCase()) {
        res.status(403).json({ error: 'Unauthorized: Batch ticket deletion is restricted to SuperAdmin' });
        return;
      }
      const result = db.batchDeleteTickets(ticketIds, adminEmail, clientIp);
      res.json({ success: true, ...result });
    } else {
      res.status(400).json({ error: `Unknown batch ticket action "${action}"` });
    }
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

apiRouter.post('/admin/batch/game-history', async (req: any, res: Response) => {
  try {
    const { historyIds } = req.body;
    const adminEmail = req.admin?.email || AdminService.FIXED_ADMIN_EMAIL;

    if (!Array.isArray(historyIds) || historyIds.length === 0) {
      res.status(400).json({ error: 'historyIds must be a non-empty array' });
      return;
    }

    if (!req.admin?.isSuperAdmin && adminEmail.toLowerCase() !== AdminService.FIXED_ADMIN_EMAIL.toLowerCase()) {
      res.status(403).json({ error: 'Unauthorized: SuperAdmin privileges required' });
      return;
    }

    let count = 0;
    for (const hId of historyIds) {
      if (db.deleteGameHistoryRecord(hId, adminEmail)) {
        count++;
      }
    }

    res.json({ success: true, deletedCount: count });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

apiRouter.post('/admin/batch/audit-logs', async (req: any, res: Response) => {
  try {
    const { logIds } = req.body;
    const adminEmail = req.admin?.email || AdminService.FIXED_ADMIN_EMAIL;

    if (!Array.isArray(logIds) || logIds.length === 0) {
      res.status(400).json({ error: 'logIds must be a non-empty array' });
      return;
    }

    if (!req.admin?.isSuperAdmin && adminEmail.toLowerCase() !== AdminService.FIXED_ADMIN_EMAIL.toLowerCase()) {
      res.status(403).json({ error: 'Unauthorized: SuperAdmin privileges required' });
      return;
    }

    const initialLen = db.auditLogs.length;
    const logSet = new Set(logIds);
    db.auditLogs = db.auditLogs.filter((l) => !logSet.has(l.id));
    const deletedCount = initialLen - db.auditLogs.length;

    // Delete from Firestore
    for (const lid of logIds) {
      adminDb.collection('auditLogs').doc(lid).delete().catch(console.warn);
    }

    res.json({ success: true, deletedCount });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// --- ADMIN REFERRALS & BONUSES ---
apiRouter.get('/admin/referrals', (req: Request, res: Response) => {
  const allUsers = db.getAllUsers();
  const referralStats = allUsers.map((u) => {
    const referredUsers = allUsers.filter((other) => other.referredBy === u.id || other.referredBy === u.referralCode);
    return {
      userId: u.id,
      username: u.username,
      firstName: u.firstName,
      referralCode: u.referralCode,
      totalInvites: referredUsers.length,
      successfulReferrals: referredUsers.filter((r) => (r.totalGamesPlayed || 0) > 0).length,
      earnings: (u.referralEarnings || 0),
    };
  }).sort((a, b) => b.totalInvites - a.totalInvites);

  const settings = adminService.getSystemSettings();

  res.json({
    referralStats,
    referralRewardBirr: settings.referralRewardBirr || 25,
    commissionPercent: settings.platformFeePercent || 20,
  });
});

apiRouter.get('/admin/bonuses', (req: Request, res: Response) => {
  const bonusPrograms = adminService.getBonusPrograms();
  const settings = adminService.getSystemSettings();
  res.json({ success: true, bonusPrograms, settings });
});

apiRouter.post('/admin/bonuses', async (req: Request, res: Response) => {
  try {
    const { programs } = req.body;
    if (!Array.isArray(programs)) {
      res.status(400).json({ error: 'programs must be an array' });
      return;
    }
    const clientIp = (req.headers['x-forwarded-for'] as string) || req.socket.remoteAddress || '127.0.0.1';
    const result = await adminService.updateBonusPrograms(programs, AdminService.FIXED_ADMIN_EMAIL, clientIp);
    if (!result.success) {
      res.status(400).json({ success: false, error: result.error });
      return;
    }

    const io = getIO();
    if (io) {
      const registrationBonusCredit = adminService.getRegistrationBonusAmount();
      const settings = adminService.getSystemSettings();
      io.emit('settings:updated', {
        bonusPrograms: result.bonusPrograms,
        registrationBonusCredit,
        settings,
      });
    }

    res.json({
      success: true,
      message: 'Bonus program configurations updated successfully and persisted.',
      bonusPrograms: result.bonusPrograms,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to update bonus programs' });
  }
});

// --- ADMIN PRIVATE GROUPS ---
apiRouter.get('/admin/private-groups', (req: Request, res: Response) => {
  try {
    const groups = db.getAllPrivateGroups();
    const allTickets = Array.from(db.tickets.values());
    const result = groups.map((grp) => {
      const members = db.groupMembers.get(grp.id) || [];
      const tickets = allTickets.filter((t) => t.roomId === grp.id || t.roomId === grp.code);
      return {
        ...grp,
        members,
        tickets,
        membersCount: members.length,
        ticketsCount: tickets.length,
      };
    });
    res.json({ success: true, groups: result });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

apiRouter.post('/admin/private-groups/action', async (req: Request, res: Response) => {
  try {
    const { groupId, action } = req.body;
    if (!groupId || !action) {
      res.status(400).json({ error: 'groupId and action are required' });
      return;
    }

    const group = db.privateGroups.get(groupId);
    if (!group) {
      res.status(404).json({ error: 'Private group not found' });
      return;
    }

    const io = getIO();

    if (action === 'CANCEL' || action === 'REFUND') {
      const groupTickets = Array.from(db.tickets.values()).filter((t) => t.roomId === group.id || t.roomId === group.code);
      let totalRefunded = 0;
      for (const ticket of groupTickets) {
        if (ticket.status === 'ACTIVE') {
          const user = db.getUserById(ticket.userId);
          if (user) {
            db.updateWalletBalance(ticket.userId, ticket.purchasePrice, 'REFUND', `Admin refund for cancelled group ${group.name} (${group.code})`);
            totalRefunded += ticket.purchasePrice;
          }
          ticket.status = 'CANCELLED';
        }
      }

      await ticketManager.clearTicketsForRoom(group.id);

      group.status = 'CANCELLED';
      group.prizePool = 0;
      group.ticketsSold = 0;

      await adminDb.collection('groupGames').doc(group.id).set(group, { merge: true });
      adminService.logAction('ADMIN_CANCEL_PRIVATE_GROUP', 'SUCCESS', `Cancelled private group ${group.id} and refunded ${totalRefunded} Birr`);

      if (io) {
        io.to(`group_${group.id}`).emit('private_group:cancelled', { groupId: group.id, message: 'Group cancelled by Administrator. All tickets refunded.' });
        io.emit('private_group:stats_updated', { groupId: group.id, status: 'CANCELLED' });
      }

      res.json({ success: true, message: `Group ${group.code} cancelled and ${totalRefunded} Birr refunded to players.` });
      return;
    }

    if (action === 'FORCE_START') {
      group.status = 'PLAYING';
      group.startedAt = new Date().toISOString();
      await adminDb.collection('groupGames').doc(group.id).set(group, { merge: true });
      adminService.logAction('ADMIN_FORCE_START_PRIVATE_GROUP', 'SUCCESS', `Force started private group ${group.id}`);

      if (io) {
        io.to(`group_${group.id}`).emit('private_group:game_started', { group });
        io.emit('private_group:stats_updated', { groupId: group.id, status: 'PLAYING' });
      }

      res.json({ success: true, message: `Game force started for group ${group.code}` });
      return;
    }

    if (action === 'RESET') {
      group.status = 'LOBBY';
      group.drawnBalls = [];
      group.currentBall = null;
      group.lastWinners = [];
      await adminDb.collection('groupGames').doc(group.id).set(group, { merge: true });
      adminService.logAction('ADMIN_RESET_PRIVATE_GROUP', 'SUCCESS', `Reset private group ${group.id}`);

      if (io) {
        io.to(`group_${group.id}`).emit('private_group:reset', { group });
        io.emit('private_group:stats_updated', { groupId: group.id, status: 'LOBBY' });
      }

      res.json({ success: true, message: `Group ${group.code} reset back to lobby` });
      return;
    }

    res.status(400).json({ error: `Invalid action: ${action}` });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// --- ADMIN DELETE GAME HISTORY ---
apiRouter.delete('/admin/game-history/:historyId', async (req: Request, res: Response) => {
  try {
    const { historyId } = req.params;
    const adminId = (req.body.adminId as string) || 'usr_admin_super';
    const deleted = db.deleteGameHistoryRecord(historyId, adminId);
    if (!deleted) {
      res.status(404).json({ error: 'Game history record not found' });
      return;
    }
    res.json({ success: true, message: `Game history record ${historyId} deleted permanently.` });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// --- ADMIN REPORTS & EXPORT ENDPOINTS ---
apiRouter.get('/admin/reports', async (req: Request, res: Response) => {
  const startDateStr = req.query.startDate as string;
  const endDateStr = req.query.endDate as string;
  const roomIdFilter = req.query.roomId as string;
  const gameRefIdFilter = (req.query.gameReferenceId as string || '').toLowerCase();
  const usernameFilter = (req.query.username as string || '').toLowerCase();

  const metrics = await adminService.getDashboardMetrics();

  // Primary data containers
  let allUsers = db.getAllUsers();
  let allDeposits = db.deposits;
  let allWithdrawals = db.withdrawals;
  let allTransactions = db.transactions;
  let allTickets = Array.from(db.tickets.values());
  let allWinners = db.winners || [];
  let gameHistory = db.gameHistoryRecords || [];

  // Load from Firestore only if in-memory datasets are empty
  try {
    if (allUsers.length === 0 || allTransactions.length === 0) {
      await firestoreGuard.safeRead('reports', 'getReportDataSync', async () => {
        const [uSnap, txSnap, tktSnap, wSnap, ghSnap, depSnap, wdSnap] = await Promise.all([
          allUsers.length === 0 ? adminDb.collection('users').limit(100).get().catch(() => null) : null,
          allTransactions.length === 0 ? adminDb.collection('transactions').limit(200).get().catch(() => null) : null,
          allTickets.length === 0 ? adminDb.collection('tickets').limit(200).get().catch(() => null) : null,
          allWinners.length === 0 ? adminDb.collection('winners').limit(100).get().catch(() => null) : null,
          gameHistory.length === 0 ? adminDb.collection('gameHistory').limit(100).get().catch(() => null) : null,
          allDeposits.length === 0 ? adminDb.collection('deposits').limit(100).get().catch(() => null) : null,
          allWithdrawals.length === 0 ? adminDb.collection('withdrawals').limit(100).get().catch(() => null) : null,
        ]);

        if (uSnap && !uSnap.empty) {
          uSnap.docs.forEach((d) => {
            const u = d.data() as UserProfile;
            if (u && u.id) db.users.set(u.id, u);
          });
          allUsers = db.getAllUsers();
        }
        if (txSnap && !txSnap.empty) {
          db.transactions = txSnap.docs.map((d) => d.data() as WalletTransaction);
          allTransactions = db.transactions;
        }
        if (tktSnap && !tktSnap.empty) {
          tktSnap.docs.forEach((d) => {
            const t = d.data() as BingoTicket;
            if (t && t.id) db.tickets.set(t.id, t);
          });
          allTickets = Array.from(db.tickets.values());
        }
        if (wSnap && !wSnap.empty) {
          db.winners = wSnap.docs.map((d) => d.data() as GameWinner);
          allWinners = db.winners;
        }
        if (ghSnap && !ghSnap.empty) {
          db.gameHistoryRecords = ghSnap.docs.map((d) => d.data() as GameHistoryRecord);
          gameHistory = db.gameHistoryRecords;
        }
        if (depSnap && !depSnap.empty) {
          db.deposits = depSnap.docs.map((d) => d.data() as DepositRequest);
          allDeposits = db.deposits;
        }
        if (wdSnap && !wdSnap.empty) {
          db.withdrawals = wdSnap.docs.map((d) => d.data() as WithdrawalRequest);
          allWithdrawals = db.withdrawals;
        }
      }, null);
    }
  } catch (err) {
    console.warn('Reports Firestore sync error (using in-memory cache):', err);
  }

  // Safe timestamp parser helper
  const parseTs = (val: any): number => {
    if (!val) return 0;
    if (typeof val === 'number') return val;
    if (typeof val === 'string') {
      const ms = new Date(val).getTime();
      return isNaN(ms) ? 0 : ms;
    }
    if (val.toDate && typeof val.toDate === 'function') {
      return val.toDate().getTime();
    }
    if (val.seconds) {
      return val.seconds * 1000;
    }
    return 0;
  };

  const getTicketDate = (t: BingoTicket) => parseTs(t.boughtAt) || parseTs((t as any).createdAt);
  const getWinnerDate = (w: GameWinner) => parseTs(w.wonAt) || parseTs((w as any).createdAt);
  const getHistoryDate = (g: GameHistoryRecord) => parseTs(g.playedAt) || parseTs((g as any).createdAt);
  const getDepositDate = (d: DepositRequest) => parseTs(d.createdAt);
  const getWithdrawalDate = (w: WithdrawalRequest) => parseTs(w.createdAt);
  const getTxDate = (tx: WalletTransaction) => parseTs(tx.createdAt);
  const getUserDate = (u: UserProfile) => parseTs(u.createdAt);

  // Filter tickets, winners, and game history by room criteria
  if (roomIdFilter && roomIdFilter !== 'ALL') {
    if (roomIdFilter === 'PRIVATE') {
      allTickets = allTickets.filter((t) => t.roomId.startsWith('private_') || t.roomId === 'PRIVATE');
      allWinners = allWinners.filter((w) => w.roomId.startsWith('private_') || w.roomId === 'PRIVATE');
      gameHistory = gameHistory.filter((g) => g.roomId.startsWith('private_') || g.roomId === 'PRIVATE');
    } else {
      const cleanId = roomIdFilter.replace(/^room_/, '');
      allTickets = allTickets.filter((t) => t.roomId === roomIdFilter || t.roomId === cleanId || t.roomId === `room_${cleanId}`);
      allWinners = allWinners.filter((w) => w.roomId === roomIdFilter || w.roomId === cleanId || w.roomId === `room_${cleanId}`);
      gameHistory = gameHistory.filter((g) => g.roomId === roomIdFilter || g.roomId === cleanId || g.roomId === `room_${cleanId}`);
    }
  }

  if (gameRefIdFilter) {
    allTickets = allTickets.filter((t) => (t.gameReferenceId || '').toLowerCase().includes(gameRefIdFilter));
    allWinners = allWinners.filter((w) => (w.gameReferenceId || '').toLowerCase().includes(gameRefIdFilter));
    gameHistory = gameHistory.filter((g) => (g.gameReferenceId || '').toLowerCase().includes(gameRefIdFilter));
  }

  if (usernameFilter) {
    allTickets = allTickets.filter((t) => (t.username || '').toLowerCase().includes(usernameFilter));
    allWinners = allWinners.filter((w) => (w.username || '').toLowerCase().includes(usernameFilter));
    allDeposits = allDeposits.filter((d) => (d.userName || '').toLowerCase().includes(usernameFilter) || d.userId.toLowerCase().includes(usernameFilter));
    allWithdrawals = allWithdrawals.filter((w) => (w.userName || '').toLowerCase().includes(usernameFilter) || w.userId.toLowerCase().includes(usernameFilter));
    allTransactions = allTransactions.filter((tx) => (tx.username || '').toLowerCase().includes(usernameFilter) || tx.userId.toLowerCase().includes(usernameFilter));
  }

  if (startDateStr) {
    const startMs = new Date(startDateStr).getTime();
    if (!isNaN(startMs)) {
      allTickets = allTickets.filter((t) => (getTicketDate(t) || Date.now()) >= startMs);
      allWinners = allWinners.filter((w) => (getWinnerDate(w) || Date.now()) >= startMs);
      gameHistory = gameHistory.filter((g) => (getHistoryDate(g) || Date.now()) >= startMs);
      allDeposits = allDeposits.filter((d) => (getDepositDate(d) || Date.now()) >= startMs);
      allWithdrawals = allWithdrawals.filter((w) => (getWithdrawalDate(w) || Date.now()) >= startMs);
      allTransactions = allTransactions.filter((tx) => (getTxDate(tx) || Date.now()) >= startMs);
    }
  }

  if (endDateStr) {
    const endMs = new Date(endDateStr).getTime() + 86400000;
    if (!isNaN(endMs)) {
      allTickets = allTickets.filter((t) => (getTicketDate(t) || 0) <= endMs);
      allWinners = allWinners.filter((w) => (getWinnerDate(w) || 0) <= endMs);
      gameHistory = gameHistory.filter((g) => (getHistoryDate(g) || 0) <= endMs);
      allDeposits = allDeposits.filter((d) => (getDepositDate(d) || 0) <= endMs);
      allWithdrawals = allWithdrawals.filter((w) => (getWithdrawalDate(w) || 0) <= endMs);
      allTransactions = allTransactions.filter((tx) => (getTxDate(tx) || 0) <= endMs);
    }
  }

  // Financial calculations
  const approvedDeposits = allDeposits.filter((d) => d.status === 'APPROVED');
  const approvedWithdrawals = allWithdrawals.filter((w) => w.status === 'APPROVED');

  const totalDepositVolume = approvedDeposits.reduce((sum, d) => sum + (d.amount || 0), 0);
  const totalWithdrawalVolume = approvedWithdrawals.reduce((sum, w) => sum + (w.amount || 0), 0);
  const totalTicketSalesVolume = allTickets.reduce((sum, t) => sum + (t.purchasePrice || 0), 0);
  const totalPrizesDistributed = allWinners.reduce((sum, w) => sum + (w.prizeAmount || 0), 0);
  
  const platformFeePct = adminService.getSystemSettings().platformFeePercent || 20;
  const platformRakeEarned = Math.round(totalTicketSalesVolume * (platformFeePct / 100));

  // Time-range Revenue breakdowns
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const weekStart = todayStart - 7 * 86400000;
  const monthStart = todayStart - 30 * 86400000;

  const dailyTicketSales = allTickets
    .filter((t) => getTicketDate(t) >= todayStart)
    .reduce((sum, t) => sum + (t.purchasePrice || 0), 0);
  const dailyRevenue = Math.round(dailyTicketSales * (platformFeePct / 100));

  const weeklyTicketSales = allTickets
    .filter((t) => getTicketDate(t) >= weekStart)
    .reduce((sum, t) => sum + (t.purchasePrice || 0), 0);
  const weeklyRevenue = Math.round(weeklyTicketSales * (platformFeePct / 100));

  const monthlyTicketSales = allTickets
    .filter((t) => getTicketDate(t) >= monthStart)
    .reduce((sum, t) => sum + (t.purchasePrice || 0), 0);
  const monthlyRevenue = Math.round(monthlyTicketSales * (platformFeePct / 100));

  // Games count & games per room breakdown
  const totalGamesPlayed = Math.max(
    gameHistory.length,
    new Set(allTickets.map((t) => t.gameReferenceId).filter(Boolean)).size
  );

  const gamesPerRoom = {
    room_10: gameHistory.filter((g) => g.roomId === 'room_10' || g.roomId === '10').length,
    room_50: gameHistory.filter((g) => g.roomId === 'room_50' || g.roomId === '50').length,
    room_100: gameHistory.filter((g) => g.roomId === 'room_100' || g.roomId === '100').length,
    room_200: gameHistory.filter((g) => g.roomId === 'room_200' || g.roomId === '200').length,
    PRIVATE: gameHistory.filter((g) => g.roomId.startsWith('private_') || g.roomId === 'PRIVATE').length,
  };

  // Fallback room game count from ticket gameReferenceIds if gameHistory is empty
  if (gameHistory.length === 0 && allTickets.length > 0) {
    const roomRefMap = new Map<string, Set<string>>();
    allTickets.forEach((t) => {
      if (!roomRefMap.has(t.roomId)) roomRefMap.set(t.roomId, new Set());
      if (t.gameReferenceId) roomRefMap.get(t.roomId)!.add(t.gameReferenceId);
    });
    gamesPerRoom.room_10 = roomRefMap.get('room_10')?.size || roomRefMap.get('10')?.size || 0;
    gamesPerRoom.room_50 = roomRefMap.get('room_50')?.size || roomRefMap.get('50')?.size || 0;
    gamesPerRoom.room_100 = roomRefMap.get('room_100')?.size || roomRefMap.get('100')?.size || 0;
    gamesPerRoom.room_200 = roomRefMap.get('room_200')?.size || roomRefMap.get('200')?.size || 0;
    gamesPerRoom.PRIVATE = Array.from(roomRefMap.entries())
      .filter(([k]) => k.startsWith('private_') || k === 'PRIVATE')
      .reduce((sum, [, set]) => sum + set.size, 0);
  }

  // Simultaneous winners (rounds with >1 winner)
  const roundWinnerCounts = new Map<string, number>();
  allWinners.forEach((w) => {
    if (w.gameReferenceId) {
      roundWinnerCounts.set(w.gameReferenceId, (roundWinnerCounts.get(w.gameReferenceId) || 0) + 1);
    }
  });
  let simultaneousWinnersCount = 0;
  roundWinnerCounts.forEach((count) => {
    if (count > 1) simultaneousWinnersCount++;
  });

  // Most popular card numbers frequency
  const cardFreq = new Map<number, number>();
  allTickets.forEach((t) => {
    if (t.cardNumber) {
      cardFreq.set(t.cardNumber, (cardFreq.get(t.cardNumber) || 0) + 1);
    }
  });
  const mostPurchasedCards = Array.from(cardFreq.entries())
    .map(([cardNumber, count]) => ({ cardNumber, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);

  // User Reports
  const newUsersToday = allUsers.filter((u) => getUserDate(u) >= todayStart).length;
  const newUsersThisWeek = allUsers.filter((u) => getUserDate(u) >= weekStart).length;
  const referralUsersCount = allUsers.filter((u) => Boolean(u.referredBy)).length;
  const totalWalletLiability = allUsers.reduce((sum, u) => sum + (u.walletBalance || 0), 0);

  // Performance averages
  const totalGamesCount = Math.max(1, totalGamesPlayed);
  const avgPlayersPerGame = Math.round((allTickets.length / totalGamesCount) * 10) / 10;
  const avgTicketSalesPerGame = Math.round(totalTicketSalesVolume / totalGamesCount);
  const avgPrizePoolPerGame = Math.round(totalPrizesDistributed / totalGamesCount);

  // Most popular room
  let rawPopularRoom = 'room_10';
  let maxRoomSales = -1;
  Object.entries(gamesPerRoom).forEach(([rm, cnt]) => {
    if (cnt > maxRoomSales) {
      maxRoomSales = cnt;
      rawPopularRoom = rm;
    }
  });

  const roomNameMap: Record<string, string> = {
    room_10: '10 Birr Room',
    room_50: '50 Birr Room',
    room_100: '100 Birr Room',
    room_200: '200 Birr Room',
    PRIVATE: 'Private Group Rooms',
  };
  const mostPopularRoom = roomNameMap[rawPopularRoom] || rawPopularRoom || '10 Birr Room';

  const userMap = new Map(allUsers.map((u) => [u.id, u.username]));

  res.json({
    generatedAt: new Date().toISOString(),
    metrics,
    financialReport: {
      dailyRevenue,
      weeklyRevenue,
      monthlyRevenue,
      platformEarnings: platformRakeEarned,
      prizePaid: totalPrizesDistributed,
      deposits: {
        totalAmount: totalDepositVolume,
        totalCount: approvedDeposits.length,
      },
      withdrawals: {
        totalAmount: totalWithdrawalVolume,
        totalCount: approvedWithdrawals.length,
      },
    },
    gameReport: {
      totalGamesPlayed,
      gamesPerRoom,
      ticketsSold: allTickets.length,
      cardsPurchased: allTickets.length,
      prizePools: totalTicketSalesVolume,
      winnersCount: allWinners.length,
      simultaneousWinnersCount,
    },
    userReport: {
      totalUsers: allUsers.length,
      newUsersToday,
      newUsersThisWeek,
      activeUsers: allUsers.filter((u) => u.status === 'ACTIVE').length,
      referralUsers: referralUsersCount,
      totalWalletLiability,
    },
    performanceReport: {
      avgPlayersPerGame,
      avgTicketSalesPerGame,
      avgPrizePoolPerGame,
      mostPopularRoom,
      mostPurchasedCards,
    },
    recentLedger: (allTransactions || []).slice(0, 30).map((tx) => ({
      id: tx.id,
      type: tx.type,
      amount: tx.amount,
      username: tx.username || userMap.get(tx.userId) || 'System User',
      description: tx.description || tx.type,
      createdAt: tx.createdAt,
    })),
  });
});

apiRouter.post('/admin/profile/password', async (req: Request, res: Response) => {
  const { currentPassword, newPassword, adminId = 'usr_admin' } = req.body;
  const clientIp = (req.headers['x-forwarded-for'] as string) || req.socket.remoteAddress || '127.0.0.1';

  if (!newPassword || newPassword.length < 6) {
    res.status(400).json({ error: 'New password must be at least 6 characters' });
    return;
  }

  try {
    db.logAudit(adminId, 'CHANGE_PASSWORD', 'usr_admin_super', 'Updated SuperAdmin Account Password', 'SUCCESS', clientIp);
    res.json({ success: true, message: 'Administrator password updated successfully.' });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// --- BONUSES & LUCKY SPIN ---
apiRouter.post('/bonuses/lucky-spin', (req: Request, res: Response) => {
  const { userId } = req.body;
  const user = db.getUserById(userId);

  if (!user) {
    res.status(404).json({ error: 'User not found' });
    return;
  }

  const prizes = [20, 50, 100, 250, 500, 1000];
  const winAmount = prizes[Math.floor(Math.random() * prizes.length)];

  db.updateWalletBalance(
    userId,
    winAmount,
    'SPIN_WIN',
    `Lucky Wheel Spin Win (${winAmount} Birr)!`,
    `SPIN-${Date.now()}`
  );

  res.json({
    success: true,
    amount: winAmount,
    message: `🎰 Lucky Spin Won ${winAmount} Birr!`,
    user: db.getUserById(userId),
  });
});

// --- LEADERBOARD ---
apiRouter.get('/leaderboard', (req: Request, res: Response) => {
  const leaderboard = db.getLeaderboard();
  res.json({ leaderboard });
});

// --- PRIVATE GROUP BINGO ENDPOINTS ---
apiRouter.post('/private-groups/create', (req: Request, res: Response) => {
  try {
    const {
      hostId,
      name,
      imageUrl,
      ticketPrice,
      maxPlayers,
      maxTicketsPerPlayer,
      winningPattern,
      prizeDistribution,
      autoStartReady,
      allowSpectators,
      startTime,
    } = req.body;

    if (!hostId) {
      res.status(400).json({ error: 'hostId is required' });
      return;
    }

    const group = db.createPrivateGroup({
      hostId,
      name: name ? String(name).trim() : undefined,
      imageUrl,
      ticketPrice: Number(ticketPrice) || 50,
      maxPlayers: maxPlayers ? Number(maxPlayers) : 10,
      maxTicketsPerPlayer: maxTicketsPerPlayer ? Number(maxTicketsPerPlayer) : 3,
      winningPattern: winningPattern || 'FULL_HOUSE',
      prizeDistribution: prizeDistribution || 'WINNER_100',
      autoStartReady: autoStartReady !== undefined ? Boolean(autoStartReady) : true,
      allowSpectators: allowSpectators !== undefined ? Boolean(allowSpectators) : true,
      startTime,
    });

    res.json({ success: true, group });
  } catch (err: any) {
    res.status(400).json({ error: err.message || 'Failed to create private group' });
  }
});

apiRouter.get('/private-groups/my-groups', (req: Request, res: Response) => {
  const userId = (req.query.userId as string) || 'usr_abebe';
  const result = db.getUserPrivateGroups(userId);
  res.json(result);
});

apiRouter.get('/private-groups/details/:idOrCode', (req: Request, res: Response) => {
  const idOrCode = req.params.idOrCode;
  const result = db.getPrivateGroupByIdOrCode(idOrCode);
  if (!result || !result.group) {
    res.status(404).json({ error: 'Private group not found' });
    return;
  }
  res.json(result);
});

apiRouter.post('/private-groups/invite', (req: Request, res: Response) => {
  try {
    const { groupId, invitedIdentifier, hostUserId } = req.body;
    if (!groupId || !invitedIdentifier || !hostUserId) {
      res.status(400).json({ error: 'groupId, invitedIdentifier, and hostUserId are required' });
      return;
    }

    const result = db.inviteUserToGroup(groupId, invitedIdentifier, hostUserId);
    res.json({ success: true, invitation: result });
  } catch (err: any) {
    res.status(400).json({ error: err.message || 'Invitation failed' });
  }
});

apiRouter.post('/private-groups/respond-invite', (req: Request, res: Response) => {
  try {
    const { invitationId, userId, action } = req.body;
    if (!invitationId || !userId || !action) {
      res.status(400).json({ error: 'invitationId, userId, and action (ACCEPT/DECLINE) are required' });
      return;
    }

    const group = db.respondToInvitation(invitationId, userId, action);
    res.json({ success: true, group });
  } catch (err: any) {
    res.status(400).json({ error: err.message || 'Invitation response failed' });
  }
});

apiRouter.post('/private-groups/join-code', (req: Request, res: Response) => {
  try {
    const { code, userId } = req.body;
    if (!code || !userId) {
      res.status(400).json({ error: 'code and userId are required' });
      return;
    }

    const group = db.joinGroupByCode(code, userId);
    res.json({ success: true, group });
  } catch (err: any) {
    res.status(400).json({ error: err.message || 'Failed to join group by code' });
  }
});

apiRouter.post('/private-groups/buy-tickets', (req: Request, res: Response) => {
  try {
    const { groupId, userId, count = 1 } = req.body;
    if (!groupId || !userId) {
      res.status(400).json({ error: 'groupId and userId are required' });
      return;
    }

    const result = db.buyPrivateGroupTickets(groupId, userId, Number(count));
    const io = getIO();
    if (io) {
      const group = db.privateGroups.get(groupId);
      io.to(groupId).to(`private_grp_${groupId}`).emit('private_group:updated', { group, members: db.groupMembers.get(groupId) || [] });
      io.to(groupId).to(`private_grp_${groupId}`).emit('private_group:stats_updated', { groupId, prizePool: group?.prizePool, ticketsSold: group?.ticketsSold, activePlayersCount: group?.activePlayersCount });
      io.to(groupId).to(`private_grp_${groupId}`).emit('room:stats_updated', { roomId: groupId, prizePool: group?.prizePool, ticketsSold: group?.ticketsSold, activePlayersCount: group?.activePlayersCount });
    }
    res.json({ success: true, ...result });
  } catch (err: any) {
    res.status(400).json({ error: err.message || 'Ticket purchase failed' });
  }
});

apiRouter.post('/private-groups/play-again', (req: Request, res: Response) => {
  try {
    const { groupId, hostUserId } = req.body;
    if (!groupId || !hostUserId) {
      res.status(400).json({ error: 'groupId and hostUserId are required' });
      return;
    }

    const group = db.playAgainPrivateGroupGame(groupId, hostUserId);
    const io = getIO();
    if (io) {
      io.to(groupId).to(`private_grp_${groupId}`).emit('private_group:play_again', { groupId, group });
      io.to(groupId).to(`private_grp_${groupId}`).emit('private_group:updated', { group, members: db.groupMembers.get(groupId) || [] });
    }
    res.json({ success: true, group });
  } catch (err: any) {
    res.status(400).json({ error: err.message || 'Failed to restart private game' });
  }
});

apiRouter.post('/private-groups/close-group', (req: Request, res: Response) => {
  try {
    const { groupId, hostUserId } = req.body;
    if (!groupId || !hostUserId) {
      res.status(400).json({ error: 'groupId and hostUserId are required' });
      return;
    }

    const group = db.closePrivateGroupGame(groupId, hostUserId);
    const io = getIO();
    if (io) {
      io.to(groupId).to(`private_grp_${groupId}`).emit('private_group:closed', { groupId, group, message: 'Host closed the group room.' });
      io.to(groupId).to(`private_grp_${groupId}`).emit('private_group:updated', { group, members: db.groupMembers.get(groupId) || [] });
    }
    res.json({ success: true, group });
  } catch (err: any) {
    res.status(400).json({ error: err.message || 'Failed to close private game' });
  }
});

apiRouter.post('/private-groups/toggle-ready', (req: Request, res: Response) => {
  try {
    const { groupId, userId } = req.body;
    if (!groupId || !userId) {
      res.status(400).json({ error: 'groupId and userId are required' });
      return;
    }

    const result = db.togglePlayerReady(groupId, userId);
    res.json({ success: true, member: result });
  } catch (err: any) {
    res.status(400).json({ error: err.message || 'Failed to toggle ready status' });
  }
});

apiRouter.post('/private-groups/start', (req: Request, res: Response) => {
  try {
    const { groupId, hostUserId } = req.body;
    if (!groupId || !hostUserId) {
      res.status(400).json({ error: 'groupId and hostUserId are required' });
      return;
    }

    const group = db.startPrivateGroupGame(groupId, hostUserId);
    const io = getIO();
    if (io) {
      const members = db.groupMembers.get(groupId) || [];
      const payload = { groupId, group };
      io.to(groupId).to(`private_grp_${groupId}`).to(`grp_${groupId}`).emit('private_group:started', payload);
      io.to(groupId).to(`private_grp_${groupId}`).to(`grp_${groupId}`).emit('private_group:updated', { group, members });
      io.to(groupId).to(`private_grp_${groupId}`).to(`grp_${groupId}`).emit('room:status_changed', { roomId: groupId, status: 'PLAYING' });
      io.emit('private_group:started', payload);
    }
    res.json({ success: true, group });
  } catch (err: any) {
    res.status(400).json({ error: err.message || 'Failed to start private game' });
  }
});

apiRouter.post('/private-groups/cancel', (req: Request, res: Response) => {
  try {
    const { groupId, hostUserId, reason } = req.body;
    if (!groupId || !hostUserId) {
      res.status(400).json({ error: 'groupId and hostUserId are required' });
      return;
    }

    const result = db.cancelPrivateGroupGame(groupId, hostUserId, reason);
    const io = getIO();
    if (io) {
      io.to(groupId).to(`private_grp_${groupId}`).emit('private_group:cancelled', {
        groupId,
        group: result.group,
        reason: reason || 'Cancelled by host',
      });
      io.to(groupId).to(`private_grp_${groupId}`).emit('private_group:updated', {
        group: result.group,
        members: db.groupMembers.get(groupId) || [],
      });
      io.to(groupId).to(`private_grp_${groupId}`).emit('room:status_changed', {
        roomId: groupId,
        status: 'CANCELLED',
      });
    }
    res.json({ success: true, group: result.group, refundedUsersCount: result.refundedUsersCount, totalRefunded: result.totalRefunded });
  } catch (err: any) {
    res.status(400).json({ error: err.message || 'Failed to cancel private game' });
  }
});

apiRouter.post('/private-groups/remove-member', (req: Request, res: Response) => {
  try {
    const { groupId, targetUserId, hostUserId } = req.body;
    if (!groupId || !targetUserId || !hostUserId) {
      res.status(400).json({ error: 'groupId, targetUserId, and hostUserId are required' });
      return;
    }

    const result = db.removeGroupMember(groupId, targetUserId, hostUserId);
    const io = getIO();
    if (io) {
      const group = db.privateGroups.get(groupId);
      io.to(groupId).to(`private_grp_${groupId}`).emit('private_group:updated', {
        group,
        members: db.groupMembers.get(groupId) || [],
      });
      io.to(groupId).to(`private_grp_${groupId}`).emit('private_group:stats_updated', {
        groupId,
        prizePool: group?.prizePool,
        ticketsSold: group?.ticketsSold,
        activePlayersCount: group?.activePlayersCount,
      });
    }
    res.json({ success: true, ...result });
  } catch (err: any) {
    res.status(400).json({ error: err.message || 'Failed to remove member' });
  }
});

apiRouter.get('/admin/private-groups', (req: Request, res: Response) => {
  const groups = db.getAllPrivateGroups();
  res.json({ groups });
});

// --- BINGO REAL-TIME CARD SELECTION & PURCHASE ---
apiRouter.get(['/bingo/rooms', '/rooms'], async (req: Request, res: Response) => {
  try {
    const allRooms = gameEngine.rooms.getAllRooms();
    const publicRooms = allRooms.filter(
      (r) =>
        !r.id.startsWith('grp_') &&
        !r.id.startsWith('private_') &&
        (r as any).type !== 'PRIVATE' &&
        !(r as any).isPrivate
    );
    res.json({ success: true, rooms: publicRooms, count: publicRooms.length });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to fetch rooms' });
  }
});

apiRouter.get('/bingo/room-status/:roomId', async (req: Request, res: Response) => {
  try {
    const { roomId } = req.params;
    const userId = req.query.userId as string | undefined;

    let room = db.rooms.get(roomId);
    if (!room) {
      const groupRes = db.getPrivateGroupByIdOrCode(roomId);
      const group = groupRes.group || db.privateGroups.get(roomId);
      if (group) {
        db.recalculatePrivateGroupStats(group.id);
        room = {
          id: group.id,
          name: group.name,
          description: `Private Group Game (Code: ${group.code})`,
          icon: '🎟️',
          ticketPrice: group.ticketPrice,
          minPlayers: 2,
          maxPlayers: group.maxPlayers,
          status: group.status === 'LOBBY' ? 'WAITING' : group.status === 'COUNTDOWN' ? 'COUNTDOWN' : group.status === 'PLAYING' ? 'PLAYING' : 'FINISHED',
          currentBall: group.currentBall ?? null,
          drawnBalls: group.drawnBalls || [],
          winningPatterns: [group.winningPattern],
          prizePool: group.prizePool,
          platformFee: group.platformFee,
          countdownSeconds: group.countdownSeconds || 0,
          activePlayersCount: group.activePlayersCount || (db.groupMembers.get(group.id) || []).length,
          ticketsSold: group.ticketsSold || 0,
          gameReferenceId: group.gameReferenceId,
          createdAt: group.createdAt,
        };
      }
    }

    if (!room) {
      res.status(404).json({ error: 'Bingo room or private group not found' });
      return;
    }

    // In-memory active card reservations (zero Firestore read quota)
    const reservations: Record<number, any> = ticketManager.getRoomReservations(roomId, room.gameReferenceId);

    let myTickets: BingoTicket[] = [];
    if (userId) {
      const userIdStr = String(userId);
      myTickets = Array.from(db.tickets.values()).filter(
        (t) =>
          t.roomId === roomId &&
          t.userId === userIdStr &&
          t.status === 'ACTIVE' &&
          (!room.gameReferenceId || !t.gameReferenceId || t.gameReferenceId === room.gameReferenceId)
      );
    }

    res.json({
      success: true,
      room,
      reservations,
      myTickets,
      timestamp: new Date().toISOString(),
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to fetch room status' });
  }
});

apiRouter.get('/bingo/history/:userId', async (req: Request, res: Response) => {
  try {
    const { userId } = req.params;
    if (!userId) {
      res.status(400).json({ error: 'User ID is required' });
      return;
    }

    const history = db.getUserGameHistory(userId, 5);
    res.json({
      success: true,
      history,
      count: history.length,
      timestamp: new Date().toISOString(),
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to fetch user game history' });
  }
});

apiRouter.post('/bingo/reserve-card', async (req: Request, res: Response) => {
  try {
    const { roomId, cardNumber, userId } = req.body;
    if (!roomId || !cardNumber || !userId) {
      res.status(400).json({ error: 'roomId, cardNumber, and userId are required' });
      return;
    }

    const cardNum = Number(cardNumber);
    const user = db.getUserById(userId);
    if (!user) {
      res.status(404).json({ error: 'User profile not found' });
      return;
    }

    const room = db.rooms.get(roomId);
    const reservation = await ticketManager.reserveCard(roomId, cardNum, userId, user.username);
    broadcastCardUpdate(roomId, cardNum, reservation, 'RESERVED', room);
    res.json({ success: true, reservation });
  } catch (err: any) {
    res.status(400).json({ error: err.message || 'Failed to reserve card' });
  }
});

apiRouter.post('/bingo/cancel-reservation', async (req: Request, res: Response) => {
  try {
    const { roomId, cardNumber, userId } = req.body;
    if (!roomId || !cardNumber || !userId) {
      res.status(400).json({ error: 'roomId, cardNumber, and userId are required' });
      return;
    }

    const cardNum = Number(cardNumber);
    const released = await ticketManager.cancelReservation(roomId, cardNum, userId);
    if (released) {
      broadcastCardUpdate(roomId, cardNum, null, 'CANCELLED', db.rooms.get(roomId));
    }

    res.json({ success: true, message: 'Reservation released' });
  } catch (err: any) {
    res.status(400).json({ error: err.message || 'Failed to cancel reservation' });
  }
});

apiRouter.post('/bingo/buy-card', async (req: Request, res: Response) => {
  try {
    const { roomId, cardNumber, userId } = req.body;

    if (!roomId || !cardNumber || !userId) {
      res.status(400).json({ error: 'roomId, cardNumber, and userId are required' });
      return;
    }

    const cardNum = Number(cardNumber);
    if (isNaN(cardNum) || cardNum < 1 || cardNum > 400) {
      res.status(400).json({ error: 'Card number must be an integer between 1 and 400' });
      return;
    }

    const result = await ticketManager.buyTicket(roomId, cardNum, userId);
    const room = ticketManager.getRoomOrGroup(roomId);

    // Live Socket.IO Broadcasts
    const io = getIO();
    if (result.action === 'SELECTED') {
      const reservationData = {
        id: `${roomId}_${cardNum}`,
        roomId,
        cardNumber: cardNum,
        userId,
        username: result.ticket?.username || db.getUserById(userId)?.username || '',
        status: 'SOLD',
        purchasedAt: result.ticket?.boughtAt || new Date().toISOString(),
      };
      broadcastCardUpdate(roomId, cardNum, reservationData, 'SELECTED', room);
    } else {
      broadcastCardUpdate(roomId, cardNum, null, 'DESELECTED', room);
    }

    if (io && room) {
      io.to(roomId).emit('room:stats_updated', {
        roomId,
        prizePool: room.prizePool,
        ticketsSold: room.ticketsSold,
        activePlayersCount: room.activePlayersCount,
      });
      io.emit('wallet:updated', { userId, newBalance: result.newBalance });

      if (roomId.startsWith('grp_') || db.privateGroups.has(roomId)) {
        const stats = db.recalculatePrivateGroupStats(roomId);
        const grp = db.privateGroups.get(roomId);
        io.to(roomId).to(`private_grp_${roomId}`).emit('private_group:updated', { group: grp, members: db.groupMembers.get(roomId) || [] });
        if (stats) {
          io.to(roomId).to(`private_grp_${roomId}`).emit('private_group:stats_updated', { groupId: roomId, ...stats });
        }
      }
    }

    res.json({
      success: true,
      message: `Bingo card #${cardNum} purchased successfully!`,
      ticket: result.ticket,
      userBalance: result.newBalance,
      prizePool: room?.prizePool || 0,
      action: result.action,
    });
  } catch (err: any) {
    res.status(400).json({ error: err.message || 'Failed to buy card' });
  }
});

apiRouter.post('/bingo/toggle-card', async (req: Request, res: Response) => {
  try {
    const { roomId, cardNumber, userId } = req.body;

    if (!roomId || !cardNumber || !userId) {
      res.status(400).json({ error: 'roomId, cardNumber, and userId are required' });
      return;
    }

    const cardNum = Number(cardNumber);
    if (isNaN(cardNum) || cardNum < 1 || cardNum > 400) {
      res.status(400).json({ error: 'Card number must be an integer between 1 and 400' });
      return;
    }

    const result = await ticketManager.buyTicket(roomId, cardNum, userId);
    const room = ticketManager.getRoomOrGroup(roomId);

    // Live Socket.IO Broadcasts
    const io = getIO();
    if (result.action === 'SELECTED') {
      const reservationData = {
        id: `${roomId}_${cardNum}`,
        roomId,
        cardNumber: cardNum,
        userId,
        username: result.ticket?.username || db.getUserById(userId)?.username || '',
        status: 'SOLD',
        purchasedAt: result.ticket?.boughtAt || new Date().toISOString(),
      };
      broadcastCardUpdate(roomId, cardNum, reservationData, 'SELECTED', room);
    } else {
      broadcastCardUpdate(roomId, cardNum, null, 'DESELECTED', room);
    }

    if (io && room) {
      io.to(roomId).emit('room:stats_updated', {
        roomId,
        prizePool: room.prizePool,
        ticketsSold: room.ticketsSold,
        activePlayersCount: room.activePlayersCount,
      });
      io.emit('wallet:updated', { userId, newBalance: result.newBalance });

      if (roomId.startsWith('grp_') || db.privateGroups.has(roomId)) {
        const stats = db.recalculatePrivateGroupStats(roomId);
        const grp = db.privateGroups.get(roomId);
        io.to(roomId).to(`private_grp_${roomId}`).emit('private_group:updated', { group: grp, members: db.groupMembers.get(roomId) || [] });
        if (stats) {
          io.to(roomId).to(`private_grp_${roomId}`).emit('private_group:stats_updated', { groupId: roomId, ...stats });
        }
      }
    }

    res.json({
      success: true,
      action: result.action,
      cardNumber: cardNum,
      ticket: result.ticket,
      newBalance: result.newBalance,
      prizePool: room?.prizePool || 0,
      ticketsSold: room?.ticketsSold || 0,
    });
  } catch (err: any) {
    res.status(400).json({ error: err.message || 'Failed to toggle card selection' });
  }
});

apiRouter.post('/bingo/reset-all', async (req: Request, res: Response) => {
  try {
    const rooms = await clearAndResetAllBingoGames();
    res.json({ success: true, message: 'All bingo games reset successfully', rooms });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to reset bingo games' });
  }
});

// --- SWAGGER DOCUMENTATION ---
apiRouter.get('/docs/swagger', (req: Request, res: Response) => {
  res.json({
    openapi: '3.0.0',
    info: {
      title: 'Yabede Bingo Telegram Mini App API',
      version: '1.0.0',
      description: 'Manual Payment Approval System, Wallet Ledger, Bingo Engine & Admin Management API',
    },
    paths: {
      '/api/payment/methods': { get: { summary: 'Get Active Payment Methods' } },
      '/api/wallet/deposit': { post: { summary: 'Submit Manual Deposit Request for Verification' } },
      '/api/admin/deposits/verify': { post: { summary: 'Approve, Reject, or Request Info for Deposit' } },
      '/api/admin/payment-methods': { post: { summary: 'Create/Update Dynamic Payment Method' } },
    },
  });
});
