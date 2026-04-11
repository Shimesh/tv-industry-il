export type ChatV2RoomType = 'private' | 'group' | 'general';
export type ChatV2MessageKind = 'text' | 'image' | 'file' | 'voice' | 'video' | 'system';
export type ChatV2MessageStatus = 'queued' | 'sending' | 'sent' | 'delivered' | 'read' | 'failed';
export type ChatV2UploadStatus = 'pending' | 'uploading' | 'uploaded' | 'failed';
export type ChatV2PresenceStatus = 'online' | 'away' | 'offline';

export interface ChatV2UserRef {
  uid: string;
  displayName: string;
  photoURL: string | null;
}

export interface ChatV2Attachment {
  storagePath: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  url?: string | null;
  durationSeconds?: number | null;
  width?: number | null;
  height?: number | null;
  previewURL?: string | null;
}

export interface ChatV2ReplyReference {
  messageId: string;
  text: string;
  senderName: string;
}

export interface ChatV2UploadState {
  uploadId: string;
  status: ChatV2UploadStatus;
  storagePath: string;
  progress: number;
  error?: string | null;
  url?: string | null;
}

export interface ChatV2Message {
  id: string;
  chatId: string;
  clientMessageId: string;
  serverMessageId?: string | null;
  serverSequence?: number | null;
  senderId: string;
  senderName: string;
  senderPhoto: string | null;
  text: string;
  kind: ChatV2MessageKind;
  status: ChatV2MessageStatus;
  replyTo: ChatV2ReplyReference | null;
  attachments: ChatV2Attachment[];
  upload: ChatV2UploadState | null;
  readBy: Record<string, number>;
  deliveredTo: Record<string, number>;
  reactions: Record<string, string[]>;
  createdAtClient: number;
  createdAtServer?: number | null;
  editedAt?: number | null;
  deletedAt?: number | null;
  forwardedFrom?: {
    chatId: string;
    messageId: string;
    senderId: string;
  } | null;
  encrypted?: boolean;
}

export interface ChatV2ChatRoom {
  id: string;
  type: ChatV2RoomType;
  name: string;
  photoURL: string | null;
  members: string[];
  membersInfo: ChatV2UserRef[];
  admins: string[];
  encryptedKeys?: Record<string, string> | null;
  lastMessage?: {
    text: string;
    senderId: string;
    senderName: string;
    timestamp: number;
    kind?: ChatV2MessageKind;
  } | null;
  lastServerSequence?: number | null;
  unreadCount?: Record<string, number>;
  lastRead?: Record<string, number>;
  presenceSummary?: Record<string, ChatV2PresenceStatus>;
  groupPermissions?: {
    canAddMembers: boolean;
    canEditInfo: boolean;
    canSendMessages: boolean;
  } | null;
  pinnedMessageIds?: string[];
  mutedBy?: string[];
  archivedBy?: string[];
  createdAt?: number | null;
  version?: number;
}

export interface ChatV2AuthPayload {
  token: string;
  deviceId?: string;
  appVersion?: string;
  lastKnownServerCursor?: number | null;
}

export interface ChatV2SubscribePayload {
  chatId: string;
  lastKnownServerCursor?: number | null;
}

export interface ChatV2UnsubscribePayload {
  chatId: string;
}

export interface ChatV2TypingPayload {
  chatId: string;
  isTyping: boolean;
}

export interface ChatV2PresenceHeartbeatPayload {
  status?: ChatV2PresenceStatus;
  activeChatId?: string | null;
}

export interface ChatV2ReadReceiptPayload {
  chatId: string;
  messageIds: string[];
  serverCursor?: number | null;
}

export interface ChatV2DeliveredReceiptPayload {
  chatId: string;
  messageIds: string[];
  serverCursor?: number | null;
}

export interface ChatV2AttachmentInitPayload {
  chatId: string;
  clientMessageId: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
}

export type ChatV2UploadInitPayload = ChatV2AttachmentInitPayload;

export interface ChatV2AttachmentCompletePayload {
  chatId: string;
  clientMessageId: string;
  storagePath: string;
  url: string;
}

export interface ChatV2SendMessagePayload {
  chatId: string;
  clientMessageId: string;
  text: string;
  kind?: ChatV2MessageKind;
  replyTo?: ChatV2ReplyReference | null;
  attachments?: ChatV2Attachment[];
  createdAtClient?: number;
  encrypted?: boolean;
}

export interface ChatV2RetryMessagePayload {
  chatId: string;
  clientMessageId: string;
}

export interface ChatV2CallSignalPayload {
  callId: string;
  chatId?: string;
  targetUid?: string;
  signalType: 'ring' | 'accept' | 'decline' | 'busy' | 'offer' | 'answer' | 'ice' | 'end';
  sdp?: string;
  candidate?: unknown;
}

export interface ChatV2SnapshotPayload {
  chat: ChatV2ChatRoom;
  messages: ChatV2Message[];
  cursor: number;
}

export interface ChatV2DeltaPayload {
  chatId: string;
  messages?: ChatV2Message[];
  chat?: Partial<ChatV2ChatRoom>;
  cursor: number;
}

export interface ChatV2MessageAcceptedPayload {
  chatId: string;
  clientMessageId: string;
  serverMessageId: string;
  serverSequence: number;
  status: ChatV2MessageStatus;
  createdAtServer: number;
}

export interface ChatV2MessageUpdatePayload {
  chatId: string;
  messageId: string;
  clientMessageId?: string;
  status?: ChatV2MessageStatus;
  serverSequence?: number;
  readBy?: Record<string, number>;
  deliveredTo?: Record<string, number>;
  editedAt?: number | null;
  deletedAt?: number | null;
  upload?: ChatV2UploadState | null;
}

export interface ChatV2ReceiptUpdatePayload {
  chatId: string;
  messageId: string;
  readBy?: Record<string, number>;
  deliveredTo?: Record<string, number>;
  unreadCount?: Record<string, number>;
  lastRead?: Record<string, number>;
  serverCursor?: number;
}

export interface ChatV2TypingUpdatePayload {
  chatId: string;
  userId: string;
  displayName: string;
  isTyping: boolean;
  timestamp: number;
}

export interface ChatV2PresenceUpdatePayload {
  userId: string;
  displayName?: string;
  photoURL?: string | null;
  isOnline: boolean;
  lastSeen: number;
  status: ChatV2PresenceStatus;
  activeChatId?: string | null;
}

export interface ChatV2UploadUrlPayload {
  chatId: string;
  clientMessageId: string;
  uploadId: string;
  storagePath: string;
  url?: string | null;
}

export interface ChatV2CallEventPayload {
  callId: string;
  chatId?: string;
  fromUid?: string;
  toUid?: string;
  signalType: 'ring' | 'accept' | 'decline' | 'busy' | 'offer' | 'answer' | 'ice' | 'end';
  sdp?: string;
  candidate?: unknown;
  timestamp: number;
}

export interface ChatV2ErrorPayload {
  code:
    | 'unauthorized'
    | 'forbidden'
    | 'invalid_payload'
    | 'chat_not_found'
    | 'not_a_member'
    | 'message_send_failed'
    | 'upload_failed'
    | 'receipt_failed'
    | 'call_failed'
    | 'persistence_unavailable'
    | 'unknown';
  message: string;
  details?: unknown;
}

export interface ChatV2ClientToServerEvents {
  'auth:connect': (payload: ChatV2AuthPayload) => void;
  'chat:subscribe': (payload: ChatV2SubscribePayload, ack?: (response: { ok: boolean; error?: string }) => void) => void;
  'chat:unsubscribe': (payload: ChatV2UnsubscribePayload, ack?: (response: { ok: boolean; error?: string }) => void) => void;
  'message:send': (payload: ChatV2SendMessagePayload, ack?: (response: { ok: boolean; error?: string; message?: ChatV2MessageAcceptedPayload }) => void) => void;
  'message:retry': (payload: ChatV2RetryMessagePayload, ack?: (response: { ok: boolean; error?: string }) => void) => void;
  'message:read': (payload: ChatV2ReadReceiptPayload) => void;
  'message:delivered': (payload: ChatV2DeliveredReceiptPayload) => void;
  'typing:start': (payload: ChatV2TypingPayload) => void;
  'typing:stop': (payload: ChatV2TypingPayload) => void;
  'presence:heartbeat': (payload: ChatV2PresenceHeartbeatPayload) => void;
  'upload:init': (payload: ChatV2AttachmentInitPayload, ack?: (response: { ok: boolean; error?: string; upload?: ChatV2UploadUrlPayload }) => void) => void;
  'upload:complete': (payload: ChatV2AttachmentCompletePayload, ack?: (response: { ok: boolean; error?: string }) => void) => void;
  'call:ring': (payload: ChatV2CallSignalPayload) => void;
  'call:accept': (payload: ChatV2CallSignalPayload) => void;
  'call:decline': (payload: ChatV2CallSignalPayload) => void;
  'call:offer': (payload: ChatV2CallSignalPayload) => void;
  'call:answer': (payload: ChatV2CallSignalPayload) => void;
  'call:ice': (payload: ChatV2CallSignalPayload) => void;
  'call:end': (payload: ChatV2CallSignalPayload) => void;
}

export interface ChatV2ServerToClientEvents {
  'chat:snapshot': (payload: ChatV2SnapshotPayload) => void;
  'chat:delta': (payload: ChatV2DeltaPayload) => void;
  'message:accepted': (payload: ChatV2MessageAcceptedPayload) => void;
  'message:new': (payload: ChatV2Message) => void;
  'message:update': (payload: ChatV2MessageUpdatePayload) => void;
  'receipt:update': (payload: ChatV2ReceiptUpdatePayload) => void;
  'typing:update': (payload: ChatV2TypingUpdatePayload) => void;
  'presence:update': (payload: ChatV2PresenceUpdatePayload) => void;
  'upload:url': (payload: ChatV2UploadUrlPayload) => void;
  'call:event': (payload: ChatV2CallEventPayload) => void;
  'error:event': (payload: ChatV2ErrorPayload) => void;
}

export interface ChatV2InterServerEvents {}

export interface ChatV2SocketData {
  authed: boolean;
  uid?: string;
  displayName?: string;
  photoURL?: string | null;
  deviceId?: string;
  appVersion?: string;
  lastKnownServerCursor?: number | null;
}

export const chatV2Rooms = {
  personal: (uid: string) => `user:${uid}`,
  chat: (chatId: string) => `chat:${chatId}`,
  call: (callId: string) => `call:${callId}`,
  presence: 'presence:global',
} as const;

export const chatV2EventNames = {
  client: {
    authConnect: 'auth:connect',
    chatSubscribe: 'chat:subscribe',
    chatUnsubscribe: 'chat:unsubscribe',
    messageSend: 'message:send',
    messageRetry: 'message:retry',
    messageRead: 'message:read',
    messageDelivered: 'message:delivered',
    typingStart: 'typing:start',
    typingStop: 'typing:stop',
    presenceHeartbeat: 'presence:heartbeat',
    uploadInit: 'upload:init',
    uploadComplete: 'upload:complete',
    callRing: 'call:ring',
    callAccept: 'call:accept',
    callDecline: 'call:decline',
    callOffer: 'call:offer',
    callAnswer: 'call:answer',
    callIce: 'call:ice',
    callEnd: 'call:end',
  },
  server: {
    chatSnapshot: 'chat:snapshot',
    chatDelta: 'chat:delta',
    messageAccepted: 'message:accepted',
    messageNew: 'message:new',
    messageUpdate: 'message:update',
    receiptUpdate: 'receipt:update',
    typingUpdate: 'typing:update',
    presenceUpdate: 'presence:update',
    uploadUrl: 'upload:url',
    callEvent: 'call:event',
    errorEvent: 'error:event',
  },
} as const;

export function normalizeServerTimestamp(value: unknown): number {
  if (typeof value === 'number') return value;
  if (value instanceof Date) return value.getTime();
  if (value && typeof value === 'object' && 'toMillis' in value && typeof (value as { toMillis?: () => number }).toMillis === 'function') {
    return (value as { toMillis: () => number }).toMillis();
  }
  return Date.now();
}

// Backwards-compatible aliases for earlier draft names.
export type SocketAuthPayload = ChatV2AuthPayload;
export type SocketChatSubscription = ChatV2SubscribePayload;
export type SocketReceiptPayload = ChatV2ReadReceiptPayload;
export type SocketTypingPayload = ChatV2TypingPayload;
export type SocketUploadInitPayload = ChatV2AttachmentInitPayload;
export type SocketUploadInitResponse = ChatV2UploadUrlPayload;
export type SocketMessagePayload = ChatV2Message;
export type SocketChatSnapshot = ChatV2SnapshotPayload;
export type SocketPresencePayload = ChatV2PresenceUpdatePayload;
export type SocketCallPayload = ChatV2CallSignalPayload;
export type ServerToClientEvents = ChatV2ServerToClientEvents;
export type ClientToServerEvents = ChatV2ClientToServerEvents;
