'use client';

import { useEffect, useState } from 'react';
import { Bell, X } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { registerFcmToken } from '@/components/FCMTokenRegistration';

const DISMISSED_KEY = 'push_banner_dismissed_v2';

export default function PushBanner() {
  const { profile } = useAuth();
  const [visible, setVisible] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!profile?.is_consented) return;
    if (typeof window === 'undefined') return;
    if (!('Notification' in window)) return;
    if (Notification.permission !== 'default') return;
    if (localStorage.getItem(DISMISSED_KEY)) return;
    setVisible(true);
  }, [profile?.is_consented]);

  if (!visible) return null;

  const dismiss = () => {
    localStorage.setItem(DISMISSED_KEY, '1');
    setVisible(false);
  };

  const handleEnable = async () => {
    if (!profile?.uid) return;
    setLoading(true);
    setError(false);
    const result = await registerFcmToken(profile.uid);
    setLoading(false);
    if (result.ok) {
      dismiss();
    } else {
      setError(true);
    }
  };

  return (
    <div
      className="fixed top-0 inset-x-0 z-[9998] flex items-center justify-between gap-3 px-4 py-2.5 text-sm"
      style={{ background: error ? 'var(--theme-error, #dc2626)' : 'var(--theme-accent)', color: '#fff' }}
      dir="rtl"
    >
      <div className="flex items-center gap-2 min-w-0">
        <Bell className="w-4 h-4 shrink-0" />
        <span className="truncate">
          {error ? 'לא הצלחנו להפעיל התראות. נסה שוב.' : 'הישאר מעודכן על הפקות בזמן אמת!'}
        </span>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <button
          onClick={handleEnable}
          disabled={loading}
          className="px-3 py-1 rounded-lg bg-white/20 hover:bg-white/30 font-bold transition-colors disabled:opacity-60 text-xs"
        >
          {loading ? '...' : error ? 'נסה שוב' : 'הפעל התראות'}
        </button>
        <button onClick={dismiss} className="opacity-70 hover:opacity-100 transition-opacity">
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
