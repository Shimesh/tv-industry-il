'use client';

import { useMemo } from 'react';
import { MapPin, Clock, Users, Info } from 'lucide-react';
import { Production, formatDateShort, getHebrewDay } from '@/lib/productionDiff';

interface ListViewProps {
  productions: Production[];
  searchQuery: string;
  currentUserName?: string;
  workerName: string;
  onProductionClick: (production: Production) => void;
  onInfoClick?: (production: Production) => void;
}

export default function ListView({
  productions,
  searchQuery,
  currentUserName,
  workerName,
  onProductionClick,
  onInfoClick,
}: ListViewProps) {
  const filteredAndGrouped = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();

    const filtered = query
      ? productions.filter((p) => {
          if (p.name.toLowerCase().includes(query)) return true;
          if (p.studio.toLowerCase().includes(query)) return true;
          if (p.crew.some((c) => c.name.toLowerCase().includes(query))) return true;
          return false;
        })
      : productions;

    const sorted = [...filtered].sort((a, b) => {
      const dateCompare = a.date.localeCompare(b.date);
      if (dateCompare !== 0) return dateCompare;
      return a.startTime.localeCompare(b.startTime);
    });

    const groups: { date: string; label: string; productions: Production[] }[] = [];
    for (const prod of sorted) {
      const last = groups[groups.length - 1];
      if (last && last.date === prod.date) {
        last.productions.push(prod);
      } else {
        const dayName = getHebrewDay(prod.date);
        const dateFormatted = formatDateShort(prod.date);
        groups.push({
          date: prod.date,
          label: `${dayName} ${dateFormatted}`,
          productions: [prod],
        });
      }
    }

    return groups;
  }, [productions, searchQuery]);

  const isUserShift = (prod: Production): boolean => {
    if (prod.isCurrentUserShift) return true;
    const name = currentUserName || workerName;
    if (!name) return false;
    return prod.crew.some(
      (c) => c.name.toLowerCase() === name.toLowerCase()
    );
  };

  const getUserRole = (prod: Production): string | null => {
    const name = currentUserName || workerName;
    if (!name) return null;
    const member = prod.crew.find(
      (c) => c.name.toLowerCase() === name.toLowerCase()
    );
    return member ? member.role || member.roleDetail : null;
  };

  if (filteredAndGrouped.length === 0) {
    return (
      <div
        dir="rtl"
        className="flex flex-col items-center justify-center py-16 px-4"
        style={{ color: 'var(--theme-text-secondary)' }}
      >
        <Users size={48} className="mb-4 opacity-40" />
        <p className="text-lg font-medium mb-1">לא נמצאו הפקות</p>
        {searchQuery && (
          <p className="text-sm opacity-70">
            אין תוצאות עבור &quot;{searchQuery}&quot;
          </p>
        )}
      </div>
    );
  }

  return (
    <div dir="rtl" className="flex flex-col gap-0">
      {filteredAndGrouped.map((group) => (
        <div key={group.date}>
          {/* Sticky date header */}
          <div
            className="sticky top-0 z-10 px-4 py-2 text-sm font-bold border-b backdrop-blur-sm"
            style={{
              backgroundColor: 'var(--theme-bg-secondary)',
              color: 'var(--theme-text)',
              borderColor: 'var(--theme-border)',
            }}
          >
            {group.label}
          </div>

          {/* Production rows */}
          {group.productions.map((prod) => {
            const highlighted = isUserShift(prod);
            const cancelled = prod.status === 'cancelled';
            const role = getUserRole(prod);

            return (
              <div
                key={prod.id}
                onClick={() => onProductionClick(prod)}
                className="flex items-center gap-3 px-4 py-3 cursor-pointer transition-colors border-b"
                style={{
                  backgroundColor: 'var(--theme-bg)',
                  borderColor: 'var(--theme-border)',
                  borderRight: highlighted
                    ? '3px solid #d97706'
                    : '3px solid transparent',
                  opacity: cancelled ? 0.65 : 1,
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor =
                    'var(--theme-bg-secondary)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = 'var(--theme-bg)';
                }}
              >
                {/* Main content */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span
                      className="font-semibold text-sm truncate"
                      style={{
                        color: 'var(--theme-text)',
                        textDecoration: cancelled ? 'line-through' : 'none',
                      }}
                    >
                      {prod.name}
                    </span>
                    {cancelled && (
                      <span className="shrink-0 text-xs px-1.5 py-0.5 rounded bg-red-100 text-red-700 font-medium">
                        בוטל
                      </span>
                    )}
                    {role && !cancelled && (
                      <span
                        className="shrink-0 text-xs px-1.5 py-0.5 rounded font-medium"
                        style={{
                          backgroundColor: 'rgba(217, 119, 6, 0.15)',
                          color: '#d97706',
                        }}
                      >
                        {role}
                      </span>
                    )}
                  </div>

                  <div
                    className="flex items-center gap-3 text-xs"
                    style={{ color: 'var(--theme-text-secondary)' }}
                  >
                    {prod.studio && (
                      <span className="flex items-center gap-1">
                        <MapPin size={12} />
                        <span className="truncate max-w-[120px]">
                          {prod.studio}
                        </span>
                      </span>
                    )}
                    {prod.startTime && (
                      <span className="flex items-center gap-1">
                        <Clock size={12} />
                        {prod.startTime}
                        {prod.endTime ? `–${prod.endTime}` : ''}
                      </span>
                    )}
                    {prod.crew.length > 0 && (
                      <span className="flex items-center gap-1">
                        <Users size={12} />
                        {prod.crew.length}
                      </span>
                    )}
                  </div>
                </div>

                {/* Info button */}
                {onInfoClick && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onInfoClick(prod);
                    }}
                    className="shrink-0 p-1.5 rounded-full transition-colors hover:opacity-80"
                    style={{ color: 'var(--theme-text-secondary)' }}
                    aria-label="מידע נוסף"
                  >
                    <Info size={18} />
                  </button>
                )}
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}
