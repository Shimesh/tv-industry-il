'use client';

import { createContext, useContext, useState, useEffect, useRef, ReactNode, useCallback } from 'react';
import { useAuth } from './AuthContext';
import { db } from '@/lib/firebase';
import { rtcConfig, getLocalStream, stopStream } from '@/lib/webrtc';
import {
  doc, setDoc, onSnapshot, collection, addDoc, deleteDoc,
  serverTimestamp, query, where, getDocs, updateDoc, Timestamp
} from 'firebase/firestore';

export interface CallState {
  callId: string | null;
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
}

const initialCallState: CallState = {
  callId: null,
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
});

export function CallProvider({ children }: { children: ReactNode }) {
  const { user, profile } = useAuth();
  const [callState, setCallState] = useState<CallState>(initialCallState);
  const peerConnection = useRef<RTCPeerConnection | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Listen for incoming calls
  useEffect(() => {
    if (!user) return;

    const callsRef = collection(db, 'calls');
    const q = query(callsRef, where('receiverId', '==', user.uid), where('status', '==', 'ringing'));

    const unsubscribe = onSnapshot(q, (snapshot) => {
      snapshot.docChanges().forEach(change => {
        if (change.type === 'added' && callState.status === 'idle') {
          const data = change.doc.data();
          setCallState(prev => ({
            ...prev,
            callId: change.doc.id,
            status: 'ringing',
            type: data.type || 'voice',
            isIncoming: true,
            callerName: data.callerName || 'משתמש',
            callerPhoto: data.callerPhoto || null,
            receiverId: user.uid,
            receiverName: profile?.displayName || '',
          }));
        }
      });
    });

    return () => unsubscribe();
  }, [user, profile, callState.status]);

  const cleanup = useCallback(() => {
    if (peerConnection.current) {
      peerConnection.current.close();
      peerConnection.current = null;
    }
    stopStream(callState.localStream);
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    setCallState(initialCallState);
  }, [callState.localStream]);

  const startCall = async (receiverId: string, receiverName: string, type: 'voice' | 'video') => {
    if (!user || !profile) return;

    try {
      const localStream = await getLocalStream(type === 'video');

      // Create peer connection
      const pc = new RTCPeerConnection(rtcConfig);
      peerConnection.current = pc;

      // Add local tracks
      localStream.getTracks().forEach(track => pc.addTrack(track, localStream));

      // Handle remote stream
      const remoteStream = new MediaStream();
      pc.ontrack = (event) => {
        event.streams[0].getTracks().forEach(track => remoteStream.addTrack(track));
        setCallState(prev => ({ ...prev, remoteStream }));
      };

      // Create offer
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);

      // Create call document in Firestore
      const callRef = await addDoc(collection(db, 'calls'), {
        callerId: user.uid,
        callerName: profile.displayName,
        callerPhoto: profile.photoURL,
        receiverId,
        receiverName,
        type,
        status: 'ringing',
        offer: { type: offer.type, sdp: offer.sdp },
        createdAt: serverTimestamp(),
      });

      // Handle ICE candidates
      pc.onicecandidate = async (event) => {
        if (event.candidate) {
          await addDoc(collection(db, 'calls', callRef.id, 'candidates'), {
            candidate: event.candidate.toJSON(),
            from: user.uid,
          });
        }
      };

      setCallState({
        callId: callRef.id,
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

      // Listen for answer
      onSnapshot(doc(db, 'calls', callRef.id), async (snapshot) => {
        const data = snapshot.data();
        if (!data) return;

        if (data.status === 'active' && data.answer && pc.signalingState !== 'closed') {
          try {
            await pc.setRemoteDescription(new RTCSessionDescription(data.answer));
            setCallState(prev => ({ ...prev, status: 'active' }));

            // Start timer
            timerRef.current = setInterval(() => {
              setCallState(prev => ({ ...prev, duration: prev.duration + 1 }));
            }, 1000);
          } catch (err) {
            console.error('Error setting remote description:', err);
          }
        }

        if (data.status === 'ended' || data.status === 'declined') {
          cleanup();
        }
      });

      // Listen for remote ICE candidates
      onSnapshot(collection(db, 'calls', callRef.id, 'candidates'), (snapshot) => {
        snapshot.docChanges().forEach(async (change) => {
          if (change.type === 'added') {
            const data = change.doc.data();
            if (data.from !== user.uid && pc.remoteDescription) {
              try {
                await pc.addIceCandidate(new RTCIceCandidate(data.candidate));
              } catch (err) {
                console.error('Error adding ICE candidate:', err);
              }
            }
          }
        });
      });

    } catch (err) {
      console.error('Error starting call:', err);
      cleanup();
    }
  };

  const answerCall = async () => {
    if (!callState.callId || !user || !profile) return;

    try {
      const localStream = await getLocalStream(callState.type === 'video');

      const pc = new RTCPeerConnection(rtcConfig);
      peerConnection.current = pc;

      localStream.getTracks().forEach(track => pc.addTrack(track, localStream));

      const remoteStream = new MediaStream();
      pc.ontrack = (event) => {
        event.streams[0].getTracks().forEach(track => remoteStream.addTrack(track));
        setCallState(prev => ({ ...prev, remoteStream }));
      };

      // Get offer from Firestore
      const callDoc = await new Promise<Record<string, unknown>>((resolve) => {
        const unsub = onSnapshot(doc(db, 'calls', callState.callId!), (snap) => {
          unsub();
          resolve(snap.data() as Record<string, unknown>);
        });
      });

      const offer = callDoc.offer as { type: RTCSdpType; sdp: string };
      await pc.setRemoteDescription(new RTCSessionDescription(offer));

      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);

      // Update call with answer
      await updateDoc(doc(db, 'calls', callState.callId), {
        answer: { type: answer.type, sdp: answer.sdp },
        status: 'active',
      });

      // Handle ICE candidates
      pc.onicecandidate = async (event) => {
        if (event.candidate && callState.callId) {
          await addDoc(collection(db, 'calls', callState.callId, 'candidates'), {
            candidate: event.candidate.toJSON(),
            from: user.uid,
          });
        }
      };

      // Listen for remote ICE candidates
      onSnapshot(collection(db, 'calls', callState.callId, 'candidates'), (snapshot) => {
        snapshot.docChanges().forEach(async (change) => {
          if (change.type === 'added') {
            const data = change.doc.data();
            if (data.from !== user.uid) {
              try {
                await pc.addIceCandidate(new RTCIceCandidate(data.candidate));
              } catch (err) {
                console.error('Error adding ICE candidate:', err);
              }
            }
          }
        });
      });

      setCallState(prev => ({
        ...prev,
        status: 'active',
        localStream,
        remoteStream,
      }));

      // Start timer
      timerRef.current = setInterval(() => {
        setCallState(prev => ({ ...prev, duration: prev.duration + 1 }));
      }, 1000);

      // Listen for call end
      onSnapshot(doc(db, 'calls', callState.callId), (snapshot) => {
        const data = snapshot.data();
        if (data?.status === 'ended') {
          cleanup();
        }
      });

    } catch (err) {
      console.error('Error answering call:', err);
      cleanup();
    }
  };

  const endCall = async () => {
    if (callState.callId) {
      try {
        await updateDoc(doc(db, 'calls', callState.callId), { status: 'ended' });
      } catch (err) {
        console.error('Error ending call:', err);
      }
    }
    cleanup();
  };

  const declineCall = async () => {
    if (callState.callId) {
      try {
        await updateDoc(doc(db, 'calls', callState.callId), { status: 'declined' });
      } catch (err) {
        console.error('Error declining call:', err);
      }
    }
    cleanup();
  };

  const toggleMute = () => {
    if (callState.localStream) {
      callState.localStream.getAudioTracks().forEach(track => {
        track.enabled = !track.enabled;
      });
      setCallState(prev => ({ ...prev, isMuted: !prev.isMuted }));
    }
  };

  const toggleVideo = () => {
    if (callState.localStream) {
      callState.localStream.getVideoTracks().forEach(track => {
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
    }}>
      {children}
    </CallContext.Provider>
  );
}

export const useCall = () => useContext(CallContext);
