import { NextRequest, NextResponse } from 'next/server';
import { syncContactsFromSavedProductions } from '@/lib/server/contactsSync';

export const runtime = 'nodejs';

function isAuthorized(request: NextRequest): boolean {
  const expectedSecret = process.env.CONTACTS_MAINTENANCE_SECRET?.trim();
  const providedSecret = request.headers.get('x-contacts-maintenance-secret')?.trim();
  return Boolean(expectedSecret && providedSecret && expectedSecret === providedSecret);
}

export async function POST(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const result = await syncContactsFromSavedProductions(true);
    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to run contacts maintenance' },
      { status: 500 },
    );
  }
}
