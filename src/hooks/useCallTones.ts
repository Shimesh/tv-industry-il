'use client';

import { useEffect, useRef } from 'react';

type ToneStop = () => void;

function getAudioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  try {
    const Ctor =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    return Ctor ? new Ctor() : null;
  } catch {
    return null;
  }
}

// Play a dual-tone burst at (freq1, freq2) for `duration` seconds, then call onDone.
function playBurst(
  ctx: AudioContext,
  freq1: number,
  freq2: number | null,
  duration: number,
  gainValue: number,
  onDone?: () => void,
): void {
  const g = ctx.createGain();
  const now = ctx.currentTime;
  g.gain.setValueAtTime(0, now);
  g.gain.linearRampToValueAtTime(gainValue, now + 0.015);
  g.gain.setValueAtTime(gainValue, now + duration - 0.04);
  g.gain.linearRampToValueAtTime(0, now + duration);
  g.connect(ctx.destination);

  const osc1 = ctx.createOscillator();
  osc1.type = 'sine';
  osc1.frequency.value = freq1;
  osc1.connect(g);
  osc1.start(now);
  osc1.stop(now + duration);

  if (freq2 !== null) {
    const osc2 = ctx.createOscillator();
    osc2.type = 'sine';
    osc2.frequency.value = freq2;
    osc2.connect(g);
    osc2.start(now);
    osc2.stop(now + duration);
  }

  if (onDone) {
    setTimeout(onDone, duration * 1000);
  }
}

// Ringback tone: 1s on (400+450 Hz), 2s off — repeats until stopped
function startRingback(ctx: AudioContext): ToneStop {
  let active = true;
  let tid: ReturnType<typeof setTimeout> | null = null;

  function loop() {
    if (!active) return;
    playBurst(ctx, 400, 450, 1.0, 0.18, () => {
      if (!active) return;
      tid = setTimeout(loop, 2000); // 2s silence
    });
  }

  loop();
  return () => {
    active = false;
    if (tid) clearTimeout(tid);
  };
}

// Incoming ring: 0.4s on (480+620 Hz), 0.2s off, 0.4s on, 2s off — repeats
function startRing(ctx: AudioContext): ToneStop {
  let active = true;
  let tid: ReturnType<typeof setTimeout> | null = null;

  function loop() {
    if (!active) return;
    playBurst(ctx, 480, 620, 0.4, 0.22, () => {
      if (!active) return;
      tid = setTimeout(() => {
        if (!active) return;
        playBurst(ctx, 480, 620, 0.4, 0.22, () => {
          if (!active) return;
          tid = setTimeout(loop, 2000);
        });
      }, 200);
    });
  }

  loop();
  return () => {
    active = false;
    if (tid) clearTimeout(tid);
  };
}

// Connected tone: short rising two-tone ding
function playConnected(ctx: AudioContext): void {
  playBurst(ctx, 520, null, 0.12, 0.15, () => {
    playBurst(ctx, 780, null, 0.18, 0.12);
  });
}

// Disconnect tone: short descending two-note
function playDisconnect(ctx: AudioContext): void {
  playBurst(ctx, 480, null, 0.18, 0.18, () => {
    playBurst(ctx, 320, null, 0.22, 0.14);
  });
}

type CallStatus = 'idle' | 'ringing' | 'calling' | 'active' | 'ended';

export function useCallTones(status: CallStatus, isIncoming: boolean): void {
  const ctxRef = useRef<AudioContext | null>(null);
  const stopRef = useRef<ToneStop | null>(null);
  const prevStatusRef = useRef<CallStatus>('idle');

  // Lazily create/resume AudioContext on first non-idle status
  function getCtx(): AudioContext | null {
    if (!ctxRef.current) {
      ctxRef.current = getAudioContext();
    }
    if (ctxRef.current?.state === 'suspended') {
      void ctxRef.current.resume();
    }
    return ctxRef.current;
  }

  function stopCurrent() {
    stopRef.current?.();
    stopRef.current = null;
  }

  useEffect(() => {
    const prev = prevStatusRef.current;
    prevStatusRef.current = status;

    if (status === prev) return;

    const ctx = getCtx();
    if (!ctx) return;

    // Stop any looping tone first
    stopCurrent();

    if (status === 'calling' && !isIncoming) {
      // Outgoing call waiting — play ringback
      stopRef.current = startRingback(ctx);
    } else if (status === 'ringing' && isIncoming) {
      // Incoming call — play ring
      stopRef.current = startRing(ctx);
    } else if (status === 'active' && (prev === 'calling' || prev === 'ringing')) {
      // Call connected
      playConnected(ctx);
    } else if ((status === 'idle' || status === 'ended') && (prev === 'active' || prev === 'calling' || prev === 'ringing')) {
      // Call ended / disconnected
      playDisconnect(ctx);
    }

    return () => {
      // Only clean up looping tones on unmount; one-shots clean themselves up
    };
  }, [status, isIncoming]); // eslint-disable-line react-hooks/exhaustive-deps

  // Stop loops on unmount
  useEffect(() => {
    return () => {
      stopCurrent();
      ctxRef.current?.close().catch(() => {});
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
}
