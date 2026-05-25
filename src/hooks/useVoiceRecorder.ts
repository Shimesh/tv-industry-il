'use client';

import { useState, useRef, useCallback, useEffect } from 'react';

export type RecorderMode = 'audio' | 'video';

interface UseVoiceRecorderReturn {
  isRecording: boolean;
  isRequestingPermission: boolean;
  duration: number;
  audioBlob: Blob | null;
  mimeType: string;
  stream: MediaStream | null;
  startRecording: (mode?: RecorderMode) => Promise<void>;
  stopRecording: () => void;
  cancelRecording: () => void;
  error: string | null;
}

const MAX_DURATION = 120;
const PERMISSION_HINT_DELAY_MS = 1200;

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

  return candidates.find((type) => {
    try {
      return MediaRecorder.isTypeSupported(type);
    } catch {
      return false;
    }
  }) || '';
}

function getRecorderErrorMessage(err: unknown, mode: RecorderMode): string {
  const name = typeof err === 'object' && err && 'name' in err ? String((err as { name?: unknown }).name) : '';
  const target = mode === 'video' ? 'מצלמה ומיקרופון' : 'מיקרופון';

  if (name === 'NotAllowedError' || name === 'PermissionDeniedError') {
    return `לא ניתן לגשת ל${target}. בדקו שההרשאה פתוחה בדפדפן ונסו שוב.`;
  }

  if (name === 'NotFoundError' || name === 'DevicesNotFoundError') {
    return mode === 'video'
      ? 'לא נמצאו מצלמה או מיקרופון זמינים במכשיר.'
      : 'לא נמצא מיקרופון זמין במכשיר.';
  }

  if (name === 'NotReadableError' || name === 'TrackStartError') {
    return `${target} כבר בשימוש על ידי אפליקציה אחרת. סגרו אותה ונסו שוב.`;
  }

  if (name === 'SecurityError') {
    return 'הדפדפן חסם הקלטה בעמוד הזה. ודאו שהאתר פתוח ב-HTTPS ושההרשאות מאופשרות.';
  }

  if (name === 'NotSupportedError') {
    return 'הדפדפן הזה לא תומך בהקלטת הודעות.';
  }

  return mode === 'video'
    ? 'הדפדפן לא הצליח להתחיל הקלטת וידאו.'
    : 'הדפדפן לא הצליח להתחיל הקלטה קולית.';
}

export function useVoiceRecorder(): UseVoiceRecorderReturn {
  const [isRecording, setIsRecording] = useState(false);
  const [isRequestingPermission, setIsRequestingPermission] = useState(false);
  const [duration, setDuration] = useState(0);
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [mimeType, setMimeType] = useState('audio/webm');
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [error, setError] = useState<string | null>(null);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const permissionHintTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cancelledRef = useRef(false);
  const activeStreamRef = useRef<MediaStream | null>(null);

  const clearPermissionHintTimer = useCallback(() => {
    if (permissionHintTimerRef.current) {
      clearTimeout(permissionHintTimerRef.current);
      permissionHintTimerRef.current = null;
    }
  }, []);

  const stopTimer = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const releaseStream = useCallback((nextStream: MediaStream | null) => {
    nextStream?.getTracks().forEach((track) => track.stop());
    if (activeStreamRef.current === nextStream) activeStreamRef.current = null;
    setStream(null);
  }, []);

  const resetRecordingState = useCallback(() => {
    stopTimer();
    clearPermissionHintTimer();
    setIsRequestingPermission(false);
    setIsRecording(false);
    setDuration(0);
    setAudioBlob(null);
    chunksRef.current = [];
  }, [clearPermissionHintTimer, stopTimer]);

  const startRecording = useCallback(async (mode: RecorderMode = 'audio') => {
    setError(null);
    setAudioBlob(null);
    setIsRequestingPermission(true);
    cancelledRef.current = false;

    try {
      if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
        throw new DOMException('Media recording is not supported', 'NotSupportedError');
      }

      clearPermissionHintTimer();
      permissionHintTimerRef.current = setTimeout(() => {
        setError(mode === 'video'
          ? 'מחכה לאישור גישה למצלמה ולמיקרופון בדפדפן.'
          : 'מחכה לאישור גישה למיקרופון בדפדפן.');
      }, PERMISSION_HINT_DELAY_MS);

      const constraints = mode === 'video'
        ? { video: { facingMode: 'user' }, audio: true }
        : { audio: true };

      const mediaStream = await navigator.mediaDevices.getUserMedia(constraints);
      clearPermissionHintTimer();
      setIsRequestingPermission(false);
      setError(null);

      activeStreamRef.current = mediaStream;
      const selectedMime = getBestMimeType(mode);
      setMimeType(selectedMime || (mode === 'video' ? 'video/webm' : 'audio/webm'));
      setStream(mediaStream);

      chunksRef.current = [];
      const recorder = new MediaRecorder(mediaStream, selectedMime ? { mimeType: selectedMime } : undefined);
      mediaRecorderRef.current = recorder;

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunksRef.current.push(event.data);
      };

      recorder.onstop = () => {
        stopTimer();
        if (cancelledRef.current) {
          releaseStream(mediaStream);
          return;
        }
        const blob = new Blob(chunksRef.current, { type: selectedMime || (mode === 'video' ? 'video/webm' : 'audio/webm') });
        setAudioBlob(blob);
        releaseStream(mediaStream);
      };

      recorder.start(250);
      setIsRecording(true);
      setDuration(0);

      timerRef.current = setInterval(() => {
        setDuration((prev) => {
          if (prev >= MAX_DURATION - 1 && recorder.state !== 'inactive') {
            recorder.stop();
            setIsRecording(false);
            return prev;
          }
          return prev + 1;
        });
      }, 1000);
    } catch (err: unknown) {
      resetRecordingState();
      releaseStream(activeStreamRef.current);
      setError(getRecorderErrorMessage(err, mode));
    }
  }, [clearPermissionHintTimer, releaseStream, resetRecordingState, stopTimer]);

  const stopRecording = useCallback(() => {
    cancelledRef.current = false;
    clearPermissionHintTimer();
    setIsRequestingPermission(false);
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
    }
  }, [clearPermissionHintTimer]);

  const cancelRecording = useCallback(() => {
    cancelledRef.current = true;
    resetRecordingState();
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    } else {
      releaseStream(activeStreamRef.current);
    }
  }, [releaseStream, resetRecordingState]);

  useEffect(() => {
    return () => {
      cancelledRef.current = true;
      stopTimer();
      clearPermissionHintTimer();
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
        mediaRecorderRef.current.stop();
      } else {
        releaseStream(activeStreamRef.current);
      }
    };
  }, [clearPermissionHintTimer, releaseStream, stopTimer]);

  return {
    isRecording,
    isRequestingPermission,
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
