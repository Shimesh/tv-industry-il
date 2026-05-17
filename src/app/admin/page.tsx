'use client';

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import Link from 'next/link';
import {
  Activity,
  AlertTriangle,
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  BarChart3,
  CheckCircle,
  ChevronDown,
  Clapperboard,
  Contact2,
  Crown,
  Database,
  FileText,
  Mail,
  Megaphone,
  MessageCircle,
  MousePointerClick,
  RefreshCw,
  Search,
  Settings,
  Shield,
  ShieldCheck,
  Smartphone,
  X,
  UserIcon,
  Users,
  Wifi,
  WifiOff,
  Wrench,
} from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import type { AdminLoginMethod, AdminOverview, AdminRole, AdminUserSummary, ContactDiscovery, PageViewEvent, SystemEventRecord } from '@/lib/adminTypes';
import { INDUSTRY_DEPARTMENT_OPTIONS, INDUSTRY_ROLE_OPTIONS } from '@/constants/departments';
import { normalizeProfessionalFields, stringArray } from '@/lib/professionalFields';

type ToastState = {
  type: 'ok' | 'err';
  msg: string;
} | null;

type UserSortKey = 'displayName' | 'email' | 'role' | 'status' | 'lastSeen' | 'siteRole';
type SortDirection = 'asc' | 'desc';
type NotificationTarget = 'test' | 'user' | 'all' | 'incomplete_profile';
type PageViewPanelState = {
  page: { key: string; label: string } | null;
  events: PageViewEvent[];
  loading: boolean;
  error: string | null;
};

const NOTIFICATION_LINK_OPTIONS = [
  { label: 'מונדיאל 2026', value: '/world-cup' },
  { label: 'שידור חי', value: '/schedule#live' },
  { label: 'לוח שידורים', value: '/schedule' },
  { label: 'יומן הפקות', value: '/productions' },
  { label: 'חדשות', value: '/news' },
  { label: 'אירועים קרובים', value: '/news?tab=events' },
  { label: 'אלפון', value: '/directory' },
  { label: 'לוח מודעות', value: '/board' },
  { label: 'צ׳אט', value: '/chat' },
  { label: 'הגדרות', value: '/settings' },
  { label: 'ללא קישור', value: '' },
];

const APP_VERSION = '2.1.3';

const EMPTY_OVERVIEW: AdminOverview = {
  generatedAt: '',
  presenceWindowMs: 120000,
  stats: {
    totalUsers: 0,
    onlineNow: 0,
    active24h: 0,
    admins: 0,
    moderators: 0,
    stalePresence: 0,
    totalContacts: 0,
    totalPosts: 0,
    totalChats: 0,
  },
  appConfig: {
    maintenanceMode: false,
    boardAnnouncement: '',
    updatedAt: null,
  },
  contactsByDepartment: [],
  contactsByWorkArea: [],
  users: [],
  onlineUsers: [],
  staleUsers: [],
  recentEvents: [],
  usage: {
    topPages: [],
    routeHealth: [],
    jobs: [],
  },
};

const ROLE_OPTIONS: Array<{ value: AdminRole; label: string; icon: typeof Crown; classes: string }> = [
  { value: 'admin', label: 'מנהל', icon: Crown, classes: 'text-yellow-400 border-yellow-400/30 bg-yellow-400/10' },
  { value: 'moderator', label: 'עורך', icon: Shield, classes: 'text-blue-400 border-blue-400/30 bg-blue-400/10' },
  { value: 'user', label: 'צופה', icon: UserIcon, classes: 'text-gray-300 border-gray-600/40 bg-gray-600/10' },
];

function formatRelativeTime(value: string | null | undefined): string {
  if (!value) return '—';
  const parsed = Date.parse(value);
  if (Number.isNaN(parsed)) return '—';
  const diff = Date.now() - parsed;
  if (diff < 60_000) return 'עכשיו';
  if (diff < 3_600_000) return `לפני ${Math.floor(diff / 60_000)} דק׳`;
  if (diff < 86_400_000) return `לפני ${Math.floor(diff / 3_600_000)} ש׳`;
  return new Date(parsed).toLocaleString('he-IL');
}

function formatPageViewActor(event: PageViewEvent): string {
  if (event.displayName) return event.displayName;
  if (event.email) return event.email;
  if (event.uid) return event.uid;
  return event.visitorId ? `אורח ${event.visitorId.slice(0, 8)}` : 'אורח לא מזוהה';
}

function formatPageViewLocation(event: PageViewEvent): string {
  return [event.city, event.region, event.country].filter(Boolean).join(', ') || 'לא זמין';
}

function formatPageViewDevice(event: PageViewEvent): string {
  return [event.deviceType, event.browser, event.os].filter(Boolean).join(' · ') || 'לא זמין';
}

function selectedOptionValues(options: HTMLCollectionOf<HTMLOptionElement>): string[] {
  return Array.from(options).filter((option) => option.selected).map((option) => option.value).filter(Boolean);
}

function safeProfileFields(entry: unknown) {
  return normalizeProfessionalFields((entry || {}) as Record<string, unknown>);
}

function safeProfileRoles(entry: unknown): string[] {
  return safeProfileFields(entry).roles;
}

function safeProfileDepartments(entry: unknown): string[] {
  return safeProfileFields(entry).departments;
}

function roleOptionsForEditor(roles: unknown): string[] {
  return Array.from(new Set([...INDUSTRY_ROLE_OPTIONS, ...safeProfileRoles({ roles })].filter(Boolean)));
}

function rolePresentation(role: AdminRole) {
  return ROLE_OPTIONS.find((option) => option.value === role) || ROLE_OPTIONS[2];
}

function roleLabel(role: AdminRole): string {
  if (role === 'admin') return 'מנהל';
  if (role === 'moderator') return 'עורך';
  return 'צופה';
}

function lastSeenMs(user: AdminUserSummary): number {
  const parsed = user.lastSeen ? Date.parse(user.lastSeen) : 0;
  return Number.isNaN(parsed) ? 0 : parsed;
}

function statusRank(user: AdminUserSummary): number {
  if (user.onlineNow) return 2;
  if (user.stalePresence) return 0;
  return 1;
}

function PresenceBadge({ user }: { user: AdminUserSummary }) {
  return <PresenceBadges user={user} />;

  if (user.onlineNow) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full border border-green-500/30 bg-green-500/10 px-2 py-0.5 text-xs text-green-300">
        <Wifi className="h-3 w-3" />
        מחובר
      </span>
    );
  }

  if (user.stalePresence) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full border border-orange-500/30 bg-orange-500/10 px-2 py-0.5 text-xs text-orange-300">
        <AlertTriangle className="h-3 w-3" />
        נוכחות ישנה
      </span>
    );
  }

  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-gray-700 bg-gray-800 px-2 py-0.5 text-xs text-gray-400">
      <WifiOff className="h-3 w-3" />
      לא מחובר
    </span>
  );
}

function RoleBadge({ role }: { role: AdminRole }) {
  const current = rolePresentation(role);
  const Icon = current.icon;
  return (
    <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs ${current.classes}`}>
      <Icon className="h-3 w-3" />
      {roleLabel(role)}
    </span>
  );
}

function LoginMethods({ methods, uidCount }: { methods: AdminLoginMethod[]; uidCount: number }) {
  const items: Record<AdminLoginMethod, { label: string; icon: ReactNode; classes: string }> = {
    google: {
      label: 'Google',
      icon: <span className="text-[11px] font-black leading-none">G</span>,
      classes: 'border-blue-500/30 bg-blue-500/10 text-blue-300',
    },
    phone: {
      label: 'Phone / SMS',
      icon: <Smartphone className="h-3.5 w-3.5" />,
      classes: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300',
    },
    email: {
      label: 'Email',
      icon: <Mail className="h-3.5 w-3.5" />,
      classes: 'border-gray-500/30 bg-gray-500/10 text-gray-300',
    },
  };

  return (
    <div className="flex items-center gap-1.5">
      {(methods.length ? methods : ['email' as AdminLoginMethod]).map((method) => {
        const item = items[method];
        return (
          <span
            key={method}
            title={item.label}
            className={`inline-flex h-7 w-7 items-center justify-center rounded-full border ${item.classes}`}
          >
            {item.icon}
          </span>
        );
      })}
      {uidCount > 1 ? (
        <span className="rounded-full bg-gray-800 px-2 py-0.5 text-[10px] font-bold text-gray-300" title="מספר כניסות מקושרות">
          {uidCount}
        </span>
      ) : null}
    </div>
  );
}

function getMissingItems(entry: AdminUserSummary): string[] {
  const missing: string[] = [];
  if (!entry.is_consented && !entry.termsAccepted) missing.push('לא הסכים לתנאים');
  if (!entry.linkedContactId) missing.push('לא מקושר לאיש קשר');
  if (!entry.phone) missing.push('חסר טלפון');
  if (!safeProfileRoles(entry).length) missing.push('חסר תפקיד');
  if (!safeProfileDepartments(entry).length) missing.push('חסרה מחלקה');
  return missing;
}

function isFullProfile(entry: AdminUserSummary): boolean {
  return (entry.is_consented || entry.termsAccepted) &&
    Boolean(entry.linkedContactId) &&
    Boolean(entry.phone) &&
    Boolean(safeProfileRoles(entry).length) &&
    Boolean(safeProfileDepartments(entry).length);
}

function PresenceBadges({ user }: { user: AdminUserSummary }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {user.onlineNow ? (
        <span className="inline-flex items-center gap-1 rounded-full border border-green-500/30 bg-green-500/10 px-2 py-0.5 text-xs text-green-300">
          <Wifi className="h-3 w-3" />
          מחובר
        </span>
      ) : (
        <span className="inline-flex items-center gap-1 rounded-full border border-gray-700 bg-gray-800 px-2 py-0.5 text-xs text-gray-400">
          <WifiOff className="h-3 w-3" />
          לא מחובר
        </span>
      )}
      {user.stalePresence ? (
        <span className="inline-flex items-center gap-1 rounded-full border border-orange-500/30 bg-orange-500/10 px-2 py-0.5 text-xs text-orange-300">
          <AlertTriangle className="h-3 w-3" />
          לא פעיל מעל חודש
        </span>
      ) : null}
    </div>
  );
}

function SortHeader({
  label,
  sortKey,
  activeKey,
  direction,
  onSort,
  className = '',
}: {
  label: string;
  sortKey: UserSortKey;
  activeKey: UserSortKey;
  direction: SortDirection;
  onSort: (key: UserSortKey) => void;
  className?: string;
}) {
  const active = activeKey === sortKey;
  const Icon = active && direction === 'asc' ? ArrowUp : ArrowDown;

  return (
    <th className={`px-4 py-3 text-right font-medium ${className}`}>
      <button
        type="button"
        onClick={() => onSort(sortKey)}
        className={`inline-flex items-center gap-1.5 transition-colors hover:text-gray-200 ${active ? 'text-white' : ''}`}
      >
        <span>{label}</span>
        <Icon className={`h-3.5 w-3.5 ${active ? 'text-purple-300' : 'text-gray-600'}`} />
      </button>
    </th>
  );
}

function StatCard({
  icon: Icon,
  label,
  value,
  color,
  live = false,
}: {
  icon: typeof Users;
  label: string;
  value: number;
  color: string;
  live?: boolean;
}) {
  return (
    <div className="flex items-center gap-4 rounded-2xl border border-gray-800 bg-gray-900 p-5">
      <div className={`flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-xl ${color}`}>
        <Icon className="h-6 w-6" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-2xl font-bold text-white">{value}</p>
        <p className="mt-0.5 text-xs text-gray-400">{label}</p>
      </div>
      {live ? <span className="h-2 w-2 flex-shrink-0 rounded-full bg-green-400 animate-pulse" /> : null}
    </div>
  );
}

function EventRow({ event }: { event: SystemEventRecord }) {
  const color =
    event.level === 'error'
      ? 'text-red-300 border-red-500/30 bg-red-500/10'
      : event.level === 'warn'
        ? 'text-orange-300 border-orange-500/30 bg-orange-500/10'
        : event.level === 'success'
          ? 'text-green-300 border-green-500/30 bg-green-500/10'
          : 'text-blue-300 border-blue-500/30 bg-blue-500/10';

  return (
    <div className="rounded-xl border border-gray-800 bg-gray-950/70 p-3">
      <div className="mb-1 flex items-center justify-between gap-3">
        <span className={`rounded-full border px-2 py-0.5 text-xs ${color}`}>{event.type}</span>
        <span className="text-xs text-gray-500">{formatRelativeTime(event.createdAt)}</span>
      </div>
      <p className="text-sm text-white">{event.message}</p>
      <p className="mt-1 text-xs text-gray-500">
        {event.source}
        {event.route ? ` • ${event.route}` : ''}
        {event.job ? ` • ${event.job}` : ''}
      </p>
      {event.detail ? <p className="mt-2 text-xs text-gray-400">{event.detail}</p> : null}
    </div>
  );
}

export default function AdminPage() {
  const { user, profile, loading: authLoading } = useAuth();
  const [overview, setOverview] = useState<AdminOverview>(EMPTY_OVERVIEW);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [userSort, setUserSort] = useState<{ key: UserSortKey; direction: SortDirection }>({
    key: 'lastSeen',
    direction: 'desc',
  });
  const [announcementDraft, setAnnouncementDraft] = useState('');
  const [toast, setToast] = useState<ToastState>(null);
  const [noAdminExists, setNoAdminExists] = useState(false);
  const [claimingAdmin, setClaimingAdmin] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [savingConfig, setSavingConfig] = useState(false);
  const [runningSync, setRunningSync] = useState(false);
  const [importingDirectors, setImportingDirectors] = useState(false);
  const [showAddContact, setShowAddContact] = useState(false);
  const [addingContact, setAddingContact] = useState(false);
  const [newContact, setNewContact] = useState({ name: '', phone: '', role: '' });
  const [migratingGlobal, setMigratingGlobal] = useState(false);
  const [sendingNotification, setSendingNotification] = useState(false);
  const [notificationTitle, setNotificationTitle] = useState('');
  const [notificationMessage, setNotificationMessage] = useState('');
  const [notificationLink, setNotificationLink] = useState('/schedule#live');
  const [notificationTarget, setNotificationTarget] = useState<NotificationTarget>('test');
  const [notificationTargetUserId, setNotificationTargetUserId] = useState('');
  const [sendPush, setSendPush] = useState(false);
  const [updatingRole, setUpdatingRole] = useState<string | null>(null);
  const [reminderSent, setReminderSent] = useState<Record<string, boolean>>({});
  const [autoLinkPending, setAutoLinkPending] = useState<Record<string, boolean>>({});
  const [editModal, setEditModal] = useState<{
    uid: string;
    displayName: string;
    phone: string;
    department: string;
    departments: string[];
    role: string;
    roles: string[];
    forceContactId: string;
    linkedContactId: string | null;
  } | null>(null);
  const [editSaving, setEditSaving] = useState(false);
  const [availableContacts, setAvailableContacts] = useState<
    { id: string; firstName: string; lastName: string; phone: string; department: string; departments?: string[]; role?: string; roles?: string[] }[]
  >([]);
  const [contactSearchTerm, setContactSearchTerm] = useState('');
  const [showContactSearch, setShowContactSearch] = useState(false);
  const [pageViewPanel, setPageViewPanel] = useState<PageViewPanelState>({
    page: null,
    events: [],
    loading: false,
    error: null,
  });
  const [discoveries, setDiscoveries] = useState<ContactDiscovery[]>([]);
  const [discoveriesLoading, setDiscoveriesLoading] = useState(false);
  const draftDirtyRef = useRef(false);

  const isAdmin = profile?.siteRole === 'admin';

  function handleUserSort(key: UserSortKey) {
    setUserSort((current) => ({
      key,
      direction: current.key === key && current.direction === 'desc' ? 'asc' : 'desc',
    }));
  }

  function showToast(type: 'ok' | 'err', msg: string) {
    setToast({ type, msg });
    window.setTimeout(() => setToast(null), 3000);
  }

  async function sendReminder(targetUid: string) {
    try {
      await fetchWithAuth('/api/admin/notifications', {
        method: 'POST',
        body: JSON.stringify({
          target: 'user',
          targetUserId: targetUid,
          title: 'השלם את הפרופיל שלך',
          message: 'לחץ כאן כדי להשלים את הרישום ולהופיע ברשימת הצוות',
          linkUrl: '/profile',
          sendPush: true,
        }),
      });
      setReminderSent((prev) => ({ ...prev, [targetUid]: true }));
    } catch {
      showToast('err', 'שליחת התזכורת נכשלה');
    }
  }

  async function handleAutoLink(uid: string) {
    setAutoLinkPending((prev) => ({ ...prev, [uid]: true }));
    try {
      const data = await fetchWithAuth<{ success: boolean; message?: string; contact?: { name: string } }>(
        '/api/admin/users/auto-link',
        { method: 'POST', body: JSON.stringify({ uid }) },
      );
      if (data.success) {
        showToast('ok', `קושר ל: ${data.contact?.name ?? '—'}`);
        void loadOverview(true);
      } else {
        showToast('err', data.message || 'לא נמצא איש קשר');
      }
    } catch {
      showToast('err', 'שגיאה בקישור אוטומטי');
    } finally {
      setAutoLinkPending((prev) => ({ ...prev, [uid]: false }));
    }
  }

  async function handleEditSave() {
    if (!editModal) return;
    setEditSaving(true);
    try {
      await fetchWithAuth('/api/admin/users/update', {
        method: 'POST',
        body: JSON.stringify({
          ...editModal,
          department: stringArray(editModal.departments)[0] || '',
          role: stringArray(editModal.roles)[0] || '',
          forceContactId: editModal.forceContactId || undefined,
        }),
      });
      showToast('ok', 'הפרופיל עודכן');
      setEditModal(null);
      void loadOverview(true);
    } catch {
      showToast('err', 'שגיאה בשמירה');
    } finally {
      setEditSaving(false);
    }
  }

  async function fetchWithAuth<T>(path: string, init?: RequestInit): Promise<T> {
    if (!user) {
      throw new Error('יש להתחבר תחילה');
    }

    const token = await user.getIdToken();
    const response = await fetch(path, {
      ...init,
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        ...(init?.headers || {}),
      },
      cache: 'no-store',
    });

    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      const message =
        typeof payload?.error === 'string'
          ? payload.error
          : `HTTP ${response.status}`;
      throw new Error(message);
    }

    return payload as T;
  }

  async function loadOverview(silent = false) {
    if (!user || !isAdmin) return;
    if (!silent) setLoading(true);
    if (silent) setRefreshing(true);

    try {
      const data = await fetchWithAuth<AdminOverview>('/api/admin/overview');
      setOverview(data);
      if (!draftDirtyRef.current) {
        setAnnouncementDraft(data.appConfig.boardAnnouncement || '');
      }
      setError(null);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'שגיאה בטעינת לוח הניהול');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  async function loadPageViewEvents(page: { key: string; label: string }) {
    setPageViewPanel({ page, events: [], loading: true, error: null });
    try {
      const data = await fetchWithAuth<{ events: PageViewEvent[] }>(
        `/api/admin/usage/page-views?pathname=${encodeURIComponent(page.key)}`,
      );
      setPageViewPanel({ page, events: data.events || [], loading: false, error: null });
    } catch (pageViewError) {
      setPageViewPanel({
        page,
        events: [],
        loading: false,
        error: pageViewError instanceof Error ? pageViewError.message : 'שגיאה בטעינת צפיות הדף',
      });
    }
  }

  useEffect(() => {
    if (authLoading) return;

    if (!user) {
      setLoading(false);
      setNoAdminExists(false);
      return;
    }

    let cancelled = false;

    async function setup() {
      try {
        if (!isAdmin) {
          const bootstrap = await fetchWithAuth<{ adminExists: boolean; canClaim: boolean }>('/api/admin/bootstrap');
          if (!cancelled) {
            setNoAdminExists(!bootstrap.adminExists && bootstrap.canClaim);
            setLoading(false);
          }
          return;
        }

        setNoAdminExists(false);
        await loadOverview();
      } catch (setupError) {
        if (!cancelled) {
          setLoading(false);
          setError(setupError instanceof Error ? setupError.message : 'שגיאה בטעינת מצב ניהול');
        }
      }
    }

    void setup();
    return () => {
      cancelled = true;
    };
  }, [authLoading, user, isAdmin]);

  useEffect(() => {
    if (!user || !isAdmin) return;
    fetchWithAuth<{ contacts: { id: string; firstName: string; lastName: string; phone: string; department: string; departments?: string[]; role?: string; roles?: string[] }[] }>(
      '/api/admin/contacts-list',
    )
      .then((data) => { if (Array.isArray(data.contacts)) setAvailableContacts(data.contacts); })
      .catch(() => undefined);
  }, [user, isAdmin]);

  useEffect(() => {
    if (!user || profile?.siteRole !== 'admin') return;
    setDiscoveriesLoading(true);
    const today = new Date().toISOString().slice(0, 10);
    user.getIdToken().then((token) =>
      fetch(`/api/admin/contact-discoveries?date=${today}`, {
        headers: { Authorization: `Bearer ${token}` },
      })
        .then((res) => res.json())
        .then((data: { discoveries?: ContactDiscovery[] }) => {
          setDiscoveries(data.discoveries ?? []);
        })
        .catch(() => {})
        .finally(() => setDiscoveriesLoading(false)),
    );
  }, [user, profile?.siteRole]);

  async function claimAdmin() {
    setClaimingAdmin(true);
    try {
      await fetchWithAuth('/api/admin/bootstrap', { method: 'POST' });
      window.location.reload();
    } catch (claimError) {
      setError(claimError instanceof Error ? claimError.message : 'שגיאה בהגדרת מנהל ראשון');
      setClaimingAdmin(false);
    }
  }

  async function updateUserRole(uid: string, siteRole: AdminRole) {
    setUpdatingRole(uid);
    try {
      await fetchWithAuth(`/api/admin/users/${uid}/role`, {
        method: 'POST',
        body: JSON.stringify({ siteRole }),
      });
      showToast('ok', 'הרשאת המשתמש עודכנה');
      await loadOverview(true);
    } catch (roleError) {
      showToast('err', roleError instanceof Error ? roleError.message : 'שגיאה בעדכון הרשאה');
    } finally {
      setUpdatingRole(null);
    }
  }

  async function saveAppConfig(next: { maintenanceMode?: boolean; boardAnnouncement?: string }) {
    setSavingConfig(true);
    try {
      const payload = {
        maintenanceMode:
          typeof next.maintenanceMode === 'boolean'
            ? next.maintenanceMode
            : overview.appConfig.maintenanceMode,
        boardAnnouncement:
          typeof next.boardAnnouncement === 'string'
            ? next.boardAnnouncement
            : announcementDraft,
      };

      await fetchWithAuth('/api/admin/app-config', {
        method: 'POST',
        body: JSON.stringify(payload),
      });
      draftDirtyRef.current = false;
      showToast('ok', 'הגדרות המערכת נשמרו');
      await loadOverview(true);
    } catch (configError) {
      showToast('err', configError instanceof Error ? configError.message : 'שגיאה בשמירת הגדרות');
    } finally {
      setSavingConfig(false);
    }
  }

  async function runContactsSync() {
    if (!window.confirm('להריץ עכשיו סנכרון אנשי קשר מלא?')) return;
    setRunningSync(true);
    try {
      const result = await fetchWithAuth<{ created?: number; updated?: number; deletedDuplicates?: number }>(
        '/api/admin/contacts-sync',
        { method: 'POST' },
      );
      showToast(
        'ok',
        `סנכרון הושלם: ${result.created || 0} נוצרו, ${result.updated || 0} עודכנו, ${result.deletedDuplicates || 0} כפילויות הוסרו`,
      );
      await loadOverview(true);
    } catch (syncError) {
      showToast('err', syncError instanceof Error ? syncError.message : 'שגיאה בסנכרון אנשי קשר');
    } finally {
      setRunningSync(false);
    }
  }

  async function runDirectorsImport() {
    if (!window.confirm('לייבא את רשימת הבמאים לאלפון?')) return;
    setImportingDirectors(true);
    try {
      const result = await fetchWithAuth<{ created?: number; updated?: number; skipped?: number }>(
        '/api/admin/contacts/import',
        { method: 'POST', body: JSON.stringify({}) },
      );
      showToast(
        'ok',
        `ייבוא הושלם: ${result.created || 0} נוצרו, ${result.updated || 0} עודכנו, ${result.skipped || 0} דולגו`,
      );
      await loadOverview(true);
    } catch (importError) {
      showToast('err', importError instanceof Error ? importError.message : 'שגיאה בייבוא במאים');
    } finally {
      setImportingDirectors(false);
    }
  }

  async function addSingleContact() {
    if (!newContact.name.trim() || !newContact.phone.trim()) {
      showToast('err', 'יש למלא שם וטלפון');
      return;
    }
    setAddingContact(true);
    try {
      const result = await fetchWithAuth<{ created?: number; updated?: number; skipped?: number }>(
        '/api/admin/contacts/import',
        {
          method: 'POST',
          body: JSON.stringify({
            records: [{ name: newContact.name.trim(), phone: newContact.phone.trim(), role: newContact.role.trim() || 'לא צוין' }],
          }),
        },
      );
      showToast('ok', `${result.created ? 'נוצר' : result.updated ? 'עודכן' : 'כבר קיים'}: ${newContact.name}`);
      setNewContact({ name: '', phone: '', role: '' });
      setShowAddContact(false);
      await loadOverview(true);
    } catch (addError) {
      showToast('err', addError instanceof Error ? addError.message : 'שגיאה בהוספת איש קשר');
    } finally {
      setAddingContact(false);
    }
  }

  async function runGlobalProductionsMigration() {
    if (!window.confirm('להעתיק את כל ההפקות ל-global_productions? (לצורך Pro Cards)')) return;
    setMigratingGlobal(true);
    try {
      const dryResult = await fetchWithAuth<{
        unique?: number; filtered?: number; total?: number;
        existingGlobalCount?: number; message?: string;
        sampleNames?: string[];
      }>(
        '/api/admin/migrate-global-productions',
        { method: 'POST', body: JSON.stringify({ dryRun: true }) },
      );

      const details = [
        `סה"כ מסמכים: ${dryResult.total || 0}`,
        `עם צוות: ${dryResult.filtered || 0}`,
        `ייחודיות: ${dryResult.unique || 0}`,
        `כבר ב-global: ${dryResult.existingGlobalCount || 0}`,
      ].join('\n');

      const samples = (dryResult.sampleNames || []).slice(0, 5).join('\n  ');
      const samplesStr = samples ? `\n\nדוגמאות:\n  ${samples}` : '';

      if (!window.confirm(`${details}${samplesStr}\n\nלהמשיך?`)) {
        setMigratingGlobal(false);
        return;
      }
      const result = await fetchWithAuth<{ written?: number; skipped?: number; errors?: string[] }>(
        '/api/admin/migrate-global-productions',
        { method: 'POST', body: JSON.stringify({ dryRun: false }) },
      );
      showToast('ok', `מיגרציה הושלמה: ${result.written || 0} נכתבו, ${result.skipped || 0} דולגו`);
      await loadOverview(true);
    } catch (migError) {
      showToast('err', migError instanceof Error ? migError.message : 'שגיאה במיגרציה');
    } finally {
      setMigratingGlobal(false);
    }
  }

  async function sendAdminNotification() {
    if (!notificationTitle.trim() || !notificationMessage.trim()) {
      showToast('err', 'יש למלא כותרת ותוכן להתראה');
      return;
    }

    if (notificationTarget === 'user' && !notificationTargetUserId) {
      showToast('err', 'יש לבחור משתמש יעד');
      return;
    }

    setSendingNotification(true);
    try {
      const result = await fetchWithAuth<{ sent: number; pushTokens: number }>('/api/admin/notifications', {
        method: 'POST',
        body: JSON.stringify({
          title: notificationTitle,
          message: notificationMessage,
          linkUrl: notificationLink,
          target: notificationTarget,
          targetUserId: notificationTarget === 'user' ? notificationTargetUserId : undefined,
          sendPush,
        }),
      });

      window.dispatchEvent(new Event('app:notifications-refresh'));
      if ('BroadcastChannel' in window) {
        try {
          const channel = new BroadcastChannel('tv-industry-notifications');
          channel.postMessage({ type: 'refresh' });
          channel.close();
        } catch {
          // The direct window event above still refreshes the current tab.
        }
      }

      const pushNote = sendPush && result.pushTokens > 0 ? ` + ${result.pushTokens} Push` : '';
      showToast('ok', `ההתראה נשלחה ל-${result.sent} משתמשים${pushNote}`);
      setNotificationTitle('');
      setNotificationMessage('');
      if (notificationTarget !== 'user') {
        setNotificationTargetUserId('');
      }
    } catch (notificationError) {
      showToast('err', notificationError instanceof Error ? notificationError.message : 'שגיאה בשליחת ההתראה');
    } finally {
      setSendingNotification(false);
    }
  }

  const filteredUsers = useMemo(() => {
    const term = search.trim().toLowerCase();
    const filtered = term
      ? overview.users.filter((entry) =>
          [entry.displayName, entry.email, entry.phone || '', entry.role, entry.department, ...safeProfileRoles(entry), ...safeProfileDepartments(entry), entry.city || '', roleLabel(entry.siteRole), ...entry.linkedUids]
            .join(' ')
            .toLowerCase()
            .includes(term),
        )
      : overview.users;

    const directionFactor = userSort.direction === 'asc' ? 1 : -1;
    return [...filtered].sort((a, b) => {
      let result = 0;

      if (userSort.key === 'displayName') {
        result = a.displayName.localeCompare(b.displayName, 'he');
      } else if (userSort.key === 'email') {
        result = a.email.localeCompare(b.email, 'en');
      } else if (userSort.key === 'role') {
        result = `${safeProfileRoles(a).join(' ')} ${safeProfileDepartments(a).join(' ')}`.localeCompare(`${safeProfileRoles(b).join(' ')} ${safeProfileDepartments(b).join(' ')}`, 'he');
      } else if (userSort.key === 'status') {
        result = statusRank(a) - statusRank(b);
      } else if (userSort.key === 'lastSeen') {
        result = lastSeenMs(a) - lastSeenMs(b);
      } else {
        result = roleLabel(a.siteRole).localeCompare(roleLabel(b.siteRole), 'he');
      }

      return result * directionFactor;
    });
  }, [overview.users, search, userSort]);

  if (authLoading || loading) {
    return (
      <div className="flex min-h-screen items-center justify-center gap-3 bg-gray-950" dir="rtl">
        <RefreshCw className="h-5 w-5 animate-spin text-purple-400" />
        <p className="text-gray-400">טוען נתוני ניהול...</p>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-950" dir="rtl">
        <p className="text-gray-400">יש להתחבר תחילה</p>
      </div>
    );
  }

  if (noAdminExists) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-8 bg-gray-950 p-8" dir="rtl">
        <div className="max-w-md space-y-4 text-center">
          <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full border border-yellow-400/30 bg-yellow-400/10">
            <Crown className="h-10 w-10 text-yellow-400" />
          </div>
          <h1 className="text-2xl font-bold text-white">הגדרת מנהל ראשון</h1>
          <p className="leading-relaxed text-gray-400">
            עדיין לא הוגדר מנהל מערכת. אפשר לקחת עכשיו גישת מנהל ראשונה כדי להפעיל את לוח הניהול.
          </p>
        </div>
        <button
          onClick={claimAdmin}
          disabled={claimingAdmin}
          className="flex items-center gap-3 rounded-2xl bg-yellow-500 px-10 py-4 text-lg font-bold text-black transition-colors hover:bg-yellow-400 disabled:opacity-50"
        >
          <Crown className="h-5 w-5" />
          {claimingAdmin ? 'מגדיר גישת מנהל...' : 'קח גישת מנהל'}
        </button>
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-gray-950 p-8" dir="rtl">
        <ShieldCheck className="h-16 w-16 text-red-400" />
        <p className="text-xl font-bold text-red-400">הגישה ללוח הניהול זמינה למנהלים בלבד</p>
        <Link href="/" className="text-purple-400 hover:underline">
          חזרה לדף הבית
        </Link>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-950 pb-16 text-white" dir="rtl">
      {toast ? (
        <div
          className={`fixed left-1/2 top-4 z-50 flex -translate-x-1/2 items-center gap-2 rounded-2xl px-5 py-3 text-sm font-medium shadow-xl ${
            toast.type === 'ok'
              ? 'border border-green-500/40 bg-green-900/95 text-green-300'
              : 'border border-red-500/40 bg-red-900/95 text-red-300'
          }`}
        >
          {toast.type === 'ok' ? <CheckCircle className="h-4 w-4" /> : <AlertTriangle className="h-4 w-4" />}
          {toast.msg}
        </div>
      ) : null}

      <div className="mx-auto max-w-7xl space-y-8 px-4 py-8">
        {error ? (
          <div className="flex items-center gap-3 rounded-2xl border border-red-500/40 bg-red-900/30 p-4 text-red-300">
            <AlertTriangle className="h-5 w-5 flex-shrink-0" />
            <p className="flex-1 text-sm">{error}</p>
            <button onClick={() => setError(null)} className="text-lg leading-none text-red-200">
              ×
            </button>
          </div>
        ) : null}

        <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
          <div>
            <div className="mb-1 flex items-center gap-2">
              <ShieldCheck className="h-7 w-7 text-yellow-400" />
              <h1 className="text-3xl font-bold">לוח ניהול</h1>
              <span className="h-2 w-2 rounded-full bg-green-400 animate-pulse" />
              <span className="rounded-full border border-yellow-500/30 bg-yellow-500/10 px-2 py-0.5 text-xs font-bold text-yellow-300" dir="ltr">
                v{APP_VERSION}
              </span>
            </div>
            <p className="text-sm text-gray-400">
              מקור אמת שרתי • עודכן {formatRelativeTime(overview.generatedAt)}
              {refreshing ? ' • מרענן…' : ''}
            </p>
            <div className="mt-3 flex flex-wrap gap-2 text-xs">
              <span className="rounded-full border border-gray-700 bg-gray-900 px-3 py-1 text-gray-300">
                רשומים: {overview.stats.totalUsers}
              </span>
              <span className="rounded-full border border-green-500/30 bg-green-500/10 px-3 py-1 text-green-300">
                פעילים עכשיו: {overview.stats.onlineNow}
              </span>
              <span className="rounded-full border border-teal-500/30 bg-teal-500/10 px-3 py-1 text-teal-300">
                פעילים ב־24 שעות: {overview.stats.active24h}
              </span>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <button
              onClick={() => void loadOverview(true)}
              className="flex items-center gap-2 rounded-xl bg-gray-800 px-4 py-2 text-sm font-medium text-gray-200 transition-colors hover:bg-gray-700"
            >
              <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
              רענון
            </button>
            <button
              onClick={() => void runContactsSync()}
              disabled={runningSync}
              className="flex items-center gap-2 rounded-xl bg-purple-600 px-4 py-2 text-sm font-semibold transition-colors hover:bg-purple-700 disabled:opacity-60"
            >
              {runningSync ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Wrench className="h-4 w-4" />}
              סנכרון אנשי קשר
            </button>
            <button
              onClick={() => void runDirectorsImport()}
              disabled={importingDirectors}
              className="flex items-center gap-2 rounded-xl bg-rose-600 px-4 py-2 text-sm font-semibold transition-colors hover:bg-rose-700 disabled:opacity-60"
            >
              {importingDirectors ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Clapperboard className="h-4 w-4" />}
              ייבוא במאים
            </button>
            <button
              onClick={() => setShowAddContact(!showAddContact)}
              className="flex items-center gap-2 rounded-xl bg-green-600 px-4 py-2 text-sm font-semibold transition-colors hover:bg-green-700"
            >
              <Contact2 className="h-4 w-4" />
              + איש קשר
            </button>
            <button
              onClick={() => void runGlobalProductionsMigration()}
              disabled={migratingGlobal}
              className="flex items-center gap-2 rounded-xl bg-amber-600 px-4 py-2 text-sm font-semibold transition-colors hover:bg-amber-700 disabled:opacity-60"
            >
              {migratingGlobal ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Database className="h-4 w-4" />}
              מיגרציה Pro Cards
            </button>
            <Link
              href="/admin/users"
              className="flex items-center gap-2 rounded-xl bg-purple-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-purple-700"
            >
              ניהול משתמשים
              <Users className="h-4 w-4" />
            </Link>
            <Link
              href="/admin/sync"
              className="flex items-center gap-2 rounded-xl bg-gray-800 px-4 py-2 text-sm font-semibold text-gray-200 transition-colors hover:bg-gray-700"
            >
              כלי סנכרון
              <ArrowLeft className="h-4 w-4" />
            </Link>
            <Link
              href="/admin/industry-master"
              className="flex items-center gap-2 rounded-xl bg-violet-900/50 px-4 py-2 text-sm font-semibold text-violet-200 transition-colors hover:bg-violet-800/60"
            >
              מנהל הפקות מאוחד
              <Database className="h-4 w-4" />
            </Link>
          </div>
        </div>

        {showAddContact && (
          <div className="rounded-2xl border border-green-500/30 bg-green-500/5 p-4">
            <h3 className="mb-3 text-sm font-bold text-green-400">הוספת איש קשר חדש</h3>
            <div className="flex flex-wrap items-end gap-3">
              <div className="flex-1 min-w-[140px]">
                <label className="mb-1 block text-xs text-gray-400">שם מלא *</label>
                <input
                  type="text"
                  value={newContact.name}
                  onChange={e => setNewContact(prev => ({ ...prev, name: e.target.value }))}
                  placeholder="ישראל ישראלי"
                  className="w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-white placeholder:text-gray-500 focus:border-green-500 focus:outline-none"
                  dir="rtl"
                />
              </div>
              <div className="flex-1 min-w-[140px]">
                <label className="mb-1 block text-xs text-gray-400">טלפון *</label>
                <input
                  type="tel"
                  value={newContact.phone}
                  onChange={e => setNewContact(prev => ({ ...prev, phone: e.target.value }))}
                  placeholder="054-1234567"
                  className="w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-white placeholder:text-gray-500 focus:border-green-500 focus:outline-none"
                  dir="ltr"
                />
              </div>
              <div className="flex-1 min-w-[140px]">
                <label className="mb-1 block text-xs text-gray-400">תפקיד</label>
                <input
                  type="text"
                  value={newContact.role}
                  onChange={e => setNewContact(prev => ({ ...prev, role: e.target.value }))}
                  placeholder="צלם, במאי, טכנאי..."
                  className="w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-white placeholder:text-gray-500 focus:border-green-500 focus:outline-none"
                  dir="rtl"
                />
              </div>
              <button
                onClick={() => void addSingleContact()}
                disabled={addingContact}
                className="rounded-lg bg-green-600 px-5 py-2 text-sm font-semibold text-white transition-colors hover:bg-green-700 disabled:opacity-60"
              >
                {addingContact ? 'מוסיף...' : 'הוסף'}
              </button>
              <button
                onClick={() => { setShowAddContact(false); setNewContact({ name: '', phone: '', role: '' }); }}
                className="rounded-lg bg-gray-700 px-4 py-2 text-sm text-gray-300 transition-colors hover:bg-gray-600"
              >
                ביטול
              </button>
            </div>
          </div>
        )}

        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <StatCard icon={Users} label="משתמשים רשומים" value={overview.stats.totalUsers} color="bg-blue-500/20 text-blue-400" />
          <StatCard icon={Wifi} label="מחוברים עכשיו" value={overview.stats.onlineNow} color="bg-green-500/20 text-green-400" live />
          <StatCard icon={Activity} label="פעילים ב־24 שעות" value={overview.stats.active24h} color="bg-teal-500/20 text-teal-400" />
          <StatCard icon={Contact2} label="אנשי קשר" value={overview.stats.totalContacts} color="bg-purple-500/20 text-purple-400" live />
          <StatCard icon={FileText} label="פוסטים בלוח" value={overview.stats.totalPosts} color="bg-pink-500/20 text-pink-400" />
          <StatCard icon={MessageCircle} label="שיחות צ׳אט" value={overview.stats.totalChats} color="bg-indigo-500/20 text-indigo-400" />
          <StatCard icon={Crown} label="מנהלים" value={overview.stats.admins} color="bg-yellow-500/20 text-yellow-400" />
          <StatCard icon={AlertTriangle} label="נוכחות מיושנת" value={overview.stats.stalePresence} color="bg-orange-500/20 text-orange-400" />
        </div>

        {/* גילויים חדשים */}
        <section className="w-full rounded-2xl border p-5 space-y-3" style={{ background: 'var(--theme-bg-card)', borderColor: 'var(--theme-border)' }} dir="rtl">
          <div className="flex items-center gap-2">
            <Contact2 className="w-5 h-5 text-emerald-400" />
            <h2 className="font-bold text-[var(--theme-text)]">גילויים חדשים היום</h2>
            {!discoveriesLoading && (
              <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 font-semibold">
                {discoveries.length}
              </span>
            )}
            {discoveriesLoading && <span className="text-xs text-[var(--theme-text-secondary)]">טוען...</span>}
          </div>
          {discoveries.length === 0 && !discoveriesLoading && (
            <p className="text-sm text-[var(--theme-text-secondary)]">אין גילויים חדשים היום.</p>
          )}
          {discoveries.length > 0 && (
            <div className="space-y-2 max-h-60 overflow-y-auto">
              {discoveries.map((d) => (
                <div key={d.id} className="flex items-center justify-between text-sm border-b border-[var(--theme-border)] pb-2 last:border-0 last:pb-0">
                  <div>
                    <span className="font-medium text-[var(--theme-text)]">{d.name}</span>
                    <span className="text-[var(--theme-text-secondary)] mr-2">— {d.role || 'ללא תפקיד'}</span>
                  </div>
                  <span className="text-xs text-emerald-400 shrink-0">{d.sourceBoardName ?? d.sourceBoard}</span>
                </div>
              ))}
            </div>
          )}
        </section>

        <div className="grid grid-cols-1 gap-6 xl:grid-cols-4">
          <div className="overflow-hidden rounded-2xl border border-gray-800 bg-gray-900 xl:col-span-3">
            <div className="flex flex-col gap-3 border-b border-gray-800 p-5 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-2">
                <Users className="h-5 w-5 text-purple-400" />
                <h2 className="text-lg font-bold">ניהול משתמשים</h2>
                <span className="rounded-full bg-gray-800 px-2 py-0.5 text-xs text-gray-400">{overview.stats.totalUsers}</span>
              </div>
              <div className="relative">
                <Search className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-500" />
                <input
                  type="text"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="חיפוש משתמש, תפקיד או עיר..."
                  className="w-64 rounded-xl border border-gray-700 bg-gray-800 py-2 pl-4 pr-9 text-sm text-white placeholder-gray-500 focus:border-purple-500 focus:outline-none"
                />
              </div>
            </div>
            <div className="border-b border-gray-800 px-5 py-3 text-xs text-gray-500">
              מחובר = `isOnline` פעיל וגם `lastSeen` בתוך 2 דקות. לא פעיל מעל חודש = החיבור האחרון היה לפני יותר מ־30 יום או שלא קיים `lastSeen`.
            </div>
            <div className="hidden">
              מחוברים עכשיו = `isOnline` פעיל וגם `lastSeen` בתוך 2 דקות. נוכחות ישנה = `isOnline` נשאר פעיל אבל `lastSeen` כבר לא עדכני.
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-800 text-xs text-gray-500">
                    <SortHeader label="משתמש" sortKey="displayName" activeKey={userSort.key} direction={userSort.direction} onSort={handleUserSort} className="px-5" />
                    <SortHeader label="אימייל" sortKey="email" activeKey={userSort.key} direction={userSort.direction} onSort={handleUserSort} className="hidden md:table-cell" />
                    <th className="hidden px-4 py-3 text-right font-medium md:table-cell">שיטות כניסה</th>
                    <SortHeader label="תפקיד / מחלקה" sortKey="role" activeKey={userSort.key} direction={userSort.direction} onSort={handleUserSort} className="hidden lg:table-cell" />
                    <SortHeader label="סטטוס" sortKey="status" activeKey={userSort.key} direction={userSort.direction} onSort={handleUserSort} />
                    <SortHeader label="נראה לאחרונה" sortKey="lastSeen" activeKey={userSort.key} direction={userSort.direction} onSort={handleUserSort} className="hidden sm:table-cell" />
                    <SortHeader label="הרשאה" sortKey="siteRole" activeKey={userSort.key} direction={userSort.direction} onSort={handleUserSort} />
                  </tr>
                  <tr className="hidden">
                    <th className="px-5 py-3 text-right font-medium">משתמש</th>
                    <th className="hidden px-4 py-3 text-right font-medium md:table-cell">אימייל</th>
                    <th className="hidden px-4 py-3 text-right font-medium lg:table-cell">תפקיד / מחלקה</th>
                    <th className="px-4 py-3 text-right font-medium">סטטוס</th>
                    <th className="hidden px-4 py-3 text-right font-medium sm:table-cell">נראה לאחרונה</th>
                    <th className="px-4 py-3 text-right font-medium">הרשאה</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredUsers.map((entry) => (
                    <tr key={entry.uid} className="border-b border-gray-800/50 hover:bg-gray-800/30">
                      <td className="px-5 py-3">
                        <div className="flex items-center gap-3">
                          <div className="relative flex-shrink-0">
                            {entry.photoURL ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img src={entry.photoURL} alt="" className="h-9 w-9 rounded-full object-cover" />
                            ) : (
                              <div className="flex h-9 w-9 items-center justify-center rounded-full bg-purple-600 text-sm font-bold">
                                {entry.displayName?.charAt(0) || '?'}
                              </div>
                            )}
                            {entry.onlineNow ? (
                              <span className="absolute -bottom-0.5 -left-0.5 h-3 w-3 rounded-full border-2 border-gray-900 bg-green-400" />
                            ) : null}
                          </div>
                          <div className="min-w-0">
                            <p className="truncate font-medium text-white">{entry.displayName || 'ללא שם'}</p>
                            {entry.uidCount > 1 ? (
                              <span className="mt-0.5 inline-flex items-center gap-1 rounded-full bg-blue-900/30 px-1.5 py-0.5 text-[10px] text-blue-300">
                                {entry.uidCount} כניסות מאוחדות
                              </span>
                            ) : null}
                            {isFullProfile(entry) ? (
                              <span className="mt-0.5 inline-flex items-center gap-1 rounded-full bg-green-900/40 px-1.5 py-0.5 text-[10px] text-green-400">
                                <span className="h-1.5 w-1.5 rounded-full bg-green-400" />
                                פרופיל מלא
                              </span>
                            ) : (
                              <div>
                                <span className="mt-0.5 inline-flex items-center gap-1 rounded-full bg-orange-900/40 px-1.5 py-0.5 text-[10px] text-orange-400">
                                  <span className="h-1.5 w-1.5 rounded-full bg-orange-400" />
                                  {!entry.linkedContactId ? 'לא מקושר' : 'לא הסכים'}
                                </span>
                                <div className="mt-0.5 text-[9px] text-orange-300/60 leading-tight">
                                  {getMissingItems(entry).join(' · ')}
                                </div>
                                {reminderSent[entry.uid] ? (
                                  <span className="mt-0.5 text-[9px] text-green-400">נשלח ✓</span>
                                ) : (
                                  <button
                                    onClick={() => void sendReminder(entry.uid)}
                                    className="mt-0.5 text-[9px] text-purple-400 hover:text-purple-300 underline underline-offset-2"
                                  >
                                    שלח תזכורת
                                  </button>
                                )}
                                <button
                                    onClick={() => void handleAutoLink(entry.uid)}
                                    disabled={autoLinkPending[entry.uid]}
                                    className="mt-1 text-[9px] text-blue-400 hover:text-blue-300 underline underline-offset-2 disabled:opacity-50"
                                    title="חפש וקשר אוטומטית לאיש קשר"
                                  >
                                    {autoLinkPending[entry.uid] ? '...' : '🔗 קשר אוטומטית'}
                                  </button>
                              </div>
                            )}
                            <button
                              onClick={() => {
                                const fields = safeProfileFields(entry);
                                setContactSearchTerm('');
                                setShowContactSearch(false);
                                setEditModal({
                                  uid: entry.uid,
                                  displayName: entry.displayName ?? '',
                                  phone: entry.phone ?? '',
                                  department: fields.department,
                                  departments: fields.departments,
                                  role: fields.role,
                                  roles: fields.roles,
                                  forceContactId: '',
                                  linkedContactId: entry.linkedContactId ? String(entry.linkedContactId) : null,
                                });
                              }}
                              className="mt-0.5 text-[9px] text-gray-400 hover:text-gray-200 underline underline-offset-2"
                            >
                              ✏️ ערוך
                            </button>
                            <p className="truncate text-xs text-gray-500 md:hidden">{entry.email || '—'}</p>
                          </div>
                        </div>
                      </td>
                      <td className="hidden max-w-[180px] px-4 py-3 text-gray-400 md:table-cell">
                        <span className="block truncate">{entry.email || '—'}</span>
                      </td>
                      <td className="hidden px-4 py-3 md:table-cell">
                        <LoginMethods methods={entry.loginMethods} uidCount={entry.uidCount} />
                      </td>
                      <td className="hidden px-4 py-3 lg:table-cell">
                        <p className="text-white">{safeProfileRoles(entry).join(', ') || '—'}</p>
                        <p className="text-xs text-gray-500">{safeProfileDepartments(entry).join(', ') || '—'}</p>
                      </td>
                      <td className="px-4 py-3">
                        <PresenceBadge user={entry} />
                      </td>
                      <td className="hidden px-4 py-3 text-xs text-gray-400 sm:table-cell">
                        {formatRelativeTime(entry.lastSeen)}
                      </td>
                      <td className="px-4 py-3">
                        {entry.linkedUids.includes(user.uid) ? (
                          <RoleBadge role={entry.siteRole} />
                        ) : (
                          <>
                            <div className="relative inline-flex min-w-[110px]">
                              <select
                                value={entry.siteRole}
                                onChange={(event) => void updateUserRole(entry.uid, event.target.value as AdminRole)}
                                disabled={updatingRole === entry.uid}
                                className="w-full appearance-none rounded-lg border border-gray-700 bg-gray-800 py-1.5 pl-8 pr-3 text-xs text-gray-100 outline-none transition-colors hover:bg-gray-700 focus:border-purple-500 disabled:opacity-60"
                                aria-label={`עדכון הרשאה עבור ${entry.displayName || entry.email}`}
                              >
                                {ROLE_OPTIONS.map((option) => (
                                  <option key={`${entry.uid}-${option.value}`} value={option.value}>
                                    {roleLabel(option.value)}
                                  </option>
                                ))}
                              </select>
                              <ChevronDown className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-400" />
                            </div>
                          <div className="hidden">
                            {ROLE_OPTIONS.map((option) => {
                              const selected = entry.siteRole === option.value;
                              return (
                                <button
                                  key={`${entry.uid}-${option.value}`}
                                  onClick={() => void updateUserRole(entry.uid, option.value)}
                                  disabled={selected || updatingRole === entry.uid}
                                  className={`rounded-lg border px-2.5 py-1 text-xs transition-colors ${
                                    selected
                                      ? option.classes
                                      : 'border-gray-700 bg-gray-800 text-gray-300 hover:bg-gray-700'
                                  } ${updatingRole === entry.uid ? 'opacity-60' : ''}`}
                                >
                                  {updatingRole === entry.uid && !selected ? 'מעדכן…' : option.label}
                                </button>
                              );
                            })}
                          </div>
                          </>
                        )}
                      </td>
                    </tr>
                  ))}

                  {filteredUsers.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="px-5 py-12 text-center text-gray-500">
                        לא נמצאו משתמשים
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </div>
          <div className="space-y-4">
            <div className="rounded-2xl border border-gray-800 bg-gray-900 p-5">
              <div className="mb-4 flex items-center gap-2">
                <BarChart3 className="h-5 w-5 text-purple-400" />
                <h3 className="font-bold">אנשי קשר לפי מקצוע</h3>
              </div>
              <div className="space-y-3">
                {overview.contactsByDepartment.map((entry) => (
                  <div key={entry.key}>
                    <div className="mb-1 flex items-center justify-between text-xs">
                      <span className="text-gray-300">{entry.label}</span>
                      <span className="text-gray-500">{entry.count}</span>
                    </div>
                    <div className="h-1.5 overflow-hidden rounded-full bg-gray-800">
                      <div
                        className="h-full rounded-full bg-purple-500"
                        style={{ width: `${Math.max(6, Math.round((entry.count / Math.max(overview.stats.totalContacts, 1)) * 100))}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-2xl border border-gray-800 bg-gray-900 p-5">
              <div className="mb-4 flex items-center gap-2">
                <Contact2 className="h-5 w-5 text-blue-400" />
                <h3 className="font-bold">פילוח אולפן / קונטרול</h3>
              </div>
              <div className="space-y-2">
                {overview.contactsByWorkArea.map((entry) => (
                  <div key={entry.key} className="flex items-center justify-between rounded-xl bg-gray-800 px-3 py-2 text-sm">
                    <span className="text-gray-200">{entry.label}</span>
                    <span className="font-semibold text-white">{entry.count}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-2xl border border-gray-800 bg-gray-900 p-5">
              <div className="mb-4 flex items-center gap-2">
                <Wifi className="h-5 w-5 text-green-400" />
                <h3 className="font-bold">נוכחות בזמן אמת</h3>
              </div>
              <div className="space-y-3">
                {overview.onlineUsers.slice(0, 6).map((entry) => (
                  <div key={entry.uid} className="flex items-center justify-between rounded-xl bg-gray-800 px-3 py-2">
                    <div>
                      <p className="text-sm text-white">{entry.displayName || entry.email}</p>
                      <p className="text-xs text-gray-500">{safeProfileRoles(entry).join(', ') || safeProfileDepartments(entry).join(', ') || 'ללא תפקיד'}</p>
                    </div>
                    <span className="text-xs text-green-300">פעיל</span>
                  </div>
                ))}
                {overview.onlineUsers.length === 0 ? (
                  <p className="text-sm text-gray-500">אין כרגע מחוברים בטווח הנוכחות שנקבע.</p>
                ) : null}
                {overview.staleUsers.length > 0 ? (
                  <p className="text-xs text-orange-300">
                    {overview.staleUsers.length} משתמשים מסומנים כ־`isOnline`, אבל `lastSeen` שלהם כבר ישן.
                  </p>
                ) : null}
              </div>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
          <div className="rounded-2xl border border-gray-800 bg-gray-900 p-5 xl:col-span-1">
            <div className="mb-4 flex items-center gap-2">
              <Settings className="h-5 w-5 text-purple-400" />
              <h2 className="text-lg font-bold">בקרת מערכת</h2>
            </div>
            <div className="space-y-5">
              <div className="rounded-2xl border border-gray-800 bg-gray-950/70 p-4">
                <div className="mb-2 flex items-center justify-between">
                  <span className="text-sm font-medium">מצב תחזוקה</span>
                  <span className={`text-sm ${overview.appConfig.maintenanceMode ? 'text-orange-300' : 'text-gray-400'}`}>
                    {overview.appConfig.maintenanceMode ? 'פעיל' : 'כבוי'}
                  </span>
                </div>
                <p className="mb-3 text-xs leading-relaxed text-gray-500">
                  מצב התחזוקה נשמר במסמך `appConfig/global` ומוכן לשימוש גלובלי בכל האפליקציה.
                </p>
                <button
                  onClick={() => void saveAppConfig({ maintenanceMode: !overview.appConfig.maintenanceMode })}
                  disabled={savingConfig}
                  className={`w-full rounded-xl px-4 py-2 text-sm font-medium transition-colors ${
                    overview.appConfig.maintenanceMode
                      ? 'bg-orange-500/20 text-orange-200 hover:bg-orange-500/30'
                      : 'bg-gray-800 text-gray-200 hover:bg-gray-700'
                  } disabled:opacity-60`}
                >
                  {savingConfig ? 'שומר...' : overview.appConfig.maintenanceMode ? 'כבה תחזוקה' : 'הפעל תחזוקה'}
                </button>
              </div>

              <div className="rounded-2xl border border-gray-800 bg-gray-950/70 p-4">
                <div className="mb-2 flex items-center gap-2">
                  <Megaphone className="h-4 w-4 text-blue-400" />
                  <span className="text-sm font-medium">הודעה גלובלית</span>
                </div>
                <textarea
                  value={announcementDraft}
                  onChange={(event) => {
                    draftDirtyRef.current = true;
                    setAnnouncementDraft(event.target.value);
                  }}
                  rows={4}
                  placeholder="כתוב הודעה מערכתית ללוח..."
                  className="w-full resize-none rounded-xl border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-white placeholder-gray-500 focus:border-purple-500 focus:outline-none"
                />
                <button
                  onClick={() => void saveAppConfig({ boardAnnouncement: announcementDraft })}
                  disabled={savingConfig}
                  className="mt-3 w-full rounded-xl bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700 disabled:opacity-60"
                >
                  {savingConfig ? 'שומר...' : 'שמור הודעה'}
                </button>
              </div>

              <div className="rounded-2xl border border-blue-500/20 bg-blue-950/20 p-4">
                <div className="mb-3 flex items-center gap-2">
                  <Megaphone className="h-4 w-4 text-blue-300" />
                  <span className="text-sm font-medium">שליחת התראה לפעמון</span>
                </div>
                <div className="space-y-3">
                  <input
                    value={notificationTitle}
                    onChange={(event) => setNotificationTitle(event.target.value)}
                    maxLength={90}
                    placeholder="כותרת ההתראה"
                    className="w-full rounded-xl border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-white placeholder-gray-500 focus:border-blue-500 focus:outline-none"
                  />
                  <textarea
                    value={notificationMessage}
                    onChange={(event) => setNotificationMessage(event.target.value)}
                    rows={3}
                    maxLength={500}
                    placeholder="תוכן ההתראה"
                    className="w-full resize-none rounded-xl border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-white placeholder-gray-500 focus:border-blue-500 focus:outline-none"
                  />
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                    <select
                      value={NOTIFICATION_LINK_OPTIONS.some((option) => option.value === notificationLink) ? notificationLink : 'custom'}
                      onChange={(event) => {
                        if (event.target.value !== 'custom') {
                          setNotificationLink(event.target.value);
                        }
                      }}
                      className="rounded-xl border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-white focus:border-blue-500 focus:outline-none"
                    >
                      {NOTIFICATION_LINK_OPTIONS.map((option) => (
                        <option key={option.label} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                      <option value="custom">קישור מותאם אישית</option>
                    </select>
                    <input
                      value={notificationLink}
                      onChange={(event) => setNotificationLink(event.target.value)}
                      placeholder="/schedule#live"
                      dir="ltr"
                      className="w-full rounded-xl border border-gray-700 bg-gray-800 px-3 py-2 text-left text-sm text-white placeholder-gray-500 focus:border-blue-500 focus:outline-none"
                    />
                  </div>
                  <p className="text-xs text-gray-500">
                    בחר אזור באפליקציה או כתוב נתיב פנימי שמתחיל ב־`/`. לחיצה על ההתראה תוביל לשם ותסמן אותה כנקראה.
                  </p>
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                    <select
                      value={notificationTarget}
                      onChange={(event) => setNotificationTarget(event.target.value as NotificationTarget)}
                      className="rounded-xl border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-white focus:border-blue-500 focus:outline-none"
                    >
                      <option value="test">בדיקה לעצמי</option>
                      <option value="user">משתמש ספציפי</option>
                      <option value="all">כל המשתמשים</option>
                      <option value="incomplete_profile">משתמשים עם פרופיל חסר</option>
                    </select>
                    {notificationTarget === 'user' ? (
                      <select
                        value={notificationTargetUserId}
                        onChange={(event) => setNotificationTargetUserId(event.target.value)}
                        className="rounded-xl border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-white focus:border-blue-500 focus:outline-none"
                      >
                        <option value="">בחר משתמש</option>
                        {overview.users.map((entry) => (
                          <option key={entry.uid} value={entry.uid}>
                            {entry.displayName || entry.email}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <div className="rounded-xl border border-gray-800 bg-gray-900 px-3 py-2 text-xs text-gray-400">
                        {notificationTarget === 'all'
                          ? 'יישלח לכל המשתמשים הקיימים'
                          : notificationTarget === 'incomplete_profile'
                          ? 'יישלח למשתמשים ללא שם צוות'
                          : 'יישלח רק למנהל המחובר'}
                      </div>
                    )}
                  </div>
                  <label className="flex cursor-pointer items-center gap-2 rounded-xl border border-gray-700 bg-gray-800/50 px-3 py-2">
                    <input
                      type="checkbox"
                      checked={sendPush}
                      onChange={(e) => setSendPush(e.target.checked)}
                      className="h-4 w-4 rounded border-gray-600 bg-gray-700 accent-blue-500"
                    />
                    <span className="text-sm text-gray-300">שלח גם כהודעת Push למובייל</span>
                  </label>
                  <button
                    onClick={() => void sendAdminNotification()}
                    disabled={sendingNotification}
                    className="w-full rounded-xl bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700 disabled:opacity-60"
                  >
                    {sendingNotification ? 'שולח התראה...' : 'שלח התראה'}
                  </button>
                </div>
              </div>

              <div className="rounded-2xl border border-gray-800 bg-gray-950/70 p-4">
                <div className="mb-3 flex items-center gap-2">
                  <Wrench className="h-4 w-4 text-purple-400" />
                  <span className="text-sm font-medium">פעולות מהירות</span>
                </div>
                <div className="space-y-2">
                  <button
                    onClick={() => void runContactsSync()}
                    disabled={runningSync}
                    className="w-full rounded-xl bg-purple-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-purple-700 disabled:opacity-60"
                  >
                    {runningSync ? 'מריץ סנכרון...' : 'סנכרון אנשי קשר עכשיו'}
                  </button>
                  <Link
                    href="/directory"
                    className="flex w-full items-center justify-between rounded-xl bg-gray-800 px-4 py-2 text-sm text-gray-200 transition-colors hover:bg-gray-700"
                  >
                    אלפון אנשי קשר
                    <ArrowLeft className="h-4 w-4" />
                  </Link>
                  <Link
                    href="/admin/sync"
                    className="flex w-full items-center justify-between rounded-xl bg-gray-800 px-4 py-2 text-sm text-gray-200 transition-colors hover:bg-gray-700"
                  >
                    מרכז סנכרון
                    <ArrowLeft className="h-4 w-4" />
                  </Link>
                  <Link
                    href="/admin/industry-master"
                    className="flex w-full items-center justify-between rounded-xl bg-violet-900/50 px-4 py-2 text-sm text-violet-200 transition-colors hover:bg-violet-800/60"
                  >
                    מנהל הפקות מאוחד
                    <Database className="h-4 w-4" />
                  </Link>
                </div>
              </div>
            </div>
          </div>
          <div className="rounded-2xl border border-gray-800 bg-gray-900 p-5 xl:col-span-1">
            <div className="mb-4 flex items-center gap-2">
              <Activity className="h-5 w-5 text-green-400" />
              <h2 className="text-lg font-bold">בריאות מערכת ונתיבים</h2>
            </div>
            <div className="space-y-3">
              {overview.usage.routeHealth.map((route) => (
                <div key={route.key} className="rounded-xl border border-gray-800 bg-gray-950/70 p-3">
                  <div className="mb-1 flex items-center justify-between gap-3">
                    <span className="truncate text-sm text-white">{route.label}</span>
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs ${
                        route.lastError ? 'bg-red-500/10 text-red-300' : 'bg-green-500/10 text-green-300'
                      }`}
                    >
                      {route.lastError ? 'דורש טיפול' : 'תקין'}
                    </span>
                  </div>
                  <p className="text-xs text-gray-500">
                    הצלחות: {route.successCount} • כשלים: {route.failureCount}
                  </p>
                  <p className="mt-1 text-xs text-gray-500">
                    ריצה אחרונה: {formatRelativeTime(route.lastRunAt)}
                  </p>
                  {route.lastError ? <p className="mt-2 text-xs text-red-300">{route.lastError}</p> : null}
                </div>
              ))}
              {overview.usage.routeHealth.length === 0 ? (
                <p className="text-sm text-gray-500">עדיין אין מדדי נתיבים. הם יתמלאו ככל שה־APIים יופעלו.</p>
              ) : null}
            </div>

            <div className="mt-6">
              <div className="mb-4 flex items-center gap-2">
                <Wrench className="h-5 w-5 text-orange-400" />
                <h3 className="font-bold">סטטוס עבודות וסנכרונים</h3>
              </div>
              <div className="space-y-3">
                {overview.usage.jobs.map((job) => (
                  <div key={job.key} className="rounded-xl border border-gray-800 bg-gray-950/70 p-3">
                    <div className="mb-1 flex items-center justify-between gap-3">
                      <span className="text-sm text-white">{job.label}</span>
                      <span
                        className={`rounded-full px-2 py-0.5 text-xs ${
                          job.lastStatus === 'failure'
                            ? 'bg-red-500/10 text-red-300'
                            : job.lastStatus === 'success'
                              ? 'bg-green-500/10 text-green-300'
                              : 'bg-gray-700 text-gray-400'
                        }`}
                      >
                        {job.lastStatus === 'failure' ? 'נכשל' : job.lastStatus === 'success' ? 'תקין' : 'אין נתון'}
                      </span>
                    </div>
                    <p className="text-xs text-gray-500">
                      ריצות: {job.runs} • הצלחות: {job.successRuns} • כשלים: {job.failureRuns}
                    </p>
                    <p className="mt-1 text-xs text-gray-500">
                      ריצה אחרונה: {formatRelativeTime(job.lastRunAt)}
                    </p>
                    {job.lastError ? <p className="mt-2 text-xs text-red-300">{job.lastError}</p> : null}
                  </div>
                ))}
                {overview.usage.jobs.length === 0 ? (
                  <p className="text-sm text-gray-500">עדיין אין עבודות שנרשמו בטלמטריה.</p>
                ) : null}
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-gray-800 bg-gray-900 p-5 xl:col-span-1">
            <div className="mb-4 flex items-center gap-2">
              <BarChart3 className="h-5 w-5 text-blue-400" />
              <h2 className="text-lg font-bold">שימוש והתראות</h2>
            </div>

            <div className="mb-6">
              <h3 className="mb-3 text-sm font-semibold text-gray-300">דפים מובילים</h3>
              <div className="space-y-2">
                {overview.usage.topPages.map((page) => (
                  <button
                    key={page.key}
                    type="button"
                    onClick={() => void loadPageViewEvents({ key: page.key, label: page.label })}
                    className={`flex w-full items-center justify-between rounded-xl border px-3 py-2 text-right transition-colors ${
                      pageViewPanel.page?.key === page.key
                        ? 'border-blue-500/40 bg-blue-500/10'
                        : 'border-transparent bg-gray-950/70 hover:border-gray-700 hover:bg-gray-900'
                    }`}
                  >
                    <div>
                      <p className="text-sm text-white">{page.label}</p>
                      <p className="text-xs text-gray-500">{formatRelativeTime(page.lastSeenAt)}</p>
                    </div>
                    <span className="flex items-center gap-2 text-sm font-semibold text-blue-300">
                      <MousePointerClick className="h-4 w-4" />
                      {page.count}
                    </span>
                  </button>
                ))}
                {overview.usage.topPages.length === 0 ? (
                  <p className="text-sm text-gray-500">עדיין אין נתוני צפייה לדפים.</p>
                ) : null}
              </div>
              {pageViewPanel.page ? (
                <div className="mt-4 rounded-2xl border border-gray-800 bg-gray-950/80 p-3" dir="rtl">
                  <div className="mb-3 flex items-start justify-between gap-3">
                    <div>
                      <h4 className="text-sm font-bold text-white">צפיות בדף {pageViewPanel.page.label}</h4>
                      <p className="text-xs text-gray-500">משתמשים רשומים ואורחים, לפי הפעולות האחרונות שנקלטו</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setPageViewPanel({ page: null, events: [], loading: false, error: null })}
                      className="rounded-lg p-1 text-gray-500 transition-colors hover:bg-gray-800 hover:text-white"
                      aria-label="סגירת פרטי צפיות"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>

                  {pageViewPanel.loading ? (
                    <p className="py-3 text-sm text-gray-400">טוען צפיות אחרונות…</p>
                  ) : pageViewPanel.error ? (
                    <p className="rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-200">
                      {pageViewPanel.error}
                    </p>
                  ) : pageViewPanel.events.length === 0 ? (
                    <p className="py-3 text-sm text-gray-500">עדיין אין פירוט צפיות לדף הזה.</p>
                  ) : (
                    <div className="max-h-[420px] overflow-auto">
                      <table className="w-full min-w-[720px] text-right text-xs">
                        <thead className="sticky top-0 bg-gray-950 text-gray-400">
                          <tr>
                            <th className="px-2 py-2 font-medium">מי לחץ</th>
                            <th className="px-2 py-2 font-medium">מתי</th>
                            <th className="px-2 py-2 font-medium">IP</th>
                            <th className="px-2 py-2 font-medium">מיקום</th>
                            <th className="px-2 py-2 font-medium">מכשיר</th>
                            <th className="px-2 py-2 font-medium">מקור</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-800">
                          {pageViewPanel.events.map((event) => (
                            <tr key={event.id} className="align-top text-gray-300">
                              <td className="px-2 py-2">
                                <div className="font-medium text-white">{formatPageViewActor(event)}</div>
                                <div className={`mt-1 inline-flex rounded-full px-2 py-0.5 text-[10px] ${
                                  event.authenticated
                                    ? 'bg-green-500/10 text-green-300'
                                    : 'bg-orange-500/10 text-orange-300'
                                }`}>
                                  {event.authenticated ? 'רשום' : 'אורח'}
                                </div>
                              </td>
                              <td className="px-2 py-2 whitespace-nowrap">{formatRelativeTime(event.viewedAt)}</td>
                              <td className="px-2 py-2" dir="ltr">{event.ip || '—'}</td>
                              <td className="px-2 py-2">{formatPageViewLocation(event)}</td>
                              <td className="px-2 py-2">{formatPageViewDevice(event)}</td>
                              <td className="max-w-[180px] truncate px-2 py-2" dir="ltr" title={event.referrer || ''}>
                                {event.referrer || '—'}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              ) : null}
            </div>

            <div>
              <h3 className="mb-3 text-sm font-semibold text-gray-300">אירועים אחרונים</h3>
              <p className="mb-3 text-xs text-gray-500">
                אירועים דומים מאוחדים כדי לשמור על תמונה נקייה וברורה של תקלות ושינויים במערכת.
              </p>
              <div className="space-y-3">
                {overview.recentEvents.map((event) => (
                  <EventRow key={event.id} event={event} />
                ))}
                {overview.recentEvents.length === 0 ? (
                  <p className="text-sm text-gray-500">עדיין אין אירועי מערכת מתועדים.</p>
                ) : null}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Edit Profile Modal — rendered via portal to escape stacking context */}
    {editModal && createPortal(
      <div className="fixed inset-0 z-[99999] flex items-center justify-center bg-black/60 p-4">
        <div
          className="w-full max-w-md rounded-xl p-6 shadow-xl"
          style={{ background: 'var(--theme-bg-secondary)', border: '1px solid var(--theme-border)' }}
        >
          <h3 className="mb-4 text-lg font-bold" style={{ color: 'var(--theme-text-primary)' }}>
            ✏️ ערוך פרופיל
          </h3>
          <div className="flex flex-col gap-3">
            <label className="flex flex-col gap-1 text-xs" style={{ color: 'var(--theme-text-secondary)' }}>
              שם בעברית
              <input
                value={editModal.displayName}
                onChange={(e) => setEditModal((m) => m && { ...m, displayName: e.target.value })}
                dir="rtl"
                className="rounded-lg px-3 py-2 text-sm"
                style={{ background: 'var(--theme-bg-primary)', border: '1px solid var(--theme-border)', color: 'var(--theme-text-primary)' }}
              />
            </label>
            <label className="flex flex-col gap-1 text-xs" style={{ color: 'var(--theme-text-secondary)' }}>
              טלפון
              <input
                value={editModal.phone}
                onChange={(e) => setEditModal((m) => m && { ...m, phone: e.target.value })}
                dir="ltr"
                type="tel"
                className="rounded-lg px-3 py-2 text-sm"
                style={{ background: 'var(--theme-bg-primary)', border: '1px solid var(--theme-border)', color: 'var(--theme-text-primary)' }}
              />
            </label>
            <label className="flex flex-col gap-1 text-xs" style={{ color: 'var(--theme-text-secondary)' }}>
              מחלקות
              <select
                multiple
                value={stringArray(editModal.departments)}
                onChange={(e) => {
                  const departments = selectedOptionValues(e.currentTarget.selectedOptions);
                  setEditModal((m) => m && { ...m, departments, department: departments[0] || '' });
                }}
                className="min-h-28 rounded-lg px-3 py-2 text-sm"
                style={{ background: 'var(--theme-bg-primary)', border: '1px solid var(--theme-border)', color: 'var(--theme-text-primary)' }}
              >
                {INDUSTRY_DEPARTMENT_OPTIONS.map((d) => (
                  <option key={d} value={d}>{d}</option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-xs" style={{ color: 'var(--theme-text-secondary)' }}>
              תפקידים
              <select
                multiple
                value={stringArray(editModal.roles)}
                onChange={(e) => {
                  const roles = selectedOptionValues(e.currentTarget.selectedOptions);
                  setEditModal((m) => m && { ...m, roles, role: roles[0] || '' });
                }}
                dir="rtl"
                className="min-h-28 rounded-lg px-3 py-2 text-sm"
                style={{ background: 'var(--theme-bg-primary)', border: '1px solid var(--theme-border)', color: 'var(--theme-text-primary)' }}
              >
                {roleOptionsForEditor(editModal.roles).map((role) => (
                  <option key={role} value={role}>{role}</option>
                ))}
              </select>
            </label>
            {editModal.linkedContactId && (() => {
              const linked = availableContacts.find((c) => c.id === editModal.linkedContactId);
              const name = linked ? `${linked.firstName} ${linked.lastName}`.trim() : editModal.linkedContactId;
              return (
                <Link
                  href={`/directory?search=${encodeURIComponent(name)}`}
                  className="flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs transition-colors hover:opacity-80"
                  style={{ background: 'var(--theme-bg-primary)', border: '1px solid var(--theme-border)', color: 'var(--theme-text-secondary)' }}
                >
                  <span className="h-2 w-2 rounded-full bg-green-400 shrink-0" />
                  <span>מקושר כרגע אל:</span>
                  <span className="font-medium" style={{ color: 'var(--theme-text-primary)' }}>{name}</span>
                  <span className="mr-auto text-[10px] opacity-60">↗</span>
                </Link>
              );
            })()}
            {/* Contact picker — hidden behind toggle to keep modal compact */}
            {editModal.forceContactId ? (
              (() => {
                const sel = availableContacts.find((c) => c.id === editModal.forceContactId);
                return sel ? (
                  <div className="flex items-center justify-between rounded-lg px-3 py-2 text-xs"
                    style={{ background: 'var(--theme-accent)20', border: '1px solid var(--theme-accent)', color: 'var(--theme-text-primary)' }}>
                    <span>
                      {sel.department ? `[${sel.department}] ` : ''}
                      {`${sel.firstName} ${sel.lastName}`.trim()}
                      {sel.phone ? ` - ${sel.phone}` : ''}
                    </span>
                    <button
                      onClick={() => { setEditModal((m) => m && { ...m, forceContactId: '' }); setContactSearchTerm(''); setShowContactSearch(false); }}
                      className="mr-2 text-red-400 hover:text-red-300"
                    >✕</button>
                  </div>
                ) : null;
              })()
            ) : !showContactSearch ? (
              <button
                type="button"
                onClick={() => setShowContactSearch(true)}
                className="text-right text-xs text-blue-400 underline underline-offset-2 hover:text-blue-300"
              >
                🔗 קשר לאיש קשר אחר / שנה קישור
              </button>
            ) : (
              <div className="flex flex-col gap-1 text-xs" style={{ color: 'var(--theme-text-secondary)' }}>
                <div className="flex items-center justify-between">
                  <span>קשר לאיש קשר קיים</span>
                  <button
                    onClick={() => { setShowContactSearch(false); setContactSearchTerm(''); }}
                    className="text-xs text-red-400 hover:text-red-300"
                  >ביטול</button>
                </div>
                <input
                  value={contactSearchTerm}
                  onChange={(e) => setContactSearchTerm(e.target.value)}
                  placeholder="חפש לפי שם או טלפון..."
                  dir="rtl"
                  className="rounded-lg px-3 py-2 text-sm"
                  style={{ background: 'var(--theme-bg-primary)', border: '1px solid var(--theme-border)', color: 'var(--theme-text-primary)' }}
                />
                <div className="max-h-40 overflow-y-auto rounded-lg"
                  style={{ border: '1px solid var(--theme-border)', background: 'var(--theme-bg-primary)' }}>
                  {(() => {
                    const term = contactSearchTerm.trim().toLowerCase();
                    const filtered = availableContacts
                      .filter((c) => {
                        if (!term) return true;
                        const fullName = `${c.firstName} ${c.lastName}`.toLowerCase();
                        return fullName.includes(term) || c.phone.includes(term);
                      })
                      .sort((a, b) =>
                        `${a.firstName} ${a.lastName}`.localeCompare(`${b.firstName} ${b.lastName}`, 'he'),
                      );
                    if (!filtered.length) {
                      return <p className="px-3 py-2 text-xs text-gray-500">לא נמצאו תוצאות</p>;
                    }
                    return filtered.map((c) => (
                      <button
                        key={c.id}
                        type="button"
                        onClick={() => { setEditModal((m) => m && { ...m, forceContactId: c.id }); setShowContactSearch(false); setContactSearchTerm(''); }}
                        className="block w-full px-3 py-2 text-right text-xs transition-colors hover:bg-white/5"
                        style={{ color: 'var(--theme-text-primary)' }}
                      >
                        {c.department ? <span className="ml-1 text-gray-400">[{c.department}]</span> : null}
                        {`${c.firstName} ${c.lastName}`.trim()}
                        {c.phone ? <span className="mr-2 text-gray-400 text-[10px]"> - {c.phone}</span> : null}
                      </button>
                    ));
                  })()}
                </div>
              </div>
            )}
          </div>
          <div className="mt-5 flex justify-end gap-2">
            <button
              onClick={() => setEditModal(null)}
              className="rounded-lg px-4 py-2 text-sm"
              style={{ background: 'var(--theme-bg-primary)', color: 'var(--theme-text-secondary)' }}
            >
              ביטול
            </button>
            <button
              onClick={() => void handleEditSave()}
              disabled={editSaving}
              className="rounded-lg px-4 py-2 text-sm font-medium disabled:opacity-50"
              style={{ background: 'var(--theme-accent)', color: 'white' }}
            >
              {editSaving ? 'שומר...' : 'שמור'}
            </button>
          </div>
        </div>
      </div>,
      document.body,
    )}
    </div>
  );
}
