'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, Clapperboard, Clock, MapPin, RefreshCw, User, X } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { normalizeName, normalizePhone, deduplicateCrewEntries } from '@/lib/crewNormalization';
import type { Production } from '@/lib/productionDiff';
import { canonicalProductionName } from '@/lib/productionDiff';

const CACHE_KEY = 'productions_global_widget_cache_v3';
const CACHE_TTL = 30 * 60 * 1000; // 30 minutes — keeps data fresh across page navigations
const DAY_NAMES = ['א׳', 'ב׳', 'ג׳', 'ד׳', 'ה׳', 'ו׳', 'ש׳'];
const MONTHS = ['ינואר', 'פברואר', 'מרץ', 'אפריל', 'מאי', 'יוני', 'יולי', 'אוגוסט', 'ספטמבר', 'אוקטובר', 'נובמבר', 'דצמבר'];

function toDateStr(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function getWeekSunday(offset: number): Date {
  const today = new Date();
  return new Date(today.getFullYear(), today.getMonth(), today.getDate() - today.getDay() + offset * 7);
}

function getWeekDays(offset: number): string[] {
  const sunday = getWeekSunday(offset);
  return Array.from({ length: 7 }, (_, index) => {
    const date = new Date(sunday.getFullYear(), sunday.getMonth(), sunday.getDate() + index);
    return toDateStr(date);
  });
}

function getWeekId(dateStr: string): string {
  const [year, month, day] = dateStr.split('-').map(Number);
  const date = new Date(year, month - 1, day);
  const sunday = new Date(year, month - 1, day - date.getDay());
  return toDateStr(sunday);
}

function getWeekLabel(days: string[]): string {
  const [, firstMonth, firstDay] = days[0].split('-').map(Number);
  const [, lastMonth, lastDay] = days[6].split('-').map(Number);
  if (firstMonth === lastMonth) return `${firstDay}-${lastDay} ${MONTHS[firstMonth - 1]}`;
  return `${firstDay} ${MONTHS[firstMonth - 1]} - ${lastDay} ${MONTHS[lastMonth - 1]}`;
}

function loadFromCache(weekId: string): Production[] | null {
  try {
    if (typeof window === 'undefined') return null;
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const cache = JSON.parse(raw) as Record<string, { data: Production[]; savedAt: number }>;
    const entry = cache[weekId];
    if (!entry || Date.now() - entry.savedAt > CACHE_TTL) return null;
    return entry.data;
  } catch {
    return null;
  }
}

function saveToCache(weekId: string, productions: Production[]) {
  try {
    if (typeof window === 'undefined') return;
    const raw = localStorage.getItem(CACHE_KEY);
    const cache = raw ? JSON.parse(raw) as Record<string, { data: Production[]; savedAt: number }> : {};
    cache[weekId] = { data: productions, savedAt: Date.now() };
    localStorage.setItem(CACHE_KEY, JSON.stringify(cache));
  } catch {
    // Cache is an optimization only.
  }
}

function isMyProduction(production: Production, displayName: string, phone: string): boolean {
  if (production.isCurrentUserShift) return true;
  const myName = normalizeName(displayName);
  const myPhone = normalizePhone(phone);

  return (production.crew ?? []).some((member) => {
    if (myName && (normalizeName(member.name) === myName || normalizeName(member.normalizedName ?? '') === myName)) return true;
    if (myPhone && myPhone.length >= 9 && (normalizePhone(member.phone ?? '') === myPhone || normalizePhone(member.normalizedPhone ?? '') === myPhone)) return true;
    return false;
  });
}

function mergeProductions(
  personal: Production[],
  global: Production[],
  displayName: string,
  phone: string,
): Production[] {
  const personalIds = new Set(personal.map((p) => p.id));
  const extras = global
    .filter((p) => p.id && !personalIds.has(p.id))
    .map((p) => ({ ...p, isCurrentUserShift: isMyProduction(p, displayName, phone) }));
  return [...personal, ...extras];
}

function roundTime30(t: string): string {
  const [h, m] = (t || '').split(':').map(Number);
  if (isNaN(h) || isNaN(m)) return t;
  const rm = m < 15 ? 0 : m < 45 ? 30 : 0;
  const rh = m >= 45 ? h + 1 : h;
  return `${rh}:${String(rm).padStart(2, '0')}`;
}

// Robust cross-source dedup: same production can arrive from multiple endpoints
// with different IDs (personal path vs global sync).
// Pass 1: canonical name + BOTH sorted rounded times (keeps different shifts separate).
// Pass 2: same name + date + startTime regardless of endTime (merges duplicate Firestore entries).
function deduplicateByIdentity(productions: Production[]): Production[] {
  const seen = new Map<string, Production>();
  for (const prod of productions) {
    if (!prod.date) { seen.set(prod.id || String(Math.random()), prod); continue; }
    const canonName = canonicalProductionName(prod.name || '');
    const times = [roundTime30(prod.startTime || ''), roundTime30(prod.endTime || '')].sort();
    const key = `${canonName}::${prod.date}::${times[0]}::${times[1]}`;
    const cleanCrew = deduplicateCrewEntries(prod.crew ?? []);
    const existing = seen.get(key);
    if (!existing) {
      seen.set(key, { ...prod, crew: cleanCrew });
    } else {
      const base = cleanCrew.length >= (existing.crew?.length ?? 0) ? { ...prod, crew: cleanCrew } : existing;
      const other = base === existing ? { ...prod, crew: cleanCrew } : existing;
      const mergedCrew = deduplicateCrewEntries([...(base.crew ?? []), ...(other.crew ?? [])]);
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

  // Pass 2: merge entries that share name+date+startTime but differ only in endTime
  const pass1 = Array.from(seen.values());
  const byStart = new Map<string, Production>();
  const noStart: Production[] = [];
  for (const p of pass1) {
    if (!p.date || !p.startTime) { noStart.push(p); continue; }
    const sk = `${canonicalProductionName(p.name || '')}::${p.date}::${roundTime30(p.startTime)}`;
    const ex = byStart.get(sk);
    if (!ex) {
      byStart.set(sk, p);
    } else {
      const studioOk = !ex.studio || !p.studio || ex.studio === p.studio;
      if (!studioOk) { byStart.set(sk + '::' + (p.studio || p.id), p); continue; }
      const base = (p.crew?.length ?? 0) >= (ex.crew?.length ?? 0) ? p : ex;
      const other = base === p ? ex : p;
      const laterEnd = (base.endTime || '') > (other.endTime || '') ? base.endTime : other.endTime;
      byStart.set(sk, {
        ...base,
        studio: base.studio || other.studio,
        endTime: laterEnd,
        crew: deduplicateCrewEntries([...(base.crew ?? []), ...(other.crew ?? [])]),
        isCurrentUserShift: base.isCurrentUserShift || other.isCurrentUserShift,
      });
    }
  }
  const pass2 = [...Array.from(byStart.values()), ...noStart];

  // Pass 3: merge "(לוז לא סופי)" draft entries with confirmed counterparts (same canonName+date)
  const DRAFT_RE = /\s*\(לוז לא סופי\)/g;
  const nonDraftByKey = new Map<string, Production>();
  const draftEntries: Production[] = [];
  for (const p of pass2) {
    if (/\(לוז לא סופי\)/.test(p.name || '')) {
      draftEntries.push(p);
    } else {
      const k = `${canonicalProductionName(p.name || '')}::${p.date || ''}`;
      nonDraftByKey.set(k, p);
    }
  }
  if (draftEntries.length === 0) return pass2;

  const absorbedDraftIds = new Set<string>();
  for (const draft of draftEntries) {
    const k = `${canonicalProductionName(draft.name || '')}::${draft.date || ''}`;
    const nonDraft = nonDraftByKey.get(k);
    absorbedDraftIds.add(draft.id || '');
    if (nonDraft) {
      nonDraftByKey.set(k, {
        ...nonDraft,
        studio: nonDraft.studio || draft.studio,
        crew: deduplicateCrewEntries([...(nonDraft.crew ?? []), ...(draft.crew ?? [])]),
        isCurrentUserShift: nonDraft.isCurrentUserShift || draft.isCurrentUserShift,
      });
    } else {
      nonDraftByKey.set(k, { ...draft, name: (draft.name || '').replace(DRAFT_RE, '').trim() });
    }
  }

  const pass3: Production[] = [];
  for (const p of pass2) {
    if (absorbedDraftIds.has(p.id || '')) continue;
    const k = `${canonicalProductionName(p.name || '')}::${p.date || ''}`;
    pass3.push(nonDraftByKey.get(k) || p);
  }
  for (const draft of draftEntries) {
    const k = `${canonicalProductionName(draft.name || '')}::${draft.date || ''}`;
    if (!pass2.some((p) => !absorbedDraftIds.has(p.id || '') && `${canonicalProductionName(p.name || '')}::${p.date || ''}` === k)) {
      const stripped = nonDraftByKey.get(k);
      if (stripped) pass3.push(stripped);
    }
  }
  return pass3;
}

function getMyRole(production: Production, displayName: string, phone: string): string {
  const myName = normalizeName(displayName);
  const myPhone = normalizePhone(phone);
  const member = (production.crew ?? []).find((candidate) => {
    if (myName && (normalizeName(candidate.name) === myName || normalizeName(candidate.normalizedName ?? '') === myName)) return true;
    if (myPhone && myPhone.length >= 9 && (normalizePhone(candidate.phone ?? '') === myPhone || normalizePhone(candidate.normalizedPhone ?? '') === myPhone)) return true;
    return false;
  });
  return member?.role || member?.roleDetail || '';
}

function formatHebrewDate(dateStr: string, dayIndex: number): string {
  const [, month, day] = dateStr.split('-').map(Number);
  return `יום ${DAY_NAMES[dayIndex]} · ${day} ב${MONTHS[month - 1]}`;
}

interface DayPopupProps {
  dateStr: string;
  dayIndex: number;
  productions: Production[];
  displayName: string;
  phone: string;
  onClose: () => void;
}

function DayPopup({ dateStr, dayIndex, productions, displayName, phone, onClose }: DayPopupProps) {
  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-[400] flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm" onClick={onClose}>
      <div
        className="w-full max-w-sm overflow-hidden rounded-2xl border shadow-2xl"
        style={{ background: 'var(--theme-bg-card)', borderColor: 'var(--theme-border)' }}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b px-4 py-3" style={{ borderColor: 'var(--theme-border)' }}>
          <div className="flex items-center gap-2">
            <Clapperboard className="h-4 w-4" style={{ color: 'var(--theme-accent)' }} />
            <span className="text-sm font-bold" style={{ color: 'var(--theme-text)' }}>
              {formatHebrewDate(dateStr, dayIndex)}
            </span>
          </div>
          <button onClick={onClose} className="rounded-lg p-1 transition-colors hover:bg-[var(--theme-accent-glow)]" aria-label="סגור">
            <X className="h-4 w-4" style={{ color: 'var(--theme-text-secondary)' }} />
          </button>
        </div>

        <div className="max-h-[50vh] overflow-y-auto divide-y" style={{ borderColor: 'var(--theme-border)' }}>
          {productions.map((production) => {
            const mine = production.isCurrentUserShift;
            const myRole = mine ? getMyRole(production, displayName, phone) : '';
            return (
              <div key={production.id} className="px-4 py-3" style={mine ? { background: 'color-mix(in srgb, var(--theme-warning) 12%, transparent)' } : undefined}>
                <div className="flex items-start gap-2">
                  {mine && <div className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-orange-400" />}
                  <div className={`flex-1 ${mine ? '' : 'pr-3.5'}`}>
                    <p className="text-sm font-bold leading-tight" style={{ color: mine ? 'var(--theme-warning)' : 'var(--theme-text)' }}>
                      {production.name}
                    </p>
                    <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-0.5">
                      {(production.startTime || production.endTime) && (
                        <span className="flex items-center gap-1 text-[11px]" style={{ color: 'var(--theme-text-secondary)' }}>
                          <Clock className="h-3 w-3" />
                          <span dir="ltr">{production.startTime}{production.endTime ? `-${production.endTime}` : ''}</span>
                        </span>
                      )}
                      {production.studio && (
                        <span className="flex items-center gap-1 text-[11px]" style={{ color: 'var(--theme-text-secondary)' }}>
                          <MapPin className="h-3 w-3" />
                          {production.studio}
                        </span>
                      )}
                      {myRole && (
                        <span className="flex items-center gap-1 text-[11px] text-orange-400">
                          <User className="h-3 w-3" />
                          {myRole}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        <div className="border-t px-4 py-3" style={{ borderColor: 'var(--theme-border)' }}>
          <Link
            href={`/productions?date=${dateStr}`}
            onClick={onClose}
            className="flex w-full items-center justify-center gap-1.5 rounded-xl py-2 text-sm font-medium transition-colors hover:opacity-90"
            style={{ background: 'var(--theme-accent-glow)', color: 'var(--theme-accent)' }}
          >
            לצפייה בלוח המלא
            <ArrowLeft className="h-3.5 w-3.5" />
          </Link>
        </div>
      </div>
    </div>
  );
}

export default function WeeklyCalendarWidget() {
  const { user, profile } = useAuth();
  const [weekOffset, setWeekOffset] = useState(0);
  const [days, setDays] = useState<string[]>(() => getWeekDays(0));
  const [productions, setProductions] = useState<Production[] | null>(null);
  const [myProductionDates, setMyProductionDates] = useState<Set<string> | null>(null);
  // true on client from the start (avoids a mount re-render); false during SSR to prevent hydration mismatches
  const [mounted] = useState(() => typeof window !== 'undefined');
  const [popupDate, setPopupDate] = useState<string | null>(null);
  const [lastSyncAt, setLastSyncAt] = useState<number | null>(null);
  const [refreshNonce, setRefreshNonce] = useState(0);
  const lastFetchStartedAt = useRef(0);
  // In-memory cache per session — mirrors the productions page's productionsByWeekRef pattern
  const sessionCache = useRef<Map<string, Production[]>>(new Map());

  const displayName = profile?.crewName || profile?.displayName || user?.displayName || '';
  const phone = profile?.phone ?? '';
  const profileIdentityId = profile?.profileId || (profile?.linkedContactId ? String(profile.linkedContactId) : '');

  // Keep profile fields in refs so the fetch effect always uses current values
  // without re-triggering a full re-fetch when profile loads after initial user auth
  const displayNameRef = useRef(displayName);
  const phoneRef = useRef(phone);
  const profileIdentityIdRef = useRef(profileIdentityId);
  useEffect(() => { displayNameRef.current = displayName; }, [displayName]);
  useEffect(() => { phoneRef.current = phone; }, [phone]);
  useEffect(() => { profileIdentityIdRef.current = profileIdentityId; }, [profileIdentityId]);

  useEffect(() => {
    const requestRefresh = () => {
      if (Date.now() - lastFetchStartedAt.current < 5 * 60 * 1000) return;
      setRefreshNonce((value) => value + 1);
    };
    const forceRefresh = () => setRefreshNonce((value) => value + 1);
    const intervalId = window.setInterval(requestRefresh, 5 * 60 * 1000);
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') requestRefresh();
    };
    // Force-refresh when productions page clears the cache after a manual resync
    const handleStorage = (e: StorageEvent) => {
      if (e.key === 'productions_global_widget_cache_v3' && e.newValue === null) forceRefresh();
    };

    window.addEventListener('focus', requestRefresh);
    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('storage', handleStorage);
    return () => {
      window.clearInterval(intervalId);
      window.removeEventListener('focus', requestRefresh);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('storage', handleStorage);
    };
  }, []);

  useEffect(() => {
    const nextDays = getWeekDays(weekOffset);
    setDays(nextDays);
    const weekId = getWeekId(nextDays[0]);
    // Serve in-memory session cache instantly (survives week navigation like the productions page),
    // then fall back to localStorage, then show null while the network fetch runs.
    const inMemory = sessionCache.current.get(weekId);
    setProductions(inMemory ?? loadFromCache(weekId));
    setMyProductionDates(null);
  }, [weekOffset]);

  useEffect(() => {
    if (!user) return;

    let cancelled = false;
    const weekId = getWeekId(days[0]);
    const weekStart = days[0];
    const weekEnd = days[6];

    const fetchGlobalWeek = async () => {
      lastFetchStartedAt.current = Date.now();
      const token = await user.getIdToken().catch(() => '');
      if (!token) return;

      const curDisplayName = displayNameRef.current;
      const curPhone = phoneRef.current;
      const curProfileIdentityId = profileIdentityIdRef.current;
      const normalizedPhone = normalizePhone(curPhone) ?? '';

      const [globalPayload, personalPayload, myPayload, profilePayload] = await Promise.all([
        fetch(`/api/productions/week?weekStart=${weekStart}&weekEnd=${weekEnd}`, {
          headers: { Authorization: `Bearer ${token}` },
          cache: 'no-store',
        })
          .then((r) => (r.ok ? (r.json() as Promise<{ productions?: Production[]; lastSyncAt?: number | null }>) : { productions: [], lastSyncAt: null }))
          .catch(() => ({ productions: [] as Production[], lastSyncAt: null })),

        fetch(`/api/productions/personal?weekId=${weekId}`, {
          headers: { Authorization: `Bearer ${token}` },
          cache: 'no-store',
        })
          .then((r) => (r.ok ? (r.json() as Promise<{ productions?: Production[] }>) : { productions: [] }))
          .catch(() => ({ productions: [] as Production[] })),

        normalizedPhone.length >= 9
          ? fetch(
              `/api/productions/global?phone=${encodeURIComponent(normalizedPhone)}&weekStart=${weekStart}&weekEnd=${weekEnd}`,
              { headers: { Authorization: `Bearer ${token}` }, cache: 'no-store' },
            )
              .then((r) => (r.ok ? (r.json() as Promise<{ productions?: Production[] }>) : { productions: [] }))
              .catch(() => ({ productions: [] as Production[] }))
          : Promise.resolve({ productions: [] as Production[] }),
        curProfileIdentityId
          ? fetch(
              `/api/productions/global?profileId=${encodeURIComponent(curProfileIdentityId)}&weekStart=${weekStart}&weekEnd=${weekEnd}`,
              { headers: { Authorization: `Bearer ${token}` }, cache: 'no-store' },
            )
              .then((r) => (r.ok ? (r.json() as Promise<{ productions?: Production[] }>) : { productions: [] }))
              .catch(() => ({ productions: [] as Production[] }))
          : Promise.resolve({ productions: [] as Production[] }),
      ]);

      if (cancelled) return;

      const personalProds = personalPayload.productions ?? [];
      const globalProds = globalPayload.productions ?? [];
      const myPhoneProds = myPayload.productions ?? [];
      const myProfileProds = profilePayload.productions ?? [];

      const afterGlobal = mergeProductions(personalProds, globalProds, curDisplayName, curPhone);
      const afterPhone = mergeProductions(afterGlobal, myPhoneProds, curDisplayName, curPhone);
      const afterProfile = mergeProductions(afterPhone, myProfileProds, curDisplayName, curPhone);

      // Authoritatively determine "my shift" using only phone-verified or personal-schedule sources.
      // profileRes (myProfileProds) uses name-based matching which causes false positives: a stale
      // crew_list entry with the user's name highlights productions they no longer work on.
      const confirmedIds = new Set([
        ...personalProds.map((p) => p.id),
        ...myPhoneProds.map((p) => p.id),
      ].filter(Boolean) as string[]);

      const merged = deduplicateByIdentity(afterProfile).map((p) => ({
        ...p,
        isCurrentUserShift: confirmedIds.has(p.id ?? ''),
      }));

      setProductions(merged);
      if (typeof globalPayload.lastSyncAt === 'number') setLastSyncAt(globalPayload.lastSyncAt);
      // Write to both caches so subsequent navigations are instant
      sessionCache.current.set(weekId, merged);
      saveToCache(weekId, merged);

      setMyProductionDates(
        new Set(merged.filter((p) => p.isCurrentUserShift).map((p) => p.date).filter(Boolean)),
      );
    };

    fetchGlobalWeek().catch(() => {
      // Keep cached data if the network fails.
    });

    const refreshIfVisible = () => {
      if (document.visibilityState === 'visible') {
        void fetchGlobalWeek().catch(() => {
          // Keep cached data if the network fails.
        });
      }
    };
    const refreshInterval = window.setInterval(refreshIfVisible, 5 * 60 * 1000);
    document.addEventListener('visibilitychange', refreshIfVisible);

    return () => {
      cancelled = true;
      window.clearInterval(refreshInterval);
      document.removeEventListener('visibilitychange', refreshIfVisible);
    };
  // displayName/phone/profileIdentityId are in refs — no need in dep array; avoids a double fetch
  // when profile loads after initial user auth
  }, [days, user, refreshNonce]);

  const todayStr = toDateStr(new Date());
  const byDate = useMemo(() => {
    return (productions ?? []).reduce<Record<string, Production[]>>((acc, production) => {
      if (!production.date) return acc;
      if (/^טכנאי\s+תורן/i.test(production.name || '')) return acc;
      if (!acc[production.date]) acc[production.date] = [];
      acc[production.date].push(production);
      return acc;
    }, {});
  }, [productions]);

  const myShiftDays = useMemo(() => {
    if (myProductionDates !== null) return myProductionDates;
    return new Set(
      (productions ?? [])
        .filter((production) => isMyProduction(production, displayName, phone))
        .map((production) => production.date),
    );
  }, [myProductionDates, displayName, phone, productions]);

  const popupProductions = popupDate ? (byDate[popupDate] ?? []) : [];
  const popupDayIndex = popupDate ? days.indexOf(popupDate) : 0;
  const myShiftCount = myShiftDays.size;
  const weekLabel = getWeekLabel(days);
  const isCurrentWeek = weekOffset === 0;

  const renderProductionChip = useCallback((production: Production, mine: boolean, isPast: boolean) => (
    <div
      key={production.id}
      className="rounded-md px-1 py-1 text-center text-[10px] font-semibold leading-tight"
      style={{
        background: mine ? 'color-mix(in srgb, var(--theme-warning) 26%, transparent)' : 'color-mix(in srgb, var(--theme-bg-secondary) 80%, transparent)',
        color: mine ? 'var(--theme-warning)' : 'var(--theme-text-secondary)',
        border: mine ? '1px solid color-mix(in srgb, var(--theme-warning) 32%, transparent)' : '1px solid color-mix(in srgb, var(--theme-border) 60%, transparent)',
        opacity: isPast ? 0.65 : 1,
      }}
    >
      <div className="truncate">{production.name.length > 9 ? `${production.name.slice(0, 8)}...` : production.name}</div>
      {mine && production.startTime && <div className="mt-0.5 text-[9px] font-medium opacity-70">{production.startTime}</div>}
    </div>
  ), []);

  return (
    <>
      <div className="overflow-hidden rounded-2xl border shadow-[0_24px_64px_rgba(0,0,0,0.25),0_8px_20px_rgba(0,0,0,0.10),inset_0_1px_0_rgba(255,255,255,0.09)] transition duration-200 hover:shadow-[0_32px_80px_rgba(0,0,0,0.30),inset_0_1px_0_rgba(255,255,255,0.13)]" style={{ background: 'var(--theme-bg-card)', borderColor: 'var(--theme-border)' }}>
        <div className="h-[3px] bg-gradient-to-l from-orange-500 via-amber-400 to-purple-500 opacity-90" />
        <div className="flex items-center justify-between border-b px-4 py-3" style={{ borderColor: 'var(--theme-border)' }}>
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-orange-400 to-amber-500 shadow-[0_0_14px_rgba(251,146,60,0.45)]">
              <Clapperboard className="h-4 w-4 text-white" />
            </div>
            <div>
              <h2 className="text-sm font-black" style={{ color: 'var(--theme-text)' }}>
                יומן אישי
                {isCurrentWeek && <span className="mr-1.5 text-[10px] font-medium opacity-50">השבוע</span>}
              </h2>
              {mounted && (
                <p className="text-[10px]" style={{ color: 'var(--theme-text-secondary)' }}>
                  {weekLabel}
                  {productions !== null && myShiftCount > 0 && (
                    <span className="mr-1.5 font-semibold text-orange-400">· {myShiftCount} ימי עבודה שלך</span>
                  )}
                </p>
              )}
            </div>
          </div>

          <div className="flex items-center gap-1">
            <button
              onClick={() => setWeekOffset((offset) => offset - 1)}
              className="rounded-lg px-3 py-1.5 text-[11px] font-bold transition-all hover:brightness-110 active:scale-95"
              style={{ background: '#16a34a', color: 'white' }}
            >
              הקודם
            </button>
            {!isCurrentWeek && (
              <button
                onClick={() => setWeekOffset(0)}
                className="rounded-lg px-2.5 py-1.5 text-[11px] font-bold transition-all hover:opacity-80 active:scale-95"
                style={{ background: 'var(--theme-accent)', color: 'white', boxShadow: '0 0 10px color-mix(in srgb, var(--theme-accent) 40%, transparent)' }}
              >
                היום
              </button>
            )}
            <button
              onClick={() => setWeekOffset((offset) => offset + 1)}
              className="rounded-lg px-3 py-1.5 text-[11px] font-bold transition-all hover:brightness-110 active:scale-95"
              style={{ background: '#16a34a', color: 'white' }}
            >
              הבא
            </button>
            <div className="mx-1 h-4 w-px opacity-20" style={{ background: 'var(--theme-border)' }} />
            <Link href="/productions" className="flex items-center gap-0.5 text-xs font-medium opacity-50 transition-opacity hover:opacity-100" style={{ color: 'var(--theme-accent)' }}>
              לכל האירועים
              <ArrowLeft className="h-3.5 w-3.5" />
            </Link>
          </div>
        </div>

        {mounted && lastSyncAt && (
          <div
            className="flex items-center gap-1.5 border-b px-4 py-1.5"
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

        <div className="grid grid-cols-7">
          {days.map((dateStr, index) => {
            const [, , dayNum] = dateStr.split('-');
            const isToday = dateStr === todayStr;
            const dayProds = byDate[dateStr] ?? [];
            const isMyDay = myShiftDays.has(dateStr);
            const isPast = mounted && dateStr < todayStr;
            const myProdsToday = dayProds.filter((production) => production.isCurrentUserShift);
            const otherProdsToday = dayProds.filter((production) => !production.isCurrentUserShift);

            return (
              <button
                key={dateStr}
                disabled={dayProds.length === 0}
                onClick={() => dayProds.length > 0 && setPopupDate(dateStr)}
                className="relative flex flex-col items-center gap-1.5 px-1 py-3 transition-all enabled:hover:-translate-y-0.5 enabled:hover:bg-[var(--theme-accent-glow)] enabled:hover:shadow-inner"
                style={{
                  background: isMyDay
                    ? 'linear-gradient(180deg, color-mix(in srgb, var(--theme-warning) 18%, transparent), color-mix(in srgb, var(--theme-warning) 7%, transparent))'
                    : isToday
                    ? 'linear-gradient(180deg, color-mix(in srgb, var(--theme-accent) 22%, transparent), color-mix(in srgb, var(--theme-accent) 8%, transparent))'
                    : 'transparent',
                  borderLeft: index < 6 ? '1px solid var(--theme-border)' : undefined,
                  boxShadow: isMyDay
                    ? 'inset 0 0 0 1.5px color-mix(in srgb, var(--theme-warning) 30%, transparent)'
                    : isToday
                    ? 'inset 0 0 0 1.5px color-mix(in srgb, var(--theme-accent) 30%, transparent)'
                    : undefined,
                  cursor: dayProds.length > 0 ? 'pointer' : 'default',
                }}
              >
                {isMyDay && <div className="absolute left-0 right-0 top-0 h-0.5 bg-gradient-to-r from-orange-400 to-amber-400" />}
                {!isMyDay && isToday && <div className="absolute left-0 right-0 top-0 h-0.5 bg-gradient-to-r from-purple-500 to-blue-500" />}
                <span
                  className="text-[10px] font-bold"
                  style={{
                    color: isMyDay ? 'var(--theme-warning)' : isToday ? 'var(--theme-accent)' : 'var(--theme-text-secondary)',
                    opacity: isPast && !isToday && !isMyDay ? 0.4 : 1,
                  }}
                >
                  {DAY_NAMES[index]}
                </span>
                <div
                  className={`flex h-6 w-6 items-center justify-center rounded-full text-[11px] font-black transition-all ${isToday ? 'bg-gradient-to-br from-purple-500 to-blue-500 text-white shadow-[0_0_12px_rgba(147,51,234,0.65)] ring-2 ring-white/20' : ''}`}
                  style={!isToday ? {
                    color: isMyDay ? 'var(--theme-warning)' : isPast ? 'var(--theme-text-secondary)' : 'var(--theme-text)',
                    opacity: isPast && !isMyDay ? 0.4 : 1,
                  } : undefined}
                >
                  {parseInt(dayNum, 10)}
                </div>
                <div className="flex min-h-[48px] w-full flex-col items-stretch gap-1 px-0.5">
                  {!mounted ? null : dayProds.length === 0 ? (
                    <div className="mt-2 flex justify-center">
                      <div className="h-1.5 w-1.5 rounded-full opacity-15" style={{ background: 'var(--theme-text-secondary)' }} />
                    </div>
                  ) : (
                    <>
                      {myProdsToday.slice(0, 3).map((production) => renderProductionChip(production, true, isPast))}
                      {otherProdsToday.slice(0, isMyDay ? 1 : 2).map((production) => renderProductionChip(production, false, isPast))}
                      {dayProds.length > myProdsToday.slice(0, 3).length + otherProdsToday.slice(0, isMyDay ? 1 : 2).length && (
                        <span className="text-center text-[9px] font-semibold" style={{ color: isMyDay ? 'var(--theme-warning)' : 'var(--theme-accent)', opacity: 0.7 }}>
                          +{dayProds.length - myProdsToday.slice(0, 3).length - otherProdsToday.slice(0, isMyDay ? 1 : 2).length}
                        </span>
                      )}
                    </>
                  )}
                </div>
              </button>
            );
          })}
        </div>

        {/* Always reserve this height so loading→loaded doesn't cause a layout shift */}
        <div className="border-t px-4 py-3 text-center" style={{ borderColor: 'var(--theme-border)', minHeight: '2.25rem' }}>
          <p
            className="text-xs transition-opacity duration-300"
            style={{ color: 'var(--theme-text-secondary)', opacity: productions === null ? 1 : 0 }}
          >
            {user ? 'טוען את לוח ההפקות הגלובלי...' : 'יש להתחבר כדי לצפות בלוח ההפקות'}
          </p>
        </div>
      </div>

      {popupDate && popupProductions.length > 0 && (
        <DayPopup
          dateStr={popupDate}
          dayIndex={popupDayIndex >= 0 ? popupDayIndex : 0}
          productions={popupProductions}
          displayName={displayName}
          phone={phone}
          onClose={() => setPopupDate(null)}
        />
      )}
    </>
  );
}
