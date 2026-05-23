'use client';

import { useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { BadgeCheck, Briefcase, ChevronLeft, Loader2, Sparkles } from 'lucide-react';
import type { Contact } from '@/data/contacts';
import ProCardModal from '@/components/directory/ProCardModal';
import { useAuth } from '@/contexts/AuthContext';

const STATUS_OPTIONS = [
  { value: 'available', label: 'פנוי', dot: 'bg-emerald-400', bg: 'bg-emerald-400/15', text: 'text-emerald-200' },
  { value: 'busy', label: 'תפוס', dot: 'bg-rose-400', bg: 'bg-rose-400/15', text: 'text-rose-200' },
  { value: 'offline', label: 'לא זמין', dot: 'bg-slate-400', bg: 'bg-slate-400/15', text: 'text-slate-200' },
] as const;

const deptColors: Record<string, string> = {
  צילום: 'from-blue-500 to-blue-600',
  טכני: 'from-emerald-500 to-emerald-600',
  הפקה: 'from-purple-500 to-purple-600',
  סאונד: 'from-orange-500 to-orange-600',
  תאורה: 'from-yellow-500 to-amber-600',
  מבצעים: 'from-cyan-500 to-cyan-600',
  בימוי: 'from-rose-500 to-rose-600',
  'ארט ותפאורה': 'from-pink-500 to-pink-600',
  ביוטי: 'from-teal-500 to-teal-600',
};

const deptBadgeColors: Record<string, string> = {
  צילום: 'bg-blue-500/15 text-blue-300',
  טכני: 'bg-emerald-500/15 text-emerald-300',
  הפקה: 'bg-purple-500/15 text-purple-300',
  סאונד: 'bg-orange-500/15 text-orange-300',
  תאורה: 'bg-yellow-500/15 text-yellow-300',
  מבצעים: 'bg-cyan-500/15 text-cyan-300',
  בימוי: 'bg-rose-500/15 text-rose-300',
  'ארט ותפאורה': 'bg-pink-500/15 text-pink-300',
  ביוטי: 'bg-teal-500/15 text-teal-300',
};

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join('') || 'TV';
}

function diceBearAvatarUrl(seed: string): string {
  return `https://api.dicebear.com/9.x/thumbs/svg?seed=${encodeURIComponent(seed)}&backgroundColor=0f172a,1e40af,facc15&shapeColor=38bdf8,facc15,2563eb`;
}

export default function PersonalProCardWidget() {
  const { user, profile, updateUserProfile } = useAuth();
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  const contact = useMemo<Contact | null>(() => {
    if (!profile && !user) return null;
    const displayName = profile?.displayName || user?.displayName || 'איש מקצוע';
    const [firstName = '', ...rest] = displayName.split(/\s+/);
    const customPhotoURL = profile?.customPhotoURL || null;
    const photoURL = customPhotoURL || profile?.photoURL || user?.photoURL || null;

    return {
      id: profile?.linkedContactId || profile?.uid || user?.uid || 'me',
      firstName,
      lastName: rest.join(' '),
      email: profile?.email || user?.email || '',
      phone: profile?.phone || '',
      photoURL: photoURL || undefined,
      customPhotoURL: customPhotoURL || undefined,
      roles: profile?.roles?.length ? profile.roles : profile?.role ? [profile.role] : [],
      departments: profile?.departments?.length ? profile.departments : profile?.department ? [profile.department] : [],
      department: profile?.department || '',
      role: profile?.role || '',
      city: profile?.city || null,
      yearsOfExperience: profile?.yearsOfExperience || null,
      skills: profile?.skills || [],
      credits: profile?.credits || [],
      gear: profile?.gear || [],
      openToWork: profile?.openToWork === true,
      availability: profile?.status === 'available' ? 'available' : profile?.status === 'busy' ? 'maybe' : undefined,
      is_consented: profile?.is_consented === true,
      profileId: profile?.profileId,
    };
  }, [profile, user]);

  if (!contact) return null;

  const name = `${contact.firstName || ''} ${contact.lastName || ''}`.trim() || 'איש מקצוע';
  const roles = (contact.roles?.length ? contact.roles : contact.role ? [contact.role] : []).filter(Boolean);
  const departments = (contact.departments?.length ? contact.departments : contact.department ? [String(contact.department)] : []).filter(Boolean);
  const primaryDepartment = departments[0] || '';
  const avatarUrl = contact.customPhotoURL || contact.photoURL || diceBearAvatarUrl(`${contact.id}-${name}`);
  const currentStatus = STATUS_OPTIONS.find((option) => option.value === (profile?.status || 'available')) ?? STATUS_OPTIONS[0];

  async function updateStatus(status: typeof STATUS_OPTIONS[number]['value']) {
    if (!profile || saving) return;
    setSaving(true);
    try {
      await updateUserProfile({ status });
    } finally {
      setSaving(false);
    }
  }

  async function toggleOpenToWork() {
    if (!profile || saving) return;
    setSaving(true);
    try {
      await updateUserProfile({ openToWork: !profile.openToWork });
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <motion.div
        whileHover={{ y: -3, scale: 1.015 }}
        whileTap={{ scale: 0.97, y: 0 }}
        onClick={() => setOpen(true)}
        role="button"
        tabIndex={0}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            setOpen(true);
          }
        }}
        dir="rtl"
        className="group relative isolate flex h-auto min-h-[360px] w-full max-w-full cursor-pointer overflow-hidden rounded-[1.5rem] border border-sky-200/20 bg-slate-950/[0.42] p-4 text-right shadow-[0_14px_40px_rgba(14,165,233,0.14),inset_0_1px_0_rgba(255,255,255,0.08)] backdrop-blur-2xl transition-all duration-200 hover:border-sky-100/50 hover:shadow-[0_22px_56px_rgba(14,165,233,0.28),0_0_20px_rgba(56,189,248,0.12),inset_0_1px_0_rgba(255,255,255,0.12)] xl:h-[360px]"
      >
        <span className="pointer-events-none absolute inset-0 translate-x-full skew-x-[-20deg] bg-gradient-to-r from-transparent via-white/[0.07] to-transparent transition-transform duration-700 ease-out group-hover:-translate-x-full" />
        <motion.div
          className="pointer-events-none absolute inset-0 opacity-80"
          animate={{ backgroundPosition: ['0% 50%', '100% 50%', '0% 50%'] }}
          transition={{ duration: 8, repeat: Infinity, ease: 'easeInOut' }}
          style={{
            background:
              'linear-gradient(120deg, rgba(250,204,21,0.12), rgba(56,189,248,0.18), rgba(37,99,235,0.16), rgba(250,204,21,0.10))',
            backgroundSize: '280% 280%',
          }}
        />
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_18%_18%,rgba(250,204,21,0.16),transparent_42%)]" />

        <div className="relative flex h-full w-full flex-col justify-between gap-4">
          <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="flex items-center gap-1.5 text-xs font-black uppercase tracking-wide text-white/45">
              <Sparkles className="h-3.5 w-3.5 text-amber-200" />
              Pro Card
            </p>
            <div className="mt-1 line-clamp-1 text-xl font-black text-white">{name}</div>
          </div>

          <div className="relative shrink-0">
            <div className="absolute -inset-1.5 rounded-full bg-gradient-to-br from-amber-300 to-sky-400 opacity-70 blur-md" />
            <div className={`relative flex h-24 w-24 items-center justify-center overflow-hidden rounded-full bg-gradient-to-br ${deptColors[primaryDepartment] || 'from-blue-500 to-cyan-500'} text-2xl font-black text-white`}>
              <img
                src={avatarUrl}
                alt={name}
                className={`h-full w-full object-cover ${contact.photoURL ? '' : 'animate-[pulse_4s_ease-in-out_infinite]'}`}
                onError={(event) => {
                  event.currentTarget.style.display = 'none';
                }}
              />
              <span className="absolute -z-10">{initials(name)}</span>
            </div>
          </div>
          </div>

          <div className="space-y-2">
            <div className="rounded-2xl border border-white/10 bg-white/[0.06] p-3">
              <div className="mb-2 flex items-center justify-between gap-2">
                <span className="text-xs font-black text-white/55">סטטוס</span>
                {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin text-sky-200" /> : null}
              </div>
              <div className="grid grid-cols-3 gap-1.5">
                {STATUS_OPTIONS.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    onClick={(event) => {
                      event.stopPropagation();
                      void updateStatus(option.value);
                    }}
                    className={`flex items-center justify-center gap-1 rounded-xl px-2 py-1.5 text-[11px] font-black transition ${
                      currentStatus.value === option.value ? `${option.bg} ${option.text}` : 'bg-black/20 text-white/55 hover:bg-white/10 hover:text-white'
                    }`}
                    aria-pressed={currentStatus.value === option.value}
                  >
                    <span className={`h-1.5 w-1.5 rounded-full ${option.dot}`} />
                    {option.label}
                  </button>
                ))}
              </div>
            </div>

            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                void toggleOpenToWork();
              }}
              className={`flex w-full items-center justify-between rounded-2xl border px-3 py-2 text-xs font-black transition ${
                profile?.openToWork
                  ? 'border-emerald-300/25 bg-emerald-400/15 text-emerald-200'
                  : 'border-white/10 bg-white/[0.06] text-white/65 hover:bg-white/10'
              }`}
              aria-pressed={profile?.openToWork === true}
            >
              <span>מחפש עבודה</span>
              <span className={`relative h-5 w-9 rounded-full transition ${profile?.openToWork ? 'bg-emerald-400' : 'bg-white/20'}`}>
                <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition ${profile?.openToWork ? 'right-0.5' : 'right-4'}`} />
              </span>
            </button>

            <div className="flex flex-wrap gap-1.5">
              {roles.slice(0, 3).map((role) => (
                <span key={role} className="inline-flex items-center gap-1 rounded-full bg-white/10 px-2 py-1 text-[11px] font-bold text-white/75">
                  <Briefcase className="h-3 w-3 text-sky-200" />
                  {role}
                </span>
              ))}
              {contact.openToWork && (
                <span className="rounded-full bg-emerald-400/15 px-2 py-1 text-[11px] font-bold text-emerald-200">
                  פתוח להצעות
                </span>
              )}
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/[0.06] p-3 text-xs font-bold leading-6 text-white/70">
              {primaryDepartment || 'פרופיל מקצועי'}
              {contact.city ? <span> · {contact.city}</span> : null}
            </div>
            <div className="flex items-center gap-1.5 text-xs font-bold text-sky-100 transition-colors duration-200 group-hover:text-sky-50">
              <BadgeCheck className="h-3.5 w-3.5" />
              פתיחת הכרטיס המקצועי
              <ChevronLeft className="h-3 w-3 transition-transform duration-200 group-hover:-translate-x-0.5" />
            </div>
          </div>
        </div>
      </motion.div>

      <AnimatePresence>
        {open && (
          <ProCardModal
            contact={contact}
            isCurrentUser
            canShowContactInfo={contact.is_consented === true}
            roles={roles}
            departments={departments}
            primaryDepartment={primaryDepartment}
            deptColors={deptColors}
            deptBadgeColors={deptBadgeColors}
            removalHref="mailto:yaron.orb@gmail.com?subject=בקשת%20עדכון%20כרטיס%20מקצועי"
            onClose={() => setOpen(false)}
          />
        )}
      </AnimatePresence>
    </>
  );
}
