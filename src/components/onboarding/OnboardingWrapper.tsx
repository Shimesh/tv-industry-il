'use client';

import { ReactNode, Suspense, useEffect, useState } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { ProfileLinker } from '@/components/onboarding/ProfileLinker';
import AppTour from '@/components/onboarding/AppTour';

const SKIP_ONBOARDING_ROUTES = new Set(['/login', '/terms', '/privacy', '/accessibility']);

// Inner component that reads searchParams (requires Suspense boundary).
function OnboardingInner({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { user, profile, loading, profileReady, updateUserProfile } = useAuth();
  const [mounted, setMounted] = useState(false);
  const [tourDismissed, setTourDismissed] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const forceTour = searchParams.get('tour') === '1';

  const phoneAuthNeedsLink = Boolean(
    user?.phoneNumber &&
      profile &&
      !profile.profileId &&
      !profile.linkedContactId,
  );

  const shouldShowProfileLinker = Boolean(
    mounted &&
      user &&
      !loading &&
      profileReady &&
      profile &&
      profile.is_consented === true &&
      (profile.onboardingComplete !== true || phoneAuthNeedsLink) &&
      !SKIP_ONBOARDING_ROUTES.has(pathname),
  );

  const shouldShowTour = Boolean(
    !shouldShowProfileLinker &&
      !tourDismissed &&
      mounted &&
      user &&
      !loading &&
      profileReady &&
      profile &&
      profile.is_consented === true &&
      profile.onboardingComplete === true &&
      (profile.appTourSeen !== true || forceTour) &&
      !SKIP_ONBOARDING_ROUTES.has(pathname),
  );

  const handleTourComplete = async () => {
    setTourDismissed(true);
    try {
      await updateUserProfile({ appTourSeen: true });
    } catch {
      // non-critical — silently ignore
    }
  };

  return (
    <>
      {children}
      {shouldShowProfileLinker && <ProfileLinker />}
      {shouldShowTour && <AppTour onComplete={handleTourComplete} />}
    </>
  );
}

export default function OnboardingWrapper({ children }: { children: ReactNode }) {
  return (
    <Suspense fallback={<>{children}</>}>
      <OnboardingInner>{children}</OnboardingInner>
    </Suspense>
  );
}
