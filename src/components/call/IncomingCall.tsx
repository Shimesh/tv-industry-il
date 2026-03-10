'use client';

import { useCall } from '@/contexts/CallContext';
import UserAvatar from '@/components/UserAvatar';
import { Phone, PhoneOff, Video } from 'lucide-react';
import { motion } from 'framer-motion';

export default function IncomingCall() {
  const { callState, answerCall, declineCall } = useCall();

  if (callState.status !== 'ringing' || !callState.isIncoming) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: -100 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -100 }}
      className="fixed top-20 left-1/2 -translate-x-1/2 z-[100] w-80 rounded-2xl border shadow-2xl overflow-hidden"
      style={{
        background: 'var(--theme-bg-secondary)',
        borderColor: 'var(--theme-border)',
      }}
    >
      {/* Gradient top */}
      <div className="h-1 bg-gradient-to-l from-green-500 via-purple-500 to-blue-500" />

      <div className="p-5 text-center">
        {/* Avatar with ring animation */}
        <motion.div
          animate={{ scale: [1, 1.1, 1] }}
          transition={{ repeat: Infinity, duration: 1.5 }}
          className="inline-block mb-3"
        >
          <UserAvatar
            name={callState.callerName}
            photoURL={callState.callerPhoto}
            size="lg"
          />
        </motion.div>

        <h3 className="text-lg font-bold text-[var(--theme-text)]">{callState.callerName}</h3>
        <p className="text-sm text-[var(--theme-text-secondary)] mt-0.5 flex items-center justify-center gap-1">
          {callState.type === 'video' ? (
            <><Video className="w-3.5 h-3.5" /> שיחת וידאו נכנסת</>
          ) : (
            <><Phone className="w-3.5 h-3.5 animate-ring" /> שיחה קולית נכנסת</>
          )}
        </p>

        {/* Action Buttons */}
        <div className="flex items-center justify-center gap-6 mt-5">
          <button
            onClick={declineCall}
            className="w-14 h-14 rounded-full bg-red-500 text-white flex items-center justify-center hover:bg-red-600 transition-all shadow-lg shadow-red-500/30"
            title="דחה"
          >
            <PhoneOff className="w-6 h-6" />
          </button>
          <button
            onClick={answerCall}
            className="w-14 h-14 rounded-full bg-green-500 text-white flex items-center justify-center hover:bg-green-600 transition-all shadow-lg shadow-green-500/30"
            title="ענה"
          >
            <Phone className="w-6 h-6" />
          </button>
        </div>
      </div>
    </motion.div>
  );
}
