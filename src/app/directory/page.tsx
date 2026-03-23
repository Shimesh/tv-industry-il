'use client';

import { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuth } from '@/contexts/AuthContext';
import { departments, type Contact } from '@/data/contacts';
import { useContacts } from '@/hooks/useContacts';
import { Search, Phone, X, Briefcase, Users, LayoutGrid, List, MessageCircle, Star, Mail, PhoneCall } from 'lucide-react';
import { DirectorySkeleton } from '@/components/SkeletonLoader';

const deptColors: Record<string, string> = {
  'צילום': 'from-blue-500 to-blue-600',
  'טכני': 'from-emerald-500 to-emerald-600',
  'הפקה': 'from-purple-500 to-purple-600',
  'סאונד': 'from-orange-500 to-orange-600',
  'תאורה': 'from-yellow-500 to-amber-600',
};

const deptBadgeColors: Record<string, string> = {
  'צילום': 'bg-blue-500/15 text-blue-300',
  'טכני': 'bg-emerald-500/15 text-emerald-300',
  'הפקה': 'bg-purple-500/15 text-purple-300',
  'סאונד': 'bg-orange-500/15 text-orange-300',
  'תאורה': 'bg-yellow-500/15 text-yellow-300',
};

const deptGlowColors: Record<string, string> = {
  'צילום': 'shadow-blue-500/20',
  'טכני': 'shadow-emerald-500/20',
  'הפקה': 'shadow-purple-500/20',
  'סאונד': 'shadow-orange-500/20',
  'תאורה': 'shadow-yellow-500/20',
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

const filterPillVariants = {
  inactive: { scale: 1 },
  active: { scale: 1.05, transition: { type: 'spring' as const, stiffness: 400, damping: 20 } },
};

export default function DirectoryPage() {
  const { profile, loading: authLoading } = useAuth();
  const { contacts: contactsList, loading: contactsLoading } = useContacts();
  const [search, setSearch] = useState('');
  const [deptFilter, setDeptFilter] = useState('');
  const [availFilter, setAvailFilter] = useState('');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [selectedContact, setSelectedContact] = useState<Contact | null>(null);

  // Check if a contact matches the logged-in user
  const isCurrentUser = (contact: Contact): boolean => {
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
  };

  const filtered = useMemo(() => {
    return contactsList.filter(c => {
      const matchSearch = !search || `${c.firstName} ${c.lastName} ${c.role} ${c.department}`.includes(search);
      const matchDept = !deptFilter || c.department === deptFilter;
      const matchAvail = !availFilter ||
        (availFilter === 'available' && c.availability === 'available') ||
        (availFilter === 'unavailable' && c.availability === 'unavailable');
      return matchSearch && matchDept && matchAvail;
    });
  }, [search, deptFilter, availFilter, contactsList]);

  // Sort: current user first
  const sortedFiltered = useMemo(() => {
    return [...filtered].sort((a, b) => {
      const aIsMe = isCurrentUser(a);
      const bIsMe = isCurrentUser(b);
      if (aIsMe && !bIsMe) return -1;
      if (!aIsMe && bIsMe) return 1;
      return 0;
    });
  }, [filtered, profile]);

  const availableCount = contactsList.filter(c => c.availability === 'available').length;

  const formatWhatsApp = (phone?: string) => {
    if (!phone) return '';
    const cleaned = phone.replace(/[-\s]/g, '');
    return `https://wa.me/972${cleaned.startsWith('0') ? cleaned.slice(1) : cleaned}`;
  };

  const deptCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    contactsList.forEach(c => {
      counts[c.department] = (counts[c.department] || 0) + 1;
    });
    return counts;
  }, [contactsList]);

  if (authLoading || contactsLoading) return <DirectorySkeleton />;

  return (
    <div className="min-h-screen">
      {/* Header */}
      <section className="relative overflow-hidden border-b" style={{ borderColor: 'var(--theme-border)' }}>
        <div className="absolute inset-0 bg-gradient-to-bl from-purple-900/20 via-transparent to-blue-900/10" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,_rgba(139,92,246,0.08),transparent_60%)]" />
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="relative max-w-7xl mx-auto px-4 sm:px-6 py-10"
        >
          <div className="flex items-center gap-4 mb-2">
            <motion.div
              initial={{ scale: 0, rotate: -180 }}
              animate={{ scale: 1, rotate: 0 }}
              transition={{ type: 'spring', stiffness: 200, damping: 15, delay: 0.1 }}
              className="w-14 h-14 rounded-2xl bg-gradient-to-br from-purple-500 via-violet-500 to-blue-600 flex items-center justify-center shadow-lg shadow-purple-500/25"
            >
              <Users className="w-7 h-7 text-white" />
            </motion.div>
            <div>
              <h1 className="text-3xl sm:text-4xl font-black bg-gradient-to-l from-purple-400 via-violet-300 to-blue-400 bg-clip-text text-transparent">
                אלפון מקצועי
              </h1>
              <p className="text-sm mt-1" style={{ color: 'var(--theme-text-secondary)' }}>
                מאגר אנשי המקצוע של תעשיית הטלוויזיה הישראלית
              </p>
            </div>
          </div>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.3, duration: 0.4 }}
            className="flex items-center gap-4 mt-4 text-sm"
            style={{ color: 'var(--theme-text-secondary)' }}
          >
            <span className="flex items-center gap-1.5">
              <Users className="w-3.5 h-3.5" />
              {contactsList.length} אנשי מקצוע
            </span>
            <span style={{ color: 'var(--theme-text-secondary)', opacity: 0.3 }}>|</span>
            <span className="flex items-center gap-1.5 text-green-400">
              <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
              {availableCount} פנויים
            </span>
          </motion.div>
        </motion.div>
      </section>

      {/* Search & Filters */}
      <section className="sticky top-16 z-30 backdrop-blur-xl border-b" style={{ background: 'color-mix(in srgb, var(--theme-bg) 85%, transparent)', borderColor: 'var(--theme-border)' }}>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-4">
          <div className="flex flex-col sm:flex-row gap-3">
            {/* Search - glass morphism */}
            <div className="relative flex-1 group">
              <Search className="absolute right-3.5 top-1/2 -translate-y-1/2 w-4 h-4 transition-colors group-focus-within:text-purple-400" style={{ color: 'var(--theme-text-secondary)', opacity: 0.7 }} />
              <input
                type="text"
                placeholder="חיפוש לפי שם, תפקיד..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full pl-4 pr-11 py-3 rounded-xl border text-sm transition-all duration-300 focus:outline-none focus:border-purple-500/60 focus:ring-2 focus:ring-purple-500/20 focus:shadow-lg focus:shadow-purple-500/10 backdrop-blur-sm placeholder-gray-500"
                style={{ background: 'color-mix(in srgb, var(--theme-bg-secondary) 70%, transparent)', borderColor: 'var(--theme-border)', color: 'var(--theme-text)' }}
              />
            </div>

            {/* Department Filter Pills */}
            <div className="flex gap-2 overflow-x-auto pb-1 sm:pb-0 scrollbar-hide">
              <motion.button
                variants={filterPillVariants}
                animate={!deptFilter ? 'active' : 'inactive'}
                whileTap={{ scale: 0.95 }}
                onClick={() => setDeptFilter('')}
                className={`px-4 py-2.5 rounded-xl border text-sm whitespace-nowrap transition-all duration-300 ${
                  !deptFilter
                    ? 'border-purple-500/50 bg-purple-500/15 text-purple-300 shadow-sm shadow-purple-500/10'
                    : 'hover:border-purple-500/30'
                }`}
                style={deptFilter ? { background: 'var(--theme-bg-secondary)', borderColor: 'var(--theme-border)', color: 'var(--theme-text-secondary)' } : undefined}
              >
                הכל
              </motion.button>
              {departments.map(d => {
                const isActive = deptFilter === d.label;
                return (
                  <motion.button
                    key={d.id}
                    variants={filterPillVariants}
                    animate={isActive ? 'active' : 'inactive'}
                    whileTap={{ scale: 0.95 }}
                    onClick={() => setDeptFilter(isActive ? '' : d.label)}
                    className={`relative px-4 py-2.5 rounded-xl border text-sm whitespace-nowrap transition-all duration-300 ${
                      isActive
                        ? 'border-purple-500/50 bg-purple-500/15 text-purple-300 shadow-sm shadow-purple-500/10'
                        : 'hover:border-purple-500/30'
                    }`}
                    style={!isActive ? { background: 'var(--theme-bg-secondary)', borderColor: 'var(--theme-border)', color: 'var(--theme-text-secondary)' } : undefined}
                  >
                    {d.icon} {d.label}
                    {/* Floating count badge */}
                    <span className={`absolute -top-2 -left-1 min-w-[18px] h-[18px] flex items-center justify-center rounded-full text-[10px] font-bold px-1 ${
                      isActive ? 'bg-purple-500 text-white' : 'bg-gray-600/80 text-gray-300'
                    }`}>
                      {deptCounts[d.label] || 0}
                    </span>
                  </motion.button>
                );
              })}
            </div>

            {/* Availability Filter */}
            <select
              value={availFilter}
              onChange={(e) => setAvailFilter(e.target.value)}
              className="px-4 py-2.5 rounded-xl border text-sm focus:outline-none focus:border-purple-500/50 focus:ring-2 focus:ring-purple-500/20 appearance-none cursor-pointer transition-all duration-300"
              style={{ background: 'var(--theme-bg-secondary)', borderColor: 'var(--theme-border)', color: 'var(--theme-text)' }}
            >
              <option value="">כל הסטטוסים</option>
              <option value="available">פנויים</option>
              <option value="unavailable">לא פנויים</option>
            </select>

            {/* View Toggle */}
            <div className="flex rounded-xl border overflow-hidden" style={{ borderColor: 'var(--theme-border)' }}>
              <motion.button
                whileTap={{ scale: 0.9 }}
                onClick={() => setViewMode('grid')}
                className={`p-2.5 transition-all duration-300 ${viewMode === 'grid' ? 'bg-purple-500/20 text-purple-400 shadow-inner' : ''}`}
                style={viewMode !== 'grid' ? { background: 'var(--theme-bg-secondary)', color: 'var(--theme-text-secondary)' } : undefined}
              >
                <LayoutGrid className="w-4 h-4" />
              </motion.button>
              <motion.button
                whileTap={{ scale: 0.9 }}
                onClick={() => setViewMode('list')}
                className={`p-2.5 transition-all duration-300 ${viewMode === 'list' ? 'bg-purple-500/20 text-purple-400 shadow-inner' : ''}`}
                style={viewMode !== 'list' ? { background: 'var(--theme-bg-secondary)', color: 'var(--theme-text-secondary)' } : undefined}
              >
                <List className="w-4 h-4" />
              </motion.button>
            </div>
          </div>

          {/* Active Filters & Count */}
          <div className="flex items-center justify-between mt-3">
            <motion.span
              key={filtered.length}
              initial={{ opacity: 0, y: -5 }}
              animate={{ opacity: 1, y: 0 }}
              className="text-sm"
              style={{ color: 'var(--theme-text-secondary)' }}
            >
              {filtered.length} תוצאות
            </motion.span>
            {(search || deptFilter || availFilter) && (
              <motion.button
                initial={{ opacity: 0, x: 10 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 10 }}
                onClick={() => { setSearch(''); setDeptFilter(''); setAvailFilter(''); }}
                className="text-xs text-purple-400 hover:text-purple-300 flex items-center gap-1 transition-colors"
              >
                <X className="w-3 h-3" /> נקה פילטרים
              </motion.button>
            )}
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
                      } hover:shadow-xl ${deptGlowColors[contact.department] || 'hover:shadow-gray-500/10'}`}
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
                          <div className={`absolute inset-0 rounded-full bg-gradient-to-br ${deptColors[contact.department] || 'from-gray-500 to-gray-600'} blur-md opacity-0 group-hover:opacity-40 transition-opacity duration-500`} />
                          <div className={`relative w-13 h-13 rounded-full bg-gradient-to-br ${deptColors[contact.department] || 'from-gray-500 to-gray-600'} flex items-center justify-center text-white font-bold text-sm shrink-0 shadow-lg transition-transform duration-300 group-hover:scale-105 ${
                            isMeCard ? 'ring-2 ring-[var(--theme-accent)] ring-offset-2 ring-offset-[var(--theme-bg-card)]' : ''
                          }`}>
                            {contact.firstName[0]}{contact.lastName[0]}
                          </div>
                        </div>
                        <div className="flex-1 min-w-0">
                          <h3 className="font-bold truncate transition-colors group-hover:text-purple-300" style={{ color: 'var(--theme-text)' }}>
                            {contact.firstName} {contact.lastName}
                          </h3>
                          <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                            <span className="text-xs px-2.5 py-0.5 rounded-full transition-colors" style={{ background: 'var(--theme-bg-secondary)', color: 'var(--theme-text-secondary)' }}>
                              {contact.role}
                            </span>
                            <span className={`text-xs px-2.5 py-0.5 rounded-full ${deptBadgeColors[contact.department] || 'bg-gray-700/50 text-gray-300'}`}>
                              {contact.department}
                            </span>
                          </div>
                        </div>
                      </div>
                      <div className="mt-4 flex items-center justify-between pt-3" style={{ borderTop: '1px solid var(--theme-border)' }}>
                        <div className="flex items-center gap-1.5">
                          <span className={`w-2 h-2 rounded-full ${
                            contact.availability === 'available' ? 'bg-green-400 shadow-sm shadow-green-400/50' :
                            contact.availability === 'unavailable' ? 'bg-red-400' : 'bg-gray-500'
                          }`} />
                          <span className={`text-xs ${
                            contact.availability === 'available' ? 'text-green-400' :
                            contact.availability === 'unavailable' ? 'text-red-400' : 'text-gray-500'
                          }`}>
                            {contact.availability === 'available' ? 'פנוי' : contact.availability === 'unavailable' ? 'לא פנוי' : 'לא צוין'}
                          </span>
                        </div>
                        {contact.phone && (
                          <a href={`tel:${contact.phone}`} onClick={(e) => e.stopPropagation()}
                            className="flex items-center gap-1 text-xs hover:text-green-400 transition-colors group/phone" style={{ color: 'var(--theme-text-secondary)' }}>
                            <PhoneCall className="w-3 h-3 group-hover/phone:animate-pulse" />
                            <span dir="ltr">{contact.phone}</span>
                          </a>
                        )}
                      </div>
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
                      <div className={`w-9 h-9 rounded-full bg-gradient-to-br ${deptColors[contact.department] || 'from-gray-500 to-gray-600'} flex items-center justify-center text-white font-bold text-xs shrink-0 shadow-md`}>
                        {contact.firstName[0]}{contact.lastName[0]}
                      </div>
                      <div className="flex-1 min-w-0">
                        <span className="font-medium text-sm" style={{ color: isMeRow ? 'var(--theme-accent)' : 'var(--theme-text)' }}>
                          {contact.firstName} {contact.lastName}
                          {isMeRow && <span className="text-[10px] mr-1 font-bold">(אני)</span>}
                        </span>
                      </div>
                      <span className="text-xs hidden sm:block" style={{ color: 'var(--theme-text-secondary)' }}>{contact.role}</span>
                      <span className={`text-xs px-2 py-0.5 rounded-full hidden md:block ${deptBadgeColors[contact.department] || 'bg-gray-700/50 text-gray-300'}`}>
                        {contact.department}
                      </span>
                      <span className={`w-2 h-2 rounded-full ${contact.availability === 'available' ? 'bg-green-400' : contact.availability === 'unavailable' ? 'bg-red-400' : 'bg-gray-500'}`} />
                      {contact.phone && (
                        <a href={`tel:${contact.phone}`} onClick={(e) => e.stopPropagation()}
                          className="text-xs hover:text-green-400 hidden sm:block transition-colors" style={{ color: 'var(--theme-text-secondary)' }} dir="ltr">{contact.phone}</a>
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
            <h3 className="font-bold text-lg mb-2" style={{ color: 'var(--theme-text-secondary)' }}>לא נמצאו תוצאות</h3>
            <p className="text-sm" style={{ color: 'var(--theme-text-secondary)', opacity: 0.7 }}>נסו לשנות את הפילטרים או לחפש מחדש</p>
          </motion.div>
        )}
      </section>

      {/* Department Summary */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 pb-12">
        <motion.h3
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
          className="text-lg font-bold mb-4 transition-colors"
          style={{ color: 'var(--theme-text)' }}
        >
          לפי מחלקה
        </motion.h3>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
          {departments.map((dept, i) => {
            const count = deptCounts[dept.label] || 0;
            const isActive = deptFilter === dept.label;
            return (
              <motion.button
                key={dept.id}
                initial={{ opacity: 0, y: 15 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.05, duration: 0.3 }}
                whileHover={{ y: -3, transition: { duration: 0.2 } }}
                whileTap={{ scale: 0.97 }}
                onClick={() => setDeptFilter(isActive ? '' : dept.label)}
                className={`relative p-5 rounded-2xl border text-center transition-all duration-300 overflow-hidden ${
                  isActive
                    ? 'border-purple-500/50 shadow-lg shadow-purple-500/10'
                    : 'hover:shadow-md'
                } ${deptGlowColors[dept.label] || ''}`}
                style={!isActive ? { borderColor: 'var(--theme-border)', background: 'var(--theme-bg-card)' } : undefined}
              >
                {/* Gradient background for active/hover */}
                <div className={`absolute inset-0 bg-gradient-to-br ${deptColors[dept.label] || 'from-gray-500 to-gray-600'} transition-opacity duration-300 ${
                  isActive ? 'opacity-15' : 'opacity-0'
                }`} />
                <div className="relative">
                  <span className="text-3xl block">{dept.icon}</span>
                  <div className="font-black text-2xl mt-2 transition-colors" style={{ color: 'var(--theme-text)' }}>{count}</div>
                  <div className="text-xs mt-0.5 transition-colors" style={{ color: 'var(--theme-text-secondary)' }}>{dept.label}</div>
                </div>
              </motion.button>
            );
          })}
        </div>
      </section>

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
              <div className={`h-1.5 w-full bg-gradient-to-l ${deptColors[selectedContact.department] || 'from-gray-500 to-gray-600'}`} />

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
                    <div className={`absolute inset-0 rounded-full bg-gradient-to-br ${deptColors[selectedContact.department] || 'from-gray-500 to-gray-600'} blur-xl opacity-30`} />
                    <div className={`relative w-24 h-24 rounded-full bg-gradient-to-br ${deptColors[selectedContact.department] || 'from-gray-500 to-gray-600'} flex items-center justify-center text-white font-black text-3xl shadow-2xl ${
                      isCurrentUser(selectedContact) ? 'ring-3 ring-[var(--theme-accent)] ring-offset-4 ring-offset-[var(--theme-bg)]' : ''
                    }`}>
                      {selectedContact.firstName[0]}{selectedContact.lastName[0]}
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
                    <span className="text-sm px-3 py-1.5 rounded-full flex items-center gap-1.5 backdrop-blur-sm" style={{ background: 'var(--theme-bg-secondary)', color: 'var(--theme-text-secondary)' }}>
                      <Briefcase className="w-3.5 h-3.5" />{selectedContact.role}
                    </span>
                    <span className={`text-sm px-3 py-1.5 rounded-full ${deptBadgeColors[selectedContact.department]}`}>
                      {selectedContact.department}
                    </span>
                  </motion.div>

                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 0.3, duration: 0.3 }}
                    className="flex items-center justify-center gap-2 mt-3"
                  >
                    <span className={`w-2.5 h-2.5 rounded-full ${
                      selectedContact.availability === 'available' ? 'bg-green-400 shadow-sm shadow-green-400/50' :
                      selectedContact.availability === 'unavailable' ? 'bg-red-400' : 'bg-gray-500'
                    }`} />
                    <span className={`text-sm font-medium ${
                      selectedContact.availability === 'available' ? 'text-green-400' :
                      selectedContact.availability === 'unavailable' ? 'text-red-400' : 'text-gray-400'
                    }`}>
                      {selectedContact.availability === 'available' ? 'פנוי לעבודה' : selectedContact.availability === 'unavailable' ? 'לא פנוי' : 'סטטוס לא צוין'}
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
                      {selectedContact.skills.map((skill, i) => (
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

                {/* Contact actions */}
                {selectedContact.phone && (
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

                {selectedContact.email && (
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
