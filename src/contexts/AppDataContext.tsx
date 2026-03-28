'use client';

/**
 * AppDataContext — global shared cache for contacts + productions.
 * Prevents re-fetching when navigating between pages.
 * Both useContacts() and productions page read from module-level caches,
 * so this context mainly exposes ready/loading states for UI optimisation.
 */

import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useContacts } from '@/hooks/useContacts';
import type { Contact } from '@/data/contacts';

interface AppDataContextType {
  contacts: Contact[];
  contactsReady: boolean;
  contactsLoading: boolean;
}

const AppDataContext = createContext<AppDataContextType>({
  contacts: [],
  contactsReady: false,
  contactsLoading: false,
});

export function AppDataProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const { contacts, loading, ready } = useContacts();

  return (
    <AppDataContext.Provider value={{ contacts, contactsReady: ready, contactsLoading: loading }}>
      {children}
    </AppDataContext.Provider>
  );
}

export function useAppData() {
  return useContext(AppDataContext);
}
