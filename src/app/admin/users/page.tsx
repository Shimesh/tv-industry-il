'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  AlertTriangle,
  ArrowRight,
  Ban,
  Check,
  Loader2,
  Search,
  ShieldCheck,
  Trash2,
  Users,
  X,
} from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import type { UserApprovalStatus } from '@/lib/userApproval';

type ManagedUser = {
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

type ConfirmAction =
  | { type: 'block'; user: ManagedUser }
  | { type: 'delete'; user: ManagedUser }
  | { type: 'reject'; user: ManagedUser };

const statusLabels: Record<UserApprovalStatus, string> = {
  pending: 'ממתין לאישור',
  active: 'פעיל',
  blocked: 'חסום',
};

const statusClasses: Record<UserApprovalStatus, string> = {
  pending: 'border-amber-400/30 bg-amber-500/10 text-amber-200',
  active: 'border-green-400/30 bg-green-500/10 text-green-200',
  blocked: 'border-red-400/30 bg-red-500/10 text-red-200',
};

function formatRelative(value: string | null): string {
  if (!value) return 'לא זמין';
  const parsed = Date.parse(value);
  if (Number.isNaN(parsed)) return 'לא זמין';
  return new Date(parsed).toLocaleString('he-IL');
}

export default function AdminUsersPage() {
  const { user, loading: authLoading } = useAuth();
  const [users, setUsers] = useState<ManagedUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyUid, setBusyUid] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | UserApprovalStatus>('all');
  const [confirmAction, setConfirmAction] = useState<ConfirmAction | null>(null);

  async function fetchWithAuth<T>(path: string, init?: RequestInit): Promise<T> {
    if (!user) throw new Error('יש להתחבר תחילה');
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
      throw new Error(typeof payload.error === 'string' ? payload.error : `HTTP ${response.status}`);
    }
    return payload as T;
  }

  async function loadUsers() {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchWithAuth<{ users: ManagedUser[] }>('/api/admin/users');
      setUsers(data.users);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'טעינת המשתמשים נכשלה');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      setLoading(false);
      setError('יש להתחבר כמנהל המערכת');
      return;
    }
    void loadUsers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authLoading, user]);

  const pendingUsers = useMemo(
    () => users.filter((entry) => entry.approvalStatus === 'pending'),
    [users],
  );

  const filteredUsers = useMemo(() => {
    const term = search.trim().toLowerCase();
    return users.filter((entry) => {
      const matchesStatus = statusFilter === 'all' || entry.approvalStatus === statusFilter;
      const matchesSearch = !term || [
        entry.displayName,
        entry.email,
        entry.department,
        entry.role,
        entry.phone || '',
        entry.uid,
      ].join(' ').toLowerCase().includes(term);
      return matchesStatus && matchesSearch;
    });
  }, [search, statusFilter, users]);

  async function updateApprovalStatus(target: ManagedUser, approvalStatus: 'active' | 'blocked') {
    setBusyUid(target.uid);
    setError(null);
    try {
      await fetchWithAuth(`/api/admin/users/${encodeURIComponent(target.uid)}/approval`, {
        method: 'PATCH',
        body: JSON.stringify({ approvalStatus }),
      });
      await loadUsers();
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : 'עדכון הסטטוס נכשל');
    } finally {
      setBusyUid(null);
    }
  }

  async function deleteUser(target: ManagedUser) {
    setBusyUid(target.uid);
    setError(null);
    try {
      await fetchWithAuth(`/api/admin/users/${encodeURIComponent(target.uid)}`, {
        method: 'DELETE',
      });
      setConfirmAction(null);
      await loadUsers();
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : 'מחיקת המשתמש נכשלה');
    } finally {
      setBusyUid(null);
    }
  }

  async function runConfirmedAction() {
    if (!confirmAction) return;
    if (confirmAction.type === 'block') {
      await updateApprovalStatus(confirmAction.user, 'blocked');
      setConfirmAction(null);
      return;
    }
    await deleteUser(confirmAction.user);
  }

  if (authLoading || loading) {
    return (
      <div className="flex min-h-screen items-center justify-center gap-3 bg-gray-950 text-gray-300" dir="rtl">
        <Loader2 className="h-5 w-5 animate-spin text-purple-300" />
        טוען משתמשים...
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-950 px-4 py-8 text-white sm:px-6" dir="rtl">
      <div className="mx-auto max-w-7xl space-y-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <Link href="/admin" className="mb-3 inline-flex items-center gap-2 text-sm text-gray-400 hover:text-white">
              <ArrowRight className="h-4 w-4" />
              חזרה ללוח הניהול
            </Link>
            <div className="flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl border border-purple-400/30 bg-purple-500/10">
                <ShieldCheck className="h-6 w-6 text-purple-300" />
              </div>
              <div>
                <h1 className="text-2xl font-bold">ניהול משתמשים</h1>
                <p className="text-sm text-gray-400">אישור גישה, חסימה ומחיקה של חשבונות רשומים</p>
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={() => void loadUsers()}
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-gray-800 px-4 py-2 text-sm font-semibold text-gray-100 hover:bg-gray-700"
          >
            <Loader2 className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            רענון
          </button>
        </div>

        {error ? (
          <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">
            {error}
          </div>
        ) : null}

        <section className="rounded-2xl border border-gray-800 bg-gray-900">
          <div className="flex items-center justify-between gap-3 border-b border-gray-800 p-5">
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-amber-300" />
              <h2 className="text-lg font-bold">בקשות ממתינות</h2>
              <span className="rounded-full bg-amber-500/10 px-2 py-0.5 text-xs text-amber-200">{pendingUsers.length}</span>
            </div>
          </div>
          <div className="divide-y divide-gray-800">
            {pendingUsers.length === 0 ? (
              <p className="p-5 text-sm text-gray-400">אין כרגע בקשות שממתינות לאישור.</p>
            ) : pendingUsers.map((entry) => (
              <div key={entry.uid} className="flex flex-col gap-4 p-5 md:flex-row md:items-center md:justify-between">
                <UserIdentity user={entry} />
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => void updateApprovalStatus(entry, 'active')}
                    disabled={busyUid === entry.uid}
                    className="inline-flex items-center gap-2 rounded-lg bg-green-600 px-3 py-2 text-sm font-semibold text-white hover:bg-green-700 disabled:opacity-50"
                  >
                    <Check className="h-4 w-4" />
                    אשר
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmAction({ type: 'reject', user: entry })}
                    disabled={busyUid === entry.uid}
                    className="inline-flex items-center gap-2 rounded-lg bg-red-600 px-3 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-50"
                  >
                    <X className="h-4 w-4" />
                    דחה
                  </button>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="rounded-2xl border border-gray-800 bg-gray-900">
          <div className="flex flex-col gap-4 border-b border-gray-800 p-5 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex items-center gap-2">
              <Users className="h-5 w-5 text-blue-300" />
              <h2 className="text-lg font-bold">כל המשתמשים</h2>
              <span className="rounded-full bg-gray-800 px-2 py-0.5 text-xs text-gray-400">{users.length}</span>
            </div>
            <div className="flex flex-col gap-3 sm:flex-row">
              <div className="relative">
                <Search className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-500" />
                <input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="חיפוש לפי שם, אימייל, מחלקה או UID"
                  className="w-full rounded-xl border border-gray-700 bg-gray-800 py-2 pl-4 pr-9 text-sm text-white placeholder-gray-500 outline-none focus:border-purple-500 sm:w-80"
                />
              </div>
              <select
                value={statusFilter}
                onChange={(event) => setStatusFilter(event.target.value as typeof statusFilter)}
                className="rounded-xl border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-white outline-none focus:border-purple-500"
              >
                <option value="all">כל הסטטוסים</option>
                <option value="pending">ממתין לאישור</option>
                <option value="active">פעיל</option>
                <option value="blocked">חסום</option>
              </select>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px] text-right text-sm">
              <thead className="text-xs text-gray-500">
                <tr className="border-b border-gray-800">
                  <th className="px-5 py-3 font-medium">משתמש</th>
                  <th className="px-4 py-3 font-medium">אימייל</th>
                  <th className="px-4 py-3 font-medium">מחלקה</th>
                  <th className="px-4 py-3 font-medium">תפקיד</th>
                  <th className="px-4 py-3 font-medium">סטטוס גישה</th>
                  <th className="px-4 py-3 font-medium">נראה לאחרונה</th>
                  <th className="px-5 py-3 font-medium">פעולות</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-800/70">
                {filteredUsers.map((entry) => (
                  <tr key={entry.uid} className="align-middle hover:bg-gray-800/30">
                    <td className="px-5 py-4">
                      <UserIdentity user={entry} compact />
                    </td>
                    <td className="max-w-[220px] px-4 py-4 text-gray-300">
                      <span className="block truncate" dir="ltr">{entry.email || 'לא זמין'}</span>
                    </td>
                    <td className="px-4 py-4 text-gray-300">{entry.department || 'לא צוין'}</td>
                    <td className="px-4 py-4 text-gray-300">{entry.role || 'לא צוין'}</td>
                    <td className="px-4 py-4">
                      <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${statusClasses[entry.approvalStatus]}`}>
                        {statusLabels[entry.approvalStatus]}
                      </span>
                    </td>
                    <td className="px-4 py-4 text-xs text-gray-400">{formatRelative(entry.lastSeen)}</td>
                    <td className="px-5 py-4">
                      <div className="flex flex-wrap gap-2">
                        {entry.approvalStatus !== 'active' ? (
                          <button
                            type="button"
                            onClick={() => void updateApprovalStatus(entry, 'active')}
                            disabled={busyUid === entry.uid}
                            className="inline-flex items-center gap-1.5 rounded-lg bg-green-600 px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-green-700 disabled:opacity-50"
                          >
                            <Check className="h-3.5 w-3.5" />
                            אשר
                          </button>
                        ) : null}
                        {!entry.isPrimaryAdmin && entry.approvalStatus !== 'blocked' ? (
                          <button
                            type="button"
                            onClick={() => setConfirmAction({ type: 'block', user: entry })}
                            disabled={busyUid === entry.uid}
                            className="inline-flex items-center gap-1.5 rounded-lg bg-amber-600 px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-amber-700 disabled:opacity-50"
                          >
                            <Ban className="h-3.5 w-3.5" />
                            חסום
                          </button>
                        ) : null}
                        {!entry.isPrimaryAdmin ? (
                          <button
                            type="button"
                            onClick={() => setConfirmAction({ type: 'delete', user: entry })}
                            disabled={busyUid === entry.uid}
                            className="inline-flex items-center gap-1.5 rounded-lg bg-red-600 px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-red-700 disabled:opacity-50"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                            מחק
                          </button>
                        ) : (
                          <span className="text-xs text-gray-500">מנהל ראשי</span>
                        )}
                      </div>
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
        </section>
      </div>

      {confirmAction ? (
        <div className="fixed inset-0 z-[100000] flex items-center justify-center bg-black/70 p-4" dir="rtl">
          <div className="w-full max-w-md rounded-2xl border border-gray-800 bg-gray-900 p-6 shadow-2xl">
            <div className="mb-4 flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-red-500/10 text-red-300">
                <AlertTriangle className="h-5 w-5" />
              </div>
              <div>
                <h3 className="font-bold text-white">
                  {confirmAction.type === 'block' ? 'חסימת משתמש' : 'מחיקת משתמש'}
                </h3>
                <p className="text-xs text-gray-400">{confirmAction.user.displayName}</p>
              </div>
            </div>
            <p className="leading-7 text-gray-300">
              {confirmAction.type === 'block'
                ? 'המשתמש לא יוכל לגשת לאפליקציה עד שתאשר אותו מחדש.'
                : 'הפעולה תמחק את חשבון המשתמש מ-Firebase Auth ואת מסמך המשתמש ב-Firestore.'}
            </p>
            <div className="mt-6 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setConfirmAction(null)}
                className="rounded-lg bg-gray-800 px-4 py-2 text-sm font-semibold text-gray-200 hover:bg-gray-700"
              >
                ביטול
              </button>
              <button
                type="button"
                onClick={() => void runConfirmedAction()}
                disabled={busyUid === confirmAction.user.uid}
                className="inline-flex items-center gap-2 rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-50"
              >
                {busyUid === confirmAction.user.uid ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                אישור
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function UserIdentity({ user, compact = false }: { user: ManagedUser; compact?: boolean }) {
  return (
    <div className="flex min-w-0 items-center gap-3">
      {user.photoURL ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={user.photoURL} alt="" className={`${compact ? 'h-9 w-9' : 'h-11 w-11'} rounded-full object-cover`} />
      ) : (
        <div className={`${compact ? 'h-9 w-9' : 'h-11 w-11'} flex shrink-0 items-center justify-center rounded-full bg-purple-600 text-sm font-bold`}>
          {user.displayName.charAt(0) || '?'}
        </div>
      )}
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <p className="truncate font-semibold text-white">{user.displayName}</p>
          {user.isPrimaryAdmin ? (
            <span className="rounded-full bg-purple-500/10 px-2 py-0.5 text-[10px] font-semibold text-purple-200">
              מנהל ראשי
            </span>
          ) : null}
        </div>
        <p className="truncate text-xs text-gray-500" dir="ltr">{user.uid}</p>
      </div>
    </div>
  );
}
