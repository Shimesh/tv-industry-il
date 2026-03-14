'use client';

import { useState, useCallback } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import AuthGuard from '@/components/AuthGuard';
import MessageInput from '@/components/productions/MessageInput';
import WeeklyCalendar from '@/components/productions/WeeklyCalendar';
import UpdateSummary from '@/components/productions/UpdateSummary';
import {
  Production,
  ParsedSchedule,
  ScheduleDiff,
  getWeekId,
  diffSchedules,
  applyDiff,
  generateProductionId,
  getHebrewDay,
} from '@/lib/productionDiff';
import { parseScheduleHTML, parseManualText } from '@/lib/productionScheduleParser';
import { fetchScheduleFromBrowser, FetchProgress, getStepMessage } from '@/lib/browserFetch';
import {
  doc,
  getDoc,
  collection,
  getDocs,
  writeBatch,
  serverTimestamp,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { Clapperboard, RefreshCw, ChevronDown, ChevronUp, Bug } from 'lucide-react';

export default function ProductionsPage() {
  return (
    <AuthGuard>
      <ProductionsContent />
    </AuthGuard>
  );
}

function ProductionsContent() {
  const { user, profile } = useAuth();
  const [loading, setLoading] = useState(false);
  const [productions, setProductions] = useState<Production[]>([]);
  const [weekStart, setWeekStart] = useState('');
  const [weekEnd, setWeekEnd] = useState('');
  const [workerName, setWorkerName] = useState('');
  const [currentWeekId, setCurrentWeekId] = useState<string | null>(null);
  const [lastDiff, setLastDiff] = useState<ScheduleDiff | null>(null);
  const [showSummary, setShowSummary] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [fetchProgress, setFetchProgress] = useState<FetchProgress | null>(null);
  const [debugHtml, setDebugHtml] = useState<string | null>(null);
  const [showDebug, setShowDebug] = useState(false);
  const [showManualFallback, setShowManualFallback] = useState(false);

  // Load existing week data from Firestore
  const loadExistingWeek = useCallback(async (weekId: string): Promise<Production[]> => {
    try {
      const prodsRef = collection(db, 'productions', 'global', 'weeks', weekId, 'productions');
      const snapshot = await getDocs(prodsRef);
      const existing: Production[] = [];

      for (const docSnap of snapshot.docs) {
        const data = docSnap.data();
        const crewRef = collection(db, 'productions', 'global', 'weeks', weekId, 'productions', docSnap.id, 'crew');
        const crewSnapshot = await getDocs(crewRef);
        const crew = crewSnapshot.docs.map(c => c.data() as Production['crew'][0]);

        existing.push({
          id: docSnap.id,
          name: data.name,
          studio: data.studio,
          date: data.date,
          day: data.day,
          startTime: data.startTime,
          endTime: data.endTime,
          status: data.status,
          crew,
          lastUpdatedBy: data.lastUpdatedBy,
          lastUpdatedAt: data.lastUpdatedAt,
          versions: data.versions || [],
        });
      }

      return existing;
    } catch (error) {
      console.error('Error loading existing week:', error);
      return [];
    }
  }, []);

  // Save productions to Firestore
  const saveToFirestore = useCallback(async (
    weekId: string,
    prods: Production[],
    wStart: string,
    wEnd: string,
  ) => {
    if (!user) return;

    try {
      const batch = writeBatch(db);

      const metaRef = doc(db, 'productions', 'global', 'weeks', weekId);
      const metaSnap = await getDoc(metaRef);

      if (metaSnap.exists()) {
        const existing = metaSnap.data();
        const contributors = existing.contributors || [];
        if (!contributors.includes(user.uid)) {
          contributors.push(user.uid);
        }
        batch.update(metaRef, {
          lastUpdated: serverTimestamp(),
          updateCount: (existing.updateCount || 0) + 1,
          contributors,
        });
      } else {
        batch.set(metaRef, {
          weekId,
          weekStart: wStart,
          weekEnd: wEnd,
          lastUpdated: serverTimestamp(),
          updateCount: 1,
          contributors: [user.uid],
        });
      }

      for (const prod of prods) {
        const prodId = prod.id || generateProductionId(prod.name, prod.date, prod.studio);
        const prodRef = doc(db, 'productions', 'global', 'weeks', weekId, 'productions', prodId);

        batch.set(prodRef, {
          name: prod.name,
          studio: prod.studio,
          date: prod.date,
          day: prod.day,
          startTime: prod.startTime,
          endTime: prod.endTime,
          status: prod.status,
          lastUpdatedBy: user.uid,
          lastUpdatedAt: new Date().toISOString(),
          versions: prod.versions || [],
        }, { merge: true });

        for (const crew of prod.crew) {
          const crewId = crew.name.replace(/\s+/g, '_').toLowerCase();
          const crewRef = doc(db, 'productions', 'global', 'weeks', weekId, 'productions', prodId, 'crew', crewId);
          batch.set(crewRef, {
            ...crew,
            addedBy: crew.addedBy || user.uid,
            addedAt: crew.addedAt || new Date().toISOString(),
          }, { merge: true });
        }
      }

      const userScheduleRef = doc(db, 'users', user.uid, 'schedules', weekId);
      batch.set(userScheduleRef, {
        workerName,
        fetchedAt: serverTimestamp(),
        productionIds: prods.map(p => p.id || generateProductionId(p.name, p.date, p.studio)),
      }, { merge: true });

      await batch.commit();
    } catch (error) {
      console.error('Error saving to Firestore:', error);
    }
  }, [user, workerName]);

  // Process parsed schedule (shared between URL fetch and manual paste)
  const processSchedule = useCallback(async (parsed: ParsedSchedule) => {
    if (!parsed.weekStart) {
      const now = new Date();
      const day = now.getDay();
      const sunday = new Date(now);
      sunday.setDate(now.getDate() - day);
      parsed.weekStart = sunday.toISOString().split('T')[0];
      const saturday = new Date(sunday);
      saturday.setDate(sunday.getDate() + 6);
      parsed.weekEnd = saturday.toISOString().split('T')[0];
    }

    const weekId = getWeekId(parsed.weekStart);
    const wName = parsed.workerName || profile?.displayName || '';

    setWorkerName(wName);
    setWeekStart(parsed.weekStart);
    setWeekEnd(parsed.weekEnd);

    if (currentWeekId === weekId && productions.length > 0) {
      const diff = diffSchedules(productions, parsed.productions);

      if (diff.hasChanges) {
        const updated = applyDiff(productions, parsed.productions, diff, user?.uid || '', wName);
        setProductions(updated);
        setLastDiff(diff);
        setShowSummary(true);
        await saveToFirestore(weekId, updated, parsed.weekStart, parsed.weekEnd);
        setStatusMessage(`${diff.changes.length} שינויים עודכנו`);
      } else {
        setStatusMessage('אין שינויים חדשים');
      }
    } else {
      const existingProds = await loadExistingWeek(weekId);

      if (existingProds.length > 0) {
        const diff = diffSchedules(existingProds, parsed.productions);

        if (diff.hasChanges) {
          const updated = applyDiff(existingProds, parsed.productions, diff, user?.uid || '', wName);
          setProductions(updated);
          setLastDiff(diff);
          setShowSummary(true);
          await saveToFirestore(weekId, updated, parsed.weekStart, parsed.weekEnd);
        } else {
          setProductions(existingProds);
          setStatusMessage('הלוח כבר עדכני');
        }
      } else {
        const prodsWithIds = parsed.productions.map(p => ({
          ...p,
          id: p.id || generateProductionId(p.name, p.date, p.studio),
          day: p.day || getHebrewDay(p.date),
          versions: [{
            timestamp: new Date().toISOString(),
            changedBy: user?.uid || '',
            changedByName: wName,
            changes: [{
              type: 'ADD_PRODUCTION' as const,
              productionName: p.name,
              productionDate: p.date,
              description: 'הפקה נוספה לראשונה',
            }],
          }],
        }));
        setProductions(prodsWithIds);
        await saveToFirestore(weekId, prodsWithIds, parsed.weekStart, parsed.weekEnd);
        setStatusMessage(`נטען לוח עבודה עם ${prodsWithIds.length} הפקות`);
      }

      setCurrentWeekId(weekId);
    }
  }, [user, profile, currentWeekId, productions, loadExistingWeek, saveToFirestore]);

  // Main fetch handler - browser-side with CORS proxy
  const handleFetch = useCallback(async (url: string | null, manualText: string | null) => {
    setLoading(true);
    setStatusMessage(null);
    setLastDiff(null);
    setShowSummary(false);
    setDebugHtml(null);
    setShowManualFallback(false);

    try {
      // Manual text input
      if (manualText && !url) {
        setFetchProgress({ step: 'parsing', message: getStepMessage('parsing') });
        const parsed = parseManualText(manualText);

        if (parsed.productions.length === 0) {
          // Check if it looks like HTML
          if (manualText.includes('<') && manualText.includes('>')) {
            // Try parsing as HTML
            const htmlParsed = parseScheduleHTML(manualText, '');
            if (htmlParsed.productions.length > 0) {
              setFetchProgress({ step: 'done', message: getStepMessage('done') });
              await processSchedule(htmlParsed);
              return;
            }
          }
          setDebugHtml(manualText.substring(0, 2000));
          setStatusMessage('לא הצלחתי לחלץ הפקות מהטקסט. נסה להדביק את תוכן הדף המלא.');
          setShowManualFallback(true);
          return;
        }

        setFetchProgress({ step: 'done', message: getStepMessage('done') });
        await processSchedule(parsed);
        return;
      }

      if (!url) {
        throw new Error('לא סופק לינק');
      }

      // Browser-side fetch via CORS proxy
      setFetchProgress({ step: 'detecting', message: getStepMessage('detecting') });

      const result = await fetchScheduleFromBrowser(url, (progress) => {
        setFetchProgress(progress);
      });

      if (result.error || !result.personalHtml) {
        // Browser fetch failed - try server-side API as fallback
        setFetchProgress({ step: 'connecting', message: '📡 מנסה דרך השרת...' });

        try {
          const apiResponse = await fetch('/api/productions/fetch-schedule', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ url }),
          });

          const apiResult = await apiResponse.json();

          if (apiResponse.ok && apiResult.success && apiResult.data.productions.length > 0) {
            setFetchProgress({ step: 'done', message: getStepMessage('done') });
            await processSchedule(apiResult.data);
            return;
          }
        } catch {
          // Server fallback also failed
        }

        // Both failed - show manual fallback
        setFetchProgress({ step: 'error', message: '❌ לא הצלחתי להתחבר' });
        setShowManualFallback(true);
        setStatusMessage(result.error || 'לא הצלחתי לגשת ללינק');
        return;
      }

      // Successfully fetched HTML - parse it
      setFetchProgress({ step: 'parsing', message: getStepMessage('parsing') });

      // Save raw HTML for debug
      setDebugHtml(result.personalHtml.substring(0, 5000));

      const parsed = parseScheduleHTML(result.personalHtml, result.deptHtml);

      if (parsed.productions.length === 0) {
        setStatusMessage('לא נמצאו הפקות. ייתכן שהפורמט של הדף שונה ממה שציפיתי.');
        setShowManualFallback(true);
        setFetchProgress({ step: 'error', message: '⚠️ לא נמצאו הפקות' });
        return;
      }

      setFetchProgress({ step: 'done', message: getStepMessage('done') });
      await processSchedule(parsed);
    } catch (error) {
      console.error('Fetch error:', error);
      setFetchProgress({ step: 'error', message: '❌ שגיאה' });
      throw error;
    } finally {
      setLoading(false);
      // Clear progress after 3 seconds
      setTimeout(() => setFetchProgress(null), 3000);
    }
  }, [processSchedule]);

  // Handle manual HTML paste
  const handleManualHtmlPaste = useCallback(async (html: string) => {
    setLoading(true);
    setShowManualFallback(false);
    setFetchProgress({ step: 'parsing', message: getStepMessage('parsing') });

    try {
      setDebugHtml(html.substring(0, 5000));

      // Try HTML parse first
      const parsed = parseScheduleHTML(html, '');
      if (parsed.productions.length > 0) {
        setFetchProgress({ step: 'done', message: getStepMessage('done') });
        await processSchedule(parsed);
        return;
      }

      // Try text parse
      const textParsed = parseManualText(html);
      if (textParsed.productions.length > 0) {
        setFetchProgress({ step: 'done', message: getStepMessage('done') });
        await processSchedule(textParsed);
        return;
      }

      setStatusMessage('לא הצלחתי לחלץ הפקות. נסה להדביק את כל תוכן הדף (Ctrl+A, Ctrl+C).');
      setFetchProgress({ step: 'error', message: '⚠️ לא נמצאו הפקות' });
    } catch (error) {
      console.error('Manual parse error:', error);
      setStatusMessage('שגיאה בעיבוד הטקסט');
    } finally {
      setLoading(false);
      setTimeout(() => setFetchProgress(null), 3000);
    }
  }, [processSchedule]);

  // Reload from Firestore
  const handleReload = async () => {
    if (!currentWeekId) return;
    setLoading(true);
    try {
      const existing = await loadExistingWeek(currentWeekId);
      if (existing.length > 0) {
        setProductions(existing);
        setStatusMessage('נטען מחדש מהשרת');
      }
    } catch {
      setStatusMessage('שגיאה בטעינה מחדש');
    }
    setLoading(false);
  };

  return (
    <div className="max-w-6xl mx-auto px-4 py-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-orange-500 to-red-500 flex items-center justify-center">
            <Clapperboard className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-xl font-black" style={{ color: 'var(--theme-text)' }}>
              לוח הפקות
            </h1>
            <p className="text-xs" style={{ color: 'var(--theme-text-secondary)' }}>
              הדבק הודעת WhatsApp או לינק ללוח העבודה
            </p>
          </div>
        </div>

        {currentWeekId && (
          <button
            onClick={handleReload}
            disabled={loading}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-medium transition-all hover:bg-[var(--theme-accent-glow)]"
            style={{ color: 'var(--theme-text-secondary)' }}
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            רענן
          </button>
        )}
      </div>

      {/* Message Input */}
      <div className="mb-6">
        <MessageInput
          onFetch={handleFetch}
          loading={loading}
          existingWeekId={currentWeekId}
          fetchProgress={fetchProgress}
        />
      </div>

      {/* Fetch progress indicator */}
      {fetchProgress && loading && (
        <div className="mb-4 px-4 py-3 rounded-xl text-sm flex items-center gap-3" style={{
          background: 'var(--theme-bg-secondary)',
          border: '1px solid var(--theme-border)',
        }}>
          <div className="w-5 h-5 rounded-full border-2 border-t-transparent animate-spin" style={{
            borderColor: 'var(--theme-accent)',
            borderTopColor: 'transparent',
          }} />
          <span style={{ color: 'var(--theme-text)' }}>{fetchProgress.message}</span>
        </div>
      )}

      {/* Manual fallback instructions */}
      {showManualFallback && (
        <ManualFallback onSubmit={handleManualHtmlPaste} loading={loading} />
      )}

      {/* Status message */}
      {statusMessage && !showSummary && (
        <div className="mb-4 px-4 py-2.5 rounded-xl text-sm text-center" style={{
          background: 'var(--theme-bg-secondary)',
          color: 'var(--theme-text-secondary)',
          border: '1px solid var(--theme-border)',
        }}>
          {statusMessage}
        </div>
      )}

      {/* Update Summary */}
      {showSummary && lastDiff && (
        <div className="mb-4">
          <UpdateSummary diff={lastDiff} onDismiss={() => setShowSummary(false)} />
        </div>
      )}

      {/* Weekly Calendar */}
      {productions.length > 0 && weekStart && weekEnd && (
        <WeeklyCalendar
          productions={productions}
          weekStart={weekStart}
          weekEnd={weekEnd}
          workerName={workerName}
          currentUserName={profile?.displayName || ''}
        />
      )}

      {/* Empty state */}
      {!loading && productions.length === 0 && !statusMessage && !showManualFallback && (
        <div className="text-center py-16">
          <div className="w-20 h-20 mx-auto mb-4 rounded-2xl bg-gradient-to-br from-orange-500/20 to-red-500/20 flex items-center justify-center">
            <Clapperboard className="w-10 h-10 text-orange-400/50" />
          </div>
          <h3 className="text-lg font-bold mb-2" style={{ color: 'var(--theme-text)' }}>
            אין לוח הפקות
          </h3>
          <p className="text-sm max-w-md mx-auto" style={{ color: 'var(--theme-text-secondary)' }}>
            הדבק הודעת WhatsApp עם הלינק ללוח העבודה השבועי, או הכנס את הלינק ישירות בשדה למעלה
          </p>
        </div>
      )}

      {/* Debug section */}
      {debugHtml && (
        <div className="mt-6">
          <button
            onClick={() => setShowDebug(!showDebug)}
            className="flex items-center gap-2 text-xs px-3 py-2 rounded-xl transition-all hover:bg-[var(--theme-accent-glow)]"
            style={{ color: 'var(--theme-text-secondary)' }}
          >
            <Bug className="w-3.5 h-3.5" />
            <span>תוכן HTML גולמי (דיבאג)</span>
            {showDebug ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
          </button>

          {showDebug && (
            <div className="mt-2 p-4 rounded-xl overflow-x-auto max-h-[400px] overflow-y-auto" style={{
              background: 'var(--theme-bg)',
              border: '1px solid var(--theme-border)',
            }}>
              <pre className="text-xs whitespace-pre-wrap break-all font-mono" dir="ltr" style={{
                color: 'var(--theme-text-secondary)',
              }}>
                {debugHtml}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// Manual fallback component
function ManualFallback({ onSubmit, loading }: { onSubmit: (html: string) => void; loading: boolean }) {
  const [manualHtml, setManualHtml] = useState('');

  return (
    <div className="mb-6 rounded-xl border p-4" style={{
      background: 'var(--theme-bg-secondary)',
      borderColor: 'rgba(251, 191, 36, 0.3)',
    }}>
      <div className="mb-3">
        <h3 className="text-sm font-bold mb-2" style={{ color: 'var(--theme-text)' }}>
          ⚠️ לא הצלחתי להתחבר לשרת הרצליה
        </h3>
        <div className="text-xs space-y-1" style={{ color: 'var(--theme-text-secondary)' }}>
          <p>אנא בצע את הצעדים הבאים:</p>
          <ol className="list-decimal pr-5 space-y-0.5">
            <li>פתח את הלינק בדפדפן</li>
            <li>סמן &quot;הצגת מחלקה&quot; אם רלוונטי</li>
            <li>
              לחץ <kbd className="px-1.5 py-0.5 rounded bg-[var(--theme-bg)] text-xs font-mono">Ctrl+A</kbd>{' '}
              ואז <kbd className="px-1.5 py-0.5 rounded bg-[var(--theme-bg)] text-xs font-mono">Ctrl+C</kbd>
            </li>
            <li>חזור לכאן והדבק בשדה למטה</li>
          </ol>
        </div>
      </div>

      <textarea
        value={manualHtml}
        onChange={(e) => setManualHtml(e.target.value)}
        placeholder="הדבק כאן את תוכן הדף..."
        className="w-full min-h-[120px] p-3 text-sm rounded-xl resize-none bg-transparent outline-none border"
        style={{
          color: 'var(--theme-text)',
          borderColor: 'var(--theme-border)',
          background: 'var(--theme-bg)',
        }}
        dir="rtl"
        disabled={loading}
      />

      <button
        onClick={() => {
          if (manualHtml.trim()) {
            onSubmit(manualHtml.trim());
          }
        }}
        disabled={loading || !manualHtml.trim()}
        className="mt-2 flex items-center justify-center gap-2 w-full px-4 py-3 rounded-xl text-sm font-bold text-white transition-all disabled:opacity-50"
        style={{
          background: 'linear-gradient(135deg, #f59e0b, #d97706)',
        }}
      >
        {loading ? '⏳ מעבד...' : '📋 עבד תוכן מודבק'}
      </button>
    </div>
  );
}
