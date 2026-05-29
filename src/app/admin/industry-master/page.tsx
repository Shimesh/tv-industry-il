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
  Edit2,
  ExternalLink,
  Globe,
  Link2,
  Loader2,
  Plus,
  RefreshCw,
  Search,
  Trash2,
  X,
} from 'lucide-react';

type ToastState = { type: 'ok' | 'err'; msg: string } | null;

type EditModalState = {
  open: boolean;
  id: string;
  masterName: string;
  channel: string;
  productionCompany: string;
  logoUrl: string;
  saving: boolean;
};

type AddModalState = {
  open: boolean;
  masterName: string;
  channel: string;
  productionCompany: string;
  logoUrl: string;
  saving: boolean;
};

type ReviewModalState = {
  open: boolean;
  entry: IndustryMasterEntry | null;
  confirming: boolean;
};

const EMPTY_ADD: AddModalState = { open: false, masterName: '', channel: '', productionCompany: '', logoUrl: '', saving: false };
const EMPTY_EDIT: EditModalState = { open: false, id: '', masterName: '', channel: '', productionCompany: '', logoUrl: '', saving: false };
const EMPTY_REVIEW: ReviewModalState = { open: false, entry: null, confirming: false };

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
  const [syncingProCards, setSyncingProCards] = useState(false);
  const [bulkWikiRunning, setBulkWikiRunning] = useState(false);
  const [bulkWikiForce, setBulkWikiForce] = useState(false);
  const [bulkWikiProgress, setBulkWikiProgress] = useState<{ processed: number; remaining: number } | null>(null);
  const [addModal, setAddModal] = useState<AddModalState>(EMPTY_ADD);
  const [editModal, setEditModal] = useState<EditModalState>(EMPTY_EDIT);
  const [reviewModal, setReviewModal] = useState<ReviewModalState>(EMPTY_REVIEW);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const bulkAbortRef = useRef(false);

  const showToast = (type: 'ok' | 'err', msg: string) => {
    setToast({ type, msg });
    setTimeout(() => setToast(null), 4500);
  };

  const authFetch = useCallback(async (url: string, init?: RequestInit): Promise<Response> => {
    if (!user) throw new Error('לא מחובר');
    const token = await user.getIdToken();
    return fetch(url, {
      ...init,
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        ...(init?.headers ?? {}),
      },
    });
  }, [user]);

  const loadEntries = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      const res = await authFetch('/api/admin/industry-master', { cache: 'no-store' } as RequestInit);
      if (!res.ok) {
        const err = await res.json().catch(() => ({})) as { error?: string };
        throw new Error(err.error || `שגיאה ${res.status}`);
      }
      const data: IndustryMasterEntry[] = await res.json();
      setEntries(data.sort((a, b) => (a.masterName ?? a.showName).localeCompare(b.masterName ?? b.showName, 'he')));
    } catch (e) {
      showToast('err', e instanceof Error ? e.message : 'שגיאה בטעינת נתונים');
    } finally {
      setLoading(false);
    }
  }, [user, authFetch]);

  useEffect(() => {
    if (!user || profile?.siteRole !== 'admin') {
      if (!user) router.replace('/');
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
      const res = await authFetch('/api/admin/industry-master/sync', { method: 'POST' });
      const data = await res.json() as { error?: string; added?: number; updated?: number; totalScanned?: number };
      if (!res.ok) throw new Error(data.error || 'שגיאה');
      showToast('ok', `סנכרון: ${data.added ?? 0} חדשים, ${data.updated ?? 0} עודכנו, ${data.totalScanned ?? 0} נסרקו`);
      await loadEntries();
    } catch (e) {
      showToast('err', e instanceof Error ? e.message : 'שגיאה בסנכרון');
    } finally {
      setSyncingSource(false);
    }
  };

  const handleSyncProCards = async () => {
    setSyncingProCards(true);
    try {
      const res = await authFetch('/api/admin/industry-master/sync/pro-cards', { method: 'POST' });
      const data = await res.json() as { error?: string; total?: number; matched?: number; unmatched?: number; skipped?: number };
      if (!res.ok) throw new Error(data.error || 'שגיאה');
      showToast('ok', `Pro Cards: ${data.matched ?? 0} קושרו, ${data.unmatched ?? 0} לא נמצאו, ${data.skipped ?? 0} כבר מקושרים`);
    } catch (e) {
      showToast('err', e instanceof Error ? e.message : 'שגיאה בקישור Pro Cards');
    } finally {
      setSyncingProCards(false);
    }
  };

  const handleWikiSingle = async (entry: IndustryMasterEntry) => {
    setWikiLoadingId(entry.id);
    try {
      const res = await authFetch(`/api/admin/industry-master/${entry.id}/wiki`, { method: 'POST' });
      const data = await res.json() as { error?: string } & Partial<IndustryMasterEntry>;
      if (!res.ok) throw new Error(data.error || 'שגיאה');
      setEntries((prev) => prev.map((e) => (e.id === entry.id ? { ...e, ...data } : e)));
      if (data.wikiTitleMatch === 'needs_review') {
        setReviewModal({ open: true, entry: { ...entry, ...data }, confirming: false });
      } else {
        showToast('ok', data.network ? `ערוץ: ${data.network}` : 'לא נמצא בוויקיפדיה');
      }
    } catch (e) {
      showToast('err', e instanceof Error ? e.message : 'שגיאה בוויקיפדיה');
    } finally {
      setWikiLoadingId(null);
    }
  };

  const handleBulkWiki = async (force = false) => {
    setBulkWikiRunning(true);
    setBulkWikiForce(force);
    bulkAbortRef.current = false;
    setBulkWikiProgress({ processed: 0, remaining: Infinity });
    // Record run-start timestamp so the route can skip already-processed entries in force mode,
    // preventing the infinite loop that occurs when force=true includes all entries every call.
    const since = new Date().toISOString();
    let totalProcessed = 0;
    try {
      while (!bulkAbortRef.current) {
        const res = await authFetch('/api/admin/industry-master/sync/wiki', {
          method: 'POST',
          body: JSON.stringify({ force, ...(force ? { since } : {}) }),
        });
        const data = await res.json() as { error?: string; processed?: number; remaining?: number };
        if (!res.ok) throw new Error(data.error || 'שגיאה');
        totalProcessed += data.processed ?? 0;
        setBulkWikiProgress({ processed: totalProcessed, remaining: data.remaining ?? 0 });
        if ((data.remaining ?? 0) === 0 || (data.processed ?? 0) === 0) break;
      }
      showToast('ok', `ויקיפדיה הושלמה: ${totalProcessed} רשומות עודכנו`);
      await loadEntries();
    } catch (e) {
      showToast('err', e instanceof Error ? e.message : 'שגיאה בוויקיפדיה');
    } finally {
      setBulkWikiRunning(false);
      setBulkWikiForce(false);
      setBulkWikiProgress(null);
    }
  };

  const handleConfirmReview = async () => {
    if (!reviewModal.entry) return;
    setReviewModal((prev) => ({ ...prev, confirming: true }));
    try {
      await authFetch(`/api/admin/industry-master/${reviewModal.entry.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ wikiTitleMatch: 'ok', isVerified: true }),
      });
      const updatedEntry = { ...reviewModal.entry, wikiTitleMatch: 'ok', isVerified: true };
      setEntries((prev) => prev.map((e) => (e.id === updatedEntry.id ? updatedEntry : e)));
      showToast('ok', 'אומת בהצלחה');
      setReviewModal(EMPTY_REVIEW);
    } catch (e) {
      showToast('err', e instanceof Error ? e.message : 'שגיאה');
      setReviewModal((prev) => ({ ...prev, confirming: false }));
    }
  };

  const openEditModal = (entry: IndustryMasterEntry) => {
    setEditModal({
      open: true,
      id: entry.id,
      masterName: entry.masterName ?? entry.showName,
      channel: entry.network ?? '',
      productionCompany: entry.productionCompany ?? '',
      logoUrl: entry.logoUrl ?? '',
      saving: false,
    });
  };

  const handleEditSave = async () => {
    if (!editModal.masterName.trim()) return;
    setEditModal((prev) => ({ ...prev, saving: true }));
    try {
      const body = {
        masterName: editModal.masterName.trim(),
        network: editModal.channel.trim(),
        productionCompany: editModal.productionCompany.trim(),
        logoUrl: editModal.logoUrl.trim(),
      };
      const res = await authFetch(`/api/admin/industry-master/${editModal.id}`, {
        method: 'PATCH',
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error('שגיאה בשמירה');
      setEntries((prev) => prev.map((e) =>
        e.id === editModal.id
          ? { ...e, masterName: body.masterName, showName: body.masterName, network: body.network, productionCompany: body.productionCompany, logoUrl: body.logoUrl }
          : e,
      ));
      showToast('ok', 'נשמר');
      setEditModal(EMPTY_EDIT);
    } catch (e) {
      showToast('err', e instanceof Error ? e.message : 'שגיאה');
      setEditModal((prev) => ({ ...prev, saving: false }));
    }
  };

  const handleAddSave = async () => {
    const name = addModal.masterName.trim();
    if (!name) return;
    setAddModal((prev) => ({ ...prev, saving: true }));
    try {
      const body = { masterName: name, showName: name, network: addModal.channel.trim(), productionCompany: addModal.productionCompany.trim(), logoUrl: addModal.logoUrl.trim() };
      const res = await authFetch('/api/admin/industry-master', { method: 'POST', body: JSON.stringify(body) });
      if (!res.ok) throw new Error((await res.json().catch(() => ({})) as { error?: string }).error || 'שגיאה');
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
      const res = await authFetch(`/api/admin/industry-master/${entry.id}`, { method: 'DELETE' });
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
  const totalNeedsReview = entries.filter((e) => e.wikiTitleMatch === 'needs_review').length;

  if (!user || profile?.siteRole !== 'admin') return null;

  return (
    <div className="min-h-screen py-8" dir="rtl">
      <div className="max-w-7xl mx-auto px-4">

        {/* Header */}
        <div className="mb-6">
          <h1 className="text-2xl font-bold flex items-center gap-2" style={{ color: 'var(--theme-text)' }}>
            <BookOpen className="w-6 h-6" style={{ color: 'var(--theme-accent)' }} />
            מנהל הפקות מאוחד
          </h1>
          <p className="text-sm mt-1" style={{ color: 'var(--theme-text-secondary)' }}>
            מאגר מרכזי של שמות הפקות, ויקיפדיה ומיפוי לכרטיסי פרו
          </p>
        </div>

        {/* Stats bar */}
        <div className="grid grid-cols-4 gap-4 mb-6">
          {[
            { value: entries.length, label: 'סה"כ הפקות', color: 'var(--theme-text)' },
            { value: totalVerified, label: 'מאומתות', color: 'var(--theme-success, #22c55e)' },
            { value: totalNeedsReview, label: 'לבדיקה', color: 'var(--theme-warning, #f59e0b)' },
            { value: totalPendingWiki, label: 'ממתינות לויקי', color: 'var(--theme-info, #38bdf8)' },
          ].map(({ value, label, color }) => (
            <div
              key={label}
              className="rounded-xl p-4 border text-center"
              style={{ background: 'var(--theme-bg-card)', borderColor: 'var(--theme-border)' }}
            >
              <div className="text-2xl font-bold" style={{ color }}>{value}</div>
              <div className="text-xs mt-0.5" style={{ color: 'var(--theme-text-secondary)' }}>{label}</div>
            </div>
          ))}
        </div>

        {/* Action bar */}
        <div
          className="rounded-xl border p-4 mb-4 flex flex-wrap gap-3 items-center"
          style={{ background: 'var(--theme-bg-card)', borderColor: 'var(--theme-border)' }}
        >
          <div className="relative flex-1 min-w-48">
            <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: 'var(--theme-text-secondary)' }} />
            <input
              className="w-full pr-9 pl-3 py-2 text-sm rounded-lg border"
              style={{ background: 'var(--theme-bg-secondary)', borderColor: 'var(--theme-border)', color: 'var(--theme-text)' }}
              placeholder="חיפוש לפי שם, ערוץ, גרסאות..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          <button
            onClick={handleSyncSource}
            disabled={syncingSource}
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white rounded-lg disabled:opacity-60"
            style={{ background: 'var(--theme-accent)' }}
          >
            {syncingSource ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
            סנכרן מקורות
          </button>

          <button
            onClick={handleSyncProCards}
            disabled={syncingProCards}
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg disabled:opacity-60 border"
            style={{ background: 'rgba(34,197,94,0.12)', borderColor: 'rgba(34,197,94,0.3)', color: 'var(--theme-success, #22c55e)' }}
          >
            {syncingProCards ? <Loader2 className="w-4 h-4 animate-spin" /> : <Link2 className="w-4 h-4" />}
            סנכרן Pro Cards
          </button>

          <button
            onClick={() => setAddModal({ ...EMPTY_ADD, open: true })}
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg text-white"
            style={{ background: 'var(--theme-accent-secondary, var(--theme-accent))' }}
          >
            <Plus className="w-4 h-4" />
            הוסף ידנית
          </button>

          <button
            onClick={bulkWikiRunning ? () => { bulkAbortRef.current = true; } : () => handleBulkWiki(false)}
            disabled={bulkWikiRunning && bulkWikiForce}
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg border disabled:opacity-40"
            style={bulkWikiRunning && !bulkWikiForce
              ? { background: 'rgba(239,68,68,0.1)', borderColor: 'rgba(239,68,68,0.3)', color: '#f87171' }
              : { background: 'rgba(139,92,246,0.15)', borderColor: 'rgba(139,92,246,0.3)', color: '#c4b5fd' }
            }
          >
            {bulkWikiRunning && !bulkWikiForce ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                עצור ({bulkWikiProgress?.remaining === Infinity ? '...' : bulkWikiProgress?.remaining} נותרו)
              </>
            ) : (
              <><Globe className="w-4 h-4" />ויקיפדיה לכולם</>
            )}
          </button>

          <button
            onClick={bulkWikiRunning ? () => { bulkAbortRef.current = true; } : () => handleBulkWiki(true)}
            disabled={bulkWikiRunning && !bulkWikiForce}
            title="בודק מחדש גם ערכים שכבר עודכנו — מתקן לוגואים שגויים"
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg border disabled:opacity-40"
            style={bulkWikiRunning && bulkWikiForce
              ? { background: 'rgba(239,68,68,0.1)', borderColor: 'rgba(239,68,68,0.3)', color: '#f87171' }
              : { background: 'rgba(234,179,8,0.12)', borderColor: 'rgba(234,179,8,0.3)', color: '#fde047' }
            }
          >
            {bulkWikiRunning && bulkWikiForce ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                עצור ({bulkWikiProgress?.remaining === Infinity ? '...' : bulkWikiProgress?.remaining} נותרו)
              </>
            ) : (
              <><RefreshCw className="w-4 h-4" />ויקי מחדש לכולם</>
            )}
          </button>

          <button
            onClick={loadEntries}
            disabled={loading}
            className="flex items-center gap-2 px-3 py-2 text-sm rounded-lg border"
            style={{ borderColor: 'var(--theme-border)', color: 'var(--theme-text-secondary)' }}
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>

        {/* Bulk wiki progress bar */}
        {bulkWikiRunning && bulkWikiProgress && (
          <div
            className="mb-4 rounded-lg px-4 py-3 border"
            style={{ background: 'rgba(139,92,246,0.1)', borderColor: 'rgba(139,92,246,0.25)' }}
          >
            <div className="flex items-center justify-between text-sm mb-2" style={{ color: '#c4b5fd' }}>
              <span className="flex items-center gap-2">
                <Loader2 className="w-4 h-4 animate-spin" />
                {bulkWikiForce ? 'ויקי מחדש' : 'ויקיפדיה'}: {bulkWikiProgress.processed} הושלמו
                {bulkWikiProgress.remaining !== Infinity && `, ${bulkWikiProgress.remaining} נותרו`}
              </span>
              <span>
                {bulkWikiProgress.remaining !== Infinity && bulkWikiProgress.remaining + bulkWikiProgress.processed > 0
                  ? `${Math.round((bulkWikiProgress.processed / (bulkWikiProgress.processed + bulkWikiProgress.remaining)) * 100)}%`
                  : ''}
              </span>
            </div>
            {bulkWikiProgress.remaining !== Infinity && (
              <div className="w-full rounded-full overflow-hidden" style={{ background: 'rgba(139,92,246,0.2)', height: 4 }}>
                <div
                  className="h-full rounded-full transition-all"
                  style={{
                    background: '#a78bfa',
                    width: `${Math.round((bulkWikiProgress.processed / (bulkWikiProgress.processed + bulkWikiProgress.remaining)) * 100)}%`,
                  }}
                />
              </div>
            )}
          </div>
        )}

        {/* Table */}
        <div
          className="rounded-xl border overflow-hidden"
          style={{ background: 'var(--theme-bg-card)', borderColor: 'var(--theme-border)' }}
        >
          {loading ? (
            <div className="flex items-center justify-center py-16" style={{ color: 'var(--theme-text-secondary)' }}>
              <Loader2 className="w-8 h-8 animate-spin" />
            </div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-16 text-sm" style={{ color: 'var(--theme-text-secondary)' }}>
              {search ? 'לא נמצאו תוצאות לחיפוש' : 'אין נתונים — לחץ "סנכרן מקורות" להתחלה'}
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead style={{ background: 'var(--theme-bg-secondary)', borderBottom: '1px solid var(--theme-border)' }}>
                <tr>
                  <th className="w-8 px-3 py-3" />
                  <th className="px-4 py-3 text-right font-semibold" style={{ color: 'var(--theme-text-secondary)' }}>לוגו</th>
                  <th className="px-4 py-3 text-right font-semibold" style={{ color: 'var(--theme-text-secondary)' }}>שם מאסטר</th>
                  <th className="px-4 py-3 text-right font-semibold" style={{ color: 'var(--theme-text-secondary)' }}>ערוץ</th>
                  <th className="px-4 py-3 text-right font-semibold" style={{ color: 'var(--theme-text-secondary)' }}>חברת הפקה</th>
                  <th className="px-4 py-3 text-right font-semibold" style={{ color: 'var(--theme-text-secondary)' }}>סטטוס</th>
                  <th className="px-4 py-3 text-center font-semibold" style={{ color: 'var(--theme-text-secondary)' }}>גרסאות</th>
                  <th className="px-4 py-3 text-right font-semibold" style={{ color: 'var(--theme-text-secondary)' }}>פעולות</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((entry, idx) => {
                  const masterName = entry.masterName ?? entry.showName;
                  const isExp = expanded.has(entry.id);
                  const hasVariations = (entry.variations ?? []).length > 0;
                  const notLast = idx < filtered.length - 1;

                  return (
                    <>
                      <tr
                        key={entry.id}
                        style={notLast ? { borderBottom: '1px solid var(--theme-border)' } : {}}
                        onMouseEnter={(e) => { (e.currentTarget as HTMLTableRowElement).style.background = 'var(--theme-bg-secondary)'; }}
                        onMouseLeave={(e) => { (e.currentTarget as HTMLTableRowElement).style.background = ''; }}
                      >
                        <td className="px-3 py-3">
                          {hasVariations && (
                            <button onClick={() => toggleExpand(entry.id)} style={{ color: 'var(--theme-text-secondary)' }}>
                              {isExp ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                            </button>
                          )}
                        </td>

                        <td className="px-4 py-3">
                          {entry.logoUrl && entry.logoUrl !== 'none' ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={entry.logoUrl} alt={masterName} className="w-10 h-10 object-contain rounded"
                              onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                          ) : (
                            <div className="w-10 h-10 rounded flex items-center justify-center text-xs"
                              style={{ background: 'var(--theme-bg-secondary)', color: 'var(--theme-text-secondary)' }}>—</div>
                          )}
                        </td>

                        <td className="px-4 py-3 font-medium max-w-48" style={{ color: 'var(--theme-text)' }}>
                          <div className="truncate">{masterName}</div>
                        </td>

                        <td className="px-4 py-3 max-w-32" style={{ color: 'var(--theme-text-secondary)' }}>
                          <div className="truncate">{entry.network || '—'}</div>
                        </td>

                        <td className="px-4 py-3 max-w-40" style={{ color: 'var(--theme-text-secondary)' }}>
                          <div className="truncate">{entry.productionCompany || '—'}</div>
                        </td>

                        <td className="px-4 py-3">
                          {entry.isVerified ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border"
                              style={{ background: 'rgba(34,197,94,0.1)', borderColor: 'rgba(34,197,94,0.3)', color: 'var(--theme-success, #22c55e)' }}>
                              <CheckCircle2 className="w-3 h-3" />מאומת
                            </span>
                          ) : entry.wikiTitleMatch === 'needs_review' ? (
                            <button
                              onClick={() => setReviewModal({ open: true, entry, confirming: false })}
                              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border hover:opacity-80 cursor-pointer"
                              style={{ background: 'rgba(245,158,11,0.1)', borderColor: 'rgba(245,158,11,0.3)', color: 'var(--theme-warning, #f59e0b)' }}>
                              <Clock className="w-3 h-3" />לבדיקה
                            </button>
                          ) : entry.wikiUrl === 'none' ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs border"
                              style={{ background: 'var(--theme-bg-secondary)', borderColor: 'var(--theme-border)', color: 'var(--theme-text-secondary)' }}>
                              לא נמצא
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs border"
                              style={{ background: 'rgba(56,189,248,0.08)', borderColor: 'rgba(56,189,248,0.25)', color: 'var(--theme-info, #38bdf8)' }}>
                              טרם נבדק
                            </span>
                          )}
                        </td>

                        <td className="px-4 py-3 text-center">
                          {hasVariations ? (
                            <button className="font-medium hover:underline"
                              style={{ color: 'var(--theme-accent)' }}
                              onClick={() => toggleExpand(entry.id)}>
                              {entry.variations!.length}
                            </button>
                          ) : <span style={{ color: 'var(--theme-text-secondary)' }}>—</span>}
                        </td>

                        <td className="px-4 py-3">
                          <div className="flex items-center gap-1.5">
                            <button onClick={() => handleWikiSingle(entry)} disabled={wikiLoadingId === entry.id}
                              title="חפש בוויקיפדיה"
                              className="flex items-center gap-1 px-2 py-1 text-xs rounded border disabled:opacity-50"
                              style={{ background: 'rgba(139,92,246,0.1)', borderColor: 'rgba(139,92,246,0.25)', color: '#c4b5fd' }}>
                              {wikiLoadingId === entry.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <Globe className="w-3 h-3" />}
                              ויקי
                            </button>
                            <button onClick={() => openEditModal(entry)}
                              title="ערוך"
                              className="p-1 rounded hover:opacity-70"
                              style={{ color: 'var(--theme-text-secondary)' }}>
                              <Edit2 className="w-3.5 h-3.5" />
                            </button>
                            <button onClick={() => handleDelete(entry)} disabled={deletingId === entry.id}
                              title="מחק" className="p-1 rounded disabled:opacity-50 hover:opacity-70"
                              style={{ color: 'var(--theme-text-secondary)' }}>
                              {deletingId === entry.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                            </button>
                          </div>
                        </td>
                      </tr>

                      {isExp && hasVariations && (
                        <tr key={`${entry.id}-var`}
                          style={{ background: 'rgba(139,92,246,0.05)', borderBottom: '1px solid var(--theme-border)' }}>
                          <td />
                          <td colSpan={7} className="px-4 py-3">
                            <div className="text-xs font-semibold mb-2" style={{ color: 'var(--theme-accent)' }}>
                              גרסאות מקוריות ({entry.variations!.length})
                            </div>
                            <div className="flex flex-wrap gap-2">
                              {entry.variations!.map((v) => (
                                <span key={v} className="px-2 py-0.5 rounded-full text-xs border"
                                  style={{ background: 'var(--theme-bg-secondary)', borderColor: 'var(--theme-border)', color: 'var(--theme-text-secondary)' }}>
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

        <div className="mt-3 text-xs text-left" style={{ color: 'var(--theme-text-secondary)' }}>
          {filtered.length} מתוך {entries.length} רשומות
        </div>
      </div>

      {/* ── Review Modal ("לבדיקה") ── */}
      {reviewModal.open && reviewModal.entry && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.65)' }}>
          <div className="rounded-2xl shadow-2xl w-full max-w-lg p-6 border" dir="rtl"
            style={{ background: 'var(--theme-bg-card)', borderColor: 'var(--theme-border)' }}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold" style={{ color: 'var(--theme-text)' }}>בדיקת תוצאת ויקיפדיה</h2>
              <button onClick={() => setReviewModal(EMPTY_REVIEW)} style={{ color: 'var(--theme-text-secondary)' }}>
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3 mb-5">
              <div>
                <div className="text-xs font-medium mb-1" style={{ color: 'var(--theme-text-secondary)' }}>שם מאסטר</div>
                <div className="font-semibold" style={{ color: 'var(--theme-text)' }}>
                  {reviewModal.entry.masterName ?? reviewModal.entry.showName}
                </div>
              </div>

              {reviewModal.entry.wikiUrl && reviewModal.entry.wikiUrl !== 'none' && (
                <div>
                  <div className="text-xs font-medium mb-1" style={{ color: 'var(--theme-text-secondary)' }}>דף ויקיפדיה שנמצא</div>
                  <a
                    href={reviewModal.entry.wikiUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 text-sm hover:underline"
                    style={{ color: 'var(--theme-accent)' }}
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                    {reviewModal.entry.wikiUrl.replace('https://he.wikipedia.org/wiki/', '').replace(/_/g, ' ')}
                  </a>
                </div>
              )}

              {reviewModal.entry.network && (
                <div>
                  <div className="text-xs font-medium mb-1" style={{ color: 'var(--theme-text-secondary)' }}>ערוץ שנמצא</div>
                  <div style={{ color: 'var(--theme-text)' }}>{reviewModal.entry.network}</div>
                </div>
              )}

              {reviewModal.entry.logoUrl && reviewModal.entry.logoUrl !== 'none' && (
                <div>
                  <div className="text-xs font-medium mb-1" style={{ color: 'var(--theme-text-secondary)' }}>לוגו שנמצא</div>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={reviewModal.entry.logoUrl} alt="logo" className="h-12 object-contain rounded border"
                    style={{ borderColor: 'var(--theme-border)' }}
                    onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                </div>
              )}

              <div
                className="rounded-lg p-3 text-xs border"
                style={{ background: 'rgba(245,158,11,0.08)', borderColor: 'rgba(245,158,11,0.25)', color: 'var(--theme-warning, #f59e0b)' }}
              >
                הכותרת בוויקיפדיה אינה זהה לחלוטין לשם המאסטר. אשר אם הדף נכון, או פתח ויקיפדיה לחיפוש ידני.
              </div>
            </div>

            <div className="flex gap-3">
              <button
                onClick={handleConfirmReview}
                disabled={reviewModal.confirming}
                className="flex-1 py-2 rounded-lg text-sm font-medium disabled:opacity-50 flex items-center justify-center gap-2"
                style={{ background: 'rgba(34,197,94,0.15)', border: '1px solid rgba(34,197,94,0.3)', color: 'var(--theme-success, #22c55e)' }}
              >
                {reviewModal.confirming && <Loader2 className="w-4 h-4 animate-spin" />}
                <CheckCircle2 className="w-4 h-4" />
                אשר — הדף נכון
              </button>

              {reviewModal.entry.masterName && (
                <a
                  href={`https://he.wikipedia.org/w/index.php?search=${encodeURIComponent(reviewModal.entry.masterName ?? reviewModal.entry.showName)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex-1 py-2 rounded-lg text-sm font-medium border flex items-center justify-center gap-2"
                  style={{ background: 'var(--theme-bg-secondary)', borderColor: 'var(--theme-border)', color: 'var(--theme-text-secondary)' }}
                >
                  <ExternalLink className="w-4 h-4" />
                  חפש ידנית בוויקי
                </a>
              )}

              <button
                onClick={() => setReviewModal(EMPTY_REVIEW)}
                className="px-4 py-2 rounded-lg text-sm border"
                style={{ background: 'var(--theme-bg-secondary)', borderColor: 'var(--theme-border)', color: 'var(--theme-text-secondary)' }}
              >
                סגור
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Edit Modal ── */}
      {editModal.open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.65)' }}>
          <div className="rounded-2xl shadow-2xl w-full max-w-md p-6 border" dir="rtl"
            style={{ background: 'var(--theme-bg-card)', borderColor: 'var(--theme-border)' }}>
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-lg font-bold" style={{ color: 'var(--theme-text)' }}>עריכת רשומה</h2>
              <button onClick={() => setEditModal(EMPTY_EDIT)} style={{ color: 'var(--theme-text-secondary)' }}>
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="space-y-4">
              {([
                { label: 'שם מאסטר *', key: 'masterName', placeholder: 'לדוגמה: ארץ נהדרת' },
                { label: 'ערוץ', key: 'channel', placeholder: 'לדוגמה: קשת 12' },
                { label: 'חברת הפקה', key: 'productionCompany', placeholder: 'לדוגמה: דורון טוכמאיר הפקות' },
                { label: 'כתובת לוגו', key: 'logoUrl', placeholder: 'https://...' },
              ] as const).map(({ label, key, placeholder }) => (
                <div key={key}>
                  <label className="block text-sm font-medium mb-1" style={{ color: 'var(--theme-text-secondary)' }}>{label}</label>
                  <input
                    className="w-full px-3 py-2 border rounded-lg text-sm"
                    style={{ background: 'var(--theme-bg-secondary)', borderColor: 'var(--theme-border)', color: 'var(--theme-text)' }}
                    value={editModal[key] as string}
                    onChange={(e) => setEditModal((prev) => ({ ...prev, [key]: e.target.value }))}
                    placeholder={placeholder}
                  />
                </div>
              ))}
            </div>
            <div className="flex gap-3 mt-6">
              <button onClick={handleEditSave} disabled={!editModal.masterName.trim() || editModal.saving}
                className="flex-1 py-2 rounded-lg text-sm font-medium disabled:opacity-50 flex items-center justify-center gap-2 text-white"
                style={{ background: 'var(--theme-accent)' }}>
                {editModal.saving && <Loader2 className="w-4 h-4 animate-spin" />}
                שמור
              </button>
              <button onClick={() => setEditModal(EMPTY_EDIT)}
                className="flex-1 py-2 rounded-lg text-sm font-medium border"
                style={{ background: 'var(--theme-bg-secondary)', borderColor: 'var(--theme-border)', color: 'var(--theme-text-secondary)' }}>
                ביטול
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Add Manual Modal ── */}
      {addModal.open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.65)' }}>
          <div className="rounded-2xl shadow-2xl w-full max-w-md p-6 border" dir="rtl"
            style={{ background: 'var(--theme-bg-card)', borderColor: 'var(--theme-border)' }}>
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-lg font-bold" style={{ color: 'var(--theme-text)' }}>הוספה ידנית</h2>
              <button onClick={() => setAddModal(EMPTY_ADD)} style={{ color: 'var(--theme-text-secondary)' }}>
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="space-y-4">
              {([
                { label: 'שם מאסטר *', key: 'masterName', placeholder: 'לדוגמה: ארץ נהדרת' },
                { label: 'ערוץ', key: 'channel', placeholder: 'לדוגמה: קשת 12' },
                { label: 'חברת הפקה', key: 'productionCompany', placeholder: 'לדוגמה: דורון טוכמאיר הפקות' },
                { label: 'כתובת לוגו', key: 'logoUrl', placeholder: 'https://...' },
              ] as const).map(({ label, key, placeholder }) => (
                <div key={key}>
                  <label className="block text-sm font-medium mb-1" style={{ color: 'var(--theme-text-secondary)' }}>{label}</label>
                  <input
                    className="w-full px-3 py-2 border rounded-lg text-sm"
                    style={{ background: 'var(--theme-bg-secondary)', borderColor: 'var(--theme-border)', color: 'var(--theme-text)' }}
                    value={addModal[key] as string}
                    onChange={(e) => setAddModal((prev) => ({ ...prev, [key]: e.target.value }))}
                    placeholder={placeholder}
                  />
                </div>
              ))}
            </div>
            <div className="flex gap-3 mt-6">
              <button onClick={handleAddSave} disabled={!addModal.masterName.trim() || addModal.saving}
                className="flex-1 py-2 rounded-lg text-sm font-medium disabled:opacity-50 flex items-center justify-center gap-2 text-white"
                style={{ background: 'var(--theme-accent-secondary, var(--theme-accent))' }}>
                {addModal.saving && <Loader2 className="w-4 h-4 animate-spin" />}
                שמור
              </button>
              <button onClick={() => setAddModal(EMPTY_ADD)}
                className="flex-1 py-2 rounded-lg text-sm font-medium border"
                style={{ background: 'var(--theme-bg-secondary)', borderColor: 'var(--theme-border)', color: 'var(--theme-text-secondary)' }}>
                ביטול
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Toast */}
      {toast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 px-5 py-3 rounded-xl shadow-lg text-sm font-medium text-white"
          style={{ background: toast.type === 'ok' ? 'var(--theme-success, #22c55e)' : 'var(--theme-danger, #ef4444)' }}>
          {toast.msg}
        </div>
      )}
    </div>
  );
}
