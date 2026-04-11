import { normalizeServerTimestamp } from './protocol';
import type { ChatRoom, ChatSnapshotRecord, Message } from './types';
import { normalizeMessage, sortMessages } from './messageModel';

function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object') return {};
  return value as Record<string, unknown>;
}

function normalizeMemberInfo(value: unknown): ChatRoom['membersInfo'] {
  if (!Array.isArray(value)) return [];

  return value
    .map((item) => asRecord(item))
    .map((item) => ({
      uid: typeof item.uid === 'string' ? item.uid : undefined,
      displayName: typeof item.displayName === 'string' ? item.displayName : '',
      photoURL: typeof item.photoURL === 'string' ? item.photoURL : null,
    }));
}

function normalizeUnreadCount(value: unknown, currentUserId?: string | null): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (value && typeof value === 'object' && currentUserId) {
    const record = value as Record<string, unknown>;
    const current = record[currentUserId];
    if (typeof current === 'number' && Number.isFinite(current)) return current;
  }
  return 0;
}

function normalizeUnreadCounts(value: unknown): Record<string, number> | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const record = value as Record<string, unknown>;
  const entries = Object.entries(record).filter(([, count]) => typeof count === 'number' && Number.isFinite(count));
  if (entries.length === 0) return undefined;
  return Object.fromEntries(entries) as Record<string, number>;
}

export function normalizeFirestoreChatRoom(
  chatId: string,
  raw: unknown,
  currentUserId?: string | null
): ChatRoom {
  const data = asRecord(raw);
  return {
    id: chatId,
    type: data.type === 'group' || data.type === 'general' ? data.type : 'private',
    name: typeof data.name === 'string' ? data.name : '',
    photoURL: typeof data.photoURL === 'string' ? data.photoURL : null,
    members: Array.isArray(data.members) ? data.members.filter((member): member is string => typeof member === 'string') : [],
    membersInfo: normalizeMemberInfo(data.membersInfo),
    admins: Array.isArray(data.admins) ? data.admins.filter((member): member is string => typeof member === 'string') : undefined,
    encryptedKeys: data.encryptedKeys && typeof data.encryptedKeys === 'object' ? (data.encryptedKeys as Record<string, string>) : null,
    lastMessage: data.lastMessage && typeof data.lastMessage === 'object' ? (() => {
      const record = asRecord(data.lastMessage);
      const kind = record.kind;
      return {
        text: typeof record.text === 'string' ? String(record.text) : '',
        senderId: typeof record.senderId === 'string' ? String(record.senderId) : '',
        senderName: typeof record.senderName === 'string' ? String(record.senderName) : '',
        timestamp: normalizeServerTimestamp(record.timestamp),
        kind: kind === 'image' || kind === 'file' || kind === 'voice' || kind === 'video' || kind === 'system'
          ? kind
          : undefined,
      };
    })() : null,
    unreadCount: normalizeUnreadCount(data.unreadCount, currentUserId),
    unreadCountByUser: normalizeUnreadCounts(data.unreadCount),
    lastRead: data.lastRead && typeof data.lastRead === 'object'
      ? Object.fromEntries(
          Object.entries(data.lastRead as Record<string, unknown>).map(([uid, value]) => [uid, normalizeServerTimestamp(value)])
        )
      : {},
    lastServerSequence: typeof data.lastServerSequence === 'number' ? data.lastServerSequence : null,
    presenceSummary: data.presenceSummary && typeof data.presenceSummary === 'object'
      ? (data.presenceSummary as ChatRoom['presenceSummary'])
      : undefined,
    groupPermissions: data.groupPermissions && typeof data.groupPermissions === 'object'
      ? {
          canAddMembers: Boolean(asRecord(data.groupPermissions).canAddMembers),
          canEditInfo: Boolean(asRecord(data.groupPermissions).canEditInfo),
          canSendMessages: Boolean(asRecord(data.groupPermissions).canSendMessages),
        }
      : null,
    pinnedMessageIds: Array.isArray(data.pinnedMessageIds)
      ? data.pinnedMessageIds.filter((value): value is string => typeof value === 'string')
      : undefined,
    mutedBy: Array.isArray(data.mutedBy) ? data.mutedBy.filter((value): value is string => typeof value === 'string') : undefined,
    archivedBy: Array.isArray(data.archivedBy) ? data.archivedBy.filter((value): value is string => typeof value === 'string') : undefined,
    createdAt: typeof data.createdAt === 'number' ? data.createdAt : normalizeServerTimestamp(data.createdAt),
    version: typeof data.version === 'number' ? data.version : undefined,
  };
}

export function normalizeFirestoreMessage(messageId: string, raw: unknown): Message {
  const data = asRecord(raw);
  return normalizeMessage({
    id: messageId,
    senderId: typeof data.senderId === 'string' ? data.senderId : '',
    senderName: typeof data.senderName === 'string' ? data.senderName : '',
    senderPhoto: typeof data.senderPhoto === 'string' ? data.senderPhoto : null,
    text: typeof data.text === 'string' ? data.text : '',
    type: data.type === 'image' || data.type === 'file' || data.type === 'voice' || data.type === 'video' || data.type === 'system'
      ? data.type
      : 'text',
    fileURL: typeof data.fileURL === 'string' ? data.fileURL : null,
    fileName: typeof data.fileName === 'string' ? data.fileName : null,
    fileSize: typeof data.fileSize === 'number' ? data.fileSize : null,
    duration: typeof data.duration === 'number' ? data.duration : null,
    mimeType: typeof data.mimeType === 'string' ? data.mimeType : null,
    replyTo: data.replyTo && typeof data.replyTo === 'object'
      ? {
          messageId: typeof asRecord(data.replyTo).messageId === 'string' ? String(asRecord(data.replyTo).messageId) : '',
          text: typeof asRecord(data.replyTo).text === 'string' ? String(asRecord(data.replyTo).text) : '',
          senderName: typeof asRecord(data.replyTo).senderName === 'string' ? String(asRecord(data.replyTo).senderName) : '',
        }
      : null,
    readBy: data.readBy && typeof data.readBy === 'object'
      ? Object.fromEntries(
          Object.entries(data.readBy as Record<string, unknown>).map(([uid, value]) => [uid, normalizeServerTimestamp(value)])
        )
      : {},
    deliveredTo: data.deliveredTo && typeof data.deliveredTo === 'object'
      ? Object.fromEntries(
          Object.entries(data.deliveredTo as Record<string, unknown>).map(([uid, value]) => [uid, normalizeServerTimestamp(value)])
        )
      : {},
    createdAt: normalizeServerTimestamp(data.createdAt),
    clientMessageId: typeof data.clientMessageId === 'string' ? data.clientMessageId : undefined,
    serverMessageId: typeof data.serverMessageId === 'string' ? data.serverMessageId : undefined,
    serverSequence: typeof data.serverSequence === 'number' ? data.serverSequence : null,
    status: data.status === 'queued'
      || data.status === 'sending'
      || data.status === 'sent'
      || data.status === 'delivered'
      || data.status === 'read'
      || data.status === 'failed'
      ? data.status
      : undefined,
    createdAtClient: typeof data.createdAtClient === 'number' ? data.createdAtClient : undefined,
    createdAtServer: typeof data.createdAtServer === 'number' ? data.createdAtServer : null,
    editedAt: typeof data.editedAt === 'number' ? data.editedAt : null,
    deletedAt: typeof data.deletedAt === 'number' ? data.deletedAt : null,
    reactions: data.reactions && typeof data.reactions === 'object'
      ? (data.reactions as Record<string, string[]>)
      : {},
    forwardedFrom: data.forwardedFrom && typeof data.forwardedFrom === 'object'
      ? {
          chatId: typeof asRecord(data.forwardedFrom).chatId === 'string' ? String(asRecord(data.forwardedFrom).chatId) : '',
          messageId: typeof asRecord(data.forwardedFrom).messageId === 'string' ? String(asRecord(data.forwardedFrom).messageId) : '',
          senderId: typeof asRecord(data.forwardedFrom).senderId === 'string' ? String(asRecord(data.forwardedFrom).senderId) : '',
        }
      : null,
    upload: data.upload && typeof data.upload === 'object'
      ? (() => {
          const record = asRecord(data.upload);
          const state = record.state;
          return {
            progress: typeof record.progress === 'number' ? Number(record.progress) : null,
            state: state === 'uploading' || state === 'uploaded' || state === 'failed' ? state : 'idle',
            storagePath: typeof record.storagePath === 'string' ? String(record.storagePath) : null,
            url: typeof record.url === 'string' ? String(record.url) : null,
            uploadId: typeof record.uploadId === 'string' ? String(record.uploadId) : null,
            error: typeof record.error === 'string' ? String(record.error) : null,
          };
        })()
      : null,
    receiptSummary: data.receiptSummary && typeof data.receiptSummary === 'object'
      ? {
          deliveredCount: typeof asRecord(data.receiptSummary).deliveredCount === 'number' ? Number(asRecord(data.receiptSummary).deliveredCount) : 0,
          readCount: typeof asRecord(data.receiptSummary).readCount === 'number' ? Number(asRecord(data.receiptSummary).readCount) : 0,
        }
      : undefined,
    errorCode: typeof data.errorCode === 'string' ? data.errorCode : null,
    optimisticId: typeof data.optimisticId === 'string' ? data.optimisticId : undefined,
    localState: data.localState === 'sending' || data.localState === 'failed' ? data.localState : undefined,
    localStatusText: typeof data.localStatusText === 'string' ? data.localStatusText : undefined,
    localCreatedAt: typeof data.localCreatedAt === 'number' ? data.localCreatedAt : undefined,
    localPayload: undefined,
    attachments: Array.isArray(data.attachments) ? (data.attachments as Message['attachments']) : [],
    encrypted: Boolean(data.encrypted),
  });
}

export interface FirestoreFallbackState {
  chat: ChatRoom | null;
  messages: Message[];
  cursor: number;
  source: 'firestore' | 'cache' | 'hybrid';
  hydratedAt: number;
}

export function createFirestoreFallbackState({
  chatId,
  rawChat,
  rawMessages,
  currentUserId,
  cachedChat,
  cachedMessages,
  cursor,
}: {
  chatId: string;
  rawChat?: unknown;
  rawMessages?: Array<{ id: string; data: unknown }>;
  currentUserId?: string | null;
  cachedChat?: ChatRoom | null;
  cachedMessages?: Message[];
  cursor?: number;
}): FirestoreFallbackState {
  const firestoreChat = rawChat ? normalizeFirestoreChatRoom(chatId, rawChat, currentUserId) : null;
  const firestoreMessages = rawMessages?.map((entry) => normalizeFirestoreMessage(entry.id, entry.data)) ?? [];
  const mergedMessages = sortMessages([...(cachedMessages ?? []), ...firestoreMessages]);

  return {
    chat: firestoreChat ?? cachedChat ?? null,
    messages: mergedMessages.length > 0 ? mergedMessages : cachedMessages ?? [],
    cursor: cursor ?? firestoreMessages.reduce((max, message) => Math.max(max, message.serverSequence ?? message.createdAt ?? 0), 0),
    source: firestoreChat && firestoreMessages.length > 0
      ? 'firestore'
      : cachedChat || (cachedMessages && cachedMessages.length > 0)
        ? 'cache'
        : 'hybrid',
    hydratedAt: Date.now(),
  };
}

export function buildSnapshotRecord(
  chatId: string,
  chat: ChatRoom | null,
  messages: Message[],
  cursor: number
): ChatSnapshotRecord {
  return {
    chatId,
    chat,
    messages,
    cursor,
    savedAt: Date.now(),
  };
}
