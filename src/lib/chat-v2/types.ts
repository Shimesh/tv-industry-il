import type {
  ChatV2Attachment,
  ChatV2MessageKind,
  ChatV2MessageStatus,
  ChatV2PresenceStatus,
  ChatV2UploadState as ProtocolUploadState,
} from './protocol';

export type DeliveryStatus = ChatV2MessageStatus;
export type ChatTransportMode = 'firestore' | 'hybrid';
export type ChatSocketMode = 'disabled' | 'idle' | 'connecting' | 'connected' | 'reconnecting' | 'degraded' | 'error';

export interface ChatRoomMemberInfo {
  uid?: string;
  displayName: string;
  photoURL: string | null;
}

export interface ChatRoomLastMessage {
  text: string;
  senderId: string;
  senderName: string;
  timestamp: number;
  kind?: ChatV2MessageKind;
}

export interface ChatRoom {
  id: string;
  type: 'private' | 'group' | 'general';
  name: string;
  photoURL: string | null;
  members: string[];
  membersInfo: ChatRoomMemberInfo[];
  admins?: string[];
  encryptedKeys?: Record<string, string> | null;
  lastMessage?: ChatRoomLastMessage | null;
  unreadCount: number;
  unreadCountByUser?: Record<string, number>;
  lastRead: Record<string, number>;
  lastServerSequence?: number | null;
  presenceSummary?: Record<string, { isOnline: boolean; lastSeen?: number; status?: ChatV2PresenceStatus }>;
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

export interface UploadState {
  progress: number | null;
  state: 'idle' | 'uploading' | 'uploaded' | 'failed';
  storagePath?: string | null;
  url?: string | null;
  uploadId?: string | null;
  error?: string | null;
}

export interface MessageReplyReference {
  messageId: string;
  text: string;
  senderName: string;
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

export interface Message {
  id: string;
  senderId: string;
  senderName: string;
  senderPhoto: string | null;
  text: string;
  type: 'text' | 'image' | 'file' | 'voice' | 'video' | 'system';
  fileURL: string | null;
  fileName: string | null;
  fileSize: number | null;
  duration: number | null;
  mimeType: string | null;
  replyTo: MessageReplyReference | null;
  readBy: Record<string, number>;
  deliveredTo: Record<string, number>;
  createdAt: number;
  clientMessageId?: string;
  serverMessageId?: string | null;
  serverSequence?: number | null;
  status?: DeliveryStatus;
  createdAtClient?: number;
  createdAtServer?: number | null;
  editedAt?: number | null;
  deletedAt?: number | null;
  reactions?: Record<string, string[]>;
  forwardedFrom?: {
    chatId: string;
    messageId: string;
    senderId: string;
  } | null;
  upload?: UploadState | null;
  receiptSummary?: {
    deliveredCount: number;
    readCount: number;
  };
  errorCode?: string | null;
  optimisticId?: string;
  localState?: 'sending' | 'failed';
  localStatusText?: string;
  localCreatedAt?: number;
  localPayload?: ChatOptimisticPayload;
  attachments?: ChatV2Attachment[];
  encrypted?: boolean;
}

export type MessageV2 = Message;

export interface ChatConnectionState {
  transport: ChatTransportMode;
  socket: ChatSocketMode;
  lastSyncAt: number | null;
  pendingQueue: number;
  snapshotAgeMs?: number | null;
}

export interface ChatSnapshotRecord {
  chatId: string;
  chat: ChatRoom | null;
  messages: Message[];
  cursor: number;
  savedAt: number;
}

export interface ChatPersistenceState {
  activeChatId: string | null;
  snapshot: ChatSnapshotRecord | null;
  drafts: Record<string, string>;
}

export type ChatUploadState = ProtocolUploadState;
