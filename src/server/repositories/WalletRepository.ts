import { adminDb } from '../firebaseAdmin.js';
import { WalletTransaction, DepositRequest, WithdrawalRequest, PaymentMethodConfig } from '../../types.js';
import { firestoreGuard } from '../firestoreGuard.js';

export class WalletRepository {
  public async saveTransaction(tx: WalletTransaction): Promise<void> {
    await firestoreGuard.safeWrite('transactions', 'saveTransaction', async () => {
      await adminDb.collection('transactions').doc(tx.id).set(tx);
    }, true);
  }

  public async getTransactionsForUser(userId: string): Promise<WalletTransaction[]> {
    return firestoreGuard.safeRead('transactions', 'getTransactionsForUser', async () => {
      const snap = await adminDb.collection('transactions').where('userId', '==', userId).get();
      return snap.docs.map((doc) => doc.data() as WalletTransaction);
    }, []);
  }

  public async getAllTransactions(): Promise<WalletTransaction[]> {
    return firestoreGuard.safeRead('transactions', 'getAllTransactions', async () => {
      const snap = await adminDb.collection('transactions').orderBy('timestamp', 'desc').limit(100).get().catch(async () => {
        return adminDb.collection('transactions').limit(100).get();
      });
      return snap.docs.map((doc) => doc.data() as WalletTransaction);
    }, []);
  }

  public async saveDeposit(deposit: DepositRequest): Promise<void> {
    await firestoreGuard.safeWrite('depositRequests', 'saveDeposit', async () => {
      await adminDb.collection('depositRequests').doc(deposit.id).set(deposit);
    }, true);
  }

  public async updateDepositStatus(depositId: string, status: string, processedBy?: string): Promise<void> {
    await firestoreGuard.safeWrite('depositRequests', 'updateDepositStatus', async () => {
      const updateData: Record<string, any> = {
        status,
        updatedAt: new Date().toISOString(),
      };
      if (processedBy) updateData.processedBy = processedBy;
      await adminDb.collection('depositRequests').doc(depositId).update(updateData);
    }, true);
  }

  public async getAllDeposits(): Promise<DepositRequest[]> {
    return firestoreGuard.safeRead('depositRequests', 'getAllDeposits', async () => {
      const snap = await adminDb.collection('depositRequests').orderBy('createdAt', 'desc').limit(100).get().catch(async () => {
        return adminDb.collection('depositRequests').limit(100).get();
      });
      return snap.docs.map((doc) => doc.data() as DepositRequest);
    }, []);
  }

  public async saveWithdrawal(withdrawal: WithdrawalRequest): Promise<void> {
    await firestoreGuard.safeWrite('withdrawals', 'saveWithdrawal', async () => {
      await adminDb.collection('withdrawals').doc(withdrawal.id).set(withdrawal);
    }, true);
  }

  public async updateWithdrawalStatus(withdrawalId: string, status: string, processedBy?: string): Promise<void> {
    await firestoreGuard.safeWrite('withdrawals', 'updateWithdrawalStatus', async () => {
      const updateData: Record<string, any> = {
        status,
        updatedAt: new Date().toISOString(),
      };
      if (processedBy) updateData.processedBy = processedBy;
      await adminDb.collection('withdrawals').doc(withdrawalId).update(updateData);
    }, true);
  }

  public async getAllWithdrawals(): Promise<WithdrawalRequest[]> {
    return firestoreGuard.safeRead('withdrawals', 'getAllWithdrawals', async () => {
      const snap = await adminDb.collection('withdrawals').orderBy('createdAt', 'desc').limit(100).get().catch(async () => {
        return adminDb.collection('withdrawals').limit(100).get();
      });
      return snap.docs.map((doc) => doc.data() as WithdrawalRequest);
    }, []);
  }

  public async savePaymentMethods(methods: PaymentMethodConfig[]): Promise<void> {
    await firestoreGuard.safeWrite('settings', 'savePaymentMethods', async () => {
      await adminDb.collection('settings').doc('paymentMethods').set({ methods });
    }, true);
  }

  public async getPaymentMethods(): Promise<PaymentMethodConfig[]> {
    return firestoreGuard.safeRead('settings', 'getPaymentMethods', async () => {
      const doc = await adminDb.collection('settings').doc('paymentMethods').get();
      if (!doc.exists) return [];
      return doc.data()?.methods || [];
    }, []);
  }
}

export const walletRepository = new WalletRepository();
