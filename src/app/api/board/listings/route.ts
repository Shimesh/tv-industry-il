import { NextRequest, NextResponse } from 'next/server';
import { verifyAuthToken, unauthorizedResponse } from '@/lib/apiAuth';
import { listDocuments, patchDocument } from '@/lib/server/firestoreAdminRest';
import type { BoardListing, ListingType } from '@/lib/boardTypes';

export const runtime = 'nodejs';
export const maxDuration = 30;

export async function GET(request: NextRequest): Promise<NextResponse> {
  const { searchParams } = new URL(request.url);
  const type = searchParams.get('type') as ListingType | null;
  const hot = searchParams.get('hot') === '1';
  const limit = parseInt(searchParams.get('limit') ?? '100', 10);

  const all = await listDocuments<BoardListing>('board_listings').catch(() => []);
  let active = all.filter(l => l.status === 'active');
  if (type) active = active.filter(l => l.type === type);

  if (hot) {
    const scored = active.map(l => ({
      l,
      score: (l.isHot ? 100 : 0) + (l.isUrgent ? 50 : 0) + (l.contactCount ?? 0) * 5 + (l.viewCount ?? 0),
    }));
    scored.sort((a, b) => b.score - a.score);
    const top = scored.slice(0, Math.min(limit, 6)).map(x => x.l);
    return NextResponse.json({ ok: true, listings: top });
  }

  active.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  return NextResponse.json({ ok: true, listings: active.slice(0, limit) });
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const authUser = await verifyAuthToken(request);
  if (!authUser) return unauthorizedResponse();

  let body: Partial<BoardListing>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'invalid_body' }, { status: 400 });
  }

  if (!body.title?.trim() || !body.type || !body.description?.trim()) {
    return NextResponse.json({ error: 'missing_required_fields' }, { status: 400 });
  }

  const now = new Date().toISOString();
  const id = `lst_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;

  const listing: BoardListing = {
    id,
    type: body.type,
    title: body.title.trim(),
    description: body.description.trim(),
    authorUid: authUser.uid,
    authorName: authUser.displayName || body.authorName || 'משתמש',
    authorAvatar: authUser.photoURL ?? body.authorAvatar,
    contactPhone: body.contactPhone?.trim() || undefined,
    contactEmail: body.contactEmail?.trim() || authUser.email || undefined,
    price: body.price,
    priceMax: body.priceMax,
    priceUnit: body.priceUnit,
    mediaUrls: body.mediaUrls ?? [],
    tags: body.tags ?? [],
    location: body.location?.trim() || undefined,
    department: body.department?.trim() || undefined,
    isHot: false,
    isUrgent: body.isUrgent ?? false,
    viewCount: 0,
    contactCount: 0,
    status: 'active',
    createdAt: now,
    updatedAt: now,
  };

  await patchDocument(`board_listings/${id}`, listing as unknown as Record<string, string>);

  return NextResponse.json({ ok: true, id, listing });
}
