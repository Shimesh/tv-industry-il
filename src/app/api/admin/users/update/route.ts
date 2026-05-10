import { NextRequest, NextResponse } from 'next/server';
import { requireAdminRequest } from '@/lib/server/adminAuth';
import { getDocument, patchDocument } from '@/lib/server/firestoreAdminRest';

export async function POST(request: NextRequest) {
  const authUser = await requireAdminRequest(request);
  if (authUser instanceof NextResponse) return authUser;

  const body = (await request.json().catch(() => ({}))) as {
    uid?: string;
    displayName?: string;
    phone?: string;
    department?: string;
    role?: string;
    forceContactId?: string;
  };

  if (!body.uid) return NextResponse.json({ error: 'uid required' }, { status: 400 });

  const now = new Date().toISOString();
  const userPatch: Record<string, string | null> = { updatedAt: now };
  if (body.displayName !== undefined) userPatch.displayName = body.displayName;
  if (body.phone !== undefined) userPatch.phone = body.phone;
  if (body.department !== undefined) userPatch.department = body.department;
  if (body.role !== undefined) userPatch.role = body.role;
  if (body.forceContactId) userPatch.linkedContactId = body.forceContactId;

  await patchDocument(`users/${body.uid}`, userPatch);

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
    const contactPatch: Record<string, string | boolean | null> = { updatedAt: now };
    if (body.phone !== undefined) contactPatch.phone = body.phone;
    if (body.department !== undefined) contactPatch.department = body.department;
    if (body.role !== undefined) contactPatch.role = body.role;
    if (body.forceContactId) {
      contactPatch.is_consented = true;
      contactPatch.consentedAt = now;
      contactPatch.consentedByUid = authUser.uid;
    }
    await patchDocument(`contacts/${contactId}`, contactPatch);
  }

  return NextResponse.json({ success: true });
}
