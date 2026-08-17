import { adminDb } from '../firebaseAdmin.js';
import { AuditLog, UserNotification } from '../../types.js';

export class TransactionRepository {
  public async saveAuditLog(log: AuditLog): Promise<void> {
    await adminDb.collection('auditLogs').doc(log.id).set(log);
  }

  public async getAuditLogs(): Promise<AuditLog[]> {
    const snap = await adminDb.collection('auditLogs').orderBy('timestamp', 'desc').limit(100).get().catch(async () => {
      return adminDb.collection('auditLogs').limit(100).get();
    });
    return snap.docs.map((doc) => doc.data() as AuditLog);
  }

  public async saveSettings(settings: Record<string, any>): Promise<void> {
    await adminDb.collection('settings').doc('platformConfig').set(settings, { merge: true });
  }

  public async getSettings(): Promise<Record<string, any> | null> {
    const doc = await adminDb.collection('settings').doc('platformConfig').get();
    if (!doc.exists) return null;
    return doc.data() || null;
  }

  public async saveSettingsHistory(historyItem: Record<string, any>): Promise<void> {
    const docId = `hist_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    await adminDb.collection('settingsHistory').doc(docId).set(historyItem);
  }

  public async getSettingsHistory(): Promise<Record<string, any>[]> {
    const snap = await adminDb.collection('settingsHistory').orderBy('changedAt', 'desc').limit(50).get().catch(async () => {
      return adminDb.collection('settingsHistory').limit(50).get();
    });
    return snap.docs.map((doc) => doc.data());
  }

  public async saveNotification(notification: UserNotification): Promise<void> {
    await adminDb.collection('notifications').doc(notification.id).set(notification);
  }

  public async getNotificationsForUser(userId: string): Promise<UserNotification[]> {
    const snap = await adminDb.collection('notifications').where('userId', '==', userId).get();
    return snap.docs.map((doc) => doc.data() as UserNotification);
  }
}

export const transactionRepository = new TransactionRepository();
