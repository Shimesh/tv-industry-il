'use client';

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useAuth, UserProfile } from '@/contexts/AuthContext';
import { db, storage } from '@/lib/firebase';
import {
  collection, query, orderBy, onSnapshot, addDoc, doc, getDoc,
  serverTimestamp, where, setDoc, updateDoc, limit, Timestamp, increment, writeBatch,
  getDocs, startAfter, type QueryDocumentSnapshot,
} from 'firebase/firestore';
import { ref, uploadBytesResumable, getDownloadURL } from 'firebase/storage';
import {
  getKeyPair,
  decryptChatKey, encryptMessage, decryptMessage, looksEncrypted,
} from '@/lib/encryption';

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
  membersInfo: { uid?: string; displayName: string; photoURL: string | null }[];
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

  // Pagination state
  const [olderMessages, setOlderMessages] = useState<Message[]>([]);
  const [liveMessages, setLiveMessages] = useState<Message[]>([]);
  const [lastVisible, setLastVisible] = useState<QueryDocumentSnapshot | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);

  // Cache: chatId -> decrypted symmetric key
  const chatKeyCache = useRef<Map<string, string>>(new Map());
  const prevActiveChatRef = useRef<string | null>(null);
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

  // Restore last chat from localStorage
  useEffect(() => {
    const lastChat = localStorage.getItem('tv-chat-active');
    if (lastChat) {
      setActiveChatState(lastChat);
    }
  }, []);

  // Save active chat to localStorage
  const setActiveChat = useCallback((chatId: string | null) => {
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
      return;
    }
    setChatsLoading(true);
    setChatError(null);
    const q = query(
      collection(db, 'chats'),
      where('members', 'array-contains', user.uid)
    );
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const chatList: ChatRoom[] = [];
      snapshot.forEach(docSnap => {
        const data = docSnap.data();
        const lastMsg = data.lastMessage;
        const createdAt = data.createdAt instanceof Timestamp ? data.createdAt.toMillis() : (data.createdAt || 0);
        const updatedAt = data.updatedAt instanceof Timestamp ? data.updatedAt.toMillis() : (data.updatedAt || createdAt);
        chatList.push({
          id: docSnap.id,
          type: data.type || 'general',
          name: data.name || '',
          photoURL: data.photoURL || null,
          members: data.members || [],
          membersInfo: data.membersInfo || [],
          lastMessage: lastMsg ? {
            text: lastMsg.text || '',
            senderId: lastMsg.senderId || '',
            senderName: lastMsg.senderName || '',
            timestamp: lastMsg.timestamp instanceof Timestamp ? lastMsg.timestamp.toMillis() : (lastMsg.timestamp || 0),
            kind: lastMsg.kind || undefined,
          } : undefined,
          unreadCount: data.unreadCount?.[user.uid] || 0,
          lastRead: data.lastRead || {},
          createdAt,
          updatedAt,
        });
      });
      chatList.sort((a, b) =>
        (b.lastMessage?.timestamp || b.updatedAt || b.createdAt || 0) -
        (a.lastMessage?.timestamp || a.updatedAt || a.createdAt || 0)
      );
      setChats(chatList);
      setChatsLoading(false);
    }, (error) => {
      console.error('[chat] Failed to subscribe to chats:', error);
      setChatError('לא ניתן לטעון את רשימת השיחות כרגע');
      setChatsLoading(false);
    });
    return () => unsubscribe();
  }, [user]);

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
    setOlderMessages([]);
    setLastVisible(null);
    setHasMore(false);

    let cancelled = false;
    const q = query(
      collection(db, 'chats', activeChat, 'messages'),
      orderBy('createdAt', 'desc'),
      limit(50)
    );
    const unsubscribe = onSnapshot(q, async (snapshot) => {
      const ascDocs = snapshot.docs.slice().reverse();
      const now = Date.now();
      const oneDayAgo = now - 86400000;

      // Build messages immediately (before any async work) so UI updates fast
      const msgs: Message[] = ascDocs.map(docSnap => {
        const data = docSnap.data();
        const createdAt = data.createdAt instanceof Timestamp ? data.createdAt.toMillis() : (data.createdAt || now);
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
      }
    }, (error) => {
      console.error('[chat] Failed to subscribe to messages:', error);
      if (!cancelled) {
        setChatError('לא ניתן לטעון את ההודעות כרגע');
        setMessagesLoading(false);
      }
    });
    return () => { cancelled = true; unsubscribe(); };
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
    if (!user || !activeChat) return null;

    let fileURL = null;
    let fileSize = null;

    const cachedChat = chats.find(c => c.id === activeChat);
    const chatDoc = await getDoc(doc(db, 'chats', activeChat)).catch((error) => {
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
        let storagePath: string;
        if (type === 'voice') {
          storagePath = `chat/${activeChat}/voice_${Date.now()}.${file.name.split('.').pop() || 'webm'}`;
        } else if (type === 'video') {
          storagePath = `chat/${activeChat}/video_${Date.now()}.${file.name.split('.').pop() || 'webm'}`;
        } else {
          storagePath = `chat/${activeChat}/${Date.now()}_${file.name}`;
        }
        const storageRef = ref(storage, storagePath);
        const uploadTask = uploadBytesResumable(storageRef, file);

        await new Promise<void>((resolve, reject) => {
          uploadTask.on('state_changed',
            (snapshot) => {
              setUploadProgress(Math.round((snapshot.bytesTransferred / snapshot.totalBytes) * 100));
            },
            reject,
            () => { setUploadProgress(null); resolve(); }
          );
        });
        fileURL = await getDownloadURL(storageRef);
        fileSize = file.size;
      } catch (err) {
        console.error('Upload error:', err);
        setUploadProgress(null);
        throw err;
      }
    }

    const previewText = type === 'voice' ? 'הודעה קולית'
      : type === 'video' ? 'הודעת וידאו'
      : type === 'text' ? text
      : `קובץ ${file?.name || text || ''}`.trim();

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
      fileName: file?.name || null,
      fileSize,
      duration: duration || null,
      mimeType: mimeType || null,
      replyTo: replyTo || null,
      readBy: { [user.uid]: Date.now() },
      deliveredTo: {},
      createdAt: serverTimestamp(),
    };

    try {
      const messageRef = await addDoc(collection(db, 'chats', activeChat, 'messages'), messageData);

      const unreadUpdates: Record<string, unknown> = {};
      chatMembers.forEach(uid => {
        if (uid !== user.uid) {
          unreadUpdates[`unreadCount.${uid}`] = increment(1);
        }
      });

      updateDoc(doc(db, 'chats', activeChat), {
        lastMessage: {
          text: previewText,
          senderName: displayName,
          senderId: user.uid,
          timestamp: serverTimestamp(),
          kind: type,
        },
        updatedAt: serverTimestamp(),
        ...unreadUpdates,
      }).catch((error) => {
        console.warn('[chat] Message was sent but chat summary update failed:', error);
      });

      setDoc(doc(db, 'chats', activeChat, 'typing', user.uid), {
        isTyping: false,
        name: displayName,
        timestamp: serverTimestamp(),
      }).catch(() => {});

      return {
        messageId: messageRef.id,
        clientMessageId: clientMessageId || null,
      };
    } catch (err) {
      console.error('Send message error:', err);
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
    if (existing) return existing.id;

    try {
      const result = await fetchChatApi<{ chatId?: string }>({ type: 'private', otherUserId });
      return result.chatId || null;
    } catch (err) {
      console.error('Create chat error:', err);
      return null;
    }
  }, [user, chats, fetchChatApi]);

  const createGroup = useCallback(async (name: string, memberIds: string[]): Promise<string | null> => {
    if (!user) return null;

    try {
      const result = await fetchChatApi<{ chatId?: string }>({ type: 'group', name, memberIds });
      if (result.chatId) return result.chatId;
      throw new Error('Group creation did not return a chat id');
    } catch (apiError) {
      console.error('Create group API error:', apiError);
      return null;
    }
  }, [user, fetchChatApi]);

  const setTyping = useCallback((isTyping: boolean) => {
    if (!activeChat || !user) return;
    setDoc(doc(db, 'chats', activeChat, 'typing', user.uid), {
      isTyping,
      name: displayName,
      timestamp: serverTimestamp(),
    }).catch(() => {});
  }, [activeChat, user, displayName]);

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
      if (newName === member.displayName && newPhoto === member.photoURL) return member;
      changed = true;
      return { ...member, displayName: newName, photoURL: newPhoto };
    });
    return changed ? { ...chat, membersInfo: enriched } : chat;
  }, [usersByUid]);

  const enrichedChats = useMemo(() => chats.map(enrichMembersInfo), [chats, enrichMembersInfo]);
  const activeChatData = useMemo(() => {
    const chat = enrichedChats.find(c => c.id === activeChat);
    return chat || null;
  }, [enrichedChats, activeChat]);
  const onlineUsers = allUsers.filter(u => u.isOnline && u.uid !== user?.uid);

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
    displayName,
    displayPhoto,
  };
}
