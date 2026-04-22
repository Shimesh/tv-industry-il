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
    return <div className="p-8 text-center text-gray-400">יש להתחבר תחילה</div>;
  }

  if (profile && profile.siteRole !== 'admin') {
    return (
      <div className="p-8 text-center space-y-2" dir="rtl">
        <p className="text-red-400 font-bold">גישה מוגבלת למנהלים בלבד</p>
        <Link href="/" className="text-sm text-purple-400 hover:underline">חזרה לדף הבית</Link>
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

  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-10 p-8" dir="rtl">
      <section className="w-full max-w-2xl flex flex-col gap-4">
        <h1 className="text-2xl font-bold">סנכרון אנשי צוות מהפקות</h1>
        <p className="text-sm text-gray-400">
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
          <div className="bg-slate-900/60 border border-slate-700 rounded-2xl p-6 space-y-4">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-center">
              <div className="rounded-xl bg-slate-800/60 p-4">
                <p className="text-xs text-slate-400">כעת ב-contacts</p>
                <p className="text-2xl font-bold text-white">{previewResult.currentContacts}</p>
              </div>
              <div className="rounded-xl bg-slate-800/60 p-4">
                <p className="text-xs text-slate-400">ספירה קנונית</p>
                <p className="text-2xl font-bold text-cyan-300">{previewResult.canonicalContacts}</p>
              </div>
              <div className="rounded-xl bg-slate-800/60 p-4">
                <p className="text-xs text-slate-400">חסר להשלמה</p>
                <p className="text-2xl font-bold text-amber-300">{previewResult.diff}</p>
              </div>
              <div className="rounded-xl bg-slate-800/60 p-4">
                <p className="text-xs text-slate-400">רשומות חלקיות</p>
                <p className="text-2xl font-bold text-purple-300">{previewResult.partialWithoutPhone}</p>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-sm">
              <div className="rounded-xl bg-slate-800/40 p-4">
                <p className="text-slate-400">הפקות שנסרקו</p>
                <p className="text-lg font-semibold text-white">{previewResult.scannedProductions}</p>
              </div>
              <div className="rounded-xl bg-slate-800/40 p-4">
                <p className="text-slate-400">אנשי צוות ייחודיים</p>
                <p className="text-lg font-semibold text-white">{previewResult.crewFound}</p>
              </div>
              <div className="rounded-xl bg-slate-800/40 p-4">
                <p className="text-slate-400">דולגו כקיימים</p>
                <p className="text-lg font-semibold text-white">{previewResult.skipped}</p>
              </div>
            </div>

            {previewResult.sampleMissing.length > 0 && (
              <div className="rounded-xl bg-slate-950/60 border border-slate-800 p-4">
                <p className="font-semibold text-white mb-3">דוגמה לרשומות שיתווספו/ישודרגו</p>
                <div className="space-y-2 text-sm">
                  {previewResult.sampleMissing.map((entry) => (
                    <div key={`${entry.name}-${entry.phone || 'no-phone'}`} className="flex items-center justify-between gap-3 border-b border-slate-800 pb-2 last:border-b-0 last:pb-0">
                      <div>
                        <p className="text-white font-medium">{entry.name}</p>
                        <p className="text-slate-400">{entry.role || 'ללא תפקיד'}</p>
                      </div>
                      <span className="text-slate-300" dir="ltr">{entry.phone || 'ללא טלפון'}</span>
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
            <p className="text-gray-300">סה"כ בקובץ: <strong>{pdfResult.total}</strong></p>
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
