import { NextRequest, NextResponse } from 'next/server';
import { requireAdminRequest } from '@/lib/server/adminAuth';
import { patchDocument } from '@/lib/server/firestoreAdminRest';
import { normalizeProfessionalFields } from '@/lib/professionalFields';

export async function POST(request: NextRequest) {
  const authUser = await requireAdminRequest(request);
  if (authUser instanceof NextResponse) return authUser;

  const body = (await request.json().catch(() => ({}))) as {
    contactId?: string;
    displayName?: string;
    firstName?: string;
    lastName?: string;
    phone?: string;
    department?: string;
    departments?: string[];
    role?: string;
    roles?: string[];
    siteRole?: string;
    approvalStatus?: string;
  };

  if (!body.contactId) return NextResponse.json({ error: 'contactId required' }, { status: 400 });

  const now = new Date().toISOString();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const patch: Record<string, any> = { updatedAt: now };

  if (body.displayName !== undefined) {
    const parts = body.displayName.trim().split(/\s+/);
    patch.firstName = parts[0] || '';
    patch.lastName = parts.slice(1).join(' ') || '';
  }
  if (body.firstName !== undefined) patch.firstName = body.firstName;
  if (body.lastName !== undefined) patch.lastName = body.lastName;
  if (body.phone !== undefined) patch.phone = body.phone;
  if (body.department !== undefined || body.departments !== undefined || body.role !== undefined || body.roles !== undefined) {
    Object.assign(patch, normalizeProfessionalFields(body as Record<string, unknown>));
  }
  if (body.approvalStatus !== undefined) patch.approvalStatus = body.approvalStatus;

  // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
  await patchDocument(`contacts/${body.contactId}`, patch);

  return NextResponse.json({ success: true });
}
