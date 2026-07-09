import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';

function javascriptResponse(source: string): NextResponse {
  return new NextResponse(source, {
    status: 200,
    headers: {
      'Content-Type': 'application/javascript; charset=utf-8',
      'Cache-Control': 'no-store, max-age=0',
      'Access-Control-Allow-Origin': '*',
    },
  });
}

export async function GET(request: NextRequest) {
  const token = (request.nextUrl.searchParams.get('token') || '').trim();
  const origin = request.nextUrl.origin;
  const statusUrl = `${origin}/api/admin/calendar-phone-bridge/status`;
  const ingestUrl = `${origin}/api/admin/calendar-phone-bridge/ingest`;

  if (!token) {
    return javascriptResponse("alert('חסר טוקן הפעלה. צור הפעלה חדשה בממשק הניהול.');");
  }

  const source = `
(async function(){
  const token = ${JSON.stringify(token)};
  const statusUrl = ${JSON.stringify(statusUrl)};
  const ingestUrl = ${JSON.stringify(ingestUrl)};
  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const report = async (phase, message, progress, extra = {}) => {
    try {
      await fetch(statusUrl, {
        method: 'POST',
        mode: 'cors',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ token, phase, message, progress, ...extra })
      });
    } catch (_) {}
  };

  try {
    await report('runner_loaded', 'סקריפט החילוץ נטען בדף הרצליה.', 12);

    if (!/hsil\\.acc\\.co\\.il$/i.test(location.hostname)) {
      const message = 'הסקריפט הופעל בדף הלא נכון. צריך להפעיל אותו כשהלוח של הרצליה פתוח.';
      await report('failed', message, 100, { error: message });
      alert(message);
      return;
    }

    let ids = [];
    for (let attempt = 0; attempt < 12; attempt += 1) {
      ids = [...new Set([...document.querySelectorAll('[onclick*="openmd2("]')]
        .map((element) => String(element.getAttribute('onclick') || '').match(/openmd2\\((\\d+)\\)/)?.[1])
        .filter(Boolean))];
      if (ids.length) break;
      await sleep(500);
    }

    if (!ids.length) {
      const message = 'לא נמצאו הפקות בדף הרצליה. ודא שהלוח האישי נטען לפני ההפעלה.';
      await report('failed', message, 100, { error: message });
      alert(message);
      return;
    }

    await report('events_found', 'נמצאו ' + ids.length + ' הפקות. מתחיל למשוך פופאפים של צוותים.', 20, {
      eventCount: ids.length,
      popupDone: 0,
      popupTotal: ids.length
    });

    const popupHtmlById = {};
    let done = 0;
    for (const id of ids) {
      await report('popup_loading', 'טוען צוות להפקה ' + id + ' (' + (done + 1) + '/' + ids.length + ')', 20 + Math.round((done / ids.length) * 50), {
        popupDone: done,
        popupTotal: ids.length
      });

      const popupUrl = new URL('mgrqispi.dll?appname=HsILWeb&prgname=ShowCrew&arguments=-N' + id, location.href).toString();
      const response = await fetch(popupUrl, { credentials: 'include' });
      const html = await response.text();
      if (!response.ok || !html || !html.includes('נייד')) {
        throw new Error('לא נטען צוות להפקה ' + id);
      }

      popupHtmlById[id] = html;
      done += 1;
      await report('popup_progress', 'נמשך צוות להפקה ' + id + ' (' + done + '/' + ids.length + ')', 20 + Math.round((done / ids.length) * 50), {
        popupDone: done,
        popupTotal: ids.length
      });
      await sleep(350);
    }

    await report('uploading', 'כל הפופאפים נאספו. שולח לאפליקציה לשמירה.', 75, {
      eventCount: ids.length,
      popupDone: ids.length,
      popupTotal: ids.length
    });

    const saveResponse = await fetch(ingestUrl, {
      method: 'POST',
      mode: 'cors',
      headers: { 'content-type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({
        token,
        href: location.href,
        scheduleHtml: document.documentElement.outerHTML,
        popupHtmlById
      })
    });
    const result = await saveResponse.json().catch(() => ({}));
    if (!saveResponse.ok || !result.ok) {
      throw new Error(result.error || ('HTTP ' + saveResponse.status));
    }

    await report('done', 'היומן עודכן: ' + result.personal + ' הפקות עם צוותים מלאים.', 100, {
      eventCount: ids.length,
      popupDone: ids.length,
      popupTotal: ids.length
    });
    alert('היומן עודכן: ' + result.personal + ' הפקות, ' + ids.length + ' פופאפים');
  } catch (error) {
    const message = 'ייבוא נכשל: ' + (error && error.message ? error.message : error);
    await report('failed', message, 100, { error: message });
    alert(message);
  }
})();`;

  return javascriptResponse(source);
}
