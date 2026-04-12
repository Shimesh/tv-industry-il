import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { getFirestore } from '../firebaseAdmin.js';
import type {
  ChatV2Attachment,
  ChatV2AttachmentCompletePayload,
  ChatV2AttachmentInitPayload,
  ChatV2ChatRoom,
  ChatV2DeltaPayload,
  ChatV2Message,
  ChatV2MessageAcceptedPayload,
  ChatV2MessageUpdatePayload,
  ChatV2ReceiptUpdatePayload,
  ChatV2MessageStatus,
  ChatV2PresenceHeartbeatPayload,
  ChatV2SnapshotPayload,
  ChatV2UploadUrlPayload,
} from '../../../src/lib/chat-v2/protocol.js';

export interface PersistedMessageInput {
  chatId: string;
  clientMessageId: string;
  senderId: string;
  senderName: string;
  senderPhoto: string | null;
  text: string;
  kind: ChatV2Message['kind'];
  replyTo: ChatV2Message['replyTo'];
  attachments: ChatV2Attachment[];
  encrypted?: boolean;
  createdAtClient?: number;
}

export interface PersistedMessageResult {
  accepted: ChatV2MessageAcceptedPayload;
  roomDelta: ChatV2DeltaPayload;
  memberUids: string[];
}

export interface PersistedReceiptResult {
  receiptUpdates: ChatV2ReceiptUpdatePayload[];
  roomDelta: ChatV2DeltaPayload | null;
  memberUids: string[];
}

export interface PersistedUploadCompletionResult {
  messageUpdate: ChatV2MessageUpdatePayload;
  memberUids: string[];
}

export interface ChatPersistence {
  loadChatSnapshot(chatId: string, viewerUid: string, lastKnownServerCursor?: number | null): Promise<ChatV2SnapshotPayload>;
  getChatMembers(chatId: string, viewerUid: string): Promise<string[]>;
  persistMessage(input: PersistedMessageInput): Promise<PersistedMessageResult>;
  markDelivered(chatId: string, messageIds: string[], viewerUid: string): Promise<PersistedReceiptResult>;
  markRead(chatId: string, messageIds: string[], viewerUid: string): Promise<PersistedReceiptResult>;
  updatePresence(uid: string, payload: ChatV2PresenceHeartbeatPayload & { displayName?: string; photoURL?: string | null }): Promise<void>;
  createUploadSession(payload: ChatV2AttachmentInitPayload, requesterUid: string): Promise<ChatV2UploadUrlPayload>;
  completeUpload(payload: ChatV2AttachmentCompletePayload, requesterUid: string): Promise<PersistedUploadCompletionResult>;
  persistCallEvent(payload: Record<string, unknown>): Promise<void>;
}

function toMillis(value: unknown): number {
  if (typeof value === 'number') return value;
  if (value instanceof Date) return value.getTime();
  if (value instanceof Timestamp) return value.toMillis();
  return Date.now();
}

function mapMessage(chatId: string, id: string, data: Record<string, unknown>): ChatV2Message {
  const createdAtClient = toMillis(data.createdAtClient ?? data.createdAt ?? Date.now());
  const createdAtServer = data.createdAtServer ? toMillis(data.createdAtServer) : null;

  return {
    id,
    chatId,
    clientMessageId: String(data.clientMessageId || id),
    serverMessageId: (data.serverMessageId as string | null | undefined) ?? id,
    serverSequence: typeof data.serverSequence === 'number' ? data.serverSequence : null,
    senderId: String(data.senderId || ''),
    senderName: String(data.senderName || ''),
    senderPhoto: (data.senderPhoto as string | null | undefined) ?? null,
    text: String(data.text || ''),
    kind: (data.kind as ChatV2Message['kind']) || 'text',
    status: (data.status as ChatV2MessageStatus) || 'sent',
    replyTo: (data.replyTo as ChatV2Message['replyTo']) || null,
    attachments: Array.isArray(data.attachments) ? (data.attachments as ChatV2Attachment[]) : [],
    upload: (data.upload as ChatV2Message['upload']) || null,
    readBy: (data.readBy as Record<string, number>) || {},
    deliveredTo: (data.deliveredTo as Record<string, number>) || {},
    reactions: (data.reactions as Record<string, string[]>) || {},
    createdAtClient,
    createdAtServer,
    editedAt: (data.editedAt as number | null | undefined) ?? null,
    deletedAt: (data.deletedAt as number | null | undefined) ?? null,
    forwardedFrom: (data.forwardedFrom as ChatV2Message['forwardedFrom']) ?? null,
    encrypted: Boolean(data.encrypted),
  };
}

function toMembers(data: Record<string, unknown>): string[] {
  return Array.isArray(data.members) ? data.members.filter((value): value is string => typeof value === 'string') : [];
}

function buildRoomDelta(
  chatId: string,
  patch: Partial<ChatV2ChatRoom>,
  cursor: number
): ChatV2DeltaPayload {
  return {
    chatId,
    chat: patch,
    cursor,
  };
}

function buildUploadState(payload: ChatV2AttachmentCompletePayload, uploadId: string) {
  return {
    uploadId,
    status: 'uploaded' as const,
    storagePath: payload.storagePath,
    progress: 100,
    url: payload.url,
    error: null,
  };
}

export class FirestoreChatPersistence implements ChatPersistence {
  constructor(private readonly db = getFirestore()) {}

  private runTransaction<T>(handler: (transaction: any) => Promise<T>): Promise<T> {
    return (this.db as unknown as {
      runTransaction<R>(updateFunction: (transaction: any) => Promise<R>): Promise<R>;
    }).runTransaction(handler);
  }

  private async getAuthorizedChat(chatId: string, uid: string) {
    const chatRef = this.db.collection('chats').doc(chatId);
    const chatSnap = await chatRef.get();

    if (!chatSnap.exists) {
      throw new Error('chat_not_found');
    }

    const chatData = (chatSnap.data() || {}) as Record<string, unknown>;
    const members = toMembers(chatData);

    if (!members.includes(uid)) {
      throw new Error('not_a_member');
    }

    return { chatRef, chatSnap, chatData, members };
  }

  async loadChatSnapshot(chatId: string, viewerUid: string, lastKnownServerCursor?: number | null): Promise<ChatV2SnapshotPayload> {
    const { chatRef, chatSnap, chatData } = await this.getAuthorizedChat(chatId, viewerUid);
    const chat: ChatV2ChatRoom = {
      id: chatSnap.id,
      type: (chatData.type as ChatV2ChatRoom['type']) || 'general',
      name: String(chatData.name || ''),
      photoURL: (chatData.photoURL as string | null | undefined) ?? null,
      members: (chatData.members as string[]) || [],
      membersInfo: (chatData.membersInfo as ChatV2ChatRoom['membersInfo']) || [],
      admins: (chatData.admins as string[]) || [],
      encryptedKeys: (chatData.encryptedKeys as Record<string, string> | null) ?? null,
      lastMessage: (chatData.lastMessage as ChatV2ChatRoom['lastMessage']) ?? null,
      lastServerSequence: (chatData.lastServerSequence as number | null | undefined) ?? null,
      unreadCount: (chatData.unreadCount as Record<string, number>) || {},
      lastRead: (chatData.lastRead as Record<string, number>) || {},
      presenceSummary: (chatData.presenceSummary as ChatV2ChatRoom['presenceSummary']) || {},
      groupPermissions: (chatData.groupPermissions as ChatV2ChatRoom['groupPermissions']) ?? null,
      pinnedMessageIds: (chatData.pinnedMessageIds as string[]) || [],
      mutedBy: (chatData.mutedBy as string[]) || [],
      archivedBy: (chatData.archivedBy as string[]) || [],
      createdAt: chatData.createdAt ? toMillis(chatData.createdAt) : null,
      version: (chatData.version as number | undefined) || 2,
    };

    let messagesQuery = chatRef.collection('messages').orderBy('createdAt', 'asc').limit(200);
    if (typeof lastKnownServerCursor === 'number') {
      messagesQuery = chatRef
        .collection('messages')
        .where('serverSequence', '>', lastKnownServerCursor)
        .orderBy('serverSequence', 'asc')
        .limit(200);
    }

    const msgSnap = await messagesQuery.get();
    const messages = msgSnap.docs.map((docSnap: { id: string; data(): Record<string, unknown> }) =>
      mapMessage(chatId, docSnap.id, docSnap.data())
    );
    const cursor = messages.reduce((max: number, message: ChatV2Message) => Math.max(max, message.serverSequence ?? 0), chat.lastServerSequence ?? 0);

    await chatRef.set(
      {
        lastSeenAt: FieldValue.serverTimestamp(),
        [`lastSeenBy.${viewerUid}`]: FieldValue.serverTimestamp(),
      },
      { merge: true }
    );

    return { chat, messages, cursor };
  }

  async getChatMembers(chatId: string, viewerUid: string): Promise<string[]> {
    const { members } = await this.getAuthorizedChat(chatId, viewerUid);
    return members;
  }

  async persistMessage(input: PersistedMessageInput): Promise<PersistedMessageResult> {
    const chatRef = this.db.collection('chats').doc(input.chatId);
    const messageRef = chatRef.collection('messages').doc();
    const createdAtServer = Timestamp.now();
    const createdAtServerMillis = createdAtServer.toMillis();
    const result = await this.runTransaction(async (transaction) => {
      const chatSnap = await transaction.get(chatRef);

      if (!chatSnap.exists) {
        throw new Error('chat_not_found');
      }

      const chatData = (chatSnap.data() || {}) as Record<string, unknown>;
      const members = toMembers(chatData);

      if (!members.includes(input.senderId)) {
        throw new Error('not_a_member');
      }

      const serverSequence =
        typeof chatData.lastServerSequence === 'number' ? chatData.lastServerSequence + 1 : 1;
      const unreadCount = { ...((chatData.unreadCount as Record<string, number> | undefined) ?? {}) };

      for (const memberUid of members) {
        if (memberUid === input.senderId) continue;
        unreadCount[memberUid] = (unreadCount[memberUid] ?? 0) + 1;
      }

      transaction.set(messageRef, {
        chatId: input.chatId,
        clientMessageId: input.clientMessageId,
        serverMessageId: messageRef.id,
        serverSequence,
        senderId: input.senderId,
        senderName: input.senderName,
        senderPhoto: input.senderPhoto,
        text: input.text,
        kind: input.kind,
        status: 'sent' satisfies ChatV2MessageStatus,
        replyTo: input.replyTo ?? null,
        attachments: input.attachments,
        readBy: {},
        deliveredTo: {},
        reactions: {},
        upload: null,
        encrypted: Boolean(input.encrypted),
        createdAt: createdAtServer,
        createdAtClient: input.createdAtClient ?? Date.now(),
        createdAtServer,
        updatedAt: createdAtServer,
      });

      transaction.set(
        chatRef,
        {
          lastMessage: {
            text: input.text,
            senderId: input.senderId,
            senderName: input.senderName,
            timestamp: createdAtServerMillis,
            kind: input.kind,
          },
          lastServerSequence: serverSequence,
          unreadCount,
          updatedAt: createdAtServer,
        },
        { merge: true }
      );

      return {
        accepted: {
          chatId: input.chatId,
          clientMessageId: input.clientMessageId,
          serverMessageId: messageRef.id,
          serverSequence,
          status: 'sent' as const,
          createdAtServer: createdAtServerMillis,
        },
        roomDelta: buildRoomDelta(
          input.chatId,
          {
            lastMessage: {
              text: input.text,
              senderId: input.senderId,
              senderName: input.senderName,
              timestamp: createdAtServerMillis,
              kind: input.kind,
            },
            lastServerSequence: serverSequence,
            unreadCount,
          },
          serverSequence
        ),
        memberUids: members,
      };
    });

    return result;
  }

  async markDelivered(chatId: string, messageIds: string[], viewerUid: string): Promise<PersistedReceiptResult> {
    const { chatRef, members } = await this.getAuthorizedChat(chatId, viewerUid);
    const deliveredAt = Date.now();
    const batch = this.db.batch();

    for (const messageId of messageIds) {
      batch.set(
        chatRef.collection('messages').doc(messageId),
        {
          [`deliveredTo.${viewerUid}`]: deliveredAt,
          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true }
      );
    }

    await batch.commit();

    return {
      receiptUpdates: messageIds.map((messageId) => ({
        chatId,
        messageId,
        deliveredTo: { [viewerUid]: deliveredAt },
      })),
      roomDelta: null,
      memberUids: members,
    };
  }

  async markRead(chatId: string, messageIds: string[], viewerUid: string): Promise<PersistedReceiptResult> {
    const chatRef = this.db.collection('chats').doc(chatId);
    const readAt = Date.now();
    const result = await this.runTransaction(async (transaction) => {
      const chatSnap = await transaction.get(chatRef);

      if (!chatSnap.exists) {
        throw new Error('chat_not_found');
      }

      const chatData = (chatSnap.data() || {}) as Record<string, unknown>;
      const members = toMembers(chatData);

      if (!members.includes(viewerUid)) {
        throw new Error('not_a_member');
      }

      for (const messageId of messageIds) {
        transaction.set(
          chatRef.collection('messages').doc(messageId),
          {
            [`readBy.${viewerUid}`]: readAt,
            updatedAt: FieldValue.serverTimestamp(),
          },
          { merge: true }
        );
      }

      const unreadCount = { ...((chatData.unreadCount as Record<string, number> | undefined) ?? {}) };
      unreadCount[viewerUid] = 0;
      const lastRead = {
        ...((chatData.lastRead as Record<string, number> | undefined) ?? {}),
        [viewerUid]: readAt,
      };
      const cursor =
        typeof chatData.lastServerSequence === 'number' ? chatData.lastServerSequence : 0;

      transaction.set(
        chatRef,
        {
          unreadCount,
          lastRead,
          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true }
      );

      return {
        receiptUpdates: messageIds.map((messageId) => ({
          chatId,
          messageId,
          readBy: { [viewerUid]: readAt },
          unreadCount,
          lastRead,
          serverCursor: cursor,
        })),
        roomDelta: buildRoomDelta(
          chatId,
          {
            unreadCount,
            lastRead,
            lastServerSequence: cursor,
          },
          cursor
        ),
        memberUids: members,
      };
    });

    return result;
  }

  async updatePresence(uid: string, payload: ChatV2PresenceHeartbeatPayload & { displayName?: string; photoURL?: string | null }): Promise<void> {
    await this.db.collection('users').doc(uid).set(
      {
        isOnline: payload.status !== 'offline',
        lastSeen: Date.now(),
        presenceStatus: payload.status || 'online',
        activeChatId: payload.activeChatId ?? null,
        displayName: payload.displayName ?? undefined,
        photoURL: payload.photoURL ?? undefined,
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true }
    );
  }

  async createUploadSession(payload: ChatV2AttachmentInitPayload, requesterUid: string): Promise<ChatV2UploadUrlPayload> {
    await this.getAuthorizedChat(payload.chatId, requesterUid);
    const uploadId = `${payload.chatId}:${payload.clientMessageId}:${Date.now()}`;
    const storagePath = `chat-uploads/${payload.chatId}/${payload.clientMessageId}/${payload.fileName}`;

    await this.db.collection('chats').doc(payload.chatId).collection('uploadSessions').doc(uploadId).set({
      uploadId,
      chatId: payload.chatId,
      clientMessageId: payload.clientMessageId,
      fileName: payload.fileName,
      mimeType: payload.mimeType,
      sizeBytes: payload.sizeBytes,
      storagePath,
      status: 'pending',
      createdAt: FieldValue.serverTimestamp(),
    });

    return {
      chatId: payload.chatId,
      clientMessageId: payload.clientMessageId,
      uploadId,
      storagePath,
      url: null,
    };
  }

  async completeUpload(payload: ChatV2AttachmentCompletePayload, requesterUid: string): Promise<PersistedUploadCompletionResult> {
    const { chatRef, members } = await this.getAuthorizedChat(payload.chatId, requesterUid);
    const uploadSessionsRef = chatRef.collection('uploadSessions');
    const messagesRef = chatRef.collection('messages');
    const result = await this.runTransaction(async (transaction) => {
      const uploadQuery = uploadSessionsRef.where('clientMessageId', '==', payload.clientMessageId).limit(1);
      const uploadSnap = await transaction.get(uploadQuery);

      const uploadDoc = uploadSnap.empty ? null : uploadSnap.docs[0];
      const uploadData = uploadDoc ? ((uploadDoc.data() || {}) as Record<string, unknown>) : null;
      const uploadId =
        typeof uploadData?.uploadId === 'string'
          ? uploadData.uploadId
          : `${payload.chatId}:${payload.clientMessageId}`;

      const messageQuery = messagesRef.where('clientMessageId', '==', payload.clientMessageId).limit(1);
      const messageSnap = await transaction.get(messageQuery);
      const messageDoc = messageSnap.empty ? null : messageSnap.docs[0];
      const messageData = messageDoc ? ((messageDoc.data() || {}) as Record<string, unknown>) : null;

      if (uploadDoc) {
        transaction.set(
          uploadDoc.ref,
          {
            status: 'uploaded',
            storagePath: payload.storagePath,
            url: payload.url,
            completedAt: FieldValue.serverTimestamp(),
          },
          { merge: true }
        );
      }

      const currentAttachments = Array.isArray(messageData?.attachments)
        ? (messageData.attachments as ChatV2Attachment[])
        : [];
      const attachmentUrl = payload.url ?? null;
      const updatedAttachments = currentAttachments.length
        ? currentAttachments.map((attachment) => {
            const matchesStoragePath = attachment.storagePath === payload.storagePath;
            const matchesUploadSession =
              !attachment.storagePath &&
              typeof uploadData?.storagePath === 'string' &&
              uploadData.storagePath === payload.storagePath;
            if (!matchesStoragePath && !matchesUploadSession) {
              return attachment;
            }
            return {
              ...attachment,
              url: attachmentUrl,
            };
          })
        : [{
            storagePath: payload.storagePath,
            fileName: typeof uploadData?.fileName === 'string' ? uploadData.fileName : payload.storagePath.split('/').pop() || 'upload',
            mimeType: typeof uploadData?.mimeType === 'string' ? uploadData.mimeType : 'application/octet-stream',
            sizeBytes: typeof uploadData?.sizeBytes === 'number' ? uploadData.sizeBytes : 0,
            url: attachmentUrl,
          }];

      const messageUpdate: ChatV2MessageUpdatePayload = {
        chatId: payload.chatId,
        messageId: messageDoc?.id ?? payload.clientMessageId,
        clientMessageId: payload.clientMessageId,
        status: (messageData?.status as ChatV2MessageStatus | undefined) ?? 'sent',
        serverSequence: typeof messageData?.serverSequence === 'number' ? messageData.serverSequence : undefined,
        upload: buildUploadState(payload, uploadId),
      };

      if (messageDoc) {
        transaction.set(
          messageDoc.ref,
          {
            upload: messageUpdate.upload,
            attachments: updatedAttachments,
            fileURL: attachmentUrl,
            updatedAt: FieldValue.serverTimestamp(),
          },
          { merge: true }
        );
      }

      return {
        messageUpdate,
        memberUids: members,
      };
    });

    return result;
  }

  async persistCallEvent(payload: Record<string, unknown>): Promise<void> {
    const callId = String(payload.callId || `call-${Date.now()}`);
    await this.db.collection('calls').doc(callId).set(
      {
        ...payload,
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true }
    );
  }
}
