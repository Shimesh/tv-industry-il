// Phase 1: seeds industry_master from production-registry.
// Safe to run multiple times — skips entries that already exist by showName.
import { NextRequest, NextResponse } from 'next/server';
import { requirePrimaryAdminRequest } from '@/lib/server/primaryAdmin';
import { listDocuments, patchDocument } from '@/lib/server/firestoreAdminRest';
import type { IndustryMasterEntry, ProductionRegistryEntry } from '@/lib/proCardTypes';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 60;

export async function POST(request: NextRequest) {
  const auth = await requirePrimaryAdminRequest(request);
  if (auth instanceof NextResponse) return auth;

  const [registryEntries, existingMaster] = await Promise.all([
    listDocuments<ProductionRegistryEntry>('production-registry').catch(() => []),
    listDocuments<IndustryMasterEntry>('industry_master').catch(() => []),
  ]);

  const existingNames = new Set(existingMaster.map((e) => e.showName.trim().toLowerCase()));
  const toAdd = registryEntries.filter((r) => !existingNames.has(r.name.trim().toLowerCase()));

  let added = 0;
  for (const reg of toAdd) {
    const id = `im_${reg.id}`;
    const entry: IndustryMasterEntry = {
      id,
      showName: reg.name,
      logoUrl: reg.logoUrl === 'none' ? '' : (reg.logoUrl ?? ''),
      network: reg.channel ?? '',
      genre: '',
      wikiUrl: '',
      lastUpdated: new Date().toISOString(),
    };
    const fields: Record<string, string> = {
      id: entry.id,
      showName: entry.showName,
      logoUrl: entry.logoUrl,
      network: entry.network,
      genre: entry.genre,
      wikiUrl: entry.wikiUrl,
      lastUpdated: entry.lastUpdated,
    };
    await patchDocument(`industry_master/${id}`, fields);
    added++;
  }

  return NextResponse.json({ added, total: registryEntries.length, existing: existingMaster.length });
}
