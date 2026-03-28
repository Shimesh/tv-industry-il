'use client';

import { ThemeProvider } from '@/contexts/ThemeContext';
import { AuthProvider } from '@/contexts/AuthContext';
import { CallProvider } from '@/contexts/CallContext';
import { AppDataProvider } from '@/contexts/AppDataContext';
import { ToastProvider } from '@/contexts/ToastContext';
import IncomingCall from '@/components/call/IncomingCall';
import CallScreen from '@/components/call/CallScreen';
import OnboardingWrapper from '@/components/onboarding/OnboardingWrapper';

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider>
      <ToastProvider>
        <AuthProvider>
          <AppDataProvider>
            <CallProvider>
              <OnboardingWrapper>
                {children}
                <IncomingCall />
                <CallScreen />
              </OnboardingWrapper>
            </CallProvider>
          </AppDataProvider>
        </AuthProvider>
      </ToastProvider>
    </ThemeProvider>
  );
}
