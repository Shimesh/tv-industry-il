'use client';

import { useEffect, useState, useCallback } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { type Contact } from '@/data/contacts';
import { normalizeProfessionalFields } from '@/lib/professionalFields';
import type { CrewMember } from '@/lib/productionDiff';

export interface ContactsHookResult {
  contacts: Contact[];
  loading: boolean;
  ready: boolean;
  serverConfirmed: boolean;
  total: number | null;
  source: 'server' | 'snapshot' | 'cache' | 'unknown';
  error: string | null;
  ensureFromCrew: (crew: CrewMember[]) => Promise<void>;
}

function cleanDisplayText(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const cleaned = value.replace(/\s+/g, ' ').trim();
  if (!cleaned) return undefined;
  if (/^[?\uFFFD\s]+$/.test(cleaned)) return undefined;
  return cleaned;
}

export function useContacts(): ContactsHookResult {
  const { user } = useAuth();
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [loading, setLoading] = useState(true);
  const [ready, setReady] = useState(false);
  const [serverConfirmed, setServerConfirmed] = useState(false);
  const [total, setTotal] = useState<number | null>(null);
  const [source, setSource] = useState<'server' | 'snapshot' | 'cache' | 'unknown'>('unknown');
  const [error, setError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  useEffect(() => {
    let lastRefresh = 0;
    const refresh = () => {
      if (document.visibilityState !== 'visible' || Date.now() - lastRefresh < 30_000) return;
      lastRefresh = Date.now();
      setRefreshKey(key => key + 1);
    };
    const contactsUpdated = () => setRefreshKey(key => key + 1);
    window.addEventListener('focus', refresh);
    document.addEventListener('visibilitychange', refresh);
    window.addEventListener('contacts-updated', contactsUpdated);
    return () => {
      window.removeEventListener('focus', refresh);
      document.removeEventListener('visibilitychange', refresh);
      window.removeEventListener('contacts-updated', contactsUpdated);
    };
  }, []);
  useEffect(() => {
    let active = true;
    if (!user) {
      setContacts([]);
      setLoading(false);
      setReady(false);
      setServerConfirmed(false);
      setTotal(null);
      setSource('unknown');
      setError(null);
      return;
    }

    setLoading(true);
    setReady(false);
    setServerConfirmed(false);
    setTotal(null);
    setSource('unknown');
    setError(null);

    const fetchContactsFromServer = async () => {
      try {
        const token = await user.getIdToken();
        const response = await fetch('/api/contacts/authoritative', {
          headers: {
            Authorization: `Bearer ${token}`,
          },
          cache: 'no-store',
        });

        if (!response.ok) throw new Error(`Contacts API failed: ${response.status}`);

        const payload = await response.json() as {
          contacts?: Array<Record<string, unknown>>;
          total?: number;
        };

        const contactFullName = (contact: Contact) =>
          `${contact.firstName || ''} ${contact.lastName || ''}`.replace(/\s+/g, ' ').trim();

        const authoritativeContacts = (payload.contacts || []).map((contact) => {
          const professional = normalizeProfessionalFields(contact);
          return {
            id: String(contact.id || ''),
            firstName: String(contact.firstName || ''),
            lastName: String(contact.lastName || ''),
            email: typeof contact.email === 'string' ? contact.email : undefined,
            customPhotoURL: typeof contact.customPhotoURL === 'string' ? contact.customPhotoURL : undefined,
            photoURL: typeof contact.customPhotoURL === 'string'
              ? contact.customPhotoURL
              : typeof contact.photoURL === 'string' ? contact.photoURL : undefined,
            is_consented: contact.is_consented === true,
            department: professional.department,
            departments: professional.departments,
            workArea: cleanDisplayText(contact.workArea) || null,
            specialty: cleanDisplayText(contact.specialty),
            role: professional.role,
            roles: professional.roles,
            availability: typeof contact.availability === 'string' ? contact.availability as Contact['availability'] : undefined,
            phone: typeof contact.phone === 'string' ? contact.phone : undefined,
            source: typeof contact.source === 'string' ? contact.source : undefined,
            openToWork: contact.openToWork === true,
            skills: Array.isArray(contact.skills) ? contact.skills.map((item) => String(item)) : undefined,
            credits: Array.isArray(contact.credits) ? contact.credits.map((item) => String(item)) : undefined,
            city: typeof contact.city === 'string' ? contact.city : null,
            yearsOfExperience: typeof contact.yearsOfExperience === 'number' ? contact.yearsOfExperience : null,
            gear: Array.isArray(contact.gear) ? contact.gear.map((item) => String(item)) : null,
            profileId: typeof contact.profileId === 'string' ? contact.profileId : undefined,
          };
        }).sort((a, b) => contactFullName(a).localeCompare(contactFullName(b), 'he'));

        if (!active) return;
        setContacts(authoritativeContacts);
        setServerConfirmed(true);
        setReady(true);
        setLoading(false);
        setTotal(typeof payload.total === 'number' ? payload.total : authoritativeContacts.length);
        setSource('server');
        setError(null);
      } catch (fetchError) {
        if (!active) return;
        console.error('[useContacts] Authoritative contacts fetch failed:', fetchError);
        setContacts([]);
        setServerConfirmed(false);
        setReady(true);
        setLoading(false);
        setTotal(0);
        setSource('unknown');
        setError(fetchError instanceof Error ? fetchError.message : 'Failed to load contacts');
      }
    };

    void fetchContactsFromServer();
    return () => { active = false; };
  }, [user, refreshKey]);

  const ensureFromCrew = useCallback(async (crew: CrewMember[]) => {
    if (!user || !crew?.length) return;
    const token = await user.getIdToken();
    const response = await fetch('/api/contacts/reconcile', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ productions: [{ crew }] }),
    });
    if (!response.ok) throw new Error('עדכון אנשי הקשר מההפקה נכשל');
    window.dispatchEvent(new Event('contacts-updated'));
  }, [user]);

  return { contacts, loading, ready, serverConfirmed, total, source, error, ensureFromCrew };
}
