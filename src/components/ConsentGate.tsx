'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Loader2, ShieldCheck } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';

const PUBLIC_LEGAL_ROUTES = new Set(['/terms', '/privacy', '/accessibility']);

export function useConsentGateState() {
  const pathname = usePathname();
  const { user, profile, loading, profileReady } = useAuth();
  const isLegalRoute = PUBLIC_LEGAL_ROUTES.has(pathname);
  const isCheckingConsent = Boolean(!isLegalRoute && (loading || (user && !profileReady)));
  const requiresConsent = Boolean(user && !isLegalRoute && !loading && profileReady && profile && profile.is_consented !== true);

  return { isLegalRoute, isCheckingConsent, requiresConsent };
}

export default function ConsentGate() {
  const { updateUserProfile } = useAuth();
  const { requiresConsent } = useConsentGateState();
  const [accepted, setAccepted] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  if (!requiresConsent) return null;

  const handleAccept = async () => {
    if (!accepted || saving) return;

    setSaving(true);
    setError('');

    try {
      await updateUserProfile({ is_consented: true });
    } catch {
      setError('לא הצלחנו לשמור את האישור. נסה שוב בעוד רגע.');
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/75 px-4 py-6 backdrop-blur-sm" dir="rtl">
      <div
        className="w-full max-w-lg rounded-2xl border p-5 shadow-2xl sm:p-6"
        style={{ background: 'var(--theme-bg-card)', borderColor: 'var(--theme-border)', color: 'var(--theme-text)' }}
        role="dialog"
        aria-modal="true"
        aria-labelledby="consent-gate-title"
      >
        <div className="mb-4 flex items-center gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-purple-500/15 text-purple-300">
            <ShieldCheck className="h-6 w-6" />
          </div>
          <div>
            <h2 id="consent-gate-title" className="text-lg font-black">
              אישור תנאי שימוש ופרטיות
            </h2>
            <p className="text-sm" style={{ color: 'var(--theme-text-secondary)' }}>
              נדרש אישור חד־פעמי כדי להמשיך.
            </p>
          </div>
        </div>

        <p className="text-base font-semibold leading-7">
          כדי להמשיך להשתמש באפליקציה, עליך לאשר את{' '}
          <Link
            href="/terms"
            target="_blank"
            rel="noopener noreferrer"
            className="underline underline-offset-4 transition-colors hover:text-[var(--theme-accent)]"
          >
            תנאי השימוש
          </Link>{' '}
          ו
          <Link
            href="/privacy"
            target="_blank"
            rel="noopener noreferrer"
            className="underline underline-offset-4 transition-colors hover:text-[var(--theme-accent)]"
          >
            מדיניות הפרטיות
          </Link>
        </p>

        <label
          className="mt-5 flex cursor-pointer items-start gap-3 rounded-xl border p-3 text-sm leading-6"
          style={{ borderColor: 'var(--theme-border)', background: 'var(--theme-bg-secondary)' }}
        >
          <input
            type="checkbox"
            checked={accepted}
            onChange={(event) => setAccepted(event.target.checked)}
            className="mt-1 h-4 w-4 shrink-0 accent-purple-500"
          />
          <span>קראתי והסכמתי לתנאי השימוש ולמדיניות הפרטיות</span>
        </label>

        {error && (
          <p className="mt-3 rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-200">
            {error}
          </p>
        )}

        <button
          type="button"
          onClick={handleAccept}
          disabled={!accepted || saving}
          className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-purple-600 px-5 py-3 text-sm font-bold text-white transition hover:bg-purple-500 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {saving && <Loader2 className="h-4 w-4 animate-spin" />}
          אני מסכים
        </button>
      </div>
    </div>
  );
}
