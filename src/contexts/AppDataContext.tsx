'use client';

import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { useContacts } from '@/hooks/useContacts';
import type { Contact } from '@/data/contacts';
import type { CrewMember } from '@/lib/productionDiff';
import { useAuth } from '@/contexts/AuthContext';

interface AppDataContextType {
  contacts: Contact[];
  contactsReady: boolean;
  contactsLoading: boolean;
  contactsServerConfirmed: boolean;
  contactsSource: 'server' | 'snapshot' | 'cache' | 'unknown';
  contactsError: string | null;
  totalCount: number;
  availableCount: number;
  openToWorkCount: number;
  ensureFromCrew: (crew: CrewMember[]) => Promise<void>;
}

const AppDataContext = createContext<AppDataContextType>({
  contacts: [],
  contactsReady: false,
  contactsLoading: false,
  contactsServerConfirmed: false,
  contactsSource: 'unknown',
  contactsError: null,
  totalCount: 0,
  availableCount: 0,
  openToWorkCount: 0,
  ensureFromCrew: async () => {},
});

export function AppDataProvider({ children }: { children: ReactNode }) {
  const { bootstrapContactsTotal, profile } = useAuth();
  const {
    contacts,
    loading,
    ready,
    serverConfirmed,
    total,
    source,
    error,
    ensureFromCrew,
  } = useContacts();

  // Merge the current user's profile photo into their contact entry in real-time.
  // This ensures photo updates appear immediately without a full contacts refetch.
  const contactsWithPhoto = useMemo<Contact[]>(() => {
    if (!contacts.length || !profile) return contacts;
    const profilePhoto = profile.customPhotoURL || profile.photoURL;
    if (!profilePhoto) return contacts;
    return contacts.map((c) => {
      const isMe = (profile.linkedContactId && String(c.id) === String(profile.linkedContactId))
        || (`${c.firstName || ''} ${c.lastName || ''}`.trim() === profile.displayName);
      if (!isMe) return c;
      return { ...c, customPhotoURL: profile.customPhotoURL || c.customPhotoURL, photoURL: profilePhoto };
    });
  }, [contacts, profile]);

  const value = useMemo<AppDataContextType>(() => ({
    contacts: contactsWithPhoto,
    contactsReady: ready,
    contactsLoading: loading,
    contactsServerConfirmed: serverConfirmed,
    contactsSource: source,
    contactsError: error,
    totalCount: total ?? bootstrapContactsTotal ?? contactsWithPhoto.length,
    availableCount: contactsWithPhoto.filter((contact) => contact.availability === 'available').length,
    openToWorkCount: contactsWithPhoto.filter((contact) => contact.openToWork === true).length,
    ensureFromCrew,
  }), [contactsWithPhoto, loading, ready, serverConfirmed, source, error, ensureFromCrew, total, bootstrapContactsTotal]);

  return (
    <AppDataContext.Provider value={value}>
      {children}
    </AppDataContext.Provider>
  );
}

export function useAppData(): AppDataContextType {
  return useContext(AppDataContext);
}
