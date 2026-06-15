'use client';

import { useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Clapperboard, Clock, MapPin, MessageCircle, Star, Users, X } from 'lucide-react';
import { useContactUserMap } from '@/hooks/useContactUserMap';
import CallButtons from '@/components/CallButtons';
import { useAuth } from '@/contexts/AuthContext';
import { useAppData } from '@/contexts/AppDataContext';
import { classifyContactRole, normalizeContactName } from '@/lib/contactsUtils';
import { deduplicateCrewEntries, normalizeName, normalizePhone } from '@/lib/crewNormalization';
import { type CrewMember, type Production, formatDateShort } from '@/lib/productionDiff';

interface CrewModalProps {
  production: Production;
  currentUserName?: string;
  currentUserPhone?: string;
  onClose: () => void;
}

type CrewBucket = string;
type ActiveDepartment = CrewBucket | 'הכל';

const DEPARTMENT_ORDER: CrewBucket[] = ['אולפן', 'קונטרול', 'הפקה', 'פוסט', 'בימוי וניתוב', 'צילום', 'סאונד', 'תאורה', 'טכני', 'ארט ותפאורה', 'ביוטי', 'מבצעים'];
const DIRECTOR_ROLES = ['במאי', 'במאית', 'במאי/ת', 'בימוי', 'director'];

const DEPARTMENT_COLORS: Record<CrewBucket, { bg: string; text: string; border: string; pill: string; pillActive: string }> = {
  אולפן: {
    bg: 'rgba(59, 130, 246, 0.10)',
    text: '#93c5fd',
    border: 'rgba(59, 130, 246, 0.25)',
    pill: 'bg-blue-500/10 text-blue-300 border-blue-500/20',
    pillActive: 'bg-blue-500/25 text-blue-200 border-blue-400/50 shadow-blue-500/20 shadow-sm',
  },
  קונטרול: {
    bg: 'rgba(249, 115, 22, 0.10)',
    text: '#fdba74',
    border: 'rgba(249, 115, 22, 0.25)',
    pill: 'bg-orange-500/10 text-orange-300 border-orange-500/20',
    pillActive: 'bg-orange-500/25 text-orange-200 border-orange-400/50 shadow-orange-500/20 shadow-sm',
  },
  הפקה: {
    bg: 'rgba(139, 92, 246, 0.10)',
    text: '#c4b5fd',
    border: 'rgba(139, 92, 246, 0.25)',
    pill: 'bg-purple-500/10 text-purple-300 border-purple-500/20',
    pillActive: 'bg-purple-500/25 text-purple-200 border-purple-400/50 shadow-purple-500/20 shadow-sm',
  },
  פוסט: {
    bg: 'rgba(168, 85, 247, 0.10)',
    text: '#d8b4fe',
    border: 'rgba(168, 85, 247, 0.25)',
    pill: 'bg-fuchsia-500/10 text-fuchsia-300 border-fuchsia-500/20',
    pillActive: 'bg-fuchsia-500/25 text-fuchsia-200 border-fuchsia-400/50 shadow-fuchsia-500/20 shadow-sm',
  },
  טכני: {
    bg: 'rgba(16, 185, 129, 0.10)',
    text: '#6ee7b7',
    border: 'rgba(16, 185, 129, 0.25)',
    pill: 'bg-emerald-500/10 text-emerald-300 border-emerald-500/20',
    pillActive: 'bg-emerald-500/25 text-emerald-200 border-emerald-400/50 shadow-emerald-500/20 shadow-sm',
  },
  תאורה: {
    bg: 'rgba(245, 158, 11, 0.10)',
    text: '#fcd34d',
    border: 'rgba(245, 158, 11, 0.25)',
    pill: 'bg-amber-500/10 text-amber-300 border-amber-500/20',
    pillActive: 'bg-amber-500/25 text-amber-200 border-amber-400/50 shadow-amber-500/20 shadow-sm',
  },
  צילום: {
    bg: 'rgba(56, 189, 248, 0.10)',
    text: '#7dd3fc',
    border: 'rgba(56, 189, 248, 0.25)',
    pill: 'bg-sky-500/10 text-sky-300 border-sky-500/20',
    pillActive: 'bg-sky-500/25 text-sky-200 border-sky-400/50 shadow-sky-500/20 shadow-sm',
  },
  סאונד: {
    bg: 'rgba(236, 72, 153, 0.10)',
    text: '#f9a8d4',
    border: 'rgba(236, 72, 153, 0.25)',
    pill: 'bg-pink-500/10 text-pink-300 border-pink-500/20',
    pillActive: 'bg-pink-500/25 text-pink-200 border-pink-400/50 shadow-pink-500/20 shadow-sm',
  },
  מבצעים: {
    bg: 'rgba(6, 182, 212, 0.10)',
    text: '#67e8f9',
    border: 'rgba(6, 182, 212, 0.25)',
    pill: 'bg-cyan-500/10 text-cyan-300 border-cyan-500/20',
    pillActive: 'bg-cyan-500/25 text-cyan-200 border-cyan-400/50 shadow-cyan-500/20 shadow-sm',
  },
  'בימוי וניתוב': {
    bg: 'rgba(244, 63, 94, 0.10)',
    text: '#fda4af',
    border: 'rgba(244, 63, 94, 0.25)',
    pill: 'bg-rose-500/10 text-rose-300 border-rose-500/20',
    pillActive: 'bg-rose-500/25 text-rose-200 border-rose-400/50 shadow-rose-500/20 shadow-sm',
  },
  'ארט ותפאורה': {
    bg: 'rgba(236, 72, 153, 0.10)',
    text: '#f9a8d4',
    border: 'rgba(236, 72, 153, 0.25)',
    pill: 'bg-pink-500/10 text-pink-300 border-pink-500/20',
    pillActive: 'bg-pink-500/25 text-pink-200 border-pink-400/50 shadow-pink-500/20 shadow-sm',
  },
  ביוטי: {
    bg: 'rgba(20, 184, 166, 0.10)',
    text: '#5eead4',
    border: 'rgba(20, 184, 166, 0.25)',
    pill: 'bg-teal-500/10 text-teal-300 border-teal-500/20',
    pillActive: 'bg-teal-500/25 text-teal-200 border-teal-400/50 shadow-teal-500/20 shadow-sm',
  },
};

function inferCrewBucket(role: string, roleDetail?: string | null): CrewBucket {
  const classification = classifyContactRole(roleDetail || role || '');
  return classification.workArea || classification.department;
}

function enrichCrewWithPhones(
  crew: CrewMember[],
  contactList: { firstName: string; lastName: string; phone?: string; is_consented?: boolean }[],
): (CrewMember & { is_consented?: boolean })[] {
  return crew.map((member) => {
    const memberPhone = normalizePhone(member.phone);

    const normalized = normalizeContactName(member.name || '');
    const nameParts = normalized.split(/\s+/);
    const firstName = nameParts[0] || '';
    const lastName = nameParts.slice(1).join(' ');

    const contact = contactList
      .filter((candidate) => {
        const fullName = `${candidate.firstName} ${candidate.lastName}`;
        if (normalizeContactName(fullName) === normalized) return true;
        if (firstName && lastName && candidate.firstName === firstName && candidate.lastName === lastName) return true;
        if (firstName.length >= 2 && candidate.firstName === firstName && lastName && candidate.lastName.includes(lastName.split(' ')[0])) return true;
        return false;
      })
      .sort((a, b) => {
        const aPhone = normalizePhone(a.phone || '') ? 1 : 0;
        const bPhone = normalizePhone(b.phone || '') ? 1 : 0;
        return bPhone - aPhone;
      })[0];

    return {
      ...member,
      phone: memberPhone || normalizePhone(contact?.phone || '') || null,
      is_consented: contact?.is_consented,
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
  for (let i = 0; i < name.length; i += 1) {
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

export default function CrewModal({ production, currentUserName, currentUserPhone, onClose }: CrewModalProps) {
  const [showShareMenu, setShowShareMenu] = useState(false);
  const [activeDepartment, setActiveDepartment] = useState<ActiveDepartment>('הכל');
  const [resolvedPhones, setResolvedPhones] = useState<Record<string, string>>({});
  const [isPhonesLoading, setIsPhonesLoading] = useState(
    () => (production.crew ?? []).some((m) => !normalizePhone(m.phone ?? '')),
  );
  const { contacts } = useAppData();
  const { user } = useAuth();
  const { contactIdToUserId, nameToUserId } = useContactUserMap();

  const rawDeduped = deduplicateCrewEntries(production.crew);
  const normalizedContacts = contacts.filter((contact): contact is { id: string | number; firstName: string; lastName: string; phone?: string; is_consented?: boolean } =>
    Boolean(contact.firstName && contact.lastName),
  );
  const uniqueCrew = enrichCrewWithPhones(rawDeduped, normalizedContacts);

  // Fetch phones from the users collection for crew members still missing a phone
  useEffect(() => {
    const missingNames = uniqueCrew
      .filter((m) => !normalizePhone(m.phone ?? ''))
      .map((m) => m.name)
      .filter(Boolean);

    if (!missingNames.length || !user) {
      setIsPhonesLoading(false);
      return;
    }

    let cancelled = false;
    void user.getIdToken().then(async (token) => {
      const res = await fetch('/api/crew/resolve-phones', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ names: missingNames }),
      }).catch(() => null);
      if (!res?.ok || cancelled) return;
      const payload = (await res.json()) as { phones?: Record<string, string> };
      if (!cancelled) {
        setResolvedPhones(payload.phones ?? {});
        setIsPhonesLoading(false);
      }
    }).catch(() => { setIsPhonesLoading(false); });

    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [production.id, user]);

  const normalizedCurrentName = currentUserName ? normalizeName(currentUserName) : '';
  const normalizedCurrentPhone = normalizePhone(currentUserPhone ?? '') ?? '';

  const taggedCrew = uniqueCrew.map((member) => {
    const isCurrent =
      (normalizedCurrentName.length >= 2 && normalizeName(member.name) === normalizedCurrentName) ||
      (normalizedCurrentPhone.length >= 9 && normalizePhone(member.phone ?? '') === normalizedCurrentPhone);
    const resolvedPhone = resolvedPhones[normalizeName(member.name)];
    const phone = member.phone || resolvedPhone || null;
    const department = inferCrewBucket(member.role, member.roleDetail);
    const is_consented = member.is_consented === true || !!resolvedPhone;
    // Look up the registered userId by normalized name for call buttons
    const userId = nameToUserId.get(normalizeName(member.name)) || undefined;
    return { ...member, phone, isCurrentUser: isCurrent, department, is_consented, userId };
  });

  const sortedCrew = useMemo(() => {
    return [...taggedCrew].sort((a, b) => {
      const deptA = DEPARTMENT_ORDER.indexOf(a.department);
      const deptB = DEPARTMENT_ORDER.indexOf(b.department);
      if (deptA !== deptB) return deptA - deptB;
      if (a.isCurrentUser && !b.isCurrentUser) return -1;
      if (!a.isCurrentUser && b.isCurrentUser) return 1;
      return a.name.localeCompare(b.name, 'he');
    });
  }, [taggedCrew]);

  const existingDepartments = useMemo(() => {
    const departmentSet = new Set(taggedCrew.map((member) => member.department));
    return DEPARTMENT_ORDER.filter((department) => departmentSet.has(department));
  }, [taggedCrew]);

  const departmentCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const member of taggedCrew) {
      counts[member.department] = (counts[member.department] || 0) + 1;
    }
    return counts;
  }, [taggedCrew]);

  const directors = useMemo(() =>
    taggedCrew.filter(m =>
      DIRECTOR_ROLES.some(r => m.role?.includes(r) || m.roleDetail?.includes(r))
    ),
  [taggedCrew]);

  const directorNames = useMemo(() => new Set(directors.map((d) => d.name)), [directors]);
  const filteredCrew = useMemo(() => {
    const base = activeDepartment === 'הכל' ? sortedCrew : sortedCrew.filter((member) => member.department === activeDepartment);
    // Directors are already shown in the hero box at the top; hide them from the main list to avoid double display.
    if (directors.length > 0 && activeDepartment === 'הכל') {
      return base.filter((m) => !directorNames.has(m.name));
    }
    return base;
  }, [sortedCrew, activeDepartment, directors, directorNames]);

  const shareMyDetails = () => {
    const myEntry = sortedCrew.find((member) => member.isCurrentUser);
    if (!myEntry) return;

    const text = [
      `*${production.name}*`,
      `${production.day} ${formatDateShort(production.date)} | ${production.startTime}-${production.endTime}`,
      production.studio ? `${production.studio}` : '',
      '',
      '*הפרטים שלי:*',
      `${myEntry.name} - ${myEntry.roleDetail || myEntry.role}`,
      myEntry.phone ? `${myEntry.phone}` : '',
    ]
      .filter(Boolean)
      .join('\n');

    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank');
  };

  const shareFullCrew = () => {
    const crewText = sortedCrew
      .map((member) => `- ${member.name} - ${member.roleDetail || member.role}`)
      .join('\n');

    const text = [
      `*${production.name}*`,
      `${production.day} ${formatDateShort(production.date)} | ${production.startTime}-${production.endTime}`,
      production.studio ? `${production.studio}` : '',
      '',
      `*צוות (${sortedCrew.length}):*`,
      crewText,
    ]
      .filter(Boolean)
      .join('\n');

    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank');
  };

  const renderCrewList = () => {
    const elements: React.ReactNode[] = [];
    let currentDepartment: CrewBucket | null = null;
    let animationIndex = 0;

    for (const member of filteredCrew) {
      if (member.department !== currentDepartment) {
        currentDepartment = member.department;
        const colors = DEPARTMENT_COLORS[currentDepartment];

        elements.push(
          <div
            key={`department-${currentDepartment}`}
            className="sticky top-0 z-10 flex items-center gap-2 py-1.5 px-1 mt-1 first:mt-0"
            style={{ backdropFilter: 'blur(12px)' }}
          >
            <div
              className="px-2.5 py-0.5 rounded-md text-[11px] font-bold tracking-wide"
              style={{
                background: colors.bg,
                color: colors.text,
                border: `1px solid ${colors.border}`,
              }}
            >
              {currentDepartment}
            </div>
            <div className="flex-1 h-px" style={{ background: colors.border }} />
            <span className="text-[10px] font-medium" style={{ color: colors.text }}>
              {departmentCounts[currentDepartment] || 0}
            </span>
          </div>,
        );
      }

      elements.push(
        <motion.div
          key={`${member.name}-${animationIndex}`}
          custom={animationIndex}
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
          {member.isCurrentUser && (
            <div className="absolute inset-0 rounded-2xl bg-gradient-to-r from-green-500/5 to-emerald-500/5 animate-pulse pointer-events-none" />
          )}

          <div className="relative flex items-center gap-3">
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

            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="font-bold text-[15px] text-white/90 truncate">
                  {member.name}
                </span>
              </div>
              <div className="flex items-center gap-2 mt-0.5 flex-wrap">
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

            <CallButtons
              userId={member.isCurrentUser ? undefined : member.userId}
              displayName={member.name}
              size="sm"
            />
          </div>
        </motion.div>,
      );

      animationIndex += 1;
    }

    return elements;
  };

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-[10000] flex items-end sm:items-center justify-center p-0 sm:p-4" dir="rtl">
        <motion.div
          className="absolute inset-0 bg-black/70 backdrop-blur-md"
          variants={overlayVariants}
          initial="hidden"
          animate="visible"
          exit="exit"
          onClick={onClose}
        />

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
          <div className="absolute top-0 left-0 w-48 h-48 bg-violet-600/10 rounded-full blur-3xl pointer-events-none" />
          <div className="absolute top-20 right-0 w-32 h-32 bg-rose-600/8 rounded-full blur-3xl pointer-events-none" />

          <div className="relative p-5 pb-4">
            <motion.button
              onClick={onClose}
              className="absolute top-4 left-4 p-2 rounded-full bg-white/5 hover:bg-white/10 transition-all duration-200 group"
              whileHover={{ scale: 1.1 }}
              whileTap={{ scale: 0.9 }}
            >
              <X className="w-5 h-5 text-white/50 group-hover:text-white/80 transition-colors" />
            </motion.button>

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

            <div className="flex items-center justify-between mt-4 pt-3 border-t border-white/[0.06]">
              <div className="flex items-center gap-2">
                <div className="flex items-center justify-center w-7 h-7 rounded-lg bg-amber-500/15">
                  <Users className="w-4 h-4 text-amber-400" />
                </div>
                <span className="text-sm font-semibold text-white/70">{sortedCrew.length} אנשי צוות</span>
              </div>

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

            {existingDepartments.length > 1 && (
              <div className="flex gap-2 mt-3 overflow-x-auto pb-1 scrollbar-none -mx-1 px-1">
                <button
                  onClick={() => setActiveDepartment('הכל')}
                  className={`flex-shrink-0 px-3 py-1 rounded-full text-[11px] font-bold border transition-all duration-200 ${
                    activeDepartment === 'הכל'
                      ? 'bg-white/15 text-white/90 border-white/30 shadow-sm'
                      : 'bg-white/5 text-white/50 border-white/10 hover:bg-white/8'
                  }`}
                >
                  הכל ({sortedCrew.length})
                </button>
                {existingDepartments.map((department) => {
                  const colors = DEPARTMENT_COLORS[department];
                  const isActive = activeDepartment === department;

                  return (
                    <button
                      key={department}
                      onClick={() => setActiveDepartment(department)}
                      className={`flex-shrink-0 px-3 py-1 rounded-full text-[11px] font-bold border transition-all duration-200 ${
                        isActive ? colors.pillActive : colors.pill
                      } hover:brightness-110`}
                    >
                      {department} ({departmentCounts[department] || 0})
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          <div className="flex-1 overflow-y-auto px-4 pb-5 space-y-2 scrollbar-thin">
            {directors.length > 0 && activeDepartment === 'הכל' && (
              <div
                className="rounded-2xl p-3 mb-3"
                style={{
                  background: 'rgba(244, 63, 94, 0.08)',
                  border: '1px solid rgba(244, 63, 94, 0.2)',
                }}
              >
                <div className="flex items-center gap-2 mb-2">
                  <Clapperboard className="w-4 h-4" style={{ color: '#fda4af' }} />
                  <span className="text-xs font-bold" style={{ color: '#fda4af' }}>
                    {directors.length === 1 ? 'במאי/ת' : 'במאים'}
                  </span>
                </div>
                <div className="space-y-2">
                  {directors.map((director, idx) => (
                    <div key={`director-hero-${director.name}-${idx}`} className="flex items-center gap-3">
                      <div
                        className={`w-9 h-9 rounded-full bg-gradient-to-br ${getGradient(director.name)} flex items-center justify-center text-white font-bold text-xs shadow-lg`}
                      >
                        {getInitials(director.name)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <span className="font-bold text-sm text-white/90 truncate block">
                          {director.name}
                        </span>
                        {director.roleDetail && director.roleDetail !== director.role && (
                          <span className="text-[11px] text-white/40">{director.roleDetail}</span>
                        )}
                      </div>
                      <CallButtons
                        userId={director.isCurrentUser ? undefined : director.userId}
                        displayName={director.name}
                        size="sm"
                      />
                    </div>
                  ))}
                </div>
              </div>
            )}
            {renderCrewList()}
          </div>

          <div className="h-[env(safe-area-inset-bottom)] bg-transparent" />
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
