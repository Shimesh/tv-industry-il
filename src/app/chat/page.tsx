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

export default function ChatPage() {
  return (
    <AuthGuard>
      <ChatContent />
    </AuthGuard>
  );
}

function ChatContent() {
  const { user } = useAuth();
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
    setActiveChat(chatId);
    setMobileShowChat(true);
  }, [setActiveChat]);

  const handleSelectOnlineUser = useCallback(async (userId: string) => {
    const chatId = await createPrivateChat(userId);
    if (chatId) {
      setActiveChat(chatId);
      setMobileShowChat(true);
    }
  }, [createPrivateChat, setActiveChat]);

  const handleCreatePrivateChat = useCallback(async (userId: string) => {
    const chatId = await createPrivateChat(userId);
    if (chatId) {
      setActiveChat(chatId);
      setMobileShowChat(true);
      setShowNewChat(false);
    }
  }, [createPrivateChat, setActiveChat]);

  const handleCreateGroup = useCallback(async (name: string, memberIds: string[]) => {
    const chatId = await createGroup(name, memberIds);
    if (chatId) {
      setActiveChat(chatId);
      setMobileShowChat(true);
      setShowNewChat(false);
    }
  }, [createGroup, setActiveChat]);

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
            onSendMessage={sendMessage}
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
          currentUserId={user.uid}
          onCreatePrivate={handleCreatePrivateChat}
          onCreateGroup={handleCreateGroup}
          onClose={() => setShowNewChat(false)}
        />
      )}
    </div>
  );
}
