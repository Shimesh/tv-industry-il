'use client';

import { useState } from 'react';
import { Production, formatDateShort, getHebrewDay } from '@/lib/productionDiff';
import ProductionBlock from './ProductionBlock';
import CrewModal from './CrewModal';
import ChangeHistory from './ChangeHistory';
import { Eye, Users, Calendar } from 'lucide-react';

interface WeeklyCalendarProps {
  productions: Production[];
  weekStart: string;
  weekEnd: string;
  workerName: string;
  currentUserName?: string;
}

type ViewMode = 'personal' | 'department';

export default function WeeklyCalendar({
  productions,
  weekStart,
  weekEnd,
  workerName,
  currentUserName,
}: WeeklyCalendarProps) {
  const [viewMode, setViewMode] = useState<ViewMode>('department');
  const [selectedProduction, setSelectedProduction] = useState<Production | null>(null);
  const [historyProduction, setHistoryProduction] = useState<Production | null>(null);

  // Build week days array
  const weekDays = getWeekDays(weekStart);

  // Fuzzy name matching helper - handles partial names, Hebrew variations
  const isUserCrew = (crewName: string): boolean => {
    if (!crewName) return false;
    const names = [currentUserName, workerName].filter(Boolean) as string[];
    for (const name of names) {
      if (!name) continue;
      // Exact match
      if (crewName === name) return true;
      // One contains the other (handles "ירון" matching "ירון אורבך")
      if (crewName.includes(name) || name.includes(crewName)) return true;
      // First name match (split by space, compare first parts)
      const crewFirst = crewName.split(/\s+/)[0];
      const nameFirst = name.split(/\s+/)[0];
      if (crewFirst && nameFirst && crewFirst === nameFirst && crewFirst.length >= 2) return true;
    }
    return false;
  };

  // Filter productions based on view mode
  const filteredProductions = viewMode === 'personal'
    ? productions.filter(p =>
      (p.isCurrentUserShift || p.crew.some(c => isUserCrew(c.name))) &&
      p.status !== 'cancelled'
    )
    : productions;

  // Group productions by date
  const productionsByDate = new Map<string, Production[]>();
  for (const prod of filteredProductions) {
    const existing = productionsByDate.get(prod.date) || [];
    existing.push(prod);
    productionsByDate.set(prod.date, existing);
  }

  // Sort productions within each day by start time
  for (const [date, prods] of productionsByDate) {
    productionsByDate.set(date, prods.sort((a, b) => a.startTime.localeCompare(b.startTime)));
  }

  return (
    <div>
      {/* View toggle */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Calendar className="w-5 h-5" style={{ color: 'var(--theme-accent)' }} />
          <h2 className="text-lg font-bold" style={{ color: 'var(--theme-text)' }}>
            {formatDateShort(weekStart)} - {formatDateShort(weekEnd)}
          </h2>
        </div>

        <div className="flex rounded-xl overflow-hidden border" style={{ borderColor: 'var(--theme-border)' }}>
          <button
            onClick={() => setViewMode('personal')}
            className={`flex items-center gap-1.5 px-3 py-2 text-xs font-bold transition-all ${
              viewMode === 'personal' ? 'text-white' : ''
            }`}
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
            className={`flex items-center gap-1.5 px-3 py-2 text-xs font-bold transition-all ${
              viewMode === 'department' ? 'text-white' : ''
            }`}
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

      {/* Calendar grid */}
      <div className="space-y-3">
        {/* Mobile: vertical days */}
        <div className="block lg:hidden space-y-3">
          {weekDays.map(day => {
            const dayProductions = productionsByDate.get(day.date) || [];
            const isToday = day.date === new Date().toISOString().split('T')[0];

            return (
              <div key={day.date}>
                {/* Day header */}
                <div
                  className={`flex items-center gap-2 px-3 py-2 rounded-xl mb-2 ${isToday ? 'ring-1' : ''}`}
                  style={{
                    background: isToday ? 'var(--theme-accent-glow)' : 'var(--theme-bg-secondary)',
                    borderColor: 'var(--theme-border)',
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

                {/* Productions */}
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
            const isToday = day.date === new Date().toISOString().split('T')[0];

            return (
              <div key={day.date} className="min-h-[200px]">
                {/* Day header */}
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

                {/* Productions */}
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
  const start = new Date(weekStart);

  for (let i = 0; i < 7; i++) {
    const d = new Date(start);
    d.setDate(d.getDate() + i);
    const dateStr = d.toISOString().split('T')[0];
    days.push({
      date: dateStr,
      display: formatDateShort(dateStr),
      hebrewDay: getHebrewDay(dateStr),
    });
  }

  return days;
}
