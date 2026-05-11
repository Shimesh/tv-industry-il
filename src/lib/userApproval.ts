export type UserApprovalStatus = 'pending' | 'active' | 'blocked';

export const USER_APPROVAL_STATUSES: UserApprovalStatus[] = ['pending', 'active', 'blocked'];

export function normalizeApprovalStatus(
  value: unknown,
  fallback: UserApprovalStatus = 'pending',
): UserApprovalStatus {
  return value === 'pending' || value === 'active' || value === 'blocked'
    ? value
    : fallback;
}
