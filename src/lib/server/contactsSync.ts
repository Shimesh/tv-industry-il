import { createHash } from 'crypto';
import { splitName, inferDepartment, inferSpecialty, inferWorkArea } from '@/lib/contactsUtils';
import {
  deduplicateCrewEntries,
  normalizeName,
  normalizePhone,
  normalizeRole,
} from '@/lib/crewNormalization';
import {
  deleteDocument,
  getDocument,
  listDocuments,
  patchDocument,
  runQuery,
} from '@/lib/server/firestoreAdminRest';

type ContactRecord = {
  id: string;
  firstName?: string;
  lastName?: string;
  department?: string;
  workArea?: string | null;
  specialty?: string;
  role?: string;
  phone?: string | null;
  source?: string;
  sources?: string[];
  normalizedName?: string;
  normalizedPhone?: string | null;
  identityKey?: string;
  partialContact?: boolean;
  availability?: string;
  openToWork?: boolean;
  city?: string | null;
  yearsOfExperience?: number | null;
  credits?: string[] | null;
  gear?: string[] | null;
  skills?: string[] | null;
};

type CrewInput = {
  name?: string;
  role?: string;
  roleDetail?: string;
  phone?: string | null;
  normalizedName?: string;
  normalizedPhone?: string | null;
  identityKey?: string;
};

type ProductionInput = {
  id?: string;
  crew?: CrewInput[];
};

type SyncCandidate = {
  normalizedName: string;
  normalizedPhone: string | null;
  identityKey: string;
  firstName: string;
  lastName: string;
  role: string;
  department: string;
  workArea: string | null;
  specialty: string;
  partialContact: boolean;
  sources: string[];
};

export type ContactsSyncStats = {
  currentContacts: number;
  canonicalContacts: number;
  diff: number;
  crewFound: number;
  scannedProductions: number;
  created: number;
  updated: number;
  skipped: number;
  partialWithoutPhone: number;
  deletedDuplicates: number;
  recategorized: number;
  sampleMissing: Array<{ name: string; phone: string | null; role: string }>;
};

function uniqueStrings(values: Array<string | null | undefined>): string[] {
  return Array.from(new Set(values.map((value) => String(value || '').trim()).filter(Boolean)));
}

function buildCandidateDocId(candidate: SyncCandidate): string {
  const digest = createHash('sha1').update(candidate.identityKey).digest('hex').slice(0, 20);
  return `schedule-${digest}`;
}

function buildSourceList(existing: ContactRecord | null, candidate: SyncCandidate): string[] {
  return uniqueStrings([
    ...(existing?.sources || []),
    existing?.source || '',
    ...candidate.sources,
  ]);
}

function nowIso(): string {
  return new Date().toISOString();
}

function isLegacyDepartment(value: string | undefined): boolean {
  return ['אולפן', 'קונטרול', 'כללי'].includes(String(value || ''));
}

function pickDepartment(existing: ContactRecord | null, candidate: SyncCandidate): string {
  if (!existing?.department) return candidate.department;
  if (isLegacyDepartment(existing.department)) return candidate.department;
  return existing.department;
}

function pickWorkArea(existing: ContactRecord | null, candidate: SyncCandidate): string | null {
  if (existing?.workArea) return existing.workArea;
  return candidate.workArea;
}

function pickSpecialty(existing: ContactRecord | null, candidate: SyncCandidate): string {
  if (existing?.specialty) return existing.specialty;
  return candidate.specialty;
}

function scoreContact(contact: ContactRecord): number {
  let score = 0;
  if (contact.phone) score += 100;
  if (contact.normalizedPhone) score += 50;
  if (contact.source && contact.source !== 'schedule') score += 25;
  if ((contact.sources || []).some((source) => source && source !== 'schedule')) score += 15;
  if (contact.city) score += 5;
  if (contact.yearsOfExperience) score += 5;
  if (contact.credits?.length) score += 5;
  if (contact.skills?.length) score += 5;
  if (contact.gear?.length) score += 5;
  if (contact.role) score += 3;
  return score;
}

function shouldDeleteAsRedundant(contact: ContactRecord, keeper: ContactRecord): boolean {
  if (!contact.id || contact.id === keeper.id) return false;
  if (contact.normalizedPhone && keeper.normalizedPhone && contact.normalizedPhone !== keeper.normalizedPhone) {
    return false;
  }

  const contactName = normalizeName(contact.normalizedName || `${contact.firstName || ''} ${contact.lastName || ''}`);
  const keeperName = normalizeName(keeper.normalizedName || `${keeper.firstName || ''} ${keeper.lastName || ''}`);
  if (!contactName || contactName !== keeperName) return false;

  const keeperHasPhone = Boolean(keeper.normalizedPhone || keeper.phone);
  const contactHasPhone = Boolean(contact.normalizedPhone || contact.phone);

  if (contactHasPhone && keeperHasPhone) return false;
  if (contactHasPhone && !keeperHasPhone) return false;
  if (!contactHasPhone && keeperHasPhone) return true;

  return scoreContact(contact) < scoreContact(keeper);
}

async function cleanupDuplicateContacts(
  contacts: ContactRecord[],
  applyChanges: boolean,
): Promise<{ deletedDuplicates: number; remainingContacts: number }> {
  const groups = new Map<string, ContactRecord[]>();

  for (const contact of contacts) {
    const normalizedName = normalizeName(
      contact.normalizedName || `${contact.firstName || ''} ${contact.lastName || ''}`,
    );
    if (!normalizedName) continue;
    const enriched: ContactRecord = {
      ...contact,
      normalizedName,
      normalizedPhone: normalizePhone(contact.normalizedPhone || contact.phone || null),
    };
    const current = groups.get(normalizedName) || [];
    current.push(enriched);
    groups.set(normalizedName, current);
  }

  let deletedDuplicates = 0;

  for (const group of groups.values()) {
    if (group.length < 2) continue;

    const keeper = [...group].sort((a, b) => scoreContact(b) - scoreContact(a))[0];
    const redundant = group.filter((contact) => shouldDeleteAsRedundant(contact, keeper));

    for (const contact of redundant) {
      deletedDuplicates++;
      if (applyChanges) {
        await deleteDocument(`contacts/${contact.id}`);
      }
    }
  }

  return {
    deletedDuplicates,
    remainingContacts: contacts.length - deletedDuplicates,
  };
}

async function reclassifyAllContacts(
  contacts: ContactRecord[],
  applyChanges: boolean,
): Promise<number> {
  let recategorized = 0;

  for (const contact of contacts) {
    const role = String(contact.role || '');
    const fullName = `${contact.firstName || ''} ${contact.lastName || ''}`.trim();
    const correctDepartment = inferDepartment(role, fullName);
    const correctWorkArea = inferWorkArea(role, fullName);
    const correctSpecialty = inferSpecialty(role, fullName);
    if (
      contact.department === correctDepartment &&
      (contact.workArea || null) === correctWorkArea &&
      contact.specialty === correctSpecialty
    ) {
      continue;
    }

    recategorized++;
    if (applyChanges) {
      await patchDocument(`contacts/${contact.id}`, {
        department: correctDepartment,
        workArea: correctWorkArea,
        specialty: correctSpecialty,
        updatedAt: nowIso(),
      });
    }
  }

  return recategorized;
}

function toSyncCandidate(member: CrewInput): SyncCandidate | null {
  const normalizedName = normalizeName(member.normalizedName || member.name || '');
  if (!normalizedName || normalizedName.length < 2) return null;

  const normalizedPhone = normalizePhone(member.normalizedPhone || member.phone || null);
  const identityKey = normalizedPhone ? `${normalizedName}::${normalizedPhone}` : normalizedName;
  const role = normalizeRole(member.roleDetail || member.role || '');
  const department = inferDepartment(role, normalizedName);
  const workArea = inferWorkArea(role, normalizedName);
  const specialty = inferSpecialty(role, normalizedName);
  const { firstName, lastName } = splitName(normalizedName);

  return {
    normalizedName,
    normalizedPhone,
    identityKey,
    firstName,
    lastName,
    role,
    department,
    workArea,
    specialty,
    partialContact: !normalizedPhone,
    sources: ['schedule'],
  };
}

function collectCandidates(productions: ProductionInput[]): SyncCandidate[] {
  const flattened = productions.flatMap((production) =>
    (production.crew || []).map((member) => ({
      name: member.name || '',
      role: member.role || '',
      roleDetail: member.roleDetail || '',
      phone: member.phone || null,
      startTime: '',
      endTime: '',
    })),
  );
  return deduplicateCrewEntries(flattened)
    .map((member) => toSyncCandidate(member))
    .filter((member): member is SyncCandidate => Boolean(member));
}

function mergeContactData(existing: ContactRecord | null, candidate: SyncCandidate) {
  const sources = buildSourceList(existing, candidate);
  const source = existing?.source || sources[0] || 'schedule';
  const mergedPhone = existing?.phone || candidate.normalizedPhone;
  const mergedRole = existing?.role || candidate.role;
  const mergedDepartment = pickDepartment(existing, candidate);
  const mergedWorkArea = pickWorkArea(existing, candidate);
  const mergedSpecialty = pickSpecialty(existing, candidate);
  const createdAt = existing ? undefined : nowIso();

  return {
    firstName: existing?.firstName || candidate.firstName,
    lastName: existing?.lastName || candidate.lastName,
    phone: mergedPhone,
    role: mergedRole,
    department: mergedDepartment,
    workArea: mergedWorkArea,
    specialty: mergedSpecialty,
    normalizedName: candidate.normalizedName,
    normalizedPhone: mergedPhone || null,
    identityKey: mergedPhone ? `${candidate.normalizedName}::${mergedPhone}` : candidate.normalizedName,
    partialContact: !mergedPhone,
    source,
    sources,
    updatedAt: nowIso(),
    ...(createdAt ? { createdAt } : {}),
  };
}

async function getUserSiteRole(uid: string): Promise<string | null> {
  const userDoc = await getDocument<{ siteRole?: string }>(`users/${uid}`);
  return userDoc?.siteRole || null;
}

function shouldIncludeProductionDocument(path: string, production: ProductionInput): boolean {
  return path.includes('/weeks/') && Array.isArray(production.crew);
}

export async function assertIsAdmin(uid: string): Promise<void> {
  const siteRole = await getUserSiteRole(uid);
  if (siteRole !== 'admin') {
    throw new Error('Admin access required');
  }
}

export async function syncContactsFromProductions(
  productions: ProductionInput[],
  applyChanges: boolean,
): Promise<ContactsSyncStats> {
  const contacts = await listDocuments<ContactRecord>('contacts');
  const currentContacts = contacts.length;
  const candidates = collectCandidates(productions);

  const byPhone = new Map<string, ContactRecord>();
  const byComposite = new Map<string, ContactRecord>();
  const byNameWithoutPhone = new Map<string, ContactRecord>();
  const byNameWithPhone = new Map<string, ContactRecord>();

  for (const contact of contacts) {
    const normalizedName = normalizeName(
      contact.normalizedName || `${contact.firstName || ''} ${contact.lastName || ''}`,
    );
    const normalizedPhone = normalizePhone(contact.normalizedPhone || contact.phone || null);

    if (normalizedPhone) {
      byPhone.set(normalizedPhone, { ...contact, normalizedName, normalizedPhone });
      byComposite.set(`${normalizedName}::${normalizedPhone}`, { ...contact, normalizedName, normalizedPhone });
      if (normalizedName) {
        byNameWithPhone.set(normalizedName, { ...contact, normalizedName, normalizedPhone });
      }
    } else if (normalizedName) {
      byNameWithoutPhone.set(normalizedName, { ...contact, normalizedName, normalizedPhone: null });
    }
  }

  let created = 0;
  let updated = 0;
  let skipped = 0;
  let partialWithoutPhone = 0;
  const sampleMissing: Array<{ name: string; phone: string | null; role: string }> = [];

  for (const candidate of candidates) {
    if (candidate.partialContact) partialWithoutPhone++;

    const existing =
      (candidate.normalizedPhone && byPhone.get(candidate.normalizedPhone)) ||
      (candidate.normalizedPhone && byComposite.get(candidate.identityKey)) ||
      (!candidate.normalizedPhone ? byNameWithoutPhone.get(candidate.normalizedName) : null) ||
      (!candidate.normalizedPhone ? byNameWithPhone.get(candidate.normalizedName) : null) ||
      null;

    if (!existing && sampleMissing.length < 12) {
      sampleMissing.push({
        name: candidate.normalizedName,
        phone: candidate.normalizedPhone,
        role: candidate.role,
      });
    }

    if (!existing) {
      created++;
      if (applyChanges) {
        const docId = buildCandidateDocId(candidate);
        await patchDocument(`contacts/${docId}`, mergeContactData(null, candidate));
      }

      const createdRecord: ContactRecord = {
        id: buildCandidateDocId(candidate),
        ...mergeContactData(null, candidate),
      };
      if (candidate.normalizedPhone) {
        byPhone.set(candidate.normalizedPhone, createdRecord);
        byComposite.set(candidate.identityKey, createdRecord);
        byNameWithPhone.set(candidate.normalizedName, createdRecord);
      } else {
        byNameWithoutPhone.set(candidate.normalizedName, createdRecord);
      }
      continue;
    }

    const merged = mergeContactData(existing, candidate);
    const needsUpdate =
      existing.phone !== merged.phone ||
      existing.role !== merged.role ||
      existing.department !== merged.department ||
      (existing.workArea || null) !== (merged.workArea || null) ||
      existing.specialty !== merged.specialty ||
      existing.normalizedName !== merged.normalizedName ||
      existing.normalizedPhone !== merged.normalizedPhone ||
      existing.identityKey !== merged.identityKey ||
      existing.partialContact !== merged.partialContact ||
      JSON.stringify(existing.sources || []) !== JSON.stringify(merged.sources);

    if (!needsUpdate) {
      skipped++;
      continue;
    }

    updated++;
    if (applyChanges) {
      await patchDocument(`contacts/${existing.id}`, merged);
    }

    const updatedRecord: ContactRecord = { ...existing, ...merged };
    if (updatedRecord.normalizedPhone) {
      byPhone.set(updatedRecord.normalizedPhone, updatedRecord);
      byComposite.set(`${updatedRecord.normalizedName}::${updatedRecord.normalizedPhone}`, updatedRecord);
      byNameWithPhone.set(updatedRecord.normalizedName || '', updatedRecord);
      byNameWithoutPhone.delete(updatedRecord.normalizedName || '');
    } else if (updatedRecord.normalizedName) {
      byNameWithoutPhone.set(updatedRecord.normalizedName, updatedRecord);
    }
  }

  const contactsAfterSync = await listDocuments<ContactRecord>('contacts');
  const cleanup = await cleanupDuplicateContacts(contactsAfterSync, applyChanges);
  const contactsAfterCleanup = applyChanges
    ? await listDocuments<ContactRecord>('contacts')
    : contactsAfterSync.filter((contact) => {
        const normalizedName = normalizeName(
          contact.normalizedName || `${contact.firstName || ''} ${contact.lastName || ''}`,
        );
        const withSameName = contactsAfterSync.filter((entry) => {
          const entryName = normalizeName(
            entry.normalizedName || `${entry.firstName || ''} ${entry.lastName || ''}`,
          );
          return entryName === normalizedName;
        });
        const keeper = [...withSameName].sort((a, b) => scoreContact(b) - scoreContact(a))[0];
        return !shouldDeleteAsRedundant(
          {
            ...contact,
            normalizedName,
            normalizedPhone: normalizePhone(contact.normalizedPhone || contact.phone || null),
          },
          {
            ...keeper,
            normalizedName,
            normalizedPhone: normalizePhone(keeper.normalizedPhone || keeper.phone || null),
          },
        );
      });
  const recategorized = await reclassifyAllContacts(contactsAfterCleanup, applyChanges);

  return {
    currentContacts,
    canonicalContacts: currentContacts + created - cleanup.deletedDuplicates,
    diff: created - cleanup.deletedDuplicates,
    crewFound: candidates.length,
    scannedProductions: productions.length,
    created,
    updated,
    skipped,
    partialWithoutPhone,
    deletedDuplicates: cleanup.deletedDuplicates,
    recategorized,
    sampleMissing,
  };
}

export async function syncContactsFromSavedProductions(applyChanges: boolean): Promise<ContactsSyncStats> {
  const productionDocs = await runQuery<ProductionInput & { _path?: string }>(
    {
      from: [{ collectionId: 'productions', allDescendants: true }],
    },
  );

  const filtered = productionDocs.filter((production) =>
    shouldIncludeProductionDocument(String(production._path || ''), production),
  );

  return syncContactsFromProductions(filtered, applyChanges);
}
