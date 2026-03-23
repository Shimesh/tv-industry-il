import { NextRequest, NextResponse } from 'next/server';

/**
 * Google OAuth callback handler
 * Receives the token from Google and sends it back to the opener window
 */
export async function GET(request: NextRequest) {
  // The actual token is in the URL fragment (#), which is handled client-side
  // This page serves as the redirect URI and posts the token back via postMessage
  const html = `
<!DOCTYPE html>
<html lang="he" dir="rtl">
<head><title>Google Calendar - מתחבר...</title></head>
<body>
  <p style="font-family: sans-serif; text-align: center; margin-top: 40px;">מתחבר ל-Google Calendar...</p>
  <script>
    // Extract access token from URL fragment
    const hash = window.location.hash.substring(1);
    const params = new URLSearchParams(hash);
    const accessToken = params.get('access_token');

    if (window.opener) {
      window.opener.postMessage({
        type: 'google-auth-callback',
        accessToken: accessToken
      }, window.location.origin);
      window.close();
    } else {
      document.body.innerHTML = '<p style="font-family: sans-serif; text-align: center; margin-top: 40px;">ניתן לסגור חלון זה</p>';
    }
  </script>
</body>
</html>`;

  return new NextResponse(html, {
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
  });
}
