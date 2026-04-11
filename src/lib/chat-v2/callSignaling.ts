import { getChatSocketBridge } from './socketClient';
import type { ChatV2CallSignalPayload } from './protocol';
import { isChatV2Enabled } from './featureFlags';

export async function emitCallSignal(
  eventName: 'call:ring' | 'call:accept' | 'call:decline' | 'call:offer' | 'call:answer' | 'call:ice' | 'call:end',
  payload: Omit<ChatV2CallSignalPayload, 'signalType'> & { token?: string | null; signalType?: ChatV2CallSignalPayload['signalType'] }
): Promise<boolean> {
  if (!isChatV2Enabled()) return false;

  const socket = getChatSocketBridge();
  if (!socket.connected) {
    if (payload.token) {
      socket.connect({ token: payload.token });
    }
  }

  if (!socket.connected) return false;

  socket.emit(eventName, {
    ...payload,
    signalType: payload.signalType ?? (eventName.split(':')[1] as ChatV2CallSignalPayload['signalType']),
  });

  return true;
}
