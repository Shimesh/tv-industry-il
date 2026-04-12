'use client';

import { useMemo, useState } from 'react';
import { Search, Plus, MessageCircle } from 'lucide-react';
import type { ChatRoom } from '@/hooks/useChat';
import type { UserProfile } from '@/contexts/AuthContext';
import OnlineUsers from './OnlineUsers';

interface ChatSidebarProps {
  chats: ChatRoom[];
  activeChatId: string | null;
  currentUserId: string;
  onlineUsers: UserProfile[];
  onSelectChat: (chatId: string) => void;
  onNewChat: () => void;
  onSelectOnlineUser: (userId: string) => void;
}

function formatTime(timestamp: number): string {
  if (!timestamp) return '';
  const date = new Date(timestamp);
  const now = new Date();
  const isToday = date.toDateString() === now.toDateString();
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  const isYesterday = date.toDateString() === yesterday.toDateString();

  if (isToday) return date.toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' });
  if (isYesterday) return 'אתמול';
  return date.toLocaleDateString('he-IL', { day: 'numeric', month: 'numeric' });
}

function getChatName(chat: ChatRoom, currentUserId: string): string {
  if (chat.type === 'private') {
    const other = chat.membersInfo?.find(m => m.uid !== currentUserId);
    return other?.displayName || 'צ׳אט';
  }
  return chat.name || 'צ׳אט';
}

function getChatPhoto(chat: ChatRoom, currentUserId: string): string | null {
  if (chat.type === 'private') {
    const other = chat.membersInfo?.find(m => m.uid !== currentUserId);
    return other?.photoURL || null;
  }
  return chat.photoURL;
}

function getChatInitial(chat: ChatRoom, currentUserId: string): string {
  return getChatName(chat, currentUserId).charAt(0);
}

function getLastMessagePreview(chat: ChatRoom): string {
  const message = chat.lastMessage;
  if (!message) return 'שיחה חדשה';

  const text = (message.text || '').trim();
  const type = message.kind;

  if (type === 'image') return text || 'תמונה';
  if (type === 'file') return text || 'קובץ';
  if (type === 'voice') return text || 'הודעה קולית';
  if (type === 'video') return text || 'וידאו';
  return text || 'הודעה חדשה';
}

export default function ChatSidebar({
  chats, activeChatId, currentUserId, onlineUsers,
  onSelectChat, onNewChat, onSelectOnlineUser,
}: ChatSidebarProps) {
  const [search, setSearch] = useState('');

  const filteredChats = useMemo(() => {
    if (!search) return chats;
    const query = search.toLowerCase();
    return chats.filter((chat) => getChatName(chat, currentUserId).toLowerCase().includes(query));
  }, [chats, currentUserId, search]);

  return (
    <div className="flex flex-col h-full bg-[#111B21] border-l border-[#2A3942]">
      {/* Header */}
      <div className="px-4 py-3 bg-[#202C33] flex items-center justify-between">
        <h2 className="text-[#E9EDEF] font-bold text-lg">צ׳אטים</h2>
        <button
          onClick={onNewChat}
          className="p-2 rounded-full hover:bg-[#2A3942] transition-colors"
          title="שיחה חדשה"
        >
          <Plus className="w-5 h-5 text-[#AEBAC1]" />
        </button>
      </div>

      {/* Search */}
      <div className="px-3 py-2">
        <div className="relative">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#8696a0]" />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="חפש או התחל שיחה חדשה"
            className="w-full pr-10 pl-3 py-[7px] rounded-lg text-[13px] outline-none bg-[#202C33] text-[#E9EDEF] placeholder:text-[#8696a0] border border-transparent focus:border-[#00A884] transition-colors"
          />
        </div>
      </div>

      {/* Online Users */}
      <OnlineUsers users={onlineUsers} onSelectUser={onSelectOnlineUser} onNewChat={onNewChat} />

      {/* Chat List */}
      <div className="flex-1 overflow-y-auto pb-20">
        {filteredChats.length === 0 ? (
          <div className="p-8 text-center flex flex-col items-center gap-3">
            <div className="w-16 h-16 rounded-full bg-[#00A884]/10 flex items-center justify-center">
              <MessageCircle className="w-8 h-8 text-[#00A884]" />
            </div>
            <div>
              <p className="text-[13px] text-[#8696a0]">
                {search ? 'לא נמצאו שיחות' : 'אין שיחות עדיין'}
              </p>
              {!search && (
                <p className="text-[11px] text-[#667781] mt-1">
                  שלחו הודעה לכל משתמש — לא צריך ליצור צוות!
                </p>
              )}
            </div>
            {!search && (
              <button
                onClick={onNewChat}
                className="mt-1 px-4 py-2 rounded-lg bg-[#00A884] text-white text-sm font-medium hover:bg-[#06CF9C] transition-colors"
              >
                התחל שיחה
              </button>
            )}
          </div>
        ) : (
          filteredChats.map(chat => {
            const isActive = chat.id === activeChatId;
            const chatName = getChatName(chat, currentUserId);
            const chatPhoto = getChatPhoto(chat, currentUserId);
            const chatInitial = getChatInitial(chat, currentUserId);
            const unreadCount = chat.unreadCountByUser?.[currentUserId] ?? chat.unreadCount;

            return (
              <button
                key={chat.id}
                onClick={() => onSelectChat(chat.id)}
                className={`w-full flex items-center gap-3 px-3 py-[10px] transition-colors ${
                  isActive ? 'bg-[#2A3942]' : 'hover:bg-[#202C33]'
                }`}
              >
                {/* Avatar */}
                {chatPhoto ? (
                  <img src={chatPhoto} alt="" className="w-[49px] h-[49px] rounded-full object-cover shrink-0" />
                ) : (
                  <div
                    className="w-[49px] h-[49px] rounded-full flex items-center justify-center shrink-0 text-white font-bold text-lg"
                    style={{
                      backgroundColor: chat.type === 'group' ? '#00A884' : '#6B7C85',
                    }}
                  >
                    {chatInitial}
                  </div>
                )}

                {/* Info */}
                <div className="flex-1 min-w-0 border-b border-[#2A3942] py-[2px]">
                  <div className="flex items-center justify-between">
                    <span className="text-[15px] font-medium text-[#E9EDEF] truncate">
                      {chatName}
                    </span>
                    {chat.lastMessage && (
                    <span className={`text-[12px] shrink-0 mr-2 ${
                        unreadCount > 0 ? 'text-[#00A884]' : 'text-[#8696a0]'
                      }`}>
                        {formatTime(chat.lastMessage.timestamp)}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center justify-between mt-[2px]">
                    <p className="text-[13px] text-[#8696a0] truncate flex-1">
                      {chat.lastMessage ? (
                        <>
                          {chat.type !== 'private' && (
                            <span className="text-[#E9EDEF99]">{chat.lastMessage.senderName}: </span>
                          )}
                          {getLastMessagePreview(chat)}
                        </>
                      ) : (
                        <span className="italic">שיחה חדשה</span>
                      )}
                    </p>
                    {unreadCount > 0 && (
                      <span className="shrink-0 mr-2 min-w-[20px] h-[20px] px-[5px] rounded-full bg-[#00A884] text-white text-[11px] font-bold flex items-center justify-center">
                        {unreadCount > 99 ? '99+' : unreadCount}
                      </span>
                    )}
                  </div>
                </div>
              </button>
            );
          })
        )}
      </div>

      {/* FAB - New Chat */}
      <div className="absolute bottom-6 left-6">
        <button
          onClick={onNewChat}
          className="w-[50px] h-[50px] rounded-full bg-[#00A884] text-white shadow-lg hover:bg-[#06CF9C] transition-colors flex items-center justify-center"
        >
          <MessageCircle className="w-6 h-6" />
        </button>
      </div>
    </div>
  );
}
