'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowRight, Edit2, Film, Loader2, Plus, RefreshCw, Save, Star, Trash2, X } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import type { ProductionRegistryEntry } from '@/lib/proCardTypes';

type FormState = {
  name: string;
  logoUrl: string;
  channel: string;
  description: string;
  isMajor: boolean;
};

const emptyForm: FormState = { name: '', logoUrl: '', channel: '', description: '', isMajor: false };

export default function ProductionRegistryPage() {
  const { user } = useAuth();
  const [entries, setEntries] = useState<ProductionRegistryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<{ added: number; failed: number; skipped: number } | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);

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
      const data = await fetchWithAuth<{ entries: ProductionRegistryEntry[] }>('/api/admin/production-registry');
      setEntries(data.entries.sort((a, b) => a.name.localeCompare(b.name, 'he')));
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, [user]); // eslint-disable-line react-hooks/exhaustive-deps

  function startAdd() {
    setEditingId(null);
    setForm(emptyForm);
    setShowForm(true);
  }

  function startEdit(entry: ProductionRegistryEntry) {
    setEditingId(entry.id);
    setForm({ name: entry.name, logoUrl: entry.logoUrl, channel: entry.channel, description: entry.description ?? '', isMajor: entry.isMajor });
    setShowForm(true);
  }

  async function handleSave() {
    if (!form.name.trim()) return;
    setBusy(true);
    setError(null);
    try {
      if (editingId) {
        await fetchWithAuth(`/api/admin/production-registry/${editingId}`, { method: 'PATCH', body: JSON.stringify(form) });
      } else {
        await fetchWithAuth('/api/admin/production-registry', { method: 'POST', body: JSON.stringify(form) });
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

  async function handleSync() {
    setSyncing(true);
    setSyncResult(null);
    setError(null);
    try {
      const data = await fetchWithAuth<{ added: number; failed: number; skipped: number }>(
        '/api/admin/production-registry/sync',
        { method: 'POST' },
      );
      setSyncResult(data);
      await load();
    } catch (err) {
      setError(String(err));
    } finally {
      setSyncing(false);
    }
  }

  async function handleDelete(id: string) {
    setBusy(true);
    setError(null);
    try {
      await fetchWithAuth(`/api/admin/production-registry/${id}`, { method: 'DELETE' });
      setDeleteConfirm(null);
      await load();
    } catch (err) {
      setError(String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen p-4 sm:p-6" dir="rtl" style={{ background: 'var(--theme-bg)', color: 'var(--theme-text)' }}>
      <div className="mx-auto max-w-3xl">
        <div className="mb-6 flex items-center gap-3">
          <Link href="/admin" className="flex items-center gap-1 text-sm opacity-60 hover:opacity-100">
            <ArrowRight className="h-4 w-4" />
            אדמין
          </Link>
          <span className="opacity-30">/</span>
          <h1 className="flex items-center gap-2 text-xl font-black">
            <Film className="h-5 w-5 text-sky-300" />
            קטלוג הפקות
          </h1>
        </div>

        <div className="mb-5 rounded-2xl border border-sky-500/20 bg-sky-500/[0.07] px-4 py-3">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div className="text-sm">
              <p className="font-bold text-sky-200">סנכרון אוטומטי מהיומן</p>
              <p className="mt-0.5 text-xs opacity-60">מסנן כותרות מהיומן ולוח העבודה, מפצל לפי +, ומחפש לוגואים בוויקיפדיה העברית</p>
            </div>
            <button
              type="button"
              onClick={() => void handleSync()}
              disabled={syncing}
              className="inline-flex shrink-0 items-center gap-2 rounded-xl bg-sky-500 px-4 py-2 text-sm font-bold text-white transition hover:bg-sky-400 disabled:opacity-50"
            >
              {syncing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
              {syncing ? 'מסנכרן...' : 'סנכרן הפקות מהיומן'}
            </button>
          </div>
          {syncResult && (
            <div className="mt-2 text-xs">
              {syncResult.added > 0
                ? <span className="text-green-300">נוספו {syncResult.added} הפקות חדשות</span>
                : <span className="opacity-60">לא נמצאו הפקות חדשות</span>}
              {syncResult.failed > 0 && <span className="ml-2 text-orange-300"> · {syncResult.failed} נכשלו</span>}
              <span className="opacity-40"> · {syncResult.skipped} קיימות</span>
            </div>
          )}
        </div>

        {error && (
          <div className="mb-4 rounded-xl border border-red-400/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">{error}</div>
        )}

        {showForm && (
          <div className="mb-6 rounded-2xl border border-white/15 bg-white/[0.06] p-5">
            <h2 className="mb-4 text-base font-black">{editingId ? 'עריכת הפקה' : 'הפקה חדשה'}</h2>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-xs font-bold opacity-60">שם הפקה *</label>
                <input
                  value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                  className="w-full rounded-xl border border-white/15 bg-white/8 px-3 py-2 text-sm text-white placeholder-white/30"
                  placeholder="למשל: ארץ נהדרת"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-bold opacity-60">ערוץ</label>
                <input
                  value={form.channel}
                  onChange={(e) => setForm((f) => ({ ...f, channel: e.target.value }))}
                  className="w-full rounded-xl border border-white/15 bg-white/8 px-3 py-2 text-sm text-white placeholder-white/30"
                  placeholder="למשל: כאן 11"
                />
              </div>
              <div className="sm:col-span-2">
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
                <label className="mb-1 block text-xs font-bold opacity-60">תיאור</label>
                <input
                  value={form.description}
                  onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                  className="w-full rounded-xl border border-white/15 bg-white/8 px-3 py-2 text-sm text-white placeholder-white/30"
                  placeholder="תיאור קצר"
                />
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="isMajor"
                  checked={form.isMajor}
                  onChange={(e) => setForm((f) => ({ ...f, isMajor: e.target.checked }))}
                  className="h-4 w-4 accent-amber-400"
                />
                <label htmlFor="isMajor" className="flex items-center gap-1.5 text-sm font-bold">
                  <Star className="h-3.5 w-3.5 text-amber-300" />
                  הפקה מרכזית
                </label>
              </div>
            </div>
            <div className="mt-4 flex gap-2">
              <button
                type="button"
                onClick={() => void handleSave()}
                disabled={busy || !form.name.trim()}
                className="inline-flex items-center gap-2 rounded-xl bg-sky-500 px-4 py-2 text-sm font-bold text-white transition hover:bg-sky-400 disabled:opacity-50"
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

        <div className="mb-4 flex items-center justify-between">
          <span className="text-sm opacity-60">{entries.length} הפקות ברשימה</span>
          <button
            type="button"
            onClick={startAdd}
            className="inline-flex items-center gap-2 rounded-xl bg-white/10 px-3 py-2 text-sm font-bold transition hover:bg-white/15"
          >
            <Plus className="h-4 w-4" />
            הוסף הפקה
          </button>
        </div>

        {loading ? (
          <div className="space-y-2">
            {[1, 2, 3].map((n) => <div key={n} className="h-16 animate-pulse rounded-xl bg-white/8" />)}
          </div>
        ) : entries.length === 0 ? (
          <div className="rounded-xl border border-dashed border-white/15 p-8 text-center text-sm opacity-50">
            אין הפקות בקטלוג עדיין
          </div>
        ) : (
          <div className="space-y-2">
            {entries.map((entry) => (
              <div key={entry.id} className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/[0.04] px-4 py-3">
                {entry.logoUrl ? (
                  <img src={entry.logoUrl} alt={entry.name} className="h-10 w-10 rounded-lg object-contain bg-white/10" />
                ) : (
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-slate-700 text-slate-300">
                    <Film className="h-5 w-5" />
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-bold">{entry.name}</span>
                    {entry.isMajor && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-amber-300/12 px-2 py-0.5 text-[11px] font-bold text-amber-200">
                        <Star className="h-3 w-3" />
                        מרכזית
                      </span>
                    )}
                  </div>
                  {entry.channel && <div className="text-xs opacity-50">{entry.channel}</div>}
                </div>
                <div className="flex shrink-0 gap-1">
                  {deleteConfirm === entry.id ? (
                    <>
                      <button
                        type="button"
                        onClick={() => void handleDelete(entry.id)}
                        disabled={busy}
                        className="rounded-lg bg-red-500/20 px-2 py-1 text-xs font-bold text-red-200 transition hover:bg-red-500/30"
                      >
                        מחק
                      </button>
                      <button
                        type="button"
                        onClick={() => setDeleteConfirm(null)}
                        className="rounded-lg px-2 py-1 text-xs opacity-60 hover:opacity-100"
                      >
                        ביטול
                      </button>
                    </>
                  ) : (
                    <>
                      <button
                        type="button"
                        onClick={() => startEdit(entry)}
                        className="rounded-lg p-2 opacity-60 transition hover:bg-white/10 hover:opacity-100"
                        aria-label="ערוך"
                      >
                        <Edit2 className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => setDeleteConfirm(entry.id)}
                        className="rounded-lg p-2 text-red-300 opacity-60 transition hover:bg-red-500/10 hover:opacity-100"
                        aria-label="מחק"
                      >
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
