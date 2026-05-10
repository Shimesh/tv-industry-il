'use client';

import { ReactNode } from 'react';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { ProfileLinker } from '@/components/onboarding/ProfileLinker';

const SKIP_ONBOARDING_ROUTES = new Set(['/login', '/terms', '/privacy', '/accessibility']);

export default function OnboardingWrapper({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const { user, profile, loading, profileReady } = useAuth();
  const phoneAuthNeedsLink = Boolean(
    user?.phoneNumber &&
      profile &&
      !profile.profileId &&
      !profile.linkedContactId,
  );
  const shouldShowProfileLinker = Boolean(
    user &&
      !loading &&
      profileReady &&
      profile &&
      profile.is_consented === true &&
      (profile.onboardingComplete !== true || phoneAuthNeedsLink) &&
      !SKIP_ONBOARDING_ROUTES.has(pathname),
  );

  return (
    <>
      {children}
      {shouldShowProfileLinker && <ProfileLinker />}
    </>
  );
}
