'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import {
  Activity,
  AlertTriangle,
  ArrowLeft,
  BarChart3,
  CheckCircle,
  Contact2,
  Crown,
  FileText,
  Megaphone,
  MessageCircle,
  RefreshCw,
  Search,
  Settings,
  Shield,
  ShieldCheck,
  UserIcon,
  Users,
  Wifi,
  WifiOff,
  Wrench,
} from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import type { AdminOverview, AdminRole, AdminUserSummary, SystemEventRecord } from '@/lib/adminTypes';

type ToastState = {
  type: 'ok' | 'err';
  msg: string;
} | null;

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
  { value: 'moderator', label: 'מנחה', icon: Shield, classes: 'text-blue-400 border-blue-400/30 bg-blue-400/10' },
  { value: 'user', label: 'משתמש', icon: UserIcon, classes: 'text-gray-300 border-gray-600/40 bg-gray-600/10' },
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

function rolePresentation(role: AdminRole) {
  return ROLE_OPTIONS.find((option) => option.value === role) || ROLE_OPTIONS[2];
}

function PresenceBadge({ user }: { user: AdminUserSummary }) {
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
      {current.label}
    </span>
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
  const [announcementDraft, setAnnouncementDraft] = useState('');
  const [toast, setToast] = useState<ToastState>(null);
  const [noAdminExists, setNoAdminExists] = useState(false);
  const [claimingAdmin, setClaimingAdmin] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [savingConfig, setSavingConfig] = useState(false);
  const [runningSync, setRunningSync] = useState(false);
  const [updatingRole, setUpdatingRole] = useState<string | null>(null);
  const draftDirtyRef = useRef(false);

  const isAdmin = profile?.siteRole === 'admin';

  function showToast(type: 'ok' | 'err', msg: string) {
    setToast({ type, msg });
    window.setTimeout(() => setToast(null), 3000);
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
    const interval = window.setInterval(() => {
      void loadOverview(true);
    }, 30000);
    return () => window.clearInterval(interval);
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

  const filteredUsers = useMemo(() => {
    if (!search) return overview.users;
    const term = search.trim().toLowerCase();
    return overview.users.filter((entry) =>
      [entry.displayName, entry.email, entry.role, entry.department, entry.city || '']
        .join(' ')
        .toLowerCase()
        .includes(term),
    );
  }, [overview.users, search]);

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
            <Link
              href="/admin/sync"
              className="flex items-center gap-2 rounded-xl bg-gray-800 px-4 py-2 text-sm font-semibold text-gray-200 transition-colors hover:bg-gray-700"
            >
              כלי סנכרון
              <ArrowLeft className="h-4 w-4" />
            </Link>
          </div>
        </div>

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
              מחוברים עכשיו = `isOnline` פעיל וגם `lastSeen` בתוך 2 דקות. נוכחות ישנה = `isOnline` נשאר פעיל אבל `lastSeen` כבר לא עדכני.
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-800 text-xs text-gray-500">
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
                            <p className="truncate text-xs text-gray-500 md:hidden">{entry.email || '—'}</p>
                          </div>
                        </div>
                      </td>
                      <td className="hidden max-w-[180px] px-4 py-3 text-gray-400 md:table-cell">
                        <span className="block truncate">{entry.email || '—'}</span>
                      </td>
                      <td className="hidden px-4 py-3 lg:table-cell">
                        <p className="text-white">{entry.role || '—'}</p>
                        <p className="text-xs text-gray-500">{entry.department || '—'}</p>
                      </td>
                      <td className="px-4 py-3">
                        <PresenceBadge user={entry} />
                      </td>
                      <td className="hidden px-4 py-3 text-xs text-gray-400 sm:table-cell">
                        {formatRelativeTime(entry.lastSeen)}
                      </td>
                      <td className="px-4 py-3">
                        {entry.uid === user.uid ? (
                          <RoleBadge role={entry.siteRole} />
                        ) : (
                          <div className="flex flex-wrap gap-2">
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
                        )}
                      </td>
                    </tr>
                  ))}

                  {filteredUsers.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="px-5 py-12 text-center text-gray-500">
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
                      <p className="text-xs text-gray-500">{entry.role || entry.department || 'ללא תפקיד'}</p>
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
                  <div key={page.key} className="flex items-center justify-between rounded-xl bg-gray-950/70 px-3 py-2">
                    <div>
                      <p className="text-sm text-white">{page.label}</p>
                      <p className="text-xs text-gray-500">{formatRelativeTime(page.lastSeenAt)}</p>
                    </div>
                    <span className="text-sm font-semibold text-blue-300">{page.count}</span>
                  </div>
                ))}
                {overview.usage.topPages.length === 0 ? (
                  <p className="text-sm text-gray-500">עדיין אין נתוני צפייה לדפים.</p>
                ) : null}
              </div>
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
    </div>
  );
}
