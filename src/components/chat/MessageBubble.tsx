'use client';

import { useState } from 'react';
import { Check, CheckCheck, File as FileIcon, Download, Reply, Trash2, Copy } from 'lucide-react';
import type { Message } from '@/hooks/useChat';

interface MessageBubbleProps {
  message: Message;
  isOwn: boolean;
  showSender: boolean;
  isGroup: boolean;
  onReply: (message: Message) => void;
  onDelete: (messageId: string) => void;
}

function formatFileSize(bytes: number | null): string {
  if (!bytes) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// Generate consistent color from name for group chat sender names
function nameColor(name: string): string {
  const colors = ['#00A884', '#53BDEB', '#E9A8FF', '#FFD279', '#FF6B6B', '#7DD3FC', '#A78BFA', '#F472B6'];
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return colors[Math.abs(hash) % colors.length];
}

export default function MessageBubble({ message, isOwn, showSender, isGroup, onReply, onDelete }: MessageBubbleProps) {
  const [showMenu, setShowMenu] = useState(false);

  // System message
  if (message.type === 'system') {
    return (
      <div className="flex justify-center my-3 px-4">
        <span className="text-[12px] px-4 py-1.5 rounded-lg bg-[#182229] text-[#8696a0] shadow-sm">
          {message.text}
        </span>
      </div>
    );
  }

  const time = new Date(message.createdAt).toLocaleTimeString('he-IL', {
    hour: '2-digit', minute: '2-digit'
  });

  const isRead = Object.keys(message.readBy || {}).length > 1;

  return (
    <div
      className={`flex ${isOwn ? 'justify-end' : 'justify-start'} mb-[3px] px-[4.5%] group`}
      onMouseLeave={() => setShowMenu(false)}
    >
      {/* Avatar for other's messages in group */}
      {!isOwn && isGroup && showSender && (
        <div className="shrink-0 ml-1.5 mt-auto mb-1">
          {message.senderPhoto ? (
            <img src={message.senderPhoto} alt="" className="w-[28px] h-[28px] rounded-full object-cover" />
          ) : (
            <div
              className="w-[28px] h-[28px] rounded-full flex items-center justify-center text-white text-[11px] font-bold"
              style={{ backgroundColor: nameColor(message.senderName) }}
            >
              {message.senderName.charAt(0)}
            </div>
          )}
        </div>
      )}
      {!isOwn && isGroup && !showSender && <div className="w-[36px] shrink-0" />}

      <div className="relative max-w-[65%] min-w-[90px]">
        {/* Message bubble */}
        <div
          className={`relative px-[9px] pt-[6px] pb-[8px] shadow-sm ${
            isOwn
              ? 'bg-[#005C4B] rounded-[7.5px] rounded-tr-[0px]'
              : 'bg-[#202C33] rounded-[7.5px] rounded-tl-[0px]'
          }`}
        >
          {/* Sender name in group */}
          {showSender && !isOwn && isGroup && (
            <p
              className="text-[12.5px] font-medium mb-[2px]"
              style={{ color: nameColor(message.senderName) }}
            >
              {message.senderName}
            </p>
          )}

          {/* Reply reference */}
          {message.replyTo && (
            <div className="bg-[#00000026] rounded-md px-[10px] py-[5px] mb-[4px] border-r-[3px] border-[#00A884]">
              <p className="text-[11px] font-medium text-[#00A884]">{message.replyTo.senderName}</p>
              <p className="text-[11px] text-[#8696a0] truncate max-w-[220px]">{message.replyTo.text}</p>
            </div>
          )}

          {/* Image */}
          {message.type === 'image' && message.fileURL && (
            <a href={message.fileURL} target="_blank" rel="noopener noreferrer" className="block mb-1">
              <img
                src={message.fileURL}
                alt={message.fileName || 'תמונה'}
                className="rounded-md max-w-full max-h-[300px] object-cover hover:opacity-90 transition"
              />
            </a>
          )}

          {/* File attachment */}
          {message.type === 'file' && message.fileURL && (
            <a
              href={message.fileURL}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2.5 bg-[#00000020] rounded-lg p-2.5 mb-1 hover:bg-[#00000030] transition"
            >
              <div className="w-10 h-10 rounded-lg bg-[#00A884] flex items-center justify-center shrink-0">
                <FileIcon className="w-5 h-5 text-white" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[13px] text-[#E9EDEF] truncate">{message.fileName}</p>
                <p className="text-[11px] text-[#8696a0]">{formatFileSize(message.fileSize)}</p>
              </div>
              <Download className="w-4 h-4 text-[#8696a0] shrink-0" />
            </a>
          )}

          {/* Text content */}
          {message.text && (
            <p className="text-[14.2px] text-[#E9EDEF] whitespace-pre-wrap leading-[19px] break-words" dir="auto">
              {message.text}
            </p>
          )}

          {/* Time + read status */}
          <div className="flex items-center justify-end gap-[3px] mt-[2px]">
            <span className="text-[11px] leading-none" style={{ color: 'rgba(255,255,255,0.6)' }}>{time}</span>
            {isOwn && (
              isRead
                ? <CheckCheck className="w-[16px] h-[16px] text-[#53BDEB]" />
                : <Check className="w-[14px] h-[14px]" style={{ color: 'rgba(255,255,255,0.5)' }} />
            )}
          </div>
        </div>

        {/* Hover actions */}
        <div className={`absolute top-[2px] ${isOwn ? 'left-[2px]' : 'right-[2px]'} opacity-0 group-hover:opacity-100 transition-opacity z-10`}>
          <div className="flex items-center gap-0 bg-[#111B21ee] rounded-lg shadow-lg overflow-hidden">
            <button
              onClick={() => onReply(message)}
              className="p-1.5 hover:bg-[#ffffff15] transition-colors"
              title="הגב"
            >
              <Reply className="w-3.5 h-3.5 text-[#aebac1]" />
            </button>
            <button
              onClick={() => navigator.clipboard.writeText(message.text)}
              className="p-1.5 hover:bg-[#ffffff15] transition-colors"
              title="העתק"
            >
              <Copy className="w-3.5 h-3.5 text-[#aebac1]" />
            </button>
            {isOwn && (
              <button
                onClick={() => onDelete(message.id)}
                className="p-1.5 hover:bg-[#ffffff15] transition-colors"
                title="מחק"
              >
                <Trash2 className="w-3.5 h-3.5 text-red-400" />
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
