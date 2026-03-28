'use client';

import React, { useMemo } from 'react';
import { Production, formatDateShort } from '@/lib/productionDiff';

interface MonthViewProps {
  productions: Production[];
  year: number;
  month: number; // 0-based
  currentUserName?: string;
  workerName: string;
  onProductionClick: (production: Production) => void;
  onInfoClick?: (production: Production) => void;
}

const HEBREW_DAY_HEADERS = ['א׳', 'ב׳', 'ג׳', 'ד׳', 'ה׳', 'ו׳', 'שבת'];

interface DayCell {
  date: Date;
  dateStr: string; // YYYY-MM-DD
  dayNum: number;
  isCurrentMonth: boolean;
  isToday: boolean;
  isCurrentWeek: boolean;
  productions: Production[];
  hasUserShift: boolean;
}

function toDateStr(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function formatDate(d: Date): string {
  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const year = d.getFullYear();
  return `${day}/${month}/${year}`;
}

function getWeekStart(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay(); // 0=Sunday
  d.setDate(d.getDate() - day);
  d.setHours(0, 0, 0, 0);
  return d;
}

function getWeekEnd(date: Date): Date {
  const start = getWeekStart(date);
  const end = new Date(start);
  end.setDate(end.getDate() + 6);
  return end;
}

export default function MonthView({
  productions,
  year,
  month,
  currentUserName,
  workerName,
  onProductionClick,
  onInfoClick,
}: MonthViewProps) {
  const { cells } = useMemo(() => {
    const today = new Date();
    const todayStr = formatDate(today);
    const currentWeekStart = getWeekStart(today);
    const currentWeekEnd = getWeekEnd(today);

    // Build a map of date -> productions
    const prodMap = new Map<string, Production[]>();
    for (const p of productions) {
      const existing = prodMap.get(p.date);
      if (existing) {
        existing.push(p);
      } else {
        prodMap.set(p.date, [p]);
      }
    }

    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);

    // Start grid from Sunday of the week containing the 1st
    const gridStart = new Date(firstDay);
    gridStart.setDate(gridStart.getDate() - gridStart.getDay());

    // End grid on Saturday of the week containing the last day
    const gridEnd = new Date(lastDay);
    gridEnd.setDate(gridEnd.getDate() + (6 - gridEnd.getDay()));

    const cells: DayCell[] = [];
    const cursor = new Date(gridStart);

    while (cursor <= gridEnd) {
      const dateStr = toDateStr(cursor);
      const dayProds = prodMap.get(dateStr) || [];
      const nameToCheck = currentUserName || workerName;
      const hasUserShift = dayProds.some(
        (p) =>
          p.isCurrentUserShift ||
          p.crew.some((c) => c.name === nameToCheck)
      );

      const isCurrentWeek = cursor >= currentWeekStart && cursor <= currentWeekEnd;
      const isToday = formatDate(cursor) === todayStr;

      cells.push({
        date: new Date(cursor),
        dateStr,
        dayNum: cursor.getDate(),
        isCurrentMonth: cursor.getMonth() === month,
        isToday,
        isCurrentWeek,
        productions: dayProds,
        hasUserShift,
      });

      cursor.setDate(cursor.getDate() + 1);
    }

    return { cells };
  }, [productions, year, month, currentUserName, workerName]);

  return (
    <div dir="rtl" style={{ width: '100%' }}>
      {/* Day name headers */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(7, 1fr)',
          gap: '1px',
          marginBottom: '2px',
        }}
      >
        {HEBREW_DAY_HEADERS.map((name) => (
          <div
            key={name}
            style={{
              textAlign: 'center',
              padding: '6px 0',
              fontSize: '0.8rem',
              fontWeight: 600,
              color: 'var(--theme-text-secondary)',
              background: 'var(--theme-bg-secondary)',
              borderBottom: '1px solid var(--theme-border)',
            }}
          >
            {name}
          </div>
        ))}
      </div>

      {/* Day cells grid */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(7, 1fr)',
          gap: '1px',
          background: 'var(--theme-border)',
        }}
      >
        {cells.map((cell) => (
          <DayCellComponent
            key={cell.dateStr}
            cell={cell}
            onProductionClick={onProductionClick}
            onInfoClick={onInfoClick}
          />
        ))}
      </div>
    </div>
  );
}

function DayCellComponent({
  cell,
  onProductionClick,
  onInfoClick,
}: {
  cell: DayCell;
  onProductionClick: (p: Production) => void;
  onInfoClick?: (p: Production) => void;
}) {
  const { isCurrentMonth, isToday, isCurrentWeek, hasUserShift, productions, dayNum } = cell;

  let bgColor = 'var(--theme-bg)';
  let borderColor = 'transparent';
  let boxShadow = 'none';

  if (!isCurrentMonth) {
    bgColor = 'var(--theme-bg-secondary)';
  }
  if (isCurrentWeek) {
    bgColor = 'rgba(23, 37, 84, 0.3)';
  }
  if (isToday) {
    borderColor = 'var(--theme-accent)';
    boxShadow = '0 0 0 2px rgba(59, 130, 246, 0.6)';
  }
  if (hasUserShift && isCurrentMonth) {
    bgColor = 'rgba(245, 158, 11, 0.08)';
  }

  return (
    <div
      style={{
        background: bgColor,
        minHeight: '90px',
        padding: '4px',
        display: 'flex',
        flexDirection: 'column',
        opacity: isCurrentMonth ? 1 : 0.4,
        borderTop: isToday ? `2px solid ${borderColor}` : '2px solid transparent',
        position: 'relative',
        overflow: 'hidden',
        boxShadow,
      }}
    >
      {/* Day number + production count */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '2px',
        }}
      >
        <span
          style={{
            fontSize: '0.8rem',
            fontWeight: isToday ? 700 : 500,
            color: isToday ? 'var(--theme-accent)' : 'var(--theme-text)',
            background: isToday ? 'var(--theme-accent-glow)' : 'transparent',
            borderRadius: '50%',
            width: '22px',
            height: '22px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          {dayNum}
        </span>
        {productions.length > 0 && (
          <span
            style={{
              fontSize: '0.65rem',
              color: 'var(--theme-text-secondary)',
              background: 'var(--theme-bg-secondary)',
              borderRadius: '8px',
              padding: '1px 5px',
            }}
          >
            {productions.length}
          </span>
        )}
      </div>

      {/* Mini production blocks */}
      <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column', gap: '2px' }}>
        {productions.slice(0, 3).map((prod) => (
          <button
            key={prod.id}
            onClick={(e) => {
              e.stopPropagation();
              onProductionClick(prod);
            }}
            style={{
              background: prod.isCurrentUserShift
                ? 'rgba(245, 158, 11, 0.15)'
                : 'var(--theme-bg-secondary)',
              border: prod.isCurrentUserShift
                ? '1px solid rgba(245, 158, 11, 0.3)'
                : '1px solid var(--theme-border)',
              borderRadius: '4px',
              padding: '2px 4px',
              cursor: 'pointer',
              textAlign: 'right',
              width: '100%',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              gap: '2px',
              transition: 'background 0.15s',
            }}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLButtonElement).style.background =
                'var(--theme-accent-glow)';
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLButtonElement).style.background = prod.isCurrentUserShift
                ? 'rgba(245, 158, 11, 0.15)'
                : 'var(--theme-bg-secondary)';
            }}
            title={`${prod.name} | ${prod.studio} | ${prod.startTime}-${prod.endTime}`}
          >
            <span
              style={{
                fontSize: '0.65rem',
                color: 'var(--theme-text)',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
                flex: 1,
              }}
            >
              {prod.name}
            </span>
            <span
              style={{
                fontSize: '0.6rem',
                color: 'var(--theme-text-secondary)',
                whiteSpace: 'nowrap',
                flexShrink: 0,
              }}
            >
              {prod.startTime}
            </span>
          </button>
        ))}
        {productions.length > 3 && (
          <span
            style={{
              fontSize: '0.6rem',
              color: 'var(--theme-text-secondary)',
              textAlign: 'center',
              padding: '1px',
            }}
          >
            +{productions.length - 3} נוספים
          </span>
        )}
      </div>
    </div>
  );
}