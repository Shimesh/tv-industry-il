'use client';

import { useState, useEffect, useCallback } from 'react';
import { useAuth, UserProfile } from '@/contexts/AuthContext';
import AuthGuard from '@/components/AuthGuard';
import { db } from '@/lib/firebase';
import { collection, getDocs, doc, updateDoc } from 'firebase/firestore';
import { type UserRole, ROLE_LABELS, ROLE_HIERARCHY } from '@/lib/permissions';
import {
  Shield, Users, Search, ChevronDown, CheckCircle,
  AlertTriangle, Crown, Eye, Edit3, UserCheck
} from 'lucide-react';

const ROLES: UserRole[] = ['admin', 'moderator', 'editor', 'viewer'];

const roleIcons: Record<UserRole, typeof Crown> = {
  admin: Crown,
  moderator: Shield,
  editor: Edit3,
  viewer: Eye,
};

const roleColors: Record<UserRole, string> = {
  admin: 'bg-red-500/15 text-red-400 border-red-500/30',
  moderator: 'bg-purple-500/15 text-purple-400 border-purple-500/30',
  editor: 'bg-blue-500/15 text-blue-400 border-blue-500/30',
  viewer: 'bg-gray-500/15 text-gray-400 border-gray-500/30',
};

interface UserWithRole extends UserProfile {
  siteRole: UserRole;
}

export default function AdminPage() {
  return (
    <AuthGuard>
      <AdminContent />
    </AuthGuard>
  );
}

function AdminContent() {
  const { user, profile, hasRole: checkRole } = useAuth();
  const [users, setUsers] = useState<UserWithRole[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState<UserRole | 'all'>('all');
  const [updating, setUpdating] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState('');

  const isAdmin = checkRole('admin');

  const fetchUsers = useCallback(async () => {
    try {
      const snapshot = await getDocs(collection(db, 'users'));
      const userList = snapshot.docs.map(d => ({
        uid: d.id,
        ...d.data(),
        siteRole: d.data().siteRole || 'viewer',
      })) as UserWithRole[];
      userList.sort((a, b) =>
        (ROLE_HIERARCHY[b.siteRole] || 0) - (ROLE_HIERARCHY[a.siteRole] || 0)
      );
      setUsers(userList);
    } catch (err) {
      console.error('Failed to fetch users:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isAdmin) fetchUsers();
    else setLoading(false);
  }, [isAdmin, fetchUsers]);

  const handleRoleChange = async (targetUid: string, newRole: UserRole) => {
    if (!isAdmin || targetUid === user?.uid) return;
    setUpdating(targetUid);
    try {
      await updateDoc(doc(db, 'users', targetUid), { siteRole: newRole });
      setUsers(prev =>
        prev.map(u => u.uid === targetUid ? { ...u, siteRole: newRole } : u)
      );
      setSuccessMsg(`התפקיד עודכן בהצלחה`);
      setTimeout(() => setSuccessMsg(''), 3000);
    } catch (err) {
      console.error('Failed to update role:', err);
    } finally {
      setUpdating(null);
    }
  };

  if (!isAdmin) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <div className="text-center p-8">
          <AlertTriangle className="w-16 h-16 mx-auto mb-4 text-red-400" />
          <h2 className="text-xl font-bold text-[var(--theme-text-primary)] mb-2">
            אין הרשאות גישה
          </h2>
          <p className="text-[var(--theme-text-secondary)]">
            רק מנהלי מערכת יכולים לגשת לעמוד זה
          </p>
        </div>
      </div>
    );
  }

  const filteredUsers = users.filter(u => {
    const matchSearch = !search ||
      u.displayName?.toLowerCase().includes(search.toLowerCase()) ||
      u.email?.toLowerCase().includes(search.toLowerCase());
    const matchRole = roleFilter === 'all' || u.siteRole === roleFilter;
    return matchSearch && matchRole;
  });

  const stats = {
    total: users.length,
    admins: users.filter(u => u.siteRole === 'admin').length,
    moderators: users.filter(u => u.siteRole === 'moderator').length,
    editors: users.filter(u => u.siteRole === 'editor').length,
    viewers: users.filter(u => u.siteRole === 'viewer').length,
  };

  return (
    <div className="min-h-screen pb-20">
      {/* Header */}
      <div className="border-b border-[var(--theme-border)] bg-[var(--theme-bg-primary)]">
        <div className="max-w-6xl mx-auto px-4 py-6">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-red-500 to-orange-500 flex items-center justify-center">
              <Shield className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-[var(--theme-text-primary)]">
                ניהול משתמשים
              </h1>
              <p className="text-sm text-[var(--theme-text-secondary)]">
                ניהול הרשאות ותפקידים במערכת
              </p>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-4 py-6 space-y-6">
        {/* Success message */}
        {successMsg && (
          <div className="flex items-center gap-2 p-3 rounded-lg bg-green-500/10 border border-green-500/30 text-green-400">
            <CheckCircle className="w-4 h-4" />
            <span className="text-sm">{successMsg}</span>
          </div>
        )}

        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          {[
            { label: 'סה"כ', value: stats.total, color: 'from-blue-500 to-cyan-500' },
            { label: 'מנהלים', value: stats.admins, color: 'from-red-500 to-orange-500' },
            { label: 'מנהלי תוכן', value: stats.moderators, color: 'from-purple-500 to-pink-500' },
            { label: 'עורכים', value: stats.editors, color: 'from-blue-500 to-indigo-500' },
            { label: 'צופים', value: stats.viewers, color: 'from-gray-500 to-gray-600' },
          ].map(stat => (
            <div key={stat.label} className="rounded-xl border border-[var(--theme-border)] bg-[var(--theme-bg-secondary)] p-4">
              <div className={`text-2xl font-bold bg-gradient-to-r ${stat.color} bg-clip-text text-transparent`}>
                {stat.value}
              </div>
              <div className="text-xs text-[var(--theme-text-secondary)] mt-1">{stat.label}</div>
            </div>
          ))}
        </div>

        {/* Search & Filter */}
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--theme-text-secondary)]" />
            <input
              type="text"
              placeholder="חיפוש לפי שם או אימייל..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full pr-10 pl-4 py-2.5 rounded-lg border border-[var(--theme-border)] bg-[var(--theme-bg-secondary)] text-[var(--theme-text-primary)] text-sm"
            />
          </div>
          <select
            value={roleFilter}
            onChange={e => setRoleFilter(e.target.value as UserRole | 'all')}
            className="px-4 py-2.5 rounded-lg border border-[var(--theme-border)] bg-[var(--theme-bg-secondary)] text-[var(--theme-text-primary)] text-sm"
          >
            <option value="all">כל התפקידים</option>
            {ROLES.map(r => (
              <option key={r} value={r}>{ROLE_LABELS[r]}</option>
            ))}
          </select>
        </div>

        {/* Users Table */}
        {loading ? (
          <div className="text-center py-12 text-[var(--theme-text-secondary)]">טוען...</div>
        ) : (
          <div className="rounded-xl border border-[var(--theme-border)] overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="bg-[var(--theme-bg-secondary)] border-b border-[var(--theme-border)]">
                    <th className="text-right px-4 py-3 text-xs font-medium text-[var(--theme-text-secondary)]">משתמש</th>
                    <th className="text-right px-4 py-3 text-xs font-medium text-[var(--theme-text-secondary)]">אימייל</th>
                    <th className="text-right px-4 py-3 text-xs font-medium text-[var(--theme-text-secondary)]">מחלקה</th>
                    <th className="text-right px-4 py-3 text-xs font-medium text-[var(--theme-text-secondary)]">תפקיד באתר</th>
                    <th className="text-right px-4 py-3 text-xs font-medium text-[var(--theme-text-secondary)]">פעולות</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredUsers.map(u => {
                    const RoleIcon = roleIcons[u.siteRole];
                    const isSelf = u.uid === user?.uid;
                    return (
                      <tr
                        key={u.uid}
                        className="border-b border-[var(--theme-border)] hover:bg-[var(--theme-bg-secondary)]/50 transition-colors"
                      >
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-3">
                            {u.photoURL ? (
                              <img src={u.photoURL} alt="" className="w-8 h-8 rounded-full" />
                            ) : (
                              <div className="w-8 h-8 rounded-full bg-gradient-to-br from-purple-500 to-blue-500 flex items-center justify-center text-white text-xs font-bold">
                                {u.displayName?.[0] || '?'}
                              </div>
                            )}
                            <div>
                              <div className="text-sm font-medium text-[var(--theme-text-primary)]">
                                {u.displayName}
                                {isSelf && <span className="text-xs text-[var(--theme-text-secondary)] mr-1">(את/ה)</span>}
                              </div>
                              <div className="text-xs text-[var(--theme-text-secondary)]">{u.role}</div>
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-sm text-[var(--theme-text-secondary)]">{u.email}</td>
                        <td className="px-4 py-3 text-sm text-[var(--theme-text-secondary)]">{u.department || '—'}</td>
                        <td className="px-4 py-3">
                          <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border ${roleColors[u.siteRole]}`}>
                            <RoleIcon className="w-3 h-3" />
                            {ROLE_LABELS[u.siteRole]}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          {isSelf ? (
                            <span className="text-xs text-[var(--theme-text-secondary)]">—</span>
                          ) : (
                            <select
                              value={u.siteRole}
                              onChange={e => handleRoleChange(u.uid, e.target.value as UserRole)}
                              disabled={updating === u.uid}
                              className="px-3 py-1.5 rounded-lg border border-[var(--theme-border)] bg-[var(--theme-bg-secondary)] text-[var(--theme-text-primary)] text-xs disabled:opacity-50"
                            >
                              {ROLES.map(r => (
                                <option key={r} value={r}>{ROLE_LABELS[r]}</option>
                              ))}
                            </select>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {filteredUsers.length === 0 && (
              <div className="text-center py-8 text-[var(--theme-text-secondary)] text-sm">
                לא נמצאו משתמשים
              </div>
            )}
          </div>
        )}

        {/* Role Legend */}
        <div className="rounded-xl border border-[var(--theme-border)] bg-[var(--theme-bg-secondary)] p-4">
          <h3 className="text-sm font-medium text-[var(--theme-text-primary)] mb-3">מדריך תפקידים</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {ROLES.map(r => {
              const Icon = roleIcons[r];
              return (
                <div key={r} className="flex items-start gap-2">
                  <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border ${roleColors[r]}`}>
                    <Icon className="w-3 h-3" />
                    {ROLE_LABELS[r]}
                  </span>
                  <span className="text-xs text-[var(--theme-text-secondary)]">
                    {r === 'admin' && '– שליטה מלאה: ניהול משתמשים, מחיקת תוכן, שינוי הרשאות'}
                    {r === 'moderator' && '– ניהול תוכן: מחיקת פוסטים והודעות, ניהול לוח מודעות'}
                    {r === 'editor' && '– עריכת לוחות: עריכת הפקות משותפות'}
                    {r === 'viewer' && '– ברירת מחדל: צפייה, פרסום תוכן אישי, לייקים'}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
