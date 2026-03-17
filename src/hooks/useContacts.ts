"use client";

import { useEffect, useRef, useState, useCallback } from 'react';
import { collection, getDocs, addDoc, doc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { useAuth } from '@/contexts/AuthContext';
import { db } from '@/lib/firebase';
import { contacts as staticContacts, type Contact } from '@/data/contacts';
import { normalizeContactName, normalizePhone, splitName } from '@/lib/contactsUtils';
import type { CrewMember } from '@/lib/productionDiff';

export interface ContactsHookResult {
  contacts: Contact[];
  loading: boolean;
  ensureFromCrew: (crew: CrewMember[]) => Promise<void>;
}

function mergeContacts(base: Contact[], extra: Contact[]): Contact[] {
  const map = new Map<string, Contact>();

  const upsert = (c: Contact) => {
    const fullName = `${c.firstName} ${c.lastName}`.trim();
    const nameKey = normalizeContactName(fullName);
    const phoneKey = normalizePhone(c.phone || '');
    const key = nameKey || fullName || String(c.id);
    const existing = map.get(key);

    if (!existing) {
      map.set(key, { ...c });
      return;
    }

    map.set(key, {
      ...existing,
      ...c,
      phone: existing.phone || c.phone,
      role: existing.role || c.role,
      department: existing.department || c.department,
      availability: existing.availability || c.availability,
    });
  };

  base.forEach(upsert);
  extra.forEach(upsert);

  return Array.from(map.values());
}

export function useContacts(): ContactsHookResult {
  const { user } = useAuth();
  const [contacts, setContacts] = useState<Contact[]>(staticContacts);
  const [loading, setLoading] = useState(false);
  const loadedRef = useRef(false);
  const firestoreByNameRef = useRef<Map<string, { id: string; phone?: string }>>(new Map());
  const firestoreByPhoneRef = useRef<Map<string, { id: string; name: string }>>(new Map());
  const knownKeysRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    let mounted = true;

    const load = async () => {
      if (!user) {
        setContacts(staticContacts);
        return;
      }

      if (loadedRef.current) return;
      setLoading(true);

      try {
        const snap = await getDocs(collection(db, 'contacts'));
                const firestoreContacts: Contact[] = snap.docs.map((d) => {
          const data = d.data() as Record<string, unknown>;
          const firstName = String(data.firstName || '');
          const lastName = String(data.lastName || '');
          const phone = data.phone ? String(data.phone) : undefined;
          const fullName = `${firstName} ${lastName}`.trim();
          const nameKey = normalizeContactName(fullName);
          const phoneKey = normalizePhone(phone || '');
          if (nameKey) firestoreByNameRef.current.set(nameKey, { id: d.id, phone });
          if (phoneKey) firestoreByPhoneRef.current.set(phoneKey, { id: d.id, name: fullName });
          return {
            id: d.id,
            firstName,
            lastName,
            email: data.email ? String(data.email) : undefined,
            department: String(data.department || ''),
            role: String(data.role || ''),
            availability: (data.availability as Contact['availability']) || undefined,
            phone,
            skills: Array.isArray(data.skills) ? (data.skills as string[]) : undefined,
          };
        });

        const merged = mergeContacts(staticContacts, firestoreContacts);
        if (mounted) {
          setContacts(merged);
          const keys = new Set<string>();
          merged.forEach((c) => {
            const fullName = `${c.firstName} ${c.lastName}`.trim();
            const nameKey = normalizeContactName(fullName);
            if (nameKey) keys.add(nameKey);
            const phoneKey = normalizePhone(c.phone || '');
            if (phoneKey) keys.add(phoneKey);
          });
          knownKeysRef.current = keys;
          loadedRef.current = true;
        }
      } catch {
        if (mounted) setContacts(staticContacts);
      } finally {
        if (mounted) setLoading(false);
      }
    };

    load();

    return () => {
      mounted = false;
    };
  }, [user]);

  const ensureFromCrew = useCallback(async (crew: CrewMember[]) => {
    if (!user || !crew || crew.length === 0) return;

    for (const member of crew) {
      const fullName = normalizeContactName(member.name || '');
      if (!fullName || fullName.length < 2) continue;

      const phoneKey = normalizePhone(member.phone || '');
      const nameKey = fullName;
            const known = knownKeysRef.current;
      const existingByName = firestoreByNameRef.current.get(nameKey);
      const existingByPhone = phoneKey ? firestoreByPhoneRef.current.get(phoneKey) : undefined;

      if (existingByName || existingByPhone || known.has(nameKey) || (phoneKey && known.has(phoneKey))) {
        if (existingByName && phoneKey && !existingByName.phone) {
          try {
            await updateDoc(doc(db, 'contacts', existingByName.id), {
              phone: member.phone || '',
              updatedAt: serverTimestamp(),
            });
            existingByName.phone = member.phone || '';
            firestoreByNameRef.current.set(nameKey, existingByName);
            if (phoneKey) firestoreByPhoneRef.current.set(phoneKey, { id: existingByName.id, name: nameKey });
            known.add(nameKey);
            if (phoneKey) known.add(phoneKey);
          } catch {
            // ignore
          }
        }
        continue;
      }

      const { firstName, lastName } = splitName(fullName);
      const role = member.roleDetail || member.role || '';
      const department = role || 'כללי';

      try {
        await addDoc(collection(db, 'contacts'), {
          firstName,
          lastName,
          phone: member.phone || '',
          role,
          department,
          availability: 'available',
          source: 'schedule',
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });

        if (nameKey) known.add(nameKey);
        if (phoneKey) known.add(phoneKey);
      } catch {
        // ignore
      }
    }
  }, [user]);

  return { contacts, loading, ensureFromCrew };
}


