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
  const { user, loading } = useAuth();
  const router = useRouter();
  // Computed once on first render — avoids re-reads on every update
  const cachedRef = useRef(hasCachedSession());

  useEffect(() => {
    if (!loading && !user) {
      router.push('/login');
    }
  }, [user, loading, router]);

  if (loading) {
    // If there's a cached session the user was previously logged in —
    // render children optimistically so the page is visible immediately.
    if (cachedRef.current) return <>{children}</>;
    return fallback ?? null;
  }

  if (!user) return null;

  return <>{children}</>;
}
