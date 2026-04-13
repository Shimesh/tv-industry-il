'use client';

import { ThemeProvider } from '@/contexts/ThemeContext';
import { AuthProvider } from '@/contexts/AuthContext';
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

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider>
      <AuthProvider>
        {/* AppDataProvider must be inside AuthProvider — useContacts() calls useAuth() internally.
            All children share exactly ONE useContacts() instance via Context. */}
        <AppDataProvider>
          <NotificationProvider>
            <ToastProvider>
              <CallProvider>
                <OnboardingWrapper>
                  <PresenceManager />
                  {children}
                  <IncomingCall />
                  <CallScreen />
                </OnboardingWrapper>
              </CallProvider>
            </ToastProvider>
          </NotificationProvider>
        </AppDataProvider>
      </AuthProvider>
    </ThemeProvider>
  );
}
