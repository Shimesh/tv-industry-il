'use client';

import { useState, useEffect } from 'react';
import { Production, CrewMember, formatDateShort } from '@/lib/productionDiff';
import { useContacts } from '@/hooks/useContacts';
import { normalizeContactName } from '@/lib/contactsUtils';
import { deduplicateCrewEntries, normalizePhone } from '@/lib/crewNormalization';
import { X, MapPin, Clock, Users } from 'lucide-react';

interface CrewModalProps {
  production: Production;
  currentUserName?: string;
  onClose: () => void;
}

function enrichCrewWithPhones(
  crew: CrewMember[],
  contactList: { firstName: string; lastName: string; phone?: string }[]
): CrewMember[] {
  return crew.map((member) => {
    const memberPhone = normalizePhone(member.phone);
    if (memberPhone) {
      return { ...member, phone: memberPhone };
    }

    const normalized = normalizeContactName(member.name || '');
    const nameParts = normalized.split(/\s+/);
    const firstName = nameParts[0] || '';
    const lastName = nameParts.slice(1).join(' ');

    const contact = contactList
      .filter((c) => {
        const fullName = `${c.firstName} ${c.lastName}`;
        if (normalizeContactName(fullName) === normalized) return true;
        if (firstName && lastName && c.firstName === firstName && c.lastName === lastName) return true;
        if (firstName.length >= 2 && c.firstName === firstName && lastName && c.lastName.includes(lastName.split(' ')[0])) return true;
        return false;
      })
      .sort((a, b) => {
        const aPhone = normalizePhone(a.phone || '') ? 1 : 0;
        const bPhone = normalizePhone(b.phone || '') ? 1 : 0;
        return bPhone - aPhone;
      })[0];

    return {
      ...member,
      phone: normalizePhone(contact?.phone || '') || null,
    };
  });
}

export default function CrewModal({ production, currentUserName, onClose }: CrewModalProps) {
  const [showShareMenu, setShowShareMenu] = useState(false);
  const { contacts, ensureFromCrew } = useContacts();

  const rawDeduped = deduplicateCrewEntries(production.crew);
  const uniqueCrew = enrichCrewWithPhones(rawDeduped, contacts);

  useEffect(() => {
    void ensureFromCrew(rawDeduped);
  }, [rawDeduped, ensureFromCrew]);

  const taggedCrew = uniqueCrew.map((member) => {
    const isCurrent = currentUserName
      ? member.name === currentUserName ||
        member.name.includes(currentUserName) ||
        currentUserName.includes(member.name) ||
        (member.name.split(/\s+/)[0] === currentUserName.split(/\s+/)[0] && member.name.split(/\s+/)[0].length >= 2)
      : false;
    return { ...member, isCurrentUser: isCurrent };
  });

  const sortedCrew = [...taggedCrew].sort((a, b) => {
    if (a.isCurrentUser && !b.isCurrentUser) return -1;
    if (!a.isCurrentUser && b.isCurrentUser) return 1;
    return a.name.localeCompare(b.name, 'he');
  });

  const shareMyDetails = () => {
    const myEntry = sortedCrew.find((m) => m.isCurrentUser);
    if (!myEntry) return;

    const text = [
      `*${production.name}*`,
      `${production.day} ${formatDateShort(production.date)} | ${production.startTime}-${production.endTime}`,
      production.studio ? `${production.studio}` : '',
      '',
      '*My details:*',
      `${myEntry.name} - ${myEntry.roleDetail || myEntry.role}`,
        myEntry.phone ? `${myEntry.phone}` : '',
    ]
      .filter(Boolean)
      .join('\n');

    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank');
  };

  const shareFullCrew = () => {
    const crewText = sortedCrew
      .map((m) => `- ${m.name} - ${m.roleDetail || m.role}${m.phone ? ` | ${m.phone}` : ''}`)
      .join('\n');

    const text = [
      `*${production.name}*`,
      `${production.day} ${formatDateShort(production.date)} | ${production.startTime}-${production.endTime}`,
      production.studio ? `${production.studio}` : '',
      '',
      `*Crew (${sortedCrew.length}):*`,
      crewText,
    ]
      .filter(Boolean)
      .join('\n');

    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank');
  };

  return (
    <div className="fixed inset-0 z-[200] flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />

      <div
        className="relative w-full sm:max-w-lg max-h-[85vh] rounded-t-2xl sm:rounded-2xl overflow-hidden flex flex-col animate-in slide-in-from-bottom-4"
        style={{
          background: 'var(--theme-bg-secondary)',
          border: '1px solid var(--theme-border)',
        }}
      >
        <div className="p-4 border-b flex items-start justify-between" style={{ borderColor: 'var(--theme-border)' }}>
          <div className="flex-1 min-w-0">
            <h3 className="text-lg font-black text-red-400 truncate">{production.name}</h3>
            <div className="flex flex-wrap items-center gap-3 mt-2 text-sm" style={{ color: 'var(--theme-text-secondary)' }}>
              {production.studio && (
                <span className="flex items-center gap-1">
                  <MapPin className="w-3.5 h-3.5" />
                  {production.studio}
                </span>
              )}
              <span className="flex items-center gap-1">
                <Clock className="w-3.5 h-3.5" />
                <span dir="ltr">
                  {production.startTime} - {production.endTime}
                </span>
              </span>
              <span>
                {production.day} {formatDateShort(production.date)}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-1 mr-2">
            <div className="relative">
              <button
                onClick={() => setShowShareMenu(!showShareMenu)}
                className="flex items-center gap-1.5 px-2.5 py-2 rounded-xl text-sm font-medium bg-green-600 hover:bg-green-700 text-white transition-colors"
              >
                <span>Share</span>
              </button>

              {showShareMenu && (
                <>
                  <div className="fixed inset-0 z-10" onClick={() => setShowShareMenu(false)} />
                  <div className="absolute left-0 bottom-full mb-1 w-52 rounded-xl shadow-xl z-20 overflow-hidden" style={{ background: 'var(--theme-bg)' }}>
                    <button
                      onClick={() => {
                        shareMyDetails();
                        setShowShareMenu(false);
                      }}
                      className="w-full text-right px-4 py-3 hover:bg-white/5 text-sm transition-colors"
                      style={{ color: 'var(--theme-text)' }}
                    >
                      Share my details
                    </button>
                    <button
                      onClick={() => {
                        shareFullCrew();
                        setShowShareMenu(false);
                      }}
                      className="w-full text-right px-4 py-3 hover:bg-white/5 text-sm transition-colors"
                      style={{ color: 'var(--theme-text)' }}
                    >
                      Share full crew
                    </button>
                  </div>
                </>
              )}
            </div>

            <button
              onClick={onClose}
              className="p-2 rounded-lg hover:bg-white/10 transition-colors"
              style={{ color: 'var(--theme-text-secondary)' }}
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-2">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2 text-sm font-medium" style={{ color: 'var(--theme-text-secondary)' }}>
              <Users className="w-4 h-4" />
              <span>{sortedCrew.length} אנשי צוות</span>
            </div>
          </div>

          {sortedCrew.map((member, idx) => (
            <div
              key={`${member.name}-${idx}`}
              className="rounded-xl border p-3"
              style={{
                background: member.isCurrentUser ? 'rgba(34, 197, 94, 0.08)' : 'var(--theme-bg)',
                borderColor: member.isCurrentUser ? 'rgba(34, 197, 94, 0.35)' : 'var(--theme-border)',
              }}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="font-semibold truncate" style={{ color: 'var(--theme-text)' }}>
                    {member.name}
                  </div>
                  <div className="text-xs mt-0.5" style={{ color: 'var(--theme-text-secondary)' }}>
                    {member.roleDetail || member.role || 'תפקיד לא ידוע'}
                  </div>
                  {(member.startTime || member.endTime) && (
                    <div className="text-[11px] mt-1" style={{ color: 'var(--theme-text-secondary)' }}>
                      {member.startTime || '--:--'} - {member.endTime || '--:--'}
                    </div>
                  )}
                </div>

                {member.phone ? (
                  <a
                    href={`tel:${member.phone}`}
                    className="text-xs px-2 py-1 rounded-lg bg-emerald-500/15 text-emerald-300 whitespace-nowrap"
                  >
                    {member.phone}
                  </a>
                ) : (
                  <span className="text-xs px-2 py-1 rounded-lg bg-red-500/10 text-red-300 whitespace-nowrap">ללא טלפון</span>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
