'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { ArrowRight, CheckCircle2, Copy, Loader2, Smartphone, XCircle } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';

const DEFAULT_TARGET_UID = 'pVtM4KuNSSSexQ3W32UmImJHJID3';
const HERZLIYA_FULL_DEPARTMENT_BASE = 'https://hsil.acc.co.il:5443/magicscripts/mgrqispi.dll';
const SCHEDULE_INPUT_STORAGE_KEY = 'tv-industry-herzliya-phone-bridge-input';
const FULL_URL_STORAGE_KEY = 'tv-industry-herzliya-phone-bridge-full-url';

type TokenResponse = {
  ok: boolean;
  token: string;
  ingestUrl: string;
  expiresAt: number;
  expiresInMinutes: number;
  error?: string;
};

type BridgeStatus = {
  ok: boolean;
  status: string;
  phase: string;
  message: string;
  progress: number;
  eventCount: number;
  popupDone: number;
  popupTotal: number;
  productionCount: number;
  expiresAt: number | null;
  usedAt: number | null;
  error: string | null;
  log: string[];
};

function clampProgress(value: number | undefined): number {
  if (typeof value !== 'number' || Number.isNaN(value)) return 0;
  return Math.max(0, Math.min(100, Math.round(value)));
}

function extractHerzliyaUrl(input: string): string {
  return input.match(/https?:\/\/hsil\.acc\.co\.il:5443\/[^\s<>"']+/i)?.[0] || input.trim();
}

function deriveFullDepartmentUrl(input: string): string {
  const candidate = extractHerzliyaUrl(input);
  const sendwaMatch = candidate.match(/[?&]A=([^,\s&]+),(\d{8})/i)
    || input.match(/\bA=([A-F0-9-]{36}),(\d{8})/i);
  const directMatch = candidate.match(/arguments=-N([^,\s&]+),-A(\d{8})(?:,-A(?:true|false))?/i)
    || input.match(/arguments=-N([^,\s&]+),-A(\d{8})(?:,-A(?:true|false))?/i);
  const match = directMatch || sendwaMatch;
  if (!match) return '';
  const guid = match[1];
  const date = match[2];
  return `${HERZLIYA_FULL_DEPARTMENT_BASE}?appname=HSiLWeb&prgname=ShowEmp6&arguments=-N${guid},-A${date},-Atrue`;
}

function buildBookmarklet(token: string, ingestUrl: string): string {
  const runnerUrl = `${ingestUrl.replace('/ingest', '/runner')}?token=${encodeURIComponent(token)}`;
  const source = `(function(){var s=document.createElement('script');s.src=${JSON.stringify(runnerUrl)}+'&_='+Date.now();s.onerror=function(){alert('לא הצלחתי לטעון את סקריפט החילוץ מהאפליקציה');};document.documentElement.appendChild(s);})();`;
  return `javascript:${encodeURIComponent(source)}`;
}

function buildShortcutScript(token: string, ingestUrl: string): string {
  const statusUrl = ingestUrl.replace('/ingest', '/status');
  return `
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

(async () => {
  try {
    await report('shortcut_started', 'קיצור הדרך הופעל מתוך דף הרצליה בטלפון.', 10);

    if (!/hsil\\.acc\\.co\\.il$/i.test(location.hostname)) {
      const message = 'קיצור הדרך הופעל בדף הלא נכון. פתח קודם את לוח הרצליה ואז הפעל מה-Share.';
      await report('failed', message, 100, { error: message });
      completion(message);
      return;
    }

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
      const message = 'לא נמצאו הפקות בדף הרצליה. ודא שהלוח האישי נטען לפני ההפעלה.';
      await report('failed', message, 100, { error: message });
      completion(message);
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
    completion('היומן המלא עודכן: ' + result.global + ' הפקות, ' + ids.length + ' פופאפים');
  } catch (error) {
    const message = 'ייבוא נכשל: ' + (error && error.message ? error.message : error);
    await report('failed', message, 100, { error: message });
    completion(message);
  }
})();
`.trim();
}

function buildAndroidUserscript(token: string, ingestUrl: string): string {
  const statusUrl = ingestUrl.replace('/ingest', '/status');
  return `
// ==UserScript==
// @name         TV Industry - Herzliya Calendar Bridge
// @namespace    https://tv-industry-il.vercel.app/
// @version      1.0
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
      setButton(button, 'רץ...');
      await report('android_started', 'החילוץ הופעל מתוך דף הרצליה ב-Android.', 10);

      if (!/hsil\\.acc\\.co\\.il$/i.test(location.hostname)) {
        const message = 'הקוד רץ בדף הלא נכון. פתח קודם את לוח הרצליה.';
        await report('failed', message, 100, { error: message });
        alert(message);
        setButton(button, 'עדכן יומן');
        return;
      }

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
        setButton(button, 'צוות ' + (done + 1) + '/' + ids.length);
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

      setButton(button, 'שומר...');
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
      setButton(button, 'הושלם');
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

export default function CalendarPhoneBridgePage() {
  const { user, loading } = useAuth();
  const [targetUid, setTargetUid] = useState(DEFAULT_TARGET_UID);
  const [tokenData, setTokenData] = useState<TokenResponse | null>(null);
  const [bridgeStatus, setBridgeStatus] = useState<BridgeStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [scheduleInput, setScheduleInput] = useState('');
  const [lastValidFullDepartmentUrl, setLastValidFullDepartmentUrl] = useState('');

  const bookmarklet = useMemo(() => (
    tokenData?.token && tokenData.ingestUrl
      ? buildBookmarklet(tokenData.token, tokenData.ingestUrl)
      : ''
  ), [tokenData]);
  const shortcutScript = useMemo(() => (
    tokenData?.token && tokenData.ingestUrl
      ? buildShortcutScript(tokenData.token, tokenData.ingestUrl)
      : ''
  ), [tokenData]);
  const androidUserscript = useMemo(() => (
    tokenData?.token && tokenData.ingestUrl
      ? buildAndroidUserscript(tokenData.token, tokenData.ingestUrl)
      : ''
  ), [tokenData]);
  const androidInstallUrl = useMemo(() => (
    tokenData?.token
      ? `/admin/calendar-phone-bridge/android.user.js?token=${encodeURIComponent(tokenData.token)}`
      : ''
  ), [tokenData?.token]);
  const fullDepartmentUrl = useMemo(() => deriveFullDepartmentUrl(scheduleInput), [scheduleInput]);
  const displayedFullDepartmentUrl = fullDepartmentUrl || lastValidFullDepartmentUrl;
  const isUsingSavedFullDepartmentUrl = !fullDepartmentUrl && Boolean(lastValidFullDepartmentUrl);
  const displayedFullDepartmentUrlForEdge = useMemo(() => {
    if (!displayedFullDepartmentUrl || !tokenData?.token) return displayedFullDepartmentUrl;
    const separator = displayedFullDepartmentUrl.includes('#') ? '&' : '#';
    return `${displayedFullDepartmentUrl}${separator}tvib_token=${encodeURIComponent(tokenData.token)}`;
  }, [displayedFullDepartmentUrl, tokenData?.token]);
  const androidAppUrl = useMemo(() => (
    tokenData?.token && tokenData.ingestUrl && displayedFullDepartmentUrl
      ? `tvindustryherzliya://sync?token=${encodeURIComponent(tokenData.token)}&ingestUrl=${encodeURIComponent(tokenData.ingestUrl)}&url=${encodeURIComponent(displayedFullDepartmentUrl)}`
      : ''
  ), [displayedFullDepartmentUrl, tokenData?.ingestUrl, tokenData?.token]);

  useEffect(() => {
    try {
      const savedInput = window.localStorage.getItem(SCHEDULE_INPUT_STORAGE_KEY);
      const savedFullUrl = window.localStorage.getItem(FULL_URL_STORAGE_KEY);
      if (savedInput) setScheduleInput(savedInput);
      if (savedFullUrl) setLastValidFullDepartmentUrl(savedFullUrl);
    } catch {
      // localStorage is optional for this helper screen.
    }
  }, []);

  useEffect(() => {
    try {
      window.localStorage.setItem(SCHEDULE_INPUT_STORAGE_KEY, scheduleInput);
    } catch {
      // localStorage is optional for this helper screen.
    }
  }, [scheduleInput]);

  useEffect(() => {
    if (!fullDepartmentUrl) return;
    setLastValidFullDepartmentUrl(fullDepartmentUrl);
    try {
      window.localStorage.setItem(FULL_URL_STORAGE_KEY, fullDepartmentUrl);
    } catch {
      // localStorage is optional for this helper screen.
    }
  }, [fullDepartmentUrl]);

  useEffect(() => {
    if (!user || !tokenData?.token) return undefined;
    const activeUser = user;
    const activeToken = tokenData.token;
    let cancelled = false;

    async function pollStatus() {
      try {
        const idToken = await activeUser.getIdToken();
        const response = await fetch(`/api/admin/calendar-phone-bridge/status?token=${encodeURIComponent(activeToken)}`, {
          headers: { Authorization: `Bearer ${idToken}` },
          cache: 'no-store',
        });
        const payload = await response.json() as BridgeStatus;
        if (!cancelled && response.ok && payload.ok) {
          setBridgeStatus(payload);
        }
      } catch {
        // polling is best effort; the next tick may succeed
      }
    }

    void pollStatus();
    const timer = window.setInterval(() => void pollStatus(), 1500);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [tokenData?.token, user]);

  async function createToken() {
    if (!user) return;
    setBusy(true);
    setMessage('');
    setBridgeStatus(null);
    try {
      const idToken = await user.getIdToken();
      const response = await fetch('/api/admin/calendar-phone-bridge/token', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${idToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          targetUid,
          sourceUrl: extractHerzliyaUrl(scheduleInput),
          fullDepartmentUrl: displayedFullDepartmentUrl,
        }),
      });
      const payload = await response.json() as TokenResponse;
      if (!response.ok || !payload.ok) throw new Error(payload.error || 'יצירת הטוקן נכשלה');
      setTokenData(payload);
      setMessage(`נוצר טוקן ל-${payload.expiresInMinutes} דקות. עכשיו הפעל את ה-Bookmarklet מהטלפון.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'יצירת הטוקן נכשלה');
    } finally {
      setBusy(false);
    }
  }

  async function copy(text: string, label: string) {
    const value = text === displayedFullDepartmentUrl ? displayedFullDepartmentUrlForEdge : text;
    await navigator.clipboard.writeText(value);
    setMessage(`${label} הועתק.`);
  }

  const progress = clampProgress(bridgeStatus?.progress ?? (tokenData ? 5 : 0));
  const isDone = bridgeStatus?.phase === 'done' || bridgeStatus?.status === 'used';
  const isFailed = bridgeStatus?.phase === 'failed' || bridgeStatus?.status === 'failed';

  if (loading) {
    return (
      <main dir="rtl" className="flex min-h-screen items-center justify-center bg-[#09061a] text-white">
        <Loader2 className="h-5 w-5 animate-spin" />
      </main>
    );
  }

  return (
    <main dir="rtl" className="min-h-screen bg-[#09061a] px-4 py-24 text-white">
      <section className="mx-auto max-w-3xl space-y-6">
        <Link href="/admin" className="inline-flex items-center gap-2 text-sm text-violet-200 hover:text-white">
          <ArrowRight className="h-4 w-4" />
          חזרה לניהול
        </Link>

        <header className="space-y-2">
          <div className="flex items-center gap-3">
            <Smartphone className="h-7 w-7 text-orange-400" />
            <h1 className="text-2xl font-bold">גשר טלפון ליומן הרצליה</h1>
          </div>
          <p className="text-sm leading-6 text-violet-200">
            מצב Android/Pixels: סקריפט פרטי רץ בתוך דף הרצליה בטלפון, מוסיף כפתור “עדכן יומן”,
            אוסף את הלוח ואת פופאפי הצוותים, ושולח אותם לאפליקציה.
          </p>
        </header>

        <label className="block space-y-2">
          <span className="text-sm font-semibold">משתמש יעד</span>
          <input
            value={targetUid}
            onChange={(event) => setTargetUid(event.target.value)}
            className="w-full rounded-lg border border-violet-400/30 bg-[#17102f] px-4 py-3 font-mono text-sm outline-none focus:border-orange-400"
            dir="ltr"
          />
        </label>

        <section className="space-y-3 rounded-2xl border border-orange-400/30 bg-[#17102f] p-5">
          <div className="space-y-1">
            <h2 className="font-bold text-orange-200">יצירת קישור יומן מלא לטלפון</h2>
            <p className="text-sm leading-6 text-violet-200">
              הדבק כאן את הודעת הרצליה או את הקישור האישי שקיבלת. הממשק יחלץ ממנו את ה־GUID והתאריך,
              ויבנה את קישור `ShowEmp6` המלא — זה הקישור שפותחים בטלפון כדי לחלץ את כל ההפקות וכל הפופאפים.
            </p>
          </div>

          <textarea
            value={scheduleInput}
            onChange={(event) => setScheduleInput(event.target.value)}
            rows={4}
            className="w-full rounded-lg border border-violet-400/30 bg-[#09061a] px-4 py-3 text-sm outline-none focus:border-orange-400"
            placeholder="הדבק כאן הודעת WhatsApp מהרצליה או URL של sendwa.html..."
          />

          <div
            className={`space-y-3 rounded-xl border p-4 ${
              displayedFullDepartmentUrl
                ? 'border-emerald-400/30 bg-emerald-500/10'
                : 'border-violet-400/30 bg-[#09061a]'
            }`}
          >
              <div className="text-sm font-bold text-emerald-200">קישור מלא שנבנה:</div>
              {isUsingSavedFullDepartmentUrl ? (
                <p className="rounded-lg border border-amber-300/30 bg-amber-400/10 px-3 py-2 text-xs leading-5 text-amber-100">
                  הקלט הנוכחי לא נראה כמו הודעת הרצליה תקינה, לכן מוצג כאן הקישור המלא האחרון שזוהה ונשמר בדפדפן.
                </p>
              ) : null}
              <input
                value={displayedFullDepartmentUrlForEdge}
                readOnly
                dir="ltr"
                placeholder="אחרי הדבקת הודעת הרצליה יופיע כאן קישור ShowEmp6 מלא לפתיחה בטלפון"
                className="w-full rounded-lg border border-emerald-300/30 bg-[#09061a] px-3 py-2 font-mono text-xs text-emerald-50 placeholder:text-violet-300"
              />
              <div className="grid gap-2 sm:grid-cols-2">
                <button
                  type="button"
                  onClick={() => void copy(displayedFullDepartmentUrl, 'קישור היומן המלא')}
                  disabled={!displayedFullDepartmentUrl}
                  className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-emerald-500 px-4 py-2 text-sm font-bold text-emerald-950 hover:bg-emerald-400 disabled:cursor-not-allowed disabled:bg-slate-700 disabled:text-slate-400"
                >
                  <Copy className="h-4 w-4" />
                  העתק קישור מלא
                </button>
                <button
                  type="button"
                  disabled={!displayedFullDepartmentUrlForEdge}
                  onClick={() => {
                    if (!displayedFullDepartmentUrlForEdge) return;
                    window.open(displayedFullDepartmentUrlForEdge, '_blank', 'noopener,noreferrer');
                  }}
                  className="inline-flex min-h-11 items-center justify-center rounded-lg border border-emerald-300/50 px-4 py-2 text-sm font-bold text-emerald-100 hover:bg-emerald-400/10 disabled:cursor-not-allowed disabled:border-slate-600 disabled:text-slate-500"
                >
                  פתח קישור מלא ב־Edge
                </button>
              </div>
              <p className="text-xs leading-5 text-emerald-100">
                פתח את הקישור מתוך Microsoft Edge בטלפון. אם Tampermonkey מותקן והסקריפט עודכן, יופיע בתוך דף הרצליה כפתור כתום “עדכן יומן”.
                הכפתור ישאב את כל `openmd2`, יפתח את כל פופאפי `ShowCrew`, וישלח לאפליקציה חבילה אחת לשמירה.
              </p>
              {!displayedFullDepartmentUrl ? (
                <p className="rounded-lg bg-violet-500/10 px-4 py-3 text-sm leading-6 text-violet-200">
                  עדיין לא זוהה קישור הרצליה. הדבק למעלה הודעת WhatsApp מהרצליה או URL שמכיל `sendwa.html?A=...,...` או `arguments=-N...,-A...`.
                  הכפתורים ייפתחו אוטומטית ברגע שהקישור יזוהה.
                </p>
              ) : null}
            </div>
        </section>

        <button
          type="button"
          onClick={() => void createToken()}
          disabled={!user || busy}
          className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-lg bg-orange-500 px-5 py-3 font-bold text-[#170b09] hover:bg-orange-400 disabled:opacity-60"
        >
          {busy ? <Loader2 className="h-5 w-5 animate-spin" /> : <Smartphone className="h-5 w-5" />}
          צור הפעלת טלפון חדשה
        </button>

        {tokenData ? (
          <section className="space-y-4 rounded-2xl border border-violet-400/30 bg-[#17102f] p-5">
            {androidAppUrl ? (
              <a
                href={androidAppUrl}
                className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-lg bg-emerald-500 px-5 py-3 text-center font-bold text-emerald-950 hover:bg-emerald-400"
              >
                <Smartphone className="h-5 w-5" />
                פתח באפליקציית Android וחלץ יומן
              </a>
            ) : null}

            <div className="flex items-center justify-between gap-3">
              <h2 className="font-bold text-violet-100">התקדמות בזמן אמת</h2>
              {isDone ? <CheckCircle2 className="h-6 w-6 text-emerald-300" /> : null}
              {isFailed ? <XCircle className="h-6 w-6 text-red-300" /> : null}
              {!isDone && !isFailed ? <Loader2 className="h-5 w-5 animate-spin text-orange-300" /> : null}
            </div>

            <div className="h-3 overflow-hidden rounded-full bg-[#09061a]">
              <div
                className={`h-full transition-all duration-500 ${isFailed ? 'bg-red-400' : isDone ? 'bg-emerald-400' : 'bg-orange-400'}`}
                style={{ width: `${progress}%` }}
              />
            </div>

            <div className="grid gap-3 text-sm text-violet-100 sm:grid-cols-3">
              <div className="rounded-lg bg-[#09061a] p-3">
                <div className="text-violet-300">הפקות בלוח</div>
                <div className="text-xl font-bold">{bridgeStatus?.eventCount ?? 0}</div>
              </div>
              <div className="rounded-lg bg-[#09061a] p-3">
                <div className="text-violet-300">פופאפים</div>
                <div className="text-xl font-bold">
                  {bridgeStatus?.popupDone ?? 0}/{bridgeStatus?.popupTotal ?? 0}
                </div>
              </div>
              <div className="rounded-lg bg-[#09061a] p-3">
                <div className="text-violet-300">נשמרו</div>
                <div className="text-xl font-bold">{bridgeStatus?.productionCount ?? 0}</div>
              </div>
            </div>

            <p className={`rounded-lg px-4 py-3 text-sm ${isFailed ? 'bg-red-500/20 text-red-100' : 'bg-[#09061a] text-violet-100'}`}>
              {bridgeStatus?.message || 'מחכה להפעלה מהטלפון.'}
            </p>

            {bridgeStatus?.log?.length ? (
              <div className="max-h-48 overflow-auto rounded-lg bg-[#09061a] p-3 text-xs leading-6 text-violet-200">
                {bridgeStatus.log.slice().reverse().map((entry, index) => (
                  <div key={`${entry}-${index}`}>{entry}</div>
                ))}
              </div>
            ) : null}
          </section>
        ) : null}

        {androidUserscript ? (
          <section className="space-y-4 rounded-2xl border border-emerald-400/40 bg-[#17102f] p-5">
            <h2 className="font-bold text-emerald-300">מסלול מומלץ ל־Edge Android + Tampermonkey</h2>
            <p className="rounded-lg bg-emerald-500/10 px-4 py-3 text-sm leading-6 text-emerald-100">
              זה המסלול שעבד בפועל: Edge בטלפון פותח את הרצליה, Tampermonkey מוסיף כפתור “עדכן יומן”
              בתוך דף הרצליה, והשאיבה רצה מהטלפון בלי המחשב.
            </p>
            <ol className="list-decimal space-y-2 pr-5 text-sm leading-6 text-violet-100">
              <li>פתח את המסך הזה בטלפון מתוך <span dir="ltr">Microsoft Edge</span>.</li>
              <li>לחץ “צור הפעלת טלפון חדשה”.</li>
              <li>לחץ “התקן/עדכן סקריפט Edge”.</li>
              <li>במסך Tampermonkey לחץ <span dir="ltr">Install</span> או <span dir="ltr">Update</span>.</li>
              <li>חזור למסך הזה ב־Edge ולחץ “פתח קישור מלא ב־Edge”.</li>
              <li>בדף הרצליה לחץ על הכפתור הכתום “עדכן יומן”.</li>
              <li>המתן עד שמופיע כאן שכל ההפקות וכל הפופאפים הושלמו, למשל 29/29. אם חסר צוות/פופאפ, שום דבר חלקי לא נשמר.</li>
            </ol>
            {androidInstallUrl ? (
              <a
                href={androidInstallUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex min-h-12 w-full items-center justify-center rounded-lg bg-emerald-500 px-5 py-3 text-center text-sm font-bold text-emerald-950 hover:bg-emerald-400"
              >
                התקן/עדכן סקריפט Edge
              </a>
            ) : null}
            <p className="text-xs leading-5 text-violet-300">
              אם ההתקנה הישירה לא נפתחת, השתמש בקוד הגיבוי למטה והדבק אותו ידנית ב־Tampermonkey בתוך Edge.
            </p>
            <textarea
              value={androidUserscript}
              readOnly
              rows={12}
              dir="ltr"
              className="w-full rounded-lg border border-violet-400/30 bg-[#09061a] px-3 py-2 font-mono text-xs text-violet-100"
            />
            <button
              type="button"
              onClick={() => void copy(androidUserscript, 'קוד סקריפט')}
              className="inline-flex items-center gap-2 rounded-lg bg-emerald-500 px-4 py-2 text-sm font-bold text-emerald-950 hover:bg-emerald-400"
            >
              <Copy className="h-4 w-4" />
              העתק קוד סקריפט
            </button>
          </section>
        ) : null}

        {shortcutScript ? (
          <details className="rounded-2xl border border-violet-400/30 bg-[#17102f] p-5">
            <summary className="cursor-pointer text-sm font-bold text-violet-100">גיבוי ל-iPhone בלבד</summary>
            <p className="mt-3 text-sm leading-6 text-violet-200">
              זה לא מתאים ל-Pixel. נשאר כאן רק אם בעתיד תרצה להריץ דרך iPhone/Safari Shortcuts.
            </p>
            <textarea
              value={shortcutScript}
              readOnly
              rows={8}
              dir="ltr"
              className="mt-3 w-full rounded-lg border border-violet-400/30 bg-[#09061a] px-3 py-2 font-mono text-xs text-violet-100"
            />
            <button
              type="button"
              onClick={() => void copy(shortcutScript, 'קוד Shortcut')}
              className="mt-3 inline-flex items-center gap-2 rounded-lg bg-violet-500 px-4 py-2 text-sm font-bold text-white hover:bg-violet-400"
            >
              <Copy className="h-4 w-4" />
              העתק קוד iPhone
            </button>
          </details>
        ) : null}

        {bookmarklet ? (
          <details className="rounded-2xl border border-violet-400/30 bg-[#17102f] p-5">
            <summary className="cursor-pointer text-sm font-bold text-violet-100">גיבוי ישן: Bookmarklet קצר</summary>
            <p className="mt-3 text-sm leading-6 text-violet-200">
              השתמש בזה רק אם קיצור הדרך לא זמין. המסלול הראשי הוא Shortcuts דרך Share Sheet.
            </p>
            <textarea
              value={bookmarklet}
              readOnly
              rows={4}
              dir="ltr"
              className="mt-3 w-full rounded-lg border border-violet-400/30 bg-[#09061a] px-3 py-2 font-mono text-xs text-violet-100"
            />
            <button
              type="button"
              onClick={() => void copy(bookmarklet, 'Bookmarklet')}
              className="mt-3 inline-flex items-center gap-2 rounded-lg bg-violet-500 px-4 py-2 text-sm font-bold text-white hover:bg-violet-400"
            >
              <Copy className="h-4 w-4" />
              העתק Bookmarklet
            </button>
          </details>
        ) : null}

        {message ? (
          <p className="rounded-lg border border-violet-400/30 bg-[#17102f] px-4 py-3 text-center text-sm">
            {message}
          </p>
        ) : null}
      </section>
    </main>
  );
}
