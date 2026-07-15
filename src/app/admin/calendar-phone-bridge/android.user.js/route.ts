import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';

function buildAndroidUserscript(token: string, origin: string): string {
  const statusUrl = `${origin}/api/admin/calendar-phone-bridge/status`;
  const ingestUrl = `${origin}/api/admin/calendar-phone-bridge/ingest`;
  return `
// ==UserScript==
// @name         TV Industry - Herzliya Calendar Bridge
// @namespace    https://tv-industry-il.vercel.app/
// @version      ${Date.now()}
// @description  חילוץ יומן הרצליה ישירות מטלפון Android
// @match        https://hsil.acc.co.il:5443/*
// @connect      tv-industry-il.vercel.app
// @grant        unsafeWindow
// @run-at       document-idle
// ==/UserScript==

(function () {
  const defaultToken = ${JSON.stringify(token)};
  const token = (() => {
    try {
      const params = new URLSearchParams(String(location.hash || '').replace(/^#/, ''));
      const hashToken = params.get('tvib_token');
      if (hashToken) {
        window.localStorage.setItem('tv-industry-herzliya-bridge-token', hashToken);
        return hashToken;
      }
      return window.localStorage.getItem('tv-industry-herzliya-bridge-token') || defaultToken;
    } catch (_) {
      return defaultToken;
    }
  })();
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

  const setButton = (button, text, disabled = false) => {
    button.textContent = text;
    button.disabled = disabled;
    button.style.opacity = disabled ? '0.75' : '1';
  };

  const run = async (button) => {
    try {
      setButton(button, 'רץ...', true);
      await report('android_started', 'החילוץ הופעל מתוך דף הרצליה ב-Android.', 10);

      const isFullDepartmentPage = /prgname=ShowEmp6/i.test(location.href) && /-Atrue/i.test(location.href);
      if (!isFullDepartmentPage) {
        const sourceText = location.href + '\\n' + document.documentElement.innerHTML;
        const match = sourceText.match(/[?&]A=([^,\\s&"'<>]+),(\\d{8})/i)
          || sourceText.match(/arguments=-N([^,\\s&"'<>]+),-A(\\d{8})(?:,-A(?:true|false))?/i);
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
        const message = 'לא נמצאו הפקות בדף. ודא שלוח הרצליה נטען עד הסוף.';
        await report('failed', message, 100, { error: message });
        alert(message);
        setButton(button, 'עדכן יומן');
        return;
      }

      await report('events_found', 'נמצאו ' + ids.length + ' הפקות. מושך פופאפים של צוותים.', 20, {
        eventCount: ids.length,
        popupDone: 0,
        popupTotal: ids.length
      });

      const popupHtmlById = {};
      let done = 0;
      for (const id of ids) {
        setButton(button, 'צוות ' + (done + 1) + '/' + ids.length, true);
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

      setButton(button, 'שומר...', true);
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
      setButton(button, 'הושלם', true);
      alert('היומן המלא עודכן: ' + result.global + ' הפקות, ' + ids.length + ' פופאפים');
    } catch (error) {
      const message = 'ייבוא נכשל: ' + (error && error.message ? error.message : error);
      await report('failed', message, 100, { error: message });
      alert(message);
      setButton(button, 'נסה שוב');
    }
  };

  const addButton = () => {
    if (document.getElementById('tv-industry-herzliya-bridge-button')) return;
    const button = document.createElement('button');
    button.id = 'tv-industry-herzliya-bridge-button';
    button.type = 'button';
    button.textContent = 'עדכן יומן';
    button.style.cssText = [
      'position:fixed',
      'z-index:2147483647',
      'left:12px',
      'bottom:72px',
      'border:0',
      'border-radius:999px',
      'background:#ff6a00',
      'color:#120700',
      'font:bold 16px Arial,sans-serif',
      'padding:12px 18px',
      'box-shadow:0 8px 24px rgba(0,0,0,.35)',
      'direction:rtl'
    ].join(';');
    button.addEventListener('click', () => void run(button));
    document.body.appendChild(button);
    void report('android_ready', 'כפתור עדכון היומן מוכן בדף הרצליה ב-Android.', 8);
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', addButton);
  } else {
    addButton();
  }
})();
`.trim();
}

export async function GET(request: NextRequest) {
  const token = (request.nextUrl.searchParams.get('token') || '').trim();
  if (!token) {
    return new NextResponse('Missing token', { status: 400 });
  }

  return new NextResponse(buildAndroidUserscript(token, request.nextUrl.origin), {
    status: 200,
    headers: {
      'Content-Type': 'application/javascript; charset=utf-8',
      'Cache-Control': 'no-store, max-age=0',
      'Content-Disposition': 'inline; filename="tv-industry-herzliya-calendar-bridge.user.js"',
    },
  });
}
