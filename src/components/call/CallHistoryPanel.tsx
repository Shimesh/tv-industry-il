'use client';

import { useEffect, useMemo, useState } from 'react';
import { collection, onSnapshot, query, where } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useAuth } from '@/contexts/AuthContext';
import { Phone, PhoneIncoming, PhoneOutgoing, PhoneMissed, Video } from 'lucide-react';

interface CallRecord {
  id: string;
  callerId: string;
  callerName: string;
  receiverId: string;
  receiverName: string;
  type: 'voice' | 'video';
  status: string;
  createdAt: number;
  answeredAt: number | null;
  updatedAt: number | null;
}

function tsToMs(ts: unknown): number {
  if (!ts) return 0;
  if (typeof ts === 'number') return ts;
  if (typeof ts === 'object' && ts !== null && 'seconds' in ts) {
    return (ts as { seconds: number }).seconds * 1000;
  }
  return 0;
}

function formatDuration(ms: number): string {
  const totalSec = Math.floor(ms / 1000);
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function formatTime(ms: number): string {
  if (!ms) return '';
  const date = new Date(ms);
  const now = new Date();
  const isToday = date.toDateString() === now.toDateString();
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  const isYesterday = date.toDateString() === yesterday.toDateString();
  if (isToday) return date.toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' });
  if (isYesterday) return 'אתמול';
  return date.toLocaleDateString('he-IL', { day: 'numeric', month: 'numeric' });
}

export default function CallHistoryPanel() {
  const { user } = useAuth();
  const [incomingCalls, setIncomingCalls] = useState<CallRecord[]>([]);
  const [outgoingCalls, setOutgoingCalls] = useState<CallRecord[]>([]);

  useEffect(() => {
    if (!user) return;

    const toRecord = (docId: string, data: Record<string, unknown>): CallRecord => ({
      id: docId,
      callerId: typeof data.callerId === 'string' ? data.callerId : '',
      callerName: typeof data.callerName === 'string' ? data.callerName : 'משתמש',
      receiverId: typeof data.receiverId === 'string' ? data.receiverId : '',
      receiverName: typeof data.receiverName === 'string' ? data.receiverName : 'משתמש',
      type: data.type === 'video' ? 'video' : 'voice',
      status: typeof data.status === 'string' ? data.status : '',
      createdAt: tsToMs(data.createdAt),
      answeredAt: data.answeredAt ? tsToMs(data.answeredAt) : null,
      updatedAt: data.updatedAt ? tsToMs(data.updatedAt) : null,
    });

    const inQ = query(collection(db, 'calls'), where('receiverId', '==', user.uid));
    const unsubIn = onSnapshot(inQ, (snap) => {
      const records: CallRecord[] = [];
      snap.forEach((d) => records.push(toRecord(d.id, d.data() as Record<string, unknown>)));
      setIncomingCalls(records);
    });

    const outQ = query(collection(db, 'calls'), where('callerId', '==', user.uid));
    const unsubOut = onSnapshot(outQ, (snap) => {
      const records: CallRecord[] = [];
      snap.forEach((d) => records.push(toRecord(d.id, d.data() as Record<string, unknown>)));
      setOutgoingCalls(records);
    });

    return () => { unsubIn(); unsubOut(); };
  }, [user]);

  const allCalls = useMemo(() => {
    const seen = new Set<string>();
    const merged = [...incomingCalls, ...outgoingCalls].filter((c) => {
      if (seen.has(c.id)) return false;
      seen.add(c.id);
      return true;
    });
    return merged.sort((a, b) => b.createdAt - a.createdAt);
  }, [incomingCalls, outgoingCalls]);

  if (allCalls.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center p-10 text-center" dir="rtl">
        <Phone className="mb-3 h-12 w-12 opacity-30" style={{ color: 'var(--theme-text-secondary)' }} />
        <p className="text-[13px]" style={{ color: 'var(--theme-text-secondary)' }}>אין יומן שיחות</p>
      </div>
    );
  }

  return (
    <div className="space-y-0" dir="rtl">
      {allCalls.map((call) => {
        const isIncoming = call.receiverId === user?.uid;
        const isMissed = isIncoming && !call.answeredAt && (call.status === 'ended' || call.status === 'declined');
        const isAnswered = Boolean(call.answeredAt);
        const otherName = isIncoming ? call.callerName : call.receiverName;
        const duration = isAnswered && call.answeredAt && call.updatedAt && call.updatedAt > call.answeredAt
          ? call.updatedAt - call.answeredAt
          : null;

        let Icon = isIncoming ? PhoneIncoming : PhoneOutgoing;
        let iconColor = isIncoming ? 'var(--theme-success)' : 'var(--theme-accent)';
        if (isMissed) { Icon = PhoneMissed; iconColor = '#ef4444'; }

        return (
          <div
            key={call.id}
            className="flex items-center gap-3 border-b px-4 py-3"
            style={{ borderColor: 'var(--theme-border)' }}
          >
            <div
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full"
              style={{ background: `${iconColor}20` }}
            >
              <Icon className="h-4 w-4" style={{ color: iconColor }} />
            </div>

            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-between gap-2">
                <span
                  className="truncate text-[14px] font-medium"
                  style={{ color: isMissed ? '#ef4444' : 'var(--theme-text)' }}
                >
                  {otherName}
                </span>
                <span className="shrink-0 text-[11px]" style={{ color: 'var(--theme-text-secondary)' }}>
                  {formatTime(call.createdAt)}
                </span>
              </div>
              <div className="mt-0.5 flex items-center gap-1.5 text-[12px]" style={{ color: 'var(--theme-text-secondary)' }}>
                {call.type === 'video'
                  ? <Video className="h-3 w-3 shrink-0" />
                  : <Phone className="h-3 w-3 shrink-0" />
                }
                <span>
                  {isMissed ? 'שיחה שלא נענתה' :
                   !isAnswered ? (call.status === 'declined' ? 'נדחתה' : 'לא נענה') :
                   duration ? formatDuration(duration) : 'נענה'}
                </span>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
