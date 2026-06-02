import { NextRequest, NextResponse } from 'next/server';
import { requireAdminRequest } from '@/lib/server/adminAuth';
import { listDocuments } from '@/lib/server/firestoreAdminRest';

export const runtime = 'nodejs';

type PushLogDoc = {
  id: string;
  sentAt?: string;
  title?: string;
  message?: string;
  linkUrl?: string | null;
  target?: string;
  targetUserId?: string | null;
  sentBy?: string;
  sentByEmail?: string | null;
  recipientCount?: number;
  pushTokensCount?: number;
  webPushCount?: number;
};

export async function GET(request: NextRequest): Promise<NextResponse> {
  const authUser = await requireAdminRequest(request);
  if (authUser instanceof NextResponse) return authUser;

  try {
    const docs = await listDocuments<PushLogDoc>('pushLogs');
    // Sort newest first
    docs.sort((a, b) => {
      const aTs = a.sentAt ? new Date(a.sentAt).getTime() : 0;
      const bTs = b.sentAt ? new Date(b.sentAt).getTime() : 0;
      return bTs - aTs;
    });
    return NextResponse.json({ logs: docs.slice(0, 100) });
  } catch (err) {
    console.error('[push-logs] error:', err);
    return NextResponse.json({ error: 'internal_error' }, { status: 500 });
  }
}
