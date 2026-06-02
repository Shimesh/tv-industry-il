'use client';

import { useEffect, useState } from 'react';
import { Bell, BellOff, X } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { registerFcmToken } from '@/components/FCMTokenRegistration';

const DISMISSED_KEY = 'push_banner_dismissed_v3';
const COOLDOWN_DEFAULT_DAYS = 3;
const COOLDOWN_DENIED_DAYS = 7;

function getDismissedAt(): number | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(DISMISSED_KEY);
    if (!raw) return null;
    const ts = parseInt(raw, 10);
    return isNaN(ts) ? null : ts;
  } catch {
    return null;
  }
}

function saveDismissed() {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(DISMISSED_KEY, String(Date.now()));
  } catch {}
}

function isCooldownOver(cooldownDays: number): boolean {
  const dismissedAt = getDismissedAt();
  if (dismissedAt === null) return true;
  return Date.now() - dismissedAt > cooldownDays * 24 * 60 * 60 * 1000;
}

export default function PushBanner() {
  const { profile } = useAuth();
  const [permission, setPermission] = useState<NotificationPermission | null>(null);
  const [visible, setVisible] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined' || !('Notification' in window)) return;
    setPermission(Notification.permission);
  }, []);

  useEffect(() => {
    if (!profile?.is_consented && !profile?.termsAccepted) return;
    if (permission === null) return;
    if (typeof window === 'undefined' || !('Notification' in window)) return;

    if (permission === 'default' && isCooldownOver(COOLDOWN_DEFAULT_DAYS)) {
      setVisible(true);
    } else if (permission === 'denied' && isCooldownOver(COOLDOWN_DENIED_DAYS)) {
      setVisible(true);
    }
  }, [profile?.is_consented, profile?.termsAccepted, permission]);

  if (!visible) return null;

  const isDenied = permission === 'denied';

  const dismiss = () => {
    saveDismissed();
    setVisible(false);
  };

  const handleEnable = async () => {
    if (isDenied) {
      // Can't re-request — send user to browser settings
      dismiss();
      return;
    }
    if (!profile?.uid) return;
    setLoading(true);
    setError(false);
    const result = await registerFcmToken(profile.uid);
    setLoading(false);
    if (result.ok) {
      setPermission('granted');
      dismiss();
    } else if (result.reason?.startsWith('permission-')) {
      setPermission('denied');
      setError(false);
    } else {
      setError(true);
    }
  };

  return (
    <div
      className="fixed top-0 inset-x-0 z-[9998] flex items-center justify-between gap-3 px-4 py-2.5 text-sm"
      style={{
        background: error
          ? 'var(--theme-error, #dc2626)'
          : isDenied
          ? 'var(--theme-bg-secondary, #1e293b)'
          : 'var(--theme-accent)',
        color: isDenied ? 'var(--theme-text, #e2e8f0)' : '#fff',
        borderBottom: isDenied ? '1px solid var(--theme-border)' : undefined,
      }}
      dir="rtl"
    >
      <div className="flex items-center gap-2 min-w-0">
        {isDenied ? (
          <BellOff className="w-4 h-4 shrink-0 text-amber-400" />
        ) : (
          <Bell className="w-4 h-4 shrink-0" />
        )}
        <span className="truncate text-xs sm:text-sm">
          {error
            ? 'לא הצלחנו להפעיל התראות. נסה שוב.'
            : isDenied
            ? 'התראות חסומות — כדאי להפעיל בהגדרות הדפדפן כדי לקבל עדכונים בזמן אמת'
            : 'הישאר מעודכן על הפקות בזמן אמת!'}
        </span>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        {!isDenied && (
          <button
            onClick={handleEnable}
            disabled={loading}
            className="px-3 py-1 rounded-lg bg-white/20 hover:bg-white/30 font-bold transition-colors disabled:opacity-60 text-xs"
          >
            {loading ? '...' : error ? 'נסה שוב' : 'הפעל התראות'}
          </button>
        )}
        <button onClick={dismiss} className="opacity-70 hover:opacity-100 transition-opacity" aria-label="סגור">
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
