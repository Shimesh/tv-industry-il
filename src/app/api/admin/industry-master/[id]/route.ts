import { NextRequest, NextResponse } from 'next/server';
import { requirePrimaryAdminRequest } from '@/lib/server/primaryAdmin';
import { deleteDocument, patchDocument } from '@/lib/server/firestoreAdminRest';
import type { IndustryMasterEntry } from '@/lib/proCardTypes';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requirePrimaryAdminRequest(request);
  if (auth instanceof NextResponse) return auth;
  const { id } = await params;
  const body = await request.json() as Partial<IndustryMasterEntry>;
  const update = { ...body, lastUpdated: new Date().toISOString() };
  await patchDocument(`industry_master/${id}`, update as Record<string, unknown>);
  return NextResponse.json({ ok: true });
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requirePrimaryAdminRequest(request);
  if (auth instanceof NextResponse) return auth;
  const { id } = await params;
  await deleteDocument(`industry_master/${id}`);
  return NextResponse.json({ ok: true });
}
