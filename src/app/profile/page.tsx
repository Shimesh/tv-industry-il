'use client';

import { useState, useRef, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useTheme, themes, ThemeName } from '@/contexts/ThemeContext';
import AuthGuard from '@/components/AuthGuard';
import UserAvatar from '@/components/UserAvatar';
import { contacts } from '@/data/contacts';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { storage } from '@/lib/firebase';
import {
  User, Mail, Phone, Briefcase, MapPin, Edit3, Save, Camera,
  Shield, Palette, Bell, LogOut, Sparkles, CheckCircle, X,
  Search, Link2, UserCheck
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

const departmentOptions = ['צילום', 'טכני', 'הפקה', 'סאונד', 'תאורה'];
const statusOptions = [
  { value: 'available', label: 'פנוי', color: 'bg-green-500' },
  { value: 'busy', label: 'תפוס', color: 'bg-red-500' },
  { value: 'offline', label: 'לא פעיל', color: 'bg-gray-500' },
] as const;

export default function ProfilePage() {
  return (
    <AuthGuard>
      <ProfileContent />
    </AuthGuard>
  );
}

function ProfileContent() {
  const { profile, updateUserProfile, logout } = useAuth();
  const { theme, setTheme } = useTheme();
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
    status: profile?.status || 'available',
  });

  // Show onboarding if profile is incomplete
  useEffect(() => {
    if (profile && !profile.onboardingComplete && (!profile.department || !profile.role)) {
      setShowOnboarding(true);
    }
  }, [profile]);

  const handleSave = async () => {
    setSaving(true);
    await updateUserProfile(form);
    setSaving(false);
    setEditing(false);
    setShowSaved(true);
    setTimeout(() => setShowSaved(false), 2000);
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
    displayName: string;
    department: string;
    role: string;
    phone: string;
    linkedContactId?: number;
  }) => {
    await updateUserProfile({
      ...data,
      onboardingComplete: true,
    });
    setForm(prev => ({ ...prev, ...data }));
    setShowOnboarding(false);
    setShowSaved(true);
    setTimeout(() => setShowSaved(false), 2000);
  };

  if (!profile) return null;

  return (
    <div className="min-h-screen">
      {/* Onboarding Modal */}
      <AnimatePresence>
        {showOnboarding && (
          <OnboardingModal
            profile={profile}
            onComplete={handleOnboardingComplete}
            onDismiss={() => setShowOnboarding(false)}
          />
        )}
      </AnimatePresence>

      {/* Header Banner */}
      <section className="relative overflow-hidden border-b border-[var(--theme-border)]">
        <div className="absolute inset-0 bg-gradient-to-bl from-purple-900/20 via-transparent to-blue-900/10" />
        <div className="relative max-w-4xl mx-auto px-4 sm:px-6 py-8">
          <div className="flex flex-col sm:flex-row items-center gap-6">
            {/* Avatar */}
            <div className="relative group">
              <UserAvatar name={profile.displayName} photoURL={profile.photoURL} size="xl" isOnline={profile.isOnline} />
              <button
                onClick={() => fileInputRef.current?.click()}
                className="absolute inset-0 rounded-full bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center"
              >
                <Camera className="w-6 h-6 text-white" />
              </button>
              <input ref={fileInputRef} type="file" accept="image/*" onChange={handlePhotoUpload} className="hidden" />
            </div>

            <div className="text-center sm:text-right flex-1">
              <h1 className="text-2xl font-black text-[var(--theme-text)]">{profile.displayName}</h1>
              <div className="flex items-center justify-center sm:justify-start gap-3 mt-2 flex-wrap">
                <span className="px-3 py-1 rounded-full bg-purple-500/10 text-purple-300 text-sm flex items-center gap-1">
                  <Briefcase className="w-3.5 h-3.5" />
                  {profile.role || 'לא צוין'}
                </span>
                <span className="px-3 py-1 rounded-full bg-blue-500/10 text-blue-300 text-sm flex items-center gap-1">
                  <MapPin className="w-3.5 h-3.5" />
                  {profile.department || 'לא צוין'}
                </span>
                <span className={`px-3 py-1 rounded-full text-sm flex items-center gap-1.5 ${
                  profile.status === 'available' ? 'bg-green-500/10 text-green-300' :
                  profile.status === 'busy' ? 'bg-red-500/10 text-red-300' : 'bg-gray-500/10 text-gray-300'
                }`}>
                  <span className={`w-2 h-2 rounded-full ${statusOptions.find(s => s.value === profile.status)?.color}`} />
                  {statusOptions.find(s => s.value === profile.status)?.label}
                </span>
              </div>

              {/* Incomplete profile nudge */}
              {!profile.onboardingComplete && (
                <button
                  onClick={() => setShowOnboarding(true)}
                  className="mt-3 flex items-center gap-2 px-3 py-1.5 rounded-lg bg-amber-500/10 text-amber-400 text-xs font-medium hover:bg-amber-500/20 transition-colors mx-auto sm:mx-0"
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  השלם פרופיל וקשר לאלפון
                </button>
              )}
            </div>

            <button
              onClick={() => setEditing(!editing)}
              className="px-4 py-2 rounded-xl bg-[var(--theme-accent-glow)] text-[var(--theme-accent)] text-sm font-bold flex items-center gap-2 hover:bg-[var(--theme-accent)] hover:text-white transition-all"
            >
              {editing ? <><X className="w-4 h-4" /> ביטול</> : <><Edit3 className="w-4 h-4" /> עריכה</>}
            </button>
          </div>
        </div>
      </section>

      {/* Content */}
      <section className="max-w-4xl mx-auto px-4 sm:px-6 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Main Info */}
          <div className="lg:col-span-2 space-y-6">
            {/* Saved Toast */}
            {showSaved && (
              <motion.div
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                className="p-3 rounded-xl bg-green-500/10 border border-green-500/20 text-green-400 text-sm flex items-center gap-2"
              >
                <CheckCircle className="w-4 h-4" /> הפרופיל עודכן בהצלחה!
              </motion.div>
            )}

            {/* Personal Info Card */}
            <div className="bg-[var(--theme-bg-card)] rounded-xl border border-[var(--theme-border)] p-6">
              <h2 className="text-lg font-bold text-[var(--theme-text)] mb-4 flex items-center gap-2">
                <User className="w-5 h-5 text-[var(--theme-accent)]" />
                פרטים אישיים
              </h2>

              {editing ? (
                <div className="space-y-4">
                  <div>
                    <label className="text-xs text-[var(--theme-text-secondary)] mb-1 block">שם מלא</label>
                    <input value={form.displayName} onChange={e => setForm({...form, displayName: e.target.value})}
                      className="w-full px-4 py-2.5 rounded-lg bg-[var(--theme-bg)] border border-[var(--theme-border)] text-[var(--theme-text)] text-sm outline-none focus:border-[var(--theme-accent)]" />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs text-[var(--theme-text-secondary)] mb-1 block">מחלקה</label>
                      <select value={form.department} onChange={e => setForm({...form, department: e.target.value})}
                        className="w-full px-4 py-2.5 rounded-lg bg-[var(--theme-bg)] border border-[var(--theme-border)] text-[var(--theme-text)] text-sm outline-none focus:border-[var(--theme-accent)]">
                        <option value="">בחר</option>
                        {departmentOptions.map(d => <option key={d} value={d}>{d}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="text-xs text-[var(--theme-text-secondary)] mb-1 block">תפקיד</label>
                      <input value={form.role} onChange={e => setForm({...form, role: e.target.value})}
                        className="w-full px-4 py-2.5 rounded-lg bg-[var(--theme-bg)] border border-[var(--theme-border)] text-[var(--theme-text)] text-sm outline-none focus:border-[var(--theme-accent)]" />
                    </div>
                  </div>
                  <div>
                    <label className="text-xs text-[var(--theme-text-secondary)] mb-1 block">טלפון</label>
                    <input value={form.phone} onChange={e => setForm({...form, phone: e.target.value})}
                      className="w-full px-4 py-2.5 rounded-lg bg-[var(--theme-bg)] border border-[var(--theme-border)] text-[var(--theme-text)] text-sm outline-none focus:border-[var(--theme-accent)]" />
                  </div>
                  <div>
                    <label className="text-xs text-[var(--theme-text-secondary)] mb-1 block">ביו</label>
                    <textarea value={form.bio} onChange={e => setForm({...form, bio: e.target.value})} rows={3}
                      className="w-full px-4 py-2.5 rounded-lg bg-[var(--theme-bg)] border border-[var(--theme-border)] text-[var(--theme-text)] text-sm outline-none focus:border-[var(--theme-accent)] resize-none" />
                  </div>
                  <div>
                    <label className="text-xs text-[var(--theme-text-secondary)] mb-1 block">סטטוס</label>
                    <div className="flex gap-2">
                      {statusOptions.map(s => (
                        <button key={s.value} onClick={() => setForm({...form, status: s.value})}
                          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                            form.status === s.value ? 'bg-[var(--theme-accent-glow)] text-[var(--theme-accent)] ring-1 ring-[var(--theme-accent)]' : 'bg-[var(--theme-bg)] text-[var(--theme-text-secondary)]'
                          }`}>
                          <span className={`w-2 h-2 rounded-full ${s.color}`} />{s.label}
                        </button>
                      ))}
                    </div>
                  </div>
                  <button onClick={handleSave} disabled={saving}
                    className="w-full py-3 rounded-xl bg-gradient-to-l from-purple-500 to-blue-600 text-white font-bold flex items-center justify-center gap-2 hover:shadow-lg hover:shadow-purple-500/20 transition-all disabled:opacity-50">
                    {saving ? <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <><Save className="w-4 h-4" /> שמור שינויים</>}
                  </button>
                </div>
              ) : (
                <div className="space-y-3">
                  <InfoRow icon={<Mail className="w-4 h-4" />} label="אימייל" value={profile.email} />
                  <InfoRow icon={<Phone className="w-4 h-4" />} label="טלפון" value={profile.phone || 'לא צוין'} />
                  <InfoRow icon={<Briefcase className="w-4 h-4" />} label="תפקיד" value={profile.role || 'לא צוין'} />
                  <InfoRow icon={<MapPin className="w-4 h-4" />} label="מחלקה" value={profile.department || 'לא צוין'} />
                  {profile.bio && (
                    <div className="pt-3 border-t border-[var(--theme-border)]">
                      <p className="text-sm text-[var(--theme-text-secondary)]">{profile.bio}</p>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Sidebar */}
          <div className="space-y-6">
            {/* Theme Selection */}
            <div className="bg-[var(--theme-bg-card)] rounded-xl border border-[var(--theme-border)] p-6">
              <h2 className="text-lg font-bold text-[var(--theme-text)] mb-4 flex items-center gap-2">
                <Palette className="w-5 h-5 text-[var(--theme-accent)]" />
                ערכת נושא
              </h2>
              <div className="space-y-2">
                {(Object.entries(themes) as [ThemeName, typeof themes.dark][]).map(([key, t]) => (
                  <button key={key} onClick={() => setTheme(key)}
                    className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-all ${
                      theme === key ? 'bg-[var(--theme-accent-glow)] text-[var(--theme-accent)] ring-1 ring-[var(--theme-accent)]/30' : 'text-[var(--theme-text-secondary)] hover:bg-[var(--theme-accent-glow)]'
                    }`}>
                    <span className="text-lg">{t.emoji}</span>
                    <span className="font-medium">{t.label}</span>
                    {theme === key && <CheckCircle className="w-4 h-4 mr-auto" />}
                  </button>
                ))}
              </div>
            </div>

            {/* Quick Actions */}
            <div className="bg-[var(--theme-bg-card)] rounded-xl border border-[var(--theme-border)] p-6">
              <h2 className="text-lg font-bold text-[var(--theme-text)] mb-4 flex items-center gap-2">
                <Sparkles className="w-5 h-5 text-[var(--theme-accent)]" />
                פעולות מהירות
              </h2>
              <div className="space-y-2">
                {!profile.onboardingComplete && (
                  <button
                    onClick={() => setShowOnboarding(true)}
                    className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-amber-400 hover:bg-amber-500/10 transition-all"
                  >
                    <Link2 className="w-4 h-4" />
                    <span className="font-medium">קשר לאלפון</span>
                  </button>
                )}
                <SidebarBtn icon={<Bell className="w-4 h-4" />} label="התראות" />
                <SidebarBtn icon={<Shield className="w-4 h-4" />} label="פרטיות ואבטחה" />
                <button onClick={logout}
                  className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-red-400 hover:bg-red-500/10 transition-all">
                  <LogOut className="w-4 h-4" />
                  <span className="font-medium">התנתקות</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}

// ════════════════════════════════════
// Onboarding Modal - Link to contacts
// ════════════════════════════════════
function OnboardingModal({
  profile,
  onComplete,
  onDismiss,
}: {
  profile: { displayName: string; email: string; phone: string; department: string; role: string };
  onComplete: (data: { displayName: string; department: string; role: string; phone: string; linkedContactId?: number }) => void;
  onDismiss: () => void;
}) {
  const [step, setStep] = useState(1);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedContact, setSelectedContact] = useState<typeof contacts[0] | null>(null);
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
    setForm({
      displayName: `${contact.firstName} ${contact.lastName}`,
      department: contact.department,
      role: contact.role,
      phone: contact.phone || form.phone,
    });
    setStep(2);
  };

  const handleFinish = () => {
    onComplete({
      ...form,
      linkedContactId: selectedContact?.id,
    });
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
      onClick={onDismiss}
    >
      <motion.div
        initial={{ scale: 0.95, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.95, opacity: 0 }}
        className="rounded-2xl border max-w-md w-full overflow-hidden"
        style={{ background: 'var(--theme-bg)', borderColor: 'var(--theme-border)' }}
        onClick={e => e.stopPropagation()}
      >
        <div className="px-6 py-4 border-b flex items-center justify-between" style={{ borderColor: 'var(--theme-border)' }}>
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-purple-500 to-blue-500 flex items-center justify-center">
              <UserCheck className="w-4 h-4 text-white" />
            </div>
            <h2 className="font-bold" style={{ color: 'var(--theme-text)' }}>
              {step === 1 ? 'קשר לאלפון' : 'השלם פרטים'}
            </h2>
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
                <input
                  type="text"
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  placeholder="חפש לפי שם או טלפון..."
                  className="w-full pl-4 pr-10 py-2.5 rounded-xl border text-sm outline-none focus:border-[var(--theme-accent)]"
                  style={{ background: 'var(--theme-bg-secondary)', borderColor: 'var(--theme-border)', color: 'var(--theme-text)' }}
                  dir="rtl"
                  autoFocus
                />
              </div>

              {matchedContacts.length > 0 && (
                <div className="space-y-2 max-h-60 overflow-y-auto mb-4">
                  {matchedContacts.map(c => (
                    <button
                      key={c.id}
                      onClick={() => handleLinkContact(c)}
                      className="w-full flex items-center gap-3 p-3 rounded-xl text-right hover:bg-[var(--theme-accent-glow)] transition-all"
                      style={{ background: 'var(--theme-bg-secondary)' }}
                    >
                      <div className="w-9 h-9 rounded-full bg-gradient-to-br from-purple-500 to-blue-500 flex items-center justify-center text-white text-xs font-bold shrink-0">
                        {c.firstName[0]}{c.lastName[0]}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-bold" style={{ color: 'var(--theme-text)' }}>{c.firstName} {c.lastName}</p>
                        <p className="text-xs" style={{ color: 'var(--theme-text-secondary)' }}>
                          {c.role} - {c.department}
                          {c.phone && ` | ${c.phone}`}
                        </p>
                      </div>
                      <Link2 className="w-4 h-4 text-[var(--theme-accent)]" />
                    </button>
                  ))}
                </div>
              )}

              {searchQuery.length >= 2 && matchedContacts.length === 0 && (
                <p className="text-sm text-center py-4" style={{ color: 'var(--theme-text-secondary)' }}>
                  לא נמצאו תוצאות
                </p>
              )}

              <button
                onClick={() => setStep(2)}
                className="w-full py-2.5 rounded-xl text-sm font-medium transition-colors"
                style={{ background: 'var(--theme-bg-secondary)', color: 'var(--theme-text-secondary)' }}
              >
                דלג - מלא ידנית
              </button>
            </>
          ) : (
            <>
              {selectedContact && (
                <div className="flex items-center gap-3 p-3 rounded-xl mb-4 bg-green-500/10 border border-green-500/20">
                  <CheckCircle className="w-4 h-4 text-green-400" />
                  <span className="text-sm text-green-400 font-medium">
                    מקושר ל: {selectedContact.firstName} {selectedContact.lastName}
                  </span>
                </div>
              )}

              <div className="space-y-4">
                <div>
                  <label className="text-xs mb-1 block" style={{ color: 'var(--theme-text-secondary)' }}>שם מלא</label>
                  <input
                    value={form.displayName}
                    onChange={e => setForm({ ...form, displayName: e.target.value })}
                    className="w-full px-4 py-2.5 rounded-lg text-sm outline-none border focus:border-[var(--theme-accent)]"
                    style={{ background: 'var(--theme-bg-secondary)', borderColor: 'var(--theme-border)', color: 'var(--theme-text)' }}
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs mb-1 block" style={{ color: 'var(--theme-text-secondary)' }}>מחלקה</label>
                    <select
                      value={form.department}
                      onChange={e => setForm({ ...form, department: e.target.value })}
                      className="w-full px-4 py-2.5 rounded-lg text-sm outline-none border focus:border-[var(--theme-accent)]"
                      style={{ background: 'var(--theme-bg-secondary)', borderColor: 'var(--theme-border)', color: 'var(--theme-text)' }}
                    >
                      <option value="">בחר</option>
                      {departmentOptions.map(d => <option key={d} value={d}>{d}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="text-xs mb-1 block" style={{ color: 'var(--theme-text-secondary)' }}>תפקיד</label>
                    <input
                      value={form.role}
                      onChange={e => setForm({ ...form, role: e.target.value })}
                      className="w-full px-4 py-2.5 rounded-lg text-sm outline-none border focus:border-[var(--theme-accent)]"
                      style={{ background: 'var(--theme-bg-secondary)', borderColor: 'var(--theme-border)', color: 'var(--theme-text)' }}
                    />
                  </div>
                </div>
                <div>
                  <label className="text-xs mb-1 block" style={{ color: 'var(--theme-text-secondary)' }}>טלפון</label>
                  <input
                    value={form.phone}
                    onChange={e => setForm({ ...form, phone: e.target.value })}
                    className="w-full px-4 py-2.5 rounded-lg text-sm outline-none border focus:border-[var(--theme-accent)]"
                    style={{ background: 'var(--theme-bg-secondary)', borderColor: 'var(--theme-border)', color: 'var(--theme-text)' }}
                    dir="ltr"
                  />
                </div>

                <button
                  onClick={handleFinish}
                  disabled={!form.displayName || !form.department}
                  className="w-full py-3 rounded-xl bg-gradient-to-l from-purple-500 to-blue-600 text-white font-bold flex items-center justify-center gap-2 hover:shadow-lg hover:shadow-purple-500/20 transition-all disabled:opacity-50"
                >
                  <CheckCircle className="w-4 h-4" />
                  סיום
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
    <div className="flex items-center gap-3 py-2">
      <span className="text-[var(--theme-accent)]">{icon}</span>
      <span className="text-sm text-[var(--theme-text-secondary)] w-16">{label}</span>
      <span className="text-sm text-[var(--theme-text)] font-medium">{value}</span>
    </div>
  );
}

function SidebarBtn({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <button className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-[var(--theme-text-secondary)] hover:bg-[var(--theme-accent-glow)] hover:text-[var(--theme-text)] transition-all">
      {icon}
      <span className="font-medium">{label}</span>
    </button>
  );
}
