import type { VerifiedAuthUser } from '@/lib/apiAuth';
import { getDocument, listDocuments, patchDocument } from '@/lib/server/firestoreAdminRest';
import { isPrimaryAdminUid } from '@/lib/server/primaryAdmin';
import { normalizeProfessionalFields } from '@/lib/professionalFields';
import { normalizeApprovalStatus, type UserApprovalStatus } from '@/lib/userApproval';
import { notifyAdminsOfPendingUser } from '@/lib/server/notifications';

type RawUserProfile = Record<string, unknown>;
type RawContact = Record<string, unknown>;

export type OnboardingProfileInput = {
  displayName?: string;
  department?: string;
  role?: string;
  phone?: string;
};

export type SessionProfile = {
  uid: string;
  displayName: string;
  email: string;
  photoURL: string | null;
  customPhotoURL?: string | null;
  department: string;
  departments: string[];
  role: string;
  roles: string[];
  phone: string;
  profileId?: string;
  profileSource?: string;
  linkedUids?: string[];
  isAdmin?: boolean;
  linkedContactId?: number | string;
  is_consented?: boolean;
  skills: string[];
  bio: string;
  status: 'available' | 'busy' | 'offline';
  approvalStatus: UserApprovalStatus;
  isOnline: boolean;
  onboardingComplete: boolean;
  theme: string;
  siteRole?: 'admin' | 'moderator' | 'user';
  openToWork?: boolean;
  city?: string;
  yearsOfExperience?: number;
  credits?: string[];
  gear?: string[];
  preferredRoles?: string[];
  preferredRegions?: string[];
  notificationsEnabled?: boolean;
  soundEnabled?: boolean;
  showPhone?: boolean;
  encryptionPublicKey?: string;
  crewName?: string;
};

export type SessionBootstrapPayload = {
  profile: SessionProfile;
  contactsTotal: number | null;
  contactsUpdatedAt: string | null;
  profileSource: 'server';
  contactsSource: 'server' | 'unavailable';
  repaired: boolean;
  generatedAt: string;
};

function asString(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback;
}

function cleanString(value: unknown): string {
  return typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : '';
}

function normalizeEmail(value: unknown): string {
  return typeof value === 'string' ? value.trim().toLowerCase() : '';
}

function emailPrefix(email: string): string {
  return email.split('@')[0]?.trim() || '';
}

function asOptionalString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

function isBrokenOrEmptyName(value: unknown): boolean {
  if (typeof value !== 'string') return true;
  const trimmed = value.trim();
  if (!trimmed) return true;
  return /[׳�]/.test(trimmed);
}

function asStringArray(value: unknown): string[] | undefined {
  return Array.isArray(value) ? value.map((entry) => String(entry)) : undefined;
}

function contactDisplayName(contact: RawContact | null): string {
  if (!contact) return '';
  const explicit = cleanString(contact.displayName || contact.name || contact.fullName || contact.crewName);
  if (explicit) return explicit;
  return `${cleanString(contact.firstName)} ${cleanString(contact.lastName)}`.trim();
}

async function findContactByEmail(email: string): Promise<RawContact | null> {
  const normalizedEmail = normalizeEmail(email);
  if (!normalizedEmail) return null;

  const contacts = await listDocuments<RawContact>('contacts').catch(() => []);
  return contacts.find((contact) => {
    const candidates = [
      contact.email,
      contact.normalizedEmail,
      contact.emailAddress,
      contact.mail,
    ].map(normalizeEmail);
    return candidates.includes(normalizedEmail);
  }) || null;
}

function firstNonEmpty(...values: unknown[]): string {
  for (const value of values) {
    const cleaned = cleanString(value);
    if (cleaned) return cleaned;
  }
  return '';
}

function missingProfessionalFields(raw: RawUserProfile | null): boolean {
  const professional = normalizeProfessionalFields(raw || {});
  return !professional.department && professional.departments.length === 0 && !professional.role && professional.roles.length === 0;
}

export async function finalizeUserOnboardingProfile(
  authUser: VerifiedAuthUser,
  input: OnboardingProfileInput = {},
): Promise<{ profile: SessionProfile; created: boolean; linkedContactId: string | number | null }> {
  const existing = await getDocument<RawUserProfile>(`users/${authUser.uid}`);
  const created = !existing;
  const now = new Date().toISOString();
  const email = normalizeEmail(authUser.email);
  const matchedContact = email ? await findContactByEmail(email) : null;
  const contactName = contactDisplayName(matchedContact);
  const requestedDisplayName = firstNonEmpty(input.displayName, authUser.displayName);
  const displayName = firstNonEmpty(
    requestedDisplayName,
    contactName,
    emailPrefix(email),
    'משתמש חדש',
  );
  const requestedProfessional = normalizeProfessionalFields({
    department: input.department,
    role: input.role,
  });
  const contactProfessional = normalizeProfessionalFields(matchedContact || {});
  const professional = requestedProfessional.department || requestedProfessional.role
    ? requestedProfessional
    : contactProfessional;
  const linkedContactId = matchedContact?.id
    ? String(matchedContact.id)
    : typeof existing?.linkedContactId === 'string' && existing.linkedContactId.trim()
      ? existing.linkedContactId.trim()
      : typeof existing?.linkedContactId === 'number'
        ? existing.linkedContactId
        : null;

  const patch: Record<string, string | boolean | number | null | string[]> = {
    updatedAt: now,
    lastSeen: now,
    isOnline: true,
  };

  if (created) {
    Object.assign(patch, {
      uid: authUser.uid,
      displayName,
      email,
      photoURL: authUser.photoURL || null,
      customPhotoURL: null,
      department: professional.department,
      departments: professional.departments,
      role: professional.role,
      roles: professional.roles,
      phone: authUser.phoneNumber || input.phone || '',
      is_consented: false,
      skills: [],
      bio: '',
      status: 'available',
      approvalStatus: isPrimaryAdminUid(authUser.uid) ? 'active' : 'pending',
      isOnline: true,
      onboardingComplete: false,
      theme: 'dark',
      notificationsEnabled: true,
      createdAt: now,
    });
  } else {
    if (!cleanString(existing.email) && email) patch.email = email;
    if (isBrokenOrEmptyName(existing.displayName)) patch.displayName = displayName;
    if (!cleanString(existing.photoURL) && authUser.photoURL) patch.photoURL = authUser.photoURL;
    if (!cleanString(existing.phone) && authUser.phoneNumber) patch.phone = authUser.phoneNumber;
    if (!existing.approvalStatus) patch.approvalStatus = isPrimaryAdminUid(authUser.uid) ? 'active' : 'pending';
    if (typeof existing.is_consented !== 'boolean') patch.is_consented = false;
    if (existing.notificationsEnabled !== true) patch.notificationsEnabled = true;
    if (!existing.createdAt) patch.createdAt = now;
    if (missingProfessionalFields(existing) && (professional.department || professional.role)) {
      patch.department = professional.department;
      patch.departments = professional.departments;
      patch.role = professional.role;
      patch.roles = professional.roles;
    }
  }

  if (linkedContactId !== null && !existing?.linkedContactId) {
    patch.linkedContactId = linkedContactId;
    if (created && contactName && !requestedDisplayName) {
      patch.displayName = contactName;
    }
    if (missingProfessionalFields(created ? patch : existing) && (contactProfessional.department || contactProfessional.role)) {
      patch.department = contactProfessional.department;
      patch.departments = contactProfessional.departments;
      patch.role = contactProfessional.role;
      patch.roles = contactProfessional.roles;
    }
  }

  await patchDocument(`users/${authUser.uid}`, patch);

  if (created && patch.approvalStatus === 'pending') {
    await notifyAdminsOfPendingUser({
      uid: authUser.uid,
      displayLabel: firstNonEmpty(contactName, patch.displayName, email, authUser.uid),
    });
  }

  const fresh = await getDocument<RawUserProfile>(`users/${authUser.uid}`);
  return {
    profile: normalizeProfile(fresh || { ...existing, ...patch }, authUser),
    created,
    linkedContactId,
  };
}

function parseAllowlist(): string[] {
  return (process.env.ADMIN_BOOTSTRAP_EMAIL_ALLOWLIST || '')
    .split(',')
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean);
}

export function buildDefaultSessionProfile(authUser: VerifiedAuthUser): SessionProfile {
  return {
    uid: authUser.uid,
    displayName: authUser.displayName || 'משתמש חדש',
    email: authUser.email || '',
    photoURL: authUser.photoURL || null,
    customPhotoURL: null,
    department: '',
    departments: [],
    role: '',
    roles: [],
    phone: authUser.phoneNumber || '',
    is_consented: false,
    skills: [],
    bio: '',
    status: 'available',
    approvalStatus: isPrimaryAdminUid(authUser.uid) ? 'active' : 'pending',
    isOnline: true,
    onboardingComplete: false,
    theme: 'dark',
    notificationsEnabled: true,
  };
}

function normalizeSiteRole(value: unknown): 'admin' | 'moderator' | 'user' | undefined {
  if (value === 'admin' || value === 'moderator' || value === 'user') return value;
  return undefined;
}

function normalizeProfile(raw: RawUserProfile | null, authUser: VerifiedAuthUser): SessionProfile {
  const fallback = buildDefaultSessionProfile(authUser);
  if (!raw) return fallback;
  const professional = normalizeProfessionalFields(raw);

  const linkedContactIdRaw = raw.linkedContactId;
  const linkedContactId =
    typeof linkedContactIdRaw === 'number'
      ? linkedContactIdRaw
      : typeof linkedContactIdRaw === 'string' && linkedContactIdRaw.trim()
        ? linkedContactIdRaw.trim()
        : undefined;

  return {
    ...fallback,
    ...raw,
    uid: authUser.uid,
    displayName: isBrokenOrEmptyName(raw.displayName)
      ? authUser.displayName || fallback.displayName
      : asString(raw.displayName, fallback.displayName),
    email: asString(raw.email, authUser.email || fallback.email),
    customPhotoURL: typeof raw.customPhotoURL === 'string' ? raw.customPhotoURL : null,
    photoURL: typeof raw.customPhotoURL === 'string'
      ? raw.customPhotoURL
      : typeof raw.photoURL === 'string'
        ? raw.photoURL
        : authUser.photoURL || null,
    department: professional.department,
    departments: professional.departments,
    role: professional.role,
    roles: professional.roles,
    phone: asString(raw.phone),
    profileId: asOptionalString(raw.profileId),
    profileSource: asOptionalString(raw.profileSource),
    linkedUids: asStringArray(raw.linkedUids),
    isAdmin: raw.isAdmin === true,
    is_consented: raw.is_consented === true,
    skills: asStringArray(raw.skills) || [],
    bio: asString(raw.bio),
    status: raw.status === 'busy' || raw.status === 'offline' ? raw.status : 'available',
    approvalStatus: normalizeApprovalStatus(raw.approvalStatus, 'active'),
    isOnline: raw.isOnline === true,
    onboardingComplete: raw.onboardingComplete === true,
    theme: asString(raw.theme, 'dark'),
    siteRole: normalizeSiteRole(raw.siteRole),
    linkedContactId,
    openToWork: raw.openToWork === true,
    city: asOptionalString(raw.city),
    yearsOfExperience: typeof raw.yearsOfExperience === 'number' ? raw.yearsOfExperience : undefined,
    credits: asStringArray(raw.credits),
    gear: asStringArray(raw.gear),
    preferredRoles: asStringArray(raw.preferredRoles),
    preferredRegions: asStringArray(raw.preferredRegions),
    notificationsEnabled: true,
    soundEnabled: typeof raw.soundEnabled === 'boolean' ? raw.soundEnabled : undefined,
    showPhone: typeof raw.showPhone === 'boolean' ? raw.showPhone : undefined,
    encryptionPublicKey: asOptionalString(raw.encryptionPublicKey),
    crewName: asOptionalString(raw.crewName),
  };
}

export async function loadAndRepairSessionProfile(authUser: VerifiedAuthUser): Promise<{
  profile: SessionProfile;
  repaired: boolean;
}> {
  const existing = await getDocument<RawUserProfile>(`users/${authUser.uid}`);
  if (!existing) {
    const { profile } = await finalizeUserOnboardingProfile(authUser);
    return { profile, repaired: true };
  }
  let profile = normalizeProfile(existing, authUser);
  let repaired = false;

  const patch: Record<string, string | boolean | number | null | string[]> = {
    isOnline: true,
    lastSeen: new Date().toISOString(),
  };

  if (!existing.approvalStatus) {
    patch.approvalStatus = 'active';
    profile = { ...profile, approvalStatus: 'active' };
    repaired = true;
  } else if (typeof existing.is_consented !== 'boolean') {
    patch.is_consented = false;
    profile = { ...profile, is_consented: false };
    repaired = true;
  }

  if (existing.notificationsEnabled !== true) {
    patch.notificationsEnabled = true;
    profile = { ...profile, notificationsEnabled: true };
    repaired = true;
  }

  const allowlisted = Boolean(
    authUser.email && parseAllowlist().includes(authUser.email.toLowerCase()),
  );

  if (allowlisted && profile.siteRole !== 'admin') {
    patch.siteRole = 'admin';
    profile = { ...profile, siteRole: 'admin' };
    repaired = true;
  }

  if (isPrimaryAdminUid(authUser.uid)) {
    if (profile.approvalStatus !== 'active') {
      patch.approvalStatus = 'active';
      profile = { ...profile, approvalStatus: 'active' };
      repaired = true;
    }
    if (profile.siteRole !== 'admin') {
      patch.siteRole = 'admin';
      profile = { ...profile, siteRole: 'admin' };
      repaired = true;
    }
  }

  if (!profile.email && authUser.email) {
    patch.email = authUser.email;
    profile = { ...profile, email: authUser.email };
    repaired = true;
  }

  if (!profile.phone && authUser.phoneNumber) {
    patch.phone = authUser.phoneNumber;
    profile = { ...profile, phone: authUser.phoneNumber };
    repaired = true;
  }

  if (!profile.photoURL) {
    const linkedUids = asStringArray(existing?.linkedUids) || [];
    const linkedProfiles = await Promise.all(
      linkedUids
        .filter((uid) => uid && uid !== authUser.uid)
        .map((uid) => getDocument<RawUserProfile>(`users/${uid}`).catch(() => null)),
    );
    const linkedPhotoURL = linkedProfiles
      .map((linkedProfile) => asString(linkedProfile?.photoURL))
      .find(Boolean);

    if (linkedPhotoURL) {
      patch.photoURL = linkedPhotoURL;
      profile = { ...profile, photoURL: linkedPhotoURL };
      repaired = true;
    }
  }

  if (isBrokenOrEmptyName(existing?.displayName) && authUser.displayName) {
    patch.displayName = authUser.displayName;
    profile = { ...profile, displayName: authUser.displayName };
    repaired = true;
  }

  if (Object.keys(patch).length > 0) {
    try {
      await patchDocument(`users/${authUser.uid}`, patch);
    } catch (patchError) {
      console.error('[sessionBootstrap] Firestore patch failed, returning computed profile:', patchError);
    }
  }

  return { profile, repaired };
}

export async function loadContactsSnapshot(): Promise<{
  contacts: RawContact[];
  total: number;
  updatedAt: string | null;
}> {
  const contacts = await listDocuments<RawContact>('contacts');
  let updatedAt: string | null = null;

  for (const contact of contacts) {
    const candidate =
      (typeof contact.updatedAt === 'string' && contact.updatedAt) ||
      (typeof contact.createdAt === 'string' && contact.createdAt) ||
      null;
    if (candidate && (!updatedAt || candidate > updatedAt)) {
      updatedAt = candidate;
    }
  }

  return {
    contacts,
    total: contacts.length,
    updatedAt,
  };
}
