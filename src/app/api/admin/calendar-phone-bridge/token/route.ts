import { randomBytes } from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { requirePrimaryAdminRequest } from '@/lib/server/primaryAdmin';
import { patchDocument } from '@/lib/server/firestoreAdminRest';

export const runtime = 'nodejs';

const DEFAULT_TARGET_UID = 'pVtM4KuNSSSexQ3W32UmImJHJID3';
const TOKEN_TTL_MS = 30 * 60 * 1000;

export async function POST(request: NextRequest) {
  const authUser = await requirePrimaryAdminRequest(request);
  if (authUser instanceof NextResponse) return authUser;

  const body = (await request.json().catch(() => ({}))) as { targetUid?: string };
  const targetUid = String(body.targetUid || DEFAULT_TARGET_UID).trim();
  if (!targetUid) return NextResponse.json({ error: 'חסר משתמש יעד' }, { status: 400 });

  const token = randomBytes(24).toString('base64url');
  const now = Date.now();
  const expiresAt = now + TOKEN_TTL_MS;

  await patchDocument(`calendar_phone_bridge_tokens/${token}`, {
    token,
    targetUid,
    createdBy: authUser.uid,
    createdAt: now,
    expiresAt,
    usedAt: null,
    status: 'active',
    bridgePhase: 'created',
    bridgeMessage: 'נוצר טוקן. מחכה להפעלה מהטלפון.',
    bridgeProgress: 5,
    eventCount: 0,
    popupDone: 0,
    popupTotal: 0,
    productionCount: 0,
    error: null,
    log: [`[${new Date().toLocaleTimeString('he-IL')}] נוצר טוקן. מחכה להפעלה מהטלפון.`],
  });

  return NextResponse.json({
    ok: true,
    token,
    targetUid,
    expiresAt,
    expiresInMinutes: Math.round(TOKEN_TTL_MS / 60000),
    ingestUrl: `${new URL(request.url).origin}/api/admin/calendar-phone-bridge/ingest`,
  });
}
