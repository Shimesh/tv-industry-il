'use client';

import type { Message } from '@/hooks/useChat';
import type { ChatOptimisticPayload, ChatUiMessage } from './chatTypes';

interface BuildOptimisticMessageOptions {
  chatId: string;
  userId: string;
  displayName: string;
  displayPhoto: string | null;
  payload: ChatOptimisticPayload;
}

function normalizeText(value: string): string {
  return value.trim().replace(/\s+/g, ' ').toLowerCase();
}

function isCloseTime(left: number, right: number, windowMs = 4 * 60 * 1000): boolean {
  return Math.abs(left - right) <= windowMs;
}

function getComparableText(message: Pick<Message, 'text' | 'fileName' | 'type'> | ChatUiMessage): string {
  if (message.type === 'text') return message.text || '';
  if (message.fileName) return message.fileName;
  return message.text || '';
}

function isLikelyMatch(serverMessage: ChatUiMessage, optimisticMessage: ChatUiMessage, currentUserId: string): boolean {
  if (serverMessage.senderId !== currentUserId) return false;
  if (serverMessage.type !== optimisticMessage.type) return false;
  if (!isCloseTime(serverMessage.createdAt, optimisticMessage.localCreatedAt ?? optimisticMessage.createdAt)) return false;

  const serverKey = normalizeText(getComparableText(serverMessage));
  const optimisticKey = normalizeText(getComparableText(optimisticMessage));

  if (optimisticMessage.type === 'voice' || optimisticMessage.type === 'video') {
    if (serverMessage.duration && optimisticMessage.duration) {
      return serverMessage.duration === optimisticMessage.duration || Math.abs(serverMessage.duration - optimisticMessage.duration) <= 2;
    }
    return serverKey === optimisticKey;
  }

  if (optimisticMessage.type === 'image' || optimisticMessage.type === 'file') {
    if (serverMessage.fileSize && optimisticMessage.fileSize) {
      const sizeMatch = serverMessage.fileSize === optimisticMessage.fileSize;
      if (!sizeMatch) return false;
    }
    return serverKey === optimisticKey || serverMessage.fileName === optimisticMessage.fileName;
  }

  return serverKey === optimisticKey;
}

export function buildOptimisticMessage({
  chatId,
  userId,
  displayName,
  displayPhoto,
  payload,
}: BuildOptimisticMessageOptions): ChatUiMessage {
  const localCreatedAt = Date.now();
  const optimisticId = `${chatId}:${localCreatedAt}:${Math.random().toString(36).slice(2, 8)}`;
  const fileLabel = payload.fileName || (payload.type === 'text' ? '' : payload.text);

  return {
    id: optimisticId,
    optimisticId,
    senderId: userId,
    senderName: displayName,
    senderPhoto: displayPhoto,
    text: payload.type === 'text' ? payload.text : payload.type === 'voice' || payload.type === 'video' ? '' : payload.text,
    type: payload.type,
    fileURL: null,
    fileName: fileLabel || null,
    fileSize: payload.fileSize ?? null,
    duration: payload.duration ?? null,
    mimeType: payload.mimeType ?? null,
    replyTo: payload.replyTo ?? null,
    readBy: { [userId]: localCreatedAt },
    deliveredTo: {},
    createdAt: localCreatedAt,
    localCreatedAt,
    localState: 'sending',
    localStatusText: '׳ ׳©׳׳— ׳‘׳׳•׳₪׳ ׳׳§׳•׳׳™',
    localPayload: payload,
  };
}

export function mergeMessagesWithOptimistic(
  serverMessages: Message[],
  optimisticMessages: ChatUiMessage[],
  currentUserId: string | null
): ChatUiMessage[] {
  const queued = optimisticMessages.filter((message) => message.localState === 'sending');
  const merged: ChatUiMessage[] = [...serverMessages, ...queued];
  merged.sort((a, b) => {
    const left = a.createdAt ?? a.localCreatedAt ?? 0;
    const right = b.createdAt ?? b.localCreatedAt ?? 0;
    if (left !== right) return left - right;
    return (a.optimisticId || a.id).localeCompare(b.optimisticId || b.id);
  });

  return merged.map((message) => ({
    ...message,
    localState: message.localState,
    localStatusText: message.localStatusText,
  }));
}

export function settleOptimisticMessages(
  optimisticMessages: ChatUiMessage[],
  serverMessages: Message[],
  currentUserId: string | null
): ChatUiMessage[] {
  if (!currentUserId) return optimisticMessages;

  return optimisticMessages.filter((optimisticMessage) => {
    if (optimisticMessage.localState !== 'sending') return true;
    const matched = serverMessages.some((serverMessage) =>
      isLikelyMatch(serverMessage as ChatUiMessage, optimisticMessage, currentUserId)
    );
    return !matched;
  });
}

export function markOptimisticFailed(message: ChatUiMessage, errorText = '׳ ׳›׳©׳ ׳‘׳©׳׳™׳—׳”'): ChatUiMessage {
  return {
    ...message,
    localState: 'failed',
    localStatusText: errorText,
  };
}

export function refreshOptimisticSending(message: ChatUiMessage): ChatUiMessage {
  return {
    ...message,
    localState: 'sending',
    localStatusText: '׳׳׳×׳™׳ ׳׳©׳׳™׳—׳”',
  };
}
