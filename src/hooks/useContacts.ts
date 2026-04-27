'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import {
  collection,
  getDocsFromServer,
  onSnapshot,
  doc,
  writeBatch,
  serverTimestamp,
  type QueryDocumentSnapshot,
  type DocumentData,
} from 'firebase/firestore';
import { useAuth } from '@/contexts/AuthContext';
import { db } from '@/lib/firebase';
import { type Contact } from '@/data/contacts';
import { splitName, inferDepartment, inferSpecialty, inferWorkArea } from '@/lib/contactsUtils';
import {
  deduplicateCrewEntries,
  normalizeName,
  normalizePhone,
  normalizeRole,
} from '@/lib/crewNormalization';
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

function contactScore(contact: Contact): number {
  let score = 0;
  if (normalizePhone(contact.phone)) score += 100;
  if (contact.source && contact.source !== 'schedule') score += 25;
  if (contact.skills?.length) score += 5;
  if (contact.email) score += 5;
  if (contact.role) score += 3;
  return score;
}

function dedupeContactsList(input: Contact[]): Contact[] {
  const byIdentity = new Map<string, Contact>();
  const pendingNoPhone = new Map<string, Contact>();

  for (const contact of input) {
    const normalizedName = normalizeName(`${contact.firstName || ''} ${contact.lastName || ''}`);
    const normalizedPhone = normalizePhone(contact.phone);
    if (!normalizedName) continue;

    const identityKey = normalizedPhone ? `${normalizedName}::${normalizedPhone}` : normalizedName;
    const current = byIdentity.get(identityKey);

    if (!current || contactScore(contact) > contactScore(current)) {
      byIdentity.set(identityKey, contact);
    }

    if (!normalizedPhone) {
      const existing = pendingNoPhone.get(normalizedName);
      if (!existing || contactScore(contact) > contactScore(existing)) {
        pendingNoPhone.set(normalizedName, contact);
      }
    }
  }

  const merged: Contact[] = [];
  for (const contact of byIdentity.values()) {
    const normalizedName = normalizeName(`${contact.firstName || ''} ${contact.lastName || ''}`);
    const normalizedPhone = normalizePhone(contact.phone);
    if (!normalizedPhone && Array.from(byIdentity.values()).some((entry) =>
      normalizeName(`${entry.firstName || ''} ${entry.lastName || ''}`) === normalizedName &&
      Boolean(normalizePhone(entry.phone)),
    )) {
      continue;
    }
    merged.push(contact);
  }

  for (const [normalizedName, contact] of pendingNoPhone.entries()) {
    const hasRichVersion = merged.some((entry) =>
      normalizeName(`${entry.firstName || ''} ${entry.lastName || ''}`) === normalizedName &&
      Boolean(normalizePhone(entry.phone)),
    );
    if (!hasRichVersion && !merged.some((entry) => entry.id === contact.id)) {
      merged.push(contact);
    }
  }

  return merged;
}

function mapSnapshotToContact(d: QueryDocumentSnapshot<DocumentData>): Contact {
  const data = d.data();
  return {
    id: d.id,
    firstName: String(data.firstName || ''),
    lastName: String(data.lastName || ''),
    email: data.email ? String(data.email) : undefined,
    department: String(data.department || ''),
    workArea: data.workArea ? String(data.workArea) : null,
    specialty: data.specialty ? String(data.specialty) : undefined,
    role: String(data.role || ''),
    availability: (data.availability as Contact['availability']) || undefined,
    phone: data.phone ? String(data.phone) : undefined,
    skills: Array.isArray(data.skills) ? (data.skills as string[]) : undefined,
    source: data.source ? String(data.source) : undefined,
    openToWork: data.openToWork === true,
    status:
      data.status === 'busy' || data.status === 'offline'
        ? data.status
        : data.status === 'available'
          ? 'available'
          : undefined,
    isOnline: data.isOnline === true,
  };
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
  const contactsLengthRef = useRef(0);

  useEffect(() => {
    contactsLengthRef.current = contacts.length;
  }, [contacts.length]);

  useEffect(() => {
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

        if (!response.ok) {
          const snapshot = await getDocsFromServer(collection(db, 'contacts'));
          const rawContacts = snapshot.docs.map(mapSnapshotToContact);

          if (rawContacts.length > 0) {
            setContacts(rawContacts);
          }
          setServerConfirmed(true);
          setReady(true);
          setLoading(false);
          setTotal(rawContacts.length);
          setSource('snapshot');
          setError(null);
          return;
        }

        const payload = await response.json() as {
          contacts?: Array<Record<string, unknown>>;
          total?: number;
        };

        const authoritativeContacts = (payload.contacts || []).map((contact) => ({
          id: String(contact.id || ''),
          firstName: String(contact.firstName || ''),
          lastName: String(contact.lastName || ''),
          email: typeof contact.email === 'string' ? contact.email : undefined,
          department: String(contact.department || ''),
          workArea: typeof contact.workArea === 'string' ? contact.workArea : null,
          specialty: typeof contact.specialty === 'string' ? contact.specialty : undefined,
          role: String(contact.role || ''),
          availability: typeof contact.availability === 'string' ? contact.availability as Contact['availability'] : undefined,
          phone: typeof contact.phone === 'string' ? contact.phone : undefined,
          source: typeof contact.source === 'string' ? contact.source : undefined,
          openToWork: contact.openToWork === true,
          skills: Array.isArray(contact.skills) ? contact.skills.map((item) => String(item)) : undefined,
        }));

        if (authoritativeContacts.length > 0) {
          setContacts(authoritativeContacts);
        }
        setServerConfirmed(true);
        setReady(true);
        setLoading(false);
        setTotal(typeof payload.total === 'number' ? payload.total : authoritativeContacts.length);
        setSource('server');
        setError(null);
      } catch (fetchError) {
        console.error('[useContacts] Authoritative contacts fetch failed:', fetchError);
      }
    };

    void fetchContactsFromServer();

    const unsubscribe = onSnapshot(
      collection(db, 'contacts'),
      (snapshot) => {
        const firestoreContacts = snapshot.docs.map(mapSnapshotToContact);

        if (!snapshot.metadata.fromCache) {
          setContacts(firestoreContacts);
          setServerConfirmed(true);
          setReady(true);
          setLoading(false);
          setTotal(firestoreContacts.length);
          setSource('snapshot');
          setError(null);
          return;
        }

        // Cache-only snapshots are allowed to hydrate existing data, but they
        // should not be treated as the final source of truth for counts.
        if (contactsLengthRef.current === 0 && firestoreContacts.length > 0) {
          setContacts(firestoreContacts);
          setLoading(false);
          setReady(true);
          setSource('cache');
        }
      },
      (snapshotError) => {
        console.error('[useContacts] Error listening to contacts:', snapshotError);
        setError(snapshotError.message || 'Failed to load contacts');
        setLoading(false);
      },
    );

    return () => unsubscribe();
  }, [user]);

  const ensureFromCrew = useCallback(async (crew: CrewMember[]) => {
    if (!user || !crew?.length || !ready) return;

    const normalizedCrew = deduplicateCrewEntries(crew);
    if (!normalizedCrew.length) return;

    const existingNames = new Set(
      contacts.map((contact) => normalizeName(`${contact.firstName} ${contact.lastName}`)).filter(Boolean),
    );
    const existingPhones = new Set(
      contacts.map((contact) => normalizePhone(contact.phone)).filter(Boolean),
    );

    const batch = writeBatch(db);
    let addedCount = 0;

    for (const member of normalizedCrew) {
      const nameKey = normalizeName(member.name || '');
      const phoneKey = normalizePhone(member.phone);

      if (!nameKey || nameKey.length < 2) continue;
      if (existingNames.has(nameKey) || (phoneKey && existingPhones.has(phoneKey))) {
        continue;
      }

      const { firstName, lastName } = splitName(nameKey);
      const role = normalizeRole(member.roleDetail || member.role || '');
      const department = inferDepartment(role, member.name || nameKey);
      const workArea = inferWorkArea(role, member.name || nameKey);
      const specialty = inferSpecialty(role, member.name || nameKey);
      const newRef = doc(collection(db, 'contacts'));

      batch.set(newRef, {
        firstName,
        lastName,
        phone: phoneKey || null,
        role,
        department,
        workArea,
        specialty,
        availability: 'available',
        status: 'available',
        source: 'schedule',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      existingNames.add(nameKey);
      if (phoneKey) existingPhones.add(phoneKey);
      addedCount++;
    }

    if (addedCount > 0) {
      await batch.commit();
      console.log(`[useContacts] Added ${addedCount} new crew members from schedule.`);
    }
  }, [user, contacts, ready]);

  return { contacts, loading, ready, serverConfirmed, total, source, error, ensureFromCrew };
}
