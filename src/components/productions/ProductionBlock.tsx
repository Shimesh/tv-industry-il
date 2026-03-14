'use client';

import { Production } from '@/lib/productionDiff';
import { Users, Clock, Info, MapPin } from 'lucide-react';

// Studio color mapping
const studioColors: Record<string, { bg: string; border: string; text: string }> = {
  '5': { bg: 'rgba(59, 130, 246, 0.15)', border: 'rgba(59, 130, 246, 0.4)', text: '#60a5fa' },
  '6': { bg: 'rgba(34, 197, 94, 0.15)', border: 'rgba(34, 197, 94, 0.4)', text: '#4ade80' },
  '7': { bg: 'rgba(249, 115, 22, 0.15)', border: 'rgba(249, 115, 22, 0.4)', text: '#fb923c' },
  '8': { bg: 'rgba(168, 85, 247, 0.15)', border: 'rgba(168, 85, 247, 0.4)', text: '#c084fc' },
  '9': { bg: 'rgba(236, 72, 153, 0.15)', border: 'rgba(236, 72, 153, 0.4)', text: '#f472b6' },
  '10': { bg: 'rgba(20, 184, 166, 0.15)', border: 'rgba(20, 184, 166, 0.4)', text: '#2dd4bf' },
  default: { bg: 'rgba(251, 191, 36, 0.15)', border: 'rgba(251, 191, 36, 0.4)', text: '#fbbf24' },
};

function getStudioColor(studio: string) {
  const num = studio.match(/\d+/)?.[0] || '';
  return studioColors[num] || studioColors.default;
}

interface ProductionBlockProps {
  production: Production;
  isPersonal?: boolean;
  userRole?: string;
  hasUpdates?: boolean;
  onClick: () => void;
  onInfoClick?: () => void;
}

export default function ProductionBlock({
  production,
  isPersonal = false,
  userRole,
  hasUpdates = false,
  onClick,
  onInfoClick,
}: ProductionBlockProps) {
  const colors = isPersonal
    ? { bg: 'rgba(251, 191, 36, 0.15)', border: 'rgba(251, 191, 36, 0.4)', text: '#fbbf24' }
    : getStudioColor(production.studio);

  const isCancelled = production.status === 'cancelled';

  return (
    <button
      onClick={onClick}
      className={`w-full text-right rounded-xl border p-3 transition-all hover:scale-[1.02] hover:shadow-lg active:scale-[0.98] ${isCancelled ? 'opacity-50' : ''}`}
      style={{
        background: colors.bg,
        borderColor: colors.border,
      }}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          {/* Production name */}
          <h4
            className={`text-sm font-bold truncate ${isCancelled ? 'line-through' : ''}`}
            style={{ color: colors.text }}
          >
            {production.name}
          </h4>

          {/* Studio */}
          {production.studio && (
            <div className="flex items-center gap-1 mt-1">
              <MapPin className="w-3 h-3" style={{ color: 'var(--theme-text-secondary)' }} />
              <span className="text-xs" style={{ color: 'var(--theme-text-secondary)' }}>
                {production.studio}
              </span>
            </div>
          )}

          {/* Times */}
          <div className="flex items-center gap-1 mt-1">
            <Clock className="w-3 h-3" style={{ color: 'var(--theme-text-secondary)' }} />
            <span className="text-xs font-medium" style={{ color: 'var(--theme-text-secondary)' }} dir="ltr">
              {production.startTime} - {production.endTime}
            </span>
          </div>

          {/* User role (personal view) */}
          {isPersonal && userRole && (
            <div className="mt-1.5 inline-block px-2 py-0.5 rounded-md text-xs font-medium bg-amber-500/20 text-amber-300">
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
          {production.crew.length > 0 && (
            <div className="flex items-center gap-1 px-2 py-0.5 rounded-lg text-xs" style={{
              background: 'color-mix(in srgb, var(--theme-text) 10%, transparent)',
              color: 'var(--theme-text-secondary)',
            }}>
              <Users className="w-3 h-3" />
              <span>{production.crew.length}</span>
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
