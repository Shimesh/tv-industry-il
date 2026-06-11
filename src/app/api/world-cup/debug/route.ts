import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const BASE = 'https://site.api.espn.com/apis/site/v2/sports/soccer/fifa.world';
const CORE = 'https://sports.core.api.espn.com/v2/sports/soccer/leagues/fifa.world';

async function tryFetch(url: string) {
  try {
    const res = await fetch(url, { cache: 'no-store', signal: AbortSignal.timeout(6000) });
    const text = await res.text();
    let json: unknown = null;
    try { json = JSON.parse(text); } catch { /* keep as text */ }
    return { url, status: res.status, ok: res.ok, preview: text.slice(0, 800), json };
  } catch (e) {
    return { url, status: 0, ok: false, error: String(e) };
  }
}

export async function GET() {
  const today = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const yesterday = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10).replace(/-/g, '');

  const results = await Promise.all([
    tryFetch(`${BASE}/scoreboard`),
    tryFetch(`${BASE}/scoreboard?dates=${today}`),
    tryFetch(`${BASE}/scoreboard?dates=${yesterday}`),
    tryFetch(`${BASE}/scoreboard?dates=20260611`),
    tryFetch(`${BASE}/scoreboard?dates=20260611&limit=100`),
    tryFetch(`${BASE}/schedule`),
    tryFetch(`${BASE}/schedule?season=2026`),
    tryFetch(`${CORE}/events?season=2026&limit=10`),
    tryFetch(`${CORE}/events?dates=20260611&limit=20`),
  ]);

  return NextResponse.json({ now: new Date().toISOString(), today, yesterday, results });
}
