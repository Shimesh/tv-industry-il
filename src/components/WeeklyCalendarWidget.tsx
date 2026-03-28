'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { X, Clapperboard, ArrowLeft, Clock, MapPin, User } from 'lucide-react';
import { collection, getDocs } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useAuth } from '@/contexts/AuthContext';
import { normalizePhone, normalizeName } from '@/lib/crewNormalization';
import type { Production } from '@/lib/productionDiff';

/* ─── constants ─────────────────────────────── */
const CACHE_KEY = 'productions_cache_v2';
const CACHE_TTL = 24 * 60 * 60 * 1000;
const DAY_NAMES = ['א׳', 'ב׳', 'ג׳', 'ד׳', 'ה׳', 'ו׳', 'ש׳'];

/* ─── helpers ───────────────────────────────── */
function toDateStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function getWeekId(dateStr: string): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  const sunday = new Date(y, m - 1, d - date.getDay());
  return toDateStr(sunday);
}

function getWeekDays(): string[] {
  const today = new Date();
  const sunday = new Date(today.getFullYear(), today.getMonth(), today.getDate() - today.getDay());
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(sunday.getFullYear(), sunday.getMonth(), sunday.getDate() + i);
    return toDateStr(d);
  });
}

function loadFromCache(): Production[] | null {
  try {
    if (typeof window === 'undefined') return null;
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const cache = JSON.parse(raw) as Record<string, { data: Production[]; savedAt: number }>;
    const weekId = getWeekId(toDateStr(new Date()));
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
  const [y, m, d] = dateStr.split('-').map(Number);
  const months = ['ינואר','פברואר','מרץ','אפריל','מאי','יוני','יולי','אוגוסט','ספטמבר','אוקטובר','נובמבר','דצמבר'];
  return `יום ${DAY_NAMES[dayIndex]} · ${d} ב${months[m - 1]}`;
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
          <button
            onClick={onClose}
            className="p-1 rounded-lg hover:bg-white/10 transition-colors"
          >
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
                  {mine && (
                    <div className="w-1.5 h-1.5 rounded-full bg-orange-400 mt-1.5 shrink-0" />
                  )}
                  <div className={`flex-1 ${!mine ? 'pr-3.5' : ''}`}>
                    <p
                      className="text-sm font-bold leading-tight"
                      style={{ color: mine ? 'rgb(251,146,60)' : 'var(--theme-text)' }}
                    >
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
  const [days] = useState<string[]>(() => getWeekDays());
  const [productions, setProductions] = useState<Production[] | null>(null);
  const [mounted, setMounted] = useState(false);
  const [popupDate, setPopupDate] = useState<string | null>(null);

  const displayName = profile?.displayName ?? '';
  const phone = profile?.phone ?? '';

  /* Phase 1: localStorage */
  useEffect(() => {
    setMounted(true);
    const cached = loadFromCache();
    if (cached) setProductions(cached);
  }, []);

  /* Phase 2: Firestore background refresh */
  useEffect(() => {
    if (!user) return;
    const weekId = getWeekId(toDateStr(new Date()));
    const colRef = collection(db, `productions/global/weeks/${weekId}/productions`);
    getDocs(colRef).then(snap => {
      if (snap.empty) return;
      const prods: Production[] = [];
      snap.forEach(doc => {
        const d = doc.data();
        prods.push({
          id: doc.id,
          name: d.name ?? '',
          studio: d.studio ?? '',
          date: d.date ?? '',
          day: d.day ?? '',
          startTime: d.startTime ?? '',
          endTime: d.endTime ?? '',
          status: (d.status ?? 'scheduled') as Production['status'],
          crew: Array.isArray(d.crew) ? d.crew : [],
          isCurrentUserShift: d.isCurrentUserShift === true,
          lastUpdatedBy: d.lastUpdatedBy ?? '',
          lastUpdatedAt: d.lastUpdatedAt ?? '',
        });
      });
      setProductions(prods);
    }).catch(() => { /* silently ignore — cache still shown */ });
  }, [user]);

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

  return (
    <>
      <div
        className="rounded-2xl border overflow-hidden transition-all hover:shadow-lg"
        style={{ background: 'var(--theme-bg-card)', borderColor: 'var(--theme-border)' }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b" style={{ borderColor: 'var(--theme-border)' }}>
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-orange-400 to-amber-500 flex items-center justify-center shrink-0">
              <Clapperboard className="w-3.5 h-3.5 text-white" />
            </div>
            <div>
              <h2 className="text-sm font-black" style={{ color: 'var(--theme-text)' }}>לוח הפקות השבוע</h2>
              {mounted && (
                <p className="text-[10px]" style={{ color: 'var(--theme-text-secondary)' }}>
                  {!productions
                    ? 'טוען...'
                    : myShiftCount > 0
                      ? `${myShiftCount} ימי עבודה שלך השבוע`
                      : productions.length > 0
                        ? `${productions.length} הפקות`
                        : 'אין הפקות השבוע'}
                </p>
              )}
            </div>
          </div>
          <Link
            href="/productions"
            className="flex items-center gap-1 text-xs font-medium opacity-50 hover:opacity-100 transition-opacity"
            style={{ color: 'var(--theme-accent)' }}
          >
            לכל ההפקות
            <ArrowLeft className="w-3.5 h-3.5" />
          </Link>
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

            return (
              <button
                key={dateStr}
                disabled={!isClickable}
                onClick={() => isClickable ? setPopupDate(dateStr) : undefined}
                className="flex flex-col items-center py-2.5 px-1 gap-1.5 relative transition-colors"
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

                {/* Day number circle */}
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

                {/* Production chips */}
                <div className="flex flex-col items-center gap-1 w-full min-h-[32px]">
                  {!mounted ? null : dayProds.length === 0 ? (
                    <div className="w-1 h-1 rounded-full opacity-15" style={{ background: 'var(--theme-text-secondary)' }} />
                  ) : dayProds.slice(0, 2).map((p, pi) => {
                    const mine = isMyProduction(p, displayName, phone);
                    return (
                      <div key={pi} className="w-full px-0.5">
                        <div
                          className="rounded text-[8px] font-semibold text-center truncate px-1 py-0.5 leading-tight"
                          style={{
                            background: mine
                              ? 'rgba(251, 146, 60, 0.20)'
                              : isToday
                                ? 'rgba(139, 92, 246, 0.15)'
                                : 'rgba(255,255,255,0.05)',
                            color: mine ? 'rgb(251,146,60)' : isToday ? 'var(--theme-accent)' : 'var(--theme-text-secondary)',
                            opacity: isPast && !mine ? 0.5 : 1,
                          }}
                        >
                          {p.name.length > 7 ? p.name.slice(0, 6) + '…' : p.name}
                        </div>
                      </div>
                    );
                  })}
                  {dayProds.length > 2 && (
                    <span className="text-[8px] font-medium" style={{ color: 'var(--theme-accent)', opacity: 0.7 }}>
                      +{dayProds.length - 2}
                    </span>
                  )}
                </div>
              </button>
            );
          })}
        </div>

        {/* Footer — only when no cache */}
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
