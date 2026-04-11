'use client';

export { useChat } from './chat-v2/useChat';

export type {
  ChatConnectionState,
  ChatOptimisticPayload,
  ChatRoom,
  ChatRoomLastMessage,
  ChatRoomMemberInfo,
  ChatSocketMode,
  ChatTransportMode,
  ChatSnapshotRecord,
  DeliveryStatus,
  Message,
  MessageReplyReference,
  UploadState,
} from '@/lib/chat-v2/types';
