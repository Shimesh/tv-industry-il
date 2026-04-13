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
  const isAtBottomRef = useRef(true);
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
    isAtBottomRef.current = true;
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
    typingTimeoutRef.current = setTimeout(() => onSetTyping(false), 2000);
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
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
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
    <div className="flex-1 flex flex-col bg-[#0B141A] h-full relative">
      <div className="flex items-center gap-3 px-4 py-[10px] bg-[#202C33] border-b border-[#2A3942] shrink-0" dir="rtl">
        <button
          onClick={onBack}
          className="lg:hidden p-1.5 -mr-1 rounded-full hover:bg-[#2A3942] transition-colors"
        >
          <ArrowRight className="w-5 h-5 text-[#AEBAC1]" />
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
                  style={{ backgroundColor: isGroup ? '#00A884' : '#6B7C85' }}
                >
                  {chatName.charAt(0)}
                </div>
              )}
              {isOtherOnline && (
                <span className="absolute bottom-0 left-0 w-[11px] h-[11px] rounded-full bg-[#00A884] border-2 border-[#202C33]" />
              )}
            </div>
          );
        })()}

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <h3 className="text-[15px] font-medium text-[#E9EDEF] truncate">{chatName}</h3>
            <span title="צ׳אט מוגן">
              <Lock className="w-3 h-3 text-[#00A884] shrink-0" />
            </span>
          </div>
          <p className="text-[12px] text-[#8696a0]">
            {typingUsers.length > 0 ? (
              <span className="text-[#00A884]">{typingUsers.join(', ')} מקליד/ה...</span>
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

        <span className="hidden xl:inline-flex rounded-full border border-white/10 bg-white/5 px-2 py-1 text-[11px] text-[#AEBAC1]">
          {signalingMode === 'socket-ready' ? 'שיחות מוכנות דרך Socket.IO' : 'שיחות דרך Firestore'}
        </span>

        {chat.type === 'private' && otherMember?.uid && (
          <>
            <button
              onClick={() => startCall(otherMember.uid!, otherMember.displayName, 'voice')}
              disabled={!canCall}
              className="p-2 rounded-full hover:bg-[#2A3942] transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              title="שיחת קול"
            >
              <Phone className="w-5 h-5 text-[#AEBAC1]" />
            </button>
            <button
              onClick={() => startCall(otherMember.uid!, otherMember.displayName, 'video')}
              disabled={!canCall}
              className="p-2 rounded-full hover:bg-[#2A3942] transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              title="שיחת וידאו"
            >
              <Video className="w-5 h-5 text-[#AEBAC1]" />
            </button>
          </>
        )}

        <button
          onClick={() => {
            setShowSearch((s) => !s);
            setSearchQuery('');
          }}
          className={`p-2 rounded-full transition-colors ${showSearch ? 'bg-[#2A3942] text-[#00A884]' : 'hover:bg-[#2A3942] text-[#AEBAC1]'}`}
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
        <div className="px-4 py-3 bg-[#202C33] border-b border-[#2A3942]">
          <div className="relative">
            <Search className="w-4 h-4 text-[#8696a0] absolute right-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="חיפוש בהודעות..."
              className="w-full bg-[#2A3942] text-[#E9EDEF] placeholder:text-[#8696a0] rounded-lg pr-10 pl-4 py-2.5 outline-none"
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
          backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23ffffff' fill-opacity='0.015'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")`,
        }}
      >
        {loadingMore && (
          <div className="flex justify-center py-3">
            <div className="w-5 h-5 border-2 border-[#00A884] border-t-transparent rounded-full animate-spin" />
          </div>
        )}
        {filteredMessages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full gap-3">
            <div className="w-20 h-20 rounded-full bg-[#00A88415] flex items-center justify-center">
              {searchQuery.trim() ? (
                <Search className="w-8 h-8 text-[#8696a0]" />
              ) : (
                <Send className="w-8 h-8 text-[#00A884]" />
              )}
            </div>
            <p className="text-[14px] text-[#8696a0]" dir="rtl">
              {searchQuery.trim() ? `אין תוצאות עבור "${searchQuery}"` : 'שלחו את ההודעה הראשונה'}
            </p>
          </div>
        ) : (
          groupedMessages.map((group) => (
            <div key={group.date}>
              <div className="flex justify-center my-3">
                <span className="text-[12.5px] px-3 py-[5px] rounded-[7.5px] bg-[#182229] text-[#8696a0e6] shadow-sm">
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
            <div className="bg-[#202C33] rounded-[7.5px] rounded-tl-[0px] px-3 py-2 shadow-sm">
              <div className="flex gap-1 items-center">
                <span className="w-2 h-2 rounded-full bg-[#8696a0] animate-bounce" style={{ animationDelay: '0ms' }} />
                <span className="w-2 h-2 rounded-full bg-[#8696a0] animate-bounce" style={{ animationDelay: '150ms' }} />
                <span className="w-2 h-2 rounded-full bg-[#8696a0] animate-bounce" style={{ animationDelay: '300ms' }} />
              </div>
            </div>
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {replyTo && !isRecording && (
        <div className="flex items-center gap-3 px-4 py-2 bg-[#1A2731] border-t border-[#2A3942]" dir="rtl">
          <div className="flex-1 min-w-0 border-r-[3px] border-[#00A884] pr-3">
            <p className="text-[12px] font-medium text-[#00A884]">{replyTo.senderName}</p>
            <p className="text-[12px] text-[#8696a0] truncate">{getReplyPreviewText(replyTo)}</p>
          </div>
          <button onClick={() => setReplyTo(null)} className="p-1 hover:bg-[#2A3942] rounded-full transition-colors">
            <X className="w-4 h-4 text-[#8696a0]" />
          </button>
        </div>
      )}

      {showEmoji && !isRecording && (
        <div className="bg-[#202C33] border-t border-[#2A3942] p-3" dir="rtl">
          <div className="grid grid-cols-10 gap-1 max-h-[120px] overflow-y-auto">
            {EMOJI_LIST.map((emoji) => (
              <button
                key={emoji}
                onClick={() => {
                  setText((prev) => prev + emoji);
                  inputRef.current?.focus();
                }}
                className="w-8 h-8 flex items-center justify-center rounded hover:bg-[#2A3942] text-lg transition-colors"
              >
                {emoji}
              </button>
            ))}
          </div>
        </div>
      )}

      {showAttach && !isRecording && (
        <div className="bg-[#202C33] border-t border-[#2A3942] p-3 flex gap-4 justify-center" dir="rtl">
          <button
            onClick={() => imageInputRef.current?.click()}
            className="flex flex-col items-center gap-1.5 p-3 rounded-xl hover:bg-[#2A3942] transition-colors"
          >
            <div className="w-12 h-12 rounded-full bg-[#BF59CF] flex items-center justify-center">
              <ImageIcon className="w-6 h-6 text-white" />
            </div>
            <span className="text-[11px] text-[#8696a0]">תמונה</span>
          </button>
          <button
            onClick={() => fileInputRef.current?.click()}
            className="flex flex-col items-center gap-1.5 p-3 rounded-xl hover:bg-[#2A3942] transition-colors"
          >
            <div className="w-12 h-12 rounded-full bg-[#5157AE] flex items-center justify-center">
              <FileText className="w-6 h-6 text-white" />
            </div>
            <span className="text-[11px] text-[#8696a0]">מסמך</span>
          </button>
          <button
            onClick={handleStartVideo}
            className="flex flex-col items-center gap-1.5 p-3 rounded-xl hover:bg-[#2A3942] transition-colors"
          >
            <div className="w-12 h-12 rounded-full bg-[#E03E3E] flex items-center justify-center">
              <VideoIcon className="w-6 h-6 text-white" />
            </div>
            <span className="text-[11px] text-[#8696a0]">וידאו</span>
          </button>
        </div>
      )}

      {isRecording && recordingMode === 'video' && (
        <div className="bg-[#111B21] border-t border-[#2A3942] p-2 flex justify-center">
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
        <div className="px-4 py-1.5 bg-[#1A2731] border-t border-[#2A3942]" dir="rtl">
          <div className="flex items-center gap-2">
            <span className="text-[11px] text-[#8696a0] shrink-0">מעלה... {uploadProgress}%</span>
            <div className="flex-1 h-1 rounded-full bg-[#2A3942] overflow-hidden">
              <div
                className="h-full rounded-full bg-[#00A884] transition-all duration-200"
                style={{ width: `${uploadProgress}%` }}
              />
            </div>
          </div>
        </div>
      )}

      {isRecording ? (
        <div className="flex items-center gap-3 px-4 py-3 bg-[#202C33] border-t border-[#2A3942]" dir="rtl">
          <button
            onClick={handleCancelRecording}
            className="p-2 rounded-full bg-[#2A3942] hover:bg-[#3A4952] transition-colors shrink-0"
            title="ביטול"
          >
            <X className="w-5 h-5 text-[#8696a0]" />
          </button>

          <div className="flex-1 flex items-center gap-2 px-3 py-2 rounded-full bg-[#2A3942]">
            <span className="w-2.5 h-2.5 rounded-full bg-red-500 animate-pulse shrink-0" />
            <span className="text-[13px] text-[#E9EDEF] font-medium">
              {recordingMode === 'video' ? 'וידאו' : 'קול'} מקליט... {formatRecordingDuration(duration)}
            </span>
          </div>

          <button
            onClick={handleStopAndSend}
            className="p-2.5 rounded-full bg-[#00A884] hover:bg-[#06CF9C] transition-colors shrink-0"
            title="שלח"
          >
            <Send className="w-5 h-5 text-[#111B21]" />
          </button>
        </div>
      ) : (
        <div className="flex items-end gap-2 px-3 py-2 bg-[#202C33] border-t border-[#2A3942]" dir="rtl">
          <button
            onClick={() => {
              setShowEmoji(!showEmoji);
              setShowAttach(false);
            }}
            className={`p-2 rounded-full transition-colors shrink-0 ${showEmoji ? 'text-[#00A884]' : 'text-[#8696a0] hover:text-[#E9EDEF]'}`}
          >
            <Smile className="w-6 h-6" />
          </button>

          <button
            onClick={() => {
              setShowAttach(!showAttach);
              setShowEmoji(false);
            }}
            className={`p-2 rounded-full transition-colors shrink-0 ${showAttach ? 'text-[#00A884]' : 'text-[#8696a0] hover:text-[#E9EDEF]'}`}
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
              className="w-full px-3 py-[9px] rounded-lg text-[14px] text-[#E9EDEF] bg-[#2A3942] placeholder:text-[#8696a0] outline-none resize-none leading-[20px] max-h-[120px]"
              style={{ scrollbarWidth: 'none' }}
            />
          </div>

          {text.trim() ? (
            <button
              onClick={handleSend}
              className="p-2.5 rounded-full bg-[#00A884] hover:bg-[#06CF9C] transition-colors shrink-0"
            >
              <Send className="w-5 h-5 text-[#111B21]" />
            </button>
          ) : (
            <button
              onClick={handleStartVoice}
              className="p-2 rounded-full text-[#8696a0] hover:text-[#E9EDEF] hover:bg-[#2A3942] transition-colors shrink-0"
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
