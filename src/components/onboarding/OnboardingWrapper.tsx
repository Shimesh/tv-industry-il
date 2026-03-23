'use client';

import { ReactNode } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { ProfileLinker } from '@/components/onboarding/ProfileLinker';

export default function OnboardingWrapper({ children }: { children: ReactNode }) {
  const { user, profile, loading } = useAuth();

  // Show onboarding if: logged in + profile loaded + not completed + not linked
  const needsOnboarding =
    !loading &&
    user !== null &&
    profile !== null &&
    !profile.onboardingComplete &&
    !profile.linkedContactId;

  return (
    <>
      {children}
      {needsOnboarding && (
        <ProfileLinker
          onComplete={() => {
            // Profile will reload via onSnapshot
          }}
        />
      )}
    </>
  );
}
