import { userRepository } from '../repositories/UserRepository.js';
import { walletRepository } from '../repositories/WalletRepository.js';
import { DepositRequest, WithdrawalRequest, WalletTransaction } from '../../types.js';

export class WalletService {
  public async submitDeposit(deposit: DepositRequest): Promise<DepositRequest> {
    await walletRepository.saveDeposit(deposit);
    return deposit;
  }

  public async approveDeposit(depositId: string, adminId: string): Promise<DepositRequest | null> {
    const deposits = await walletRepository.getAllDeposits();
    const deposit = deposits.find((d) => d.id === depositId);
    if (!deposit || deposit.status !== 'PENDING') return null;

    deposit.status = 'APPROVED';
    deposit.processedByAdminId = adminId;

    await walletRepository.updateDepositStatus(depositId, 'APPROVED', adminId);

    const user = await userRepository.getUserById(deposit.userId);
    if (user) {
      user.walletBalance += deposit.amount;
      user.totalDeposited = (user.totalDeposited || 0) + deposit.amount;
      await userRepository.saveUser(user);

      const tx: WalletTransaction = {
        id: `tx_dep_${Date.now()}_${deposit.id}`,
        userId: user.id,
        type: 'DEPOSIT',
        amount: deposit.amount,
        balanceAfter: user.walletBalance,
        status: 'COMPLETED',
        description: `Verified Deposit via ${deposit.paymentMethodName}`,
        reference: deposit.referenceCode || deposit.id,
        createdAt: new Date().toISOString(),
      };
      await walletRepository.saveTransaction(tx);
    }

    return deposit;
  }

  public async rejectDeposit(depositId: string, adminId: string): Promise<DepositRequest | null> {
    const deposits = await walletRepository.getAllDeposits();
    const deposit = deposits.find((d) => d.id === depositId);
    if (!deposit || deposit.status !== 'PENDING') return null;

    deposit.status = 'REJECTED';
    deposit.processedByAdminId = adminId;

    await walletRepository.updateDepositStatus(depositId, 'REJECTED', adminId);

    const tx: WalletTransaction = {
      id: `tx_dep_rej_${Date.now()}_${deposit.id}`,
      userId: deposit.userId,
      type: 'DEPOSIT',
      amount: deposit.amount,
      balanceAfter: 0,
      status: 'FAILED',
      description: `Rejected Deposit Request`,
      reference: deposit.id,
      createdAt: new Date().toISOString(),
    };
    await walletRepository.saveTransaction(tx);

    return deposit;
  }

  public async submitWithdrawal(withdrawal: WithdrawalRequest): Promise<WithdrawalRequest> {
    const user = await userRepository.getUserById(withdrawal.userId);
    if (!user || user.walletBalance < withdrawal.amount) {
      throw new Error('Insufficient wallet balance for withdrawal');
    }

    user.walletBalance -= withdrawal.amount;
    await userRepository.saveUser(user);

    await walletRepository.saveWithdrawal(withdrawal);

    const tx: WalletTransaction = {
      id: `tx_wth_${Date.now()}_${withdrawal.id}`,
      userId: user.id,
      type: 'WITHDRAWAL',
      amount: withdrawal.amount,
      balanceAfter: user.walletBalance,
      status: 'PENDING',
      description: `Withdrawal Request via ${withdrawal.paymentMethodName}`,
      reference: withdrawal.id,
      createdAt: new Date().toISOString(),
    };
    await walletRepository.saveTransaction(tx);

    return withdrawal;
  }

  public async approveWithdrawal(withdrawalId: string, adminId: string): Promise<WithdrawalRequest | null> {
    const withdrawals = await walletRepository.getAllWithdrawals();
    const w = withdrawals.find((x) => x.id === withdrawalId);
    if (!w || w.status !== 'PENDING') return null;

    w.status = 'APPROVED';
    w.processedByAdminId = adminId;

    await walletRepository.updateWithdrawalStatus(withdrawalId, 'APPROVED', adminId);

    const user = await userRepository.getUserById(w.userId);
    if (user) {
      user.totalWithdrawn = (user.totalWithdrawn || 0) + w.amount;
      await userRepository.saveUser(user);
    }

    const tx: WalletTransaction = {
      id: `tx_wth_app_${Date.now()}_${w.id}`,
      userId: w.userId,
      type: 'WITHDRAWAL',
      amount: w.amount,
      balanceAfter: user ? user.walletBalance : 0,
      status: 'COMPLETED',
      description: `Approved Withdrawal Payout to ${w.accountNumber}`,
      reference: w.id,
      createdAt: new Date().toISOString(),
    };
    await walletRepository.saveTransaction(tx);

    return w;
  }

  public async rejectWithdrawal(withdrawalId: string, adminId: string): Promise<WithdrawalRequest | null> {
    const withdrawals = await walletRepository.getAllWithdrawals();
    const w = withdrawals.find((x) => x.id === withdrawalId);
    if (!w || w.status !== 'PENDING') return null;

    w.status = 'REJECTED';
    w.processedByAdminId = adminId;

    await walletRepository.updateWithdrawalStatus(withdrawalId, 'REJECTED', adminId);

    const user = await userRepository.getUserById(w.userId);
    if (user) {
      user.walletBalance += w.amount;
      await userRepository.saveUser(user);
    }

    const tx: WalletTransaction = {
      id: `tx_wth_ref_${Date.now()}_${w.id}`,
      userId: w.userId,
      type: 'WITHDRAWAL',
      amount: w.amount,
      balanceAfter: user ? user.walletBalance : 0,
      status: 'REJECTED',
      description: `Rejected Withdrawal Refund`,
      reference: w.id,
      createdAt: new Date().toISOString(),
    };
    await walletRepository.saveTransaction(tx);

    return w;
  }
}

export const walletService = new WalletService();
