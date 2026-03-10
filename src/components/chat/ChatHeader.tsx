'use client';

import UserAvatar from '@/components/UserAvatar';
import { ChatRoom } from './ChatSidebar';
import { Phone, Video, Search, MoreVertical, ArrowRight, Users, Hash } from 'lucide-react';

interface ChatHeaderProps {
  chat: ChatRoom;
  currentUserId: string;
  onBack?: () => void;
  onVoiceCall?: () => void;
  onVideoCall?: () => void;
}

export default function ChatHeader({ chat, currentUserId, onBack, onVoiceCall, onVideoCall }: ChatHeaderProps) {
  const otherMember = chat.type === 'private' && chat.membersInfo
    ? chat.membersInfo.find((_, i) => chat.members[i] !== currentUserId) || chat.membersInfo[0]
    : null;

  const displayName = chat.type === 'private' && otherMember
    ? otherMember.displayName
    : chat.name;

  const subtitle = chat.type === 'general'
    ? 'צ\'אט כללי • כל המשתמשים'
    : chat.type === 'production'
      ? `קבוצת הפקה • ${chat.members.length} חברים`
      : chat.isOnline
        ? 'מחובר/ת'
        : 'לא מחובר/ת';

  return (
    <div
      className="flex items-center gap-3 px-4 py-3 border-b border-[var(--theme-border)]"
      style={{ background: 'var(--theme-bg-secondary)' }}
    >
      {/* Back button (mobile) */}
      {onBack && (
        <button
          onClick={onBack}
          className="lg:hidden p-1.5 rounded-lg text-[var(--theme-text-secondary)] hover:text-[var(--theme-text)] hover:bg-[var(--theme-accent-glow)] transition-all"
        >
          <ArrowRight className="w-5 h-5" />
        </button>
      )}

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
          {chat.type === 'general' ? (
            <Hash className="w-5 h-5 text-white" />
          ) : (
            <Users className="w-5 h-5 text-white" />
          )}
        </div>
      )}

      {/* Info */}
      <div className="flex-1 min-w-0">
        <h3 className="text-sm font-bold text-[var(--theme-text)] truncate">{displayName}</h3>
        <p className="text-xs text-[var(--theme-text-secondary)]">{subtitle}</p>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-1">
        {chat.type === 'private' && (
          <>
            <button
              onClick={onVoiceCall}
              className="p-2 rounded-lg text-[var(--theme-text-secondary)] hover:text-[var(--theme-accent)] hover:bg-[var(--theme-accent-glow)] transition-all"
              title="שיחה קולית"
            >
              <Phone className="w-5 h-5" />
            </button>
            <button
              onClick={onVideoCall}
              className="p-2 rounded-lg text-[var(--theme-text-secondary)] hover:text-[var(--theme-accent)] hover:bg-[var(--theme-accent-glow)] transition-all"
              title="שיחת וידאו"
            >
              <Video className="w-5 h-5" />
            </button>
          </>
        )}
        <button className="p-2 rounded-lg text-[var(--theme-text-secondary)] hover:text-[var(--theme-text)] hover:bg-[var(--theme-accent-glow)] transition-all">
          <Search className="w-5 h-5" />
        </button>
        <button className="p-2 rounded-lg text-[var(--theme-text-secondary)] hover:text-[var(--theme-text)] hover:bg-[var(--theme-accent-glow)] transition-all">
          <MoreVertical className="w-5 h-5" />
        </button>
      </div>
    </div>
  );
}
