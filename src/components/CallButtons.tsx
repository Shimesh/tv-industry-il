'use client';

import { motion } from 'framer-motion';
import { Phone, Video } from 'lucide-react';
import { useCall } from '@/contexts/CallContext';

interface CallButtonsProps {
  userId?: string;
  displayName: string;
  /** sm = icon circles (cards), md = larger circles (modals/crew), lg = full-width with label (selected contact panel) */
  size?: 'sm' | 'md' | 'lg';
}

export default function CallButtons({ userId, displayName, size = 'md' }: CallButtonsProps) {
  const { startCall, callState } = useCall();
  const isRegistered = !!userId;
  const canCall = isRegistered && callState.status === 'idle';

  if (size === 'lg') {
    return (
      <div className="flex gap-3 w-full">
        <motion.button
          onClick={canCall ? () => void startCall(userId!, displayName, 'voice') : undefined}
          title={isRegistered ? 'שיחת קול' : 'לא רשום באפליקציה עדיין'}
          disabled={!canCall}
          className="flex flex-1 items-center justify-center gap-2.5 py-3.5 rounded-xl font-bold text-sm transition-all"
          style={{
            background: isRegistered
              ? 'linear-gradient(135deg, rgba(34,197,94,0.20) 0%, rgba(16,185,129,0.14) 100%)'
              : 'rgba(255,255,255,0.04)',
            border: isRegistered ? '1px solid rgba(34,197,94,0.40)' : '1px solid rgba(255,255,255,0.08)',
            color: isRegistered ? '#6ee7b7' : 'rgba(255,255,255,0.28)',
            boxShadow: isRegistered ? '0 0 14px rgba(34,197,94,0.20)' : 'none',
            opacity: !isRegistered ? 0.55 : 1,
            cursor: canCall ? 'pointer' : 'default',
          }}
          whileHover={canCall ? { scale: 1.02, boxShadow: '0 0 22px rgba(34,197,94,0.35)' } : {}}
          whileTap={canCall ? { scale: 0.97 } : {}}
        >
          <Phone className="w-4.5 h-4.5" />
          <span>שיחת קול</span>
        </motion.button>

        <motion.button
          onClick={canCall ? () => void startCall(userId!, displayName, 'video') : undefined}
          title={isRegistered ? 'שיחת וידאו' : 'לא רשום באפליקציה עדיין'}
          disabled={!canCall}
          className="flex flex-1 items-center justify-center gap-2.5 py-3.5 rounded-xl font-bold text-sm transition-all"
          style={{
            background: isRegistered
              ? 'linear-gradient(135deg, rgba(139,92,246,0.20) 0%, rgba(99,102,241,0.14) 100%)'
              : 'rgba(255,255,255,0.04)',
            border: isRegistered ? '1px solid rgba(139,92,246,0.40)' : '1px solid rgba(255,255,255,0.08)',
            color: isRegistered ? '#c4b5fd' : 'rgba(255,255,255,0.28)',
            boxShadow: isRegistered ? '0 0 14px rgba(139,92,246,0.20)' : 'none',
            opacity: !isRegistered ? 0.55 : 1,
            cursor: canCall ? 'pointer' : 'default',
          }}
          whileHover={canCall ? { scale: 1.02, boxShadow: '0 0 22px rgba(139,92,246,0.35)' } : {}}
          whileTap={canCall ? { scale: 0.97 } : {}}
        >
          <Video className="w-4.5 h-4.5" />
          <span>שיחת וידאו</span>
        </motion.button>
      </div>
    );
  }

  const padding = size === 'sm' ? 'p-1.5' : 'p-2';
  const iconCls = size === 'sm' ? 'w-3.5 h-3.5' : 'w-4 h-4';

  return (
    <div className="flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
      <motion.button
        onClick={canCall ? () => void startCall(userId!, displayName, 'voice') : undefined}
        title={isRegistered ? 'שיחת קול' : 'לא רשום באפליקציה עדיין'}
        disabled={!canCall}
        className={`rounded-full ${padding} transition-all`}
        style={{
          background: isRegistered
            ? 'linear-gradient(135deg, rgba(34,197,94,0.18) 0%, rgba(16,185,129,0.12) 100%)'
            : 'rgba(255,255,255,0.05)',
          border: isRegistered ? '1px solid rgba(34,197,94,0.38)' : '1px solid rgba(255,255,255,0.08)',
          boxShadow: isRegistered ? '0 0 10px rgba(34,197,94,0.22)' : 'none',
          opacity: !isRegistered ? 0.45 : 1,
          cursor: canCall ? 'pointer' : 'default',
        }}
        whileHover={canCall ? { scale: 1.12, boxShadow: '0 0 18px rgba(34,197,94,0.42)' } : {}}
        whileTap={canCall ? { scale: 0.90 } : {}}
      >
        <Phone className={iconCls} style={{ color: isRegistered ? '#6ee7b7' : 'rgba(255,255,255,0.28)' }} />
      </motion.button>

      <motion.button
        onClick={canCall ? () => void startCall(userId!, displayName, 'video') : undefined}
        title={isRegistered ? 'שיחת וידאו' : 'לא רשום באפליקציה עדיין'}
        disabled={!canCall}
        className={`rounded-full ${padding} transition-all`}
        style={{
          background: isRegistered
            ? 'linear-gradient(135deg, rgba(139,92,246,0.18) 0%, rgba(99,102,241,0.12) 100%)'
            : 'rgba(255,255,255,0.05)',
          border: isRegistered ? '1px solid rgba(139,92,246,0.38)' : '1px solid rgba(255,255,255,0.08)',
          boxShadow: isRegistered ? '0 0 10px rgba(139,92,246,0.22)' : 'none',
          opacity: !isRegistered ? 0.45 : 1,
          cursor: canCall ? 'pointer' : 'default',
        }}
        whileHover={canCall ? { scale: 1.12, boxShadow: '0 0 18px rgba(139,92,246,0.42)' } : {}}
        whileTap={canCall ? { scale: 0.90 } : {}}
      >
        <Video className={iconCls} style={{ color: isRegistered ? '#c4b5fd' : 'rgba(255,255,255,0.28)' }} />
      </motion.button>
    </div>
  );
}
