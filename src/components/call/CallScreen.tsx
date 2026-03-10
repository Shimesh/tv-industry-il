'use client';

import { useEffect, useRef } from 'react';
import { useCall } from '@/contexts/CallContext';
import UserAvatar from '@/components/UserAvatar';
import {
  Phone, PhoneOff, Mic, MicOff, Video, VideoOff,
  Monitor, Maximize2, Minimize2
} from 'lucide-react';
import { motion } from 'framer-motion';

export default function CallScreen() {
  const { callState, endCall, toggleMute, toggleVideo } = useCall();
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    if (localVideoRef.current && callState.localStream) {
      localVideoRef.current.srcObject = callState.localStream;
    }
  }, [callState.localStream]);

  useEffect(() => {
    if (remoteVideoRef.current && callState.remoteStream) {
      remoteVideoRef.current.srcObject = callState.remoteStream;
    }
  }, [callState.remoteStream]);

  const formatDuration = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  if (callState.status !== 'active' && callState.status !== 'calling') return null;

  const isVideo = callState.type === 'video';
  const remoteName = callState.isIncoming ? callState.callerName : callState.receiverName;

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.95 }}
      className="fixed inset-0 z-[100] flex flex-col"
      style={{ background: '#0a0a0a' }}
    >
      {/* Video Area */}
      <div className="flex-1 relative overflow-hidden">
        {isVideo ? (
          <>
            {/* Remote Video */}
            <video
              ref={remoteVideoRef}
              autoPlay
              playsInline
              className="w-full h-full object-cover"
            />

            {/* Local Video (PiP) */}
            <div className="absolute top-4 left-4 w-32 h-44 sm:w-40 sm:h-56 rounded-2xl overflow-hidden border-2 border-white/20 shadow-2xl">
              {callState.isVideoOff ? (
                <div className="w-full h-full bg-gray-800 flex items-center justify-center">
                  <VideoOff className="w-8 h-8 text-gray-400" />
                </div>
              ) : (
                <video
                  ref={localVideoRef}
                  autoPlay
                  playsInline
                  muted
                  className="w-full h-full object-cover"
                  style={{ transform: 'scaleX(-1)' }}
                />
              )}
            </div>

            {/* Calling overlay */}
            {callState.status === 'calling' && (
              <div className="absolute inset-0 bg-black/60 flex flex-col items-center justify-center gap-4">
                <UserAvatar name={remoteName} size="xl" />
                <h2 className="text-xl font-bold text-white">{remoteName}</h2>
                <p className="text-sm text-gray-300">מתקשר...</p>
                <div className="flex gap-1 mt-2">
                  <span className="w-2 h-2 rounded-full bg-white animate-pulse" style={{ animationDelay: '0s' }} />
                  <span className="w-2 h-2 rounded-full bg-white animate-pulse" style={{ animationDelay: '0.2s' }} />
                  <span className="w-2 h-2 rounded-full bg-white animate-pulse" style={{ animationDelay: '0.4s' }} />
                </div>
              </div>
            )}
          </>
        ) : (
          /* Voice Call UI */
          <div className="w-full h-full flex flex-col items-center justify-center gap-6 bg-gradient-to-b from-purple-900/20 to-black">
            <motion.div
              animate={{ scale: callState.status === 'active' ? [1, 1.05, 1] : 1 }}
              transition={{ repeat: Infinity, duration: 2 }}
            >
              <UserAvatar name={remoteName} size="xl" />
            </motion.div>
            <div className="text-center">
              <h2 className="text-2xl font-bold text-white">{remoteName}</h2>
              <p className="text-sm text-gray-300 mt-1">
                {callState.status === 'calling' ? 'מתקשר...' :
                 callState.status === 'active' ? 'שיחה פעילה' : ''}
              </p>
            </div>
            {callState.status === 'active' && (
              <p className="text-lg font-mono text-white/80">{formatDuration(callState.duration)}</p>
            )}
          </div>
        )}
      </div>

      {/* Controls */}
      <div className="bg-black/80 backdrop-blur-xl border-t border-white/10 px-6 py-4">
        <div className="flex items-center justify-center gap-4 max-w-md mx-auto">
          {/* Mute */}
          <button
            onClick={toggleMute}
            className={`w-12 h-12 rounded-full flex items-center justify-center transition-all ${
              callState.isMuted
                ? 'bg-red-500/20 text-red-400 ring-1 ring-red-500/50'
                : 'bg-white/10 text-white hover:bg-white/20'
            }`}
            title={callState.isMuted ? 'בטל השתקה' : 'השתק'}
          >
            {callState.isMuted ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
          </button>

          {/* Video Toggle */}
          {isVideo && (
            <button
              onClick={toggleVideo}
              className={`w-12 h-12 rounded-full flex items-center justify-center transition-all ${
                callState.isVideoOff
                  ? 'bg-red-500/20 text-red-400 ring-1 ring-red-500/50'
                  : 'bg-white/10 text-white hover:bg-white/20'
              }`}
              title={callState.isVideoOff ? 'הפעל מצלמה' : 'כבה מצלמה'}
            >
              {callState.isVideoOff ? <VideoOff className="w-5 h-5" /> : <Video className="w-5 h-5" />}
            </button>
          )}

          {/* End Call */}
          <button
            onClick={endCall}
            className="w-14 h-14 rounded-full bg-red-500 text-white flex items-center justify-center hover:bg-red-600 transition-all shadow-lg shadow-red-500/30"
            title="סיים שיחה"
          >
            <PhoneOff className="w-6 h-6" />
          </button>
        </div>

        {/* Duration */}
        {callState.status === 'active' && isVideo && (
          <p className="text-center text-sm text-white/50 mt-2 font-mono">
            {formatDuration(callState.duration)}
          </p>
        )}
      </div>
    </motion.div>
  );
}
