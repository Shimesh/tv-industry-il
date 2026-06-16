'use client';

import { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import Link from 'next/link';
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
  canonicalProductionName,
} from '@/lib/productionDiff';
import { CalendarView } from '@/components/productions/CalendarNavigation';
import { ClaimShiftsModal } from '@/components/productions/ClaimShiftsModal';
import { parseScheduleHTML, parseManualText, parseHerzliyaHTML, isHerzliyaHTML } from '@/lib/productionScheduleParser';
import { normalizeContactName } from '@/lib/contactsUtils';
import {
  deduplicateCrewEntries,
  normalizePhone,
  normalizeName,
  normalizeRole,
} from '@/lib/crewNormalization';
import { fetchScheduleFromBrowser, FetchProgress, getStepMessage } from '@/lib/browserFetch';
// Firebase SDK imports removed - all Firestore ops now use REST API
import { Clapperboard, RefreshCw, Clock, CheckCircle, AlertTriangle as AlertTriangleIcon, Loader2, Sparkles, CalendarPlus, ExternalLink, Wand2, Users, ChevronDown, User, X, Search, LockKeyhole } from 'lucide-react';
import { useNotifications } from '@/contexts/NotificationContext';
import { initiateGoogleCalendarConnect, syncProductionToCalendar, updateProductionInCalendar } from '@/lib/googleCalendar';
import { useTeam } from '@/hooks/useTeam';
import { useSearchParams, useRouter } from 'next/navigation';
import { registerFcmToken } from '@/components/FCMTokenRegistration';

const USER_SCHEDULES_ROOT = 'userSchedules';
const getUserProductionsRoot = (uid: string) => `productions/${uid}/weeks`;

export default function ProductionsPage() {
  const { user, loading } = useAuth();

  // Auth loads in < 200ms from IndexedDB — blank is less jarring than a spinner
  if (loading) return null;
  if (!user) return <ProductionsLoginRequired />;

  return <ProductionsContent />;
}

function ProductionsLoadingState() {
  return (
    <div className="min-h-[60vh] flex items-center justify-center" dir="rtl">
      <div className="text-center">
        <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-gradient-to-br from-purple-500 to-blue-500 flex items-center justify-center">
          <Loader2 className="w-8 h-8 text-white animate-spin" />
        </div>
        <p className="text-[var(--theme-text-secondary)]">טוען...</p>
      </div>
    </div>
  );
}

function ProductionsLoginRequired() {
  return (
    <main className="min-h-[70vh] flex items-center justify-center px-4 py-12" dir="rtl">
      <section className="w-full max-w-md text-center rounded-2xl border p-8 app-panel" style={{ borderColor: 'var(--theme-border)' }}>
        <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-full bg-[var(--theme-accent)]/10 text-[var(--theme-accent)]">
          <LockKeyhole className="h-7 w-7" aria-hidden="true" />
        </div>
        <h1 className="mb-3 text-2xl font-bold text-[var(--theme-text)]">
          עליך להיות משתמש רשום כדי לצפות בלוחות העבודה
        </h1>
        <Link
          href="/login"
          className="mt-5 inline-flex items-center justify-center rounded-lg bg-[var(--theme-accent)] px-5 py-3 font-semibold text-white transition-opacity hover:opacity-90 focus:outline-none focus:ring-2 focus:ring-[var(--theme-accent)] focus:ring-offset-2 focus:ring-offset-[var(--theme-bg)]"
        >
          התחברות / הרשמה
        </Link>
      </section>
    </main>
  );
}

// Request status type
type RequestStatus = 'idle' | 'pending' | 'processing' | 'done' | 'error';

type GlobalWeeksResponse = {
  success: boolean;
  weeks?: string[];
  latestWeekId?: string | null;
};

function roundTime30(t: string): string {
  const [h, m] = (t || '').split(':').map(Number);
  if (isNaN(h) || isNaN(m)) return t;
  const rm = m < 15 ? 0 : m < 45 ? 30 : 0;
  const rh = m >= 45 ? h + 1 : h;
  return `${rh}:${String(rm).padStart(2, '0')}`;
}

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

// Compute Saturday date string from a Sunday-based weekId (YYYY-MM-DD)
function getWeekEndStr(weekId: string): string {
  const [y, m, d] = weekId.split('-').map(Number);
  const sat = new Date(y, (m || 1) - 1, (d || 1) + 6);
  return `${sat.getFullYear()}-${String(sat.getMonth() + 1).padStart(2, '0')}-${String(sat.getDate()).padStart(2, '0')}`;
}

// Returns true if any crew member's name matches the given display name
function isCrewMatch(crew: Array<{ name?: string; normalizedName?: string }>, displayName: string): boolean {
  if (!displayName) return false;
  const norm = (s: string) => s.trim().replace(/\s+/g, ' ').toLowerCase();
  const target = norm(displayName);
  return crew.some(
    (c) => (c.name && norm(c.name) === target) || (c.normalizedName && norm(c.normalizedName) === target),
  );
}

function isProductionAssignedToUser(production: Production, names: string[]): boolean {
  if (production.isCurrentUserShift) return true;
  const candidates = names.map((name) => name.trim()).filter(Boolean);
  return production.crew.some((crewMember) =>
    candidates.some((name) => {
      if (crewMember.name === name) return true;
      const crewParts = crewMember.name.trim().split(/\s+/);
      const nameParts = name.trim().split(/\s+/);
      return (
        (crewParts.length === 1 || nameParts.length === 1) &&
        crewParts[0] === nameParts[0] &&
        crewParts[0].length >= 2
      );
    }),
  );
}

// Final cross-source deduplication: same production can arrive from personal path (one ID)
// and from global/Herzliya sync (a different ID) — merge them by name+date+startTime.
function deduplicateProductionsByIdentity(prods: Production[]): Production[] {
  const seen = new Map<string, Production>();
  for (const p of prods) {
    // Always clean up crew duplicates within each production first (ShowCrew can list same person twice)
    const cleanP = { ...p, crew: deduplicateCrew(p.crew) };
    if (!cleanP.date) { seen.set(cleanP.id || Math.random().toString(), cleanP); continue; }
    // Use canonical name (strips draft qualifiers like "(לוז לא סופי)") and BOTH
    // sorted times so that different-shift productions (e.g. 19:00-25:00 vs 25:00-15:00)
    // are NOT merged even when they share the same max time value.
    const canonName = canonicalProductionName(cleanP.name || '');
    const times = [roundTime30(cleanP.startTime || ''), roundTime30(cleanP.endTime || '')].sort();
    const key = `${canonName}::${cleanP.date}::${times[0]}::${times[1]}`;
    const existing = seen.get(key);
    if (!existing) {
      seen.set(key, cleanP);
    } else {
      // Merge duplicate: keep base with more crew, fill in missing fields, union crew lists
      const base = cleanP.crew.length >= existing.crew.length ? cleanP : existing;
      const other = cleanP.crew.length >= existing.crew.length ? existing : cleanP;
      const mergedCrew = deduplicateCrew([...base.crew, ...other.crew]);
      seen.set(key, {
        ...base,
        studio: base.studio || other.studio,
        startTime: base.startTime || other.startTime,
        endTime: base.endTime || other.endTime,
        crew: mergedCrew,
        isCurrentUserShift: base.isCurrentUserShift || other.isCurrentUserShift,
      });
    }
  }
  return Array.from(seen.values());
}

// Merge global productions into the user's own set; extras get isCurrentUserShift re-evaluated
function mergeGlobalProductions(
  userProds: Production[],
  globalProds: Production[],
  currentUserDisplayName: string,
): Production[] {
  const globalById = new Map(globalProds.map((p) => [p.id, p]));
  // Enrich existing personal productions with fields missing from the GitHub Action path (e.g. studio)
  const enriched = userProds.map((p) => {
    const g = p.id ? globalById.get(p.id) : undefined;
    if (!g) return p;
    return { ...p, studio: p.studio || g.studio || '' };
  });
  const userIds = new Set(userProds.map((p) => p.id));
  const extras = globalProds
    .filter((p) => p.id && !userIds.has(p.id))
    .map((p) => ({
      ...p,
      isCurrentUserShift: isCrewMatch(p.crew ?? [], currentUserDisplayName),
    }));
  return [...enriched, ...extras];
}

function ProductionsContent() {
  const { user, profile, updateUserProfile } = useAuth();
  const { addNotification } = useNotifications();
  const { teams } = useTeam();
  const searchParams = useSearchParams();
  const router = useRouter();
  const [selectedTeamId, setSelectedTeamId] = useState<string | null>(null);
  const [showTeamSelector, setShowTeamSelector] = useState(false);

  // Initialize team from URL query param
  useEffect(() => {
    const teamParam = searchParams.get('team');
    if (teamParam && teams.some(t => t.id === teamParam)) {
      setSelectedTeamId(teamParam);
    }
  }, [searchParams, teams]);

  const [pendingScrollDate, setPendingScrollDate] = useState<string | null>(null);
  const [highlightedDate, setHighlightedDate] = useState<string | null>(null);

  // Navigate to week and highlight day when arriving from widget "לצפייה בלוח המלא"
  useEffect(() => {
    const dateParam = searchParams.get('date');
    if (!dateParam || !/^\d{4}-\d{2}-\d{2}$/.test(dateParam)) return;
    setCurrentDate(new Date(dateParam + 'T12:00:00'));
    setPendingScrollDate(dateParam);
    const team = searchParams.get('team');
    router.replace(team ? `/productions?team=${team}` : '/productions', { scroll: false });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const selectedTeam = teams.find(t => t.id === selectedTeamId) || null;

  const handleTeamChange = (teamId: string | null) => {
    setSelectedTeamId(teamId);
    setShowTeamSelector(false);
    // Update URL
    if (teamId) {
      router.replace(`/productions?team=${teamId}`, { scroll: false });
    } else {
      router.replace('/productions', { scroll: false });
    }
    // Reset productions when switching context
    reloadDoneRef.current = false;
    usersMapRef.current = null;
    lastCrewKeyRef.current = '';
    setProductions([]);
    setCurrentWeekId(null);
  };
  const [loading, setLoading] = useState(false);
  const [useAI, setUseAI] = useState(false);
  const [aiStatus, setAiStatus] = useState('');
  const [gcalSyncing, setGcalSyncing] = useState<string | null>(null);
  const [gcalConnecting, setGcalConnecting] = useState(false);
  const [showCalendarMenu, setShowCalendarMenu] = useState(false);
  const [herzliyaCookie, setHerzliyaCookie] = useState('');
  const [cookieSaveStatus, setCookieSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [gcalBulkProgress, setGcalBulkProgress] = useState<{ done: number; total: number } | null>(null);
  const [gcalWeekSyncing, setGcalWeekSyncing] = useState<'prev' | 'current' | 'next' | null>(null);
  const [calendarEventMap, setCalendarEventMap] = useState<Record<string, string>>({});
  const [calendarMapLoaded, setCalendarMapLoaded] = useState(false);
  const [calendarMenuMsg, setCalendarMenuMsg] = useState<{ text: string; ok: boolean } | null>(null);
  const [productions, setProductions] = useState<Production[]>([]);
  const [summaryProductions, setSummaryProductions] = useState<Production[]>([]);
  const [weekStart, setWeekStart] = useState('');
  const [weekEnd, setWeekEnd] = useState('');
  const [workerName, setWorkerName] = useState('');
  const [currentWeekId, setCurrentWeekId] = useState<string | null>(null);

  useEffect(() => {
    if (!pendingScrollDate) return;
    const el = document.getElementById(`day-${pendingScrollDate}`);
    if (!el) return;
    setPendingScrollDate(null);
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    setHighlightedDate(pendingScrollDate);
    const t = setTimeout(() => setHighlightedDate(null), 1200);
    return () => clearTimeout(t);
  }, [pendingScrollDate, currentWeekId]);

  const [lastDiff, setLastDiff] = useState<ScheduleDiff | null>(null);
  const [showSummary, setShowSummary] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [fetchProgress, setFetchProgress] = useState<FetchProgress | null>(null);
  const [showManualFallback, setShowManualFallback] = useState(false);
  const [requestStatus, setRequestStatus] = useState<RequestStatus>('idle');
  const [requestError, setRequestError] = useState<string | null>(null);
  const unsubRequestRef = useRef<(() => void) | null>(null);
  // unsubWeekRef removed - listenToWeek was using broken SDK
  const loadTokenRef = useRef(0);

    // Calendar navigation state
  const [calendarView, setCalendarView] = useState<CalendarView>('week');
  const [currentDate, setCurrentDate] = useState(() => new Date());
  const [calendarYear, setCalendarYear] = useState(() => new Date().getFullYear());
  const [calendarMonth, setCalendarMonth] = useState(() => new Date().getMonth());
  const [navLoading, setNavLoading] = useState(false);
  const [lastSyncAt, setLastSyncAt] = useState<number | null>(null);
  // Infinite scroll state for list view
  const [listViewExtraWeeks, setListViewExtraWeeks] = useState(0);
  const [loadingMoreList, setLoadingMoreList] = useState(false);
  const [hasMoreList, setHasMoreList] = useState(true);
  const productionsByWeekRef = useRef<Map<string, Production[]>>(new Map());
  // Prevents double-load: set to true after handleReloadLatest succeeds on mount
  const reloadDoneRef = useRef(false);
  // Cache users name→uid map to avoid full collection read on every save
  const usersMapRef = useRef<Map<string, string> | null>(null);
  // Track updateCount per weekId client-side to avoid a pre-read round-trip on every save
  const weekUpdateCountRef = useRef<Map<string, number>>(new Map());
  // Track last synced crew fingerprint to avoid re-running ensureFromCrew unnecessarily
  const lastCrewKeyRef = useRef('');
  // Crew identity - matches logged-in user to a crew member in productions
  const [showCrewIdentity, setShowCrewIdentity] = useState(false);
  const [crewSuggestions, setCrewSuggestions] = useState<Array<{ name: string; role: string; score: number }>>([]);
  const [crewNameInput, setCrewNameInput] = useState('');
  const crewIdentityCheckedRef = useRef(false);
  // Shadow profile claiming — for users whose shifts exist by name but no phone
  const [claimMatches, setClaimMatches] = useState<Production[]>([]);
  const [claimCrewName, setClaimCrewName] = useState('');
  const [claimProfession, setClaimProfession] = useState('');
  const [showClaimModal, setShowClaimModal] = useState(false);
  const claimCheckedRef = useRef(false);
  // Profile ref — lets loadExistingWeek read the latest profile without being in its dep array
  const profileRef = useRef(profile);
  useEffect(() => { profileRef.current = profile; }, [profile]);
  // Cleanup listeners on unmount
  useEffect(() => {
    return () => {
      unsubRequestRef.current?.();
      // unsubWeekRef removed
    };
  }, []);

  // Handle redirect back from Google OAuth on mobile
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const gcalStatus = params.get('gcal');
    if (gcalStatus === 'connected') {
      setStatusMessage('Google Calendar חובר בהצלחה!');
      const url = new URL(window.location.href);
      url.searchParams.delete('gcal');
      url.searchParams.delete('email');
      window.history.replaceState({}, '', url.toString());
    } else if (gcalStatus === 'error') {
      setStatusMessage('שגיאה בחיבור ל-Google Calendar');
      const url = new URL(window.location.href);
      url.searchParams.delete('gcal');
      window.history.replaceState({}, '', url.toString());
    }
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
      if (!res.ok) {
        console.warn('[restListDocs] HTTP error', res.status, 'for', collectionPath);
        return [];
      }
      const data = await res.json();
      if (!data.documents) {
        console.warn('[restListDocs] No documents at', collectionPath);
        return [];
      }

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

  const reconcileContactsFromServer = useCallback(async (prods: Production[], token: string) => {
    if (!prods.length) return;

    const response = await fetch('/api/contacts/reconcile', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        productions: prods.map((production) => ({
          id: production.id,
          crew: sanitizeCrewForFirestore(deduplicateCrew(production.crew)),
        })),
      }),
    });

    if (!response.ok) {
      const payload = await response.json().catch(() => ({ error: `HTTP ${response.status}` })) as { error?: string };
      throw new Error(payload.error || 'Failed to reconcile contacts');
    }
  }, []);

  // Load existing week data via REST API - supports both personal and team paths
  const loadExistingWeek = useCallback(async (weekId: string): Promise<Production[]> => {
    if (!user) return [];
    try {
      // Choose path based on team context
      const root = selectedTeamId
        ? `teams/${selectedTeamId}/weeks`
        : getUserProductionsRoot(user.uid);
      const path = `${root}/${weekId}/productions`;
      console.warn('[loadExistingWeek] Loading from:', path);

      // In team mode skip global merge — the team path already acts as a shared source
      if (selectedTeamId) {
        const prodDocs = await restListDocs(path);
        return prodDocs.length > 0 ? parseProductionDocs(prodDocs, weekId) : [];
      }

      // Personal mode: fetch linked identity data + global data in parallel
      const weekStart = weekId;
      const weekEnd = getWeekEndStr(weekId);
      const token = await user.getIdToken().catch(() => '');

      const currentProfile = profileRef.current;
      const normalizedPhone = normalizePhone(currentProfile?.phone || '');
      const profileIdentityId = currentProfile?.profileId || (currentProfile?.linkedContactId ? String(currentProfile.linkedContactId) : '');

      const [personalRes, globalRes, phoneRes, profileRes] = await Promise.all([
        token
          ? fetch(`/api/productions/personal?weekId=${weekId}`, {
              headers: { Authorization: `Bearer ${token}` },
              cache: 'no-store',
            })
              .then((r) => (r.ok ? (r.json() as Promise<{ productions: Production[] }>) : { productions: [] as Production[] }))
              .catch(() => ({ productions: [] as Production[] }))
          : Promise.resolve({ productions: [] as Production[] }),
        token
          ? fetch(`/api/productions/week?weekStart=${weekStart}&weekEnd=${weekEnd}`, {
              headers: { Authorization: `Bearer ${token}` },
              cache: 'no-store',
            })
              .then((r) => (r.ok ? (r.json() as Promise<{ productions: Production[]; lastSyncAt?: number | null }>) : { productions: [] as Production[], lastSyncAt: null }))
              .catch(() => ({ productions: [] as Production[], lastSyncAt: null }))
          : Promise.resolve({ productions: [] as Production[], lastSyncAt: null }),
        // Secondary source: global_productions queried by phone (server-side filtered)
        token && normalizedPhone
          ? fetch(`/api/productions/global?phone=${encodeURIComponent(normalizedPhone)}&weekStart=${weekStart}&weekEnd=${weekEnd}`, {
              headers: { Authorization: `Bearer ${token}` },
              cache: 'no-store',
            })
              .then((r) => (r.ok ? (r.json() as Promise<{ productions: Production[] }>) : { productions: [] as Production[] }))
              .catch(() => ({ productions: [] as Production[] }))
          : Promise.resolve({ productions: [] as Production[] }),
        token && profileIdentityId
          ? fetch(`/api/productions/global?profileId=${encodeURIComponent(profileIdentityId)}&weekStart=${weekStart}&weekEnd=${weekEnd}`, {
              headers: { Authorization: `Bearer ${token}` },
              cache: 'no-store',
            })
              .then((r) => (r.ok ? (r.json() as Promise<{ productions: Production[] }>) : { productions: [] as Production[] }))
              .catch(() => ({ productions: [] as Production[] }))
          : Promise.resolve({ productions: [] as Production[] }),
      ]);

      console.warn('[loadExistingWeek] personal docs:', personalRes.productions?.length ?? 0, '/ global docs:', globalRes.productions?.length ?? 0, '/ phone-matched:', phoneRes.productions?.length ?? 0, '/ profile-matched:', profileRes.productions?.length ?? 0);

      if (typeof globalRes.lastSyncAt === 'number') setLastSyncAt(globalRes.lastSyncAt);

      const userProds = personalRes.productions ?? [];
      const displayName = currentProfile?.crewName || currentProfile?.displayName || user.displayName || '';

      // Merge legacy global (name-based), phone matches, then linked profile matches.
      const afterLegacy = mergeGlobalProductions(userProds, globalRes.productions ?? [], displayName);
      const afterPhone = mergeGlobalProductions(afterLegacy, phoneRes.productions ?? [], displayName);
      const afterProfile = mergeGlobalProductions(afterPhone, profileRes.productions ?? [], displayName);
      // Final dedup: same event can arrive from personal path AND from Herzliya global sync
      // with different IDs — merge them by (name, date, startTime) to eliminate visual duplicates
      return deduplicateProductionsByIdentity(afterProfile);
    } catch (error) {
      console.error('[loadExistingWeek] Error:', error);
      return [];
    }
  }, [user, selectedTeamId, restListDocs, parseProductionDocs]);

  const fetchGlobalWeekIds = useCallback(async (): Promise<string[]> => {
    if (!user || selectedTeamId) return [];

    try {
      const token = await user.getIdToken().catch(() => '');
      if (!token) return [];

      const response = await fetch('/api/productions/global?scope=weeks', {
        headers: { Authorization: `Bearer ${token}` },
        cache: 'no-store',
      });
      if (!response.ok) return [];

      const payload = (await response.json()) as GlobalWeeksResponse;
      return Array.isArray(payload.weeks) ? payload.weeks.filter(Boolean) : [];
    } catch {
      return [];
    }
  }, [user, selectedTeamId]);

  // Search all loaded productions for crew members matching a display name
  const findCrewMatches = useCallback((displayName: string) => {
    const norm = normalizeName(displayName);
    if (!norm || norm.length < 2) return [];
    const firstNameNorm = norm.split(/\s+/)[0];

    const seen = new Map<string, { name: string; role: string; score: number }>();
    for (const weekProds of productionsByWeekRef.current.values()) {
      for (const prod of weekProds) {
        for (const crew of prod.crew) {
          if (!crew.name) continue;
          const crewNorm = normalizeName(crew.name);
          if (!crewNorm) continue;
          const crewFirst = crewNorm.split(/\s+/)[0];
          let score = 0;
          if (crewNorm === norm) score = 3;
          else if (crewFirst === firstNameNorm && firstNameNorm.length >= 2) score = 2;
          else if (crewNorm.includes(firstNameNorm) || norm.includes(crewFirst)) score = 1;
          if (score > 0) {
            const existing = seen.get(crewNorm);
            if (!existing || score > existing.score) {
              seen.set(crewNorm, { name: crew.name, role: crew.role || crew.roleDetail || '', score });
            }
          }
        }
      }
    }
    return Array.from(seen.values()).sort((a, b) => b.score - a.score).slice(0, 5);
  }, []);

  // Confirm crew identity: save to profile and use as workerName
  const handleCrewIdentityConfirm = useCallback(async (name: string) => {
    const trimmed = name.trim();
    if (!trimmed) return;
    setWorkerName(trimmed);
    setShowCrewIdentity(false);
    try {
      await updateUserProfile({ crewName: trimmed, onboardingComplete: true });
      if (profile?.uid) void registerFcmToken(profile.uid);
    } catch {
      // non-critical — identity still applied locally
    }
  }, [updateUserProfile, profile?.uid]);

  // After productions load, auto-detect crew identity if not yet confirmed
  useEffect(() => {
    if (crewIdentityCheckedRef.current) return;
    if (!profile) return;
    if (profile.crewName) {
      // Already confirmed — just sync workerName locally
      if (!workerName) setWorkerName(profile.crewName);
      return;
    }
    if (productionsByWeekRef.current.size === 0) return;
    crewIdentityCheckedRef.current = true;
    const suggestions = findCrewMatches(profile.displayName);
    setCrewSuggestions(suggestions);
    setCrewNameInput(profile.displayName);
    setShowCrewIdentity(true);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile, productions]);

  // Shadow-profile claim: if phone produces 0 matches but a name search finds results, show claim modal
  useEffect(() => {
    if (claimCheckedRef.current) return;
    if (!profile?.phone || !user) return;
    if (profile.crewName || showClaimModal) return;
    if (productionsByWeekRef.current.size === 0) return;

    const displayName = profile.displayName || user.displayName || '';
    if (!displayName) return;

    const normName = normalizeName(displayName);
    if (!normName || normName.length < 2) return;

    // Search loaded productions for crew by name only (shadow profile candidates)
    const found: Production[] = [];
    const firstNorm = normName.split(/\s+/)[0];
    let matchedCrewName = '';
    let matchedProfession = '';

    for (const weekProds of productionsByWeekRef.current.values()) {
      for (const prod of weekProds) {
        for (const c of prod.crew) {
          const cn = normalizeName(c.name);
          if (!cn) continue;
          const isMatch = cn === normName || (firstNorm.length >= 2 && cn.split(/\s+/)[0] === firstNorm);
          // Only count as shadow if the crew entry has no phone
          if (isMatch && !c.phone && !c.normalizedPhone) {
            if (!matchedCrewName) {
              matchedCrewName = c.name;
              matchedProfession = c.role || c.roleDetail || '';
            }
            if (!found.find((p) => p.id === prod.id)) found.push(prod);
          }
        }
      }
    }

    if (found.length > 0 && matchedCrewName) {
      claimCheckedRef.current = true;
      setClaimMatches(found);
      setClaimCrewName(matchedCrewName);
      setClaimProfession(matchedProfession);
      setShowClaimModal(true);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile, productions]);

  // Save productions to Firestore via REST API (bypasses broken SDK)
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
      const token = await user.getIdToken(); // no forced refresh — SDK auto-renews near expiry
      const projectId = 'tv-industry-il';
      const baseUrl = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents`;

      // Helper: convert JS value to Firestore REST format
      const toVal = (v: unknown): Record<string, unknown> => {
        if (typeof v === 'string') return { stringValue: v };
        if (typeof v === 'number') return { integerValue: String(v) };
        if (typeof v === 'boolean') return { booleanValue: v };
        if (v === null || v === undefined) return { nullValue: null };
        if (Array.isArray(v)) {
          return { arrayValue: { values: v.map(item => {
            if (typeof item === 'object' && item !== null && !Array.isArray(item)) {
              const fields: Record<string, unknown> = {};
              for (const [k, val] of Object.entries(item)) fields[k] = toVal(val);
              return { mapValue: { fields } };
            }
            return toVal(item);
          }) } };
        }
        if (typeof v === 'object') {
          const fields: Record<string, unknown> = {};
          for (const [k, val] of Object.entries(v as Record<string, unknown>)) fields[k] = toVal(val);
          return { mapValue: { fields } };
        }
        return { stringValue: String(v) };
      };

      const toFields = (obj: Record<string, unknown>) => {
        const fields: Record<string, unknown> = {};
        for (const [k, v] of Object.entries(obj)) fields[k] = toVal(v);
        return fields;
      };

      const restSet = async (docPath: string, data: Record<string, unknown>) => {
        const res = await fetch(`${baseUrl}/${docPath}`, {
          method: 'PATCH',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ fields: toFields(data) }),
        });
        if (!res.ok) {
          const err = await res.json();
          console.error('Firestore REST write failed:', docPath, err);
          throw new Error(err.error?.message || `REST error ${res.status}`);
        }
      };

      // 1. Prepare paths and IDs
      const metaPath = selectedTeamId
        ? `teams/${selectedTeamId}/weeks/${weekId}`
        : `productions/${user.uid}/weeks/${weekId}`;

      // Increment updateCount client-side — avoids a sequential pre-read round-trip
      const prevCount = weekUpdateCountRef.current.get(weekId) ?? 0;
      const updateCount = prevCount + 1;
      weekUpdateCountRef.current.set(weekId, updateCount);

      const prodIds = prods.map(p => p.id || generateProductionId(p.name, p.date, p.studio, p.startTime));
      const userSchedulePath = `userSchedules/${user.uid}/weeks/${weekId}`;
      const now = new Date().toISOString();

      let snapshotRunId = '';
      if (!selectedTeamId) {
        const snapshotResponse = await fetch('/api/productions/snapshot', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            weekId,
            productions: prods,
            source: 'manual-client-save',
          }),
        });
        if (!snapshotResponse.ok) {
          throw new Error(`Calendar snapshot failed (${snapshotResponse.status})`);
        }
        const snapshotPayload = await snapshotResponse.json() as { runId?: string };
        snapshotRunId = snapshotPayload.runId || '';
      }

      // 2. Save metadata, all productions, and user schedule — all in parallel
      await Promise.all([
        restSet(metaPath, {
          weekId,
          weekStart: wStart,
          weekEnd: wEnd,
          lastUpdated: now,
          updateCount,
        }),
        ...prods.map(async (prod, i) => {
          const prodId = prodIds[i];
          const prodPath = selectedTeamId
            ? `teams/${selectedTeamId}/weeks/${weekId}/productions/${prodId}`
            : `productions/${user.uid}/weeks/${weekId}/productions/${prodId}`;

          const cleanCrew = sanitizeCrewForFirestore(deduplicateCrew(prod.crew));

          return restSet(prodPath, {
            name: prod.name,
            studio: prod.studio,
            date: prod.date,
            day: prod.day,
            startTime: prod.startTime,
            endTime: prod.endTime,
            status: prod.status,
            herzliyaId: prod.id || '',
            lastUpdatedBy: user.uid,
            lastUpdatedByName: profile?.displayName || '',
            lastUpdatedAt: now,
            crew: cleanCrew,
            versions: prod.versions || [],
          });
        }),
        restSet(userSchedulePath, {
          workerName,
          fetchedAt: now,
          productionIds: prodIds,
        }),
      ]);

      if (snapshotRunId) {
        await fetch('/api/productions/snapshot', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ action: 'applied', runId: snapshotRunId }),
        }).catch(() => {});
      }

      console.warn('[saveToFirestore] SUCCESS - saved', prods.length, 'productions to weekId:', weekId, 'uid:', user.uid);

      // Dual-write to global_productions — fire-and-forget, never blocks existing save
      fetch('/api/productions/global', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ productions: prods, sourceWeekPath: metaPath }),
      }).then((res) => {
        if (!res.ok) console.warn('[global_productions] dual-write HTTP error:', res.status);
      }).catch((err) => console.warn('[global_productions] dual-write failed:', err));

      await reconcileContactsFromServer(prods, token);

      // Auto-update crew member profiles (pass token to avoid second refresh)
      await syncCrewProfiles(weekId, prods, wStart, wEnd, token);
    } catch (error) {
      console.error('[saveToFirestore] FAILED:', error);
      setStatusMessage('שגיאה בשמירת הנתונים: ' + (error instanceof Error ? error.message : String(error)));
    }
  }, [user, profile, workerName, selectedTeamId, reconcileContactsFromServer]);

  // Sync crew members with registered user profiles (via REST API)
  // token is passed in from saveToFirestore to avoid a second getIdToken() round-trip
  const syncCrewProfiles = useCallback(async (
    weekId: string,
    prods: Production[],
    wStart: string,
    wEnd: string,
    token: string,
  ) => {
    try {
      const allCrewNames = new Set<string>();
      for (const prod of prods) {
        for (const crew of prod.crew) {
          if (crew.name) allCrewNames.add(crew.name);
        }
      }
      if (allCrewNames.size === 0) return;

      // Use cached users map — only fetch once per session (avoids full collection read each save)
      if (!usersMapRef.current) {
        const userDocs = await restListDocs('users');
        usersMapRef.current = new Map(
          userDocs
            .filter(d => d.fields.displayName)
            .map(d => [d.fields.displayName as string, d.id]),
        );
      }
      const usersByName = usersMapRef.current;

      const projectId = 'tv-industry-il';
      const baseUrl = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents`;

      const toVal = (v: unknown): Record<string, unknown> => {
        if (typeof v === 'string') return { stringValue: v };
        if (typeof v === 'number') return { integerValue: String(v) };
        if (typeof v === 'boolean') return { booleanValue: v };
        if (v === null || v === undefined) return { nullValue: null };
        if (Array.isArray(v)) {
          return { arrayValue: { values: v.map(item => {
            if (typeof item === 'object' && item !== null && !Array.isArray(item)) {
              const fields: Record<string, unknown> = {};
              for (const [k, val] of Object.entries(item)) fields[k] = toVal(val);
              return { mapValue: { fields } };
            }
            return toVal(item);
          }) } };
        }
        if (typeof v === 'object') {
          const fields: Record<string, unknown> = {};
          for (const [k, val] of Object.entries(v as Record<string, unknown>)) fields[k] = toVal(val);
          return { mapValue: { fields } };
        }
        return { stringValue: String(v) };
      };

      const toFields = (obj: Record<string, unknown>) => {
        const fields: Record<string, unknown> = {};
        for (const [k, v] of Object.entries(obj)) fields[k] = toVal(v);
        return fields;
      };

      // Write all matched crew members in parallel
      await Promise.all(Array.from(allCrewNames).map(async (crewName) => {
        const matchedUid = usersByName.get(crewName);
        if (!matchedUid) return;

        const memberProds = prods.filter(p =>
          p.crew.some(c => c.name === crewName) && p.status !== 'cancelled'
        );

        if (memberProds.length === 0) return;

        const productionEntries = memberProds.map(p => {
          const crewEntry = p.crew.find(c => c.name === crewName);
          return {
            productionId: p.id || generateProductionId(p.name, p.date, p.studio, p.startTime),
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

        const docPath = `users/${matchedUid}/schedules/${weekId}`;
        await fetch(`${baseUrl}/${docPath}`, {
          method: 'PATCH',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ fields: toFields({
            workerName: crewName,
            weekStart: wStart,
            weekEnd: wEnd,
            productions: productionEntries,
            autoUpdatedAt: new Date().toISOString(),
            autoUpdatedBy: user?.uid || '',
          }) }),
        });
      }));
    } catch (error) {
      console.error('syncCrewProfiles failed:', error);
    }
  }, [user, restListDocs]);

  // Process parsed schedule (shared between URL fetch and manual paste)
  const processSchedule = useCallback(async (parsed: ParsedSchedule) => {
    console.warn('[processSchedule] Called with', parsed.productions.length, 'productions, weekStart:', parsed.weekStart, 'workerName:', parsed.workerName);
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
    const wName = profile?.displayName || parsed.workerName || '';

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
        void autoSyncAndNotify(diff, updated);
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
          void autoSyncAndNotify(diff, updated);
        } else {
          setProductions(existingProds);
          productionsByWeekRef.current.set(weekId, existingProds);
          setStatusMessage('הלוח כבר עדכני');
        }
      } else {
        const prodsWithIds = parsed.productions.map(p => ({
          ...p,
          id: p.id || generateProductionId(p.name, p.date, p.studio, p.startTime),
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
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, profile, currentWeekId, productions, loadExistingWeek, saveToFirestore]);

  // ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•
  // Firestore REST API helpers (bypasses broken SDK)
  //ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•
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

  // Load productionId→calendarEventId map from Firestore
  const loadCalendarEventMap = useCallback(async (): Promise<Record<string, string>> => {
    if (!user) return {};
    const data = await firestoreRestRead(`users/${user.uid}/calendarSync/eventIds`);
    if (!data) return {};
    const map: Record<string, string> = {};
    for (const [k, v] of Object.entries(data)) {
      if (typeof v === 'string') map[k] = v;
    }
    return map;
  }, [user, firestoreRestRead]);

  // Persist the full event map to Firestore (overwrite)
  const saveCalendarEventMap = useCallback(async (map: Record<string, string>): Promise<void> => {
    if (!user || Object.keys(map).length === 0) return;
    try {
      const token = await user.getIdToken();
      const projectId = 'tv-industry-il';
      const url = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/users/${user.uid}/calendarSync/eventIds`;
      const fields: Record<string, { stringValue: string }> = {};
      for (const [k, v] of Object.entries(map)) fields[k] = { stringValue: v };
      await fetch(url, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ fields }),
      });
    } catch { /* non-critical */ }
  }, [user]);


  // ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•
  // Submit schedule request via REST API for GitHub Action
  // ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•
  const submitScheduleRequest = useCallback(async (messageText: string) => {
    if (!user) return;

    const urlMatch = messageText.match(/https?:\/\/[^\s]+/);
    if (!urlMatch) {
      setStatusMessage('לא מצאתי לינק בהודעה');
      return;
    }

    const nameMatch = messageText.match(/שלום\s+([^\n,]+)/);
    const extractedWorkerName = nameMatch?.[1]?.trim() || profile?.displayName || '';
    const dateMatch = messageText.match(/(\d{2}\/\d{2}\/\d{4})\s*[-\u2013]\s*(\d{2}\/\d{2}\/\d{4})/);
    const normalizedDateLabels = dateMatch
      ? [dateMatch[1], dateMatch[2]].sort((left, right) => {
          const toIso = (value: string) => {
            const [day, month, year] = value.split('/');
            return `${year}-${month}-${day}`;
          };
          return toIso(left).localeCompare(toIso(right));
        })
      : null;

    setRequestStatus('pending');
    setRequestError(null);
    setStatusMessage(null);
    setWorkerName(extractedWorkerName);

    const applyLoadedProductions = async () => {
      if (normalizedDateLabels) {
        const [d, m, y] = normalizedDateLabels[0].split('/').map(Number);
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
            return;
          }
        } catch { /* fall through */ }
      }
      void handleReloadLatest();
    };

    try {
      const idToken = await user.getIdToken();

      // Write scheduleRequests doc + trigger GitHub Action in background (legacy fallback path)
      let docId = '';
      firestoreRestWrite('scheduleRequests', {
        userId: user.uid,
        workerName: extractedWorkerName,
        url: urlMatch[0],
        weekStart: normalizedDateLabels?.[0] || '',
        weekEnd: normalizedDateLabels?.[1] || '',
        status: 'pending',
        createdAt: 'SERVER_TIMESTAMP',
      }).then(id => { docId = id; }).catch(() => {});

      fetch('/api/trigger-action', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${idToken}` },
      }).catch(() => {});

      // Primary sync: await save-sync-url (server-side, no Puppeteer).
      // On success → show done immediately. On any failure → fall through to GitHub Action polling.
      let syncedViaApi = false;
      try {
        const syncResp = await fetch('/api/calendar/save-sync-url', {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${idToken}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ url: urlMatch[0], workerName: extractedWorkerName }),
        });
        if (syncResp.ok) {
          const syncData = await syncResp.json() as { ok: boolean; synced?: boolean; count?: number; reason?: string; studios?: Array<{ name: string; studio: string }>; debug?: string };
          console.log('[save-sync-url] response:', JSON.stringify(syncData));
          if (syncData.ok && syncData.synced) {
            syncedViaApi = true;
            await applyLoadedProductions();
            const studioInfo = syncData.studios?.map(s => s.studio).filter(Boolean).join(', ');
            setStatusMessage(studioInfo ? `נטענו ${syncData.count} הפקות | אולפן: ${studioInfo}` : `נטענו ${syncData.count} הפקות (אין מידע על אולפן)`);
            setRequestStatus('done');
            setTimeout(() => setRequestStatus('idle'), 8000);
          } else {
            if (syncData.reason !== 'empty_schedule') {
              // Only show error message for unexpected failures — empty_schedule is normal for
              // Herzliya URLs since the server can't authenticate; GitHub Action handles it.
              const debugStr = syncData.debug ? ` | ${syncData.debug.slice(0, 150)}` : '';
              setStatusMessage(`שגיאת סנכרון${debugStr}`);
            }
            console.log('[save-sync-url] response:', JSON.stringify(syncData));
          }
        }
      } catch { /* network error — fall through to GitHub Action polling */ }

      // Fallback: poll scheduleRequests for GitHub Action result
      if (!syncedViaApi) {
        const pollInterval = setInterval(async () => {
          if (!docId) return;
          try {
            const data = await firestoreRestRead(`scheduleRequests/${docId}`);
            if (!data) return;
            const status = data.status as RequestStatus;
            setRequestStatus(status);
            if (status === 'done') {
              clearInterval(pollInterval);
              await applyLoadedProductions();
              setTimeout(() => setRequestStatus('idle'), 5000);
            } else if (status === 'error') {
              clearInterval(pollInterval);
              setRequestError((data.error as string) || 'שגיאה בטעינת הלוח');
              setTimeout(() => setRequestStatus('idle'), 8000);
            }
          } catch { /* ignore poll errors */ }
        }, 10000);
        setTimeout(() => {
          clearInterval(pollInterval);
          setRequestStatus(prev =>
            prev === 'pending' || prev === 'processing' ? 'idle' : prev,
          );
        }, 5 * 60 * 1000);
      }
    } catch (error: unknown) {
      setRequestStatus('error');
      setRequestError(error instanceof Error ? error.message : 'שגיאה בשליחת הבקשה');
    }
  }, [user, profile, firestoreRestWrite, firestoreRestRead, loadExistingWeek]);

  // listenToWeek removed - was using broken SDK onSnapshot and was never called

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

    // List view: start from current week, extend by extra loaded weeks (infinite scroll)
    const start = getWeekStartDate(currentDate);
    const end = new Date(start);
    end.setDate(end.getDate() + 7 * (4 + listViewExtraWeeks) - 1);
    return {
      start: toLocalDate(start),
      end: toLocalDate(end),
    };
  }, [calendarView, currentDate, listViewExtraWeeks]);

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

      // Load current week + user schedule list + global week index in parallel.
      const [prods, scheduleDocsMain, globalWeekIds] = await Promise.all([
        loadExistingWeek(weekId),
        restListDocs(`${USER_SCHEDULES_ROOT}/${user.uid}/weeks`),
        fetchGlobalWeekIds(),
      ]);
      let scheduleDocs = scheduleDocsMain;
      if (scheduleDocs.length === 0) {
        scheduleDocs = await restListDocs(`users/${user.uid}/schedules`);
      }

      if (prods.length > 0) {
        productionsByWeekRef.current.set(weekId, prods);
        const userSchedule = scheduleDocs.find(s => s.id === weekId);
        const storedName = (userSchedule?.fields?.workerName as string) || '';
        // Prefer confirmed crew name, then profile display name, then stored name
        const wName = profile?.crewName || profile?.displayName || storedName;

        setProductions(prods);
        setWorkerName(wName);
        const satDate = new Date(sunday);
        satDate.setDate(sunday.getDate() + 6);
        setWeekStart(toLocalDate(sunday));
        setCurrentDate(new Date(sunday));
        setWeekEnd(toLocalDate(satDate));
        setCurrentWeekId(weekId);
        reloadDoneRef.current = true; // signal: period-load useEffect can skip this cycle
        // Save to localStorage cache for instant next load
        try {
          const raw = localStorage.getItem('productions_cache_v2');
          const cache = raw ? JSON.parse(raw) as Record<string, { data: unknown; savedAt: number }> : {};
          cache[weekId] = { data: prods, savedAt: Date.now() };
          localStorage.setItem('productions_cache_v2', JSON.stringify(cache));
        } catch { /* ignore */ }
        return;
      }
      const knownWeekIds = Array.from(new Set([
        ...scheduleDocs.map((doc) => doc.id).filter(Boolean),
        ...globalWeekIds,
      ])).sort((a, b) => b.localeCompare(a));

      for (const latestWeekId of knownWeekIds) {
        if (latestWeekId === weekId) continue;
        const latestProds = await loadExistingWeek(latestWeekId);
        if (latestProds.length === 0) continue;

        const latest = scheduleDocs.find((doc) => doc.id === latestWeekId);
        const latestStart = (latest?.fields.weekStart as string) || latestWeekId;
        const latestEnd = (latest?.fields.weekEnd as string) || getWeekEndStr(latestWeekId);

        productionsByWeekRef.current.set(latestWeekId, latestProds);
        setProductions(latestProds);
        setWeekStart(latestStart);
        setCurrentDate(fromLocalDate(latestStart));
        setWeekEnd(latestEnd);
        setWorkerName(profile?.crewName || profile?.displayName || (latest?.fields.workerName as string) || '');
        setCurrentWeekId(latestWeekId);
        reloadDoneRef.current = true; // signal: period-load useEffect can skip this cycle
        // Save to localStorage cache for instant next load
        try {
          const raw = localStorage.getItem('productions_cache_v2');
          const cache = raw ? JSON.parse(raw) as Record<string, { data: unknown; savedAt: number }> : {};
          cache[latestWeekId] = { data: latestProds, savedAt: Date.now() };
          localStorage.setItem('productions_cache_v2', JSON.stringify(cache));
        } catch { /* ignore */ }
        return;
      }
    } catch (error) {
    }
  }, [user, profile, loadExistingWeek, restListDocs, fetchGlobalWeekIds]);

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

  // Load more productions for list view infinite scroll
  const handleLoadMoreList = useCallback(async () => {
    if (loadingMoreList || !hasMoreList) return;
    setLoadingMoreList(true);
    try {
      const newExtraWeeks = listViewExtraWeeks + 4;
      const start = getWeekStartDate(currentDate);
      const newEnd = new Date(start);
      newEnd.setDate(newEnd.getDate() + 7 * (4 + newExtraWeeks) - 1);
      const prevCount = productions.length;
      const prods = await loadProductionsForPeriod(toLocalDate(start), toLocalDate(newEnd));
      // If no new productions were added, we've reached the end
      if (prods.length <= prevCount) {
        setHasMoreList(false);
      } else {
        setProductions(prods);
        setListViewExtraWeeks(newExtraWeeks);
      }
    } catch {
      // silently ignore
    } finally {
      setLoadingMoreList(false);
    }
  }, [loadingMoreList, hasMoreList, listViewExtraWeeks, currentDate, productions.length, loadProductionsForPeriod]);

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

  // Jump directly to the week containing a specific date (from date picker)
  const handleJumpToDate = useCallback((dateStr: string) => {
    const [y, m, d] = dateStr.split('-').map(Number);
    setCurrentDate(new Date(y, (m || 1) - 1, d || 1));
    setNavLoading(true);
  }, []);

  // Reset infinite scroll state whenever the list view resets (navigation or view switch)
  useEffect(() => {
    setListViewExtraWeeks(0);
    setHasMoreList(true);
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
      // Skip initial load if handleReloadLatest already populated data on mount
      if (reloadDoneRef.current) {
        reloadDoneRef.current = false; // allow subsequent navigations to load normally
        setNavLoading(false);
        return;
      }
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
          // List view: load only the initial 4 weeks — more loaded via infinite scroll
          start = getWeekStartDate(currentDate);
          end = new Date(start);
          end.setDate(end.getDate() + 7 * 4 - 1);
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

  // Fetch lastSyncAt once on mount so the timestamp strip always appears
  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    const today = new Date();
    const sunday = new Date(today.getFullYear(), today.getMonth(), today.getDate() - today.getDay());
    const weekStart = toLocalDate(sunday);
    const satDate = new Date(sunday.getFullYear(), sunday.getMonth(), sunday.getDate() + 6);
    const weekEnd = toLocalDate(satDate);

    user.getIdToken().then(token => {
      if (cancelled || !token) return;
      return fetch(`/api/productions/week?weekStart=${weekStart}&weekEnd=${weekEnd}`, {
        headers: { Authorization: `Bearer ${token}` },
        cache: 'no-store',
      }).then(r => r.ok ? r.json() as Promise<{ lastSyncAt?: number | null }> : null);
    }).then(data => {
      if (!cancelled && data && typeof data.lastSyncAt === 'number') {
        setLastSyncAt(data.lastSyncAt);
      }
    }).catch(() => {});

    return () => { cancelled = true; };
  }, [user]);

  useEffect(() => {
    if (!user?.uid) return;
    let cancelled = false;
    const controller = new AbortController();

    const loadSummaryRange = async () => {
      const start = getWeekStartDate(currentDate);
      const monthStart = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1);
      const monthEnd = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0);
      const rangeStart = start < monthStart ? start : monthStart;
      const rangeEnd = getWeekEndDate(currentDate) > monthEnd ? getWeekEndDate(currentDate) : monthEnd;

      try {
        const prods = await loadProductionsForPeriod(
          toLocalDate(rangeStart),
          toLocalDate(rangeEnd),
          controller.signal,
        );
        if (!cancelled) setSummaryProductions(prods);
      } catch {
        if (!cancelled) setSummaryProductions([]);
      }
    };

    void loadSummaryRange();

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [user?.uid, currentDate, loadProductionsForPeriod]);

  const calendarSummary = useMemo(() => {
    const userNames = [profile?.displayName, user?.displayName, workerName].filter(Boolean) as string[];
    const weekStartDate = toLocalDate(getWeekStartDate(currentDate));
    const weekEndDate = toLocalDate(getWeekEndDate(currentDate));
    const monthStartDate = toLocalDate(new Date(currentDate.getFullYear(), currentDate.getMonth(), 1));
    const monthEndDate = toLocalDate(new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0));

    const countRange = (start: string, end: string) => {
      const unique = new Map<string, Production>();
      for (const production of summaryProductions) {
        if (production.status === 'cancelled') continue;
        if (production.date < start || production.date > end) continue;
        const key = production.id || `${production.name}-${production.date}-${production.studio}`;
        unique.set(key, production);
      }
      const items = Array.from(unique.values());
      return {
        total: items.length,
        mine: items.filter((production) => isProductionAssignedToUser(production, userNames)).length,
      };
    };

    return {
      week: countRange(weekStartDate, weekEndDate),
      month: countRange(monthStartDate, monthEndDate),
    };
  }, [currentDate, profile?.displayName, summaryProductions, user?.displayName, workerName]);

  useEffect(() => {
    if (!productions.length) return;
    const allCrew = productions.flatMap((production) => production.crew || []);
    lastCrewKeyRef.current = allCrew.map((member) => member.identityKey || member.name).sort().join(',');
  }, [productions]);

  // Check for recent pending requests on mount (via REST API)
  useEffect(() => {
    if (!user) return;

    // Instantly show cached data while Firestore loads in background
    try {
      const raw = localStorage.getItem('productions_cache_v2');
      if (raw) {
        const cache = JSON.parse(raw) as Record<string, { data: Production[]; savedAt: number }>;
        const now = new Date();
        const sunday = new Date(now);
        sunday.setDate(now.getDate() - now.getDay());
        const weekId = getWeekId(toLocalDate(sunday));
        const entry = cache[weekId];
        if (entry && Date.now() - entry.savedAt < 30 * 60 * 1000 && entry.data.length > 0) {
          productionsByWeekRef.current.set(weekId, entry.data);
          setProductions(entry.data);
          setCurrentWeekId(weekId);
          const satDate = new Date(sunday);
          satDate.setDate(sunday.getDate() + 6);
          setWeekStart(toLocalDate(sunday));
          setWeekEnd(toLocalDate(satDate));
          setCurrentDate(new Date(sunday));
        }
      }
    } catch { /* ignore */ }

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

  // Keep a ref to currentDate so the hourly interval can access it without restarting
  const currentDateRef = useRef(currentDate);
  useEffect(() => { currentDateRef.current = currentDate; }, [currentDate]);

  // Auto-refresh calendar every hour so external sync changes (e.g. Herzliya) appear automatically.
  // Evicts current week AND next week from all caches, then re-fetches both.
  useEffect(() => {
    if (!user) return;
    const HOUR_MS = 60 * 60 * 1000;
    const id = window.setInterval(async () => {
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;

      const now = new Date();
      const sunday = new Date(now);
      sunday.setDate(now.getDate() - now.getDay());
      const nextSunday = new Date(sunday);
      nextSunday.setDate(sunday.getDate() + 7);

      const thisWeekId = getWeekId(toLocalDate(sunday));
      const nextWeekId = getWeekId(toLocalDate(nextSunday));

      // Evict both weeks from in-memory cache
      productionsByWeekRef.current.delete(thisWeekId);
      productionsByWeekRef.current.delete(nextWeekId);

      // Evict both from localStorage
      try {
        const raw = localStorage.getItem('productions_cache_v2');
        if (raw) {
          const cache = JSON.parse(raw) as Record<string, unknown>;
          delete cache[thisWeekId];
          delete cache[nextWeekId];
          localStorage.setItem('productions_cache_v2', JSON.stringify(cache));
        }
      } catch { /* ignore */ }

      // Re-fetch current real-world week (updates state if user is viewing it)
      await handleReloadLatest();

      // Also pre-fetch next week so navigation to it is instant and fresh
      const nextProds = await loadExistingWeek(nextWeekId);
      if (nextProds.length > 0) {
        productionsByWeekRef.current.set(nextWeekId, nextProds);
        // If the user is currently viewing next week, update the displayed productions
        const viewedWeekId = getWeekId(toLocalDate(getWeekStartDate(currentDateRef.current)));
        if (viewedWeekId === nextWeekId) {
          setProductions(nextProds);
        }
      }
    }, HOUR_MS);
    return () => window.clearInterval(id);
  }, [user, handleReloadLatest, loadExistingWeek]);

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
        id: generateProductionId(p.name || '', p.date || '', p.studio || p.location || '', p.startTime || ''),
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
    if (!user) return;
    setGcalSyncing(prod.id);
    try {
      const idToken = await user.getIdToken();
      const result = await syncProductionToCalendar(idToken, {
        id: prod.id,
        name: prod.name,
        date: prod.date,
        startTime: prod.startTime,
        endTime: prod.endTime,
        studio: prod.studio,
        crew: (prod.crew ?? []).map((c) => ({ name: c.name, role: c.role ?? c.roleDetail ?? '' })),
      });

      if (result.success) {
        setStatusMessage(`"${prod.name}" סונכרנה ל-Google Calendar ✓`);
        await addNotification({
          type: 'general',
          title: 'Google Calendar',
          message: `"${prod.name}" נוספה ליומן`,
          productionId: prod.id,
          productionName: prod.name,
        });
      } else if (result.notConnected || result.tokenRevoked) {
        setStatusMessage('Google Calendar לא מחובר — חבר מדף ההגדרות');
        void updateUserProfile({ googleCalendarConnected: false } as Parameters<typeof updateUserProfile>[0]);
      } else {
        setStatusMessage(result.error ?? 'שגיאה בסנכרון');
      }
    } catch {
      setStatusMessage('שגיאה בסנכרון ל-Google Calendar');
    } finally {
      setGcalSyncing(null);
    }
  }, [user, addNotification, updateUserProfile]);

  const getUpcomingPersonalProductions = useCallback(() => {
    const today = new Date().toISOString().split('T')[0];
    return productions.filter((prod) => prod.date >= today);
  }, [productions]);

  const exportOutlookIcs = useCallback(() => {
    const upcomingProductions = getUpcomingPersonalProductions();
    if (upcomingProductions.length === 0) {
      setStatusMessage('אין הפקות עתידיות לייצוא');
      return;
    }

    const events = upcomingProductions.map((prod) => {
      const eventStart = `${prod.date.replaceAll('-', '')}T${prod.startTime.replace(':', '')}00`;
      const eventEnd = `${prod.date.replaceAll('-', '')}T${prod.endTime.replace(':', '')}00`;
      const location = [prod.studio].filter(Boolean).join(' | ');
      const description = [
        `הפקה: ${prod.name}`,
        prod.studio ? `אולפן: ${prod.studio}` : '',
        prod.day ? `יום: ${prod.day}` : '',
      ]
        .filter(Boolean)
        .join('\\n');

      return [
        'BEGIN:VEVENT',
        `UID:${prod.id}@tv-industry-il`,
        `DTSTAMP:${new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z')}`,
        `DTSTART:${eventStart}`,
        `DTEND:${eventEnd}`,
        `SUMMARY:${prod.name}`,
        `LOCATION:${location}`,
        `DESCRIPTION:${description}`,
        'END:VEVENT',
      ].join('\r\n');
    });

    const ics = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//TV Industry IL//Personal Calendar//HE',
      'CALSCALE:GREGORIAN',
      ...events,
      'END:VCALENDAR',
    ].join('\r\n');

    const blob = new Blob([ics], { type: 'text/calendar;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = 'tv-industry-il-personal-calendar.ics';
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    URL.revokeObjectURL(url);

    setShowCalendarMenu(false);
    setStatusMessage('קובץ Outlook / ICS נוצר בהצלחה');
  }, [getUpcomingPersonalProductions]);

  const syncWeekToGoogle = useCallback(async (offset: -1 | 0 | 1) => {
    if (!user || !profile?.googleCalendarConnected) return;

    const weekKey = offset === -1 ? 'prev' : offset === 0 ? 'current' : 'next';
    setGcalWeekSyncing(weekKey as 'prev' | 'current' | 'next');
    setCalendarMenuMsg(null);

    try {
      // Calculate Sunday–Saturday work week
      const today = new Date();
      const sunday = new Date(today);
      sunday.setDate(today.getDate() - today.getDay() + offset * 7);
      sunday.setHours(0, 0, 0, 0);
      const saturday = new Date(sunday);
      saturday.setDate(sunday.getDate() + 6);
      const weekStart = toLocalDate(sunday);
      const weekEnd = toLocalDate(saturday);
      const weekId = getWeekId(weekStart);

      // Use cached week data or fetch from server
      let weekProds = productionsByWeekRef.current.get(weekId) ?? [];
      if (weekProds.length === 0) {
        weekProds = await loadProductionsForPeriod(weekStart, weekEnd);
      }

      // Filter to only this user's productions
      const userNames = [profile?.crewName, profile?.displayName, user.displayName, workerName]
        .filter(Boolean) as string[];
      const myProds = weekProds.filter(p =>
        p.status !== 'cancelled' &&
        (p.isCurrentUserShift || isProductionAssignedToUser(p, userNames))
      );

      if (myProds.length === 0) {
        setCalendarMenuMsg({ text: 'לא נמצאו הפקות שלך בשבוע זה', ok: false });
        return;
      }

      // Lazy-load the event ID map (avoids Firestore read on every page load)
      const existingMap = calendarMapLoaded ? calendarEventMap : await loadCalendarEventMap();
      if (!calendarMapLoaded) {
        setCalendarEventMap(existingMap);
        setCalendarMapLoaded(true);
      }
      const newMap = { ...existingMap };

      const idToken = await user.getIdToken();
      let successCount = 0;
      let errorCount = 0;
      let stoppedDueToAuth = false;

      setGcalBulkProgress({ done: 0, total: myProds.length });

      for (let i = 0; i < myProds.length; i++) {
        const prod = myProds[i];
        const existingEventId = existingMap[prod.id];

        const prodData = {
          id: prod.id,
          name: prod.name,
          date: prod.date,
          startTime: prod.startTime,
          endTime: prod.endTime,
          studio: prod.studio,
          notes: null as string | null,
          crew: (prod.crew ?? []).map(c => ({ name: c.name, role: c.role ?? c.roleDetail ?? '' })),
        };

        let resultEventId: string | undefined;
        let syncError: string | undefined;

        if (existingEventId) {
          // Try to update the existing Google Calendar event
          const updateResult = await updateProductionInCalendar(idToken, existingEventId, prodData);
          if (updateResult.success) {
            resultEventId = updateResult.eventId ?? existingEventId;
          } else if (updateResult.notConnected || updateResult.tokenRevoked) {
            stoppedDueToAuth = true;
            errorCount++;
            break;
          } else {
            // Event may have been deleted from Google Calendar — recreate it
            const createResult = await syncProductionToCalendar(idToken, prodData);
            if (createResult.success) {
              resultEventId = createResult.eventId;
            } else if (createResult.notConnected || createResult.tokenRevoked) {
              stoppedDueToAuth = true;
              errorCount++;
              break;
            } else {
              syncError = createResult.error;
            }
          }
        } else {
          // First sync for this production
          const createResult = await syncProductionToCalendar(idToken, prodData);
          if (createResult.success) {
            resultEventId = createResult.eventId;
          } else if (createResult.notConnected || createResult.tokenRevoked) {
            stoppedDueToAuth = true;
            errorCount++;
            break;
          } else {
            syncError = createResult.error;
          }
        }

        if (resultEventId) {
          successCount++;
          newMap[prod.id] = resultEventId;
        } else {
          errorCount++;
          console.warn('[syncWeekToGoogle] failed for', prod.name, '|', prod.date, prod.startTime, '-', prod.endTime, '|', syncError);
        }

        setGcalBulkProgress({ done: i + 1, total: myProds.length });
      }

      // Persist updated event IDs if anything changed
      const hasChanges = Object.keys(newMap).some(k => newMap[k] !== existingMap[k]);
      if (hasChanges) {
        setCalendarEventMap(newMap);
        await saveCalendarEventMap(newMap);
      }

      if (stoppedDueToAuth) {
        setCalendarMenuMsg({ text: 'Google Calendar לא מחובר — חבר מחדש מדף ההגדרות', ok: false });
        void updateUserProfile({ googleCalendarConnected: false } as Parameters<typeof updateUserProfile>[0]);
      } else if (errorCount === 0) {
        setCalendarMenuMsg({ text: `${successCount} הפקות סונכרנו ✓`, ok: true });
      } else {
        setCalendarMenuMsg({ text: `${successCount} סונכרנו, ${errorCount} נכשלו`, ok: false });
      }
    } catch {
      setCalendarMenuMsg({ text: 'שגיאה בסנכרון ל-Google Calendar', ok: false });
    } finally {
      setGcalWeekSyncing(null);
      setGcalBulkProgress(null);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, profile, workerName, calendarEventMap, calendarMapLoaded, loadCalendarEventMap, saveCalendarEventMap, loadProductionsForPeriod, updateUserProfile]);

  // Auto-sync changed productions to Google Calendar and send push notification.
  // Called silently after processSchedule detects changes — no popup interaction.
  const autoSyncAndNotify = useCallback(async (
    diff: import('@/lib/productionDiff').ScheduleDiff,
    updatedProds: Production[],
  ) => {
    if (!user) return;

    // Send push notification (fire-and-forget — never blocks the UI)
    user.getIdToken().then(token => {
      fetch('/api/productions/notify-change', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ changes: diff.changes }),
      }).catch(() => {});
    }).catch(() => {});

    // Skip calendar sync if not connected
    if (!profile?.googleCalendarConnected) return;

    const userNames = [profile?.crewName, profile?.displayName, user.displayName, workerName]
      .filter(Boolean) as string[];

    // Only sync productions that (a) belong to the user and (b) were actually changed
    const changedIds = new Set(diff.changes.map(c => {
      const match = updatedProds.find(p =>
        p.name === c.productionName && p.date === c.productionDate
      );
      return match?.id;
    }).filter(Boolean) as string[]);

    const myChangedProds = updatedProds.filter(p =>
      changedIds.has(p.id) &&
      p.status !== 'cancelled' &&
      (p.isCurrentUserShift || isProductionAssignedToUser(p, userNames))
    );

    if (myChangedProds.length === 0) return;

    // Lazy-load event map
    const existingMap = calendarMapLoaded ? calendarEventMap : await loadCalendarEventMap();
    if (!calendarMapLoaded) {
      setCalendarEventMap(existingMap);
      setCalendarMapLoaded(true);
    }
    const newMap = { ...existingMap };

    try {
      const idToken = await user.getIdToken();
      for (const prod of myChangedProds) {
        const existingEventId = existingMap[prod.id];
        const prodData = {
          id: prod.id, name: prod.name, date: prod.date,
          startTime: prod.startTime, endTime: prod.endTime, studio: prod.studio,
          notes: null as string | null,
          crew: (prod.crew ?? []).map(c => ({ name: c.name, role: c.role ?? c.roleDetail ?? '' })),
        };

        if (existingEventId) {
          const r = await updateProductionInCalendar(idToken, existingEventId, prodData);
          if (r.success) { newMap[prod.id] = r.eventId ?? existingEventId; continue; }
          if (r.notConnected || r.tokenRevoked) break;
        }
        const r = await syncProductionToCalendar(idToken, prodData);
        if (r.success && r.eventId) newMap[prod.id] = r.eventId;
        else if (r.notConnected || r.tokenRevoked) break;
      }
      const hasChanges = Object.keys(newMap).some(k => newMap[k] !== existingMap[k]);
      if (hasChanges) {
        setCalendarEventMap(newMap);
        await saveCalendarEventMap(newMap);
      }
    } catch { /* silent — auto-sync is best-effort */ }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, profile, workerName, calendarEventMap, calendarMapLoaded, loadCalendarEventMap, saveCalendarEventMap]);

  const connectGoogleCalendar = useCallback(async () => {
    if (!user) return;
    if (!user) return;
    setGcalConnecting(true);
    setShowCalendarMenu(false);
    try {
      const result = await initiateGoogleCalendarConnect(user.uid, '/productions');
      if (result.success) {
        setStatusMessage(`Google Calendar חובר בהצלחה (${result.email ?? ''})`);
      } else if (result.error !== 'popup_closed') {
        setStatusMessage('שגיאה בחיבור ל-Google Calendar');
      }
    } finally {
      setGcalConnecting(false);
    }
  }, [user]);

  // Main fetch handler - direct GitHub Action for URLs, browser parsing for pasted content
  const handleFetch = useCallback(async (url: string | null, manualText: string | null, rawHtml?: string | null) => {
    console.warn('[handleFetch] url:', url?.substring(0, 50), 'manualText length:', manualText?.length, 'rawHtml length:', rawHtml?.length);

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
        if (url || rawHtmlHasHerzliyaUrl) {
          setFetchProgress({ step: 'connecting', message: 'שולח את לוח הרצליה לעיבוד מלא ברקע...' });
          setLoading(false);
          const sourceText = manualText || rawHtml || url || '';
          await submitScheduleRequest(sourceText);
          return;
        }
        if (isHerzliyaHTML(rawHtml)) {
          // Full Herzliya page HTML pasted without URL — parse directly
          setFetchProgress({ step: 'parsing', message: 'מנתח לוח הרצליה...' });
          const herzliyaParsed = parseHerzliyaHTML(rawHtml);
          if (herzliyaParsed.productions.length > 0) {
            setFetchProgress({ step: 'done', message: `נמצאו ${herzliyaParsed.productions.length} הפקות` });
            await processSchedule(herzliyaParsed);
            return;
          }
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
      // If this looks like actual Herzliya page HTML — parse directly in the browser.
      // Priority: HTML parse BEFORE URL detection, because the page HTML contains
      // many hsil.acc.co.il links (in form actions, hrefs) that would otherwise
      // trigger the Puppeteer path which cannot access the page from GitHub servers.
      if (isHerzliyaHTML(html)) {
        setFetchProgress({ step: 'parsing', message: 'מנתח לוח הרצליה...' });
        const herzliyaParsed = parseHerzliyaHTML(html);
        if (herzliyaParsed.productions.length > 0) {
          setFetchProgress({ step: 'done', message: `נמצאו ${herzliyaParsed.productions.length} הפקות` });
          await processSchedule(herzliyaParsed);
          return;
        }
        setStatusMessage('לא הצלחתי לחלץ הפקות מה-HTML. נסה ללחוץ Ctrl+A ו-Ctrl+C על דף הרצליה ולהדביק שוב.');
        setFetchProgress({ step: 'error', message: 'לא נמצאו הפקות' });
        return;
      }

      // Plain text with a Herzliya URL (WhatsApp message) — use Puppeteer via GitHub Action
      const hasHerzliyaUrl = /https?:\/\/[^\s"']*hsil\.acc\.co\.il[^\s"']*/i.test(html);
      if (hasHerzliyaUrl) {
        setFetchProgress({ step: 'connecting', message: 'שולח את לוח הרצליה לעיבוד מלא ברקע...' });
        setLoading(false);
        await submitScheduleRequest(html);
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
  const handleSaveCookie = async () => {
    if (!herzliyaCookie.trim() || !user) return;
    setCookieSaveStatus('saving');
    try {
      const idToken = await user.getIdToken();
      const res = await fetch('/api/calendar/save-session-cookie', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${idToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionCookie: herzliyaCookie.trim() }),
      });
      if (res.ok) {
        setCookieSaveStatus('saved');
        setTimeout(() => setCookieSaveStatus('idle'), 3000);
      } else {
        setCookieSaveStatus('error');
      }
    } catch {
      setCookieSaveStatus('error');
    }
  };

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
      <div className="flex flex-wrap items-center justify-between gap-2 mb-6">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-10 h-10 shrink-0 rounded-xl bg-gradient-to-br from-orange-500 to-red-500 flex items-center justify-center">
            <Clapperboard className="w-5 h-5 text-white" />
          </div>
          <div className="min-w-0">
            <h1 className="text-xl font-black" style={{ color: 'var(--theme-text)' }}>
              יומן אישי
            </h1>
            <p className="text-xs truncate" style={{ color: 'var(--theme-text-secondary)' }}>
              הדבק הודעת WhatsApp או לינק ללוח העבודה
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {showCalendarMenu && (
            <>
              {/* Backdrop */}
                  <div
                    className="fixed inset-0 z-40"
                    style={{ background: 'rgba(0,0,0,0.5)' }}
                    onClick={() => { setShowCalendarMenu(false); setCalendarMenuMsg(null); }}
                  />
                  {/* Modal */}
                  <div
                    className="fixed left-1/2 top-1/2 z-50 w-80 max-w-[calc(100vw-2rem)] -translate-x-1/2 -translate-y-1/2 rounded-2xl border p-4 shadow-2xl"
                    style={{ background: 'var(--theme-bg-secondary)', borderColor: 'var(--theme-border)' }}
                  >
                    {/* Header */}
                    <div className="mb-3 flex items-center justify-between">
                      <div className="text-sm font-bold" style={{ color: 'var(--theme-text)' }}>
                        סנכרון היומן האישי
                      </div>
                      <button
                        onClick={() => { setShowCalendarMenu(false); setCalendarMenuMsg(null); }}
                        className="rounded-lg p-1 transition-colors hover:bg-black/10"
                        style={{ color: 'var(--theme-text-secondary)' }}
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </div>

                    {/* Google Calendar connection status */}
                    {profile?.googleCalendarConnected ? (
                      <div className="mb-3 flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-xs" style={{ background: 'color-mix(in srgb, var(--theme-accent) 10%, transparent)', color: 'var(--theme-accent)' }}>
                        <CheckCircle className="h-3.5 w-3.5 shrink-0" />
                        <span className="truncate">{profile.googleCalendarEmail ?? 'מחובר'}</span>
                      </div>
                    ) : (
                      <p className="mb-3 text-xs leading-5" style={{ color: 'var(--theme-text-secondary)' }}>
                        חבר את Google Calendar כדי לסנכרן את ההפקות שלך. הסנכרון יישמר גם אחרי סגירת הדפדפן.
                      </p>
                    )}

                    <div className="space-y-2">
                      {profile?.googleCalendarConnected ? (
                        <>
                          <div className="text-xs font-semibold mb-1" style={{ color: 'var(--theme-text-secondary)' }}>סנכרן את השבוע שלי:</div>
                          <div className="grid grid-cols-3 gap-2">
                            {([
                              { offset: -1 as const, label: 'שבוע קודם', key: 'prev' },
                              { offset: 0 as const, label: 'שבוע נוכחי', key: 'current' },
                              { offset: 1 as const, label: 'שבוע הבא', key: 'next' },
                            ]).map(({ offset, label, key }) => {
                              const isSyncing = gcalWeekSyncing === key;
                              const isDisabled = gcalWeekSyncing !== null || gcalBulkProgress !== null;
                              return (
                                <button
                                  key={key}
                                  onClick={() => void syncWeekToGoogle(offset)}
                                  disabled={isDisabled}
                                  className="flex flex-col items-center justify-center gap-1 rounded-xl py-3 px-1 text-xs font-bold text-white bg-gradient-to-b from-blue-500 to-sky-600 disabled:opacity-60 text-center leading-tight"
                                >
                                  {isSyncing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CalendarPlus className="h-3.5 w-3.5" />}
                                  {label}
                                </button>
                              );
                            })}
                          </div>
                          {gcalBulkProgress && (
                            <div className="flex items-center justify-center gap-2 rounded-xl py-2 text-xs" style={{ color: 'var(--theme-text-secondary)' }}>
                              <Loader2 className="h-3.5 w-3.5 animate-spin" />
                              מסנכרן {gcalBulkProgress.done} / {gcalBulkProgress.total}
                            </div>
                          )}
                          {!gcalBulkProgress && calendarMenuMsg && (
                            <div
                              className="flex items-center justify-center gap-2 rounded-xl px-3 py-2 text-xs font-medium"
                              style={{
                                background: calendarMenuMsg.ok
                                  ? 'color-mix(in srgb, #22c55e 15%, transparent)'
                                  : 'color-mix(in srgb, #ef4444 15%, transparent)',
                                color: calendarMenuMsg.ok ? '#4ade80' : '#f87171',
                              }}
                            >
                              {calendarMenuMsg.ok ? <CheckCircle className="h-3.5 w-3.5 shrink-0" /> : <AlertTriangleIcon className="h-3.5 w-3.5 shrink-0" />}
                              {calendarMenuMsg.text}
                            </div>
                          )}
                        </>
                      ) : (
                        <button
                          onClick={() => void connectGoogleCalendar()}
                          disabled={gcalConnecting}
                          className="flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-l from-blue-600 to-sky-500 px-3 py-2.5 text-xs font-bold text-white disabled:opacity-60"
                        >
                          {gcalConnecting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CalendarPlus className="h-3.5 w-3.5" />}
                          חיבור Google Calendar
                        </button>
                      )}
                      <button
                        onClick={exportOutlookIcs}
                        className="flex w-full items-center justify-center gap-2 rounded-xl px-3 py-2.5 text-xs font-bold"
                        style={{ background: 'var(--theme-bg)', color: 'var(--theme-text)' }}
                      >
                        <ExternalLink className="h-3.5 w-3.5" />
                        ייצוא Outlook / ICS
                      </button>
                      {/* Herzliya session cookie */}
                      <div className="border-t pt-3 mt-1" style={{ borderColor: 'var(--theme-border)' }}>
                        <p className="text-xs font-semibold mb-1" style={{ color: 'var(--theme-text-secondary)' }}>
                          Cookie לרצליה (לנתוני צוות)
                        </p>
                        <p className="text-xs mb-2 leading-4" style={{ color: 'var(--theme-text-secondary)' }}>
                          1. פתח את לינק הרצליה שלך בדפדפן<br />
                          2. לחץ על הפקה כלשהי (חלון ShowCrew ייפתח)<br />
                          3. DevTools (F12) → Network → חפש ShowCrew → Headers → העתק ערך Cookie
                        </p>
                        <textarea
                          value={herzliyaCookie}
                          onChange={e => setHerzliyaCookie(e.target.value)}
                          placeholder="הדבק כאן Cookie מהרצליה (DevTools → Network → ShowCrew → Cookie header)"
                          className="w-full min-h-[60px] p-2 text-xs rounded-xl border bg-transparent resize-none outline-none"
                          style={{ color: 'var(--theme-text)', borderColor: 'var(--theme-border)', background: 'var(--theme-bg)', direction: 'ltr' }}
                          dir="ltr"
                        />
                        <button
                          onClick={() => void handleSaveCookie()}
                          disabled={!herzliyaCookie.trim() || cookieSaveStatus === 'saving'}
                          className="mt-2 w-full flex items-center justify-center gap-2 rounded-xl px-3 py-2 text-xs font-bold text-white disabled:opacity-50"
                          style={{ background: 'linear-gradient(135deg, #7c3aed, #4f46e5)' }}
                        >
                          {cookieSaveStatus === 'saving' ? 'שומר...' : cookieSaveStatus === 'saved' ? '✅ נשמר' : cookieSaveStatus === 'error' ? '❌ שגיאה' : '🍪 שמור Cookie'}
                        </button>
                      </div>
                    </div>
                  </div>
            </>
          )}

          {productions.length > 0 && (
            <button
              onClick={() => {
                const myShifts = productions.filter(p =>
                  p.isCurrentUserShift || p.crew.some(c => {
                    const names = [profile?.displayName, workerName].filter(Boolean) as string[];
                    return names.some(n => {
                      if (c.name === n) return true;
                      const crewParts = c.name.trim().split(/\s+/);
                      const nameParts = n.trim().split(/\s+/);
                      return (crewParts.length === 1 || nameParts.length === 1) &&
                        crewParts[0] === nameParts[0] && crewParts[0].length >= 2;
                    });
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

      {/* Team Selector */}
      {teams.length > 0 && (
        <div className="mb-4 relative">
          <button
            onClick={() => setShowTeamSelector(!showTeamSelector)}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium transition-all border"
            style={{
              background: selectedTeam ? 'var(--theme-accent-glow)' : 'var(--theme-bg-secondary)',
              borderColor: selectedTeam ? 'var(--theme-accent)' : 'var(--theme-border)',
              color: selectedTeam ? 'var(--theme-accent)' : 'var(--theme-text-secondary)',
            }}
          >
            <Users className="w-4 h-4" />
            {selectedTeam ? selectedTeam.name : 'לוח שלי'}
            <ChevronDown className={`w-3.5 h-3.5 transition-transform ${showTeamSelector ? 'rotate-180' : ''}`} />
          </button>

          {showTeamSelector && (
            <div
              className="absolute top-full mt-1 right-0 w-64 rounded-xl border shadow-xl z-30 p-1"
              style={{
                background: 'var(--theme-bg-secondary)',
                borderColor: 'var(--theme-border)',
              }}
            >
              <button
                onClick={() => handleTeamChange(null)}
                className={`w-full flex items-center gap-2 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                  !selectedTeamId ? 'text-[var(--theme-accent)]' : 'text-[var(--theme-text-secondary)] hover:text-[var(--theme-text)] hover:bg-[var(--theme-accent-glow)]'
                }`}
                style={!selectedTeamId ? { background: 'var(--theme-accent-glow)' } : undefined}
              >
                <Clapperboard className="w-4 h-4" />
                לוח שלי
              </button>
              {teams.map(team => (
                <button
                  key={team.id}
                  onClick={() => handleTeamChange(team.id)}
                  className={`w-full flex items-center gap-2 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                    selectedTeamId === team.id ? 'text-[var(--theme-accent)]' : 'text-[var(--theme-text-secondary)] hover:text-[var(--theme-text)] hover:bg-[var(--theme-accent-glow)]'
                  }`}
                  style={selectedTeamId === team.id ? { background: 'var(--theme-accent-glow)' } : undefined}
                >
                  <Users className="w-4 h-4" />
                  {team.name}
                  <span className="text-xs opacity-60 mr-auto">{team.members.length} חברים</span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Shadow-profile claim modal — shown when phone exists but matches only by name (no phone in record) */}
      {showClaimModal && user && (
        <ClaimShiftsModal
          matches={claimMatches}
          crewName={claimCrewName}
          profession={claimProfession}
          userPhone={normalizePhone(profile?.phone || '') || ''}
          getToken={() => user.getIdToken()}
          onClaimed={async (name) => {
            setShowClaimModal(false);
            await handleCrewIdentityConfirm(name);
          }}
          onDismiss={() => {
            setShowClaimModal(false);
            updateUserProfile({ claimDeclined: true } as Parameters<typeof updateUserProfile>[0]).catch(() => {});
          }}
        />
      )}

      {/* Crew Identity Modal — shown on first visit when user is not yet identified */}
      {showCrewIdentity && (
        <div className="mb-6 rounded-2xl border overflow-hidden" style={{ background: 'var(--theme-bg-secondary)', borderColor: 'var(--theme-border)' }}>
          {/* Header strip */}
          <div className="flex items-center justify-between px-4 py-3" style={{ background: 'linear-gradient(135deg, rgba(249,115,22,0.15), rgba(239,68,68,0.1))', borderBottom: '1px solid var(--theme-border)' }}>
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ background: 'rgba(249,115,22,0.2)' }}>
                <User className="w-3.5 h-3.5 text-orange-400" />
              </div>
              <span className="text-sm font-bold" style={{ color: 'var(--theme-text)' }}>מי אתה בלוח ההפקות?</span>
              <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: 'rgba(249,115,22,0.15)', color: 'var(--theme-accent)' }}>חדש</span>
            </div>
            <button
              onClick={() => setShowCrewIdentity(false)}
              className="w-6 h-6 rounded-lg flex items-center justify-center transition-colors hover:bg-[var(--theme-accent-glow)]"
              style={{ color: 'var(--theme-text-secondary)' }}
              title="דלג לעכשיו"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="px-4 py-4">
            <p className="text-xs mb-3" style={{ color: 'var(--theme-text-secondary)' }}>
              כדי שהמערכת תזהה אותך בלוחות ההפקות ותציג את המשמרות שלך, הזן את שמך כפי שהוא מופיע בלוח.
            </p>

            {/* Auto-suggestions */}
            {crewSuggestions.length > 0 && (
              <div className="mb-4">
                <p className="text-xs font-semibold mb-2" style={{ color: 'var(--theme-text-secondary)' }}>
                  {crewSuggestions.length === 1 ? 'האם זה אתה?' : 'נמצאו התאמות אפשריות:'}
                </p>
                <div className="flex flex-wrap gap-2">
                  {crewSuggestions.map((s, i) => (
                    <button
                      key={i}
                      onClick={() => handleCrewIdentityConfirm(s.name)}
                      className="flex items-center gap-2 px-3 py-2 rounded-xl border text-sm font-medium transition-all hover:scale-[1.02]"
                      style={{
                        background: s.score === 3 ? 'rgba(249,115,22,0.15)' : 'var(--theme-bg)',
                        borderColor: s.score === 3 ? 'rgba(249,115,22,0.5)' : 'var(--theme-border)',
                        color: 'var(--theme-text)',
                      }}
                    >
                      <div className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold" style={{ background: 'rgba(249,115,22,0.2)', color: 'var(--theme-accent)' }}>
                        {s.name.charAt(0)}
                      </div>
                      <div className="text-right">
                        <div className="text-xs font-bold">{s.name}</div>
                        {s.role && <div className="text-xs" style={{ color: 'var(--theme-text-secondary)' }}>{s.role}</div>}
                      </div>
                      <CheckCircle className="w-3.5 h-3.5 text-orange-400 mr-1" />
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Manual name input */}
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5" style={{ color: 'var(--theme-text-secondary)' }} />
                <input
                  type="text"
                  value={crewNameInput}
                  onChange={e => setCrewNameInput(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleCrewIdentityConfirm(crewNameInput)}
                  placeholder="הקלד שמך כפי שמופיע בלוח..."
                  dir="rtl"
                  className="w-full pr-9 pl-3 py-2.5 rounded-xl text-sm outline-none transition-colors"
                  style={{
                    background: 'var(--theme-bg)',
                    border: '1px solid var(--theme-border)',
                    color: 'var(--theme-text)',
                  }}
                />
              </div>
              <button
                onClick={() => handleCrewIdentityConfirm(crewNameInput)}
                disabled={!crewNameInput.trim()}
                className="px-4 py-2.5 rounded-xl text-sm font-bold transition-all disabled:opacity-40"
                style={{ background: 'var(--theme-accent)', color: 'white' }}
              >
                אישור
              </button>
            </div>
          </div>
        </div>
      )}

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
        <>
          {lastSyncAt && (
            <div
              className="mb-2 flex items-center gap-1.5 rounded-xl border px-3 py-1.5"
              style={{ borderColor: 'var(--theme-border)', background: 'color-mix(in srgb, var(--theme-accent) 4%, transparent)' }}
            >
              <RefreshCw className="h-2.5 w-2.5 shrink-0 opacity-45" style={{ color: 'var(--theme-accent)' }} />
              <span className="text-[10px]" style={{ color: 'var(--theme-text-secondary)' }}>
                עודכן:{' '}
                <span className="font-semibold" dir="ltr">
                  {new Date(lastSyncAt).toLocaleDateString('he-IL', { day: '2-digit', month: '2-digit', year: '2-digit' })}
                  {' '}
                  {new Date(lastSyncAt).toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' })}
                </span>
              </span>
            </div>
          )}

          {/* Google Calendar sync banner */}
          <button
            onClick={() => setShowCalendarMenu(true)}
            disabled={gcalSyncing !== null || gcalWeekSyncing !== null}
            className="mb-3 w-full flex items-center gap-3 rounded-2xl border px-4 py-3 transition-all hover:shadow-md active:scale-[0.99] text-right"
            style={{ background: 'var(--theme-bg-secondary)', borderColor: 'var(--theme-border)' }}
          >
            {/* Google Calendar icon */}
            <div className="shrink-0 w-10 h-10 rounded-xl flex items-center justify-center relative overflow-hidden" style={{ background: '#fff' }}>
              <svg viewBox="0 0 48 48" width="32" height="32" xmlns="http://www.w3.org/2000/svg">
                <rect x="4" y="4" width="40" height="40" rx="4" fill="#fff" />
                <rect x="4" y="4" width="40" height="10" rx="4" fill="#1a73e8" />
                <rect x="4" y="10" width="40" height="4" fill="#1a73e8" />
                <text x="24" y="34" textAnchor="middle" fontSize="16" fontWeight="bold" fill="#1a73e8" fontFamily="sans-serif">
                  {new Date().getDate()}
                </text>
                <rect x="14" y="2" width="4" height="8" rx="2" fill="#1a73e8" />
                <rect x="30" y="2" width="4" height="8" rx="2" fill="#1a73e8" />
              </svg>
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-sm font-bold" style={{ color: 'var(--theme-text)' }}>Google Calendar</span>
                {profile?.googleCalendarConnected ? (
                  <span className="flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded-full" style={{ background: 'color-mix(in srgb, #22c55e 15%, transparent)', color: '#4ade80' }}>
                    <CheckCircle className="h-2.5 w-2.5" />
                    מחובר
                  </span>
                ) : (
                  <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full" style={{ background: 'color-mix(in srgb, var(--theme-accent) 15%, transparent)', color: 'var(--theme-accent)' }}>
                    לא מחובר
                  </span>
                )}
              </div>
              <p className="text-xs mt-0.5 truncate" style={{ color: 'var(--theme-text-secondary)' }}>
                {profile?.googleCalendarConnected
                  ? 'לחץ לסנכרן את הלוח שלך'
                  : 'חבר ותסנכרן את ההפקות שלך אוטומטית'}
              </p>
            </div>
            {(gcalWeekSyncing !== null || gcalBulkProgress !== null)
              ? <Loader2 className="h-4 w-4 shrink-0 animate-spin" style={{ color: 'var(--theme-accent)' }} />
              : <CalendarPlus className="h-4 w-4 shrink-0" style={{ color: 'var(--theme-text-secondary)' }} />
            }
          </button>

          <WeeklyCalendar
            productions={visibleProductions}
            weekStart={renderedRange.start}
            weekEnd={renderedRange.end}
            workerName={workerName}
            currentUserName={profile?.displayName || user?.displayName || ''}
            currentUserPhone={profile?.phone || ''}
            onNavigate={handleCalendarNavigate}
            onJumpToDate={handleJumpToDate}
            onViewChange={handleViewChange}
            calendarView={calendarView}
            calendarYear={calendarYear}
            calendarMonth={calendarMonth}
            navLoading={navLoading}
            onLoadMore={handleLoadMoreList}
            hasMore={hasMoreList}
            loadingMore={loadingMoreList}
            highlightedDate={highlightedDate}
          />
          <div
            className="mt-4 grid gap-3 rounded-2xl border p-4 sm:grid-cols-2"
            style={{
              background: 'var(--theme-bg-secondary)',
              borderColor: 'var(--theme-border)',
            }}
            dir="rtl"
          >
            <div>
              <p className="text-xs font-semibold" style={{ color: 'var(--theme-text-secondary)' }}>
                סיכום השבוע
              </p>
              <p className="mt-1 text-sm font-bold" style={{ color: 'var(--theme-text)' }}>
                {calendarSummary.week.total} הפקות · {calendarSummary.week.mine} שלי
              </p>
            </div>
            <div>
              <p className="text-xs font-semibold" style={{ color: 'var(--theme-text-secondary)' }}>
                סיכום החודש
              </p>
              <p className="mt-1 text-sm font-bold" style={{ color: 'var(--theme-text)' }}>
                {calendarSummary.month.total} הפקות · {calendarSummary.month.mine} שלי
              </p>
            </div>
          </div>
        </>
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


























