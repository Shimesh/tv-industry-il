'use client';

import { Production } from '@/lib/productionDiff';
import { Users, Clock, Info, MapPin } from 'lucide-react';

// Quick crew dedup by normalized name
function getUniqueCrewCount(crew: Production['crew']): number {
  const seen = new Set<string>();
  for (const c of crew) {
    const name = c.name
      .replace(/^(צילום|סאונד|תאורה|הפקה|טכני|CCU|VTR|ניתוב|כתוביות|טלפרומפטר):\s*/i, '')
      .replace(/\s+/g, ' ')
      .trim()
      .toLowerCase();
    if (name.length >= 2) seen.add(name);
  }
  return seen.size;
}

interface ProductionBlockProps {
  production: Production;
  isCurrentUser?: boolean;
  userRole?: string;
  hasUpdates?: boolean;
  onClick: () => void;
  onInfoClick?: () => void;
}

export default function ProductionBlock({
  production,
  isCurrentUser = false,
  userRole,
  hasUpdates = false,
  onClick,
  onInfoClick,
}: ProductionBlockProps) {
  const isCancelled = production.status === 'cancelled';

  // Highlighted = current user's shift → solid amber, bold
  // Muted = other productions → dark gray
  const isHighlighted = isCurrentUser;

  return (
    <button
      onClick={onClick}
      className={`w-full text-right rounded-xl p-3 transition-all hover:scale-[1.02] hover:shadow-lg active:scale-[0.98] ${isCancelled ? 'opacity-50' : ''}`}
      style={{
        background: isHighlighted
          ? 'linear-gradient(135deg, rgba(245, 158, 11, 0.85), rgba(217, 119, 6, 0.85))'
          : 'rgba(55, 65, 81, 0.5)',
        borderRight: isHighlighted
          ? '4px solid #fbbf24'
          : '4px solid rgba(107, 114, 128, 0.5)',
        borderTop: 'none',
        borderBottom: 'none',
        borderLeft: 'none',
      }}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          {/* Production name */}
          <h4
            className={`text-sm truncate ${isCancelled ? 'line-through' : ''} ${isHighlighted ? 'font-black' : 'font-bold'}`}
            style={{ color: isHighlighted ? '#1f2937' : '#d1d5db' }}
          >
            {production.name}
          </h4>

          {/* Studio */}
          {production.studio && (
            <div className="flex items-center gap-1 mt-1">
              <MapPin className="w-3 h-3" style={{ color: isHighlighted ? '#92400e' : '#9ca3af' }} />
              <span className="text-xs" style={{ color: isHighlighted ? '#92400e' : '#9ca3af' }}>
                {production.studio}
              </span>
            </div>
          )}

          {/* Times */}
          {(production.startTime || production.endTime) && (
            <div className="flex items-center gap-1 mt-1">
              <Clock className="w-3 h-3" style={{ color: isHighlighted ? '#92400e' : '#9ca3af' }} />
              <span
                className={`text-xs ${isHighlighted ? 'font-bold' : 'font-medium'}`}
                style={{ color: isHighlighted ? '#78350f' : '#9ca3af' }}
                dir="ltr"
              >
                {production.startTime}{production.endTime ? ` - ${production.endTime}` : ''}
              </span>
            </div>
          )}

          {/* User role badge */}
          {isCurrentUser && userRole && (
            <div className="mt-1.5 inline-block px-2 py-0.5 rounded-md text-xs font-bold"
              style={{
                background: isHighlighted ? 'rgba(120, 53, 15, 0.3)' : 'rgba(251, 191, 36, 0.2)',
                color: isHighlighted ? '#78350f' : '#fbbf24',
              }}
            >
              {userRole}
            </div>
          )}

          {/* Cancelled badge */}
          {isCancelled && (
            <div className="mt-1.5 inline-block px-2 py-0.5 rounded-md text-xs font-bold bg-red-500/20 text-red-400">
              בוטל
            </div>
          )}
        </div>

        {/* Right side badges */}
        <div className="flex flex-col items-end gap-1">
          {/* Crew count */}
          {getUniqueCrewCount(production.crew) > 0 && (
            <div className="flex items-center gap-1 px-2 py-0.5 rounded-lg text-xs"
              style={{
                background: isHighlighted ? 'rgba(120, 53, 15, 0.25)' : 'rgba(255, 255, 255, 0.08)',
                color: isHighlighted ? '#78350f' : '#9ca3af',
              }}
            >
              <Users className="w-3 h-3" />
              <span>{getUniqueCrewCount(production.crew)}</span>
            </div>
          )}

          {/* Update indicator */}
          {hasUpdates && onInfoClick && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onInfoClick();
              }}
              className="p-1 rounded-lg hover:bg-white/10 transition-colors"
              title="היסטוריית שינויים"
            >
              <Info className="w-3.5 h-3.5 text-blue-400" />
            </button>
          )}
        </div>
      </div>
    </button>
  );
}
