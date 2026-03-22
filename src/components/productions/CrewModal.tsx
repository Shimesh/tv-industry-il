'use client';

import { useState, useEffect } from 'react';
import { Production, CrewMember, formatDateShort } from '@/lib/productionDiff';
import { useContacts } from '@/hooks/useContacts';
import { normalizeContactName } from '@/lib/contactsUtils';
import { deduplicateCrewEntries, normalizePhone } from '@/lib/crewNormalization';
import { X, MapPin, Clock, Users, Phone, PhoneOff, Star, MessageCircle } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

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

const avatarGradients = [
  'from-violet-500 to-fuchsia-500',
  'from-cyan-500 to-blue-500',
  'from-amber-500 to-orange-500',
  'from-emerald-500 to-teal-500',
  'from-rose-500 to-pink-500',
  'from-indigo-500 to-purple-500',
  'from-lime-500 to-green-500',
  'from-sky-500 to-indigo-500',
];

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  }
  return (name[0] || '?').toUpperCase();
}

function getGradient(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  return avatarGradients[Math.abs(hash) % avatarGradients.length];
}

const overlayVariants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1 },
  exit: { opacity: 0 },
};

const modalVariants = {
  hidden: { opacity: 0, y: 80, scale: 0.95 },
  visible: {
    opacity: 1,
    y: 0,
    scale: 1,
    transition: { type: 'spring' as const, damping: 25, stiffness: 300 },
  },
  exit: {
    opacity: 0,
    y: 60,
    scale: 0.97,
    transition: { duration: 0.2 },
  },
};

const cardVariants = {
  hidden: { opacity: 0, x: 30 },
  visible: (i: number) => ({
    opacity: 1,
    x: 0,
    transition: {
      delay: 0.05 * i,
      type: 'spring' as const,
      damping: 20,
      stiffness: 250,
    },
  }),
};

const shareMenuVariants = {
  hidden: { opacity: 0, scale: 0.9, y: 8 },
  visible: { opacity: 1, scale: 1, y: 0, transition: { type: 'spring' as const, damping: 20, stiffness: 350 } },
  exit: { opacity: 0, scale: 0.9, y: 8, transition: { duration: 0.15 } },
};

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
    <AnimatePresence>
      <div className="fixed inset-0 z-[200] flex items-end sm:items-center justify-center p-0 sm:p-4" dir="rtl">
        {/* Backdrop */}
        <motion.div
          className="absolute inset-0 bg-black/70 backdrop-blur-md"
          variants={overlayVariants}
          initial="hidden"
          animate="visible"
          exit="exit"
          onClick={onClose}
        />

        {/* Modal */}
        <motion.div
          className="relative w-full sm:max-w-lg max-h-[90vh] rounded-t-3xl sm:rounded-3xl overflow-hidden flex flex-col shadow-2xl"
          variants={modalVariants}
          initial="hidden"
          animate="visible"
          exit="exit"
          style={{
            background: 'linear-gradient(165deg, rgba(20, 20, 35, 0.98) 0%, rgba(10, 10, 20, 0.99) 100%)',
            border: '1px solid rgba(255, 255, 255, 0.08)',
          }}
        >
          {/* Decorative gradient orbs */}
          <div className="absolute top-0 left-0 w-48 h-48 bg-violet-600/10 rounded-full blur-3xl pointer-events-none" />
          <div className="absolute top-20 right-0 w-32 h-32 bg-rose-600/8 rounded-full blur-3xl pointer-events-none" />

          {/* Header */}
          <div className="relative p-5 pb-4">
            {/* Close button */}
            <motion.button
              onClick={onClose}
              className="absolute top-4 left-4 p-2 rounded-full bg-white/5 hover:bg-white/10 transition-all duration-200 group"
              whileHover={{ scale: 1.1 }}
              whileTap={{ scale: 0.9 }}
            >
              <X className="w-5 h-5 text-white/50 group-hover:text-white/80 transition-colors" />
            </motion.button>

            {/* Production name with gradient */}
            <h3
              className="text-xl font-black tracking-tight leading-tight ml-10"
              style={{
                background: 'linear-gradient(135deg, #f87171 0%, #fb923c 50%, #fbbf24 100%)',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
                backgroundClip: 'text',
              }}
            >
              {production.name}
            </h3>

            {/* Meta info row */}
            <div className="flex flex-wrap items-center gap-4 mt-3 text-sm">
              {production.studio && (
                <div className="flex items-center gap-1.5 text-white/60">
                  <div className="flex items-center justify-center w-6 h-6 rounded-lg bg-violet-500/15">
                    <MapPin className="w-3.5 h-3.5 text-violet-400" />
                  </div>
                  <span>{production.studio}</span>
                </div>
              )}
              <div className="flex items-center gap-1.5 text-white/60">
                <div className="flex items-center justify-center w-6 h-6 rounded-lg bg-sky-500/15">
                  <Clock className="w-3.5 h-3.5 text-sky-400" />
                </div>
                <span dir="ltr">
                  {production.startTime} - {production.endTime}
                </span>
              </div>
              <div className="flex items-center gap-1.5 text-white/60">
                <span>{production.day} {formatDateShort(production.date)}</span>
              </div>
            </div>

            {/* Divider + crew count + share */}
            <div className="flex items-center justify-between mt-4 pt-3 border-t border-white/[0.06]">
              <div className="flex items-center gap-2">
                <div className="flex items-center justify-center w-7 h-7 rounded-lg bg-amber-500/15">
                  <Users className="w-4 h-4 text-amber-400" />
                </div>
                <span className="text-sm font-semibold text-white/70">{sortedCrew.length} אנשי צוות</span>
              </div>

              {/* WhatsApp Share button */}
              <div className="relative">
                <motion.button
                  onClick={() => setShowShareMenu(!showShareMenu)}
                  className="flex items-center gap-2 px-4 py-2 rounded-full text-sm font-bold text-white transition-all duration-200 shadow-lg"
                  style={{
                    background: 'linear-gradient(135deg, #25D366 0%, #128C7E 100%)',
                    boxShadow: '0 4px 15px rgba(37, 211, 102, 0.3)',
                  }}
                  whileHover={{ scale: 1.05, boxShadow: '0 6px 20px rgba(37, 211, 102, 0.4)' }}
                  whileTap={{ scale: 0.95 }}
                >
                  <MessageCircle className="w-4 h-4" />
                  <span>שיתוף</span>
                </motion.button>

                <AnimatePresence>
                  {showShareMenu && (
                    <>
                      <div className="fixed inset-0 z-10" onClick={() => setShowShareMenu(false)} />
                      <motion.div
                        className="absolute left-0 sm:right-0 sm:left-auto bottom-full mb-2 w-56 rounded-2xl shadow-2xl z-20 overflow-hidden"
                        style={{
                          background: 'linear-gradient(165deg, rgba(30, 30, 50, 0.98) 0%, rgba(15, 15, 30, 0.99) 100%)',
                          border: '1px solid rgba(255, 255, 255, 0.1)',
                        }}
                        variants={shareMenuVariants}
                        initial="hidden"
                        animate="visible"
                        exit="exit"
                      >
                        <button
                          onClick={() => {
                            shareMyDetails();
                            setShowShareMenu(false);
                          }}
                          className="w-full text-right px-4 py-3.5 hover:bg-white/5 text-sm transition-all duration-200 flex items-center gap-3 text-white/80 hover:text-white"
                        >
                          <Star className="w-4 h-4 text-amber-400 flex-shrink-0" />
                          <span>שתף את הפרטים שלי</span>
                        </button>
                        <div className="h-px bg-white/[0.06] mx-3" />
                        <button
                          onClick={() => {
                            shareFullCrew();
                            setShowShareMenu(false);
                          }}
                          className="w-full text-right px-4 py-3.5 hover:bg-white/5 text-sm transition-all duration-200 flex items-center gap-3 text-white/80 hover:text-white"
                        >
                          <Users className="w-4 h-4 text-sky-400 flex-shrink-0" />
                          <span>שתף את כל הצוות</span>
                        </button>
                      </motion.div>
                    </>
                  )}
                </AnimatePresence>
              </div>
            </div>
          </div>

          {/* Crew list */}
          <div className="flex-1 overflow-y-auto px-4 pb-5 space-y-2.5 scrollbar-thin">
            {sortedCrew.map((member, idx) => (
              <motion.div
                key={`${member.name}-${idx}`}
                custom={idx}
                variants={cardVariants}
                initial="hidden"
                animate="visible"
                className="relative rounded-2xl p-3.5 transition-all duration-200 group"
                style={{
                  background: member.isCurrentUser
                    ? 'linear-gradient(135deg, rgba(34, 197, 94, 0.08) 0%, rgba(16, 185, 129, 0.04) 100%)'
                    : 'rgba(255, 255, 255, 0.03)',
                  border: member.isCurrentUser
                    ? '1px solid rgba(34, 197, 94, 0.3)'
                    : '1px solid rgba(255, 255, 255, 0.05)',
                  boxShadow: member.isCurrentUser
                    ? '0 0 20px rgba(34, 197, 94, 0.1), inset 0 0 20px rgba(34, 197, 94, 0.03)'
                    : 'none',
                }}
              >
                {/* Current user glow effect */}
                {member.isCurrentUser && (
                  <div className="absolute inset-0 rounded-2xl bg-gradient-to-r from-green-500/5 to-emerald-500/5 animate-pulse pointer-events-none" />
                )}

                <div className="relative flex items-center gap-3">
                  {/* Avatar */}
                  <div className="relative flex-shrink-0">
                    <div
                      className={`w-11 h-11 rounded-full bg-gradient-to-br ${getGradient(member.name)} flex items-center justify-center text-white font-bold text-sm shadow-lg`}
                      style={{
                        boxShadow: member.isCurrentUser
                          ? '0 0 12px rgba(34, 197, 94, 0.4)'
                          : '0 2px 8px rgba(0, 0, 0, 0.3)',
                      }}
                    >
                      {getInitials(member.name)}
                    </div>
                    {member.isCurrentUser && (
                      <div className="absolute -top-1 -right-1 px-1.5 py-0.5 rounded-full bg-green-500 text-[9px] font-black text-white shadow-md">
                        אתה
                      </div>
                    )}
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-[15px] text-white/90 truncate">
                        {member.name}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span
                        className="inline-block text-xs px-2 py-0.5 rounded-md font-medium"
                        style={{
                          background: 'rgba(139, 92, 246, 0.15)',
                          color: 'rgba(196, 167, 255, 0.9)',
                        }}
                      >
                        {member.roleDetail || member.role || 'תפקיד לא ידוע'}
                      </span>
                      {(member.startTime || member.endTime) && (
                        <span className="text-[11px] text-white/35 flex items-center gap-1" dir="ltr">
                          <Clock className="w-3 h-3" />
                          {member.startTime || '--:--'} - {member.endTime || '--:--'}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Phone button */}
                  {member.phone ? (
                    <motion.a
                      href={`tel:${member.phone}`}
                      className="flex items-center gap-2 px-3 py-2 rounded-full text-xs font-semibold transition-all duration-200"
                      style={{
                        background: 'linear-gradient(135deg, rgba(34, 197, 94, 0.15) 0%, rgba(16, 185, 129, 0.1) 100%)',
                        color: '#6ee7b7',
                        border: '1px solid rgba(34, 197, 94, 0.2)',
                      }}
                      whileHover={{ scale: 1.05, background: 'rgba(34, 197, 94, 0.25)' }}
                      whileTap={{ scale: 0.95 }}
                    >
                      <Phone className="w-3.5 h-3.5" />
                      <span dir="ltr">{member.phone}</span>
                    </motion.a>
                  ) : (
                    <div
                      className="flex items-center gap-1.5 px-3 py-2 rounded-full text-xs font-medium"
                      style={{
                        background: 'rgba(239, 68, 68, 0.08)',
                        color: 'rgba(252, 165, 165, 0.6)',
                        border: '1px solid rgba(239, 68, 68, 0.1)',
                      }}
                    >
                      <PhoneOff className="w-3.5 h-3.5" />
                      <span>ללא טלפון</span>
                    </div>
                  )}
                </div>
              </motion.div>
            ))}
          </div>

          {/* Bottom safe area for mobile */}
          <div className="h-[env(safe-area-inset-bottom)] bg-transparent" />
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
