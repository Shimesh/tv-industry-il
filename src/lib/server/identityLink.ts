import type { VerifiedAuthUser } from '@/lib/apiAuth';
import { normalizePhone as normalizeDisplayPhone } from '@/lib/contactsUtils';
import { getDocument, listDocuments, patchDocument } from '@/lib/server/firestoreAdminRest';

type IdentitySource = 'profiles' | 'industry_people' | 'contacts';

export type IdentityCandidate = {
  id: string;
  source: IdentitySource;
  displayName: string;
  phone: string;
  department: string;
  role: string;
  profileId: string;
  isAdmin: boolean;
  siteRole?: 'admin' | 'moderator' | 'editor' | 'viewer' | 'user';
};

type RawIdentityDoc = Record<string, unknown> & { id?: string };

function stringField(doc: RawIdentityDoc, keys: string[], fallback = ''): string {
  for (const key of keys) {
    const value = doc[key];
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return fallback;
}

function booleanField(doc: RawIdentityDoc, keys: string[]): boolean {
  return keys.some((key) => doc[key] === true);
}

function stringArrayField(value: unknown): string[] {
  return Array.isArray(value) ? value.map((entry) => String(entry)).filter(Boolean) : [];
}

function normalizeSiteRole(value: unknown): IdentityCandidate['siteRole'] | undefined {
  return value === 'admin' || value === 'moderator' || value === 'editor' || value === 'viewer' || value === 'user'
    ? value
    : undefined;
}

function candidateName(doc: RawIdentityDoc): string {
  const explicit = stringField(doc, ['displayName', 'name', 'fullName', 'crewName']);
  if (explicit) return explicit;
  return `${stringField(doc, ['firstName'])} ${stringField(doc, ['lastName'])}`.trim();
}

function candidatePhone(doc: RawIdentityDoc): string {
  return candidatePhones(doc)[0] || '';
}

function candidatePhones(doc: RawIdentityDoc): string[] {
  const values = ['phone', 'phoneNumber', 'mobile', 'normalizedPhone']
    .map((key) => doc[key])
    .flatMap((value) => {
      if (Array.isArray(value)) return value;
      return value === undefined || value === null ? [] : [value];
    })
    .map((value) => String(value).trim())
    .filter(Boolean);

  return Array.from(new Set(values));
}

export function normalizePhoneForIdentity(value: unknown): string {
  const raw = typeof value === 'string' || typeof value === 'number' ? String(value) : '';
  let digits = raw.replace(/\D/g, '');
  if (!digits) return '';

  let changed = true;
  while (changed) {
    changed = false;
    if (digits.startsWith('972')) {
      digits = digits.slice(3);
      changed = true;
    }
    if (digits.startsWith('0')) {
      digits = digits.replace(/^0+/, '');
      changed = true;
    }
  }

  if (digits.length > 9) {
    digits = digits.slice(-9);
  }

  return digits.length === 9 && digits.startsWith('5') ? digits : '';
}

export function formatPhoneForIdentityDisplay(value: unknown): string {
  const identityPhone = normalizePhoneForIdentity(value);
  return identityPhone ? `0${identityPhone}` : '';
}

function phoneMatchesIdentity(value: unknown, identityPhone: string): boolean {
  return Boolean(identityPhone && normalizePhoneForIdentity(value) === identityPhone);
}

function docMatchesIdentityPhone(doc: RawIdentityDoc, identityPhone: string): boolean {
  return candidatePhones(doc).some((phone) => phoneMatchesIdentity(phone, identityPhone));
}

function toCandidate(source: IdentitySource, doc: RawIdentityDoc): IdentityCandidate | null {
  const id = String(doc.id || '');
  if (!id) return null;

  const displayName = candidateName(doc);
  const phone = candidatePhone(doc);
  if (!displayName || !phone) return null;

  const siteRole = normalizeSiteRole(doc.siteRole);
  return {
    id,
    source,
    displayName,
    phone,
    department: stringField(doc, ['department', 'workArea']),
    role: stringField(doc, ['role', 'specialty', 'profession']),
    profileId: stringField(doc, ['profileId'], id),
    isAdmin: booleanField(doc, ['isAdmin', 'admin']) || siteRole === 'admin',
    siteRole,
  };
}

export function getVerifiedNormalizedPhone(authUser: VerifiedAuthUser): string {
  return normalizePhoneForIdentity(authUser.phoneNumber || '');
}

export function getVerifiedDisplayPhone(authUser: VerifiedAuthUser): string {
  return formatPhoneForIdentityDisplay(authUser.phoneNumber || '');
}

async function listCollectionSafe(collectionName: IdentitySource | 'users'): Promise<RawIdentityDoc[]> {
  try {
    return await listDocuments<RawIdentityDoc>(collectionName);
  } catch {
    return [];
  }
}

export async function findIdentityCandidates(authUser: VerifiedAuthUser): Promise<IdentityCandidate[]> {
  const verifiedPhone = getVerifiedNormalizedPhone(authUser);
  if (!verifiedPhone) return [];

  const collections: IdentitySource[] = ['profiles', 'industry_people', 'contacts'];
  const docsBySource = await Promise.all(collections.map(async (source) => ({
    source,
    docs: await listCollectionSafe(source),
  })));

  const seen = new Set<string>();
  const candidates: IdentityCandidate[] = [];
  for (const { source, docs } of docsBySource) {
    for (const doc of docs) {
      if (!docMatchesIdentityPhone(doc, verifiedPhone)) continue;
      const candidate = toCandidate(source, doc);
      if (!candidate) continue;
      const key = `${candidate.source}:${candidate.id}`;
      if (seen.has(key)) continue;
      seen.add(key);
      candidates.push(candidate);
    }
  }

  return candidates.sort((a, b) => {
    const sourceRank: Record<IdentitySource, number> = { profiles: 0, industry_people: 1, contacts: 2 };
    return sourceRank[a.source] - sourceRank[b.source];
  });
}

export async function confirmIdentityLink(
  authUser: VerifiedAuthUser,
  source: IdentitySource,
  candidateId: string,
): Promise<{ profile: Record<string, unknown>; candidate: IdentityCandidate }> {
  const verifiedPhone = getVerifiedNormalizedPhone(authUser);
  if (!verifiedPhone) {
    throw new Error('Phone auth is required for identity linking');
  }

  const rawCandidate = await getDocument<RawIdentityDoc>(`${source}/${candidateId}`);
  if (!rawCandidate) {
    throw new Error('Identity candidate not found');
  }

  const candidate = toCandidate(source, rawCandidate);
  if (!candidate || !docMatchesIdentityPhone(rawCandidate, verifiedPhone)) {
    throw new Error('Identity candidate no longer matches verified phone');
  }

  const now = new Date().toISOString();
  const existingUser = await getDocument<RawIdentityDoc>(`users/${authUser.uid}`);
  const matchingUsers = (await listCollectionSafe('users'))
    .filter((doc) => String(doc.id || '') !== authUser.uid)
    .filter((doc) => docMatchesIdentityPhone(doc, verifiedPhone));
  const previousLinkedUids = stringArrayField(existingUser?.linkedUids);
  const candidateLinkedUids = stringArrayField(rawCandidate.linkedUids);
  const matchedUserLinkedUids = matchingUsers.flatMap((doc) => [
    String(doc.id || ''),
    ...stringArrayField(doc.linkedUids),
  ]);
  const linkedUids = Array.from(new Set([...previousLinkedUids, ...candidateLinkedUids, ...matchedUserLinkedUids, authUser.uid].filter(Boolean)));

  const strongestAdmin =
    existingUser?.siteRole === 'admin' ||
    existingUser?.isAdmin === true ||
    candidate.isAdmin ||
    candidate.siteRole === 'admin' ||
    matchingUsers.some((doc) => doc.siteRole === 'admin' || doc.isAdmin === true);

  const userPatch: Record<string, string | boolean | number | null | string[]> = {
    displayName: candidate.displayName,
    phone: candidate.phone,
    department: candidate.department,
    role: candidate.role,
    profileId: candidate.profileId,
    profileSource: source,
    linkedUids,
    isAdmin: strongestAdmin,
    siteRole: strongestAdmin ? 'admin' : (candidate.siteRole || String(existingUser?.siteRole || 'viewer')),
    onboardingComplete: true,
    is_consented: true,
    termsAccepted: true,
    linkedAt: now,
    updatedAt: now,
  };

  if (source === 'contacts') {
    userPatch.linkedContactId = candidate.id;
    userPatch.crewName = candidate.displayName;
  }

  await patchDocument(`users/${authUser.uid}`, userPatch);

  await Promise.all(
    matchingUsers
      .filter((doc) => doc.id)
      .map((doc) => patchDocument(`users/${doc.id}`, {
        linkedUids,
        lastLinkedUid: authUser.uid,
        lastLinkedAt: now,
        updatedAt: now,
      })),
  );

  const sourcePatch: Record<string, string | boolean | null | string[]> = {
    linkedUids,
    firebaseUid: authUser.uid,
    lastLinkedUid: authUser.uid,
    lastLinkedAt: now,
    updatedAt: now,
  };

  if (!rawCandidate.primaryUid) {
    sourcePatch.primaryUid = authUser.uid;
  }
  if (source === 'contacts') {
    sourcePatch.is_consented = true;
    sourcePatch.consentedAt = now;
    sourcePatch.consentedByUid = authUser.uid;
  }

  await patchDocument(`${source}/${candidate.id}`, sourcePatch);

  const profile = await getDocument<Record<string, unknown>>(`users/${authUser.uid}`);
  return { profile: profile || userPatch, candidate };
}

export type LinkedProductionIdentity = {
  profileId: string | null;
  linkedUids: string[];
  phones: string[];
  names: string[];
  linkedContactId: string | null;
};

export async function getLinkedProductionIdentity(authUser: VerifiedAuthUser): Promise<LinkedProductionIdentity> {
  const userDoc = await getDocument<RawIdentityDoc>(`users/${authUser.uid}`).catch(() => null);
  const linkedUids = Array.from(new Set([authUser.uid, ...stringArrayField(userDoc?.linkedUids)]));
  const profileId = stringField(userDoc || {}, ['profileId']) || null;
  const linkedContactIdRaw = userDoc?.linkedContactId;
  const linkedContactId =
    typeof linkedContactIdRaw === 'string' && linkedContactIdRaw.trim()
      ? linkedContactIdRaw.trim()
      : typeof linkedContactIdRaw === 'number'
        ? String(linkedContactIdRaw)
        : null;

  const phones = new Set<string>();
  const names = new Set<string>();

  const addPhone = (value: unknown) => {
    if (typeof value !== 'string') return;
    const normalized = normalizeDisplayPhone(value) || formatPhoneForIdentityDisplay(value);
    if (normalized) phones.add(normalized);
  };
  const addName = (value: unknown) => {
    if (typeof value !== 'string') return;
    const trimmed = value.trim();
    if (trimmed) names.add(trimmed);
  };

  addPhone(authUser.phoneNumber || '');
  addPhone(userDoc?.phone);
  addPhone(userDoc?.normalizedPhone);
  addName(userDoc?.displayName);
  addName(userDoc?.crewName);

  const sourceDocs = await Promise.all([
    profileId ? getDocument<RawIdentityDoc>(`profiles/${profileId}`).catch(() => null) : Promise.resolve(null),
    profileId ? getDocument<RawIdentityDoc>(`industry_people/${profileId}`).catch(() => null) : Promise.resolve(null),
    linkedContactId ? getDocument<RawIdentityDoc>(`contacts/${linkedContactId}`).catch(() => null) : Promise.resolve(null),
  ]);

  for (const doc of sourceDocs) {
    if (!doc) continue;
    addPhone(doc.phone);
    addPhone(doc.phoneNumber);
    addPhone(doc.mobile);
    addPhone(doc.normalizedPhone);
    addName(candidateName(doc));
  }

  return {
    profileId,
    linkedUids,
    phones: Array.from(phones),
    names: Array.from(names),
    linkedContactId,
  };
}
