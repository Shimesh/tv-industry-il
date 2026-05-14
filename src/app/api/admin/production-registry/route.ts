import { NextRequest, NextResponse } from 'next/server';
import { requirePrimaryAdminRequest } from '@/lib/server/primaryAdmin';
import { createDocument, listDocuments } from '@/lib/server/firestoreAdminRest';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  const auth = await requirePrimaryAdminRequest(request);
  if (auth instanceof NextResponse) return auth;

  const entries = await listDocuments('production-registry').catch(() => []);
  return NextResponse.json({ entries });
}

export async function POST(request: NextRequest) {
  const auth = await requirePrimaryAdminRequest(request);
  if (auth instanceof NextResponse) return auth;

  const body = await request.json() as Record<string, unknown>;
  const name = typeof body.name === 'string' ? body.name.trim() : '';
  if (!name) return NextResponse.json({ error: 'name is required' }, { status: 400 });

  const entry = await createDocument('production-registry', {
    name,
    logoUrl: typeof body.logoUrl === 'string' ? body.logoUrl.trim() : '',
    channel: typeof body.channel === 'string' ? body.channel.trim() : '',
    description: typeof body.description === 'string' ? body.description.trim() : '',
    isMajor: body.isMajor === true,
  });

  return NextResponse.json(entry, { status: 201 });
}
