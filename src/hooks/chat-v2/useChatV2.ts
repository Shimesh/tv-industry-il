'use client';

import { useChat as useChatV1Compatible } from './useChat';
import type { UserProfile } from '@/contexts/AuthContext';

export function useChatV2({ allUsers = [] }: { allUsers?: UserProfile[] } = {}) {
  return useChatV1Compatible({ allUsers });
}
