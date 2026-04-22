'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { getChatV2TransportMode, isChatSocketEnabled } from '@/lib/chat-v2/featureFlags';
import { getChatSocketBridge, type ChatSocketBridge } from '@/lib/chat-v2/socketClient';
import type {
  ChatConnectionState,
  ChatSocketMode,
  ChatTransportMode,
  Message,
  ChatRoom,
} from '@/lib/chat-v2/types';
import type {
  ChatV2ClientToServerEvents,
  ChatV2AttachmentCompletePayload,
  ChatV2AttachmentInitPayload,
  ChatV2CallSignalPayload,
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
  ChatV2UploadUrlPayload,
} from '@/lib/chat-v2/protocol';

let transportConsumerCount = 0;

export interface ChatTransportHandlers {
  onSnapshot?: (payload: ChatV2SnapshotPayload) => void;
  onDelta?: (payload: ChatV2DeltaPayload) => void;
  onMessageAccepted?: (payload: ChatV2MessageAcceptedPayload) => void;
  onMessage?: (payload: ChatV2Message) => void;
  onMessageUpdate?: (payload: ChatV2MessageUpdatePayload) => void;
  onReceiptUpdate?: (payload: ChatV2ReceiptUpdatePayload) => void;
  onTypingUpdate?: (payload: ChatV2TypingUpdatePayload) => void;
  onPresenceUpdate?: (payload: ChatV2PresenceUpdatePayload) => void;
  onUploadUrl?: (payload: ChatV2UploadUrlPayload) => void;
  onError?: (payload: ChatV2ErrorPayload) => void;
  onCallEvent?: (payload: ChatV2CallSignalPayload & { timestamp?: number }) => void;
}

export interface UseChatTransportOptions extends ChatTransportHandlers {
  activeChatId: string | null;
  currentUserId: string | null;
  displayName: string;
  displayPhoto: string | null;
  getIdToken: (() => Promise<string>) | null;
  enabled?: boolean;
}

export interface ChatTransportActions {
  connectionState: ChatConnectionState;
  transportMode: ChatTransportMode;
  socketReady: boolean;
  subscribe: (chatId: string, lastKnownServerCursor?: number | null) => void;
  unsubscribe: (chatId: string) => void;
  sendTyping: (chatId: string, isTyping: boolean) => void;
  sendPresenceHeartbeat: (status?: 'online' | 'away' | 'offline', activeChatId?: string | null) => void;
  sendReadReceipt: (payload: ChatV2ReadReceiptPayload) => void;
  sendDeliveredReceipt: (payload: ChatV2ReadReceiptPayload) => void;
  sendMessage: (chatId: string, payload: Record<string, unknown>) => Promise<unknown>;
  sendUploadInit: (payload: ChatV2AttachmentInitPayload) => Promise<unknown>;
  sendUploadComplete: (payload: ChatV2AttachmentCompletePayload) => Promise<unknown>;
  sendCallSignal: (payload: ChatV2CallSignalPayload) => void;
  lastSyncAt: number | null;
  bridge: ChatSocketBridge;
}

function createBaseConnectionState(socket: ChatSocketMode, pendingQueue = 0, lastSyncAt: number | null = null): ChatConnectionState {
  return {
    transport: getChatV2TransportMode(),
    socket,
    lastSyncAt,
    pendingQueue,
    snapshotAgeMs: null,
  };
}

export function useChatTransport({
  activeChatId,
  currentUserId,
  displayName,
  displayPhoto,
  getIdToken,
  enabled = isChatSocketEnabled(),
  onSnapshot,
  onDelta,
  onMessageAccepted,
  onMessage,
  onMessageUpdate,
  onReceiptUpdate,
  onTypingUpdate,
  onPresenceUpdate,
  onUploadUrl,
  onError,
  onCallEvent,
}: UseChatTransportOptions): ChatTransportActions {
  const bridge = useMemo(() => getChatSocketBridge(), []);
  const pendingQueueRef = useRef(0);
  const mountedRef = useRef(true);
  const connectedRef = useRef(false);
  const handlersRef = useRef<ChatTransportHandlers>({});
  const [lastSyncAt, setLastSyncAt] = useState<number | null>(null);
  const [socketMode, setSocketMode] = useState<ChatSocketMode>(bridge.getStatus().mode);
  const [connectionState, setConnectionState] = useState<ChatConnectionState>(() =>
    createBaseConnectionState(bridge.getStatus().mode, 0, null)
  );

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    handlersRef.current = {
      onSnapshot,
      onDelta,
      onMessageAccepted,
      onMessage,
      onMessageUpdate,
      onReceiptUpdate,
      onTypingUpdate,
      onPresenceUpdate,
      onUploadUrl,
      onError,
      onCallEvent,
    };
  }, [
    onCallEvent,
    onDelta,
    onError,
    onMessage,
    onMessageAccepted,
    onMessageUpdate,
    onPresenceUpdate,
    onReceiptUpdate,
    onSnapshot,
    onTypingUpdate,
    onUploadUrl,
  ]);

  const updateConnectionState = useCallback((next: Partial<ChatConnectionState> & { socket?: ChatSocketMode }) => {
    if (!mountedRef.current) return;
    setConnectionState((current) => ({
      ...current,
      ...next,
      transport: enabled ? 'hybrid' : 'firestore',
      socket: next.socket ?? current.socket,
      pendingQueue: pendingQueueRef.current,
      lastSyncAt: next.lastSyncAt ?? current.lastSyncAt,
    }));
  }, [enabled]);

  useEffect(() => {
    const unsubscribeStatus = bridge.subscribeStatus((status) => {
      if (!mountedRef.current) return;
      setSocketMode(status.mode);
      updateConnectionState({
        socket: status.mode,
        lastSyncAt: status.connectedAt ?? null,
      });
    });

    return unsubscribeStatus;
  }, [bridge, updateConnectionState]);

  useEffect(() => {
    if (!enabled || !currentUserId || !getIdToken) {
      if (connectedRef.current) {
        transportConsumerCount = Math.max(0, transportConsumerCount - 1);
        connectedRef.current = false;
      }
      if (transportConsumerCount === 0) {
        bridge.disconnect();
      }
      updateConnectionState({ socket: enabled ? 'idle' : 'disabled' });
      return;
    }

    if (!connectedRef.current) {
      transportConsumerCount += 1;
      connectedRef.current = true;
    }

    let cancelled = false;
    void getIdToken()
      .then((token) => {
        if (cancelled) return;
        bridge.connect({
          token,
          deviceId: `web-${currentUserId}`,
          appVersion: process.env.NEXT_PUBLIC_APP_VERSION || 'chat-v2',
          lastKnownServerCursor: lastSyncAt,
        });
        bridge.emit('auth:connect', {
          token,
          deviceId: `web-${currentUserId}`,
          appVersion: process.env.NEXT_PUBLIC_APP_VERSION || 'chat-v2',
          lastKnownServerCursor: null,
        });
      })
      .catch((error) => {
        if (cancelled) return;
        updateConnectionState({
          socket: 'error',
          lastSyncAt: lastSyncAt,
        });
        if (onError) {
          onError({
            code: 'unauthorized',
            message: error instanceof Error ? error.message : 'Failed to obtain auth token',
            details: error,
          });
        }
      });

    return () => {
      cancelled = true;
      if (connectedRef.current) {
        transportConsumerCount = Math.max(0, transportConsumerCount - 1);
        connectedRef.current = false;
      }
      if (transportConsumerCount === 0) {
        bridge.disconnect();
      }
    };
  }, [bridge, currentUserId, enabled, getIdToken, onError, updateConnectionState]);

  useEffect(() => {
    if (!enabled) return;

    const handleNavigationStart = () => {
      if (activeChatId) {
        bridge.leaveChat(activeChatId);
      }
      if (connectedRef.current) {
        transportConsumerCount = Math.max(0, transportConsumerCount - 1);
        connectedRef.current = false;
      }
      bridge.disconnect();
      updateConnectionState({ socket: 'idle' });
    };

    window.addEventListener('app:navigation-start', handleNavigationStart as EventListener);
    return () => {
      window.removeEventListener('app:navigation-start', handleNavigationStart as EventListener);
    };
  }, [activeChatId, bridge, enabled, updateConnectionState]);

  useEffect(() => {
    const cleanups: Array<() => void> = [];
    const markSync = () => {
      const now = Date.now();
      if (!mountedRef.current) return;
      setLastSyncAt(now);
      updateConnectionState({ lastSyncAt: now });
    };

    cleanups.push(bridge.on('chat:snapshot', (payload) => {
      markSync();
      handlersRef.current.onSnapshot?.(payload);
    }));
    cleanups.push(bridge.on('chat:delta', (payload) => {
      markSync();
      handlersRef.current.onDelta?.(payload);
    }));
    cleanups.push(bridge.on('message:accepted', (payload) => {
      markSync();
      handlersRef.current.onMessageAccepted?.(payload);
    }));
    cleanups.push(bridge.on('message:new', (payload) => {
      markSync();
      handlersRef.current.onMessage?.(payload);
    }));
    cleanups.push(bridge.on('message:update', (payload) => {
      markSync();
      handlersRef.current.onMessageUpdate?.(payload);
    }));
    cleanups.push(bridge.on('receipt:update', (payload) => {
      markSync();
      handlersRef.current.onReceiptUpdate?.(payload);
    }));
    cleanups.push(bridge.on('typing:update', (payload) => handlersRef.current.onTypingUpdate?.(payload)));
    cleanups.push(bridge.on('presence:update', (payload) => handlersRef.current.onPresenceUpdate?.(payload)));
    cleanups.push(bridge.on('upload:url', (payload) => handlersRef.current.onUploadUrl?.(payload)));
    cleanups.push(bridge.on('error:event', (payload) => handlersRef.current.onError?.(payload)));
    cleanups.push(bridge.on('call:event', (payload) => handlersRef.current.onCallEvent?.(payload)));

    return () => {
      cleanups.forEach((cleanup) => cleanup());
    };
  }, [bridge, updateConnectionState]);

  const emitWithPendingAck = useCallback(async (event: keyof ChatV2ClientToServerEvents, payload: unknown) => {
    if (!enabled) return null;
    pendingQueueRef.current += 1;
    updateConnectionState({ pendingQueue: pendingQueueRef.current });

    try {
      const response = await bridge.emitWithAck(event, payload as never);
      return response;
    } catch (error) {
      if (onError) {
        onError({
          code: 'unknown',
          message: error instanceof Error ? error.message : 'Socket ack failed',
          details: error,
        });
      }
      return null;
    } finally {
      pendingQueueRef.current = Math.max(0, pendingQueueRef.current - 1);
      updateConnectionState({ pendingQueue: pendingQueueRef.current });
    }
  }, [bridge, enabled, onError, updateConnectionState]);

  const emitFireAndForget = useCallback((event: keyof ChatV2ClientToServerEvents, payload: unknown) => {
    if (!enabled) return;
    bridge.emit(event, payload as never);
  }, [bridge, enabled]);

  const subscribe = useCallback((chatId: string, lastKnownServerCursor?: number | null) => {
    if (!enabled) return;
    void emitWithPendingAck('chat:subscribe', { chatId, lastKnownServerCursor: lastKnownServerCursor ?? null });
  }, [emitWithPendingAck, enabled]);

  const unsubscribe = useCallback((chatId: string) => {
    if (!enabled) return;
    void emitWithPendingAck('chat:unsubscribe', { chatId });
  }, [emitWithPendingAck, enabled]);

  const sendTyping = useCallback((chatId: string, isTyping: boolean) => {
    if (!enabled) return;
    const payload: ChatV2TypingPayload = { chatId, isTyping };
    emitFireAndForget(isTyping ? 'typing:start' : 'typing:stop', payload);
  }, [emitFireAndForget, enabled]);

  const sendPresenceHeartbeat = useCallback((status?: 'online' | 'away' | 'offline', activeChatIdOverride?: string | null) => {
    if (!enabled) return;
    emitFireAndForget('presence:heartbeat', {
      status,
      activeChatId: activeChatIdOverride ?? activeChatId ?? null,
    });
  }, [activeChatId, emitFireAndForget, enabled]);

  const sendReadReceipt = useCallback((payload: ChatV2ReadReceiptPayload) => {
    if (!enabled) return;
    emitFireAndForget('message:read', payload);
  }, [emitFireAndForget, enabled]);

  const sendDeliveredReceipt = useCallback((payload: ChatV2ReadReceiptPayload) => {
    if (!enabled) return;
    emitFireAndForget('message:delivered', payload);
  }, [emitFireAndForget, enabled]);

  const sendMessage = useCallback((chatId: string, payload: Record<string, unknown>) => {
    if (!enabled) return Promise.resolve(null);
    return emitWithPendingAck('message:send', {
      chatId,
      ...(payload as Record<string, unknown>),
      senderName: displayName,
      senderPhoto: displayPhoto,
      clientUserId: currentUserId,
    });
  }, [currentUserId, displayName, displayPhoto, emitWithPendingAck, enabled]);

  const sendUploadInit = useCallback((payload: ChatV2AttachmentInitPayload) => {
    if (!enabled) return Promise.resolve(null);
    return emitWithPendingAck('upload:init', payload);
  }, [emitWithPendingAck, enabled]);

  const sendUploadComplete = useCallback((payload: ChatV2AttachmentCompletePayload) => {
    if (!enabled) return Promise.resolve(null);
    return emitWithPendingAck('upload:complete', payload);
  }, [emitWithPendingAck, enabled]);

  const sendCallSignal = useCallback((payload: ChatV2CallSignalPayload) => {
    if (!enabled) return;
    emitFireAndForget(`call:${payload.signalType}` as keyof ChatV2ClientToServerEvents, payload);
  }, [emitFireAndForget, enabled]);

  return useMemo(() => ({
    connectionState,
    transportMode: enabled ? 'hybrid' : 'firestore',
    socketReady: socketMode === 'connected',
    subscribe,
    unsubscribe,
    sendTyping,
    sendPresenceHeartbeat,
    sendReadReceipt,
    sendDeliveredReceipt,
    sendMessage,
    sendUploadInit,
    sendUploadComplete,
    sendCallSignal,
    lastSyncAt,
    bridge,
  }), [
    bridge,
    connectionState,
    enabled,
    lastSyncAt,
    sendCallSignal,
    sendDeliveredReceipt,
    sendMessage,
    sendPresenceHeartbeat,
    sendReadReceipt,
    sendTyping,
    sendUploadComplete,
    sendUploadInit,
    socketMode,
    subscribe,
    unsubscribe,
  ]);
}
