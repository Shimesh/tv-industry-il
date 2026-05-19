import { NextRequest, NextResponse } from 'next/server';
import { requireAdminRequest } from '@/lib/server/adminAuth';

export const dynamic = 'force-dynamic';

const GH_TOKEN = process.env.GITHUB_TRIGGER_TOKEN || '';
const GH_OWNER = 'Shimesh';
const GH_REPO = 'tv-industry-il';
const WORKFLOW = 'scrape-ratings.yml';

export async function POST(request: NextRequest) {
  const authUser = await requireAdminRequest(request);
  if (authUser instanceof NextResponse) return authUser;

  if (!GH_TOKEN) {
    return NextResponse.json({ success: false, error: 'GITHUB_TRIGGER_TOKEN not configured' }, { status: 503 });
  }

  const res = await fetch(
    `https://api.github.com/repos/${GH_OWNER}/${GH_REPO}/actions/workflows/${WORKFLOW}/dispatches`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${GH_TOKEN}`,
        Accept: 'application/vnd.github.v3+json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ ref: 'master' }),
    },
  );

  if (res.status === 204) {
    return NextResponse.json({ success: true });
  }
  const text = await res.text().catch(() => `HTTP ${res.status}`);
  return NextResponse.json({ success: false, error: text }, { status: res.status });
}
