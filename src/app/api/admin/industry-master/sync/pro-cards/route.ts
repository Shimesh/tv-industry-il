// Links every global_production document to its matching industry_master entry
// by writing masterEntryId onto the production doc. This pre-computes the
// resolution that pro-card-history/route.ts currently does at read-time, making
// future lookups O(1) without suffix-stripping on every request.
import { NextRequest, NextResponse } from 'next/server';
import { requirePrimaryAdminRequest } from '@/lib/server/primaryAdmin';
import { listDocuments, patchDocument } from '@/lib/server/firestoreAdminRest';
import { normalizeName } from '@/lib/crewNormalization';
import { stripProductionSuffixes } from '@/lib/productionNameNormalization';
import type { IndustryMasterEntry } from '@/lib/proCardTypes';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 60;

type RawProduction = { id?: string; name?: string; masterEntryId?: string };

export async function POST(request: NextRequest) {
  const auth = await requirePrimaryAdminRequest(request);
  if (auth instanceof NextResponse) return auth;

  const [masterDocs, productions] = await Promise.all([
    listDocuments<IndustryMasterEntry>('industry_master').catch(() => []),
    listDocuments<RawProduction>('global_productions').catch(() => []),
  ]);

  // Build inverted index: every known name variant → master entry id
  const masterMap = new Map<string, string>();
  for (const entry of masterDocs) {
    const displayName = entry.masterName ?? entry.showName ?? '';
    const canonical = stripProductionSuffixes(displayName);
    const entryId = entry.id;
    masterMap.set(normalizeName(canonical), entryId);
    if (canonical !== displayName) masterMap.set(normalizeName(displayName), entryId);
    for (const v of (entry.variations ?? [])) {
      if (v) masterMap.set(normalizeName(v), entryId);
    }
  }

  let matched = 0;
  let unmatched = 0;
  let skipped = 0;

  for (const prod of productions) {
    if (!prod.id || !prod.name) { unmatched++; continue; }

    const rawName = prod.name;
    const canonicalName = stripProductionSuffixes(rawName);
    const masterId =
      masterMap.get(normalizeName(rawName)) ??
      masterMap.get(normalizeName(canonicalName)) ??
      null;

    if (!masterId) { unmatched++; continue; }
    // Skip if already linked to same entry — avoid unnecessary writes
    if (prod.masterEntryId === masterId) { skipped++; continue; }

    await patchDocument(`global_productions/${prod.id}`, {
      masterEntryId: masterId,
      masterLinkedAt: new Date().toISOString(),
    });
    matched++;
  }

  return NextResponse.json({
    total: productions.length,
    matched,
    unmatched,
    skipped,
  });
}
