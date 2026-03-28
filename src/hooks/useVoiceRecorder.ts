'use client';

import { useState, useRef, useCallback, useEffect } from 'react';

export type RecorderMode = 'audio' | 'video';

interface UseVoiceRecorderReturn {
  isRecording: boolean;
  duration: number;
  audioBlob: Blob | null;
  mimeType: string;
  stream: MediaStream | null;
  startRecording: (mode?: RecorderMode) => Promise<void>;
  stopRecording: () => void;
  cancelRecording: () => void;
  error: string | null;
}

function getBestMimeType(mode: RecorderMode): string {
  const audioCandidates = [
    'audio/webm;codecs=opus',
    'audio/webm',
    'audio/ogg;codecs=opus',
    'audio/ogg',
    'audio/mp4',
  ];
  const videoCandidates = [
    'video/webm;codecs=vp9,opus',
    'video/webm;codecs=vp8,opus',
    'video/webm',
    'video/mp4',
  ];
  const candidates = mode === 'video' ? videoCandidates : audioCandidates;
  return candidates.find(t => {
    try { return MediaRecorder.isTypeSupported(t); } catch { return false; }
  }) || '';
}

const MAX_DURATION = 120; // seconds

export function useVoiceRecorder(): UseVoiceRecorderReturn {
  const [isRecording, setIsRecording] = useState(false);
  const [duration, setDuration] = useState(0);
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [mimeType, setMimeType] = useState('audio/webm');
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [error, setError] = useState<string | null>(null);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const resolveRef = useRef<((blob: Blob | null) => void) | null>(null);
  const cancelledRef = useRef(false);

  const stopTimer = () => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  };

  const releaseStream = useCallback((s: MediaStream | null) => {
    s?.getTracks().forEach(t => t.stop());
    setStream(null);
  }, []);

  const startRecording = useCallback(async (mode: RecorderMode = 'audio') => {
    setError(null);
    setAudioBlob(null);
    cancelledRef.current = false;

    try {
      const constraints = mode === 'video'
        ? { video: { facingMode: 'user' }, audio: true }
        : { audio: true };

      const mediaStream = await navigator.mediaDevices.getUserMedia(constraints);
      const selectedMime = getBestMimeType(mode);
      setMimeType(selectedMime || (mode === 'video' ? 'video/webm' : 'audio/webm'));
      setStream(mediaStream);

      chunksRef.current = [];
      const options = selectedMime ? { mimeType: selectedMime } : {};
      const recorder = new MediaRecorder(mediaStream, options);
      mediaRecorderRef.current = recorder;

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };

      recorder.onstop = () => {
        stopTimer();
        if (cancelledRef.current) {
          releaseStream(mediaStream);
          resolveRef.current?.(null);
          return;
        }
        const blob = new Blob(chunksRef.current, { type: selectedMime || 'audio/webm' });
        setAudioBlob(blob);
        releaseStream(mediaStream);
        resolveRef.current?.(blob);
      };

      recorder.start(250); // collect every 250ms
      setIsRecording(true);
      setDuration(0);

      // Start timer
      timerRef.current = setInterval(() => {
        setDuration(prev => {
          if (prev >= MAX_DURATION - 1) {
            recorder.stop();
            return prev;
          }
          return prev + 1;
        });
      }, 1000);

    } catch (err: unknown) {
      const e = err as { name?: string };
      if (e.name === 'NotAllowedError' || e.name === 'PermissionDeniedError') {
        setError('נא לאפשר גישה למיקרופון בהגדרות הדפדפן');
      } else {
        setError('הדפדפן שלך אינו תומך בהקלטה');
      }
    }
  }, [releaseStream]);

  const stopRecording = useCallback(() => {
    cancelledRef.current = false;
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
    }
  }, []);

  const cancelRecording = useCallback(() => {
    cancelledRef.current = true;
    stopTimer();
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }
    setIsRecording(false);
    setDuration(0);
    setAudioBlob(null);
    chunksRef.current = [];
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopTimer();
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
        cancelledRef.current = true;
        mediaRecorderRef.current.stop();
      }
    };
  }, []);

  return {
    isRecording,
    duration,
    audioBlob,
    mimeType,
    stream,
    startRecording,
    stopRecording,
    cancelRecording,
    error,
  };
}
