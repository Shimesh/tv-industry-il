import type { ChatRoom, ChatRoomMemberInfo } from './types';

interface RoomSeedUser {
  uid: string;
  displayName: string;
  photoURL: string | null;
  isOnline: boolean;
  status: 'available' | 'busy' | 'offline';
}

function mapPresenceStatus(status: RoomSeedUser['status']): 'online' | 'away' | 'offline' {
  if (status === 'available') return 'online';
  if (status === 'busy') return 'away';
  return 'offline';
}

interface BuildPrivateRoomParams {
  chatId: string;
  currentUser: RoomSeedUser;
  otherUser: RoomSeedUser;
  createdAt?: number;
}

interface BuildGroupRoomParams {
  chatId: string;
  name: string;
  currentUser: RoomSeedUser;
  members: RoomSeedUser[];
  createdAt?: number;
}

function buildPresenceSummary(
  members: RoomSeedUser[]
): ChatRoom['presenceSummary'] {
  return Object.fromEntries(
    members.map((member) => [
      member.uid,
      {
        isOnline: Boolean(member.isOnline),
        status: mapPresenceStatus(member.status),
      },
    ])
  );
}

function toMembersInfo(
  members: Array<Pick<RoomSeedUser, 'uid' | 'displayName' | 'photoURL'>>
): ChatRoomMemberInfo[] {
  return members.map((member) => ({
    uid: member.uid,
    displayName: member.displayName || '',
    photoURL: member.photoURL ?? null,
  }));
}

export function buildSeededPrivateRoom({
  chatId,
  currentUser,
  otherUser,
  createdAt = Date.now(),
}: BuildPrivateRoomParams): ChatRoom {
  const members = [currentUser, otherUser];

  return {
    id: chatId,
    type: 'private',
    name: '',
    photoURL: otherUser.photoURL ?? null,
    members: members.map((member) => member.uid),
    membersInfo: toMembersInfo(members),
    unreadCount: 0,
    unreadCountByUser: Object.fromEntries(members.map((member) => [member.uid, 0])),
    lastRead: {},
    lastMessage: null,
    lastServerSequence: null,
    presenceSummary: buildPresenceSummary(members),
    createdAt,
    version: 2,
  };
}

export function buildSeededGroupRoom({
  chatId,
  name,
  currentUser,
  members,
  createdAt = Date.now(),
}: BuildGroupRoomParams): ChatRoom {
  const dedupedMembers = new Map<string, RoomSeedUser>();
  [currentUser, ...members].forEach((member) => {
    dedupedMembers.set(member.uid, member);
  });
  const memberList = [...dedupedMembers.values()];

  return {
    id: chatId,
    type: 'group',
    name,
    photoURL: null,
    members: memberList.map((member) => member.uid),
    membersInfo: toMembersInfo(memberList),
    admins: [currentUser.uid],
    unreadCount: 0,
    unreadCountByUser: Object.fromEntries(memberList.map((member) => [member.uid, 0])),
    lastRead: {},
    lastMessage: null,
    lastServerSequence: null,
    presenceSummary: buildPresenceSummary(memberList),
    groupPermissions: {
      canAddMembers: true,
      canEditInfo: true,
      canSendMessages: true,
    },
    createdAt,
    version: 2,
  };
}
