'use client';

import { useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { syncProductionCrew, type SyncResult } from '@/lib/syncProductionCrew';
import { migratePdfContacts, type PdfMigrationResult } from '@/lib/migratePdfContacts';
import Link from 'next/link';
import { collection, getDocs, writeBatch, doc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { inferDepartment } from '@/lib/contactsUtils';

const BATCH_LIMIT = 499;

async function fixDepartments(): Promise<{ updated: number; scanned: number }> {
  const snap = await getDocs(collection(db, 'contacts'));
  let updated = 0;
  let batch = writeBatch(db);
  let batchCount = 0;

  for (const d of snap.docs) {
    const data = d.data();
    const role: string = data.role || '';
    const currentDept: string = data.department || '';
    const correctDept = inferDepartment(role);

    if (currentDept !== correctDept) {
      batch.update(doc(db, 'contacts', d.id), { department: correctDept });
      updated++;
      batchCount++;

      if (batchCount >= BATCH_LIMIT) {
        await batch.commit();
        batch = writeBatch(db);
        batchCount = 0;
      }
    }
  }

  if (batchCount > 0) await batch.commit();
  return { updated, scanned: snap.size };
}

export default function SyncPage() {
  const { user, profile } = useAuth();

  const [syncStatus, setSyncStatus] = useState<'idle' | 'running' | 'done' | 'error'>('idle');
  const [syncResult, setSyncResult] = useState<SyncResult | null>(null);
  const [syncError, setSyncError] = useState<string | null>(null);

  const [deptStatus, setDeptStatus] = useState<'idle' | 'running' | 'done' | 'error'>('idle');
  const [deptResult, setDeptResult] = useState<{ updated: number; scanned: number } | null>(null);
  const [deptError, setDeptError] = useState<string | null>(null);

  const [pdfStatus, setPdfStatus] = useState<'idle' | 'running' | 'done' | 'error'>('idle');
  const [pdfResult, setPdfResult] = useState<PdfMigrationResult | null>(null);
  const [pdfError, setPdfError] = useState<string | null>(null);

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

  async function handleSync() {
    setSyncStatus('running');
    setSyncError(null);
    try {
      const res = await syncProductionCrew();
      setSyncResult(res);
      setSyncStatus('done');
    } catch (err) {
      setSyncError(err instanceof Error ? err.message : 'שגיאה לא ידועה');
      setSyncStatus('error');
    }
  }

  async function handlePdfMigration() {
    setPdfStatus('running');
    setPdfError(null);
    try {
      const res = await migratePdfContacts(db);
      setPdfResult(res);
      setPdfStatus('done');
    } catch (err) {
      setPdfError(err instanceof Error ? err.message : 'שגיאה לא ידועה');
      setPdfStatus('error');
    }
  }

  async function handleFixDepts() {
    setDeptStatus('running');
    setDeptError(null);
    try {
      const res = await fixDepartments();
      setDeptResult(res);
      setDeptStatus('done');
    } catch (err) {
      setDeptError(err instanceof Error ? err.message : 'שגיאה לא ידועה');
      setDeptStatus('error');
    }
  }

  const Spinner = () => (
    <svg className="animate-spin w-5 h-5" viewBox="0 0 24 24" fill="none">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/>
    </svg>
  );

  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-10 p-8" dir="rtl">

      {/* ── Section 1: Production Crew Sync ── */}
      <section className="w-full max-w-md flex flex-col items-center gap-4">
        <h1 className="text-2xl font-bold">סנכרון אנשי צוות מהפקות</h1>

        {syncStatus === 'idle' && (
          <button onClick={handleSync} className="px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-semibold transition-colors">
            הרץ סנכרון
          </button>
        )}
        {syncStatus === 'running' && (
          <div className="flex items-center gap-3 text-blue-400"><Spinner />סורק הפקות ומסנכרן אנשי צוות...</div>
        )}
        {syncStatus === 'done' && syncResult && (
          <div className="bg-green-900/30 border border-green-500/40 rounded-2xl p-6 text-center space-y-2 w-full">
            <p className="text-green-400 text-lg font-bold">✓ הסנכרון הושלם בהצלחה</p>
            <p className="text-gray-300">הפקות שנסרקו: <strong>{syncResult.scanned}</strong></p>
            <p className="text-gray-300">אנשי צוות ייחודיים: <strong>{syncResult.crewFound}</strong></p>
            <p className="text-green-300">נוספו: <strong>{syncResult.added}</strong></p>
            <p className="text-gray-400">כפילויות שדולגו: <strong>{syncResult.skipped}</strong></p>
          </div>
        )}
        {syncStatus === 'error' && (
          <div className="bg-red-900/30 border border-red-500/40 rounded-2xl p-6 text-red-400 text-center w-full">
            <p className="font-bold">שגיאה בסנכרון:</p>
            <p className="mt-1 text-sm">{syncError}</p>
            <button onClick={() => setSyncStatus('idle')} className="mt-4 px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg text-sm">נסה שוב</button>
          </div>
        )}
      </section>

      <hr className="w-full max-w-md border-gray-700" />

      {/* ── Section 2: PDF Migration (187 contacts) ── */}
      <section className="w-full max-w-md flex flex-col items-center gap-4">
        <h2 className="text-xl font-bold">טעינת 187 אנשי קשר מהאלפון</h2>
        <p className="text-sm text-gray-400 text-center">
          מייבא את כל אנשי הקשר מהאלפון המקצועי. פעולה בטוחה — כפילויות מדולגות אוטומטית.
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
            <p className="text-green-400 text-lg font-bold">✓ הייבוא הושלם</p>
            <p className="text-gray-300">סה&quot;כ בקובץ: <strong>{pdfResult.total}</strong></p>
            <p className="text-green-300">נוספו: <strong>{pdfResult.added}</strong></p>
            <p className="text-gray-400">כפילויות שדולגו: <strong>{pdfResult.skipped}</strong></p>
          </div>
        )}
        {pdfStatus === 'error' && (
          <div className="bg-red-900/30 border border-red-500/40 rounded-2xl p-6 text-red-400 text-center w-full">
            <p className="font-bold">שגיאה:</p>
            <p className="mt-1 text-sm">{pdfError}</p>
            <button onClick={() => setPdfStatus('idle')} className="mt-4 px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg text-sm">נסה שוב</button>
          </div>
        )}
      </section>

      <hr className="w-full max-w-md border-gray-700" />

      {/* ── Section 3: Fix Departments ── */}
      <section className="w-full max-w-md flex flex-col items-center gap-4">
        <h2 className="text-xl font-bold">תיקון מחלקות</h2>
        <p className="text-sm text-gray-400 text-center">מתקן מחלקות שגויות (כמו "כללי" במקום "טכני") לפי תפקיד</p>

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
            <p className="text-green-400 text-lg font-bold">✓ תיקון הושלם</p>
            <p className="text-gray-300">אנשי קשר שנסרקו: <strong>{deptResult.scanned}</strong></p>
            <p className="text-green-300">עודכנו: <strong>{deptResult.updated}</strong></p>
          </div>
        )}
        {deptStatus === 'error' && (
          <div className="bg-red-900/30 border border-red-500/40 rounded-2xl p-6 text-red-400 text-center w-full">
            <p className="font-bold">שגיאה:</p>
            <p className="mt-1 text-sm">{deptError}</p>
            <button onClick={() => setDeptStatus('idle')} className="mt-4 px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg text-sm">נסה שוב</button>
          </div>
        )}
      </section>

    </div>
  );
}
