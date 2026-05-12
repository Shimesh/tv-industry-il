'use client';

import { useState, useMemo, useRef, useCallback, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuth } from '@/contexts/AuthContext';
import { type Contact } from '@/data/contacts';
import { INDUSTRY_DEPARTMENTS, INDUSTRY_ROLE_OPTIONS, getRolesForDepartment } from '@/constants/departments';
import {
  normalizeDisplayRoleLabel,
} from '@/lib/contactsUtils';
import { normalizeProfessionalFields, professionalSearchText } from '@/lib/professionalFields';
import { useAppData } from '@/contexts/AppDataContext';
import { Search, Phone, X, Briefcase, Users, LayoutGrid, List, MessageCircle, Star, Mail, PhoneCall, MapPin, Clock, Film, Wrench, CircleDot, Building2, Check } from 'lucide-react';
import { DirectorySkeleton } from '@/components/SkeletonLoader';
import AuthGuard from '@/components/AuthGuard';

const deptColors: Record<string, string> = {
  'צילום': 'from-blue-500 to-blue-600',
  'טכני': 'from-emerald-500 to-emerald-600',
  'הפקה': 'from-purple-500 to-purple-600',
  'סאונד': 'from-orange-500 to-orange-600',
  'תאורה': 'from-yellow-500 to-amber-600',
  'מבצעים': 'from-cyan-500 to-cyan-600',
  'בימוי': 'from-rose-500 to-rose-600',
  'ארט ותפאורה': 'from-pink-500 to-pink-600',
  'ביוטי': 'from-teal-500 to-teal-600',
};

const deptBadgeColors: Record<string, string> = {
  'צילום': 'bg-blue-500/15 text-blue-300',
  'טכני': 'bg-emerald-500/15 text-emerald-300',
  'הפקה': 'bg-purple-500/15 text-purple-300',
  'סאונד': 'bg-orange-500/15 text-orange-300',
  'תאורה': 'bg-yellow-500/15 text-yellow-300',
  'מבצעים': 'bg-cyan-500/15 text-cyan-300',
  'בימוי': 'bg-rose-500/15 text-rose-300',
  'ארט ותפאורה': 'bg-pink-500/15 text-pink-300',
  'ביוטי': 'bg-teal-500/15 text-teal-300',
};

const deptGlowColors: Record<string, string> = {
  'צילום': 'shadow-blue-500/20',
  'טכני': 'shadow-emerald-500/20',
  'הפקה': 'shadow-purple-500/20',
  'סאונד': 'shadow-orange-500/20',
  'תאורה': 'shadow-yellow-500/20',
  'מבצעים': 'shadow-cyan-500/20',
  'בימוי': 'shadow-rose-500/20',
  'ארט ותפאורה': 'shadow-pink-500/20',
  'ביוטי': 'shadow-teal-500/20',
};

const cardVariants = {
  hidden: { opacity: 0, y: 20, scale: 0.95 },
  visible: (i: number) => ({
    opacity: 1,
    y: 0,
    scale: 1,
    transition: {
      delay: i * 0.04,
      duration: 0.4,
      ease: [0.25, 0.46, 0.45, 0.94] as [number, number, number, number],
    },
  }),
  exit: { opacity: 0, y: -10, scale: 0.95, transition: { duration: 0.2 } },
};

const modalOverlayVariants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { duration: 0.25 } },
  exit: { opacity: 0, transition: { duration: 0.2 } },
};

const modalContentVariants = {
  hidden: { opacity: 0, scale: 0.9, y: 30 },
  visible: {
    opacity: 1,
    scale: 1,
    y: 0,
    transition: { duration: 0.35, ease: [0.16, 1, 0.3, 1] as [number, number, number, number] },
  },
  exit: {
    opacity: 0,
    scale: 0.92,
    y: 20,
    transition: { duration: 0.2 },
  },
};

function uniqueLabels(values: Array<string | null | undefined>) {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const raw of values) {
    const value = String(raw || '').replace(/\s+/g, ' ').trim();
    if (!value) continue;
    const key = value.toLocaleLowerCase('he');
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(value);
  }
  return result;
}

function getContactRoles(contact: Contact) {
  const professional = normalizeProfessionalFields(contact);
  const specialty = normalizeDisplayRoleLabel(contact.specialty || '');
  return uniqueLabels([...professional.roles, specialty]);
}

function getContactDepartments(contact: Contact) {
  return normalizeProfessionalFields(contact).departments;
}

function getPrimaryDepartment(contact: Contact) {
  return getContactDepartments(contact)[0] || '';
}

function getRoleSearchText(role: string) {
  const normalizedRole = normalizeDisplayRoleLabel(role);
  const aliases: Record<string, string[]> = {
    'עוזר צלם': ['ע.צלם', 'ע צלם', 'עוזר צלם', 'עוזרת צלם', 'עוזר/ת צלם', 'assistant camera', 'camera assistant'],
  };

  return uniqueLabels([role, normalizedRole, ...(aliases[normalizedRole] || [])]).join(' ').toLocaleLowerCase('he');
}

export default function DirectoryPage() {
  return (
    <AuthGuard>
      <DirectoryContent />
    </AuthGuard>
  );
}

function DirectoryContent() {
  const { profile, loading: authLoading } = useAuth();
  const {
    contacts: contactsList,
    totalCount,
    contactsLoading,
    contactsReady,
    contactsServerConfirmed,
    contactsError,
  } = useAppData();
  const [search, setSearch] = useState('');
  const [departmentFilters, setDepartmentFilters] = useState<string[]>([]);
  const [roleFilters, setRoleFilters] = useState<string[]>([]);

  useEffect(() => {
    const q = new URLSearchParams(window.location.search).get('search');
    if (q) setSearch(q);
  }, []);
  const [availFilter, setAvailFilter] = useState('');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [selectedContact, setSelectedContact] = useState<Contact | null>(null);
  const [openToWorkFilter, setOpenToWorkFilter] = useState(false);
  const [activeDrawer, setActiveDrawer] = useState<'departments' | 'roles' | null>(null);
  const [drawerSearch, setDrawerSearch] = useState('');
  const searchInputRef = useRef<HTMLInputElement>(null);
  const normalizedSearch = search.trim().toLocaleLowerCase('he');
  const normalizedDrawerSearch = drawerSearch.trim().toLocaleLowerCase('he');

  // Check if a contact matches the logged-in user
  const isCurrentUser = useCallback((contact: Contact): boolean => {
    if (!profile) return false;
    const fullName = `${contact.firstName} ${contact.lastName}`;
    // Match by display name or phone
    if (profile.displayName === fullName) return true;
    if (profile.phone && contact.phone) {
      const cleanProfile = profile.phone.replace(/[-\s]/g, '');
      const cleanContact = contact.phone.replace(/[-\s]/g, '');
      if (cleanProfile === cleanContact) return true;
    }
    return false;
  }, [profile]);

  const filtered = useMemo(() => {
    const seen = new Set<string>();
    return contactsList.filter(c => {
      const key = String(c.id || `${c.firstName || ''}-${c.lastName || ''}-${c.phone || ''}`);
      if (seen.has(key)) return false;
      seen.add(key);
      const roles = getContactRoles(c);
      const contactDepartments = getContactDepartments(c);
      const haystack = professionalSearchText(c);
      const matchSearch = !normalizedSearch || haystack.includes(normalizedSearch);
      const matchDept = departmentFilters.length === 0 || departmentFilters.some((department) => contactDepartments.includes(department));
      const matchRole = roleFilters.length === 0 || roleFilters.some((role) => roles.includes(role));
      const matchAvail = !availFilter ||
        (availFilter === 'available' && c.availability === 'available') ||
        (availFilter === 'unavailable' && c.availability === 'unavailable') ||
        (availFilter === 'maybe' && c.availability === 'maybe');
      const matchOpenToWork = !openToWorkFilter || c.openToWork === true;
      return matchSearch && matchDept && matchRole && matchAvail && matchOpenToWork;
    });
  }, [normalizedSearch, departmentFilters, roleFilters, availFilter, openToWorkFilter, contactsList]);

  // Sort: current user first
  const sortedFiltered = useMemo(() => {
    return [...filtered].sort((a, b) => {
      const aIsMe = isCurrentUser(a);
      const bIsMe = isCurrentUser(b);
      if (aIsMe && !bIsMe) return -1;
      if (!aIsMe && bIsMe) return 1;
      return 0;
    });
  }, [filtered, isCurrentUser]);

  const availableCount = contactsList.filter(c => c.availability === 'available').length;
  const maybeCount = contactsList.filter(c => c.availability === 'maybe').length;
  const openToWorkCount = contactsList.filter(c => c.openToWork === true).length;

  const formatWhatsApp = (phone?: string) => {
    if (!phone) return '';
    const cleaned = phone.replace(/[-\s]/g, '');
    return `https://wa.me/972${cleaned.startsWith('0') ? cleaned.slice(1) : cleaned}`;
  };

  const canShowContactInfo = (contact: Contact) => contact.is_consented === true;

  const getContactReference = (contact: Contact) => {
    const fullName = `${contact.firstName || ''} ${contact.lastName || ''}`.trim();
    return fullName || String(contact.id);
  };

  const getRemovalRequestMailto = (contact: Contact) => {
    const subject = `בקשת הסרה מאינדקס: ${getContactReference(contact)}`;
    return `mailto:yaron.orb@gmail.com?subject=${encodeURIComponent(subject)}`;
  };

  const deptCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    contactsList.forEach((contact) => {
      getContactDepartments(contact).forEach((department) => {
        if (!department) return;
        counts[department] = (counts[department] || 0) + 1;
      });
    });
    return counts;
  }, [contactsList]);

  const roleCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    contactsList.forEach((contact) => {
      getContactRoles(contact).forEach((role) => {
        if (!role) return;
        counts[role] = (counts[role] || 0) + 1;
      });
    });
    return counts;
  }, [contactsList]);

  const selectedDepartment = departmentFilters[0] || '';
  const selectedRole = roleFilters[0] || '';

  const roleOptions = useMemo<[string, number][]>(
    () => {
      const canonicalRoles = selectedDepartment
        ? getRolesForDepartment(selectedDepartment)
        : INDUSTRY_ROLE_OPTIONS;

      return canonicalRoles.map((role) => [role, roleCounts[role] || 0]);
    },
    [roleCounts, selectedDepartment],
  );

  const departmentOptions = useMemo(
    () => INDUSTRY_DEPARTMENTS,
    [],
  );

  const visibleDepartmentOptions = useMemo(
    () => departmentOptions.filter((dept) => !normalizedDrawerSearch || dept.label.toLocaleLowerCase('he').includes(normalizedDrawerSearch)),
    [departmentOptions, normalizedDrawerSearch],
  );

  const visibleRoleOptions = useMemo(
    () => roleOptions.filter(([role]) => !normalizedDrawerSearch || getRoleSearchText(role).includes(normalizedDrawerSearch)),
    [roleOptions, normalizedDrawerSearch],
  );

  const hasActiveFilters = Boolean(search || departmentFilters.length > 0 || roleFilters.length > 0 || availFilter || openToWorkFilter);
  const filterCardActiveStyle = {
    background: 'linear-gradient(135deg, #7c3aed 0%, #a855f7 48%, #2563eb 100%)',
    borderColor: 'rgba(255,255,255,0.34)',
    boxShadow: '0 18px 46px rgba(124,58,237,0.34), 0 0 0 1px rgba(255,255,255,0.16)',
  };
  const activeTextStyle = { color: '#ffffff' };
  const activeMutedTextStyle = { color: 'rgba(255,255,255,0.86)' };

  const resetAllFilters = () => {
    setSearch('');
    setDepartmentFilters([]);
    setRoleFilters([]);
    setAvailFilter('');
    setOpenToWorkFilter(false);
  };

  const selectDepartmentFilter = (department: string) => {
    setDepartmentFilters((current) => current[0] === department ? [] : [department]);
    setRoleFilters([]);
    setDrawerSearch('');
    setActiveDrawer(null);
  };

  const selectRoleFilter = (role: string) => {
    setRoleFilters((current) => current[0] === role ? [] : [role]);
    setDrawerSearch('');
    setActiveDrawer(null);
  };

  const openFilterDrawer = (drawer: 'departments' | 'roles') => {
    setDrawerSearch('');
    setActiveDrawer(drawer);
  };

  const closeFilterDrawer = () => {
    setDrawerSearch('');
    setActiveDrawer(null);
  };

  if (authLoading || (contactsLoading && !contactsReady)) return <DirectorySkeleton />;

  return (
    <div className="min-h-screen">
      {/* Header */}
      <section className="app-hero">
        <div className="absolute inset-0 bg-gradient-to-bl from-purple-900/20 via-transparent to-blue-900/10" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,_rgba(139,92,246,0.08),transparent_60%)]" />
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="relative max-w-7xl mx-auto px-4 sm:px-6 py-6 sm:py-10"
        >
          <div className="flex items-center gap-3 sm:gap-4 mb-2">
            <motion.div
              initial={{ scale: 0, rotate: -180 }}
              animate={{ scale: 1, rotate: 0 }}
              transition={{ type: 'spring', stiffness: 200, damping: 15, delay: 0.1 }}
              className="w-12 h-12 sm:w-14 sm:h-14 rounded-2xl bg-gradient-to-br from-purple-500 via-violet-500 to-blue-600 flex items-center justify-center shadow-lg shadow-purple-500/25"
            >
              <Users className="w-6 h-6 sm:w-7 sm:h-7 text-white" />
            </motion.div>
            <div>
              <h1 className="text-2xl sm:text-4xl font-black bg-gradient-to-l from-purple-400 via-violet-300 to-blue-400 bg-clip-text text-transparent">
                אלפון מקצועי
              </h1>
              <p className="text-xs sm:text-sm mt-1" style={{ color: 'var(--theme-text-secondary)' }}>
                מאגר אנשי המקצוע של תעשיית הטלוויזיה הישראלית
              </p>
            </div>
          </div>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.3, duration: 0.4 }}
            className="flex flex-wrap items-center gap-3 sm:gap-4 mt-3 sm:mt-4 text-xs sm:text-sm"
            style={{ color: 'var(--theme-text-secondary)' }}
          >
            {!contactsServerConfirmed && (
              <>
                <span className="flex items-center gap-1.5 text-amber-400">
                  <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
                  מסנכרן מול השרת
                </span>
                <span style={{ color: 'var(--theme-text-secondary)', opacity: 0.3 }}>|</span>
              </>
            )}
            {contactsError && (
              <>
                <span className="flex items-center gap-1.5 text-red-400">
                  <span className="w-2 h-2 rounded-full bg-red-400" />
                  שגיאת סנכרון
                </span>
                <span style={{ color: 'var(--theme-text-secondary)', opacity: 0.3 }}>|</span>
              </>
            )}
            <span className="flex items-center gap-1.5">
              <Users className="w-3.5 h-3.5" />
              {totalCount} אנשי מקצוע
            </span>
            <span style={{ color: 'var(--theme-text-secondary)', opacity: 0.3 }}>|</span>
            <span className="flex items-center gap-1.5 text-green-400">
              <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
              {availableCount} פנויים
            </span>
            <span style={{ color: 'var(--theme-text-secondary)', opacity: 0.3 }}>|</span>
            <span className="flex items-center gap-1.5 text-yellow-400">
              <span className="w-2 h-2 rounded-full bg-yellow-400" />
              {maybeCount} אולי
            </span>
            <span style={{ color: 'var(--theme-text-secondary)', opacity: 0.3 }}>|</span>
            <span className="flex items-center gap-1.5 text-green-400">
              {openToWorkCount} מחפשים עבודה
            </span>
          </motion.div>
        </motion.div>
      </section>

      {/* Search & Filters */}
      <section className="sticky z-30 border-b backdrop-blur-xl" style={{ background: 'color-mix(in srgb, var(--theme-bg) 85%, transparent)', borderColor: 'var(--theme-border)', top: 'var(--app-header-offset)' }} dir="rtl">
        <div className="mx-auto max-w-7xl px-4 py-3 sm:px-6">
          <div className="space-y-3">
            <div className="relative group">
              <Search className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 transition-colors group-focus-within:text-purple-400" style={{ color: 'var(--theme-text-secondary)', opacity: 0.7 }} />
              <input
                ref={searchInputRef}
                type="text"
                placeholder="חיפוש לפי שם, תפקיד או מחלקה..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full rounded-xl border py-2.5 pl-10 pr-10 text-sm transition-all duration-300 placeholder:text-gray-500 focus:border-purple-500/60 focus:outline-none focus:ring-2 focus:ring-purple-500/20"
                style={{ background: 'color-mix(in srgb, var(--theme-bg-secondary) 70%, transparent)', borderColor: 'var(--theme-border)', color: 'var(--theme-text)' }}
                dir="rtl"
              />
              {search.length > 0 && (
                <button
                  type="button"
                  onClick={() => {
                    setSearch('');
                    searchInputRef.current?.focus();
                  }}
                  className="absolute left-3 top-1/2 -translate-y-1/2 rounded-full p-1 transition-colors hover:bg-white/10"
                  style={{ color: 'var(--theme-text-secondary)' }}
                  aria-label="נקה חיפוש"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>

            <div className="grid grid-cols-2 gap-2.5 sm:gap-3">
              <motion.button
                type="button"
                whileTap={{ scale: 0.97 }}
                onClick={resetAllFilters}
                className="app-card min-h-[92px] p-3.5 text-right"
                style={!hasActiveFilters ? filterCardActiveStyle : undefined}
                aria-pressed={!hasActiveFilters}
              >
                <div className="mb-2 flex items-center gap-2">
                  <CircleDot className={`h-4 w-4 ${!hasActiveFilters ? 'text-white' : 'text-purple-400'}`} />
                  <span className="text-[11px] font-medium" style={!hasActiveFilters ? activeMutedTextStyle : { color: 'var(--theme-text-secondary)' }}>כל הסטטוסים</span>
                </div>
                <div className="text-xs font-bold leading-snug" style={!hasActiveFilters ? activeTextStyle : { color: 'var(--theme-text)' }}>
                  {hasActiveFilters ? 'איפוס כל הפילטרים' : 'מציג את כולם'}
                </div>
              </motion.button>

              <motion.button
                type="button"
                whileTap={{ scale: 0.97 }}
                onClick={() => {
                  setOpenToWorkFilter((current) => !current);
                  setAvailFilter('');
                }}
                className="app-card min-h-[92px] p-3.5 text-right"
                style={openToWorkFilter ? filterCardActiveStyle : undefined}
                aria-pressed={openToWorkFilter}
              >
                <div className="mb-2 flex items-center gap-2">
                  <Briefcase className={`h-4 w-4 ${openToWorkFilter ? 'text-white' : 'text-green-400'}`} />
                  <span className="text-[11px] font-medium" style={openToWorkFilter ? activeMutedTextStyle : { color: 'var(--theme-text-secondary)' }}>מחפשים עבודה בלבד</span>
                </div>
                <div className="text-xs font-bold leading-snug" style={openToWorkFilter ? activeTextStyle : { color: 'var(--theme-text)' }}>
                  {openToWorkFilter ? `${filtered.length} תוצאות` : `${openToWorkCount} זמינים לפנייה`}
                </div>
              </motion.button>

              <motion.button
                type="button"
                whileTap={{ scale: 0.97 }}
                onClick={() => selectedDepartment ? selectDepartmentFilter(selectedDepartment) : openFilterDrawer('departments')}
                className="app-card min-h-[92px] p-3.5 text-right"
                style={selectedDepartment ? filterCardActiveStyle : undefined}
                aria-label={selectedDepartment ? `נקה מחלקה ${selectedDepartment}` : 'חיפוש לפי מחלקה'}
                aria-haspopup="dialog"
                aria-expanded={activeDrawer === 'departments'}
              >
                <div className="mb-2 flex items-center gap-2">
                  <Building2 className={`h-4 w-4 ${selectedDepartment ? 'text-white' : 'text-purple-400'}`} />
                  <span className="text-[11px] font-medium" style={selectedDepartment ? activeMutedTextStyle : { color: 'var(--theme-text-secondary)' }}>חיפוש לפי מחלקה</span>
                </div>
                <div className="truncate text-xs font-bold leading-snug" style={selectedDepartment ? activeTextStyle : { color: 'var(--theme-text)' }}>
                  {selectedDepartment ? `מחלקה: ${selectedDepartment}` : `${departmentOptions.length} מחלקות`}
                </div>
              </motion.button>

              <motion.button
                type="button"
                whileTap={{ scale: 0.97 }}
                onClick={() => selectedRole ? selectRoleFilter(selectedRole) : openFilterDrawer('roles')}
                className="app-card min-h-[92px] p-3.5 text-right"
                style={selectedRole ? filterCardActiveStyle : undefined}
                aria-label={selectedRole ? `נקה תפקיד ${selectedRole}` : 'חיפוש לפי תפקיד'}
                aria-haspopup="dialog"
                aria-expanded={activeDrawer === 'roles'}
              >
                <div className="mb-2 flex items-center gap-2">
                  <Wrench className={`h-4 w-4 ${selectedRole ? 'text-white' : 'text-cyan-400'}`} />
                  <span className="text-[11px] font-medium" style={selectedRole ? activeMutedTextStyle : { color: 'var(--theme-text-secondary)' }}>חיפוש לפי תפקיד</span>
                </div>
                <div className="truncate text-xs font-bold leading-snug" style={selectedRole ? activeTextStyle : { color: 'var(--theme-text)' }}>
                  {selectedRole ? `תפקיד: ${selectedRole}` : `${roleOptions.length} תפקידים`}
                </div>
              </motion.button>
            </div>

            <div className="flex items-center justify-between gap-3">
              <motion.span
                key={filtered.length}
                initial={{ opacity: 0, y: -5 }}
                animate={{ opacity: 1, y: 0 }}
                className="text-sm"
                style={{ color: 'var(--theme-text-secondary)' }}
              >
                {filtered.length} תוצאות
              </motion.span>

              <div className="mr-auto flex shrink-0 overflow-hidden rounded-xl border" style={{ borderColor: 'var(--theme-border)' }}>
                <motion.button
                  whileTap={{ scale: 0.9 }}
                  onClick={() => setViewMode('grid')}
                  className={`p-2.5 transition-all duration-300 ${viewMode === 'grid' ? 'bg-purple-500/20 text-purple-400 shadow-inner' : ''}`}
                  style={viewMode !== 'grid' ? { background: 'var(--theme-bg-secondary)', color: 'var(--theme-text-secondary)' } : undefined}
                  aria-label="תצוגת כרטיסים"
                >
                  <LayoutGrid className="h-4 w-4" />
                </motion.button>
                <motion.button
                  whileTap={{ scale: 0.9 }}
                  onClick={() => setViewMode('list')}
                  className={`p-2.5 transition-all duration-300 ${viewMode === 'list' ? 'bg-purple-500/20 text-purple-400 shadow-inner' : ''}`}
                  style={viewMode !== 'list' ? { background: 'var(--theme-bg-secondary)', color: 'var(--theme-text-secondary)' } : undefined}
                  aria-label="תצוגת רשימה"
                >
                  <List className="h-4 w-4" />
                </motion.button>
              </div>

              {hasActiveFilters && (
                <motion.button
                  initial={{ opacity: 0, x: 10 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 10 }}
                  onClick={resetAllFilters}
                  className="flex items-center gap-1 text-xs text-purple-400 transition-colors hover:text-purple-300"
                >
                  <X className="h-3 w-3" /> נקה פילטרים
                </motion.button>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* Contact Cards */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 py-8">
        <AnimatePresence mode="wait">
          {viewMode === 'grid' ? (
            <motion.div
              key="grid"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.25 }}
              className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4"
            >
              <AnimatePresence>
                {sortedFiltered.map((contact, i) => {
                  const isMeCard = isCurrentUser(contact);
                  const showContactInfo = canShowContactInfo(contact);
                  const contactRoles = getContactRoles(contact);
                  const contactDepartments = getContactDepartments(contact);
                  const primaryDepartment = getPrimaryDepartment(contact);
                  return (
                    <motion.div
                      key={contact.id}
                      custom={i}
                      variants={cardVariants}
                      initial="hidden"
                      animate="visible"
                      exit="exit"
                      layout
                      onClick={() => setSelectedContact(contact)}
                      whileHover={{
                        y: -4,
                        transition: { duration: 0.2 },
                      }}
                      className={`rounded-2xl border p-5 cursor-pointer transition-all duration-300 relative group ${
                        isMeCard ? 'ring-2 ring-[var(--theme-accent)]' : ''
                      } hover:shadow-xl ${deptGlowColors[primaryDepartment] || 'hover:shadow-gray-500/10'}`}
                      style={{
                        background: isMeCard ? 'color-mix(in srgb, var(--theme-accent) 8%, var(--theme-bg-card))' : 'var(--theme-bg-card)',
                        borderColor: isMeCard ? 'var(--theme-accent)' : 'var(--theme-border)',
                      }}
                    >
                      {/* Subtle hover glow overlay */}
                      <div className="absolute inset-0 rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none"
                        style={{ background: 'radial-gradient(ellipse at center, rgba(139,92,246,0.04), transparent 70%)' }} />

                      {isMeCard && (
                        <motion.div
                          initial={{ scale: 0 }}
                          animate={{ scale: 1 }}
                          transition={{ type: 'spring', stiffness: 300, damping: 15 }}
                          className="absolute top-2 left-2 flex items-center gap-1 px-2 py-0.5 rounded-full bg-[var(--theme-accent-glow)] text-[var(--theme-accent)] text-[10px] font-bold"
                        >
                          <Star className="w-3 h-3" />
                          זה אני
                        </motion.div>
                      )}
                      <div className="flex items-start gap-3 relative">
                        {/* Gradient avatar with glow */}
                        <div className="relative">
                          <div className={`absolute inset-0 rounded-full bg-gradient-to-br ${deptColors[primaryDepartment] || 'from-gray-500 to-gray-600'} blur-md opacity-0 group-hover:opacity-40 transition-opacity duration-500`} />
                          <div className={`relative w-13 h-13 rounded-full bg-gradient-to-br ${deptColors[primaryDepartment] || 'from-gray-500 to-gray-600'} flex items-center justify-center text-white font-bold text-sm shrink-0 shadow-lg transition-transform duration-300 group-hover:scale-105 ${
                            isMeCard ? 'ring-2 ring-[var(--theme-accent)] ring-offset-2 ring-offset-[var(--theme-bg-card)]' : ''
                          }`}>
                            {(contact.firstName?.[0] || '') + (contact.lastName?.[0] || '')}
                          </div>
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5">
                            <h3 className="font-bold truncate transition-colors group-hover:text-purple-300" style={{ color: 'var(--theme-text)' }}>
                              {contact.firstName} {contact.lastName}
                            </h3>
                            {contact.openToWork && (
                              <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-green-500/15 text-green-400 font-medium">מחפש עבודה</span>
                            )}
                          </div>
                          <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                            {contactRoles.map((role) => (
                              <span key={role} className="text-xs px-2.5 py-0.5 rounded-full transition-colors" style={{ background: 'var(--theme-bg-secondary)', color: 'var(--theme-text-secondary)' }}>
                                {role}
                              </span>
                            ))}
                            {contactDepartments.map((department) => (
                              <span key={department} className={`text-xs px-2.5 py-0.5 rounded-full ${deptBadgeColors[department] || 'bg-gray-700/50 text-gray-300'}`}>
                                {department}
                              </span>
                            ))}
                            {contact.workArea && (
                              <span className="text-xs px-2.5 py-0.5 rounded-full bg-white/5 text-white/80 border border-white/10">
                                {contact.workArea}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                      <div className="mt-4 flex items-center justify-between pt-3" style={{ borderTop: '1px solid var(--theme-border)' }}>
                        <div className="flex items-center gap-1.5">
                          <span className={`w-2 h-2 rounded-full ${
                            contact.availability === 'available' ? 'bg-green-400 shadow-sm shadow-green-400/50' :
                            contact.availability === 'unavailable' ? 'bg-red-400' :
                            contact.availability === 'maybe' ? 'bg-yellow-400' : 'bg-gray-500'
                          }`} />
                          <span className={`text-xs ${
                            contact.availability === 'available' ? 'text-green-400' :
                            contact.availability === 'unavailable' ? 'text-red-400' :
                            contact.availability === 'maybe' ? 'text-yellow-400' : 'text-gray-500'
                          }`}>
                            {contact.availability === 'available' ? 'פנוי' : contact.availability === 'unavailable' ? 'לא פנוי' : contact.availability === 'maybe' ? 'אולי פנוי' : 'לא צוין'}
                          </span>
                        </div>
                        {showContactInfo && contact.phone ? (
                          <a href={`tel:${contact.phone}`} onClick={(e) => e.stopPropagation()}
                            className="flex items-center gap-1 text-xs hover:text-green-400 transition-colors group/phone" style={{ color: 'var(--theme-text-secondary)' }}>
                            <PhoneCall className="w-3 h-3 group-hover/phone:animate-pulse" />
                            <span dir="ltr">{contact.phone}</span>
                          </a>
                        ) : (
                          <span className="text-xs font-medium" style={{ color: 'var(--theme-text-secondary)' }}>חסוי</span>
                        )}
                      </div>
                      {!showContactInfo && (
                        <a
                          href={getRemovalRequestMailto(contact)}
                          onClick={(e) => e.stopPropagation()}
                          className="mt-3 block text-center text-[11px] font-medium text-[var(--theme-text-secondary)] opacity-70 transition-opacity hover:opacity-100 hover:underline"
                        >
                          דיווח או בקשת הסרה לפרופיל זה
                        </a>
                      )}
                    </motion.div>
                  );
                })}
              </AnimatePresence>
            </motion.div>
          ) : (
            <motion.div
              key="list"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.25 }}
              className="rounded-2xl border overflow-hidden transition-colors"
              style={{ background: 'var(--theme-bg-card)', borderColor: 'var(--theme-border)' }}
            >
              <AnimatePresence>
                {sortedFiltered.map((contact, i) => {
                  const isMeRow = isCurrentUser(contact);
                  const showContactInfo = canShowContactInfo(contact);
                  const contactRoles = getContactRoles(contact);
                  const contactDepartments = getContactDepartments(contact);
                  const primaryDepartment = getPrimaryDepartment(contact);
                  return (
                    <motion.div
                      key={contact.id}
                      custom={i}
                      variants={cardVariants}
                      initial="hidden"
                      animate="visible"
                      exit="exit"
                      layout
                      onClick={() => setSelectedContact(contact)}
                      whileHover={{ backgroundColor: 'rgba(139,92,246,0.04)' }}
                      className={`flex items-center gap-4 px-5 py-3.5 cursor-pointer transition-colors ${isMeRow ? 'bg-[var(--theme-accent-glow)]' : ''}`}
                      style={i > 0 ? { borderTop: '1px solid var(--theme-border)' } : undefined}
                    >
                      {isMeRow && <Star className="w-3.5 h-3.5 text-[var(--theme-accent)] shrink-0" />}
                      <div className={`w-9 h-9 rounded-full bg-gradient-to-br ${deptColors[primaryDepartment] || 'from-gray-500 to-gray-600'} flex items-center justify-center text-white font-bold text-xs shrink-0 shadow-md`}>
                        {(contact.firstName?.[0] || '') + (contact.lastName?.[0] || '')}
                      </div>
                      <div className="flex-1 min-w-0 flex items-center gap-1.5">
                        <span className="font-medium text-sm" style={{ color: isMeRow ? 'var(--theme-accent)' : 'var(--theme-text)' }}>
                          {contact.firstName} {contact.lastName}
                          {isMeRow && <span className="text-[10px] mr-1 font-bold">(אני)</span>}
                        </span>
                        {contact.openToWork && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-green-500/15 text-green-400 font-medium">מחפש עבודה</span>
                        )}
                      </div>
                      <div className="hidden max-w-[280px] flex-wrap gap-1.5 sm:flex">
                        {contactRoles.slice(0, 3).map((role) => (
                          <span key={role} className="text-xs" style={{ color: 'var(--theme-text-secondary)' }}>
                            {role}
                          </span>
                        ))}
                      </div>
                      <div className="hidden max-w-[240px] flex-wrap gap-1.5 md:flex">
                        {contactDepartments.slice(0, 3).map((department) => (
                          <span key={department} className={`text-xs px-2 py-0.5 rounded-full ${deptBadgeColors[department] || 'bg-gray-700/50 text-gray-300'}`}>
                            {department}
                          </span>
                        ))}
                      </div>
                      {contact.workArea && (
                        <span className="text-xs px-2 py-0.5 rounded-full hidden md:block bg-white/5 text-white/80 border border-white/10">
                          {contact.workArea}
                        </span>
                      )}
                      <span className={`w-2 h-2 rounded-full ${contact.availability === 'available' ? 'bg-green-400' : contact.availability === 'unavailable' ? 'bg-red-400' : contact.availability === 'maybe' ? 'bg-yellow-400' : 'bg-gray-500'}`} />
                      {showContactInfo && contact.phone ? (
                        <a href={`tel:${contact.phone}`} onClick={(e) => e.stopPropagation()}
                          className="text-xs hover:text-green-400 hidden sm:block transition-colors" style={{ color: 'var(--theme-text-secondary)' }} dir="ltr">{contact.phone}</a>
                      ) : (
                        <span className="text-xs hidden sm:block" style={{ color: 'var(--theme-text-secondary)' }}>חסוי</span>
                      )}
                      {!showContactInfo && (
                        <a
                          href={getRemovalRequestMailto(contact)}
                          onClick={(e) => e.stopPropagation()}
                          className="hidden text-[11px] font-medium text-[var(--theme-text-secondary)] opacity-70 transition-opacity hover:opacity-100 hover:underline lg:block"
                        >
                          דיווח או בקשת הסרה לפרופיל זה
                        </a>
                      )}
                    </motion.div>
                  );
                })}
              </AnimatePresence>
            </motion.div>
          )}
        </AnimatePresence>

        {filtered.length === 0 && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4 }}
            className="text-center py-16"
          >
            <div className="w-20 h-20 rounded-full mx-auto mb-4 flex items-center justify-center" style={{ background: 'var(--theme-bg-secondary)' }}>
              <Search className="w-8 h-8" style={{ color: 'var(--theme-text-secondary)', opacity: 0.5 }} />
            </div>
            <h3 className="font-bold text-lg mb-2" style={{ color: 'var(--theme-text)' }}>לא נמצאו אנשי מקצוע</h3>
            <p className="text-sm" style={{ color: 'var(--theme-text-secondary)', opacity: 0.7 }}>נסו לשנות את הפילטרים או להתחיל מחדש</p>
            {hasActiveFilters && (
              <button
                type="button"
                onClick={resetAllFilters}
                className="mt-5 rounded-xl border px-4 py-2 text-sm font-bold transition hover:bg-[var(--theme-accent-glow)]"
                style={{ borderColor: 'var(--theme-border)', color: 'var(--theme-text)' }}
              >
                נקה את כל הפילטרים
              </button>
            )}
          </motion.div>
        )}
      </section>

      <AnimatePresence>
        {activeDrawer && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-50 flex items-end bg-black/70 backdrop-blur-sm"
            onClick={closeFilterDrawer}
            role="presentation"
          >
            <motion.div
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
              className="w-full overflow-hidden rounded-t-3xl border-t shadow-2xl"
              style={{
                maxHeight: '75vh',
                background: 'linear-gradient(145deg, color-mix(in srgb, var(--theme-bg-card) 94%, white 6%), var(--theme-bg))',
                borderColor: 'var(--theme-border)',
                boxShadow: '0 -24px 60px rgba(0,0,0,0.45)',
              }}
              onClick={(e) => e.stopPropagation()}
              role="dialog"
              aria-modal="true"
              aria-label={activeDrawer === 'departments' ? 'חיפוש לפי מחלקה' : 'חיפוש לפי תפקיד'}
              dir="rtl"
            >
              <div className="sticky top-0 z-10 border-b px-4 pb-3 pt-4 sm:px-6" style={{ background: 'var(--theme-bg-card)', borderColor: 'var(--theme-border)' }}>
                <div className="mx-auto h-1.5 w-12 rounded-full bg-white/20" />
                <div className="mt-4 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[var(--theme-accent-glow)]">
                      {activeDrawer === 'departments' ? (
                        <Building2 className="h-4 w-4 text-purple-300" />
                      ) : (
                        <Wrench className="h-4 w-4 text-cyan-300" />
                      )}
                    </div>
                    <div>
                      <h2 className="text-base font-black" style={{ color: 'var(--theme-text)' }}>
                        {activeDrawer === 'departments' ? 'חיפוש לפי מחלקה' : 'חיפוש לפי תפקיד'}
                      </h2>
                      <p className="text-xs" style={{ color: 'var(--theme-text-secondary)' }}>
                        בחירה אחת תסנן ותסגור את הרשימה
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={closeFilterDrawer}
                    className="rounded-full p-2 transition-colors hover:bg-white/10"
                    style={{ color: 'var(--theme-text-secondary)' }}
                    aria-label="סגור"
                  >
                    <X className="h-5 w-5" />
                  </button>
                </div>

                <div className="relative mt-4">
                  <Search className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2" style={{ color: 'var(--theme-text-secondary)' }} />
                  <input
                    type="text"
                    value={drawerSearch}
                    onChange={(e) => setDrawerSearch(e.target.value)}
                    placeholder={activeDrawer === 'departments' ? 'חיפוש מחלקה...' : 'חיפוש תפקיד...'}
                    className="w-full rounded-xl border py-2.5 pl-10 pr-10 text-sm outline-none transition focus:border-purple-500/60 focus:ring-2 focus:ring-purple-500/20"
                    style={{ background: 'var(--theme-bg)', borderColor: 'var(--theme-border)', color: 'var(--theme-text)' }}
                    dir="rtl"
                    autoFocus={false}
                  />
                  {drawerSearch && (
                    <button
                      type="button"
                      onClick={() => setDrawerSearch('')}
                      className="absolute left-3 top-1/2 -translate-y-1/2 rounded-full p-1 transition-colors hover:bg-white/10"
                      style={{ color: 'var(--theme-text-secondary)' }}
                      aria-label="נקה חיפוש"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
              </div>

              <div className="max-h-[calc(75vh-150px)] overflow-y-auto px-4 py-3 sm:px-6">
                {activeDrawer === 'departments' ? (
                  visibleDepartmentOptions.length > 0 ? (
                    <div className="space-y-2">
                      {visibleDepartmentOptions.map((dept) => {
                        const selected = selectedDepartment === dept.label;
                        return (
                          <button
                            key={dept.id}
                            type="button"
                            onClick={() => selectDepartmentFilter(dept.label)}
                            className={`flex w-full items-center gap-3 rounded-xl border px-3 py-3 text-right transition ${
                              selected ? 'border-purple-400/60 bg-purple-500/15' : 'hover:border-purple-400/40 hover:bg-white/[0.03]'
                            }`}
                            style={selected ? undefined : { borderColor: 'var(--theme-border)', background: 'color-mix(in srgb, var(--theme-bg-card) 78%, transparent)' }}
                          >
                            <Building2 className="h-4 w-4 shrink-0 text-purple-300" />
                            <span className="min-w-0 flex-1 truncate text-sm font-bold" style={{ color: 'var(--theme-text)' }}>{`${dept.label} (${deptCounts[dept.label] || 0})`}</span>
                            {selected && <Check className="h-4 w-4 shrink-0 text-purple-300" />}
                          </button>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="py-10 text-center text-sm" style={{ color: 'var(--theme-text-secondary)' }}>לא נמצאו תוצאות</div>
                  )
                ) : visibleRoleOptions.length > 0 ? (
                  <div className="space-y-2">
                    {visibleRoleOptions.map(([role, count]) => {
                      const selected = selectedRole === role;
                      return (
                        <button
                          key={role}
                          type="button"
                          onClick={() => selectRoleFilter(role)}
                          className={`flex w-full items-center gap-3 rounded-xl border px-3 py-3 text-right transition ${
                            selected ? 'border-cyan-400/60 bg-cyan-500/15' : 'hover:border-cyan-400/40 hover:bg-white/[0.03]'
                          }`}
                          style={selected ? undefined : { borderColor: 'var(--theme-border)', background: 'color-mix(in srgb, var(--theme-bg-card) 78%, transparent)' }}
                        >
                          <Wrench className="h-4 w-4 shrink-0 text-cyan-300" />
                          <span className="min-w-0 flex-1 truncate text-sm font-bold" style={{ color: 'var(--theme-text)' }}>{`${role} (${count})`}</span>
                          {selected && <Check className="h-4 w-4 shrink-0 text-cyan-300" />}
                        </button>
                      );
                    })}
                  </div>
                ) : (
                  <div className="py-10 text-center text-sm" style={{ color: 'var(--theme-text-secondary)' }}>לא נמצאו תוצאות</div>
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>


      {/* Contact Detail Modal - Glass Morphism Dark */}
      <AnimatePresence>
        {selectedContact && (
          <motion.div
            variants={modalOverlayVariants}
            initial="hidden"
            animate="visible"
            exit="exit"
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-md"
            onClick={() => setSelectedContact(null)}
          >
            <motion.div
              variants={modalContentVariants}
              initial="hidden"
              animate="visible"
              exit="exit"
              className="relative rounded-3xl max-w-md w-full overflow-hidden"
              onClick={(e) => e.stopPropagation()}
              style={{
                background: 'linear-gradient(145deg, color-mix(in srgb, var(--theme-bg) 90%, rgba(139,92,246,0.1)), var(--theme-bg))',
                border: '1px solid color-mix(in srgb, var(--theme-border) 60%, rgba(139,92,246,0.2))',
                boxShadow: '0 25px 60px rgba(0,0,0,0.5), 0 0 40px rgba(139,92,246,0.08)',
              }}
            >
              {/* Top gradient bar */}
              <div className={`h-1.5 w-full bg-gradient-to-l ${deptColors[getPrimaryDepartment(selectedContact)] || 'from-gray-500 to-gray-600'}`} />

              {/* Close button */}
              <motion.button
                whileHover={{ scale: 1.1, rotate: 90 }}
                whileTap={{ scale: 0.9 }}
                transition={{ duration: 0.2 }}
                onClick={() => setSelectedContact(null)}
                className="absolute top-4 left-4 p-2 rounded-full transition-colors z-10 hover:bg-white/10"
                style={{ color: 'var(--theme-text-secondary)' }}
              >
                <X className="w-5 h-5" />
              </motion.button>

              <div className="p-8 pt-6">
                {/* Avatar section */}
                <div className="text-center mb-6">
                  <motion.div
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    transition={{ type: 'spring', stiffness: 200, damping: 15, delay: 0.1 }}
                    className="relative inline-block"
                  >
                    {/* Avatar glow */}
                    <div className={`absolute inset-0 rounded-full bg-gradient-to-br ${deptColors[getPrimaryDepartment(selectedContact)] || 'from-gray-500 to-gray-600'} blur-xl opacity-30`} />
                    <div className={`relative w-24 h-24 rounded-full bg-gradient-to-br ${deptColors[getPrimaryDepartment(selectedContact)] || 'from-gray-500 to-gray-600'} flex items-center justify-center text-white font-black text-3xl shadow-2xl ${
                      isCurrentUser(selectedContact) ? 'ring-3 ring-[var(--theme-accent)] ring-offset-4 ring-offset-[var(--theme-bg)]' : ''
                    }`}>
                      {(selectedContact.firstName?.[0] || '') + (selectedContact.lastName?.[0] || '')}
                    </div>
                  </motion.div>

                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.2, duration: 0.3 }}
                  >
                    <h2 className="text-2xl font-black mt-4 bg-gradient-to-l from-white via-purple-100 to-white bg-clip-text text-transparent">
                      {selectedContact.firstName} {selectedContact.lastName}
                    </h2>
                    {isCurrentUser(selectedContact) && (
                      <motion.span
                        initial={{ scale: 0 }}
                        animate={{ scale: 1 }}
                        transition={{ type: 'spring', stiffness: 300, delay: 0.3 }}
                        className="inline-flex items-center gap-1 text-xs text-[var(--theme-accent)] font-bold mt-1"
                      >
                        <Star className="w-3 h-3" /> זה אני
                      </motion.span>
                    )}
                  </motion.div>

                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 0.25, duration: 0.3 }}
                    className="flex items-center justify-center gap-2 mt-3"
                  >
                    {getContactRoles(selectedContact).map((role) => (
                      <span key={role} className="text-sm px-3 py-1.5 rounded-full flex items-center gap-1.5 backdrop-blur-sm" style={{ background: 'var(--theme-bg-secondary)', color: 'var(--theme-text-secondary)' }}>
                        <Briefcase className="w-3.5 h-3.5" />{role}
                      </span>
                    ))}
                    {getContactDepartments(selectedContact).map((department) => (
                      <span key={department} className={`text-sm px-3 py-1.5 rounded-full ${deptBadgeColors[department] || 'bg-gray-700/50 text-gray-300'}`}>
                        {department}
                      </span>
                    ))}
                    {selectedContact.workArea && (
                      <span className="text-sm px-3 py-1.5 rounded-full bg-white/5 text-white/80 border border-white/10">
                        {selectedContact.workArea}
                      </span>
                    )}
                  </motion.div>

                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 0.3, duration: 0.3 }}
                    className="flex items-center justify-center gap-2 mt-3"
                  >
                    <span className={`w-2.5 h-2.5 rounded-full ${
                      selectedContact.availability === 'available' ? 'bg-green-400 shadow-sm shadow-green-400/50' :
                      selectedContact.availability === 'unavailable' ? 'bg-red-400' :
                      selectedContact.availability === 'maybe' ? 'bg-yellow-400' : 'bg-gray-500'
                    }`} />
                    <span className={`text-sm font-medium ${
                      selectedContact.availability === 'available' ? 'text-green-400' :
                      selectedContact.availability === 'unavailable' ? 'text-red-400' :
                      selectedContact.availability === 'maybe' ? 'text-yellow-400' : 'text-gray-400'
                    }`}>
                      {selectedContact.availability === 'available' ? 'פנוי לעבודה' : selectedContact.availability === 'unavailable' ? 'לא פנוי' : selectedContact.availability === 'maybe' ? 'אולי פנוי' : 'סטטוס לא צוין'}
                    </span>
                  </motion.div>
                </div>

                {/* Skills */}
                {selectedContact.skills && selectedContact.skills.length > 0 && (
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.35, duration: 0.3 }}
                    className="mb-6"
                  >
                    <h4 className="text-xs font-medium mb-2.5 flex items-center gap-1.5" style={{ color: 'var(--theme-text-secondary)', opacity: 0.7 }}>
                      <Star className="w-3 h-3" /> מיומנויות
                    </h4>
                    <div className="flex flex-wrap gap-2">
                      {selectedContact.skills.map((skill: string, i: number) => (
                        <motion.span
                          key={skill}
                          initial={{ opacity: 0, scale: 0.8 }}
                          animate={{ opacity: 1, scale: 1 }}
                          transition={{ delay: 0.35 + i * 0.05, duration: 0.2 }}
                          className="text-xs px-3 py-1.5 rounded-full bg-purple-500/10 text-purple-300 border border-purple-500/20"
                        >
                          {skill}
                        </motion.span>
                      ))}
                    </div>
                  </motion.div>
                )}

                {/* City & Experience */}
                {(selectedContact.city || selectedContact.yearsOfExperience) && (
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.37, duration: 0.3 }}
                    className="mb-6 flex flex-wrap gap-3"
                  >
                    {selectedContact.city && (
                      <span className="text-xs px-3 py-1.5 rounded-full flex items-center gap-1.5" style={{ background: 'var(--theme-bg-secondary)', color: 'var(--theme-text-secondary)' }}>
                        <MapPin className="w-3 h-3" /> {selectedContact.city}
                      </span>
                    )}
                    {selectedContact.yearsOfExperience && (
                      <span className="text-xs px-3 py-1.5 rounded-full flex items-center gap-1.5" style={{ background: 'var(--theme-bg-secondary)', color: 'var(--theme-text-secondary)' }}>
                        <Clock className="w-3 h-3" /> {selectedContact.yearsOfExperience} שנות ניסיון
                      </span>
                    )}
                  </motion.div>
                )}

                {/* Credits / Productions */}
                {selectedContact.credits && selectedContact.credits.length > 0 && (
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.39, duration: 0.3 }}
                    className="mb-6"
                  >
                    <h4 className="text-xs font-medium mb-2.5 flex items-center gap-1.5" style={{ color: 'var(--theme-text-secondary)', opacity: 0.7 }}>
                      <Film className="w-3 h-3" /> קרדיטים / הפקות
                    </h4>
                    <div className="flex flex-wrap gap-2">
                      {selectedContact.credits.map((credit: string, i: number) => (
                        <motion.span
                          key={credit}
                          initial={{ opacity: 0, scale: 0.8 }}
                          animate={{ opacity: 1, scale: 1 }}
                          transition={{ delay: 0.39 + i * 0.05, duration: 0.2 }}
                          className="text-xs px-3 py-1.5 rounded-full bg-blue-500/10 text-blue-300 border border-blue-500/20"
                        >
                          {credit}
                        </motion.span>
                      ))}
                    </div>
                  </motion.div>
                )}

                {/* Gear / Equipment */}
                {selectedContact.gear && selectedContact.gear.length > 0 && (
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.41, duration: 0.3 }}
                    className="mb-6"
                  >
                    <h4 className="text-xs font-medium mb-2.5 flex items-center gap-1.5" style={{ color: 'var(--theme-text-secondary)', opacity: 0.7 }}>
                      <Wrench className="w-3 h-3" /> ציוד
                    </h4>
                    <div className="flex flex-wrap gap-2">
                      {selectedContact.gear.map((item: string, i: number) => (
                        <motion.span
                          key={item}
                          initial={{ opacity: 0, scale: 0.8 }}
                          animate={{ opacity: 1, scale: 1 }}
                          transition={{ delay: 0.41 + i * 0.05, duration: 0.2 }}
                          className="text-xs px-3 py-1.5 rounded-full bg-orange-500/10 text-orange-300 border border-orange-500/20"
                        >
                          {item}
                        </motion.span>
                      ))}
                    </div>
                  </motion.div>
                )}

                {/* Contact actions */}
                {!canShowContactInfo(selectedContact) && (
                  <div className="space-y-2">
                    <motion.div
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.4, duration: 0.3 }}
                      className="rounded-xl border px-4 py-3 text-center text-sm font-medium"
                      style={{ borderColor: 'var(--theme-border)', color: 'var(--theme-text-secondary)', background: 'var(--theme-bg-secondary)' }}
                    >
                      חסוי
                    </motion.div>
                    <a
                      href={getRemovalRequestMailto(selectedContact)}
                      className="block text-center text-xs font-medium text-[var(--theme-text-secondary)] opacity-75 transition-opacity hover:opacity-100 hover:underline"
                    >
                      דיווח או בקשת הסרה לפרופיל זה
                    </a>
                  </div>
                )}

                {canShowContactInfo(selectedContact) && selectedContact.phone && (
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.4, duration: 0.3 }}
                    className="space-y-2.5"
                  >
                    <motion.a
                      whileHover={{ scale: 1.02, y: -1 }}
                      whileTap={{ scale: 0.98 }}
                      href={`tel:${selectedContact.phone}`}
                      className="flex items-center justify-center gap-2.5 w-full py-3.5 rounded-xl bg-gradient-to-l from-green-600 to-emerald-600 text-white font-bold shadow-lg shadow-green-500/20 hover:shadow-xl hover:shadow-green-500/30 transition-shadow"
                    >
                      <Phone className="w-4.5 h-4.5" />
                      <span>התקשר</span>
                      <span dir="ltr" className="opacity-80 text-sm">{selectedContact.phone}</span>
                    </motion.a>
                    <motion.a
                      whileHover={{ scale: 1.02, y: -1 }}
                      whileTap={{ scale: 0.98 }}
                      href={formatWhatsApp(selectedContact.phone)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center justify-center gap-2.5 w-full py-3.5 rounded-xl bg-gradient-to-l from-green-700 to-green-800 text-white font-bold shadow-lg shadow-green-800/20 hover:shadow-xl hover:shadow-green-800/30 transition-shadow"
                    >
                      <MessageCircle className="w-4.5 h-4.5" />
                      שלח הודעת WhatsApp
                    </motion.a>
                  </motion.div>
                )}

                {canShowContactInfo(selectedContact) && selectedContact.email && (
                  <motion.a
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 0.45, duration: 0.3 }}
                    whileHover={{ scale: 1.02, y: -1 }}
                    whileTap={{ scale: 0.98 }}
                    href={`mailto:${selectedContact.email}`}
                    className="flex items-center justify-center gap-2.5 w-full py-3.5 rounded-xl mt-2.5 border font-bold transition-all hover:bg-purple-500/10"
                    style={{ borderColor: 'var(--theme-border)', color: 'var(--theme-text-secondary)' }}
                  >
                    <Mail className="w-4 h-4" />
                    שלח אימייל
                  </motion.a>
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
