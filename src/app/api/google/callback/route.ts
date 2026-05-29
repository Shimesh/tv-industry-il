import { NextRequest, NextResponse } from 'next/server';
import { saveGoogleCalendarTokens } from '@/lib/server/googleCalendarTokens';

export const runtime = 'nodejs';

interface OAuthState {
  uid: string;
  returnPath: string;
  mode: 'popup' | 'redirect';
}

function parseState(raw: string | null): OAuthState | null {
  if (!raw) return null;
  try {
    return JSON.parse(Buffer.from(raw, 'base64url').toString('utf-8')) as OAuthState;
  } catch {
    return null;
  }
}

async function exchangeCodeForTokens(
  code: string,
  redirectUri: string,
): Promise<{ access_token: string; refresh_token?: string; expires_in: number } | null> {
  const clientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  if (!clientId || !clientSecret) return null;

  try {
    const res = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
        grant_type: 'authorization_code',
      }),
    });
    if (!res.ok) return null;
    return res.json() as Promise<{ access_token: string; refresh_token?: string; expires_in: number }>;
  } catch {
    return null;
  }
}

async function getGoogleEmail(accessToken: string): Promise<string> {
  try {
    const res = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!res.ok) return '';
    const data = (await res.json()) as { email?: string };
    return data.email ?? '';
  } catch {
    return '';
  }
}

export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const code = searchParams.get('code');
  const stateRaw = searchParams.get('state');
  const error = searchParams.get('error');

  const state = parseState(stateRaw);

  // OAuth was denied or errored
  if (error || !code) {
    if (state?.mode === 'popup') {
      return htmlResponse(`
        window.opener?.postMessage({ type: 'google-auth-callback', success: false, error: '${error ?? 'no_code'}' }, '${origin}');
        window.close();
      `);
    }
    const returnPath = state?.returnPath ?? '/settings';
    return NextResponse.redirect(new URL(`${returnPath}?gcal=error`, origin));
  }

  if (!state?.uid) {
    if (state?.mode === 'popup') {
      return htmlResponse(`
        window.opener?.postMessage({ type: 'google-auth-callback', success: false, error: 'missing_state' }, '${origin}');
        window.close();
      `);
    }
    return NextResponse.redirect(new URL('/settings?gcal=error', origin));
  }

  const redirectUri = `${origin}/api/google/callback`;
  const tokens = await exchangeCodeForTokens(code, redirectUri);

  if (!tokens?.access_token) {
    if (state.mode === 'popup') {
      return htmlResponse(`
        window.opener?.postMessage({ type: 'google-auth-callback', success: false, error: 'exchange_failed' }, '${origin}');
        window.close();
      `);
    }
    return NextResponse.redirect(new URL(`${state.returnPath ?? '/settings'}?gcal=error`, origin));
  }

  const googleEmail = await getGoogleEmail(tokens.access_token);

  try {
    await saveGoogleCalendarTokens(state.uid, {
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token,
      expires_in: tokens.expires_in ?? 3600,
      email: googleEmail,
    });
  } catch {
    if (state.mode === 'popup') {
      return htmlResponse(`
        window.opener?.postMessage({ type: 'google-auth-callback', success: false, error: 'save_failed' }, '${origin}');
        window.close();
      `);
    }
    return NextResponse.redirect(new URL(`${state.returnPath ?? '/settings'}?gcal=error`, origin));
  }

  if (state.mode === 'popup') {
    return htmlResponse(`
      window.opener?.postMessage({ type: 'google-auth-callback', success: true, email: ${JSON.stringify(googleEmail)} }, '${origin}');
      window.close();
    `);
  }

  return NextResponse.redirect(
    new URL(`${state.returnPath ?? '/settings'}?gcal=connected&email=${encodeURIComponent(googleEmail)}`, origin),
  );
}

function htmlResponse(script: string): NextResponse {
  const html = `<!DOCTYPE html>
<html lang="he" dir="rtl">
<head><meta charset="utf-8"><title>Google Calendar</title></head>
<body style="font-family:sans-serif;text-align:center;padding:40px;color:#666">
  <p>מתחבר ל-Google Calendar...</p>
  <script>try { ${script} } catch(e) { window.close(); }</script>
</body>
</html>`;
  return new NextResponse(html, { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
}
