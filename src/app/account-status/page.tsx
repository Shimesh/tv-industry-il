'use client';

import { LogOut, ShieldAlert, Clock3 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { normalizeApprovalStatus } from '@/lib/userApproval';

export default function AccountStatusPage() {
  const { user, profile, loading, profileReady, logout } = useAuth();
  const router = useRouter();
  const approvalStatus = normalizeApprovalStatus(profile?.approvalStatus, 'active');
  const blocked = approvalStatus === 'blocked';
  const Icon = blocked ? ShieldAlert : Clock3;

  async function handleLogout() {
    await logout();
    router.replace('/login');
  }

  if (loading || (user && !profileReady)) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-950 px-4" dir="rtl">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-purple-400/30 border-t-purple-300" />
      </div>
    );
  }

  if (!user) {
    router.replace('/login');
    return null;
  }

  if (approvalStatus === 'active') {
    router.replace('/');
    return null;
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-950 px-4 py-10 text-white" dir="rtl">
      <div className="w-full max-w-lg text-center">
        <div className={`mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-2xl border ${
          blocked
            ? 'border-red-400/30 bg-red-500/10 text-red-300'
            : 'border-amber-400/30 bg-amber-500/10 text-amber-300'
        }`}>
          <Icon className="h-8 w-8" />
        </div>
        <h1 className="mb-3 text-2xl font-bold">
          {blocked ? 'הגישה לחשבון הוגבלה' : 'החשבון ממתין לאישור'}
        </h1>
        <p className="mx-auto max-w-md text-base leading-8 text-gray-300">
          {blocked
            ? 'הגישה לחשבונך הוגבלה. נא לפנות למנהל המערכת.'
            : 'חשבונך ממתין לאישור מנהל המערכת. הודעה תישלח אליך ברגע שהגישה תאושר.'}
        </p>
        <button
          type="button"
          onClick={() => void handleLogout()}
          className="mx-auto mt-8 inline-flex items-center gap-2 rounded-xl border border-gray-700 bg-gray-900 px-5 py-3 text-sm font-semibold text-gray-100 transition-colors hover:bg-gray-800"
        >
          <LogOut className="h-4 w-4" />
          התנתק
        </button>
      </div>
    </div>
  );
}
