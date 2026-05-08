'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, ChevronLeft, ChevronRight, Clapperboard, Clock, MapPin, User, X } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { normalizeName, normalizePhone } from '@/lib/crewNormalization';
import type { Production } from '@/lib/productionDiff';

const CACHE_KEY = 'productions_global_widget_cache_v1';
const CACHE_TTL = 24 * 60 * 60 * 1000;
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
          <button onClick={onClose} className="rounded-lg p-1 transition-colors hover:bg-white/10" aria-label="סגור">
            <X className="h-4 w-4" style={{ color: 'var(--theme-text-secondary)' }} />
          </button>
        </div>

        <div className="max-h-[50vh] overflow-y-auto divide-y" style={{ borderColor: 'var(--theme-border)' }}>
          {productions.map((production) => {
            const mine = isMyProduction(production, displayName, phone);
            const myRole = mine ? getMyRole(production, displayName, phone) : '';
            return (
              <div key={production.id} className="px-4 py-3" style={mine ? { background: 'rgba(251, 146, 60, 0.08)' } : undefined}>
                <div className="flex items-start gap-2">
                  {mine && <div className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-orange-400" />}
                  <div className={`flex-1 ${mine ? '' : 'pr-3.5'}`}>
                    <p className="text-sm font-bold leading-tight" style={{ color: mine ? 'rgb(251,146,60)' : 'var(--theme-text)' }}>
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
            href="/productions"
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
  const [mounted, setMounted] = useState(false);
  const [popupDate, setPopupDate] = useState<string | null>(null);

  const displayName = profile?.crewName || profile?.displayName || user?.displayName || '';
  const phone = profile?.phone ?? '';

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    const nextDays = getWeekDays(weekOffset);
    setDays(nextDays);
    const weekId = getWeekId(nextDays[0]);
    setProductions(loadFromCache(weekId));
    setMyProductionDates(null);
  }, [weekOffset]);

  useEffect(() => {
    if (!user) return;

    let cancelled = false;
    const weekId = getWeekId(days[0]);
    const weekStart = days[0];
    const weekEnd = days[6];

    const fetchGlobalWeek = async () => {
      const token = await user.getIdToken().catch(() => '');
      if (!token) return;

      const normalizedPhone = normalizePhone(phone) ?? '';

      const [globalPayload, personalPayload, myPayload] = await Promise.all([
        fetch(`/api/productions/week?weekStart=${weekStart}&weekEnd=${weekEnd}`, {
          headers: { Authorization: `Bearer ${token}` },
          cache: 'no-store',
        })
          .then((r) => (r.ok ? (r.json() as Promise<{ productions?: Production[] }>) : { productions: [] }))
          .catch(() => ({ productions: [] as Production[] })),

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
      ]);

      if (cancelled) return;

      const personalProds = personalPayload.productions ?? [];
      const globalProds = globalPayload.productions ?? [];
      const myPhoneProds = myPayload.productions ?? [];

      const afterGlobal = mergeProductions(personalProds, globalProds, displayName, phone);
      const merged = mergeProductions(afterGlobal, myPhoneProds, displayName, phone);

      setProductions(merged);
      saveToCache(weekId, merged);

      setMyProductionDates(
        new Set([...personalProds.map((p) => p.date), ...myPhoneProds.map((p) => p.date)].filter(Boolean)),
      );
    };

    fetchGlobalWeek().catch(() => {
      // Keep cached data if the network fails.
    });

    return () => {
      cancelled = true;
    };
  }, [days, user]);

  const todayStr = mounted ? toDateStr(new Date()) : '';
  const byDate = useMemo(() => {
    return (productions ?? []).reduce<Record<string, Production[]>>((acc, production) => {
      if (!production.date) return acc;
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
        background: mine ? 'rgba(251, 146, 60, 0.22)' : 'rgba(255,255,255,0.05)',
        color: mine ? 'rgb(251,146,60)' : 'var(--theme-text-secondary)',
        opacity: isPast ? 0.65 : 1,
      }}
    >
      <div className="truncate">{production.name.length > 9 ? `${production.name.slice(0, 8)}...` : production.name}</div>
      {mine && production.startTime && <div className="mt-0.5 text-[9px] font-medium opacity-70">{production.startTime}</div>}
    </div>
  ), []);

  return (
    <>
      <div className="overflow-hidden rounded-2xl border" style={{ background: 'var(--theme-bg-card)', borderColor: 'var(--theme-border)' }}>
        <div className="flex items-center justify-between border-b px-4 py-3" style={{ borderColor: 'var(--theme-border)' }}>
          <div className="flex items-center gap-2">
            <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-orange-400 to-amber-500">
              <Clapperboard className="h-3.5 w-3.5 text-white" />
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
            <button onClick={() => setWeekOffset((offset) => offset - 1)} className="rounded-lg p-1 transition-colors hover:bg-white/10" title="שבוע קודם">
              <ChevronRight className="h-4 w-4" style={{ color: 'var(--theme-text-secondary)' }} />
            </button>
            {!isCurrentWeek && (
              <button
                onClick={() => setWeekOffset(0)}
                className="rounded px-1.5 py-0.5 text-[10px] font-semibold transition-colors hover:opacity-80"
                style={{ background: 'rgba(139,92,246,0.15)', color: 'var(--theme-accent)' }}
              >
                היום
              </button>
            )}
            <button onClick={() => setWeekOffset((offset) => offset + 1)} className="rounded-lg p-1 transition-colors hover:bg-white/10" title="שבוע הבא">
              <ChevronLeft className="h-4 w-4" style={{ color: 'var(--theme-text-secondary)' }} />
            </button>
            <div className="mx-1 h-4 w-px opacity-20" style={{ background: 'var(--theme-border)' }} />
            <Link href="/productions" className="flex items-center gap-0.5 text-xs font-medium opacity-50 transition-opacity hover:opacity-100" style={{ color: 'var(--theme-accent)' }}>
              לכל האירועים
              <ArrowLeft className="h-3.5 w-3.5" />
            </Link>
          </div>
        </div>

        <div className="grid grid-cols-7">
          {days.map((dateStr, index) => {
            const [, , dayNum] = dateStr.split('-');
            const isToday = dateStr === todayStr;
            const dayProds = byDate[dateStr] ?? [];
            const isMyDay = myShiftDays.has(dateStr);
            const isPast = mounted && dateStr < todayStr;
            const myProdsToday = dayProds.filter((production) => isMyProduction(production, displayName, phone));
            const otherProdsToday = dayProds.filter((production) => !isMyProduction(production, displayName, phone));

            return (
              <button
                key={dateStr}
                disabled={dayProds.length === 0}
                onClick={() => dayProds.length > 0 && setPopupDate(dateStr)}
                className="relative flex flex-col items-center gap-1.5 px-1 py-3 transition-colors"
                style={{
                  background: isMyDay ? 'rgba(251, 146, 60, 0.10)' : isToday ? 'rgba(139, 92, 246, 0.06)' : 'transparent',
                  borderLeft: index < 6 ? '1px solid var(--theme-border)' : undefined,
                  cursor: dayProds.length > 0 ? 'pointer' : 'default',
                }}
              >
                {isMyDay && <div className="absolute left-0 right-0 top-0 h-0.5 bg-gradient-to-r from-orange-400 to-amber-400" />}
                {!isMyDay && isToday && <div className="absolute left-0 right-0 top-0 h-0.5 bg-gradient-to-r from-purple-500 to-blue-500" />}
                <span
                  className="text-[10px] font-bold"
                  style={{
                    color: isMyDay ? 'rgb(251,146,60)' : isToday ? 'var(--theme-accent)' : 'var(--theme-text-secondary)',
                    opacity: isPast && !isToday && !isMyDay ? 0.4 : 1,
                  }}
                >
                  {DAY_NAMES[index]}
                </span>
                <div
                  className={`flex h-6 w-6 items-center justify-center rounded-full text-[11px] font-black transition-all ${isToday ? 'bg-gradient-to-br from-purple-500 to-blue-500 text-white shadow-sm' : ''}`}
                  style={!isToday ? {
                    color: isMyDay ? 'rgb(251,146,60)' : isPast ? 'var(--theme-text-secondary)' : 'var(--theme-text)',
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
                        <span className="text-center text-[9px] font-semibold" style={{ color: isMyDay ? 'rgb(251,146,60)' : 'var(--theme-accent)', opacity: 0.7 }}>
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

        {mounted && productions === null && (
          <div className="border-t px-4 py-3 text-center" style={{ borderColor: 'var(--theme-border)' }}>
            <p className="text-xs" style={{ color: 'var(--theme-text-secondary)' }}>
              {user ? 'טוען את לוח ההפקות הגלובלי...' : 'יש להתחבר כדי לצפות בלוח ההפקות'}
            </p>
          </div>
        )}
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
