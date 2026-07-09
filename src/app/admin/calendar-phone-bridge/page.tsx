'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { ArrowRight, Copy, Loader2, Smartphone } from 'lucide-react';
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

function buildBookmarklet(token: string, ingestUrl: string): string {
  const source = `
(async()=>{try{
const token=${JSON.stringify(token)};
const ingestUrl=${JSON.stringify(ingestUrl)};
const ids=[...new Set([...document.querySelectorAll('[onclick*="openmd2("]')].map(e=>String(e.getAttribute('onclick')||'').match(/openmd2\\((\\d+)\\)/)?.[1]).filter(Boolean))];
if(!ids.length){alert('לא נמצאו הפקות עם openmd2 בדף הזה');return;}
const popupHtmlById={};
for(const id of ids){
  const url=new URL('mgrqispi.dll?appname=HsILWeb&prgname=ShowCrew&arguments=-N'+id,location.href).toString();
  const res=await fetch(url,{credentials:'include'});
  const html=await res.text();
  if(!res.ok||!html.includes('נייד')){throw new Error('לא נטען צוות להפקה '+id);}
  popupHtmlById[id]=html;
  await new Promise(r=>setTimeout(r,350));
}
const payload={token,href:location.href,scheduleHtml:document.documentElement.outerHTML,popupHtmlById};
const save=await fetch(ingestUrl,{method:'POST',headers:{'content-type':'text/plain;charset=utf-8'},body:JSON.stringify(payload)});
const data=await save.json().catch(()=>({}));
if(!save.ok||!data.ok){throw new Error(data.error||('HTTP '+save.status));}
alert('היומן עודכן: '+data.personal+' הפקות, '+ids.length+' פופאפים');
}catch(e){alert('ייבוא נכשל: '+(e&&e.message?e.message:e));}})();`;
  return `javascript:${encodeURIComponent(source)}`;
}

export default function CalendarPhoneBridgePage() {
  const { user, loading } = useAuth();
  const [targetUid, setTargetUid] = useState(DEFAULT_TARGET_UID);
  const [tokenData, setTokenData] = useState<TokenResponse | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  const bookmarklet = useMemo(() => (
    tokenData?.token && tokenData.ingestUrl
      ? buildBookmarklet(tokenData.token, tokenData.ingestUrl)
      : ''
  ), [tokenData]);

  async function createToken() {
    if (!user) return;
    setBusy(true);
    setMessage('');
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
      setMessage(`נוצר טוקן ל-${payload.expiresInMinutes} דקות.`);
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
            כלי פרטי למנהל הראשי בלבד. הוא יוצר Bookmarklet חד־פעמי שמופעל מתוך דף הרצליה בטלפון,
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

        <button
          type="button"
          onClick={() => void createToken()}
          disabled={!user || busy}
          className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-lg bg-orange-500 px-5 py-3 font-bold text-[#170b09] hover:bg-orange-400 disabled:opacity-60"
        >
          {busy ? <Loader2 className="h-5 w-5 animate-spin" /> : <Smartphone className="h-5 w-5" />}
          צור Bookmarklet חד־פעמי
        </button>

        {bookmarklet ? (
          <section className="space-y-4 rounded-2xl border border-emerald-400/40 bg-[#17102f] p-5">
            <h2 className="font-bold text-emerald-300">הפעלה בטלפון</h2>
            <ol className="list-decimal space-y-2 pr-5 text-sm leading-6 text-violet-100">
              <li>העתק את ה־Bookmarklet.</li>
              <li>בטלפון, צור סימנייה חדשה בדפדפן והדבק את הקוד בשדה הכתובת של הסימנייה.</li>
              <li>פתח את הקישור השבועי של הרצליה.</li>
              <li>כשהלוח האישי מוצג, פתח את הסימנייה שיצרת.</li>
              <li>המתן להודעת “היומן עודכן”. לא לסגור באמצע.</li>
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
