'use client';

import { useState } from 'react';
import { Phone, CheckCircle, X, ChevronLeft } from 'lucide-react';
import type { Production } from '@/lib/productionDiff';

interface ClaimShiftsModalProps {
  matches: Production[];
  crewName: string;
  profession: string;
  userPhone: string;
  getToken: () => Promise<string>;
  onClaimed: (crewName: string) => void;
  onDismiss: () => void;
}

export function ClaimShiftsModal({
  matches,
  crewName,
  profession,
  userPhone,
  getToken,
  onClaimed,
  onDismiss,
}: ClaimShiftsModalProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function handleClaim() {
    setLoading(true);
    setError('');
    try {
      const token = await getToken().catch(() => '');
      const res = await fetch('/api/productions/global', {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          productionIds: matches.map((p) => p.id),
          crewName,
          phone: userPhone,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'שגיאה בעדכון המשמרות');
        return;
      }
      onClaimed(crewName);
    } catch {
      setError('שגיאת תקשורת — נסה שנית');
    } finally {
      setLoading(false);
    }
  }

  const shown = matches.slice(0, 5);

  return (
    <div
      className="mb-6 rounded-2xl border overflow-hidden"
      style={{ background: 'var(--theme-bg-secondary)', borderColor: 'var(--theme-border)' }}
    >
      {/* Header */}
      <div
        className="flex items-center justify-between px-4 py-3"
        style={{
          background: 'linear-gradient(135deg, rgba(59,130,246,0.15), rgba(99,102,241,0.1))',
          borderBottom: '1px solid var(--theme-border)',
        }}
      >
        <div className="flex items-center gap-2">
          <div
            className="w-7 h-7 rounded-lg flex items-center justify-center"
            style={{ background: 'rgba(59,130,246,0.2)' }}
          >
            <Phone className="w-3.5 h-3.5 text-blue-400" />
          </div>
          <span className="text-sm font-bold" style={{ color: 'var(--theme-text)' }}>
            נמצאו משמרות עם שמך
          </span>
          <span
            className="text-xs px-2 py-0.5 rounded-full"
            style={{ background: 'rgba(59,130,246,0.15)', color: '#60a5fa' }}
          >
            {matches.length} הפקות
          </span>
        </div>
        <button
          onClick={onDismiss}
          className="w-6 h-6 rounded-lg flex items-center justify-center transition-colors hover:bg-[var(--theme-accent-glow)]"
          style={{ color: 'var(--theme-text-secondary)' }}
          title="דלג"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>

      <div className="px-4 py-4">
        <p className="text-xs mb-4" style={{ color: 'var(--theme-text-secondary)' }}>
          נמצאו הפקות עם השם &ldquo;{crewName}&rdquo;{profession ? ` — ${profession}` : ''} ללא מספר טלפון.
          האם אלה המשמרות שלך? אם כן, מספר הטלפון שלך יתווסף לרשומות האלה וישמרו יציגו לך באופן אוטומטי.
        </p>

        {/* Production list preview */}
        <div className="flex flex-col gap-1.5 mb-4">
          {shown.map((prod) => (
            <div
              key={prod.id}
              className="flex items-center gap-2 px-3 py-2 rounded-xl text-xs"
              style={{ background: 'var(--theme-bg)', border: '1px solid var(--theme-border)' }}
            >
              <ChevronLeft className="w-3 h-3 shrink-0" style={{ color: 'var(--theme-text-secondary)' }} />
              <span className="font-medium" style={{ color: 'var(--theme-text)' }}>{prod.name}</span>
              <span style={{ color: 'var(--theme-text-secondary)' }}>{prod.date}</span>
              {prod.crew.find((c) => c.name === crewName)?.role && (
                <span
                  className="mr-auto text-xs px-1.5 py-0.5 rounded-md"
                  style={{ background: 'rgba(59,130,246,0.1)', color: '#60a5fa' }}
                >
                  {prod.crew.find((c) => c.name === crewName)?.role}
                </span>
              )}
            </div>
          ))}
          {matches.length > 5 && (
            <p className="text-xs text-center" style={{ color: 'var(--theme-text-secondary)' }}>
              ועוד {matches.length - 5} הפקות נוספות...
            </p>
          )}
        </div>

        {error && (
          <p className="text-xs mb-3 text-red-400">{error}</p>
        )}

        <div className="flex gap-2">
          <button
            onClick={handleClaim}
            disabled={loading}
            className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold transition-all disabled:opacity-60"
            style={{ background: 'rgba(59,130,246,0.85)', color: '#fff' }}
          >
            <CheckCircle className="w-4 h-4" />
            {loading ? 'מעדכן...' : 'כן, אלה המשמרות שלי'}
          </button>
          <button
            onClick={onDismiss}
            className="px-4 py-2.5 rounded-xl text-sm font-medium transition-colors hover:bg-[var(--theme-accent-glow)]"
            style={{ color: 'var(--theme-text-secondary)', border: '1px solid var(--theme-border)' }}
          >
            לא, זה לא אני
          </button>
        </div>
      </div>
    </div>
  );
}
