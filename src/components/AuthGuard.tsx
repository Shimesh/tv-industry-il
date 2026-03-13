'use client';

import { useAuth } from '@/contexts/AuthContext';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { Tv } from 'lucide-react';

interface AuthGuardProps {
  children: React.ReactNode;
  fallback?: React.ReactNode;
}

export default function AuthGuard({ children, fallback }: AuthGuardProps) {
  const { user, loading } = useAuth();
  const router = useRouter();

  console.log('[AUTHGUARD] render - loading:', loading, 'user:', user?.email ?? 'null');

  useEffect(() => {
    console.log('[AUTHGUARD] useEffect - loading:', loading, 'user:', user?.email ?? 'null');
    if (!loading && !user) {
      console.log('[AUTHGUARD] redirecting to /login (no user after loading complete)');
      router.push('/login');
    }
  }, [user, loading, router]);

  if (loading) {
    return (
      fallback || (
        <div className="min-h-[60vh] flex items-center justify-center">
          <div className="text-center">
            <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-gradient-to-br from-purple-500 to-blue-500 flex items-center justify-center animate-pulse">
              <Tv className="w-8 h-8 text-white" />
            </div>
            <p className="text-[var(--theme-text-secondary)]">טוען...</p>
          </div>
        </div>
      )
    );
  }

  if (!user) return null;

  return <>{children}</>;
}
