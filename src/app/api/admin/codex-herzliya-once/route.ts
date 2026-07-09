import { NextRequest, NextResponse } from 'next/server';
import { syncHerzliyaUrl } from '@/lib/server/herzliyaSync';

export const runtime = 'nodejs';
export const maxDuration = 300;

const ONCE_TOKEN = 'codex-once-20260709-6ad9e27c0f0d49a2a4b2';
const TARGET_UID = 'pVtM4KuNSSSexQ3W32UmImJHJID3';
const TARGET_URL = 'https://hsil.acc.co.il:5443/sendwa.html?A=A8A2047B-C268-4426-8276-FC80F3960DD0,18072026';

export async function POST(request: NextRequest): Promise<NextResponse> {
  const token = request.headers.get('x-codex-once-token') || request.nextUrl.searchParams.get('token') || '';
  if (token !== ONCE_TOKEN) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const startedAt = Date.now();
  try {
    const result = await syncHerzliyaUrl(TARGET_UID, TARGET_URL);
    return NextResponse.json({
      ok: result.status === 'success',
      elapsedMs: Date.now() - startedAt,
      result,
    });
  } catch (error) {
    return NextResponse.json({
      ok: false,
      elapsedMs: Date.now() - startedAt,
      error: error instanceof Error ? error.message : String(error),
    }, { status: 500 });
  }
}
