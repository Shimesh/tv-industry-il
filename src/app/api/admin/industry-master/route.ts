import { NextRequest, NextResponse } from 'next/server';
import { requirePrimaryAdminRequest } from '@/lib/server/primaryAdmin';
import { listDocuments, patchDocument } from '@/lib/server/firestoreAdminRest';
import type { IndustryMasterEntry } from '@/lib/proCardTypes';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  const auth = await requirePrimaryAdminRequest(request);
  if (auth instanceof NextResponse) return auth;
  const entries = await listDocuments<IndustryMasterEntry>('industry_master').catch(() => []);
  return NextResponse.json(entries);
}

export async function POST(request: NextRequest) {
  const auth = await requirePrimaryAdminRequest(request);
  if (auth instanceof NextResponse) return auth;
  const body = await request.json() as Partial<IndustryMasterEntry>;
  if (!body.showName?.trim()) {
    return NextResponse.json({ error: 'showName required' }, { status: 400 });
  }
  const id = `im_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const entry: IndustryMasterEntry = {
    id,
    showName: body.showName.trim(),
    logoUrl: body.logoUrl ?? '',
    network: body.network ?? '',
    genre: body.genre ?? '',
    wikiUrl: body.wikiUrl ?? '',
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
  return NextResponse.json(entry, { status: 201 });
}
