'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { MessageCircle } from 'lucide-react';
import AuthGuard from '@/components/AuthGuard';
import ChatSidebar from '@/components/chat/ChatSidebar';
import ChatWindow from '@/components/chat/ChatWindow';
import NewChatModal from '@/components/chat/NewChatModal';
import MissedCallsPanel from '@/components/call/MissedCallsPanel';
import { useChat } from '@/hooks/useChat';
import { useChatUsers } from '@/hooks/useChatUsers';
import { useAuth } from '@/contexts/AuthContext';
import { useAppData } from '@/contexts/AppDataContext';
import { useToast } from '@/contexts/ToastContext';
import type {
  ChatConnectionState as ChatBannerConnectionState,
  ChatOptimisticPayload,
  ChatUiMessage,
} from '@/components/chat/chatTypes';
import type { ChatConnectionState as ChatTransportConnectionState } from '@/lib/chat-v2/types';
import {
  buildOptimisticMessage,
  markOptimisticFailed,
  markOptimisticSent,
  mergeMessagesWithOptimistic,
  refreshOptimisticSending,
  settleOptimisticMessages,
} from '@/components/chat/chatOptimistic';
import { chatTrace, createChatTraceId } from '@/lib/chatTrace';

function isTruthyFlag(value: string | undefined): boolean {
  return value === '1' || value === 'true' || value === 'on';
}

function getDisplayName(user: { displayName?: string | null; email?: string | null }): string {
  return user.displayName || user.email?.split('@')[0] || 'משתמש';
}

function buildLocalClientMessageId(chatId: string): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `${chatId}:${crypto.randomUUID()}`;
  }

  return `${chatId}:${Date.now()}:${Math.random().toString(36).slice(2, 10)}`;
}

function formatLastSync(lastSyncAt: number | null): string {
  if (!lastSyncAt) return 'ממתין לסנכרון ראשון';
  const deltaSeconds = Math.max(0, Math.round((Date.now() - lastSyncAt) / 1000));
  if (deltaSeconds < 5) return 'סונכרן עכשיו';
  if (deltaSeconds < 60) return `סונכרן לפני ${deltaSeconds} שניות`;
  return `סונכרן לפני ${Math.round(deltaSeconds / 60)} דקות`;
}

function mapConnectionState(
  state: ChatTransportConnectionState,
  chatV2Enabled: boolean
): ChatBannerConnectionState {
  if (!chatV2Enabled) {
    return {
      mode: 'legacy',
      online: true,
      label: '\u05e6\u05f3\u05d0\u05d8 Firestore \u05e4\u05e2\u05d9\u05dc',
      detail: '\u05de\u05e6\u05d1 \u05d4\u05ea\u05d0\u05d9\u05de\u05d5\u05ea \u05d4\u05d9\u05e9\u05df \u05e2\u05d3\u05d9\u05d9\u05df \u05e4\u05e2\u05d9\u05dc \u05e2\u05d3 \u05e9\u05e0\u05e9\u05dc\u05d9\u05dd \u05d0\u05ea \u05d4\u05de\u05e2\u05d1\u05e8 \u05dc\u05beSocket.IO.',
    };
  }

  switch (state.socket) {
    case 'connected':
      return {
        mode: 'connected',
        online: true,
        label: 'Socket.IO \u05de\u05d7\u05d5\u05d1\u05e8',
        detail: formatLastSync(state.lastSyncAt) + (state.pendingQueue > 0 ? ' • ' + state.pendingQueue + ' \u05e4\u05e2\u05d5\u05dc\u05d5\u05ea \u05de\u05de\u05ea\u05d9\u05e0\u05d5\u05ea' : ''),
      };
    case 'connecting':
      return {
        mode: 'connecting',
        online: true,
        label: '\u05de\u05ea\u05d7\u05d1\u05e8 \u05dc\u05e6\u05f3\u05d0\u05d8 \u05d1\u05d6\u05de\u05df \u05d0\u05de\u05ea',
        detail: '\u05d0\u05e0\u05d7\u05e0\u05d5 \u05de\u05e7\u05d9\u05de\u05d9\u05dd \u05db\u05e8\u05d2\u05e2 \u05d0\u05ea \u05d7\u05d9\u05d1\u05d5\u05e8 \u05d4\u05beSocket. \u05d0\u05e4\u05e9\u05e8 \u05dc\u05d4\u05de\u05e9\u05d9\u05da \u05dc\u05e2\u05d1\u05d5\u05d3 \u05db\u05e8\u05d2\u05d9\u05dc.',
      };
    case 'reconnecting':
      return {
        mode: 'reconnecting',
        online: true,
        label: '\u05de\u05d7\u05d3\u05e9 \u05d7\u05d9\u05d1\u05d5\u05e8',
        detail: formatLastSync(state.lastSyncAt) + ' • \u05de\u05e1\u05e0\u05db\u05e8\u05e0\u05d9\u05dd \u05de\u05d7\u05d3\u05e9 \u05d4\u05d5\u05d3\u05e2\u05d5\u05ea \u05d5\u05e1\u05d8\u05d8\u05d5\u05e1\u05d9\u05dd.',
      };
    case 'disabled':
      return {
        mode: 'legacy',
        online: true,
        label: 'Firestore \u05e4\u05e2\u05d9\u05dc',
        detail: 'Socket.IO \u05dc\u05d0 \u05de\u05d5\u05d2\u05d3\u05e8 \u05db\u05e8\u05d2\u05e2. \u05d4\u05e6\u05f3\u05d0\u05d8 \u05e2\u05d5\u05d1\u05d3 \u05d1\u05d6\u05de\u05df \u05d0\u05de\u05ea \u05d3\u05e8\u05da Firestore.',
      };
    case 'idle':
      return {
        mode: 'preview',
        online: true,
        label: 'Firestore \u05e4\u05e2\u05d9\u05dc / Socket \u05de\u05de\u05ea\u05d9\u05df',
        detail: 'Socket.IO \u05d9\u05d5\u05e4\u05e2\u05dc \u05e8\u05e7 \u05d0\u05d7\u05e8\u05d9 \u05d4\u05d2\u05d3\u05e8\u05ea URL \u05d5\u05d3\u05d2\u05dc \u05de\u05ea\u05d0\u05d9\u05dd. Firestore \u05d4\u05d5\u05d0 \u05d4\u05e0\u05ea\u05d9\u05d1 \u05d4\u05e4\u05e2\u05d9\u05dc.',
      };
    case 'degraded':
    case 'error':
      return {
        mode: 'degraded',
        online: true,
        label: '\u05d7\u05d9\u05d1\u05d5\u05e8 \u05d7\u05dc\u05e7\u05d9 \u05dc\u05e6\u05f3\u05d0\u05d8',
        detail: '\u05d9\u05e9 \u05db\u05e8\u05d2\u05e2 \u05d1\u05e2\u05d9\u05d9\u05ea realtime. \u05e0\u05e9\u05d0\u05e8\u05d9\u05dd \u05d6\u05de\u05d9\u05e0\u05d9\u05dd \u05d3\u05e8\u05da Firestore \u05d5\u05de\u05de\u05e9\u05d9\u05db\u05d9\u05dd \u05dc\u05e0\u05e1\u05d5\u05ea \u05dc\u05d4\u05ea\u05d9\u05d9\u05e6\u05d1.',
      };
    default:
      return {
        mode: 'offline',
        online: false,
        label: '\u05d0\u05d9\u05df \u05d7\u05d9\u05d1\u05d5\u05e8 \u05dc\u05e8\u05e9\u05ea',
        detail: '\u05d4\u05d5\u05d3\u05e2\u05d5\u05ea \u05d7\u05d3\u05e9\u05d5\u05ea \u05d9\u05d9\u05e9\u05dc\u05d7\u05d5 \u05e9\u05d5\u05d1 \u05d0\u05d5\u05d8\u05d5\u05de\u05d8\u05d9\u05ea \u05db\u05e9\u05d4\u05d7\u05d9\u05d1\u05d5\u05e8 \u05d9\u05d7\u05d6\u05d5\u05e8.',
      };
  }
}

function ChatEmptyState() {
  return (
    <div className="flex-1 flex flex-col items-center justify-center gap-6" style={{ background: 'var(--theme-bg)' }} dir="rtl">
      <div className="w-[200px] h-[200px] rounded-full flex items-center justify-center" style={{ background: 'var(--theme-accent)1a' }}>
        <MessageCircle className="w-24 h-24 opacity-50" style={{ color: 'var(--theme-accent)' }} />
      </div>

      <div className="max-w-sm text-center px-6">
        <h2 className="mb-2 text-[22px] font-light" style={{ color: 'var(--theme-text)' }}>TV Industry IL צ׳אט</h2>
        <p className="text-[14px] leading-relaxed" style={{ color: 'var(--theme-text-secondary)' }}>
          שלחו וקבלו הודעות בזמן אמת. בחרו שיחה מהרשימה או התחילו שיחה חדשה.
        </p>
      </div>
    </div>
  );
}

export default function ChatPage() {
  return (
    <AuthGuard>
      <ChatContent />
    </AuthGuard>
  );
}

function ChatContent() {
  const { user } = useAuth();
  const { contacts } = useAppData();
  const { showToast } = useToast();
  const searchParams = useSearchParams();
  const allUsers = useChatUsers();
  const {
    chats,
    activeChat,
    activeChatData,
    messages,
    chatsLoading,
    messagesLoading,
    chatError,
    retryChats,
    addMembersToGroup,
    onlineUsers,
    typingUsers,
    uploadProgress,
    setActiveChat,
    sendMessage,
    deleteMessage,
    loadMoreMessages,
    hasMore,
    loadingMore,
    createPrivateChat,
    createGroup,
    setTyping,
    connectionState,
    transportMode,
  } = useChat({ allUsers });

  const chatV2Enabled = isTruthyFlag(process.env.NEXT_PUBLIC_CHAT_V2_UI);
  const showConnectionBanner = chatV2Enabled || transportMode === 'hybrid' || process.env.NODE_ENV !== 'production';
  const [showNewChat, setShowNewChat] = useState(false);
  const [mobileShowChat, setMobileShowChat] = useState(false);
  const [optimisticMessagesByChat, setOptimisticMessagesByChat] = useState<Record<string, ChatUiMessage[]>>({});

  const activeChatId = activeChatData?.id ?? activeChat ?? null;
  const bannerConnectionState = useMemo(
    () => mapConnectionState(connectionState, showConnectionBanner),
    [connectionState, showConnectionBanner]
  );

  const currentOptimisticMessages = useMemo(
    () => (activeChatId ? optimisticMessagesByChat[activeChatId] ?? [] : []),
    [activeChatId, optimisticMessagesByChat]
  );

  const visibleMessages = useMemo(() => {
    return mergeMessagesWithOptimistic(messages, currentOptimisticMessages);
  }, [currentOptimisticMessages, messages]);

  const pendingCount = useMemo(
    () =>
      Math.max(
        currentOptimisticMessages.filter((message) => message.localState === 'sending').length,
        connectionState.pendingQueue ?? 0
      ),
    [connectionState.pendingQueue, currentOptimisticMessages]
  );

  useEffect(() => {
    if (!activeChatId || !user?.uid) return;

    setOptimisticMessagesByChat((prev) => {
      const queue = prev[activeChatId];
      if (!queue?.length) return prev;

      const settled = settleOptimisticMessages(queue, messages, user.uid);
      if (settled.length === queue.length) return prev;

      if (settled.length === 0) {
        const rest = { ...prev };
        delete rest[activeChatId];
        return rest;
      }

      return {
        ...prev,
        [activeChatId]: settled,
      };
    });
  }, [activeChatId, messages, user?.uid]);

  const queueOptimisticMessage = useCallback((payload: ChatOptimisticPayload) => {
    if (!activeChatId || !user) return null;

    const optimistic = buildOptimisticMessage({
      chatId: activeChatId,
      userId: user.uid,
      displayName: getDisplayName(user),
      displayPhoto: user.photoURL || null,
      payload,
    });

    setOptimisticMessagesByChat((prev) => ({
      ...prev,
      [activeChatId]: [...(prev[activeChatId] ?? []), optimistic],
    }));

    return optimistic;
  }, [activeChatId, user]);

  const updateOptimisticMessage = useCallback(
    (chatId: string, optimisticId: string, updater: (message: ChatUiMessage) => ChatUiMessage) => {
      setOptimisticMessagesByChat((prev) => {
        const queue = prev[chatId];
        if (!queue?.length) return prev;

        const nextQueue = queue.map((message) =>
          message.optimisticId === optimisticId ? updater(message) : message
        );

        return {
          ...prev,
          [chatId]: nextQueue,
        };
      });
    },
    []
  );

  const removeOptimisticMessage = useCallback((chatId: string, optimisticId: string) => {
    setOptimisticMessagesByChat((prev) => {
      const queue = prev[chatId];
      if (!queue?.length) return prev;

      const nextQueue = queue.filter((message) => message.optimisticId !== optimisticId);
      if (!nextQueue.length) {
        const rest = { ...prev };
        delete rest[chatId];
        return rest;
      }

      return {
        ...prev,
        [chatId]: nextQueue,
      };
    });
  }, []);

  const handleSelectChat = useCallback(
    (chatId: string) => {
      if (!user) {
        showToast('יש להתחבר כדי לצפות בשיחות', 'error');
        return;
      }
      setActiveChat(chatId);
      setMobileShowChat(true);
    },
    [setActiveChat, showToast, user]
  );

  const handleSelectOnlineUser = useCallback(
    async (userId: string) => {
      if (!user) {
        showToast('יש להתחבר כדי להתחיל שיחה', 'error');
        return;
      }

      try {
        const chatId = await createPrivateChat(userId);
        if (chatId) {
          setActiveChat(chatId);
          setMobileShowChat(true);
        } else {
          showToast('לא ניתן ליצור שיחה חדשה', 'error');
        }
      } catch (error) {
        console.error('[chat] Failed to create private chat:', error);
        const message = error instanceof Error ? error.message : '\u05e9\u05d2\u05d9\u05d0\u05d4 \u05d1\u05e4\u05e2\u05d5\u05dc\u05ea \u05d4\u05e6\u05f3\u05d0\u05d8';
        showToast(message, 'error');
      }
    },
    [createPrivateChat, setActiveChat, showToast, user]
  );

  const handleCreatePrivateChat = useCallback(
    async (userId: string) => {
      if (!user) {
        showToast('יש להתחבר כדי ליצור שיחה', 'error');
        return;
      }

      try {
        const chatId = await createPrivateChat(userId);
        if (chatId) {
          setActiveChat(chatId);
          setMobileShowChat(true);
          setShowNewChat(false);
        } else {
          showToast('לא ניתן ליצור שיחה חדשה', 'error');
        }
      } catch (error) {
        console.error('[chat] Failed to create private chat:', error);
        const message = error instanceof Error ? error.message : '\u05e9\u05d2\u05d9\u05d0\u05d4 \u05d1\u05e4\u05e2\u05d5\u05dc\u05ea \u05d4\u05e6\u05f3\u05d0\u05d8';
        showToast(message, 'error');
      }
    },
    [createPrivateChat, setActiveChat, showToast, user]
  );

  const handleCreateGroup = useCallback(
    async (name: string, memberIds: string[]) => {
      if (!user) {
        showToast('יש להתחבר כדי ליצור קבוצה', 'error');
        return;
      }

      try {
        const chatId = await createGroup(name, memberIds);
        if (chatId) {
          setActiveChat(chatId);
          setMobileShowChat(true);
          setShowNewChat(false);
        } else {
          showToast('לא ניתן ליצור את הקבוצה', 'error');
        }
      } catch (error) {
        console.error('[chat] Failed to create group:', error);
        const message = error instanceof Error ? error.message : '\u05e9\u05d2\u05d9\u05d0\u05d4 \u05d1\u05e4\u05e2\u05d5\u05dc\u05ea \u05d4\u05e6\u05f3\u05d0\u05d8';
        showToast(message, 'error');
      }
    },
    [createGroup, setActiveChat, showToast, user]
  );

  // Auto-open chat when navigating from profile page (/chat?userId=xxx)
  const autoOpenedRef = useRef<string | null>(null);
  useEffect(() => {
    const targetUserId = searchParams.get('userId');
    if (!targetUserId || !user || chatsLoading) return;
    if (autoOpenedRef.current === targetUserId) return;
    autoOpenedRef.current = targetUserId;

    void (async () => {
      try {
        const chatId = await createPrivateChat(targetUserId);
        if (chatId) {
          setActiveChat(chatId);
          setMobileShowChat(true);
        }
      } catch {
        // silent — user can still pick from sidebar
      }
    })();
  }, [searchParams, user, chatsLoading, createPrivateChat, setActiveChat]);

  const handleSendMessage = useCallback(
    async (
      text: string,
      type: 'text' | 'image' | 'file' | 'voice' | 'video',
      file?: File,
      replyTo?: { messageId: string; text: string; senderName: string } | null,
      duration?: number,
      mimeType?: string
    ) => {
      if (!user) {
        showToast('יש להתחבר כדי לשלוח הודעה', 'error');
        return;
      }

      if (!activeChatId) {
        showToast('יש לבחור שיחה לפני שליחת הודעה', 'error');
        return;
      }

      const clientMessageId = buildLocalClientMessageId(activeChatId);
      const traceId = createChatTraceId('ui-send');
      chatTrace('ui-send', 'queued', { traceId, chatId: activeChatId, clientMessageId, type, hasFile: Boolean(file) });
      const payload: ChatOptimisticPayload = {
        clientMessageId,
        text: type === 'text' ? text : file?.name || text,
        type,
        file: file || null,
        fileName: file?.name || null,
        fileSize: file?.size || null,
        duration: duration ?? null,
        mimeType: mimeType || file?.type || null,
        replyTo,
      };

      const optimisticMessage = queueOptimisticMessage(payload);

      try {
        const result = await sendMessage(text, type, file, replyTo, duration, mimeType, clientMessageId);
        chatTrace('ui-send', 'send-resolved', {
          traceId,
          chatId: activeChatId,
          clientMessageId,
          messageId: result?.messageId,
        });
        if (activeChatId && optimisticMessage?.optimisticId) {
          updateOptimisticMessage(activeChatId, optimisticMessage.optimisticId, (message) => ({
            ...markOptimisticSent(message),
            id: result?.messageId || message.id,
            serverMessageId: result?.messageId || message.serverMessageId || null,
            clientMessageId: result?.clientMessageId || message.clientMessageId || undefined,
          }));
        }
      } catch (error) {
        console.error('[chat] Failed to send message:', error);
        chatTrace('ui-send', 'send-failed', { traceId, chatId: activeChatId, clientMessageId, error }, { level: 'error' });
        if (activeChatId && optimisticMessage?.optimisticId) {
          updateOptimisticMessage(
            activeChatId,
            optimisticMessage.optimisticId,
            (message) => markOptimisticFailed(
              message,
              error instanceof Error ? error.message : 'השליחה נכשלה'
            )
          );
        }
        const message = error instanceof Error ? error.message : '\u05e9\u05d2\u05d9\u05d0\u05d4 \u05d1\u05e4\u05e2\u05d5\u05dc\u05ea \u05d4\u05e6\u05f3\u05d0\u05d8';
        showToast(message, 'error');
      }
    },
    [activeChatId, queueOptimisticMessage, sendMessage, showToast, updateOptimisticMessage, user]
  );

  const handleRetryOptimisticMessage = useCallback(
    async (message: ChatUiMessage) => {
      if (!user || !activeChatId || !message.localPayload) return;

      updateOptimisticMessage(activeChatId, message.optimisticId || message.id, refreshOptimisticSending);

      try {
        const result = await sendMessage(
          message.localPayload.text,
          message.localPayload.type as 'text' | 'image' | 'file' | 'voice' | 'video',
          message.localPayload.file || undefined,
          message.localPayload.replyTo || null,
          message.localPayload.duration ?? undefined,
          message.localPayload.mimeType || undefined,
          message.localPayload.clientMessageId || message.clientMessageId || null
        );
        updateOptimisticMessage(
          activeChatId,
          message.optimisticId || message.id,
          (current) => ({
            ...markOptimisticSent(current),
            id: result?.messageId || current.id,
            serverMessageId: result?.messageId || current.serverMessageId || null,
            clientMessageId: result?.clientMessageId || current.clientMessageId || undefined,
          })
        );
      } catch (error) {
        console.error('[chat] Failed to retry message:', error);
        updateOptimisticMessage(
          activeChatId,
          message.optimisticId || message.id,
          (current) => markOptimisticFailed(
            current,
            error instanceof Error ? error.message : 'הניסיון החוזר נכשל'
          )
        );
        const toastMessage = error instanceof Error ? error.message : '\u05e9\u05d2\u05d9\u05d0\u05d4 \u05d1\u05e9\u05dc\u05d9\u05d7\u05d4 \u05d4\u05d7\u05d5\u05d6\u05e8\u05ea';
        showToast(toastMessage, 'error');
      }
    },
    [activeChatId, sendMessage, showToast, updateOptimisticMessage, user]
  );

  const handleDismissOptimisticMessage = useCallback(
    (messageId: string) => {
      if (!activeChatId) return;
      removeOptimisticMessage(activeChatId, messageId);
    },
    [activeChatId, removeOptimisticMessage]
  );

  useEffect(() => {
    const handleNavigationStart = () => {
      setShowNewChat(false);
      setMobileShowChat(false);
      if (activeChatId) {
        setTyping(false);
      }
    };

    window.addEventListener('app:navigation-start', handleNavigationStart as EventListener);

    return () => {
      window.removeEventListener('app:navigation-start', handleNavigationStart as EventListener);
    };
  }, [activeChatId, setTyping]);

  if (!user) return null;

  return (
    <div
      className="relative z-0 flex overflow-hidden"
      dir="rtl"
      style={{
        background: 'var(--theme-bg)',
        height: 'calc(100dvh - var(--app-header-offset))',
      }}
    >
      <div className={`w-full lg:w-[320px] xl:w-[360px] shrink-0 relative flex h-full min-h-0 flex-col ${mobileShowChat ? 'hidden lg:flex' : 'flex'}`}>
        <MissedCallsPanel />
        <div className="min-h-0 flex-1">
          <ChatSidebar
            chats={chats}
            activeChatId={activeChat}
            currentUserId={user.uid}
            onlineUsers={onlineUsers}
            loading={chatsLoading}
            error={chatError}
            onRetry={retryChats}
            onSelectChat={handleSelectChat}
            onNewChat={() => setShowNewChat(true)}
            onSelectOnlineUser={handleSelectOnlineUser}
          />
        </div>
      </div>

      <div className={`flex-1 flex h-full min-h-0 flex-col min-w-0 ${!mobileShowChat ? 'hidden lg:flex' : 'flex'}`}>
        {activeChatData ? (
          <ChatWindow
            chat={activeChatData}
            messages={visibleMessages}
            currentUserId={user.uid}
            typingUsers={typingUsers}
            uploadProgress={uploadProgress}
            loading={messagesLoading}
            error={chatError}
            connectionState={bannerConnectionState}
            v2Enabled={showConnectionBanner}
            pendingCount={pendingCount}
            onSendMessage={handleSendMessage}
            onDeleteMessage={deleteMessage}
            onSetTyping={setTyping}
            onBack={() => setMobileShowChat(false)}
            onRetryOptimisticMessage={handleRetryOptimisticMessage}
            onDismissOptimisticMessage={handleDismissOptimisticMessage}
            hasMore={hasMore}
            loadingMore={loadingMore}
            onLoadMore={loadMoreMessages}
            onlineUsers={onlineUsers}
            allUsers={allUsers}
            onAddMembersToGroup={addMembersToGroup}
          />
        ) : (
          <ChatEmptyState />
        )}
      </div>

      {showNewChat && (
        <NewChatModal
          users={allUsers}
          contacts={contacts}
          onlineUsers={onlineUsers}
          currentUserId={user.uid}
          onCreatePrivate={handleCreatePrivateChat}
          onCreateGroup={handleCreateGroup}
          onClose={() => setShowNewChat(false)}
        />
      )}
    </div>
  );
}
