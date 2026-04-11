import http from 'node:http';
import { Server } from 'socket.io';
import {
  chatV2EventNames,
  type ChatV2AttachmentCompletePayload,
  type ChatV2ClientToServerEvents,
  type ChatV2DeltaPayload,
  type ChatV2Message,
  type ChatV2DeliveredReceiptPayload,
  type ChatV2ErrorPayload,
  type ChatV2CallEventPayload,
  type ChatV2InterServerEvents,
  type ChatV2MessageAcceptedPayload,
  type ChatV2MessageUpdatePayload,
  type ChatV2PresenceHeartbeatPayload,
  type ChatV2PresenceUpdatePayload,
  type ChatV2ReadReceiptPayload,
  type ChatV2RetryMessagePayload,
  type ChatV2SendMessagePayload,
  type ChatV2ServerToClientEvents,
  type ChatV2SocketData,
  type ChatV2SubscribePayload,
  type ChatV2TypingPayload,
  type ChatV2TypingUpdatePayload,
  type ChatV2UnsubscribePayload,
} from '../../src/lib/chat-v2/protocol.js';
import { realtimeConfig } from './config.js';
import { extractBearerToken, verifyFirebaseSocketToken } from './auth/firebaseAuth.js';
import { buildCallRoom, buildChatRoom, buildPersonalRoom } from './rooms.js';
import {
  FirestoreChatPersistence,
  type ChatPersistence,
  type PersistedUploadCompletionResult,
  type PersistedReceiptResult,
} from './persistence/firestoreChatPersistence.js';

interface RealtimeDependencies {
  persistence: ChatPersistence;
}

function createErrorPayload(code: ChatV2ErrorPayload['code'], message: string, details?: unknown): ChatV2ErrorPayload {
  return { code, message, details };
}

function writeHealth(res: http.ServerResponse): void {
  res.writeHead(200, { 'content-type': 'application/json; charset=utf-8' });
  res.end(
    JSON.stringify({
      ok: true,
      service: 'chat-v2-realtime',
      mode: 'hybrid-firestore-socket',
      timestamp: Date.now(),
    })
  );
}

function toPresenceUpdate(uid: string, payload: ChatV2PresenceHeartbeatPayload, displayName?: string, photoURL?: string | null): ChatV2PresenceUpdatePayload {
  return {
    userId: uid,
    displayName,
    photoURL: photoURL ?? null,
    isOnline: payload.status !== 'offline',
    lastSeen: Date.now(),
    status: payload.status || 'online',
    activeChatId: payload.activeChatId ?? null,
  };
}

function isChatSubscribePayload(payload: ChatV2SubscribePayload | undefined): payload is ChatV2SubscribePayload {
  return Boolean(payload?.chatId);
}

function isSendMessagePayload(payload: ChatV2SendMessagePayload | undefined): payload is ChatV2SendMessagePayload {
  return Boolean(payload?.chatId && payload?.clientMessageId && typeof payload?.text === 'string');
}

function isUnsubscribePayload(payload: ChatV2UnsubscribePayload | undefined): payload is ChatV2UnsubscribePayload {
  return Boolean(payload?.chatId);
}

function isTypingPayload(payload: ChatV2TypingPayload | undefined): payload is ChatV2TypingPayload {
  return Boolean(payload?.chatId);
}

function isReadPayload(payload: ChatV2ReadReceiptPayload | ChatV2DeliveredReceiptPayload | undefined): payload is ChatV2ReadReceiptPayload | ChatV2DeliveredReceiptPayload {
  return Boolean(payload?.chatId && Array.isArray(payload?.messageIds));
}

function isRetryPayload(payload: ChatV2RetryMessagePayload | undefined): payload is ChatV2RetryMessagePayload {
  return Boolean(payload?.chatId && payload?.clientMessageId);
}

function isUploadCompletePayload(payload: ChatV2AttachmentCompletePayload | undefined): payload is ChatV2AttachmentCompletePayload {
  return Boolean(payload?.chatId && payload?.clientMessageId && payload?.storagePath && payload?.url);
}

function emitRoomDelta(
  io: Server<ChatV2ClientToServerEvents, ChatV2ServerToClientEvents, ChatV2InterServerEvents, ChatV2SocketData>,
  payload: ChatV2DeltaPayload,
  memberUids: string[]
): void {
  io.to(buildChatRoom(payload.chatId)).emit(chatV2EventNames.server.chatDelta, payload);
  for (const memberUid of memberUids) {
    io.to(buildPersonalRoom(memberUid)).emit(chatV2EventNames.server.chatDelta, payload);
  }
}

function emitReceiptResult(
  io: Server<ChatV2ClientToServerEvents, ChatV2ServerToClientEvents, ChatV2InterServerEvents, ChatV2SocketData>,
  result: PersistedReceiptResult
): void {
  for (const payload of result.receiptUpdates) {
    io.to(buildChatRoom(payload.chatId)).emit(chatV2EventNames.server.receiptUpdate, payload);
    for (const memberUid of result.memberUids) {
      io.to(buildPersonalRoom(memberUid)).emit(chatV2EventNames.server.receiptUpdate, payload);
    }
  }

  if (result.roomDelta) {
    emitRoomDelta(io, result.roomDelta, result.memberUids);
  }
}

function emitMessageUpdate(
  io: Server<ChatV2ClientToServerEvents, ChatV2ServerToClientEvents, ChatV2InterServerEvents, ChatV2SocketData>,
  result: PersistedUploadCompletionResult
): void {
  io.to(buildChatRoom(result.messageUpdate.chatId)).emit(chatV2EventNames.server.messageUpdate, result.messageUpdate);
  for (const memberUid of result.memberUids) {
    io.to(buildPersonalRoom(memberUid)).emit(chatV2EventNames.server.messageUpdate, result.messageUpdate);
  }
}

export function createRealtimeServer({ persistence }: RealtimeDependencies = { persistence: new FirestoreChatPersistence() }) {
  const httpServer = http.createServer((req, res) => {
    if (req.url === '/healthz') {
      writeHealth(res);
      return;
    }

    res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
    res.end('not found');
  });

  const io = new Server<ChatV2ClientToServerEvents, ChatV2ServerToClientEvents, ChatV2InterServerEvents, ChatV2SocketData>(httpServer, {
    cors: {
      origin: realtimeConfig.corsOrigin,
      credentials: true,
    },
    path: '/socket.io',
  });

  io.use(async (socket, next) => {
    try {
      const token = extractBearerToken(
        (socket.handshake.auth?.token as string | undefined) ||
          (socket.handshake.headers.authorization as string | undefined)
      );

      if (!token) {
        socket.data.authed = false;
        return next();
      }

      const user = await verifyFirebaseSocketToken(token);
      socket.data.authed = true;
      socket.data.uid = user.uid;
      socket.data.displayName = user.name ?? user.email ?? user.uid;
      socket.data.photoURL = user.photoURL ?? null;
      socket.data.deviceId = typeof socket.handshake.auth?.deviceId === 'string' ? socket.handshake.auth.deviceId : undefined;
      socket.data.appVersion = typeof socket.handshake.auth?.appVersion === 'string' ? socket.handshake.auth.appVersion : undefined;
      socket.data.lastKnownServerCursor = typeof socket.handshake.auth?.lastKnownServerCursor === 'number'
        ? socket.handshake.auth.lastKnownServerCursor
        : null;
      return next();
    } catch (error) {
      return next(error instanceof Error ? error : new Error('unauthorized'));
    }
  });

  const onlineUsers = new Map<string, { socketIds: Set<string>; lastSeen: number; status: string; activeChatId?: string | null }>();

  function markOnline(uid: string, socketId: string, status = 'online', activeChatId: string | null = null) {
    const current = onlineUsers.get(uid) ?? { socketIds: new Set<string>(), lastSeen: Date.now(), status };
    current.socketIds.add(socketId);
    current.lastSeen = Date.now();
    current.status = status;
    current.activeChatId = activeChatId;
    onlineUsers.set(uid, current);
  }

  function markOffline(uid: string, socketId: string) {
    const current = onlineUsers.get(uid);
    if (!current) return;
    current.socketIds.delete(socketId);
    current.lastSeen = Date.now();
    if (current.socketIds.size === 0) {
      onlineUsers.delete(uid);
    }
  }

  async function emitPresence(uid: string, payload: ChatV2PresenceHeartbeatPayload, socketId?: string) {
    const userSocket = socketId ? io.sockets.sockets.get(socketId) : undefined;
    const update = toPresenceUpdate(uid, payload, userSocket?.data.displayName, userSocket?.data.photoURL);
    io.to(buildPersonalRoom(uid)).emit(chatV2EventNames.server.presenceUpdate, update);
    await persistence.updatePresence(uid, {
      ...payload,
      displayName: update.displayName,
      photoURL: update.photoURL,
    });
  }

  io.on('connection', socket => {
    socket.on(chatV2EventNames.client.authConnect, async payload => {
      try {
        const user = await verifyFirebaseSocketToken(payload.token);
        socket.data.authed = true;
        socket.data.uid = user.uid;
        socket.data.displayName = user.name ?? user.email ?? user.uid;
        socket.data.photoURL = user.photoURL ?? null;
        socket.data.deviceId = payload.deviceId;
        socket.data.appVersion = payload.appVersion;
        socket.data.lastKnownServerCursor = payload.lastKnownServerCursor ?? null;
        markOnline(user.uid, socket.id, 'online');
        socket.join(buildPersonalRoom(user.uid));
        await emitPresence(user.uid, { status: 'online', activeChatId: null }, socket.id);
      } catch (error) {
        socket.emit(chatV2EventNames.server.errorEvent, createErrorPayload('unauthorized', 'Firebase token verification failed', error instanceof Error ? error.message : error));
        socket.disconnect(true);
      }
    });

    if (socket.data.authed && socket.data.uid) {
      markOnline(socket.data.uid, socket.id, 'online');
      socket.join(buildPersonalRoom(socket.data.uid));
    }

    const authTimeout = setTimeout(() => {
      if (!socket.data.authed) {
        socket.emit(chatV2EventNames.server.errorEvent, createErrorPayload('unauthorized', 'Missing auth:connect payload'));
        socket.disconnect(true);
      }
    }, 10_000);

    socket.on(chatV2EventNames.client.chatSubscribe, async (payload, ack) => {
      if (!socket.data.authed || !socket.data.uid) {
        ack?.({ ok: false, error: 'unauthorized' });
        socket.emit(chatV2EventNames.server.errorEvent, createErrorPayload('unauthorized', 'Socket is not authenticated yet'));
        return;
      }

      if (!isChatSubscribePayload(payload)) {
        ack?.({ ok: false, error: 'invalid_payload' });
        socket.emit(chatV2EventNames.server.errorEvent, createErrorPayload('invalid_payload', 'chat:subscribe payload is invalid'));
        return;
      }

      try {
        const snapshot = await persistence.loadChatSnapshot(payload.chatId, socket.data.uid, payload.lastKnownServerCursor ?? socket.data.lastKnownServerCursor ?? null);
        socket.join(buildChatRoom(payload.chatId));
        socket.emit(chatV2EventNames.server.chatSnapshot, snapshot);
        ack?.({ ok: true });
      } catch (error) {
        ack?.({ ok: false, error: error instanceof Error ? error.message : 'chat_not_found' });
        socket.emit(chatV2EventNames.server.errorEvent, createErrorPayload('chat_not_found', 'Failed to subscribe to chat', error instanceof Error ? error.message : error));
      }
    });

    socket.on(chatV2EventNames.client.chatUnsubscribe, (payload, ack) => {
      if (!isUnsubscribePayload(payload)) {
        ack?.({ ok: false, error: 'invalid_payload' });
        return;
      }
      socket.leave(buildChatRoom(payload.chatId));
      ack?.({ ok: true });
    });

    socket.on(chatV2EventNames.client.messageSend, async (payload, ack) => {
      if (!socket.data.authed || !socket.data.uid) {
        ack?.({ ok: false, error: 'unauthorized' });
        return;
      }
      if (!isSendMessagePayload(payload)) {
        ack?.({ ok: false, error: 'invalid_payload' });
        socket.emit(chatV2EventNames.server.errorEvent, createErrorPayload('invalid_payload', 'message:send payload is invalid'));
        return;
      }

      try {
        const persisted = await persistence.persistMessage({
          chatId: payload.chatId,
          clientMessageId: payload.clientMessageId,
          senderId: socket.data.uid,
          senderName: socket.data.displayName || socket.data.uid,
          senderPhoto: socket.data.photoURL ?? null,
          text: payload.text,
          kind: payload.kind || 'text',
          replyTo: payload.replyTo ?? null,
          attachments: payload.attachments || [],
          encrypted: payload.encrypted,
          createdAtClient: payload.createdAtClient,
        });
        const accepted = persisted.accepted;

        const realtimeMessage: ChatV2Message = {
          id: accepted.serverMessageId,
          chatId: payload.chatId,
          clientMessageId: payload.clientMessageId,
          serverMessageId: accepted.serverMessageId,
          serverSequence: accepted.serverSequence,
          senderId: socket.data.uid,
          senderName: socket.data.displayName || socket.data.uid,
          senderPhoto: socket.data.photoURL ?? null,
          text: payload.text,
          kind: payload.kind || 'text',
          status: accepted.status,
          replyTo: payload.replyTo ?? null,
          attachments: payload.attachments || [],
          upload: null,
          readBy: {},
          deliveredTo: {},
          reactions: {},
          createdAtClient: payload.createdAtClient ?? Date.now(),
          createdAtServer: accepted.createdAtServer,
          editedAt: null,
          deletedAt: null,
          forwardedFrom: null,
          encrypted: Boolean(payload.encrypted),
        };

        socket.emit(chatV2EventNames.server.messageAccepted, accepted);
        io.to(buildChatRoom(payload.chatId)).emit(chatV2EventNames.server.messageNew, realtimeMessage);
        emitRoomDelta(io, persisted.roomDelta, persisted.memberUids);
        io.to(buildChatRoom(payload.chatId)).emit(chatV2EventNames.server.messageUpdate, {
          chatId: payload.chatId,
          messageId: accepted.serverMessageId,
          clientMessageId: accepted.clientMessageId,
          status: accepted.status,
          serverSequence: accepted.serverSequence,
        } satisfies ChatV2MessageUpdatePayload);
        ack?.({ ok: true, message: accepted });
      } catch (error) {
        const message = error instanceof Error ? error.message : 'message_send_failed';
        ack?.({ ok: false, error: message });
        socket.emit(chatV2EventNames.server.errorEvent, createErrorPayload('message_send_failed', 'Failed to persist message', message));
      }
    });

    socket.on(chatV2EventNames.client.messageRetry, async (payload, ack) => {
      if (!socket.data.authed || !socket.data.uid) {
        ack?.({ ok: false, error: 'unauthorized' });
        return;
      }
      if (!isRetryPayload(payload)) {
        ack?.({ ok: false, error: 'invalid_payload' });
        return;
      }

      socket.emit(chatV2EventNames.server.messageUpdate, {
        chatId: payload.chatId,
        messageId: payload.clientMessageId,
        clientMessageId: payload.clientMessageId,
        status: 'sending',
      });
      ack?.({ ok: true });
    });

    socket.on(chatV2EventNames.client.messageDelivered, async payload => {
      if (!socket.data.authed || !socket.data.uid) return;
      if (!isReadPayload(payload)) return;

      try {
        const result = await persistence.markDelivered(payload.chatId, payload.messageIds, socket.data.uid);
        emitReceiptResult(io, result);
      } catch (error) {
        socket.emit(chatV2EventNames.server.errorEvent, createErrorPayload('receipt_failed', 'Failed to store delivered receipt', error instanceof Error ? error.message : error));
      }
    });

    socket.on(chatV2EventNames.client.messageRead, async payload => {
      if (!socket.data.authed || !socket.data.uid) return;
      if (!isReadPayload(payload)) return;

      try {
        const result = await persistence.markRead(payload.chatId, payload.messageIds, socket.data.uid);
        emitReceiptResult(io, result);
      } catch (error) {
        socket.emit(chatV2EventNames.server.errorEvent, createErrorPayload('receipt_failed', 'Failed to store read receipt', error instanceof Error ? error.message : error));
      }
    });

    socket.on(chatV2EventNames.client.typingStart, payload => {
      if (!socket.data.authed || !socket.data.uid) return;
      if (!isTypingPayload(payload)) return;

      const typingPayload: ChatV2TypingUpdatePayload = {
        chatId: payload.chatId,
        userId: socket.data.uid,
        displayName: socket.data.displayName || socket.data.uid,
        isTyping: true,
        timestamp: Date.now(),
      };
      io.to(buildChatRoom(payload.chatId)).emit(chatV2EventNames.server.typingUpdate, typingPayload);
    });

    socket.on(chatV2EventNames.client.typingStop, payload => {
      if (!socket.data.authed || !socket.data.uid) return;
      if (!isTypingPayload(payload)) return;

      const typingPayload: ChatV2TypingUpdatePayload = {
        chatId: payload.chatId,
        userId: socket.data.uid,
        displayName: socket.data.displayName || socket.data.uid,
        isTyping: false,
        timestamp: Date.now(),
      };
      io.to(buildChatRoom(payload.chatId)).emit(chatV2EventNames.server.typingUpdate, typingPayload);
    });

    socket.on(chatV2EventNames.client.presenceHeartbeat, async payload => {
      if (!socket.data.authed || !socket.data.uid) return;

      const status = payload.status || 'online';
      markOnline(socket.data.uid, socket.id, status, payload.activeChatId ?? null);
      await emitPresence(socket.data.uid, payload, socket.id);
    });

    socket.on(chatV2EventNames.client.uploadInit, async (payload, ack) => {
      if (!socket.data.authed || !socket.data.uid) {
        ack?.({ ok: false, error: 'unauthorized' });
        return;
      }
      if (!payload?.chatId || !payload?.clientMessageId) {
        ack?.({ ok: false, error: 'invalid_payload' });
        return;
      }

      try {
        const upload = await persistence.createUploadSession(payload, socket.data.uid);
        ack?.({ ok: true, upload });
        socket.emit(chatV2EventNames.server.uploadUrl, upload);
      } catch (error) {
        ack?.({ ok: false, error: error instanceof Error ? error.message : 'upload_failed' });
        socket.emit(chatV2EventNames.server.errorEvent, createErrorPayload('upload_failed', 'Failed to create upload session', error instanceof Error ? error.message : error));
      }
    });

    socket.on(chatV2EventNames.client.uploadComplete, async (payload, ack) => {
      if (!socket.data.authed || !socket.data.uid) {
        ack?.({ ok: false, error: 'unauthorized' });
        return;
      }
      if (!isUploadCompletePayload(payload)) {
        ack?.({ ok: false, error: 'invalid_payload' });
        return;
      }

      try {
        const result = await persistence.completeUpload(payload, socket.data.uid);
        emitMessageUpdate(io, result);
        ack?.({ ok: true });
      } catch (error) {
        ack?.({ ok: false, error: error instanceof Error ? error.message : 'upload_failed' });
      }
    });

    const forwardCallSignal = (payload: { callId: string; chatId?: string; toUid?: string; targetUid?: string; fromUid?: string; signalType: ChatV2CallEventPayload['signalType']; sdp?: string; candidate?: unknown }) => {
      const callEvent = {
        ...payload,
        toUid: payload.toUid ?? payload.targetUid,
        timestamp: Date.now(),
      } satisfies ChatV2CallEventPayload;

      if (payload.chatId) {
        io.to(buildChatRoom(payload.chatId)).emit(chatV2EventNames.server.callEvent, callEvent);
      }
      if (callEvent.toUid) {
        io.to(buildPersonalRoom(callEvent.toUid)).emit(chatV2EventNames.server.callEvent, callEvent);
      }
      io.to(buildCallRoom(payload.callId)).emit(chatV2EventNames.server.callEvent, callEvent);
      persistence.persistCallEvent(callEvent).catch(() => undefined);
    };

    socket.on(chatV2EventNames.client.callRing, payload => forwardCallSignal({ ...payload, signalType: 'ring' }));
    socket.on(chatV2EventNames.client.callAccept, payload => forwardCallSignal({ ...payload, signalType: 'accept' }));
    socket.on(chatV2EventNames.client.callDecline, payload => forwardCallSignal({ ...payload, signalType: 'decline' }));
    socket.on(chatV2EventNames.client.callOffer, payload => forwardCallSignal({ ...payload, signalType: 'offer' }));
    socket.on(chatV2EventNames.client.callAnswer, payload => forwardCallSignal({ ...payload, signalType: 'answer' }));
    socket.on(chatV2EventNames.client.callIce, payload => forwardCallSignal({ ...payload, signalType: 'ice' }));
    socket.on(chatV2EventNames.client.callEnd, payload => forwardCallSignal({ ...payload, signalType: 'end' }));

    socket.on('disconnect', () => {
      if (socket.data.uid) {
        markOffline(socket.data.uid, socket.id);
        persistence.updatePresence(socket.data.uid, {
          status: 'offline',
          activeChatId: null,
          displayName: socket.data.displayName,
          photoURL: socket.data.photoURL,
        }).catch(() => undefined);
      }
      clearTimeout(authTimeout);
    });
  });

  return { httpServer, io };
}
