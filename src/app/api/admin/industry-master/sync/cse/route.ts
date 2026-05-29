// Batch Google CSE image enrichment for industry_master entries.
// Searches Israeli TV sites (Mako, Kan, Reshet, Now14) indexed by Google.
// Only processes entries that have no logo yet (logoUrl === '' or missing).
// Force mode (force=true) re-processes all entries using the `since` anti-loop pattern.
//
// Requires GOOGLE_CSE_KEY and GOOGLE_CSE_ID environment variables.
// Setup guide: see googleCseEnrich.ts header comment.
import { NextRequest, NextResponse } from 'next/server';
import { requirePrimaryAdminRequest } from '@/lib/server/primaryAdmin';
import { listDocuments, patchDocument } from '@/lib/server/firestoreAdminRest';
import { fetchCseEnrich } from '@/lib/server/googleCseEnrich';
import type { IndustryMasterEntry } from '@/lib/proCardTypes';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 60;

// Google CSE free tier: 100 queries/day — keep batches small
const BATCH_SIZE = 10;

export async function POST(request: NextRequest) {
  const auth = await requirePrimaryAdminRequest(request);
  if (auth instanceof NextResponse) return auth;

  const apiKey = process.env.GOOGLE_CSE_KEY ?? '';
  const cseId = process.env.GOOGLE_CSE_ID ?? '';
  if (!apiKey || !cseId) {
    return NextResponse.json(
      { error: 'GOOGLE_CSE_KEY או GOOGLE_CSE_ID לא מוגדרים — הוסף ל-.env.local ו-Vercel' },
      { status: 503 },
    );
  }

  const body = await request.json().catch(() => ({})) as { force?: boolean; since?: string };
  const force = body.force === true;
  const since = typeof body.since === 'string' && body.since ? body.since : null;

  const allEntries = await listDocuments<IndustryMasterEntry>('industry_master').catch(() => []);

  const needsCse = allEntries.filter((e) => {
    if (force) {
      if (since && e.lastUpdated && e.lastUpdated >= since) return false;
      return true;
    }
    // Normal mode: only entries with no logo (skip 'none' and real URLs)
    if (e.logoUrl && e.logoUrl !== '') return false;
    return true;
  });

  const pending = needsCse.slice(0, BATCH_SIZE);
  const totalPending = needsCse.length;

  if (pending.length === 0) {
    return NextResponse.json({ processed: 0, enriched: 0, remaining: 0 });
  }

  let enriched = 0;
  for (const entry of pending) {
    const searchName = entry.masterName ?? entry.showName;
    const result = await fetchCseEnrich(searchName, apiKey, cseId);
    const update: Record<string, string> = {
      lastUpdated: new Date().toISOString(),
    };
    if (result.logoUrl) {
      update.logoUrl = result.logoUrl;
      enriched++;
    } else {
      update.logoUrl = 'none';
    }
    await patchDocument(`industry_master/${entry.id}`, update);
  }

  return NextResponse.json({
    processed: pending.length,
    enriched,
    remaining: Math.max(0, totalPending - pending.length),
  });
}
