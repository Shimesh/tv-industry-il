'use client';

import { useState, useMemo, useEffect } from 'react';
import { Production, formatDateShort, getHebrewDay, getHebrewMonth } from '@/lib/productionDiff';
import ProductionBlock from './ProductionBlock';
import CrewModal from './CrewModal';
import ChangeHistory from './ChangeHistory';
import CalendarNavigation, { CalendarView } from './CalendarNavigation';
import MonthView from './MonthView';
import ListView from './ListView';
import { Eye, Users } from 'lucide-react';

interface WeeklyCalendarProps {
  productions: Production[];
  weekStart: string;
  weekEnd: string;
  workerName: string;
  currentUserName?: string;
  // Calendar navigation
  onNavigate?: (direction: 'prev' | 'next' | 'today') => void;
  onViewChange?: (view: CalendarView) => void;
  calendarView?: CalendarView;
  calendarYear?: number;
  calendarMonth?: number;
  navLoading?: boolean;
}

type ViewMode = 'personal' | 'department';

export default function WeeklyCalendar({
  productions,
  weekStart,
  weekEnd,
  workerName,
  currentUserName,
  onNavigate,
  onViewChange,
  calendarView = 'week',
  calendarYear,
  calendarMonth,
  navLoading,
}: WeeklyCalendarProps) {
  const [viewMode, setViewMode] = useState<ViewMode>('department');
  const [selectedProduction, setSelectedProduction] = useState<Production | null>(null);
  const [historyProduction, setHistoryProduction] = useState<Production | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const todayLocal = useMemo(() => localDateString(new Date()), []);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(searchQuery), 180);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Build week days array
  const weekDays = getWeekDays(weekStart);

  // Fuzzy name matching helper
  const isUserCrew = (crewName: string): boolean => {
    if (!crewName) return false;
    const names = [currentUserName, workerName].filter(Boolean) as string[];
    for (const name of names) {
      if (!name) continue;
      if (crewName === name) return true;
      if (crewName.includes(name) || name.includes(crewName)) return true;
      const crewFirst = crewName.split(/\s+/)[0];
      const nameFirst = name.split(/\s+/)[0];
      if (crewFirst && nameFirst && crewFirst === nameFirst && crewFirst.length >= 2) return true;
    }
    return false;
  };

  // Filter productions based on view mode
  const filteredProductions = useMemo(() => {
    let prods = viewMode === 'personal'
      ? productions.filter(p =>
        (p.isCurrentUserShift || p.crew.some(c => isUserCrew(c.name))) &&
        p.status !== 'cancelled'
      )
      : productions;

    // Apply search filter
    if (debouncedSearch.trim()) {
      const q = debouncedSearch.trim().toLowerCase();
      prods = prods.filter(p =>
        p.name.toLowerCase().includes(q) ||
        p.studio.toLowerCase().includes(q) ||
        p.crew.some(c => c.name.toLowerCase().includes(q))
      );
    }

    return prods;
  }, [productions, viewMode, debouncedSearch]);

  // Group productions by date
  const productionsByDate = useMemo(() => {
    const map = new Map<string, Production[]>();
    for (const prod of filteredProductions) {
      const existing = map.get(prod.date) || [];
      existing.push(prod);
      map.set(prod.date, existing);
    }
    // Sort within each day
    for (const [date, prods] of map) {
      map.set(date, prods.sort((a, b) => a.startTime.localeCompare(b.startTime)));
    }
    return map;
  }, [filteredProductions]);

  // Compute period label
  const periodLabel = useMemo(() => {
    if (calendarView === 'month' && calendarYear !== undefined && calendarMonth !== undefined) {
      return `${getHebrewMonth(calendarMonth)} ${calendarYear}`;
    }
    if (weekStart && weekEnd) {
      return `${formatDateShort(weekStart)} - ${formatDateShort(weekEnd)}`;
    }
    return '';
  }, [calendarView, calendarYear, calendarMonth, weekStart, weekEnd]);

  // Check if current period
  const isCurrentPeriod = useMemo(() => {
    const now = new Date();
    if (calendarView === 'month' && calendarYear !== undefined && calendarMonth !== undefined) {
      return now.getFullYear() === calendarYear && now.getMonth() === calendarMonth;
    }
    return todayLocal >= weekStart && todayLocal <= weekEnd;
  }, [calendarView, calendarYear, calendarMonth, weekStart, weekEnd, todayLocal]);

  return (
    <div>
      {/* Calendar Navigation */}
      {onNavigate && onViewChange && (
        <CalendarNavigation
          view={calendarView}
          onViewChange={onViewChange}
          periodLabel={periodLabel}
          onPrev={() => onNavigate('prev')}
          onNext={() => onNavigate('next')}
          onToday={() => onNavigate('today')}
          isCurrentPeriod={isCurrentPeriod}
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          loading={navLoading}
        />
      )}

      {/* Personal/Department toggle */}
      <div className="flex items-center justify-end mb-3">
        <div className="flex rounded-xl overflow-hidden border" style={{ borderColor: 'var(--theme-border)' }}>
          <button
            onClick={() => setViewMode('personal')}
            className="flex items-center gap-1.5 px-3 py-2 text-xs font-bold transition-all"
            style={{
              background: viewMode === 'personal' ? 'var(--theme-accent)' : 'var(--theme-bg-secondary)',
              color: viewMode === 'personal' ? 'white' : 'var(--theme-text-secondary)',
            }}
          >
            <Eye className="w-3.5 h-3.5" />
            אישי
          </button>
          <button
            onClick={() => setViewMode('department')}
            className="flex items-center gap-1.5 px-3 py-2 text-xs font-bold transition-all"
            style={{
              background: viewMode === 'department' ? 'var(--theme-accent)' : 'var(--theme-bg-secondary)',
              color: viewMode === 'department' ? 'white' : 'var(--theme-text-secondary)',
            }}
          >
            <Users className="w-3.5 h-3.5" />
            מחלקה
          </button>
        </div>
      </div>

      {/* Personal view header */}
      {viewMode === 'personal' && workerName && (
        <div className="mb-3 px-3 py-2 rounded-xl bg-amber-500/10 border border-amber-500/20">
          <span className="text-sm text-amber-300">
            לוח עבודה של <span className="font-bold">{workerName}</span>
          </span>
        </div>
      )}

      {/* ═══════════ WEEK VIEW ═══════════ */}
      {calendarView === 'week' && (
        <div className="space-y-3">
          {/* Mobile: vertical days */}
          <div className="block lg:hidden space-y-3">
            {weekDays.map(day => {
              const dayProductions = productionsByDate.get(day.date) || [];
              const isToday = day.date === todayLocal;

              return (
                <div key={day.date}>
                  <div
                    className={`flex items-center gap-2 px-3 py-2 rounded-xl mb-2 ${isToday ? 'ring-1' : ''}`}
                    style={{
                      background: isToday ? 'var(--theme-accent-glow)' : 'var(--theme-bg-secondary)',
                      ...(isToday ? { ringColor: 'var(--theme-accent)' } : {}),
                    }}
                  >
                    <span className="text-sm font-bold" style={{ color: isToday ? 'var(--theme-accent)' : 'var(--theme-text)' }}>
                      {day.hebrewDay}
                    </span>
                    <span className="text-xs" style={{ color: 'var(--theme-text-secondary)' }}>
                      {day.display}
                    </span>
                    {isToday && (
                      <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-[var(--theme-accent)] text-white">
                        היום
                      </span>
                    )}
                    <span className="text-xs mr-auto" style={{ color: 'var(--theme-text-secondary)' }}>
                      {dayProductions.filter(p => p.status !== 'cancelled').length} הפקות
                    </span>
                  </div>

                  {dayProductions.length === 0 ? (
                    <div className="text-center py-4 text-xs" style={{ color: 'var(--theme-text-secondary)' }}>
                      אין הפקות
                    </div>
                  ) : (
                    <div className="space-y-2 pr-2">
                      {dayProductions.map(prod => {
                        const userCrewMember = prod.crew.find(c => isUserCrew(c.name));
                        const isCurrentUser = prod.isCurrentUserShift || !!userCrewMember;
                        return (
                          <ProductionBlock
                            key={prod.id}
                            production={prod}
                            isCurrentUser={isCurrentUser}
                            userRole={userCrewMember?.role}
                            hasUpdates={(prod.versions?.length || 0) > 0}
                            onClick={() => setSelectedProduction(prod)}
                            onInfoClick={() => setHistoryProduction(prod)}
                          />
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Desktop: horizontal grid */}
          <div className="hidden lg:grid lg:grid-cols-7 gap-2">
            {weekDays.map(day => {
              const dayProductions = productionsByDate.get(day.date) || [];
              const isToday = day.date === todayLocal;

              return (
                <div key={day.date} className="min-h-[200px]">
                  <div
                    className={`text-center px-2 py-2 rounded-xl mb-2 ${isToday ? 'ring-1' : ''}`}
                    style={{
                      background: isToday ? 'var(--theme-accent-glow)' : 'var(--theme-bg-secondary)',
                      ...(isToday ? { ringColor: 'var(--theme-accent)' } : {}),
                    }}
                  >
                    <div className="text-xs font-bold" style={{ color: isToday ? 'var(--theme-accent)' : 'var(--theme-text)' }}>
                      {day.hebrewDay}
                    </div>
                    <div className="text-xs" style={{ color: 'var(--theme-text-secondary)' }}>
                      {day.display}
                    </div>
                  </div>

                  <div className="space-y-2">
                    {dayProductions.map(prod => {
                      const userCrewMember = prod.crew.find(c => isUserCrew(c.name));
                      const isCurrentUser = prod.isCurrentUserShift || !!userCrewMember;
                      return (
                        <ProductionBlock
                          key={prod.id}
                          production={prod}
                          isCurrentUser={isCurrentUser}
                          userRole={userCrewMember?.role}
                          hasUpdates={(prod.versions?.length || 0) > 0}
                          onClick={() => setSelectedProduction(prod)}
                          onInfoClick={() => setHistoryProduction(prod)}
                        />
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ═══════════ MONTH VIEW ═══════════ */}
      {calendarView === 'month' && calendarYear !== undefined && calendarMonth !== undefined && (
        <MonthView
          productions={filteredProductions}
          year={calendarYear}
          month={calendarMonth}
          currentUserName={currentUserName}
          workerName={workerName}
          onProductionClick={(prod) => setSelectedProduction(prod)}
          onInfoClick={(prod) => setHistoryProduction(prod)}
        />
      )}

      {/* ═══════════ LIST VIEW ═══════════ */}
      {calendarView === 'list' && (
        <ListView
          productions={filteredProductions}
          searchQuery={searchQuery}
          currentUserName={currentUserName}
          workerName={workerName}
          onProductionClick={(prod) => setSelectedProduction(prod)}
          onInfoClick={(prod) => setHistoryProduction(prod)}
        />
      )}

      {/* Crew Modal */}
      {selectedProduction && (
        <CrewModal
          production={selectedProduction}
          currentUserName={currentUserName || workerName}
          onClose={() => setSelectedProduction(null)}
        />
      )}

      {/* Change History Modal */}
      {historyProduction && (
        <ChangeHistory
          production={historyProduction}
          onClose={() => setHistoryProduction(null)}
        />
      )}
    </div>
  );
}

// Helper: generate array of 7 days from weekStart (Sunday)
function getWeekDays(weekStart: string): { date: string; display: string; hebrewDay: string }[] {
  const days: { date: string; display: string; hebrewDay: string }[] = [];
  if (!weekStart) return days;
  const [y, m, d] = weekStart.split('-').map(Number);
  const start = new Date(y, (m || 1) - 1, d || 1);

  for (let i = 0; i < 7; i++) {
    const d = new Date(start);
    d.setDate(d.getDate() + i);
    const dateStr = localDateString(d);
    days.push({
      date: dateStr,
      display: formatDateShort(dateStr),
      hebrewDay: getHebrewDay(dateStr),
    });
  }

  return days;
}

function localDateString(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}
