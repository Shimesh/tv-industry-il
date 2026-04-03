'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { X, Clapperboard, ArrowLeft, Clock, MapPin, User, ChevronRight, ChevronLeft } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { normalizePhone, normalizeName } from '@/lib/crewNormalization';
import type { Production } from '@/lib/productionDiff';

/* ─── constants ─────────────────────────────── */
const CACHE_KEY = 'productions_cache_v2';
const CACHE_TTL = 24 * 60 * 60 * 1000;
const DAY_NAMES = ['א׳', 'ב׳', 'ג׳', 'ד׳', 'ה׳', 'ו׳', 'ש׳'];
const MONTHS = ['ינואר','פברואר','מרץ','אפריל','מאי','יוני','יולי','אוגוסט','ספטמבר','אוקטובר','נובמבר','דצמבר'];

/* ─── helpers ───────────────────────────────── */
function toDateStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function getWeekSunday(offset: number): Date {
  const today = new Date();
  return new Date(today.getFullYear(), today.getMonth(), today.getDate() - today.getDay() + offset * 7);
}

function getWeekDays(offset: number): string[] {
  const sunday = getWeekSunday(offset);
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(sunday.getFullYear(), sunday.getMonth(), sunday.getDate() + i);
    return toDateStr(d);
  });
}

function getWeekId(dateStr: string): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  const sunday = new Date(y, m - 1, d - date.getDay());
  return toDateStr(sunday);
}

function getWeekLabel(days: string[]): string {
  const [fy, fm, fd] = days[0].split('-').map(Number);
  const [, lm, ld] = days[6].split('-').map(Number);
  if (fm === lm) return `${fd}–${ld} ${MONTHS[fm - 1]}`;
  return `${fd} ${MONTHS[fm - 1]} – ${ld} ${MONTHS[lm - 1]}`;
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
  } catch { return null; }
}

function isMyProduction(p: Production, displayName: string, phone: string): boolean {
  if (p.isCurrentUserShift) return true;
  const myName = normalizeName(displayName);
  const myPhone = normalizePhone(phone);
  return p.crew.some(c => {
    if (myName && (normalizeName(c.name) === myName || normalizeName(c.normalizedName ?? '') === myName)) return true;
    if (myPhone && myPhone.length >= 9 && (normalizePhone(c.phone ?? '') === myPhone || normalizePhone(c.normalizedPhone ?? '') === myPhone)) return true;
    return false;
  });
}

function getMyRole(p: Production, displayName: string, phone: string): string {
  const myName = normalizeName(displayName);
  const myPhone = normalizePhone(phone);
  const member = p.crew.find(c => {
    if (myName && (normalizeName(c.name) === myName || normalizeName(c.normalizedName ?? '') === myName)) return true;
    if (myPhone && myPhone.length >= 9 && (normalizePhone(c.phone ?? '') === myPhone || normalizePhone(c.normalizedPhone ?? '') === myPhone)) return true;
    return false;
  });
  return member?.role || member?.roleDetail || '';
}

function formatHebrewDate(dateStr: string, dayIndex: number): string {
  const [, m, d] = dateStr.split('-').map(Number);
  return `יום ${DAY_NAMES[dayIndex]} · ${d} ב${MONTHS[m - 1]}`;
}

/* ─── Day Popup ─────────────────────────────── */
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
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-[300] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="w-full max-w-sm rounded-2xl overflow-hidden shadow-2xl border"
        style={{ background: 'var(--theme-bg-card)', borderColor: 'var(--theme-border)' }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b" style={{ borderColor: 'var(--theme-border)' }}>
          <div className="flex items-center gap-2">
            <Clapperboard className="w-4 h-4" style={{ color: 'var(--theme-accent)' }} />
            <span className="text-sm font-bold" style={{ color: 'var(--theme-text)' }}>
              {formatHebrewDate(dateStr, dayIndex)}
            </span>
          </div>
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-white/10 transition-colors">
            <X className="w-4 h-4" style={{ color: 'var(--theme-text-secondary)' }} />
          </button>
        </div>

        {/* Productions list */}
        <div className="max-h-[50vh] overflow-y-auto divide-y" style={{ borderColor: 'var(--theme-border)' }}>
          {productions.map((p) => {
            const mine = isMyProduction(p, displayName, phone);
            const myRole = mine ? getMyRole(p, displayName, phone) : '';
            return (
              <div
                key={p.id}
                className="px-4 py-3"
                style={mine ? { background: 'rgba(251, 146, 60, 0.08)' } : undefined}
              >
                <div className="flex items-start gap-2">
                  {mine && <div className="w-1.5 h-1.5 rounded-full bg-orange-400 mt-1.5 shrink-0" />}
                  <div className={`flex-1 ${!mine ? 'pr-3.5' : ''}`}>
                    <p className="text-sm font-bold leading-tight" style={{ color: mine ? 'rgb(251,146,60)' : 'var(--theme-text)' }}>
                      {p.name}
                    </p>
                    <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-1.5">
                      {(p.startTime || p.endTime) && (
                        <span className="flex items-center gap-1 text-[11px]" style={{ color: 'var(--theme-text-secondary)' }}>
                          <Clock className="w-3 h-3" />
                          {p.startTime}{p.endTime ? `–${p.endTime}` : ''}
                        </span>
                      )}
                      {p.studio && (
                        <span className="flex items-center gap-1 text-[11px]" style={{ color: 'var(--theme-text-secondary)' }}>
                          <MapPin className="w-3 h-3" />
                          {p.studio}
                        </span>
                      )}
                      {myRole && (
                        <span className="flex items-center gap-1 text-[11px] text-orange-400">
                          <User className="w-3 h-3" />
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

        {/* Footer */}
        <div className="px-4 py-3 border-t" style={{ borderColor: 'var(--theme-border)' }}>
          <Link
            href="/productions"
            onClick={onClose}
            className="flex items-center justify-center gap-1.5 w-full py-2 rounded-xl text-sm font-medium transition-colors hover:opacity-90"
            style={{ background: 'var(--theme-accent-glow)', color: 'var(--theme-accent)' }}
          >
            לצפייה בלוח המלא
            <ArrowLeft className="w-3.5 h-3.5" />
          </Link>
        </div>
      </div>
    </div>
  );
}

/* ─── Main Widget ───────────────────────────── */
export default function WeeklyCalendarWidget() {
  const { user, profile } = useAuth();
  const [weekOffset, setWeekOffset] = useState(0);
  const [days, setDays] = useState<string[]>(() => getWeekDays(0));
  const [productions, setProductions] = useState<Production[] | null>(null);
  const [mounted, setMounted] = useState(false);
  const [popupDate, setPopupDate] = useState<string | null>(null);

  const displayName = profile?.displayName ?? '';
  const phone = profile?.phone ?? '';

  // Recompute days when offset changes
  useEffect(() => {
    const newDays = getWeekDays(weekOffset);
    setDays(newDays);
    setProductions(null);
    // Phase 1: try cache
    const weekId = getWeekId(newDays[0]);
    const cached = loadFromCache(weekId);
    if (cached) setProductions(cached);
  }, [weekOffset]);

  /* Phase 1 on mount */
  useEffect(() => {
    setMounted(true);
    const weekId = getWeekId(days[0]);
    const cached = loadFromCache(weekId);
    if (cached) setProductions(cached);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* Phase 2: Firestore REST refresh (personal + all teams) */
  useEffect(() => {
    if (!user) return;
    const weekId = getWeekId(days[0]);
    const PROJECT = 'tv-industry-il';
    const BASE = `https://firestore.googleapis.com/v1/projects/${PROJECT}/databases/(default)/documents`;

    const restList = async (token: string, path: string): Promise<Production[]> => {
      const res = await fetch(`${BASE}/${path}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) return [];
      const data = await res.json() as { documents?: Array<{ name: string; fields: Record<string, Record<string, unknown>> }> };
      if (!data.documents) return [];
      return data.documents.map(doc => {
        const f = doc.fields ?? {};
        const str = (k: string) => (f[k]?.stringValue as string) ?? '';
        const arr = (k: string): Production['crew'] => {
          const av = f[k]?.arrayValue as { values?: Array<{ mapValue?: { fields?: Record<string, { stringValue?: string }> } }> } | undefined;
          return (av?.values ?? []).map(v => {
            const mf = v.mapValue?.fields ?? {};
            const s = (mk: string) => mf[mk]?.stringValue ?? '';
            return { name: s('name'), role: s('role'), roleDetail: s('roleDetail'), phone: s('phone'), normalizedName: s('normalizedName'), normalizedPhone: s('normalizedPhone'), identityKey: s('identityKey'), startTime: s('startTime'), endTime: s('endTime'), addedBy: s('addedBy'), addedAt: s('addedAt') };
          });
        };
        return {
          id: doc.name.split('/').pop() ?? '',
          name: str('name'), studio: str('studio'), date: str('date'), day: str('day'),
          startTime: str('startTime'), endTime: str('endTime'),
          status: (str('status') || 'scheduled') as Production['status'],
          crew: arr('crew'),
          isCurrentUserShift: f['isCurrentUserShift']?.booleanValue === true,
          lastUpdatedBy: str('lastUpdatedBy'), lastUpdatedAt: str('lastUpdatedAt'),
        };
      });
    };

    const fetchAll = async () => {
      const token = await user.getIdToken();
      const allProds: Production[] = [];
      let fetchSucceeded = false;

      // Personal productions — track if REST call returned 200
      const personalRes = await fetch(`${BASE}/productions/${user.uid}/weeks/${weekId}/productions`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (personalRes.ok) {
        fetchSucceeded = true;
        const data = await personalRes.json() as { documents?: Array<{ name: string; fields: Record<string, Record<string, unknown>> }> };
        allProds.push(...(data.documents ?? []).map(doc => {
          const f = doc.fields ?? {};
          const str = (k: string) => (f[k]?.stringValue as string) ?? '';
          const arr = (k: string): Production['crew'] => {
            const av = f[k]?.arrayValue as { values?: Array<{ mapValue?: { fields?: Record<string, { stringValue?: string }> } }> } | undefined;
            return (av?.values ?? []).map(v => {
              const mf = v.mapValue?.fields ?? {};
              const s = (mk: string) => mf[mk]?.stringValue ?? '';
              return { name: s('name'), role: s('role'), roleDetail: s('roleDetail'), phone: s('phone'), normalizedName: s('normalizedName'), normalizedPhone: s('normalizedPhone'), identityKey: s('identityKey'), startTime: s('startTime'), endTime: s('endTime'), addedBy: s('addedBy'), addedAt: s('addedAt') };
            });
          };
          return {
            id: doc.name.split('/').pop() ?? '',
            name: str('name'), studio: str('studio'), date: str('date'), day: str('day'),
            startTime: str('startTime'), endTime: str('endTime'),
            status: (str('status') || 'scheduled') as Production['status'],
            crew: arr('crew'),
            isCurrentUserShift: f['isCurrentUserShift']?.booleanValue === true,
            lastUpdatedBy: str('lastUpdatedBy'), lastUpdatedAt: str('lastUpdatedAt'),
          };
        }));
      }

      // Team productions (best-effort, don't block on failure)
      try {
        const teamsRes = await fetch(`${BASE}/teams?pageSize=20`, { headers: { Authorization: `Bearer ${token}` } });
        if (teamsRes.ok) {
          const teamsData = await teamsRes.json() as { documents?: Array<{ name: string; fields: Record<string, unknown> }> };
          const memberDocs = (teamsData.documents ?? []).filter(d => {
            const av = d.fields?.memberUids as { arrayValue?: { values?: Array<{ stringValue?: string }> } } | undefined;
            return av?.arrayValue?.values?.some(v => v.stringValue === user.uid);
          });
          await Promise.all(memberDocs.map(async d => {
            allProds.push(...await restList(token, `teams/${d.name.split('/').pop() ?? ''}/weeks/${weekId}/productions`));
          }));
        }
      } catch { /* ignore team errors */ }

      // Only update state if personal fetch succeeded — prevents wiping cache on network errors
      if (!fetchSucceeded) return;

      setProductions(allProds);

      // Update cache
      try {
        const raw = localStorage.getItem(CACHE_KEY);
        const cache = raw ? JSON.parse(raw) as Record<string, { data: Production[]; savedAt: number }> : {};
        cache[weekId] = { data: allProds, savedAt: Date.now() };
        localStorage.setItem(CACHE_KEY, JSON.stringify(cache));
      } catch { /* ignore */ }
    };

    fetchAll().catch(() => { /* keep existing state on total failure */ });
  }, [user, days]);

  const todayStr = mounted ? toDateStr(new Date()) : '';

  const byDate = (productions ?? []).reduce<Record<string, Production[]>>((acc, p) => {
    if (p.date) {
      if (!acc[p.date]) acc[p.date] = [];
      acc[p.date].push(p);
    }
    return acc;
  }, {});

  const myShiftDays = new Set(
    (productions ?? [])
      .filter(p => isMyProduction(p, displayName, phone))
      .map(p => p.date)
  );

  const myShiftCount = myShiftDays.size;
  const popupProductions = popupDate ? (byDate[popupDate] ?? []) : [];
  const popupDayIndex = popupDate ? days.indexOf(popupDate) : 0;
  const weekLabel = getWeekLabel(days);
  const isCurrentWeek = weekOffset === 0;

  return (
    <>
      <div
        className="rounded-2xl border overflow-hidden"
        style={{ background: 'var(--theme-bg-card)', borderColor: 'var(--theme-border)' }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b" style={{ borderColor: 'var(--theme-border)' }}>
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-orange-400 to-amber-500 flex items-center justify-center shrink-0">
              <Clapperboard className="w-3.5 h-3.5 text-white" />
            </div>
            <div>
              <h2 className="text-sm font-black" style={{ color: 'var(--theme-text)' }}>
                לוח הפקות
                {isCurrentWeek && <span className="mr-1.5 text-[10px] font-medium opacity-50">השבוע</span>}
              </h2>
              {mounted && (
                <p className="text-[10px]" style={{ color: 'var(--theme-text-secondary)' }}>
                  {weekLabel}
                  {productions !== null && myShiftCount > 0 && (
                    <span className="mr-1.5 text-orange-400 font-semibold">· {myShiftCount} ימי עבודה שלך</span>
                  )}
                </p>
              )}
            </div>
          </div>

          {/* Right side: nav arrows + link */}
          <div className="flex items-center gap-1">
            {/* Week navigation */}
            <button
              onClick={() => setWeekOffset(o => o + 1)}
              className="p-1 rounded-lg hover:bg-white/10 transition-colors"
              title="שבוע הבא"
            >
              <ChevronRight className="w-4 h-4" style={{ color: 'var(--theme-text-secondary)' }} />
            </button>
            {!isCurrentWeek && (
              <button
                onClick={() => setWeekOffset(0)}
                className="px-1.5 py-0.5 rounded text-[10px] font-semibold transition-colors hover:opacity-80"
                style={{ background: 'rgba(139,92,246,0.15)', color: 'var(--theme-accent)' }}
              >
                היום
              </button>
            )}
            <button
              onClick={() => setWeekOffset(o => o - 1)}
              className="p-1 rounded-lg hover:bg-white/10 transition-colors"
              title="שבוע קודם"
            >
              <ChevronLeft className="w-4 h-4" style={{ color: 'var(--theme-text-secondary)' }} />
            </button>
            <div className="w-px h-4 mx-1 opacity-20" style={{ background: 'var(--theme-border)' }} />
            <Link
              href="/productions"
              className="flex items-center gap-0.5 text-xs font-medium opacity-50 hover:opacity-100 transition-opacity"
              style={{ color: 'var(--theme-accent)' }}
            >
              לכל ההפקות
              <ArrowLeft className="w-3.5 h-3.5" />
            </Link>
          </div>
        </div>

        {/* Days grid */}
        <div className="grid grid-cols-7">
          {days.map((dateStr, i) => {
            const [, , dayNum] = dateStr.split('-');
            const isToday = dateStr === todayStr;
            const dayProds = byDate[dateStr] ?? [];
            const isMyDay = myShiftDays.has(dateStr);
            const isPast = mounted && dateStr < todayStr;
            const isClickable = dayProds.length > 0;
            const myProdsToday = dayProds.filter(p => isMyProduction(p, displayName, phone));

            return (
              <button
                key={dateStr}
                disabled={!isClickable}
                onClick={() => isClickable ? setPopupDate(dateStr) : undefined}
                className="flex flex-col items-center py-3 px-1 gap-1.5 relative transition-colors"
                style={{
                  background: isMyDay
                    ? 'rgba(251, 146, 60, 0.10)'
                    : isToday
                      ? 'rgba(139, 92, 246, 0.06)'
                      : 'transparent',
                  borderLeft: i < 6 ? '1px solid var(--theme-border)' : undefined,
                  cursor: isClickable ? 'pointer' : 'default',
                }}
              >
                {/* Top accent bar */}
                {isMyDay && (
                  <div className="absolute top-0 left-0 right-0 h-0.5 bg-gradient-to-r from-orange-400 to-amber-400" />
                )}
                {!isMyDay && isToday && (
                  <div className="absolute top-0 left-0 right-0 h-0.5 bg-gradient-to-r from-purple-500 to-blue-500" />
                )}

                {/* Day name */}
                <span
                  className="text-[10px] font-bold"
                  style={{
                    color: isMyDay ? 'rgb(251,146,60)' : isToday ? 'var(--theme-accent)' : 'var(--theme-text-secondary)',
                    opacity: isPast && !isToday && !isMyDay ? 0.4 : 1,
                  }}
                >
                  {DAY_NAMES[i]}
                </span>

                {/* Day number */}
                <div
                  className={`w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-black transition-all ${
                    isToday ? 'bg-gradient-to-br from-purple-500 to-blue-500 text-white shadow-sm' : ''
                  }`}
                  style={!isToday ? {
                    color: isMyDay ? 'rgb(251,146,60)' : isPast ? 'var(--theme-text-secondary)' : 'var(--theme-text)',
                    opacity: isPast && !isMyDay ? 0.4 : 1,
                  } : undefined}
                >
                  {parseInt(dayNum)}
                </div>

                {/* Productions area */}
                <div className="flex flex-col items-stretch gap-1 w-full min-h-[48px] px-0.5">
                  {!mounted ? null : dayProds.length === 0 ? (
                    <div className="flex justify-center mt-2">
                      <div className="w-1.5 h-1.5 rounded-full opacity-15" style={{ background: 'var(--theme-text-secondary)' }} />
                    </div>
                  ) : isMyDay ? (
                    /* My working day — show my productions as rows */
                    <>
                      {myProdsToday.slice(0, 3).map((p, pi) => (
                        <div
                          key={pi}
                          className="rounded-md text-[10px] font-bold text-center leading-snug px-1 py-1"
                          style={{
                            background: 'rgba(251, 146, 60, 0.22)',
                            color: 'rgb(251,146,60)',
                            opacity: isPast ? 0.7 : 1,
                          }}
                        >
                          <div className="truncate">{p.name.length > 9 ? p.name.slice(0, 8) + '…' : p.name}</div>
                          {p.startTime && (
                            <div className="opacity-70 text-[9px] font-medium mt-0.5">{p.startTime}</div>
                          )}
                        </div>
                      ))}
                      {/* Other productions (not mine) */}
                      {dayProds.filter(p => !isMyProduction(p, displayName, phone)).slice(0, 1).map((p, pi) => (
                        <div
                          key={`other-${pi}`}
                          className="rounded-md text-[9px] font-medium text-center truncate px-1 py-0.5 leading-tight opacity-50"
                          style={{
                            background: 'rgba(255,255,255,0.05)',
                            color: 'var(--theme-text-secondary)',
                          }}
                        >
                          {p.name.length > 9 ? p.name.slice(0, 8) + '…' : p.name}
                        </div>
                      ))}
                      {(myProdsToday.length > 3 || dayProds.length > myProdsToday.length + 1) && (
                        <span className="text-[9px] font-semibold text-center" style={{ color: 'rgb(251,146,60)', opacity: 0.7 }}>
                          +{dayProds.length - Math.min(myProdsToday.length, 3) - Math.min(dayProds.filter(p => !isMyProduction(p, displayName, phone)).length, 1)}
                        </span>
                      )}
                    </>
                  ) : (
                    /* Non-working day — show regular chips */
                    <>
                      {dayProds.slice(0, 2).map((p, pi) => (
                        <div
                          key={pi}
                          className="rounded-md text-[10px] font-semibold text-center truncate px-1 py-1 leading-tight"
                          style={{
                            background: isToday ? 'rgba(139, 92, 246, 0.15)' : 'rgba(255,255,255,0.05)',
                            color: isToday ? 'var(--theme-accent)' : 'var(--theme-text-secondary)',
                            opacity: isPast ? 0.5 : 1,
                          }}
                        >
                          {p.name.length > 8 ? p.name.slice(0, 7) + '…' : p.name}
                        </div>
                      ))}
                      {dayProds.length > 2 && (
                        <span className="text-[9px] font-semibold text-center" style={{ color: 'var(--theme-accent)', opacity: 0.7 }}>
                          +{dayProds.length - 2}
                        </span>
                      )}
                    </>
                  )}
                </div>
              </button>
            );
          })}
        </div>

        {/* Footer — only when no data */}
        {mounted && productions === null && (
          <div className="px-4 py-3 border-t text-center" style={{ borderColor: 'var(--theme-border)' }}>
            <p className="text-xs" style={{ color: 'var(--theme-text-secondary)' }}>
              פתח את לוח ההפקות כדי לטעון את השבוע
            </p>
          </div>
        )}
      </div>

      {/* Day popup */}
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
