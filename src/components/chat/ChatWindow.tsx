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
  WifiOff,
  Loader2,
  AlertTriangle,
  Info,
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import dynamic from 'next/dynamic';
import MessageBubble from './MessageBubble';
import ChatConnectionBanner from './ChatConnectionBanner';
import ChatInfoPanel from './ChatInfoPanel';
import type { ChatRoom } from '@/hooks/useChat';
import { useCall } from '@/contexts/CallContext';
import { useVoiceRecorder } from '@/hooks/useVoiceRecorder';
import type { ChatConnectionState, ChatUiMessage } from './chatTypes';
import type { UserProfile } from '@/contexts/AuthContext';
import { useNotifications } from '@/contexts/NotificationContext';

const EmojiPicker = dynamic(() => import('@emoji-mart/react').then(mod => mod.default), { ssr: false });

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
  loading?: boolean;
  error?: string | null;
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
  allUsers?: UserProfile[];
  onAddMembersToGroup?: (chatId: string, memberIds: string[]) => Promise<void>;
}

import emojiData from '@emoji-mart/data';

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
    return other?.displayName || 'שיחה עם עצמי';
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

function toMillis(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const parsed = Date.parse(value);
    return Number.isNaN(parsed) ? null : parsed;
  }
  if (!value || typeof value !== 'object') return null;

  const maybeTimestamp = value as { toMillis?: () => number; seconds?: number; nanoseconds?: number };
  if (typeof maybeTimestamp.toMillis === 'function') {
    const millis = maybeTimestamp.toMillis();
    return Number.isFinite(millis) ? millis : null;
  }
  if (typeof maybeTimestamp.seconds === 'number') {
    return (maybeTimestamp.seconds * 1000) + Math.floor((maybeTimestamp.nanoseconds || 0) / 1_000_000);
  }

  return null;
}

function statusDotColor(isOnline: boolean, status?: string): string {
  if (!isOnline) return '#6b7280';
  if (status === 'busy') return '#ef4444';
  return 'var(--theme-success)';
}

function formatLastSeen(value: unknown): string {
  const timestamp = toMillis(value);
  if (!timestamp) return '';
  const now = Date.now();
  const diff = now - timestamp;
  if (diff < 60_000) return 'נראה/ת עכשיו';
  if (diff < 3600_000) return `נראה/ת לפני ${Math.floor(diff / 60_000)} דקות`;
  if (diff < 86400_000) return `נראה/ת לפני ${Math.floor(diff / 3600_000)} שעות`;
  const date = new Date(timestamp);
  return `נראה/ת ${date.toLocaleDateString('he-IL', { day: '2-digit', month: '2-digit' })} ${date.toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' })}`;
}

export default function ChatWindow({
  chat,
  messages,
  currentUserId,
  typingUsers,
  uploadProgress,
  loading = false,
  error = null,
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
  allUsers = [],
  onAddMembersToGroup,
}: ChatWindowProps) {
  const [text, setText] = useState('');
  const [replyTo, setReplyTo] = useState<ChatUiMessage | null>(null);
  const [showEmoji, setShowEmoji] = useState(false);
  const [showAttach, setShowAttach] = useState(false);
  const [recordingMode, setRecordingMode] = useState<'audio' | 'video' | null>(null);
  const [showSearch, setShowSearch] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [isOffline, setIsOffline] = useState(false);
  const [showInfo, setShowInfo] = useState(false);
  const markedReadRef = useRef(new Set<string>());
  const chatOpenedAtRef = useRef<number>(Date.now());
  const { notifications, markAsRead } = useNotifications();

  useEffect(() => {
    const goOffline = () => setIsOffline(true);
    const goOnline = () => setIsOffline(false);
    setIsOffline(!navigator.onLine);
    window.addEventListener('offline', goOffline);
    window.addEventListener('online', goOnline);
    return () => {
      window.removeEventListener('offline', goOffline);
      window.removeEventListener('online', goOnline);
    };
  }, []);

  const bottomRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const prevScrollHeightRef = useRef(0);
  const isAtBottomRef = useRef(false);
  const hasInitializedRef = useRef(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const videoPreviewRef = useRef<HTMLVideoElement>(null);
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onSetTypingRef = useRef(onSetTyping);

  const router = useRouter();
  const { callState, startCall, signalingMode } = useCall();
  const {
    isRecording,
    isRequestingPermission,
    duration,
    audioBlob,
    mimeType,
    stream,
    startRecording,
    stopRecording,
    cancelRecording,
    error: recorderError,
  } = useVoiceRecorder();

  const chatName = getChatDisplayName(chat, currentUserId);
  const chatPhoto = getChatDisplayPhoto(chat, currentUserId);
  const isGroup = chat.type !== 'private';
  const otherMember = chat.type === 'private'
    ? chat.membersInfo.find((m) => m.uid && m.uid !== currentUserId)
    : null;
  // Detect self-chat from the authoritative members array (all UIDs identical)
  // membersInfo can contain stale/mismatched UIDs, so don't rely on it for this check.
  const isSelfChat = chat.type === 'private' && new Set(chat.members).size <= 1;
  const otherUserProfile = otherMember?.uid
    ? allUsers.find(u => u.uid === otherMember.uid) ?? null
    : null;
  const canCall = !!otherMember?.uid && callState.status === 'idle';

  useEffect(() => {
    onSetTypingRef.current = onSetTyping;
  }, [onSetTyping]);

  useEffect(() => {
    if (videoPreviewRef.current && stream && recordingMode === 'video') {
      videoPreviewRef.current.srcObject = stream;
    }
  }, [stream, recordingMode]);

  useEffect(() => {
    if (recorderError && !isRequestingPermission) setRecordingMode(null);
  }, [isRequestingPermission, recorderError]);

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
      onSetTypingRef.current(false);
    };
  }, [chat.id]);

  useEffect(() => {
    const container = messagesContainerRef.current;
    if (!container) return;

    if (!hasInitializedRef.current) {
      hasInitializedRef.current = true;
      // Scroll to bottom on first load (covers fresh open, push/bell entry)
      requestAnimationFrame(() => {
        if (container) {
          container.scrollTop = container.scrollHeight;
          isAtBottomRef.current = true;
        }
      });
      return;
    }

    if (prevScrollHeightRef.current > 0) {
      const diff = container.scrollHeight - prevScrollHeightRef.current;
      if (diff > 0) container.scrollTop = diff;
      prevScrollHeightRef.current = 0;
      isAtBottomRef.current = false;
    } else if (isAtBottomRef.current) {
      container.scrollTop = container.scrollHeight;
    }
  }, [messages, typingUsers, pendingCount]);

  useEffect(() => {
    setReplyTo(null);
    setText('');
    setShowEmoji(false);
    setShowAttach(false);
    setShowSearch(false);
    setSearchQuery('');
    prevScrollHeightRef.current = 0;
    hasInitializedRef.current = false;
    isAtBottomRef.current = false;
    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
      typingTimeoutRef.current = null;
    }
    onSetTypingRef.current(false);
  }, [chat.id]);

  // Close info panel when switching chats
  useEffect(() => {
    setShowInfo(false);
    chatOpenedAtRef.current = Date.now();
    markedReadRef.current.clear();
  }, [chat.id]);

  // Auto-mark new_message notifications as read only if they arrived AFTER
  // the user opened this chat (i.e. the user is actively watching).
  // Notifications that existed before opening (e.g. triggered by a push)
  // are left untouched so they still appear in the bell.
  useEffect(() => {
    const target = `/chat?id=${chat.id}`;
    for (const n of notifications) {
      if (
        !n.read &&
        n.type === 'new_message' &&
        n.linkUrl === target &&
        !markedReadRef.current.has(n.id) &&
        n.createdAt > chatOpenedAtRef.current
      ) {
        markedReadRef.current.add(n.id);
        void markAsRead(n.id);
      }
    }
  }, [chat.id, notifications, markAsRead]);

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
    const textToSend = text.trim();
    setText('');
    setReplyTo(null);
    setShowEmoji(false);
    onSetTyping(false);
    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
      typingTimeoutRef.current = null;
    }
    if (inputRef.current) inputRef.current.style.height = 'auto';
    isAtBottomRef.current = true;
    await onSendMessage(textToSend, 'text', undefined, reply);
    requestAnimationFrame(() => {
      if (messagesContainerRef.current) {
        messagesContainerRef.current.scrollTop = messagesContainerRef.current.scrollHeight;
      }
    });
    inputRef.current?.focus();
  }, [onSendMessage, onSetTyping, replyTo, setReplyTo, setShowEmoji, setText, text]);

  const handleFileUpload = useCallback(async (file: File) => {
    const isImage = file.type.startsWith('image/');
    const reply = replyTo
      ? { messageId: replyTo.id, text: getReplyPreviewText(replyTo), senderName: replyTo.senderName }
      : null;
    isAtBottomRef.current = true;
    await onSendMessage(file.name, isImage ? 'image' : 'file', file, reply);
    setReplyTo(null);
    setShowAttach(false);
    requestAnimationFrame(() => {
      if (messagesContainerRef.current) {
        messagesContainerRef.current.scrollTop = messagesContainerRef.current.scrollHeight;
      }
    });
  }, [onSendMessage, replyTo, setReplyTo, setShowAttach]);

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
    // Keep scroll at bottom after textarea grows
    if (isAtBottomRef.current && messagesContainerRef.current) {
      const c = messagesContainerRef.current;
      requestAnimationFrame(() => { c.scrollTop = c.scrollHeight; });
    }
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
        if (m.type !== 'text') return false;
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
          const isOtherOnline = !isGroup && (
            isSelfChat ||
            (otherMember?.uid
              ? (otherMember.uid === currentUserId || onlineUsers.some(u => u.uid === otherMember.uid))
              : false)
          );
          const dotColor = !isGroup
            ? statusDotColor(isOtherOnline, otherUserProfile?.status)
            : null;
          return (
            <button
              className="relative shrink-0 cursor-pointer rounded-full focus:outline-none"
              onClick={() => setShowInfo(v => !v)}
              title="מידע על השיחה"
            >
              {chatPhoto ? (
                <img
                  src={chatPhoto}
                  alt=""
                  className="w-10 h-10 rounded-full object-cover"
                  onError={(event) => {
                    event.currentTarget.style.display = 'none';
                    const fallback = event.currentTarget.nextElementSibling;
                    if (fallback instanceof HTMLElement) fallback.style.setProperty('display', 'flex');
                  }}
                />
              ) : null}
              <div
                className="w-10 h-10 rounded-full items-center justify-center text-white font-bold"
                style={{
                  backgroundColor: isGroup ? 'var(--theme-accent)' : 'var(--theme-text-secondary)',
                  display: chatPhoto ? 'none' : 'flex',
                }}
              >
                {chatName.charAt(0)}
              </div>
              {!isGroup && (isSelfChat || !!otherMember?.uid) && (
                <span
                  className="absolute bottom-0 right-0 h-[11px] w-[11px] rounded-full border-2"
                  style={{ backgroundColor: dotColor || 'var(--theme-success)', borderColor: 'var(--theme-bg-secondary)' }}
                />
              )}
            </button>
          );
        })()}

        <button
          className="flex-1 min-w-0 cursor-pointer text-right focus:outline-none"
          onClick={() => setShowInfo(v => !v)}
        >
          <div className="flex items-center gap-1.5">
            <h3 className="truncate text-[15px] font-medium text-[var(--theme-text)]">{chatName}</h3>
            <span title="שיחה לחברי הצ׳אט בלבד">
              <Lock className="h-3 w-3 shrink-0 text-[var(--theme-accent)]" />
            </span>
          </div>
          <p className="text-[12px] text-[var(--theme-text-secondary)]">
            {typingUsers.length > 0 ? (
              <span className="text-[var(--theme-accent)]">{typingUsers.join(', ')} מקליד/ה...</span>
            ) : isGroup ? (
              `${chat.members.length} משתתפים`
            ) : (isSelfChat || otherMember?.uid === currentUserId || onlineUsers.some(u => u.uid === otherMember?.uid)) ? (
              <span className="text-[var(--theme-success)]">מחובר/ת</span>
            ) : formatLastSeen(otherUserProfile?.lastSeen) ? (
              formatLastSeen(otherUserProfile?.lastSeen)
            ) : (
              'לא מחובר/ת'
            )}
          </p>
        </button>

        {v2Enabled && connectionState?.mode === 'connected' && (
          <span className="hidden xl:inline-flex rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-1 text-[11px] font-medium text-emerald-100">
            Socket מחובר
          </span>
        )}

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
          onClick={() => setShowInfo(v => !v)}
          className={`rounded-full p-2 transition-colors ${showInfo ? 'bg-[var(--theme-accent-glow)] text-[var(--theme-accent)]' : 'text-[var(--theme-text-secondary)] hover:bg-[var(--theme-accent-glow)]'}`}
          title="מידע על השיחה"
        >
          <Info className="w-5 h-5" />
        </button>
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

      {isOffline && (
        <div className="flex items-center justify-center gap-2 border-b px-4 py-2" style={{ background: 'rgba(239, 68, 68, 0.15)', borderColor: 'rgba(239, 68, 68, 0.3)' }} dir="rtl">
          <WifiOff className="h-4 w-4 text-red-400" />
          <span className="text-[13px] text-red-300">אין חיבור לרשת — הודעות יישלחו כשהחיבור יחזור</span>
        </div>
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
        className="flex-1 min-h-0 overflow-y-auto py-2"
        dir="ltr"
        onScroll={handleScroll}
        style={{
          background:
            'radial-gradient(circle at 20% 10%, var(--theme-accent-glow), transparent 18rem), var(--theme-bg)',
        }}
      >
        {error && (
          <div className="mx-auto my-3 flex w-fit max-w-[90%] items-center gap-2 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-[13px] text-red-200" dir="rtl">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}
        {(loading || loadingMore) && (
          <div className="flex justify-center py-3">
            <Loader2 className="h-5 w-5 animate-spin text-[var(--theme-accent)]" />
          </div>
        )}
        {!loading && filteredMessages.length === 0 ? (
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
          groupedMessages.map((group, groupIdx) => (
            <div key={`${group.date}-${groupIdx}`}>
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
                    chatMembersInfo={chat.membersInfo?.map(m => ({ uid: m.uid ?? '', displayName: m.displayName, photoURL: m.photoURL }))}
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

      {/* Bottom section: reply bar + input bar, with emoji/attach as absolute overlays */}
      <div className="relative shrink-0">

        {/* Emoji picker — floats above the input bar, doesn't push messages */}
        {showEmoji && !isRecording && (
          <div
            className="absolute bottom-full left-0 right-0 z-20 border-t overflow-hidden"
            style={{ background: 'var(--theme-bg-secondary)', borderColor: 'var(--theme-border)' }}
          >
            <EmojiPicker
              data={emojiData}
              onEmojiSelect={(emoji: { native?: string }) => {
                if (emoji.native) {
                  setText((prev) => prev + emoji.native);
                  inputRef.current?.focus();
                }
              }}
              theme="dark"
              locale="he"
              previewPosition="none"
              skinTonePosition="search"
              maxFrequentRows={2}
              perLine={8}
              set="native"
            />
          </div>
        )}

        {/* Attach panel — floats above the input bar */}
        {showAttach && !isRecording && (
          <div
            className="absolute bottom-full left-0 right-0 z-20 flex justify-center gap-4 border-t p-3"
            style={{ background: 'var(--theme-bg-secondary)', borderColor: 'var(--theme-border)' }}
            dir="rtl"
          >
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

        {/* Reply bar */}
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

      {isRequestingPermission && !isRecording && (
        <div className="border-t px-4 py-2" style={{ background: 'rgba(191, 89, 207, 0.12)', borderColor: 'rgba(191, 89, 207, 0.25)' }} dir="rtl">
          <div className="flex items-center justify-center gap-2 text-[13px] text-[var(--theme-text)]">
            <Loader2 className="h-4 w-4 shrink-0 animate-spin" />
            <span>{recordingMode === 'video' ? 'מחכה לאישור מצלמה ומיקרופון בדפדפן.' : 'מחכה לאישור מיקרופון בדפדפן.'}</span>
          </div>
        </div>
      )}

      {recorderError && !isRecording && !isRequestingPermission && (
        <div className="border-t px-4 py-2" style={{ background: 'rgba(239, 68, 68, 0.12)', borderColor: 'rgba(239, 68, 68, 0.25)' }} dir="rtl">
          <div className="flex items-center justify-center gap-2 text-[13px] text-red-200">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            <span>{recorderError}</span>
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
              className="max-h-[120px] w-full resize-none rounded-lg border px-3 py-[9px] text-[16px] leading-[20px] text-[var(--theme-text)] outline-none placeholder:text-[var(--theme-text-secondary)]"
              style={{ background: 'var(--theme-bg-card)', borderColor: 'var(--theme-border)', scrollbarWidth: 'none' }}
            />
          </div>

          {text.trim() ? (
            <button
              onPointerDown={(e) => e.preventDefault()}
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

      </div>{/* end bottom section */}

      {/* Info Panel — slides over the entire chat */}
      {showInfo && (
        <ChatInfoPanel
          chat={chat}
          currentUserId={currentUserId}
          otherUser={otherUserProfile}
          allUsers={allUsers}
          onlineUsers={onlineUsers}
          onClose={() => setShowInfo(false)}
          onAddMembers={async (memberIds) => {
            if (onAddMembersToGroup) await onAddMembersToGroup(chat.id, memberIds);
          }}
        />
      )}
    </div>
  );
}
