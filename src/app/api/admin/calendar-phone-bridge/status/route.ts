import { NextRequest, NextResponse } from 'next/server';
import { getDocument, patchDocument } from '@/lib/server/firestoreAdminRest';
import { getPrimaryAdminUid, requirePrimaryAdminRequest } from '@/lib/server/primaryAdmin';

export const runtime = 'nodejs';

type BridgeTokenDoc = {
  targetUid?: string;
  createdBy?: string;
  createdAt?: number;
  expiresAt?: number;
  usedAt?: number | null;
  status?: string;
  bridgePhase?: string;
  bridgeMessage?: string;
  bridgeProgress?: number;
  eventCount?: number;
  popupDone?: number;
  popupTotal?: number;
  productionCount?: number;
  error?: string | null;
  log?: unknown;
};

function cors(response: NextResponse): NextResponse {
  response.headers.set('Access-Control-Allow-Origin', '*');
  response.headers.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  response.headers.set('Access-Control-Allow-Headers', 'content-type, authorization');
  response.headers.set('Access-Control-Max-Age', '600');
  return response;
}

function safeLog(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === 'string').slice(-30)
    : [];
}

async function readToken(token: string): Promise<BridgeTokenDoc | null> {
  if (!token) return null;
  return getDocument<BridgeTokenDoc>(`calendar_phone_bridge_tokens/${token}`).catch(() => null);
}

export async function OPTIONS() {
  return cors(new NextResponse(null, { status: 204 }));
}

export async function GET(request: NextRequest) {
  const authUser = await requirePrimaryAdminRequest(request);
  if (authUser instanceof NextResponse) return authUser;

  const token = request.nextUrl.searchParams.get('token') || '';
  const tokenDoc = await readToken(token);
  if (!tokenDoc || tokenDoc.createdBy !== getPrimaryAdminUid()) {
    return NextResponse.json({ error: 'טוקן לא נמצא' }, { status: 404 });
  }

  return NextResponse.json({
    ok: true,
    status: tokenDoc.status || 'active',
    phase: tokenDoc.bridgePhase || 'created',
    message: tokenDoc.bridgeMessage || '',
    progress: tokenDoc.bridgeProgress || 0,
    eventCount: tokenDoc.eventCount || 0,
    popupDone: tokenDoc.popupDone || 0,
    popupTotal: tokenDoc.popupTotal || 0,
    productionCount: tokenDoc.productionCount || 0,
    expiresAt: tokenDoc.expiresAt || null,
    usedAt: tokenDoc.usedAt || null,
    error: tokenDoc.error || null,
    log: safeLog(tokenDoc.log),
  });
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json().catch(() => ({}))) as {
      token?: string;
      phase?: string;
      message?: string;
      progress?: number;
      eventCount?: number;
      popupDone?: number;
      popupTotal?: number;
      error?: string;
    };
    const token = String(body.token || '').trim();
    const tokenDoc = await readToken(token);
    if (!tokenDoc || tokenDoc.status !== 'active' || tokenDoc.createdBy !== getPrimaryAdminUid()) {
      return cors(NextResponse.json({ error: 'טוקן לא תקין' }, { status: 403 }));
    }
    if (!tokenDoc.expiresAt || tokenDoc.expiresAt < Date.now()) {
      return cors(NextResponse.json({ error: 'הטוקן פג תוקף' }, { status: 403 }));
    }

    const phase = String(body.phase || 'running').slice(0, 80);
    const message = String(body.message || '').slice(0, 300);
    const log = [
      ...safeLog(tokenDoc.log),
      `[${new Date().toLocaleTimeString('he-IL')}] ${message || phase}`,
    ].slice(-30);

    await patchDocument(`calendar_phone_bridge_tokens/${token}`, {
      bridgePhase: phase,
      bridgeMessage: message,
      bridgeProgress: Math.max(0, Math.min(100, Number(body.progress || 0))),
      ...(typeof body.eventCount === 'number' ? { eventCount: body.eventCount } : {}),
      ...(typeof body.popupDone === 'number' ? { popupDone: body.popupDone } : {}),
      ...(typeof body.popupTotal === 'number' ? { popupTotal: body.popupTotal } : {}),
      ...(body.error ? { error: String(body.error).slice(0, 500) } : {}),
      log,
      lastStatusAt: Date.now(),
    });

    return cors(NextResponse.json({ ok: true }));
  } catch (error) {
    return cors(NextResponse.json({
      error: error instanceof Error ? error.message : 'עדכון סטטוס נכשל',
    }, { status: 500 }));
  }
}
