import type {
  AdminOverview,
  AdminRole,
  AdminUserSummary,
  AppConfigSnapshot,
  CountBucket,
} from '@/lib/adminTypes';
import { getRecentSystemEvents, getUsageSnapshot } from '@/lib/server/adminTelemetry';
import { getFirebaseAdminAuth } from '@/lib/server/firebaseAdmin';
import { getDocument, listDocuments, patchDocument } from '@/lib/server/firestoreAdminRest';

type RawUser = {
  id: string;
  displayName?: string;
  email?: string;
  role?: string;
  department?: string;
  siteRole?: string | null;
  isOnline?: boolean;
  lastSeen?: string | null;
  onboardingComplete?: boolean;
  photoURL?: string | null;
  city?: string | null;
};

type RawContact = {
  id: string;
  department?: string | null;
  workArea?: string | null;
};

type RawAppConfig = {
  maintenanceMode?: boolean;
  boardAnnouncement?: string;
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

function normalizeDisplayName(raw: RawUser): string {
  const displayName = String(raw.displayName || '').trim();
  if (!isBrokenOrEmpty(displayName)) return displayName;
  const email = String(raw.email || '').trim();
  if (email) return email.split('@')[0] || email;
  return '\u05de\u05e9\u05ea\u05de\u05e9 \u05dc\u05dc\u05d0 \u05e9\u05dd';
}

function bucketize(values: Array<string | null | undefined>, fallback: string): CountBucket[] {
  const counts = new Map<string, number>();
  for (const rawValue of values) {
    const label = String(rawValue || '').trim() || fallback;
    counts.set(label, (counts.get(label) || 0) + 1);
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

  return {
    uid: raw.id,
    displayName: normalizeDisplayName(raw),
    email: String(raw.email || ''),
    role: String(raw.role || ''),
    department: String(raw.department || ''),
    siteRole: normalizeSiteRole(raw.siteRole),
    isOnline: Boolean(raw.isOnline),
    onlineNow,
    stalePresence,
    onboardingComplete: Boolean(raw.onboardingComplete),
    photoURL: raw.photoURL || null,
    city: raw.city || null,
    lastSeen,
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
  const users = sortUsers(repairedUsersRaw.map(toAdminUserSummary));
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
    updatedAt: appConfigRaw?.updatedAt || null,
  };

  return {
    generatedAt: new Date().toISOString(),
    presenceWindowMs: PRESENCE_WINDOW_MS,
    stats,
    appConfig,
    contactsByDepartment: bucketize(contactsRaw.map((contact) => contact.department), '\u05dc\u05d0 \u05de\u05e9\u05d5\u05d9\u05da'),
    contactsByWorkArea: bucketize(contactsRaw.map((contact) => contact.workArea), '\u05dc\u05dc\u05d0 \u05e9\u05d9\u05d5\u05da'),
    users,
    onlineUsers: users.filter((user) => user.onlineNow),
    staleUsers: users.filter((user) => user.stalePresence),
    recentEvents: dedupeRecentEvents(recentEvents).slice(0, 8),
    usage,
  };
}
