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
  Bell,
  BellOff,
  CheckCircle,
  ChevronDown,
  Clapperboard,
  Contact2,
  Crown,
  Database,
  FileText,
  Cloud,
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
import type { AdminLoginMethod, AdminOverview, AdminRole, AdminUserSummary, ContactDiscovery, JobStatusMetric, PageViewEvent, SystemEventRecord } from '@/lib/adminTypes';
import { INDUSTRY_DEPARTMENT_OPTIONS, INDUSTRY_ROLE_OPTIONS } from '@/constants/departments';
import { normalizeProfessionalFields, stringArray } from '@/lib/professionalFields';
import { db } from '@/lib/firebase';
import { doc, onSnapshot } from 'firebase/firestore';

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

const APP_VERSION = '2.6.0';
const RATINGS_MIDRUG_JOB = 'ratings-midrug-scrape';
const RATINGS_TELEGRAM_JOB = 'ratings-telegram-scopt';

type RatingsJobLive = Pick<
  JobStatusMetric,
  'key' | 'lastRunAt' | 'lastSuccessAt' | 'lastStatus' | 'lastError' | 'lastMessage' | 'lastDetail'
>;

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
    ratingsAutomation: {
      midrugEnabled: true,
      telegramEnabled: true,
      weeklyMode: 'sunday',
      cronSchedule: '0 6 * * *',
      cronTimezone: 'UTC',
    },
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

function addUniqueValue(values: string[], value: string): string[] {
  const cleaned = value.replace(/\s+/g, ' ').trim();
  if (!cleaned) return values;
  return Array.from(new Set([...stringArray(values), cleaned]));
}

function removeValue(values: string[], value: string): string[] {
  return stringArray(values).filter((item) => item !== value);
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
    <div className="flex items-center gap-3 rounded-2xl border border-gray-800/80 bg-gray-900 p-3 sm:p-4 hover:border-gray-700 transition-colors">
      <div className={`flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl ${color}`}>
        <Icon className="h-5 w-5" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-xl font-bold tabular-nums text-white sm:text-2xl">{value.toLocaleString()}</p>
        <p className="mt-0.5 truncate text-[11px] leading-tight text-gray-400">{label}</p>
      </div>
      {live ? <span className="h-2 w-2 flex-shrink-0 animate-pulse rounded-full bg-green-400" /> : null}
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

function jobStatusLabel(status: JobStatusMetric['lastStatus'] | string | null | undefined): string {
  if (status === 'running') return 'רץ עכשיו';
  if (status === 'success') return 'תקין';
  if (status === 'failure') return 'נכשל';
  return 'אין נתון';
}

function jobStatusClass(status: JobStatusMetric['lastStatus'] | string | null | undefined): string {
  if (status === 'running') return 'text-yellow-300';
  if (status === 'success') return 'text-green-300';
  if (status === 'failure') return 'text-red-300';
  return 'text-gray-300';
}

function parseJobDetail(detail: string | null | undefined): Record<string, unknown> | null {
  if (!detail) return null;
  try {
    const parsed = JSON.parse(detail);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed as Record<string, unknown> : null;
  } catch {
    return null;
  }
}

function formatJobDetailLine(key: string, value: unknown): string | null {
  if (value === null || value === undefined || value === '') return null;
  if (Array.isArray(value)) return `${key}: ${value.join(' → ')}`;
  if (typeof value === 'object') return null;
  const labels: Record<string, string> = {
    source: 'מקור',
    trigger: 'טריגר',
    startedAt: 'התחיל',
    completedAt: 'הסתיים',
    failedAt: 'נכשל ב',
    dailyDate: 'תאריך יומי',
    date: 'תאריך',
    dailyRows: 'שורות יומיות',
    rows: 'שורות',
    fallbackUsed: 'Fallback',
    dailyMatched: 'התאמות',
    dailyUnmatched: 'ללא התאמה',
    weeklyRows: 'שורות שבועיות',
    weeklyRange: 'שבוע',
    sourceMessageId: 'הודעת Telegram',
    htmlLength: 'אורך HTML',
    hasTable: 'נמצאה טבלה',
    hasRows: 'נמצאו שורות',
    error: 'שגיאה',
    warning: 'אזהרה',
  };
  const label = labels[key] || key;
  const display = typeof value === 'boolean' ? (value ? 'כן' : 'לא') : String(value);
  return `${label}: ${display}`;
}

function RatingsJobCard({
  title,
  description,
  job,
  action,
  running,
  icon,
  tone = 'purple',
}: {
  title: string;
  description: string;
  job: RatingsJobLive | JobStatusMetric | null;
  action: ReactNode;
  running: boolean;
  icon: ReactNode;
  tone?: 'purple' | 'sky';
}) {
  const detail = parseJobDetail(job?.lastDetail || job?.lastError);
  const lines = detail
    ? Object.entries(detail)
      .map(([key, value]) => formatJobDetailLine(key, value))
      .filter(Boolean)
      .slice(0, 8) as string[]
    : [];
  const borderClass = tone === 'sky' ? 'border-sky-500/30 bg-sky-500/5' : 'border-purple-500/30 bg-purple-500/5';

  return (
    <div className={`rounded-2xl border ${borderClass} p-4`}>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            {icon}
            <h3 className="text-base font-bold text-white">{title}</h3>
          </div>
          <p className="mt-1 text-xs leading-relaxed text-gray-400">{description}</p>
        </div>
        {action}
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        <div className="rounded-xl border border-gray-800 bg-gray-950/70 p-3">
          <p className="text-xs text-gray-500">סנכרון מוצלח אחרון</p>
          <p className="mt-1 text-sm font-semibold text-white">
            {job?.lastSuccessAt ? formatRelativeTime(job.lastSuccessAt) : 'אין נתון'}
          </p>
        </div>
        <div className="rounded-xl border border-gray-800 bg-gray-950/70 p-3">
          <p className="text-xs text-gray-500">סטטוס</p>
          <p className={`mt-1 flex items-center gap-1 text-sm font-semibold ${jobStatusClass(job?.lastStatus)}`}>
            {(running || job?.lastStatus === 'running') && <RefreshCw className="h-3 w-3 animate-spin" />}
            {running ? 'רץ עכשיו' : jobStatusLabel(job?.lastStatus)}
          </p>
        </div>
        <div className="rounded-xl border border-gray-800 bg-gray-950/70 p-3">
          <p className="text-xs text-gray-500">הרצה אחרונה</p>
          <p className="mt-1 text-sm font-semibold text-white">
            {job?.lastRunAt ? formatRelativeTime(job.lastRunAt) : 'אין נתון'}
          </p>
        </div>
      </div>

      {(job?.lastMessage || lines.length || job?.lastError) ? (
        <div className="mt-3 rounded-xl border border-gray-800 bg-gray-950/60 p-3 text-xs text-gray-300">
          {job?.lastMessage ? <p className="mb-2 font-semibold text-gray-200">{job.lastMessage}</p> : null}
          {lines.length ? (
            <div className="grid gap-1 sm:grid-cols-2" dir="rtl">
              {lines.map((line) => (
                <span key={line} className="rounded-lg bg-white/5 px-2 py-1">{line}</span>
              ))}
            </div>
          ) : null}
          {job?.lastError && !detail ? <p className="mt-2 text-red-200" dir="ltr">{job.lastError}</p> : null}
        </div>
      ) : null}
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
  const [runningFirebaseSync, setRunningFirebaseSync] = useState(false);
  const [runningTelegramSync, setRunningTelegramSync] = useState(false);
  const [runningRatingsIngest, setRunningRatingsIngest] = useState(false);
  const [ratingsJobsLive, setRatingsJobsLive] = useState<Record<string, RatingsJobLive>>({});
  const [showManualPaste, setShowManualPaste] = useState(false);
  const [manualHtml, setManualHtml] = useState('');
  const [manualDailyText, setManualDailyText] = useState('');
  const [manualWeeklyText, setManualWeeklyText] = useState('');
  const [manualWeeklyRange, setManualWeeklyRange] = useState('');
  const [submittingManualText, setSubmittingManualText] = useState(false);
  const [fixingWeekId, setFixingWeekId] = useState(false);
  const [fullSyncRunning, setFullSyncRunning] = useState(false);
  const [fullSyncStep, setFullSyncStep] = useState('');
  const [showAddContact, setShowAddContact] = useState(false);
  const [addingContact, setAddingContact] = useState(false);
  const [newContact, setNewContact] = useState({ name: '', phone: '', role: '', department: '' });
  const [proCardDebug, setProCardDebug] = useState<Record<string, unknown> | null>(null);
  const [testingProCard, setTestingProCard] = useState(false);
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
    customRole: string;
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
          uid: editModal.uid,
          displayName: editModal.displayName,
          phone: editModal.phone,
          departments: stringArray(editModal.departments),
          roles: stringArray(editModal.roles),
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

  useEffect(() => {
    if (!user || !isAdmin) return;
    const jobKeys = [RATINGS_MIDRUG_JOB, RATINGS_TELEGRAM_JOB, 'ratings-scrape'];
    const unsubscribers = jobKeys.map((jobKey) => onSnapshot(doc(db, 'adminMetrics', `job-${jobKey}`), (snap) => {
      if (!snap.exists()) return;
      const d = snap.data();
      setRatingsJobsLive((prev) => ({
        ...prev,
        [jobKey]: {
          key: jobKey,
          lastRunAt: (d.lastRunAt as string) ?? null,
          lastSuccessAt: (d.lastSuccessAt as string) ?? null,
          lastStatus: (d.lastStatus as JobStatusMetric['lastStatus']) ?? null,
          lastError: (d.lastError as string) ?? null,
          lastMessage: (d.lastMessage as string) ?? null,
          lastDetail: (d.lastDetail as string) ?? null,
        },
      }));
    }));
    return () => {
      unsubscribers.forEach((unsubscribe) => unsubscribe());
    };
  }, [user, isAdmin]);

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

  async function saveAppConfig(next: {
    maintenanceMode?: boolean;
    boardAnnouncement?: string;
    ratingsAutomation?: Partial<AdminOverview['appConfig']['ratingsAutomation']>;
  }) {
    setSavingConfig(true);
    try {
      const ratingsAutomation = {
        ...overview.appConfig.ratingsAutomation,
        ...(next.ratingsAutomation || {}),
      };
      const payload = {
        maintenanceMode:
          typeof next.maintenanceMode === 'boolean'
            ? next.maintenanceMode
            : overview.appConfig.maintenanceMode,
        boardAnnouncement:
          typeof next.boardAnnouncement === 'string'
            ? next.boardAnnouncement
            : announcementDraft,
        ratingsAutomation,
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

  async function runFirebaseRatingsSync() {
    setRunningFirebaseSync(true);
    try {
      const result = await fetchWithAuth<{ daily?: { rows?: number; date?: string }; weekly?: { rows?: number; weekRange?: string } | null }>(
        '/api/admin/ratings-sync/firebase', { method: 'POST' },
      );
      const weeklyMsg = result.weekly ? ` | שבועי: ${result.weekly.rows} שורות (${result.weekly.weekRange ?? ''})` : '';
      showToast('ok', `עודכן: ${result.daily?.rows ?? '?'} שורות (${result.daily?.date ?? ''})${weeklyMsg}`);
      await loadOverview(true);
    } catch (err) {
      showToast('err', err instanceof Error ? err.message : 'שגיאה בסנכרון');
    } finally {
      setRunningFirebaseSync(false);
    }
  }

  async function resetMidrugJobStatus() {
    try {
      await fetchWithAuth('/api/admin/ratings-sync/firebase', { method: 'DELETE' });
      showToast('ok', 'סטטוס אופס');
    } catch (err) {
      showToast('err', err instanceof Error ? err.message : 'שגיאה באיפוס');
    }
  }

  async function runRatingsSync() {
    return runFirebaseRatingsSync();
  }

  async function saveRatingsAutomation(next: Partial<AdminOverview['appConfig']['ratingsAutomation']>) {
    await saveAppConfig({
      ratingsAutomation: {
        ...overview.appConfig.ratingsAutomation,
        ...next,
      },
    });
  }

  async function runTelegramRatingsSync() {
    setRunningTelegramSync(true);
    try {
      const result = await fetchWithAuth<{ daily?: { rows?: number }; sourceMessageId?: string }>(
        '/api/admin/ratings-sync/telegram',
        { method: 'POST' },
      );
      showToast('ok', `Scopt Telegram עודכן: ${result.daily?.rows || 0} שורות${result.sourceMessageId ? `, הודעה ${result.sourceMessageId}` : ''}`);
      await loadOverview(true);
    } catch (syncError) {
      showToast('err', syncError instanceof Error ? syncError.message : 'משיכת Scopt Telegram נכשלה');
    } finally {
      setRunningTelegramSync(false);
    }
  }

  async function submitManualHtml() {
    if (!manualHtml.trim()) return;
    setRunningRatingsIngest(true);
    try {
      const ingestResult = await fetchWithAuth<{ daily?: { rows?: number } }>(
        '/api/admin/ratings-ingest',
        { method: 'POST', body: JSON.stringify({ dailyHtml: manualHtml }) },
      );
      const rows = ingestResult.daily?.rows || 0;
      if (rows === 0) {
        showToast('err', 'לא נמצאו שורות בטבלה. ודא שהדבקת את קוד המקור של הדף.');
        return;
      }
      showToast('ok', `ייבוא ידני הושלם: ${rows} תוכניות`);
      setShowManualPaste(false);
      setManualHtml('');
      await loadOverview(true);
    } catch (error) {
      showToast('err', error instanceof Error ? error.message : 'שגיאה בייבוא');
    } finally {
      setRunningRatingsIngest(false);
    }
  }

  function parseMidrugText(text: string) {
    return text.split('\n')
      .filter(line => /^\d+\t/.test(line.trim()))
      .map(line => {
        const cols = line.trim().split('\t');
        const rank = parseInt(cols[0]);
        const showName = (cols[1] || '').trim();
        const channel = (cols[2] || '').trim();
        const rawDate = (cols[4] || '').trim();
        const m = rawDate.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
        const date = m ? `${m[3]}-${m[2]}-${m[1]}` : '';
        const duration = parseInt(cols[5] || '0') || 0;
        const ratingPercent = parseFloat(cols[6] || '0') || 0;
        return { rank, showName, channel, date, duration, ratingPercent };
      })
      .filter(r => r.rank > 0 && r.showName && r.channel);
  }

  async function fixWeeklyDocId(oldWeekId: string, newWeekId: string, weekRange: string) {
    setFixingWeekId(true);
    try {
      await fetchWithAuth('/api/admin/ratings-sync/manual', {
        method: 'PATCH',
        body: JSON.stringify({ oldWeekId, newWeekId, weekRange }),
      });
      showToast('ok', `שבוע תוקן: week-${oldWeekId} → week-${newWeekId}`);
      await loadOverview(true);
    } catch (error) {
      showToast('err', error instanceof Error ? error.message : 'שגיאה בתיקון');
    } finally {
      setFixingWeekId(false);
    }
  }

  async function submitManualText() {
    const dailyRows = manualDailyText.trim() ? parseMidrugText(manualDailyText) : [];
    const weeklyRows = manualWeeklyText.trim() ? parseMidrugText(manualWeeklyText) : [];
    if (dailyRows.length === 0 && weeklyRows.length === 0) {
      showToast('err', 'לא נמצאו שורות — ודא שהדבקת טקסט טבלה מהאתר');
      return;
    }
    setSubmittingManualText(true);
    try {
      if (dailyRows.length > 0) {
        const date = dailyRows.find(r => r.date)?.date || '';
        const res = await fetchWithAuth<{ rows?: number; matched?: number }>(
          '/api/admin/ratings-sync/manual',
          { method: 'POST', body: JSON.stringify({ type: 'daily', date, rows: dailyRows }) },
        );
        showToast('ok', `יומי נשמר: ${res.rows} תוכניות, ${res.matched} הותאמו`);
      }
      if (weeklyRows.length > 0) {
        const weekId = manualWeeklyRange.match(/(\d+)\/(\d{4})/)?.[0]?.replace('/', '-') || 'manual';
        const res = await fetchWithAuth<{ rows?: number; matched?: number }>(
          '/api/admin/ratings-sync/manual',
          { method: 'POST', body: JSON.stringify({ type: 'weekly', weekId, weekRange: manualWeeklyRange || weekId, rows: weeklyRows }) },
        );
        showToast('ok', `שבועי נשמר: ${res.rows} תוכניות, ${res.matched} הותאמו`);
      }
      setShowManualPaste(false);
      setManualDailyText('');
      setManualWeeklyText('');
      setManualWeeklyRange('');
      await loadOverview(true);
    } catch (error) {
      showToast('err', error instanceof Error ? error.message : 'שגיאה בשמירה');
    } finally {
      setSubmittingManualText(false);
    }
  }


  async function runFullSync() {
    if (!window.confirm('להריץ סנכרון מלא?\n\nשלב 1: מיגרציית הפקות → global_productions\nשלב 2: סנכרון אנשי קשר מלוחות עבודה\n\nתהליך זה יעדכן את ה-Pro Cards ואת רשימת אנשי הקשר.')) return;
    setFullSyncRunning(true);
    const results: string[] = [];
    try {
      setFullSyncStep('בודק הפקות...');
      const dryResult = await fetchWithAuth<{
        unique?: number; total?: number; existingGlobalCount?: number;
      }>(
        '/api/admin/migrate-global-productions',
        { method: 'POST', body: JSON.stringify({ dryRun: true }) },
      );

      const newProductions = (dryResult.unique || 0) - (dryResult.existingGlobalCount || 0);
      if (newProductions > 0 || (dryResult.unique || 0) > 0) {
        setFullSyncStep(`מעתיק ${dryResult.unique || 0} הפקות...`);
        const migResult = await fetchWithAuth<{ written?: number; skipped?: number; errors?: string[] }>(
          '/api/admin/migrate-global-productions',
          { method: 'POST', body: JSON.stringify({ dryRun: false }) },
        );
        results.push(`הפקות: ${migResult.written || 0} נכתבו`);
        if ((migResult.errors?.length || 0) > 0) results.push(`שגיאות: ${migResult.errors!.length}`);
      } else {
        results.push('הפקות: כבר מעודכן');
      }

      setFullSyncStep('מסנכרן אנשי קשר...');
      const syncResult = await fetchWithAuth<{ created?: number; updated?: number; deletedDuplicates?: number }>(
        '/api/admin/contacts-sync',
        { method: 'POST' },
      );
      results.push(`אנשי קשר: ${syncResult.created || 0} חדשים, ${syncResult.updated || 0} עודכנו`);

      showToast('ok', results.join(' | '));
      await loadOverview(true);
    } catch (err) {
      showToast('err', err instanceof Error ? err.message : 'שגיאה בסנכרון');
    } finally {
      setFullSyncRunning(false);
      setFullSyncStep('');
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
            records: [{ name: newContact.name.trim(), phone: newContact.phone.trim(), role: newContact.role.trim() || 'לא צוין', department: newContact.department.trim() || undefined }],
          }),
        },
      );
      showToast('ok', `${result.created ? 'נוצר' : result.updated ? 'עודכן' : 'כבר קיים'}: ${newContact.name}`);
      setNewContact({ name: '', phone: '', role: '', department: '' });
      setShowAddContact(false);
      await loadOverview(true);
    } catch (addError) {
      showToast('err', addError instanceof Error ? addError.message : 'שגיאה בהוספת איש קשר');
    } finally {
      setAddingContact(false);
    }
  }

  async function runDirectorsImport() {
    if (!window.confirm('לייבא את רשימת הבמאים לאלפון?')) return;
    setFullSyncRunning(true);
    setFullSyncStep('מייבא במאים...');
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
      setFullSyncRunning(false);
      setFullSyncStep('');
    }
  }

  async function testProCard() {
    setTestingProCard(true);
    setProCardDebug(null);
    try {
      const contactId = profile?.linkedContactId || profile?.uid || user?.uid || 'me';
      const result = await fetchWithAuth<Record<string, unknown>>(
        `/api/directory/pro-card-history?contactId=${encodeURIComponent(String(contactId))}&debug=1`,
      );
      setProCardDebug(result);
      const credits = Array.isArray(result.productionCredits) ? result.productionCredits.length : 0;
      showToast(credits > 0 ? 'ok' : 'err', `Pro Card: ${credits} הפקות נמצאו`);
    } catch (err) {
      setProCardDebug({ error: err instanceof Error ? err.message : String(err) });
      showToast('err', err instanceof Error ? err.message : 'שגיאה בבדיקה');
    } finally {
      setTestingProCard(false);
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

  const midrugRatingsJob = ratingsJobsLive[RATINGS_MIDRUG_JOB]
    ?? overview.usage.jobs.find((job) => job.key === RATINGS_MIDRUG_JOB)
    ?? overview.usage.jobs.find((job) => job.key === 'ratings-scrape')
    ?? null;
  const telegramRatingsJob = ratingsJobsLive[RATINGS_TELEGRAM_JOB]
    ?? overview.usage.jobs.find((job) => job.key === RATINGS_TELEGRAM_JOB)
    ?? null;

  // 'running' in Firestore locks the button. Treat it as stale after 3 min
  // (Vercel timeout is 60s, Firebase function ~90s, so 3 min is generous).
  const midrugJobIsStale =
    midrugRatingsJob?.lastStatus === 'running' &&
    !!midrugRatingsJob.lastRunAt &&
    Date.now() - new Date(midrugRatingsJob.lastRunAt).getTime() > 3 * 60 * 1000;
  const midrugJobRunning =
    runningFirebaseSync ||
    (midrugRatingsJob?.lastStatus === 'running' && !midrugJobIsStale);

  const effectiveRatingsJob = midrugRatingsJob;
  const runningRatingsSync = runningFirebaseSync;

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
    <div className="min-h-screen overflow-x-hidden bg-gray-950 pb-16 text-white" dir="rtl">
      {toast ? (
        <div
          className={`fixed left-1/2 top-20 z-[9999] flex -translate-x-1/2 items-center gap-2 rounded-2xl px-5 py-3 text-sm font-medium shadow-xl ${
            toast.type === 'ok'
              ? 'border border-green-500/40 bg-green-900/95 text-green-300'
              : 'border border-red-500/40 bg-red-900/95 text-red-300'
          }`}
        >
          {toast.type === 'ok' ? <CheckCircle className="h-4 w-4" /> : <AlertTriangle className="h-4 w-4" />}
          {toast.msg}
        </div>
      ) : null}

      <div className="mx-auto max-w-7xl space-y-4 px-3 py-4 sm:space-y-6 sm:px-4 sm:py-8">
        {error ? (
          <div className="flex items-center gap-3 rounded-2xl border border-red-500/40 bg-red-900/30 p-4 text-red-300">
            <AlertTriangle className="h-5 w-5 flex-shrink-0" />
            <p className="flex-1 text-sm">{error}</p>
            <button onClick={() => setError(null)} className="text-lg leading-none text-red-200">
              ×
            </button>
          </div>
        ) : null}

        <div className="rounded-2xl border border-gray-800 bg-gray-900/60 p-4 sm:p-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <div className="mb-1.5 flex items-center gap-2.5">
              <ShieldCheck className="h-6 w-6 text-yellow-400" />
              <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">לוח ניהול</h1>
              <span className="h-2 w-2 animate-pulse rounded-full bg-green-400" />
              <span className="rounded-full border border-yellow-500/30 bg-yellow-500/10 px-2 py-0.5 text-xs font-bold text-yellow-300" dir="ltr">
                v{APP_VERSION}
              </span>
            </div>
            <p className="text-sm text-gray-400">
              עודכן {formatRelativeTime(overview.generatedAt)}{refreshing ? ' • מרענן…' : ''}
            </p>
            <div className="mt-3 flex flex-wrap gap-2 text-xs">
              <span className="rounded-full border border-gray-700 bg-gray-800 px-3 py-1 text-gray-300">
                {overview.stats.totalUsers} משתמשים
              </span>
              <span className="rounded-full border border-green-500/30 bg-green-500/10 px-3 py-1 text-green-300">
                {overview.stats.onlineNow} מחוברים
              </span>
              <span className="rounded-full border border-teal-500/30 bg-teal-500/10 px-3 py-1 text-teal-300">
                {overview.stats.active24h} פעילים ב-24ש
              </span>
              <span className="rounded-full border border-purple-500/30 bg-purple-500/10 px-3 py-1 text-purple-300">
                {overview.stats.totalContacts} אנשי קשר
              </span>
            </div>
          </div>
          {/* Actions */}
          <div className="flex flex-col gap-2">
            {/* Primary action */}
            <button
              onClick={() => void runFullSync()}
              disabled={fullSyncRunning || runningSync}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-purple-600 to-blue-600 px-4 py-2.5 text-sm font-bold shadow-lg shadow-purple-500/20 transition-all hover:from-purple-500 hover:to-blue-500 disabled:opacity-60 sm:w-auto"
            >
              {fullSyncRunning ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Database className="h-4 w-4" />}
              {fullSyncStep || 'סנכרון מלא'}
            </button>
            {/* Quick actions */}
            <div className="flex flex-wrap gap-1.5">
              <button onClick={() => void loadOverview(true)} className="flex items-center gap-1.5 rounded-xl bg-gray-800 px-3 py-1.5 text-xs text-gray-200 hover:bg-gray-700 transition-colors">
                <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? 'animate-spin' : ''}`} /> רענון
              </button>
              <button onClick={() => setShowAddContact(true)} className="flex items-center gap-1.5 rounded-xl bg-green-700/80 px-3 py-1.5 text-xs font-medium text-white hover:bg-green-600 transition-colors">
                <Contact2 className="h-3.5 w-3.5" /> + איש קשר
              </button>
              <button onClick={() => void runDirectorsImport()} disabled={fullSyncRunning} className="flex items-center gap-1.5 rounded-xl bg-rose-800/70 px-3 py-1.5 text-xs font-medium text-white hover:bg-rose-700 disabled:opacity-50 transition-colors">
                <Clapperboard className="h-3.5 w-3.5" /> ייבוא במאים
              </button>
              <button onClick={() => void testProCard()} disabled={testingProCard} className="flex items-center gap-1.5 rounded-xl border border-gray-700 bg-gray-800/60 px-3 py-1.5 text-xs text-gray-300 hover:bg-gray-700 disabled:opacity-50 transition-colors">
                <Search className="h-3.5 w-3.5" /> {testingProCard ? 'בודק...' : 'Pro Card'}
              </button>
            </div>
            {/* Navigation links */}
            <div className="flex flex-wrap gap-1.5">
              <Link href="/admin/users" className="flex items-center gap-1.5 rounded-xl border border-gray-700/60 px-3 py-1.5 text-xs text-gray-400 hover:border-gray-600 hover:text-gray-200 transition-colors">
                <Users className="h-3.5 w-3.5" /> משתמשים
              </Link>
              <Link href="/admin/industry-master" className="flex items-center gap-1.5 rounded-xl border border-gray-700/60 px-3 py-1.5 text-xs text-gray-400 hover:border-gray-600 hover:text-gray-200 transition-colors">
                <Database className="h-3.5 w-3.5" /> מנהל הפקות
              </Link>
              <Link href="/admin/sync" className="flex items-center gap-1.5 rounded-xl border border-gray-700/60 px-3 py-1.5 text-xs text-gray-400 hover:border-gray-600 hover:text-gray-200 transition-colors">
                <Settings className="h-3.5 w-3.5" /> כלי סנכרון
              </Link>
            </div>
          </div>
          </div>
        </div>

        {proCardDebug && (
          <div className="rounded-2xl border border-sky-500/30 bg-sky-500/5 p-4" dir="ltr">
            <div className="mb-2 flex items-center justify-between">
              <h3 className="text-sm font-bold text-sky-400">Pro Card Debug</h3>
              <button onClick={() => setProCardDebug(null)} className="text-xs text-gray-400 hover:text-white">✕</button>
            </div>
            <pre className="max-h-64 overflow-auto rounded-lg bg-black/40 p-3 text-xs text-gray-300 whitespace-pre-wrap">
              {JSON.stringify(proCardDebug, null, 2)}
            </pre>
          </div>
        )}

        <section className="rounded-2xl border border-gray-800 bg-gray-900/80 p-4 shadow-lg">
          <div className="mb-4 flex flex-col gap-2">
            <div className="flex items-center gap-2">
              <BarChart3 className="h-5 w-5 text-purple-300" />
              <h2 className="text-lg font-bold text-white">Ratings Automation</h2>
            </div>
            <p className="text-sm leading-relaxed text-gray-400">
              משיכת הנתונים מחולקת לשני מקורות עצמאיים: מדרוג הרשמי וערוץ Scopt בטלגרם. כל כפתור מפעיל רק את הטריגר שלו ומציג חיווי מפורט.
            </p>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <RatingsJobCard
              title="מדרוג רשמי"
              description="Firebase Cloud Function (me-west1 / ת״א) מושכת יומי + שבועי ישירות ממדרוג עם IP ישראלי."
              job={midrugRatingsJob}
              running={midrugJobRunning}
              icon={<BarChart3 className="h-4 w-4 text-purple-300" />}
              action={(
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => void runFirebaseRatingsSync()}
                    disabled={midrugJobRunning}
                    className="inline-flex items-center justify-center gap-2 rounded-xl bg-purple-600 px-4 py-2.5 text-sm font-bold text-white shadow-lg shadow-purple-500/20 transition-colors hover:bg-purple-500 disabled:opacity-60"
                  >
                    <Cloud className={`h-4 w-4 ${midrugJobRunning ? 'animate-pulse' : ''}`} />
                    {runningFirebaseSync ? 'שולח...' : 'סנכרן עכשיו'}
                  </button>
                  {midrugJobIsStale && (
                    <button
                      type="button"
                      onClick={() => void resetMidrugJobStatus()}
                      className="inline-flex items-center justify-center gap-1 rounded-xl border border-yellow-700 bg-yellow-900/30 px-3 py-2.5 text-xs font-bold text-yellow-300 transition-colors hover:bg-yellow-900/60"
                      title="הסטטוס תקוע — לחץ לאיפוס"
                    >
                      ⚠ אפס
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => setShowManualPaste((value) => !value)}
                    className="inline-flex items-center justify-center gap-2 rounded-xl border border-gray-700 bg-gray-900 px-3 py-2.5 text-xs font-bold text-gray-200 transition-colors hover:bg-gray-800"
                  >
                    <FileText className="h-4 w-4" />
                    ידני
                  </button>
                </div>
              )}
            />

            <RatingsJobCard
              title="Scopt Telegram"
              description="משיכת ההודעה האחרונה מערוץ Scopt בטלגרם ושמירת מדדי החדשות והפריים תחת אותו מסמך יומי."
              job={telegramRatingsJob}
              running={runningTelegramSync || telegramRatingsJob?.lastStatus === 'running'}
              tone="sky"
              icon={<MessageCircle className="h-4 w-4 text-sky-300" />}
              action={(
                <button
                  type="button"
                  onClick={() => void runTelegramRatingsSync()}
                  disabled={runningTelegramSync || telegramRatingsJob?.lastStatus === 'running'}
                  className="inline-flex items-center justify-center gap-2 rounded-xl bg-sky-600 px-4 py-2.5 text-sm font-bold text-white shadow-lg shadow-sky-500/20 transition-colors hover:bg-sky-500 disabled:opacity-60"
                >
                  <RefreshCw className={`h-4 w-4 ${(runningTelegramSync || telegramRatingsJob?.lastStatus === 'running') ? 'animate-spin' : ''}`} />
                  משוך מ-Scopt
                </button>
              )}
            />
          </div>

          {showManualPaste && (
            <div className="mt-4 rounded-xl border border-amber-500/30 bg-amber-500/5 p-4" dir="rtl" ref={(el) => el?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })}>
              <h3 className="mb-1 text-sm font-bold text-amber-300">ייבוא ידני ממדרוג</h3>
              <p className="mb-4 text-xs text-gray-400">
                פתח את <a href="https://midrug.safenet.co.il/app/" target="_blank" rel="noopener noreferrer" className="text-amber-300 underline">midrug.safenet.co.il/app</a>,
                סמן את שורות הטבלה (מ-1 עד 20/25), העתק והדבק כאן.
              </p>

              <div className="space-y-4">
                <div>
                  <label className="mb-1 block text-xs font-semibold text-gray-300">רייטינג יומי</label>
                  <textarea
                    value={manualDailyText}
                    onChange={(e) => setManualDailyText(e.target.value)}
                    placeholder={'1\tחדשות 12\tקשת 12\t19:50\t25/05/2026\t109\t10.1\t251\n2\tהבת\tקשת 12\t21:50\t25/05/2026\t58\t9.3\t231'}
                    dir="ltr"
                    className="w-full rounded-lg border border-gray-700 bg-gray-900 px-3 py-2 font-mono text-xs text-gray-300 placeholder:text-gray-600 focus:border-amber-500 focus:outline-none"
                    rows={5}
                  />
                  {manualDailyText.trim() && (
                    <p className="mt-1 text-xs text-gray-500">{parseMidrugText(manualDailyText).length} שורות זוהו</p>
                  )}
                </div>

                <div>
                  <label className="mb-1 block text-xs font-semibold text-gray-300">רייטינג שבועי <span className="font-normal text-gray-500">(אופציונלי)</span></label>
                  <textarea
                    value={manualWeeklyText}
                    onChange={(e) => setManualWeeklyText(e.target.value)}
                    placeholder={'1\tחתונה ממבט ראשון עונה 8\tקשת 12\t\t\t75\t13.4\t334\n2\tחדשות שבת 12\tקשת 12\tש\t23/05/2026\t96\t11\t276'}
                    dir="ltr"
                    className="w-full rounded-lg border border-gray-700 bg-gray-900 px-3 py-2 font-mono text-xs text-gray-300 placeholder:text-gray-600 focus:border-amber-500 focus:outline-none"
                    rows={5}
                  />
                  {manualWeeklyText.trim() && (
                    <p className="mt-1 text-xs text-gray-500">{parseMidrugText(manualWeeklyText).length} שורות זוהו</p>
                  )}
                  {manualWeeklyText.trim() && (
                    <input
                      type="text"
                      value={manualWeeklyRange}
                      onChange={(e) => setManualWeeklyRange(e.target.value)}
                      placeholder="מזהה שבוע — לדוגמה: 21/2026"
                      dir="ltr"
                      className="mt-2 w-full rounded-lg border border-gray-700 bg-gray-900 px-3 py-2 text-xs text-gray-300 placeholder:text-gray-600 focus:border-amber-500 focus:outline-none"
                    />
                  )}
                </div>
              </div>

              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => void submitManualText()}
                  disabled={(!manualDailyText.trim() && !manualWeeklyText.trim()) || submittingManualText}
                  className="rounded-lg bg-amber-600 px-4 py-2 text-xs font-bold text-white hover:bg-amber-500 disabled:opacity-50"
                >
                  {submittingManualText ? 'שומר...' : 'שמור'}
                </button>
                <button
                  type="button"
                  onClick={() => void fixWeeklyDocId('manual', '21-2026', '17/05/2026 – 23/05/2026')}
                  disabled={fixingWeekId}
                  className="rounded-lg border border-amber-700 bg-amber-900/30 px-4 py-2 text-xs font-bold text-amber-300 hover:bg-amber-900/60 disabled:opacity-50"
                  title="תקן את מסמך week-manual → week-21-2026"
                >
                  {fixingWeekId ? 'מתקן...' : 'תקן שבוע 21/2026'}
                </button>
                <button
                  type="button"
                  onClick={() => { setShowManualPaste(false); setManualDailyText(''); setManualWeeklyText(''); setManualWeeklyRange(''); }}
                  className="rounded-lg bg-gray-800 px-4 py-2 text-xs text-gray-300 hover:bg-gray-700"
                >
                  ביטול
                </button>
              </div>
            </div>
          )}

          <div className="mt-4 rounded-2xl border border-gray-800 bg-gray-950/60 p-4">
            <div className="mb-4 flex flex-col gap-1">
              <h3 className="text-sm font-bold text-white">הגדרות Cron</h3>
              <p className="text-xs leading-relaxed text-gray-400">
                ההגדרות כאן קובעות מה ירוץ בקריאת ה־cron היומית. בנוסף, GitHub Actions מאזין בחלון 09:00-09:20 ובודק כל דקה אם נכנסה הודעת Scopt חדשה.
              </p>
            </div>

            <div className="grid gap-3 md:grid-cols-3">
              <div className="rounded-xl border border-gray-800 bg-gray-900/70 p-3">
                <div className="mb-2 flex items-center justify-between gap-3">
                  <span className="text-sm font-semibold text-white">מדרוג</span>
                  <button
                    type="button"
                    onClick={() => void saveRatingsAutomation({ midrugEnabled: !overview.appConfig.ratingsAutomation.midrugEnabled })}
                    disabled={savingConfig}
                    className={`rounded-full px-3 py-1 text-xs font-bold transition-colors ${
                      overview.appConfig.ratingsAutomation.midrugEnabled
                        ? 'bg-green-500/20 text-green-200 hover:bg-green-500/30'
                        : 'bg-gray-800 text-gray-300 hover:bg-gray-700'
                    } disabled:opacity-60`}
                  >
                    {overview.appConfig.ratingsAutomation.midrugEnabled ? 'פעיל' : 'כבוי'}
                  </button>
                </div>
                <p className="text-xs leading-relaxed text-gray-500">כאשר כבוי, ה־cron ידלג על משיכת מדרוג. כפתור ידני עדיין יכול להריץ מדרוג לפי הצורך.</p>
              </div>

              <div className="rounded-xl border border-gray-800 bg-gray-900/70 p-3">
                <div className="mb-2 flex items-center justify-between gap-3">
                  <span className="text-sm font-semibold text-white">Scopt Telegram</span>
                  <button
                    type="button"
                    onClick={() => void saveRatingsAutomation({ telegramEnabled: !overview.appConfig.ratingsAutomation.telegramEnabled })}
                    disabled={savingConfig}
                    className={`rounded-full px-3 py-1 text-xs font-bold transition-colors ${
                      overview.appConfig.ratingsAutomation.telegramEnabled
                        ? 'bg-green-500/20 text-green-200 hover:bg-green-500/30'
                        : 'bg-gray-800 text-gray-300 hover:bg-gray-700'
                    } disabled:opacity-60`}
                  >
                    {overview.appConfig.ratingsAutomation.telegramEnabled ? 'פעיל' : 'כבוי'}
                  </button>
                </div>
                <p className="text-xs leading-relaxed text-gray-500">כאשר כבוי, ה־cron ידלג על Scopt. משיכה ידנית מהכפתור עדיין נשארת זמינה למנהל.</p>
              </div>

              <div className="rounded-xl border border-gray-800 bg-gray-900/70 p-3">
                <p className="mb-2 text-sm font-semibold text-white">רייטינג שבועי</p>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => void saveRatingsAutomation({ weeklyMode: 'sunday' })}
                    disabled={savingConfig}
                    className={`rounded-lg px-3 py-2 text-xs font-bold transition-colors ${
                      overview.appConfig.ratingsAutomation.weeklyMode === 'sunday'
                        ? 'bg-purple-600 text-white'
                        : 'bg-gray-800 text-gray-300 hover:bg-gray-700'
                    } disabled:opacity-60`}
                  >
                    רק בראשון
                  </button>
                  <button
                    type="button"
                    onClick={() => void saveRatingsAutomation({ weeklyMode: 'always' })}
                    disabled={savingConfig}
                    className={`rounded-lg px-3 py-2 text-xs font-bold transition-colors ${
                      overview.appConfig.ratingsAutomation.weeklyMode === 'always'
                        ? 'bg-purple-600 text-white'
                        : 'bg-gray-800 text-gray-300 hover:bg-gray-700'
                    } disabled:opacity-60`}
                  >
                    בכל ריצה
                  </button>
                </div>
                <p className="mt-2 text-xs leading-relaxed text-gray-500">הגדרה זו משפיעה על משיכות מדרוג אוטומטיות בלבד.</p>
              </div>
            </div>

            <div className="mt-3 grid gap-2 text-xs text-gray-400 sm:grid-cols-3">
              <span className="rounded-lg bg-white/5 px-3 py-2">Vercel schedule: <span dir="ltr">{overview.appConfig.ratingsAutomation.cronSchedule}</span></span>
              <span className="rounded-lg bg-white/5 px-3 py-2">Timezone: <span dir="ltr">{overview.appConfig.ratingsAutomation.cronTimezone}</span></span>
              <span className="rounded-lg bg-white/5 px-3 py-2">חלון חם: 09:00-09:20</span>
            </div>
          </div>

        </section>

        <section className="hidden rounded-2xl border border-purple-500/30 bg-purple-500/5 p-4">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div>
              <div className="mb-1 flex items-center gap-2">
                <BarChart3 className="h-5 w-5 text-purple-300" />
                <h2 className="text-lg font-bold text-white">Ratings Automation</h2>
              </div>
              <p className="text-sm text-gray-400">
                סנכרון אוטומטי של נתוני רייטינג יומי ושבועי ממערכת המדרוג.
              </p>
            </div>
            <button
              type="button"
              onClick={() => void runRatingsSync()}
              disabled={runningRatingsSync || effectiveRatingsJob?.lastStatus === 'running'}
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-purple-600 px-4 py-2.5 text-sm font-bold text-white transition-colors hover:bg-purple-500 disabled:opacity-60"
            >
              <RefreshCw className={`h-4 w-4 ${(runningRatingsSync || effectiveRatingsJob?.lastStatus === 'running') ? 'animate-spin' : ''}`} />
              {runningRatingsSync ? 'שולח...' : effectiveRatingsJob?.lastStatus === 'running' ? 'מריץ...' : 'Run Scraper Now'}
            </button>
          </div>
          <div className="mt-4 grid gap-3 md:grid-cols-3">
            <div className="rounded-xl border border-gray-800 bg-gray-950/70 p-3">
              <p className="text-xs text-gray-500">Last Successful Sync</p>
              <p className="mt-1 text-sm font-semibold text-white">
                {effectiveRatingsJob?.lastSuccessAt ? formatRelativeTime(effectiveRatingsJob.lastSuccessAt) : 'אין נתון'}
              </p>
            </div>
            <div className="rounded-xl border border-gray-800 bg-gray-950/70 p-3">
              <p className="text-xs text-gray-500">Status</p>
              <p className={`mt-1 flex items-center gap-1 text-sm font-semibold ${
                effectiveRatingsJob?.lastStatus === 'failure' ? 'text-red-300' :
                effectiveRatingsJob?.lastStatus === 'success' ? 'text-green-300' :
                effectiveRatingsJob?.lastStatus === 'running' ? 'text-yellow-300' : 'text-gray-300'
              }`}>
                {effectiveRatingsJob?.lastStatus === 'running' && <RefreshCw className="h-3 w-3 animate-spin" />}
                {effectiveRatingsJob?.lastStatus === 'failure' ? 'נכשל' :
                 effectiveRatingsJob?.lastStatus === 'success' ? 'תקין' :
                 effectiveRatingsJob?.lastStatus === 'running' ? 'מריץ...' : 'אין נתון'}
              </p>
            </div>
            <div className="rounded-xl border border-gray-800 bg-gray-950/70 p-3">
              <p className="text-xs text-gray-500">Last Run</p>
              <p className="mt-1 text-sm font-semibold text-white">
                {effectiveRatingsJob?.lastRunAt ? formatRelativeTime(effectiveRatingsJob.lastRunAt) : 'אין נתון'}
              </p>
            </div>
          </div>
          {effectiveRatingsJob?.lastError ? (
            <p className="mt-3 rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-xs text-red-200" dir="ltr">
              {effectiveRatingsJob.lastError}
            </p>
          ) : null}
          {showManualPaste && (
            <div className="mt-4 rounded-xl border border-amber-500/30 bg-amber-500/5 p-4">
              <h3 className="mb-2 text-sm font-bold text-amber-300">ייבוא ידני מהדפדפן</h3>
              <p className="mb-3 text-xs text-gray-400">
                1. פתח את{' '}
                <a href="https://midrug.safenet.co.il/app/" target="_blank" rel="noopener noreferrer" className="text-amber-300 underline">midrug.safenet.co.il/app</a>
                {' '}→ 2. לחץ ימני → &quot;הצג מקור הדף&quot; → 3. העתק הכל → 4. הדבק כאן
              </p>
              <textarea
                value={manualHtml}
                onChange={(e) => setManualHtml(e.target.value)}
                placeholder="הדבק כאן את קוד המקור של דף המדרוג..."
                dir="ltr"
                className="w-full rounded-lg border border-gray-700 bg-gray-900 px-3 py-2 text-xs text-gray-300 placeholder:text-gray-600 focus:border-amber-500 focus:outline-none"
                rows={5}
              />
              <div className="mt-2 flex gap-2">
                <button
                  onClick={() => void submitManualHtml()}
                  disabled={!manualHtml.trim() || runningRatingsSync}
                  className="rounded-lg bg-amber-600 px-4 py-2 text-xs font-bold text-white hover:bg-amber-500 disabled:opacity-50"
                >
                  {runningRatingsSync ? 'מעבד...' : 'ייבוא'}
                </button>
                <button
                  onClick={() => { setShowManualPaste(false); setManualHtml(''); }}
                  className="rounded-lg bg-gray-800 px-4 py-2 text-xs text-gray-300 hover:bg-gray-700"
                >
                  ביטול
                </button>
              </div>
            </div>
          )}
        </section>


        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 sm:gap-4">
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
        <section className="rounded-2xl border border-gray-800 bg-gray-900 p-4 sm:p-5" dir="rtl">
          <div className="mb-3 flex items-center gap-2">
            <Contact2 className="h-5 w-5 text-emerald-400" />
            <h2 className="font-bold text-white">גילויים חדשים היום</h2>
            {discoveriesLoading ? (
              <span className="text-xs text-gray-500">טוען...</span>
            ) : (
              <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-xs font-semibold text-emerald-300">
                {discoveries.length}
              </span>
            )}
          </div>
          {discoveries.length === 0 && !discoveriesLoading && (
            <p className="text-sm text-gray-500">אין גילויים חדשים היום.</p>
          )}
          {discoveries.length > 0 && (
            <div className="max-h-52 space-y-1 overflow-y-auto">
              {discoveries.map((d) => (
                <div key={d.id} className="flex items-center justify-between rounded-xl border border-transparent px-3 py-2 text-sm hover:border-gray-800 hover:bg-gray-800/50">
                  <div className="min-w-0">
                    <span className="font-medium text-white">{d.name}</span>
                    <span className="mr-2 text-gray-400">— {d.role || 'ללא תפקיד'}</span>
                  </div>
                  <span className="mr-3 shrink-0 text-xs text-emerald-400">{d.sourceBoardName ?? d.sourceBoard}</span>
                </div>
              ))}
            </div>
          )}
        </section>

        <div className="grid grid-cols-1 gap-3 sm:gap-4 xl:grid-cols-4">
          <div className="overflow-hidden rounded-2xl border border-gray-800 bg-gray-900 xl:col-span-3">
            <div className="flex flex-col gap-3 border-b border-gray-800 p-5 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-2 flex-wrap">
                <Users className="h-5 w-5 text-purple-400" />
                <h2 className="text-lg font-bold">ניהול משתמשים</h2>
                <span className="rounded-full bg-gray-800 px-2 py-0.5 text-xs text-gray-400">{overview.stats.totalUsers}</span>
                <span className="flex items-center gap-1 rounded-full bg-blue-900/40 px-2 py-0.5 text-xs text-blue-300" title="משתמשים עם התראות push למובייל">
                  <Smartphone className="h-3 w-3" />
                  {overview.users.filter(u => u.hasPush).length}/{overview.users.length} push
                </span>
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
            <div className="max-h-[560px] overflow-x-auto overflow-y-auto">
              <table className="w-full text-sm">
                <thead className="sticky top-0 z-10 bg-gray-900">
                  <tr className="border-b border-gray-800 text-xs text-gray-500">
                    <SortHeader label="משתמש" sortKey="displayName" activeKey={userSort.key} direction={userSort.direction} onSort={handleUserSort} className="px-5" />
                    <SortHeader label="אימייל" sortKey="email" activeKey={userSort.key} direction={userSort.direction} onSort={handleUserSort} className="hidden md:table-cell" />
                    <th className="hidden px-4 py-3 text-right font-medium md:table-cell">שיטות כניסה</th>
                    <SortHeader label="תפקיד / מחלקה" sortKey="role" activeKey={userSort.key} direction={userSort.direction} onSort={handleUserSort} className="hidden lg:table-cell" />
                    <SortHeader label="סטטוס" sortKey="status" activeKey={userSort.key} direction={userSort.direction} onSort={handleUserSort} />
                    <SortHeader label="נראה לאחרונה" sortKey="lastSeen" activeKey={userSort.key} direction={userSort.direction} onSort={handleUserSort} className="hidden sm:table-cell" />
                    <SortHeader label="הרשאה" sortKey="siteRole" activeKey={userSort.key} direction={userSort.direction} onSort={handleUserSort} />
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
                            <div className="flex items-center gap-1.5">
                              <p className="truncate font-medium text-white">{entry.displayName || 'ללא שם'}</p>
                              {entry.hasPush ? (
                                <span title="קיבל push למובייל"><Smartphone className="h-3 w-3 text-blue-400 flex-shrink-0" /></span>
                              ) : (
                                <span title="פעמון בלבד – אין push למובייל"><BellOff className="h-3 w-3 text-gray-500 flex-shrink-0" /></span>
                              )}
                            </div>
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
                                  customRole: '',
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
                  <div className="flex items-center gap-1.5 rounded-xl border border-orange-500/20 bg-orange-500/5 px-3 py-2 text-xs text-orange-300">
                    <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                    {overview.staleUsers.length} משתמשים עם נוכחות מיושנת
                  </div>
                ) : null}
              </div>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:gap-4 lg:grid-cols-3">
          <div className="rounded-2xl border border-gray-800 bg-gray-900 p-4 sm:p-5 lg:col-span-1">
            <div className="mb-4 flex items-center gap-2">
              <Settings className="h-5 w-5 text-purple-400" />
              <h2 className="text-lg font-bold">בקרת מערכת</h2>
            </div>
            <div className="space-y-5">
              <div className="rounded-2xl border border-gray-800 bg-gray-950/70 p-4">
                <div className="mb-3 flex items-center justify-between">
                  <span className="text-sm font-medium">מצב תחזוקה</span>
                  <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${overview.appConfig.maintenanceMode ? 'bg-orange-500/20 text-orange-300' : 'bg-gray-800 text-gray-400'}`}>
                    {overview.appConfig.maintenanceMode ? 'פעיל' : 'כבוי'}
                  </span>
                </div>
                <button
                  onClick={() => void saveAppConfig({ maintenanceMode: !overview.appConfig.maintenanceMode })}
                  disabled={savingConfig}
                  className={`w-full rounded-xl px-4 py-2 text-sm font-medium transition-colors ${
                    overview.appConfig.maintenanceMode
                      ? 'border border-orange-500/30 bg-orange-500/15 text-orange-200 hover:bg-orange-500/25'
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
                    onClick={() => void runFullSync()}
                    disabled={fullSyncRunning || runningSync}
                    className="w-full rounded-xl bg-gradient-to-r from-purple-600 to-blue-600 px-4 py-2 text-sm font-bold text-white transition-all hover:from-purple-500 hover:to-blue-500 disabled:opacity-60"
                  >
                    {fullSyncRunning ? (fullSyncStep || 'מריץ...') : 'סנכרון מלא (הפקות + אנשי קשר)'}
                  </button>
                  <Link
                    href="/directory"
                    className="flex w-full items-center justify-between rounded-xl bg-gray-800 px-4 py-2 text-sm text-gray-200 transition-colors hover:bg-gray-700"
                  >
                    אלפון אנשי קשר
                    <ArrowLeft className="h-4 w-4" />
                  </Link>
                  <Link
                    href="/admin/industry-master"
                    className="flex w-full items-center justify-between rounded-xl bg-gray-800 px-4 py-2 text-sm text-gray-200 transition-colors hover:bg-gray-700"
                  >
                    מנהל הפקות מאוחד
                    <ArrowLeft className="h-4 w-4" />
                  </Link>
                </div>
              </div>
            </div>
          </div>
          <div className="rounded-2xl border border-gray-800 bg-gray-900 p-4 sm:p-5 lg:col-span-1">
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

          <div className="rounded-2xl border border-gray-800 bg-gray-900 p-4 sm:p-5 lg:col-span-1">
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
              <div className="flex flex-wrap gap-1.5 rounded-lg p-2" style={{ background: 'var(--theme-bg-primary)', border: '1px solid var(--theme-border)' }}>
                {stringArray(editModal.departments).length ? stringArray(editModal.departments).map((department) => (
                  <button
                    key={department}
                    type="button"
                    onClick={() => setEditModal((m) => {
                      if (!m) return m;
                      const departments = removeValue(m.departments, department);
                      return { ...m, departments, department: departments[0] || '' };
                    })}
                    className="rounded-full bg-purple-500/20 px-2.5 py-1 text-xs text-purple-100 hover:bg-red-500/20 hover:text-red-100"
                    title="הסר מחלקה"
                  >
                    {department} ×
                  </button>
                )) : <span className="text-xs text-gray-500">לא נבחרו מחלקות</span>}
              </div>
              <select
                value=""
                onChange={(e) => {
                  const department = e.currentTarget.value;
                  setEditModal((m) => {
                    if (!m) return m;
                    const departments = addUniqueValue(m.departments, department);
                    return { ...m, departments, department: departments[0] || '' };
                  });
                }}
                className="rounded-lg px-3 py-2 text-sm"
                style={{ background: 'var(--theme-bg-primary)', border: '1px solid var(--theme-border)', color: 'var(--theme-text-primary)' }}
              >
                <option value="">הוסף מחלקה...</option>
                {INDUSTRY_DEPARTMENT_OPTIONS.filter((d) => !stringArray(editModal.departments).includes(d)).map((d) => (
                  <option key={d} value={d}>{d}</option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-xs" style={{ color: 'var(--theme-text-secondary)' }}>
              תפקידים
              <div className="flex flex-wrap gap-1.5 rounded-lg p-2" style={{ background: 'var(--theme-bg-primary)', border: '1px solid var(--theme-border)' }}>
                {stringArray(editModal.roles).length ? stringArray(editModal.roles).map((role) => (
                  <button
                    key={role}
                    type="button"
                    onClick={() => setEditModal((m) => {
                      if (!m) return m;
                      const roles = removeValue(m.roles, role);
                      return { ...m, roles, role: roles[0] || '' };
                    })}
                    className="rounded-full bg-blue-500/20 px-2.5 py-1 text-xs text-blue-100 hover:bg-red-500/20 hover:text-red-100"
                    title="הסר תפקיד"
                  >
                    {role} ×
                  </button>
                )) : <span className="text-xs text-gray-500">לא נבחרו תפקידים</span>}
              </div>
              <select
                value=""
                onChange={(e) => {
                  const role = e.currentTarget.value;
                  setEditModal((m) => {
                    if (!m) return m;
                    const roles = addUniqueValue(m.roles, role);
                    return { ...m, roles, role: roles[0] || '' };
                  });
                }}
                dir="rtl"
                className="rounded-lg px-3 py-2 text-sm"
                style={{ background: 'var(--theme-bg-primary)', border: '1px solid var(--theme-border)', color: 'var(--theme-text-primary)' }}
              >
                <option value="">הוסף תפקיד...</option>
                {roleOptionsForEditor(editModal.roles).filter((role) => !stringArray(editModal.roles).includes(role)).map((role) => (
                  <option key={role} value={role}>{role}</option>
                ))}
              </select>
              <div className="flex gap-2">
                <input
                  value={editModal.customRole}
                  onChange={(e) => setEditModal((m) => m && { ...m, customRole: e.target.value })}
                  onKeyDown={(e) => {
                    if (e.key !== 'Enter') return;
                    e.preventDefault();
                    setEditModal((m) => {
                      if (!m) return m;
                      const roles = addUniqueValue(m.roles, m.customRole);
                      return { ...m, roles, role: roles[0] || '', customRole: '' };
                    });
                  }}
                  placeholder="תפקיד ידני, למשל VTR"
                  dir="rtl"
                  className="min-w-0 flex-1 rounded-lg px-3 py-2 text-sm"
                  style={{ background: 'var(--theme-bg-primary)', border: '1px solid var(--theme-border)', color: 'var(--theme-text-primary)' }}
                />
                <button
                  type="button"
                  onClick={() => setEditModal((m) => {
                    if (!m) return m;
                    const roles = addUniqueValue(m.roles, m.customRole);
                    return { ...m, roles, role: roles[0] || '', customRole: '' };
                  })}
                  className="rounded-lg px-3 py-2 text-xs font-bold"
                  style={{ background: 'var(--theme-accent)', color: 'white' }}
                >
                  הוסף
                </button>
              </div>
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

      {showAddContact && createPortal(
        <div className="fixed inset-0 z-[99999] flex items-center justify-center bg-black/60 p-4" onClick={(e) => { if (e.target === e.currentTarget) { setShowAddContact(false); setNewContact({ name: '', phone: '', role: '', department: '' }); } }}>
          <div className="w-full max-w-md rounded-xl p-6 shadow-xl" style={{ background: 'var(--theme-bg-secondary)', border: '1px solid var(--theme-border)' }}>
            <div className="mb-5 flex items-center justify-between">
              <h3 className="text-lg font-bold text-white">הוספת איש קשר חדש</h3>
              <button
                onClick={() => { setShowAddContact(false); setNewContact({ name: '', phone: '', role: '', department: '' }); }}
                className="rounded-lg p-1 text-gray-400 hover:bg-gray-700 hover:text-white"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="flex flex-col gap-4">
              <label className="flex flex-col gap-1.5 text-xs text-gray-400">
                שם מלא *
                <input
                  type="text"
                  value={newContact.name}
                  onChange={e => setNewContact(prev => ({ ...prev, name: e.target.value }))}
                  placeholder="ישראל ישראלי"
                  autoFocus
                  dir="rtl"
                  className="rounded-lg border border-gray-700 bg-gray-800 px-3 py-2.5 text-sm text-white placeholder:text-gray-500 focus:border-green-500 focus:outline-none"
                />
              </label>
              <label className="flex flex-col gap-1.5 text-xs text-gray-400">
                טלפון *
                <input
                  type="tel"
                  value={newContact.phone}
                  onChange={e => setNewContact(prev => ({ ...prev, phone: e.target.value }))}
                  placeholder="054-1234567"
                  dir="ltr"
                  className="rounded-lg border border-gray-700 bg-gray-800 px-3 py-2.5 text-sm text-white placeholder:text-gray-500 focus:border-green-500 focus:outline-none"
                  onKeyDown={e => { if (e.key === 'Enter') void addSingleContact(); }}
                />
              </label>
              <label className="flex flex-col gap-1.5 text-xs text-gray-400">
                תפקיד
                <input
                  type="text"
                  value={newContact.role}
                  onChange={e => setNewContact(prev => ({ ...prev, role: e.target.value }))}
                  placeholder="צלם, במאי, טכנאי..."
                  dir="rtl"
                  className="rounded-lg border border-gray-700 bg-gray-800 px-3 py-2.5 text-sm text-white placeholder:text-gray-500 focus:border-green-500 focus:outline-none"
                />
              </label>
              <label className="flex flex-col gap-1.5 text-xs text-gray-400">
                מחלקה
                <select
                  value={newContact.department}
                  onChange={e => setNewContact(prev => ({ ...prev, department: e.target.value }))}
                  dir="rtl"
                  className="rounded-lg border border-gray-700 bg-gray-800 px-3 py-2.5 text-sm text-white focus:border-green-500 focus:outline-none"
                >
                  <option value="">בחר מחלקה (אופציונלי)</option>
                  {INDUSTRY_DEPARTMENT_OPTIONS.map(d => (
                    <option key={d} value={d}>{d}</option>
                  ))}
                </select>
              </label>
            </div>
            <div className="mt-6 flex justify-end gap-2">
              <button
                onClick={() => { setShowAddContact(false); setNewContact({ name: '', phone: '', role: '', department: '' }); }}
                className="rounded-lg px-4 py-2 text-sm text-gray-300 hover:bg-gray-700"
                style={{ background: 'var(--theme-bg-primary)', border: '1px solid var(--theme-border)' }}
              >
                ביטול
              </button>
              <button
                onClick={() => void addSingleContact()}
                disabled={addingContact || !newContact.name.trim() || !newContact.phone.trim()}
                className="rounded-lg bg-green-600 px-5 py-2 text-sm font-semibold text-white transition-colors hover:bg-green-500 disabled:opacity-50"
              >
                {addingContact ? 'מוסיף...' : 'הוסף איש קשר'}
              </button>
            </div>
          </div>
        </div>,
        document.body,
      )}
    </div>
  );
}
