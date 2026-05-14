import { NextRequest, NextResponse } from 'next/server';
import { syncContactsFromSavedProductions } from '@/lib/server/contactsSync';

export const runtime = 'nodejs';
export const maxDuration = 300;

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const result = await syncContactsFromSavedProductions(true);
    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    console.error('[cron/contacts-discovery]', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Cron failed' },
      { status: 500 },
    );
  }
}
