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
  const appliedRemoteAnswerRef = useRef(false);
  const seenCandidateKeysRef = useRef<Set<string>>(new Set());
  const teardownRef = useRef<Array<() => void>>([]);
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
    clearTeardown();

    if (peerConnection.current) {
      peerConnection.current.ontrack = null;
      peerConnection.current.onicecandidate = null;
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
    appliedRemoteAnswerRef.current = false;
    seenCandidateKeysRef.current.clear();
    setCallState(initialCallState);
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

  const attachRemoteIceCandidate = useCallback(async (pc: RTCPeerConnection, candidateValue: unknown) => {
    const candidate = toRtcIceCandidate(candidateValue);
    if (!candidate) return;
    const key = candidateKey(candidate);
    if (seenCandidateKeysRef.current.has(key)) return;
    seenCandidateKeysRef.current.add(key);

    if (!pc.remoteDescription) return;

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
        await attachRemoteIceCandidate(pc, change.doc.data().candidate ?? change.doc.data());
      });
    });

    attachTeardown(unsubCall);
    attachTeardown(unsubCandidates);
  }, [attachRemoteIceCandidate, attachTeardown, cleanup, startDurationTimer]);

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
        receiverName: typeof data.receiverName === 'string' ? data.receiverName : (profile?.displayName ?? ''),
        localStream: null,
        remoteStream: null,
        isMuted: false,
        isVideoOff: false,
        duration: 0,
      }));
    } catch (error) {
      console.error('Error hydrating incoming call from Firestore:', error);
    }
  }, [profile?.displayName, user?.uid]);

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
      return;
    }

    if (event.signalType === 'answer') {
      if (!peerConnection.current || !event.sdp || appliedRemoteAnswerRef.current) return;
      try {
        await peerConnection.current.setRemoteDescription(new RTCSessionDescription({ type: 'answer', sdp: event.sdp }));
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
  }, [attachRemoteIceCandidate, cleanup, handleIncomingCallDoc, startDurationTimer, user]);

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
    const q = query(callsRef, where('receiverId', '==', user.uid), where('status', '==', 'ringing'));

    const unsubscribe = onSnapshot(q, (snapshot) => {
      snapshot.docChanges().forEach(change => {
        if (change.type === 'added' && callStateRef.current.status === 'idle') {
          const data = change.doc.data() as Record<string, unknown>;
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
            receiverName: profile?.displayName || '',
          }));
        }
      });
    });

    attachTeardown(unsubscribe);
    return () => unsubscribe();
  }, [attachTeardown, profile?.displayName, user]);

  const startCall = async (receiverId: string, receiverName: string, type: 'voice' | 'video') => {
    if (!user || !profile) return;

    try {
      cleanup();
      pendingOfferRef.current = null;
      appliedRemoteAnswerRef.current = false;
      seenCandidateKeysRef.current.clear();

      const localStream = await getLocalStream(type === 'video');
      localStreamRef.current = localStream;

      const pc = new RTCPeerConnection(rtcConfig);
      peerConnection.current = pc;

      localStream.getTracks().forEach(track => pc.addTrack(track, localStream));

      const remoteStream = new MediaStream();
      pc.ontrack = (event) => {
        event.streams[0].getTracks().forEach(track => remoteStream.addTrack(track));
        setCallState(prev => ({ ...prev, remoteStream }));
      };

      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);

      const callRef = doc(collection(db, 'calls'));
      const callId = callRef.id;
      const callRecord = {
        callerId: user.uid,
        callerName: profile.displayName,
        callerPhoto: profile.photoURL,
        receiverId,
        receiverName,
        type,
        status: 'ringing',
        offer: { type: offer.type, sdp: offer.sdp },
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      };
      await setDoc(callRef, callRecord);

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
        remoteStream,
        isMuted: false,
        isVideoOff: false,
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
      const localStream = await getLocalStream(currentCall.type === 'video');
      localStreamRef.current = localStream;

      const pc = new RTCPeerConnection(rtcConfig);
      peerConnection.current = pc;

      localStream.getTracks().forEach(track => pc.addTrack(track, localStream));

      const remoteStream = new MediaStream();
      pc.ontrack = (event) => {
        event.streams[0].getTracks().forEach(track => remoteStream.addTrack(track));
        setCallState(prev => ({ ...prev, remoteStream }));
      };

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

      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);

      const updateData = {
        answer: { type: answer.type, sdp: answer.sdp },
        status: 'active',
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

      const unsubCandidates = onSnapshot(collection(db, 'calls', currentCall.callId, 'candidates'), (snapshot) => {
        snapshot.docChanges().forEach(async (change) => {
          if (change.type !== 'added') return;
          const data = change.doc.data();
          if (data.from === user.uid) return;
          await attachRemoteIceCandidate(pc, data.candidate ?? data);
        });
      });
      const unsubCall = onSnapshot(doc(db, 'calls', currentCall.callId), (snapshot) => {
        const data = snapshot.data() as Record<string, unknown> | undefined;
        if (!data) return;
        if (data.status === 'ended') {
          cleanup();
        }
      });
      attachTeardown(unsubCandidates);
      attachTeardown(unsubCall);

      appliedRemoteAnswerRef.current = true;
      setCallState(prev => ({
        ...prev,
        status: 'active',
        localStream,
        remoteStream,
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

  return (
    <CallContext.Provider value={{
      callState,
      startCall,
      answerCall,
      endCall,
      declineCall,
      toggleMute,
      toggleVideo,
      signalingMode,
      signalingDetail,
    }}>
      {children}
    </CallContext.Provider>
  );
}

export const useCall = () => useContext(CallContext);
