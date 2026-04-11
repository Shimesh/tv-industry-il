import type { Message } from '@/hooks/useChat';

export type ChatLocalMessageState = 'sending' | 'failed';

export type ChatTransportMode = 'legacy' | 'preview' | 'connecting' | 'connected' | 'reconnecting' | 'offline' | 'degraded';

export interface ChatConnectionState {
  mode: ChatTransportMode;
  online: boolean;
  label: string;
  detail: string;
}

export interface ChatUiMessage extends Message {
  optimisticId?: string;
  localState?: ChatLocalMessageState;
  localStatusText?: string;
  localCreatedAt?: number;
  localPayload?: ChatOptimisticPayload;
}

export interface ChatOptimisticPayload {
  text: string;
  type: Message['type'];
  file?: File | null;
  fileName?: string | null;
  fileSize?: number | null;
  duration?: number | null;
  mimeType?: string | null;
  replyTo?: Message['replyTo'] | null;
}
