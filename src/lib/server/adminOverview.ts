import type {
  AdminLoginMethod,
  AdminOverview,
  AdminRole,
  AdminUserSummary,
  AppConfigSnapshot,
  CountBucket,
} from '@/lib/adminTypes';
import { getRecentSystemEvents, getUsageSnapshot } from '@/lib/server/adminTelemetry';
import { getFirebaseAdminAuth } from '@/lib/server/firebaseAdmin';
import { getDocument, listDocuments, patchDocument } from '@/lib/server/firestoreAdminRest';
import { normalizeProfessionalFields } from '@/lib/professionalFields';

type RawUser = {
  id: string;
  displayName?: string;
  email?: string;
  role?: string;
  roles?: unknown;
  department?: string;
  departments?: unknown;
  siteRole?: string | null;
  isOnline?: boolean;
  lastSeen?: string | null;
  onboardingComplete?: boolean;
  photoURL?: string | null;
  city?: string | null;
  crewName?: string | null;
  is_consented?: boolean;
  termsAccepted?: boolean;
  linkedContactId?: number | string | null;
  phone?: string | null;
  profileId?: string | null;
  linkedUids?: unknown;
  fcmTokens?: unknown;
};

type RawContact = {
  id: string;
  department?: string | null;
  departments?: unknown;
  workArea?: string | null;
};

type RawAppConfig = {
  maintenanceMode?: boolean;
  boardAnnouncement?: string;
  ratingsAutomation?: {
    midrugEnabled?: boolean;
    telegramEnabled?: boolean;
    weeklyMode?: 'sunday' | 'always';
    cronSchedule?: string;
    cronTimezone?: string;
  };
  updatedAt?: string | null;
};

const PRESENCE_WINDOW_MS = 2 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;
const STALE_PRESENCE_MS = 30 * DAY_MS;

function nowMs(): number {
  return Date.now();
}

function toMs(value: unknown): number | null {
  if (!value) return null;
  if (typeof value === 'number') return value;
  if (typeof value === 'string') {
    const parsed = Date.parse(value);
    return Number.isNaN(parsed) ? null : parsed;
  }
  return null;
}

function normalizeSiteRole(value: string | null | undefined): AdminRole {
  if (value === 'admin' || value === 'moderator') return value;
  return 'user';
}

function isBrokenOrEmpty(value: unknown): boolean {
  if (typeof value !== 'string') return true;
  const trimmed = value.trim();
  if (!trimmed) return true;
  return /[\u05f3\uFFFD]/.test(trimmed);
}

function capitalizeName(name: string): string {
  return name.replace(/\b\w/g, (c) => c.toUpperCase());
}

function normalizeDisplayName(raw: RawUser): string {
  const displayName = String(raw.displayName || '').trim();
  if (!isBrokenOrEmpty(displayName)) return capitalizeName(displayName);
  const email = String(raw.email || '').trim();
  if (email) return email.split('@')[0] || email;
  return '\u05de\u05e9\u05ea\u05de\u05e9 \u05dc\u05dc\u05d0 \u05e9\u05dd';
}

function stringArrayField(value: unknown): string[] {
  return Array.isArray(value) ? value.map((entry) => String(entry)).filter(Boolean) : [];
}

function roleRank(role: AdminRole): number {
  return role === 'admin' ? 2 : role === 'moderator' ? 1 : 0;
}

function bestSiteRole(users: RawUser[]): AdminRole {
  return users
    .map((user) => normalizeSiteRole(user.siteRole))
    .sort((a, b) => roleRank(b) - roleRank(a))[0] || 'user';
}

function firstString(users: RawUser[], picker: (user: RawUser) => unknown): string {
  for (const user of users) {
    const value = picker(user);
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return '';
}

function firstValue<T>(users: RawUser[], picker: (user: RawUser) => T | null | undefined): T | null {
  for (const user of users) {
    const value = picker(user);
    if (value !== null && value !== undefined && String(value).trim()) return value;
  }
  return null;
}

function inferLoginMethods(users: RawUser[]): AdminLoginMethod[] {
  const methods = new Set<AdminLoginMethod>();
  for (const user of users) {
    if (typeof user.email === 'string' && user.email.trim()) {
      methods.add(user.photoURL ? 'google' : 'email');
    }
    if (typeof user.phone === 'string' && user.phone.trim()) {
      methods.add('phone');
    }
  }
  return Array.from(methods).sort((a, b) => {
    const rank: Record<AdminLoginMethod, number> = { google: 0, phone: 1, email: 2 };
    return rank[a] - rank[b];
  });
}

function canonicalUser(users: RawUser[]): RawUser {
  return [...users].sort((a, b) => {
    const roleDiff = roleRank(normalizeSiteRole(b.siteRole)) - roleRank(normalizeSiteRole(a.siteRole));
    if (roleDiff !== 0) return roleDiff;
    if (Boolean(a.profileId) !== Boolean(b.profileId)) return a.profileId ? -1 : 1;
    if (Boolean(a.linkedContactId) !== Boolean(b.linkedContactId)) return a.linkedContactId ? -1 : 1;
    const aSeen = toMs(a.lastSeen) || 0;
    const bSeen = toMs(b.lastSeen) || 0;
    return bSeen - aSeen;
  })[0] || users[0];
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
    for (const linkedUid of stringArrayField(user.linkedUids)) {
      union(user.id, linkedUid);
    }

    const profileId = typeof user.profileId === 'string' && user.profileId.trim() ? user.profileId.trim() : '';
    if (profileId) {
      const existing = profileGroups.get(profileId);
      if (existing) union(existing, user.id);
      profileGroups.set(profileId, user.id);
    }

    const linkedContactId = user.linkedContactId !== null && user.linkedContactId !== undefined
      ? String(user.linkedContactId).trim()
      : '';
    if (linkedContactId) {
      const existing = contactGroups.get(linkedContactId);
      if (existing) union(existing, user.id);
      contactGroups.set(linkedContactId, user.id);
    }
  }

  const groups = new Map<string, RawUser[]>();
  for (const id of ids) {
    const root = find(id);
    const user = byId.get(id);
    if (!user) continue;
    const list = groups.get(root) || [];
    list.push(user);
    groups.set(root, list);
  }

  return Array.from(groups.values());
}

function bucketize(values: Array<string | string[] | null | undefined>, fallback: string): CountBucket[] {
  const counts = new Map<string, number>();
  for (const rawValue of values) {
    const labels = Array.isArray(rawValue) ? rawValue : [rawValue];
    for (const rawLabel of labels) {
      const label = String(rawLabel || '').trim() || fallback;
      counts.set(label, (counts.get(label) || 0) + 1);
    }
  }

  return Array.from(counts.entries())
    .map(([label, count]) => ({ key: label, label, count }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label, 'he'));
}

function toAdminUserSummary(raw: RawUser): AdminUserSummary {
  const lastSeen = raw.lastSeen || null;
  const lastSeenMs = toMs(lastSeen);
  const onlineNow = Boolean(raw.isOnline) && lastSeenMs !== null && nowMs() - lastSeenMs <= PRESENCE_WINDOW_MS;
  const stalePresence = lastSeenMs === null || nowMs() - lastSeenMs > STALE_PRESENCE_MS;
  const professional = normalizeProfessionalFields(raw as Record<string, unknown>);

  return {
    uid: raw.id,
    linkedUids: [raw.id],
    uidCount: 1,
    profileId: raw.profileId || null,
    displayName: normalizeDisplayName(raw),
    email: String(raw.email || ''),
    role: professional.role,
    roles: professional.roles,
    department: professional.department,
    departments: professional.departments,
    siteRole: normalizeSiteRole(raw.siteRole),
    isOnline: Boolean(raw.isOnline),
    onlineNow,
    stalePresence,
    onboardingComplete: Boolean(raw.onboardingComplete),
    photoURL: raw.photoURL || null,
    city: raw.city || null,
    lastSeen,
    crewName: raw.crewName || null,
    is_consented: raw.is_consented === true,
    termsAccepted: raw.termsAccepted === true,
    linkedContactId: raw.linkedContactId ?? null,
    phone: typeof raw.phone === 'string' && raw.phone.trim() ? raw.phone.trim() : null,
    loginMethods: inferLoginMethods([raw]),
    hasPush: Array.isArray(raw.fcmTokens) && raw.fcmTokens.length > 0,
  };
}

function toUnifiedAdminUserSummary(group: RawUser[]): AdminUserSummary {
  const canonical = canonicalUser(group);
  const linkedUids = Array.from(new Set(group.flatMap((user) => [user.id, ...stringArrayField(user.linkedUids)]).filter(Boolean)));
  const lastSeen = group
    .map((user) => user.lastSeen || null)
    .filter(Boolean)
    .sort((a, b) => (toMs(b) || 0) - (toMs(a) || 0))[0] || null;
  const lastSeenMs = toMs(lastSeen);
  const onlineNow = group.some((user) => {
    const seen = toMs(user.lastSeen);
    return Boolean(user.isOnline) && seen !== null && nowMs() - seen <= PRESENCE_WINDOW_MS;
  });
  const stalePresence = lastSeenMs === null || nowMs() - lastSeenMs > STALE_PRESENCE_MS;
  const displayNameSource = group.find((user) => !isBrokenOrEmpty(user.displayName)) || canonical;
  const profileId = firstValue(group, (user) => user.profileId) || null;
  const professional = normalizeProfessionalFields({
    roles: group.flatMap((user) => normalizeProfessionalFields(user as Record<string, unknown>).roles),
    departments: group.flatMap((user) => normalizeProfessionalFields(user as Record<string, unknown>).departments),
  });

  return {
    uid: canonical.id,
    linkedUids,
    uidCount: linkedUids.length,
    profileId,
    displayName: normalizeDisplayName(displayNameSource),
    email: firstString(group, (user) => user.email),
    role: professional.role || firstString(group, (user) => user.role),
    roles: professional.roles,
    department: professional.department || firstString(group, (user) => user.department),
    departments: professional.departments,
    siteRole: bestSiteRole(group),
    isOnline: group.some((user) => user.isOnline === true),
    onlineNow,
    stalePresence,
    onboardingComplete: group.some((user) => user.onboardingComplete === true),
    photoURL: firstString(group, (user) => user.photoURL) || null,
    city: firstString(group, (user) => user.city) || null,
    lastSeen,
    crewName: firstString(group, (user) => user.crewName) || null,
    is_consented: group.some((user) => user.is_consented === true),
    termsAccepted: group.some((user) => user.termsAccepted === true),
    linkedContactId: firstValue(group, (user) => user.linkedContactId) || null,
    phone: firstString(group, (user) => user.phone) || null,
    loginMethods: inferLoginMethods(group),
    hasPush: group.some((user) => Array.isArray(user.fcmTokens) && (user.fcmTokens as unknown[]).length > 0),
  };
}

function sortUsers(users: AdminUserSummary[]): AdminUserSummary[] {
  return [...users].sort((a, b) => {
    if (a.onlineNow !== b.onlineNow) return a.onlineNow ? -1 : 1;
    if (a.stalePresence !== b.stalePresence) return a.stalePresence ? -1 : 1;
    const aSeen = toMs(a.lastSeen) || 0;
    const bSeen = toMs(b.lastSeen) || 0;
    return bSeen - aSeen;
  });
}

function dedupeRecentEvents<T extends { type: string; message: string; route?: string | null; job?: string | null }>(
  events: T[],
): T[] {
  const seen = new Set<string>();
  const deduped: T[] = [];

  for (const event of events) {
    const key = [event.type, event.message, event.route || '', event.job || ''].join('::');
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(event);
  }

  return deduped;
}

async function repairMissingUserIdentity(rawUsers: RawUser[]): Promise<RawUser[]> {
  const candidates = rawUsers.filter((user) =>
    user.id &&
    (isBrokenOrEmpty(user.displayName) || isBrokenOrEmpty(user.email) || !user.photoURL)
  );
  if (candidates.length === 0) return rawUsers;

  const auth = getFirebaseAdminAuth();
  const repaired = new Map<string, Partial<RawUser>>();

  await Promise.all(
    candidates.map(async (user) => {
      try {
        const authUser = await auth.getUser(user.id);
        const patch: Record<string, string | null> = {};

        if (isBrokenOrEmpty(user.displayName) && authUser.displayName) {
          patch.displayName = authUser.displayName;
        }
        if (isBrokenOrEmpty(user.email) && authUser.email) {
          patch.email = authUser.email;
        }
        if (!user.photoURL && authUser.photoURL) {
          patch.photoURL = authUser.photoURL;
        }

        if (Object.keys(patch).length === 0) return;

        repaired.set(user.id, patch);
        await patchDocument(`users/${user.id}`, {
          ...patch,
          updatedAt: new Date().toISOString(),
        });
      } catch {
        // Keep admin overview resilient: deleted Auth users should not break the dashboard.
      }
    }),
  );

  if (repaired.size === 0) return rawUsers;
  return rawUsers.map((user) => ({ ...user, ...(repaired.get(user.id) || {}) }));
}

export async function getAdminOverview(): Promise<AdminOverview> {
  const [usersRaw, contactsRaw, postsRaw, chatsRaw, appConfigRaw, recentEvents, usage] = await Promise.all([
    listDocuments<RawUser>('users'),
    listDocuments<RawContact>('contacts'),
    listDocuments('posts'),
    listDocuments('chats'),
    getDocument<RawAppConfig>('appConfig/global'),
    getRecentSystemEvents(10),
    getUsageSnapshot(),
  ]);

  const repairedUsersRaw = await repairMissingUserIdentity(usersRaw);
  const users = sortUsers(groupUsersByIdentity(repairedUsersRaw).map(toUnifiedAdminUserSummary));
  const now = nowMs();
  const stats = {
    totalUsers: users.length,
    onlineNow: users.filter((user) => user.onlineNow).length,
    active24h: users.filter((user) => {
      const seenAt = toMs(user.lastSeen);
      return seenAt !== null && now - seenAt <= DAY_MS;
    }).length,
    admins: users.filter((user) => user.siteRole === 'admin').length,
    moderators: users.filter((user) => user.siteRole === 'moderator').length,
    stalePresence: users.filter((user) => user.stalePresence).length,
    totalContacts: contactsRaw.length,
    totalPosts: postsRaw.length,
    totalChats: chatsRaw.length,
  };

  const appConfig: AppConfigSnapshot = {
    maintenanceMode: Boolean(appConfigRaw?.maintenanceMode),
    boardAnnouncement: String(appConfigRaw?.boardAnnouncement || ''),
    ratingsAutomation: {
      midrugEnabled: appConfigRaw?.ratingsAutomation?.midrugEnabled !== false,
      telegramEnabled: appConfigRaw?.ratingsAutomation?.telegramEnabled !== false,
      weeklyMode: appConfigRaw?.ratingsAutomation?.weeklyMode === 'always' ? 'always' : 'sunday',
      cronSchedule: appConfigRaw?.ratingsAutomation?.cronSchedule || '10 6 * * *',
      cronTimezone: appConfigRaw?.ratingsAutomation?.cronTimezone || 'UTC',
    },
    updatedAt: appConfigRaw?.updatedAt || null,
  };

  return {
    generatedAt: new Date().toISOString(),
    presenceWindowMs: PRESENCE_WINDOW_MS,
    stats,
    appConfig,
    contactsByDepartment: bucketize(
      contactsRaw.map((contact) => normalizeProfessionalFields(contact as Record<string, unknown>).departments),
      '\u05dc\u05d0 \u05de\u05e9\u05d5\u05d9\u05da',
    ),
    contactsByWorkArea: bucketize(contactsRaw.map((contact) => contact.workArea), '\u05dc\u05dc\u05d0 \u05e9\u05d9\u05d5\u05da'),
    users,
    onlineUsers: users.filter((user) => user.onlineNow),
    staleUsers: users.filter((user) => user.stalePresence),
    recentEvents: dedupeRecentEvents(recentEvents).slice(0, 8),
    usage,
  };
}
