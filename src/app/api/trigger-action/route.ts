import { NextResponse } from 'next/server';

export async function POST() {
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
