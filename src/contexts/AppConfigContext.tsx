'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { ShieldAlert, Wrench } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';

type AppConfigState = {
  maintenanceMode: boolean;
  boardAnnouncement: string;
  updatedAt: string | null;
  loading: boolean;
  refresh: () => Promise<void>;
  disableMaintenance: () => Promise<boolean>;
};

const AppConfigContext = createContext<AppConfigState>({
  maintenanceMode: false,
  boardAnnouncement: '',
  updatedAt: null,
  loading: true,
  refresh: async () => {},
  disableMaintenance: async () => false,
});

function MaintenanceScreen({ announcement }: { announcement: string }) {
  return (
    <div
      className="min-h-screen flex items-center justify-center px-6"
      style={{ background: 'var(--theme-bg)' }}
    >
      <div
        className="w-full max-w-md rounded-3xl border p-8 text-center"
        style={{
          background: 'var(--theme-bg-card)',
          borderColor: 'var(--theme-border)',
        }}
      >
        <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-amber-500/15 flex items-center justify-center">
          <Wrench className="w-8 h-8 text-amber-400" />
        </div>
        <h1 className="text-2xl font-black mb-2" style={{ color: 'var(--theme-text)' }}>
          האתר בתחזוקה
        </h1>
        <p className="text-sm leading-6 mb-4" style={{ color: 'var(--theme-text-secondary)' }}>
          אנחנו מבצעים כרגע עדכון מערכת. נחזור ממש בקרוב.
        </p>
        {announcement && (
          <div
            className="rounded-2xl px-4 py-3 text-sm"
            style={{ background: 'var(--theme-bg-secondary)', color: 'var(--theme-text-secondary)' }}
          >
            {announcement}
          </div>
        )}
      </div>
    </div>
  );
}

function MaintenanceBanner({
  announcement,
  onDisable,
}: {
  announcement: string;
  onDisable: () => Promise<boolean>;
}) {
  const [busy, setBusy] = useState(false);

  const handleDisable = useCallback(async () => {
    setBusy(true);
    const success = await onDisable();
    if (!success) {
      setBusy(false);
    }
  }, [onDisable]);

  return (
    <AnimatePresence>
      <motion.div
        initial={{ y: -64, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: -64, opacity: 0 }}
        transition={{ duration: 0.25, ease: 'easeOut' }}
        className="fixed left-0 right-0 z-[10020] px-3 sm:px-4"
        style={{ top: 'calc(var(--safe-area-top) + var(--app-header-height))' }}
      >
        <div
          className="max-w-7xl mx-auto rounded-b-2xl border border-amber-400/20 bg-amber-500/10 backdrop-blur-xl shadow-lg"
        >
          <div className="flex items-center gap-3 px-4 py-2.5">
            <div className="w-8 h-8 rounded-xl bg-amber-500/15 flex items-center justify-center shrink-0">
              <ShieldAlert className="w-4 h-4 text-amber-300" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-xs font-bold text-amber-200">מצב תחזוקה פעיל</div>
              <div className="text-[11px] truncate text-amber-100/90">
                {announcement || 'רק מנהלים יכולים להמשיך להשתמש באפליקציה כרגע.'}
              </div>
            </div>
            <button
              onClick={() => void handleDisable()}
              disabled={busy}
              className="px-3 py-1.5 rounded-full text-xs font-bold bg-amber-300 text-black hover:bg-amber-200 transition-colors disabled:opacity-60"
            >
              {busy ? 'מכבה...' : 'כבה תחזוקה'}
            </button>
          </div>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}

export function AppConfigProvider({ children }: { children: React.ReactNode }) {
  const { user, profile, loading: authLoading } = useAuth();
  const [maintenanceMode, setMaintenanceMode] = useState(false);
  const [boardAnnouncement, setBoardAnnouncement] = useState('');
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const isAdmin = profile?.siteRole === 'admin';

  const refresh = useCallback(async () => {
    try {
      const response = await fetch('/api/app-config', { cache: 'no-store' });
      const data = await response.json();
      setMaintenanceMode(data.maintenanceMode === true);
      setBoardAnnouncement(typeof data.boardAnnouncement === 'string' ? data.boardAnnouncement : '');
      setUpdatedAt(typeof data.updatedAt === 'string' ? data.updatedAt : null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
    const interval = window.setInterval(() => {
      void refresh();
    }, 15_000);
    return () => window.clearInterval(interval);
  }, [refresh]);

  const disableMaintenance = useCallback(async () => {
    if (!user || !isAdmin) {
      return false;
    }

    const token = await user.getIdToken();
    const response = await fetch('/api/admin/app-config', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        maintenanceMode: false,
        boardAnnouncement,
      }),
    });

    if (!response.ok) {
      return false;
    }

    setMaintenanceMode(false);
    return true;
  }, [boardAnnouncement, isAdmin, user]);

  const value = useMemo(
    () => ({
      maintenanceMode,
      boardAnnouncement,
      updatedAt,
      loading,
      refresh,
      disableMaintenance,
    }),
    [boardAnnouncement, disableMaintenance, loading, maintenanceMode, refresh, updatedAt],
  );

  const shouldBlockForMaintenance = maintenanceMode && !loading && !authLoading && !isAdmin;

  return (
    <AppConfigContext.Provider value={value}>
      {maintenanceMode && isAdmin && (
        <MaintenanceBanner
          announcement={boardAnnouncement}
          onDisable={disableMaintenance}
        />
      )}
      {shouldBlockForMaintenance ? (
        <MaintenanceScreen announcement={boardAnnouncement} />
      ) : (
        children
      )}
    </AppConfigContext.Provider>
  );
}

export function useAppConfig() {
  return useContext(AppConfigContext);
}
