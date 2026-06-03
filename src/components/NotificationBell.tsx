'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AnimatePresence, motion } from 'framer-motion';
import {
  Bell,
  BellRing,
  Bug,
  Calendar,
  Check,
  CheckCheck,
  ExternalLink,
  Info,
  RefreshCw,
  Trash2,
  Upload,
  UserCheck,
  Users,
  Trophy,
} from 'lucide-react';

import { useNotifications } from '@/contexts/NotificationContext';

const typeIcons: Record<string, typeof Bell> = {
  production_reminder: Calendar,
  crew_assignment: Users,
  file_upload: Upload,
  status_change: RefreshCw,
  general: Info,
  bug_report: Bug,
  user_pending_approval: UserCheck,
  world_cup_goal_alert: Trophy,
  world_cup_match_start: Trophy,
};

const typeColors: Record<string, string> = {
  production_reminder: '#f59e0b',
  crew_assignment: '#3b82f6',
  file_upload: '#22c55e',
  status_change: '#a855f7',
  general: 'var(--theme-text-secondary)',
  bug_report: '#f59e0b',
  user_pending_approval: '#f59e0b',
  world_cup_goal_alert: '#D4AF37',
  world_cup_match_start: '#138a36',
};

function formatNotificationDate(value: number) {
  if (!value) return '';
  return new Date(value).toLocaleString('he-IL', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default function NotificationBell() {
  const router = useRouter();
  const {
    notifications,
    unreadCount,
    markAsRead,
    markAllAsRead,
    clearAll,
    refreshNotifications,
    browserPermission,
    requestBrowserPermission,
  } = useNotifications();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClick = (event: MouseEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  const openNotification = async (id: string, read: boolean, linkUrl?: string) => {
    if (!read) {
      await markAsRead(id);
    }
    if (linkUrl) {
      setOpen(false);
      router.push(linkUrl);
    }
  };

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => {
          const next = !open;
          setOpen(next);
          if (next) void refreshNotifications().catch(() => {});
        }}
        className="relative rounded-lg p-2 transition-all hover:bg-[var(--theme-accent-glow)]"
        style={{ color: 'var(--theme-text-secondary)' }}
        aria-label="התראות"
      >
        {unreadCount > 0 ? (
          <BellRing className="h-5 w-5 text-[var(--theme-accent)]" />
        ) : (
          <Bell className="h-5 w-5" />
        )}
        {unreadCount > 0 && (
          <span className="absolute -left-0.5 -top-0.5 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -10, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -10, scale: 0.95 }}
            className="absolute left-0 top-full z-50 mt-2 flex max-h-[70vh] w-80 max-w-[calc(100vw-1rem)] flex-col overflow-hidden rounded-xl border shadow-2xl"
            style={{ background: 'var(--theme-bg-secondary)', borderColor: 'var(--theme-border)' }}
            dir="rtl"
          >
            <div className="flex items-center justify-between border-b px-4 py-3" style={{ borderColor: 'var(--theme-border)' }}>
              <div>
                <h3 className="text-sm font-bold" style={{ color: 'var(--theme-text)' }}>
                  התראות {unreadCount > 0 ? `(${unreadCount})` : ''}
                </h3>
                {notifications.length > 0 ? (
                  <p className="mt-0.5 text-[11px]" style={{ color: 'var(--theme-text-secondary)' }}>
                    נשמרות כאן עד מחיקה ידנית
                  </p>
                ) : null}
              </div>
              <div className="flex items-center gap-1">
                {unreadCount > 0 && (
                  <button
                    onClick={() => void markAllAsRead()}
                    className="rounded-lg p-1.5 text-xs transition-all hover:bg-[var(--theme-accent-glow)]"
                    style={{ color: 'var(--theme-text-secondary)' }}
                    title="סמן הכל כנקרא"
                    aria-label="סמן הכל כנקרא"
                  >
                    <CheckCheck className="h-4 w-4" />
                  </button>
                )}
                {notifications.length > 0 && (
                  <button
                    onClick={() => void clearAll()}
                    className="rounded-lg p-1.5 text-xs text-red-400 transition-all hover:bg-red-500/10"
                    title="מחק הכל"
                    aria-label="מחק הכל"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                )}
              </div>
            </div>

            {browserPermission !== 'granted' && (
              <button
                onClick={requestBrowserPermission}
                className="mx-3 mt-2 flex items-center gap-2 rounded-lg p-2.5 text-right text-xs transition-all hover:opacity-80"
                style={{ background: 'var(--theme-accent-glow)', color: 'var(--theme-accent)' }}
              >
                <BellRing className="h-4 w-4 shrink-0" />
                <span>הפעל התראות דפדפן כדי לקבל עדכונים בזמן אמת</span>
              </button>
            )}

            <div className="flex-1 overflow-y-auto">
              {notifications.length === 0 ? (
                <div className="py-10 text-center text-sm" style={{ color: 'var(--theme-text-secondary)' }}>
                  <Bell className="mx-auto mb-2 h-8 w-8 opacity-30" />
                  <p>אין התראות</p>
                </div>
              ) : (
                notifications.slice(0, 50).map((notification) => {
                  const Icon = typeIcons[notification.type] || Info;
                  const color = typeColors[notification.type] || '#6b7280';

                  return (
                    <div
                      key={notification.id}
                      className={`flex items-start gap-3 border-b px-4 py-3 transition-all hover:bg-[var(--theme-accent-glow)] ${
                        !notification.read ? 'bg-[var(--theme-accent-glow)]' : 'opacity-75'
                      }`}
                      style={{ borderColor: 'var(--theme-border)' }}
                    >
                      <button
                        type="button"
                        onClick={() => void openNotification(notification.id, notification.read, notification.linkUrl)}
                        className="flex flex-1 items-start gap-3 text-right"
                      >
                        <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full" style={{ background: `${color}20` }}>
                          <Icon className="h-4 w-4" style={{ color }} />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5">
                            <p className="truncate text-sm font-medium" style={{ color: 'var(--theme-text)' }}>
                              {notification.title}
                            </p>
                            {notification.linkUrl ? <ExternalLink className="h-3 w-3 shrink-0 opacity-50" /> : null}
                          </div>
                          <p className="mt-0.5 text-xs leading-relaxed" style={{ color: 'var(--theme-text-secondary)' }}>
                            {notification.message}
                          </p>
                          <div className="mt-2 flex flex-wrap items-center gap-2 text-[10px]" style={{ color: 'var(--theme-text-secondary)' }}>
                            <span>{formatNotificationDate(notification.createdAt)}</span>
                            <span
                              className={`rounded-full border px-2 py-0.5 ${
                                notification.read
                                  ? 'border-green-500/30 bg-green-500/10 text-green-300'
                                  : 'border-red-500/30 bg-red-500/10 text-red-200'
                              }`}
                            >
                              {notification.read ? 'נקרא' : 'חדש'}
                            </span>
                          </div>
                        </div>
                      </button>

                      {!notification.read ? (
                        <button
                          type="button"
                          onClick={() => void markAsRead(notification.id)}
                          className="mt-1 rounded-full p-1 text-[var(--theme-accent)] hover:bg-[var(--theme-accent-glow)]"
                          title="סמן כנקרא"
                          aria-label="סמן כנקרא"
                        >
                          <Check className="h-3.5 w-3.5" />
                        </button>
                      ) : (
                        <CheckCheck className="mt-2 h-3.5 w-3.5 shrink-0 text-green-400" aria-label="נקרא" />
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
