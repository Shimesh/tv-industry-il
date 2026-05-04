'use client';

import { useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useTheme, themes, ThemeName } from '@/contexts/ThemeContext';
import { useRouter } from 'next/navigation';
import AuthGuard from '@/components/AuthGuard';
import UserAvatar from '@/components/UserAvatar';
import {
  Settings, Palette, Bell, Shield, LogOut, CheckCircle,
  ChevronLeft, User, Volume2, Eye, Smartphone, Trash2, AlertTriangle
} from 'lucide-react';

export default function SettingsPage() {
  return (
    <AuthGuard>
      <SettingsContent />
    </AuthGuard>
  );
}

function SettingsContent() {
  const { profile, logout, updateUserProfile, deleteDirectoryProfile } = useAuth();
  const { theme, setTheme } = useTheme();
  const router = useRouter();
  const [notificationsEnabled, setNotificationsEnabled] = useState(profile?.notificationsEnabled !== false);
  const [soundEnabled, setSoundEnabled] = useState(profile?.soundEnabled !== false);
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
  const [showDeleteProfileConfirm, setShowDeleteProfileConfirm] = useState(false);
  const [deletingProfile, setDeletingProfile] = useState(false);
  const [statusSaved, setStatusSaved] = useState(false);
  const [settingsError, setSettingsError] = useState<string | null>(null);

  const handleLogout = async () => {
    await logout();
    router.push('/login');
  };

  const handleDeleteDirectoryProfile = async () => {
    setDeletingProfile(true);
    setSettingsError(null);
    try {
      await deleteDirectoryProfile();
      await logout();
      router.push('/');
    } catch {
      setDeletingProfile(false);
      setShowDeleteProfileConfirm(false);
      setSettingsError('לא הצלחנו למחוק את הפרופיל מהאינדקס. נסה שוב בעוד רגע.');
    }
  };

  const handleStatusChange = async (status: 'available' | 'busy' | 'offline') => {
    setSettingsError(null);
    try {
      await updateUserProfile({ status });
      setStatusSaved(true);
      setTimeout(() => setStatusSaved(false), 2000);
    } catch {
      setSettingsError('לא הצלחנו לשמור את הסטטוס. נסה שוב בעוד רגע.');
    }
  };

  const handleToggleNotifications = async () => {
    const next = !notificationsEnabled;
    setNotificationsEnabled(next);
    setSettingsError(null);
    try {
      await updateUserProfile({ notificationsEnabled: next });
    } catch {
      setNotificationsEnabled(!next);
      setSettingsError('לא הצלחנו לשמור את הגדרת ההתראות.');
    }
  };

  const handleToggleSound = async () => {
    const next = !soundEnabled;
    setSoundEnabled(next);
    setSettingsError(null);
    try {
      await updateUserProfile({ soundEnabled: next });
    } catch {
      setSoundEnabled(!next);
      setSettingsError('לא הצלחנו לשמור את הגדרת הצלילים.');
    }
  };

  const handleToggleShowPhone = async () => {
    const next = !(profile?.showPhone ?? true);
    setSettingsError(null);
    try {
      await updateUserProfile({ showPhone: next });
    } catch {
      setSettingsError('לא הצלחנו לשמור את הגדרת הפרטיות.');
    }
  };

  const handleToggleOpenToWork = async () => {
    if (!profile) return;
    setSettingsError(null);
    try {
      await updateUserProfile({ openToWork: !profile.openToWork });
    } catch {
      setSettingsError('לא הצלחנו לשמור את זמינות העבודה.');
    }
  };

  if (!profile) return null;

  return (
    <div className="max-w-2xl mx-auto px-4 py-8">
      {/* Header */}
      <div className="flex items-center gap-3 mb-8">
        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-purple-500 to-blue-500 flex items-center justify-center">
          <Settings className="w-5 h-5 text-white" />
        </div>
        <div>
          <h1 className="text-xl font-black" style={{ color: 'var(--theme-text)' }}>הגדרות</h1>
          <p className="text-xs" style={{ color: 'var(--theme-text-secondary)' }}>ניהול חשבון, תצוגה והתראות</p>
        </div>
      </div>

      <div className="space-y-6">
        {settingsError ? (
          <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
            {settingsError}
          </div>
        ) : null}

        {/* Profile Card */}
        <div className="rounded-xl border p-4" style={{ background: 'var(--theme-bg-card)', borderColor: 'var(--theme-border)' }}>
          <button
            onClick={() => router.push('/profile')}
            className="w-full flex items-center gap-4 group"
          >
            <UserAvatar
              name={profile.displayName}
              photoURL={profile.photoURL}
              size="md"
              isOnline={profile.isOnline}
            />
            <div className="flex-1 text-right">
              <p className="font-bold" style={{ color: 'var(--theme-text)' }}>{profile.displayName}</p>
              <p className="text-xs" style={{ color: 'var(--theme-text-secondary)' }}>{profile.email}</p>
              <p className="text-xs mt-0.5" style={{ color: 'var(--theme-text-secondary)' }}>
                {profile.role || profile.department || 'ערוך פרופיל'}
              </p>
            </div>
            <ChevronLeft className="w-5 h-5 text-[var(--theme-text-secondary)] group-hover:text-[var(--theme-text)] transition-colors" />
          </button>
        </div>

        {/* Status */}
        <SettingsSection icon={<User className="w-4 h-4" />} title="סטטוס">
          <div className="flex items-center gap-3 flex-wrap">
            <div className="flex gap-2 flex-wrap">
              {[
                { value: 'available' as const, label: 'פנוי', color: 'bg-green-500' },
                { value: 'busy' as const, label: 'תפוס', color: 'bg-amber-500' },
                { value: 'offline' as const, label: 'לא פעיל', color: 'bg-gray-500' },
              ].map(s => (
                <button
                  key={s.value}
                  onClick={() => handleStatusChange(s.value)}
                  className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                    profile.status === s.value
                      ? 'bg-[var(--theme-accent-glow)] text-[var(--theme-accent)] ring-1 ring-[var(--theme-accent)]'
                      : 'text-[var(--theme-text-secondary)] hover:bg-[var(--theme-accent-glow)]'
                  }`}
                  style={profile.status !== s.value ? { background: 'var(--theme-bg)' } : undefined}
                >
                  <span className={`w-2 h-2 rounded-full ${s.color}`} />
                  {s.label}
                </button>
              ))}
            </div>
            {statusSaved && (
              <span className="flex items-center gap-1 text-xs font-medium text-green-400 animate-pulse">
                <CheckCircle className="w-3.5 h-3.5" />
                סטטוס עודכן
              </span>
            )}
          </div>
          <div className="mt-3 pt-3 border-t flex items-center justify-between" style={{ borderColor: 'var(--theme-border)' }}>
            <div>
              <p className="text-sm font-medium" style={{ color: 'var(--theme-text)' }}>פתוח להצעות עבודה</p>
              <p className="text-xs" style={{ color: 'var(--theme-text-secondary)' }}>יוצג כמחפש עבודה באלפון</p>
            </div>
            <button
              onClick={handleToggleOpenToWork}
              className={`relative w-11 h-6 rounded-full transition-colors ${profile.openToWork ? 'bg-[var(--theme-accent)]' : 'bg-gray-600'}`}
            >
              <span className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${profile.openToWork ? 'right-0.5' : 'right-[22px]'}`} />
            </button>
          </div>
        </SettingsSection>

        {/* Theme */}
        <SettingsSection icon={<Palette className="w-4 h-4" />} title="ערכת נושא">
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {(Object.entries(themes) as [ThemeName, typeof themes.dark][]).map(([key, t]) => (
              <button
                key={key}
                onClick={() => setTheme(key)}
                className={`flex items-center gap-2 px-3 py-2.5 rounded-lg text-sm transition-all ${
                  theme === key
                    ? 'bg-[var(--theme-accent-glow)] text-[var(--theme-accent)] ring-1 ring-[var(--theme-accent)]/30'
                    : 'text-[var(--theme-text-secondary)] hover:bg-[var(--theme-accent-glow)]'
                }`}
                style={theme !== key ? { background: 'var(--theme-bg)' } : undefined}
              >
                <span className="text-lg">{t.emoji}</span>
                <span className="font-medium">{t.label}</span>
                {theme === key && <CheckCircle className="w-3.5 h-3.5 mr-auto" />}
              </button>
            ))}
          </div>
        </SettingsSection>

        {/* Notifications */}
        <SettingsSection icon={<Bell className="w-4 h-4" />} title="התראות">
          <div className="space-y-3">
            <ToggleRow
              icon={<Bell className="w-4 h-4" />}
              label="התראות Push"
              description="קבל התראות על עדכוני לוח הפקות"
              enabled={notificationsEnabled}
              onToggle={handleToggleNotifications}
            />
            <ToggleRow
              icon={<Volume2 className="w-4 h-4" />}
              label="צלילים"
              description="צליל בעת הודעה חדשה"
              enabled={soundEnabled}
              onToggle={handleToggleSound}
            />
          </div>
        </SettingsSection>

        {/* Privacy */}
        <SettingsSection icon={<Shield className="w-4 h-4" />} title="פרטיות ואבטחה">
          <div className="space-y-3">
            <ToggleRow
              icon={<Eye className="w-4 h-4" />}
              label="הצג סטטוס מקוון"
              description="אנשים אחרים יוכלו לראות כשאתה מחובר"
              enabled={profile.isOnline}
              onToggle={() => updateUserProfile({ isOnline: !profile.isOnline })}
            />
            <ToggleRow
              icon={<Smartphone className="w-4 h-4" />}
              label="הצג מספר טלפון"
              description="הצג את מספר הטלפון שלך באלפון"
              enabled={profile.showPhone !== false}
              onToggle={handleToggleShowPhone}
            />
            {profile.linkedContactId && (
              <div className="border-t pt-3" style={{ borderColor: 'var(--theme-border)' }}>
                <button
                  onClick={() => setShowDeleteProfileConfirm(true)}
                  className="w-full flex items-center justify-center gap-2 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm font-bold text-red-300 transition-colors hover:bg-red-500/20"
                >
                  <Trash2 className="h-4 w-4" />
                  מחק את הפרופיל שלי מהאינדקס
                </button>
              </div>
            )}
          </div>
        </SettingsSection>

        {showDeleteProfileConfirm && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm">
            <div
              className="w-full max-w-md rounded-2xl border p-5 shadow-2xl"
              style={{ background: 'var(--theme-bg-card)', borderColor: 'var(--theme-border)' }}
              role="dialog"
              aria-modal="true"
              aria-labelledby="delete-directory-profile-title"
            >
              <div className="mb-4 flex items-start gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-red-500/15 text-red-300">
                  <AlertTriangle className="h-5 w-5" />
                </div>
                <div>
                  <h2 id="delete-directory-profile-title" className="text-base font-black" style={{ color: 'var(--theme-text)' }}>
                    מחיקת פרופיל מהאינדקס
                  </h2>
                  <p className="mt-2 text-sm leading-relaxed" style={{ color: 'var(--theme-text-secondary)' }}>
                    האם אתה בטוח? פעולה זו תסיר את פרטיך מהמאגר ולא ניתנת לביטול.
                  </p>
                </div>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => setShowDeleteProfileConfirm(false)}
                  disabled={deletingProfile}
                  className="flex-1 rounded-lg px-4 py-2.5 text-sm font-medium transition-colors disabled:opacity-60"
                  style={{ background: 'var(--theme-bg)', color: 'var(--theme-text-secondary)' }}
                >
                  ביטול
                </button>
                <button
                  onClick={handleDeleteDirectoryProfile}
                  disabled={deletingProfile}
                  className="flex-1 rounded-lg bg-red-500 px-4 py-2.5 text-sm font-bold text-white transition-colors hover:bg-red-600 disabled:opacity-60"
                >
                  {deletingProfile ? 'מוחק...' : 'כן, מחק את הפרופיל שלי'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Sign Out */}
        <div className="rounded-xl border overflow-hidden" style={{ background: 'var(--theme-bg-card)', borderColor: 'var(--theme-border)' }}>
          {!showLogoutConfirm ? (
            <button
              onClick={() => setShowLogoutConfirm(true)}
              className="w-full flex items-center gap-3 px-4 py-4 text-red-400 hover:bg-red-500/10 transition-all"
            >
              <LogOut className="w-5 h-5" />
              <span className="font-bold">התנתקות</span>
            </button>
          ) : (
            <div className="p-4">
              <p className="text-sm font-bold mb-3" style={{ color: 'var(--theme-text)' }}>
                בטוח שברצונך להתנתק?
              </p>
              <div className="flex gap-2">
                <button
                  onClick={handleLogout}
                  className="flex-1 py-2.5 rounded-lg bg-red-500 text-white text-sm font-bold hover:bg-red-600 transition-colors"
                >
                  כן, התנתק
                </button>
                <button
                  onClick={() => setShowLogoutConfirm(false)}
                  className="flex-1 py-2.5 rounded-lg text-sm font-medium transition-colors"
                  style={{ background: 'var(--theme-bg)', color: 'var(--theme-text-secondary)' }}
                >
                  ביטול
                </button>
              </div>
            </div>
          )}
        </div>

        {/* App Info */}
        <div className="text-center py-4">
          <p className="text-xs" style={{ color: 'var(--theme-text-secondary)', opacity: 0.5 }}>
            TV Industry IL v1.0.1
          </p>
        </div>
      </div>
    </div>
  );
}

function SettingsSection({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border" style={{ background: 'var(--theme-bg-card)', borderColor: 'var(--theme-border)' }}>
      <div className="flex items-center gap-2 px-4 py-3 border-b" style={{ borderColor: 'var(--theme-border)' }}>
        <span className="text-[var(--theme-accent)]">{icon}</span>
        <h2 className="text-sm font-bold" style={{ color: 'var(--theme-text)' }}>{title}</h2>
      </div>
      <div className="p-4">{children}</div>
    </div>
  );
}

function ToggleRow({
  icon, label, description, enabled, onToggle,
}: {
  icon: React.ReactNode;
  label: string;
  description: string;
  enabled: boolean;
  onToggle: () => void;
}) {
  return (
    <div className="flex items-center gap-3">
      <span className="text-[var(--theme-text-secondary)]">{icon}</span>
      <div className="flex-1">
        <p className="text-sm font-medium" style={{ color: 'var(--theme-text)' }}>{label}</p>
        <p className="text-xs" style={{ color: 'var(--theme-text-secondary)' }}>{description}</p>
      </div>
      <button
        onClick={onToggle}
        className={`relative w-11 h-6 rounded-full transition-colors ${enabled ? 'bg-[var(--theme-accent)]' : 'bg-gray-600'}`}
      >
        <span className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${enabled ? 'right-0.5' : 'right-[22px]'}`} />
      </button>
    </div>
  );
}
