'use client';

import { useAuth } from '@/contexts/AuthContext';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { getDownloadURL, ref as storageRef, uploadBytesResumable } from 'firebase/storage';
import {
  loadCachedChatSnapshot,
  saveCachedActiveChatId,
  saveCachedChatSnapshot,
} from '@/lib/chat-v2/cache';
import { getChatV2FeatureFlags } from '@/lib/chat-v2/featureFlags';
import {
  createOptimisticMessage,
  getMessagePreviewText,
  mergeMessages,
  normalizeMessage,
  trimMessages,
} from '@/lib/chat-v2/messageModel';
import type {
  ChatConnectionState,
  ChatRoom,
  ChatRoomLastMessage,
  Message,
} from '@/lib/chat-v2/types';
import type {
  ChatV2ChatRoom,
  ChatV2DeltaPayload,
  ChatV2Attachment,
  ChatV2Message,
  ChatV2MessageUpdatePayload,
  ChatV2ReceiptUpdatePayload,
  ChatV2SnapshotPayload,
  ChatV2TypingUpdatePayload,
} from '@/lib/chat-v2/protocol';
import { storage } from '@/lib/firebase';
import { useChat as useLegacyChat } from '../useChatLegacy';
import { useChatTransport } from './useChatTransport';

const TYPING_TTL_MS = 2500;

function getCurrentCursor(messages: Message[]): number {
  return messages.reduce((max, message) => {
    const candidate =
      message.serverSequence ??
      message.createdAtServer ??
      message.createdAtClient ??
      message.createdAt ??
      0;
    return Math.max(max, candidate);
  }, 0);
}

function buildClientMessageId(chatId: string): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return `${chatId}:${crypto.randomUUID()}`;
  }

  return `${chatId}:${Date.now()}:${Math.random().toString(36).slice(2, 10)}`;
}

function toUnreadCount(
  value: ChatV2ChatRoom['unreadCount'],
  currentUserId?: string | null
): number {
  if (!value || !currentUserId) return 0;
  return value[currentUserId] ?? 0;
}

function mergeLastMessage(
  base?: ChatRoomLastMessage | null,
  next?: ChatRoomLastMessage | null
): ChatRoomLastMessage | null {
  if (!base) return next ?? null;
  if (!next) return base;
  return next.timestamp >= base.timestamp ? next : base;
}

interface RoomRecord {
  chat: ChatRoom | null;
  messages: Message[];
  cursor: number;
  savedAt: number;
}

function createRoomRecord(overrides: Partial<RoomRecord> = {}): RoomRecord {
  return {
    chat: null,
    messages: [],
    cursor: 0,
    savedAt: 0,
    ...overrides,
  };
}

function getRoomActivityScore(room: ChatRoom): number {
  return room.lastServerSequence ?? room.lastMessage?.timestamp ?? room.createdAt ?? 0;
}

function sortRooms(left: ChatRoom, right: ChatRoom): number {
  const leftTimestamp = getRoomActivityScore(left);
  const rightTimestamp = getRoomActivityScore(right);
  if (leftTimestamp !== rightTimestamp) {
    return rightTimestamp - leftTimestamp;
  }

  const leftUnread = left.unreadCount ?? 0;
  const rightUnread = right.unreadCount ?? 0;
  if (leftUnread !== rightUnread) {
    return rightUnread - leftUnread;
  }

  return left.name.localeCompare(right.name, 'he');
}

function mapProtocolRoom(
  room: ChatV2ChatRoom,
  currentUserId?: string | null
): ChatRoom {
  return {
    id: room.id,
    type: room.type,
    name: room.name,
    photoURL: room.photoURL ?? null,
    members: room.members ?? [],
    membersInfo: room.membersInfo ?? [],
    admins: room.admins ?? [],
    encryptedKeys: room.encryptedKeys ?? null,
    lastMessage: room.lastMessage
      ? {
          text: room.lastMessage.text,
          senderId: room.lastMessage.senderId,
          senderName: room.lastMessage.senderName,
          timestamp: room.lastMessage.timestamp,
          kind: room.lastMessage.kind,
        }
      : null,
    unreadCount: toUnreadCount(room.unreadCount, currentUserId),
    unreadCountByUser: room.unreadCount,
    lastRead: room.lastRead ?? {},
    lastServerSequence: room.lastServerSequence ?? null,
    presenceSummary:
      room.presenceSummary
        ? Object.fromEntries(
            Object.entries(room.presenceSummary).map(([uid, status]) => [
              uid,
              { isOnline: status !== 'offline', status },
            ])
          )
        : undefined,
    groupPermissions: room.groupPermissions ?? null,
    pinnedMessageIds: room.pinnedMessageIds ?? [],
    mutedBy: room.mutedBy ?? [],
    archivedBy: room.archivedBy ?? [],
    createdAt: room.createdAt ?? null,
    version: room.version ?? 2,
  };
}

function mapProtocolMessage(message: ChatV2Message): Message {
  const attachment = message.attachments[0] ?? null;

  return normalizeMessage({
    id: message.serverMessageId || message.clientMessageId || message.id,
    senderId: message.senderId,
    senderName: message.senderName,
    senderPhoto: message.senderPhoto ?? null,
    text: message.text,
    type: message.kind,
    fileURL: attachment?.url ?? message.upload?.url ?? null,
    fileName: attachment?.fileName ?? null,
    fileSize: attachment?.sizeBytes ?? null,
    duration: attachment?.durationSeconds ?? null,
    mimeType: attachment?.mimeType ?? null,
    replyTo: message.replyTo ?? null,
    readBy: message.readBy ?? {},
    deliveredTo: message.deliveredTo ?? {},
    createdAt:
      message.createdAtServer ??
      message.createdAtClient ??
      Date.now(),
    clientMessageId: message.clientMessageId,
    serverMessageId: message.serverMessageId ?? null,
    serverSequence: message.serverSequence ?? null,
    status: message.status,
    createdAtClient: message.createdAtClient,
    createdAtServer: message.createdAtServer ?? null,
    editedAt: message.editedAt ?? null,
    deletedAt: message.deletedAt ?? null,
    reactions: message.reactions ?? {},
    forwardedFrom: message.forwardedFrom ?? null,
    upload: message.upload
      ? {
          progress: message.upload.progress ?? null,
          state:
            message.upload.status === 'uploading'
              ? 'uploading'
              : message.upload.status === 'uploaded'
                ? 'uploaded'
                : message.upload.status === 'failed'
                  ? 'failed'
                  : 'idle',
          storagePath: message.upload.storagePath ?? null,
          url: message.upload.url ?? null,
          uploadId: message.upload.uploadId,
          error: message.upload.error ?? null,
        }
      : null,
    receiptSummary: {
      deliveredCount: Object.keys(message.deliveredTo ?? {}).length,
      readCount: Object.keys(message.readBy ?? {}).length,
    },
    attachments: message.attachments ?? [],
    encrypted: message.encrypted ?? false,
  });
}

function buildRoomPatchFromMessages(messages: Message[]): Partial<ChatV2ChatRoom> | undefined {
  const lastMessage = messages[messages.length - 1];
  if (!lastMessage) return undefined;

  return {
    lastMessage: {
      text: lastMessage.text,
      senderId: lastMessage.senderId,
      senderName: lastMessage.senderName,
      timestamp:
        lastMessage.createdAtServer ??
        lastMessage.createdAtClient ??
        lastMessage.createdAt ??
        Date.now(),
      kind: lastMessage.type,
    },
    lastServerSequence: lastMessage.serverSequence ?? null,
  };
}

function mergeRooms(base: ChatRoom | null, patch: ChatRoom | null): ChatRoom | null {
  if (!base) return patch;
  if (!patch) return base;

  return {
    ...base,
    ...patch,
    members: patch.members?.length ? patch.members : base.members,
    membersInfo: patch.membersInfo?.length ? patch.membersInfo : base.membersInfo,
    admins: patch.admins?.length ? patch.admins : base.admins,
    lastMessage: mergeLastMessage(base.lastMessage, patch.lastMessage),
    unreadCount: typeof patch.unreadCount === 'number' ? patch.unreadCount : base.unreadCount,
    unreadCountByUser: patch.unreadCountByUser ?? base.unreadCountByUser,
    lastRead: { ...base.lastRead, ...(patch.lastRead ?? {}) },
    presenceSummary: { ...(base.presenceSummary ?? {}), ...(patch.presenceSummary ?? {}) },
    pinnedMessageIds: patch.pinnedMessageIds?.length ? patch.pinnedMessageIds : base.pinnedMessageIds,
    mutedBy: patch.mutedBy?.length ? patch.mutedBy : base.mutedBy,
    archivedBy: patch.archivedBy?.length ? patch.archivedBy : base.archivedBy,
  };
}

function mergeChatPatch(
  current: ChatRoom | null,
  patch: Partial<ChatV2ChatRoom> | undefined,
  currentUserId?: string | null
): ChatRoom | null {
  if (!patch) return current;
  const base = current ?? null;
  const next: Partial<ChatRoom> = {};

  if (patch.name !== undefined) next.name = patch.name;
  if (patch.photoURL !== undefined) next.photoURL = patch.photoURL ?? null;
  if (patch.members !== undefined) next.members = patch.members;
  if (patch.membersInfo !== undefined) next.membersInfo = patch.membersInfo;
  if (patch.admins !== undefined) next.admins = patch.admins;
  if (patch.unreadCount !== undefined) {
    next.unreadCountByUser = patch.unreadCount;
    next.unreadCount = toUnreadCount(patch.unreadCount, currentUserId);
  }
  if (patch.lastRead !== undefined) next.lastRead = patch.lastRead;
  if (patch.lastMessage !== undefined) {
    next.lastMessage = patch.lastMessage
      ? {
          text: patch.lastMessage.text,
          senderId: patch.lastMessage.senderId,
          senderName: patch.lastMessage.senderName,
          timestamp: patch.lastMessage.timestamp,
          kind: patch.lastMessage.kind,
        }
      : null;
  }
  if (patch.lastServerSequence !== undefined) next.lastServerSequence = patch.lastServerSequence ?? null;
  if (patch.presenceSummary !== undefined) {
    next.presenceSummary = Object.fromEntries(
      Object.entries(patch.presenceSummary).map(([uid, status]) => [
        uid,
        { isOnline: status !== 'offline', status },
      ])
    );
  }
  if (patch.groupPermissions !== undefined) next.groupPermissions = patch.groupPermissions ?? null;
  if (patch.pinnedMessageIds !== undefined) next.pinnedMessageIds = patch.pinnedMessageIds;
  if (patch.mutedBy !== undefined) next.mutedBy = patch.mutedBy;
  if (patch.archivedBy !== undefined) next.archivedBy = patch.archivedBy;
  if (patch.createdAt !== undefined) next.createdAt = patch.createdAt ?? null;
  if (patch.version !== undefined) next.version = patch.version;

  return mergeRooms(base, next as ChatRoom);
}

function updateMessageLifecycle(
  messages: Message[],
  payload: ChatV2MessageUpdatePayload
): Message[] {
  return messages.map((message) => {
    const matches =
      message.id === payload.messageId ||
      message.clientMessageId === payload.clientMessageId ||
      message.serverMessageId === payload.messageId;

    if (!matches) return message;

    return normalizeMessage({
      ...message,
      id: payload.messageId || message.id,
      serverMessageId: payload.messageId || message.serverMessageId || message.id,
      clientMessageId: payload.clientMessageId ?? message.clientMessageId,
      status: payload.status ?? message.status,
      serverSequence: payload.serverSequence ?? message.serverSequence ?? null,
      readBy: { ...message.readBy, ...(payload.readBy ?? {}) },
      deliveredTo: { ...message.deliveredTo, ...(payload.deliveredTo ?? {}) },
      editedAt: payload.editedAt ?? message.editedAt ?? null,
      deletedAt: payload.deletedAt ?? message.deletedAt ?? null,
      upload: payload.upload
        ? {
            progress: payload.upload.progress ?? message.upload?.progress ?? null,
            state:
              payload.upload.status === 'uploading'
                ? 'uploading'
                : payload.upload.status === 'uploaded'
                  ? 'uploaded'
                  : payload.upload.status === 'failed'
                    ? 'failed'
                    : 'idle',
            storagePath: payload.upload.storagePath ?? message.upload?.storagePath ?? null,
            url: payload.upload.url ?? message.upload?.url ?? null,
            uploadId: payload.upload.uploadId ?? message.upload?.uploadId ?? null,
            error: payload.upload.error ?? message.upload?.error ?? null,
          }
        : message.upload ?? null,
    });
  });
}

function applyReceiptUpdate(
  messages: Message[],
  payload: ChatV2ReceiptUpdatePayload
): Message[] {
  return messages.map((message) => {
    const matches =
      message.id === payload.messageId ||
      message.serverMessageId === payload.messageId ||
      message.clientMessageId === payload.messageId;

    if (!matches) return message;

    const deliveredTo = { ...message.deliveredTo, ...(payload.deliveredTo ?? {}) };
    const readBy = { ...message.readBy, ...(payload.readBy ?? {}) };

    return normalizeMessage({
      ...message,
      deliveredTo,
      readBy,
      receiptSummary: {
        deliveredCount: Object.keys(deliveredTo).length,
        readCount: Object.keys(readBy).length,
      },
    });
  });
}

export function useChat() {
  const { user, profile } = useAuth();
  const featureFlags = useMemo(() => getChatV2FeatureFlags(), []);
  const legacy = useLegacyChat();
  const legacyChatsByIdRef = useRef<Map<string, ChatRoom>>(new Map());
  const displayName =
    legacy.displayName || profile?.displayName || user?.displayName || 'משתמש';
  const displayPhoto =
    legacy.displayPhoto || profile?.photoURL || user?.photoURL || null;
  const activeChatId = legacy.activeChatData?.id || legacy.activeChat || null;
  const typingTimersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const deliveredReceiptCacheRef = useRef<Map<string, Set<string>>>(new Map());
  const readReceiptCacheRef = useRef<Map<string, Set<string>>>(new Map());

  const [snapshotFallback, setSnapshotFallback] = useState<{
    chat: ChatRoom | null;
    messages: Message[];
    cursor: number;
    savedAt: number;
  } | null>(null);
  const [transportChat, setTransportChat] = useState<ChatRoom | null>(null);
  const [transportMessages, setTransportMessages] = useState<Message[]>([]);
  const [transportTypingByChat, setTransportTypingByChat] = useState<Record<string, string[]>>({});
  const [roomStore, setRoomStore] = useState<Record<string, RoomRecord>>({});
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const roomStoreRef = useRef<Record<string, RoomRecord>>({});

  useEffect(() => {
    roomStoreRef.current = roomStore;
  }, [roomStore]);

  useEffect(() => {
    legacyChatsByIdRef.current = new Map((legacy.chats as ChatRoom[]).map((chat) => [chat.id, chat]));
  }, [legacy.chats]);

  const resolveRoomBase = useCallback(
    (chatId: string): ChatRoom | null => roomStoreRef.current[chatId]?.chat ?? legacyChatsByIdRef.current.get(chatId) ?? null,
    []
  );

  const mergeRoomSummary = useCallback(
    (chatId: string, patch?: Partial<ChatV2ChatRoom>) => {
      if (!patch) return resolveRoomBase(chatId);
      return mergeChatPatch(resolveRoomBase(chatId), patch, user?.uid ?? null);
    },
    [resolveRoomBase, user?.uid]
  );

  const updateRoomRecord = useCallback(
    (chatId: string, updater: (current: RoomRecord) => RoomRecord) => {
      setRoomStore((current) => {
        const existing = current[chatId] ?? createRoomRecord();
        const next = updater(existing);
        if (next === existing) return current;
        return {
          ...current,
          [chatId]: next,
        };
      });
    },
    []
  );

  const applyChatPatch = useCallback(
    (chatId: string, patch?: Partial<ChatV2ChatRoom>) => {
      if (!patch) return;

      updateRoomRecord(chatId, (current) => ({
        ...current,
        chat: mergeRoomSummary(chatId, patch) ?? current.chat,
        savedAt: Date.now(),
      }));

      if (activeChatId === chatId) {
        setTransportChat((current) => mergeChatPatch(current, patch, user?.uid ?? null));
      }
    },
    [activeChatId, mergeRoomSummary, updateRoomRecord, user?.uid]
  );

  const upsertLocalMessage = useCallback(
    (chatId: string, message: Message, chatPatch?: Partial<ChatV2ChatRoom>) => {
      updateRoomRecord(chatId, (current) => ({
        chat: chatPatch ? mergeRoomSummary(chatId, chatPatch) ?? current.chat : current.chat,
        messages: trimMessages(mergeMessages(current.messages, [message])),
        cursor: current.cursor,
        savedAt: Date.now(),
      }));

      if (activeChatId === chatId) {
        if (chatPatch) {
          setTransportChat((current) => mergeChatPatch(current, chatPatch, user?.uid ?? null));
        }
        setTransportMessages((current) => trimMessages(mergeMessages(current, [message])));
      }
    },
    [activeChatId, mergeRoomSummary, updateRoomRecord, user?.uid]
  );

  const updateLocalMessage = useCallback(
    (
      chatId: string,
      matcher: (message: Message) => boolean,
      updater: (message: Message) => Message,
      chatPatch?: Partial<ChatV2ChatRoom>
    ) => {
      const updateMessages = (messages: Message[]) => messages.map((message) => (matcher(message) ? updater(message) : message));

      updateRoomRecord(chatId, (current) => ({
        chat: chatPatch ? mergeRoomSummary(chatId, chatPatch) ?? current.chat : current.chat,
        messages: trimMessages(updateMessages(current.messages)),
        cursor: current.cursor,
        savedAt: Date.now(),
      }));

      if (activeChatId === chatId) {
        if (chatPatch) {
          setTransportChat((current) => mergeChatPatch(current, chatPatch, user?.uid ?? null));
        }
        setTransportMessages((current) => trimMessages(updateMessages(current)));
      }
    },
    [activeChatId, mergeRoomSummary, updateRoomRecord, user?.uid]
  );

  const queueReceiptIds = useCallback(
    (cacheRef: { current: Map<string, Set<string>> }, chatId: string, messageIds: string[]) => {
      if (!messageIds.length) return [];

      const existing = cacheRef.current.get(chatId) ?? new Set<string>();
      const nextIds = messageIds.filter((messageId) => !existing.has(messageId));
      if (!nextIds.length) return [];

      nextIds.forEach((messageId) => existing.add(messageId));
      cacheRef.current.set(chatId, existing);
      return nextIds;
    },
    []
  );
  useEffect(() => {
    if (!activeChatId) {
      setSnapshotFallback(null);
      setTransportChat(null);
      setTransportMessages([]);
      return;
    }

    setSnapshotFallback(loadCachedChatSnapshot(activeChatId));
    setTransportChat(null);
    setTransportMessages([]);
  }, [activeChatId]);

  const handleTypingUpdate = useCallback((payload: ChatV2TypingUpdatePayload) => {
    if (payload.userId === user?.uid) return;

    setTransportTypingByChat((prev) => {
      const existing = prev[payload.chatId] ?? [];
      const next = payload.isTyping
        ? [...new Set([...existing, payload.displayName])]
        : existing.filter((name) => name !== payload.displayName);
      return { ...prev, [payload.chatId]: next };
    });

    const timerKey = `${payload.chatId}:${payload.userId}`;
    const currentTimer = typingTimersRef.current.get(timerKey);
    if (currentTimer) clearTimeout(currentTimer);

    if (payload.isTyping) {
      const timer = setTimeout(() => {
        setTransportTypingByChat((prev) => ({
          ...prev,
          [payload.chatId]: (prev[payload.chatId] ?? []).filter(
            (name) => name !== payload.displayName
          ),
        }));
        typingTimersRef.current.delete(timerKey);
      }, TYPING_TTL_MS);
      typingTimersRef.current.set(timerKey, timer);
    } else {
      typingTimersRef.current.delete(timerKey);
    }
  }, [user?.uid]);

  const transport = useChatTransport({
    activeChatId,
    currentUserId: user?.uid ?? null,
    displayName,
    displayPhoto,
    getIdToken: user ? () => user.getIdToken() : null,
    enabled: featureFlags.socketEnabled,
    onSnapshot: (payload: ChatV2SnapshotPayload) => {
      const nextChat = mapProtocolRoom(payload.chat, user?.uid ?? null);
      const nextMessages = trimMessages(payload.messages.map(mapProtocolMessage));
      updateRoomRecord(nextChat.id, () => ({
        chat: nextChat,
        messages: nextMessages,
        cursor: payload.cursor,
        savedAt: Date.now(),
      }));
      if (activeChatId === nextChat.id) {
        setTransportChat(nextChat);
        setTransportMessages(nextMessages);
      }
      setSnapshotFallback((prev) => ({
        chat: nextChat,
        messages: nextMessages,
        cursor: payload.cursor,
        savedAt: Date.now(),
      }));
    },
    onDelta: (payload: ChatV2DeltaPayload) => {
      const deltaMessages = payload.messages ?? [];
      const nextDeltaMessages = deltaMessages.map(mapProtocolMessage);
      const derivedChatPatch = payload.chat ?? buildRoomPatchFromMessages(nextDeltaMessages);

      updateRoomRecord(payload.chatId, (current) => ({
        chat: mergeRoomSummary(payload.chatId, derivedChatPatch) ?? current.chat,
        messages: nextDeltaMessages.length
          ? trimMessages(mergeMessages(current.messages, nextDeltaMessages))
          : current.messages,
        cursor: Math.max(current.cursor, payload.cursor ?? current.cursor),
        savedAt: Date.now(),
      }));

      if (activeChatId && payload.chatId === activeChatId) {
        if (derivedChatPatch) {
          setTransportChat((current) => mergeChatPatch(current, derivedChatPatch, user?.uid ?? null));
        }
        if (nextDeltaMessages.length) {
          setTransportMessages((current) => mergeMessages(current, nextDeltaMessages));
        }
      }
    },
    onMessage: (payload: ChatV2Message) => {
      const nextMessage = mapProtocolMessage(payload);
      updateRoomRecord(payload.chatId, (current) => ({
        chat: mergeRoomSummary(payload.chatId, {
          lastMessage: {
            text: payload.text,
            senderId: payload.senderId,
            senderName: payload.senderName,
            timestamp: payload.createdAtServer ?? payload.createdAtClient ?? Date.now(),
            kind: payload.kind,
          },
          lastServerSequence: payload.serverSequence ?? current.chat?.lastServerSequence ?? null,
        }) ?? current.chat,
        messages: trimMessages(mergeMessages(current.messages, [nextMessage])),
        cursor: Math.max(current.cursor, payload.serverSequence ?? current.cursor),
        savedAt: Date.now(),
      }));

      if (activeChatId && payload.chatId === activeChatId) {
        setTransportChat((current) =>
          mergeChatPatch(
            current,
            {
              lastMessage: {
                text: payload.text,
                senderId: payload.senderId,
                senderName: payload.senderName,
                timestamp: payload.createdAtServer ?? payload.createdAtClient ?? Date.now(),
                kind: payload.kind,
              },
              lastServerSequence: payload.serverSequence ?? current?.lastServerSequence ?? null,
            },
            user?.uid ?? null
          )
        );
        setTransportMessages((current) => mergeMessages(current, [nextMessage]));
      }
    },
    onMessageAccepted: (payload) => {
      updateRoomRecord(payload.chatId, (current) => ({
        chat: mergeRoomSummary(payload.chatId, {
          lastServerSequence: payload.serverSequence,
        }) ?? current.chat,
        messages: updateMessageLifecycle(current.messages, {
          chatId: payload.chatId,
          messageId: payload.serverMessageId,
          clientMessageId: payload.clientMessageId,
          status: payload.status,
          serverSequence: payload.serverSequence,
        }),
        cursor: Math.max(current.cursor, payload.serverSequence),
        savedAt: Date.now(),
      }));

      if (activeChatId && payload.chatId === activeChatId) {
        setTransportChat((current) =>
          mergeChatPatch(
            current,
            {
              lastServerSequence: payload.serverSequence,
            },
            user?.uid ?? null
          )
        );
        setTransportMessages((current) =>
          updateMessageLifecycle(current, {
            chatId: payload.chatId,
            messageId: payload.serverMessageId,
            clientMessageId: payload.clientMessageId,
            status: payload.status,
            serverSequence: payload.serverSequence,
          })
        );
      }
    },
    onMessageUpdate: (payload: ChatV2MessageUpdatePayload) => {
      updateRoomRecord(payload.chatId, (current) => ({
        ...current,
        messages: updateMessageLifecycle(current.messages, payload),
        cursor: Math.max(current.cursor, payload.serverSequence ?? current.cursor),
        savedAt: Date.now(),
      }));

      if (activeChatId && payload.chatId === activeChatId) {
        setTransportMessages((current) => updateMessageLifecycle(current, payload));
      }
    },
    onReceiptUpdate: (payload: ChatV2ReceiptUpdatePayload) => {
      updateRoomRecord(payload.chatId, (current) => ({
        chat: mergeRoomSummary(payload.chatId, {
          unreadCount: payload.unreadCount,
          lastRead: payload.lastRead,
          lastServerSequence: payload.serverCursor ?? current.chat?.lastServerSequence ?? null,
        }) ?? current.chat,
        messages: applyReceiptUpdate(current.messages, payload),
        cursor: Math.max(current.cursor, payload.serverCursor ?? current.cursor),
        savedAt: Date.now(),
      }));

      if (activeChatId && payload.chatId === activeChatId) {
        setTransportMessages((current) => applyReceiptUpdate(current, payload));
      }
    },
    onTypingUpdate: handleTypingUpdate,
  });

  useEffect(() => {
    if (!user?.uid) return;
    transport.sendPresenceHeartbeat('online', activeChatId);
  }, [activeChatId, transport, user?.uid]);

  useEffect(() => {
    if (!featureFlags.socketEnabled || !activeChatId) return;

    const cursor = snapshotFallback?.cursor ?? getCurrentCursor(legacy.messages);
    transport.subscribe(activeChatId, cursor);
    return () => {
      transport.unsubscribe(activeChatId);
    };
  }, [activeChatId, featureFlags.socketEnabled, legacy.messages, snapshotFallback?.cursor, transport]);

  const activeChatData = useMemo(() => {
    const base = (legacy.activeChatData as ChatRoom | null) ?? snapshotFallback?.chat ?? null;
    const room = activeChatId ? roomStore[activeChatId]?.chat ?? null : null;
    return mergeRooms(mergeRooms(base, transportChat), room);
  }, [activeChatId, legacy.activeChatData, roomStore, snapshotFallback?.chat, transportChat]);

  const messages = useMemo(() => {
    const baseMessages =
      legacy.messages.length > 0 ? (legacy.messages as Message[]) : snapshotFallback?.messages ?? [];

    const roomMessages = activeChatId ? roomStore[activeChatId]?.messages ?? [] : [];
    const mergedTransport = transportMessages.length ? mergeMessages(baseMessages, transportMessages) : baseMessages;
    if (!roomMessages.length) return mergedTransport;
    return mergeMessages(mergedTransport, roomMessages);
  }, [activeChatId, legacy.messages, roomStore, snapshotFallback?.messages, transportMessages]);

  const typingUsers = useMemo(() => {
    if (!activeChatId) return legacy.typingUsers;
    const transportTyping = transportTypingByChat[activeChatId] ?? [];
    return [...new Set([...legacy.typingUsers, ...transportTyping])];
  }, [activeChatId, legacy.typingUsers, transportTypingByChat]);

  useEffect(() => {
    if (!featureFlags.socketEnabled || !transport.socketReady || !activeChatId || !user?.uid) return;

    const incomingMessages = messages.filter(
      (message) =>
        message.senderId !== user.uid &&
        message.type !== 'system' &&
        !message.deletedAt
    );

    const deliverIds = queueReceiptIds(
      deliveredReceiptCacheRef,
      activeChatId,
      incomingMessages
      .filter((message) => !message.deliveredTo?.[user.uid])
      .map((message) => message.serverMessageId || message.id)
      .filter(Boolean)
    );

    if (deliverIds.length) {
      transport.sendDeliveredReceipt({
        chatId: activeChatId,
        messageIds: deliverIds,
        serverCursor: getCurrentCursor(messages),
      });
    }

    const readIds = queueReceiptIds(
      readReceiptCacheRef,
      activeChatId,
      incomingMessages
      .filter((message) => !message.readBy?.[user.uid])
      .map((message) => message.serverMessageId || message.id)
      .filter(Boolean)
    );

    if (readIds.length) {
      transport.sendReadReceipt({
        chatId: activeChatId,
        messageIds: readIds,
        serverCursor: getCurrentCursor(messages),
      });
    }
  }, [activeChatId, featureFlags.socketEnabled, messages, queueReceiptIds, transport, user?.uid]);

  useEffect(() => {
    if (!activeChatId) return;

    const messagesToCache = trimMessages(messages);
    saveCachedActiveChatId(activeChatId);
    saveCachedChatSnapshot({
      chatId: activeChatId,
      chat: activeChatData,
      messages: messagesToCache,
      cursor: getCurrentCursor(messagesToCache),
      savedAt: Date.now(),
    });
  }, [activeChatData, activeChatId, messages]);

  const chats = useMemo(() => {
    const mergedById = new Map<string, ChatRoom>();

    for (const chat of legacy.chats as ChatRoom[]) {
      mergedById.set(chat.id, chat);
    }

    for (const [chatId, record] of Object.entries(roomStore)) {
      if (!record.chat) continue;
      const base = mergedById.get(chatId) ?? null;
      mergedById.set(chatId, mergeRooms(base, record.chat) ?? record.chat);
    }

    return [...mergedById.values()].sort(sortRooms);
  }, [legacy.chats, roomStore]);

  const sendMessage = useCallback(
    async (
      text: string,
      type: 'text' | 'image' | 'file' | 'voice' | 'video',
      file?: File,
      replyTo?: { messageId: string; text: string; senderName: string } | null,
      duration?: number,
      mimeType?: string
    ) => {
      if (!activeChatId || !user) return;

      const canUseSocketDirect = featureFlags.socketEnabled && transport.socketReady;

      if (!canUseSocketDirect) {
        await legacy.sendMessage(text, type, file, replyTo, duration, mimeType);
        return;
      }

      const clientMessageId = buildClientMessageId(activeChatId);
      const createdAtClient = Date.now();
      const previewText = getMessagePreviewText({
        type,
        text: type === 'text' ? text : type === 'voice' || type === 'video' ? '' : text || file?.name || '',
        fileName: file?.name || null,
      });

      if (!file || type === 'text') {
        const optimisticMessage = normalizeMessage({
          ...createOptimisticMessage({
            chatId: activeChatId,
            userId: user.uid,
            displayName,
            displayPhoto,
            payload: {
              text,
              type,
              replyTo: replyTo ?? null,
            },
          }),
          id: clientMessageId,
          clientMessageId,
          optimisticId: clientMessageId,
          createdAt: createdAtClient,
          createdAtClient,
          status: 'sending',
        });

        const lastMessagePatch: Partial<ChatV2ChatRoom> = {
          lastMessage: {
            text: previewText,
            senderId: user.uid,
            senderName: displayName,
            timestamp: createdAtClient,
            kind: type,
          },
        };

        upsertLocalMessage(activeChatId, optimisticMessage, lastMessagePatch);

        const messageSendResponse = (await transport.sendMessage(activeChatId, {
          clientMessageId,
          text,
          kind: type,
          replyTo: replyTo ?? null,
          createdAtClient,
          encrypted: false,
        })) as { ok?: boolean; error?: string } | null;

        if (!messageSendResponse?.ok) {
          throw new Error(messageSendResponse?.error || 'message_send_failed');
        }
      }

      if (!file || type === 'text') {
        return;
      }

      const optimisticMessage = normalizeMessage({
        ...createOptimisticMessage({
          chatId: activeChatId,
          userId: user.uid,
          displayName,
          displayPhoto,
          payload: {
            text,
            type,
            file,
            fileName: file.name,
            fileSize: file.size,
            duration: duration ?? null,
            mimeType: mimeType ?? file.type ?? null,
            replyTo: replyTo ?? null,
          },
        }),
        id: clientMessageId,
        clientMessageId,
        optimisticId: clientMessageId,
        createdAt: createdAtClient,
        createdAtClient,
        status: 'queued',
        upload: {
          progress: 0,
          state: 'uploading',
          storagePath: null,
          url: null,
          uploadId: clientMessageId,
          error: null,
        },
      });

      const lastMessagePatch: Partial<ChatV2ChatRoom> = {
        lastMessage: {
          text: previewText,
          senderId: user.uid,
          senderName: displayName,
          timestamp: createdAtClient,
          kind: type,
        },
      };

      upsertLocalMessage(activeChatId, optimisticMessage, lastMessagePatch);
      setUploadProgress(0);

      try {
        const uploadInitResponse = (await transport.sendUploadInit({
          chatId: activeChatId,
          clientMessageId,
          fileName: file.name,
          mimeType: mimeType ?? file.type ?? 'application/octet-stream',
          sizeBytes: file.size,
        })) as { ok?: boolean; error?: string; upload?: { uploadId: string; storagePath: string } } | null;

        if (!uploadInitResponse?.ok || !uploadInitResponse.upload?.storagePath) {
          throw new Error(uploadInitResponse?.error || 'upload_init_failed');
        }

        const { uploadId, storagePath } = uploadInitResponse.upload;
        updateLocalMessage(
          activeChatId,
          (message) => message.clientMessageId === clientMessageId || message.id === clientMessageId,
          (message) =>
            normalizeMessage({
              ...message,
              status: 'sending',
              upload: {
                progress: 0,
                state: 'uploading',
                storagePath,
                url: null,
                uploadId,
                error: null,
              },
            })
        );

        const uploadedUrl = await new Promise<string>((resolve, reject) => {
          const uploadTask = uploadBytesResumable(storageRef(storage, storagePath), file);

          uploadTask.on(
            'state_changed',
            (snapshot) => {
              const progress = Math.round((snapshot.bytesTransferred / snapshot.totalBytes) * 100);
              setUploadProgress(progress);
              updateLocalMessage(
                activeChatId,
                (message) => message.clientMessageId === clientMessageId || message.id === clientMessageId,
                (message) =>
                  normalizeMessage({
                    ...message,
                    upload: {
                      progress,
                      state: 'uploading',
                      storagePath,
                      url: null,
                      uploadId,
                      error: null,
                    },
                  })
              );
            },
            reject,
            async () => {
              try {
                const url = await getDownloadURL(uploadTask.snapshot.ref);
                resolve(url);
              } catch (error) {
                reject(error);
              }
            }
          );
        });

        const attachment: ChatV2Attachment = {
          storagePath,
          fileName: file.name,
          mimeType: mimeType ?? file.type ?? 'application/octet-stream',
          sizeBytes: file.size,
          url: uploadedUrl,
          durationSeconds: duration ?? null,
        };

        await transport.sendUploadComplete({
          chatId: activeChatId,
          clientMessageId,
          storagePath,
          url: uploadedUrl,
        });

        updateLocalMessage(
          activeChatId,
          (message) => message.clientMessageId === clientMessageId || message.id === clientMessageId,
          (message) =>
            normalizeMessage({
              ...message,
              fileURL: uploadedUrl,
              fileName: file.name,
              fileSize: file.size,
              mimeType: mimeType ?? file.type ?? null,
              duration: duration ?? null,
              status: 'sending',
              attachments: [attachment],
              upload: {
                progress: 100,
                state: 'uploaded',
                storagePath,
                url: uploadedUrl,
                uploadId,
                error: null,
              },
            })
        );

        const messageSendResponse = (await transport.sendMessage(activeChatId, {
          clientMessageId,
          text: type === 'voice' || type === 'video' ? '' : text,
          kind: type,
          replyTo: replyTo ?? null,
          createdAtClient,
          encrypted: false,
          attachments: [attachment],
        })) as { ok?: boolean; error?: string } | null;

        if (!messageSendResponse?.ok) {
          throw new Error(messageSendResponse?.error || 'message_send_failed');
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'upload_failed';
        updateLocalMessage(
          activeChatId,
          (message) => message.clientMessageId === clientMessageId || message.id === clientMessageId,
          (message) =>
            normalizeMessage({
              ...message,
              status: 'failed',
              errorCode: errorMessage,
              localState: 'failed',
              localStatusText: 'שליחה נכשלה',
              upload: message.upload
                ? {
                    ...message.upload,
                    state: 'failed',
                    error: errorMessage,
                  }
                : null,
            })
        );
        throw error;
      } finally {
        setUploadProgress(null);
      }
    },
    [
      activeChatId,
      displayName,
      displayPhoto,
      featureFlags.socketEnabled,
      legacy,
      transport,
      updateLocalMessage,
      upsertLocalMessage,
      user,
    ]
  );

  const setTyping = useCallback(
    (isTyping: boolean) => {
      legacy.setTyping(isTyping);
      if (activeChatId && featureFlags.socketEnabled) {
        transport.sendTyping(activeChatId, isTyping);
      }
    },
    [activeChatId, featureFlags.socketEnabled, legacy, transport]
  );

  const setActiveChat = useCallback(
    (chatId: string | null) => {
      legacy.setActiveChat(chatId);
      saveCachedActiveChatId(chatId);
    },
    [legacy]
  );

  const connectionState: ChatConnectionState = useMemo(
    () => ({
      ...transport.connectionState,
      transport: transport.transportMode,
      lastSyncAt: transport.lastSyncAt,
      pendingQueue: transport.connectionState.pendingQueue,
    }),
    [transport.connectionState, transport.lastSyncAt, transport.transportMode]
  );

  return {
    chats,
    activeChat: legacy.activeChat,
    activeChatData,
    messages,
    allUsers: legacy.allUsers,
    onlineUsers: legacy.onlineUsers,
    typingUsers,
    uploadProgress: uploadProgress ?? legacy.uploadProgress,
    setActiveChat,
    sendMessage,
    deleteMessage: legacy.deleteMessage,
    createPrivateChat: legacy.createPrivateChat,
    createGroup: legacy.createGroup,
    setTyping,
    displayName,
    displayPhoto,
    connectionState,
    transportMode: transport.transportMode,
    socketReady: transport.socketReady,
    lastSyncAt: transport.lastSyncAt,
  };
}
