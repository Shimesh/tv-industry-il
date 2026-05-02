import { createHash } from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { unauthorizedResponse, verifyAuthToken } from '@/lib/apiAuth';
import { createDocument, getDocument, patchDocument, runQuery } from '@/lib/server/firestoreAdminRest';

export const runtime = 'nodejs';

type RawUser = {
  id: string;
  displayName?: string;
  email?: string;
  photoURL?: string | null;
  role?: string;
  department?: string;
};

type RawChat = {
  id: string;
  type?: string;
  name?: string;
  members?: string[];
  membersInfo?: Array<{ uid?: string; displayName?: string; photoURL?: string | null }>;
  privateKey?: string;
};

function cleanText(value: unknown, maxLength: number): string {
  return typeof value === 'string' ? value.trim().slice(0, maxLength) : '';
}

function privateKeyFor(leftUid: string, rightUid: string): string {
  return [leftUid, rightUid].sort().join('__');
}

function privateChatId(privateKey: string): string {
  return `private_${createHash('sha1').update(privateKey).digest('hex')}`;
}

function displayNameFor(user: RawUser | null, fallback: string): string {
  return user?.displayName?.trim() || user?.email?.split('@')[0] || fallback;
}

async function queryPrivateChatByKey(privateKey: string): Promise<RawChat | null> {
  const matches = await runQuery<RawChat>({
    from: [{ collectionId: 'chats' }],
    where: {
      fieldFilter: {
        field: { fieldPath: 'privateKey' },
        op: 'EQUAL',
        value: { stringValue: privateKey },
      },
    },
    limit: 1,
  });
  return matches[0] ?? null;
}

async function queryLegacyPrivateChat(currentUid: string, otherUid: string): Promise<RawChat | null> {
  const candidates = await runQuery<RawChat>({
    from: [{ collectionId: 'chats' }],
    where: {
      fieldFilter: {
        field: { fieldPath: 'members' },
        op: 'ARRAY_CONTAINS',
        value: { stringValue: currentUid },
      },
    },
    limit: 100,
  });

  return candidates.find((chat) => (
    chat.type === 'private' &&
    Array.isArray(chat.members) &&
    chat.members.includes(currentUid) &&
    chat.members.includes(otherUid)
  )) ?? null;
}

async function createOrFindPrivateConversation(authUser: NonNullable<Awaited<ReturnType<typeof verifyAuthToken>>>, otherUserId: string) {
  if (!otherUserId || otherUserId === authUser.uid) {
    return NextResponse.json({ error: 'Invalid target user' }, { status: 400 });
  }

  const [currentProfile, otherProfile] = await Promise.all([
    getDocument<RawUser>(`users/${authUser.uid}`),
    getDocument<RawUser>(`users/${otherUserId}`),
  ]);

  if (!otherProfile) {
    return NextResponse.json({ error: 'Target user was not found' }, { status: 404 });
  }

  const privateKey = privateKeyFor(authUser.uid, otherUserId);
  const deterministicId = privateChatId(privateKey);

  const deterministicChat = await getDocument<RawChat>(`chats/${deterministicId}`);
  if (deterministicChat?.members?.includes(authUser.uid)) {
    return NextResponse.json({ chatId: deterministicId, reused: true });
  }

  const byKey = await queryPrivateChatByKey(privateKey);
  if (byKey?.id) {
    return NextResponse.json({ chatId: byKey.id, reused: true });
  }

  const legacy = await queryLegacyPrivateChat(authUser.uid, otherUserId);
  if (legacy?.id) {
    await patchDocument(`chats/${legacy.id}`, { privateKey });
    return NextResponse.json({ chatId: legacy.id, reused: true, upgraded: true });
  }

  const now = Date.now();
  const members = [authUser.uid, otherUserId];
  await createDocument('chats', {
    type: 'private',
    name: '',
    photoURL: otherProfile.photoURL || null,
    privateKey,
    members,
    membersInfo: [
      {
        uid: authUser.uid,
        displayName: displayNameFor(currentProfile, authUser.displayName || authUser.email || 'משתמש'),
        photoURL: currentProfile?.photoURL || authUser.photoURL || null,
      },
      {
        uid: otherUserId,
        displayName: displayNameFor(otherProfile, 'משתמש'),
        photoURL: otherProfile.photoURL || null,
      },
    ],
    unreadCount: Object.fromEntries(members.map((uid) => [uid, 0])),
    lastRead: Object.fromEntries(members.map((uid) => [uid, now])),
    createdBy: authUser.uid,
    createdAt: now,
    version: 2,
  }, deterministicId);

  return NextResponse.json({ chatId: deterministicId, reused: false });
}

async function createGroupConversation(authUser: NonNullable<Awaited<ReturnType<typeof verifyAuthToken>>>, name: string, rawMemberIds: unknown) {
  const groupName = cleanText(name, 80);
  if (!groupName) {
    return NextResponse.json({ error: 'Missing group name' }, { status: 400 });
  }

  const requestedMembers = Array.isArray(rawMemberIds)
    ? rawMemberIds.filter((value): value is string => typeof value === 'string').map((value) => value.trim()).filter(Boolean)
    : [];
  const members = [...new Set([authUser.uid, ...requestedMembers])];

  if (members.length < 2) {
    return NextResponse.json({ error: 'A group must include at least one other user' }, { status: 400 });
  }

  const profiles = await Promise.all(members.map((uid) => getDocument<RawUser>(`users/${uid}`)));
  const validMembers = members.filter((uid, index) => uid === authUser.uid || Boolean(profiles[index]));

  if (!validMembers.includes(authUser.uid) || validMembers.length < 2) {
    return NextResponse.json({ error: 'Group members were not found' }, { status: 400 });
  }

  const now = Date.now();
  const chat = await createDocument<RawChat>('chats', {
    type: 'group',
    name: groupName,
    photoURL: null,
    members: validMembers,
    admins: [authUser.uid],
    membersInfo: validMembers.map((uid) => {
      const profile = profiles[members.indexOf(uid)];
      return {
        uid,
        displayName: displayNameFor(profile, uid === authUser.uid ? authUser.displayName || authUser.email || 'משתמש' : 'משתמש'),
        photoURL: profile?.photoURL || (uid === authUser.uid ? authUser.photoURL || null : null),
      };
    }),
    unreadCount: Object.fromEntries(validMembers.map((uid) => [uid, 0])),
    lastRead: Object.fromEntries(validMembers.map((uid) => [uid, now])),
    groupPermissions: {
      canAddMembers: true,
      canEditInfo: true,
      canSendMessages: true,
    },
    createdBy: authUser.uid,
    createdAt: now,
    version: 2,
  });

  await createDocument(`chats/${chat.id}/messages`, {
    senderId: 'system',
    senderName: 'מערכת',
    senderPhoto: null,
    text: `${displayNameFor(profiles[members.indexOf(authUser.uid)], authUser.displayName || 'משתמש')} יצר/ה את הקבוצה "${groupName}"`,
    type: 'system',
    fileURL: null,
    fileName: null,
    fileSize: null,
    duration: null,
    mimeType: null,
    replyTo: null,
    readBy: Object.fromEntries(validMembers.map((uid) => [uid, now])),
    deliveredTo: {},
    createdAt: now,
  });

  await patchDocument(`chats/${chat.id}`, {
    lastMessage: {
      text: `הקבוצה "${groupName}" נוצרה`,
      senderId: 'system',
      senderName: 'מערכת',
      timestamp: now,
      kind: 'system',
    },
  });

  return NextResponse.json({ chatId: chat.id, reused: false });
}

export async function POST(request: NextRequest) {
  const authUser = await verifyAuthToken(request);
  if (!authUser) return unauthorizedResponse();

  try {
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const type = body.type === 'group' ? 'group' : 'private';

    if (type === 'group') {
      return createGroupConversation(authUser, cleanText(body.name, 80), body.memberIds);
    }

    return createOrFindPrivateConversation(authUser, cleanText(body.otherUserId, 160));
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to create conversation' },
      { status: 500 },
    );
  }
}
