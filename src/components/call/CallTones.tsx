'use client';

import { useCall } from '@/contexts/CallContext';
import { useCallTones } from '@/hooks/useCallTones';

/** Invisible component — plays audio tones for all call state transitions. */
export default function CallTones() {
  const { callState } = useCall();
  useCallTones(callState.status, callState.isIncoming);
  return null;
}
