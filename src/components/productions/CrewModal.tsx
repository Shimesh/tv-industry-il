'use client';

import { useState } from 'react';
import { Production, CrewMember, formatDateShort } from '@/lib/productionDiff';
import { contacts } from '@/data/contacts';
import { X, MapPin, Clock, Users } from 'lucide-react';

interface CrewModalProps {
  production: Production;
  currentUserName?: string;
  onClose: () => void;
}

function normalizeName(name: string) {
  if (!name) return '';

  let cleaned = name
    .replace(/^[\u05d0-\u05ea]+:\s*/u, '')
    .replace(/\s*[-–]\s*[\u05d0-\u05ea\s]+$/u, '')
    .trim()
    .replace(/\s+/g, ' ');

  const rolePhrases = [
    'φιμεν',
    'φμν',
    'φμξϊ',
    'φμν ψησ',
    'ψησ',
    'ψητο',
    'ψητπιϊ',
    'ρθγιχΰν',
    'ρθγι χΰν',
    'ρθγι-χΰν',
    'ρΰεπγ',
    'αξΰι',
    'αξΰιϊ',
    'αιξει',
    'ξτιχ',
    'ξτιχϊ',
    'ςεψκ',
    'ςεψλϊ',
    'ς. αξΰι',
    'ς. αξΰιϊ',
    'ς. φιμεν',
    'ς. ρΰεπγ',
    'χεμ',
    'ξχμιθ',
    'ξχμιθδ',
    'ϊΰεψδ',
    'ϊΰεψο',
    'ΰιτεψ',
    'ρθιιμιπβ',
    'ΰψθ',
    'ϊτΰεψδ',
  ];

  let changed = true;
  while (changed) {
    changed = false;
    for (const phrase of rolePhrases) {
      const prefix = new RegExp('^' + phrase + '\\s+', 'u');
      const suffix = new RegExp('\\s+' + phrase + '$', 'u');
      if (prefix.test(cleaned)) {
        cleaned = cleaned.replace(prefix, '').trim();
        changed = true;
      }
      if (suffix.test(cleaned)) {
        cleaned = cleaned.replace(suffix, '').trim();
        changed = true;
      }
    }
  }

  cleaned = cleaned.replace(/^[–-]\\s*/u, '').replace(/\\s*[–-]$/u, '').trim();
  cleaned = cleaned.replace(/\\s+/g, ' ');

  return cleaned;
}

// Normalize and deduplicate crew by name
function deduplicateCrew(crewArray: CrewMember[]): (CrewMember & { isCurrentUser?: boolean })[] {
  const seen = new Map<string, CrewMember>();

  for (const member of crewArray) {
    const key = normalizeName(member.name);
    if (!key || key.length < 2) continue;

    if (!seen.has(key)) {
      seen.set(key, { ...member, name: key });
    } else {
      const existing = seen.get(key)!;
      seen.set(key, {
        name: key,
        role: existing.role || member.role,
        roleDetail: existing.roleDetail || member.roleDetail,
        phone: existing.phone || member.phone,
        startTime: existing.startTime || member.startTime,
        endTime: existing.endTime || member.endTime,
        isCurrentUser: (existing as any).isCurrentUser || (member as any).isCurrentUser,
      });
    }
  }

  return Array.from(seen.values());
}
// Enrich crew with phone numbers from contacts directory
function enrichCrewWithPhones(crew: CrewMember[]): CrewMember[] {
  return crew.map(member => {
    if (member.phone) return member;

    const nameParts = member.name.split(/\s+/);
    const firstName = nameParts[0] || '';
    const lastName = nameParts.slice(1).join(' ');

    const contact = contacts.find(c => {
      const fullName = `${c.firstName} ${c.lastName}`;
      if (fullName === member.name) return true;
      if (firstName && lastName && c.firstName === firstName && c.lastName === lastName) return true;
      if (firstName.length >= 2 && c.firstName === firstName &&
          lastName && c.lastName.includes(lastName.split(' ')[0])) return true;
      return false;
    });

    return {
      ...member,
      phone: contact?.phone || '',
    };
  });
}

export default function CrewModal({ production, currentUserName, onClose }: CrewModalProps) {
  const [showShareMenu, setShowShareMenu] = useState(false);

  // Deduplicate and enrich crew
  const rawDeduped = deduplicateCrew(production.crew);
  const uniqueCrew = enrichCrewWithPhones(rawDeduped);

  // Tag current user
  const taggedCrew = uniqueCrew.map(member => {
    const isCurrent = currentUserName ? (
      member.name === currentUserName ||
      member.name.includes(currentUserName) ||
      currentUserName.includes(member.name) ||
      (member.name.split(/\s+/)[0] === currentUserName.split(/\s+/)[0] &&
       member.name.split(/\s+/)[0].length >= 2)
    ) : false;
    return { ...member, isCurrentUser: isCurrent };
  });

  // Sort: current user first, then alphabetically
  const sortedCrew = [...taggedCrew].sort((a, b) => {
    if (a.isCurrentUser && !b.isCurrentUser) return -1;
    if (!a.isCurrentUser && b.isCurrentUser) return 1;
    return a.name.localeCompare(b.name, 'he');
  });

  const shareMyDetails = () => {
    const myEntry = sortedCrew.find(m => m.isCurrentUser);
    if (!myEntry) return;

    const text = [
      `π“Ί *${production.name}*`,
      `π“… ${production.day} ${formatDateShort(production.date)} | ${production.startTime}β€“${production.endTime}`,
      production.studio ? `π¬ ${production.studio}` : '',
      '',
      `π‘¤ *Χ”Χ¤Χ¨ΧΧ™Χ Χ©ΧΧ™:*`,
      `${myEntry.name} - ${myEntry.roleDetail || myEntry.role}`,
      myEntry.phone ? `π“ ${myEntry.phone}` : '',
    ].filter(Boolean).join('\n');

    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank');
  };

  const shareFullCrew = () => {
    const crewText = sortedCrew
      .map(m => `β€Ά ${m.name} - ${m.roleDetail || m.role}${m.phone ? ` | ${m.phone}` : ''}`)
      .join('\n');

    const text = [
      `π“Ί *${production.name}*`,
      `π“… ${production.day} ${formatDateShort(production.date)} | ${production.startTime}β€“${production.endTime}`,
      production.studio ? `π¬ ${production.studio}` : '',
      '',
      `π‘¥ *Χ¦Χ•Χ•Χª (${sortedCrew.length} ΧΧ™Χ©):*`,
      crewText,
    ].filter(Boolean).join('\n');

    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank');
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
            {/* Share dropdown */}
            <div className="relative">
              <button
                onClick={() => setShowShareMenu(!showShareMenu)}
                className="flex items-center gap-1.5 px-2.5 py-2 rounded-xl text-sm font-medium bg-green-600 hover:bg-green-700 text-white transition-colors"
              >
                <span>π“¤</span>
                <span>Χ©ΧªΧ£</span>
                <span className="text-[10px]">β–Ύ</span>
              </button>

              {showShareMenu && (
                <>
                  <div
                    className="fixed inset-0 z-10"
                    onClick={() => setShowShareMenu(false)}
                  />
                  <div className="absolute left-0 bottom-full mb-1 w-52 rounded-xl shadow-xl z-20 overflow-hidden"
                    style={{ background: 'var(--theme-bg)' }}>
                    <button
                      onClick={() => { shareMyDetails(); setShowShareMenu(false); }}
                      className="w-full text-right px-4 py-3 hover:bg-white/5 text-sm flex items-center gap-2 transition-colors"
                      style={{ color: 'var(--theme-text)' }}
                    >
                      <span>π‘¤</span>
                      <div>
                        <div className="font-medium">Χ”Χ¤Χ¨ΧΧ™Χ Χ©ΧΧ™ Χ‘Χ”Χ¤Χ§Χ”</div>
                        <div className="text-xs" style={{ color: 'var(--theme-text-secondary)' }}>Χ©ΧΧ— Χ¨Χ§ ΧΧª Χ”Χ©Χ™Χ‘Χ•Χ¥ Χ©ΧΧ</div>
                      </div>
                    </button>
                    <hr style={{ borderColor: 'var(--theme-border)' }} />
                    <button
                      onClick={() => { shareFullCrew(); setShowShareMenu(false); }}
                      className="w-full text-right px-4 py-3 hover:bg-white/5 text-sm flex items-center gap-2 transition-colors"
                      style={{ color: 'var(--theme-text)' }}
                    >
                      <span>π‘¥</span>
                      <div>
                        <div className="font-medium">Χ›Χ Χ”Χ¦Χ•Χ•Χª</div>
                        <div className="text-xs" style={{ color: 'var(--theme-text-secondary)' }}>{sortedCrew.length} ΧΧ Χ©Χ™ Χ¦Χ•Χ•Χª</div>
                      </div>
                    </button>
                  </div>
                </>
              )}
            </div>

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
              Χ¦Χ•Χ•Χª ({sortedCrew.length})
            </span>
          </div>

          {sortedCrew.length === 0 ? (
            <p className="text-sm text-center py-8" style={{ color: 'var(--theme-text-secondary)' }}>
              ΧΧ™Χ ΧΧ™Χ“ΧΆ ΧΆΧ Χ¦Χ•Χ•Χª ΧΧ”Χ¤Χ§Χ” Χ–Χ•
            </p>
          ) : (
            <div className="space-y-1.5">
              {sortedCrew.map((member, idx) => (
                <div
                  key={`${member.name}-${idx}`}
                  className={`flex items-center gap-3 py-3 px-3 rounded-xl transition-all ${member.isCurrentUser ? 'ring-1' : ''}`}
                  style={{
                    background: member.isCurrentUser ? 'rgba(34, 197, 94, 0.1)' : 'var(--theme-bg)',
                    ...(member.isCurrentUser ? { ringColor: 'rgba(34, 197, 94, 0.4)' } : {}),
                  }}
                >
                  {/* Avatar */}
                  <div
                    className="w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold flex-shrink-0"
                    style={{
                      background: member.isCurrentUser ? 'rgba(34, 197, 94, 0.25)' : 'var(--theme-bg-secondary)',
                      color: member.isCurrentUser ? '#4ade80' : 'var(--theme-text-secondary)',
                    }}
                  >
                    {member.name.split(' ').map(n => n[0]).join('').slice(0, 2)}
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0 text-right">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-bold truncate" style={{ color: member.isCurrentUser ? '#4ade80' : 'var(--theme-text)' }}>
                        {member.name}
                      </span>
                      {member.isCurrentUser && (
                        <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-green-500/20 text-green-400 shrink-0">
                          ΧΧ Χ™
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="text-xs font-medium" style={{ color: 'var(--theme-accent)' }}>
                        {member.roleDetail || member.role}
                      </span>
                      {(member.startTime || member.endTime) && (
                        <span className="text-xs" style={{ color: 'var(--theme-text-secondary)' }} dir="ltr">
                          β€Ά {member.startTime}β€“{member.endTime}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Phone button */}
                  {member.phone ? (
                    <a
                      href={`tel:${member.phone}`}
                      onClick={(e) => e.stopPropagation()}
                      className="flex-shrink-0 w-9 h-9 bg-green-600 hover:bg-green-700 rounded-full flex items-center justify-center text-white transition-colors"
                      title={`Χ—Χ™Χ™Χ’ Χ${member.name}: ${member.phone}`}
                    >
                      π“
                    </a>
                  ) : (
                    <div
                      className="flex-shrink-0 w-9 h-9 rounded-full flex items-center justify-center"
                      style={{ background: 'var(--theme-bg-secondary)', color: 'var(--theme-text-secondary)' }}
                      title="ΧΧ™Χ ΧΧ΅Χ¤Χ¨ ΧΧΧ¤Χ•Χ"
                    >
                      π“µ
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Status bar */}
        {production.status === 'cancelled' && (
          <div className="p-3 text-center text-sm font-bold text-red-400 bg-red-500/10 border-t" style={{ borderColor: 'var(--theme-border)' }}>
            β Χ”Χ¤Χ§Χ” Χ–Χ• Χ‘Χ•ΧΧΧ”
          </div>
        )}
      </div>
    </div>
  );
}

