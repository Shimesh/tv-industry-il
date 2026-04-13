'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useAuth, UserProfile } from '@/contexts/AuthContext';
import { db, storage } from '@/lib/firebase';
import {
  collection, query, orderBy, onSnapshot, addDoc, doc, getDoc,
  serverTimestamp, where, setDoc, updateDoc, limit, Timestamp, increment, writeBatch,
  getDocs, startAfter, type QueryDocumentSnapshot,
} from 'firebase/firestore';
import { ref, uploadBytesResumable, getDownloadURL } from 'firebase/storage';
import {
  getKeyPair, generateSymmetricKey, encryptChatKeyForMember,
  decryptChatKey, encryptMessage, decryptMessage, looksEncrypted,
} from '@/lib/encryption';

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
  };
  unreadCount: number;
  lastRead: Record<string, number>;
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

  // Pagination state
  const [olderMessages, setOlderMessages] = useState<Message[]>([]);
  const [liveMessages, setLiveMessages] = useState<Message[]>([]);
  const [lastVisible, setLastVisible] = useState<QueryDocumentSnapshot | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);

  // Cache: chatId → decrypted symmetric key
  const chatKeyCache = useRef<Map<string, string>>(new Map());

  const displayName = profile?.displayName || user?.displayName || 'משתמש';
  const displayPhoto = profile?.photoURL || user?.photoURL || null;

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

  // Subscribe to chats
  useEffect(() => {
    if (!user) return;
    const q = query(
      collection(db, 'chats'),
      where('members', 'array-contains', user.uid)
    );
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const chatList: ChatRoom[] = [];
      snapshot.forEach(docSnap => {
        const data = docSnap.data();
        const lastMsg = data.lastMessage;
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
          } : undefined,
          unreadCount: data.unreadCount?.[user.uid] || 0,
          lastRead: data.lastRead || {},
        });
      });
      chatList.sort((a, b) => (b.lastMessage?.timestamp || 0) - (a.lastMessage?.timestamp || 0));
      setChats(chatList);
    });
    return () => unsubscribe();
  }, [user]);

  // Subscribe to messages + mark delivery + decrypt
  useEffect(() => {
    if (!activeChat || !user) {
      setLiveMessages([]);
      setOlderMessages([]);
      setLastVisible(null);
      setHasMore(false);
      return;
    }
    // Reset older messages when switching chats
    setOlderMessages([]);
    setLastVisible(null);
    setHasMore(false);

    const q = query(
      collection(db, 'chats', activeChat, 'messages'),
      orderBy('createdAt', 'desc'),
      limit(50)
    );
    const unsubscribe = onSnapshot(q, async (snapshot) => {
      // snapshot.docs are in desc order (newest first). Reverse to chronological.
      const ascDocs = snapshot.docs.slice().reverse();
      const now = Date.now();
      const oneDayAgo = now - 86400000;

      const chatDoc = await getDoc(doc(db, 'chats', activeChat)).catch(() => null);
      const encryptedKeys = chatDoc?.data()?.encryptedKeys as Record<string, string> | undefined;
      const chatKey = encryptedKeys ? await getChatKey(activeChat, encryptedKeys) : null;

      const msgs: Message[] = [];
      const decryptPromises: Promise<void>[] = [];

      ascDocs.forEach(docSnap => {
        const data = docSnap.data();
        const createdAt = data.createdAt instanceof Timestamp ? data.createdAt.toMillis() : (data.createdAt || now);
        const rawText = data.text || '';

        const msg: Message = {
          id: docSnap.id,
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
          deletedAt: data.deletedAt instanceof Timestamp
            ? data.deletedAt.toMillis()
            : (data.deletedAt ?? null),
        };
        msgs.push(msg);

        if (chatKey && rawText && looksEncrypted(rawText) && data.type !== 'system') {
          decryptPromises.push(
            decryptMessage(rawText, chatKey).then(plain => {
              if (plain !== null) msg.text = plain;
              else msg.text = '[הודעה מוצפנת]';
            }).catch(() => { msg.text = '[הודעה מוצפנת]'; })
          );
        }
      });

      if (decryptPromises.length > 0) await Promise.all(decryptPromises);

      setLiveMessages(msgs);
      // Oldest doc in snapshot (last in desc order) is the cursor for loading more
      const oldestDoc = snapshot.docs[snapshot.docs.length - 1];
      setLastVisible(oldestDoc ?? null);
      setHasMore(snapshot.docs.length === 50);

      // Batch-mark delivery for messages we received (not our own, not yet delivered, last 24h)
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
    });
    return () => unsubscribe();
  }, [activeChat, user, getChatKey]);

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
    mimeType?: string
  ) => {
    if (!user || !activeChat) return;

    let fileURL = null;
    let fileSize = null;

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

    const previewText = type === 'voice' ? '🎤 הודעה קולית'
      : type === 'video' ? '🎥 הודעת וידאו'
      : type === 'text' ? text
      : `📎 ${file?.name || 'קובץ'}`;

    let messageText = type === 'text' ? text : (type === 'voice' || type === 'video' ? '' : file?.name || text);
    {
      const chatDoc = await getDoc(doc(db, 'chats', activeChat)).catch(() => null);
      const encryptedKeys = chatDoc?.data()?.encryptedKeys as Record<string, string> | undefined;
      if (encryptedKeys) {
        const chatKey = await getChatKey(activeChat, encryptedKeys);
        if (chatKey && messageText) {
          const encrypted = await encryptMessage(messageText, chatKey);
          if (encrypted) messageText = encrypted;
        }
      }
    }

    const messageData: Record<string, unknown> = {
      senderId: user.uid,
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
      await addDoc(collection(db, 'chats', activeChat, 'messages'), messageData);

      const chat = chats.find(c => c.id === activeChat);
      const unreadUpdates: Record<string, unknown> = {};
      if (chat) {
        chat.members.forEach(uid => {
          if (uid !== user.uid) {
            unreadUpdates[`unreadCount.${uid}`] = increment(1);
          }
        });
      }

      await updateDoc(doc(db, 'chats', activeChat), {
        lastMessage: {
          text: previewText,
          senderName: displayName,
          senderId: user.uid,
          timestamp: serverTimestamp(),
        },
        ...unreadUpdates,
      });

      await setDoc(doc(db, 'chats', activeChat, 'typing', user.uid), {
        isTyping: false,
        name: displayName,
        timestamp: serverTimestamp(),
      });
    } catch (err) {
      console.error('Send message error:', err);
      throw err;
    }
  }, [user, activeChat, displayName, displayPhoto, chats, getChatKey]);

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
        if (encryptedKeys) chatKey = await getChatKey(activeChat, encryptedKeys);
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
  }, [activeChat, lastVisible, loadingMore, user, getChatKey]);

  const createPrivateChat = useCallback(async (otherUserId: string): Promise<string | null> => {
    if (!user) return null;

    const existing = chats.find(
      c => c.type === 'private' && c.members.includes(otherUserId) && c.members.includes(user.uid)
    );
    if (existing) return existing.id;

    const otherUser = allUsers.find(u => u.uid === otherUserId);
    if (!otherUser) return null;

    try {
      const chatKey = await generateSymmetricKey();
      const myKeyPair = getKeyPair(user.uid);
      const encryptedKeys: Record<string, string> = {};

      if (chatKey && myKeyPair) {
        const myPub = profile?.encryptionPublicKey;
        if (myPub) {
          const enc = await encryptChatKeyForMember(chatKey, myPub, myKeyPair.privateKey);
          if (enc) encryptedKeys[user.uid] = enc;
        }
        if (otherUser.encryptionPublicKey) {
          const enc = await encryptChatKeyForMember(chatKey, otherUser.encryptionPublicKey, myKeyPair.privateKey);
          if (enc) encryptedKeys[otherUserId] = enc;
        }
      }

      const chatRef = await addDoc(collection(db, 'chats'), {
        type: 'private',
        name: '',
        members: [user.uid, otherUserId],
        membersInfo: [
          { uid: user.uid, displayName, photoURL: displayPhoto },
          { uid: otherUserId, displayName: otherUser.displayName, photoURL: otherUser.photoURL },
        ],
        unreadCount: {},
        lastRead: {},
        encryptedKeys,
        createdAt: serverTimestamp(),
      });

      if (chatKey) chatKeyCache.current.set(chatRef.id, chatKey);

      return chatRef.id;
    } catch (err) {
      console.error('Create chat error:', err);
      return null;
    }
  }, [user, profile, chats, allUsers, displayName, displayPhoto]);

  const createGroup = useCallback(async (name: string, memberIds: string[]): Promise<string | null> => {
    if (!user) return null;

    const allMembers = [user.uid, ...memberIds];
    const membersInfo = allMembers.map(uid => {
      const u = allUsers.find(u => u.uid === uid);
      return { uid, displayName: u?.displayName || '', photoURL: u?.photoURL || null };
    });

    try {
      const chatKey = await generateSymmetricKey();
      const myKeyPair = getKeyPair(user.uid);
      const encryptedKeys: Record<string, string> = {};

      if (chatKey && myKeyPair) {
        for (const uid of allMembers) {
          const memberUser = allUsers.find(u => u.uid === uid);
          const pubKey = uid === user.uid ? profile?.encryptionPublicKey : memberUser?.encryptionPublicKey;
          if (pubKey) {
            const enc = await encryptChatKeyForMember(chatKey, pubKey, myKeyPair.privateKey);
            if (enc) encryptedKeys[uid] = enc;
          }
        }
      }

      const chatRef = await addDoc(collection(db, 'chats'), {
        type: 'group',
        name,
        members: allMembers,
        admins: [user.uid],
        membersInfo,
        unreadCount: {},
        lastRead: {},
        encryptedKeys,
        createdAt: serverTimestamp(),
      });

      if (chatKey) chatKeyCache.current.set(chatRef.id, chatKey);

      await addDoc(collection(db, 'chats', chatRef.id, 'messages'), {
        senderId: 'system',
        senderName: 'מערכת',
        text: `${displayName} יצר/ה את הקבוצה "${name}"`,
        type: 'system',
        createdAt: serverTimestamp(),
      });

      return chatRef.id;
    } catch (err) {
      console.error('Create group error:', err);
      return null;
    }
  }, [user, profile, allUsers, displayName]);

  const setTyping = useCallback((isTyping: boolean) => {
    if (!activeChat || !user) return;
    setDoc(doc(db, 'chats', activeChat, 'typing', user.uid), {
      isTyping,
      name: displayName,
      timestamp: serverTimestamp(),
    }).catch(() => {});
  }, [activeChat, user, displayName]);

  const activeChatData = chats.find(c => c.id === activeChat) || null;
  const onlineUsers = allUsers.filter(u => u.isOnline && u.uid !== user?.uid);

  const messages = [...olderMessages, ...liveMessages];

  return {
    chats,
    activeChat,
    activeChatData,
    messages,
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
