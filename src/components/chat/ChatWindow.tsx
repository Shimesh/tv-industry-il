'use client';

import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import {
  ArrowRight,
  Search,
  Paperclip,
  Send,
  Smile,
  Mic,
  X,
  Image as ImageIcon,
  FileText,
  Phone,
  Video,
  Lock,
  Video as VideoIcon,
} from 'lucide-react';
import MessageBubble from './MessageBubble';
import ChatConnectionBanner from './ChatConnectionBanner';
import type { ChatRoom } from '@/hooks/useChat';
import { useCall } from '@/contexts/CallContext';
import { useVoiceRecorder } from '@/hooks/useVoiceRecorder';
import type { ChatConnectionState, ChatUiMessage } from './chatTypes';
import type { UserProfile } from '@/contexts/AuthContext';

interface ReplyTarget {
  messageId: string;
  text: string;
  senderName: string;
}

interface ChatWindowProps {
  chat: ChatRoom;
  messages: ChatUiMessage[];
  currentUserId: string;
  typingUsers: string[];
  uploadProgress: number | null;
  connectionState?: ChatConnectionState;
  v2Enabled?: boolean;
  pendingCount?: number;
  onSendMessage: (
    text: string,
    type: 'text' | 'image' | 'file' | 'voice' | 'video',
    file?: File,
    replyTo?: ReplyTarget | null,
    duration?: number,
    mimeType?: string
  ) => Promise<void>;
  onDeleteMessage: (id: string) => void;
  onSetTyping: (isTyping: boolean) => void;
  onBack: () => void;
  onRetryOptimisticMessage?: (message: ChatUiMessage) => void;
  onDismissOptimisticMessage?: (messageId: string) => void;
  hasMore?: boolean;
  loadingMore?: boolean;
  onLoadMore?: () => void;
  onlineUsers?: UserProfile[];
}

const EMOJI_LIST = [
  '😊', '❤️', '😂', '👍', '🙏', '😍', '🔥', '🎬', '📷', '🎥',
  '⭐', '💥', '💕', '👏', '🚶', '📸', '🎵', '💯', '😎', '✅',
  '😢', '🎭', '👋', '…', '✌️', '💬', '📎', '🎞️', '🎧', '🎬',
];

function getDateLabel(timestamp: number): string {
  const date = new Date(timestamp);
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);

  if (date.toDateString() === today.toDateString()) return 'היום';
  if (date.toDateString() === yesterday.toDateString()) return 'אתמול';
  return date.toLocaleDateString('he-IL', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function getChatDisplayName(chat: ChatRoom, currentUserId: string): string {
  if (chat.type === 'private') {
    const other = chat.membersInfo?.find((m) => m.uid !== currentUserId);
    return other?.displayName || 'צ׳אט';
  }
  return chat.name || 'צ׳אט';
}

function getChatDisplayPhoto(chat: ChatRoom, currentUserId: string): string | null {
  if (chat.type === 'private') {
    const other = chat.membersInfo?.find((m) => m.uid !== currentUserId);
    return other?.photoURL || null;
  }
  return chat.photoURL;
}

function getReplyPreviewText(message: ChatUiMessage): string {
  if (message.type === 'voice') return 'הודעת קול';
  if (message.type === 'video') return 'הודעת וידאו';
  if (message.type === 'image') return 'תמונה';
  if (message.type === 'file') return `קובץ ${message.fileName || ''}`.trim();
  return message.text || '';
}

function formatRecordingDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export default function ChatWindow({
  chat,
  messages,
  currentUserId,
  typingUsers,
  uploadProgress,
  connectionState,
  v2Enabled = false,
  pendingCount = 0,
  onSendMessage,
  onDeleteMessage,
  onSetTyping,
  onBack,
  onRetryOptimisticMessage,
  onDismissOptimisticMessage,
  hasMore = false,
  loadingMore = false,
  onLoadMore,
  onlineUsers = [],
}: ChatWindowProps) {
  const [text, setText] = useState('');
  const [replyTo, setReplyTo] = useState<ChatUiMessage | null>(null);
  const [showEmoji, setShowEmoji] = useState(false);
  const [showAttach, setShowAttach] = useState(false);
  const [recordingMode, setRecordingMode] = useState<'audio' | 'video' | null>(null);
  const [showSearch, setShowSearch] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  const bottomRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const prevScrollHeightRef = useRef(0);
  const isAtBottomRef = useRef(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const videoPreviewRef = useRef<HTMLVideoElement>(null);
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const { callState, startCall, signalingMode } = useCall();
  const {
    isRecording,
    duration,
    audioBlob,
    mimeType,
    stream,
    startRecording,
    stopRecording,
    cancelRecording,
  } = useVoiceRecorder();

  const chatName = getChatDisplayName(chat, currentUserId);
  const chatPhoto = getChatDisplayPhoto(chat, currentUserId);
  const isGroup = chat.type !== 'private';
  const otherMember = chat.type === 'private'
    ? chat.membersInfo.find((m) => m.uid && m.uid !== currentUserId)
    : null;
  const canCall = !!otherMember?.uid && callState.status === 'idle';

  useEffect(() => {
    if (videoPreviewRef.current && stream && recordingMode === 'video') {
      videoPreviewRef.current.srcObject = stream;
    }
  }, [stream, recordingMode]);

  useEffect(() => {
    if (!isRecording && audioBlob && recordingMode) {
      const mode = recordingMode;
      setRecordingMode(null);
      const ext = mimeType.includes('ogg') ? 'ogg' : 'webm';
      const fileName = mode === 'video' ? `video_${Date.now()}.${ext}` : `voice_${Date.now()}.${ext}`;
      const file = new File([audioBlob], fileName, { type: mimeType });
      onSendMessage('', mode === 'video' ? 'video' : 'voice', file, null, duration, mimeType).catch(() => {});
    }
  }, [isRecording, audioBlob]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    return () => {
      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current);
        typingTimeoutRef.current = null;
      }
      onSetTyping(false);
    };
  }, [onSetTyping]);

  useEffect(() => {
    const container = messagesContainerRef.current;
    if (!container) return;

    if (prevScrollHeightRef.current > 0) {
      // Older messages were prepended — restore scroll position
      const diff = container.scrollHeight - prevScrollHeightRef.current;
      if (diff > 0) container.scrollTop = diff;
      prevScrollHeightRef.current = 0;
      isAtBottomRef.current = false;
    } else if (isAtBottomRef.current) {
      container.scrollTop = container.scrollHeight;
    }
  }, [messages, typingUsers, pendingCount]);

  useEffect(() => {
    inputRef.current?.focus();
    setReplyTo(null);
    setText('');
    setShowEmoji(false);
    setShowAttach(false);
    setShowSearch(false);
    setSearchQuery('');
    prevScrollHeightRef.current = 0;
    isAtBottomRef.current = false;
    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
      typingTimeoutRef.current = null;
    }
    onSetTyping(false);
  }, [chat.id]);

  const handleScroll = useCallback(() => {
    const container = messagesContainerRef.current;
    if (!container) return;
    const distFromBottom = container.scrollHeight - container.scrollTop - container.clientHeight;
    isAtBottomRef.current = distFromBottom < 80;
    if (container.scrollTop < 80 && hasMore && !loadingMore && onLoadMore) {
      prevScrollHeightRef.current = container.scrollHeight;
      onLoadMore();
    }
  }, [hasMore, loadingMore, onLoadMore]);

  const handleTyping = useCallback(() => {
    onSetTyping(true);
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    typingTimeoutRef.current = setTimeout(() => {
      onSetTyping(false);
      typingTimeoutRef.current = null;
    }, 2000);
  }, [onSetTyping]);

  const handleSend = useCallback(async () => {
    if (!text.trim()) return;
    const reply = replyTo
      ? { messageId: replyTo.id, text: getReplyPreviewText(replyTo), senderName: replyTo.senderName }
      : null;
    await onSendMessage(text.trim(), 'text', undefined, reply);
    setText('');
    setReplyTo(null);
    setShowEmoji(false);
    onSetTyping(false);
    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
      typingTimeoutRef.current = null;
    }
    if (inputRef.current) inputRef.current.style.height = 'auto';
  }, [onSendMessage, onSetTyping, replyTo, text]);

  const handleFileUpload = useCallback(async (file: File) => {
    const isImage = file.type.startsWith('image/');
    const reply = replyTo
      ? { messageId: replyTo.id, text: getReplyPreviewText(replyTo), senderName: replyTo.senderName }
      : null;
    await onSendMessage(file.name, isImage ? 'image' : 'file', file, reply);
    setReplyTo(null);
    setShowAttach(false);
  }, [onSendMessage, replyTo]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleTextChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setText(e.target.value);
    handleTyping();
    e.target.style.height = 'auto';
    e.target.style.height = `${Math.min(e.target.scrollHeight, 120)}px`;
  };

  const handleStartVoice = async () => {
    setRecordingMode('audio');
    await startRecording('audio');
  };

  const handleStartVideo = async () => {
    setShowAttach(false);
    setRecordingMode('video');
    await startRecording('video');
  };

  const handleCancelRecording = () => {
    cancelRecording();
    setRecordingMode(null);
    onSetTyping(false);
  };

  const handleStopAndSend = () => {
    stopRecording();
  };

  const filteredMessages = searchQuery.trim()
    ? messages.filter((m) => {
        if (m.type !== 'text') return true;
        return (m.text || '').toLowerCase().includes(searchQuery.toLowerCase());
      })
    : messages;

  const groupedMessages = useMemo(() => {
    const groups: { date: string; messages: ChatUiMessage[] }[] = [];
    let currentDate = '';
    filteredMessages.forEach((msg) => {
      const msgDate = getDateLabel(msg.createdAt);
      if (msgDate !== currentDate) {
        currentDate = msgDate;
        groups.push({ date: msgDate, messages: [msg] });
      } else {
        groups[groups.length - 1].messages.push(msg);
      }
    });
    return groups;
  }, [filteredMessages]);

  return (
    <div className="relative flex h-full flex-1 flex-col" style={{ background: 'var(--theme-bg)' }}>
      <div className="flex shrink-0 items-center gap-3 border-b px-4 py-[10px]" style={{ background: 'var(--theme-bg-secondary)', borderColor: 'var(--theme-border)' }} dir="rtl">
        <button
          onClick={onBack}
          className="-mr-1 rounded-full p-1.5 transition-colors hover:bg-[var(--theme-accent-glow)] lg:hidden"
        >
          <ArrowRight className="h-5 w-5 text-[var(--theme-text-secondary)]" />
        </button>

        {(() => {
          const isOtherOnline = !isGroup && otherMember?.uid
            ? onlineUsers.some(u => u.uid === otherMember.uid)
            : false;
          return (
            <div className="relative shrink-0">
              {chatPhoto ? (
                <img src={chatPhoto} alt="" className="w-10 h-10 rounded-full object-cover" />
              ) : (
                <div
                  className="w-10 h-10 rounded-full flex items-center justify-center text-white font-bold"
                  style={{ backgroundColor: isGroup ? 'var(--theme-accent)' : 'var(--theme-text-secondary)' }}
                >
                  {chatName.charAt(0)}
                </div>
              )}
              {isOtherOnline && (
                <span className="absolute bottom-0 left-0 h-[11px] w-[11px] rounded-full border-2 bg-[var(--theme-success)]" style={{ borderColor: 'var(--theme-bg-secondary)' }} />
              )}
            </div>
          );
        })()}

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <h3 className="truncate text-[15px] font-medium text-[var(--theme-text)]">{chatName}</h3>
            <span title="צ׳אט מוגן">
              <Lock className="h-3 w-3 shrink-0 text-[var(--theme-accent)]" />
            </span>
          </div>
          <p className="text-[12px] text-[var(--theme-text-secondary)]">
            {typingUsers.length > 0 ? (
              <span className="text-[var(--theme-accent)]">{typingUsers.join(', ')} מקליד/ה...</span>
            ) : isGroup ? (
              `${chat.members.length} משתתפים`
            ) : (
              'לחצו כאן לפרטי איש הקשר'
            )}
          </p>
        </div>

        {v2Enabled && (
          <span className="hidden xl:inline-flex rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-1 text-[11px] font-medium text-emerald-100">
            V2 {connectionState?.mode === 'connected' ? 'מחובר' : 'מוכן'}
          </span>
        )}

        <span className="hidden rounded-full border px-2 py-1 text-[11px] text-[var(--theme-text-secondary)] xl:inline-flex" style={{ background: 'var(--theme-bg-card)', borderColor: 'var(--theme-border)' }}>
          {signalingMode === 'socket-ready' ? 'שיחות מוכנות דרך Socket.IO' : 'שיחות דרך Firestore'}
        </span>

        {chat.type === 'private' && otherMember?.uid && (
          <>
            <button
              onClick={() => startCall(otherMember.uid!, otherMember.displayName, 'voice')}
              disabled={!canCall}
              className="rounded-full p-2 transition-colors hover:bg-[var(--theme-accent-glow)] disabled:cursor-not-allowed disabled:opacity-40"
              title="שיחת קול"
            >
              <Phone className="h-5 w-5 text-[var(--theme-text-secondary)]" />
            </button>
            <button
              onClick={() => startCall(otherMember.uid!, otherMember.displayName, 'video')}
              disabled={!canCall}
              className="rounded-full p-2 transition-colors hover:bg-[var(--theme-accent-glow)] disabled:cursor-not-allowed disabled:opacity-40"
              title="שיחת וידאו"
            >
              <Video className="h-5 w-5 text-[var(--theme-text-secondary)]" />
            </button>
          </>
        )}

        <button
          onClick={() => {
            setShowSearch((s) => !s);
            setSearchQuery('');
          }}
          className={`rounded-full p-2 transition-colors ${showSearch ? 'bg-[var(--theme-accent-glow)] text-[var(--theme-accent)]' : 'text-[var(--theme-text-secondary)] hover:bg-[var(--theme-accent-glow)]'}`}
        >
          <Search className="w-5 h-5" />
        </button>
      </div>

      {v2Enabled && connectionState && (
        <ChatConnectionBanner
          enabled={v2Enabled}
          connectionState={connectionState}
          pendingCount={pendingCount}
        />
      )}

      {showSearch && (
        <div className="border-b px-4 py-3" style={{ background: 'var(--theme-bg-secondary)', borderColor: 'var(--theme-border)' }}>
          <div className="relative">
            <Search className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--theme-text-secondary)]" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="חיפוש בהודעות..."
              className="w-full rounded-lg border pr-10 pl-4 py-2.5 text-[var(--theme-text)] outline-none placeholder:text-[var(--theme-text-secondary)]"
              style={{ background: 'var(--theme-bg-card)', borderColor: 'var(--theme-border)' }}
              dir="rtl"
            />
          </div>
        </div>
      )}

      <div
        ref={messagesContainerRef}
        className="flex-1 overflow-y-auto py-2"
        dir="ltr"
        onScroll={handleScroll}
        style={{
          background:
            'radial-gradient(circle at 20% 10%, var(--theme-accent-glow), transparent 18rem), var(--theme-bg)',
        }}
      >
        {loadingMore && (
          <div className="flex justify-center py-3">
            <div className="h-5 w-5 animate-spin rounded-full border-2 border-[var(--theme-accent)] border-t-transparent" />
          </div>
        )}
        {filteredMessages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full gap-3">
            <div className="flex h-20 w-20 items-center justify-center rounded-full bg-[var(--theme-accent-glow)]">
              {searchQuery.trim() ? (
                <Search className="h-8 w-8 text-[var(--theme-text-secondary)]" />
              ) : (
                <Send className="h-8 w-8 text-[var(--theme-accent)]" />
              )}
            </div>
            <p className="text-[14px] text-[var(--theme-text-secondary)]" dir="rtl">
              {searchQuery.trim() ? `אין תוצאות עבור "${searchQuery}"` : 'שלחו את ההודעה הראשונה'}
            </p>
          </div>
        ) : (
          groupedMessages.map((group) => (
            <div key={group.date}>
              <div className="flex justify-center my-3">
                <span className="rounded-[7.5px] border px-3 py-[5px] text-[12.5px] shadow-sm" style={{ background: 'var(--theme-bg-card)', borderColor: 'var(--theme-border)', color: 'var(--theme-text-secondary)' }}>
                  {group.date}
                </span>
              </div>

              {group.messages.map((msg, i) => {
                const isOwn = msg.senderId === currentUserId;
                const prevMsg = i > 0 ? group.messages[i - 1] : null;
                const showSender =
                  !prevMsg || prevMsg.senderId !== msg.senderId || (msg.createdAt - prevMsg.createdAt > 300000);

                return (
                  <MessageBubble
                    key={msg.optimisticId || msg.id}
                    message={msg}
                    isOwn={isOwn}
                    currentUserId={currentUserId}
                    showSender={showSender}
                    isGroup={isGroup}
                    chatMembers={chat.members}
                    onReply={(m) => {
                      setReplyTo(m);
                      inputRef.current?.focus();
                    }}
                    onDelete={onDeleteMessage}
                    onRetry={onRetryOptimisticMessage}
                    onDismissOptimistic={onDismissOptimisticMessage}
                  />
                );
              })}
            </div>
          ))
        )}

        {typingUsers.length > 0 && (
          <div className="flex justify-start px-[4.5%] mb-1">
            <div className="rounded-[7.5px] rounded-tl-[0px] px-3 py-2 shadow-sm" style={{ background: 'var(--theme-bg-card)' }}>
              <div className="flex gap-1 items-center">
                <span className="h-2 w-2 animate-bounce rounded-full bg-[var(--theme-text-secondary)]" style={{ animationDelay: '0ms' }} />
                <span className="h-2 w-2 animate-bounce rounded-full bg-[var(--theme-text-secondary)]" style={{ animationDelay: '150ms' }} />
                <span className="h-2 w-2 animate-bounce rounded-full bg-[var(--theme-text-secondary)]" style={{ animationDelay: '300ms' }} />
              </div>
            </div>
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {replyTo && !isRecording && (
        <div className="flex items-center gap-3 border-t px-4 py-2" style={{ background: 'var(--theme-bg-secondary)', borderColor: 'var(--theme-border)' }} dir="rtl">
          <div className="min-w-0 flex-1 border-r-[3px] pr-3" style={{ borderColor: 'var(--theme-accent)' }}>
            <p className="text-[12px] font-medium text-[var(--theme-accent)]">{replyTo.senderName}</p>
            <p className="truncate text-[12px] text-[var(--theme-text-secondary)]">{getReplyPreviewText(replyTo)}</p>
          </div>
          <button onClick={() => setReplyTo(null)} className="rounded-full p-1 transition-colors hover:bg-[var(--theme-accent-glow)]">
            <X className="h-4 w-4 text-[var(--theme-text-secondary)]" />
          </button>
        </div>
      )}

      {showEmoji && !isRecording && (
        <div className="border-t p-3" style={{ background: 'var(--theme-bg-secondary)', borderColor: 'var(--theme-border)' }} dir="rtl">
          <div className="grid grid-cols-10 gap-1 max-h-[120px] overflow-y-auto">
            {EMOJI_LIST.map((emoji) => (
              <button
                key={emoji}
                onClick={() => {
                  setText((prev) => prev + emoji);
                  inputRef.current?.focus();
                }}
                className="flex h-8 w-8 items-center justify-center rounded text-lg transition-colors hover:bg-[var(--theme-accent-glow)]"
              >
                {emoji}
              </button>
            ))}
          </div>
        </div>
      )}

      {showAttach && !isRecording && (
        <div className="flex justify-center gap-4 border-t p-3" style={{ background: 'var(--theme-bg-secondary)', borderColor: 'var(--theme-border)' }} dir="rtl">
          <button
            onClick={() => imageInputRef.current?.click()}
            className="flex flex-col items-center gap-1.5 rounded-xl p-3 transition-colors hover:bg-[var(--theme-accent-glow)]"
          >
            <div className="w-12 h-12 rounded-full bg-[#BF59CF] flex items-center justify-center">
              <ImageIcon className="w-6 h-6 text-white" />
            </div>
            <span className="text-[11px] text-[var(--theme-text-secondary)]">תמונה</span>
          </button>
          <button
            onClick={() => fileInputRef.current?.click()}
            className="flex flex-col items-center gap-1.5 rounded-xl p-3 transition-colors hover:bg-[var(--theme-accent-glow)]"
          >
            <div className="w-12 h-12 rounded-full bg-[#5157AE] flex items-center justify-center">
              <FileText className="w-6 h-6 text-white" />
            </div>
            <span className="text-[11px] text-[var(--theme-text-secondary)]">מסמך</span>
          </button>
          <button
            onClick={handleStartVideo}
            className="flex flex-col items-center gap-1.5 rounded-xl p-3 transition-colors hover:bg-[var(--theme-accent-glow)]"
          >
            <div className="w-12 h-12 rounded-full bg-[#E03E3E] flex items-center justify-center">
              <VideoIcon className="w-6 h-6 text-white" />
            </div>
            <span className="text-[11px] text-[var(--theme-text-secondary)]">וידאו</span>
          </button>
        </div>
      )}

      {isRecording && recordingMode === 'video' && (
        <div className="flex justify-center border-t p-2" style={{ background: 'var(--theme-bg)', borderColor: 'var(--theme-border)' }}>
          <video
            ref={videoPreviewRef}
            muted
            autoPlay
            playsInline
            className="rounded-lg max-h-[160px] max-w-full bg-black"
          />
        </div>
      )}

      <input
        ref={fileInputRef}
        type="file"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) handleFileUpload(file);
          e.target.value = '';
        }}
      />
      <input
        ref={imageInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) handleFileUpload(file);
          e.target.value = '';
        }}
      />

      {uploadProgress !== null && (
        <div className="border-t px-4 py-1.5" style={{ background: 'var(--theme-bg-secondary)', borderColor: 'var(--theme-border)' }} dir="rtl">
          <div className="flex items-center gap-2">
            <span className="shrink-0 text-[11px] text-[var(--theme-text-secondary)]">מעלה... {uploadProgress}%</span>
            <div className="h-1 flex-1 overflow-hidden rounded-full bg-[var(--theme-border)]">
              <div
                className="h-full rounded-full bg-[var(--theme-accent)] transition-all duration-200"
                style={{ width: `${uploadProgress}%` }}
              />
            </div>
          </div>
        </div>
      )}

      {isRecording ? (
        <div className="flex items-center gap-3 border-t px-4 py-3" style={{ background: 'var(--theme-bg-secondary)', borderColor: 'var(--theme-border)' }} dir="rtl">
          <button
            onClick={handleCancelRecording}
            className="shrink-0 rounded-full bg-[var(--theme-bg-card)] p-2 transition-colors hover:bg-[var(--theme-accent-glow)]"
            title="ביטול"
          >
            <X className="h-5 w-5 text-[var(--theme-text-secondary)]" />
          </button>

          <div className="flex flex-1 items-center gap-2 rounded-full bg-[var(--theme-bg-card)] px-3 py-2">
            <span className="w-2.5 h-2.5 rounded-full bg-red-500 animate-pulse shrink-0" />
            <span className="text-[13px] font-medium text-[var(--theme-text)]">
              {recordingMode === 'video' ? 'וידאו' : 'קול'} מקליט... {formatRecordingDuration(duration)}
            </span>
          </div>

          <button
            onClick={handleStopAndSend}
            className="shrink-0 rounded-full bg-[var(--theme-accent)] p-2.5 text-white transition-colors hover:opacity-90"
            title="שלח"
          >
            <Send className="h-5 w-5" />
          </button>
        </div>
      ) : (
        <div className="flex items-end gap-2 border-t px-3 py-2" style={{ background: 'var(--theme-bg-secondary)', borderColor: 'var(--theme-border)' }} dir="rtl">
          <button
            onClick={() => {
              setShowEmoji(!showEmoji);
              setShowAttach(false);
            }}
            className={`shrink-0 rounded-full p-2 transition-colors ${showEmoji ? 'text-[var(--theme-accent)]' : 'text-[var(--theme-text-secondary)] hover:text-[var(--theme-text)]'}`}
          >
            <Smile className="w-6 h-6" />
          </button>

          <button
            onClick={() => {
              setShowAttach(!showAttach);
              setShowEmoji(false);
            }}
            className={`shrink-0 rounded-full p-2 transition-colors ${showAttach ? 'text-[var(--theme-accent)]' : 'text-[var(--theme-text-secondary)] hover:text-[var(--theme-text)]'}`}
          >
            <Paperclip className="w-6 h-6" />
          </button>

          <div className="flex-1 min-w-0">
            <textarea
              ref={inputRef}
              value={text}
              onChange={handleTextChange}
              onKeyDown={handleKeyDown}
              placeholder="הקלד הודעה"
              rows={1}
              dir="auto"
              className="max-h-[120px] w-full resize-none rounded-lg border px-3 py-[9px] text-[14px] leading-[20px] text-[var(--theme-text)] outline-none placeholder:text-[var(--theme-text-secondary)]"
              style={{ background: 'var(--theme-bg-card)', borderColor: 'var(--theme-border)', scrollbarWidth: 'none' }}
            />
          </div>

          {text.trim() ? (
            <button
              onClick={handleSend}
              className="shrink-0 rounded-full bg-[var(--theme-accent)] p-2.5 text-white transition-colors hover:opacity-90"
            >
              <Send className="h-5 w-5" />
            </button>
          ) : (
            <button
              onClick={handleStartVoice}
              className="shrink-0 rounded-full p-2 text-[var(--theme-text-secondary)] transition-colors hover:bg-[var(--theme-accent-glow)] hover:text-[var(--theme-text)]"
              title="לחץ להקלטת הודעה קולית"
            >
              <Mic className="w-6 h-6" />
            </button>
          )}
        </div>
      )}
    </div>
  );
}
