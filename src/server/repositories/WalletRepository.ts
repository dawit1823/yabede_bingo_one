import { adminDb } from '../firebaseAdmin.js';
import { WalletTransaction, DepositRequest, WithdrawalRequest, PaymentMethodConfig } from '../../types.js';

export class WalletRepository {
  public async saveTransaction(tx: WalletTransaction): Promise<void> {
    await adminDb.collection('transactions').doc(tx.id).set(tx);
  }

  public async getTransactionsForUser(userId: string): Promise<WalletTransaction[]> {
    const snap = await adminDb.collection('transactions').where('userId', '==', userId).get();
    return snap.docs.map((doc) => doc.data() as WalletTransaction);
  }

  public async getAllTransactions(): Promise<WalletTransaction[]> {
    const snap = await adminDb.collection('transactions').get();
    return snap.docs.map((doc) => doc.data() as WalletTransaction);
  }

  public async saveDeposit(deposit: DepositRequest): Promise<void> {
    await adminDb.collection('depositRequests').doc(deposit.id).set(deposit);
  }

  public async updateDepositStatus(depositId: string, status: string, processedBy?: string): Promise<void> {
    const updateData: Record<string, any> = {
      status,
      updatedAt: new Date().toISOString(),
    };
    if (processedBy) updateData.processedBy = processedBy;
    await adminDb.collection('depositRequests').doc(depositId).update(updateData);
  }

  public async getAllDeposits(): Promise<DepositRequest[]> {
    const snap = await adminDb.collection('depositRequests').get();
    return snap.docs.map((doc) => doc.data() as DepositRequest);
  }

  public async saveWithdrawal(withdrawal: WithdrawalRequest): Promise<void> {
    await adminDb.collection('withdrawals').doc(withdrawal.id).set(withdrawal);
  }

  public async updateWithdrawalStatus(withdrawalId: string, status: string, processedBy?: string): Promise<void> {
    const updateData: Record<string, any> = {
      status,
      updatedAt: new Date().toISOString(),
    };
    if (processedBy) updateData.processedBy = processedBy;
    await adminDb.collection('withdrawals').doc(withdrawalId).update(updateData);
  }

  public async getAllWithdrawals(): Promise<WithdrawalRequest[]> {
    const snap = await adminDb.collection('withdrawals').get();
    return snap.docs.map((doc) => doc.data() as WithdrawalRequest);
  }

  public async savePaymentMethods(methods: PaymentMethodConfig[]): Promise<void> {
    await adminDb.collection('settings').doc('paymentMethods').set({ methods });
  }

  public async getPaymentMethods(): Promise<PaymentMethodConfig[]> {
    const doc = await adminDb.collection('settings').doc('paymentMethods').get();
    if (!doc.exists) return [];
    return doc.data()?.methods || [];
  }
}

export const walletRepository = new WalletRepository();
