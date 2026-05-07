'use client';

import { useEffect, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';
import dynamic from 'next/dynamic';
import { ThemeProvider } from '@/contexts/ThemeContext';
import { AuthProvider } from '@/contexts/AuthContext';
import { AppConfigProvider } from '@/contexts/AppConfigContext';
import { AppDataProvider } from '@/contexts/AppDataContext';
import { CallProvider } from '@/contexts/CallContext';
import { NotificationProvider } from '@/contexts/NotificationContext';
import { ToastProvider } from '@/contexts/ToastContext';
import IncomingCall from '@/components/call/IncomingCall';
import CallScreen from '@/components/call/CallScreen';
import ConsentGate, { useConsentGateState } from '@/components/ConsentGate';
import OnboardingWrapper from '@/components/onboarding/OnboardingWrapper';
import { useOnlineStatus } from '@/hooks/useOnlineStatus';
import { useAuth } from '@/contexts/AuthContext';

// ssr:false ensures this component never runs during SSR or hydration,
// preventing the ToastProvider mismatch that causes the hydration error.
const FCMForegroundListener = dynamic(
  () => import('@/components/FCMTokenRegistration').then((mod) => mod.FCMForegroundListener),
  { ssr: false },
);

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

function ConsentBoundary({ children }: { children: React.ReactNode }) {
  const { isCheckingConsent, requiresConsent } = useConsentGateState();

  if (isCheckingConsent) {
    return (
      <div className="flex min-h-screen w-full items-center justify-center px-4" dir="rtl">
        <div className="rounded-xl border px-5 py-4 text-sm font-semibold" style={{ background: 'var(--theme-bg-card)', borderColor: 'var(--theme-border)', color: 'var(--theme-text-secondary)' }}>
          טוען את פרטי המשתמש...
        </div>
      </div>
    );
  }

  if (requiresConsent) {
    return <ConsentGate />;
  }

  return <>{children}</>;
}

export function Providers({ children }: { children: React.ReactNode }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);

  // Before hydration completes, render children without any client-only UI providers
  // (ToastProvider renders a fixed <div> that causes server/client HTML mismatch).
  // ThemeProvider and AuthProvider are pure context — no DOM output — so they are safe.
  if (!mounted) {
    return (
      <ThemeProvider>
        <AuthProvider>
          <AppConfigProvider>
            <AppDataProvider>
              <NotificationProvider>
                {children}
              </NotificationProvider>
            </AppDataProvider>
          </AppConfigProvider>
        </AuthProvider>
      </ThemeProvider>
    );
  }

  return (
    <ThemeProvider>
      <AuthProvider>
        <AppConfigProvider>
          {/* AppDataProvider must be inside AuthProvider — useContacts() calls useAuth() internally */}
          <AppDataProvider>
            <NotificationProvider>
              <ToastProvider>
                <FCMForegroundListener />
                <CallProvider>
                  <OnboardingWrapper>
                    <ConsentBoundary>
                      <PresenceManager />
                      <UsageTracker />
                      <ConsentGate />
                      {children}
                      <IncomingCall />
                      <CallScreen />
                    </ConsentBoundary>
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
