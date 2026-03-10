'use client';

import { ThemeProvider } from '@/contexts/ThemeContext';
import { AuthProvider } from '@/contexts/AuthContext';
import { CallProvider } from '@/contexts/CallContext';
import IncomingCall from '@/components/call/IncomingCall';
import CallScreen from '@/components/call/CallScreen';
import OnboardingWrapper from '@/components/onboarding/OnboardingWrapper';

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider>
      <AuthProvider>
        <CallProvider>
          {children}
          <IncomingCall />
          <CallScreen />
          <OnboardingWrapper />
        </CallProvider>
      </AuthProvider>
    </ThemeProvider>
  );
}
