import type { ChatPersistenceState, ChatRoom, ChatSnapshotRecord, Message } from './types';
import { trimMessages } from './messageModel';

const STORAGE_PREFIX = 'tv-industry:chat-v2';
const ACTIVE_CHAT_KEY = `${STORAGE_PREFIX}:active-chat`;
const DRAFTS_KEY = `${STORAGE_PREFIX}:drafts`;
const SNAPSHOT_KEY_PREFIX = `${STORAGE_PREFIX}:snapshot:`;

function canUseStorage(): boolean {
  return typeof window !== 'undefined' && Boolean(window.localStorage);
}

function readJson<T>(key: string): T | null {
  if (!canUseStorage()) return null;
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return null;
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

function writeJson(key: string, value: unknown): void {
  if (!canUseStorage()) return;
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Ignore quota/storage errors.
  }
}

function removeKey(key: string): void {
  if (!canUseStorage()) return;
  try {
    window.localStorage.removeItem(key);
  } catch {
    // Ignore storage errors.
  }
}

export interface ChatSnapshotCacheEntry {
  chatId: string;
  chat: ChatRoom | null;
  messages: Message[];
  cursor: number;
  savedAt: number;
}

export function loadCachedActiveChatId(): string | null {
  if (!canUseStorage()) return null;
  try {
    return window.localStorage.getItem(ACTIVE_CHAT_KEY);
  } catch {
    return null;
  }
}

export function saveCachedActiveChatId(chatId: string | null): void {
  if (!canUseStorage()) return;
  try {
    if (!chatId) {
      window.localStorage.removeItem(ACTIVE_CHAT_KEY);
      return;
    }
    window.localStorage.setItem(ACTIVE_CHAT_KEY, chatId);
  } catch {
    // Ignore storage errors.
  }
}

export function loadCachedDrafts(): Record<string, string> {
  return readJson<Record<string, string>>(DRAFTS_KEY) ?? {};
}

export function loadCachedDraft(chatId: string): string {
  return loadCachedDrafts()[chatId] ?? '';
}

export function saveCachedDraft(chatId: string, draft: string): void {
  const drafts = loadCachedDrafts();
  drafts[chatId] = draft;
  writeJson(DRAFTS_KEY, drafts);
}

export function clearCachedDraft(chatId: string): void {
  const drafts = loadCachedDrafts();
  if (!(chatId in drafts)) return;
  delete drafts[chatId];
  writeJson(DRAFTS_KEY, drafts);
}

export function loadCachedChatSnapshot(chatId: string): ChatSnapshotCacheEntry | null {
  return readJson<ChatSnapshotCacheEntry>(`${SNAPSHOT_KEY_PREFIX}${chatId}`);
}

export function saveCachedChatSnapshot(snapshot: ChatSnapshotCacheEntry): void {
  writeJson(`${SNAPSHOT_KEY_PREFIX}${snapshot.chatId}`, {
    ...snapshot,
    messages: trimMessages(snapshot.messages),
    savedAt: snapshot.savedAt || Date.now(),
  });
}

export function clearCachedChatSnapshot(chatId: string): void {
  removeKey(`${SNAPSHOT_KEY_PREFIX}${chatId}`);
}

export function clearAllChatCache(chatId?: string | null): void {
  if (chatId) {
    clearCachedDraft(chatId);
    clearCachedChatSnapshot(chatId);
  }
}

export function loadChatPersistenceState(activeChatId: string | null = null): ChatPersistenceState {
  return {
    activeChatId: activeChatId ?? loadCachedActiveChatId(),
    snapshot: activeChatId ? loadCachedChatSnapshot(activeChatId) : null,
    drafts: loadCachedDrafts(),
  };
}
