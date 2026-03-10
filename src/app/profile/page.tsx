'use client';

import { useState, useRef } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useTheme, themes, ThemeName } from '@/contexts/ThemeContext';
import AuthGuard from '@/components/AuthGuard';
import UserAvatar from '@/components/UserAvatar';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { storage } from '@/lib/firebase';
import {
  User, Mail, Phone, Briefcase, MapPin, Edit3, Save, Camera,
  Shield, Palette, Bell, LogOut, Sparkles, CheckCircle, X
} from 'lucide-react';
import { motion } from 'framer-motion';

const departments = ['צילום', 'טכני', 'הפקה', 'סאונד', 'תאורה'];
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
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [form, setForm] = useState({
    displayName: profile?.displayName || '',
    department: profile?.department || '',
    role: profile?.role || '',
    phone: profile?.phone || '',
    bio: profile?.bio || '',
    status: profile?.status || 'available',
  });

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

  if (!profile) return null;

  return (
    <div className="min-h-screen">
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
                        {departments.map(d => <option key={d} value={d}>{d}</option>)}
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
