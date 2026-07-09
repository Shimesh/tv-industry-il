import { NextRequest, NextResponse } from 'next/server';
import { syncHerzliyaUrl } from '@/lib/server/herzliyaSync';

export const runtime = 'nodejs';
export const maxDuration = 300;
export const preferredRegion = 'fra1';

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
    const probeStartedAt = Date.now();
    const probe = await fetch(TARGET_URL, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'he-IL,he;q=0.9,en;q=0.8',
      },
      signal: AbortSignal.timeout(60_000),
      // @ts-expect-error - Node.js fetch option used by existing Herzliya sync code
      rejectUnauthorized: false,
    });
    const probeHtml = await probe.text();
    if (!probe.ok || !probeHtml.includes('openmd2')) {
      return NextResponse.json({
        ok: false,
        stage: 'probe',
        elapsedMs: Date.now() - startedAt,
        probeMs: Date.now() - probeStartedAt,
        status: probe.status,
        htmlLength: probeHtml.length,
        sample: probeHtml.replace(/\s+/g, ' ').slice(0, 500),
      }, { status: 502 });
    }

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
