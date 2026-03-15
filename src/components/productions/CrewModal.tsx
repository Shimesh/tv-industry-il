'use client';

import { Production, CrewMember, formatDateShort } from '@/lib/productionDiff';
import { X, Phone, Share2, MapPin, Clock, Users } from 'lucide-react';

interface CrewModalProps {
  production: Production;
  currentUserName?: string;
  onClose: () => void;
}

export default function CrewModal({ production, currentUserName, onClose }: CrewModalProps) {
  const shareProduction = () => {
    const crewText = production.crew
      .map(c => `${c.role}: ${c.name}${c.phone ? ` (${c.phone})` : ''}`)
      .join('\n');

    const text = [
      `🎬 ${production.name}`,
      `📍 ${production.studio}`,
      `📅 ${production.day} ${formatDateShort(production.date)}`,
      `🕐 ${production.startTime} - ${production.endTime}`,
      '',
      '👥 צוות:',
      crewText,
    ].join('\n');

    const whatsappUrl = `https://wa.me/?text=${encodeURIComponent(text)}`;
    window.open(whatsappUrl, '_blank');
  };

  return (
    <div className="fixed inset-0 z-[200] flex items-end sm:items-center justify-center p-0 sm:p-4">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />

      {/* Modal */}
      <div
        className="relative w-full sm:max-w-lg max-h-[85vh] rounded-t-2xl sm:rounded-2xl overflow-hidden flex flex-col animate-in slide-in-from-bottom-4"
        style={{
          background: 'var(--theme-bg-secondary)',
          border: '1px solid var(--theme-border)',
        }}
      >
        {/* Header */}
        <div className="p-4 border-b flex items-start justify-between" style={{ borderColor: 'var(--theme-border)' }}>
          <div className="flex-1 min-w-0">
            <h3 className="text-lg font-black text-red-400 truncate">
              {production.name}
            </h3>
            <div className="flex flex-wrap items-center gap-3 mt-2 text-sm" style={{ color: 'var(--theme-text-secondary)' }}>
              {production.studio && (
                <span className="flex items-center gap-1">
                  <MapPin className="w-3.5 h-3.5" />
                  {production.studio}
                </span>
              )}
              <span className="flex items-center gap-1">
                <Clock className="w-3.5 h-3.5" />
                <span dir="ltr">{production.startTime} - {production.endTime}</span>
              </span>
              <span>{production.day} {formatDateShort(production.date)}</span>
            </div>
          </div>

          <div className="flex items-center gap-1 mr-2">
            <button
              onClick={shareProduction}
              className="p-2 rounded-xl hover:bg-[var(--theme-accent-glow)] transition-colors"
              title="שתף ב-WhatsApp"
            >
              <Share2 className="w-5 h-5 text-green-400" />
            </button>
            <button
              onClick={onClose}
              className="p-2 rounded-xl hover:bg-[var(--theme-accent-glow)] transition-colors"
            >
              <X className="w-5 h-5" style={{ color: 'var(--theme-text-secondary)' }} />
            </button>
          </div>
        </div>

        {/* Crew list */}
        <div className="flex-1 overflow-y-auto p-4">
          <div className="flex items-center gap-2 mb-3">
            <Users className="w-4 h-4" style={{ color: 'var(--theme-text-secondary)' }} />
            <span className="text-sm font-bold" style={{ color: 'var(--theme-text)' }}>
              צוות ({production.crew.length})
            </span>
          </div>

          {production.crew.length === 0 ? (
            <p className="text-sm text-center py-8" style={{ color: 'var(--theme-text-secondary)' }}>
              אין מידע על צוות להפקה זו
            </p>
          ) : (
            <div className="space-y-2">
              {production.crew.map((member, idx) => {
                // Fuzzy name matching for current user
                const isCurrent = currentUserName ? (
                  member.name === currentUserName ||
                  member.name.includes(currentUserName) ||
                  currentUserName.includes(member.name) ||
                  member.name.split(/\s+/)[0] === currentUserName.split(/\s+/)[0]
                ) : false;
                return (
                  <CrewRow
                    key={`${member.name}-${idx}`}
                    member={member}
                    isCurrentUser={isCurrent}
                  />
                );
              })}
            </div>
          )}
        </div>

        {/* Status bar */}
        {production.status === 'cancelled' && (
          <div className="p-3 text-center text-sm font-bold text-red-400 bg-red-500/10 border-t" style={{ borderColor: 'var(--theme-border)' }}>
            ❌ הפקה זו בוטלה
          </div>
        )}
      </div>
    </div>
  );
}

function CrewRow({ member, isCurrentUser }: { member: CrewMember; isCurrentUser: boolean }) {
  return (
    <div
      className={`flex items-center justify-between p-3 rounded-xl transition-all ${isCurrentUser ? 'ring-1' : ''}`}
      style={{
        background: isCurrentUser ? 'rgba(34, 197, 94, 0.1)' : 'var(--theme-bg)',
        borderColor: isCurrentUser ? 'rgba(34, 197, 94, 0.4)' : 'var(--theme-border)',
        ...(isCurrentUser ? { ringColor: 'rgba(34, 197, 94, 0.4)' } : {}),
      }}
    >
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-sm font-bold" style={{ color: isCurrentUser ? '#4ade80' : 'var(--theme-text)' }}>
            {member.name}
          </span>
          {isCurrentUser && (
            <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-green-500/20 text-green-400">
              אתה
            </span>
          )}
        </div>
        <div className="flex items-center gap-2 mt-0.5">
          <span className="text-xs font-medium" style={{ color: 'var(--theme-accent)' }}>
            {member.role}
          </span>
          {member.roleDetail && (
            <span className="text-xs" style={{ color: 'var(--theme-text-secondary)' }}>
              • {member.roleDetail}
            </span>
          )}
        </div>
        {(member.startTime || member.endTime) && (
          <span className="text-xs mt-0.5 block" style={{ color: 'var(--theme-text-secondary)' }} dir="ltr">
            {member.startTime} - {member.endTime}
          </span>
        )}
      </div>

      {member.phone && (
        <a
          href={`tel:${member.phone}`}
          className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold bg-green-500/15 text-green-400 hover:bg-green-500/25 transition-colors"
          onClick={(e) => e.stopPropagation()}
        >
          <Phone className="w-3.5 h-3.5" />
          <span>חייג</span>
        </a>
      )}
    </div>
  );
}
