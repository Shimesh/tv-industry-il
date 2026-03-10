'use client';

import { useState } from 'react';
import { Search, Plus, Users, Hash, User, MessageCircle } from 'lucide-react';
import UserAvatar from '@/components/UserAvatar';

export interface ChatRoom {
  id: string;
  type: 'general' | 'production' | 'private';
  name: string;
  photoURL?: string | null;
  lastMessage?: { text: string; senderName: string; timestamp: number };
  unreadCount?: number;
  members: string[];
  membersInfo?: { displayName: string; photoURL?: string | null }[];
  isOnline?: boolean;
}

interface ChatSidebarProps {
  chats: ChatRoom[];
  activeChatId: string | null;
  onSelectChat: (chatId: string) => void;
  onNewChat: () => void;
  currentUserId: string;
}

export default function ChatSidebar({ chats, activeChatId, onSelectChat, onNewChat, currentUserId }: ChatSidebarProps) {
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<'all' | 'general' | 'production' | 'private'>('all');

  const filteredChats = chats
    .filter(chat => filter === 'all' || chat.type === filter)
    .filter(chat => chat.name.toLowerCase().includes(search.toLowerCase()));

  const getChatIcon = (type: string) => {
    switch (type) {
      case 'general': return <Hash className="w-4 h-4" />;
      case 'production': return <Users className="w-4 h-4" />;
      case 'private': return <User className="w-4 h-4" />;
      default: return <MessageCircle className="w-4 h-4" />;
    }
  };

  const formatTime = (timestamp: number) => {
    if (!timestamp) return '';
    const date = new Date(timestamp);
    const now = new Date();
    const isToday = date.toDateString() === now.toDateString();
    if (isToday) {
      return date.toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' });
    }
    return date.toLocaleDateString('he-IL', { day: 'numeric', month: 'numeric' });
  };

  return (
    <div className="flex flex-col h-full border-l border-[var(--theme-border)]" style={{ background: 'var(--theme-bg-secondary)' }}>
      {/* Header */}
      <div className="p-4 border-b border-[var(--theme-border)]">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-bold text-[var(--theme-text)] flex items-center gap-2">
            <MessageCircle className="w-5 h-5 text-[var(--theme-accent)]" />
            צ&apos;אטים
          </h2>
          <button
            onClick={onNewChat}
            className="p-2 rounded-lg bg-[var(--theme-accent-glow)] text-[var(--theme-accent)] hover:bg-[var(--theme-accent)] hover:text-white transition-all"
            title="שיחה חדשה"
          >
            <Plus className="w-4 h-4" />
          </button>
        </div>

        {/* Search */}
        <div className="relative mb-3">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--theme-text-secondary)]" />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="חיפוש שיחות..."
            className="w-full pr-10 pl-3 py-2 rounded-lg text-sm outline-none transition-colors"
            style={{
              background: 'var(--theme-bg)',
              border: '1px solid var(--theme-border)',
              color: 'var(--theme-text)',
            }}
          />
        </div>

        {/* Filters */}
        <div className="flex gap-1">
          {[
            { key: 'all', label: 'הכל' },
            { key: 'general', label: 'כללי' },
            { key: 'production', label: 'הפקות' },
            { key: 'private', label: 'פרטי' },
          ].map(f => (
            <button
              key={f.key}
              onClick={() => setFilter(f.key as typeof filter)}
              className={`px-3 py-1 rounded-lg text-xs font-medium transition-all ${
                filter === f.key
                  ? 'bg-[var(--theme-accent-glow)] text-[var(--theme-accent)]'
                  : 'text-[var(--theme-text-secondary)] hover:text-[var(--theme-text)]'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {/* Chat List */}
      <div className="flex-1 overflow-y-auto">
        {filteredChats.length === 0 ? (
          <div className="p-6 text-center">
            <MessageCircle className="w-10 h-10 text-[var(--theme-text-secondary)] mx-auto mb-2 opacity-30" />
            <p className="text-sm text-[var(--theme-text-secondary)]">
              {search ? 'לא נמצאו שיחות' : 'אין שיחות עדיין'}
            </p>
          </div>
        ) : (
          filteredChats.map(chat => {
            const isActive = chat.id === activeChatId;
            const otherMember = chat.type === 'private' && chat.membersInfo
              ? chat.membersInfo.find((_, i) => chat.members[i] !== currentUserId) || chat.membersInfo[0]
              : null;

            return (
              <button
                key={chat.id}
                onClick={() => onSelectChat(chat.id)}
                className={`w-full flex items-center gap-3 px-4 py-3 transition-all text-right ${
                  isActive
                    ? 'bg-[var(--theme-accent-glow)]'
                    : 'hover:bg-[var(--theme-bg)]'
                }`}
                style={isActive ? { borderRight: `3px solid var(--theme-accent)` } : {}}
              >
                {/* Avatar */}
                {chat.type === 'private' && otherMember ? (
                  <UserAvatar
                    name={otherMember.displayName}
                    photoURL={otherMember.photoURL}
                    size="md"
                    isOnline={chat.isOnline}
                  />
                ) : (
                  <div className="w-10 h-10 rounded-full flex items-center justify-center shrink-0" style={{
                    background: chat.type === 'general'
                      ? 'linear-gradient(135deg, #a78bfa, #60a5fa)'
                      : 'linear-gradient(135deg, #34d399, #3b82f6)',
                  }}>
                    {getChatIcon(chat.type)}
                    <span className="text-white sr-only">{chat.type}</span>
                  </div>
                )}

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-bold text-[var(--theme-text)] truncate">
                      {chat.type === 'private' && otherMember ? otherMember.displayName : chat.name}
                    </span>
                    {chat.lastMessage && (
                      <span className="text-xs text-[var(--theme-text-secondary)] shrink-0 mr-2">
                        {formatTime(chat.lastMessage.timestamp)}
                      </span>
                    )}
                  </div>
                  {chat.lastMessage && (
                    <div className="flex items-center justify-between mt-0.5">
                      <p className="text-xs text-[var(--theme-text-secondary)] truncate">
                        {chat.type !== 'private' && <span className="font-medium">{chat.lastMessage.senderName}: </span>}
                        {chat.lastMessage.text}
                      </p>
                      {chat.unreadCount && chat.unreadCount > 0 && (
                        <span className="shrink-0 mr-2 w-5 h-5 rounded-full bg-[var(--theme-accent)] text-white text-xs flex items-center justify-center font-bold">
                          {chat.unreadCount > 99 ? '99+' : chat.unreadCount}
                        </span>
                      )}
                    </div>
                  )}
                </div>
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}
