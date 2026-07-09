'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ArrowRight, CalendarPlus, ClipboardPaste, Save } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import type { Production } from '@/lib/productionDiff';

type Mode = 'source' | 'rows';
const EXAMPLE = `2026-07-05 | 13:00 | 23:00 | אולפן 2 | רצועת ערב
2026-07-06 | 19:00 | 24:30 | אולפן 7 | מונדיאל 2026`;

export default function ManualCalendarAdminPage() {
  const { user } = useAuth();
  const [targetUid, setTargetUid] = useState('pVtM4KuNSSSexQ3W32UmImJHJID3');
  const [mode, setMode] = useState<Mode>('source');
  const [sourceInput, setSourceInput] = useState('');
  const [rowsInput, setRowsInput] = useState(EXAMPLE);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [preview, setPreview] = useState<Production[]>([]);
  const [incompleteCrew, setIncompleteCrew] = useState(false);

  async function save() {
    if (!user) return;
    const body: Record<string, unknown> = { targetUid };
    if (mode === 'source' && preview.length === 0) { body.input = sourceInput; body.preview = true; }
    else if (mode === 'source') body.parsedProductions = preview;
    else body.productions = rowsInput.split(/\r?\n/).filter(Boolean).map((line) => {
      const [date, startTime, endTime, studio, ...name] = line.split('|').map((part) => part.trim());
      return { date, startTime, endTime, studio, name: name.join(' | ') };
    });
    setSaving(true); setMessage('');
    try {
      const token = await user.getIdToken();
      const response = await fetch('/api/admin/calendar-manual', { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const result = await response.json() as { error?: string; personal?: number; global?: number; source?: string; preview?: Production[]; incompleteCrew?: boolean; warning?: string };
      if (!response.ok) throw new Error(result.error || 'השמירה נכשלה');
      if (Array.isArray(result.preview)) {
        setPreview(result.preview);
        setIncompleteCrew(result.incompleteCrew === true);
        setMessage(result.warning || `נמצאו ${result.preview.length} הפקות. בדוק את הרשימה ואשר שמירה.`);
      } else {
        setMessage(`נשמרו ${result.personal || 0} משמרות אישיות ו-${result.global || 0} הפקות בלוח המלא`);
        setPreview([]);
        setIncompleteCrew(false);
      }
    } catch (error) { setMessage(error instanceof Error ? error.message : 'השמירה נכשלה'); }
    finally { setSaving(false); }
  }

  return <main dir="rtl" className="min-h-screen bg-[#09061a] px-4 py-24 text-white"><section className="mx-auto max-w-3xl space-y-6">
    <Link href="/admin" className="inline-flex items-center gap-2 text-sm text-violet-200 hover:text-white"><ArrowRight className="h-4 w-4" /> חזרה לניהול</Link>
    <header className="space-y-2"><div className="flex items-center gap-3"><CalendarPlus className="h-7 w-7 text-orange-400" /><h1 className="text-2xl font-bold">עדכון ידני של יומן הפקות</h1></div><p className="text-sm text-violet-200">ייבוא לוח מהרצליה גם כאשר הסנכרון האוטומטי אינו זמין.</p></header>
    <label className="block space-y-2"><span className="text-sm font-semibold">מזהה המשתמש</span><input value={targetUid} onChange={(e) => setTargetUid(e.target.value)} className="w-full rounded-lg border border-violet-400/30 bg-[#17102f] px-4 py-3 font-mono text-sm outline-none focus:border-orange-400" dir="ltr" /></label>
    <div className="grid grid-cols-2 gap-2 rounded-lg bg-[#17102f] p-1">
      <button onClick={() => setMode('source')} className={`min-h-11 rounded-md px-3 font-semibold ${mode === 'source' ? 'bg-orange-500 text-[#170b09]' : 'text-violet-200'}`}>הודעה, קישור או קוד דף</button>
      <button onClick={() => setMode('rows')} className={`min-h-11 rounded-md px-3 font-semibold ${mode === 'rows' ? 'bg-orange-500 text-[#170b09]' : 'text-violet-200'}`}>הזנת שורות</button>
    </div>
    {mode === 'source' ? <label className="block space-y-2"><span className="text-sm font-semibold">הדבק כאן</span><textarea value={sourceInput} onChange={(e) => { setSourceInput(e.target.value); setPreview([]); setIncompleteCrew(false); setMessage(''); }} rows={16} placeholder="הדבק הודעת WhatsApp, קישור, קוד דף הלוח, או HTML של פופ־אפ צוות" className="w-full resize-y rounded-lg border border-violet-400/30 bg-[#17102f] px-4 py-3 text-sm leading-6 outline-none focus:border-orange-400" spellCheck={false} /><p className="text-xs leading-5 text-violet-300">אפשר להדביק כמה פופ־אפים יחד. הכלי יפריד ביניהם, יתאים כל אחד לפי שם ותאריך ויציג את כל הצוותים לפני השמירה.</p></label>
      : <label className="block space-y-2"><span className="text-sm font-semibold">כל שורה: תאריך | התחלה | סיום | אולפן | שם הפקה</span><textarea value={rowsInput} onChange={(e) => setRowsInput(e.target.value)} rows={14} className="w-full resize-y rounded-lg border border-violet-400/30 bg-[#17102f] px-4 py-3 text-sm leading-7 outline-none focus:border-orange-400" spellCheck={false} /></label>}
    {preview.length > 0 && <section className={`space-y-2 rounded-lg border bg-[#17102f] p-4 ${incompleteCrew ? 'border-amber-400/50' : 'border-emerald-400/40'}`}><h2 className={`font-bold ${incompleteCrew ? 'text-amber-300' : 'text-emerald-300'}`}>{incompleteCrew ? 'תצוגה מקדימה חלקית — לא לשמירה' : 'תצוגה מקדימה לפני שמירה'}</h2>{incompleteCrew ? <p className="rounded-lg border border-amber-400/30 bg-amber-500/10 px-3 py-2 text-sm leading-6 text-amber-100">ההפקות זוהו, אבל הצוותים לא נטענו מהרצליה. כפתור השמירה חסום כדי לא להכניס ליומן שבוע ללא צוותים.</p> : null}{preview.map((production) => <div key={`${production.id}-${production.date}`} className="grid grid-cols-[1fr_auto] gap-3 border-t border-white/10 py-2 text-sm"><span>{production.name}</span><span dir="ltr" className={incompleteCrew && (production.crew?.length || 0) === 0 ? 'text-amber-200' : 'text-violet-200'}>{production.date} · {production.startTime}-{production.endTime} · {production.crew?.length || 0} צוות</span></div>)}</section>}
    <button onClick={() => void save()} disabled={saving || incompleteCrew || (mode === 'source' && !sourceInput.trim())} className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-lg bg-orange-500 px-5 py-3 font-bold text-[#170b09] hover:bg-orange-400 disabled:opacity-60">{mode === 'source' && preview.length === 0 ? <ClipboardPaste className="h-5 w-5" /> : <Save className="h-5 w-5" />} {saving ? 'מעבד...' : incompleteCrew ? 'השמירה חסומה — חסרים צוותים' : mode === 'source' && preview.length === 0 ? 'חלץ והצג תצוגה מקדימה' : 'אשר ושמור ביומן'}</button>
    {message && <p className="rounded-lg border border-violet-400/30 bg-[#17102f] px-4 py-3 text-center text-sm">{message}</p>}
  </section></main>;
}
