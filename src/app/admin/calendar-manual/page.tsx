'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ArrowRight, CalendarPlus, Save } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';

const EXAMPLE = `2026-07-05 | 13:00 | 23:00 | אולפן 2 | רצועת ערב
2026-07-06 | 19:00 | 24:30 | אולפן 7 | מונדיאל 2026`;

export default function ManualCalendarAdminPage() {
  const { user } = useAuth();
  const [targetUid, setTargetUid] = useState('pVtM4KuNSSSexQ3W32UmImJHJID3');
  const [text, setText] = useState(EXAMPLE);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  async function save() {
    if (!user) return;
    const productions = text.split(/\r?\n/).filter(Boolean).map((line) => {
      const [date, startTime, endTime, studio, ...name] = line.split('|').map((part) => part.trim());
      return { date, startTime, endTime, studio, name: name.join(' | ') };
    });
    setSaving(true); setMessage('');
    try {
      const token = await user.getIdToken();
      const response = await fetch('/api/admin/calendar-manual', { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ targetUid, productions }) });
      const result = await response.json() as { error?: string; written?: number };
      if (!response.ok) throw new Error(result.error || 'השמירה נכשלה');
      setMessage(`${result.written || 0} הפקות נשמרו ביומן האישי`);
    } catch (error) { setMessage(error instanceof Error ? error.message : 'השמירה נכשלה'); }
    finally { setSaving(false); }
  }
  return <main dir="rtl" className="min-h-screen bg-[#09061a] px-4 py-24 text-white"><section className="mx-auto max-w-3xl space-y-6">
    <Link href="/admin" className="inline-flex items-center gap-2 text-sm text-violet-200 hover:text-white"><ArrowRight className="h-4 w-4" /> חזרה לניהול</Link>
    <header className="space-y-2"><div className="flex items-center gap-3"><CalendarPlus className="h-7 w-7 text-orange-400" /><h1 className="text-2xl font-bold">עדכון ידני של יומן הפקות</h1></div><p className="text-sm text-violet-200">כל שורה: תאריך | התחלה | סיום | אולפן | שם הפקה</p></header>
    <label className="block space-y-2"><span className="text-sm font-semibold">מזהה המשתמש</span><input value={targetUid} onChange={(e) => setTargetUid(e.target.value)} className="w-full rounded-lg border border-violet-400/30 bg-[#17102f] px-4 py-3 font-mono text-sm outline-none focus:border-orange-400" dir="ltr" /></label>
    <label className="block space-y-2"><span className="text-sm font-semibold">הפקות</span><textarea value={text} onChange={(e) => setText(e.target.value)} rows={14} className="w-full resize-y rounded-lg border border-violet-400/30 bg-[#17102f] px-4 py-3 text-sm leading-7 outline-none focus:border-orange-400" spellCheck={false} /></label>
    <button onClick={() => void save()} disabled={saving} className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-lg bg-orange-500 px-5 py-3 font-bold text-[#170b09] hover:bg-orange-400 disabled:opacity-60"><Save className="h-5 w-5" /> {saving ? 'שומר...' : 'שמור והצג ביומן'}</button>
    {message && <p className="rounded-lg border border-violet-400/30 bg-[#17102f] px-4 py-3 text-center text-sm">{message}</p>}
  </section></main>;
}
