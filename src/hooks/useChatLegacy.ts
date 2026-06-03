'use client';

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useAuth, UserProfile } from '@/contexts/AuthContext';
import { db } from '@/lib/firebase';
import {
  collection, query, orderBy, onSnapshot, addDoc, doc, getDoc,
  serverTimestamp, where, setDoc, updateDoc, limit, Timestamp, increment, writeBatch,
  getDocs, startAfter, type QueryDocumentSnapshot, arrayUnion,
} from 'firebase/firestore';
import {
  getKeyPair,
  decryptChatKey, encryptMessage, decryptMessage, looksEncrypted,
} from '@/lib/encryption';
import { chatTrace, createChatTraceId, logChatPipelineIssue, withChatTimeout } from '@/lib/chatTrace';

const CHAT_SNAPSHOT_TIMEOUT_MS = 20_000;
const MESSAGE_SNAPSHOT_TIMEOUT_MS = 10_000;
const SEND_STEP_TIMEOUT_MS = 12_000;
// Socket.IO keeps lastSeen fresh for truly-online users; 5-min window catches stale Firestore docs
const PRESENCE_STALE_MS = 5 * 60 * 1000;
const CHAT_ATTACHMENT_MAX_BYTES = 3.5 * 1024 * 1024;

function isPresenceOnline(isOnline: boolean | undefined, lastSeen: number | null | undefined): boolean {
  if (!isOnline) return false;
  if (typeof lastSeen !== 'number' || lastSeen <= 0) return false;
  return Date.now() - lastSeen <= PRESENCE_STALE_MS;
}

export interface SendMessageResult {
  messageId: string;
  clientMessageId: string | null;
}

export interface ChatRoom {
  id: string;
  type: 'private' | 'group' | 'general';
  name: string;
  photoURL: string | null;
  members: string[];
  membersInfo: { uid?: string; displayName: string; photoURL: string | null; isOnline?: boolean; lastSeen?: number | null; status?: string }[];
  lastMessage?: {
    text: string;
    senderId: string;
    senderName: string;
    timestamp: number;
    kind?: string;
  };
  unreadCount: number;
  lastRead: Record<string, number>;
  createdAt: number;
  updatedAt: number;
}

async function uploadChatAttachmentViaApi({
  file,
  chatId,
  user,
  duration,
  traceId,
  clientMessageId,
  onProgress,
}: {
  file: File;
  chatId: string;
  user: NonNullable<ReturnType<typeof useAuth>['user']>;
  duration?: number;
  traceId: string;
  clientMessageId?: string | null;
  onProgress: (progress: number | null) => void;
}): Promise<{ url: string; fileName: string; sizeBytes: number; mimeType: string }> {
  if (file.size > CHAT_ATTACHMENT_MAX_BYTES) {
    throw new Error('הקובץ גדול מדי. עד שיופעל Firebase Storage אפשר להעלות קבצים עד 3.5MB.');
  }

  const token = await user.getIdToken();
  const formData = new FormData();
  formData.set('chatId', chatId);
  formData.set('file', file);
  if (typeof duration === 'number' && Number.isFinite(duration)) {
    formData.set('duration', String(duration));
  }

  onProgress(5);
  chatTrace('send', 'api-upload:start', { traceId, chatId, clientMessageId, file });

  try {
    const response = await withChatTimeout(
      fetch('/api/chat/attachments', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      }),
      35_000,
      'send',
      'api-upload',
      { traceId, chatId, clientMessageId, file }
    );
    const payload = await response.json().catch(() => ({}));

    if (!response.ok || !payload?.attachment?.url) {
      throw new Error(typeof payload?.error === 'string' ? payload.error : 'העלאת הקובץ נכשלה');
    }

    onProgress(100);
    return {
      url: payload.attachment.url,
      fileName: payload.attachment.fileName || file.name,
      sizeBytes: payload.attachment.sizeBytes || file.size,
      mimeType: payload.attachment.mimeType || file.type || 'application/octet-stream',
    };
  } finally {
    onProgress(null);
  }
}

export interface Message {
  id: string;
  clientMessageId?: string | null;
  serverMessageId?: string | null;
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
  replyTo: { messageId: string; text: string; senderName: string } | null;
  readBy: Record<string, number>;
  deliveredTo: Record<string, number>;
  createdAt: number;
  deletedAt?: number | null;
}

export function useChat({ allUsers }: { allUsers: UserProfile[] }) {
  const { user, profile } = useAuth();
  const [chats, setChats] = useState<ChatRoom[]>([]);
  const [activeChat, setActiveChatState] = useState<string | null>(null);
  const [typingUsers, setTypingUsers] = useState<string[]>([]);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const [chatsLoading, setChatsLoading] = useState(true);
  const [messagesLoading, setMessagesLoading] = useState(false);
  const [chatError, setChatError] = useState<string | null>(null);
  const [retryKey, setRetryKey] = useState(0);

  // Pagination state
  const [olderMessages, setOlderMessages] = useState<Message[]>([]);
  const [liveMessages, setLiveMessages] = useState<Message[]>([]);
  const [lastVisible, setLastVisible] = useState<QueryDocumentSnapshot | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);

  // Cache: chatId -> decrypted symmetric key
  const chatKeyCache = useRef<Map<string, string>>(new Map());
  const prevActiveChatRef = useRef<string | null>(null);
  const restoredActiveChatRef = useRef(false);
  const observedClientMessageIdsRef = useRef<Set<string>>(new Set());
  const repairedMissingSummaryRef = useRef<Set<string>>(new Set());
  const lastTypingWriteRef = useRef<{ chatId: string; isTyping: boolean; at: number } | null>(null);
  const justCreatedChatsRef = useRef<Set<string>>(new Set());
  // Ref for getChatKey so the messages effect doesn't re-subscribe on every chats/allUsers change
  const getChatKeyRef = useRef<((chatId: string, encryptedKeys?: Record<string, string>) => Promise<string | null>) | null>(null);

  const displayName = profile?.displayName || user?.displayName || 'משתמש';
  const displayPhoto = profile?.photoURL || user?.photoURL || null;

  const fetchChatApi = useCallback(async <T,>(body: Record<string, unknown>): Promise<T> => {
    if (!user) throw new Error('יש להתחבר כדי להשתמש בצ׳אט');
    const token = await user.getIdToken();
    const response = await fetch('/api/chat/conversations', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
      cache: 'no-store',
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(typeof payload?.error === 'string' ? payload.error : 'פעולת הצ׳אט נכשלה');
    }
    return payload as T;
  }, [user]);

  // Helper: get decrypted chat key (from cache or decrypt from Firestore data)
  const getChatKey = useCallback(async (chatId: string, encryptedKeys?: Record<string, string>): Promise<string | null> => {
    if (!user) return null;
    const cached = chatKeyCache.current.get(chatId);
    if (cached) return cached;

    if (!encryptedKeys?.[user.uid]) return null;

    const myKeyPair = getKeyPair(user.uid);
    if (!myKeyPair) return null;

    const chatData = chats.find(c => c.id === chatId);
    if (!chatData) return null;

    for (const member of chatData.membersInfo) {
      if (!member.uid) continue;
      const memberUser = allUsers.find(u => u.uid === member.uid);
      if (!memberUser?.encryptionPublicKey) continue;
      const decrypted = await decryptChatKey(
        encryptedKeys[user.uid],
        memberUser.encryptionPublicKey,
        myKeyPair.privateKey
      );
      if (decrypted) {
        chatKeyCache.current.set(chatId, decrypted);
        return decrypted;
      }
    }
    return null;
  }, [user, chats, allUsers]);

  getChatKeyRef.current = getChatKey;

  // Save active chat to localStorage
  const setActiveChat = useCallback((chatId: string | null) => {
    chatTrace('selection', 'set-active-chat', { chatId });
    setActiveChatState(chatId);
    if (chatId) {
      localStorage.setItem('tv-chat-active', chatId);
    } else {
      localStorage.removeItem('tv-chat-active');
    }
  }, []);

  // Clear typing indicator on previous chat when switching
  useEffect(() => {
    const prev = prevActiveChatRef.current;
    if (prev && prev !== activeChat && user) {
      setDoc(doc(db, 'chats', prev, 'typing', user.uid), {
        isTyping: false,
        name: displayName,
        timestamp: serverTimestamp(),
      }).catch(() => {});
    }
    prevActiveChatRef.current = activeChat;
  }, [activeChat, user, displayName]);

  // Subscribe to chats
  useEffect(() => {
    if (!user) {
      setChats([]);
      setChatsLoading(false);
      restoredActiveChatRef.current = false;
      return;
    }
    const traceId = createChatTraceId('chats');
    let receivedFirstSnapshot = false;
    let cancelled = false;
    const startedAt = performance.now();
    setChatsLoading(true);
    setChatError(null);
    chatTrace('chats', 'subscribe:start', { traceId, uid: user.uid });
    const q = query(
      collection(db, 'chats'),
      where('members', 'array-contains', user.uid)
    );

    // Helper to parse a Firestore doc snapshot into a ChatRoom
    function parseDocToRoom(docSnap: { id: string; data: () => Record<string, unknown> }): ChatRoom {
      const data = docSnap.data() as Record<string, unknown>;
      const lastMsg = data.lastMessage as Record<string, unknown> | undefined;
      const createdAt = data.createdAt instanceof Timestamp ? data.createdAt.toMillis() : (typeof data.createdAt === 'number' ? data.createdAt : 0);
      const updatedAt = data.updatedAt instanceof Timestamp ? data.updatedAt.toMillis() : (typeof data.updatedAt === 'number' ? data.updatedAt : createdAt);
      return {
        id: docSnap.id,
        type: (data.type as ChatRoom['type']) || 'general',
        name: (data.name as string) || '',
        photoURL: (data.photoURL as string | null) || null,
        members: (data.members as string[]) || [],
        membersInfo: (data.membersInfo as ChatRoom['membersInfo']) || [],
        lastMessage: lastMsg ? {
          text: (lastMsg.text as string) || '',
          senderId: (lastMsg.senderId as string) || '',
          senderName: (lastMsg.senderName as string) || '',
          timestamp: lastMsg.timestamp instanceof Timestamp ? lastMsg.timestamp.toMillis() : ((lastMsg.timestamp as number) || 0),
          kind: (lastMsg.kind as string) || undefined,
        } : undefined,
        unreadCount: (data.unreadCount as Record<string, number>)?.[user!.uid] || 0,
        lastRead: (data.lastRead as Record<string, number>) || {},
        createdAt,
        updatedAt,
      };
    }

    // Fallback: if onSnapshot doesn't fire within 8s (e.g. IndexedDB lock or WS delay),
    // do a one-time getDocs fetch so the user sees data immediately.
    const fallbackId = setTimeout(async () => {
      if (receivedFirstSnapshot || cancelled) return;
      chatTrace('chats', 'fallback:start', { traceId, uid: user.uid });
      try {
        const snap = await getDocs(q);
        if (receivedFirstSnapshot || cancelled) return; // onSnapshot won in the meantime
        const chatList = snap.docs.map(parseDocToRoom);
        chatList.sort((a, b) =>
          (b.lastMessage?.timestamp || b.updatedAt || b.createdAt || 0) -
          (a.lastMessage?.timestamp || a.updatedAt || a.createdAt || 0)
        );
        chatTrace('chats', 'fallback:ok', { traceId, count: chatList.length });
        setChats(chatList);
        setChatsLoading(false);
        // Keep onSnapshot running for live updates
      } catch (err) {
        chatTrace('chats', 'fallback:error', { traceId, err }, { level: 'warn' });
      }
    }, 8_000);

    const timeoutId = setTimeout(() => {
      if (receivedFirstSnapshot || cancelled) return;
      chatTrace('chats', 'subscribe:timeout', {
        traceId,
        uid: user.uid,
        durationMs: Math.round(performance.now() - startedAt),
      }, { level: 'error' });
      setChatError('טעינת השיחות נמשכת יותר מדי זמן. נסו לרענן או לפתוח שוב את הצ׳אט.');
      setChatsLoading(false);
      logChatPipelineIssue('chats', { traceId, step: 'subscribe-timeout', uid: user.uid });
    }, CHAT_SNAPSHOT_TIMEOUT_MS);
    const unsubscribe = onSnapshot(q, (snapshot) => {
      receivedFirstSnapshot = true;
      clearTimeout(fallbackId);
      clearTimeout(timeoutId);
      const chatList = snapshot.docs.map(parseDocToRoom);
      chatList.sort((a, b) =>
        (b.lastMessage?.timestamp || b.updatedAt || b.createdAt || 0) -
        (a.lastMessage?.timestamp || a.updatedAt || a.createdAt || 0)
      );
      chatTrace('chats', 'snapshot', {
        traceId,
        count: chatList.length,
        emptyChats: chatList.filter(chat => !chat.lastMessage).length,
        selfChats: chatList.filter(chat => chat.type === 'private' && chat.members.every(uid => uid === user.uid)).length,
        durationMs: Math.round(performance.now() - startedAt),
      });
      setChats(chatList);
      setChatsLoading(false);
    }, (error) => {
      clearTimeout(fallbackId);
      clearTimeout(timeoutId);
      console.error('[chat] Failed to subscribe to chats:', error);
      chatTrace('chats', 'subscribe:error', { traceId, error }, { level: 'error' });
      setChatError('לא ניתן לטעון את רשימת השיחות כרגע');
      setChatsLoading(false);
    });
    return () => {
      cancelled = true;
      clearTimeout(fallbackId);
      clearTimeout(timeoutId);
      unsubscribe();
    };
  }, [user, retryKey]);

  useEffect(() => {
    if (!user || chatsLoading || chats.length === 0) return;
    const missingSummaries = chats
      .filter((chat) => !chat.lastMessage && !repairedMissingSummaryRef.current.has(chat.id))
      .filter((chat) => !(chat.type === 'private' && chat.members.every((uid) => uid === user.uid)))
      .slice(0, 12);

    if (missingSummaries.length === 0) return;

    missingSummaries.forEach((chat) => {
      repairedMissingSummaryRef.current.add(chat.id);
      const traceId = createChatTraceId('summary-repair');
      chatTrace('chats', 'summary-repair:start', { traceId, chatId: chat.id });

      void (async () => {
        try {
          const latestQuery = query(
            collection(db, 'chats', chat.id, 'messages'),
            orderBy('createdAt', 'desc'),
            limit(1)
          );
          const latest = await withChatTimeout(
            getDocs(latestQuery),
            SEND_STEP_TIMEOUT_MS,
            'chats',
            'summary-repair-read-latest',
            { traceId, chatId: chat.id }
          );
          const latestDoc = latest.docs[0];
          if (!latestDoc) {
            chatTrace('chats', 'summary-repair:no-messages', { traceId, chatId: chat.id });
            return;
          }

          const data = latestDoc.data();
          const createdAt = data.createdAt instanceof Timestamp ? data.createdAt.toMillis() : (data.createdAt || Date.now());
          const type = data.type || 'text';
          const summaryText = type === 'voice'
            ? 'הודעה קולית'
            : type === 'video'
              ? 'הודעת וידאו'
              : type === 'image'
                ? 'תמונה'
                : type === 'file'
                  ? data.fileName || 'קובץ'
                  : data.text || '';
          const lastMessage = {
            text: summaryText,
            senderId: data.senderId || '',
            senderName: data.senderName || '',
            timestamp: createdAt,
            kind: type,
          };

          setChats((current) => current
            .map((item) => item.id === chat.id ? { ...item, lastMessage, updatedAt: Math.max(item.updatedAt || 0, createdAt) } : item)
            .sort((a, b) => (b.lastMessage?.timestamp || b.updatedAt || b.createdAt || 0) - (a.lastMessage?.timestamp || a.updatedAt || a.createdAt || 0))
          );

          await withChatTimeout(
            updateDoc(doc(db, 'chats', chat.id), {
              lastMessage: {
                text: summaryText,
                senderId: data.senderId || '',
                senderName: data.senderName || '',
                timestamp: data.createdAt || createdAt,
                kind: type,
                messageId: latestDoc.id,
                clientMessageId: data.clientMessageId || null,
              },
              updatedAt: data.createdAt || serverTimestamp(),
            }),
            SEND_STEP_TIMEOUT_MS,
            'chats',
            'summary-repair-write',
            { traceId, chatId: chat.id, messageId: latestDoc.id }
          );
          chatTrace('chats', 'summary-repair:ok', { traceId, chatId: chat.id, messageId: latestDoc.id });
        } catch (error) {
          chatTrace('chats', 'summary-repair:failed', { traceId, chatId: chat.id, error }, { level: 'warn' });
        }
      })();
    });
  }, [chats, chatsLoading, user]);

  useEffect(() => {
    if (!user || chatsLoading || restoredActiveChatRef.current) return;
    restoredActiveChatRef.current = true;
    const lastChat = localStorage.getItem('tv-chat-active');
    if (!lastChat) return;
    const restored = chats.find(chat => chat.id === lastChat && chat.members.includes(user.uid));
    if (!restored) {
      chatTrace('selection', 'restore:invalid', { chatId: lastChat, uid: user.uid }, { level: 'warn' });
      localStorage.removeItem('tv-chat-active');
      setActiveChatState(null);
      return;
    }
    const isSelfChat = restored.type === 'private' && restored.members.every(uid => uid === user.uid);
    if (isSelfChat) {
      chatTrace('selection', 'restore:self-chat-skipped', { chatId: lastChat, uid: user.uid }, { level: 'warn' });
      localStorage.removeItem('tv-chat-active');
      setActiveChatState(null);
      return;
    }
    chatTrace('selection', 'restore:ok', { chatId: lastChat, uid: user.uid });
    setActiveChatState(lastChat);
  }, [chats, chatsLoading, user]);

  useEffect(() => {
    if (!user || chatsLoading || !activeChat) return;
    const selected = chats.find(chat => chat.id === activeChat);
    if (selected?.members.includes(user.uid)) {
      justCreatedChatsRef.current.delete(activeChat);
      return;
    }
    // Allow newly created chats a window to appear in the Firestore subscription
    if (justCreatedChatsRef.current.has(activeChat)) return;
    chatTrace('selection', 'active-chat-invalid', { chatId: activeChat, uid: user.uid }, { level: 'warn' });
    localStorage.removeItem('tv-chat-active');
    setActiveChatState(null);
  }, [activeChat, chats, chatsLoading, user]);

  // Subscribe to messages + mark delivery/read + decrypt
  useEffect(() => {
    if (!activeChat || !user) {
      setLiveMessages([]);
      setOlderMessages([]);
      setLastVisible(null);
      setHasMore(false);
      setMessagesLoading(false);
      return;
    }
    setMessagesLoading(true);
    setChatError(null);
    setLiveMessages([]);
    setOlderMessages([]);
    setLastVisible(null);
    setHasMore(false);

    let cancelled = false;
    let receivedFirstSnapshot = false;
    const traceId = createChatTraceId('messages');
    const startedAt = performance.now();
    observedClientMessageIdsRef.current.clear();
    chatTrace('messages', 'subscribe:start', { traceId, chatId: activeChat, uid: user.uid });
    const q = query(
      collection(db, 'chats', activeChat, 'messages'),
      orderBy('createdAt', 'desc'),
      limit(50)
    );
    const timeoutId = setTimeout(() => {
      if (receivedFirstSnapshot || cancelled) return;
      chatTrace('messages', 'subscribe:timeout', {
        traceId,
        chatId: activeChat,
        uid: user.uid,
        durationMs: Math.round(performance.now() - startedAt),
      }, { level: 'error' });
      setChatError('טעינת ההודעות נמשכת יותר מדי זמן. נסו לבחור את השיחה מחדש.');
      setMessagesLoading(false);
      logChatPipelineIssue('messages', { traceId, step: 'subscribe-timeout', chatId: activeChat, uid: user.uid });
    }, MESSAGE_SNAPSHOT_TIMEOUT_MS);
    const unsubscribe = onSnapshot(q, async (snapshot) => {
      receivedFirstSnapshot = true;
      clearTimeout(timeoutId);
      const ascDocs = snapshot.docs.slice().reverse();
      const now = Date.now();
      const oneDayAgo = now - 86400000;

      // Build messages immediately (before any async work) so UI updates fast
      const msgs: Message[] = ascDocs.map(docSnap => {
        const data = docSnap.data();
        const createdAt = data.createdAt instanceof Timestamp ? data.createdAt.toMillis() : (data.createdAt || now);
        if (typeof data.clientMessageId === 'string') {
          observedClientMessageIdsRef.current.add(data.clientMessageId);
        }
        return {
          id: docSnap.id,
          clientMessageId: typeof data.clientMessageId === 'string' ? data.clientMessageId : null,
          serverMessageId: docSnap.id,
          senderId: data.senderId,
          senderName: data.senderName,
          senderPhoto: data.senderPhoto || null,
          text: data.text || '',
          type: data.type || 'text',
          fileURL: data.fileURL || null,
          fileName: data.fileName || null,
          fileSize: data.fileSize || null,
          duration: data.duration || null,
          mimeType: data.mimeType || null,
          replyTo: data.replyTo || null,
          readBy: data.readBy || {},
          deliveredTo: data.deliveredTo || {},
          createdAt,
          deletedAt: data.deletedAt instanceof Timestamp
            ? data.deletedAt.toMillis()
            : (data.deletedAt ?? null),
        };
      });

      // Set messages immediately so they appear without waiting for decryption.
      // Preserve messages that fell out of the limit(50) window.
      if (!cancelled) {
        setLiveMessages(prev => {
          if (prev.length > 0 && msgs.length > 0) {
            const newIds = new Set(msgs.map(m => m.id));
            const evicted = prev.filter(m => !newIds.has(m.id));
            if (evicted.length > 0) {
              setOlderMessages(older => {
                const olderIds = new Set(older.map(m => m.id));
                const toAdd = evicted.filter(m => !olderIds.has(m.id));
                return toAdd.length > 0 ? [...older, ...toAdd] : older;
              });
            }
          }
          return msgs;
        });
        const oldestDoc = snapshot.docs[snapshot.docs.length - 1];
        setLastVisible(oldestDoc ?? null);
        setHasMore(snapshot.docs.length === 50);
        setMessagesLoading(false);
        chatTrace('messages', 'snapshot', {
          traceId,
          chatId: activeChat,
          count: msgs.length,
          durationMs: Math.round(performance.now() - startedAt),
        });
      }

      // Decrypt in background, then update messages again if needed
      const chatDoc = await getDoc(doc(db, 'chats', activeChat)).catch(() => null);
      if (cancelled) return;
      const encryptedKeys = chatDoc?.data()?.encryptedKeys as Record<string, string> | undefined;
      const chatKey = encryptedKeys && getChatKeyRef.current
        ? await getChatKeyRef.current(activeChat, encryptedKeys)
        : null;
      if (cancelled) return;

      if (chatKey) {
        let anyDecrypted = false;
        const decryptPromises: Promise<void>[] = [];
        for (const msg of msgs) {
          if (msg.text && looksEncrypted(msg.text) && msg.type !== 'system') {
            decryptPromises.push(
              decryptMessage(msg.text, chatKey).then(plain => {
                if (plain !== null) { msg.text = plain; anyDecrypted = true; }
                else msg.text = '[הודעה מוצפנת]';
              }).catch(() => { msg.text = '[הודעה מוצפנת]'; anyDecrypted = true; })
            );
          }
        }
        if (decryptPromises.length > 0) {
          await Promise.all(decryptPromises);
          if (!cancelled && anyDecrypted) setLiveMessages([...msgs]);
        }
      }

      if (cancelled) return;

      // Batch-mark delivery for messages we received
      const toDeliver = msgs.filter(m =>
        m.senderId !== user.uid &&
        m.type !== 'system' &&
        !m.deliveredTo[user.uid] &&
        m.createdAt > oneDayAgo
      );
      if (toDeliver.length > 0) {
        const batch = writeBatch(db);
        toDeliver.forEach(m => {
          batch.update(doc(db, 'chats', activeChat, 'messages', m.id), {
            [`deliveredTo.${user.uid}`]: now,
          });
        });
        batch.commit().catch(() => {});
        chatTrace('receipts', 'delivered:queued', { traceId, chatId: activeChat, count: toDeliver.length });
      }

      // Batch-mark readBy for messages we're viewing
      const toRead = msgs.filter(m =>
        m.senderId !== user.uid &&
        m.type !== 'system' &&
        !m.readBy[user.uid] &&
        m.createdAt > oneDayAgo
      );
      if (toRead.length > 0) {
        const readBatch = writeBatch(db);
        toRead.forEach(m => {
          readBatch.update(doc(db, 'chats', activeChat, 'messages', m.id), {
            [`readBy.${user.uid}`]: now,
          });
        });
        readBatch.commit().catch(() => {});
        chatTrace('receipts', 'read:queued', { traceId, chatId: activeChat, count: toRead.length });
      }
    }, (error) => {
      clearTimeout(timeoutId);
      console.error('[chat] Failed to subscribe to messages:', error);
      chatTrace('messages', 'subscribe:error', { traceId, chatId: activeChat, error }, { level: 'error' });
      if (!cancelled) {
        setChatError('לא ניתן לטעון את ההודעות כרגע');
        setMessagesLoading(false);
      }
    });
    return () => { cancelled = true; clearTimeout(timeoutId); unsubscribe(); };
  }, [activeChat, user]);

  // Subscribe to typing indicators
  useEffect(() => {
    if (!activeChat || !user) return;
    const unsubscribe = onSnapshot(
      collection(db, 'chats', activeChat, 'typing'),
      (snapshot) => {
        const names: string[] = [];
        snapshot.forEach(docSnap => {
          if (docSnap.id !== user.uid && docSnap.data().isTyping) {
            names.push(docSnap.data().name || 'מישהו');
          }
        });
        setTypingUsers(names);
      }
    );
    return () => unsubscribe();
  }, [activeChat, user]);

  // Mark active chat as read
  useEffect(() => {
    if (!activeChat || !user) return;
    updateDoc(doc(db, 'chats', activeChat), {
      [`unreadCount.${user.uid}`]: 0,
      [`lastRead.${user.uid}`]: Date.now(),
    }).catch(() => {});
  }, [activeChat, user, liveMessages.length]);

  const sendMessage = useCallback(async (
    text: string,
    type: 'text' | 'image' | 'file' | 'voice' | 'video' = 'text',
    file?: File,
    replyTo?: { messageId: string; text: string; senderName: string } | null,
    duration?: number,
    mimeType?: string,
    clientMessageId?: string | null
  ): Promise<SendMessageResult | null> => {
    const traceId = createChatTraceId('send');
    const startedAt = performance.now();
    if (!user || !activeChat) {
      chatTrace('send', 'blocked:no-active-chat', { traceId, hasUser: Boolean(user), activeChat }, { level: 'warn' });
      return null;
    }
    chatTrace('send', 'start', {
      traceId,
      chatId: activeChat,
      uid: user.uid,
      clientMessageId,
      type,
      hasFile: Boolean(file),
      file,
    });

    let fileURL = null;
    let fileSize = null;
    let uploadedFileName = file?.name || null;

    const cachedChat = chats.find(c => c.id === activeChat);
    const chatDoc = await withChatTimeout(
      getDoc(doc(db, 'chats', activeChat)),
      SEND_STEP_TIMEOUT_MS,
      'send',
      'read-chat',
      { traceId, chatId: activeChat, clientMessageId }
    ).catch((error) => {
      console.error('[chat] Failed to read chat before sending:', error);
      return null;
    });
    const chatData = chatDoc?.data();
    const firestoreMembers = Array.isArray(chatData?.members) ? chatData.members as string[] : [];
    const chatMembers = firestoreMembers.length > 0 ? firestoreMembers : (cachedChat?.members || []);
    const encryptedKeys = chatData?.encryptedKeys as Record<string, string> | undefined;

    if (!chatDoc?.exists()) {
      throw new Error('השיחה לא נמצאה. נסו לפתוח אותה מחדש מרשימת השיחות.');
    }

    if (!chatMembers.includes(user.uid)) {
      throw new Error('אין לך הרשאה לשלוח הודעה בשיחה הזו.');
    }

    if (file && type !== 'text') {
      try {
        const uploaded = await uploadChatAttachmentViaApi({
          file,
          chatId: activeChat,
          user,
          duration,
          traceId,
          clientMessageId,
          onProgress: (progress) => {
            setUploadProgress(progress);
            if (progress !== null) {
              chatTrace('send', 'upload:progress', { traceId, chatId: activeChat, clientMessageId, progress });
            }
          },
        });
        fileURL = uploaded.url;
        fileSize = uploaded.sizeBytes;
        uploadedFileName = uploaded.fileName;
      } catch (err) {
        console.error('Upload error:', err);
        setUploadProgress(null);
        throw err;
      }
    }

    const previewText = type === 'voice' ? 'הודעה קולית'
      : type === 'video' ? 'הודעת וידאו'
      : type === 'text' ? text
      : `קובץ ${uploadedFileName || text || ''}`.trim();

    let messageText = type === 'text' ? text : (type === 'voice' || type === 'video' ? '' : file?.name || text);
    if (encryptedKeys) {
      const chatKey = await getChatKey(activeChat, encryptedKeys);
      if (chatKey && messageText) {
        const encrypted = await encryptMessage(messageText, chatKey);
        if (encrypted) messageText = encrypted;
      }
    }

    const messageData: Record<string, unknown> = {
      senderId: user.uid,
      clientMessageId: clientMessageId || null,
      serverMessageId: null,
      senderName: displayName,
      senderPhoto: displayPhoto,
      text: messageText,
      type,
      fileURL,
      fileName: uploadedFileName,
      fileSize,
      duration: duration || null,
      mimeType: mimeType || null,
      replyTo: replyTo || null,
      readBy: { [user.uid]: Date.now() },
      deliveredTo: {},
      createdAt: serverTimestamp(),
    };

    try {
      const messageRef = await withChatTimeout(
        addDoc(collection(db, 'chats', activeChat, 'messages'), messageData),
        SEND_STEP_TIMEOUT_MS,
        'send',
        'add-message',
        { traceId, chatId: activeChat, clientMessageId, type }
      );
      chatTrace('send', 'message-written', {
        traceId,
        chatId: activeChat,
        clientMessageId,
        messageId: messageRef.id,
        durationMs: Math.round(performance.now() - startedAt),
      });

      const unreadUpdates: Record<string, unknown> = {};
      chatMembers.forEach(uid => {
        if (uid !== user.uid) {
          unreadUpdates[`unreadCount.${uid}`] = increment(1);
        }
      });

      withChatTimeout(
        updateDoc(doc(db, 'chats', activeChat), {
          lastMessage: {
            text: previewText,
            senderName: displayName,
            senderId: user.uid,
            timestamp: serverTimestamp(),
            kind: type,
            clientMessageId: clientMessageId || null,
            messageId: messageRef.id,
          },
          updatedAt: serverTimestamp(),
          ...unreadUpdates,
        }),
        SEND_STEP_TIMEOUT_MS,
        'send',
        'update-summary',
        { traceId, chatId: activeChat, clientMessageId, messageId: messageRef.id }
      ).catch((error) => {
        console.warn('[chat] Message was sent but chat summary update failed:', error);
      });

      withChatTimeout(
        setDoc(doc(db, 'chats', activeChat, 'typing', user.uid), {
          isTyping: false,
          name: displayName,
          timestamp: serverTimestamp(),
        }),
        SEND_STEP_TIMEOUT_MS,
        'send',
        'clear-typing',
        { traceId, chatId: activeChat, clientMessageId }
      ).catch(() => {});

      if (clientMessageId) {
        setTimeout(() => {
          if (observedClientMessageIdsRef.current.has(clientMessageId)) {
            chatTrace('send', 'listener-observed-message', {
              traceId,
              chatId: activeChat,
              clientMessageId,
              messageId: messageRef.id,
            });
            return;
          }
          chatTrace('send', 'sent-but-listener-did-not-observe-message', {
            traceId,
            chatId: activeChat,
            clientMessageId,
            messageId: messageRef.id,
          }, { level: 'warn' });
          logChatPipelineIssue('send', {
            traceId,
            step: 'listener-missing-client-message',
            chatId: activeChat,
            clientMessageId,
            messageId: messageRef.id,
          });
        }, 5_000);
      }

      return {
        messageId: messageRef.id,
        clientMessageId: clientMessageId || null,
      };
    } catch (err) {
      console.error('Send message error:', err);
      chatTrace('send', 'failed', { traceId, chatId: activeChat, clientMessageId, error: err }, { level: 'error' });
      throw err;
    }
  }, [user, activeChat, chats, displayName, displayPhoto, getChatKey]);

  const deleteMessage = useCallback(async (messageId: string) => {
    if (!activeChat || !user) return;
    const allMsgs = [...olderMessages, ...liveMessages];
    const msg = allMsgs.find(m => m.id === messageId);
    if (!msg || msg.senderId !== user.uid) return;
    try {
      await updateDoc(doc(db, 'chats', activeChat, 'messages', messageId), {
        deletedAt: serverTimestamp(),
        text: '',
        fileURL: null,
        fileName: null,
        fileSize: null,
        mimeType: null,
        duration: null,
      });
    } catch (err) {
      console.error('Delete error:', err);
    }
  }, [activeChat, user, olderMessages, liveMessages]);

  const loadMoreMessages = useCallback(async () => {
    if (!activeChat || !lastVisible || loadingMore || !user) return;
    setLoadingMore(true);
    try {
      const q = query(
        collection(db, 'chats', activeChat, 'messages'),
        orderBy('createdAt', 'desc'),
        startAfter(lastVisible),
        limit(50)
      );
      const snap = await getDocs(q);
      if (snap.empty) { setHasMore(false); return; }

      let chatKey: string | null = chatKeyCache.current.get(activeChat) ?? null;
      if (!chatKey) {
        const chatDoc = await getDoc(doc(db, 'chats', activeChat)).catch(() => null);
        const encryptedKeys = chatDoc?.data()?.encryptedKeys as Record<string, string> | undefined;
        if (encryptedKeys && getChatKeyRef.current) chatKey = await getChatKeyRef.current(activeChat, encryptedKeys);
      }

      const now = Date.now();
      const msgs: Message[] = [];
      const decryptPromises: Promise<void>[] = [];

      snap.docs.slice().reverse().forEach(docSnap => {
        const data = docSnap.data();
        const createdAt = data.createdAt instanceof Timestamp ? data.createdAt.toMillis() : (data.createdAt || now);
        const rawText = data.text || '';
        const msg: Message = {
          id: docSnap.id,
          clientMessageId: typeof data.clientMessageId === 'string' ? data.clientMessageId : null,
          serverMessageId: docSnap.id,
          senderId: data.senderId,
          senderName: data.senderName,
          senderPhoto: data.senderPhoto || null,
          text: rawText,
          type: data.type || 'text',
          fileURL: data.fileURL || null,
          fileName: data.fileName || null,
          fileSize: data.fileSize || null,
          duration: data.duration || null,
          mimeType: data.mimeType || null,
          replyTo: data.replyTo || null,
          readBy: data.readBy || {},
          deliveredTo: data.deliveredTo || {},
          createdAt,
          deletedAt: data.deletedAt instanceof Timestamp ? data.deletedAt.toMillis() : (data.deletedAt ?? null),
        };
        msgs.push(msg);
        if (chatKey && rawText && looksEncrypted(rawText) && data.type !== 'system') {
          decryptPromises.push(
            decryptMessage(rawText, chatKey).then(plain => { msg.text = plain ?? '[הודעה מוצפנת]'; })
              .catch(() => { msg.text = '[הודעה מוצפנת]'; })
          );
        }
      });

      if (decryptPromises.length) await Promise.all(decryptPromises);

      setOlderMessages(prev => [...msgs, ...prev]);
      setLastVisible(snap.docs[snap.docs.length - 1]);
      setHasMore(snap.docs.length === 50);
    } catch (err) {
      console.error('Load more messages error:', err);
    } finally {
      setLoadingMore(false);
    }
  }, [activeChat, lastVisible, loadingMore, user]);

  const createPrivateChat = useCallback(async (otherUserId: string): Promise<string | null> => {
    if (!user) return null;

    const existing = chats.find(
      c => c.type === 'private' && c.members.includes(otherUserId) && c.members.includes(user.uid)
    );
    if (existing) {
      chatTrace('create-chat', 'private:existing', { chatId: existing.id, otherUserId, uid: user.uid });
      return existing.id;
    }

    try {
      const traceId = createChatTraceId('create-private');
      chatTrace('create-chat', 'private:start', { traceId, otherUserId, uid: user.uid });
      const result = await fetchChatApi<{ chatId?: string }>({ type: 'private', otherUserId });
      chatTrace('create-chat', 'private:ok', { traceId, chatId: result.chatId, otherUserId });
      if (result.chatId) {
        justCreatedChatsRef.current.add(result.chatId);
        setTimeout(() => justCreatedChatsRef.current.delete(result.chatId!), 15_000);
      }
      return result.chatId || null;
    } catch (err) {
      console.error('Create chat error:', err);
      chatTrace('create-chat', 'private:failed', { otherUserId, error: err }, { level: 'error' });
      return null;
    }
  }, [user, chats, fetchChatApi]);

  const createGroup = useCallback(async (name: string, memberIds: string[]): Promise<string | null> => {
    if (!user) return null;

    try {
      const traceId = createChatTraceId('create-group');
      chatTrace('create-chat', 'group:start', { traceId, memberCount: memberIds.length, uid: user.uid });
      const result = await fetchChatApi<{ chatId?: string }>({ type: 'group', name, memberIds });
      if (result.chatId) {
        chatTrace('create-chat', 'group:ok', { traceId, chatId: result.chatId, memberCount: memberIds.length });
        justCreatedChatsRef.current.add(result.chatId);
        setTimeout(() => justCreatedChatsRef.current.delete(result.chatId!), 15_000);
        return result.chatId;
      }
      throw new Error('Group creation did not return a chat id');
    } catch (apiError) {
      console.error('Create group API error:', apiError);
      chatTrace('create-chat', 'group:failed', { memberCount: memberIds.length, error: apiError }, { level: 'error' });
      return null;
    }
  }, [user, fetchChatApi]);

  const setTyping = useCallback((isTyping: boolean) => {
    if (!activeChat || !user) return;
    const now = Date.now();
    const lastTypingWrite = lastTypingWriteRef.current;
    const debounceMs = isTyping ? 1200 : 5000;
    if (
      lastTypingWrite &&
      lastTypingWrite.chatId === activeChat &&
      lastTypingWrite.isTyping === isTyping &&
      now - lastTypingWrite.at < debounceMs
    ) {
      return;
    }
    lastTypingWriteRef.current = { chatId: activeChat, isTyping, at: now };
    chatTrace('typing', isTyping ? 'start' : 'stop', { chatId: activeChat, uid: user.uid });
    setDoc(doc(db, 'chats', activeChat, 'typing', user.uid), {
      isTyping,
      name: displayName,
      timestamp: serverTimestamp(),
    }).catch(() => {});
  }, [activeChat, user, displayName]);

  const addMembersToGroup = useCallback(async (chatId: string, newMemberIds: string[]) => {
    if (!user) throw new Error('לא מחובר');
    const chat = chats.find(c => c.id === chatId);
    if (!chat) throw new Error('קבוצה לא נמצאה');

    const existingSet = new Set(chat.members);
    const toAdd = newMemberIds.filter(id => !existingSet.has(id));
    if (!toAdd.length) return;

    const newMembersInfo = toAdd.map(uid => {
      const u = allUsers.find(usr => usr.uid === uid);
      return { uid, displayName: u?.displayName || 'משתמש', photoURL: u?.photoURL || null };
    });
    const updatedMembersInfo = [
      ...chat.membersInfo,
      ...newMembersInfo.filter(nm => !chat.membersInfo.some(m => m.uid === nm.uid)),
    ];

    await withChatTimeout(
      updateDoc(doc(db, 'chats', chatId), {
        members: arrayUnion(...toAdd),
        membersInfo: updatedMembersInfo,
        updatedAt: serverTimestamp(),
      }),
      SEND_STEP_TIMEOUT_MS, 'chats', 'add-members', { chatId }
    );

    const addedNames = newMembersInfo.map(m => m.displayName).join(', ');
    await addDoc(collection(db, 'chats', chatId, 'messages'), {
      senderId: 'system', senderName: 'מערכת', senderPhoto: null,
      text: `${displayName} הוסיף/ה את ${addedNames} לקבוצה`,
      type: 'system', fileURL: null, fileName: null, fileSize: null,
      duration: null, mimeType: null, replyTo: null,
      readBy: {}, deliveredTo: {}, createdAt: Date.now(),
    });
  }, [user, chats, allUsers, displayName]);

  const usersByUid = useMemo(() => new Map(allUsers.map(u => [u.uid, u])), [allUsers]);

  const enrichMembersInfo = useCallback((chat: ChatRoom): ChatRoom => {
    if (!usersByUid.size) return chat;
    let changed = false;
    const enriched = chat.membersInfo.map(member => {
      if (!member.uid) return member;
      const current = usersByUid.get(member.uid);
      if (!current) return member;
      const newName = current.displayName || member.displayName;
      const newPhoto = current.photoURL ?? member.photoURL;
      const newLastSeen = current.lastSeen ?? member.lastSeen;
      const newIsOnline = isPresenceOnline(current.isOnline ?? member.isOnline, newLastSeen);
      const newStatus = current.status ?? member.status;
      if (
        newName === member.displayName &&
        newPhoto === member.photoURL &&
        newIsOnline === member.isOnline &&
        newLastSeen === member.lastSeen &&
        newStatus === member.status
      ) return member;
      changed = true;
      return { ...member, displayName: newName, photoURL: newPhoto, isOnline: newIsOnline, lastSeen: newLastSeen, status: newStatus };
    });
    return changed ? { ...chat, membersInfo: enriched } : chat;
  }, [usersByUid]);

  const enrichedChats = useMemo(() => chats.map(enrichMembersInfo), [chats, enrichMembersInfo]);
  const activeChatData = useMemo(() => {
    const chat = enrichedChats.find(c => c.id === activeChat);
    return chat || null;
  }, [enrichedChats, activeChat]);
  const onlineUsers = useMemo(() => (
    allUsers.filter((u) => u.uid !== user?.uid && isPresenceOnline(u.isOnline, u.lastSeen))
  ), [allUsers, user?.uid]);

  const messages = [...olderMessages, ...liveMessages];

  return {
    chats: enrichedChats,
    activeChat,
    activeChatData,
    messages,
    chatsLoading,
    messagesLoading,
    chatError,
    allUsers,
    onlineUsers,
    typingUsers,
    uploadProgress,
    setActiveChat,
    sendMessage,
    deleteMessage,
    loadMoreMessages,
    hasMore,
    loadingMore,
    createPrivateChat,
    createGroup,
    setTyping,
    addMembersToGroup,
    displayName,
    displayPhoto,
    retryChats: useCallback(() => {
      setChatError(null);
      setChatsLoading(true);
      setRetryKey((k) => k + 1);
    }, []),
  };
}
