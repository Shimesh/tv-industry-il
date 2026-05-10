import { NextRequest, NextResponse } from 'next/server';
import { requireAdminRequest } from '@/lib/server/adminAuth';
import { getDocument, listDocuments, patchDocument } from '@/lib/server/firestoreAdminRest';
import { recordRouteMetric, recordSystemEvent } from '@/lib/server/adminTelemetry';

export const runtime = 'nodejs';

type Payload = {
  siteRole?: 'admin' | 'moderator' | 'user' | null;
};

type RawUser = Record<string, unknown> & {
  id?: string;
  profileId?: string | null;
  linkedContactId?: string | number | null;
  linkedUids?: unknown;
};

function stringArrayField(value: unknown): string[] {
  return Array.isArray(value) ? value.map((entry) => String(entry)).filter(Boolean) : [];
}

async function resolveLinkedUserIds(uid: string): Promise<{ documentIds: string[]; linkedUids: string[] }> {
  const [target, users] = await Promise.all([
    getDocument<RawUser>(`users/${uid}`),
    listDocuments<RawUser>('users'),
  ]);

  if (!target) return { documentIds: [uid], linkedUids: [uid] };

  const linkedUids = new Set<string>([uid, ...stringArrayField(target.linkedUids)]);
  const documentIds = new Set<string>([uid]);
  const profileId = typeof target.profileId === 'string' && target.profileId.trim() ? target.profileId.trim() : '';
  const linkedContactId = target.linkedContactId !== null && target.linkedContactId !== undefined
    ? String(target.linkedContactId).trim()
    : '';

  for (const user of users) {
    if (!user.id) continue;
    const userLinkedUids = stringArrayField(user.linkedUids);
    const sharesUid = user.id === uid || userLinkedUids.includes(uid) || userLinkedUids.some((linkedUid) => linkedUids.has(linkedUid));
    const sharesProfile = profileId && user.profileId === profileId;
    const sharesContact = linkedContactId && user.linkedContactId !== null && user.linkedContactId !== undefined && String(user.linkedContactId).trim() === linkedContactId;
    if (sharesUid || sharesProfile || sharesContact) {
      documentIds.add(user.id);
      linkedUids.add(user.id);
      userLinkedUids.forEach((linkedUid) => linkedUids.add(linkedUid));
    }
  }

  return { documentIds: Array.from(documentIds), linkedUids: Array.from(linkedUids) };
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ uid: string }> },
) {
  const authUser = await requireAdminRequest(request);
  if (authUser instanceof NextResponse) {
    return authUser;
  }

  try {
    const { uid } = await context.params;
    const body = (await request.json()) as Payload;
    const requestedRole = body.siteRole;
    const siteRole =
      requestedRole === 'admin' || requestedRole === 'moderator'
        ? requestedRole
        : null;

    const linkedUserIds = await resolveLinkedUserIds(uid);
    await Promise.all(linkedUserIds.documentIds.map((linkedUid) => patchDocument(`users/${linkedUid}`, {
      siteRole,
      linkedUids: linkedUserIds.linkedUids,
      updatedAt: new Date().toISOString(),
    })));

    await recordSystemEvent({
      type: 'admin_role_change',
      level: 'success',
      source: 'admin',
      message: `הרשאת המשתמש ${uid} עודכנה ל-${siteRole || 'user'}`,
      detail: `updatedBy=${authUser.uid}`,
    });
    await recordRouteMetric({ route: '/api/admin/users/[uid]/role', ok: true, statusCode: 200 });

    return NextResponse.json({ success: true, uid, siteRole: siteRole || 'user' });
  } catch (error) {
    await recordRouteMetric({
      route: '/api/admin/users/[uid]/role',
      ok: false,
      statusCode: 500,
      error,
    });
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to update role' },
      { status: 500 },
    );
  }
}
