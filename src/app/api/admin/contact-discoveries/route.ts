import { NextRequest, NextResponse } from 'next/server';
import { requireAdminRequest } from '@/lib/server/adminAuth';
import { runQuery } from '@/lib/server/firestoreAdminRest';
import type { ContactDiscovery } from '@/lib/adminTypes';

export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  const authUser = await requireAdminRequest(request);
  if (authUser instanceof NextResponse) return authUser;

  const { searchParams } = request.nextUrl;
  const date = searchParams.get('date') || new Date().toISOString().slice(0, 10);

  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return NextResponse.json({ error: 'Invalid date format' }, { status: 400 });
  }

  try {
    const discoveries = await runQuery<ContactDiscovery>({
      from: [{ collectionId: 'contact_discoveries' }],
      where: {
        fieldFilter: {
          field: { fieldPath: 'discoveryDate' },
          op: 'EQUAL',
          value: { stringValue: date },
        },
      },
      orderBy: [{ field: { fieldPath: 'createdAt' }, direction: 'DESCENDING' }],
      limit: 20,
    });

    return NextResponse.json({ discoveries, date, total: discoveries.length });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to load discoveries' },
      { status: 500 },
    );
  }
}
