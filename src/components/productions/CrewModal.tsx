'use client';

import { useState, useMemo } from 'react';
import { Production, CrewMember, formatDateShort } from '@/lib/productionDiff';
import { useAppData } from '@/contexts/AppDataContext';
import { normalizeContactName } from '@/lib/contactsUtils';
import { deduplicateCrewEntries, normalizePhone } from '@/lib/crewNormalization';
import { X, MapPin, Clock, Users, Phone, PhoneOff, Star, MessageCircle } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

interface CrewModalProps {
  production: Production;
  currentUserName?: string;
  onClose: () => void;
}

// --- Department inference ---

type Department = 'אולפן' | 'קונטרול' | 'טכני' | 'תאורה' | 'הפקה' | 'כללי';

const DEPARTMENT_ORDER: Department[] = ['אולפן', 'קונטרול', 'טכני', 'תאורה', 'הפקה', 'כללי'];

function inferCrewDepartment(role: string, roleDetail?: string | null): Department {
  const text = `${role || ''} ${roleDetail || ''}`.toLowerCase();

  // קונטרול - ניתוב, בימוי, פרומפטר, עוזר במאי, CCU, סאונד
  if (/ניתוב|נתב/u.test(text)) return 'קונטרול';
  if (/במאי|בימוי|עוזר.?במאי/u.test(text)) return 'קונטרול';
  if (/פרומפטר|טלפרומפטר|prompter/iu.test(text)) return 'קונטרול';
  if (/ccu/i.test(text)) return 'קונטרול';
  if (/סאונד|קול|מקליט|מיקרופון|boom|sound/iu.test(text)) return 'קונטרול';

  // אולפן - צלמים + ניהול במה
  if (/צלם|צילום|רחף|רחפן|סטדיקאם|סטדי|קאם|camera/iu.test(text)) return 'אולפן';
  if (/במה|ניהול.?במה|stage/iu.test(text)) return 'אולפן';

  // טכני
  if (/טכני|vtr|שידור|מיקסר|ויז'ן|vision|technical/iu.test(text)) return 'טכני';

  // תאורה
  if (/תאורה|תאורן|אור|light/iu.test(text)) return 'תאורה';

  // הפקה
  if (/מפיק|הפקה|עורך|עיצוב|produc/iu.test(text)) return 'הפקה';

  // Fallback - try to put in טכני rather than כללי
  if (/גריפ|grip|גנרטור|generator|כבלים|cable/iu.test(text)) return 'טכני';

  return 'כללי';
}

const DEPARTMENT_COLORS: Record<Department, { bg: string; text: string; border: string; pill: string; pillActive: string }> = {
  'אולפן': {
    bg: 'rgba(59, 130, 246, 0.10)',
    text: '#93c5fd',
    border: 'rgba(59, 130, 246, 0.25)',
    pill: 'bg-blue-500/10 text-blue-300 border-blue-500/20',
    pillActive: 'bg-blue-500/25 text-blue-200 border-blue-400/50 shadow-blue-500/20 shadow-sm',
  },
  'קונטרול': {
    bg: 'rgba(249, 115, 22, 0.10)',
    text: '#fdba74',
    border: 'rgba(249, 115, 22, 0.25)',
    pill: 'bg-orange-500/10 text-orange-300 border-orange-500/20',
    pillActive: 'bg-orange-500/25 text-orange-200 border-orange-400/50 shadow-orange-500/20 shadow-sm',
  },
  'טכני': {
    bg: 'rgba(16, 185, 129, 0.10)',
    text: '#6ee7b7',
    border: 'rgba(16, 185, 129, 0.25)',
    pill: 'bg-emerald-500/10 text-emerald-300 border-emerald-500/20',
    pillActive: 'bg-emerald-500/25 text-emerald-200 border-emerald-400/50 shadow-emerald-500/20 shadow-sm',
  },
  'תאורה': {
    bg: 'rgba(245, 158, 11, 0.10)',
    text: '#fcd34d',
    border: 'rgba(245, 158, 11, 0.25)',
    pill: 'bg-amber-500/10 text-amber-300 border-amber-500/20',
    pillActive: 'bg-amber-500/25 text-amber-200 border-amber-400/50 shadow-amber-500/20 shadow-sm',
  },
  'הפקה': {
    bg: 'rgba(139, 92, 246, 0.10)',
    text: '#c4b5fd',
    border: 'rgba(139, 92, 246, 0.25)',
    pill: 'bg-purple-500/10 text-purple-300 border-purple-500/20',
    pillActive: 'bg-purple-500/25 text-purple-200 border-purple-400/50 shadow-purple-500/20 shadow-sm',
  },
  'כללי': {
    bg: 'rgba(156, 163, 175, 0.10)',
    text: '#d1d5db',
    border: 'rgba(156, 163, 175, 0.25)',
    pill: 'bg-gray-500/10 text-gray-300 border-gray-500/20',
    pillActive: 'bg-gray-500/25 text-gray-200 border-gray-400/50 shadow-gray-500/20 shadow-sm',
  },
};

// --- Existing helpers (unchanged) ---

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

// --- Component ---

export default function CrewModal({ production, currentUserName, onClose }: CrewModalProps) {
  const [showShareMenu, setShowShareMenu] = useState(false);
  const [activeDepartment, setActiveDepartment] = useState<Department | 'הכל'>('הכל');
  const { contacts } = useAppData();

  const rawDeduped = deduplicateCrewEntries(production.crew);
  const normalizedContacts = contacts.filter((c): c is { id: string | number; firstName: string; lastName: string; phone?: string } =>
    Boolean(c.firstName && c.lastName)
  );
  const uniqueCrew = enrichCrewWithPhones(rawDeduped, normalizedContacts);

  const taggedCrew = uniqueCrew.map((member) => {
    const isCurrent = currentUserName
      ? member.name === currentUserName ||
        member.name.includes(currentUserName) ||
        currentUserName.includes(member.name) ||
        (member.name.split(/\s+/)[0] === currentUserName.split(/\s+/)[0] && member.name.split(/\s+/)[0].length >= 2)
      : false;
    const department = inferCrewDepartment(member.role, member.roleDetail);
    return { ...member, isCurrentUser: isCurrent, department };
  });

  // Sort: by department order, then current user first, then alphabetical
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

  // Departments that actually exist in crew, in order
  const existingDepartments = useMemo(() => {
    const deptSet = new Set(taggedCrew.map((m) => m.department));
    return DEPARTMENT_ORDER.filter((d) => deptSet.has(d));
  }, [taggedCrew]);

  // Count per department
  const departmentCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const m of taggedCrew) {
      counts[m.department] = (counts[m.department] || 0) + 1;
    }
    return counts;
  }, [taggedCrew]);

  // Filtered crew
  const filteredCrew = useMemo(() => {
    if (activeDepartment === 'הכל') return sortedCrew;
    return sortedCrew.filter((m) => m.department === activeDepartment);
  }, [sortedCrew, activeDepartment]);

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

  // Build grouped list with department headers
  const renderCrewList = () => {
    const elements: React.ReactNode[] = [];
    let currentDept: Department | null = null;
    let animIdx = 0;

    for (const member of filteredCrew) {
      // Department header
      if (member.department !== currentDept) {
        currentDept = member.department;
        const colors = DEPARTMENT_COLORS[currentDept];
        elements.push(
          <div
            key={`dept-${currentDept}`}
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
              {currentDept}
            </div>
            <div className="flex-1 h-px" style={{ background: colors.border }} />
            <span className="text-[10px] font-medium" style={{ color: colors.text }}>
              {departmentCounts[currentDept] || 0}
            </span>
          </div>
        );
      }

      // Crew card
      elements.push(
        <motion.div
          key={`${member.name}-${animIdx}`}
          custom={animIdx}
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
      );
      animIdx++;
    }

    return elements;
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

            {/* Department filter pills */}
            {existingDepartments.length > 1 && (
              <div className="flex gap-2 mt-3 overflow-x-auto pb-1 scrollbar-none -mx-1 px-1">
                {/* "All" pill */}
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
                {existingDepartments.map((dept) => {
                  const colors = DEPARTMENT_COLORS[dept];
                  const isActive = activeDepartment === dept;
                  return (
                    <button
                      key={dept}
                      onClick={() => setActiveDepartment(dept)}
                      className={`flex-shrink-0 px-3 py-1 rounded-full text-[11px] font-bold border transition-all duration-200 ${
                        isActive ? colors.pillActive : colors.pill
                      } hover:brightness-110`}
                    >
                      {dept} ({departmentCounts[dept] || 0})
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Crew list */}
          <div className="flex-1 overflow-y-auto px-4 pb-5 space-y-2 scrollbar-thin">
            {renderCrewList()}
          </div>

          {/* Bottom safe area for mobile */}
          <div className="h-[env(safe-area-inset-bottom)] bg-transparent" />
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
