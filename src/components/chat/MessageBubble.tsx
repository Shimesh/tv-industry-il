'use client';

import { useState, useRef, useEffect } from 'react';
import {
  Check,
  CheckCheck,
  File as FileIcon,
  Download,
  Reply,
  Trash2,
  Copy,
  Play,
  Pause,
  Mic,
  RotateCcw,
  AlertTriangle,
  Loader2,
} from 'lucide-react';
import type { ChatUiMessage } from './chatTypes';

interface MessageBubbleProps {
  message: ChatUiMessage;
  isOwn: boolean;
  currentUserId: string;
  showSender: boolean;
  isGroup: boolean;
  chatMembers: string[];
  onReply: (message: ChatUiMessage) => void;
  onDelete: (messageId: string) => void;
  onRetry?: (message: ChatUiMessage) => void;
  onDismissOptimistic?: (messageId: string) => void;
}

function formatFileSize(bytes: number | null): string {
  if (!bytes) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDuration(seconds: number | null): string {
  if (!seconds) return '0:00';
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function nameColor(name: string): string {
  const colors = ['#00A884', '#53BDEB', '#E9A8FF', '#FFD279', '#FF6B6B', '#7DD3FC', '#A78BFA', '#F472B6'];
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return colors[Math.abs(hash) % colors.length];
}

type ReadStatus = 'sent' | 'delivered' | 'read';

function getReadStatus(message: ChatUiMessage, currentUserId: string, chatMembers: string[]): ReadStatus {
  const others = chatMembers.filter(uid => uid !== currentUserId);
  if (others.length === 0) return 'sent';
  const allRead = others.every(uid => message.readBy?.[uid]);
  if (allRead) return 'read';
  const anyDelivered = others.some(uid => message.deliveredTo?.[uid]);
  if (anyDelivered) return 'delivered';
  return 'sent';
}

function getReplyPreviewText(message: ChatUiMessage): string {
  if (message.type === 'voice') return 'הודעת קול';
  if (message.type === 'video') return 'הודעת וידאו';
  if (message.type === 'image') return 'תמונה';
  if (message.type === 'file') return `קובץ ${message.fileName || ''}`.trim();
  return message.text || '';
}

function VoiceMessagePlayer({
  fileURL,
  duration,
  isOwn,
}: {
  fileURL: string;
  duration: number | null;
  isOwn: boolean;
}) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [totalDuration, setTotalDuration] = useState(duration || 0);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const onTimeUpdate = () => setCurrentTime(audio.currentTime);
    const onEnded = () => {
      setIsPlaying(false);
      setCurrentTime(0);
    };
    const onLoadedMetadata = () => {
      if (audio.duration && isFinite(audio.duration)) {
        setTotalDuration(audio.duration);
      }
    };

    audio.addEventListener('timeupdate', onTimeUpdate);
    audio.addEventListener('ended', onEnded);
    audio.addEventListener('loadedmetadata', onLoadedMetadata);
    return () => {
      audio.removeEventListener('timeupdate', onTimeUpdate);
      audio.removeEventListener('ended', onEnded);
      audio.removeEventListener('loadedmetadata', onLoadedMetadata);
    };
  }, []);

  const togglePlay = () => {
    const audio = audioRef.current;
    if (!audio) return;
    if (isPlaying) {
      audio.pause();
      setIsPlaying(false);
    } else {
      audio.play().catch(() => {});
      setIsPlaying(true);
    }
  };

  const progress = totalDuration > 0 ? (currentTime / totalDuration) * 100 : 0;
  const displayed = isPlaying || currentTime > 0 ? currentTime : totalDuration;

  return (
    <div className={`flex items-center gap-2.5 rounded-full px-3 py-2 min-w-[180px] ${isOwn ? 'bg-[#00000025]' : 'bg-[#00000025]'}`}>
      <audio ref={audioRef} src={fileURL} preload="metadata" />
      <button
        onClick={togglePlay}
        className="w-8 h-8 rounded-full bg-[#00A884] flex items-center justify-center shrink-0 hover:bg-[#06CF9C] transition-colors"
      >
        {isPlaying ? (
          <Pause className="w-4 h-4 text-[#111B21]" />
        ) : (
          <Play className="w-4 h-4 text-[#111B21] ml-0.5" />
        )}
      </button>
      <div className="flex-1 flex flex-col gap-1">
        <div className="relative h-1.5 rounded-full bg-[#ffffff20] overflow-hidden">
          <div
            className="absolute inset-y-0 left-0 rounded-full bg-[#00A884] transition-all duration-100"
            style={{ width: `${progress}%` }}
          />
        </div>
        <div className="flex items-center gap-1">
          <Mic className="w-2.5 h-2.5 text-[#8696a0]" />
          <span className="text-[10px] text-[#8696a0]">{formatDuration(displayed)}</span>
        </div>
      </div>
    </div>
  );
}

export default function MessageBubble({
  message,
  isOwn,
  currentUserId,
  showSender,
  isGroup,
  chatMembers,
  onReply,
  onDelete,
  onRetry,
  onDismissOptimistic,
}: MessageBubbleProps) {
  const [showMenu, setShowMenu] = useState(false);
  const isPending = isOwn && message.localState === 'sending';
  const isFailed = isOwn && message.localState === 'failed';

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
    hour: '2-digit',
    minute: '2-digit',
  });

  const readStatus: ReadStatus = isOwn ? getReadStatus(message, currentUserId, chatMembers) : 'sent';
  const statusLabel = isPending
    ? 'שולח...'
    : isFailed
      ? 'נכשל'
      : readStatus === 'read'
        ? 'נקרא'
        : readStatus === 'delivered'
          ? 'נמסר'
          : isOwn
            ? 'נשלח'
            : '';

  return (
    <div
      className={`flex ${isOwn ? 'justify-end' : 'justify-start'} mb-[3px] px-[4.5%] group`}
      onMouseLeave={() => setShowMenu(false)}
    >
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
      {!isOwn && isGroup && !showSender && <div className="w-[34px] shrink-0" />}

      <div className="relative max-w-[65%] min-w-[90px]">
        <div
          className={`relative px-[9px] pt-[6px] pb-[8px] shadow-sm ${
            isOwn
              ? 'bg-[#005C4B] rounded-[7.5px] rounded-tr-[0px]'
              : 'bg-[#202C33] rounded-[7.5px] rounded-tl-[0px]'
          }`}
        >
          {showSender && !isOwn && isGroup && (
            <p
              className="text-[12.5px] font-medium mb-[2px]"
              style={{ color: nameColor(message.senderName) }}
            >
              {message.senderName}
            </p>
          )}

          {message.replyTo && (
            <div className="bg-[#00000026] rounded-md px-[10px] py-[5px] mb-[4px] border-r-[3px] border-[#00A884]">
              <p className="text-[11px] font-medium text-[#00A884]">{message.replyTo.senderName}</p>
              <p className="text-[11px] text-[#8696a0] truncate max-w-[220px]">
                {message.replyTo.text || 'הודעה'}
              </p>
            </div>
          )}

          {message.type === 'image' && message.fileURL && (
            <a href={message.fileURL} target="_blank" rel="noopener noreferrer" className="block mb-1">
              <img
                src={message.fileURL}
                alt={message.fileName || 'תמונה'}
                className="rounded-md max-w-full max-h-[300px] object-cover hover:opacity-90 transition"
              />
            </a>
          )}

          {message.type === 'image' && !message.fileURL && (
            <div className="mb-1 rounded-md border border-dashed border-white/10 bg-black/20 p-3">
              <div className="flex items-center gap-2">
                <Loader2 className="w-4 h-4 text-amber-300 animate-spin" />
                <span className="text-[12px] text-[#E9EDEF]">{message.fileName || 'תמונה'} - בהעלאה</span>
              </div>
            </div>
          )}

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

          {message.type === 'file' && !message.fileURL && (
            <div className="flex items-center gap-2.5 bg-[#00000020] rounded-lg p-2.5 mb-1 border border-dashed border-white/10">
              <div className="w-10 h-10 rounded-lg bg-[#5157AE] flex items-center justify-center shrink-0">
                <FileIcon className="w-5 h-5 text-white" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[13px] text-[#E9EDEF] truncate">{message.fileName || 'קובץ'}</p>
                <p className="text-[11px] text-[#8696a0]">{isPending ? 'מועלה...' : 'ממתין לקישור'}</p>
              </div>
              <Loader2 className="w-4 h-4 text-[#8696a0] animate-spin shrink-0" />
            </div>
          )}

          {message.type === 'voice' && message.fileURL && (
            <div className="mb-1">
              <VoiceMessagePlayer fileURL={message.fileURL} duration={message.duration} isOwn={isOwn} />
            </div>
          )}

          {message.type === 'voice' && !message.fileURL && (
            <div className="mb-1 flex items-center gap-2 rounded-full bg-[#00000026] px-3 py-2">
              <Loader2 className="w-4 h-4 text-amber-300 animate-spin" />
              <span className="text-[12px] text-[#8696a0]">{isPending ? 'מקליט...' : 'ממתין להעלאה'}</span>
            </div>
          )}

          {message.type === 'video' && message.fileURL && (
            <div className="mb-1">
              <video
                src={message.fileURL}
                controls
                preload="metadata"
                className="rounded-md max-w-full max-h-[260px] bg-black"
              />
            </div>
          )}

          {message.type === 'video' && !message.fileURL && (
            <div className="mb-1 flex items-center gap-2 rounded-xl bg-[#00000026] px-3 py-3 border border-dashed border-white/10">
              <Loader2 className="w-4 h-4 text-amber-300 animate-spin" />
              <span className="text-[12px] text-[#8696a0]">{isPending ? 'מעלה וידאו...' : 'ממתין להעלאה'}</span>
            </div>
          )}

          {message.text && message.type !== 'voice' && message.type !== 'video' && (
            <p className="text-[14.2px] text-[#E9EDEF] whitespace-pre-wrap leading-[19px] break-words" dir="auto">
              {message.text}
            </p>
          )}

          <div className="flex items-center justify-end gap-[3px] mt-[2px]">
            <span className="text-[11px] leading-none" style={{ color: 'rgba(255,255,255,0.6)' }}>
              {time}
            </span>
            {isOwn && (
              <span className="flex items-center gap-1">
                <span
                  className={`text-[11px] leading-none ${
                    isFailed ? 'text-red-300' : isPending ? 'text-amber-300' : readStatus === 'read' ? 'text-sky-300' : 'text-white/70'
                  }`}
                >
                  {statusLabel}
                </span>
                {isPending ? (
                  <Loader2 className="w-[12px] h-[12px] text-amber-300 animate-spin" />
                ) : isFailed ? (
                  <AlertTriangle className="w-[12px] h-[12px] text-red-300" />
                ) : readStatus === 'read' ? (
                  <CheckCheck className="w-[16px] h-[16px] text-[#53BDEB]" />
                ) : readStatus === 'delivered' ? (
                  <CheckCheck className="w-[16px] h-[16px] text-[#8696a0]" />
                ) : (
                  <Check className="w-[14px] h-[14px]" style={{ color: 'rgba(255,255,255,0.5)' }} />
                )}
              </span>
            )}
          </div>
        </div>

        <div className={`absolute top-[2px] ${isOwn ? 'left-[2px]' : 'right-[2px]'} opacity-0 group-hover:opacity-100 transition-opacity z-10`}>
          <div className="flex items-center gap-0 bg-[#111B21ee] rounded-lg shadow-lg overflow-hidden">
            <button
              onClick={() => onReply(message)}
              className="p-1.5 hover:bg-[#ffffff15] transition-colors"
              title="השב"
            >
              <Reply className="w-3.5 h-3.5 text-[#aebac1]" />
            </button>
            {message.type === 'text' && message.text && (
              <button
                onClick={() => navigator.clipboard.writeText(message.text)}
                className="p-1.5 hover:bg-[#ffffff15] transition-colors"
                title="העתק"
              >
                <Copy className="w-3.5 h-3.5 text-[#aebac1]" />
              </button>
            )}
            {isOwn && (
              <button
                onClick={() => onDelete(message.id)}
                className="p-1.5 hover:bg-[#ffffff15] transition-colors"
                title="מחק"
              >
                <Trash2 className="w-3.5 h-3.5 text-red-400" />
              </button>
            )}
            {isFailed && isOwn && onRetry && message.localPayload && (
              <button
                onClick={() => onRetry(message)}
                className="p-1.5 hover:bg-[#ffffff15] transition-colors"
                title="נסה שוב"
              >
                <RotateCcw className="w-3.5 h-3.5 text-amber-300" />
              </button>
            )}
            {isFailed && isOwn && onDismissOptimistic && (
              <button
                onClick={() => onDismissOptimistic(message.id)}
                className="p-1.5 hover:bg-[#ffffff15] transition-colors"
                title="הסר"
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
