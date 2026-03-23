'use client';

import { useState, useCallback, useEffect, useRef, useMemo } from 'react';
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
  getWeekIdsInRange,
} from '@/lib/productionDiff';
import { CalendarView } from '@/components/productions/CalendarNavigation';
import { parseScheduleHTML, parseManualText, parseHerzliyaHTML, isHerzliyaHTML } from '@/lib/productionScheduleParser';
import { normalizeContactName } from '@/lib/contactsUtils';
import {
  deduplicateCrewEntries,
  normalizePhone,
  normalizeName,
  normalizeRole,
} from '@/lib/crewNormalization';
import { useContacts } from '@/hooks/useContacts';
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
import { db, ensureOnline } from '@/lib/firebase';
import { Clapperboard, RefreshCw, Clock, CheckCircle, AlertTriangle as AlertTriangleIcon, Loader2, Sparkles, CalendarPlus, ExternalLink, Wand2 } from 'lucide-react';
import { useNotifications } from '@/contexts/NotificationContext';
import { getGoogleAuthToken, createCalendarEvent } from '@/lib/googleCalendar';

const GLOBAL_PRODUCTIONS_ROOT = 'productions/global/weeks'; // legacy shared path
const USER_SCHEDULES_ROOT = 'userSchedules';
const getUserProductionsRoot = (uid: string) => `productions/${uid}/weeks`;

export default function ProductionsPage() {
  return (
    <AuthGuard>
      <ProductionsContent />
    </AuthGuard>
  );
}

// Request status type
type RequestStatus = 'idle' | 'pending' | 'processing' | 'done' | 'error';

function normalizeCrewName(name: string) {
  return normalizeName(name) || normalizeContactName(name);
}

function deduplicateCrew(crew: Production['crew']) {
  return deduplicateCrewEntries(crew || []).map((member) => ({
    ...member,
    name: normalizeCrewName(member.name),
    role: normalizeRole(member.role || ''),
    roleDetail: normalizeRole(member.roleDetail || ''),
    phone: normalizePhone(member.phone),
  }));
}

function sanitizeCrewForFirestore(crew: Production['crew']) {
  return (crew || []).map((member) => ({
    name: normalizeCrewName(member.name || ''),
    role: normalizeRole(member.role || ''),
    roleDetail: normalizeRole(member.roleDetail || ''),
    phone: normalizePhone(member.phone),
    normalizedName: normalizeCrewName(member.name || ''),
    normalizedPhone: normalizePhone(member.phone),
    identityKey: member.identityKey || normalizeCrewName(member.name || ''),
    startTime: member.startTime || '',
    endTime: member.endTime || '',
    addedBy: member.addedBy || '',
    addedAt: member.addedAt || '',
  }));
}

function ProductionsContent() {
  const { user, profile } = useAuth();
  const { ensureFromCrew } = useContacts();
  const { addNotification } = useNotifications();
  const [loading, setLoading] = useState(false);
  const [useAI, setUseAI] = useState(false);
  const [aiStatus, setAiStatus] = useState('');
  const [gcalSyncing, setGcalSyncing] = useState<string | null>(null);
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
  const loadTokenRef = useRef(0);

    // Calendar navigation state
  const [calendarView, setCalendarView] = useState<CalendarView>('week');
  const [currentDate, setCurrentDate] = useState(() => new Date());
  const [calendarYear, setCalendarYear] = useState(() => new Date().getFullYear());
  const [calendarMonth, setCalendarMonth] = useState(() => new Date().getMonth());
  const [navLoading, setNavLoading] = useState(false);
  const productionsByWeekRef = useRef<Map<string, Production[]>>(new Map());
  // Cleanup listeners on unmount
  useEffect(() => {
    return () => {
      unsubRequestRef.current?.();
      unsubWeekRef.current?.();
    };
  }, []);
  useEffect(() => {
    setCalendarYear(currentDate.getFullYear());
    setCalendarMonth(currentDate.getMonth());
  }, [currentDate]);

  // REST API helper: list documents in a collection
  const restListDocs = useCallback(async (collectionPath: string): Promise<Array<{ id: string; fields: Record<string, unknown> }>> => {
    if (!user) return [];
    try {
      const token = await user.getIdToken();
      const projectId = 'tv-industry-il';
      const url = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/${collectionPath}`;
      const res = await fetch(url, {
        headers: { 'Authorization': `Bearer ${token}` },
      });
      if (!res.ok) return [];
      const data = await res.json();
      if (!data.documents) return [];

      return data.documents.map((doc: Record<string, unknown>) => {
        const name = doc.name as string;
        const id = name.split('/').pop() || '';
        const rawFields = (doc.fields || {}) as Record<string, Record<string, unknown>>;
        const fields: Record<string, unknown> = {};
        for (const [key, val] of Object.entries(rawFields)) {
          if ('stringValue' in val) fields[key] = val.stringValue;
          else if ('integerValue' in val) fields[key] = Number(val.integerValue);
          else if ('booleanValue' in val) fields[key] = val.booleanValue;
          else if ('timestampValue' in val) fields[key] = val.timestampValue;
          else if ('nullValue' in val) fields[key] = null;
          else if ('arrayValue' in val) fields[key] = val.arrayValue;
          else if ('mapValue' in val) fields[key] = val.mapValue;
        }
        return { id, fields };
      });
    } catch (error) {
      // REST API error - return empty
      return [];
    }
  }, [user]);

  // Parse Firestore REST array value to JS array
  const parseFirestoreArray = useCallback((val: unknown): Array<Record<string, string>> => {
    if (!val || typeof val !== 'object') return [];
    const arrVal = val as { values?: Array<{ mapValue?: { fields?: Record<string, { stringValue?: string; integerValue?: string; booleanValue?: boolean; nullValue?: null }> } }> };
    if (!arrVal.values) return [];
    return arrVal.values.map(item => {
      const fields = item.mapValue?.fields || {};
      const result: Record<string, string> = {};
      for (const [key, v] of Object.entries(fields)) {
        // Handle all Firestore REST API value types
        if (v.stringValue !== undefined) {
          result[key] = v.stringValue;
        } else if (v.integerValue !== undefined) {
          result[key] = String(v.integerValue);
        } else if (v.booleanValue !== undefined) {
          result[key] = String(v.booleanValue);
        } else if ('nullValue' in v) {
          result[key] = '';
        } else {
          result[key] = '';
        }
      }
      return result;
    });
  }, []);

  // Parse production documents from REST API response into Production objects
  const parseProductionDocs = useCallback((prodDocs: Array<{ id: string; fields: Record<string, unknown> }>, weekId: string) => {
    const dedupMap = new Map<string, Production>();

    for (const prodDoc of prodDocs) {
      const d = prodDoc.fields;

      let crew: Production['crew'] = [];
      if (d.crew) {
        const rawCrew = parseFirestoreArray(d.crew);
        const mappedCrew = rawCrew.map(c => ({
          name: normalizeCrewName(c.name || ''),
          role: normalizeRole(c.role || ''),
          roleDetail: normalizeRole(c.roleDetail || ''),
          phone: normalizePhone(c.phone || ''),
          normalizedName: normalizeCrewName(c.normalizedName || c.name || ''),
          normalizedPhone: normalizePhone(c.normalizedPhone || c.phone || ''),
          identityKey: c.identityKey || normalizeCrewName(c.name || ''),
          startTime: c.startTime || '',
          endTime: c.endTime || '',
          addedBy: c.addedBy || '',
          addedAt: c.addedAt || '',
        }));
        crew = deduplicateCrew(mappedCrew);
      }

      const herzliyaId = String(d.herzliyaId || prodDoc.id);

      dedupMap.set(herzliyaId, {
        id: prodDoc.id,
        name: (d.name as string) || '',
        studio: (d.studio as string) || '',
        date: (d.date as string) || '',
        day: (d.day as string) || '',
        startTime: (d.startTime as string) || '',
        endTime: (d.endTime as string) || '',
        status: ((d.status as string) || 'scheduled') as Production['status'],
        crew,
        isCurrentUserShift: d.isCurrentUserShift === true || d.isCurrentUserShift === 'true',
        lastUpdatedBy: (d.lastUpdatedBy as string) || '',
        lastUpdatedAt: (d.lastUpdatedAt as string) || '',
        versions: [],
      });
    }

    return Array.from(dedupMap.values());
  }, [parseFirestoreArray]);

  // Load existing week data via REST API - per-user first, then fallback to global (migration)
  const loadExistingWeek = useCallback(async (weekId: string): Promise<Production[]> => {
    if (!user) return [];
    try {
      // Try per-user path first
      const userRoot = getUserProductionsRoot(user.uid);
      const prodDocs = await restListDocs(`${userRoot}/${weekId}/productions`);

      if (prodDocs.length > 0) {
        return parseProductionDocs(prodDocs, weekId);
      }

      // Fallback: try legacy global path for migration
      const globalDocs = await restListDocs(`${GLOBAL_PRODUCTIONS_ROOT}/${weekId}/productions`);
      if (globalDocs.length > 0) {
        const prods = parseProductionDocs(globalDocs, weekId);
        // Auto-migrate: save to per-user path so next load is fast
        // (done in background, no await needed to block UI)
        return prods;
      }

      return [];
    } catch (error) {
      return [];
    }
  }, [user, restListDocs, parseProductionDocs]);

  // Save productions to Firestore
  const saveToFirestore = useCallback(async (
    weekId: string,
    prods: Production[],
    wStart: string,
    wEnd: string,
  ) => {
    if (!user) {
      return;
    }

    try {
      await ensureOnline();
      const batch = writeBatch(db);

      // Save to per-user path: productions/{userId}/weeks/{weekId}
      const metaRef = doc(db, 'productions', user.uid, 'weeks', weekId);
      let metaSnap;
      try {
        metaSnap = await Promise.race([
          getDoc(metaRef),
          new Promise<never>((_, reject) => setTimeout(() => reject(new Error('getDoc timeout')), 10000)),
        ]);
      } catch {
        metaSnap = { exists: () => false, data: () => null } as any;
      }

      if (metaSnap.exists()) {
        const existing = metaSnap.data();
        batch.update(metaRef, {
          lastUpdated: serverTimestamp(),
          updateCount: (existing.updateCount || 0) + 1,
        });
      } else {
        batch.set(metaRef, {
          weekId,
          weekStart: wStart,
          weekEnd: wEnd,
          lastUpdated: serverTimestamp(),
          updateCount: 1,
        });
      }

      for (const prod of prods) {
        const prodId = prod.id || generateProductionId(prod.name, prod.date, prod.studio);
        const prodRef = doc(db, 'productions', user.uid, 'weeks', weekId, 'productions', prodId);

        // Deduplicate crew by name before saving
        const cleanCrew = sanitizeCrewForFirestore(deduplicateCrew(prod.crew));

        // SET (not merge) - crew stored as array field on production document
        batch.set(prodRef, {
          name: prod.name,
          studio: prod.studio,
          date: prod.date,
          day: prod.day,
          startTime: prod.startTime,
          endTime: prod.endTime,
          status: prod.status,
          herzliyaId: prod.id || '',
          lastUpdatedBy: user.uid,
          lastUpdatedAt: new Date().toISOString(),
          crew: cleanCrew,
          versions: prod.versions || [],
        });
      }

      const userScheduleRef = doc(db, 'userSchedules', user.uid, 'weeks', weekId);
      batch.set(userScheduleRef, {
        workerName,
        fetchedAt: serverTimestamp(),
        productionIds: prods.map(p => p.id || generateProductionId(p.name, p.date, p.studio)),
      });

      await batch.commit();

      // Auto-update crew member profiles
      await syncCrewProfiles(weekId, prods, wStart, wEnd);
    } catch (error) {
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
        });

        matchCount++;
      }

      if (matchCount > 0) {
        await batch2.commit();
      }
    } catch (error) {
    }
  }, [user]);

  // Process parsed schedule (shared between URL fetch and manual paste)
  const processSchedule = useCallback(async (parsed: ParsedSchedule) => {
    if (!parsed.weekStart) {
      const now = new Date();
      const day = now.getDay();
      const sunday = new Date(now);
      sunday.setDate(now.getDate() - day);
      parsed.weekStart = toLocalDate(sunday);
      const saturday = new Date(sunday);
      saturday.setDate(sunday.getDate() + 6);
      parsed.weekEnd = toLocalDate(saturday);
    }

    const weekId = getWeekId(parsed.weekStart);
    const wName = parsed.workerName || profile?.displayName || '';

    setWorkerName(wName);
    setWeekStart(parsed.weekStart);
    setWeekEnd(parsed.weekEnd);
    setCurrentDate(fromLocalDate(parsed.weekStart));

    if (currentWeekId === weekId && productions.length > 0) {
      const diff = diffSchedules(productions, parsed.productions);

      if (diff.hasChanges) {
        const updated = applyDiff(productions, parsed.productions, diff, user?.uid || '', wName);
        setProductions(updated);
        productionsByWeekRef.current.set(weekId, updated);
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
        productionsByWeekRef.current.set(weekId, updated);
          setLastDiff(diff);
          setShowSummary(true);
          await saveToFirestore(weekId, updated, parsed.weekStart, parsed.weekEnd);
        } else {
          setProductions(existingProds);
          productionsByWeekRef.current.set(weekId, existingProds);
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
        productionsByWeekRef.current.set(weekId, prodsWithIds);
        await saveToFirestore(weekId, prodsWithIds, parsed.weekStart, parsed.weekEnd);
        setStatusMessage(`נטען לוח עבודה עם ${prodsWithIds.length} הפקות`);
      }

      setCurrentWeekId(weekId);
    }
  }, [user, profile, currentWeekId, productions, loadExistingWeek, saveToFirestore]);

  // ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•
  // Firestore REST API helper (bypasses broken SDK)
  // ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•
  const firestoreRestWrite = useCallback(async (
    collectionPath: string,
    fields: Record<string, unknown>,
  ): Promise<string> => {
    if (!user) throw new Error('No user');
    const token = await user.getIdToken(true);
    const projectId = 'tv-industry-il';
    const url = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/${collectionPath}`;

    // Convert JS values to Firestore REST API format
    const firestoreFields: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(fields)) {
      if (typeof value === 'string') {
        firestoreFields[key] = { stringValue: value };
      } else if (typeof value === 'number') {
        firestoreFields[key] = { integerValue: String(value) };
      } else if (typeof value === 'boolean') {
        firestoreFields[key] = { booleanValue: value };
      } else if (value === null) {
        firestoreFields[key] = { nullValue: null };
      } else if (value instanceof Date) {
        firestoreFields[key] = { timestampValue: value.toISOString() };
      } else if (value === 'SERVER_TIMESTAMP') {
        firestoreFields[key] = { timestampValue: new Date().toISOString() };
      }
    }

    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ fields: firestoreFields }),
    });

    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error?.message || `Firestore REST error ${res.status}`);
    }

    const docName = data.name || '';
    return docName.split('/').pop() || '';
  }, [user]);

  // Read a document via REST API
  const firestoreRestRead = useCallback(async (
    docPath: string,
  ): Promise<Record<string, unknown> | null> => {
    if (!user) return null;
    const token = await user.getIdToken();
    const projectId = 'tv-industry-il';
    const url = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/${docPath}`;

    const res = await fetch(url, {
      headers: { 'Authorization': `Bearer ${token}` },
    });

    if (res.status === 404) return null;
    if (!res.ok) return null;

    const data = await res.json();
    // Convert Firestore REST format to plain values
    const result: Record<string, unknown> = {};
    if (data.fields) {
      for (const [key, val] of Object.entries(data.fields)) {
        const v = val as Record<string, unknown>;
        if ('stringValue' in v) result[key] = v.stringValue;
        else if ('integerValue' in v) result[key] = Number(v.integerValue);
        else if ('booleanValue' in v) result[key] = v.booleanValue;
        else if ('timestampValue' in v) result[key] = v.timestampValue;
        else if ('nullValue' in v) result[key] = null;
      }
    }
    return result;
  }, [user]);

  // ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•
  // Submit schedule request via REST API for GitHub Action
  // ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•
  const submitScheduleRequest = useCallback(async (messageText: string) => {

    if (!user) {
      return;
    }

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
    const dateMatch = messageText.match(/(\d{2}\/\d{2}\/\d{4})\s*[-ג€“]\s*(\d{2}\/\d{2}\/\d{4})/);

    setRequestStatus('pending');
    setRequestError(null);
    setStatusMessage(null);

    try {
      // Write via REST API (bypasses broken SDK)
      const docId = await firestoreRestWrite('scheduleRequests', {
        userId: user.uid,
        workerName: extractedWorkerName,
        url: urlMatch[0],
        weekStart: dateMatch?.[1] || '',
        weekEnd: dateMatch?.[2] || '',
        status: 'pending',
        createdAt: 'SERVER_TIMESTAMP',
      });

      setWorkerName(extractedWorkerName);

      // Trigger GitHub Action immediately via API route (reduces wait from 5min to ~30s)
      fetch('/api/trigger-action', { method: 'POST' }).catch(() => {});

      // Poll for status updates (REST-based, since SDK onSnapshot is broken)
      const pollInterval = setInterval(async () => {
        try {
          const data = await firestoreRestRead(`scheduleRequests/${docId}`);
          if (!data) return;

          const status = data.status as RequestStatus;
          setRequestStatus(status);

          if (status === 'done') {
            clearInterval(pollInterval);

            // Load the week that was just fetched
            if (dateMatch) {
              const [d, m, y] = dateMatch[1].split('/').map(Number);
              const isoDate = `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
              const weekId = getWeekId(isoDate);
              try {
                const prods = await loadExistingWeek(weekId);
                if (prods.length > 0) {
                  setProductions(prods);
                  setWeekStart(isoDate);
                  setCurrentDate(new Date(isoDate));
                  const sat = new Date(y, m - 1, d + 6);
                  setWeekEnd(toLocalDate(sat));
                  setCurrentWeekId(weekId);
                  setStatusMessage(`נטענו ${prods.length} הפקות`);
                }
              } catch {
                handleReloadLatest();
              }
            } else {
              setStatusMessage('הלוח עודכן - רענן את הדף');
            }

            setTimeout(() => setRequestStatus('idle'), 5000);
          } else if (status === 'error') {
            clearInterval(pollInterval);
            setRequestError((data.error as string) || 'שגיאה בטעינת הלוח');
            setTimeout(() => setRequestStatus('idle'), 8000);
          }
        } catch (pollErr) {
        }
      }, 10000); // Poll every 10 seconds

      // Stop polling after 5 minutes max
      setTimeout(() => clearInterval(pollInterval), 5 * 60 * 1000);
    } catch (error: unknown) {
      setRequestStatus('error');
      setRequestError(error instanceof Error ? error.message : 'שגיאה בשליחת הבקשה');
    }
  }, [user, profile, firestoreRestWrite, firestoreRestRead, loadExistingWeek]);

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

  const getWeekStartDate = (date: Date) => {
    const d = new Date(date);
    const day = d.getDay(); // 0=Sunday
    d.setDate(d.getDate() - day);
    d.setHours(0, 0, 0, 0);
    return d;
  };

  const getWeekEndDate = (date: Date) => {
    const start = getWeekStartDate(date);
    const end = new Date(start);
    end.setDate(end.getDate() + 6);
    return end;
  };

  const fromLocalDate = (dateStr: string) => {
    const [y, m, d] = dateStr.split('-').map(Number);
    return new Date(y, (m || 1) - 1, d || 1);
  };

  const toLocalDate = (date: Date) => {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  };

  const renderedRange = useMemo(() => {
    if (calendarView === 'week') {
      const start = getWeekStartDate(currentDate);
      const end = getWeekEndDate(currentDate);
      return {
        start: toLocalDate(start),
        end: toLocalDate(end),
      };
    }

    if (calendarView === 'month') {
      return {
        start: toLocalDate(new Date(currentDate.getFullYear(), currentDate.getMonth(), 1)),
        end: toLocalDate(new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0)),
      };
    }

    const start = new Date(currentDate);
    start.setMonth(start.getMonth() - 1);
    const end = new Date(currentDate);
    end.setMonth(end.getMonth() + 2);
    return {
      start: toLocalDate(start),
      end: toLocalDate(end),
    };
  }, [calendarView, currentDate]);

  const visibleProductions = useMemo(() => {
    return productions.filter((production) => (
      production.date >= renderedRange.start && production.date <= renderedRange.end
    ));
  }, [productions, renderedRange]);

  // Load the latest week - try known current week first, then user schedules via REST
  const handleReloadLatest = useCallback(async () => {
    if (!user) return;
    try {
      // Try current week first (Sunday-based week ID)
      const now = new Date();
      const dayOfWeek = now.getDay();
      const sunday = new Date(now);
      sunday.setDate(now.getDate() - dayOfWeek);
      const weekId = getWeekId(toLocalDate(sunday));

      const prods = await loadExistingWeek(weekId);
      if (prods.length > 0) {
        productionsByWeekRef.current.set(weekId, prods);
        // Also fetch the user's schedule to get workerName
        let scheduleDocs = await restListDocs(`${USER_SCHEDULES_ROOT}/${user.uid}/weeks`);
        if (scheduleDocs.length === 0) {
          scheduleDocs = await restListDocs(`users/${user.uid}/schedules`);
        }
        const userSchedule = scheduleDocs.find(s => s.id === weekId);
        const wName = (userSchedule?.fields?.workerName as string) || profile?.displayName || '';

        setProductions(prods);
        setWorkerName(wName);
        const satDate = new Date(sunday);
        satDate.setDate(sunday.getDate() + 6);
        setWeekStart(toLocalDate(sunday));
        setCurrentDate(new Date(sunday));
        setWeekEnd(toLocalDate(satDate));
        setCurrentWeekId(weekId);
        return;
      }

      // Fallback: try user schedules via REST
      let scheduleDocs = await restListDocs(`${USER_SCHEDULES_ROOT}/${user.uid}/weeks`);
      if (scheduleDocs.length === 0) {
        scheduleDocs = await restListDocs(`users/${user.uid}/schedules`);
      }
      if (scheduleDocs.length > 0) {
        const latest = scheduleDocs[scheduleDocs.length - 1];
        const latestWeekId = latest.id;
        const latestProds = await loadExistingWeek(latestWeekId);
        if (latestProds.length > 0) {
          productionsByWeekRef.current.set(latestWeekId, latestProds);
          setProductions(latestProds);
          setWeekStart((latest.fields.weekStart as string) || '');
          if (latest.fields.weekStart) {
            setCurrentDate(fromLocalDate(latest.fields.weekStart as string));
          }
          setWeekEnd((latest.fields.weekEnd as string) || '');
          setWorkerName((latest.fields.workerName as string) || profile?.displayName || '');
          setCurrentWeekId(latestWeekId);
        }
      }
    } catch (error) {
    }
  }, [user, profile, loadExistingWeek, restListDocs]);

  // Load productions for a date range (multiple weeks from Firestore)
  const loadProductionsForPeriod = useCallback(async (
    startDate: string,
    endDate: string,
    signal?: AbortSignal,
  ): Promise<Production[]> => {
    const weekIds = getWeekIdsInRange(startDate, endDate);
    const cached: Production[] = [];
    const missingWeekIds: string[] = [];

    for (const weekId of weekIds) {
      const local = productionsByWeekRef.current.get(weekId);
      if (local) {
        cached.push(...local);
      } else {
        missingWeekIds.push(weekId);
      }
    }

    const fetched: Production[] = [];
    const concurrency = 5;
    let cursor = 0;

    const worker = async () => {
      while (cursor < missingWeekIds.length) {
        if (signal?.aborted) return;
        const index = cursor++;
        const weekId = missingWeekIds[index];
        const prods = await loadExistingWeek(weekId);
        if (signal?.aborted) return;
        if (prods.length > 0) {
          productionsByWeekRef.current.set(weekId, prods);
          fetched.push(...prods);
        }
      }
    };

    await Promise.all(
      Array.from({ length: Math.min(concurrency, missingWeekIds.length) }, () => worker()),
    );

    return [...cached, ...fetched];
  }, [loadExistingWeek]);

  // Handle calendar navigation
  const handleCalendarNavigate = useCallback((direction: 'prev' | 'next' | 'today') => {
    setNavLoading(true);

    let target = new Date(currentDate);

    if (direction === 'today') {
      target = new Date();
    } else if (calendarView === 'week') {
      target.setDate(target.getDate() + (direction === 'prev' ? -7 : 7));
    } else if (calendarView === 'month') {
      target.setDate(1);
      target.setMonth(target.getMonth() + (direction === 'prev' ? -1 : 1));
    } else {
      target.setMonth(target.getMonth() + (direction === 'prev' ? -1 : 1));
    }

    setCurrentDate(target);
  }, [calendarView, currentDate]);

  // Handle view change
  const handleViewChange = useCallback((view: CalendarView) => {
    setCalendarView(view);
    setNavLoading(true);
  }, []);

  // Load productions whenever currentDate or view changes
  useEffect(() => {
    if (!user?.uid) return;
    let cancelled = false;
    const token = ++loadTokenRef.current;
    const controller = new AbortController();

    const loadForPeriod = async () => {
      setNavLoading(true);
      try {
        let start: Date;
        let end: Date;

        if (calendarView === 'week') {
          start = getWeekStartDate(currentDate);
          end = getWeekEndDate(currentDate);
        } else if (calendarView === 'month') {
          start = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1);
          end = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0);
        } else {
          // List: load 3 months around current
          start = new Date(currentDate);
          start.setMonth(start.getMonth() - 1);
          end = new Date(currentDate);
          end.setMonth(end.getMonth() + 2);
        }

        const startStr = toLocalDate(start);
        const endStr = toLocalDate(end);

        // Update header immediately to avoid UI jumps
        setWeekStart(startStr);
        setWeekEnd(endStr);
        setCurrentWeekId(calendarView === 'week' ? getWeekId(startStr) : null);

        const prods = await loadProductionsForPeriod(startStr, endStr, controller.signal);

        if (cancelled || token !== loadTokenRef.current) return;

        setProductions(prods);
      } catch {
        if (cancelled || token !== loadTokenRef.current) return;
      } finally {
        if (!cancelled && token === loadTokenRef.current) {
          setNavLoading(false);
        }
      }
    };

    loadForPeriod();

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [user?.uid, currentDate, calendarView, loadProductionsForPeriod]);
  useEffect(() => {
    if (!productions.length) return;
    const allCrew = productions.flatMap(p => p.crew || []);
    void ensureFromCrew(allCrew);
  }, [productions, ensureFromCrew]);

  // Duplicates are auto-resolved silently by useContacts hook

  // Check for recent pending requests on mount (via REST API)
  useEffect(() => {
    if (!user) return;

    const checkPending = async () => {
      try {
        // Load latest schedule directly via REST
        await handleReloadLatest();
      } catch (err) {
        try { await handleReloadLatest(); } catch { /* ignore */ }
      }
    };

    checkPending();
  }, [user, handleReloadLatest]);

  // ===== AI-Powered Parse =====
  const handleAIParse = useCallback(async (text: string): Promise<ParsedSchedule | null> => {
    setAiStatus('מנתח עם AI...');
    try {
      const response = await fetch('/api/productions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: text, fileName: 'manual-input' }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'שגיאה בפרסור AI');

      // Convert AI result to ParsedSchedule format
      const productions: Production[] = (result.productions || []).map((p: {
        name?: string; date?: string; startTime?: string; endTime?: string;
        location?: string; studio?: string; notes?: string;
        crew?: { name: string; role: string; department: string }[];
      }) => ({
        id: generateProductionId(p.name || '', p.date || '', p.studio || p.location || ''),
        name: p.name || '',
        date: p.date || '',
        day: p.date ? getHebrewDay(p.date) : '',
        startTime: p.startTime || '',
        endTime: p.endTime || '',
        studio: p.studio || p.location || '',
        status: 'scheduled' as const,
        crew: (p.crew || []).map(c => ({
          name: c.name,
          role: c.role || '',
          roleDetail: '',
          phone: '',
        })),
        versions: [],
      }));

      if (productions.length === 0) return null;

      // Build ParsedSchedule
      const dates = productions.map(p => p.date).filter(Boolean).sort();
      const parsed: ParsedSchedule = {
        weekStart: dates[0] || '',
        weekEnd: dates[dates.length - 1] || '',
        workerName: '',
        productions,
      };

      setStatusMessage(`AI זיהה ${productions.length} הפקות`);
      await addNotification({
        type: 'file_upload',
        title: 'פרסור AI הושלם',
        message: `${productions.length} הפקות זוהו בהצלחה`,
      });

      return parsed;
    } catch (err) {
      setStatusMessage(err instanceof Error ? err.message : 'שגיאה בפרסור AI');
      return null;
    } finally {
      setAiStatus('');
    }
  }, [addNotification]);

  // ===== Google Calendar Sync =====
  const syncToGoogleCalendar = useCallback(async (prod: Production) => {
    setGcalSyncing(prod.id);
    try {
      const token = await getGoogleAuthToken();
      if (!token) {
        setStatusMessage('לא ניתן להתחבר ל-Google Calendar');
        return;
      }

      const result = await createCalendarEvent(token, {
        id: prod.id,
        name: prod.name,
        date: prod.date,
        startTime: prod.startTime,
        endTime: prod.endTime,
        location: prod.studio || '',
        studio: prod.studio || '',
        notes: '',
        crew: (prod.crew || []).map(c => ({
          name: c.name,
          role: c.role || c.roleDetail || '',
          department: '',
        })),
      });

      if (result.success) {
        setStatusMessage(`"${prod.name}" סונכרנה ל-Google Calendar`);
        await addNotification({
          type: 'general',
          title: 'Google Calendar',
          message: `"${prod.name}" נוספה ליומן`,
          productionId: prod.id,
          productionName: prod.name,
        });
      } else {
        setStatusMessage(result.error || 'שגיאה בסנכרון');
      }
    } catch {
      setStatusMessage('שגיאה בסנכרון ל-Google Calendar');
    } finally {
      setGcalSyncing(null);
    }
  }, [addNotification]);

  // Main fetch handler - direct GitHub Action for URLs, browser parsing for pasted content
  const handleFetch = useCallback(async (url: string | null, manualText: string | null, rawHtml?: string | null) => {

    setLoading(true);
    setStatusMessage(null);
    setLastDiff(null);
    setShowSummary(false);
    setShowManualFallback(false);

    const userName = profile?.displayName || '';

    try {
      const rawHtmlHasHerzliyaUrl = rawHtml ? /https?:\/\/[^\s"']*hsil\.acc\.co\.il[^\s"']*/i.test(rawHtml) : false;
      const manualTextHasUrl = manualText ? /https?:\/\/[^\s]+/i.test(manualText) : false;

      // Raw HTML from clipboard (Herzliya page Ctrl+A Ctrl+C)
      if (rawHtml) {
        if (url || isHerzliyaHTML(rawHtml) || rawHtmlHasHerzliyaUrl) {
          setFetchProgress({ step: 'connecting', message: 'שולח את לוח הרצליה לעיבוד מלא ברקע...' });
          setLoading(false);
          const sourceText = manualText || rawHtml || url || '';
          await submitScheduleRequest(sourceText);
          return;
        }
      }

      // Manual text input (no URL detected)
      if (manualText && !url) {
        if (isHerzliyaHTML(manualText) || manualTextHasUrl) {
          setFetchProgress({ step: 'connecting', message: 'שולח את לוח הרצליה לעיבוד מלא ברקע...' });
          setLoading(false);
          await submitScheduleRequest(manualText);
          return;
        }

        setFetchProgress({ step: 'parsing', message: useAI ? 'מנתח עם AI...' : getStepMessage('parsing') });

        // Try AI parsing if enabled
        if (useAI) {
          const aiParsed = await handleAIParse(manualText);
          if (aiParsed && aiParsed.productions.length > 0) {
            setFetchProgress({ step: 'done', message: `AI זיהה ${aiParsed.productions.length} הפקות` });
            await processSchedule(aiParsed);
            return;
          }
          // Fall through to standard parser if AI fails
          setFetchProgress({ step: 'parsing', message: 'AI לא הצליח, מנסה פרסור רגיל...' });
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

      // URL detected - skip CORS proxy attempts, go directly to GitHub Action
      // The Herzliya server blocks external proxies, only GitHub servers can access it
      setFetchProgress({ step: 'connecting', message: 'שולח לעיבוד ברקע...' });
      setLoading(false);

      const fakeMessage = `שלום ${userName}\nלוח עבודה\n${url}`;
      await submitScheduleRequest(fakeMessage);
    } catch (error) {
      setFetchProgress({ step: 'error', message: 'שגיאה' });
      throw error;
    } finally {
      setLoading(false);
      setTimeout(() => setFetchProgress(null), 3000);
    }
  }, [processSchedule, profile, submitScheduleRequest, useAI, handleAIParse]);

  const handleActionRequest = useCallback(async (
    url: string,
    workerName?: string | null,
    weekStartLabel?: string | null,
    weekEndLabel?: string | null,
  ) => {
    const nameLine = workerName || profile?.displayName || '';
    const dateLine = weekStartLabel && weekEndLabel ? `${weekStartLabel} - ${weekEndLabel}` : '';
    const parts = [nameLine ? `שלום ${nameLine}` : '', dateLine, url].filter(Boolean);
    const message = parts.join('\n');
    await submitScheduleRequest(message);
  }, [profile, submitScheduleRequest]);

  // Handle manual HTML paste
  const handleManualHtmlPaste = useCallback(async (html: string) => {
    setLoading(true);
    setShowManualFallback(false);
    setFetchProgress({ step: 'parsing', message: getStepMessage('parsing') });

    try {
      const hasHerzliyaUrl = /https?:\/\/[^\s"']*hsil\.acc\.co\.il[^\s"']*/i.test(html);
      if (isHerzliyaHTML(html) || hasHerzliyaUrl) {
        if (hasHerzliyaUrl) {
          setFetchProgress({ step: 'connecting', message: 'שולח את לוח הרצליה לעיבוד מלא ברקע...' });
          setLoading(false);
          await submitScheduleRequest(html);
          return;
        }
        setStatusMessage('הדבקת HTML של הרציליה בלי לינק. כדי לשמור צוות מלא, הדבק את הודעת ה־WhatsApp עם הקישור.');
        setFetchProgress({ step: 'error', message: 'חסר קישור של הרציליה' });
        return;
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
      setFetchProgress({ step: 'error', message: 'לא נמצאו הפקות' });
    } catch (error) {
      setStatusMessage('שגיאה בעיבוד הטקסט');
    } finally {
      setLoading(false);
      setTimeout(() => setFetchProgress(null), 3000);
    }
  }, [processSchedule, submitScheduleRequest]);

  // (Test button removed - REST API confirmed working)

  // Reload from Firestore
  const handleReload = async () => {
    if (!currentWeekId) return;
    setLoading(true);
    try {
      const existing = await loadExistingWeek(currentWeekId);
      if (existing.length > 0) {
        setProductions(existing);
        productionsByWeekRef.current.set(currentWeekId, existing);
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

        <div className="flex items-center gap-2">
          {/* AI Toggle */}
          <button
            onClick={() => setUseAI(!useAI)}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold transition-all ${
              useAI ? 'text-white shadow-lg shadow-purple-500/20' : ''
            }`}
            style={{
              background: useAI ? 'linear-gradient(135deg, #7c3aed, #3b82f6)' : 'var(--theme-bg-secondary)',
              color: useAI ? '#fff' : 'var(--theme-text-secondary)',
            }}
            title={useAI ? 'AI פעיל - לחץ לכיבוי' : 'הפעל פרסור AI חכם'}
          >
            <Sparkles className="w-3.5 h-3.5" />
            {useAI ? 'AI פעיל' : 'AI'}
          </button>

          {/* Google Calendar Sync */}
          {productions.length > 0 && (
            <button
              onClick={async () => {
                const today = new Date().toISOString().split('T')[0];
                const todayProds = productions.filter(p => p.date >= today);
                if (todayProds.length === 0) { setStatusMessage('אין הפקות עתידיות לסנכרון'); return; }
                for (const prod of todayProds.slice(0, 5)) {
                  await syncToGoogleCalendar(prod);
                }
              }}
              disabled={gcalSyncing !== null}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-medium transition-all hover:shadow-md"
              style={{ background: 'var(--theme-bg-secondary)', color: 'var(--theme-text-secondary)' }}
              title="סנכרן הפקות ל-Google Calendar"
            >
              {gcalSyncing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CalendarPlus className="w-3.5 h-3.5" />}
              GCal
            </button>
          )}

          {productions.length > 0 && (
            <button
              onClick={() => {
                const myShifts = productions.filter(p =>
                  p.isCurrentUserShift || p.crew.some(c => {
                    const names = [profile?.displayName, workerName].filter(Boolean) as string[];
                    return names.some(n => c.name === n || c.name.includes(n) || n.includes(c.name));
                  })
                );
                if (myShifts.length === 0) { alert('אין הפקות להצגה'); return; }
                const byDay: Record<string, typeof myShifts> = {};
                myShifts.forEach(p => {
                  if (!byDay[p.date]) byDay[p.date] = [];
                  byDay[p.date].push(p);
                });
                const lines = [`📋 *לוח עבודה שבועי*`, `📅 ${weekStart} – ${weekEnd}`, ''];
                Object.entries(byDay).sort(([a], [b]) => a.localeCompare(b)).forEach(([, prods]) => {
                  lines.push(`*${prods[0].day} ${prods[0].date}:*`);
                  prods.forEach(p => {
                    lines.push(`  • ${p.name} | ${p.startTime}–${p.endTime}${p.studio ? ` | ${p.studio}` : ''}`);
                  });
                  lines.push('');
                });
                window.open(`https://wa.me/?text=${encodeURIComponent(lines.join('\n'))}`, '_blank');
              }}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-medium transition-all bg-green-600 hover:bg-green-700 text-white"
            >
              📤 שתף שבוע
            </button>
          )}
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

      {/* AI Status */}
      {aiStatus && (
        <div className="mb-4 p-3 rounded-xl flex items-center gap-3" style={{ background: 'linear-gradient(135deg, rgba(124,58,237,0.1), rgba(59,130,246,0.1))', border: '1px solid rgba(124,58,237,0.2)' }}>
          <Loader2 className="w-4 h-4 animate-spin text-purple-400" />
          <span className="text-sm text-purple-300">{aiStatus}</span>
        </div>
      )}

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

      {/* Calendar - always show once we have a valid range */}
      {renderedRange.start && renderedRange.end && (
        <WeeklyCalendar
          productions={visibleProductions}
          weekStart={renderedRange.start}
          weekEnd={renderedRange.end}
          workerName={workerName}
          currentUserName={profile?.displayName || ''}
          onNavigate={handleCalendarNavigate}
          onViewChange={handleViewChange}
          calendarView={calendarView}
          calendarYear={calendarYear}
          calendarMonth={calendarMonth}
          navLoading={navLoading}
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

// ═══════════════════════════════════════════════
// Schedule Request Status Component
// ═══════════════════════════════════════════════
function ScheduleRequestStatus({
  status,
  error,
  workerName,
}: {
  status: RequestStatus;
  error: string | null;
  workerName: string;
}) {
  const steps = [
    { id: 1, text: 'ההודעה התקבלה', icon: '✅' },
    { id: 2, text: 'מתחבר לשרת הרצליה...', icon: '🔗' },
    { id: 3, text: 'קורא לוח שידורים', icon: '📋' },
    { id: 4, text: 'מעבד נתוני צוות', icon: '👥' },
    { id: 5, text: 'שומר ביומן', icon: '💾' },
  ];

  const activeStep = status === 'pending' ? 2 : status === 'processing' ? 3 : status === 'done' ? 6 : 0;

  if (status === 'error') {
    return (
      <div className="mb-6 rounded-xl border overflow-hidden p-4" style={{
        background: 'var(--theme-bg-secondary)',
        borderColor: 'rgba(239, 68, 68, 0.3)',
      }}>
        <div className="flex items-center gap-3">
          <AlertTriangleIcon className="w-5 h-5 text-red-400" />
          <div>
            <h3 className="text-sm font-bold text-red-400">שגיאה בעיבוד</h3>
            <p className="text-xs" style={{ color: 'var(--theme-text-secondary)' }}>
              {error || 'נסה שוב מאוחר יותר'}
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="mb-6 rounded-xl border overflow-hidden" style={{
      background: 'var(--theme-bg-secondary)',
      borderColor: status === 'done' ? 'rgba(34, 197, 94, 0.3)' : 'rgba(251, 191, 36, 0.3)',
    }}>
      <div className="p-4">
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            {status === 'done' ? (
              <CheckCircle className="w-5 h-5 text-green-400" />
            ) : (
              <Loader2 className="w-5 h-5 text-amber-400 animate-spin" />
            )}
            <h3 className="text-sm font-bold" style={{ color: 'var(--theme-text)' }}>
              {status === 'done' ? 'הלוח עודכן!' : `טוען את הלוח של ${workerName || 'העובד'}...`}
            </h3>
          </div>
          {status !== 'done' && (
            <span className="text-[10px] px-2 py-1 rounded-full" style={{
              background: 'rgba(251, 191, 36, 0.1)',
              color: 'var(--theme-text-secondary)',
            }}>
              בדרך כלל 1-3 דקות
            </span>
          )}
        </div>

        {/* Steps */}
        <div className="space-y-2">
          {steps.map(step => {
            const isDone = step.id < activeStep;
            const isActive = step.id === activeStep;
            const isPending = step.id > activeStep;

            return (
              <div key={step.id} className="flex items-center gap-3">
                <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs flex-shrink-0 ${
                  isDone ? 'bg-green-500/20' : isActive ? 'bg-amber-500/20' : 'bg-white/5'
                }`}>
                  {isDone ? '✓' : isActive ? (
                    <div className="w-3 h-3 rounded-full border-2 border-amber-400 border-t-transparent animate-spin" />
                  ) : (
                    <span className="text-[10px]" style={{ color: 'var(--theme-text-secondary)' }}>{step.id}</span>
                  )}
                </div>
                <span className={`text-xs font-medium ${
                  isDone ? 'text-green-400' : isActive ? 'text-amber-300' : ''
                }`} style={isPending ? { color: 'var(--theme-text-secondary)', opacity: 0.5 } : isDone ? {} : {}}>
                  {step.icon} {step.text}
                </span>
              </div>
            );
          })}
        </div>
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
          לא הצלחתי להתחבר לשרת הרצליה
        </h3>
        <div className="text-xs space-y-1" style={{ color: 'var(--theme-text-secondary)' }}>
          <p>אנא בצע את הצעדים הבאים:</p>
          <ol className="list-decimal pr-5 space-y-0.5">
            <li>פתח את הלינק בדפדפן</li>
            <li>סמן &quot;הצבת מחלקה&quot; אם רלוונטי</li>
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
        {loading ? 'מעבד...' : '📋 עבד תוכן מודבק'}
      </button>
    </div>
  );
}


























