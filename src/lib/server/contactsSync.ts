import { createHash } from 'crypto';
import { splitName, inferDepartment, inferSpecialty, inferWorkArea } from '@/lib/contactsUtils';
import {
  deduplicateCrewEntries,
  normalizeName,
  normalizePhone,
  normalizeRole,
} from '@/lib/crewNormalization';
import { normalizeProfessionalFields } from '@/lib/professionalFields';
import { createDocument, getDocument, listDocuments, runQuery } from '@/lib/server/firestoreAdminRest';
import { getFirebaseAdminFirestore } from '@/lib/server/firebaseAdmin';
import { getDepartmentForRole, normalizeRoleToCanonical, normalizeRolesToCanonical } from '@/constants/departments';

type ContactRecord = {
  id: string;
  firstName?: string;
  lastName?: string;
  department?: string;
  departments?: unknown;
  workArea?: string | null;
  specialty?: string;
  role?: string;
  roles?: unknown;
  phone?: string | null;
  email?: string | null;
  is_consented?: boolean;
  hiddenFromDirectory?: boolean;
  removedAt?: string | null;
  removalRequestedByUid?: string | null;
  removalReason?: string | null;
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
  linkedUids?: unknown;
};

type UserRecord = {
  id: string;
  displayName?: string;
  crewName?: string;
  phone?: string | null;
  normalizedPhone?: string | null;
  department?: string;
  departments?: unknown;
  role?: string;
  roles?: unknown;
  linkedContactId?: string | number | null;
  linkedUids?: unknown;
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

type GlobalProductionInput = {
  id?: string;
  crew_list?: Array<{
    name?: string;
    profession?: string;
    phone_number?: string | null;
    normalizedPhone?: string | null;
  }>;
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
  recoveredRoles: number;
  ignoredNoiseRoles: number;
  customRoles: number;
  contactsToUpdate: number;
  usersToUpdate: number;
  sampleMissing: Array<{ name: string; phone: string | null; role: string }>;
  sampleRecoveredRoles: Array<{ name: string; phone: string | null; addedRoles: string[] }>;
  sampleIgnoredNoiseRoles: Array<{ name: string; rawRole: string }>;
  sampleCustomRoles: Array<{ name: string; role: string }>;
};

const BATCH_LIMIT = 499;

function uniqueStrings(values: Array<string | null | undefined>): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    const clean = String(value || '').replace(/\s+/g, ' ').trim();
    if (!clean) continue;
    const key = clean.toLocaleLowerCase('he');
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(clean);
  }
  return result;
}

function sameStringArray(a: unknown, b: unknown): boolean {
  const left = Array.isArray(a) ? a.map(String) : [];
  const right = Array.isArray(b) ? b.map(String) : [];
  return JSON.stringify(left) === JSON.stringify(right);
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

function ghostSeed(name: string): number {
  return name.split('').reduce((acc, c) => acc + c.charCodeAt(0), 0) % 8;
}

function isLegacyDepartment(value: string | undefined): boolean {
  return ['אולפן', 'קונטרול', 'כללי'].includes(String(value || ''));
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

function contactDisplayName(contact: ContactRecord): string {
  return `${contact.firstName || ''} ${contact.lastName || ''}`.replace(/\s+/g, ' ').trim();
}

function normalizedContactName(contact: ContactRecord): string {
  // Prefer the displayed first/last name. Some migrated contacts carried a stale
  // normalizedName typo, which prevented duplicate cleanup and caused duplicate
  // directory cards for the same visible person.
  return normalizeName(contactDisplayName(contact) || contact.normalizedName || '');
}

function shouldDeleteAsRedundant(contact: ContactRecord, keeper: ContactRecord): boolean {
  if (!contact.id || contact.id === keeper.id) return false;
  if (contact.normalizedPhone && keeper.normalizedPhone && contact.normalizedPhone !== keeper.normalizedPhone) {
    return false;
  }

  const contactName = normalizedContactName(contact);
  const keeperName = normalizedContactName(keeper);
  if (!contactName || contactName !== keeperName) return false;

  const keeperHasPhone = Boolean(keeper.normalizedPhone || keeper.phone);
  const contactHasPhone = Boolean(contact.normalizedPhone || contact.phone);

  if (contactHasPhone && keeperHasPhone) return false;
  if (contactHasPhone && !keeperHasPhone) return false;
  if (!contactHasPhone && keeperHasPhone) return true;

  return scoreContact(contact) < scoreContact(keeper);
}

class SafeFirestoreBatchWriter {
  private db = getFirebaseAdminFirestore();
  private batch = this.db.batch();
  private count = 0;
  private batches: Array<ReturnType<ReturnType<typeof getFirebaseAdminFirestore>['batch']>> = [];

  set(path: string, data: Record<string, unknown>) {
    this.batch.set(this.db.doc(path), data, { merge: true });
    this.count += 1;
    this.flushIfNeeded();
  }

  update(path: string, data: Record<string, unknown>) {
    this.batch.update(this.db.doc(path), data);
    this.count += 1;
    this.flushIfNeeded();
  }

  delete(path: string) {
    this.batch.delete(this.db.doc(path));
    this.count += 1;
    this.flushIfNeeded();
  }

  private flushIfNeeded() {
    if (this.count < BATCH_LIMIT) return;
    this.batches.push(this.batch);
    this.batch = this.db.batch();
    this.count = 0;
  }

  async commit() {
    if (this.count > 0) {
      this.batches.push(this.batch);
      this.batch = this.db.batch();
      this.count = 0;
    }
    for (const batch of this.batches) {
      await batch.commit();
    }
    this.batches = [];
  }
}

async function writeDiscoveries(
  entries: Array<{
    name: string;
    phone: string | null;
    role: string;
    sources: string[];
    contactId: string;
  }>,
): Promise<void> {
  if (entries.length === 0) return;
  const today = new Date().toISOString().slice(0, 10);
  await Promise.allSettled(
    entries.map((entry) => {
      const sourceBoard = entry.sources[0] || 'schedule';
      const sourceBoardName =
        sourceBoard === 'global_productions' ? 'הפקות גלובלי' : 'לוח הפקה';
      return createDocument('contact_discoveries', {
        name: entry.name,
        phone: entry.phone ?? null,
        role: entry.role,
        sourceBoard,
        sourceBoardName,
        contactId: entry.contactId,
        createdAt: new Date().toISOString(),
        discoveryDate: today,
      });
    }),
  );
}

async function cleanupDuplicateContacts(
  contacts: ContactRecord[],
  writer: SafeFirestoreBatchWriter | null,
): Promise<{ deletedDuplicates: number; remainingContacts: number }> {
  const groups = new Map<string, ContactRecord[]>();

  for (const contact of contacts) {
    const normalizedName = normalizedContactName(contact);
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
      writer?.delete(`contacts/${contact.id}`);
    }
  }

  return {
    deletedDuplicates,
    remainingContacts: contacts.length - deletedDuplicates,
  };
}

function toSyncCandidate(member: CrewInput, source = 'schedule'): SyncCandidate | null {
  const normalizedName = normalizeName(member.normalizedName || member.name || '');
  if (!normalizedName || normalizedName.length < 2) return null;

  const normalizedPhone = normalizePhone(member.normalizedPhone || member.phone || null);
  const identityKey = normalizedPhone ? `${normalizedName}::${normalizedPhone}` : normalizedName;
  const rawRole = member.roleDetail || member.role || '';
  const normalizedRole = normalizeRoleToCanonical(rawRole);
  if (normalizedRole.ignoredAsNoise || !normalizedRole.isCanonical || !normalizedRole.canonicalRole) return null;

  const role = normalizedRole.canonicalRole || normalizeRole(rawRole);
  const department = getDepartmentForRole(role) || inferDepartment(role, normalizedName);
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
    sources: [source],
  };
}

function collectCandidates(
  productions: ProductionInput[],
  globalProductions: GlobalProductionInput[] = [],
): {
  candidates: SyncCandidate[];
  ignoredNoiseRoles: number;
  customRoles: number;
  sampleIgnoredNoiseRoles: Array<{ name: string; rawRole: string }>;
  sampleCustomRoles: Array<{ name: string; role: string }>;
} {
  let ignoredNoiseRoles = 0;
  let customRoles = 0;
  const sampleIgnoredNoiseRoles: Array<{ name: string; rawRole: string }> = [];
  const sampleCustomRoles: Array<{ name: string; role: string }> = [];

  const flattened = [
    ...productions.flatMap((production) =>
      (production.crew || []).map((member) => ({
        name: member.name || '',
        role: member.role || '',
        roleDetail: member.roleDetail || '',
        phone: member.phone || null,
        startTime: '',
        endTime: '',
      })),
    ),
    ...globalProductions.flatMap((production) =>
      (production.crew_list || []).map((member) => ({
        name: member.name || '',
        role: member.profession || '',
        roleDetail: member.profession || '',
        phone: member.phone_number || member.normalizedPhone || null,
        startTime: '',
        endTime: '',
      })),
    ),
  ];

  const candidates = deduplicateCrewEntries(flattened)
    .map((member) => {
      const normalizedRole = normalizeRoleToCanonical(member.roleDetail || member.role || '');
      if (normalizedRole.ignoredAsNoise) {
        ignoredNoiseRoles++;
        if (sampleIgnoredNoiseRoles.length < 12) {
          sampleIgnoredNoiseRoles.push({ name: member.name || '', rawRole: normalizedRole.raw });
        }
      } else if (normalizedRole.isCustom) {
        customRoles++;
        if (sampleCustomRoles.length < 12) {
          sampleCustomRoles.push({ name: member.name || '', role: normalizedRole.cleaned });
        }
      }
      return toSyncCandidate(member);
    })
    .filter((member): member is SyncCandidate => Boolean(member));

  return { candidates, ignoredNoiseRoles, customRoles, sampleIgnoredNoiseRoles, sampleCustomRoles };
}

function mergeRoleFields(existing: Record<string, unknown> | null, recoveredRoles: string[]) {
  const normalizedExistingRoles = normalizeRolesToCanonical(existing?.roles, existing?.role);
  const roles = normalizeRolesToCanonical([...normalizedExistingRoles, ...recoveredRoles]);
  const existingDepartments = normalizeProfessionalFields(existing).departments;
  const inferredDepartments = roles
    .map((role) => getDepartmentForRole(role))
    .filter(Boolean);
  const departments = uniqueStrings([...existingDepartments, ...inferredDepartments]);

  return {
    roles,
    role: roles[0] || '',
    departments,
    department: departments[0] || '',
  };
}

function buildContactPatch(existing: ContactRecord | null, candidate: SyncCandidate) {
  const sources = buildSourceList(existing, candidate);
  const source = existing?.source || sources[0] || 'schedule';
  const isHiddenFromDirectory = existing?.hiddenFromDirectory === true;
  const mergedPhone = isHiddenFromDirectory ? null : existing?.phone || candidate.normalizedPhone;
  const mergedRoleFields = mergeRoleFields(existing as Record<string, unknown> | null, [candidate.role]);
  const createdAt = existing ? undefined : nowIso();
  const ghostFields = existing ? {} : { isGhost: true, ghostAvatarSeed: ghostSeed(candidate.normalizedName) };
  const department = existing?.department && !isLegacyDepartment(existing.department)
    ? mergedRoleFields.department || existing.department
    : mergedRoleFields.department || candidate.department;

  return {
    firstName: existing?.firstName || candidate.firstName,
    lastName: existing?.lastName || candidate.lastName,
    phone: mergedPhone,
    is_consented: existing?.is_consented === true,
    hiddenFromDirectory: isHiddenFromDirectory,
    removedAt: existing?.removedAt || null,
    removalRequestedByUid: existing?.removalRequestedByUid || null,
    removalReason: existing?.removalReason || null,
    role: mergedRoleFields.role,
    roles: mergedRoleFields.roles,
    department,
    departments: mergedRoleFields.departments.length ? mergedRoleFields.departments : [department].filter(Boolean),
    workArea: existing?.workArea || candidate.workArea,
    specialty: existing?.specialty || candidate.specialty,
    normalizedName: candidate.normalizedName,
    normalizedPhone: mergedPhone || null,
    identityKey: mergedPhone ? `${candidate.normalizedName}::${mergedPhone}` : candidate.normalizedName,
    partialContact: !mergedPhone,
    source,
    sources,
    updatedAt: nowIso(),
    ...(createdAt ? { createdAt } : {}),
    ...ghostFields,
  };
}

function contactNeedsUpdate(existing: ContactRecord, merged: ReturnType<typeof buildContactPatch>): boolean {
  return (
    existing.phone !== merged.phone ||
    existing.role !== merged.role ||
    !sameStringArray(existing.roles, merged.roles) ||
    existing.department !== merged.department ||
    !sameStringArray(existing.departments, merged.departments) ||
    (existing.workArea || null) !== (merged.workArea || null) ||
    existing.specialty !== merged.specialty ||
    existing.normalizedName !== merged.normalizedName ||
    existing.normalizedPhone !== merged.normalizedPhone ||
    existing.identityKey !== merged.identityKey ||
    existing.partialContact !== merged.partialContact ||
    JSON.stringify(existing.sources || []) !== JSON.stringify(merged.sources)
  );
}

async function getUserSiteRole(uid: string): Promise<string | null> {
  const userDoc = await getDocument<{ siteRole?: string }>(`users/${uid}`);
  return userDoc?.siteRole || null;
}

function shouldIncludeProductionDocument(path: string, production: ProductionInput): boolean {
  return path.includes('/weeks/') && Array.isArray(production.crew);
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.map(String).filter(Boolean) : [];
}

function indexUsers(users: UserRecord[]) {
  const byId = new Map<string, UserRecord>();
  const byPhone = new Map<string, UserRecord[]>();
  const byName = new Map<string, UserRecord[]>();
  const byContactId = new Map<string, UserRecord[]>();

  for (const user of users) {
    byId.set(user.id, user);
    const normalizedPhone = normalizePhone(user.normalizedPhone || user.phone || null);
    const names = uniqueStrings([user.displayName, user.crewName]);
    const linkedContactId = user.linkedContactId !== null && user.linkedContactId !== undefined
      ? String(user.linkedContactId)
      : '';

    if (normalizedPhone) {
      const current = byPhone.get(normalizedPhone) || [];
      current.push(user);
      byPhone.set(normalizedPhone, current);
    }

    for (const name of names) {
      const normalizedName = normalizeName(name);
      if (!normalizedName) continue;
      const current = byName.get(normalizedName) || [];
      current.push(user);
      byName.set(normalizedName, current);
    }

    if (linkedContactId) {
      const current = byContactId.get(linkedContactId) || [];
      current.push(user);
      byContactId.set(linkedContactId, current);
    }
  }

  return { byId, byPhone, byName, byContactId };
}

function usersForCandidate(candidate: SyncCandidate, existing: ContactRecord | null, userIndex: ReturnType<typeof indexUsers>) {
  const users = new Map<string, UserRecord>();
  const add = (entries: UserRecord[] | undefined) => entries?.forEach((entry) => users.set(entry.id, entry));
  if (candidate.normalizedPhone) add(userIndex.byPhone.get(candidate.normalizedPhone));
  add(userIndex.byName.get(candidate.normalizedName));
  if (existing?.id) add(userIndex.byContactId.get(existing.id));
  stringArray(existing?.linkedUids).forEach((uid) => {
    const linkedUser = userIndex.byId.get(uid);
    if (linkedUser) users.set(linkedUser.id, linkedUser);
  });
  return Array.from(users.values()).filter((entry) => entry.id);
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
  globalProductions: GlobalProductionInput[] = [],
  options: { cleanupDuplicates?: boolean } = {},
): Promise<ContactsSyncStats> {
  const [contacts, users] = await Promise.all([
    listDocuments<ContactRecord>('contacts'),
    listDocuments<UserRecord>('users'),
  ]);
  const currentContacts = contacts.length;
  const candidateCollection = collectCandidates(productions, globalProductions);
  const candidates = candidateCollection.candidates;

  const byPhone = new Map<string, ContactRecord>();
  const byComposite = new Map<string, ContactRecord>();
  const byNameWithoutPhone = new Map<string, ContactRecord>();
  const byNameWithPhone = new Map<string, ContactRecord>();
  const userIndex = indexUsers(users);
  const writer = applyChanges ? new SafeFirestoreBatchWriter() : null;

  for (const contact of contacts) {
    const normalizedName = normalizedContactName(contact);
    const normalizedPhone = normalizePhone(contact.normalizedPhone || contact.phone || null);

    if (normalizedPhone) {
      byPhone.set(normalizedPhone, { ...contact, normalizedName, normalizedPhone });
      byComposite.set(`${normalizedName}::${normalizedPhone}`, { ...contact, normalizedName, normalizedPhone });
      if (normalizedName) byNameWithPhone.set(normalizedName, { ...contact, normalizedName, normalizedPhone });
    } else if (normalizedName) {
      byNameWithoutPhone.set(normalizedName, { ...contact, normalizedName, normalizedPhone: null });
    }
  }

  let created = 0;
  let updated = 0;
  let skipped = 0;
  let partialWithoutPhone = 0;
  let recoveredRoles = 0;
  let usersToUpdate = 0;
  const sampleMissing: Array<{ name: string; phone: string | null; role: string }> = [];
  const discoveryQueue: Array<{
    name: string;
    phone: string | null;
    role: string;
    sources: string[];
    contactId: string;
  }> = [];
  const sampleRecoveredRoles: Array<{ name: string; phone: string | null; addedRoles: string[] }> = [];
  const touchedUsers = new Set<string>();

  for (const candidate of candidates) {
    if (candidate.partialContact) partialWithoutPhone++;

    const existing =
      (candidate.normalizedPhone && byPhone.get(candidate.normalizedPhone)) ||
      (candidate.normalizedPhone && byComposite.get(candidate.identityKey)) ||
      (!candidate.normalizedPhone ? byNameWithoutPhone.get(candidate.normalizedName) : null) ||
      (!candidate.normalizedPhone ? byNameWithPhone.get(candidate.normalizedName) : null) ||
      null;

    const existingRoles = normalizeRolesToCanonical(existing?.roles, existing?.role);
    const roleWasMissing = Boolean(candidate.role && !existingRoles.includes(candidate.role));
    if (roleWasMissing) {
      recoveredRoles++;
      if (sampleRecoveredRoles.length < 12) {
        sampleRecoveredRoles.push({
          name: candidate.normalizedName,
          phone: candidate.normalizedPhone,
          addedRoles: [candidate.role],
        });
      }
    }

    if (!existing && sampleMissing.length < 12) {
      sampleMissing.push({
        name: candidate.normalizedName,
        phone: candidate.normalizedPhone,
        role: candidate.role,
      });
    }

    const merged = buildContactPatch(existing, candidate);

    if (!existing) {
      created++;
      const docId = buildCandidateDocId(candidate);
      writer?.set(`contacts/${docId}`, merged);

      const createdRecord: ContactRecord = { id: docId, ...merged };
      if (candidate.normalizedPhone) {
        byPhone.set(candidate.normalizedPhone, createdRecord);
        byComposite.set(candidate.identityKey, createdRecord);
        byNameWithPhone.set(candidate.normalizedName, createdRecord);
      } else {
        byNameWithoutPhone.set(candidate.normalizedName, createdRecord);
      }
      if (applyChanges) {
        discoveryQueue.push({
          name: candidate.normalizedName,
          phone: candidate.normalizedPhone,
          role: candidate.role,
          sources: candidate.sources,
          contactId: docId,
        });
      }
    } else if (contactNeedsUpdate(existing, merged)) {
      updated++;
      writer?.update(`contacts/${existing.id}`, merged);

      const updatedRecord: ContactRecord = { ...existing, ...merged };
      if (updatedRecord.normalizedPhone) {
        byPhone.set(updatedRecord.normalizedPhone, updatedRecord);
        byComposite.set(`${updatedRecord.normalizedName}::${updatedRecord.normalizedPhone}`, updatedRecord);
        byNameWithPhone.set(updatedRecord.normalizedName || '', updatedRecord);
        byNameWithoutPhone.delete(updatedRecord.normalizedName || '');
      } else if (updatedRecord.normalizedName) {
        byNameWithoutPhone.set(updatedRecord.normalizedName, updatedRecord);
      }
    } else {
      skipped++;
    }

    for (const user of usersForCandidate(candidate, existing, userIndex)) {
      if (touchedUsers.has(user.id)) continue;
      const mergedUserFields = mergeRoleFields(user as Record<string, unknown>, [candidate.role]);
      const needsUserUpdate =
        user.role !== mergedUserFields.role ||
        user.department !== mergedUserFields.department ||
        !sameStringArray(user.roles, mergedUserFields.roles) ||
        !sameStringArray(user.departments, mergedUserFields.departments);

      if (!needsUserUpdate) continue;
      touchedUsers.add(user.id);
      usersToUpdate++;
      writer?.update(`users/${user.id}`, {
        ...mergedUserFields,
        updatedAt: nowIso(),
      });
    }
  }

  const contactsAfterSync = applyChanges ? contacts : contacts.map((contact) => ({ ...contact }));
  const cleanup = options.cleanupDuplicates
    ? await cleanupDuplicateContacts(contactsAfterSync, writer)
    : { deletedDuplicates: 0, remainingContacts: contactsAfterSync.length };

  let recategorized = 0;
  for (const contact of contactsAfterSync) {
    const professional = normalizeProfessionalFields(contact as Record<string, unknown>);
    const role = professional.role || String(contact.role || '');
    const fullName = `${contact.firstName || ''} ${contact.lastName || ''}`.trim();
    const correctDepartment = professional.department || inferDepartment(role, fullName);
    const correctWorkArea = inferWorkArea(role, fullName);
    const correctSpecialty = inferSpecialty(role, fullName);
    if (
      contact.department === correctDepartment &&
      (contact.workArea || null) === correctWorkArea &&
      contact.specialty === correctSpecialty &&
      sameStringArray(contact.roles, professional.roles) &&
      sameStringArray(contact.departments, professional.departments)
    ) {
      continue;
    }

    recategorized++;
    writer?.update(`contacts/${contact.id}`, {
      role: professional.role,
      roles: professional.roles,
      department: correctDepartment,
      departments: professional.departments,
      workArea: correctWorkArea,
      specialty: correctSpecialty,
      updatedAt: nowIso(),
    });
  }

  await writer?.commit();

  if (applyChanges && discoveryQueue.length > 0) {
    await writeDiscoveries(discoveryQueue);
  }

  return {
    currentContacts,
    canonicalContacts: currentContacts + created - cleanup.deletedDuplicates,
    diff: created - cleanup.deletedDuplicates,
    crewFound: candidates.length,
    scannedProductions: productions.length + globalProductions.length,
    created,
    updated,
    skipped,
    partialWithoutPhone,
    deletedDuplicates: cleanup.deletedDuplicates,
    recategorized,
    recoveredRoles,
    ignoredNoiseRoles: candidateCollection.ignoredNoiseRoles,
    customRoles: candidateCollection.customRoles,
    contactsToUpdate: created + updated + recategorized,
    usersToUpdate,
    sampleMissing,
    sampleRecoveredRoles,
    sampleIgnoredNoiseRoles: candidateCollection.sampleIgnoredNoiseRoles,
    sampleCustomRoles: candidateCollection.sampleCustomRoles,
  };
}

export async function syncContactsFromSavedProductions(applyChanges: boolean): Promise<ContactsSyncStats> {
  const [productionDocs, globalProductionDocs] = await Promise.all([
    runQuery<ProductionInput & { _path?: string }>(
      {
        from: [{ collectionId: 'productions', allDescendants: true }],
      },
    ),
    runQuery<GlobalProductionInput>(
      {
        from: [{ collectionId: 'global_productions' }],
      },
    ).catch(() => [] as GlobalProductionInput[]),
  ]);

  const filtered = productionDocs.filter((production) =>
    shouldIncludeProductionDocument(String(production._path || ''), production),
  );

  return syncContactsFromProductions(filtered, applyChanges, globalProductionDocs, { cleanupDuplicates: true });
}
