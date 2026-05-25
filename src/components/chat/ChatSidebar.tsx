'use client';

import { useMemo, useState } from 'react';
import { Search, Plus, MessageCircle, AlertTriangle, Loader2 } from 'lucide-react';
import type { ChatRoom } from '@/hooks/useChat';
import type { UserProfile } from '@/contexts/AuthContext';
import OnlineUsers from './OnlineUsers';

interface ChatSidebarProps {
  chats: ChatRoom[];
  activeChatId: string | null;
  currentUserId: string;
  onlineUsers: UserProfile[];
  loading?: boolean;
  error?: string | null;
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
    return other?.displayName || 'שיחה עם עצמי';
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

function toMillis(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const parsed = Date.parse(value);
    return Number.isNaN(parsed) ? null : parsed;
  }
  return null;
}

function formatPresenceLabel(lastSeen: unknown, isOnline: boolean): string {
  if (isOnline) return 'מחובר/ת עכשיו';
  const timestamp = toMillis(lastSeen);
  if (!timestamp) return 'לא מחובר/ת';
  const diff = Date.now() - timestamp;
  if (diff < 60_000) return 'נראה/ת עכשיו';
  if (diff < 3600_000) return `נראה/ת לפני ${Math.floor(diff / 60_000)} דקות`;
  if (diff < 86400_000) return `נראה/ת לפני ${Math.floor(diff / 3600_000)} שעות`;
  return 'לא מחובר/ת';
}

function getLastMessagePreview(chat: ChatRoom): string {
  const message = chat.lastMessage;
  if (!message) return 'אין הודעות עדיין';

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
  loading = false,
  error = null,
  onSelectChat, onNewChat, onSelectOnlineUser,
}: ChatSidebarProps) {
  const [search, setSearch] = useState('');
  const onlineUserIds = useMemo(() => new Set(onlineUsers.map((user) => user.uid)), [onlineUsers]);

  const filteredChats = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return chats;
    return chats.filter((chat) => getChatName(chat, currentUserId).toLowerCase().includes(query));
  }, [chats, currentUserId, search]);

  return (
    <div className="relative flex h-full min-h-0 flex-col border-l" style={{ background: 'var(--theme-bg)', borderColor: 'var(--theme-border)' }}>
      {/* Header */}
      <div className="flex items-center justify-between border-b px-4 py-3" style={{ background: 'var(--theme-bg-secondary)', borderColor: 'var(--theme-border)' }}>
        <h2 className="font-bold text-lg" style={{ color: 'var(--theme-text)' }}>צ׳אטים</h2>
        <button
          onClick={onNewChat}
          className="p-2 rounded-full transition-colors hover:bg-[var(--theme-accent-glow)]"
          title="שיחה חדשה"
        >
          <Plus className="w-5 h-5 text-[var(--theme-text-secondary)]" />
        </button>
      </div>

      {/* Search */}
      <div className="px-3 py-2">
        <div className="relative">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--theme-text-secondary)]" />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="חפש או התחל שיחה חדשה"
            className="w-full rounded-lg border pr-10 pl-3 py-[7px] text-[13px] outline-none transition-colors placeholder:text-[var(--theme-text-secondary)] focus:border-[var(--theme-accent)]"
            style={{ background: 'var(--theme-bg-secondary)', borderColor: 'var(--theme-border)', color: 'var(--theme-text)' }}
          />
        </div>
      </div>

      {/* Online Users */}
      <OnlineUsers users={onlineUsers} onSelectUser={onSelectOnlineUser} />

      {/* Chat List */}
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain pb-20" style={{ scrollbarWidth: 'thin' }}>
        {loading ? (
          <div className="flex items-center justify-center gap-2 p-8 text-[13px] text-[var(--theme-text-secondary)]">
            <Loader2 className="h-4 w-4 animate-spin" />
            <span>טוען שיחות...</span>
          </div>
        ) : error ? (
          <div className="m-3 rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-right">
            <div className="flex items-center gap-2 text-[13px] text-red-200">
              <AlertTriangle className="h-4 w-4 shrink-0" />
              <span>{error}</span>
            </div>
          </div>
        ) : filteredChats.length === 0 ? (
          <div className="p-8 text-center">
            <MessageCircle className="mx-auto mb-3 h-12 w-12 text-[var(--theme-text-secondary)] opacity-40" />
            <p className="text-[13px] text-[var(--theme-text-secondary)]">
              {search ? 'לא נמצאו שיחות' : 'אין שיחות עדיין'}
            </p>
            <p className="mt-1 text-[11px] text-[var(--theme-text-secondary)] opacity-75">
              לחצו על `+` כדי להתחיל שיחה חדשה
            </p>
          </div>
        ) : (
          filteredChats.map(chat => {
            const isActive = chat.id === activeChatId;
            const chatName = getChatName(chat, currentUserId);
            const chatPhoto = getChatPhoto(chat, currentUserId);
            const chatInitial = getChatInitial(chat, currentUserId);
            const unreadCount = chat.unreadCountByUser?.[currentUserId] ?? chat.unreadCount;
            const otherMemberUid = chat.type === 'private'
              ? chat.membersInfo?.find(m => m.uid !== currentUserId)?.uid
              : null;
            const otherMember = chat.type === 'private'
              ? chat.membersInfo?.find(m => m.uid !== currentUserId)
              : null;
            const isOtherOnline = otherMemberUid
              ? onlineUserIds.has(otherMemberUid)
              : false;
            const presenceLabel = otherMember
              ? formatPresenceLabel(otherMember.lastSeen, isOtherOnline)
              : null;

            return (
              <button
                key={chat.id}
                onClick={() => onSelectChat(chat.id)}
                className="w-full flex items-center gap-3 px-3 py-[10px] transition-colors hover:bg-[var(--theme-accent-glow)]"
                style={isActive ? { background: 'var(--theme-accent-glow)' } : undefined}
              >
                {/* Avatar with optional online dot */}
                <div className="relative shrink-0">
                  {chatPhoto ? (
                    <img
                      src={chatPhoto}
                      alt=""
                      className="w-[49px] h-[49px] rounded-full object-cover"
                      onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; (e.currentTarget.nextElementSibling as HTMLElement | null)?.style.setProperty('display', 'flex'); }}
                    />
                  ) : null}
                  <div
                    className="w-[49px] h-[49px] rounded-full items-center justify-center text-white font-bold text-lg"
                    style={{
                      backgroundColor: chat.type === 'group' ? 'var(--theme-accent)' : 'var(--theme-text-secondary)',
                      display: chatPhoto ? 'none' : 'flex',
                    }}
                  >
                    {chatInitial}
                  </div>
                  {chat.type === 'private' && (
                    <span
                      className={`absolute bottom-0.5 right-0.5 h-[12px] w-[12px] rounded-full border-2 border-[var(--theme-bg)] ${
                        isOtherOnline ? 'bg-[var(--theme-success)]' : 'bg-slate-500'
                      }`}
                      title={presenceLabel || undefined}
                    />
                  )}
                </div>

                {/* Info */}
                <div className="min-w-0 flex-1 border-b py-[2px]" style={{ borderColor: 'var(--theme-border)' }}>
                  <div className="flex items-center justify-between">
                    <span className="truncate text-[15px] font-medium text-[var(--theme-text)]">
                      {chatName}
                    </span>
                    {chat.lastMessage && (
                    <span className={`text-[12px] shrink-0 mr-2 ${
                        unreadCount > 0 ? 'text-[var(--theme-accent)]' : 'text-[var(--theme-text-secondary)]'
                      }`}>
                        {formatTime(chat.lastMessage.timestamp)}
                      </span>
                    )}
                  </div>
                  {presenceLabel && (
                    <div className="mt-[2px] flex items-center gap-1 text-[11px]">
                      <span
                        className={`h-1.5 w-1.5 rounded-full ${
                          isOtherOnline ? 'bg-[var(--theme-success)]' : 'bg-slate-500'
                        }`}
                      />
                      <span className={isOtherOnline ? 'text-[var(--theme-success)]' : 'text-[var(--theme-text-secondary)]'}>
                        {presenceLabel}
                      </span>
                    </div>
                  )}
                  <div className="flex items-center justify-between mt-[2px]">
                    <p className="flex-1 truncate text-[13px] text-[var(--theme-text-secondary)]">
                      {chat.lastMessage ? (
                        <>
                          {chat.type !== 'private' && (
                            <span className="text-[var(--theme-text)] opacity-70">{chat.lastMessage.senderName}: </span>
                          )}
                          {getLastMessagePreview(chat)}
                        </>
                      ) : (
                        <span className="italic">אין הודעות עדיין</span>
                      )}
                    </p>
                    {unreadCount > 0 && (
                      <span className="shrink-0 mr-2 min-w-[20px] h-[20px] px-[5px] rounded-full bg-[var(--theme-accent)] text-white text-[11px] font-bold flex items-center justify-center">
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
          className="flex h-[50px] w-[50px] items-center justify-center rounded-full bg-[var(--theme-accent)] text-white shadow-lg transition-colors hover:opacity-90"
        >
          <MessageCircle className="w-6 h-6" />
        </button>
      </div>
    </div>
  );
}
