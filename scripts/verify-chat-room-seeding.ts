import { buildSeededGroupRoom, buildSeededPrivateRoom } from '../src/lib/chat-v2/roomCreation';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

const currentUser = {
  uid: 'user-current',
  displayName: 'ירון אורבך',
  photoURL: null,
  isOnline: true,
  status: 'available' as const,
};

const privatePeer = {
  uid: 'user-private',
  displayName: 'אייל וענונו',
  photoURL: 'https://example.com/e.jpg',
  isOnline: false,
  status: 'offline' as const,
};

const groupMembers = [
  {
    uid: 'user-1',
    displayName: 'אופיר שבתאי',
    photoURL: null,
    isOnline: true,
    status: 'available' as const,
  },
  {
    uid: 'user-2',
    displayName: 'אייל קליין',
    photoURL: null,
    isOnline: false,
    status: 'busy' as const,
  },
  {
    uid: 'user-2',
    displayName: 'אייל קליין',
    photoURL: null,
    isOnline: false,
    status: 'busy' as const,
  },
];

const privateRoom = buildSeededPrivateRoom({
  chatId: 'chat-private-1',
  currentUser,
  otherUser: privatePeer,
  createdAt: 1234,
});

assert(privateRoom.type === 'private', 'private room type mismatch');
assert(privateRoom.members.length === 2, 'private room should have 2 members');
assert(privateRoom.membersInfo.length === 2, 'private room should expose 2 membersInfo entries');
assert(privateRoom.photoURL === privatePeer.photoURL, 'private room photo should come from peer');
assert(privateRoom.unreadCount === 0, 'private room unread should start at 0');
assert(privateRoom.unreadCountByUser?.[currentUser.uid] === 0, 'private room current user unread should be 0');
assert(privateRoom.unreadCountByUser?.[privatePeer.uid] === 0, 'private room peer unread should be 0');

const groupRoom = buildSeededGroupRoom({
  chatId: 'chat-group-1',
  name: 'צוות צילום',
  currentUser,
  members: groupMembers,
  createdAt: 5678,
});

assert(groupRoom.type === 'group', 'group room type mismatch');
assert(groupRoom.name === 'צוות צילום', 'group room name mismatch');
assert(groupRoom.members.length === 3, 'group room should dedupe duplicate members');
assert(groupRoom.membersInfo.length === 3, 'group room should expose deduped membersInfo');
assert(groupRoom.admins?.includes(currentUser.uid), 'group room should include current user as admin');
assert(groupRoom.unreadCountByUser?.[currentUser.uid] === 0, 'group room current user unread should be 0');
assert(groupRoom.groupPermissions?.canSendMessages === true, 'group room permissions should allow sending');

console.log('verify-chat-room-seeding: ok');
