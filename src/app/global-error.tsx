'use client';

import { useEffect } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';
import { logClientError } from '@/lib/clientErrorLogging';

export default function GlobalError({ error }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    logClientError({ error, source: 'next-global-error' });
  }, [error]);

  return (
    <html lang="he" dir="rtl">
      <body style={{ margin: 0, background: '#030712', color: '#f3f4f6', fontFamily: 'Heebo, Arial, sans-serif' }}>
        <div className="flex min-h-screen items-center justify-center px-4 py-10" dir="rtl">
          <div className="w-full max-w-md rounded-2xl border border-white/10 bg-gray-900 p-6 text-center shadow-2xl">
            <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-red-500/10">
              <AlertTriangle className="h-7 w-7 text-red-400" />
            </div>
            <h1 className="mb-2 text-xl font-black">משהו השתבש</h1>
            <p className="mb-5 text-sm leading-relaxed text-gray-300">
              אירעה שגיאה בטעינת האפליקציה. אפשר לרענן ולהמשיך.
            </p>
            <button
              type="button"
              onClick={() => {
                if (typeof window !== 'undefined') window.location.reload();
              }}
              className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-purple-600 px-4 py-3 text-sm font-black text-white"
            >
              <RefreshCw className="h-4 w-4" />
              טען מחדש
            </button>
          </div>
        </div>
      </body>
    </html>
  );
}
