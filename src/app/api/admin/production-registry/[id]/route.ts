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

  const updates: Record<string, string | boolean> = {};
  if (typeof body.name === 'string') updates.name = body.name.trim();
  if (typeof body.logoUrl === 'string') updates.logoUrl = body.logoUrl.trim();
  if (typeof body.channel === 'string') updates.channel = body.channel.trim();
  if (typeof body.description === 'string') updates.description = body.description.trim();
  if (typeof body.isMajor === 'boolean') updates.isMajor = body.isMajor;
  if (typeof body.isArchived === 'boolean') updates.isArchived = body.isArchived;

  await patchDocument(`production-registry/${id}`, updates);
  return NextResponse.json({ ok: true });
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requirePrimaryAdminRequest(request);
  if (auth instanceof NextResponse) return auth;

  const { id } = await params;
  await deleteDocument(`production-registry/${id}`);
  return NextResponse.json({ ok: true });
}
