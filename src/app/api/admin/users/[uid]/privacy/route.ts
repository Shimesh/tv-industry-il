import { NextRequest, NextResponse } from 'next/server';
import { requirePrimaryAdminRequest } from '@/lib/server/primaryAdmin';
import { getDocument, patchDocument } from '@/lib/server/firestoreAdminRest';
import { recordSystemEvent } from '@/lib/server/adminTelemetry';

export const runtime = 'nodejs';

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ uid: string }> },
) {
  const authUser = await requirePrimaryAdminRequest(request);
  if (authUser instanceof NextResponse) return authUser;

  const { uid } = await context.params;
  const decodedUid = decodeURIComponent(uid);
  const body = (await request.json().catch(() => ({}))) as { isPrivate?: boolean };
  const isPrivate = body.isPrivate === true;

  const existing = await getDocument(`users/${decodedUid}`);
  if (!existing) {
    return NextResponse.json({ error: 'המשתמש לא נמצא' }, { status: 404 });
  }

  await patchDocument(`users/${decodedUid}`, {
    isPrivate,
    updatedAt: new Date().toISOString(),
  });

  await recordSystemEvent({
    type: 'user_privacy_change',
    level: 'info',
    source: 'admin',
    message: `פרטיות המשתמש ${decodedUid} עודכנה ל-${isPrivate ? 'פרטי' : 'ציבורי'}`,
    detail: `updatedBy=${authUser.uid}`,
  }).catch(() => undefined);

  return NextResponse.json({ success: true, uid: decodedUid, isPrivate });
}
