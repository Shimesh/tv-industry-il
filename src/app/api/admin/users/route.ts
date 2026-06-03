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
};

function cleanString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
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

  const managedUsers = users
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
