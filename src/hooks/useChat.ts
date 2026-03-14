'use client';

import { useState, useEffect, useCallback } from 'react';
import { useAuth, UserProfile } from '@/contexts/AuthContext';
import { db, storage } from '@/lib/firebase';
import {
  collection, query, orderBy, onSnapshot, addDoc, deleteDoc, doc,
  serverTimestamp, where, setDoc, updateDoc, limit, Timestamp, increment
} from 'firebase/firestore';
import { ref, uploadBytesResumable, getDownloadURL } from 'firebase/storage';

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
  type: 'text' | 'image' | 'file' | 'system';
  fileURL: string | null;
  fileName: string | null;
  fileSize: number | null;
  replyTo: { messageId: string; text: string; senderName: string } | null;
  readBy: Record<string, number>;
  createdAt: number;
}

export function useChat() {
  const { user, profile } = useAuth();
  const [chats, setChats] = useState<ChatRoom[]>([]);
  const [activeChat, setActiveChatState] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [allUsers, setAllUsers] = useState<UserProfile[]>([]);
  const [typingUsers, setTypingUsers] = useState<string[]>([]);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);

  const displayName = profile?.displayName || user?.displayName || 'משתמש';
  const displayPhoto = profile?.photoURL || user?.photoURL || null;

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

  // Fetch all users
  useEffect(() => {
    if (!user) return;
    const unsubscribe = onSnapshot(collection(db, 'users'), (snapshot) => {
      const users: UserProfile[] = [];
      snapshot.forEach(d => {
        users.push({ uid: d.id, ...d.data() } as UserProfile);
      });
      setAllUsers(users);
    });
    return () => unsubscribe();
  }, [user]);

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

  // Subscribe to messages
  useEffect(() => {
    if (!activeChat) {
      setMessages([]);
      return;
    }
    const q = query(
      collection(db, 'chats', activeChat, 'messages'),
      orderBy('createdAt', 'asc'),
      limit(200)
    );
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const msgs: Message[] = [];
      snapshot.forEach(docSnap => {
        const data = docSnap.data();
        msgs.push({
          id: docSnap.id,
          senderId: data.senderId,
          senderName: data.senderName,
          senderPhoto: data.senderPhoto || null,
          text: data.text || '',
          type: data.type || 'text',
          fileURL: data.fileURL || null,
          fileName: data.fileName || null,
          fileSize: data.fileSize || null,
          replyTo: data.replyTo || null,
          readBy: data.readBy || {},
          createdAt: data.createdAt instanceof Timestamp ? data.createdAt.toMillis() : (data.createdAt || Date.now()),
        });
      });
      setMessages(msgs);
    });
    return () => unsubscribe();
  }, [activeChat]);

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
  }, [activeChat, user, messages.length]);

  const sendMessage = useCallback(async (
    text: string,
    type: 'text' | 'image' | 'file' = 'text',
    file?: File,
    replyTo?: { messageId: string; text: string; senderName: string } | null
  ) => {
    if (!user || !activeChat) return;

    let fileURL = null;
    let fileSize = null;

    if (file && (type === 'image' || type === 'file')) {
      try {
        const storageRef = ref(storage, `chat/${activeChat}/${Date.now()}_${file.name}`);
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
        return;
      }
    }

    const messageData: Record<string, unknown> = {
      senderId: user.uid,
      senderName: displayName,
      senderPhoto: displayPhoto,
      text,
      type,
      fileURL,
      fileName: file?.name || null,
      fileSize,
      replyTo: replyTo || null,
      readBy: { [user.uid]: Date.now() },
      createdAt: serverTimestamp(),
    };

    try {
      await addDoc(collection(db, 'chats', activeChat, 'messages'), messageData);

      // Update chat's lastMessage + increment unread for other members
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
          text: type === 'text' ? text : `📎 ${file?.name || 'קובץ'}`,
          senderName: displayName,
          senderId: user.uid,
          timestamp: serverTimestamp(),
        },
        ...unreadUpdates,
      });

      // Clear typing indicator
      await setDoc(doc(db, 'chats', activeChat, 'typing', user.uid), {
        isTyping: false,
        name: displayName,
        timestamp: serverTimestamp(),
      });
    } catch (err) {
      console.error('Send message error:', err);
    }
  }, [user, activeChat, displayName, displayPhoto, chats]);

  const deleteMessage = useCallback(async (messageId: string) => {
    if (!activeChat) return;
    try {
      await deleteDoc(doc(db, 'chats', activeChat, 'messages', messageId));
    } catch (err) {
      console.error('Delete error:', err);
    }
  }, [activeChat]);

  const createPrivateChat = useCallback(async (otherUserId: string): Promise<string | null> => {
    if (!user) return null;

    const existing = chats.find(
      c => c.type === 'private' && c.members.includes(otherUserId) && c.members.includes(user.uid)
    );
    if (existing) return existing.id;

    const otherUser = allUsers.find(u => u.uid === otherUserId);
    if (!otherUser) return null;

    try {
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
        createdAt: serverTimestamp(),
      });
      return chatRef.id;
    } catch (err) {
      console.error('Create chat error:', err);
      return null;
    }
  }, [user, chats, allUsers, displayName, displayPhoto]);

  const createGroup = useCallback(async (name: string, memberIds: string[]): Promise<string | null> => {
    if (!user) return null;

    const allMembers = [user.uid, ...memberIds];
    const membersInfo = allMembers.map(uid => {
      const u = allUsers.find(u => u.uid === uid);
      return { uid, displayName: u?.displayName || '', photoURL: u?.photoURL || null };
    });

    try {
      const chatRef = await addDoc(collection(db, 'chats'), {
        type: 'group',
        name,
        members: allMembers,
        admins: [user.uid],
        membersInfo,
        unreadCount: {},
        lastRead: {},
        createdAt: serverTimestamp(),
      });

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
  }, [user, allUsers, displayName]);

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
    createPrivateChat,
    createGroup,
    setTyping,
    displayName,
    displayPhoto,
  };
}
