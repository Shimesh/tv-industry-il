'use client';

import { useState, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import AuthGuard from '@/components/AuthGuard';
import UserAvatar from '@/components/UserAvatar';
import { useAppData } from '@/contexts/AppDataContext';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { storage } from '@/lib/firebase';
import {
  User, Mail, Phone, Briefcase, MapPin, Edit3, Save, Camera,
  Shield, Bell, LogOut, Sparkles, CheckCircle, X,
  Search, Link2, UserCheck, Star, Wrench, Clock, Settings,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

const departmentOptions = ['צילום', 'טכני', 'הפקה', 'סאונד', 'תאורה', 'עריכה', 'גרפיקה', 'שידור'];
const STATUS_OPTS = [
  { value: 'available', label: 'פנוי', dot: 'bg-green-500', text: 'text-green-300', bg: 'bg-green-500/10' },
  { value: 'busy',      label: 'תפוס', dot: 'bg-amber-500', text: 'text-amber-300', bg: 'bg-amber-500/10' },
  { value: 'offline',   label: 'לא פעיל', dot: 'bg-gray-500', text: 'text-gray-300', bg: 'bg-gray-500/10' },
] as const;

function arrToStr(arr: string[] | undefined) { return (arr || []).join(', '); }
function strToArr(s: string) { return s.split(',').map(v => v.trim()).filter(Boolean); }

export default function ProfilePage() {
  return <AuthGuard><ProfileContent /></AuthGuard>;
}

function ProfileContent() {
  const { profile, updateUserProfile, logout } = useAuth();
  const { contacts: contactsList } = useAppData();
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [showSaved, setShowSaved] = useState(false);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [form, setForm] = useState({
    displayName: profile?.displayName || '',
    department: profile?.department || '',
    role: profile?.role || '',
    phone: profile?.phone || '',
    bio: profile?.bio || '',
    city: profile?.city || '',
    yearsOfExperience: profile?.yearsOfExperience != null ? String(profile.yearsOfExperience) : '',
    skills: arrToStr(profile?.skills),
    credits: arrToStr(profile?.credits),
    gear: arrToStr(profile?.gear),
    preferredRoles: arrToStr(profile?.preferredRoles),
  });

  // Sync form when profile loads
  useEffect(() => {
    if (profile) {
      setForm({
        displayName: profile.displayName || '',
        department: profile.department || '',
        role: profile.role || '',
        phone: profile.phone || '',
        bio: profile.bio || '',
        city: profile.city || '',
        yearsOfExperience: profile.yearsOfExperience != null ? String(profile.yearsOfExperience) : '',
        skills: arrToStr(profile.skills),
        credits: arrToStr(profile.credits),
        gear: arrToStr(profile.gear),
        preferredRoles: arrToStr(profile.preferredRoles),
      });
    }
  }, [profile?.uid]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (profile && !profile.onboardingComplete && (!profile.department || !profile.role)) {
      setShowOnboarding(true);
    }
  }, [profile]);

  const handleSave = async () => {
    setSaving(true);
    await updateUserProfile({
      displayName: form.displayName,
      department: form.department,
      role: form.role,
      phone: form.phone,
      bio: form.bio,
      city: form.city,
      yearsOfExperience: form.yearsOfExperience ? Number(form.yearsOfExperience) : undefined,
      skills: strToArr(form.skills),
      credits: strToArr(form.credits),
      gear: strToArr(form.gear),
      preferredRoles: strToArr(form.preferredRoles),
    });
    setSaving(false);
    setEditing(false);
    setShowSaved(true);
    setTimeout(() => setShowSaved(false), 2500);
  };

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !profile) return;
    const storageRef = ref(storage, `avatars/${profile.uid}`);
    await uploadBytes(storageRef, file);
    const photoURL = await getDownloadURL(storageRef);
    await updateUserProfile({ photoURL });
  };

  const handleOnboardingComplete = async (data: {
    displayName: string; department: string; role: string; phone: string; linkedContactId?: number;
  }) => {
    await updateUserProfile({ ...data, onboardingComplete: true });
    setForm(prev => ({ ...prev, ...data }));
    setShowOnboarding(false);
    setShowSaved(true);
    setTimeout(() => setShowSaved(false), 2500);
  };

  if (!profile) return null;

  const statusOpt = STATUS_OPTS.find(s => s.value === profile.status) ?? STATUS_OPTS[0];
  const inputCls = 'w-full px-4 py-2.5 rounded-lg bg-[var(--theme-bg)] border border-[var(--theme-border)] text-[var(--theme-text)] text-sm outline-none focus:border-[var(--theme-accent)]';
  const labelCls = 'text-xs text-[var(--theme-text-secondary)] mb-1 block';

  return (
    <div className="min-h-screen">
      <AnimatePresence>
        {showOnboarding && (
          <OnboardingModal
            profile={profile}
            contacts={contactsList.filter((c): c is { id: string | number; firstName: string; lastName: string; role: string; department: string; phone?: string } =>
              Boolean(c.firstName && c.lastName && c.role && c.department)
            )}
            onComplete={handleOnboardingComplete}
            onDismiss={() => setShowOnboarding(false)}
          />
        )}
      </AnimatePresence>

      {/* Header */}
      <section className="relative overflow-hidden border-b border-[var(--theme-border)]">
        <div className="absolute inset-0 bg-gradient-to-bl from-purple-900/20 via-transparent to-blue-900/10" />
        <div className="relative max-w-4xl mx-auto px-4 sm:px-6 py-8">
          <div className="flex flex-col sm:flex-row items-center gap-6">
            {/* Avatar */}
            <div className="relative group shrink-0">
              <UserAvatar name={profile.displayName} photoURL={profile.photoURL} size="xl" isOnline={profile.isOnline} />
              <button
                onClick={() => fileInputRef.current?.click()}
                className="absolute inset-0 rounded-full bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center"
              >
                <Camera className="w-6 h-6 text-white" />
              </button>
              <input ref={fileInputRef} type="file" accept="image/*" onChange={handlePhotoUpload} className="hidden" />
            </div>

            <div className="text-center sm:text-right flex-1 min-w-0">
              <h1 className="text-2xl font-black text-[var(--theme-text)]">{profile.displayName}</h1>
              <div className="flex items-center justify-center sm:justify-start gap-2 mt-2 flex-wrap">
                {profile.role && (
                  <span className="px-2.5 py-1 rounded-full bg-purple-500/10 text-purple-300 text-xs flex items-center gap-1">
                    <Briefcase className="w-3 h-3" />{profile.role}
                  </span>
                )}
                {profile.department && (
                  <span className="px-2.5 py-1 rounded-full bg-blue-500/10 text-blue-300 text-xs flex items-center gap-1">
                    <MapPin className="w-3 h-3" />{profile.department}
                  </span>
                )}
                <span className={`px-2.5 py-1 rounded-full text-xs flex items-center gap-1.5 ${statusOpt.bg} ${statusOpt.text}`}>
                  <span className={`w-1.5 h-1.5 rounded-full ${statusOpt.dot}`} />{statusOpt.label}
                </span>
                {profile.openToWork && (
                  <span className="px-2.5 py-1 rounded-full bg-emerald-500/10 text-emerald-300 text-xs flex items-center gap-1">
                    <Star className="w-3 h-3" />מחפש עבודה
                  </span>
                )}
              </div>
              {profile.city && (
                <p className="text-xs mt-1 text-[var(--theme-text-secondary)]">{profile.city}{profile.yearsOfExperience ? ` · ${profile.yearsOfExperience} שנות ניסיון` : ''}</p>
              )}
              {!profile.onboardingComplete && (
                <button onClick={() => setShowOnboarding(true)}
                  className="mt-2 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-500/10 text-amber-400 text-xs font-medium hover:bg-amber-500/20 transition-colors">
                  <Sparkles className="w-3.5 h-3.5" />השלם פרופיל וקשר לאלפון
                </button>
              )}
            </div>

            <button onClick={() => setEditing(!editing)}
              className="shrink-0 px-4 py-2 rounded-xl bg-[var(--theme-accent-glow)] text-[var(--theme-accent)] text-sm font-bold flex items-center gap-2 hover:bg-[var(--theme-accent)] hover:text-white transition-all">
              {editing ? <><X className="w-4 h-4" />ביטול</> : <><Edit3 className="w-4 h-4" />עריכה</>}
            </button>
          </div>
        </div>
      </section>

      {/* Content */}
      <section className="max-w-4xl mx-auto px-4 sm:px-6 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Main */}
          <div className="lg:col-span-2 space-y-6">
            {showSaved && (
              <div className="p-3 rounded-xl bg-green-500/10 border border-green-500/20 text-green-400 text-sm flex items-center gap-2">
                <CheckCircle className="w-4 h-4" />הפרופיל עודכן בהצלחה!
              </div>
            )}

            {/* Personal Info */}
            <div className="bg-[var(--theme-bg-card)] rounded-xl border border-[var(--theme-border)] p-6">
              <h2 className="text-sm font-bold text-[var(--theme-text)] mb-4 flex items-center gap-2">
                <User className="w-4 h-4 text-[var(--theme-accent)]" />פרטים אישיים
              </h2>
              {editing ? (
                <div className="space-y-4">
                  <div>
                    <label className={labelCls}>שם מלא</label>
                    <input value={form.displayName} onChange={e => setForm({ ...form, displayName: e.target.value })} className={inputCls} />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className={labelCls}>מחלקה</label>
                      <select value={form.department} onChange={e => setForm({ ...form, department: e.target.value })} className={inputCls}>
                        <option value="">בחר</option>
                        {departmentOptions.map(d => <option key={d} value={d}>{d}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className={labelCls}>תפקיד</label>
                      <input value={form.role} onChange={e => setForm({ ...form, role: e.target.value })} className={inputCls} />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className={labelCls}>טלפון</label>
                      <input value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} className={inputCls} dir="ltr" />
                    </div>
                    <div>
                      <label className={labelCls}>עיר</label>
                      <input value={form.city} onChange={e => setForm({ ...form, city: e.target.value })} className={inputCls} placeholder="תל אביב" />
                    </div>
                  </div>
                  <div>
                    <label className={labelCls}>על עצמי</label>
                    <textarea value={form.bio} onChange={e => setForm({ ...form, bio: e.target.value })} rows={3}
                      className={inputCls + ' resize-none'} placeholder="ספר/י על עצמך בקצרה..." />
                  </div>
                </div>
              ) : (
                <div className="space-y-2.5">
                  <InfoRow icon={<Mail className="w-4 h-4" />} label="אימייל" value={profile.email} />
                  <InfoRow icon={<Phone className="w-4 h-4" />} label="טלפון" value={profile.phone || 'לא צוין'} />
                  <InfoRow icon={<Briefcase className="w-4 h-4" />} label="תפקיד" value={profile.role || 'לא צוין'} />
                  <InfoRow icon={<MapPin className="w-4 h-4" />} label="מחלקה" value={profile.department || 'לא צוין'} />
                  {profile.city && <InfoRow icon={<MapPin className="w-4 h-4" />} label="עיר" value={profile.city} />}
                  {profile.bio && (
                    <div className="pt-3 border-t border-[var(--theme-border)]">
                      <p className="text-sm text-[var(--theme-text-secondary)] leading-relaxed">{profile.bio}</p>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Professional Info */}
            <div className="bg-[var(--theme-bg-card)] rounded-xl border border-[var(--theme-border)] p-6">
              <h2 className="text-sm font-bold text-[var(--theme-text)] mb-4 flex items-center gap-2">
                <Star className="w-4 h-4 text-[var(--theme-accent)]" />פרטים מקצועיים
              </h2>
              {editing ? (
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className={labelCls}>שנות ניסיון</label>
                      <input type="number" min="0" max="50" value={form.yearsOfExperience}
                        onChange={e => setForm({ ...form, yearsOfExperience: e.target.value })}
                        className={inputCls} placeholder="5" />
                    </div>
                    <div>
                      <label className={labelCls}>תפקידים מועדפים</label>
                      <input value={form.preferredRoles}
                        onChange={e => setForm({ ...form, preferredRoles: e.target.value })}
                        className={inputCls} placeholder="במאי, מפיק... (מופרד בפסיקים)" />
                    </div>
                  </div>
                  <div>
                    <label className={labelCls}>כישורים</label>
                    <input value={form.skills} onChange={e => setForm({ ...form, skills: e.target.value })}
                      className={inputCls} placeholder="Final Cut Pro, Premiere, After Effects... (מופרד בפסיקים)" />
                  </div>
                  <div>
                    <label className={labelCls}>ציוד ברשותי</label>
                    <input value={form.gear} onChange={e => setForm({ ...form, gear: e.target.value })}
                      className={inputCls} placeholder="Sony FX3, DJI Ronin... (מופרד בפסיקים)" />
                  </div>
                  <div>
                    <label className={labelCls}>קרדיטים (הפקות בולטות)</label>
                    <input value={form.credits} onChange={e => setForm({ ...form, credits: e.target.value })}
                      className={inputCls} placeholder="הכוכב הבא, ניב רסקין... (מופרד בפסיקים)" />
                  </div>
                </div>
              ) : (
                <div className="space-y-4">
                  {profile.yearsOfExperience != null && (
                    <InfoRow icon={<Clock className="w-4 h-4" />} label="ניסיון" value={`${profile.yearsOfExperience} שנים`} />
                  )}
                  {(profile.skills?.length ?? 0) > 0 && (
                    <TagGroup label="כישורים" tags={profile.skills!} color="purple" />
                  )}
                  {(profile.gear?.length ?? 0) > 0 && (
                    <TagGroup label="ציוד" tags={profile.gear!} color="blue" icon={<Wrench className="w-3.5 h-3.5" />} />
                  )}
                  {(profile.credits?.length ?? 0) > 0 && (
                    <TagGroup label="קרדיטים" tags={profile.credits!} color="amber" icon={<Star className="w-3.5 h-3.5" />} />
                  )}
                  {(profile.preferredRoles?.length ?? 0) > 0 && (
                    <TagGroup label="תפקידים מועדפים" tags={profile.preferredRoles!} color="green" />
                  )}
                  {!profile.yearsOfExperience && !profile.skills?.length && !profile.gear?.length && !profile.credits?.length && (
                    <p className="text-sm text-[var(--theme-text-secondary)] text-center py-2">
                      לחץ על &quot;עריכה&quot; כדי להוסיף פרטים מקצועיים
                    </p>
                  )}
                </div>
              )}
              {editing && (
                <button onClick={handleSave} disabled={saving}
                  className="w-full mt-5 py-3 rounded-xl bg-gradient-to-l from-purple-500 to-blue-600 text-white font-bold flex items-center justify-center gap-2 hover:shadow-lg hover:shadow-purple-500/20 transition-all disabled:opacity-50">
                  {saving
                    ? <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    : <><Save className="w-4 h-4" />שמור שינויים</>}
                </button>
              )}
            </div>
          </div>

          {/* Sidebar */}
          <div className="space-y-4">
            {/* Quick Actions */}
            <div className="bg-[var(--theme-bg-card)] rounded-xl border border-[var(--theme-border)] p-5">
              <h2 className="text-sm font-bold text-[var(--theme-text)] mb-3 flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-[var(--theme-accent)]" />פעולות מהירות
              </h2>
              <div className="space-y-1">
                {!profile.onboardingComplete && (
                  <button onClick={() => setShowOnboarding(true)}
                    className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-amber-400 hover:bg-amber-500/10 transition-all">
                    <Link2 className="w-4 h-4" /><span className="font-medium">קשר לאלפון</span>
                  </button>
                )}
                <button onClick={() => router.push('/settings')}
                  className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-[var(--theme-text-secondary)] hover:bg-[var(--theme-accent-glow)] hover:text-[var(--theme-text)] transition-all">
                  <Settings className="w-4 h-4" /><span className="font-medium">הגדרות אפליקציה</span>
                </button>
                <button onClick={() => router.push('/settings')}
                  className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-[var(--theme-text-secondary)] hover:bg-[var(--theme-accent-glow)] hover:text-[var(--theme-text)] transition-all">
                  <Bell className="w-4 h-4" /><span className="font-medium">התראות</span>
                </button>
                <button onClick={() => router.push('/settings')}
                  className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-[var(--theme-text-secondary)] hover:bg-[var(--theme-accent-glow)] hover:text-[var(--theme-text)] transition-all">
                  <Shield className="w-4 h-4" /><span className="font-medium">פרטיות ואבטחה</span>
                </button>
                <button onClick={logout}
                  className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-red-400 hover:bg-red-500/10 transition-all">
                  <LogOut className="w-4 h-4" /><span className="font-medium">התנתקות</span>
                </button>
              </div>
            </div>

            {/* Status card — read-only, link to settings */}
            <button onClick={() => router.push('/settings')}
              className="w-full bg-[var(--theme-bg-card)] rounded-xl border border-[var(--theme-border)] p-5 text-right hover:border-[var(--theme-accent)]/50 transition-colors group">
              <p className="text-xs text-[var(--theme-text-secondary)] mb-2 flex items-center gap-1.5">
                <User className="w-3.5 h-3.5" />סטטוס נוכחי
              </p>
              <div className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-medium ${statusOpt.bg} ${statusOpt.text}`}>
                <span className={`w-2 h-2 rounded-full ${statusOpt.dot}`} />
                {statusOpt.label}
                {profile.openToWork && <span className="mr-1 text-emerald-300">· מחפש עבודה</span>}
              </div>
              <p className="text-[10px] text-[var(--theme-text-secondary)] mt-2 opacity-60 group-hover:opacity-100 transition-opacity">
                לשינוי סטטוס ← הגדרות
              </p>
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}

// ════════════════════════════════════
// Onboarding Modal
// ════════════════════════════════════
function OnboardingModal({
  profile, contacts, onComplete, onDismiss,
}: {
  profile: { displayName: string; email: string; phone: string; department: string; role: string };
  contacts: { id: number | string; firstName: string; lastName: string; role: string; department: string; phone?: string }[];
  onComplete: (data: { displayName: string; department: string; role: string; phone: string; linkedContactId?: number }) => void;
  onDismiss: () => void;
}) {
  const [step, setStep] = useState(1);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedContact, setSelectedContact] = useState<{ id: number | string; firstName: string; lastName: string } | null>(null);
  const [form, setForm] = useState({
    displayName: profile.displayName,
    department: profile.department || '',
    role: profile.role || '',
    phone: profile.phone || '',
  });

  const matchedContacts = searchQuery.length >= 2
    ? contacts.filter(c => {
        const fullName = `${c.firstName} ${c.lastName}`;
        return fullName.includes(searchQuery) || (c.phone && c.phone.includes(searchQuery));
      })
    : [];

  const handleLinkContact = (contact: typeof contacts[0]) => {
    setSelectedContact(contact);
    setForm({ displayName: `${contact.firstName} ${contact.lastName}`, department: contact.department, role: contact.role, phone: contact.phone || form.phone });
    setStep(2);
  };

  const inputCls = 'w-full px-4 py-2.5 rounded-lg text-sm outline-none border focus:border-[var(--theme-accent)]';
  const inputStyle = { background: 'var(--theme-bg-secondary)', borderColor: 'var(--theme-border)', color: 'var(--theme-text)' };

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
      onClick={onDismiss}>
      <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }}
        className="rounded-2xl border max-w-md w-full overflow-hidden"
        style={{ background: 'var(--theme-bg)', borderColor: 'var(--theme-border)' }}
        onClick={e => e.stopPropagation()}>
        <div className="px-6 py-4 border-b flex items-center justify-between" style={{ borderColor: 'var(--theme-border)' }}>
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-purple-500 to-blue-500 flex items-center justify-center">
              <UserCheck className="w-4 h-4 text-white" />
            </div>
            <h2 className="font-bold" style={{ color: 'var(--theme-text)' }}>{step === 1 ? 'קשר לאלפון' : 'השלם פרטים'}</h2>
          </div>
          <button onClick={onDismiss} className="p-1 rounded-lg hover:bg-[var(--theme-accent-glow)]">
            <X className="w-4 h-4 text-[var(--theme-text-secondary)]" />
          </button>
        </div>
        <div className="p-6">
          {step === 1 ? (
            <>
              <p className="text-sm mb-4" style={{ color: 'var(--theme-text-secondary)' }}>
                חפש את עצמך באלפון כדי לקשר את הפרופיל שלך. כך ניתן יהיה לזהות אותך אוטומטית בלוח ההפקות.
              </p>
              <div className="relative mb-4">
                <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: 'var(--theme-text-secondary)' }} />
                <input type="text" value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
                  placeholder="חפש לפי שם או טלפון..." autoFocus dir="rtl"
                  className="w-full pl-4 pr-10 py-2.5 rounded-xl border text-sm outline-none focus:border-[var(--theme-accent)]"
                  style={{ background: 'var(--theme-bg-secondary)', borderColor: 'var(--theme-border)', color: 'var(--theme-text)' }} />
              </div>
              {matchedContacts.length > 0 && (
                <div className="space-y-2 max-h-60 overflow-y-auto mb-4">
                  {matchedContacts.map(c => (
                    <button key={c.id} onClick={() => handleLinkContact(c)}
                      className="w-full flex items-center gap-3 p-3 rounded-xl text-right hover:bg-[var(--theme-accent-glow)] transition-all"
                      style={{ background: 'var(--theme-bg-secondary)' }}>
                      <div className="w-9 h-9 rounded-full bg-gradient-to-br from-purple-500 to-blue-500 flex items-center justify-center text-white text-xs font-bold shrink-0">
                        {c.firstName[0]}{c.lastName[0]}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-bold" style={{ color: 'var(--theme-text)' }}>{c.firstName} {c.lastName}</p>
                        <p className="text-xs" style={{ color: 'var(--theme-text-secondary)' }}>{c.role} - {c.department}{c.phone && ` | ${c.phone}`}</p>
                      </div>
                      <Link2 className="w-4 h-4 text-[var(--theme-accent)]" />
                    </button>
                  ))}
                </div>
              )}
              {searchQuery.length >= 2 && matchedContacts.length === 0 && (
                <p className="text-sm text-center py-4" style={{ color: 'var(--theme-text-secondary)' }}>לא נמצאו תוצאות</p>
              )}
              <button onClick={() => setStep(2)} className="w-full py-2.5 rounded-xl text-sm font-medium transition-colors"
                style={{ background: 'var(--theme-bg-secondary)', color: 'var(--theme-text-secondary)' }}>
                דלג - מלא ידנית
              </button>
            </>
          ) : (
            <>
              {selectedContact && (
                <div className="flex items-center gap-3 p-3 rounded-xl mb-4 bg-green-500/10 border border-green-500/20">
                  <CheckCircle className="w-4 h-4 text-green-400" />
                  <span className="text-sm text-green-400 font-medium">מקושר ל: {selectedContact.firstName} {selectedContact.lastName}</span>
                </div>
              )}
              <div className="space-y-4">
                <div>
                  <label className="text-xs mb-1 block" style={{ color: 'var(--theme-text-secondary)' }}>שם מלא</label>
                  <input value={form.displayName} onChange={e => setForm({ ...form, displayName: e.target.value })} className={inputCls} style={inputStyle} />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs mb-1 block" style={{ color: 'var(--theme-text-secondary)' }}>מחלקה</label>
                    <select value={form.department} onChange={e => setForm({ ...form, department: e.target.value })} className={inputCls} style={inputStyle}>
                      <option value="">בחר</option>
                      {['צילום','טכני','הפקה','סאונד','תאורה','עריכה','גרפיקה','שידור'].map(d => <option key={d} value={d}>{d}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="text-xs mb-1 block" style={{ color: 'var(--theme-text-secondary)' }}>תפקיד</label>
                    <input value={form.role} onChange={e => setForm({ ...form, role: e.target.value })} className={inputCls} style={inputStyle} />
                  </div>
                </div>
                <div>
                  <label className="text-xs mb-1 block" style={{ color: 'var(--theme-text-secondary)' }}>טלפון</label>
                  <input value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} className={inputCls} style={inputStyle} dir="ltr" />
                </div>
                <button onClick={() => onComplete({ ...form, linkedContactId: selectedContact?.id as number | undefined })}
                  disabled={!form.displayName || !form.department}
                  className="w-full py-3 rounded-xl bg-gradient-to-l from-purple-500 to-blue-600 text-white font-bold flex items-center justify-center gap-2 hover:shadow-lg hover:shadow-purple-500/20 transition-all disabled:opacity-50">
                  <CheckCircle className="w-4 h-4" />סיום
                </button>
              </div>
            </>
          )}
        </div>
      </motion.div>
    </motion.div>
  );
}

function InfoRow({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="flex items-center gap-3 py-1.5">
      <span className="text-[var(--theme-accent)] shrink-0">{icon}</span>
      <span className="text-xs text-[var(--theme-text-secondary)] w-14 shrink-0">{label}</span>
      <span className="text-sm text-[var(--theme-text)] font-medium">{value}</span>
    </div>
  );
}

function TagGroup({ label, tags, color, icon }: { label: string; tags: string[]; color: string; icon?: React.ReactNode }) {
  const colors: Record<string, string> = {
    purple: 'bg-purple-500/10 text-purple-300',
    blue: 'bg-blue-500/10 text-blue-300',
    amber: 'bg-amber-500/10 text-amber-300',
    green: 'bg-green-500/10 text-green-300',
  };
  return (
    <div>
      <p className="text-xs text-[var(--theme-text-secondary)] mb-2 flex items-center gap-1">
        {icon}<span>{label}</span>
      </p>
      <div className="flex flex-wrap gap-1.5">
        {tags.map((t, i) => (
          <span key={i} className={`px-2.5 py-1 rounded-full text-xs font-medium ${colors[color] ?? colors.purple}`}>{t}</span>
        ))}
      </div>
    </div>
  );
}
