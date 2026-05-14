import { NextRequest, NextResponse } from 'next/server';
import { requirePrimaryAdminRequest } from '@/lib/server/primaryAdmin';
import { createDocument, listDocuments, runQuery } from '@/lib/server/firestoreAdminRest';
import type { ProductionRegistryEntry } from '@/lib/proCardTypes';
import type { GlobalProductionDoc } from '@/lib/globalProductions';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 60;

type FlexibleDoc = Record<string, unknown>;

const TITLE_FIELDS = ['name', 'productionName', 'projectName', 'title', 'eventTitle', 'subject'] as const;

function extractName(doc: FlexibleDoc): string {
  for (const field of TITLE_FIELDS) {
    const val = doc[field];
    if (typeof val === 'string' && val.trim().length >= 2) return val.trim();
  }
  return '';
}

function splitTitle(raw: string): string[] {
  return raw
    .split(/\s*[+\/]\s*/)
    .map((p) => p.replace(/^[\s\-–—_|,;:]+|[\s\-–—_|,;:]+$/g, '').trim())
    .filter((p) => p.length >= 2);
}

function normalizeKey(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, ' ');
}

async function loadPersonalProductions(): Promise<FlexibleDoc[]> {
  try {
    return await runQuery<FlexibleDoc>({
      from: [{ collectionId: 'productions', allDescendants: true }],
      limit: 2000,
    });
  } catch {
    return [];
  }
}

// Phase 1: scan all production names, insert missing ones with empty logoUrl (fast — no web requests)
export async function POST(request: NextRequest) {
  const auth = await requirePrimaryAdminRequest(request);
  if (auth instanceof NextResponse) return auth;

  const [globalProductions, personalProductions, registryEntries] = await Promise.all([
    listDocuments<GlobalProductionDoc>('global_productions').catch(() => []),
    loadPersonalProductions(),
    listDocuments<ProductionRegistryEntry>('production-registry').catch(() => []),
  ]);

  console.log(`[sync:phase1] global=${globalProductions.length} personal=${personalProductions.length} registry=${registryEntries.length}`);

  if (globalProductions.length > 0) {
    console.log('[sync:phase1] sample global_productions:', JSON.stringify(globalProductions[0], null, 2));
  }

  const existingKeys = new Set(registryEntries.map((e) => normalizeKey(e.name)));

  const allTitles: string[] = [];
  for (const doc of globalProductions) {
    const raw = (doc.name ?? '').trim();
    if (raw) allTitles.push(...splitTitle(raw));
  }
  for (const doc of personalProductions as FlexibleDoc[]) {
    const raw = extractName(doc);
    if (raw) allTitles.push(...splitTitle(raw));
  }

  const uniqueNewTitles = [...new Set(
    allTitles.map(normalizeKey).filter((k) => !existingKeys.has(k)),
  )].map((k) => allTitles.find((t) => normalizeKey(t) === k) ?? k);

  console.log(`[sync:phase1] new titles: ${uniqueNewTitles.length} — ${JSON.stringify(uniqueNewTitles)}`);

  let added = 0;
  let failed = 0;
  for (const name of uniqueNewTitles) {
    try {
      await createDocument('production-registry', { name, logoUrl: '', channel: '', description: '', isMajor: false });
      added++;
    } catch (err) {
      console.error(`[sync:phase1] write failed for "${name}":`, err);
      failed++;
    }
  }

  // Count entries without logos (for phase 2 progress)
  const allRegistry = added > 0
    ? await listDocuments<ProductionRegistryEntry>('production-registry').catch(() => registryEntries)
    : registryEntries;
  const pendingLogos = allRegistry.filter((e) => !e.logoUrl).length;

  return NextResponse.json({
    added,
    failed,
    skipped: registryEntries.length,
    pendingLogos,
    scanned: { global_productions: globalProductions.length, personal_productions: personalProductions.length },
  });
}
