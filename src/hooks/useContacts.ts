'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import {
  collection,
  getDocs,
  doc,
  writeBatch,
  deleteDoc,
  updateDoc,
  serverTimestamp,
  type DocumentData,
  type QueryDocumentSnapshot,
} from 'firebase/firestore';
import { useAuth } from '@/contexts/AuthContext';
import { db } from '@/lib/firebase';
import { contacts as staticContacts, type Contact } from '@/data/contacts';
import { splitName, inferDepartment } from '@/lib/contactsUtils';
import {
  deduplicateCrewEntries,
  normalizeName,
  normalizePhone,
  normalizeRole,
} from '@/lib/crewNormalization';
import type { CrewMember } from '@/lib/productionDiff';

export interface DuplicateContactRecord {
  key: string;
  type: 'name' | 'phone';
  count: number;
}

export interface ContactsHookResult {
  contacts: Contact[];
  loading: boolean;
  duplicateContactsReport: DuplicateContactRecord[];
  ensureFromCrew: (crew: CrewMember[]) => Promise<void>;
}

type IndexedContact = Contact & {
  source: 'static' | 'firestore';
  firestoreId?: string;
  normalizedName: string;
  normalizedPhone: string | null;
};

let cachedMergedContacts: Contact[] | null = null;
let cachedFirestoreContacts: Contact[] = [];
let cachedDuplicateReport: DuplicateContactRecord[] = [];
let cacheLoadedAt = 0;
const CACHE_TTL_MS = 45_000;

function toIndexedContact(contact: Contact, source: 'static' | 'firestore', firestoreId?: string): IndexedContact {
  const fullName = `${contact.firstName || ''} ${contact.lastName || ''}`.trim();
  return {
    ...contact,
    source,
    firestoreId,
    normalizedName: normalizeName(fullName),
    normalizedPhone: normalizePhone(contact.phone || null),
  };
}

function mergeContacts(base: Contact[], extra: Contact[]): Contact[] {
  const map = new Map<string, Contact>();

  const upsert = (c: Contact, priority: boolean) => {
    const fullName = `${c.firstName || ''} ${c.lastName || ''}`.trim();
    const key = normalizeName(fullName) || String(c.id);
    const existing = map.get(key);
    if (!existing) {
      map.set(key, { ...c });
      return;
    }

    if (priority) {
      // Firestore (extra) data wins, fall back to existing for missing fields
      map.set(key, {
        ...existing,
        ...c,
        phone: c.phone || existing.phone,
        role: c.role || existing.role,
        department: c.department || existing.department,
        availability: c.availability || existing.availability,
      });
    } else {
      // Static (base) data: only fill in if no existing record
      map.set(key, {
        ...existing,
        phone: existing.phone || c.phone,
        role: existing.role || c.role,
        department: existing.department || c.department,
        availability: existing.availability || c.availability,
      });
    }
  };

  base.forEach((c) => upsert(c, false));
  extra.forEach((c) => upsert(c, true));
  return Array.from(map.values());
}

function buildDuplicateReport(indexed: IndexedContact[]): DuplicateContactRecord[] {
  const nameCount = new Map<string, number>();
  const phoneCount = new Map<string, number>();

  indexed.forEach((item) => {
    if (item.normalizedName) {
      nameCount.set(item.normalizedName, (nameCount.get(item.normalizedName) || 0) + 1);
    }
    if (item.normalizedPhone) {
      phoneCount.set(item.normalizedPhone, (phoneCount.get(item.normalizedPhone) || 0) + 1);
    }
  });

  const report: DuplicateContactRecord[] = [];
  nameCount.forEach((count, key) => {
    if (count > 1) report.push({ key, type: 'name', count });
  });
  phoneCount.forEach((count, key) => {
    if (count > 1) report.push({ key, type: 'phone', count });
  });

  return report;
}

function mapSnapshotToContact(d: QueryDocumentSnapshot<DocumentData>): Contact {
  const data = d.data() as Record<string, unknown>;
  return {
    id: d.id,
    firstName: String(data.firstName || ''),
    lastName: String(data.lastName || ''),
    email: data.email ? String(data.email) : undefined,
    department: String(data.department || ''),
    role: String(data.role || ''),
    availability: (data.availability as Contact['availability']) || undefined,
    phone: data.phone ? String(data.phone) : undefined,
    skills: Array.isArray(data.skills) ? (data.skills as string[]) : undefined,
  };
}

/**
 * Silently resolves duplicate contacts:
 * - Groups by normalized name
 * - Merges info (phone, role, department) into the best record
 * - Deletes redundant Firestore records
 */
async function autoResolveDuplicates(indexed: IndexedContact[], firestoreContacts: Contact[]) {
  try {
    const byName = new Map<string, IndexedContact[]>();
    for (const c of indexed) {
      if (!c.normalizedName || c.normalizedName.length < 2) continue;
      const group = byName.get(c.normalizedName) || [];
      group.push(c);
      byName.set(c.normalizedName, group);
    }

    const batch = writeBatch(db);
    let batchCount = 0;
    const MAX_BATCH = 450; // Firestore batch limit is 500

    for (const [, group] of byName) {
      if (group.length < 2) continue;
      if (batchCount >= MAX_BATCH) break;

      // Pick the best record: prefer one with phone, then firestore over static
      const sorted = [...group].sort((a, b) => {
        if (a.normalizedPhone && !b.normalizedPhone) return -1;
        if (!a.normalizedPhone && b.normalizedPhone) return 1;
        if (a.source === 'firestore' && b.source !== 'firestore') return -1;
        if (a.source !== 'firestore' && b.source === 'firestore') return 1;
        return 0;
      });

      const winner = sorted[0];
      const losers = sorted.slice(1);

      // Merge missing info into winner
      let needsUpdate = false;
      for (const loser of losers) {
        if (!winner.phone && loser.phone) { winner.phone = loser.phone; winner.normalizedPhone = loser.normalizedPhone; needsUpdate = true; }
        if (!winner.role && loser.role) { winner.role = loser.role; needsUpdate = true; }
        if (!winner.department && loser.department) { winner.department = loser.department; needsUpdate = true; }
        if (!winner.email && loser.email) { winner.email = loser.email; needsUpdate = true; }
      }

      // Update winner in Firestore if it gained new info
      if (needsUpdate && winner.source === 'firestore' && winner.firestoreId) {
        batch.update(doc(db, 'contacts', winner.firestoreId), {
          phone: winner.phone || null,
          role: winner.role || '',
          department: winner.department || '',
          updatedAt: serverTimestamp(),
        });
        batchCount++;
      }

      // Delete loser Firestore records
      for (const loser of losers) {
        if (loser.source === 'firestore' && loser.firestoreId) {
          batch.delete(doc(db, 'contacts', loser.firestoreId));
          batchCount++;
        }
      }
    }

    if (batchCount > 0) {
      await batch.commit();
      // Invalidate cache so next load picks up clean data
      cachedMergedContacts = null;
      cacheLoadedAt = 0;
      console.log(`[useContacts] Auto-resolved ${batchCount} duplicate contact operations`);
    }
  } catch (err) {
    console.warn('[useContacts] Auto-resolve duplicates failed:', err);
  }
}

export function useContacts(): ContactsHookResult {
  const { user } = useAuth();
  const [contacts, setContacts] = useState<Contact[]>(cachedMergedContacts || staticContacts);
  const [loading, setLoading] = useState(false);
  const [duplicateContactsReport, setDuplicateContactsReport] = useState<DuplicateContactRecord[]>(cachedDuplicateReport);

  const loadedRef = useRef(false);
  const alertShownRef = useRef(false);
  const indexedContactsRef = useRef<IndexedContact[]>([]);

  useEffect(() => {
    let mounted = true;

    const load = async () => {
      if (!user) {
        if (mounted) {
          setContacts(staticContacts);
          setDuplicateContactsReport([]);
        }
        return;
      }

      const now = Date.now();
      if (cachedMergedContacts && now - cacheLoadedAt < CACHE_TTL_MS) {
        if (mounted) {
          setContacts(cachedMergedContacts);
          setDuplicateContactsReport(cachedDuplicateReport);
          indexedContactsRef.current = [
            ...staticContacts.map((c) => toIndexedContact(c, 'static')),
            ...cachedFirestoreContacts.map((c) => toIndexedContact(c, 'firestore', String(c.id))),
          ];
          loadedRef.current = true;
        }
        return;
      }

      setLoading(true);

      try {
        const snap = await getDocs(collection(db, 'contacts'));
        const firestoreContacts = snap.docs.map(mapSnapshotToContact);
        const merged = mergeContacts(staticContacts, firestoreContacts);

        const indexed = [
          ...staticContacts.map((c) => toIndexedContact(c, 'static')),
          ...firestoreContacts.map((c) => toIndexedContact(c, 'firestore', String(c.id))),
        ];

        const report = buildDuplicateReport(indexed);

        if (!mounted) return;
        setContacts(merged);
        setDuplicateContactsReport(report);
        indexedContactsRef.current = indexed;
        loadedRef.current = true;

        cachedMergedContacts = merged;
        cachedFirestoreContacts = firestoreContacts;
        cachedDuplicateReport = report;
        cacheLoadedAt = Date.now();

        // Auto-resolve duplicates silently
        if (report.length > 0 && !alertShownRef.current) {
          alertShownRef.current = true;
          void autoResolveDuplicates(indexed, firestoreContacts);
        }
      } catch {
        if (!mounted) return;
        setContacts(staticContacts);
      } finally {
        if (mounted) setLoading(false);
      }
    };

    void load();

    return () => {
      mounted = false;
    };
  }, [user]);

  const ensureFromCrew = useCallback(async (crew: CrewMember[]) => {
    if (!user || !crew?.length) return;
    if (!loadedRef.current) return;

    const normalizedCrew = deduplicateCrewEntries(crew);
    if (!normalizedCrew.length) return;

    const byName = new Map<string, IndexedContact[]>();
    const byPhone = new Map<string, IndexedContact[]>();
    for (const contact of indexedContactsRef.current) {
      if (contact.normalizedName) {
        const existing = byName.get(contact.normalizedName) || [];
        existing.push(contact);
        byName.set(contact.normalizedName, existing);
      }
      if (contact.normalizedPhone) {
        const existing = byPhone.get(contact.normalizedPhone) || [];
        existing.push(contact);
        byPhone.set(contact.normalizedPhone, existing);
      }
    }

    const batch = writeBatch(db);
    const updates: Array<{ id: string; phone: string }> = [];
    const creates: Contact[] = [];

    const queueCreate = (member: CrewMember, nameKey: string, phoneKey: string | null) => {
      const { firstName, lastName } = splitName(nameKey);
      const role = normalizeRole(member.roleDetail || member.role || '');
      const department = inferDepartment(role);
      const newRef = doc(collection(db, 'contacts'));

      batch.set(newRef, {
        firstName,
        lastName,
        phone: phoneKey,
        role,
        department,
        availability: 'available',
        source: 'schedule',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      const created: Contact = {
        id: newRef.id,
        firstName,
        lastName,
        phone: phoneKey || undefined,
        role,
        department,
        availability: 'available',
      };

      creates.push(created);
      const indexed = toIndexedContact(created, 'firestore', newRef.id);
      indexedContactsRef.current.push(indexed);
      byName.set(nameKey, [...(byName.get(nameKey) || []), indexed]);
      if (phoneKey) byPhone.set(phoneKey, [...(byPhone.get(phoneKey) || []), indexed]);
    };

    for (const member of normalizedCrew) {
      const nameKey = normalizeName(member.name || '');
      const phoneKey = normalizePhone(member.phone);
      if (!nameKey || nameKey.length < 2) continue;

      const sameName = byName.get(nameKey) || [];
      const strongMatch = phoneKey ? sameName.find((c) => c.normalizedPhone === phoneKey) : undefined;
      if (strongMatch) continue;

      const weakMatch = sameName[0];
      if (weakMatch) {
        if (
          phoneKey &&
          !weakMatch.normalizedPhone &&
          weakMatch.source === 'firestore' &&
          weakMatch.firestoreId
        ) {
          updates.push({ id: weakMatch.firestoreId, phone: phoneKey });
          weakMatch.phone = phoneKey;
          weakMatch.normalizedPhone = phoneKey;
          byPhone.set(phoneKey, [...(byPhone.get(phoneKey) || []), weakMatch]);
        } else if (phoneKey && !weakMatch.normalizedPhone && weakMatch.source === 'static') {
          if (!byPhone.get(phoneKey)?.length) {
            queueCreate(member, nameKey, phoneKey);
          }
        }
        continue;
      }

      if (phoneKey) {
        const byPhoneMatch = byPhone.get(phoneKey)?.[0];
        if (byPhoneMatch) {
          continue;
        }
      }

      queueCreate(member, nameKey, phoneKey);
    }

    for (const update of updates) {
      batch.update(doc(db, 'contacts', update.id), {
        phone: update.phone,
        updatedAt: serverTimestamp(),
      });
    }

    if (!updates.length && !creates.length) return;

    await batch.commit();

    setContacts((prev) => {
      const updated = prev.map((item) => {
        const match = updates.find((u) => String(item.id) === u.id);
        return match ? { ...item, phone: match.phone } : item;
      });
      const merged = mergeContacts(updated, creates);
      cachedMergedContacts = merged;
      const createdFirestore = creates.map((c) => ({ ...c }));
      cachedFirestoreContacts = [
        ...cachedFirestoreContacts.map((c) => {
          const match = updates.find((u) => String(c.id) === u.id);
          return match ? { ...c, phone: match.phone } : c;
        }),
        ...createdFirestore,
      ];
      cacheLoadedAt = Date.now();
      return merged;
    });

    setDuplicateContactsReport((prev) => {
      const indexed = indexedContactsRef.current;
      const nextReport = buildDuplicateReport(indexed);
      cachedDuplicateReport = nextReport;
      return nextReport.length ? nextReport : [];
    });
  }, [user]);

  return { contacts, loading, duplicateContactsReport, ensureFromCrew };
}
