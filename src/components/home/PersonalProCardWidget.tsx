'use client';

import { useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { BadgeCheck, Briefcase, Sparkles } from 'lucide-react';
import type { Contact } from '@/data/contacts';
import ProCardModal from '@/components/directory/ProCardModal';
import { useAuth } from '@/contexts/AuthContext';

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
  const { user, profile } = useAuth();
  const [open, setOpen] = useState(false);

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

  return (
    <>
      <motion.button
        type="button"
        whileHover={{ y: -2, scale: 1.01 }}
        whileTap={{ scale: 0.98 }}
        onClick={() => setOpen(true)}
        dir="rtl"
        className="relative isolate flex h-[148px] w-full max-w-full cursor-pointer overflow-hidden rounded-[1.5rem] border border-sky-200/20 bg-slate-950/[0.42] p-4 text-right shadow-[0_22px_60px_rgba(14,165,233,0.18),inset_0_1px_0_rgba(255,255,255,0.08)] backdrop-blur-2xl transition duration-200 hover:border-sky-100/40 hover:shadow-[0_28px_72px_rgba(14,165,233,0.28),inset_0_1px_0_rgba(255,255,255,0.12)]"
      >
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

        <div className="relative flex w-full items-center justify-between gap-4">
          <div className="min-w-0">
            <p className="flex items-center gap-1.5 text-xs font-black uppercase tracking-wide text-white/45">
              <Sparkles className="h-3.5 w-3.5 text-amber-200" />
              Pro Card
            </p>
            <div className="mt-1 line-clamp-1 text-xl font-black text-white">{name}</div>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {roles.slice(0, 2).map((role) => (
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
            <div className="mt-2 flex items-center gap-1.5 text-xs font-bold text-sky-100">
              <BadgeCheck className="h-3.5 w-3.5" />
              לחץ לפתיחת הכרטיס המקצועי
            </div>
          </div>

          <div className="relative shrink-0">
            <div className="absolute -inset-1.5 rounded-full bg-gradient-to-br from-amber-300 to-sky-400 opacity-70 blur-md" />
            <div className={`relative flex h-20 w-20 items-center justify-center overflow-hidden rounded-full bg-gradient-to-br ${deptColors[primaryDepartment] || 'from-blue-500 to-cyan-500'} text-2xl font-black text-white`}>
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
      </motion.button>

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
