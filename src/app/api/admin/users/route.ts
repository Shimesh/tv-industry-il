import { NextRequest, NextResponse } from 'next/server';
import { requirePrimaryAdminRequest, getPrimaryAdminUid, isPrimaryAdminUid } from '@/lib/server/primaryAdmin';
import { listDocuments, patchDocument } from '@/lib/server/firestoreAdminRest';
import { normalizeApprovalStatus, type UserApprovalStatus } from '@/lib/userApproval';

export const runtime = 'nodejs';

type RawUser = {
  id: string;
  displayName?: string;
  email?: string;
  department?: string;
  role?: string;
  phone?: string | null;
  photoURL?: string | null;
  siteRole?: string | null;
  approvalStatus?: string | null;
  lastSeen?: string | null;
  createdAt?: string | null;
};

export type AdminManagedUser = {
  uid: string;
  displayName: string;
  email: string;
  department: string;
  role: string;
  phone: string | null;
  photoURL: string | null;
  siteRole: string;
  approvalStatus: UserApprovalStatus;
  lastSeen: string | null;
  createdAt: string | null;
  isPrimaryAdmin: boolean;
};

function cleanString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function displayNameFor(user: RawUser): string {
  return cleanString(user.displayName) || cleanString(user.email).split('@')[0] || 'משתמש ללא שם';
}

function toManagedUser(user: RawUser, primaryAdminUid: string): AdminManagedUser {
  const isPrimaryAdmin = user.id === primaryAdminUid;
  return {
    uid: user.id,
    displayName: displayNameFor(user),
    email: cleanString(user.email),
    department: cleanString(user.department),
    role: cleanString(user.role),
    phone: cleanString(user.phone) || null,
    photoURL: cleanString(user.photoURL) || null,
    siteRole: cleanString(user.siteRole) || 'user',
    approvalStatus: isPrimaryAdmin
      ? 'active'
      : normalizeApprovalStatus(user.approvalStatus, 'active'),
    lastSeen: cleanString(user.lastSeen) || null,
    createdAt: cleanString(user.createdAt) || null,
    isPrimaryAdmin,
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
