'use client';

/**
 * AppDataContext — Single Source of Truth for crew/contacts data.
 *
 * Holds exactly ONE instance of useContacts() at the root of the app.
 * All components must consume contacts via useAppData() — never by calling
 * useContacts() directly. This guarantees:
 *  • One Firestore fetch on startup (module-level cache handles deduplication)
 *  • Instant UI sync across every consumer when ensureFromCrew() adds members
 *    (setContacts inside the single hook instance → context value updates → all
 *     consumers re-render simultaneously via React Context propagation)
 */

import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { useContacts } from '@/hooks/useContacts';
import type { Contact } from '@/data/contacts';
import type { CrewMember } from '@/lib/productionDiff';

interface AppDataContextType {
  /** Full merged list (static + Firestore). Always non-empty — falls back to static 91 while loading. */
  contacts: Contact[];
  /** True once real data (localStorage cache or Firestore) has been loaded. */
  contactsReady: boolean;
  /** True while a Firestore fetch is in-flight. */
  contactsLoading: boolean;

  // Pre-computed derived stats (avoids re-filtering in every consumer)
  totalCount: number;
  availableCount: number;
  openToWorkCount: number;

  /**
   * Call this after loading a production schedule.
   * Writes any new crew members to Firestore and INSTANTLY updates every
   * consumer via the shared context state — no navigation or refresh needed.
   */
  ensureFromCrew: (crew: CrewMember[]) => Promise<void>;
}

const AppDataContext = createContext<AppDataContextType>({
  contacts: [],
  contactsReady: false,
  contactsLoading: false,
  totalCount: 0,
  availableCount: 0,
  openToWorkCount: 0,
  ensureFromCrew: async () => {},
});

export function AppDataProvider({ children }: { children: ReactNode }) {
  const { contacts, loading, ready, ensureFromCrew } = useContacts();

  // useMemo is critical: prevents all consumers from re-rendering whenever the
  // provider re-renders for unrelated reasons. Only re-computes when the data
  // actually changes.
  const value = useMemo<AppDataContextType>(() => ({
    contacts,
    contactsReady: ready,
    contactsLoading: loading,
    totalCount: contacts.length,
    availableCount: contacts.filter(c => c.availability === 'available').length,
    openToWorkCount: contacts.filter(c => c.openToWork === true).length,
    ensureFromCrew,
  }), [contacts, loading, ready, ensureFromCrew]);

  return (
    <AppDataContext.Provider value={value}>
      {children}
    </AppDataContext.Provider>
  );
}

export function useAppData(): AppDataContextType {
  return useContext(AppDataContext);
}
