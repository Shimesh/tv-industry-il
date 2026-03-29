'use client';

import { useState, useRef, useEffect } from 'react';
import { useNotifications } from '@/contexts/NotificationContext';
import { Bell, BellRing, Check, CheckCheck, Trash2, X, Calendar, Users, Upload, RefreshCw, Info } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

const typeIcons: Record<string, typeof Bell> = {
  production_reminder: Calendar,
  crew_assignment: Users,
  file_upload: Upload,
  status_change: RefreshCw,
  general: Info,
};

const typeColors: Record<string, string> = {
  production_reminder: '#f59e0b',
  crew_assignment: '#3b82f6',
  file_upload: '#22c55e',
  status_change: '#a855f7',
  general: '#6b7280',
};

export default function NotificationBell() {
  const {
    notifications, unreadCount,
    markAsRead, markAllAsRead, clearAll,
    browserPermission, requestBrowserPermission,
  } = useNotifications();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  return (
    <div className="relative" ref={ref}>
      {/* Bell button */}
      <button
        onClick={() => setOpen(!open)}
        className="relative p-2 rounded-lg transition-all hover:bg-[var(--theme-accent-glow)]"
        style={{ color: 'var(--theme-text-secondary)' }}
      >
        {unreadCount > 0 ? (
          <BellRing className="w-5 h-5 text-[var(--theme-accent)]" />
        ) : (
          <Bell className="w-5 h-5" />
        )}
        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -left-0.5 min-w-[18px] h-[18px] flex items-center justify-center rounded-full bg-red-500 text-white text-[10px] font-bold px-1">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {/* Dropdown */}
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -10, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -10, scale: 0.95 }}
            className="absolute left-0 top-full mt-2 w-80 max-h-[70vh] rounded-xl border shadow-2xl z-50 overflow-hidden flex flex-col"
            style={{ background: 'var(--theme-bg-secondary)', borderColor: 'var(--theme-border)' }}
          >
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b" style={{ borderColor: 'var(--theme-border)' }}>
              <h3 className="font-bold text-sm" style={{ color: 'var(--theme-text)' }}>
                התראות {unreadCount > 0 && `(${unreadCount})`}
              </h3>
              <div className="flex items-center gap-1">
                {unreadCount > 0 && (
                  <button
                    onClick={() => markAllAsRead()}
                    className="p-1.5 rounded-lg text-xs hover:bg-[var(--theme-accent-glow)] transition-all"
                    style={{ color: 'var(--theme-text-secondary)' }}
                    title="סמן הכל כנקרא"
                  >
                    <CheckCheck className="w-4 h-4" />
                  </button>
                )}
                {notifications.length > 0 && (
                  <button
                    onClick={() => clearAll()}
                    className="p-1.5 rounded-lg text-xs text-red-400 hover:bg-red-500/10 transition-all"
                    title="מחק הכל"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
              </div>
            </div>

            {/* Browser permission banner */}
            {browserPermission !== 'granted' && (
              <button
                onClick={requestBrowserPermission}
                className="mx-3 mt-2 p-2.5 rounded-lg text-xs text-right flex items-center gap-2 transition-all hover:opacity-80"
                style={{ background: 'var(--theme-accent-glow)', color: 'var(--theme-accent)' }}
              >
                <BellRing className="w-4 h-4 shrink-0" />
                <span>הפעל התראות דפדפן כדי לקבל עדכונים בזמן אמת</span>
              </button>
            )}

            {/* Notifications list */}
            <div className="flex-1 overflow-y-auto">
              {notifications.length === 0 ? (
                <div className="text-center py-10 text-sm" style={{ color: 'var(--theme-text-secondary)' }}>
                  <Bell className="w-8 h-8 mx-auto mb-2 opacity-30" />
                  <p>אין התראות</p>
                </div>
              ) : (
                notifications.slice(0, 50).map(notif => {
                  const Icon = typeIcons[notif.type] || Info;
                  const color = typeColors[notif.type] || '#6b7280';

                  return (
                    <div
                      key={notif.id}
                      onClick={() => !notif.read && markAsRead(notif.id)}
                      className={`flex items-start gap-3 px-4 py-3 border-b cursor-pointer transition-all hover:bg-[var(--theme-accent-glow)] ${
                        !notif.read ? 'bg-[var(--theme-accent-glow)]' : ''
                      }`}
                      style={{ borderColor: 'var(--theme-border)' }}
                    >
                      <div className="w-8 h-8 rounded-full flex items-center justify-center shrink-0 mt-0.5"
                        style={{ background: color + '20' }}
                      >
                        <Icon className="w-4 h-4" style={{ color }} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate" style={{ color: 'var(--theme-text)' }}>
                          {notif.title}
                        </p>
                        <p className="text-xs mt-0.5" style={{ color: 'var(--theme-text-secondary)' }}>
                          {notif.message}
                        </p>
                        <p className="text-[10px] mt-1" style={{ color: 'var(--theme-text-secondary)' }}>
                          {new Date(notif.createdAt).toLocaleString('he-IL', {
                            day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
                          })}
                        </p>
                      </div>
                      {!notif.read && (
                        <div className="w-2 h-2 rounded-full shrink-0 mt-2" style={{ background: 'var(--theme-accent)' }} />
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
