import { NextRequest, NextResponse } from 'next/server';
import { requirePrimaryAdminRequest, getPrimaryAdminUid, isPrimaryAdminUid } from '@/lib/server/primaryAdmin';
import { listDocuments, patchDocument } from '@/lib/server/firestoreAdminRest';
import { normalizeProfessionalFields } from '@/lib/professionalFields';
import { normalizeApprovalStatus, type UserApprovalStatus } from '@/lib/userApproval';

export const runtime = 'nodejs';

type RawUser = {
  id: string;
  displayName?: string;
  email?: string;
  department?: string;
  departments?: unknown;
  role?: string;
  roles?: unknown;
  phone?: string | null;
  photoURL?: string | null;
  siteRole?: string | null;
  approvalStatus?: string | null;
  lastSeen?: string | null;
  createdAt?: string | null;
  isOnline?: boolean;
  isPrivate?: boolean;
  calendarEmploymentType?: string | null;
  calendarFullAccess?: boolean;
};

export type AdminManagedUser = {
  uid: string;
  displayName: string;
  email: string;
  department: string;
  departments: string[];
  role: string;
  roles: string[];
  phone: string | null;
  photoURL: string | null;
  siteRole: string;
  approvalStatus: UserApprovalStatus;
  lastSeen: string | null;
  createdAt: string | null;
  isPrimaryAdmin: boolean;
  hasDisplayName: boolean;
  isOnline: boolean;
  isPrivate: boolean;
  calendarEmploymentType: 'employee' | 'freelancer';
  calendarFullAccess: boolean;
};

function cleanString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function stringArrayField(value: unknown): string[] {
  return Array.isArray(value) ? value.map((entry) => String(entry).trim()).filter(Boolean) : [];
}

function toMs(value: unknown): number {
  if (typeof value === 'number') return value;
  if (typeof value === 'string') {
    const parsed = Date.parse(value);
    return Number.isNaN(parsed) ? 0 : parsed;
  }
  return 0;
}

function firstString(users: RawUser[], picker: (user: RawUser) => unknown): string {
  for (const user of users) {
    const value = picker(user);
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return '';
}

function firstBoolean(users: RawUser[], picker: (user: RawUser) => unknown): boolean {
  return users.some((user) => picker(user) === true);
}

function groupUsersByIdentity(rawUsers: RawUser[]): RawUser[][] {
  const ids = rawUsers.map((user) => user.id).filter(Boolean);
  const parent = new Map<string, string>();
  const byId = new Map(rawUsers.map((user) => [user.id, user]));
  const profileGroups = new Map<string, string>();
  const contactGroups = new Map<string, string>();

  for (const id of ids) parent.set(id, id);

  const find = (id: string): string => {
    const current = parent.get(id) || id;
    if (current === id) return id;
    const root = find(current);
    parent.set(id, root);
    return root;
  };

  const union = (a: string, b: string) => {
    if (!parent.has(a) || !parent.has(b)) return;
    const rootA = find(a);
    const rootB = find(b);
    if (rootA !== rootB) parent.set(rootB, rootA);
  };

  for (const user of rawUsers) {
    if (!user.id) continue;
    for (const linkedUid of stringArrayField((user as RawUser & { linkedUids?: unknown }).linkedUids)) {
      union(user.id, linkedUid);
    }

    const profileId = cleanString((user as RawUser & { profileId?: unknown }).profileId);
    if (profileId) {
      const existing = profileGroups.get(profileId);
      if (existing) union(existing, user.id);
      profileGroups.set(profileId, user.id);
    }

    const linkedContactId = (user as RawUser & { linkedContactId?: unknown }).linkedContactId;
    const contactKey = linkedContactId !== null && linkedContactId !== undefined ? String(linkedContactId).trim() : '';
    if (contactKey) {
      const existing = contactGroups.get(contactKey);
      if (existing) union(existing, user.id);
      contactGroups.set(contactKey, user.id);
    }
  }

  const groups = new Map<string, RawUser[]>();
  for (const id of ids) {
    const root = find(id);
    const user = byId.get(id);
    if (!user) continue;
    groups.set(root, [...(groups.get(root) || []), user]);
  }

  return Array.from(groups.values());
}

function canonicalUser(users: RawUser[]): RawUser {
  return [...users].sort((a, b) => {
    if (a.siteRole !== b.siteRole) {
      const rank = (role: unknown) => role === 'admin' ? 2 : role === 'moderator' ? 1 : 0;
      return rank(b.siteRole) - rank(a.siteRole);
    }
    const aSeen = toMs(a.lastSeen);
    const bSeen = toMs(b.lastSeen);
    return bSeen - aSeen;
  })[0] || users[0];
}

function mergeUserIdentityGroup(users: RawUser[]): RawUser {
  const canonical = canonicalUser(users);
  const professional = normalizeProfessionalFields({
    roles: users.flatMap((user) => normalizeProfessionalFields(user as Record<string, unknown>).roles),
    departments: users.flatMap((user) => normalizeProfessionalFields(user as Record<string, unknown>).departments),
  });
  const lastSeen = users
    .map((user) => cleanString(user.lastSeen))
    .filter(Boolean)
    .sort((a, b) => toMs(b) - toMs(a))[0] || null;
  const createdAt = users
    .map((user) => cleanString(user.createdAt))
    .filter(Boolean)
    .sort((a, b) => toMs(a) - toMs(b))[0] || null;
  const displayNameSource = users.find((user) => !isBrokenOrEmptyName(user.displayName)) || canonical;
  const hasActive = users.some((user) => normalizeApprovalStatus(user.approvalStatus, 'active') === 'active');
  const hasPending = users.some((user) => normalizeApprovalStatus(user.approvalStatus, 'active') === 'pending');
  const approvalStatus = hasActive ? 'active' : hasPending ? 'pending' : 'blocked';

  return {
    ...canonical,
    displayName: cleanString(displayNameSource.displayName) || firstString(users, (user) => user.email),
    email: firstString(users, (user) => user.email),
    phone: firstString(users, (user) => user.phone) || null,
    photoURL: firstString(users, (user) => user.photoURL) || null,
    role: professional.role || firstString(users, (user) => user.role),
    roles: professional.roles,
    department: professional.department || firstString(users, (user) => user.department),
    departments: professional.departments,
    siteRole: users.some((user) => user.siteRole === 'admin') ? 'admin' : users.some((user) => user.siteRole === 'moderator') ? 'moderator' : 'user',
    approvalStatus,
    lastSeen,
    createdAt,
    isOnline: firstBoolean(users, (user) => user.isOnline),
    isPrivate: users.every((user) => user.isPrivate === true),
    calendarEmploymentType: users.some((user) => user.calendarEmploymentType === 'employee') ? 'employee' : 'freelancer',
    calendarFullAccess: firstBoolean(users, (user) => user.calendarFullAccess),
  };
}

function isBrokenOrEmptyName(value: unknown): boolean {
  if (typeof value !== 'string') return true;
  const trimmed = value.trim();
  if (!trimmed) return true;
  return /[׳�]/.test(trimmed);
}

function displayInfoFor(user: RawUser): { label: string; hasDisplayName: boolean } {
  const displayName = cleanString(user.displayName);
  if (!isBrokenOrEmptyName(displayName)) {
    return { label: displayName, hasDisplayName: true };
  }

  const email = cleanString(user.email);
  if (email) {
    return { label: email, hasDisplayName: false };
  }

  return { label: displayNameFor(user), hasDisplayName: false };
}

function displayNameFor(user: RawUser): string {
  return cleanString(user.displayName) || cleanString(user.email).split('@')[0] || 'משתמש ללא שם';
}

function toManagedUser(user: RawUser, primaryAdminUid: string): AdminManagedUser {
  const isPrimaryAdmin = user.id === primaryAdminUid;
  const professional = normalizeProfessionalFields(user as Record<string, unknown>);
  const display = displayInfoFor(user);
  return {
    uid: user.id,
    displayName: display.label,
    email: cleanString(user.email),
    department: professional.department,
    departments: professional.departments,
    role: professional.role,
    roles: professional.roles,
    phone: cleanString(user.phone) || null,
    photoURL: cleanString(user.photoURL) || null,
    siteRole: cleanString(user.siteRole) || 'user',
    approvalStatus: isPrimaryAdmin
      ? 'active'
      : normalizeApprovalStatus(user.approvalStatus, 'active'),
    lastSeen: cleanString(user.lastSeen) || null,
    createdAt: cleanString(user.createdAt) || null,
    isPrimaryAdmin,
    hasDisplayName: display.hasDisplayName,
    isOnline: user.isOnline === true,
    isPrivate: user.isPrivate === true,
    calendarEmploymentType: user.calendarEmploymentType === 'employee' ? 'employee' : 'freelancer',
    calendarFullAccess: user.calendarFullAccess === true,
  };
}

export async function GET(request: NextRequest) {
  const authUser = await requirePrimaryAdminRequest(request);
  if (authUser instanceof NextResponse) return authUser;

  const primaryAdminUid = getPrimaryAdminUid();
  const users = await listDocuments<RawUser>('users');

  const primaryAdmin = users.find((user) => isPrimaryAdminUid(user.id));
  if (primaryAdmin && (primaryAdmin.approvalStatus !== 'active' || primaryAdmin.siteRole !== 'admin')) {
    await patchDocument(`users/${primaryAdmin.id}`, {
      approvalStatus: 'active',
      siteRole: 'admin',
      updatedAt: new Date().toISOString(),
    }).catch(() => undefined);
  }

  const managedUsers = groupUsersByIdentity(users)
    .map(mergeUserIdentityGroup)
    .map((user) => toManagedUser(user, primaryAdminUid))
    .sort((a, b) => {
      if (a.approvalStatus !== b.approvalStatus) {
        const rank: Record<UserApprovalStatus, number> = { pending: 0, active: 1, blocked: 2 };
        return rank[a.approvalStatus] - rank[b.approvalStatus];
      }
      return a.displayName.localeCompare(b.displayName, 'he');
    });

  return NextResponse.json({
    users: managedUsers,
    primaryAdminUid,
  });
}
