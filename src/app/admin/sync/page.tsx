'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { collection, doc, getDocs, writeBatch } from 'firebase/firestore';
import { useAuth } from '@/contexts/AuthContext';
import { db } from '@/lib/firebase';
import {
  migratePdfContacts,
  type PdfMigrationResult,
} from '@/lib/migratePdfContacts';
import {
  previewProductionCrewSync,
  syncProductionCrew,
  type SyncResult,
} from '@/lib/syncProductionCrew';
import { inferDepartment, inferWorkArea } from '@/lib/contactsUtils';

const BATCH_LIMIT = 499;

async function fixDepartments(): Promise<{ updated: number; scanned: number }> {
  const snap = await getDocs(collection(db, 'contacts'));
  let updated = 0;
  let batch = writeBatch(db);
  let batchCount = 0;

  for (const contactDoc of snap.docs) {
    const data = contactDoc.data();
    const role = String(data.role || '');
    const currentDept = String(data.department || '');
    const currentWorkArea = data.workArea ? String(data.workArea) : null;
    const correctDept = inferDepartment(role);
    const correctWorkArea = inferWorkArea(role);

    if (currentDept !== correctDept || currentWorkArea !== correctWorkArea) {
      batch.update(doc(db, 'contacts', contactDoc.id), {
        department: correctDept,
        workArea: correctWorkArea,
      });
      updated++;
      batchCount++;

      if (batchCount >= BATCH_LIMIT) {
        await batch.commit();
        batch = writeBatch(db);
        batchCount = 0;
      }
    }
  }

  if (batchCount > 0) {
    await batch.commit();
  }

  return { updated, scanned: snap.size };
}

function Spinner() {
  return (
    <svg className="animate-spin w-5 h-5" viewBox="0 0 24 24" fill="none">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 0 1 8-8v8H4z" />
    </svg>
  );
}

export default function SyncPage() {
  const { user, profile } = useAuth();
  const [previewLoading, setPreviewLoading] = useState(true);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [previewResult, setPreviewResult] = useState<SyncResult | null>(null);

  const [syncStatus, setSyncStatus] = useState<'idle' | 'running' | 'done' | 'error'>('idle');
  const [syncResult, setSyncResult] = useState<SyncResult | null>(null);
  const [syncError, setSyncError] = useState<string | null>(null);

  const [deptStatus, setDeptStatus] = useState<'idle' | 'running' | 'done' | 'error'>('idle');
  const [deptResult, setDeptResult] = useState<{ updated: number; scanned: number } | null>(null);
  const [deptError, setDeptError] = useState<string | null>(null);

  const [pdfStatus, setPdfStatus] = useState<'idle' | 'running' | 'done' | 'error'>('idle');
  const [pdfResult, setPdfResult] = useState<PdfMigrationResult | null>(null);
  const [pdfError, setPdfError] = useState<string | null>(null);

  const [globalMigrateStatus, setGlobalMigrateStatus] = useState<'idle' | 'running' | 'done' | 'error'>('idle');
  const [globalMigrateResult, setGlobalMigrateResult] = useState<{ written: number; unique: number; errors: string[] } | null>(null);
  const [globalMigrateError, setGlobalMigrateError] = useState<string | null>(null);

  const [rebuildStatus, setRebuildStatus] = useState<'idle' | 'running' | 'done' | 'error'>('idle');
  const [rebuildResult, setRebuildResult] = useState<{
    users: { total: number; parsed: number; errors: number };
    productions: { unique: number; written: number; writeErrors: string[] };
    elapsed: number;
    userResults: Array<{ uid: string; workerName: string; status: string; productionCount?: number; error?: string }>;
    simulation: null | { phone: string; matchedProductions: Array<{ name: string; date: string; studio: string; startTime: string; endTime: string; crewCount: number }> };
  } | null>(null);
  const [rebuildError, setRebuildError] = useState<string | null>(null);
  const [rebuildSimPhone, setRebuildSimPhone] = useState('');

  useEffect(() => {
    if (!user || profile?.siteRole !== 'admin') {
      setPreviewLoading(false);
      return;
    }

    let cancelled = false;
    setPreviewLoading(true);
    setPreviewError(null);

    previewProductionCrewSync()
      .then((result) => {
        if (cancelled) return;
        setPreviewResult(result);
      })
      .catch((error) => {
        if (cancelled) return;
        setPreviewError(error instanceof Error ? error.message : 'שגיאה בטעינת תצוגת הסנכרון');
      })
      .finally(() => {
        if (!cancelled) {
          setPreviewLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [user, profile?.siteRole]);

  if (!user) {
    return <div className="p-8 text-center text-[var(--theme-text-secondary)]">יש להתחבר תחילה</div>;
  }

  if (profile && profile.siteRole !== 'admin') {
    return (
      <div className="p-8 text-center space-y-2" dir="rtl">
        <p className="text-red-400 font-bold">גישה מוגבלת למנהלים בלבד</p>
        <Link href="/" className="text-sm text-[var(--theme-accent)] hover:underline">חזרה לדף הבית</Link>
      </div>
    );
  }

  async function refreshPreview() {
    setPreviewLoading(true);
    setPreviewError(null);
    try {
      const result = await previewProductionCrewSync();
      setPreviewResult(result);
    } catch (error) {
      setPreviewError(error instanceof Error ? error.message : 'שגיאה בטעינת תצוגת הסנכרון');
    } finally {
      setPreviewLoading(false);
    }
  }

  async function handleSync() {
    setSyncStatus('running');
    setSyncError(null);
    try {
      const result = await syncProductionCrew();
      setSyncResult(result);
      setPreviewResult(result);
      setSyncStatus('done');
    } catch (error) {
      setSyncError(error instanceof Error ? error.message : 'שגיאה לא ידועה');
      setSyncStatus('error');
    }
  }

  async function handlePdfMigration() {
    setPdfStatus('running');
    setPdfError(null);
    try {
      const result = await migratePdfContacts(db);
      setPdfResult(result);
      setPdfStatus('done');
      await refreshPreview();
    } catch (error) {
      setPdfError(error instanceof Error ? error.message : 'שגיאה לא ידועה');
      setPdfStatus('error');
    }
  }

  async function handleFixDepts() {
    setDeptStatus('running');
    setDeptError(null);
    try {
      const result = await fixDepartments();
      setDeptResult(result);
      setDeptStatus('done');
    } catch (error) {
      setDeptError(error instanceof Error ? error.message : 'שגיאה לא ידועה');
      setDeptStatus('error');
    }
  }

  async function handleRebuild() {
    setRebuildStatus('running');
    setRebuildError(null);
    try {
      const token = await user!.getIdToken();
      const res = await fetch('/api/admin/productions/rebuild', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ simulatePhone: rebuildSimPhone.trim() || undefined }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
      setRebuildResult({
        users: {
          total: data.herzliya?.usersTotal ?? 0,
          parsed: data.herzliya?.usersParsed ?? 0,
          errors: data.herzliya?.usersError ?? 0,
        },
        productions: data.productions ?? { unique: 0, written: 0, writeErrors: [] },
        elapsed: data.elapsed ?? 0,
        userResults: data.herzliya?.userResults ?? [],
        simulation: data.simulation ?? null,
      });
      setRebuildStatus('done');
    } catch (error) {
      setRebuildError(error instanceof Error ? error.message : 'שגיאה לא ידועה');
      setRebuildStatus('error');
    }
  }

  async function handleGlobalMigrate() {
    setGlobalMigrateStatus('running');
    setGlobalMigrateError(null);
    try {
      const token = await user!.getIdToken();
      const res = await fetch('/api/admin/migrate-global-productions', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ dryRun: false }),
      });
      const data = await res.json() as { success?: boolean; written?: number; unique?: number; errors?: string[]; error?: string };
      if (!res.ok || !data.success) throw new Error(data.error ?? `HTTP ${res.status}`);
      setGlobalMigrateResult({ written: data.written ?? 0, unique: data.unique ?? 0, errors: data.errors ?? [] });
      setGlobalMigrateStatus('done');
    } catch (error) {
      setGlobalMigrateError(error instanceof Error ? error.message : 'שגיאה לא ידועה');
      setGlobalMigrateStatus('error');
    }
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-10 p-8" dir="rtl">
      <section className="w-full max-w-2xl flex flex-col gap-4">
        <h1 className="text-2xl font-bold">סנכרון אנשי צוות מהפקות</h1>
        <p className="text-sm text-[var(--theme-text-secondary)]">
          מקור האמת מחושב מכל לוחות ההפקה השמורים. כאן אפשר לראות את מצב ה-`contacts` הנוכחי,
          את הספירה הקנונית שחושבה מההפקות, ולהריץ backfill אידמפוטנטי.
        </p>

        {previewLoading && (
          <div className="flex items-center gap-3 text-blue-400">
            <Spinner />
            מחשב תמונת מצב קנונית מההפקות...
          </div>
        )}

        {previewError && (
          <div className="bg-red-900/30 border border-red-500/40 rounded-2xl p-6 text-red-400 text-center">
            <p className="font-bold">שגיאה בתצוגת הסנכרון</p>
            <p className="mt-1 text-sm">{previewError}</p>
            <button onClick={refreshPreview} className="mt-4 px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg text-sm">
              נסה שוב
            </button>
          </div>
        )}

        {previewResult && (
          <div className="rounded-2xl border p-6 space-y-4" style={{ background: 'var(--theme-bg-card)', borderColor: 'var(--theme-border)' }}>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-center">
              <div className="rounded-xl p-4" style={{ background: 'var(--theme-bg-secondary)' }}>
                <p className="text-xs text-[var(--theme-text-secondary)]">כעת ב-contacts</p>
                <p className="text-2xl font-bold text-[var(--theme-text)]">{previewResult.currentContacts}</p>
              </div>
              <div className="rounded-xl p-4" style={{ background: 'var(--theme-bg-secondary)' }}>
                <p className="text-xs text-[var(--theme-text-secondary)]">ספירה קנונית</p>
                <p className="text-2xl font-bold text-cyan-300">{previewResult.canonicalContacts}</p>
              </div>
              <div className="rounded-xl p-4" style={{ background: 'var(--theme-bg-secondary)' }}>
                <p className="text-xs text-[var(--theme-text-secondary)]">חסר להשלמה</p>
                <p className="text-2xl font-bold text-amber-300">{previewResult.diff}</p>
              </div>
              <div className="rounded-xl p-4" style={{ background: 'var(--theme-bg-secondary)' }}>
                <p className="text-xs text-[var(--theme-text-secondary)]">רשומות חלקיות</p>
                <p className="text-2xl font-bold text-purple-300">{previewResult.partialWithoutPhone}</p>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-sm">
              <div className="rounded-xl p-4" style={{ background: 'var(--theme-bg-secondary)' }}>
                <p className="text-[var(--theme-text-secondary)]">הפקות שנסרקו</p>
                <p className="text-lg font-semibold text-[var(--theme-text)]">{previewResult.scannedProductions}</p>
              </div>
              <div className="rounded-xl p-4" style={{ background: 'var(--theme-bg-secondary)' }}>
                <p className="text-[var(--theme-text-secondary)]">אנשי צוות ייחודיים</p>
                <p className="text-lg font-semibold text-[var(--theme-text)]">{previewResult.crewFound}</p>
              </div>
              <div className="rounded-xl p-4" style={{ background: 'var(--theme-bg-secondary)' }}>
                <p className="text-[var(--theme-text-secondary)]">דולגו כקיימים</p>
                <p className="text-lg font-semibold text-[var(--theme-text)]">{previewResult.skipped}</p>
              </div>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-center">
              <div className="rounded-xl p-4" style={{ background: 'var(--theme-bg-secondary)' }}>
                <p className="text-xs text-[var(--theme-text-secondary)]">תפקידים שישוחזרו</p>
                <p className="text-2xl font-bold text-emerald-300">{previewResult.recoveredRoles ?? 0}</p>
              </div>
              <div className="rounded-xl p-4" style={{ background: 'var(--theme-bg-secondary)' }}>
                <p className="text-xs text-[var(--theme-text-secondary)]">רעש שסונן</p>
                <p className="text-2xl font-bold text-slate-300">{previewResult.ignoredNoiseRoles ?? 0}</p>
              </div>
              <div className="rounded-xl p-4" style={{ background: 'var(--theme-bg-secondary)' }}>
                <p className="text-xs text-[var(--theme-text-secondary)]">Custom</p>
                <p className="text-2xl font-bold text-amber-300">{previewResult.customRoles ?? 0}</p>
              </div>
              <div className="rounded-xl p-4" style={{ background: 'var(--theme-bg-secondary)' }}>
                <p className="text-xs text-[var(--theme-text-secondary)]">משתמשים לעדכון</p>
                <p className="text-2xl font-bold text-cyan-300">{previewResult.usersToUpdate ?? 0}</p>
              </div>
            </div>

            {(previewResult.sampleRecoveredRoles?.length ?? 0) > 0 && (
              <div className="rounded-xl border p-4" style={{ background: 'var(--theme-bg-secondary)', borderColor: 'var(--theme-border)' }}>
                <p className="font-semibold text-[var(--theme-text)] mb-3">תפקידי לוחות עבודה שיוספו לפרופילים</p>
                <div className="space-y-2 text-sm">
                  {previewResult.sampleRecoveredRoles?.map((entry) => (
                    <div key={`${entry.name}-${entry.phone || 'no-phone'}-${entry.addedRoles.join('-')}`} className="flex items-center justify-between gap-3 border-b border-[var(--theme-border)] pb-2 last:border-b-0 last:pb-0">
                      <p className="text-[var(--theme-text)] font-medium">{entry.name}</p>
                      <p className="text-emerald-300">{entry.addedRoles.join(', ')}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {previewResult.sampleMissing.length > 0 && (
              <div className="rounded-xl border p-4" style={{ background: 'var(--theme-bg-secondary)', borderColor: 'var(--theme-border)' }}>
                <p className="font-semibold text-[var(--theme-text)] mb-3">דוגמה לרשומות שיתווספו/ישודרגו</p>
                <div className="space-y-2 text-sm">
                  {previewResult.sampleMissing.map((entry) => (
                    <div key={`${entry.name}-${entry.phone || 'no-phone'}`} className="flex items-center justify-between gap-3 border-b border-[var(--theme-border)] pb-2 last:border-b-0 last:pb-0">
                      <div>
                        <p className="text-[var(--theme-text)] font-medium">{entry.name}</p>
                        <p className="text-[var(--theme-text-secondary)]">{entry.role || 'ללא תפקיד'}</p>
                      </div>
                      <span className="text-[var(--theme-text-secondary)]" dir="ltr">{entry.phone || 'ללא טלפון'}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {syncStatus === 'idle' && (
              <div className="flex flex-wrap gap-3">
                <button onClick={handleSync} className="px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-semibold transition-colors">
                  הרץ backfill קנוני
                </button>
                <button onClick={refreshPreview} className="px-6 py-3 bg-slate-700 hover:bg-slate-600 text-white rounded-xl font-semibold transition-colors">
                  רענן תצוגה
                </button>
              </div>
            )}

            {syncStatus === 'running' && (
              <div className="flex items-center gap-3 text-blue-400">
                <Spinner />
                מריץ reconciliation על כל ההפקות ושומר ל-contacts...
              </div>
            )}

            {syncStatus === 'done' && syncResult && (
              <div className="bg-green-900/30 border border-green-500/40 rounded-2xl p-6 text-center space-y-2">
                <p className="text-green-400 text-lg font-bold">ה-backfill הושלם בהצלחה</p>
                <p className="text-gray-300">נוספו: <strong>{syncResult.created}</strong></p>
                <p className="text-gray-300">שודרגו: <strong>{syncResult.updated}</strong></p>
                <p className="text-gray-300">אנשי צוות קנוניים: <strong>{syncResult.crewFound}</strong></p>
                <button onClick={() => { setSyncStatus('idle'); void refreshPreview(); }} className="mt-4 px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg text-sm">
                  חזור לתצוגה
                </button>
              </div>
            )}

            {syncStatus === 'error' && (
              <div className="bg-red-900/30 border border-red-500/40 rounded-2xl p-6 text-red-400 text-center">
                <p className="font-bold">שגיאה בסנכרון</p>
                <p className="mt-1 text-sm">{syncError}</p>
                <button onClick={() => setSyncStatus('idle')} className="mt-4 px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg text-sm">
                  נסה שוב
                </button>
              </div>
            )}
          </div>
        )}
      </section>

      <hr className="w-full max-w-2xl border-gray-700" />

      <section className="w-full max-w-md flex flex-col items-center gap-4">
        <h2 className="text-xl font-bold">טעינת 187 אנשי קשר מהאלפון</h2>
        <p className="text-sm text-gray-400 text-center">
          מייבא את אנשי הקשר הקנוניים של האלפון. הפעולה אידמפוטנטית וכפילויות מדולגות.
        </p>

        {pdfStatus === 'idle' && (
          <button onClick={handlePdfMigration} className="px-6 py-3 bg-purple-600 hover:bg-purple-700 text-white rounded-xl font-semibold transition-colors">
            טען אנשי קשר מהאלפון
          </button>
        )}
        {pdfStatus === 'running' && (
          <div className="flex items-center gap-3 text-purple-400"><Spinner />מייבא אנשי קשר...</div>
        )}
        {pdfStatus === 'done' && pdfResult && (
          <div className="bg-green-900/30 border border-green-500/40 rounded-2xl p-6 text-center space-y-2 w-full">
            <p className="text-green-400 text-lg font-bold">ייבוא האלפון הושלם</p>
            <p className="text-gray-300">סה&quot;כ בקובץ: <strong>{pdfResult.total}</strong></p>
            <p className="text-green-300">נוספו: <strong>{pdfResult.added}</strong></p>
            <p className="text-gray-400">כפילויות שדולגו: <strong>{pdfResult.skipped}</strong></p>
          </div>
        )}
        {pdfStatus === 'error' && (
          <div className="bg-red-900/30 border border-red-500/40 rounded-2xl p-6 text-red-400 text-center w-full">
            <p className="font-bold">שגיאה בייבוא</p>
            <p className="mt-1 text-sm">{pdfError}</p>
            <button onClick={() => setPdfStatus('idle')} className="mt-4 px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg text-sm">
              נסה שוב
            </button>
          </div>
        )}
      </section>

      <hr className="w-full max-w-2xl border-gray-700" />

      <section className="w-full max-w-2xl flex flex-col gap-4">
        <h2 className="text-xl font-bold">סנכרון לוח הפקות גלובלי</h2>
        <p className="text-sm text-gray-400">
          מעתיק את כל ההפקות מהיומנים האישיים של המשתמשים לאוסף הגלובלי. הפעולה אידמפוטנטית — ניתן להריץ מספר פעמים בבטחה.
        </p>

        {globalMigrateStatus === 'idle' && (
          <button onClick={handleGlobalMigrate} className="self-start px-6 py-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-semibold transition-colors">
            העבר הפקות לגלובלי
          </button>
        )}
        {globalMigrateStatus === 'running' && (
          <div className="flex items-center gap-3 text-indigo-400"><Spinner />סורק ומעביר הפקות...</div>
        )}
        {globalMigrateStatus === 'done' && globalMigrateResult && (
          <div className="bg-green-900/30 border border-green-500/40 rounded-2xl p-6 space-y-2">
            <p className="text-green-400 text-lg font-bold">ההעברה הושלמה בהצלחה</p>
            <p className="text-gray-300">נמצאו ייחודיות: <strong>{globalMigrateResult.unique}</strong></p>
            <p className="text-gray-300">נכתבו לגלובלי: <strong>{globalMigrateResult.written}</strong></p>
            {globalMigrateResult.errors.length > 0 && (
              <div className="mt-2 text-red-400 text-sm">
                <p className="font-semibold">שגיאות ({globalMigrateResult.errors.length}):</p>
                {globalMigrateResult.errors.map((e, i) => <p key={i}>{e}</p>)}
              </div>
            )}
            <button onClick={() => setGlobalMigrateStatus('idle')} className="mt-2 px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg text-sm">
              הרץ שוב
            </button>
          </div>
        )}
        {globalMigrateStatus === 'error' && (
          <div className="bg-red-900/30 border border-red-500/40 rounded-2xl p-6 text-red-400">
            <p className="font-bold">שגיאה בהעברה</p>
            <p className="mt-1 text-sm">{globalMigrateError}</p>
            <button onClick={() => setGlobalMigrateStatus('idle')} className="mt-4 px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg text-sm">
              נסה שוב
            </button>
          </div>
        )}
      </section>

      <hr className="w-full max-w-2xl border-gray-700" />

      {/* Rebuild global_productions from all Herzliya URLs — REPLACE semantics (no stale crew accumulation) */}
      <section className="w-full max-w-2xl flex flex-col gap-4">
        <h2 className="text-xl font-bold">בנה מחדש הפקות גלובליות מהרצליה</h2>
        <p className="text-sm text-gray-400">
          שואב את לוחות ההרצליה מכל המשתמשים הפעילים (כולל הצג מחלקה ו-ShowCrew), ממזג את הנתונים לפי herzliyaId
          ו<strong>מחליף</strong> את הנתונים ב-Firestore — ללא צבירה של crew ישנה.
        </p>

        <div className="flex gap-2 items-center">
          <input
            type="text"
            value={rebuildSimPhone}
            onChange={e => setRebuildSimPhone(e.target.value)}
            placeholder="טלפון לסימולציה (אופציונלי, למשל 0501234567)"
            className="flex-1 px-4 py-2 rounded-xl border text-sm"
            style={{ background: 'var(--theme-bg-secondary)', borderColor: 'var(--theme-border)', color: 'var(--theme-text)' }}
            dir="ltr"
          />
        </div>

        {rebuildStatus === 'idle' && (
          <button onClick={handleRebuild} className="self-start px-6 py-3 bg-orange-600 hover:bg-orange-700 text-white rounded-xl font-semibold transition-colors">
            הפעל rebuild מהרצליה
          </button>
        )}
        {rebuildStatus === 'running' && (
          <div className="flex items-center gap-3 text-orange-400"><Spinner />שואב ומנתח לוחות הרצליה מכל המשתמשים...</div>
        )}
        {rebuildStatus === 'done' && rebuildResult && (
          <div className="rounded-2xl border p-6 space-y-4" style={{ background: 'var(--theme-bg-card)', borderColor: 'var(--theme-border)' }}>
            <p className="text-green-400 text-lg font-bold">הrebuild הושלם</p>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-center text-sm">
              <div className="rounded-xl p-3" style={{ background: 'var(--theme-bg-secondary)' }}>
                <p className="text-[var(--theme-text-secondary)]">משתמשים</p>
                <p className="text-xl font-bold">{rebuildResult.users.parsed}/{rebuildResult.users.total}</p>
              </div>
              <div className="rounded-xl p-3" style={{ background: 'var(--theme-bg-secondary)' }}>
                <p className="text-[var(--theme-text-secondary)]">הפקות ייחודיות</p>
                <p className="text-xl font-bold text-cyan-300">{rebuildResult.productions.unique}</p>
              </div>
              <div className="rounded-xl p-3" style={{ background: 'var(--theme-bg-secondary)' }}>
                <p className="text-[var(--theme-text-secondary)]">נכתבו</p>
                <p className="text-xl font-bold text-green-300">{rebuildResult.productions.written}</p>
              </div>
              <div className="rounded-xl p-3" style={{ background: 'var(--theme-bg-secondary)' }}>
                <p className="text-[var(--theme-text-secondary)]">זמן</p>
                <p className="text-xl font-bold">{(rebuildResult.elapsed / 1000).toFixed(1)}s</p>
              </div>
            </div>

            {rebuildResult.users.errors > 0 && (
              <div className="text-amber-400 text-sm">
                {rebuildResult.userResults.filter(r => r.status === 'error').map(r => (
                  <p key={r.uid}>{r.workerName}: {r.error}</p>
                ))}
              </div>
            )}

            <div className="space-y-1 text-sm">
              {rebuildResult.userResults.map(r => (
                <div key={r.uid} className="flex items-center justify-between gap-3 border-b pb-1" style={{ borderColor: 'var(--theme-border)' }}>
                  <span className="font-medium">{r.workerName}</span>
                  <span className={r.status === 'parsed' ? 'text-green-400' : r.status === 'error' ? 'text-red-400' : 'text-gray-400'}>
                    {r.status === 'parsed' ? `${r.productionCount} הפקות` : r.status}
                  </span>
                </div>
              ))}
            </div>

            {rebuildResult.simulation && (
              <div className="rounded-xl border p-4 space-y-2" style={{ background: 'var(--theme-bg-secondary)', borderColor: 'var(--theme-border)' }}>
                <p className="font-semibold">סימולציית משתמש — {rebuildResult.simulation.phone}</p>
                <p className="text-sm text-[var(--theme-text-secondary)]">{rebuildResult.simulation.matchedProductions.length} הפקות</p>
                {rebuildResult.simulation.matchedProductions.map(p => (
                  <div key={p.name + p.date} className="text-sm border-t pt-2" style={{ borderColor: 'var(--theme-border)' }}>
                    <p className="font-medium">{p.name} — {p.date} | {p.studio} | {p.startTime}-{p.endTime}</p>
                    <p className="text-[var(--theme-text-secondary)]">{p.crewCount} אנשי צוות</p>
                  </div>
                ))}
              </div>
            )}

            <button onClick={() => setRebuildStatus('idle')} className="px-4 py-2 bg-orange-600 hover:bg-orange-700 text-white rounded-lg text-sm">
              הרץ שוב
            </button>
          </div>
        )}
        {rebuildStatus === 'error' && (
          <div className="bg-red-900/30 border border-red-500/40 rounded-2xl p-6 text-red-400">
            <p className="font-bold">שגיאה בrebuild</p>
            <p className="mt-1 text-sm">{rebuildError}</p>
            <button onClick={() => setRebuildStatus('idle')} className="mt-4 px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg text-sm">
              נסה שוב
            </button>
          </div>
        )}
      </section>

      <hr className="w-full max-w-md border-gray-700" />

      <section className="w-full max-w-md flex flex-col items-center gap-4">
        <h2 className="text-xl font-bold">תיקון מחלקות</h2>
        <p className="text-sm text-gray-400 text-center">
          מתקן מחלקות שגויות לפי התפקיד הקנוני של איש הקשר.
        </p>

        {deptStatus === 'idle' && (
          <button onClick={handleFixDepts} className="px-6 py-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-semibold transition-colors">
            תקן מחלקות
          </button>
        )}
        {deptStatus === 'running' && (
          <div className="flex items-center gap-3 text-emerald-400"><Spinner />סורק וממפה מחדש מחלקות...</div>
        )}
        {deptStatus === 'done' && deptResult && (
          <div className="bg-green-900/30 border border-green-500/40 rounded-2xl p-6 text-center space-y-2 w-full">
            <p className="text-green-400 text-lg font-bold">תיקון המחלקות הושלם</p>
            <p className="text-gray-300">נסרקו: <strong>{deptResult.scanned}</strong></p>
            <p className="text-green-300">עודכנו: <strong>{deptResult.updated}</strong></p>
          </div>
        )}
        {deptStatus === 'error' && (
          <div className="bg-red-900/30 border border-red-500/40 rounded-2xl p-6 text-red-400 text-center w-full">
            <p className="font-bold">שגיאה</p>
            <p className="mt-1 text-sm">{deptError}</p>
            <button onClick={() => setDeptStatus('idle')} className="mt-4 px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg text-sm">
              נסה שוב
            </button>
          </div>
        )}
      </section>
    </div>
  );
}
