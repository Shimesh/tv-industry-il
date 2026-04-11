import { chatV2Rooms } from '../../src/lib/chat-v2/protocol.js';

export function buildPersonalRoom(uid: string): string {
  return chatV2Rooms.personal(uid);
}

export function buildChatRoom(chatId: string): string {
  return chatV2Rooms.chat(chatId);
}

export function buildCallRoom(callId: string): string {
  return chatV2Rooms.call(callId);
}

