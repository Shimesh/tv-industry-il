import { NextResponse } from 'next/server';
import { checkAndAnnounceVersion } from '@/lib/server/announceVersion';

export const runtime = 'nodejs';
export const maxDuration = 60;

export async function GET() {
  await checkAndAnnounceVersion();
  return NextResponse.json({ ok: true });
}
