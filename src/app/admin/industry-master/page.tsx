'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowRight, Database, Edit2, ExternalLink, Film, Loader2, Plus, RefreshCw, Save, Search, Trash2, X } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import type { IndustryMasterEntry } from '@/lib/proCardTypes';

type FormState = {
  showName: string;
  logoUrl: string;
  network: string;
  genre: string;
  productionCompany: string;
  wikiUrl: string;
};

const emptyForm: FormState = { showName: '', logoUrl: '', network: '', genre: '', productionCompany: '', wikiUrl: '' };

export default function IndustryMasterPage() {
  const { user } = useAuth();
  const [entries, setEntries] = useState<IndustryMasterEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [form, setForm] = useState<FormState>(emptyForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);

  // Seed sync state
  const [seeding, setSeeding] = useState(false);
  const [seedResult, setSeedResult] = useState<{ added: number; total: number; skippedNoise: number; merged: number } | null>(null);

  // Wikipedia batch sync state
  const [wikiSyncing, setWikiSyncing] = useState(false);
  const [wikiProgress, setWikiProgress] = useState<{ processed: number; enriched: number; remaining: number } | null>(null);

  async function fetchWithAuth<T>(path: string, init?: RequestInit): Promise<T> {
    if (!user) throw new Error('יש להתחבר תחילה');
    const token = await user.getIdToken();
    const res = await fetch(path, {
      ...init,
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
    });
    if (!res.ok) throw new Error(await res.text());
    return res.json() as Promise<T>;
  }

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchWithAuth<IndustryMasterEntry[]>('/api/admin/industry-master');
      setEntries(data.sort((a, b) => a.showName.localeCompare(b.showName, 'he')));
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, [user]); // eslint-disable-line react-hooks/exhaustive-deps

  async function handleSeed() {
    setSeeding(true);
    setSeedResult(null);
    setError(null);
    try {
      const result = await fetchWithAuth<{ added: number; total: number; existing: number; skippedNoise: number; merged: number }>(
        '/api/admin/industry-master/sync',
        { method: 'POST' },
      );
      setSeedResult({ added: result.added, total: result.total, skippedNoise: result.skippedNoise ?? 0, merged: result.merged ?? 0 });
      await load();
    } catch (err) {
      setError(String(err));
    } finally {
      setSeeding(false);
    }
  }

  async function handleWikiSync() {
    setWikiSyncing(true);
    setWikiProgress({ processed: 0, enriched: 0, remaining: Infinity });
    setError(null);
    let totalEnriched = 0;
    try {
      while (true) {
        const batch = await fetchWithAuth<{ processed: number; enriched: number; remaining: number }>(
          '/api/admin/industry-master/sync/wiki',
          { method: 'POST' },
        );
        totalEnriched += batch.enriched;
        setWikiProgress({ processed: batch.processed, enriched: totalEnriched, remaining: batch.remaining });
        if (batch.remaining === 0 || batch.processed === 0) break;
        await new Promise((r) => setTimeout(r, 2000));
      }
      await load();
    } catch (err) {
      setError(String(err));
    } finally {
      setWikiSyncing(false);
    }
  }

  function startAdd() {
    setEditingId(null);
    setForm(emptyForm);
    setShowForm(true);
  }

  function startEdit(entry: IndustryMasterEntry) {
    setEditingId(entry.id);
    setForm({
      showName: entry.showName,
      logoUrl: entry.logoUrl === 'none' ? '' : entry.logoUrl,
      network: entry.network,
      genre: entry.genre,
      productionCompany: entry.productionCompany ?? '',
      wikiUrl: entry.wikiUrl === 'none' ? '' : entry.wikiUrl,
    });
    setShowForm(true);
  }

  async function handleSave() {
    if (!form.showName.trim()) return;
    setBusy(true);
    setError(null);
    try {
      if (editingId) {
        await fetchWithAuth(`/api/admin/industry-master/${editingId}`, { method: 'PATCH', body: JSON.stringify(form) });
      } else {
        await fetchWithAuth('/api/admin/industry-master', { method: 'POST', body: JSON.stringify(form) });
      }
      setShowForm(false);
      setForm(emptyForm);
      setEditingId(null);
      await load();
    } catch (err) {
      setError(String(err));
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete(id: string) {
    setBusy(true);
    setError(null);
    try {
      await fetchWithAuth(`/api/admin/industry-master/${id}`, { method: 'DELETE' });
      setDeleteConfirm(null);
      await load();
    } catch (err) {
      setError(String(err));
    } finally {
      setBusy(false);
    }
  }

  const filtered = query
    ? entries.filter((e) =>
        e.showName.toLowerCase().includes(query.toLowerCase()) ||
        e.network.toLowerCase().includes(query.toLowerCase()),
      )
    : entries;

  const wikiPending = entries.filter((e) => !e.network && e.wikiUrl !== 'none').length;

  return (
    <div className="min-h-screen p-4 sm:p-6" dir="rtl" style={{ background: 'var(--theme-bg)', color: 'var(--theme-text)' }}>
      <div className="mx-auto max-w-3xl">

        {/* Header */}
        <div className="mb-6 flex items-center gap-3">
          <Link href="/admin" className="flex items-center gap-1 text-sm opacity-60 hover:opacity-100">
            <ArrowRight className="h-4 w-4" />
            אדמין
          </Link>
          <span className="opacity-30">/</span>
          <h1 className="flex items-center gap-2 text-xl font-black">
            <Database className="h-5 w-5 text-violet-300" />
            ספריית תעשייה מרכזית
          </h1>
        </div>

        {/* Seed sync card */}
        <div className="mb-4 rounded-2xl border border-violet-500/20 bg-violet-500/[0.07] px-4 py-3">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div className="text-sm">
              <p className="font-bold text-violet-200">שלב 1 — סנכרן מקטלוג ההפקות</p>
              <p className="mt-0.5 text-xs opacity-60">מייבא את 326 ההפקות מ-production-registry לספרייה המרכזית</p>
            </div>
            <button
              type="button"
              onClick={() => void handleSeed()}
              disabled={seeding}
              className="inline-flex shrink-0 items-center gap-2 rounded-xl bg-violet-500 px-4 py-2 text-sm font-bold text-white transition hover:bg-violet-400 disabled:opacity-50"
            >
              {seeding ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
              {seeding ? 'מסנכרן...' : 'סנכרן מהרג׳יסטרי'}
            </button>
          </div>
          {seedResult && (
            <div className={`mt-2 rounded-lg px-3 py-2 text-xs ${seedResult.added > 0 ? 'bg-green-500/10 border border-green-400/20' : 'bg-white/5 border border-white/10'}`}>
              {seedResult.added > 0
                ? <span className="font-bold text-green-300">✓ נוספו {seedResult.added} הפקות חדשות מתוך {seedResult.total}</span>
                : <span className="opacity-60">כל {seedResult.total} ההפקות כבר קיימות</span>}
              {(seedResult.skippedNoise > 0 || seedResult.merged > 0) && (
                <span className="mr-2 opacity-50">
                  · {seedResult.skippedNoise > 0 && `${seedResult.skippedNoise} סוננו (רעש/אנשים)`}
                  {seedResult.skippedNoise > 0 && seedResult.merged > 0 && ' · '}
                  {seedResult.merged > 0 && `${seedResult.merged} מוזגו`}
                </span>
              )}
            </div>
          )}
        </div>

        {/* Wikipedia sync card */}
        <div className="mb-5 rounded-2xl border border-sky-500/20 bg-sky-500/[0.07] px-4 py-3">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div className="text-sm">
              <p className="font-bold text-sky-200">שלב 2 — הוסף נתוני ויקיפדיה</p>
              <p className="mt-0.5 text-xs opacity-60">
                מביא רשת שידור, ז׳אנר ולוגו מהאינפובוקס העברי · {wikiPending} ממתינות
              </p>
            </div>
            <button
              type="button"
              onClick={() => void handleWikiSync()}
              disabled={wikiSyncing || wikiPending === 0}
              className="inline-flex shrink-0 items-center gap-2 rounded-xl bg-sky-500 px-4 py-2 text-sm font-bold text-white transition hover:bg-sky-400 disabled:opacity-50"
            >
              {wikiSyncing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
              {wikiSyncing && wikiProgress
                ? `ממשיך (נשארו ${wikiProgress.remaining})...`
                : 'הוסף נתוני ויקיפדיה'}
            </button>
          </div>
          {wikiProgress && wikiProgress.remaining !== Infinity && (
            <div className="mt-2 rounded-lg border border-sky-400/20 bg-sky-500/10 px-3 py-2 text-xs">
              {wikiProgress.remaining === 0
                ? <span className="font-bold text-green-300">✓ הסתיים · {wikiProgress.enriched} הפקות הועשרו</span>
                : <span className="opacity-70">עובד... {wikiProgress.enriched} הועשרו · {wikiProgress.remaining} נשארו</span>}
            </div>
          )}
        </div>

        {error && (
          <div className="mb-4 rounded-xl border border-red-400/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">{error}</div>
        )}

        {/* Edit form */}
        {showForm && (
          <div className="mb-6 rounded-2xl border border-white/15 bg-white/[0.06] p-5">
            <h2 className="mb-4 text-base font-black">{editingId ? 'עריכת תוכנית' : 'תוכנית חדשה'}</h2>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-xs font-bold opacity-60">שם התוכנית *</label>
                <input
                  value={form.showName}
                  onChange={(e) => setForm((f) => ({ ...f, showName: e.target.value }))}
                  className="w-full rounded-xl border border-white/15 bg-white/8 px-3 py-2 text-sm text-white placeholder-white/30"
                  placeholder="למשל: גלית ואילנית"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-bold opacity-60">רשת שידור</label>
                <input
                  value={form.network}
                  onChange={(e) => setForm((f) => ({ ...f, network: e.target.value }))}
                  className="w-full rounded-xl border border-white/15 bg-white/8 px-3 py-2 text-sm text-white placeholder-white/30"
                  placeholder="למשל: קשת 12"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-bold opacity-60">ז׳אנר</label>
                <input
                  value={form.genre}
                  onChange={(e) => setForm((f) => ({ ...f, genre: e.target.value }))}
                  className="w-full rounded-xl border border-white/15 bg-white/8 px-3 py-2 text-sm text-white placeholder-white/30"
                  placeholder="למשל: דרמה"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-bold opacity-60">חברת הפקה</label>
                <input
                  value={form.productionCompany}
                  onChange={(e) => setForm((f) => ({ ...f, productionCompany: e.target.value }))}
                  className="w-full rounded-xl border border-white/15 bg-white/8 px-3 py-2 text-sm text-white placeholder-white/30"
                  placeholder="למשל: דורון טוכמאיר הפקות"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-bold opacity-60">URL לוגו</label>
                <input
                  value={form.logoUrl}
                  onChange={(e) => setForm((f) => ({ ...f, logoUrl: e.target.value }))}
                  className="w-full rounded-xl border border-white/15 bg-white/8 px-3 py-2 text-sm text-white placeholder-white/30"
                  placeholder="https://..."
                  dir="ltr"
                />
              </div>
              <div className="sm:col-span-2">
                <label className="mb-1 block text-xs font-bold opacity-60">קישור ויקיפדיה</label>
                <input
                  value={form.wikiUrl}
                  onChange={(e) => setForm((f) => ({ ...f, wikiUrl: e.target.value }))}
                  className="w-full rounded-xl border border-white/15 bg-white/8 px-3 py-2 text-sm text-white placeholder-white/30"
                  placeholder="https://he.wikipedia.org/wiki/..."
                  dir="ltr"
                />
              </div>
            </div>
            <div className="mt-4 flex gap-2">
              <button
                type="button"
                onClick={() => void handleSave()}
                disabled={busy || !form.showName.trim()}
                className="inline-flex items-center gap-2 rounded-xl bg-violet-500 px-4 py-2 text-sm font-bold text-white transition hover:bg-violet-400 disabled:opacity-50"
              >
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                שמור
              </button>
              <button
                type="button"
                onClick={() => { setShowForm(false); setForm(emptyForm); setEditingId(null); }}
                className="inline-flex items-center gap-2 rounded-xl border border-white/15 px-4 py-2 text-sm font-bold opacity-70 transition hover:opacity-100"
              >
                <X className="h-4 w-4" />
                ביטול
              </button>
            </div>
          </div>
        )}

        {/* Controls */}
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="relative flex-1">
            <Search className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 opacity-40" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="w-full rounded-xl border border-white/10 bg-white/[0.04] py-2 pr-9 pl-3 text-sm placeholder-white/30"
              placeholder="חפש לפי שם או רשת..."
            />
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs opacity-50">{filtered.length} תוכניות</span>
            <button
              type="button"
              onClick={startAdd}
              className="inline-flex items-center gap-2 rounded-xl bg-white/10 px-3 py-2 text-sm font-bold transition hover:bg-white/15"
            >
              <Plus className="h-4 w-4" />
              הוסף ידנית
            </button>
          </div>
        </div>

        {/* Entry list */}
        {loading ? (
          <div className="space-y-2">
            {[1, 2, 3].map((n) => <div key={n} className="h-16 animate-pulse rounded-xl bg-white/8" />)}
          </div>
        ) : filtered.length === 0 ? (
          <div className="rounded-xl border border-dashed border-white/15 p-8 text-center text-sm opacity-50">
            {query ? 'לא נמצאו תוצאות לחיפוש' : 'אין תוכניות בספרייה עדיין — לחץ "סנכרן מהרג׳יסטרי" להתחיל'}
          </div>
        ) : (
          <div className="space-y-2">
            {filtered.map((entry) => (
              <div key={entry.id} className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/[0.04] px-4 py-3">
                {entry.logoUrl && entry.logoUrl !== 'none' ? (
                  <img src={entry.logoUrl} alt={entry.showName} className="h-10 w-10 shrink-0 rounded-lg object-contain bg-white/10" />
                ) : (
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-slate-700 text-slate-300">
                    <Film className="h-5 w-5" />
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-bold">{entry.showName}</span>
                    {entry.network && (
                      <span className="rounded-full bg-sky-500/15 px-2 py-0.5 text-[11px] font-medium text-sky-300">
                        {entry.network}
                      </span>
                    )}
                    {entry.genre && (
                      <span className="rounded-full bg-white/8 px-2 py-0.5 text-[11px] opacity-60">
                        {entry.genre}
                      </span>
                    )}
                    {entry.wikiTitleMatch === 'needs_review' && (
                      <span className="rounded-full bg-amber-500/20 px-2 py-0.5 text-[11px] font-medium text-amber-300" title="לוגו לא הוצג — כותרת ויקיפדיה לא תאמה בדיוק">
                        ⚠ אימות ידני
                      </span>
                    )}
                  </div>
                  <div className="mt-0.5 flex flex-wrap items-center gap-3">
                    {entry.productionCompany && (
                      <span className="text-xs opacity-50">{entry.productionCompany}</span>
                    )}
                    {entry.wikiUrl && entry.wikiUrl !== 'none' && (
                      <a
                        href={entry.wikiUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-1 text-xs text-violet-300 opacity-60 hover:opacity-100"
                      >
                        <ExternalLink className="h-3 w-3" />
                        ויקיפדיה
                      </a>
                    )}
                  </div>
                </div>
                <div className="flex shrink-0 gap-1">
                  {deleteConfirm === entry.id ? (
                    <>
                      <button type="button" onClick={() => void handleDelete(entry.id)} disabled={busy}
                        className="rounded-lg bg-red-500/20 px-2 py-1 text-xs font-bold text-red-200 transition hover:bg-red-500/30">
                        מחק
                      </button>
                      <button type="button" onClick={() => setDeleteConfirm(null)}
                        className="rounded-lg px-2 py-1 text-xs opacity-60 hover:opacity-100">
                        ביטול
                      </button>
                    </>
                  ) : (
                    <>
                      <button type="button" onClick={() => startEdit(entry)}
                        className="rounded-lg p-2 opacity-60 transition hover:bg-white/10 hover:opacity-100" aria-label="ערוך">
                        <Edit2 className="h-4 w-4" />
                      </button>
                      <button type="button" onClick={() => setDeleteConfirm(entry.id)}
                        className="rounded-lg p-2 text-red-300 opacity-60 transition hover:bg-red-500/10 hover:opacity-100" aria-label="מחק">
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
