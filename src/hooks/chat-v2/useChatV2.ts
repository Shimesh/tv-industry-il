'use client';

import { useChat as useChatV1Compatible } from './useChat';

export function useChatV2() {
  return useChatV1Compatible();
}
