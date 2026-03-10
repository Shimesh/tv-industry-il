'use client';

import { useRef, useEffect } from 'react';
import MessageBubble, { Message } from './MessageBubble';
import TypingIndicator from './TypingIndicator';
import { MessageCircle } from 'lucide-react';

interface ChatWindowProps {
  messages: Message[];
  currentUserId: string;
  typingUsers: string[];
  onReply: (message: Message) => void;
  onDelete: (messageId: string) => void;
}

export default function ChatWindow({ messages, currentUserId, typingUsers, onReply, onDelete }: ChatWindowProps) {
  const bottomRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, typingUsers]);

  // Group messages by date
  const groupedMessages: { date: string; messages: Message[] }[] = [];
  let currentDate = '';

  messages.forEach(msg => {
    const msgDate = new Date(msg.createdAt).toLocaleDateString('he-IL', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });
    if (msgDate !== currentDate) {
      currentDate = msgDate;
      groupedMessages.push({ date: msgDate, messages: [msg] });
    } else {
      groupedMessages[groupedMessages.length - 1].messages.push(msg);
    }
  });

  if (messages.length === 0) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-4 p-6" style={{ background: 'var(--theme-bg)' }}>
        <div className="w-20 h-20 rounded-full bg-[var(--theme-accent-glow)] flex items-center justify-center">
          <MessageCircle className="w-10 h-10 text-[var(--theme-accent)]" />
        </div>
        <div className="text-center">
          <h3 className="text-lg font-bold text-[var(--theme-text)]">ברוכים הבאים לצ&apos;אט!</h3>
          <p className="text-sm text-[var(--theme-text-secondary)] mt-1">שלחו את ההודעה הראשונה שלכם 💬</p>
        </div>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className="flex-1 overflow-y-auto px-4 py-3"
      style={{ background: 'var(--theme-bg)' }}
    >
      {groupedMessages.map((group) => (
        <div key={group.date}>
          {/* Date Separator */}
          <div className="flex items-center gap-3 my-4">
            <div className="flex-1 h-px bg-[var(--theme-border)]" />
            <span className="px-3 py-1 rounded-full text-xs bg-[var(--theme-bg-secondary)] text-[var(--theme-text-secondary)] border border-[var(--theme-border)]">
              {group.date}
            </span>
            <div className="flex-1 h-px bg-[var(--theme-border)]" />
          </div>

          {/* Messages */}
          {group.messages.map((msg, i) => {
            const isOwn = msg.senderId === currentUserId;
            const prevMsg = i > 0 ? group.messages[i - 1] : null;
            const showAvatar = !prevMsg || prevMsg.senderId !== msg.senderId || (msg.createdAt - prevMsg.createdAt > 60000);

            return (
              <MessageBubble
                key={msg.id}
                message={msg}
                isOwn={isOwn}
                showAvatar={showAvatar}
                onReply={onReply}
                onDelete={isOwn ? onDelete : undefined}
              />
            );
          })}
        </div>
      ))}

      {/* Typing Indicator */}
      <TypingIndicator names={typingUsers} />

      {/* Scroll anchor */}
      <div ref={bottomRef} />
    </div>
  );
}
