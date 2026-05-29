// Deletes noisy entries from industry_master: single-word names, cancellation annotations,
// and entries that contain known noise keywords (status markers, not real show titles).
import { NextRequest, NextResponse } from 'next/server';
import { requirePrimaryAdminRequest } from '@/lib/server/primaryAdmin';
import { listDocuments, deleteDocument } from '@/lib/server/firestoreAdminRest';
import { isNoisyProductionTitle } from '@/lib/productionNameNormalization';
import type { IndustryMasterEntry } from '@/lib/proCardTypes';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 60;

export async function POST(request: NextRequest) {
  const auth = await requirePrimaryAdminRequest(request);
  if (auth instanceof NextResponse) return auth;

  const allEntries = await listDocuments<IndustryMasterEntry>('industry_master').catch(() => []);

  const toDelete = allEntries.filter((e) => {
    const name = e.masterName ?? e.showName ?? '';
    return isNoisyProductionTitle(name);
  });

  let deleted = 0;
  const deletedNames: string[] = [];
  for (const entry of toDelete) {
    await deleteDocument(`industry_master/${entry.id}`).catch(() => null);
    deletedNames.push(entry.masterName ?? entry.showName ?? entry.id);
    deleted++;
  }

  return NextResponse.json({ deleted, names: deletedNames });
}
