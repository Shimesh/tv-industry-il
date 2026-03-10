'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import OnboardingTour from './OnboardingTour';

export default function OnboardingWrapper() {
  const { user, profile, updateUserProfile } = useAuth();
  const [showOnboarding, setShowOnboarding] = useState(false);

  useEffect(() => {
    if (user && profile && !profile.onboardingComplete) {
      // Small delay for better UX
      const timer = setTimeout(() => setShowOnboarding(true), 1000);
      return () => clearTimeout(timer);
    }
  }, [user, profile]);

  const handleComplete = async () => {
    setShowOnboarding(false);
    if (user) {
      try {
        await updateUserProfile({ onboardingComplete: true });
      } catch {
        // Store locally as fallback
        localStorage.setItem('tv-onboarding-complete', 'true');
      }
    }
  };

  if (!showOnboarding) return null;

  return <OnboardingTour onComplete={handleComplete} />;
}
