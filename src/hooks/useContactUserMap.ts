'use client';

import { useMemo } from 'react';
import { useChatUsers } from './useChatUsers';
import { normalizeName } from '@/lib/crewNormalization';

interface ContactUserMaps {
  /** contactId (string) → uid */
  contactIdToUserId: Map<string, string>;
  /** normalized display-name → uid */
  nameToUserId: Map<string, string>;
}

export function useContactUserMap(): ContactUserMaps {
  const users = useChatUsers();

  return useMemo(() => {
    const contactIdToUserId = new Map<string, string>();
    const nameToUserId = new Map<string, string>();

    for (const u of users) {
      if (!u.uid) continue;
      if (u.linkedContactId) {
        contactIdToUserId.set(String(u.linkedContactId), u.uid);
      }
      if (u.displayName) {
        nameToUserId.set(normalizeName(u.displayName), u.uid);
      }
    }

    return { contactIdToUserId, nameToUserId };
  }, [users]);
}
