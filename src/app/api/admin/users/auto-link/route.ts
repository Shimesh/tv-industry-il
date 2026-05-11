import { NextRequest, NextResponse } from 'next/server';
import { requireAdminRequest } from '@/lib/server/adminAuth';
import { getDocument, patchDocument, runQuery } from '@/lib/server/firestoreAdminRest';
import { normalizeContactName, normalizePhone } from '@/lib/contactsUtils';
import { normalizeProfessionalFields } from '@/lib/professionalFields';

type ContactRecord = {
  id: string;
  firstName?: string;
  lastName?: string;
  phone?: string | null;
  normalizedName?: string;
  normalizedPhone?: string | null;
  department?: string;
  departments?: unknown;
  role?: string;
  roles?: unknown;
};

export async function POST(request: NextRequest) {
  const authUser = await requireAdminRequest(request);
  if (authUser instanceof NextResponse) return authUser;

  const body = (await request.json().catch(() => ({}))) as { uid?: string };
  if (!body.uid) return NextResponse.json({ error: 'uid required' }, { status: 400 });

  const userDoc = await getDocument<Record<string, unknown>>(`users/${body.uid}`);
  if (!userDoc) return NextResponse.json({ error: 'user not found' }, { status: 404 });

  const displayName = typeof userDoc.displayName === 'string' ? userDoc.displayName : '';
  const crewName = typeof userDoc.crewName === 'string' ? userDoc.crewName : '';
  const phone = typeof userDoc.phone === 'string' ? userDoc.phone : '';
  const normalizedUserPhone = normalizePhone(phone);

  const candidateNames = [displayName, crewName]
    .map((v) => normalizeContactName(v))
    .filter(Boolean);

  if (!candidateNames.length) {
    return NextResponse.json({ success: false, message: 'אין שם משתמש לחיפוש' });
  }

  const contacts = await runQuery<ContactRecord>({ from: [{ collectionId: 'contacts' }] });

  const match = contacts.find((c) => {
    const contactName = normalizeContactName(
      c.normalizedName || `${c.firstName || ''} ${c.lastName || ''}`,
    );
    const contactPhone = normalizePhone(c.normalizedPhone || c.phone || '');
    if (!candidateNames.includes(contactName)) return false;
    if (!normalizedUserPhone) return true;
    return contactPhone === normalizedUserPhone;
  });

  if (!match?.id) {
    return NextResponse.json({ success: false, message: 'לא נמצא איש קשר מתאים' });
  }

  const now = new Date().toISOString();
  const professional = normalizeProfessionalFields(match as Record<string, unknown>);

  await patchDocument(`users/${body.uid}`, {
    linkedContactId: match.id,
    ...(match.phone ? { phone: match.phone } : {}),
    ...professional,
    updatedAt: now,
  });

  await patchDocument(`contacts/${match.id}`, {
    is_consented: true,
    consentedAt: now,
    consentedByUid: authUser.uid,
    updatedAt: now,
  });

  return NextResponse.json({
    success: true,
    contact: {
      id: match.id,
      name: `${match.firstName || ''} ${match.lastName || ''}`.trim(),
      phone: match.phone ?? null,
      role: professional.role || null,
      roles: professional.roles,
      department: professional.department || null,
      departments: professional.departments,
    },
  });
}
