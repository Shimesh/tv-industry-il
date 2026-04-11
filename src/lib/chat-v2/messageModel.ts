import type { ChatOptimisticPayload, Message } from './types';

function normalizeText(value: string): string {
  return value.trim().replace(/\s+/g, ' ').toLowerCase();
}

function getComparableText(message: Pick<Message, 'text' | 'fileName' | 'type'>): string {
  if (message.type === 'text' || message.type === 'system') return message.text || '';
  return message.fileName || message.text || '';
}

function getMessageTimestamp(message: Partial<Message>): number {
  return (
    message.createdAtServer ??
    message.createdAtClient ??
    message.localCreatedAt ??
    message.createdAt ??
    0
  );
}

export function getMessageIdentityKey(message: Partial<Message>): string {
  return (
    message.clientMessageId ||
    message.serverMessageId ||
    message.optimisticId ||
    `${message.senderId || 'unknown'}:${getMessageTimestamp(message)}:${normalizeText(getComparableText(message as Pick<Message, 'text' | 'fileName' | 'type'>))}`
  );
}

export function getMessagePreviewText(message: Pick<Message, 'type' | 'text' | 'fileName'>): string {
  if (message.type === 'text') return message.text || '';
  if (message.type === 'voice') return 'הודעת קול';
  if (message.type === 'video') return 'הודעת וידאו';
  if (message.fileName) return message.fileName;
  return message.text || '';
}

export function normalizeMessage(message: Partial<Message> & Pick<Message, 'id'>): Message {
  const createdAt = Number.isFinite(message.createdAt as number)
    ? Number(message.createdAt)
    : getMessageTimestamp(message);

  return {
    id: message.id,
    senderId: message.senderId || '',
    senderName: message.senderName || '',
    senderPhoto: message.senderPhoto ?? null,
    text: message.text || '',
    type: message.type || 'text',
    fileURL: message.fileURL ?? null,
    fileName: message.fileName ?? null,
    fileSize: message.fileSize ?? null,
    duration: message.duration ?? null,
    mimeType: message.mimeType ?? null,
    replyTo: message.replyTo ?? null,
    readBy: message.readBy ?? {},
    deliveredTo: message.deliveredTo ?? {},
    createdAt,
    clientMessageId: message.clientMessageId,
    serverMessageId: message.serverMessageId ?? null,
    serverSequence: message.serverSequence ?? null,
    status: message.status,
    createdAtClient: message.createdAtClient ?? createdAt,
    createdAtServer: message.createdAtServer ?? null,
    editedAt: message.editedAt ?? null,
    deletedAt: message.deletedAt ?? null,
    reactions: message.reactions ?? {},
    forwardedFrom: message.forwardedFrom ?? null,
    upload: message.upload ?? null,
    receiptSummary: message.receiptSummary,
    errorCode: message.errorCode ?? null,
    optimisticId: message.optimisticId,
    localState: message.localState,
    localStatusText: message.localStatusText,
    localCreatedAt: message.localCreatedAt ?? createdAt,
    localPayload: message.localPayload,
    attachments: message.attachments ?? [],
    encrypted: message.encrypted ?? false,
  };
}

export function createOptimisticMessage({
  chatId,
  userId,
  displayName,
  displayPhoto,
  payload,
}: {
  chatId: string;
  userId: string;
  displayName: string;
  displayPhoto: string | null;
  payload: ChatOptimisticPayload;
}): Message {
  const localCreatedAt = Date.now();
  const optimisticId =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : `${chatId}:${localCreatedAt}:${Math.random().toString(36).slice(2, 10)}`;

  const text = payload.type === 'text' ? payload.text : payload.type === 'voice' || payload.type === 'video' ? '' : payload.text;
  const fileLabel = payload.fileName || (payload.type === 'text' ? null : payload.text || null);

  return normalizeMessage({
    id: optimisticId,
    senderId: userId,
    senderName: displayName,
    senderPhoto: displayPhoto,
    text,
    type: payload.type,
    fileURL: null,
    fileName: fileLabel,
    fileSize: payload.fileSize ?? null,
    duration: payload.duration ?? null,
    mimeType: payload.mimeType ?? null,
    replyTo: payload.replyTo ?? null,
    readBy: { [userId]: localCreatedAt },
    deliveredTo: {},
    createdAt: localCreatedAt,
    clientMessageId: optimisticId,
    serverMessageId: null,
    serverSequence: null,
    status: 'queued',
    createdAtClient: localCreatedAt,
    createdAtServer: null,
    editedAt: null,
    deletedAt: null,
    reactions: {},
    forwardedFrom: null,
    upload: payload.type === 'text' ? null : {
      progress: 0,
      state: 'idle',
      storagePath: null,
      url: null,
      uploadId: optimisticId,
      error: null,
    },
    receiptSummary: { deliveredCount: 0, readCount: 0 },
    errorCode: null,
    optimisticId,
    localState: 'sending',
    localStatusText: 'נשלח באופן מקומי',
    localCreatedAt,
    localPayload: payload,
    attachments: [],
    encrypted: false,
  });
}

function scoreMessage(message: Message): number {
  let score = 0;
  if (message.serverMessageId) score += 8;
  if (typeof message.serverSequence === 'number') score += 4;
  if (message.status === 'read' || message.status === 'delivered') score += 2;
  if (message.createdAtServer) score += 2;
  if (message.fileURL) score += 1;
  return score;
}

export function sortMessages(messages: Message[]): Message[] {
  return [...messages].sort((left, right) => {
    const leftStamp = left.createdAtServer ?? left.createdAtClient ?? left.localCreatedAt ?? left.createdAt ?? 0;
    const rightStamp = right.createdAtServer ?? right.createdAtClient ?? right.localCreatedAt ?? right.createdAt ?? 0;
    if (leftStamp !== rightStamp) return leftStamp - rightStamp;

    const leftSequence = left.serverSequence ?? 0;
    const rightSequence = right.serverSequence ?? 0;
    if (leftSequence !== rightSequence) return leftSequence - rightSequence;

    const leftScore = scoreMessage(left);
    const rightScore = scoreMessage(right);
    if (leftScore !== rightScore) return rightScore - leftScore;

    return getMessageIdentityKey(left).localeCompare(getMessageIdentityKey(right));
  });
}

export function mergeMessages(serverMessages: Message[], optimisticMessages: Message[]): Message[] {
  const normalized = [...serverMessages, ...optimisticMessages].map((message) => normalizeMessage(message));
  const merged = new Map<string, Message>();

  for (const message of sortMessages(normalized)) {
    const identityKey = getMessageIdentityKey(message);
    const existing = merged.get(identityKey);
    if (!existing) {
      merged.set(identityKey, message);
      continue;
    }

    const existingScore = scoreMessage(existing);
    const nextScore = scoreMessage(message);
    if (nextScore >= existingScore) {
      merged.set(identityKey, {
        ...existing,
        ...message,
        readBy: { ...existing.readBy, ...message.readBy },
        deliveredTo: { ...existing.deliveredTo, ...message.deliveredTo },
        reactions: { ...(existing.reactions || {}), ...(message.reactions || {}) },
      });
    }
  }

  return sortMessages([...merged.values()]);
}

export function settleOptimisticMessages(
  optimisticMessages: Message[],
  serverMessages: Message[],
  currentUserId: string | null
): Message[] {
  if (!currentUserId) return optimisticMessages;

  return optimisticMessages.filter((optimisticMessage) => {
    if (optimisticMessage.senderId !== currentUserId) return true;
    if (optimisticMessage.localState !== 'sending') return true;

    const optimisticKey = getMessageIdentityKey(optimisticMessage);
    return !serverMessages.some((serverMessage) => {
      const serverKey = getMessageIdentityKey(serverMessage);
      if (serverKey === optimisticKey) return true;

      if (serverMessage.senderId !== currentUserId) return false;
      if (serverMessage.type !== optimisticMessage.type) return false;

      const leftStamp = serverMessage.createdAtServer ?? serverMessage.createdAtClient ?? serverMessage.createdAt ?? 0;
      const rightStamp = optimisticMessage.createdAtClient ?? optimisticMessage.createdAt ?? 0;
      if (Math.abs(leftStamp - rightStamp) > 5 * 60 * 1000) return false;

      const leftText = normalizeText(getComparableText(serverMessage));
      const rightText = normalizeText(getComparableText(optimisticMessage));
      return leftText === rightText;
    });
  });
}

export function trimMessages(messages: Message[], limit = 250): Message[] {
  if (messages.length <= limit) return messages;
  return messages.slice(Math.max(0, messages.length - limit));
}
