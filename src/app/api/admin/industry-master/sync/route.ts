// Phase 1: seeds industry_master from production-registry.
// Safe to run multiple times — skips/merges entries that already exist by normalized showName.
// Applies noise filtering (single-word titles, status keywords, person names from contacts).
import { NextRequest, NextResponse } from 'next/server';
import { requirePrimaryAdminRequest } from '@/lib/server/primaryAdmin';
import { listDocuments, patchDocument } from '@/lib/server/firestoreAdminRest';
import type { IndustryMasterEntry, ProductionRegistryEntry } from '@/lib/proCardTypes';
import { stripProductionSuffixes, isNoisyProductionTitle } from '@/lib/productionNameNormalization';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 60;

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

export async function POST(request: NextRequest) {
  const auth = await requirePrimaryAdminRequest(request);
  if (auth instanceof NextResponse) return auth;

  const [registryEntries, existingMaster, contacts] = await Promise.all([
    listDocuments<ProductionRegistryEntry>('production-registry').catch(() => []),
    listDocuments<IndustryMasterEntry>('industry_master').catch(() => []),
    listDocuments<RawContact>('contacts').catch(() => []),
  ]);

  // Build a set of known contact names (normalized lowercase) for blacklist check
  const contactNames = new Set(
    contacts.map((c) => contactDisplayName(c).trim().toLowerCase()).filter(Boolean),
  );

  // Build lookup of existing master entries by normalized canonical name
  const existingByNorm = new Map<string, IndustryMasterEntry>();
  for (const e of existingMaster) {
    const norm = stripProductionSuffixes(e.showName).trim().toLowerCase();
    existingByNorm.set(norm, e);
  }

  let added = 0;
  let skippedNoise = 0;
  let merged = 0;

  for (const reg of registryEntries) {
    const rawName = reg.name?.trim() ?? '';
    if (!rawName) continue;

    // Normalize: strip operational suffixes to get canonical name
    const canonicalName = stripProductionSuffixes(rawName);
    const normKey = canonicalName.trim().toLowerCase();

    // --- Noise filter ---
    if (isNoisyProductionTitle(canonicalName)) {
      skippedNoise++;
      continue;
    }
    // Contacts blacklist: if canonical name matches a known contact, skip
    if (contactNames.has(normKey)) {
      skippedNoise++;
      continue;
    }

    // --- Check if canonical name already exists in master ---
    if (existingByNorm.has(normKey)) {
      // Already exists — nothing to add (could merge fields here if needed)
      merged++;
      continue;
    }

    // --- New entry: add with canonical name ---
    const id = `im_${reg.id}`;
    const entry: IndustryMasterEntry = {
      id,
      showName: canonicalName,          // store canonical (suffix-stripped) name
      logoUrl: reg.logoUrl === 'none' ? '' : (reg.logoUrl ?? ''),
      network: reg.channel ?? '',
      productionCompany: '',
      genre: '',
      wikiUrl: '',
      wikiTitleMatch: '',
      lastUpdated: new Date().toISOString(),
    };
    const fields: Record<string, string> = {
      id: entry.id,
      showName: entry.showName,
      logoUrl: entry.logoUrl,
      network: entry.network,
      productionCompany: entry.productionCompany,
      genre: entry.genre,
      wikiUrl: entry.wikiUrl,
      wikiTitleMatch: entry.wikiTitleMatch ?? '',
      lastUpdated: entry.lastUpdated,
    };
    await patchDocument(`industry_master/${id}`, fields);
    existingByNorm.set(normKey, entry);
    added++;
  }

  return NextResponse.json({
    added,
    merged,
    skippedNoise,
    total: registryEntries.length,
    existing: existingMaster.length,
  });
}
