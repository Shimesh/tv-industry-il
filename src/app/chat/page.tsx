'use client';

import { useState, useEffect, useCallback } from 'react';
import { useAuth, UserProfile } from '@/contexts/AuthContext';
import AuthGuard from '@/components/AuthGuard';
import ChatSidebar, { ChatRoom } from '@/components/chat/ChatSidebar';
import ChatHeader from '@/components/chat/ChatHeader';
import ChatWindow from '@/components/chat/ChatWindow';
import MessageInput from '@/components/chat/MessageInput';
import NewChatModal from '@/components/chat/NewChatModal';
import { Message } from '@/components/chat/MessageBubble';
import { db, storage } from '@/lib/firebase';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import {
  collection, query, orderBy, onSnapshot, addDoc, deleteDoc, doc,
  serverTimestamp, where, getDocs, setDoc, updateDoc, limit, Timestamp
} from 'firebase/firestore';
import { MessageCircle } from 'lucide-react';

export default function ChatPage() {
  return (
    <AuthGuard>
      <ChatContent />
    </AuthGuard>
  );
}

function ChatContent() {
  const { user, profile } = useAuth();
  const [chats, setChats] = useState<ChatRoom[]>([]);
  const [activeChat, setActiveChat] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [typingUsers, setTypingUsers] = useState<string[]>([]);
  const [replyTo, setReplyTo] = useState<Message | null>(null);
  const [showNewChat, setShowNewChat] = useState(false);
  const [allUsers, setAllUsers] = useState<UserProfile[]>([]);
  const [mobileShowChat, setMobileShowChat] = useState(false);

  // Fetch all users for new chat modal
  useEffect(() => {
    if (!user) return;
    const usersRef = collection(db, 'users');
    const unsubscribe = onSnapshot(usersRef, (snapshot) => {
      const users: UserProfile[] = [];
      snapshot.forEach(doc => {
        users.push({ uid: doc.id, ...doc.data() } as UserProfile);
      });
      setAllUsers(users);
    });
    return () => unsubscribe();
  }, [user]);

  // Subscribe to user's chats
  useEffect(() => {
    if (!user) return;

    const chatsRef = collection(db, 'chats');
    const q = query(chatsRef, where('members', 'array-contains', user.uid));

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const chatList: ChatRoom[] = [];
      snapshot.forEach(docSnap => {
        const data = docSnap.data();
        const lastMsg = data.lastMessage;
        chatList.push({
          id: docSnap.id,
          type: data.type || 'general',
          name: data.name || 'צ\'אט',
          photoURL: data.photoURL || null,
          members: data.members || [],
          membersInfo: data.membersInfo || [],
          isOnline: data.isOnline || false,
          lastMessage: lastMsg ? {
            text: lastMsg.text || '',
            senderName: lastMsg.senderName || '',
            timestamp: lastMsg.timestamp instanceof Timestamp ? lastMsg.timestamp.toMillis() : (lastMsg.timestamp || 0),
          } : undefined,
          unreadCount: data.unreadCount?.[user.uid] || 0,
        });
      });

      // Sort: most recent first
      chatList.sort((a, b) => (b.lastMessage?.timestamp || 0) - (a.lastMessage?.timestamp || 0));
      setChats(chatList);

      // Auto-create general chat if doesn't exist
      if (chatList.length === 0) {
        createGeneralChat();
      }
    });

    return () => unsubscribe();
  }, [user]);

  // Subscribe to messages in active chat
  useEffect(() => {
    if (!activeChat) {
      setMessages([]);
      return;
    }

    const messagesRef = collection(db, 'chats', activeChat, 'messages');
    const q = query(messagesRef, orderBy('createdAt', 'asc'), limit(200));

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

    const typingRef = collection(db, 'chats', activeChat, 'typing');
    const unsubscribe = onSnapshot(typingRef, (snapshot) => {
      const names: string[] = [];
      snapshot.forEach(docSnap => {
        if (docSnap.id !== user.uid && docSnap.data().isTyping) {
          names.push(docSnap.data().name || 'מישהו');
        }
      });
      setTypingUsers(names);
    });

    return () => unsubscribe();
  }, [activeChat, user]);

  const createGeneralChat = async () => {
    if (!user) return;
    try {
      const chatsRef = collection(db, 'chats');
      const q = query(chatsRef, where('type', '==', 'general'));
      const snapshot = await getDocs(q);
      if (snapshot.empty) {
        await addDoc(chatsRef, {
          type: 'general',
          name: 'צ\'אט כללי 📺',
          members: [user.uid],
          admins: [user.uid],
          membersInfo: [{ displayName: displayName, photoURL: displayPhoto }],
          createdAt: serverTimestamp(),
        });
      }
    } catch (err) {
      console.error('Error creating general chat:', err);
    }
  };

  const handleSendMessage = async (text: string, type: 'text' | 'image' | 'file' = 'text', file?: File) => {
    if (!user || !activeChat) return;

    let fileURL = null;
    let fileSize = null;

    if (file && (type === 'image' || type === 'file')) {
      try {
        const storageRef = ref(storage, `chat/${activeChat}/${Date.now()}_${file.name}`);
        await uploadBytes(storageRef, file);
        fileURL = await getDownloadURL(storageRef);
        fileSize = file.size;
      } catch (err) {
        console.error('Error uploading file:', err);
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
      replyTo: replyTo ? { messageId: replyTo.id, text: replyTo.text, senderName: replyTo.senderName } : null,
      readBy: { [user.uid]: Date.now() },
      createdAt: serverTimestamp(),
    };

    try {
      await addDoc(collection(db, 'chats', activeChat, 'messages'), messageData);

      // Update last message in chat
      await updateDoc(doc(db, 'chats', activeChat), {
        lastMessage: {
          text: type === 'text' ? text : `📎 ${file?.name || 'קובץ'}`,
          senderName: displayName,
          senderId: user.uid,
          timestamp: serverTimestamp(),
        },
      });

      setReplyTo(null);

      // Clear typing indicator
      await setDoc(doc(db, 'chats', activeChat, 'typing', user.uid), {
        isTyping: false,
        name: displayName,
        timestamp: serverTimestamp(),
      });
    } catch (err) {
      console.error('Error sending message:', err);
    }
  };

  const handleDeleteMessage = async (messageId: string) => {
    if (!activeChat) return;
    try {
      await deleteDoc(doc(db, 'chats', activeChat, 'messages', messageId));
    } catch (err) {
      console.error('Error deleting message:', err);
    }
  };

  const handleSelectChat = (chatId: string) => {
    setActiveChat(chatId);
    setMobileShowChat(true);
    setReplyTo(null);
  };

  const handleCreatePrivateChat = async (otherUserId: string) => {
    if (!user) return;

    // Check if private chat already exists
    const existing = chats.find(
      c => c.type === 'private' && c.members.includes(otherUserId) && c.members.includes(user.uid)
    );

    if (existing) {
      setActiveChat(existing.id);
      setMobileShowChat(true);
      setShowNewChat(false);
      return;
    }

    const otherUser = allUsers.find(u => u.uid === otherUserId);
    if (!otherUser) return;

    try {
      const chatRef = await addDoc(collection(db, 'chats'), {
        type: 'private',
        name: '',
        members: [user.uid, otherUserId],
        membersInfo: [
          { displayName: displayName, photoURL: displayPhoto },
          { displayName: otherUser.displayName, photoURL: otherUser.photoURL },
        ],
        isOnline: otherUser.isOnline,
        createdAt: serverTimestamp(),
      });

      setActiveChat(chatRef.id);
      setMobileShowChat(true);
      setShowNewChat(false);
    } catch (err) {
      console.error('Error creating private chat:', err);
    }
  };

  const handleCreateGroup = async (name: string, memberIds: string[]) => {
    if (!user) return;

    const allMembers = [user.uid, ...memberIds];
    const membersInfo = allMembers.map(uid => {
      const u = allUsers.find(u => u.uid === uid);
      return { displayName: u?.displayName || '', photoURL: u?.photoURL || null };
    });

    try {
      const chatRef = await addDoc(collection(db, 'chats'), {
        type: 'production',
        name,
        members: allMembers,
        admins: [user.uid],
        membersInfo,
        createdAt: serverTimestamp(),
      });

      // Add system message
      await addDoc(collection(db, 'chats', chatRef.id, 'messages'), {
        senderId: 'system',
        senderName: 'מערכת',
        text: `${displayName} יצר/ה את הקבוצה "${name}"`,
        type: 'system',
        createdAt: serverTimestamp(),
      });

      setActiveChat(chatRef.id);
      setMobileShowChat(true);
      setShowNewChat(false);
    } catch (err) {
      console.error('Error creating group:', err);
    }
  };

  const activeChatData = chats.find(c => c.id === activeChat);

  // Use Firebase user data as fallback when Firestore profile is unavailable
  const displayName = profile?.displayName || user?.displayName || 'משתמש';
  const displayPhoto = profile?.photoURL || user?.photoURL || null;

  if (!user) return null;

  return (
    <div className="h-[calc(100vh-4rem)] flex overflow-hidden">
      {/* Sidebar */}
      <div className={`w-full lg:w-80 shrink-0 ${mobileShowChat ? 'hidden lg:block' : 'block'}`}>
        <ChatSidebar
          chats={chats}
          activeChatId={activeChat}
          onSelectChat={handleSelectChat}
          onNewChat={() => setShowNewChat(true)}
          currentUserId={user.uid}
        />
      </div>

      {/* Chat Area */}
      <div className={`flex-1 flex flex-col ${!mobileShowChat ? 'hidden lg:flex' : 'flex'}`}>
        {activeChatData ? (
          <>
            <ChatHeader
              chat={activeChatData}
              currentUserId={user.uid}
              onBack={() => setMobileShowChat(false)}
            />
            <ChatWindow
              messages={messages}
              currentUserId={user.uid}
              typingUsers={typingUsers}
              onReply={setReplyTo}
              onDelete={handleDeleteMessage}
            />
            <MessageInput
              onSend={handleSendMessage}
              replyTo={replyTo}
              onCancelReply={() => setReplyTo(null)}
            />
          </>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center gap-4" style={{ background: 'var(--theme-bg)' }}>
            <div className="w-24 h-24 rounded-full bg-[var(--theme-accent-glow)] flex items-center justify-center">
              <MessageCircle className="w-12 h-12 text-[var(--theme-accent)]" />
            </div>
            <h2 className="text-xl font-bold text-[var(--theme-text)]">TV Industry IL צ&apos;אט</h2>
            <p className="text-sm text-[var(--theme-text-secondary)] text-center max-w-sm">
              בחרו שיחה מהרשימה או צרו שיחה חדשה כדי להתחיל
            </p>
          </div>
        )}
      </div>

      {/* New Chat Modal */}
      {showNewChat && (
        <NewChatModal
          users={allUsers}
          currentUserId={user.uid}
          onCreatePrivate={handleCreatePrivateChat}
          onCreateGroup={handleCreateGroup}
          onClose={() => setShowNewChat(false)}
        />
      )}
    </div>
  );
}
