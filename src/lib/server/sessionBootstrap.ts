import type { VerifiedAuthUser } from '@/lib/apiAuth';
import { getDocument, listDocuments, patchDocument } from '@/lib/server/firestoreAdminRest';

type RawUserProfile = Record<string, unknown>;
type RawContact = Record<string, unknown>;

export type SessionProfile = {
  uid: string;
  displayName: string;
  email: string;
  photoURL: string | null;
  department: string;
  role: string;
  phone: string;
  linkedContactId?: number;
  skills: string[];
  bio: string;
  status: 'available' | 'busy' | 'offline';
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

function asOptionalString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

function asStringArray(value: unknown): string[] | undefined {
  return Array.isArray(value) ? value.map((entry) => String(entry)) : undefined;
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
    department: '',
    role: '',
    phone: '',
    skills: [],
    bio: '',
    status: 'available',
    isOnline: true,
    onboardingComplete: false,
    theme: 'dark',
  };
}

function normalizeSiteRole(value: unknown): 'admin' | 'moderator' | 'user' | undefined {
  if (value === 'admin' || value === 'moderator' || value === 'user') return value;
  return undefined;
}

function normalizeProfile(raw: RawUserProfile | null, authUser: VerifiedAuthUser): SessionProfile {
  const fallback = buildDefaultSessionProfile(authUser);
  if (!raw) return fallback;

  const linkedContactIdRaw = raw.linkedContactId;
  const linkedContactId =
    typeof linkedContactIdRaw === 'number'
      ? linkedContactIdRaw
      : typeof linkedContactIdRaw === 'string' && linkedContactIdRaw.trim()
        ? Number(linkedContactIdRaw)
        : undefined;

  return {
    ...fallback,
    ...raw,
    uid: authUser.uid,
    displayName: asString(raw.displayName, authUser.displayName || fallback.displayName),
    email: asString(raw.email, authUser.email || fallback.email),
    photoURL: typeof raw.photoURL === 'string' ? raw.photoURL : authUser.photoURL || null,
    department: asString(raw.department),
    role: asString(raw.role),
    phone: asString(raw.phone),
    skills: asStringArray(raw.skills) || [],
    bio: asString(raw.bio),
    status: raw.status === 'busy' || raw.status === 'offline' ? raw.status : 'available',
    isOnline: raw.isOnline === true,
    onboardingComplete: raw.onboardingComplete === true,
    theme: asString(raw.theme, 'dark'),
    siteRole: normalizeSiteRole(raw.siteRole),
    linkedContactId: Number.isFinite(linkedContactId) ? linkedContactId : undefined,
    openToWork: raw.openToWork === true,
    city: asOptionalString(raw.city),
    yearsOfExperience: typeof raw.yearsOfExperience === 'number' ? raw.yearsOfExperience : undefined,
    credits: asStringArray(raw.credits),
    gear: asStringArray(raw.gear),
    preferredRoles: asStringArray(raw.preferredRoles),
    preferredRegions: asStringArray(raw.preferredRegions),
    notificationsEnabled: typeof raw.notificationsEnabled === 'boolean' ? raw.notificationsEnabled : undefined,
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
  let profile = normalizeProfile(existing, authUser);
  let repaired = false;

  const patch: Record<string, string | boolean | number | null | string[]> = {
    isOnline: true,
    lastSeen: new Date().toISOString(),
  };

  if (!existing) {
    Object.assign(patch, buildDefaultSessionProfile(authUser), {
      createdAt: new Date().toISOString(),
    });
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

  if (!profile.email && authUser.email) {
    patch.email = authUser.email;
    profile = { ...profile, email: authUser.email };
    repaired = true;
  }

  if (!profile.displayName && authUser.displayName) {
    patch.displayName = authUser.displayName;
    profile = { ...profile, displayName: authUser.displayName };
    repaired = true;
  }

  if (Object.keys(patch).length > 0) {
    await patchDocument(`users/${authUser.uid}`, patch);
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
