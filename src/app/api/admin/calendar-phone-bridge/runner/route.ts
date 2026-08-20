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

  const loadPopupHtml = async (id) => {
    const pageWindow = typeof unsafeWindow !== 'undefined' ? unsafeWindow : window;
    const modalBodySelector = '#myModal .modal-body';
    const clearModal = () => {
      const modalBody = document.querySelector(modalBodySelector);
      if (modalBody) modalBody.innerHTML = '';
    };

    const eventElement = [...document.querySelectorAll('[onclick*="openmd2("]')]
      .find((element) => String(element.getAttribute('onclick') || '').match(/openmd2\((\d+)\)/)?.[1] === String(id));

    if (eventElement || typeof pageWindow.openmd2 === 'function') {
      clearModal();
      if (eventElement instanceof HTMLElement) {
        eventElement.scrollIntoView({ block: 'center', inline: 'center' });
        eventElement.click();
      } else {
        pageWindow.openmd2(Number(id));
      }
      for (let attempt = 0; attempt < 40; attempt += 1) {
        await sleep(250);
        const modalBody = document.querySelector(modalBodySelector);
        const html = modalBody ? modalBody.innerHTML : '';
        const text = modalBody ? modalBody.textContent || '' : '';
        if (html && html.length > 100 && /<table/i.test(html) && /(נייד|טלפון|phone|mobile)/i.test(text)) {
          try {
            if (pageWindow.jQuery) pageWindow.jQuery('#myModal').modal('hide');
          } catch (_) {}
          return '<div class="modal-body">' + html + '</div>';
        }
      }
    }

    const popupUrl = new URL('mgrqispi.dll?appname=HsILWeb&prgname=ShowCrew&arguments=-N' + id, location.href).toString();
    const response = await fetch(popupUrl, { credentials: 'include' });
    const html = await response.text();
    if (!response.ok || !html || html.length < 100) {
      throw new Error('ShowCrew failed for production ' + id);
    }
    return html;
  };
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

    const isFullDepartmentPage = /prgname=ShowEmp6/i.test(location.href) && /-Atrue/i.test(location.href);
    if (!isFullDepartmentPage) {
      const sourceText = location.href + '\\n' + document.documentElement.innerHTML;
      const dateMatch = sourceText.match(/arguments=-N([^,\\s&"'<>]+),-A(\\d{8})(?:,-A(?:true|false|\\$\\{inputValue2\\}))?/i);
      const match = dateMatch
        || sourceText.match(/arguments=-N([^,\\s&"'<>]+),-A([A-Za-z0-9-]{6,64})(?:,-A(?:true|false))?/i)
        || sourceText.match(/[?&]A=([^,\\s&"'<>]+),([A-Za-z0-9-]{6,64})/i);
      if (match) {
        const fullUrl = 'https://hsil.acc.co.il:5443/magicscripts/mgrqispi.dll?appname=HSiLWeb&prgname=ShowEmp6&arguments=-N'
          + match[1] + ',-A' + match[2] + ',-Atrue';
        await report('opening_full_calendar', 'פותח את יומן המחלקה המלא לפני חילוץ הנתונים.', 12, { fullDepartmentUrl: fullUrl });
        location.href = fullUrl;
        return;
      }
    }

    let ids = [];
    for (let attempt = 0; attempt < 12; attempt += 1) {
      ids = [...new Set([...document.querySelectorAll('[onclick*="openmd2("]')]
        .map((element) => String(element.getAttribute('onclick') || '').match(/openmd2\\((\\d+)\\)/)?.[1])
        .filter((id) => id && id !== '0'))];
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
      const html = await loadPopupHtml(id);
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

    await report('done', 'היומן המלא עודכן: ' + result.global + ' הפקות, מתוכן ' + result.personal + ' משמרות אישיות.', 100, {
      eventCount: ids.length,
      popupDone: ids.length,
      popupTotal: ids.length
    });
    alert('היומן המלא עודכן: ' + result.global + ' הפקות, ' + ids.length + ' פופאפים');
  } catch (error) {
    const message = 'ייבוא נכשל: ' + (error && error.message ? error.message : error);
    await report('failed', message, 100, { error: message });
    alert(message);
  }
})();`;

  return javascriptResponse(source);
}
