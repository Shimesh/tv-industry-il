// Unified sync: scans global_productions for raw production names,
// strips suffixes to derive canonical masterName, groups raw titles as variations[],
// then creates/updates industry_master entries accordingly.
// Safe to run multiple times — only patches entries where variations[] changed.
import { NextRequest, NextResponse } from 'next/server';
import { requirePrimaryAdminRequest } from '@/lib/server/primaryAdmin';
import { listDocuments, patchDocument } from '@/lib/server/firestoreAdminRest';
import type { IndustryMasterEntry, ProductionRegistryEntry } from '@/lib/proCardTypes';
import { stripProductionSuffixes, isNoisyProductionTitle } from '@/lib/productionNameNormalization';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 60;

type RawGlobalProduction = { id?: string; name?: string };
type RawContact = Record<string, unknown>;

function contactDisplayName(c: RawContact): string {
  const explicit = [c.displayName, c.name, c.fullName, c.crewName]
    .map((v) => (typeof v === 'string' ? v.trim() : ''))
    .find(Boolean);
  if (explicit) return explicit;
  const first = typeof c.firstName === 'string' ? c.firstName.trim() : '';
  const last = typeof c.lastName === 'string' ? c.lastName.trim() : '';
  return `${first} ${last}`.trim();
}

// Split a raw production name by '+' and '/' separators, trim each part
function splitRawName(raw: string): string[] {
  return raw
    .split(/[+/]/)
    .map((s) => s.trim())
    .filter(Boolean);
}

export async function POST(request: NextRequest) {
  const auth = await requirePrimaryAdminRequest(request);
  if (auth instanceof NextResponse) return auth;

  // ?source=registry falls back to old registry-seeding behavior
  const url = new URL(request.url);
  const useRegistry = url.searchParams.get('source') === 'registry';

  const [globalProductions, existingMaster, contacts] = await Promise.all([
    listDocuments<RawGlobalProduction>('global_productions').catch(() => []),
    listDocuments<IndustryMasterEntry>('industry_master').catch(() => []),
    listDocuments<RawContact>('contacts').catch(() => []),
  ]);

  const contactNames = new Set(
    contacts.map((c) => contactDisplayName(c).trim().toLowerCase()).filter(Boolean),
  );

  // Build existing master lookup: normKey → entry
  const existingByNorm = new Map<string, IndustryMasterEntry>();
  for (const e of existingMaster) {
    const canonicalName = e.masterName ?? e.showName;
    const norm = stripProductionSuffixes(canonicalName).trim().toLowerCase();
    existingByNorm.set(norm, e);
  }

  // variationsMap: normKey → { canonicalName, Set<rawVariation> }
  const variationsMap = new Map<string, { canonicalName: string; raws: Set<string> }>();

  let totalScanned = 0;
  let skippedNoise = 0;

  const rawSources: string[] = useRegistry
    ? (await listDocuments<ProductionRegistryEntry>('production-registry').catch(() => [])).map((r) => r.name ?? '')
    : globalProductions.map((g) => g.name ?? '');

  for (const rawFull of rawSources) {
    if (!rawFull) continue;
    totalScanned++;
    for (const rawPart of splitRawName(rawFull)) {
      const canonicalName = stripProductionSuffixes(rawPart);
      const normKey = canonicalName.trim().toLowerCase();

      if (!normKey || isNoisyProductionTitle(canonicalName) || contactNames.has(normKey)) {
        skippedNoise++;
        continue;
      }

      if (!variationsMap.has(normKey)) {
        variationsMap.set(normKey, { canonicalName, raws: new Set() });
      }
      // Track the raw part AND the canonical as a variation
      variationsMap.get(normKey)!.raws.add(rawPart);
      if (rawPart !== canonicalName) {
        variationsMap.get(normKey)!.raws.add(canonicalName);
      }
    }
  }

  let added = 0;
  let updated = 0;

  for (const [normKey, { canonicalName, raws }] of variationsMap) {
    const newVariations = Array.from(raws).sort();

    if (existingByNorm.has(normKey)) {
      // Merge variations[] — only patch if there are new ones
      const existing = existingByNorm.get(normKey)!;
      const existingVariations = new Set(existing.variations ?? []);
      const merged = [...existingVariations, ...raws];
      if (merged.length > existingVariations.size) {
        const deduped = Array.from(new Set(merged)).sort();
        const patch: Record<string, string | boolean | string[]> = {
          variations: deduped,
          lastUpdated: new Date().toISOString(),
        };
        if (!existing.masterName) patch.masterName = canonicalName;
        await patchDocument(`industry_master/${existing.id}`, patch);
        updated++;
      }
    } else {
      // New entry
      const id = `im_${normKey.replace(/[^a-z0-9א-ת]/g, '_').slice(0, 40)}_${Date.now()}`;
      const entry: Record<string, string | boolean | string[]> = {
        id,
        masterName: canonicalName,
        showName: canonicalName,
        variations: newVariations,
        logoUrl: '',
        network: '',
        productionCompany: '',
        genre: '',
        wikiUrl: '',
        wikiTitleMatch: '',
        isVerified: false,
        lastUpdated: new Date().toISOString(),
      };
      await patchDocument(`industry_master/${id}`, entry);
      existingByNorm.set(normKey, { ...(entry as unknown as IndustryMasterEntry), id });
      added++;
    }
  }

  return NextResponse.json({ added, updated, skippedNoise, totalScanned });
}
