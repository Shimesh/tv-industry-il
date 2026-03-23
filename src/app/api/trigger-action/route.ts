import { NextRequest, NextResponse } from 'next/server';
import { verifyAuthToken, unauthorizedResponse } from '@/lib/apiAuth';

export async function POST(request: NextRequest) {
  const authUser = await verifyAuthToken(request);
  if (!authUser) {
    return unauthorizedResponse();
  }
  const token = process.env.GITHUB_TOKEN;
  if (!token) {
    return NextResponse.json({ triggered: false, error: 'No token configured' }, { status: 500 });
  }

  try {
    const response = await fetch(
      'https://api.github.com/repos/Shimesh/tv-industry-il/dispatches',
      {
        method: 'POST',
        headers: {
          'Authorization': `token ${token}`,
          'Accept': 'application/vnd.github.v3+json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ event_type: 'fetch-schedule' }),
      }
    );

    if (response.ok || response.status === 204) {
      return NextResponse.json({ triggered: true });
    }

    return NextResponse.json({ triggered: false }, { status: response.status });
  } catch {
    return NextResponse.json({ triggered: false }, { status: 500 });
  }
}
