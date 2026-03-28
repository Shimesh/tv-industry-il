'use client';

import { useState, useCallback } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import AuthGuard from '@/components/AuthGuard';
import { useChat } from '@/hooks/useChat';
import { useOnlineStatus } from '@/hooks/useOnlineStatus';
import ChatSidebar from '@/components/chat/ChatSidebar';
import ChatWindow from '@/components/chat/ChatWindow';
import NewChatModal from '@/components/chat/NewChatModal';
import { MessageCircle } from 'lucide-react';
import { useContacts } from '@/hooks/useContacts';
import { useToast } from '@/contexts/ToastContext';

export default function ChatPage() {
  return (
    <AuthGuard>
      <ChatContent />
    </AuthGuard>
  );
}

function ChatContent() {
  const { user } = useAuth();
  const { contacts } = useContacts();
  const { showToast } = useToast();
  const {
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
  } = useChat();

  const [showNewChat, setShowNewChat] = useState(false);
  const [mobileShowChat, setMobileShowChat] = useState(false);

  // Track online status
  useOnlineStatus(user?.uid);

  const handleSelectChat = useCallback((chatId: string) => {
    if (!user) { showToast('יש להתחבר כדי לצפות בשיחות', 'error'); return; }
    setActiveChat(chatId);
    setMobileShowChat(true);
  }, [setActiveChat, user, showToast]);

  const handleSelectOnlineUser = useCallback(async (userId: string) => {
    if (!user) { showToast('יש להתחבר כדי להתחיל שיחה', 'error'); return; }
    try {
      const chatId = await createPrivateChat(userId);
      if (chatId) {
        setActiveChat(chatId);
        setMobileShowChat(true);
      }
    } catch {
      showToast('שגיאה ביצירת שיחה', 'error');
    }
  }, [createPrivateChat, setActiveChat, user, showToast]);

  const handleCreatePrivateChat = useCallback(async (userId: string) => {
    if (!user) { showToast('יש להתחבר כדי להתחיל שיחה', 'error'); return; }
    try {
      const chatId = await createPrivateChat(userId);
      if (chatId) {
        setActiveChat(chatId);
        setMobileShowChat(true);
        setShowNewChat(false);
      }
    } catch {
      showToast('שגיאה ביצירת שיחה', 'error');
    }
  }, [createPrivateChat, setActiveChat, user, showToast]);

  const handleCreateGroup = useCallback(async (name: string, memberIds: string[]) => {
    if (!user) { showToast('יש להתחבר כדי ליצור קבוצה', 'error'); return; }
    try {
      const chatId = await createGroup(name, memberIds);
      if (chatId) {
        setActiveChat(chatId);
        setMobileShowChat(true);
        setShowNewChat(false);
      }
    } catch {
      showToast('שגיאה ביצירת קבוצה', 'error');
    }
  }, [createGroup, setActiveChat, user, showToast]);

  const handleSendMessage = useCallback(async (
    text: string,
    type: 'text' | 'image' | 'file' | 'voice' | 'video',
    file?: File,
    replyTo?: { messageId: string; text: string; senderName: string } | null,
    duration?: number,
    mimeType?: string
  ) => {
    if (!user) { showToast('יש להתחבר כדי לשלוח הודעה', 'error'); return; }
    try {
      await sendMessage(text, type, file, replyTo, duration, mimeType);
    } catch {
      showToast('שגיאה בשליחת הודעה', 'error');
    }
  }, [sendMessage, user, showToast]);

  if (!user) return null;

  return (
    <div className="h-[calc(100vh-4rem)] flex overflow-hidden bg-[#111B21]">
      {/* ── Left Panel: Sidebar ── */}
      <div className={`w-full lg:w-[320px] xl:w-[360px] shrink-0 relative ${mobileShowChat ? 'hidden lg:block' : 'block'}`}>
        <ChatSidebar
          chats={chats}
          activeChatId={activeChat}
          currentUserId={user.uid}
          onlineUsers={onlineUsers}
          onSelectChat={handleSelectChat}
          onNewChat={() => setShowNewChat(true)}
          onSelectOnlineUser={handleSelectOnlineUser}
        />
      </div>

      {/* ── Center Panel: Chat Window ── */}
      <div className={`flex-1 flex flex-col min-w-0 ${!mobileShowChat ? 'hidden lg:flex' : 'flex'}`}>
        {activeChatData ? (
          <ChatWindow
            chat={activeChatData}
            messages={messages}
            currentUserId={user.uid}
            typingUsers={typingUsers}
            uploadProgress={uploadProgress}
            onSendMessage={handleSendMessage}
            onDeleteMessage={deleteMessage}
            onSetTyping={setTyping}
            onBack={() => setMobileShowChat(false)}
          />
        ) : (
          /* Empty state - no chat selected */
          <div className="flex-1 flex flex-col items-center justify-center gap-6 bg-[#222E35]">
            <div className="w-[200px] h-[200px] rounded-full bg-[#00A88410] flex items-center justify-center">
              <MessageCircle className="w-24 h-24 text-[#00A884] opacity-50" />
            </div>
            <div className="text-center max-w-sm">
              <h2 className="text-[22px] font-light text-[#E9EDEF] mb-2">
                TV Industry IL צ&apos;אט
              </h2>
              <p className="text-[14px] text-[#8696a0] leading-relaxed">
                שלחו והקבלו הודעות בזמן אמת.
                <br />
                בחרו שיחה מהרשימה או התחילו שיחה חדשה.
              </p>
            </div>
            <div className="flex items-center gap-2 mt-2">
              <span className="w-1.5 h-1.5 rounded-full bg-[#00A884]" />
              <span className="text-[12px] text-[#8696a0]">מוצפן מקצה לקצה</span>
            </div>
          </div>
        )}
      </div>

      {/* ── New Chat Modal ── */}
      {showNewChat && (
        <NewChatModal
          users={allUsers}
          contacts={contacts}
          onlineUsers={onlineUsers}
          currentUserId={user.uid}
          onCreatePrivate={handleCreatePrivateChat}
          onCreateGroup={handleCreateGroup}
          onClose={() => setShowNewChat(false)}
        />
      )}
    </div>
  );
}
