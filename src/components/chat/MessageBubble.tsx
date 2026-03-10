'use client';

import { useState } from 'react';
import UserAvatar from '@/components/UserAvatar';
import { Check, CheckCheck, Copy, Reply, Trash2, Download, Play, Pause, File } from 'lucide-react';

export interface Message {
  id: string;
  senderId: string;
  senderName: string;
  senderPhoto?: string | null;
  text: string;
  type: 'text' | 'image' | 'file' | 'audio' | 'system';
  fileURL?: string | null;
  fileName?: string | null;
  fileSize?: number | null;
  replyTo?: { messageId: string; text: string; senderName: string } | null;
  readBy?: Record<string, number>;
  createdAt: number;
}

interface MessageBubbleProps {
  message: Message;
  isOwn: boolean;
  showAvatar?: boolean;
  onReply?: (message: Message) => void;
  onDelete?: (messageId: string) => void;
}

export default function MessageBubble({ message, isOwn, showAvatar = true, onReply, onDelete }: MessageBubbleProps) {
  const [showMenu, setShowMenu] = useState(false);
  const [audioPlaying, setAudioPlaying] = useState(false);

  const formatTime = (timestamp: number) => {
    return new Date(timestamp).toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' });
  };

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const getReadStatus = () => {
    if (!message.readBy) return 'sent';
    const readCount = Object.keys(message.readBy).length;
    if (readCount > 1) return 'read';
    return 'delivered';
  };

  // System messages
  if (message.type === 'system') {
    return (
      <div className="flex justify-center my-2">
        <span className="px-3 py-1 rounded-full text-xs bg-[var(--theme-bg-secondary)] text-[var(--theme-text-secondary)]">
          {message.text}
        </span>
      </div>
    );
  }

  const readStatus = getReadStatus();

  return (
    <div
      className={`flex gap-2 mb-1 group ${isOwn ? 'flex-row-reverse' : 'flex-row'}`}
      onMouseLeave={() => setShowMenu(false)}
    >
      {/* Avatar */}
      {!isOwn && showAvatar ? (
        <UserAvatar name={message.senderName} photoURL={message.senderPhoto} size="sm" />
      ) : !isOwn ? (
        <div className="w-8" />
      ) : null}

      {/* Bubble */}
      <div className={`relative max-w-[75%] ${isOwn ? 'chat-bubble-sent' : 'chat-bubble-received'}`}>
        {/* Context Menu Trigger */}
        <div
          className="relative"
          onContextMenu={e => { e.preventDefault(); setShowMenu(true); }}
        >
          <div
            className={`rounded-2xl px-3.5 py-2 ${
              isOwn
                ? 'rounded-tl-md'
                : 'rounded-tr-md'
            }`}
            style={{
              background: isOwn
                ? 'linear-gradient(135deg, rgba(139, 92, 246, 0.3), rgba(59, 130, 246, 0.3))'
                : 'var(--theme-bg-card)',
              border: `1px solid ${isOwn ? 'rgba(139, 92, 246, 0.2)' : 'var(--theme-border)'}`,
            }}
          >
            {/* Sender name (in groups) */}
            {!isOwn && showAvatar && (
              <p className="text-xs font-bold text-[var(--theme-accent)] mb-0.5">{message.senderName}</p>
            )}

            {/* Reply reference */}
            {message.replyTo && (
              <div className="mb-1.5 pr-2 border-r-2 border-[var(--theme-accent)] rounded-sm bg-[var(--theme-bg)] px-2 py-1">
                <p className="text-xs font-bold text-[var(--theme-accent)]">{message.replyTo.senderName}</p>
                <p className="text-xs text-[var(--theme-text-secondary)] truncate">{message.replyTo.text}</p>
              </div>
            )}

            {/* Content */}
            {message.type === 'text' && (
              <p className="text-sm text-[var(--theme-text)] whitespace-pre-wrap break-words leading-relaxed">
                {message.text}
              </p>
            )}

            {message.type === 'image' && message.fileURL && (
              <div className="mb-1">
                <img
                  src={message.fileURL}
                  alt="תמונה"
                  className="rounded-lg max-w-full max-h-60 object-cover cursor-pointer"
                />
                {message.text && (
                  <p className="text-sm text-[var(--theme-text)] mt-1">{message.text}</p>
                )}
              </div>
            )}

            {message.type === 'file' && (
              <a
                href={message.fileURL || '#'}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-3 p-2 rounded-lg bg-[var(--theme-bg)] hover:bg-[var(--theme-bg-secondary)] transition-colors"
              >
                <div className="w-10 h-10 rounded-lg bg-[var(--theme-accent-glow)] flex items-center justify-center">
                  <File className="w-5 h-5 text-[var(--theme-accent)]" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-[var(--theme-text)] truncate">{message.fileName}</p>
                  {message.fileSize && (
                    <p className="text-xs text-[var(--theme-text-secondary)]">{formatFileSize(message.fileSize)}</p>
                  )}
                </div>
                <Download className="w-4 h-4 text-[var(--theme-text-secondary)]" />
              </a>
            )}

            {message.type === 'audio' && (
              <div className="flex items-center gap-3 min-w-[200px]">
                <button
                  onClick={() => setAudioPlaying(!audioPlaying)}
                  className="w-8 h-8 rounded-full bg-[var(--theme-accent)] text-white flex items-center justify-center shrink-0"
                >
                  {audioPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
                </button>
                <div className="flex-1">
                  <div className="h-1 rounded-full bg-[var(--theme-border)] overflow-hidden">
                    <div className="h-full w-1/3 rounded-full bg-[var(--theme-accent)]" />
                  </div>
                  <p className="text-xs text-[var(--theme-text-secondary)] mt-1">0:00</p>
                </div>
              </div>
            )}

            {/* Time + Read Status */}
            <div className={`flex items-center gap-1 mt-0.5 ${isOwn ? 'justify-start' : 'justify-end'}`}>
              <span className="text-[10px] text-[var(--theme-text-secondary)] opacity-70">{formatTime(message.createdAt)}</span>
              {isOwn && (
                <span className="text-[10px]">
                  {readStatus === 'read' ? (
                    <CheckCheck className="w-3.5 h-3.5 text-blue-400" />
                  ) : readStatus === 'delivered' ? (
                    <CheckCheck className="w-3.5 h-3.5 text-[var(--theme-text-secondary)] opacity-50" />
                  ) : (
                    <Check className="w-3.5 h-3.5 text-[var(--theme-text-secondary)] opacity-50" />
                  )}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Context Menu */}
        {showMenu && (
          <div
            className={`absolute top-0 z-50 rounded-xl border shadow-xl p-1 min-w-[140px] ${isOwn ? 'left-full ml-1' : 'right-full mr-1'}`}
            style={{ background: 'var(--theme-bg-secondary)', borderColor: 'var(--theme-border)' }}
          >
            {onReply && (
              <button
                onClick={() => { onReply(message); setShowMenu(false); }}
                className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-[var(--theme-text-secondary)] hover:bg-[var(--theme-accent-glow)] hover:text-[var(--theme-text)] transition-all"
              >
                <Reply className="w-4 h-4" />
                הגב
              </button>
            )}
            <button
              onClick={() => { navigator.clipboard.writeText(message.text); setShowMenu(false); }}
              className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-[var(--theme-text-secondary)] hover:bg-[var(--theme-accent-glow)] hover:text-[var(--theme-text)] transition-all"
            >
              <Copy className="w-4 h-4" />
              העתק
            </button>
            {isOwn && onDelete && (
              <button
                onClick={() => { onDelete(message.id); setShowMenu(false); }}
                className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-red-400 hover:bg-red-500/10 transition-all"
              >
                <Trash2 className="w-4 h-4" />
                מחק
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
