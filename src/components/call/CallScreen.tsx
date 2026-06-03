'use client';

import { useEffect, useRef, useState } from 'react';
import { useCall } from '@/contexts/CallContext';
import UserAvatar from '@/components/UserAvatar';
import {
  PhoneOff, Mic, MicOff, Video, VideoOff,
  Volume2, Bluetooth, Check, SwitchCamera,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

type ExtendedAudioElement = HTMLAudioElement & {
  setSinkId?: (sinkId: string) => Promise<void>;
  sinkId?: string;
};

const canSelectSink =
  typeof window !== 'undefined' &&
  typeof HTMLAudioElement !== 'undefined' &&
  'setSinkId' in HTMLAudioElement.prototype;

export default function CallScreen() {
  const { callState, endCall, toggleMute, toggleVideo, toggleCamera } = useCall();
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  const remoteAudioRef = useRef<ExtendedAudioElement>(null);

  const [audioDevices, setAudioDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedSinkId, setSelectedSinkId] = useState<string>('default');
  const [showAudioMenu, setShowAudioMenu] = useState(false);

  // Attach local video stream
  useEffect(() => {
    if (localVideoRef.current && callState.localStream) {
      localVideoRef.current.srcObject = callState.localStream;
      void localVideoRef.current.play().catch(() => {});
    }
  }, [callState.localStream]);

  // Re-attach local stream when video is toggled back on (element re-mounts without srcObject)
  useEffect(() => {
    if (!callState.isVideoOff && localVideoRef.current && callState.localStream) {
      localVideoRef.current.srcObject = callState.localStream;
      void localVideoRef.current.play().catch(() => {});
    }
  }, [callState.isVideoOff, callState.localStream]);

  // Attach remote stream — ontrack always creates a new MediaStream reference so this
  // effect re-runs on every track arrival and re-calls .play() for iOS Safari autoplay.
  useEffect(() => {
    if (remoteVideoRef.current && callState.remoteStream) {
      remoteVideoRef.current.srcObject = callState.remoteStream;
      void remoteVideoRef.current.play().catch(() => {});
    }
    if (remoteAudioRef.current && callState.remoteStream) {
      remoteAudioRef.current.srcObject = callState.remoteStream;
      void remoteAudioRef.current.play().catch(() => {});
    }
  }, [callState.remoteStream]);

  const loadAudioDevices = async () => {
    if (!canSelectSink) return;
    try {
      // enumerateDevices may return empty labels until permission is granted
      const all = await navigator.mediaDevices.enumerateDevices();
      const outputs = all.filter((d) => d.kind === 'audiooutput');
      setAudioDevices(outputs);
    } catch {
      /* ignore */
    }
  };

  const handleAudioMenuToggle = async () => {
    if (!canSelectSink) return;
    if (!showAudioMenu) await loadAudioDevices();
    setShowAudioMenu((v) => !v);
  };

  const selectSink = async (sinkId: string) => {
    setSelectedSinkId(sinkId);
    setShowAudioMenu(false);
    const el = remoteAudioRef.current;
    if (el?.setSinkId) {
      try {
        await el.setSinkId(sinkId);
      } catch { /* device may not support it */ }
    }
  };

  const formatDuration = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  if (callState.status !== 'active' && callState.status !== 'calling') return null;

  const isVideo = callState.type === 'video';
  const remoteName = callState.isIncoming ? callState.callerName : callState.receiverName;

  const isBluetoothDevice = (d: MediaDeviceInfo) =>
    d.label.toLowerCase().includes('bluetooth') || d.label.toLowerCase().includes('airpod');

  const currentDevice = audioDevices.find((d) => d.deviceId === selectedSinkId);
  const isCurrentBluetooth = currentDevice ? isBluetoothDevice(currentDevice) : false;

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.95 }}
      className="fixed inset-0 z-[100] flex flex-col"
      style={{ background: '#0a0a0a' }}
    >
      {/* Hidden audio element — plays remote audio on all call types */}
      {/* muted=false is intentional: this is the remote party's audio */}
      <audio ref={remoteAudioRef} autoPlay playsInline className="hidden" />

      {/* Video Area */}
      <div className="relative flex-1 overflow-hidden">
        {isVideo ? (
          <>
            {/* Remote Video */}
            <video
              ref={remoteVideoRef}
              autoPlay
              playsInline
              muted
              className="h-full w-full object-cover"
            />

            {/* Local Video (PiP) */}
            <div className="absolute left-4 top-4 h-44 w-32 overflow-hidden rounded-2xl border-2 border-white/20 shadow-2xl sm:h-56 sm:w-40">
              {callState.isVideoOff ? (
                <div className="flex h-full w-full items-center justify-center bg-gray-800">
                  <VideoOff className="h-8 w-8 text-gray-400" />
                </div>
              ) : callState.localStream ? (
                <video
                  ref={localVideoRef}
                  autoPlay
                  playsInline
                  muted
                  className="h-full w-full object-cover"
                  style={{ transform: callState.isFrontCamera ? 'scaleX(-1)' : 'none' }}
                />
              ) : (
                <div className="flex h-full w-full items-center justify-center bg-gray-900">
                  <div className="h-5 w-5 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                </div>
              )}
            </div>

            {/* Reconnecting overlay — shown when recovering an active call without media */}
            {callState.status === 'active' && !callState.remoteStream && !callState.localStream && (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black/70">
                <UserAvatar name={remoteName} size="xl" />
                <h2 className="text-xl font-bold text-white">{remoteName}</h2>
                <p className="text-sm text-gray-300">שיחה בתהליך — אין אפשרות להתחבר מחדש</p>
              </div>
            )}

            {/* Calling overlay */}
            {callState.status === 'calling' && (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-black/60">
                <UserAvatar name={remoteName} size="xl" />
                <h2 className="text-xl font-bold text-white">{remoteName}</h2>
                <p className="text-sm text-gray-300">מתקשר...</p>
                <div className="mt-2 flex gap-1">
                  <span className="h-2 w-2 animate-pulse rounded-full bg-white" style={{ animationDelay: '0s' }} />
                  <span className="h-2 w-2 animate-pulse rounded-full bg-white" style={{ animationDelay: '0.2s' }} />
                  <span className="h-2 w-2 animate-pulse rounded-full bg-white" style={{ animationDelay: '0.4s' }} />
                </div>
              </div>
            )}
          </>
        ) : (
          /* Voice Call UI */
          <div className="flex h-full w-full flex-col items-center justify-center gap-6 bg-gradient-to-b from-purple-900/20 to-black">
            <motion.div
              animate={{ scale: callState.status === 'active' ? [1, 1.05, 1] : 1 }}
              transition={{ repeat: Infinity, duration: 2 }}
            >
              <UserAvatar name={remoteName} size="xl" />
            </motion.div>
            <div className="text-center">
              <h2 className="text-2xl font-bold text-white">{remoteName}</h2>
              <p className="mt-1 text-sm text-gray-300">
                {callState.status === 'calling' ? 'מתקשר...' :
                 callState.status === 'active' ? 'שיחה פעילה' : ''}
              </p>
            </div>
            {callState.status === 'active' && (
              <p className="font-mono text-lg text-white/80">{formatDuration(callState.duration)}</p>
            )}
          </div>
        )}
      </div>

      {/* Controls */}
      <div className="relative border-t border-white/10 bg-black/80 px-6 py-4 backdrop-blur-xl">
        {/* Audio device picker */}
        <AnimatePresence>
          {showAudioMenu && (
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 8 }}
              className="absolute bottom-full left-1/2 mb-2 w-64 -translate-x-1/2 overflow-hidden rounded-xl border border-white/15 bg-gray-900 shadow-2xl"
              dir="rtl"
            >
              <div className="border-b border-white/10 px-4 py-2.5 text-xs font-bold text-white/50">
                בחר התקן שמע
              </div>
              {audioDevices.length === 0 ? (
                <div className="px-4 py-3 text-sm text-white/50">לא נמצאו התקנים</div>
              ) : (
                audioDevices.map((device) => (
                  <button
                    key={device.deviceId}
                    onClick={() => void selectSink(device.deviceId)}
                    className="flex w-full items-center gap-3 px-4 py-2.5 text-right text-sm text-white transition-colors hover:bg-white/10"
                  >
                    {isBluetoothDevice(device)
                      ? <Bluetooth className="h-4 w-4 shrink-0 text-blue-400" />
                      : <Volume2 className="h-4 w-4 shrink-0 text-white/60" />
                    }
                    <span className="min-w-0 flex-1 truncate">
                      {device.label || (device.deviceId === 'default' ? 'ברירת מחדל' : device.deviceId.slice(0, 8))}
                    </span>
                    {(device.deviceId === selectedSinkId || (selectedSinkId === 'default' && device.deviceId === 'default')) && (
                      <Check className="h-4 w-4 shrink-0 text-green-400" />
                    )}
                  </button>
                ))
              )}
            </motion.div>
          )}
        </AnimatePresence>

        <div className="mx-auto flex max-w-md items-center justify-center gap-4">
          {/* Mute */}
          <button
            onClick={toggleMute}
            className={`flex h-12 w-12 items-center justify-center rounded-full transition-all ${
              callState.isMuted
                ? 'bg-red-500/20 text-red-400 ring-1 ring-red-500/50'
                : 'bg-white/10 text-white hover:bg-white/20'
            }`}
            title={callState.isMuted ? 'בטל השתקה' : 'השתק'}
          >
            {callState.isMuted ? <MicOff className="h-5 w-5" /> : <Mic className="h-5 w-5" />}
          </button>

          {/* Audio output / Speaker / Bluetooth */}
          {canSelectSink ? (
            <button
              onClick={() => void handleAudioMenuToggle()}
              className={`flex h-12 w-12 items-center justify-center rounded-full transition-all ${
                showAudioMenu
                  ? 'bg-blue-500/25 text-blue-300 ring-1 ring-blue-500/50'
                  : 'bg-white/10 text-white hover:bg-white/20'
              }`}
              title="בחר התקן שמע / רמקול / בלוטות'"
            >
              {isCurrentBluetooth
                ? <Bluetooth className="h-5 w-5" />
                : <Volume2 className="h-5 w-5" />
              }
            </button>
          ) : (
            // On unsupported browsers show a non-interactive indicator
            <div
              className="flex h-12 w-12 items-center justify-center rounded-full bg-white/5 text-white/30"
              title="שנה פלט שמע בהגדרות המכשיר"
            >
              <Volume2 className="h-5 w-5" />
            </div>
          )}

          {/* Video Toggle */}
          {isVideo && (
            <button
              onClick={toggleVideo}
              className={`flex h-12 w-12 items-center justify-center rounded-full transition-all ${
                callState.isVideoOff
                  ? 'bg-red-500/20 text-red-400 ring-1 ring-red-500/50'
                  : 'bg-white/10 text-white hover:bg-white/20'
              }`}
              title={callState.isVideoOff ? 'הפעל מצלמה' : 'כבה מצלמה'}
            >
              {callState.isVideoOff ? <VideoOff className="h-5 w-5" /> : <Video className="h-5 w-5" />}
            </button>
          )}

          {/* Switch Camera (video only, when camera is on) */}
          {isVideo && !callState.isVideoOff && (
            <button
              onClick={() => void toggleCamera()}
              className="flex h-12 w-12 items-center justify-center rounded-full bg-white/10 text-white transition-all hover:bg-white/20"
              title={callState.isFrontCamera ? 'עבור למצלמה אחורית' : 'עבור למצלמה קדמית'}
            >
              <SwitchCamera className="h-5 w-5" />
            </button>
          )}

          {/* End Call */}
          <button
            onClick={endCall}
            className="flex h-14 w-14 items-center justify-center rounded-full bg-red-500 text-white shadow-lg shadow-red-500/30 transition-all hover:bg-red-600"
            title="סיים שיחה"
          >
            <PhoneOff className="h-6 w-6" />
          </button>
        </div>

        {/* Duration */}
        {callState.status === 'active' && isVideo && (
          <p className="mt-2 text-center font-mono text-sm text-white/50">
            {formatDuration(callState.duration)}
          </p>
        )}
      </div>
    </motion.div>
  );
}
