'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, CalendarDays, Check, Clock3, MapPin, RefreshCw, TriangleAlert } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { compareBriefing, formatBriefingDate, israelToday, nextBriefingShift, type BriefingSnapshot, type CalendarBriefingData } from '@/lib/calendarBriefing';

const baselineKey = (uid: string) => `calendar-briefing-reviewed-v1:${uid}`;
const dateTime = (timestamp: number) => new Date(timestamp).toLocaleString('he-IL', { timeZone: 'Asia/Jerusalem', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });

function readBaseline(uid: string): BriefingSnapshot | null {
  try {
    const parsed = JSON.parse(localStorage.getItem(baselineKey(uid)) || 'null') as BriefingSnapshot | null;
    if (!parsed || !/^\d{4}-\d{2}-\d{2}$/.test(parsed.start) || !/^\d{4}-\d{2}-\d{2}$/.test(parsed.end) || !Number.isFinite(parsed.checkedAt) || !Array.isArray(parsed.shifts)) return null;
    if (!parsed.shifts.every(shift => shift && ['key', 'name', 'date', 'studio', 'startTime', 'endTime', 'role', 'status'].every(key => typeof shift[key as keyof typeof shift] === 'string'))) return null;
    return parsed;
  } catch { return null; }
}

export default function CalendarBriefing({ showNext = false, refreshSignal }: { showNext?: boolean; refreshSignal?: number | null }) {
  const { user } = useAuth();
  const [state, setState] = useState<{ uid: string; data: CalendarBriefingData; baseline: BriefingSnapshot | null } | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [storageWarning, setStorageWarning] = useState(false);
  const [nonce, setNonce] = useState(0);
  const [now, setNow] = useState(() => new Date());
  const visible = state?.uid === user?.uid ? state : null;
  const data = visible?.data;
  const refresh = useCallback(() => setNonce(value => value + 1), []);

  useEffect(() => {
    if (!user) return;
    const controller = new AbortController();
    let cancelled = false;
    setLoading(true);
    setError('');
    async function load() {
      try {
        const token = await user!.getIdToken();
        const response = await fetch('/api/productions/briefing', { headers: { Authorization: `Bearer ${token}` }, cache: 'no-store', signal: controller.signal });
        if (!response.ok) throw new Error('לא ניתן לבדוק את היומן כרגע. נסה לרענן שוב.');
        const incoming = await response.json() as CalendarBriefingData;
        if (!Array.isArray(incoming.shifts) || !incoming.sync) throw new Error('התקבל מידע לא שלם. נסה לרענן שוב.');
        if (cancelled) return;
        const baseline = readBaseline(user!.uid);
        if (!baseline) {
          try { localStorage.setItem(baselineKey(user!.uid), JSON.stringify(incoming)); }
          catch { setStorageWarning(true); }
        }
        setState({ uid: user!.uid, data: incoming, baseline });
        setNow(new Date());
      } catch (caught) {
        if (!cancelled) setError(caught instanceof Error ? caught.message : 'בדיקת היומן נכשלה');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => { cancelled = true; controller.abort(); };
  }, [user, nonce, refreshSignal]);

  useEffect(() => {
    const onVisible = () => { if (document.visibilityState === 'visible') { setNow(new Date()); refresh(); } };
    const timer = window.setInterval(() => { setNow(new Date()); if (document.visibilityState === 'visible') refresh(); }, 5 * 60 * 1000);
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('contacts-updated', refresh);
    return () => { clearInterval(timer); document.removeEventListener('visibilitychange', onVisible); window.removeEventListener('contacts-updated', refresh); };
  }, [refresh]);

  if (!user) return null;
  const next = data ? nextBriefingShift(data.shifts, now) : undefined;
  const changes = data && visible?.baseline ? compareBriefing(visible.baseline, data, israelToday(now)) : [];
  const syncFailed = data?.sync.status === 'error' || data?.sync.status === 'empty';
  const syncTitle = !data ? 'בודק את מצב היומן' : data.sync.status === 'success' ? 'הסנכרון האחרון דווח כהושלם' : data.sync.status === 'pending' ? 'הסנכרון האחרון עדיין ממתין להשלמה' : syncFailed ? 'הסנכרון האחרון לא הושלם עם נתונים' : 'אין אישור לסנכרון האחרון';
  const acknowledge = () => {
    if (!data || !visible) return;
    try { localStorage.setItem(baselineKey(user.uid), JSON.stringify(data)); setStorageWarning(false); }
    catch { setStorageWarning(true); }
    setState({ ...visible, baseline: data });
  };

  return (
    <section dir="rtl" aria-label="תמונת מצב אישית ליומן" className="mb-5 min-w-0 overflow-hidden rounded-2xl border p-4 sm:p-5" style={{ background: 'var(--theme-bg-card)', borderColor: 'var(--theme-border)', color: 'var(--theme-text)' }}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 gap-3">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-sky-500/15 text-sky-500"><CalendarDays className="h-6 w-6" aria-hidden="true" /></span>
          <div><h2 className="text-lg font-bold">היומן שלי, במבט אחד</h2><p className="mt-1 text-sm" style={{ color: 'var(--theme-text-secondary)' }}>{showNext ? 'ההפקה הבאה ועדכונים אישיים' : 'מצב הסנכרון ועדכונים אישיים'}</p></div>
        </div>
        <button type="button" onClick={refresh} disabled={loading} aria-label="בדיקת עדכונים מהאפליקציה" className="flex min-h-11 shrink-0 items-center gap-2 rounded-xl border px-3 text-sm font-semibold transition hover:bg-sky-500/10 disabled:opacity-50" style={{ borderColor: 'var(--theme-border)' }}><RefreshCw aria-hidden="true" className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} /><span className="hidden sm:inline">רענון</span></button>
      </div>

      {error && <p role="alert" className="mt-4 rounded-xl border border-amber-500/40 bg-amber-500/10 p-3 text-base">{error}{data && ' מוצגים נתונים מהבדיקה הקודמת.'}</p>}
      {!data && loading && <p role="status" className="mt-4 text-sm">טוען את השיבוצים שלך…</p>}

      {showNext && data && <div className="mt-5 rounded-xl border p-4 sm:p-5" style={{ borderColor: 'var(--theme-border)', background: 'var(--theme-bg-secondary)' }}>
        <p className="text-sm font-semibold" style={{ color: 'var(--theme-text-secondary)' }}>ההפקה הבאה שלי</p>
        {next ? <>
          <h3 className="mt-2 break-words text-2xl font-black">{next.name}</h3>
          <p className="mt-2 text-base font-semibold">{formatBriefingDate(next.date)}</p>
          <div className="mt-3 flex flex-wrap gap-x-5 gap-y-3 text-base">
            <span className="inline-flex items-center gap-2"><Clock3 className="h-5 w-5 shrink-0" aria-hidden="true" /><bdi dir="ltr">{next.startTime || 'טרם צוין'}{next.endTime ? `–${next.endTime}` : ''}</bdi></span>
            <span className="inline-flex items-center gap-2"><MapPin className="h-5 w-5 shrink-0" aria-hidden="true" />{next.studio || 'מיקום טרם צוין'}</span>
          </div>
          {next.role && <p className="mt-3 text-base">התפקיד שלי: <strong>{next.role}</strong></p>}
          <Link href={`/productions?date=${next.date}`} className="mt-4 inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-sky-700 px-5 py-3 font-bold text-white transition hover:bg-sky-800">לפרטי ההפקה והצוות <ArrowLeft className="h-4 w-4" aria-hidden="true" /></Link>
        </> : <p className="mt-2 text-base">לא נמצא שיבוץ עתידי בטווח שנבדק. זה לא בהכרח אומר שאין הפקות נוספות.</p>}
        <p className="mt-3 text-sm leading-6" style={{ color: 'var(--theme-text-secondary)' }}>טווח הבדיקה: {formatBriefingDate(data.start)} עד {formatBriefingDate(data.end)}</p>
      </div>}

      {data && <div className="mt-4 space-y-2 text-sm leading-6" aria-live="polite">
        <p className="flex items-start gap-2 font-semibold">{syncFailed ? <TriangleAlert className="mt-1 h-4 w-4 shrink-0 text-amber-500" aria-hidden="true" /> : <Clock3 className="mt-1 h-4 w-4 shrink-0" aria-hidden="true" />}{syncTitle}</p>
        <p style={{ color: 'var(--theme-text-secondary)' }}>{data.sync.source === 'personal' ? 'מקור: הסנכרון האישי' : data.sync.source === 'phone' ? 'מקור: גשר הטלפון' : data.sync.source === 'shared' ? 'מקור: היומן המשותף, לא אישור לסנכרון אישי' : 'מקור סנכרון לא זמין'}{data.sync.at && <> · <bdi dir="ltr">{dateTime(data.sync.at)}</bdi></>}</p>
        {data.sync.weekStart && <p>השבוע הרשום במקור מתחיל ב־{formatBriefingDate(data.sync.weekStart)}</p>}
        <p style={{ color: 'var(--theme-text-secondary)' }}>הנתונים נקראו מהאפליקציה ב־<bdi dir="ltr">{dateTime(data.checkedAt)}</bdi>. רענון כאן אינו מייבא הודעה חדשה מהרצליה.</p>
      </div>}

      {data && <details className="mt-4 rounded-xl border" style={{ borderColor: 'var(--theme-border)' }} open={changes.length > 0 || undefined}>
        <summary className="min-h-12 cursor-pointer px-4 py-3 text-base font-bold">מה השתנה בשיבוץ שלי? {changes.length > 0 && <span className="ms-2 rounded-md bg-amber-500/15 px-2 py-1 text-sm">{changes.length} עדכונים</span>}</summary>
        <div className="space-y-3 border-t p-4" style={{ borderColor: 'var(--theme-border)' }}>
          <p className="text-sm leading-6" style={{ color: 'var(--theme-text-secondary)' }}>{visible?.baseline ? <>השוואה לבדיקה שאישרת במכשיר הזה ב־<bdi dir="ltr">{dateTime(visible.baseline.checkedAt)}</bdi>. נבדקים רק שיבוצים מהיום ואילך בטווח המשותף לשתי הבדיקות.</> : 'זו הבדיקה הראשונה במכשיר הזה. נשמרה נקודת התחלה; שינויים שיזוהו בבדיקות הבאות יוצגו כאן.'}</p>
          {changes.map(change => <div key={`${change.key}:${change.kind}`} className="rounded-lg border p-3" style={{ borderColor: 'var(--theme-border)' }}>
            <p className="text-base font-bold">{change.name}</p><p className="mt-1 text-sm">{formatBriefingDate(change.date)}</p>
            <ul className="mt-2 list-inside list-disc space-y-1 text-sm leading-6">{change.details.map(detail => <li key={detail}>{detail}</li>)}</ul>
          </div>)}
          {visible?.baseline && changes.length === 0 && <p className="text-sm">לא זוהו שינויים בשיבוצים שנבדקו.</p>}
          {changes.length > 0 && <button type="button" onClick={acknowledge} className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-sky-700 px-4 py-2 font-semibold text-white hover:bg-sky-800"><Check className="h-4 w-4" aria-hidden="true" />ראיתי את השינויים</button>}
          {storageWarning && <p role="status" className="text-sm">שמירת ההשוואה במכשיר חסומה. נקודת ההשוואה לא תישמר לאחר סגירת העמוד.</p>}
        </div>
      </details>}
    </section>
  );
}
