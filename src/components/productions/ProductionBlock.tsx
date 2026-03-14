'use client';

import { Production } from '@/lib/productionDiff';
import { Users, Clock, Info, MapPin } from 'lucide-react';

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
  // Bright amber for current user's shifts, muted gray for others
  const colors = isCurrentUser
    ? { bg: 'rgba(245, 158, 11, 0.2)', border: 'rgba(245, 158, 11, 0.5)', text: '#f59e0b' }
    : { bg: 'rgba(148, 163, 184, 0.08)', border: 'rgba(148, 163, 184, 0.2)', text: '#94a3b8' };

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
              {production.startTime}{production.endTime ? ` - ${production.endTime}` : ''}
            </span>
          </div>

          {/* User role badge (shown when current user is in crew) */}
          {isCurrentUser && userRole && (
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
