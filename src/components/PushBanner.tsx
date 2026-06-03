'use client';

import { useEffect, useRef, useState } from 'react';
import { Bell, BellOff, X } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { registerFcmToken } from '@/components/FCMTokenRegistration';

// Tracks when the banner was LAST SHOWN (not dismissed) — resets every N days.
const LAST_SHOWN_KEY = 'push_banner_shown_v4';
const COOLDOWN_DEFAULT_DAYS = 3;
const COOLDOWN_DENIED_DAYS = 7;

function getLastShownAt(): number | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(LAST_SHOWN_KEY);
    if (!raw) return null;
    const ts = parseInt(raw, 10);
    return isNaN(ts) ? null : ts;
  } catch {
    return null;
  }
}

function saveShown() {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(LAST_SHOWN_KEY, String(Date.now()));
  } catch {}
}

function shouldShowNow(permission: NotificationPermission): boolean {
  if (permission === 'granted') return false;
  const cooldownDays = permission === 'denied' ? COOLDOWN_DENIED_DAYS : COOLDOWN_DEFAULT_DAYS;
  const lastShown = getLastShownAt();
  if (!lastShown) return true;
  return Date.now() - lastShown > cooldownDays * 24 * 60 * 60 * 1000;
}

export default function PushBanner() {
  const { profile } = useAuth();
  const [permission, setPermission] = useState<NotificationPermission | null>(null);
  const [visible, setVisible] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const permStatusRef = useRef<PermissionStatus | null>(null);

  // Read initial permission
  useEffect(() => {
    if (typeof window === 'undefined' || !('Notification' in window)) return;
    setPermission(Notification.permission);

    // Monitor permission changes (e.g. after AuthContext triggers the browser dialog)
    if (navigator.permissions) {
      navigator.permissions.query({ name: 'notifications' as PermissionName }).then((status) => {
        permStatusRef.current = status;
        status.onchange = () => setPermission(Notification.permission);
      }).catch(() => undefined);
    }

    return () => {
      if (permStatusRef.current) permStatusRef.current.onchange = null;
    };
  }, []);

  // Decide whether to show the banner
  useEffect(() => {
    if (!profile?.is_consented && !profile?.termsAccepted) return;
    if (permission === null || permission === 'granted') return;
    if (typeof window === 'undefined' || !('Notification' in window)) return;

    if (shouldShowNow(permission)) {
      setVisible(true);
      saveShown(); // record that we showed it NOW
    }
  }, [profile?.is_consented, profile?.termsAccepted, permission]);

  if (!visible) return null;

  const isDenied = permission === 'denied';

  const dismiss = () => setVisible(false);

  const handleEnable = async () => {
    if (isDenied) {
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
      setPermission(Notification.permission);
      setError(false);
      dismiss();
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
            ? 'התראות חסומות — להפעלה: הגדרות דפדפן ← אתרים ← התראות ← הסר חסימה'
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
