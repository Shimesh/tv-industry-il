import { getChatSocketBridge } from './socketClient';
import type { ChatV2AuthPayload, ChatV2CallEventPayload, ChatV2CallSignalPayload } from './protocol';
import { isChatSocketEnabled } from './featureFlags';

export function isCallSignalingSocketEnabled(): boolean {
  return isChatSocketEnabled();
}

export function getCallSignalingBridge() {
  return getChatSocketBridge();
}

export async function connectCallSignaling(auth?: ChatV2AuthPayload | null): Promise<boolean> {
  const bridge = getChatSocketBridge();
  if (!bridge.enabled) return false;

  if (auth) {
    bridge.setAuth(auth);
  }

  if (!bridge.connected) {
    bridge.connect(auth ?? undefined);
  }

  return bridge.connected;
}

export function subscribeCallSignals(handler: (payload: ChatV2CallEventPayload) => void): () => void {
  const bridge = getChatSocketBridge();
  if (!bridge.enabled) return () => {};

  return bridge.on('call:event', handler);
}

export async function emitCallSignal(
  eventName: 'call:ring' | 'call:accept' | 'call:decline' | 'call:offer' | 'call:answer' | 'call:ice' | 'call:end',
  payload: Omit<ChatV2CallSignalPayload, 'signalType'> & { token?: string | null; signalType?: ChatV2CallSignalPayload['signalType'] }
): Promise<boolean> {
  if (!isCallSignalingSocketEnabled()) return false;

  const socket = getCallSignalingBridge();
  if (!socket.connected) {
    socket.connect(payload.token ? { token: payload.token } : undefined);
  }

  if (!socket.connected) return false;

  socket.emit(eventName, {
    ...payload,
    signalType: payload.signalType ?? (eventName.split(':')[1] as ChatV2CallSignalPayload['signalType']),
  });

  return true;
}
