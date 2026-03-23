/**
 * Role-based permission system for the TV Industry IL platform.
 *
 * Roles:
 *   admin      – full control (manage users, delete any content, change roles)
 *   moderator  – can delete/hide content, manage board posts
 *   editor     – can edit shared schedules, manage productions
 *   viewer     – default role, can view and interact (like, comment, post own content)
 */

export type UserRole = 'admin' | 'moderator' | 'editor' | 'viewer';

export const ROLE_HIERARCHY: Record<UserRole, number> = {
  admin: 100,
  moderator: 50,
  editor: 30,
  viewer: 10,
};

/** Returns true when `role` is at least as powerful as `required`. */
export function hasRole(role: UserRole | undefined, required: UserRole): boolean {
  return (ROLE_HIERARCHY[role || 'viewer'] ?? 0) >= ROLE_HIERARCHY[required];
}

// ── Granular permissions ────────────────────────────────────────────

export type Permission =
  // Users
  | 'users:view'
  | 'users:edit_own'
  | 'users:edit_any'
  | 'users:manage_roles'
  | 'users:delete'
  // Board
  | 'board:view'
  | 'board:post'
  | 'board:edit_own'
  | 'board:delete_own'
  | 'board:delete_any'
  // Chat
  | 'chat:view'
  | 'chat:send'
  | 'chat:delete_own'
  | 'chat:delete_any'
  // Productions
  | 'productions:view'
  | 'productions:edit_own'
  | 'productions:edit_any'
  // Admin
  | 'admin:panel'
  | 'admin:analytics';

const ROLE_PERMISSIONS: Record<UserRole, Permission[]> = {
  viewer: [
    'users:view',
    'users:edit_own',
    'board:view',
    'board:post',
    'board:edit_own',
    'board:delete_own',
    'chat:view',
    'chat:send',
    'chat:delete_own',
    'productions:view',
    'productions:edit_own',
  ],
  editor: [
    'users:view',
    'users:edit_own',
    'board:view',
    'board:post',
    'board:edit_own',
    'board:delete_own',
    'chat:view',
    'chat:send',
    'chat:delete_own',
    'productions:view',
    'productions:edit_own',
    'productions:edit_any',
  ],
  moderator: [
    'users:view',
    'users:edit_own',
    'users:edit_any',
    'board:view',
    'board:post',
    'board:edit_own',
    'board:delete_own',
    'board:delete_any',
    'chat:view',
    'chat:send',
    'chat:delete_own',
    'chat:delete_any',
    'productions:view',
    'productions:edit_own',
    'productions:edit_any',
    'admin:panel',
  ],
  admin: [
    'users:view',
    'users:edit_own',
    'users:edit_any',
    'users:manage_roles',
    'users:delete',
    'board:view',
    'board:post',
    'board:edit_own',
    'board:delete_own',
    'board:delete_any',
    'chat:view',
    'chat:send',
    'chat:delete_own',
    'chat:delete_any',
    'productions:view',
    'productions:edit_own',
    'productions:edit_any',
    'admin:panel',
    'admin:analytics',
  ],
};

/** Check whether a role has a specific permission. */
export function can(role: UserRole | undefined, permission: Permission): boolean {
  const perms = ROLE_PERMISSIONS[role || 'viewer'] ?? ROLE_PERMISSIONS.viewer;
  return perms.includes(permission);
}

/** Hebrew display labels for roles. */
export const ROLE_LABELS: Record<UserRole, string> = {
  admin: 'מנהל מערכת',
  moderator: 'מנהל תוכן',
  editor: 'עורך',
  viewer: 'צופה',
};
