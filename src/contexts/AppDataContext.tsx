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
  const { bootstrapContactsTotal } = useAuth();
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

  const value = useMemo<AppDataContextType>(() => ({
    contacts,
    contactsReady: ready,
    contactsLoading: loading,
    contactsServerConfirmed: serverConfirmed,
    contactsSource: source,
    contactsError: error,
    totalCount: total ?? bootstrapContactsTotal ?? contacts.length,
    availableCount: contacts.filter((contact) => contact.availability === 'available').length,
    openToWorkCount: contacts.filter((contact) => contact.openToWork === true).length,
    ensureFromCrew,
  }), [contacts, loading, ready, serverConfirmed, source, error, ensureFromCrew, total, bootstrapContactsTotal]);

  return (
    <AppDataContext.Provider value={value}>
      {children}
    </AppDataContext.Provider>
  );
}

export function useAppData(): AppDataContextType {
  return useContext(AppDataContext);
}
