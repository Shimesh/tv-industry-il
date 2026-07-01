'use client';

import { useEffect, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';
import dynamic from 'next/dynamic';
import { VersionAnnouncer } from '@/components/VersionAnnouncer';
import { ThemeProvider } from '@/contexts/ThemeContext';
import { WorldCupProvider } from '@/contexts/WorldCupContext';
import { AuthProvider } from '@/contexts/AuthContext';
import { AppConfigProvider } from '@/contexts/AppConfigContext';
import { AppDataProvider } from '@/contexts/AppDataContext';
import { CallProvider } from '@/contexts/CallContext';
import { NotificationProvider } from '@/contexts/NotificationContext';
import { ToastProvider } from '@/contexts/ToastContext';
import { ProductionRegistryProvider } from '@/contexts/ProductionRegistryContext';
import IncomingCall from '@/components/call/IncomingCall';
import CallScreen from '@/components/call/CallScreen';
import CallTones from '@/components/call/CallTones';
import ConsentGate, { useConsentGateState } from '@/components/ConsentGate';
import OnboardingWrapper from '@/components/onboarding/OnboardingWrapper';
import AccountApprovalGate from '@/components/AccountApprovalGate';
import { useOnlineStatus } from '@/hooks/useOnlineStatus';
import { useAuth } from '@/contexts/AuthContext';

// ssr:false ensures this component never runs during SSR or hydration,
// preventing the ToastProvider mismatch that causes the hydration error.
const FCMForegroundListener = dynamic(
  () => import('@/components/FCMTokenRegistration').then((mod) => mod.FCMForegroundListener),
  { ssr: false },
);

const PushBanner = dynamic(() => import('@/components/PushBanner'), { ssr: false });

function PresenceManager() {
  const { user } = useAuth();
  useOnlineStatus(user?.uid);
  return null;
}

function ContactLinker() {
  const { user, profile } = useAuth();
  const linkedRef = useRef(false);

  useEffect(() => {
    if (!user || !profile) return;
    if (profile.linkedContactId != null && String(profile.linkedContactId).trim()) return;
    if (linkedRef.current) return;
    linkedRef.current = true;

    void (async () => {
      try {
        const token = await user.getIdToken();
        await fetch('/api/user/link-contact', {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}` },
        });
      } catch { /* silent */ }
    })();
  }, [user, profile]);

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
          viewport: `${window.innerWidth}x${window.innerHeight}`,
          screen: `${window.screen.width}x${window.screen.height}`,
          devicePixelRatio: window.devicePixelRatio || 1,
          colorGamut: window.matchMedia('(color-gamut: rec2020)').matches
            ? 'rec2020'
            : window.matchMedia('(color-gamut: p3)').matches
              ? 'p3'
              : 'srgb',
          preferredColorScheme: window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light',
          displayMode: window.matchMedia('(display-mode: standalone)').matches ? 'standalone' : 'browser',
        }),
        keepalive: true,
      }).catch(() => {});
    })();
  }, [loading, pathname, user]);

  return null;
}

function ConsentBoundary({ children }: { children: React.ReactNode }) {
  const { requiresConsent } = useConsentGateState();

  // Always render children immediately — ConsentGate is a fixed overlay and
  // will appear on top if consent is required once the profile loads.
  return (
    <>
      {children}
      {requiresConsent && <ConsentGate />}
    </>
  );
}

export function Providers({ children }: { children: React.ReactNode }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);

  useEffect(() => {
    try {
      const url = new URL(window.location.href);
      if (url.searchParams.has('reset_theme') || url.searchParams.has('reset')) {
        localStorage.removeItem('tv-industry-il-accessibility');
        localStorage.removeItem('tv-industry-il-accessibility-position');
        localStorage.removeItem('tv-industry-theme');
        document.body.classList.remove('accessibility-high-contrast', 'accessibility-stop-animations');
        document.documentElement.classList.remove('accessibility-large-text');
        url.searchParams.delete('reset_theme');
        url.searchParams.delete('reset');
        window.history.replaceState({}, '', url.toString());
      }
    } catch { /* ignore */ }
  }, []);

  // Single stable provider tree — {children} always sits at the same depth so React
  // never unmounts the page when `mounted` flips from false→true.
  // Utility components that must not run during SSR are guarded by {mounted && …}.
  // ToastProvider has its own internal mounted guard for its fixed-position DOM node.
  return (
    <ThemeProvider>
      <WorldCupProvider>
        <AuthProvider>
          <AppConfigProvider>
            {/* AppDataProvider must be inside AuthProvider — useContacts() calls useAuth() internally */}
            <AppDataProvider>
              <NotificationProvider>
                <ToastProvider>
                  <ProductionRegistryProvider>
                    {mounted && <VersionAnnouncer />}
                    {mounted && <FCMForegroundListener />}
                    {mounted && <PushBanner />}
                    {mounted && <ContactLinker />}
                    <CallProvider>
                      <AccountApprovalGate>
                        <OnboardingWrapper>
                          <ConsentBoundary>
                            <PresenceManager />
                            <UsageTracker />
                            <ConsentGate />
                            {children}
                            <CallTones />
                            <IncomingCall />
                            <CallScreen />
                          </ConsentBoundary>
                        </OnboardingWrapper>
                      </AccountApprovalGate>
                    </CallProvider>
                  </ProductionRegistryProvider>
                </ToastProvider>
              </NotificationProvider>
            </AppDataProvider>
          </AppConfigProvider>
        </AuthProvider>
      </WorldCupProvider>
    </ThemeProvider>
  );
}
