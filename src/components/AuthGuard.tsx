'use client';

import { useAuth } from '@/contexts/AuthContext';
import { useRouter } from 'next/navigation';
import { useEffect, useRef } from 'react';

interface AuthGuardProps {
  children: React.ReactNode;
  fallback?: React.ReactNode;
}

function hasCachedSession(): boolean {
  try {
    return Boolean(
      typeof window !== 'undefined' &&
      window.sessionStorage.getItem('tv-session-bootstrap-cache'),
    );
  } catch {
    return false;
  }
}

export default function AuthGuard({ children, fallback }: AuthGuardProps) {
  const { user, loading, profile, profileReady } = useAuth();
  const router = useRouter();
  const cachedRef = useRef(hasCachedSession());

  useEffect(() => {
    if (!loading && !user) {
      router.push('/login');
      return;
    }
    if (profileReady && profile?.approvalStatus && profile.approvalStatus !== 'active') {
      router.replace('/account-status');
    }
  }, [user, loading, profile, profileReady, router]);

  if (loading || (user && !profileReady)) {
    if (cachedRef.current) return <>{children}</>;
    return fallback ?? null;
  }

  if (!user) return null;

  if (profile?.approvalStatus && profile.approvalStatus !== 'active') return null;

  return <>{children}</>;
}
