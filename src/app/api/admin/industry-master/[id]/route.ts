import { NextRequest, NextResponse } from 'next/server';
import { requirePrimaryAdminRequest } from '@/lib/server/primaryAdmin';
import { deleteDocument, patchDocument } from '@/lib/server/firestoreAdminRest';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requirePrimaryAdminRequest(request);
  if (auth instanceof NextResponse) return auth;
  const { id } = await params;
  const body = await request.json() as Record<string, unknown>;

  const updates: Record<string, string> = { lastUpdated: new Date().toISOString() };
  if (typeof body.showName === 'string') updates.showName = body.showName.trim();
  if (typeof body.logoUrl === 'string') updates.logoUrl = body.logoUrl.trim();
  if (typeof body.network === 'string') updates.network = body.network.trim();
  if (typeof body.genre === 'string') updates.genre = body.genre.trim();
  if (typeof body.wikiUrl === 'string') updates.wikiUrl = body.wikiUrl.trim();

  await patchDocument(`industry_master/${id}`, updates);
  return NextResponse.json({ ok: true });
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requirePrimaryAdminRequest(request);
  if (auth instanceof NextResponse) return auth;
  const { id } = await params;
  await deleteDocument(`industry_master/${id}`);
  return NextResponse.json({ ok: true });
}
