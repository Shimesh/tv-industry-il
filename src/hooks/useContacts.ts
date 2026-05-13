'use client';

import { useEffect, useState, useCallback } from 'react';
import {
  collection,
  doc,
  writeBatch,
  serverTimestamp,
} from 'firebase/firestore';
import { useAuth } from '@/contexts/AuthContext';
import { db } from '@/lib/firebase';
import { type Contact } from '@/data/contacts';
import { splitName, inferDepartment, inferSpecialty, inferWorkArea } from '@/lib/contactsUtils';
import { normalizeProfessionalFields } from '@/lib/professionalFields';
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

export function useContacts(): ContactsHookResult {
  const { user } = useAuth();
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [loading, setLoading] = useState(true);
  const [ready, setReady] = useState(false);
  const [serverConfirmed, setServerConfirmed] = useState(false);
  const [total, setTotal] = useState<number | null>(null);
  const [source, setSource] = useState<'server' | 'snapshot' | 'cache' | 'unknown'>('unknown');
  const [error, setError] = useState<string | null>(null);
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
            photoURL: typeof contact.photoURL === 'string' ? contact.photoURL : undefined,
            is_consented: contact.is_consented === true,
            department: professional.department,
            departments: professional.departments,
            workArea: typeof contact.workArea === 'string' ? contact.workArea : null,
            specialty: typeof contact.specialty === 'string' ? contact.specialty : undefined,
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
        is_consented: false,
        role,
        roles: role ? [role] : [],
        department,
        departments: department ? [department] : [],
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
