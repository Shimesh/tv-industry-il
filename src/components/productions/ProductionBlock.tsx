'use client';

import { Production, CrewMember } from '@/lib/productionDiff';
import { Users, Clock, Info, MapPin, Clapperboard } from 'lucide-react';
import ChannelLogo from '@/components/ChannelLogo';
import { findChannelByName } from '@/data/channels';

const DIRECTOR_ROLES = ['במאי', 'במאית', 'במאי/ת', 'בימוי', 'director'];

function getDirectorNames(crew: CrewMember[]): string[] {
  return crew
    .filter(c => DIRECTOR_ROLES.some(r => c.role?.includes(r) || c.roleDetail?.includes(r)))
    .map(c => c.name)
    .filter(Boolean);
}

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
  const directors = getDirectorNames(production.crew);
  const channel = findChannelByName(`${production.name} ${production.studio}`);

  // Highlighted = current user's shift → solid amber, bold
  // Muted = other productions → dark gray
  const isHighlighted = isCurrentUser;

  return (
    <button
      onClick={onClick}
      className={`w-full text-right rounded-xl p-3 transition-all hover:scale-[1.02] hover:shadow-lg active:scale-[0.98] ${isCancelled ? 'opacity-50' : ''}`}
      style={{
        background: isHighlighted
          ? 'linear-gradient(135deg, color-mix(in srgb, var(--theme-warning) 88%, white 12%), var(--theme-warning))'
          : 'var(--theme-bg-card)',
        borderRight: isHighlighted
          ? '4px solid var(--theme-warning)'
          : '4px solid var(--theme-border)',
        borderTop: 'none',
        borderBottom: 'none',
        borderLeft: 'none',
      }}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          {/* Production name */}
          <div className="flex min-w-0 items-center gap-2">
            {channel ? <ChannelLogo channel={channel} size={24} rounded={6} /> : null}
            <h4
              className={`min-w-0 flex-1 truncate text-sm ${isCancelled ? 'line-through' : ''} ${isHighlighted ? 'font-black' : 'font-bold'}`}
              style={{ color: isHighlighted ? '#1f2937' : 'var(--theme-text)' }}
            >
              {production.name}
            </h4>
          </div>

          {directors.length > 0 && (
            <div className="flex items-center gap-1 mt-0.5">
              <Clapperboard className="w-3 h-3 flex-shrink-0" style={{ color: isHighlighted ? '#92400e' : '#fda4af' }} />
              <span className="text-xs truncate" style={{ color: isHighlighted ? '#92400e' : '#fda4af' }}>
                {directors.join(', ')}
              </span>
            </div>
          )}

          {/* Studio */}
          {production.studio && (
            <div className="flex items-center gap-1 mt-1">
              <MapPin className="w-3 h-3" style={{ color: isHighlighted ? '#92400e' : 'var(--theme-text-secondary)' }} />
              <span className="text-xs" style={{ color: isHighlighted ? '#92400e' : 'var(--theme-text-secondary)' }}>
                {production.studio}
              </span>
            </div>
          )}

          {/* Times */}
          {(production.startTime || production.endTime) && (
            <div className="flex items-center gap-1 mt-1">
              <Clock className="w-3 h-3" style={{ color: isHighlighted ? '#92400e' : 'var(--theme-text-secondary)' }} />
              <span
                className={`text-xs ${isHighlighted ? 'font-bold' : 'font-medium'}`}
                style={{ color: isHighlighted ? '#78350f' : 'var(--theme-text-secondary)' }}
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
                background: isHighlighted ? 'rgba(120, 53, 15, 0.3)' : 'var(--theme-accent-glow)',
                color: isHighlighted ? '#78350f' : 'var(--theme-accent)',
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
                background: isHighlighted ? 'rgba(120, 53, 15, 0.25)' : 'var(--theme-bg-secondary)',
                color: isHighlighted ? '#78350f' : 'var(--theme-text-secondary)',
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
              className="p-1 rounded-lg hover:bg-[var(--theme-accent-glow)] transition-colors"
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
