'use client';

import { useEffect, useState } from 'react';
import { collection, onSnapshot, query, where } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useAuth } from '@/contexts/AuthContext';
import { Phone, Video, PhoneMissed, X } from 'lucide-react';

interface MissedCall {
  id: string;
  callerName: string;
  type: 'voice' | 'video';
  createdAt: { seconds: number } | null;
}

function formatTimeAgo(ts: { seconds: number } | null): string {
  if (!ts) return '';
  const diffMs = Date.now() - ts.seconds * 1000;
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return 'לפני פחות מדקה';
  if (diffMin < 60) return `לפני ${diffMin} דקות`;
  const diffHours = Math.floor(diffMin / 60);
  if (diffHours < 24) return `לפני ${diffHours} שעות`;
  return `לפני ${Math.floor(diffHours / 24)} ימים`;
}

export default function MissedCallsPanel({ showEmptyState = false }: { showEmptyState?: boolean }) {
  const { user } = useAuth();
  const [missedCalls, setMissedCalls] = useState<MissedCall[]>([]);
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!user) return;
    const q = query(collection(db, 'calls'), where('receiverId', '==', user.uid));
    const unsub = onSnapshot(q, (snapshot) => {
      const missed: MissedCall[] = [];
      snapshot.forEach((docSnap) => {
        const data = docSnap.data();
        if ((data.status === 'ended' || data.status === 'declined') && !data.answeredAt) {
          missed.push({
            id: docSnap.id,
            callerName: typeof data.callerName === 'string' ? data.callerName : 'משתמש',
            type: data.type === 'video' ? 'video' : 'voice',
            createdAt: data.createdAt && typeof data.createdAt === 'object' && 'seconds' in data.createdAt
              ? (data.createdAt as { seconds: number })
              : null,
          });
        }
      });
      missed.sort((a, b) => (b.createdAt?.seconds ?? 0) - (a.createdAt?.seconds ?? 0));
      setMissedCalls(missed);
    });
    return () => unsub();
  }, [user]);

  const visible = missedCalls.filter((c) => !dismissed.has(c.id));

  if (visible.length === 0) {
    if (!showEmptyState) return null;
    return (
      <div className="flex flex-col items-center justify-center p-10 text-center" dir="rtl">
        <Phone className="mb-3 h-12 w-12 opacity-30" style={{ color: 'var(--theme-text-secondary)' }} />
        <p className="text-[13px]" style={{ color: 'var(--theme-text-secondary)' }}>אין שיחות שלא נענו</p>
      </div>
    );
  }

  return (
    <div
      className="border-b px-3 py-2"
      style={{ borderColor: 'var(--theme-border)', background: 'var(--theme-bg-secondary)' }}
      dir="rtl"
    >
      <div className="mb-1.5 flex items-center justify-between">
        <span className="flex items-center gap-1.5 text-xs font-bold text-red-400">
          <PhoneMissed className="h-3.5 w-3.5" />
          שיחות שלא נענו ({visible.length})
        </span>
        <button
          onClick={() => setDismissed(new Set(visible.map((c) => c.id)))}
          className="text-xs transition-colors"
          style={{ color: 'var(--theme-text-secondary)' }}
        >
          נקה הכל
        </button>
      </div>
      <div className="space-y-1">
        {visible.slice(0, 5).map((call) => (
          <div
            key={call.id}
            className="flex items-center justify-between gap-2 rounded-lg px-2 py-1.5"
            style={{ background: 'var(--theme-bg-card)' }}
          >
            <div className="flex min-w-0 items-center gap-2">
              <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-red-500/15 text-red-400">
                {call.type === 'video'
                  ? <Video className="h-3 w-3" />
                  : <Phone className="h-3 w-3" />
                }
              </div>
              <div className="min-w-0">
                <p className="truncate text-xs font-medium" style={{ color: 'var(--theme-text)' }}>
                  {call.callerName}
                </p>
                <p className="text-[10px]" style={{ color: 'var(--theme-text-secondary)' }}>
                  {formatTimeAgo(call.createdAt)}
                </p>
              </div>
            </div>
            <button
              onClick={() => setDismissed((prev) => new Set([...prev, call.id]))}
              className="shrink-0 transition-colors"
              style={{ color: 'var(--theme-text-secondary)' }}
            >
              <X className="h-3 w-3" />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
