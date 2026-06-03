import { NextRequest, NextResponse } from 'next/server';
import { getDocument, patchDocument } from '@/lib/server/firestoreAdminRest';

export const runtime = 'nodejs';

type CallActionBody = {
  callId: string;
  action: 'decline' | 'answer';
  token: string;
};

type CallDoc = {
  status?: string;
  actionToken?: string;
};

export async function POST(request: NextRequest): Promise<NextResponse> {
  let body: CallActionBody;
  try {
    body = (await request.json()) as CallActionBody;
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 });
  }

  const { callId, action, token } = body;
  if (!callId || !action || !token) {
    return NextResponse.json({ error: 'missing_fields' }, { status: 400 });
  }

  if (action !== 'decline' && action !== 'answer') {
    return NextResponse.json({ error: 'invalid_action' }, { status: 400 });
  }

  try {
    const callDoc = await getDocument<CallDoc>(`calls/${callId}`);
    if (!callDoc) {
      return NextResponse.json({ error: 'not_found' }, { status: 404 });
    }

    if (!callDoc.actionToken || callDoc.actionToken !== token) {
      return NextResponse.json({ error: 'invalid_token' }, { status: 403 });
    }

    // Only act on ringing calls
    if (callDoc.status !== 'ringing') {
      return NextResponse.json({ ok: true, skipped: true });
    }

    if (action === 'decline') {
      await patchDocument(`calls/${callId}`, {
        status: 'declined',
        updatedAt: Date.now(),
      });
    }
    // 'answer' requires the client to handle — just acknowledge here

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('[call/action] error:', err);
    return NextResponse.json({ error: 'internal_error' }, { status: 500 });
  }
}
