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
import {
  doc,
  getDoc,
  setDoc,
  updateDoc,
  collection,
  getDocs,
  writeBatch,
  serverTimestamp,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { Clapperboard, RefreshCw } from 'lucide-react';

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

  // Load existing week data from Firestore
  const loadExistingWeek = useCallback(async (weekId: string): Promise<Production[]> => {
    try {
      const prodsRef = collection(db, 'productions', 'global', 'weeks', weekId, 'productions');
      const snapshot = await getDocs(prodsRef);
      const existing: Production[] = [];

      for (const docSnap of snapshot.docs) {
        const data = docSnap.data();
        // Load crew subcollection
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
    isUpdate: boolean,
  ) => {
    if (!user) return;

    try {
      const batch = writeBatch(db);

      // Update or create week metadata
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

      // Save each production
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

        // Save crew as subcollection
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

      // Save user-specific reference
      const userScheduleRef = doc(db, 'users', user.uid, 'schedules', weekId);
      batch.set(userScheduleRef, {
        workerName,
        fetchedAt: serverTimestamp(),
        productionIds: prods.map(p => p.id || generateProductionId(p.name, p.date, p.studio)),
      }, { merge: true });

      await batch.commit();
    } catch (error) {
      console.error('Error saving to Firestore:', error);
      // Don't throw - Firestore errors shouldn't break the UI
    }
  }, [user, workerName]);

  // Main fetch handler
  const handleFetch = useCallback(async (url: string | null, manualText: string | null) => {
    setLoading(true);
    setStatusMessage(null);
    setLastDiff(null);
    setShowSummary(false);

    try {
      // Call API
      const response = await fetch('/api/productions/fetch-schedule', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url, manualText }),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.message || 'שגיאה בטעינת הלוח');
      }

      if (result.warning) {
        setStatusMessage(result.warning);
      }

      const parsed: ParsedSchedule = result.data;

      if (!parsed.weekStart) {
        // If no week dates detected, use current week
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

      // Check if same week exists
      if (currentWeekId === weekId && productions.length > 0) {
        // DIFF mode - incremental update
        const diff = diffSchedules(productions, parsed.productions);

        if (diff.hasChanges) {
          const updated = applyDiff(
            productions,
            parsed.productions,
            diff,
            user?.uid || '',
            wName,
          );
          setProductions(updated);
          setLastDiff(diff);
          setShowSummary(true);

          // Save to Firestore
          await saveToFirestore(weekId, updated, parsed.weekStart, parsed.weekEnd, true);
          setStatusMessage(`${diff.changes.length} שינויים עודכנו`);
        } else {
          setStatusMessage('אין שינויים חדשים');
        }
      } else {
        // First load or new week
        const existingProds = await loadExistingWeek(weekId);

        if (existingProds.length > 0) {
          // Existing data in Firestore - diff against it
          const diff = diffSchedules(existingProds, parsed.productions);

          if (diff.hasChanges) {
            const updated = applyDiff(
              existingProds,
              parsed.productions,
              diff,
              user?.uid || '',
              wName,
            );
            setProductions(updated);
            setLastDiff(diff);
            setShowSummary(true);
            await saveToFirestore(weekId, updated, parsed.weekStart, parsed.weekEnd, true);
          } else {
            setProductions(existingProds);
            setStatusMessage('הלוח כבר עדכני');
          }
        } else {
          // Completely new week
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
                description: `הפקה נוספה לראשונה`,
              }],
            }],
          }));
          setProductions(prodsWithIds);
          await saveToFirestore(weekId, prodsWithIds, parsed.weekStart, parsed.weekEnd, false);
          setStatusMessage(`נטען לוח עבודה עם ${prodsWithIds.length} הפקות`);
        }

        setCurrentWeekId(weekId);
      }
    } catch (error) {
      console.error('Fetch error:', error);
      throw error; // Let MessageInput handle the error display
    } finally {
      setLoading(false);
    }
  }, [user, profile, currentWeekId, productions, loadExistingWeek, saveToFirestore]);

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
        />
      </div>

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
      {!loading && productions.length === 0 && !statusMessage && (
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
    </div>
  );
}
