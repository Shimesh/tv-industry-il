'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { MessageCircle } from 'lucide-react';
import AuthGuard from '@/components/AuthGuard';
import ChatSidebar from '@/components/chat/ChatSidebar';
import ChatWindow from '@/components/chat/ChatWindow';
import NewChatModal from '@/components/chat/NewChatModal';
import { useChat } from '@/hooks/useChat';
import { useOnlineStatus } from '@/hooks/useOnlineStatus';
import { useAuth } from '@/contexts/AuthContext';
import { useContacts } from '@/hooks/useContacts';
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
  mergeMessagesWithOptimistic,
  refreshOptimisticSending,
  settleOptimisticMessages,
} from '@/components/chat/chatOptimistic';

function isTruthyFlag(value: string | undefined): boolean {
  return value === '1' || value === 'true' || value === 'on';
}

function getDisplayName(user: { displayName?: string | null; email?: string | null }): string {
  return user.displayName || user.email?.split('@')[0] || 'משתמש';
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
      label: 'צ׳אט Firestore פעיל',
      detail: 'מצב התאימות הישן עדיין פעיל עד שנשלים את המעבר ל־Socket.IO.',
    };
  }

  switch (state.socket) {
    case 'connected':
      return {
        mode: 'connected',
        online: true,
        label: 'Socket.IO מחובר',
        detail: `${formatLastSync(state.lastSyncAt)}${state.pendingQueue > 0 ? ` • ${state.pendingQueue} פעולות ממתינות` : ''}`,
      };
    case 'connecting':
      return {
        mode: 'connecting',
        online: true,
        label: 'מתחבר לצ׳אט בזמן אמת',
        detail: 'אנחנו מקימים כרגע את חיבור ה־Socket. אפשר להמשיך לעבוד כרגיל.',
      };
    case 'reconnecting':
      return {
        mode: 'reconnecting',
        online: true,
        label: 'מחדש חיבור',
        detail: `${formatLastSync(state.lastSyncAt)} • מסנכרנים מחדש הודעות וסטטוסים.`,
      };
    case 'disabled':
    case 'idle':
      return {
        mode: 'preview',
        online: true,
        label: 'מצב היברידי מוכן',
        detail: 'הממשק מוכן ל־Socket.IO, ובינתיים Firestore משמש כשכבת גיבוי.',
      };
    case 'degraded':
    case 'error':
      return {
        mode: 'degraded',
        online: true,
        label: 'חיבור חלקי לצ׳אט',
        detail: 'יש כרגע בעיית realtime. נשארים זמינים דרך Firestore וממשיכים לנסות להתייצב.',
      };
    default:
      return {
        mode: 'offline',
        online: false,
        label: 'אין חיבור לרשת',
        detail: 'הודעות חדשות יישלחו שוב אוטומטית כשהחיבור יחזור.',
      };
  }
}

function ChatEmptyState({
  v2Enabled,
  connectionLabel,
  connectionDetail,
}: {
  v2Enabled: boolean;
  connectionLabel: string;
  connectionDetail: string;
}) {
  return (
    <div className="flex-1 flex flex-col items-center justify-center gap-6 bg-[#222E35]" dir="rtl">
      <div className="w-[200px] h-[200px] rounded-full bg-[#00A88410] flex items-center justify-center">
        <MessageCircle className="w-24 h-24 text-[#00A884] opacity-50" />
      </div>

      <div className="max-w-sm text-center px-6">
        <h2 className="mb-2 text-[22px] font-light text-[#E9EDEF]">
          {v2Enabled ? 'צ׳אט מיידי מוכן' : 'TV Industry IL צ׳אט'}
        </h2>
        <p className="text-[14px] leading-relaxed text-[#8696a0]">
          {v2Enabled
            ? 'בחרו שיחה כדי לראות הודעות בזמן אמת, עם מצב חיבור, אופטימיות וסטטוסים משופרים.'
            : 'שלחו וקבלו הודעות בזמן אמת. בחרו שיחה מהרשימה או התחילו שיחה חדשה.'}
        </p>
      </div>

      <div className="max-w-md rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-right shadow-sm">
        <p className="text-[13px] font-semibold text-[#E9EDEF]">{connectionLabel}</p>
        <p className="mt-1 text-[12px] leading-5 text-[#8696a0]">{connectionDetail}</p>
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
  const { contacts } = useContacts();
  const { showToast } = useToast();
  const {
    chats,
    activeChat,
    activeChatData,
    messages,
    allUsers,
    onlineUsers,
    typingUsers,
    uploadProgress,
    setActiveChat,
    sendMessage,
    deleteMessage,
    createPrivateChat,
    createGroup,
    setTyping,
    connectionState,
    transportMode,
    socketReady,
    lastSyncAt,
  } = useChat();

  const chatV2Enabled = isTruthyFlag(process.env.NEXT_PUBLIC_CHAT_V2_UI);
  const effectiveV2Enabled = chatV2Enabled || transportMode === 'hybrid';
  const [showNewChat, setShowNewChat] = useState(false);
  const [mobileShowChat, setMobileShowChat] = useState(false);
  const [optimisticMessagesByChat, setOptimisticMessagesByChat] = useState<Record<string, ChatUiMessage[]>>({});

  useOnlineStatus(user?.uid);

  const activeChatId = activeChatData?.id ?? activeChat ?? null;
  const bannerConnectionState = useMemo(
    () => mapConnectionState(connectionState, effectiveV2Enabled),
    [connectionState, effectiveV2Enabled]
  );

  const currentOptimisticMessages = activeChatId ? optimisticMessagesByChat[activeChatId] ?? [] : [];

  const visibleMessages = useMemo(() => {
    if (!effectiveV2Enabled) return messages;
    return mergeMessagesWithOptimistic(messages, currentOptimisticMessages, user?.uid ?? null);
  }, [effectiveV2Enabled, currentOptimisticMessages, messages, user?.uid]);

  const pendingCount = useMemo(
    () =>
      Math.max(
        currentOptimisticMessages.filter((message) => message.localState === 'sending').length,
        connectionState.pendingQueue ?? 0
      ),
    [connectionState.pendingQueue, currentOptimisticMessages]
  );

  useEffect(() => {
    if (!effectiveV2Enabled || !activeChatId || !user?.uid) return;

    setOptimisticMessagesByChat((prev) => {
      const queue = prev[activeChatId];
      if (!queue?.length) return prev;

      const settled = settleOptimisticMessages(queue, messages, user.uid);
      if (settled.length === queue.length) return prev;

      if (settled.length === 0) {
        const { [activeChatId]: _removed, ...rest } = prev;
        return rest;
      }

      return {
        ...prev,
        [activeChatId]: settled,
      };
    });
  }, [activeChatId, effectiveV2Enabled, messages, user?.uid]);

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
        const { [chatId]: _removed, ...rest } = prev;
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
      } catch {
        showToast('שגיאה ביצירת שיחה', 'error');
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
      } catch {
        showToast('שגיאה ביצירת שיחה', 'error');
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
      } catch {
        showToast('שגיאה ביצירת קבוצה', 'error');
      }
    },
    [createGroup, setActiveChat, showToast, user]
  );

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

      const payload: ChatOptimisticPayload = {
        text: type === 'text' ? text : file?.name || text,
        type,
        file: file || null,
        fileName: file?.name || null,
        fileSize: file?.size || null,
        duration: duration ?? null,
        mimeType: mimeType || file?.type || null,
        replyTo,
      };

      const optimisticMessage = effectiveV2Enabled ? queueOptimisticMessage(payload) : null;

      try {
        await sendMessage(text, type, file, replyTo, duration, mimeType);
      } catch {
        if (effectiveV2Enabled && activeChatId && optimisticMessage?.optimisticId) {
          updateOptimisticMessage(
            activeChatId,
            optimisticMessage.optimisticId,
            (message) => markOptimisticFailed(message, 'השליחה נכשלה')
          );
        }
        showToast('שגיאה בשליחת ההודעה', 'error');
      }
    },
    [activeChatId, effectiveV2Enabled, queueOptimisticMessage, sendMessage, showToast, updateOptimisticMessage, user]
  );

  const handleRetryOptimisticMessage = useCallback(
    async (message: ChatUiMessage) => {
      if (!user || !activeChatId || !message.localPayload) return;

      updateOptimisticMessage(activeChatId, message.optimisticId || message.id, refreshOptimisticSending);

      try {
        await sendMessage(
          message.localPayload.text,
          message.localPayload.type as 'text' | 'image' | 'file' | 'voice' | 'video',
          message.localPayload.file || undefined,
          message.localPayload.replyTo || null,
          message.localPayload.duration ?? undefined,
          message.localPayload.mimeType || undefined
        );
      } catch {
        updateOptimisticMessage(
          activeChatId,
          message.optimisticId || message.id,
          (current) => markOptimisticFailed(current, 'הניסיון החוזר נכשל')
        );
        showToast('שגיאה בשליחה החוזרת', 'error');
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

  if (!user) return null;

  return (
    <div className="h-[calc(100vh-4rem)] flex overflow-hidden bg-[#111B21]" dir="rtl">
      <div className={`w-full lg:w-[320px] xl:w-[360px] shrink-0 relative ${mobileShowChat ? 'hidden lg:block' : 'block'}`}>
        <ChatSidebar
          chats={chats}
          activeChatId={activeChat}
          currentUserId={user.uid}
          onlineUsers={onlineUsers}
          onSelectChat={handleSelectChat}
          onNewChat={() => setShowNewChat(true)}
          onSelectOnlineUser={handleSelectOnlineUser}
        />
      </div>

      <div className={`flex-1 flex flex-col min-w-0 ${!mobileShowChat ? 'hidden lg:flex' : 'flex'}`}>
        {activeChatData ? (
          <ChatWindow
            chat={activeChatData}
            messages={visibleMessages}
            currentUserId={user.uid}
            typingUsers={typingUsers}
            uploadProgress={uploadProgress}
            connectionState={bannerConnectionState}
            v2Enabled={effectiveV2Enabled}
            pendingCount={pendingCount}
            onSendMessage={handleSendMessage}
            onDeleteMessage={deleteMessage}
            onSetTyping={setTyping}
            onBack={() => setMobileShowChat(false)}
            onRetryOptimisticMessage={handleRetryOptimisticMessage}
            onDismissOptimisticMessage={handleDismissOptimisticMessage}
          />
        ) : (
          <ChatEmptyState
            v2Enabled={effectiveV2Enabled}
            connectionLabel={bannerConnectionState.label}
            connectionDetail={bannerConnectionState.detail}
          />
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
