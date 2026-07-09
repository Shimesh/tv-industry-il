'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { ArrowRight, CheckCircle2, Copy, Loader2, Smartphone, XCircle } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';

const DEFAULT_TARGET_UID = 'pVtM4KuNSSSexQ3W32UmImJHJID3';

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

function buildBookmarklet(token: string, ingestUrl: string): string {
  const source = `
(async()=>{const sleep=ms=>new Promise(r=>setTimeout(r,ms));try{
const token=${JSON.stringify(token)};
const ingestUrl=${JSON.stringify(ingestUrl)};
const statusUrl=ingestUrl.replace('/ingest','/status');
const report=(phase,message,progress,extra={})=>fetch(statusUrl,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({token,phase,message,progress,...extra})}).catch(()=>{});
await report('phone_started','הופעל מהטלפון. בודק את לוח הרצליה.',10);
const ids=[...new Set([...document.querySelectorAll('[onclick*="openmd2("]')].map(e=>String(e.getAttribute('onclick')||'').match(/openmd2\\((\\d+)\\)/)?.[1]).filter(Boolean))];
if(!ids.length){await report('failed','לא נמצאו הפקות עם openmd2 בדף הזה.',100,{error:'לא נמצאו הפקות'});alert('לא נמצאו הפקות עם openmd2 בדף הזה');return;}
await report('events_found','נמצאו '+ids.length+' הפקות. מתחיל למשוך פופאפים של צוותים.',20,{eventCount:ids.length,popupTotal:ids.length,popupDone:0});
const popupHtmlById={};
let done=0;
for(const id of ids){
  await report('popup_loading','טוען צוות להפקה '+id+' ('+(done+1)+'/'+ids.length+')',20+Math.round((done/ids.length)*50),{popupDone:done,popupTotal:ids.length});
  const url=new URL('mgrqispi.dll?appname=HsILWeb&prgname=ShowCrew&arguments=-N'+id,location.href).toString();
  const res=await fetch(url,{credentials:'include'});
  const html=await res.text();
  if(!res.ok||!html.includes('נייד')){throw new Error('לא נטען צוות להפקה '+id);}
  popupHtmlById[id]=html;
  done+=1;
  await report('popup_progress','נמשך צוות להפקה '+id+' ('+done+'/'+ids.length+')',20+Math.round((done/ids.length)*50),{popupDone:done,popupTotal:ids.length});
  await sleep(350);
}
await report('uploading','כל הפופאפים נאספו. שולח לאפליקציה לשמירה.',75,{popupDone:ids.length,popupTotal:ids.length,eventCount:ids.length});
const payload={token,href:location.href,scheduleHtml:document.documentElement.outerHTML,popupHtmlById};
const save=await fetch(ingestUrl,{method:'POST',headers:{'content-type':'text/plain;charset=utf-8'},body:JSON.stringify(payload)});
const data=await save.json().catch(()=>({}));
if(!save.ok||!data.ok){throw new Error(data.error||('HTTP '+save.status));}
await report('done','היומן עודכן: '+data.personal+' הפקות עם צוותים מלאים.',100,{popupDone:ids.length,popupTotal:ids.length,eventCount:ids.length});
alert('היומן עודכן: '+data.personal+' הפקות, '+ids.length+' פופאפים');
}catch(e){const message='ייבוא נכשל: '+(e&&e.message?e.message:e);try{await fetch(${JSON.stringify(ingestUrl)}.replace('/ingest','/status'),{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({token:${JSON.stringify(token)},phase:'failed',message,progress:100,error:message})});}catch(_){}alert(message);}})();`;
  return `javascript:${encodeURIComponent(source)}`;
}

export default function CalendarPhoneBridgePage() {
  const { user, loading } = useAuth();
  const [targetUid, setTargetUid] = useState(DEFAULT_TARGET_UID);
  const [tokenData, setTokenData] = useState<TokenResponse | null>(null);
  const [bridgeStatus, setBridgeStatus] = useState<BridgeStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  const bookmarklet = useMemo(() => (
    tokenData?.token && tokenData.ingestUrl
      ? buildBookmarklet(tokenData.token, tokenData.ingestUrl)
      : ''
  ), [tokenData]);

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
        body: JSON.stringify({ targetUid }),
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
    await navigator.clipboard.writeText(text);
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
            המסך הזה נשאר פתוח בממשק הניהול ומציג התקדמות בזמן אמת. הטלפון רק משמש כערוץ גישה להרצליה,
            אוסף את הלוח ואת פופאפי הצוותים, ושולח אותם לאפליקציה לשמירה.
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

        {bookmarklet ? (
          <section className="space-y-4 rounded-2xl border border-emerald-400/40 bg-[#17102f] p-5">
            <h2 className="font-bold text-emerald-300">מה עושים בפועל</h2>
            <ol className="list-decimal space-y-2 pr-5 text-sm leading-6 text-violet-100">
              <li>השאר את המסך הזה פתוח במחשב.</li>
              <li>העתק את ה-Bookmarklet לטלפון ושמור אותו כסימנייה בדפדפן.</li>
              <li>פתח בטלפון את קישור הרצליה השבועי כשהוא נטען דרך הגלישה שעובדת אצלך.</li>
              <li>כשהלוח האישי מוצג, הפעל את הסימנייה. ההתקדמות תופיע כאן במחשב.</li>
              <li>אם יש פופאפ שלא נטען, שום דבר חלקי לא נשמר והמסך יציג את השגיאה.</li>
            </ol>
            <textarea
              value={bookmarklet}
              readOnly
              rows={5}
              dir="ltr"
              className="w-full rounded-lg border border-violet-400/30 bg-[#09061a] px-3 py-2 font-mono text-xs text-violet-100"
            />
            <button
              type="button"
              onClick={() => void copy(bookmarklet, 'Bookmarklet')}
              className="inline-flex items-center gap-2 rounded-lg bg-emerald-500 px-4 py-2 text-sm font-bold text-emerald-950 hover:bg-emerald-400"
            >
              <Copy className="h-4 w-4" />
              העתק Bookmarklet
            </button>
          </section>
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
