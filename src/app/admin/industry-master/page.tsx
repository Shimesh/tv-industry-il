'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import type { IndustryMasterEntry } from '@/lib/proCardTypes';
import {
  BookOpen,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Clock,
  Globe,
  Loader2,
  Plus,
  RefreshCw,
  Search,
  Trash2,
  X,
} from 'lucide-react';

type ToastState = { type: 'ok' | 'err'; msg: string } | null;

type AddModalState = {
  open: boolean;
  masterName: string;
  channel: string;
  productionCompany: string;
  logoUrl: string;
  saving: boolean;
};

const EMPTY_ADD: AddModalState = {
  open: false,
  masterName: '',
  channel: '',
  productionCompany: '',
  logoUrl: '',
  saving: false,
};

export default function UnifiedIndustryMasterPage() {
  const { user, profile } = useAuth();
  const router = useRouter();

  const [entries, setEntries] = useState<IndustryMasterEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [toast, setToast] = useState<ToastState>(null);
  const [wikiLoadingId, setWikiLoadingId] = useState<string | null>(null);
  const [syncingSource, setSyncingSource] = useState(false);
  const [bulkWikiRunning, setBulkWikiRunning] = useState(false);
  const [bulkWikiProgress, setBulkWikiProgress] = useState<{ processed: number; remaining: number } | null>(null);
  const [addModal, setAddModal] = useState<AddModalState>(EMPTY_ADD);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const bulkAbortRef = useRef(false);

  const showToast = (type: 'ok' | 'err', msg: string) => {
    setToast({ type, msg });
    setTimeout(() => setToast(null), 4000);
  };

  const loadEntries = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/admin/industry-master', { cache: 'no-store' });
      if (!res.ok) throw new Error('שגיאה בטעינה');
      const data: IndustryMasterEntry[] = await res.json();
      setEntries(data.sort((a, b) => (a.masterName ?? a.showName).localeCompare(b.masterName ?? b.showName, 'he')));
    } catch {
      showToast('err', 'שגיאה בטעינת נתונים');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!user || profile?.siteRole !== 'admin') {
      router.replace('/');
      return;
    }
    loadEntries();
  }, [user, profile, router, loadEntries]);

  const toggleExpand = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleSyncSource = async () => {
    setSyncingSource(true);
    try {
      const res = await fetch('/api/admin/industry-master/sync', { method: 'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'שגיאה');
      showToast('ok', `סנכרון הושלם: ${data.added ?? 0} חדשים, ${data.updated ?? 0} עודכנו, ${data.totalScanned ?? 0} נסרקו`);
      await loadEntries();
    } catch (e) {
      showToast('err', e instanceof Error ? e.message : 'שגיאה בסנכרון');
    } finally {
      setSyncingSource(false);
    }
  };

  const handleWikiSingle = async (entry: IndustryMasterEntry) => {
    setWikiLoadingId(entry.id);
    try {
      const res = await fetch(`/api/admin/industry-master/${entry.id}/wiki`, { method: 'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'שגיאה');
      setEntries((prev) => prev.map((e) => (e.id === entry.id ? { ...e, ...data } : e)));
      showToast('ok', `עודכן: ${data.network ? `ערוץ: ${data.network}` : 'לא נמצא בוויקיפדיה'}`);
    } catch (e) {
      showToast('err', e instanceof Error ? e.message : 'שגיאה בוויקיפדיה');
    } finally {
      setWikiLoadingId(null);
    }
  };

  const handleBulkWiki = async () => {
    setBulkWikiRunning(true);
    bulkAbortRef.current = false;
    setBulkWikiProgress({ processed: 0, remaining: Infinity });
    let totalProcessed = 0;
    try {
      while (!bulkAbortRef.current) {
        const res = await fetch('/api/admin/industry-master/sync/wiki', { method: 'POST' });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'שגיאה');
        totalProcessed += data.processed ?? 0;
        setBulkWikiProgress({ processed: totalProcessed, remaining: data.remaining ?? 0 });
        if (data.remaining === 0 || data.processed === 0) break;
      }
      showToast('ok', `ויקיפדיה הושלמה: ${totalProcessed} רשומות עודכנו`);
      await loadEntries();
    } catch (e) {
      showToast('err', e instanceof Error ? e.message : 'שגיאה בוויקיפדיה');
    } finally {
      setBulkWikiRunning(false);
      setBulkWikiProgress(null);
    }
  };

  const handleAddSave = async () => {
    const name = addModal.masterName.trim();
    if (!name) return;
    setAddModal((prev) => ({ ...prev, saving: true }));
    try {
      const body: Partial<IndustryMasterEntry> = {
        masterName: name,
        showName: name,
        network: addModal.channel.trim(),
        productionCompany: addModal.productionCompany.trim(),
        logoUrl: addModal.logoUrl.trim(),
        genre: '',
        wikiUrl: '',
        variations: [],
        lastUpdated: new Date().toISOString(),
      };
      const res = await fetch('/api/admin/industry-master', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error('שגיאה בשמירה');
      showToast('ok', 'רשומה נוספה');
      setAddModal(EMPTY_ADD);
      await loadEntries();
    } catch (e) {
      showToast('err', e instanceof Error ? e.message : 'שגיאה');
      setAddModal((prev) => ({ ...prev, saving: false }));
    }
  };

  const handleDelete = async (entry: IndustryMasterEntry) => {
    if (!confirm(`למחוק את "${entry.masterName ?? entry.showName}"?`)) return;
    setDeletingId(entry.id);
    try {
      const res = await fetch(`/api/admin/industry-master/${entry.id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('שגיאה במחיקה');
      setEntries((prev) => prev.filter((e) => e.id !== entry.id));
      showToast('ok', 'נמחק');
    } catch (e) {
      showToast('err', e instanceof Error ? e.message : 'שגיאה');
    } finally {
      setDeletingId(null);
    }
  };

  const filtered = entries.filter((e) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    const name = (e.masterName ?? e.showName).toLowerCase();
    return (
      name.includes(q) ||
      (e.network ?? '').toLowerCase().includes(q) ||
      (e.productionCompany ?? '').toLowerCase().includes(q) ||
      (e.variations ?? []).some((v) => v.toLowerCase().includes(q))
    );
  });

  const totalVerified = entries.filter((e) => e.isVerified).length;
  const totalPendingWiki = entries.filter((e) => !e.isVerified && e.wikiUrl !== 'none').length;

  if (!user || profile?.siteRole !== 'admin') return null;

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 py-8" dir="rtl">
      <div className="max-w-7xl mx-auto px-4">

        {/* Header */}
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
            <BookOpen className="w-6 h-6 text-indigo-600" />
            מנהל הפקות מאוחד
          </h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            מאגר מרכזי של שמות הפקות ומיפוי לכרטיסי פרו
          </p>
        </div>

        {/* Stats bar */}
        <div className="grid grid-cols-3 gap-4 mb-6">
          <div className="bg-white dark:bg-gray-800 rounded-xl p-4 border border-gray-200 dark:border-gray-700 text-center">
            <div className="text-2xl font-bold text-gray-900 dark:text-white">{entries.length}</div>
            <div className="text-xs text-gray-500 dark:text-gray-400">סה&quot;כ הפקות מאסטר</div>
          </div>
          <div className="bg-white dark:bg-gray-800 rounded-xl p-4 border border-gray-200 dark:border-gray-700 text-center">
            <div className="text-2xl font-bold text-green-600">{totalVerified}</div>
            <div className="text-xs text-gray-500 dark:text-gray-400">מאומתות ויקיפדיה</div>
          </div>
          <div className="bg-white dark:bg-gray-800 rounded-xl p-4 border border-gray-200 dark:border-gray-700 text-center">
            <div className="text-2xl font-bold text-amber-500">{totalPendingWiki}</div>
            <div className="text-xs text-gray-500 dark:text-gray-400">ממתינות לוויקיפדיה</div>
          </div>
        </div>

        {/* Action bar */}
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4 mb-4 flex flex-wrap gap-3 items-center">
          <div className="relative flex-1 min-w-48">
            <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              className="w-full pr-9 pl-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-white"
              placeholder="חיפוש לפי שם, ערוץ, גרסאות..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          <button
            onClick={handleSyncSource}
            disabled={syncingSource}
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg disabled:opacity-60"
          >
            {syncingSource ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
            סנכרן מקורות
          </button>

          <button
            onClick={() => setAddModal({ ...EMPTY_ADD, open: true })}
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg"
          >
            <Plus className="w-4 h-4" />
            הוסף ידנית
          </button>

          <button
            onClick={bulkWikiRunning ? () => { bulkAbortRef.current = true; } : handleBulkWiki}
            className={`flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg ${
              bulkWikiRunning
                ? 'bg-red-100 text-red-700 hover:bg-red-200 dark:bg-red-900/30 dark:text-red-400'
                : 'bg-purple-600 hover:bg-purple-700 text-white'
            }`}
          >
            {bulkWikiRunning ? (
              <><Loader2 className="w-4 h-4 animate-spin" />עצור ({bulkWikiProgress?.remaining === Infinity ? '?' : bulkWikiProgress?.remaining} נותרו)</>
            ) : (
              <><Globe className="w-4 h-4" />הוסף ויקיפדיה לכולם</>
            )}
          </button>

          <button
            onClick={loadEntries}
            disabled={loading}
            className="flex items-center gap-2 px-3 py-2 text-sm text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>

        {/* Bulk wiki progress */}
        {bulkWikiRunning && bulkWikiProgress && (
          <div className="mb-4 bg-purple-50 dark:bg-purple-900/20 border border-purple-200 dark:border-purple-800 rounded-lg px-4 py-2 text-sm text-purple-700 dark:text-purple-300 flex items-center gap-2">
            <Loader2 className="w-4 h-4 animate-spin" />
            עיבוד ויקיפדיה: {bulkWikiProgress.processed} הושלמו,{' '}
            {bulkWikiProgress.remaining === Infinity ? '...' : bulkWikiProgress.remaining} נותרו
          </div>
        )}

        {/* Table */}
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
          {loading ? (
            <div className="flex items-center justify-center py-16 text-gray-400">
              <Loader2 className="w-8 h-8 animate-spin" />
            </div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-16 text-gray-400 text-sm">
              {search ? 'לא נמצאו תוצאות לחיפוש' : 'אין נתונים — לחץ "סנכרן מקורות" להתחלה'}
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-gray-50 dark:bg-gray-700 border-b border-gray-200 dark:border-gray-600">
                <tr>
                  <th className="w-8 px-3 py-3" />
                  <th className="px-4 py-3 text-right font-semibold text-gray-700 dark:text-gray-300">לוגו</th>
                  <th className="px-4 py-3 text-right font-semibold text-gray-700 dark:text-gray-300">שם מאסטר</th>
                  <th className="px-4 py-3 text-right font-semibold text-gray-700 dark:text-gray-300">ערוץ</th>
                  <th className="px-4 py-3 text-right font-semibold text-gray-700 dark:text-gray-300">חברת הפקה</th>
                  <th className="px-4 py-3 text-right font-semibold text-gray-700 dark:text-gray-300">סטטוס</th>
                  <th className="px-4 py-3 text-center font-semibold text-gray-700 dark:text-gray-300">גרסאות</th>
                  <th className="px-4 py-3 text-right font-semibold text-gray-700 dark:text-gray-300">פעולות</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                {filtered.map((entry) => {
                  const masterName = entry.masterName ?? entry.showName;
                  const isExp = expanded.has(entry.id);
                  const hasVariations = (entry.variations ?? []).length > 0;

                  return (
                    <>
                      <tr
                        key={entry.id}
                        className="hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors"
                      >
                        {/* Expand toggle */}
                        <td className="px-3 py-3">
                          {hasVariations && (
                            <button
                              onClick={() => toggleExpand(entry.id)}
                              className="text-gray-400 hover:text-indigo-600 transition-colors"
                            >
                              {isExp ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                            </button>
                          )}
                        </td>

                        {/* Logo */}
                        <td className="px-4 py-3">
                          {entry.logoUrl && entry.logoUrl !== 'none' ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={entry.logoUrl}
                              alt={masterName}
                              className="w-10 h-10 object-contain rounded"
                              onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                            />
                          ) : (
                            <div className="w-10 h-10 rounded bg-gray-100 dark:bg-gray-700 flex items-center justify-center text-gray-400 text-xs">
                              —
                            </div>
                          )}
                        </td>

                        {/* Master name */}
                        <td className="px-4 py-3 font-medium text-gray-900 dark:text-white max-w-48">
                          <div className="truncate">{masterName}</div>
                        </td>

                        {/* Channel */}
                        <td className="px-4 py-3 text-gray-600 dark:text-gray-300 max-w-32">
                          <div className="truncate">{entry.network || '—'}</div>
                        </td>

                        {/* Production company */}
                        <td className="px-4 py-3 text-gray-600 dark:text-gray-300 max-w-40">
                          <div className="truncate">{entry.productionCompany || '—'}</div>
                        </td>

                        {/* Status badge */}
                        <td className="px-4 py-3">
                          {entry.isVerified ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400">
                              <CheckCircle2 className="w-3 h-3" />
                              מאומת
                            </span>
                          ) : entry.wikiTitleMatch === 'needs_review' ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">
                              <Clock className="w-3 h-3" />
                              לבדיקה
                            </span>
                          ) : entry.wikiUrl === 'none' ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs bg-gray-100 text-gray-500 dark:bg-gray-700">
                              לא נמצא
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs bg-blue-50 text-blue-500 dark:bg-blue-900/20">
                              טרם נבדק
                            </span>
                          )}
                        </td>

                        {/* Variations count */}
                        <td className="px-4 py-3 text-gray-500 dark:text-gray-400 text-center">
                          {hasVariations ? (
                            <span
                              className="cursor-pointer text-indigo-600 dark:text-indigo-400 font-medium hover:underline"
                              onClick={() => toggleExpand(entry.id)}
                            >
                              {entry.variations!.length}
                            </span>
                          ) : '—'}
                        </td>

                        {/* Actions */}
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => handleWikiSingle(entry)}
                              disabled={wikiLoadingId === entry.id}
                              title="חפש בוויקיפדיה"
                              className="flex items-center gap-1 px-2 py-1 text-xs rounded bg-purple-50 text-purple-700 hover:bg-purple-100 dark:bg-purple-900/20 dark:text-purple-300 disabled:opacity-50"
                            >
                              {wikiLoadingId === entry.id ? (
                                <Loader2 className="w-3 h-3 animate-spin" />
                              ) : (
                                <Globe className="w-3 h-3" />
                              )}
                              ויקיפדיה
                            </button>
                            <button
                              onClick={() => handleDelete(entry)}
                              disabled={deletingId === entry.id}
                              title="מחק"
                              className="p-1 text-gray-400 hover:text-red-500 transition-colors disabled:opacity-50"
                            >
                              {deletingId === entry.id ? (
                                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                              ) : (
                                <Trash2 className="w-3.5 h-3.5" />
                              )}
                            </button>
                          </div>
                        </td>
                      </tr>

                      {/* Expanded variations row */}
                      {isExp && hasVariations && (
                        <tr key={`${entry.id}-var`} className="bg-indigo-50/40 dark:bg-indigo-900/10">
                          <td />
                          <td colSpan={7} className="px-4 py-3">
                            <div className="text-xs font-semibold text-indigo-600 dark:text-indigo-400 mb-2">
                              גרסאות מקוריות ({entry.variations!.length})
                            </div>
                            <div className="flex flex-wrap gap-2">
                              {entry.variations!.map((v) => (
                                <span
                                  key={v}
                                  className="px-2 py-0.5 rounded-full bg-white dark:bg-gray-700 border border-indigo-200 dark:border-indigo-800 text-xs text-gray-700 dark:text-gray-300"
                                >
                                  {v}
                                </span>
                              ))}
                            </div>
                          </td>
                        </tr>
                      )}
                    </>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        <div className="mt-3 text-xs text-gray-400 text-left">
          {filtered.length} מתוך {entries.length} רשומות
        </div>
      </div>

      {/* Add manually modal */}
      {addModal.open && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-md p-6" dir="rtl">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-lg font-bold text-gray-900 dark:text-white">הוספה ידנית</h2>
              <button onClick={() => setAddModal(EMPTY_ADD)} className="text-gray-400 hover:text-gray-600">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">שם מאסטר *</label>
                <input
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm"
                  value={addModal.masterName}
                  onChange={(e) => setAddModal((prev) => ({ ...prev, masterName: e.target.value }))}
                  placeholder="לדוגמה: ארץ נהדרת"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">ערוץ</label>
                <input
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm"
                  value={addModal.channel}
                  onChange={(e) => setAddModal((prev) => ({ ...prev, channel: e.target.value }))}
                  placeholder="לדוגמה: קשת 12"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">חברת הפקה</label>
                <input
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm"
                  value={addModal.productionCompany}
                  onChange={(e) => setAddModal((prev) => ({ ...prev, productionCompany: e.target.value }))}
                  placeholder="לדוגמה: דורון טוכמאיר הפקות"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">כתובת לוגו</label>
                <input
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm"
                  value={addModal.logoUrl}
                  onChange={(e) => setAddModal((prev) => ({ ...prev, logoUrl: e.target.value }))}
                  placeholder="https://..."
                />
              </div>
            </div>
            <div className="flex gap-3 mt-6">
              <button
                onClick={handleAddSave}
                disabled={!addModal.masterName.trim() || addModal.saving}
                className="flex-1 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-sm font-medium disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {addModal.saving && <Loader2 className="w-4 h-4 animate-spin" />}
                שמור
              </button>
              <button
                onClick={() => setAddModal(EMPTY_ADD)}
                className="flex-1 py-2 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg text-sm font-medium hover:bg-gray-200 dark:hover:bg-gray-600"
              >
                ביטול
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Toast */}
      {toast && (
        <div className={`fixed bottom-6 left-1/2 -translate-x-1/2 z-50 px-5 py-3 rounded-xl shadow-lg text-sm font-medium ${
          toast.type === 'ok' ? 'bg-green-600 text-white' : 'bg-red-600 text-white'
        }`}>
          {toast.msg}
        </div>
      )}
    </div>
  );
}
