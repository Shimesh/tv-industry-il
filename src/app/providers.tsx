'use client';

import { useEffect, useRef } from 'react';
import { usePathname } from 'next/navigation';
import { ThemeProvider } from '@/contexts/ThemeContext';
import { AuthProvider } from '@/contexts/AuthContext';
import { AppConfigProvider } from '@/contexts/AppConfigContext';
import { AppDataProvider } from '@/contexts/AppDataContext';
import { CallProvider } from '@/contexts/CallContext';
import { NotificationProvider } from '@/contexts/NotificationContext';
import { ToastProvider } from '@/contexts/ToastContext';
import IncomingCall from '@/components/call/IncomingCall';
import CallScreen from '@/components/call/CallScreen';
import OnboardingWrapper from '@/components/onboarding/OnboardingWrapper';
import { useOnlineStatus } from '@/hooks/useOnlineStatus';
import { useAuth } from '@/contexts/AuthContext';

function PresenceManager() {
  const { user } = useAuth();
  useOnlineStatus(user?.uid);
  return null;
}

function UsageTracker() {
  const pathname = usePathname();
  const { user, loading } = useAuth();
  const lastTrackedPath = useRef<string | null>(null);

  useEffect(() => {
    if (loading || !pathname || lastTrackedPath.current === pathname) return;
    lastTrackedPath.current = pathname;

    const getVisitorId = () => {
      try {
        const key = 'tv_visitor_id';
        const existing = localStorage.getItem(key);
        if (existing) return existing;
        const generated = crypto.randomUUID();
        localStorage.setItem(key, generated);
        return generated;
      } catch {
        return null;
      }
    };

    void (async () => {
      const token = await user?.getIdToken().catch(() => null);
      await fetch('/api/metrics/page-view', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          pathname,
          visitorId: getVisitorId(),
          referrer: document.referrer || null,
        }),
        keepalive: true,
      }).catch(() => {});
    })();
  }, [loading, pathname, user]);

  return null;
}

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider>
      <AuthProvider>
        <AppConfigProvider>
        {/* AppDataProvider must be inside AuthProvider — useContacts() calls useAuth() internally.
            All children share exactly ONE useContacts() instance via Context. */}
        <AppDataProvider>
          <NotificationProvider>
            <ToastProvider>
              <CallProvider>
                <OnboardingWrapper>
                  <PresenceManager />
                  <UsageTracker />
                  {children}
                  <IncomingCall />
                  <CallScreen />
                </OnboardingWrapper>
              </CallProvider>
            </ToastProvider>
          </NotificationProvider>
        </AppDataProvider>
        </AppConfigProvider>
      </AuthProvider>
    </ThemeProvider>
  );
}
