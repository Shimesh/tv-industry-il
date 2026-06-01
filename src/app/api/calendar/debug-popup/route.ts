import { NextRequest, NextResponse } from 'next/server';
import { verifyAuthToken, unauthorizedResponse } from '@/lib/apiAuth';
import {
  extractHerzliyaBaseUrl,
  extractHerzliyaEventIds,
  buildHerzliyaPopupUrl,
  extractStudioFromPopup,
  extractDateFromPopup,
} from '@/lib/productionScheduleParser';

export const runtime = 'nodejs';
export const maxDuration = 30;

const FETCH_OPTIONS: RequestInit = {
  headers: {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
    Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'Accept-Language': 'he-IL,he;q=0.9,en;q=0.8',
  },
  // @ts-expect-error - Node.js 20
  rejectUnauthorized: false,
};

export async function POST(request: NextRequest): Promise<NextResponse> {
  const authUser = await verifyAuthToken(request);
  if (!authUser) return unauthorizedResponse();

  const { url } = (await request.json()) as { url?: string };
  if (!url) return NextResponse.json({ error: 'missing_url' }, { status: 400 });

  const res = await fetch(url, FETCH_OPTIONS).catch(e => { throw new Error(String(e)); });
  if (!res.ok) return NextResponse.json({ error: `HTTP ${res.status}` }, { status: 502 });

  const html = await res.text();
  const events = extractHerzliyaEventIds(html);
  if (events.length === 0) {
    return NextResponse.json({ error: 'no_events', htmlSample: html.slice(0, 500) });
  }

  const baseUrl = extractHerzliyaBaseUrl(html) || (() => {
    const u = new URL(url); return `${u.protocol}//${u.host}${u.pathname}`;
  })();

  const first = events[0];
  const popupUrl = buildHerzliyaPopupUrl(baseUrl, first.herzliyaId);
  const popupRes = await fetch(popupUrl, FETCH_OPTIONS).catch(e => { throw new Error(String(e)); });
  const popupHtml = popupRes.ok ? await popupRes.text() : '';

  return NextResponse.json({
    eventName: first.name,
    herzliyaId: first.herzliyaId,
    popupUrl,
    extractedStudio: extractStudioFromPopup(popupHtml),
    extractedDate: extractDateFromPopup(popupHtml),
    popupHtml: popupHtml.slice(0, 2000),
  });
}
