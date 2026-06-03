'use client';

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { useAuth } from './AuthContext';
import { db } from '@/lib/firebase';
import { rtcConfig, getLocalStream, stopStream } from '@/lib/webrtc';
import {
  addDoc,
  collection,
  doc,
  getDoc,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
} from 'firebase/firestore';
import {
  connectCallSignaling,
  emitCallSignal,
  getCallSignalingBridge,
  isCallSignalingSocketEnabled,
  subscribeCallSignals,
} from '@/lib/chat-v2/callSignaling';
import type { ChatV2CallSignalPayload } from '@/lib/chat-v2/protocol';

export interface CallState {
  callId: string | null;
  callerId: string;
  status: 'idle' | 'ringing' | 'calling' | 'active' | 'ended';
  type: 'voice' | 'video';
  isIncoming: boolean;
  callerName: string;
  callerPhoto: string | null;
  receiverId: string;
  receiverName: string;
  localStream: MediaStream | null;
  remoteStream: MediaStream | null;
  isMuted: boolean;
  isVideoOff: boolean;
  isFrontCamera: boolean;
  duration: number;
}

interface CallContextType {
  callState: CallState;
  startCall: (receiverId: string, receiverName: string, type: 'voice' | 'video') => Promise<void>;
  answerCall: () => Promise<void>;
  endCall: () => Promise<void>;
  declineCall: () => Promise<void>;
  toggleMute: () => void;
  toggleVideo: () => void;
  toggleCamera: () => Promise<void>;
  signalingMode: 'firestore' | 'socket-ready';
  signalingDetail: string;
}

const initialCallState: CallState = {
  callId: null,
  callerId: '',
  status: 'idle',
  type: 'voice',
  isIncoming: false,
  callerName: '',
  callerPhoto: null,
  receiverId: '',
  receiverName: '',
  localStream: null,
  remoteStream: null,
  isMuted: false,
  isVideoOff: false,
  isFrontCamera: true,
  duration: 0,
};

const CallContext = createContext<CallContextType>({
  callState: initialCallState,
  startCall: async () => {},
  answerCall: async () => {},
  endCall: async () => {},
  declineCall: async () => {},
  toggleMute: () => {},
  toggleVideo: () => {},
  toggleCamera: async () => {},
  signalingMode: 'firestore',
  signalingDetail: 'Firestore signaling is active.',
});

function isTruthyFlag(value: string | undefined): boolean {
  return value === '1' || value === 'true' || value === 'on';
}

function candidateKey(candidate: unknown): string {
  if (!candidate || typeof candidate !== 'object') {
    return String(candidate ?? 'unknown');
  }
  const payload = candidate as Record<string, unknown>;
  const key = {
    candidate: payload.candidate ?? null,
    sdpMid: payload.sdpMid ?? null,
    sdpMLineIndex: payload.sdpMLineIndex ?? null,
    usernameFragment: payload.usernameFragment ?? null,
  };
  return JSON.stringify(key);
}

function toRtcSessionDescription(value: unknown): RTCSessionDescriptionInit | null {
  if (!value || typeof value !== 'object') return null;
  const payload = value as Record<string, unknown>;
  const type = payload.type;
  const sdp = payload.sdp;
  if ((type === 'offer' || type === 'answer') && typeof sdp === 'string') {
    return { type, sdp };
  }
  return null;
}

function toRtcIceCandidate(value: unknown): RTCIceCandidateInit | null {
  if (!value || typeof value !== 'object') return null;
  const payload = value as Record<string, unknown>;
  const candidate = payload.candidate;
  if (typeof candidate !== 'string') return null;
  return {
    candidate,
    sdpMid: typeof payload.sdpMid === 'string' ? payload.sdpMid : undefined,
    sdpMLineIndex: typeof payload.sdpMLineIndex === 'number' ? payload.sdpMLineIndex : undefined,
    usernameFragment: typeof payload.usernameFragment === 'string' ? payload.usernameFragment : undefined,
  };
}

export function CallProvider({ children }: { children: ReactNode }) {
  const { user, profile } = useAuth();
  const [callState, setCallState] = useState<CallState>(initialCallState);
  const [socketCallReady, setSocketCallReady] = useState(false);
  const peerConnection = useRef<RTCPeerConnection | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const bridge = useRef(getCallSignalingBridge()).current;
  const callStateRef = useRef<CallState>(initialCallState);
  const localStreamRef = useRef<MediaStream | null>(null);
  const pendingOfferRef = useRef<RTCSessionDescriptionInit | null>(null);
  const pendingRemoteCandidatesRef = useRef<RTCIceCandidateInit[]>([]);
  const appliedRemoteAnswerRef = useRef(false);
  const seenCandidateKeysRef = useRef<Set<string>>(new Set());
  const teardownRef = useRef<Array<() => void>>([]);
  const pendingCallActionRef = useRef<{ callId: string; action: 'answer' | 'decline' } | null>(null);
  // Prevents cleanup() from executing twice in rapid succession (e.g. Firestore
  // listener fires before the direct endCall() cleanup call resolves).
  const cleanupRunningRef = useRef(false);
  // Ref-based profile snapshot so the Firestore listener effect doesn't
  // re-subscribe every time the profile finishes loading during auth init
  // (null → fallback → server), which would trigger spurious 'added' snapshots.
  const profileRef = useRef({ displayName: profile?.displayName || '', photoURL: profile?.photoURL || null });
  const socketCallEnabled = isCallSignalingSocketEnabled();
  const signalingMode: 'firestore' | 'socket-ready' = socketCallEnabled ? 'socket-ready' : 'firestore';
  const signalingDetail = socketCallEnabled
    ? socketCallReady
      ? 'Socket.IO signaling is active for calls, with Firestore fallback.'
      : 'Socket.IO signaling is enabled; Firestore fallback remains available while the socket connects.'
    : 'Firestore signaling is active.';

  useEffect(() => {
    callStateRef.current = callState;
  }, [callState]);

  useEffect(() => {
    profileRef.current = { displayName: profile?.displayName || '', photoURL: profile?.photoURL || null };
  }, [profile?.displayName, profile?.photoURL]);

  // Read URL params set by SW notification action buttons (answer/decline)
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    const callId = params.get('callId');
    const callAction = params.get('callAction');
    if (callId && (callAction === 'answer' || callAction === 'decline')) {
      pendingCallActionRef.current = { callId, action: callAction };
      const url = new URL(window.location.href);
      url.searchParams.delete('callId');
      url.searchParams.delete('callAction');
      window.history.replaceState({}, '', url.toString());
    }
  }, []);

  // Auto-answer / auto-decline when the targeted ringing call appears
  useEffect(() => {
    if (callState.status !== 'ringing' || !callState.callId) return;
    const pending = pendingCallActionRef.current;
    if (!pending || pending.callId !== callState.callId) return;
    pendingCallActionRef.current = null;

    if (pending.action === 'answer') {
      void answerCall();
    } else {
      void declineCall();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [callState.status, callState.callId]);

  const clearTeardown = useCallback(() => {
    while (teardownRef.current.length > 0) {
      const dispose = teardownRef.current.pop();
      try {
        dispose?.();
      } catch (error) {
        console.error('Error during call cleanup:', error);
      }
    }
  }, []);

  const cleanup = useCallback(() => {
    // Guard against the Firestore listener and endCall() both calling cleanup()
    // in the same event-loop turn (Firestore applies writes locally before the
    // await resolves, so the snapshot callback runs first, then endCall() calls
    // cleanup() again). Without this guard we get a double setCallState() which
    // causes an extra re-render cascade that can unmount ChatWindow and wipe the
    // user's typed message.
    if (cleanupRunningRef.current) return;
    cleanupRunningRef.current = true;

    clearTeardown();

    if (peerConnection.current) {
      peerConnection.current.ontrack = null;
      peerConnection.current.onicecandidate = null;
      peerConnection.current.oniceconnectionstatechange = null;
      peerConnection.current.close();
      peerConnection.current = null;
    }

    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }

    stopStream(localStreamRef.current);
    localStreamRef.current = null;
    pendingOfferRef.current = null;
    pendingRemoteCandidatesRef.current = [];
    appliedRemoteAnswerRef.current = false;
    seenCandidateKeysRef.current.clear();
    setCallState(initialCallState);

    cleanupRunningRef.current = false;
  }, [clearTeardown]);

  const attachTeardown = useCallback((dispose: () => void) => {
    teardownRef.current.push(dispose);
  }, []);

  const startDurationTimer = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
    }
    timerRef.current = setInterval(() => {
      setCallState(prev => ({ ...prev, duration: prev.duration + 1 }));
    }, 1000);
  }, []);

  const flushPendingRemoteCandidates = useCallback(async (pc: RTCPeerConnection) => {
    if (!pc.remoteDescription || pendingRemoteCandidatesRef.current.length === 0) return;

    const queued = [...pendingRemoteCandidatesRef.current];
    pendingRemoteCandidatesRef.current = [];

    for (const candidate of queued) {
      try {
        await pc.addIceCandidate(new RTCIceCandidate(candidate));
      } catch (error) {
        console.error('Error flushing queued ICE candidate:', error);
      }
    }
  }, []);

  const attachRemoteIceCandidate = useCallback(async (pc: RTCPeerConnection, candidateValue: unknown) => {
    const candidate = toRtcIceCandidate(candidateValue);
    if (!candidate) return;
    const key = candidateKey(candidate);
    if (seenCandidateKeysRef.current.has(key)) return;
    seenCandidateKeysRef.current.add(key);

    if (!pc.remoteDescription) {
      pendingRemoteCandidatesRef.current.push(candidate);
      return;
    }

    try {
      await pc.addIceCandidate(new RTCIceCandidate(candidate));
    } catch (error) {
      console.error('Error adding ICE candidate:', error);
    }
  }, []);

  const persistCallRecord = useCallback(async (callId: string, data: Record<string, unknown>) => {
    try {
      await setDoc(doc(db, 'calls', callId), data, { merge: true });
    } catch (error) {
      console.error('Error persisting call record:', error);
    }
  }, []);

  const subscribeFirestoreOutgoingCall = useCallback((callId: string, pc: RTCPeerConnection) => {
    const unsubCall = onSnapshot(doc(db, 'calls', callId), async (snapshot) => {
      const data = snapshot.data();
      if (!data) return;

      if (data.status === 'active' && data.answer && !appliedRemoteAnswerRef.current && pc.signalingState !== 'closed') {
        const answer = toRtcSessionDescription(data.answer);
        if (!answer) return;

        try {
          await pc.setRemoteDescription(new RTCSessionDescription(answer));
          await flushPendingRemoteCandidates(pc);
          appliedRemoteAnswerRef.current = true;
          setCallState(prev => ({ ...prev, status: 'active' }));
          startDurationTimer();
        } catch (error) {
          console.error('Error setting remote description:', error);
        }
      }

      if (data.status === 'ended' || data.status === 'declined') {
        cleanup();
      }
    });

    const unsubCandidates = onSnapshot(collection(db, 'calls', callId, 'candidates'), (snapshot) => {
      snapshot.docChanges().forEach(async (change) => {
        if (change.type !== 'added') return;
        const data = change.doc.data();
        // Skip ICE candidates we sent ourselves
        if (data.from === user?.uid) return;
        await attachRemoteIceCandidate(pc, data.candidate ?? data);
      });
    });

    attachTeardown(unsubCall);
    attachTeardown(unsubCandidates);
  }, [attachRemoteIceCandidate, attachTeardown, cleanup, flushPendingRemoteCandidates, startDurationTimer, user?.uid]);

  const handleIncomingCallDoc = useCallback(async (callId: string) => {
    if (callStateRef.current.status !== 'idle') return;

    try {
      const snapshot = await getDoc(doc(db, 'calls', callId));
      if (!snapshot.exists()) return;

      const data = snapshot.data() as Record<string, unknown>;
      pendingOfferRef.current = toRtcSessionDescription(data.offer) ?? pendingOfferRef.current;

      setCallState(prev => ({
        ...prev,
        callId,
        callerId: typeof data.callerId === 'string' ? data.callerId : (typeof data.fromUid === 'string' ? data.fromUid : ''),
        status: 'ringing',
        type: data.type === 'video' ? 'video' : 'voice',
        isIncoming: true,
        callerName: typeof data.callerName === 'string' ? data.callerName : 'משתמש',
        callerPhoto: typeof data.callerPhoto === 'string' ? data.callerPhoto : null,
        receiverId: typeof data.receiverId === 'string' ? data.receiverId : (user?.uid ?? ''),
        receiverName: typeof data.receiverName === 'string' ? data.receiverName : (profileRef.current.displayName ?? ''),
        localStream: null,
        remoteStream: null,
        isMuted: false,
        isVideoOff: false,
        duration: 0,
      }));
    } catch (error) {
      console.error('Error hydrating incoming call from Firestore:', error);
    }
  }, [user?.uid]);

  const handleSocketCallSignal = useCallback(async (event: ChatV2CallSignalPayload & { fromUid?: string; timestamp?: number; toUid?: string }) => {
    if (!user) return;
    if (event.fromUid && event.fromUid === user.uid) return;

    const current = callStateRef.current;
    if (current.callId && current.callId !== event.callId && current.status !== 'idle') {
      return;
    }

    if (event.signalType === 'ring') {
      await handleIncomingCallDoc(event.callId);
      return;
    }

    if (event.signalType === 'offer') {
      const offer = toRtcSessionDescription({ type: 'offer', sdp: event.sdp });
      if (offer) {
        pendingOfferRef.current = offer;
      }
      return;
    }

    if (event.signalType === 'accept') {
      setCallState(prev => (prev.callId === event.callId && prev.status === 'calling'
        ? { ...prev, status: 'calling' }
        : prev));
      return;
    }

    if (event.signalType === 'answer') {
      if (!peerConnection.current || !event.sdp || appliedRemoteAnswerRef.current) return;
      try {
        await peerConnection.current.setRemoteDescription(new RTCSessionDescription({ type: 'answer', sdp: event.sdp }));
        await flushPendingRemoteCandidates(peerConnection.current);
        appliedRemoteAnswerRef.current = true;
        setCallState(prev => ({ ...prev, status: 'active' }));
        startDurationTimer();
      } catch (error) {
        console.error('Error applying socket answer:', error);
      }
      return;
    }

    if (event.signalType === 'ice' && peerConnection.current) {
      await attachRemoteIceCandidate(peerConnection.current, event.candidate);
      return;
    }

    if (event.signalType === 'decline' || event.signalType === 'busy' || event.signalType === 'end') {
      cleanup();
    }
  }, [attachRemoteIceCandidate, cleanup, flushPendingRemoteCandidates, handleIncomingCallDoc, startDurationTimer, user]);

  useEffect(() => {
    if (!user) {
      setSocketCallReady(false);
      return;
    }

    if (!socketCallEnabled) {
      setSocketCallReady(false);
      return;
    }

    let cancelled = false;
    const unsubscribeStatus = bridge.subscribeStatus(status => {
      setSocketCallReady(status.mode === 'connected');
    });
    const unsubscribeSignals = subscribeCallSignals(handleSocketCallSignal);

    void user.getIdToken().then((token) => {
      if (cancelled) return;
      void connectCallSignaling({
        token,
        deviceId: `call-${user.uid}`,
        appVersion: process.env.NEXT_PUBLIC_APP_VERSION || 'chat-v2',
      });
    }).catch((error) => {
      console.error('Failed to connect call signaling socket:', error);
      setSocketCallReady(false);
    });

    return () => {
      cancelled = true;
      unsubscribeStatus();
      unsubscribeSignals();
      setSocketCallReady(false);
    };
  }, [bridge, handleSocketCallSignal, socketCallEnabled, user]);

  useEffect(() => {
    if (!user) return;

    const callsRef = collection(db, 'calls');
    const TWO_HOURS_MS = 2 * 60 * 60 * 1000;

    // Helper: is this call document recent enough to recover?
    const isRecent = (data: Record<string, unknown>) => {
      const ts = data.createdAt;
      const ms = ts && typeof ts === 'object' && 'toMillis' in ts
        ? (ts as { toMillis: () => number }).toMillis()
        : typeof ts === 'number' ? ts : 0;
      return ms > 0 && Date.now() - ms < TWO_HOURS_MS;
    };

    // Listener A: calls where current user is the RECEIVER
    const receiverQ = query(callsRef, where('receiverId', '==', user.uid));
    const unsubReceiver = onSnapshot(receiverQ, (snapshot) => {
      snapshot.docChanges().forEach(change => {
        if (change.type !== 'added') return;
        const data = change.doc.data() as Record<string, unknown>;
        if (callStateRef.current.status !== 'idle') return;

        if (data.status === 'ringing') {
          pendingOfferRef.current = toRtcSessionDescription(data.offer) ?? pendingOfferRef.current;
          setCallState(prev => ({
            ...prev,
            callId: change.doc.id,
            callerId: typeof data.callerId === 'string' ? data.callerId : '',
            status: 'ringing',
            type: data.type === 'video' ? 'video' : 'voice',
            isIncoming: true,
            callerName: typeof data.callerName === 'string' ? data.callerName : 'משתמש',
            callerPhoto: typeof data.callerPhoto === 'string' ? data.callerPhoto : null,
            receiverId: user.uid,
            receiverName: profileRef.current.displayName,
          }));
        } else if (data.status === 'active' && isRecent(data)) {
          // Recovery: app was killed/restarted during an active call
          setCallState(prev => ({
            ...prev,
            callId: change.doc.id,
            callerId: typeof data.callerId === 'string' ? data.callerId : '',
            status: 'active',
            type: data.type === 'video' ? 'video' : 'voice',
            isIncoming: true,
            callerName: typeof data.callerName === 'string' ? data.callerName : 'משתמש',
            callerPhoto: typeof data.callerPhoto === 'string' ? data.callerPhoto : null,
            receiverId: user.uid,
            receiverName: profileRef.current.displayName,
            localStream: null,
            remoteStream: null,
            isFrontCamera: true,
          }));
        }
      });
    });

    // Listener B: calls where current user is the CALLER (for active-call recovery)
    const callerQ = query(callsRef, where('callerId', '==', user.uid));
    const unsubCaller = onSnapshot(callerQ, (snapshot) => {
      snapshot.docChanges().forEach(change => {
        if (change.type !== 'added') return;
        const data = change.doc.data() as Record<string, unknown>;
        if (callStateRef.current.status !== 'idle') return;
        if (data.status !== 'active' || !isRecent(data)) return;

        setCallState(prev => ({
          ...prev,
          callId: change.doc.id,
          callerId: user.uid,
          status: 'active',
          type: data.type === 'video' ? 'video' : 'voice',
          isIncoming: false,
          callerName: profileRef.current.displayName,
          callerPhoto: profileRef.current.photoURL,
          receiverId: typeof data.receiverId === 'string' ? data.receiverId : '',
          receiverName: typeof data.receiverName === 'string' ? data.receiverName : '',
          localStream: null,
          remoteStream: null,
          isFrontCamera: true,
        }));
      });
    });

    // Do NOT add these to teardownRef — they must survive individual call
    // cleanup() calls so the app can keep detecting incoming calls after a
    // call ends. Let the effect's own cleanup function manage them.
    return () => { unsubReceiver(); unsubCaller(); };
  }, [user]);

  const startCall = async (receiverId: string, receiverName: string, type: 'voice' | 'video') => {
    if (!user || !profile) return;

    try {
      // Reset the guard so cleanup() is allowed to run for this new call.
      cleanupRunningRef.current = false;
      cleanup();
      pendingOfferRef.current = null;
      appliedRemoteAnswerRef.current = false;
      seenCandidateKeysRef.current.clear();
      pendingRemoteCandidatesRef.current = [];

      const localStream = await getLocalStream(type === 'video');
      localStreamRef.current = localStream;

      const pc = new RTCPeerConnection(rtcConfig);
      peerConnection.current = pc;

      localStream.getTracks().forEach(track => pc.addTrack(track, localStream));

      // Prefer event.streams[0] — it's the same MediaStream for all tracks added
      // via addTrack(track, stream), so we always get the full stream in one hit.
      // Fall back to building a new MediaStream for iOS Safari where streams[0]
      // may be absent. Always store a new reference so CallScreen's srcObject
      // useEffect re-runs.
      pc.ontrack = (event) => {
        if (event.streams?.[0]) {
          const stream = event.streams[0];
          setCallState(prev => prev.remoteStream === stream ? prev : { ...prev, remoteStream: stream });
          return;
        }
        const track = event.track;
        if (!track) return;
        setCallState(prev => {
          if (prev.remoteStream?.getTrackById(track.id)) return prev;
          const allTracks = prev.remoteStream ? [...prev.remoteStream.getTracks(), track] : [track];
          return { ...prev, remoteStream: new MediaStream(allTracks) };
        });
      };

      pc.oniceconnectionstatechange = () => {
        if (pc.iceConnectionState === 'failed') {
          console.warn('[WebRTC] ICE connection failed on caller side — TURN server may be unreachable.');
        }
      };

      const callRef = doc(collection(db, 'calls'));
      const callId = callRef.id;

      // Set up onicecandidate BEFORE setLocalDescription so no candidates are missed
      pc.onicecandidate = async (event) => {
        if (!event.candidate) return;
        const candidate = event.candidate.toJSON();
        void emitCallSignal('call:ice', {
          callId,
          targetUid: receiverId,
          signalType: 'ice',
          candidate,
        });
        await addDoc(collection(db, 'calls', callId, 'candidates'), {
          candidate,
          from: user.uid,
        });
      };

      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);

      const actionToken = typeof crypto !== 'undefined' && crypto.randomUUID
        ? crypto.randomUUID()
        : Math.random().toString(36).slice(2) + Date.now().toString(36);

      const callRecord = {
        callerId: user.uid,
        callerName: profile.displayName,
        callerPhoto: profile.photoURL,
        receiverId,
        receiverName,
        type,
        status: 'ringing',
        offer: { type: offer.type, sdp: offer.sdp },
        actionToken,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      };
      await setDoc(callRef, callRecord);

      // Fire-and-forget push to wake the receiver if the app is closed/backgrounded
      void user.getIdToken().then((idToken) =>
        fetch('/api/call/notify', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${idToken}` },
          body: JSON.stringify({
            callId,
            receiverId,
            callerName: profile.displayName,
            callerPhoto: profile.photoURL ?? null,
            type,
            actionToken,
          }),
        }).catch(() => {}),
      );

      void emitCallSignal('call:ring', {
        callId,
        targetUid: receiverId,
        signalType: 'ring',
      });
      void emitCallSignal('call:offer', {
        callId,
        targetUid: receiverId,
        signalType: 'offer',
        sdp: offer.sdp ?? undefined,
      });

      setCallState({
        callId,
        callerId: user.uid,
        status: 'calling',
        type,
        isIncoming: false,
        callerName: profile.displayName,
        callerPhoto: profile.photoURL,
        receiverId,
        receiverName,
        localStream,
        remoteStream: null, // populated by ontrack when remote tracks arrive
        isMuted: false,
        isVideoOff: false,
        isFrontCamera: true,
        duration: 0,
      });

      subscribeFirestoreOutgoingCall(callId, pc);
    } catch (err) {
      console.error('Error starting call:', err);
      cleanup();
    }
  };

  const answerCall = async () => {
    const currentCall = callStateRef.current;
    if (!currentCall.callId || !user || !profile) return;

    try {
      // Reset cleanup guard and stale ICE state for this new answer attempt.
      cleanupRunningRef.current = false;
      seenCandidateKeysRef.current.clear();
      pendingRemoteCandidatesRef.current = [];
      appliedRemoteAnswerRef.current = false;

      const localStream = await getLocalStream(currentCall.type === 'video');
      localStreamRef.current = localStream;

      const pc = new RTCPeerConnection(rtcConfig);
      peerConnection.current = pc;

      localStream.getTracks().forEach(track => pc.addTrack(track, localStream));

      // Prefer event.streams[0] — covers the case where the caller sent both
      // audio and video tracks as part of the same stream (addTrack(t, stream)).
      // Fall back to building a MediaStream for iOS Safari where streams[0] may
      // be absent.
      pc.ontrack = (event) => {
        if (event.streams?.[0]) {
          const stream = event.streams[0];
          setCallState(prev => prev.remoteStream === stream ? prev : { ...prev, remoteStream: stream });
          return;
        }
        const track = event.track;
        if (!track) return;
        setCallState(prev => {
          if (prev.remoteStream?.getTrackById(track.id)) return prev;
          const allTracks = prev.remoteStream ? [...prev.remoteStream.getTracks(), track] : [track];
          return { ...prev, remoteStream: new MediaStream(allTracks) };
        });
      };

      pc.oniceconnectionstatechange = () => {
        if (pc.iceConnectionState === 'failed') {
          console.warn('[WebRTC] ICE connection failed on receiver side — TURN server may be unreachable.');
        }
      };

      // Set up onicecandidate BEFORE setLocalDescription so no candidates are missed
      pc.onicecandidate = async (event) => {
        if (!event.candidate) return;
        const candidate = event.candidate.toJSON();
        void emitCallSignal('call:ice', {
          callId: currentCall.callId!,
          targetUid: currentCall.callerId,
          signalType: 'ice',
          candidate,
        });
        await addDoc(collection(db, 'calls', currentCall.callId!, 'candidates'), {
          candidate,
          from: user.uid,
        });
      };

      // Subscribe to the caller's ICE candidates BEFORE setRemoteDescription so
      // any candidates that arrive (or are replayed from Firestore) during the
      // async SDP processing are queued via pendingRemoteCandidatesRef and
      // flushed correctly once remoteDescription is set.
      const unsubCandidates = onSnapshot(collection(db, 'calls', currentCall.callId, 'candidates'), (snapshot) => {
        snapshot.docChanges().forEach(async (change) => {
          if (change.type !== 'added') return;
          const data = change.doc.data();
          if (data.from === user.uid) return;
          await attachRemoteIceCandidate(pc, data.candidate ?? data);
        });
      });
      attachTeardown(unsubCandidates);

      let offer = pendingOfferRef.current;
      if (!offer) {
        const callDoc = await getDoc(doc(db, 'calls', currentCall.callId));
        if (callDoc.exists()) {
          offer = toRtcSessionDescription((callDoc.data() as Record<string, unknown>).offer) ?? null;
        }
      }
      if (!offer) {
        throw new Error('Missing call offer');
      }

      await pc.setRemoteDescription(new RTCSessionDescription(offer));
      await flushPendingRemoteCandidates(pc);

      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);

      const updateData = {
        answer: { type: answer.type, sdp: answer.sdp },
        status: 'active',
        answeredAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      };
      await updateDoc(doc(db, 'calls', currentCall.callId), updateData);

      void emitCallSignal('call:accept', {
        callId: currentCall.callId,
        targetUid: currentCall.callerId,
        signalType: 'accept',
      });
      void emitCallSignal('call:answer', {
        callId: currentCall.callId,
        targetUid: currentCall.callerId,
        signalType: 'answer',
        sdp: answer.sdp ?? undefined,
      });

      const unsubCall = onSnapshot(doc(db, 'calls', currentCall.callId), (snapshot) => {
        const data = snapshot.data() as Record<string, unknown> | undefined;
        if (!data) return;
        if (data.status === 'ended') {
          cleanup();
        }
      });
      attachTeardown(unsubCall);

      appliedRemoteAnswerRef.current = true;
      setCallState(prev => ({
        ...prev,
        status: 'active',
        localStream,
        isFrontCamera: true,
        // remoteStream is populated by ontrack — do not overwrite here
      }));
      startDurationTimer();
    } catch (err) {
      console.error('Error answering call:', err);
      cleanup();
    }
  };

  const endCall = async () => {
    const currentCall = callStateRef.current;
    if (currentCall.callId) {
      try {
        await updateDoc(doc(db, 'calls', currentCall.callId), {
          status: 'ended',
          updatedAt: serverTimestamp(),
        });
        void emitCallSignal('call:end', {
          callId: currentCall.callId,
          targetUid: currentCall.isIncoming ? currentCall.callerId : currentCall.receiverId,
          signalType: 'end',
        });
      } catch (err) {
        console.error('Error ending call:', err);
      }
    }
    cleanup();
  };

  const declineCall = async () => {
    const currentCall = callStateRef.current;
    if (currentCall.callId) {
      try {
        await updateDoc(doc(db, 'calls', currentCall.callId), {
          status: 'declined',
          updatedAt: serverTimestamp(),
        });
        void emitCallSignal('call:decline', {
          callId: currentCall.callId,
          targetUid: currentCall.callerId,
          signalType: 'decline',
        });
      } catch (err) {
        console.error('Error declining call:', err);
      }
    }
    cleanup();
  };

  const toggleMute = () => {
    const currentStream = localStreamRef.current;
    if (currentStream) {
      currentStream.getAudioTracks().forEach(track => {
        track.enabled = !track.enabled;
      });
      setCallState(prev => ({ ...prev, isMuted: !prev.isMuted }));
    }
  };

  const toggleVideo = () => {
    const currentStream = localStreamRef.current;
    if (currentStream) {
      currentStream.getVideoTracks().forEach(track => {
        track.enabled = !track.enabled;
      });
      setCallState(prev => ({ ...prev, isVideoOff: !prev.isVideoOff }));
    }
  };

  const toggleCamera = async () => {
    if (!peerConnection.current || !localStreamRef.current) return;
    const isFront = callStateRef.current.isFrontCamera;
    const newFacing = isFront ? 'environment' : 'user';
    try {
      const newVideoStream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: newFacing },
      });
      const newVideoTrack = newVideoStream.getVideoTracks()[0];
      if (!newVideoTrack) return;

      // Replace track on the sender — no renegotiation needed
      const sender = peerConnection.current.getSenders().find(s => s.track?.kind === 'video');
      if (sender) await sender.replaceTrack(newVideoTrack);

      // Stop old video track and build new local stream
      localStreamRef.current.getVideoTracks().forEach(t => t.stop());
      const audioTracks = localStreamRef.current.getAudioTracks();
      const newStream = new MediaStream([...audioTracks, newVideoTrack]);
      localStreamRef.current = newStream;

      setCallState(prev => ({ ...prev, localStream: newStream, isFrontCamera: !isFront }));
    } catch (err) {
      console.error('Error switching camera:', err);
    }
  };

  return (
    <CallContext.Provider value={{
      callState,
      startCall,
      answerCall,
      endCall,
      declineCall,
      toggleMute,
      toggleVideo,
      toggleCamera,
      signalingMode,
      signalingDetail,
    }}>
      {children}
    </CallContext.Provider>
  );
}

export const useCall = () => useContext(CallContext);
