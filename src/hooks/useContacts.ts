'use client';

import { useEffect, useState, useCallback } from 'react';
import {
  collection,
  onSnapshot,
  doc,
  writeBatch,
  serverTimestamp,
  type QueryDocumentSnapshot,
  type DocumentData,
} from 'firebase/firestore';
import { useAuth } from '@/contexts/AuthContext';
import { db } from '@/lib/firebase';
import { type Contact } from '@/data/contacts'; // אנחנו מייבאים רק את סוג הנתונים (Type), לא את הרשימה הסטטית!
import { splitName, inferDepartment } from '@/lib/contactsUtils';
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
  ensureFromCrew: (crew: CrewMember[]) => Promise<void>;
}

function mapSnapshotToContact(d: QueryDocumentSnapshot<DocumentData>): Contact {
  const data = d.data();
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

export function useContacts(): ContactsHookResult {
  const { user } = useAuth();
  // מתחילים עם מערך ריק לחלוטין - אין יותר 91 רוחות רפאים!
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [loading, setLoading] = useState(true);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!user) {
      setContacts([]);
      setLoading(false);
      setReady(false);
      return;
    }

    setLoading(true);

    // האזנה חיה (Real-time) לפיירבייס.
    // contacts מתעדכן מיידית מהקאש אבל ready=true רק כשהשרת אישר (fromCache=false).
    // זה מונע שהמובייל יציג 188 והדסקטופ 198 מ-IndexedDB שונים.
    const unsubscribe = onSnapshot(collection(db, 'contacts'), (snapshot) => {
      const firestoreContacts = snapshot.docs.map(mapSnapshotToContact);
      setContacts(firestoreContacts);
      setLoading(false);
      // Mark ready only once the server confirms the count (not stale local cache)
      if (!snapshot.metadata.fromCache && !snapshot.metadata.hasPendingWrites) {
        setReady(true);
      }
    }, (error) => {
      console.error("[useContacts] Error listening to contacts:", error);
      setLoading(false);
    });

    return () => unsubscribe();
  }, [user]);

  const ensureFromCrew = useCallback(async (crew: CrewMember[]) => {
    if (!user || !crew?.length || !ready) return;

    const normalizedCrew = deduplicateCrewEntries(crew);
    if (!normalizedCrew.length) return;

    // בונים רשימת חיפוש מהירה מתוך הנתונים שכבר יש לנו מפיירבייס
    const existingNames = new Set(contacts.map(c => normalizeName(`${c.firstName} ${c.lastName}`)).filter(Boolean));
    const existingPhones = new Set(contacts.map(c => normalizePhone(c.phone)).filter(Boolean));

    const batch = writeBatch(db);
    let addedCount = 0;

    for (const member of normalizedCrew) {
      const nameKey = normalizeName(member.name || '');
      const phoneKey = normalizePhone(member.phone);

      if (!nameKey || nameKey.length < 2) continue;

      // אם איש הצוות כבר קיים במסד הנתונים (לפי שם או טלפון), מדלגים
      if (existingNames.has(nameKey) || (phoneKey && existingPhones.has(phoneKey))) {
          continue;
      }

      // יצירת איש צוות חדש
      const { firstName, lastName } = splitName(nameKey);
      const role = normalizeRole(member.roleDetail || member.role || '');
      const department = inferDepartment(role);
      const newRef = doc(collection(db, 'contacts'));

      batch.set(newRef, {
        firstName,
        lastName,
        phone: phoneKey || null,
        role,
        department,
        availability: 'available',
        source: 'schedule', // סמן שנוסף מהלוח
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      // מוסיפים לרשימה המקומית כדי למנוע כפילויות באותו הוספה (Batch)
      existingNames.add(nameKey);
      if (phoneKey) existingPhones.add(phoneKey);
      addedCount++;
    }

    if (addedCount > 0) {
      await batch.commit();
      console.log(`[useContacts] Added ${addedCount} new crew members from schedule.`);
    }
  }, [user, contacts, ready]);

  return { contacts, loading, ready, ensureFromCrew };
}