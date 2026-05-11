import { NextRequest, NextResponse } from 'next/server';
import { requirePrimaryAdminRequest, isPrimaryAdminUid } from '@/lib/server/primaryAdmin';
import { getDocument, patchDocument } from '@/lib/server/firestoreAdminRest';
import { recordSystemEvent } from '@/lib/server/adminTelemetry';
import { normalizeApprovalStatus, type UserApprovalStatus } from '@/lib/userApproval';

export const runtime = 'nodejs';

type Payload = {
  approvalStatus?: UserApprovalStatus;
};

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ uid: string }> },
) {
  const authUser = await requirePrimaryAdminRequest(request);
  if (authUser instanceof NextResponse) return authUser;

  const { uid } = await context.params;
  const decodedUid = decodeURIComponent(uid);
  const body = (await request.json().catch(() => ({}))) as Payload;
  const approvalStatus = normalizeApprovalStatus(body.approvalStatus, 'pending');

  if (approvalStatus === 'pending') {
    return NextResponse.json({ error: 'סטטוס לא תקין' }, { status: 400 });
  }

  if (isPrimaryAdminUid(decodedUid) && approvalStatus !== 'active') {
    return NextResponse.json({ error: 'לא ניתן לחסום את מנהל המערכת הראשי' }, { status: 400 });
  }

  const existing = await getDocument(`users/${decodedUid}`);
  if (!existing) {
    return NextResponse.json({ error: 'המשתמש לא נמצא' }, { status: 404 });
  }

  await patchDocument(`users/${decodedUid}`, {
    approvalStatus,
    ...(isPrimaryAdminUid(decodedUid) ? { siteRole: 'admin' } : {}),
    updatedAt: new Date().toISOString(),
  });

  await recordSystemEvent({
    type: 'user_approval_status_change',
    level: 'success',
    source: 'admin',
    message: `סטטוס האישור של ${decodedUid} עודכן ל-${approvalStatus}`,
    detail: `updatedBy=${authUser.uid}`,
  }).catch(() => undefined);

  return NextResponse.json({ success: true, uid: decodedUid, approvalStatus });
}
