'use client';

import { useMemo, useState } from 'react';
import { usePathname } from 'next/navigation';
import { AnimatePresence, motion } from 'framer-motion';
import { AlertCircle, Loader2, Send, X } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';

export default function BugReportButton() {
  const pathname = usePathname();
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [description, setDescription] = useState('');
  const [action, setAction] = useState('');
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const pageLabel = useMemo(() => pathname || '/', [pathname]);

  if (!user) return null;

  const handleSubmit = async () => {
    if (description.trim().length < 8 || pending) return;
    setPending(true);
    setMessage(null);

    try {
      const token = await user.getIdToken();
      const response = await fetch('/api/bug-report', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          description: description.trim(),
          action: action.trim(),
          route: pageLabel,
        }),
      });

      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(typeof payload?.error === 'string' ? payload.error : 'שליחת הדיווח נכשלה');
      }

      setMessage('הדיווח נשלח למנהלים בהצלחה');
      setDescription('');
      setAction('');
      window.setTimeout(() => {
        setOpen(false);
        setMessage(null);
      }, 1200);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'שליחת הדיווח נכשלה');
    } finally {
      setPending(false);
    }
  };

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[11px] font-medium transition-colors hover:bg-red-500/10"
        style={{ color: 'var(--theme-text-secondary)', borderColor: 'var(--theme-border)' }}
      >
        <AlertCircle className="h-3.5 w-3.5 text-red-400" />
        דווח על באג
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[10040] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
            onClick={() => !pending && setOpen(false)}
          >
            <motion.div
              initial={{ scale: 0.96, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.96, opacity: 0 }}
              className="w-full max-w-lg rounded-2xl border p-5"
              style={{
                background: 'var(--theme-bg-secondary)',
                borderColor: 'var(--theme-border)',
              }}
              onClick={(event) => event.stopPropagation()}
            >
              <div className="mb-4 flex items-start justify-between gap-3">
                <div>
                  <h3 className="text-lg font-bold" style={{ color: 'var(--theme-text)' }}>
                    דווח על באג
                  </h3>
                  <p className="mt-1 text-xs" style={{ color: 'var(--theme-text-secondary)' }}>
                    ספר מה קרה, באיזה עמוד זה קרה, ומה ניסית לעשות.
                  </p>
                </div>
                <button
                  onClick={() => !pending && setOpen(false)}
                  className="rounded-lg p-2 transition-colors hover:bg-[var(--theme-accent-glow)]"
                >
                  <X className="h-4 w-4" style={{ color: 'var(--theme-text-secondary)' }} />
                </button>
              </div>

              <div className="space-y-3">
                <div className="rounded-xl border px-3 py-2 text-xs" style={{ borderColor: 'var(--theme-border)', background: 'var(--theme-bg)' }}>
                  <span style={{ color: 'var(--theme-text-secondary)' }}>עמוד:</span>{' '}
                  <span style={{ color: 'var(--theme-text)' }} dir="ltr">{pageLabel}</span>
                </div>

                <div>
                  <label className="mb-1.5 block text-xs font-medium" style={{ color: 'var(--theme-text-secondary)' }}>
                    מה ניסית לעשות?
                  </label>
                  <input
                    value={action}
                    onChange={(event) => setAction(event.target.value)}
                    placeholder="לדוגמה: ניסיתי ליצור צוות חדש"
                    className="w-full rounded-xl border px-3 py-2.5 text-sm"
                    style={{ borderColor: 'var(--theme-border)', background: 'var(--theme-bg)', color: 'var(--theme-text)' }}
                  />
                </div>

                <div>
                  <label className="mb-1.5 block text-xs font-medium" style={{ color: 'var(--theme-text-secondary)' }}>
                    תיאור הבאג
                  </label>
                  <textarea
                    value={description}
                    onChange={(event) => setDescription(event.target.value)}
                    placeholder="מה בדיוק קרה? מה ציפית שיקרה?"
                    rows={5}
                    className="w-full rounded-xl border px-3 py-2.5 text-sm resize-none"
                    style={{ borderColor: 'var(--theme-border)', background: 'var(--theme-bg)', color: 'var(--theme-text)' }}
                  />
                </div>

                {message && (
                  <div className="rounded-xl px-3 py-2 text-xs" style={{ background: 'var(--theme-accent-glow)', color: 'var(--theme-text-secondary)' }}>
                    {message}
                  </div>
                )}

                <div className="flex items-center justify-end gap-3 pt-2">
                  <button
                    onClick={() => setOpen(false)}
                    disabled={pending}
                    className="rounded-xl px-4 py-2 text-sm"
                    style={{ color: 'var(--theme-text-secondary)' }}
                  >
                    ביטול
                  </button>
                  <button
                    onClick={() => void handleSubmit()}
                    disabled={pending || description.trim().length < 8}
                    className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-l from-red-500 to-amber-500 px-4 py-2 text-sm font-bold text-white disabled:opacity-60"
                  >
                    {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                    שלח דיווח
                  </button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
