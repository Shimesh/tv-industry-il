export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { verifyAuthToken, unauthorizedResponse } from '@/lib/apiAuth';
import { getDocument, deleteDocument, runQuery } from '@/lib/server/firestoreAdminRest';

type TeamDoc = {
  id: string;
  ownerId?: string;
  chatId?: string;
};

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ teamId: string }> },
) {
  const authUser = await verifyAuthToken(request);
  if (!authUser) return unauthorizedResponse();

  const { teamId } = await params;
  if (!teamId) {
    return NextResponse.json({ error: 'מזהה צוות חסר' }, { status: 400 });
  }

  try {
    const team = await getDocument<TeamDoc>(`teams/${teamId}`);
    if (!team) {
      return NextResponse.json({ error: 'הצוות לא נמצא' }, { status: 404 });
    }

    if (team.ownerId !== authUser.uid) {
      return NextResponse.json({ error: 'רק בעל הצוות יכול למחוק את הצוות' }, { status: 403 });
    }

    // Delete team document
    await deleteDocument(`teams/${teamId}`);

    // Delete team chat if it exists
    if (team.chatId) {
      await deleteDocument(`chats/${team.chatId}`).catch(() => null);
    }

    // Expire all pending invites for this team
    const pendingInvites = await runQuery<{ id: string }>({
      from: [{ collectionId: 'teamInvites' }],
      where: {
        fieldFilter: {
          field: { fieldPath: 'teamId' },
          op: 'EQUAL',
          value: { stringValue: teamId },
        },
      },
    }).catch(() => []);

    await Promise.all(
      pendingInvites.map(invite =>
        deleteDocument(`teamInvites/${invite.id}`).catch(() => null),
      ),
    );

    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'מחיקת הצוות נכשלה' },
      { status: 500 },
    );
  }
}
