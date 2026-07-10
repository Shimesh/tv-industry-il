import { NextRequest } from 'next/server';
import { runHerzliyaProbe } from '../codex-herzliya-probe-common';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const preferredRegion = 'fra1';
export const maxDuration = 30;

export async function GET(request: NextRequest) {
  return runHerzliyaProbe(request, 'fra1');
}
