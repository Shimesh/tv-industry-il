import { io, type Socket } from 'socket.io-client';
import { getChatV2SocketUrl, isChatSocketEnabled } from './featureFlags';
import type {
  ChatV2AuthPayload,
  ChatV2ClientToServerEvents,
  ChatV2DeltaPayload,
  ChatV2ErrorPayload,
  ChatV2Message,
  ChatV2MessageAcceptedPayload,
  ChatV2MessageUpdatePayload,
  ChatV2PresenceUpdatePayload,
  ChatV2ReadReceiptPayload,
  ChatV2ReceiptUpdatePayload,
  ChatV2ServerToClientEvents,
  ChatV2SnapshotPayload,
  ChatV2SubscribePayload,
  ChatV2TypingPayload,
  ChatV2TypingUpdatePayload,
  ChatV2UnsubscribePayload,
  ChatV2AttachmentCompletePayload,
  ChatV2UploadInitPayload,
  ChatV2UploadUrlPayload,
  ChatV2CallSignalPayload,
} from './protocol';

export type ChatSocketMode = 'disabled' | 'idle' | 'connecting' | 'connected' | 'reconnecting' | 'degraded' | 'error';

export interface ChatSocketStatus {
  mode: ChatSocketMode;
  socketId: string | null;
  lastError: string | null;
  connectedAt: number | null;
}

export type ChatSocketStatusListener = (status: ChatSocketStatus) => void;

export interface ChatSocketBridge {
  readonly enabled: boolean;
  readonly url: string | null;
  readonly connected: boolean;
  readonly id: string | null;
  getStatus(): ChatSocketStatus;
  connect(auth?: ChatV2AuthPayload): void;
  disconnect(): void;
  setAuth(auth: ChatV2AuthPayload): void;
  subscribeStatus(listener: ChatSocketStatusListener): () => void;
  on<Event extends keyof ChatV2ServerToClientEvents>(event: Event, handler: ChatV2ServerToClientEvents[Event]): () => void;
  off<Event extends keyof ChatV2ServerToClientEvents>(event: Event, handler: ChatV2ServerToClientEvents[Event]): void;
  emit<Event extends keyof ChatV2ClientToServerEvents>(event: Event, ...args: Parameters<ChatV2ClientToServerEvents[Event]>): void;
  emitWithAck<Event extends keyof ChatV2ClientToServerEvents>(event: Event, ...args: Parameters<ChatV2ClientToServerEvents[Event]>): Promise<unknown>;
  joinChat(chatId: string, lastKnownServerCursor?: number | null): void;
  leaveChat(chatId: string): void;
}

export type ChatSocket = ChatSocketBridge;
type AnySocket = Socket<ChatV2ServerToClientEvents, ChatV2ClientToServerEvents>;

const noopStatus: ChatSocketStatus = {
  mode: 'disabled',
  socketId: null,
  lastError: null,
  connectedAt: null,
};

function createNoopBridge(): ChatSocketBridge {
  const statusListeners = new Set<ChatSocketStatusListener>();
  return {
    enabled: false,
    url: null,
    connected: false,
    id: null,
    getStatus: () => noopStatus,
    connect: () => {},
    disconnect: () => {},
    setAuth: () => {},
    subscribeStatus(listener: ChatSocketStatusListener) {
      statusListeners.add(listener);
      listener(noopStatus);
      return () => {
        statusListeners.delete(listener);
      };
    },
    on: () => () => {},
    off: () => {},
    emit: () => {},
    emitWithAck: async () => ({ ok: false, error: 'disabled' }),
    joinChat: () => {},
    leaveChat: () => {},
  };
}

function createRealBridge(url: string): ChatSocketBridge {
  let socket: AnySocket | null = null;
  const statusListeners = new Set<ChatSocketStatusListener>();
  let status: ChatSocketStatus = {
    mode: 'idle',
    socketId: null,
    lastError: null,
    connectedAt: null,
  };

  function publish(next: Partial<ChatSocketStatus>): void {
    status = { ...status, ...next };
    statusListeners.forEach((listener) => listener(status));
  }

  function ensureSocket(): AnySocket {
    if (socket) return socket;

    socket = io(url, {
      autoConnect: false,
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: 5,
      timeout: 10000,
      withCredentials: true,
    }) as AnySocket;

    socket.on('connect', () => {
      publish({
        mode: 'connected',
        socketId: socket?.id ?? null,
        lastError: null,
        connectedAt: status.connectedAt ?? Date.now(),
      });
    });

    socket.on('disconnect', () => {
      publish({
        mode: 'reconnecting',
        socketId: null,
      });
    });

    socket.on('connect_error', (error) => {
      publish({
        mode: 'error',
        lastError: error instanceof Error ? error.message : String(error),
      });
    });

    socket.io.on('reconnect_attempt', () => publish({ mode: 'reconnecting' }));
    socket.io.on('reconnect', () => publish({ mode: 'connected', socketId: socket?.id ?? null, lastError: null }));
    socket.io.on('reconnect_failed', () => publish({ mode: 'degraded' }));

    return socket;
  }

  return {
    enabled: true,
    url,
    get connected() {
      return socket?.connected ?? false;
    },
    get id() {
      return socket?.id ?? null;
    },
    getStatus: () => status,
    connect(auth?: ChatV2AuthPayload) {
      const activeSocket = ensureSocket();
      if (auth) activeSocket.auth = auth;
      if (!activeSocket.connected) {
        publish({ mode: 'connecting', lastError: null });
        activeSocket.connect();
      }
    },
    disconnect() {
      if (!socket) return;
      socket.disconnect();
      publish({ mode: 'idle', socketId: null });
    },
    setAuth(auth: ChatV2AuthPayload) {
      const activeSocket = ensureSocket();
      activeSocket.auth = auth;
    },
    subscribeStatus(listener: ChatSocketStatusListener) {
      statusListeners.add(listener);
      listener(status);
      return () => {
        statusListeners.delete(listener);
      };
    },
    on<Event extends keyof ChatV2ServerToClientEvents>(event: Event, handler: ChatV2ServerToClientEvents[Event]) {
      const activeSocket = ensureSocket();
      activeSocket.on(event, handler as never);
      return () => activeSocket.off(event, handler as never);
    },
    off<Event extends keyof ChatV2ServerToClientEvents>(event: Event, handler: ChatV2ServerToClientEvents[Event]) {
      socket?.off(event, handler as never);
    },
    emit<Event extends keyof ChatV2ClientToServerEvents>(event: Event, ...args: Parameters<ChatV2ClientToServerEvents[Event]>) {
      const activeSocket = ensureSocket();
      activeSocket.emit(event as string, ...(args as unknown[]));
    },
    emitWithAck<Event extends keyof ChatV2ClientToServerEvents>(event: Event, ...args: Parameters<ChatV2ClientToServerEvents[Event]>) {
      const activeSocket = ensureSocket();
      return new Promise((resolve, reject) => {
        ((activeSocket as any).timeout(10000) as any).emit(
          event as string,
          ...(args as unknown[]),
          (error: unknown, response: unknown) => {
            if (error) {
              reject(error);
              return;
            }
            resolve(response);
          }
        );
      });
    },
    joinChat(chatId: string, lastKnownServerCursor?: number | null) {
      const activeSocket = ensureSocket();
      const payload: ChatV2SubscribePayload = {
        chatId,
        lastKnownServerCursor: lastKnownServerCursor ?? null,
      };
      activeSocket.emit('chat:subscribe', payload);
    },
    leaveChat(chatId: string) {
      const activeSocket = ensureSocket();
      const payload: ChatV2UnsubscribePayload = { chatId };
      activeSocket.emit('chat:unsubscribe', payload);
    },
  };
}

let sharedBridge: ChatSocketBridge | null = null;
let sharedBridgeUrl: string | null = null;
let sharedSocket: ChatSocketBridge | null = null;

export function getChatSocketBridge(): ChatSocketBridge {
  if (typeof window === 'undefined' || !isChatSocketEnabled()) {
    return createNoopBridge();
  }

  const url = getChatV2SocketUrl();
  if (!url) return createNoopBridge();

  if (!sharedBridge || sharedBridgeUrl !== url) {
    sharedBridge = createRealBridge(url);
    sharedBridgeUrl = url;
  }

  return sharedBridge;
}

export async function getChatSocket(auth?: ChatV2AuthPayload | null): Promise<ChatSocket | null> {
  const bridge = getChatSocketBridge();
  if (!bridge.enabled) return null;
  if (auth) bridge.setAuth(auth);
  sharedSocket = bridge;
  return bridge;
}

export function peekChatSocket(): ChatSocket | null {
  return sharedSocket;
}

export function resetChatSocket(): void {
  sharedSocket?.disconnect();
  sharedSocket = null;
}

export type {
  ChatV2DeltaPayload,
  ChatV2ErrorPayload,
  ChatV2Message,
  ChatV2MessageAcceptedPayload,
  ChatV2MessageUpdatePayload,
  ChatV2PresenceUpdatePayload,
  ChatV2ReadReceiptPayload,
  ChatV2ReceiptUpdatePayload,
  ChatV2SnapshotPayload,
  ChatV2TypingPayload,
  ChatV2TypingUpdatePayload,
  ChatV2AttachmentCompletePayload,
  ChatV2UploadInitPayload,
  ChatV2UploadUrlPayload,
  ChatV2CallSignalPayload,
};
