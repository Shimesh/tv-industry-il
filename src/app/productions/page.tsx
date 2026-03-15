'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
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
import { parseScheduleHTML, parseManualText, parseHerzliyaHTML, isHerzliyaHTML } from '@/lib/productionScheduleParser';
import { fetchScheduleFromBrowser, FetchProgress, getStepMessage } from '@/lib/browserFetch';
import {
  doc,
  getDoc,
  collection,
  getDocs,
  addDoc,
  writeBatch,
  serverTimestamp,
  onSnapshot,
  query,
  where,
  orderBy,
  limit,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { Clapperboard, RefreshCw, Clock, CheckCircle, AlertTriangle as AlertTriangleIcon, Loader2 } from 'lucide-react';

export default function ProductionsPage() {
  return (
    <AuthGuard>
      <ProductionsContent />
    </AuthGuard>
  );
}

// Request status type
type RequestStatus = 'idle' | 'pending' | 'processing' | 'done' | 'error';

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
  const [showManualFallback, setShowManualFallback] = useState(false);
  const [requestStatus, setRequestStatus] = useState<RequestStatus>('idle');
  const [requestError, setRequestError] = useState<string | null>(null);
  const unsubRequestRef = useRef<(() => void) | null>(null);
  const unsubWeekRef = useRef<(() => void) | null>(null);

  // Cleanup listeners on unmount
  useEffect(() => {
    return () => {
      unsubRequestRef.current?.();
      unsubWeekRef.current?.();
    };
  }, []);

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

      // Auto-update crew member profiles
      await syncCrewProfiles(weekId, prods, wStart, wEnd);
    } catch (error) {
      console.error('Error saving to Firestore:', error);
    }
  }, [user, workerName]);

  // Sync crew members with registered user profiles
  const syncCrewProfiles = useCallback(async (
    weekId: string,
    prods: Production[],
    wStart: string,
    wEnd: string,
  ) => {
    try {
      const allCrewNames = new Set<string>();
      for (const prod of prods) {
        for (const crew of prod.crew) {
          if (crew.name) allCrewNames.add(crew.name);
        }
      }
      if (allCrewNames.size === 0) return;

      const usersRef = collection(db, 'users');
      const usersSnap = await getDocs(usersRef);
      const usersByName = new Map<string, string>();

      usersSnap.docs.forEach(docSnap => {
        const data = docSnap.data();
        if (data.displayName) {
          usersByName.set(data.displayName, docSnap.id);
        }
      });

      const batch2 = writeBatch(db);
      let matchCount = 0;

      for (const crewName of allCrewNames) {
        const matchedUid = usersByName.get(crewName);
        if (!matchedUid) continue;

        const memberProds = prods.filter(p =>
          p.crew.some(c => c.name === crewName) && p.status !== 'cancelled'
        );

        if (memberProds.length === 0) continue;

        const productionEntries = memberProds.map(p => {
          const crewEntry = p.crew.find(c => c.name === crewName);
          return {
            productionId: p.id || generateProductionId(p.name, p.date, p.studio),
            name: p.name,
            studio: p.studio,
            date: p.date,
            day: p.day,
            startTime: crewEntry?.startTime || p.startTime,
            endTime: crewEntry?.endTime || p.endTime,
            role: crewEntry?.role || '',
            roleDetail: crewEntry?.roleDetail || '',
          };
        });

        const userScheduleRef = doc(db, 'users', matchedUid, 'schedules', weekId);
        batch2.set(userScheduleRef, {
          workerName: crewName,
          weekStart: wStart,
          weekEnd: wEnd,
          productions: productionEntries,
          autoUpdatedAt: serverTimestamp(),
          autoUpdatedBy: user?.uid || '',
        }, { merge: true });

        matchCount++;
      }

      if (matchCount > 0) {
        await batch2.commit();
        console.log(`Auto-updated ${matchCount} crew member profiles`);
      }
    } catch (error) {
      console.error('Error syncing crew profiles:', error);
    }
  }, [user]);

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

  // ══════════════════════════════════════════════
  // Submit schedule request to Firestore for GitHub Action
  // ══════════════════════════════════════════════
  const submitScheduleRequest = useCallback(async (messageText: string) => {
    if (!user) return;

    // Extract URL from WhatsApp message
    const urlMatch = messageText.match(/https?:\/\/[^\s]+/);
    if (!urlMatch) {
      setStatusMessage('לא מצאתי לינק בהודעה');
      return;
    }

    // Extract worker name
    const nameMatch = messageText.match(/שלום\s+([^\n,]+)/);
    const extractedWorkerName = nameMatch?.[1]?.trim() || profile?.displayName || '';

    // Extract dates
    const dateMatch = messageText.match(/(\d{2}\/\d{2}\/\d{4})\s*[-–]\s*(\d{2}\/\d{2}\/\d{4})/);

    setRequestStatus('pending');
    setRequestError(null);
    setStatusMessage(null);

    try {
      // Save request to Firestore
      const docRef = await addDoc(collection(db, 'scheduleRequests'), {
        userId: user.uid,
        workerName: extractedWorkerName,
        url: urlMatch[0],
        weekStart: dateMatch?.[1] || '',
        weekEnd: dateMatch?.[2] || '',
        status: 'pending',
        createdAt: serverTimestamp(),
      });

      setWorkerName(extractedWorkerName);

      // Listen for request status updates
      unsubRequestRef.current?.();
      unsubRequestRef.current = onSnapshot(doc(db, 'scheduleRequests', docRef.id), (snap) => {
        const data = snap.data();
        if (!data) return;

        const status = data.status as RequestStatus;
        setRequestStatus(status);

        if (status === 'done') {
          // Request completed - load the productions
          setRequestStatus('done');
          unsubRequestRef.current?.();

          // Load the week that was just fetched
          if (data.productionCount > 0) {
            // Calculate weekId from dates
            const wStart = dateMatch?.[1];
            if (wStart) {
              const [d, m, y] = wStart.split('/').map(Number);
              const isoDate = `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
              const weekId = getWeekId(isoDate);

              loadExistingWeek(weekId).then(prods => {
                if (prods.length > 0) {
                  setProductions(prods);
                  setWeekStart(isoDate);
                  const sat = new Date(y, m - 1, d + 6);
                  setWeekEnd(sat.toISOString().split('T')[0]);
                  setCurrentWeekId(weekId);
                  setStatusMessage(`נטענו ${prods.length} הפקות`);
                }
              });
            } else {
              // No dates available, try to find the latest week
              handleReloadLatest();
            }
          }

          // Clear status after a few seconds
          setTimeout(() => setRequestStatus('idle'), 5000);
        } else if (status === 'error') {
          setRequestError(data.error || 'שגיאה בטעינת הלוח');
          unsubRequestRef.current?.();
          setTimeout(() => setRequestStatus('idle'), 8000);
        }
      });

      // Also set up onSnapshot on the productions week to catch real-time updates
      if (dateMatch) {
        const [d, m, y] = dateMatch[1].split('/').map(Number);
        const isoDate = `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
        const weekId = getWeekId(isoDate);
        listenToWeek(weekId);
      }
    } catch (error) {
      console.error('Error submitting schedule request:', error);
      setRequestStatus('error');
      setRequestError('שגיאה בשליחת הבקשה');
    }
  }, [user, profile, loadExistingWeek]);

  // Listen to a week's productions for real-time updates
  const listenToWeek = useCallback((weekId: string) => {
    unsubWeekRef.current?.();

    const weekRef = doc(db, 'productions', 'global', 'weeks', weekId);
    unsubWeekRef.current = onSnapshot(weekRef, async (snap) => {
      if (!snap.exists()) return;

      const data = snap.data();
      if (data.lastUpdated) {
        // Week was updated - reload productions
        const prods = await loadExistingWeek(weekId);
        if (prods.length > 0) {
          setProductions(prods);
          setWeekStart(data.weekStart || '');
          setWeekEnd(data.weekEnd || '');
          setCurrentWeekId(weekId);
        }
      }
    });
  }, [loadExistingWeek]);

  // Load the latest week from user's schedules
  const handleReloadLatest = useCallback(async () => {
    if (!user) return;
    try {
      const schedulesRef = collection(db, 'users', user.uid, 'schedules');
      const q = query(schedulesRef, orderBy('fetchedAt', 'desc'), limit(1));
      const snap = await getDocs(q);
      if (!snap.empty) {
        const data = snap.docs[0].data();
        const weekId = snap.docs[0].id;
        const prods = await loadExistingWeek(weekId);
        if (prods.length > 0) {
          setProductions(prods);
          setWeekStart(data.weekStart || '');
          setWeekEnd(data.weekEnd || '');
          setWorkerName(data.workerName || '');
          setCurrentWeekId(weekId);
          setStatusMessage(`נטענו ${prods.length} הפקות`);
        }
      }
    } catch (error) {
      console.error('Error loading latest week:', error);
    }
  }, [user, loadExistingWeek]);

  // Check for recent pending requests on mount
  useEffect(() => {
    if (!user) return;

    const checkPending = async () => {
      try {
        const q = query(
          collection(db, 'scheduleRequests'),
          where('userId', '==', user.uid),
          where('status', 'in', ['pending', 'processing']),
          orderBy('createdAt', 'desc'),
          limit(1),
        );
        const snap = await getDocs(q);
        if (!snap.empty) {
          const data = snap.docs[0].data();
          setRequestStatus(data.status as RequestStatus);
          setWorkerName(data.workerName || '');

          // Resume listening
          unsubRequestRef.current?.();
          unsubRequestRef.current = onSnapshot(doc(db, 'scheduleRequests', snap.docs[0].id), (docSnap) => {
            const d = docSnap.data();
            if (!d) return;
            setRequestStatus(d.status as RequestStatus);

            if (d.status === 'done') {
              unsubRequestRef.current?.();
              handleReloadLatest();
              setTimeout(() => setRequestStatus('idle'), 5000);
            } else if (d.status === 'error') {
              setRequestError(d.error || 'שגיאה');
              unsubRequestRef.current?.();
              setTimeout(() => setRequestStatus('idle'), 8000);
            }
          });
        } else {
          // No pending requests - try to load latest schedule
          await handleReloadLatest();
        }
      } catch {
        // Firestore index might not be ready yet
      }
    };

    checkPending();
  }, [user, handleReloadLatest]);

  // Main fetch handler - browser-side with CORS proxy + GitHub Action fallback
  const handleFetch = useCallback(async (url: string | null, manualText: string | null, rawHtml?: string | null) => {
    setLoading(true);
    setStatusMessage(null);
    setLastDiff(null);
    setShowSummary(false);
    setShowManualFallback(false);

    const userName = profile?.displayName || '';

    try {
      // Raw HTML from clipboard (Herzliya page Ctrl+A Ctrl+C)
      if (rawHtml) {
        setFetchProgress({ step: 'parsing', message: '⚙️ מעבד HTML של לוח הרצליה...' });
        const parsed = parseHerzliyaHTML(rawHtml, userName);
        if (parsed.productions.length > 0) {
          setFetchProgress({ step: 'done', message: getStepMessage('done') });
          await processSchedule(parsed);
          return;
        }
      }

      // Manual text input
      if (manualText && !url) {
        setFetchProgress({ step: 'parsing', message: getStepMessage('parsing') });

        if (isHerzliyaHTML(manualText)) {
          const htmlParsed = parseHerzliyaHTML(manualText, userName);
          if (htmlParsed.productions.length > 0) {
            setFetchProgress({ step: 'done', message: getStepMessage('done') });
            await processSchedule(htmlParsed);
            return;
          }
        }

        const parsed = parseManualText(manualText);

        if (parsed.productions.length === 0) {
          if (manualText.includes('<') && manualText.includes('>')) {
            const htmlParsed = parseScheduleHTML(manualText, '');
            if (htmlParsed.productions.length > 0) {
              setFetchProgress({ step: 'done', message: getStepMessage('done') });
              await processSchedule(htmlParsed);
              return;
            }
          }

          // Check if text contains a URL - submit as GitHub Action request
          const urlInText = manualText.match(/https?:\/\/[^\s]+/);
          if (urlInText) {
            setFetchProgress(null);
            setLoading(false);
            await submitScheduleRequest(manualText);
            return;
          }

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

        // Both failed - submit to GitHub Action as last resort
        setFetchProgress({ step: 'connecting', message: '🤖 שולח לעיבוד ברקע...' });
        setLoading(false);

        // Build a fake WhatsApp-like message with the URL
        const fakeMessage = `שלום ${userName}\nלוח עבודה\n${url}`;
        await submitScheduleRequest(fakeMessage);
        return;
      }

      // Successfully fetched HTML - try Herzliya DOMParser first, then fallback
      setFetchProgress({ step: 'parsing', message: getStepMessage('parsing') });

      let parsed: ParsedSchedule;

      if (isHerzliyaHTML(result.personalHtml)) {
        parsed = parseHerzliyaHTML(result.personalHtml, userName);
      } else {
        parsed = parseScheduleHTML(result.personalHtml, result.deptHtml);
      }

      if (parsed.productions.length === 0) {
        parsed = parseScheduleHTML(result.personalHtml, result.deptHtml);
      }

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
      setTimeout(() => setFetchProgress(null), 3000);
    }
  }, [processSchedule, profile, submitScheduleRequest]);

  // Handle manual HTML paste
  const handleManualHtmlPaste = useCallback(async (html: string) => {
    setLoading(true);
    setShowManualFallback(false);
    setFetchProgress({ step: 'parsing', message: getStepMessage('parsing') });

    const userName = profile?.displayName || '';

    try {
      if (isHerzliyaHTML(html)) {
        const herzliyaParsed = parseHerzliyaHTML(html, userName);
        if (herzliyaParsed.productions.length > 0) {
          setFetchProgress({ step: 'done', message: getStepMessage('done') });
          await processSchedule(herzliyaParsed);
          return;
        }
      }

      const parsed = parseScheduleHTML(html, '');
      if (parsed.productions.length > 0) {
        setFetchProgress({ step: 'done', message: getStepMessage('done') });
        await processSchedule(parsed);
        return;
      }

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
  }, [processSchedule, profile]);

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

      {/* GitHub Action request status - waiting UI */}
      {requestStatus !== 'idle' && (
        <ScheduleRequestStatus
          status={requestStatus}
          error={requestError}
          workerName={workerName}
        />
      )}

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
      {!loading && productions.length === 0 && !statusMessage && !showManualFallback && requestStatus === 'idle' && (
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

// ══════════════════════════════════════
// Schedule Request Status Component
// ══════════════════════════════════════
function ScheduleRequestStatus({
  status,
  error,
  workerName,
}: {
  status: RequestStatus;
  error: string | null;
  workerName: string;
}) {
  const progressPercent = status === 'pending' ? 30 : status === 'processing' ? 65 : status === 'done' ? 100 : 0;

  return (
    <div className="mb-6 rounded-xl border overflow-hidden" style={{
      background: 'var(--theme-bg-secondary)',
      borderColor: status === 'error'
        ? 'rgba(239, 68, 68, 0.3)'
        : status === 'done'
          ? 'rgba(34, 197, 94, 0.3)'
          : 'rgba(251, 191, 36, 0.3)',
    }}>
      <div className="p-4">
        <div className="flex items-center gap-3 mb-3">
          {status === 'pending' && (
            <Clock className="w-5 h-5 text-amber-400 animate-pulse" />
          )}
          {status === 'processing' && (
            <Loader2 className="w-5 h-5 text-blue-400 animate-spin" />
          )}
          {status === 'done' && (
            <CheckCircle className="w-5 h-5 text-green-400" />
          )}
          {status === 'error' && (
            <AlertTriangleIcon className="w-5 h-5 text-red-400" />
          )}

          <div>
            <h3 className="text-sm font-bold" style={{ color: 'var(--theme-text)' }}>
              {status === 'pending' && 'ממתין לעיבוד...'}
              {status === 'processing' && 'מעבד את לוח העבודה...'}
              {status === 'done' && 'הלוח עודכן!'}
              {status === 'error' && 'שגיאה בעיבוד'}
            </h3>
            <p className="text-xs" style={{ color: 'var(--theme-text-secondary)' }}>
              {status === 'pending' && 'הבקשה נשלחה, בדרך כלל לוקח 1-2 דקות'}
              {status === 'processing' && `טוען את הלוח של ${workerName || 'העובד'}...`}
              {status === 'done' && 'לוח העבודה נטען בהצלחה'}
              {status === 'error' && (error || 'נסה שוב מאוחר יותר')}
            </p>
          </div>
        </div>

        {/* Progress bar */}
        {(status === 'pending' || status === 'processing') && (
          <div className="w-full h-2 rounded-full overflow-hidden" style={{
            background: 'rgba(255,255,255,0.1)',
          }}>
            <div
              className="h-full rounded-full transition-all duration-1000"
              style={{
                width: `${progressPercent}%`,
                background: status === 'processing'
                  ? 'linear-gradient(90deg, #3b82f6, #8b5cf6)'
                  : 'linear-gradient(90deg, #f59e0b, #ef4444)',
                animation: 'pulse 2s ease-in-out infinite',
              }}
            />
          </div>
        )}
      </div>
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
