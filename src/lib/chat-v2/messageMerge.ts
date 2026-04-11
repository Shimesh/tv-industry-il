import type { Message } from './types';

function messageIdentity(message: Message): string {
  return message.serverMessageId || message.clientMessageId || message.optimisticId || message.id;
}

export function mergeMessages(persisted: Message[], optimistic: Message[]): Message[] {
  const merged = new Map<string, Message>();

  for (const message of persisted) {
    merged.set(messageIdentity(message), message);
  }

  for (const message of optimistic) {
    const key = messageIdentity(message);
    const existing = merged.get(key);
    merged.set(
      key,
      existing
        ? {
            ...existing,
            ...message,
            deliveredTo: message.deliveredTo || existing.deliveredTo,
            readBy: message.readBy || existing.readBy,
          }
        : message
    );
  }

  return [...merged.values()].sort((left, right) => {
    const leftTime = left.createdAtServer || left.createdAt || left.createdAtClient || 0;
    const rightTime = right.createdAtServer || right.createdAt || right.createdAtClient || 0;
    if (leftTime !== rightTime) return leftTime - rightTime;
    return messageIdentity(left).localeCompare(messageIdentity(right));
  });
}
