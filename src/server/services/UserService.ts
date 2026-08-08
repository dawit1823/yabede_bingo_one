import { userRepository } from '../repositories/UserRepository.js';
import { walletRepository } from '../repositories/WalletRepository.js';
import { transactionRepository } from '../repositories/TransactionRepository.js';
import { UserProfile, WalletTransaction, AuditLog } from '../../types.js';

export class UserService {
  public async getUserById(userId: string): Promise<UserProfile | null> {
    return userRepository.getUserById(userId);
  }

  public async getUserByTelegramId(telegramId: number): Promise<UserProfile | null> {
    return userRepository.getUserByTelegramId(telegramId);
  }

  public async getUserByPhone(phone: string): Promise<UserProfile | null> {
    return userRepository.getUserByPhone(phone);
  }

  public async saveUser(user: UserProfile): Promise<void> {
    await userRepository.saveUser(user);
  }

  public async processRegistration(newUser: UserProfile, referrerId?: string): Promise<UserProfile> {
    await userRepository.saveUser(newUser);

    if (newUser.bonusBalance > 0) {
      const welcomeTx: WalletTransaction = {
        id: `tx_welcome_${Date.now()}_${newUser.id}`,
        userId: newUser.id,
        type: 'DAILY_BONUS',
        amount: newUser.bonusBalance,
        balanceAfter: newUser.walletBalance + newUser.bonusBalance,
        status: 'COMPLETED',
        description: 'Welcome Registration Bonus',
        reference: `WELCOME-${newUser.id}`,
        createdAt: new Date().toISOString(),
      };
      await walletRepository.saveTransaction(welcomeTx);
    }

    if (referrerId) {
      const referrer = await userRepository.getUserById(referrerId);
      if (referrer) {
        const refReward = 25;
        referrer.bonusBalance += refReward;
        referrer.referralCount = (referrer.referralCount || 0) + 1;
        referrer.referralEarnings = (referrer.referralEarnings || 0) + refReward;

        await userRepository.saveUser(referrer);

        const refTx: WalletTransaction = {
          id: `tx_ref_${Date.now()}_${referrer.id}`,
          userId: referrer.id,
          type: 'REFERRAL_BONUS',
          amount: refReward,
          balanceAfter: referrer.walletBalance + referrer.bonusBalance,
          status: 'COMPLETED',
          description: `Referral Reward for inviting ${newUser.username}`,
          reference: `REF-${newUser.id}`,
          createdAt: new Date().toISOString(),
        };
        await walletRepository.saveTransaction(refTx);
      }
    }

    return newUser;
  }

  public async logAudit(adminId: string, action: string, details: string, ipAddress?: string): Promise<void> {
    const log: AuditLog = {
      id: `audit_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      adminId,
      timestamp: new Date().toISOString(),
      action,
      details,
      ipAddress: ipAddress || '127.0.0.1',
    };
    await transactionRepository.saveAuditLog(log);
  }
}

export const userService = new UserService();
