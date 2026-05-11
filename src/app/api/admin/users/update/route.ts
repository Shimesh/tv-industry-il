import { NextRequest, NextResponse } from 'next/server';
import { requireAdminRequest } from '@/lib/server/adminAuth';
import { getDocument, listDocuments, patchDocument } from '@/lib/server/firestoreAdminRest';
import { normalizeProfessionalFields } from '@/lib/professionalFields';

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

export async function POST(request: NextRequest) {
  const authUser = await requireAdminRequest(request);
  if (authUser instanceof NextResponse) return authUser;

  const body = (await request.json().catch(() => ({}))) as {
    uid?: string;
    displayName?: string;
    phone?: string;
    department?: string;
    departments?: string[];
    role?: string;
    roles?: string[];
    forceContactId?: string;
  };

  if (!body.uid) return NextResponse.json({ error: 'uid required' }, { status: 400 });

  const now = new Date().toISOString();
  const userPatch: Record<string, string | null | string[]> = { updatedAt: now };
  if (body.displayName !== undefined) userPatch.displayName = body.displayName;
  if (body.phone !== undefined) userPatch.phone = body.phone;
  if (body.department !== undefined) userPatch.department = body.department;
  if (body.departments !== undefined) userPatch.departments = body.departments;
  if (body.role !== undefined) userPatch.role = body.role;
  if (body.roles !== undefined) userPatch.roles = body.roles;
  if (body.forceContactId) userPatch.linkedContactId = body.forceContactId;
  Object.assign(userPatch, normalizeProfessionalFields(userPatch));

  const linkedUserIds = await resolveLinkedUserIds(body.uid);
  const syncedPatch = { ...userPatch, linkedUids: linkedUserIds.linkedUids };
  await Promise.all(linkedUserIds.documentIds.map((uid) => patchDocument(`users/${uid}`, syncedPatch)));

  // Determine which contact to sync: forceContactId > existing linkedContactId
  let contactId: string | null = body.forceContactId || null;
  if (!contactId) {
    const userDoc = await getDocument<{ linkedContactId?: string | number | null }>(
      `users/${body.uid}`,
    );
    const raw = userDoc?.linkedContactId;
    contactId = raw ? String(raw) : null;
  }

  if (contactId) {
    const contactPatch: Record<string, string | boolean | null | string[]> = {
      updatedAt: now,
      is_consented: true,
      consentedAt: now,
      consentedByUid: authUser.uid,
    };
    if (body.phone !== undefined) contactPatch.phone = body.phone;
    if (body.department !== undefined || body.departments !== undefined || body.role !== undefined || body.roles !== undefined) {
      Object.assign(contactPatch, normalizeProfessionalFields(userPatch));
    }
    await patchDocument(`contacts/${contactId}`, contactPatch);
  }

  return NextResponse.json({ success: true });
}
