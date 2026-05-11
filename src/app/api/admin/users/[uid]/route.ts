import { NextRequest, NextResponse } from 'next/server';
import { requirePrimaryAdminRequest, isPrimaryAdminUid } from '@/lib/server/primaryAdmin';
import { deleteDocument, getDocument } from '@/lib/server/firestoreAdminRest';
import { getFirebaseAdminAuth } from '@/lib/server/firebaseAdmin';
import { recordSystemEvent } from '@/lib/server/adminTelemetry';

export const runtime = 'nodejs';

export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ uid: string }> },
) {
  const authUser = await requirePrimaryAdminRequest(request);
  if (authUser instanceof NextResponse) return authUser;

  const { uid } = await context.params;
  const decodedUid = decodeURIComponent(uid);

  if (isPrimaryAdminUid(decodedUid)) {
    return NextResponse.json({ error: 'לא ניתן למחוק את מנהל המערכת הראשי' }, { status: 400 });
  }

  const existing = await getDocument(`users/${decodedUid}`);
  if (!existing) {
    return NextResponse.json({ error: 'המשתמש לא נמצא' }, { status: 404 });
  }

  await deleteDocument(`users/${decodedUid}`);
  await getFirebaseAdminAuth().deleteUser(decodedUid).catch((error: unknown) => {
    const code = typeof error === 'object' && error && 'code' in error ? String(error.code) : '';
    if (code !== 'auth/user-not-found') throw error;
  });

  await recordSystemEvent({
    type: 'user_deleted',
    level: 'warn',
    source: 'admin',
    message: `המשתמש ${decodedUid} נמחק`,
    detail: `deletedBy=${authUser.uid}`,
  }).catch(() => undefined);

  return NextResponse.json({ success: true, uid: decodedUid });
}
