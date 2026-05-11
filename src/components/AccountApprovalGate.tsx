'use client';

import { useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { normalizeApprovalStatus } from '@/lib/userApproval';

const PUBLIC_PATH_PREFIXES = [
  '/login',
  '/terms',
  '/privacy',
  '/accessibility',
  '/account-status',
];

function isPublicPath(pathname: string): boolean {
  return PUBLIC_PATH_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}

export default function AccountApprovalGate({ children }: { children: React.ReactNode }) {
  const { user, profile, loading, profileReady } = useAuth();
  const pathname = usePathname() || '/';
  const router = useRouter();

  const approvalStatus = normalizeApprovalStatus(profile?.approvalStatus, 'active');
  const shouldRestrict = Boolean(user && profileReady && approvalStatus !== 'active');
  const publicPath = isPublicPath(pathname);

  useEffect(() => {
    if (loading || !user || !profileReady) return;
    if (approvalStatus !== 'active' && !publicPath) {
      router.replace('/account-status');
    }
  }, [approvalStatus, loading, profileReady, publicPath, router, user]);

  if (shouldRestrict && !publicPath) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-950 px-4" dir="rtl">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-purple-400/30 border-t-purple-300" />
      </div>
    );
  }

  return <>{children}</>;
}
