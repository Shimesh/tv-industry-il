import { NextResponse } from 'next/server';
import { checkAndAnnounceVersion } from '@/lib/server/announceVersion';

export const runtime = 'nodejs';

export async function GET() {
  await checkAndAnnounceVersion();
  return NextResponse.json({ ok: true });
}
