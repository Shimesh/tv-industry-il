import { NextRequest, NextResponse } from 'next/server';
import { verifyAuthToken } from '@/lib/apiAuth';
import { getDocument, patchDocument } from '@/lib/server/firestoreAdminRest';
import type { BoardListing } from '@/lib/boardTypes';

export const runtime = 'nodejs';

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { id } = await params;

  let body: { action?: string; status?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'invalid_body' }, { status: 400 });
  }

  if (body.action === 'view' || body.action === 'contact') {
    const field = body.action === 'view' ? 'viewCount' : 'contactCount';
    const existing = await getDocument<BoardListing>(`board_listings/${id}`).catch(() => null);
    const current = existing ? (existing[field] ?? 0) : 0;
    await patchDocument(`board_listings/${id}`, {
      [field]: (current as number) + 1,
      updatedAt: new Date().toISOString(),
    } as unknown as Record<string, string>).catch(() => {});
    return NextResponse.json({ ok: true });
  }

  if (body.status) {
    const authUser = await verifyAuthToken(request);
    if (!authUser) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
    const existing = await getDocument<BoardListing>(`board_listings/${id}`);
    if (!existing) return NextResponse.json({ error: 'not_found' }, { status: 404 });
    if (existing.authorUid !== authUser.uid) return NextResponse.json({ error: 'forbidden' }, { status: 403 });
    await patchDocument(`board_listings/${id}`, {
      status: body.status,
      updatedAt: new Date().toISOString(),
    } as unknown as Record<string, string>);
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: 'invalid_action' }, { status: 400 });
}
