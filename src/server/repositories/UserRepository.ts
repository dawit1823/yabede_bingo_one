import { adminDb } from '../firebaseAdmin.js';
import { UserProfile, PhoneUserAuth } from '../../types.js';

export class UserRepository {
  public async getUserById(userId: string): Promise<UserProfile | null> {
    const doc = await adminDb.collection('users').doc(userId).get();
    if (!doc.exists) return null;
    return doc.data() as UserProfile;
  }

  public async getUserByTelegramId(telegramId: number): Promise<UserProfile | null> {
    const snap = await adminDb.collection('users').where('telegramId', '==', telegramId).limit(1).get();
    if (snap.empty) return null;
    return snap.docs[0].data() as UserProfile;
  }

  public async getUserByPhone(phone: string): Promise<UserProfile | null> {
    const snap = await adminDb.collection('users').where('phone', '==', phone).limit(1).get();
    if (snap.empty) return null;
    return snap.docs[0].data() as UserProfile;
  }

  public async saveUser(user: UserProfile): Promise<void> {
    await adminDb.collection('users').doc(user.id).set(user, { merge: true });
  }

  public async updateUserBalances(userId: string, walletBalance: number, bonusBalance?: number): Promise<void> {
    const updateData: Record<string, any> = {
      walletBalance,
      updatedAt: new Date().toISOString(),
    };
    if (bonusBalance !== undefined) {
      updateData.bonusBalance = bonusBalance;
    }
    await adminDb.collection('users').doc(userId).update(updateData);
  }

  public async getAllUsers(): Promise<UserProfile[]> {
    const snap = await adminDb.collection('users').get();
    return snap.docs.map((doc) => doc.data() as UserProfile);
  }

  public async savePhoneAuth(auth: PhoneUserAuth): Promise<void> {
    await adminDb.collection('phoneUsers').doc(auth.phone).set(auth, { merge: true });
  }

  public async getPhoneAuth(phone: string): Promise<PhoneUserAuth | null> {
    const doc = await adminDb.collection('phoneUsers').doc(phone).get();
    if (!doc.exists) return null;
    return doc.data() as PhoneUserAuth;
  }
}

export const userRepository = new UserRepository();
