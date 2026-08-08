import { adminDb } from '../firebaseAdmin.js';
import { PrivateGroup, GroupMember, GroupInvitation, GroupMessage } from '../../types.js';

export class GroupRepository {
  public async savePrivateGroup(group: PrivateGroup): Promise<void> {
    await adminDb.collection('privateGroups').doc(group.id).set(group, { merge: true });
  }

  public async getPrivateGroups(): Promise<PrivateGroup[]> {
    const snap = await adminDb.collection('privateGroups').get();
    return snap.docs.map((doc) => doc.data() as PrivateGroup);
  }

  public async saveGroupMember(groupId: string, member: GroupMember): Promise<void> {
    await adminDb.collection('groupMembers').doc(`${groupId}_${member.userId}`).set(member, { merge: true });
  }

  public async getGroupMembers(groupId: string): Promise<GroupMember[]> {
    const snap = await adminDb.collection('groupMembers').where('groupId', '==', groupId).get();
    return snap.docs.map((doc) => doc.data() as GroupMember);
  }

  public async saveGroupMessage(message: GroupMessage): Promise<void> {
    await adminDb.collection('groupMessages').doc(message.id).set(message);
  }

  public async getGroupMessages(groupId: string): Promise<GroupMessage[]> {
    const snap = await adminDb.collection('groupMessages').where('groupId', '==', groupId).get();
    return snap.docs.map((doc) => doc.data() as GroupMessage);
  }
}

export const groupRepository = new GroupRepository();
