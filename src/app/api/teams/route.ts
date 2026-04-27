import { NextRequest, NextResponse } from 'next/server';
import { verifyAuthToken, unauthorizedResponse } from '@/lib/apiAuth';
import {
  createDocument,
  deleteDocument,
  getDocument,
} from '@/lib/server/firestoreAdminRest';
import { recordRouteMetric, recordSystemEvent } from '@/lib/server/adminTelemetry';

type UserRecord = {
  id: string;
  displayName?: string;
  photoURL?: string | null;
};

function sanitizeText(value: unknown, maxLength: number) {
  return typeof value === 'string' ? value.trim().slice(0, maxLength) : '';
}

export async function POST(request: NextRequest) {
  const authUser = await verifyAuthToken(request);
  if (!authUser) {
    return unauthorizedResponse();
  }

  try {
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const name = sanitizeText(body.name, 50);
    const description = sanitizeText(body.description, 240);

    if (name.length < 2) {
      return NextResponse.json({ error: 'שם הצוות חייב להכיל לפחות 2 תווים' }, { status: 400 });
    }

    const userDoc = await getDocument<UserRecord>(`users/${authUser.uid}`);
    const displayName = userDoc?.displayName || authUser.displayName || authUser.email || 'משתמש';
    const displayPhoto = userDoc?.photoURL || authUser.photoURL || null;


    const createdAt = new Date().toISOString();
    const chat = await createDocument<{ id: string }>('chats', {
      type: 'group',
      name: `צוות: ${name}`,
      members: [authUser.uid],
      admins: [authUser.uid],
      membersInfo: [{ uid: authUser.uid, displayName, photoURL: displayPhoto }],
      unreadCount: {},
      lastRead: {},
      isTeamChat: true,
      createdAt,
    });

    try {
      const team = await createDocument<{ id: string }>('teams', {
        name,
        description,
        photoURL: null,
        ownerId: authUser.uid,
        members: [{
          uid: authUser.uid,
          displayName,
          photoURL: displayPhoto,
          role: 'owner',
          joinedAt: Date.now(),
        }],
        memberUids: [authUser.uid],
        adminUids: [authUser.uid],
        editorUids: [authUser.uid],
        chatId: chat.id,
        createdAt,
        updatedAt: createdAt,
      });

      try {
        await createDocument(`chats/${chat.id}/messages`, {
          senderId: 'system',
          senderName: 'מערכת',
          text: `${displayName} יצר/ה את הצוות "${name}"`,
          type: 'system',
          createdAt,
        });
      } catch (messageError) {
        await recordSystemEvent({
          type: 'team_system_message_failed',
          level: 'warn',
          source: 'teams',
          message: 'הצוות נוצר אך הודעת המערכת לא נשמרה',
          detail: messageError instanceof Error ? messageError.message : String(messageError),
        });
      }

      await recordRouteMetric({ route: '/api/teams', ok: true, statusCode: 200 });
      return NextResponse.json({ success: true, teamId: team.id });
    } catch (teamError) {
      await deleteDocument(`chats/${chat.id}`);
      throw teamError;
    }
  } catch (error) {
    await recordRouteMetric({ route: '/api/teams', ok: false, statusCode: 500, error });
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'יצירת הצוות נכשלה' },
      { status: 500 },
    );
  }
}
