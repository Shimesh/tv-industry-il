'use client';

import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { db } from '@/lib/firebase';
import {
  collection, getDocs, doc, updateDoc,
  serverTimestamp, query, where, limit,
} from 'firebase/firestore';
import Link from 'next/link';
import {
  Users, Contact2, FileText, MessageCircle, ShieldCheck, Activity,
  Search, RefreshCw, Crown, Shield, UserIcon, Eye, Ban, ChevronDown,
  ArrowLeft, Wrench, Database, BarChart3, Clock, Wifi, WifiOff,
} from 'lucide-react';

interface AdminUser {
  uid: string;
  displayName: string;
  email: string;
  role: string;
  department: string;
  siteRole?: string;
  isOnline: boolean;
  lastSeen?: string;
  onboardingComplete?: boolean;
  photoURL?: string | null;
  createdAt?: string;
  city?: string;
}

interface Stats {
  totalUsers: number;
  onlineNow: number;
  active24h: number;
  admins: number;
  moderators: number;
  totalContacts: number;
  totalPosts: number;
  totalChats: number;
}

const ROLE_CONFIG: Record<string, { label: string; color: string; icon: React.ElementType }> = {
  admin:     { label: 'מנהל',  color: 'text-yellow-400 border-yellow-400/30 bg-yellow-400/10', icon: Crown },
  moderator: { label: 'מנחה',  color: 'text-blue-400 border-blue-400/30 bg-blue-400/10',       icon: Shield },
  user:      { label: 'משתמש', color: 'text-gray-400 border-gray-500/30 bg-gray-500/10',        icon: UserIcon },
};

function RoleBadge({ role }: { role?: string }) {
  const cfg = ROLE_CONFIG[role ?? 'user'] ?? ROLE_CONFIG.user;
  const Icon = cfg.icon;
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 text-xs rounded-full border ${cfg.color}`}>
      <Icon className="w-3 h-3" />
      {cfg.label}
    </span>
  );
}

function StatCard({ icon: Icon, label, value, color }: {
  icon: React.ElementType; label: string; value: number | string; color: string;
}) {
  return (
    <div className={`bg-gray-900 border border-gray-800 rounded-2xl p-5 flex items-center gap-4`}>
      <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${color}`}>
        <Icon className="w-6 h-6" />
      </div>
      <div>
        <p className="text-2xl font-bold text-white">{value}</p>
        <p className="text-xs text-gray-400 mt-0.5">{label}</p>
      </div>
    </div>
  );
}

export default function AdminPage() {
  const { user, profile, updateUserProfile } = useAuth();

  const [users, setUsers] = useState<AdminUser[]>([]);
  const [stats, setStats] = useState<Stats>({
    totalUsers: 0, onlineNow: 0, active24h: 0,
    admins: 0, moderators: 0, totalContacts: 0,
    totalPosts: 0, totalChats: 0,
  });
  const [loading, setLoading] = useState(true);
  const [noAdminExists, setNoAdminExists] = useState(false);
  const [claiming, setClaiming] = useState(false);
  const [search, setSearch] = useState('');
  const [updatingRole, setUpdatingRole] = useState<string | null>(null);
  const [openDropdown, setOpenDropdown] = useState<string | null>(null);
  const [contactDepts, setContactDepts] = useState<Record<string, number>>({});

  const isAdmin = profile?.siteRole === 'admin';

  const loadData = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      // Check if any admin exists (for bootstrap)
      const adminQ = query(collection(db, 'users'), where('siteRole', '==', 'admin'), limit(1));
      const adminSnap = await getDocs(adminQ);
      const hasAdmin = !adminSnap.empty;
      setNoAdminExists(!hasAdmin);

      if (!isAdmin && hasAdmin) {
        setLoading(false);
        return;
      }

      const [usersSnap, contactsSnap, postsSnap, chatsSnap] = await Promise.all([
        getDocs(collection(db, 'users')),
        getDocs(collection(db, 'contacts')),
        getDocs(collection(db, 'posts')),
        getDocs(collection(db, 'chats')),
      ]);

      const usersData: AdminUser[] = usersSnap.docs.map(d => ({
        uid: d.id,
        displayName: '',
        email: '',
        role: '',
        department: '',
        isOnline: false,
        ...d.data(),
      } as AdminUser));

      setUsers(usersData);

      // Department breakdown
      const depts: Record<string, number> = {};
      for (const d of contactsSnap.docs) {
        const dept = (d.data().department as string) || 'כללי';
        depts[dept] = (depts[dept] ?? 0) + 1;
      }
      setContactDepts(depts);

      const now = new Date();
      const h24ago = new Date(now.getTime() - 24 * 3600 * 1000);

      setStats({
        totalUsers: usersData.length,
        onlineNow: usersData.filter(u => u.isOnline).length,
        active24h: usersData.filter(u => u.lastSeen && new Date(u.lastSeen) > h24ago).length,
        admins: usersData.filter(u => u.siteRole === 'admin').length,
        moderators: usersData.filter(u => u.siteRole === 'moderator').length,
        totalContacts: contactsSnap.size,
        totalPosts: postsSnap.size,
        totalChats: chatsSnap.size,
      });
    } catch (err) {
      console.error('Admin load error:', err);
    } finally {
      setLoading(false);
    }
  }, [user, isAdmin]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  async function claimAdmin() {
    if (!user || !noAdminExists) return;
    setClaiming(true);
    try {
      await updateUserProfile({ siteRole: 'admin' });
      // Reload page to re-evaluate access
      window.location.reload();
    } catch (err) {
      console.error('Claim admin error:', err);
      setClaiming(false);
    }
  }

  async function setUserRole(uid: string, newSiteRole: 'admin' | 'moderator' | null) {
    if (!isAdmin) return;
    setUpdatingRole(uid);
    setOpenDropdown(null);
    try {
      await updateDoc(doc(db, 'users', uid), {
        siteRole: newSiteRole,
        updatedAt: serverTimestamp(),
      });
      setUsers(prev => prev.map(u =>
        u.uid === uid ? { ...u, siteRole: newSiteRole ?? undefined } : u
      ));
      setStats(prev => ({
        ...prev,
        admins: prev.admins + (newSiteRole === 'admin' ? 1 : 0),
        moderators: prev.moderators + (newSiteRole === 'moderator' ? 1 : 0),
      }));
    } catch (err) {
      console.error('setUserRole error:', err);
    } finally {
      setUpdatingRole(null);
    }
  }

  function formatLastSeen(lastSeen?: string) {
    if (!lastSeen) return '—';
    const d = new Date(lastSeen);
    const diff = Date.now() - d.getTime();
    if (diff < 60_000) return 'עכשיו';
    if (diff < 3_600_000) return `לפני ${Math.floor(diff / 60_000)} דק׳`;
    if (diff < 86_400_000) return `לפני ${Math.floor(diff / 3_600_000)} ש׳`;
    return d.toLocaleDateString('he-IL');
  }

  // ── Not logged in ──────────────────────────────────────────────────
  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center" dir="rtl">
        <p className="text-gray-400">יש להתחבר תחילה</p>
      </div>
    );
  }

  // ── Loading ────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center gap-3" dir="rtl">
        <RefreshCw className="w-5 h-5 text-purple-400 animate-spin" />
        <p className="text-gray-400">טוען נתוני ניהול...</p>
      </div>
    );
  }

  // ── Bootstrap: no admin exists yet ────────────────────────────────
  if (!isAdmin && noAdminExists) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-8 p-8 bg-gray-950" dir="rtl">
        <div className="text-center space-y-4 max-w-md">
          <div className="w-20 h-20 rounded-full bg-yellow-400/10 border border-yellow-400/30 flex items-center justify-center mx-auto">
            <Crown className="w-10 h-10 text-yellow-400" />
          </div>
          <h1 className="text-2xl font-bold text-white">הגדרת מנהל ראשון</h1>
          <p className="text-gray-400 leading-relaxed">
            לא קיים מנהל מערכת. כבעלים של <span className="text-white font-medium">TV Industry IL</span>,
            לחץ לקחת גישת מנהל מלאה.
          </p>
          <div className="bg-gray-900 border border-gray-700 rounded-xl p-4 text-sm text-right space-y-1">
            <p className="text-gray-300">👤 {profile?.displayName || user.email}</p>
            <p className="text-gray-500">{user.email}</p>
          </div>
        </div>
        <button
          onClick={claimAdmin}
          disabled={claiming}
          className="px-10 py-4 bg-yellow-500 hover:bg-yellow-400 text-black rounded-2xl font-bold text-lg transition-colors disabled:opacity-50 flex items-center gap-3"
        >
          <Crown className="w-5 h-5" />
          {claiming ? 'מגדיר גישת מנהל...' : 'קח גישת מנהל'}
        </button>
      </div>
    );
  }

  // ── Not admin (but admins exist) ───────────────────────────────────
  if (!isAdmin) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4 p-8 bg-gray-950" dir="rtl">
        <Ban className="w-16 h-16 text-red-400" />
        <p className="text-red-400 font-bold text-xl">גישה מוגבלת למנהלים בלבד</p>
        <Link href="/" className="text-purple-400 hover:underline">חזרה לדף הבית</Link>
      </div>
    );
  }

  // ── Filtered users ─────────────────────────────────────────────────
  const filtered = search
    ? users.filter(u => {
        const t = search.toLowerCase();
        return (
          u.displayName?.toLowerCase().includes(t) ||
          u.email?.toLowerCase().includes(t) ||
          u.role?.toLowerCase().includes(t) ||
          u.department?.toLowerCase().includes(t)
        );
      })
    : users;

  const deptEntries = Object.entries(contactDepts).sort((a, b) => b[1] - a[1]);

  return (
    <div className="min-h-screen bg-gray-950 text-white pb-16" dir="rtl">
      <div className="max-w-7xl mx-auto px-4 py-8 space-y-8">

        {/* ── Header ── */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <ShieldCheck className="w-7 h-7 text-yellow-400" />
              <h1 className="text-3xl font-bold">לוח ניהול</h1>
            </div>
            <p className="text-gray-400 text-sm">
              TV Industry IL · שלום, <span className="text-white">{profile?.displayName}</span>
            </p>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={() => loadData()}
              className="p-2 rounded-xl bg-gray-800 hover:bg-gray-700 text-gray-400 hover:text-white transition-colors"
              title="רענן נתונים"
            >
              <RefreshCw className="w-4 h-4" />
            </button>
            <Link
              href="/admin/sync"
              className="flex items-center gap-2 px-4 py-2 bg-purple-600 hover:bg-purple-700 rounded-xl text-sm font-semibold transition-colors"
            >
              <Wrench className="w-4 h-4" />
              כלי סנכרון
              <ArrowLeft className="w-4 h-4" />
            </Link>
          </div>
        </div>

        {/* ── Stats Grid ── */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <StatCard icon={Users}       label="משתמשים רשומים"   value={stats.totalUsers}    color="bg-blue-500/20 text-blue-400" />
          <StatCard icon={Wifi}        label="מחוברים עכשיו"    value={stats.onlineNow}     color="bg-green-500/20 text-green-400" />
          <StatCard icon={Activity}    label="פעילים ב-24 שעות" value={stats.active24h}     color="bg-teal-500/20 text-teal-400" />
          <StatCard icon={Crown}       label="מנהלים"           value={stats.admins}        color="bg-yellow-500/20 text-yellow-400" />
          <StatCard icon={Contact2}    label="אנשי קשר"         value={stats.totalContacts} color="bg-purple-500/20 text-purple-400" />
          <StatCard icon={FileText}    label="פוסטים בלוח"      value={stats.totalPosts}    color="bg-pink-500/20 text-pink-400" />
          <StatCard icon={MessageCircle} label="שיחות צ\'אט"  value={stats.totalChats}    color="bg-indigo-500/20 text-indigo-400" />
          <StatCard icon={Shield}      label="מנחים"            value={stats.moderators}    color="bg-sky-500/20 text-sky-400" />
        </div>

        {/* ── Main Grid: Users + Contact Depts ── */}
        <div className="grid grid-cols-1 xl:grid-cols-4 gap-6">

          {/* ── User Management ── */}
          <div className="xl:col-span-3 bg-gray-900 border border-gray-800 rounded-2xl overflow-hidden">
            <div className="p-5 border-b border-gray-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <Users className="w-5 h-5 text-purple-400" />
                <h2 className="font-bold text-lg">ניהול משתמשים</h2>
                <span className="text-xs text-gray-500 bg-gray-800 px-2 py-0.5 rounded-full">{stats.totalUsers}</span>
              </div>
              <div className="relative">
                <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
                <input
                  type="text"
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  placeholder="חיפוש משתמש..."
                  className="pr-9 pl-4 py-2 bg-gray-800 border border-gray-700 rounded-xl text-sm text-white placeholder-gray-500 focus:outline-none focus:border-purple-500 w-56"
                />
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-800 text-gray-500 text-xs">
                    <th className="text-right py-3 px-5 font-medium">משתמש</th>
                    <th className="text-right py-3 px-4 font-medium hidden md:table-cell">אימייל</th>
                    <th className="text-right py-3 px-4 font-medium hidden lg:table-cell">תפקיד / מחלקה</th>
                    <th className="text-right py-3 px-4 font-medium">רמת גישה</th>
                    <th className="text-right py-3 px-4 font-medium hidden sm:table-cell">פעילות אחרונה</th>
                    <th className="py-3 px-4 font-medium">פעולות</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map(u => (
                    <tr
                      key={u.uid}
                      className="border-b border-gray-800/50 hover:bg-gray-800/30 transition-colors"
                    >
                      {/* Name + avatar */}
                      <td className="py-3 px-5">
                        <div className="flex items-center gap-3">
                          <div className="relative flex-shrink-0">
                            <div className="w-8 h-8 rounded-full bg-purple-600 flex items-center justify-center text-xs font-bold">
                              {u.displayName?.charAt(0) || '?'}
                            </div>
                            {u.isOnline && (
                              <span className="absolute -bottom-0.5 -left-0.5 w-3 h-3 bg-green-400 border-2 border-gray-900 rounded-full" />
                            )}
                          </div>
                          <div>
                            <p className="font-medium text-white">{u.displayName || '—'}</p>
                            <p className="text-xs text-gray-500 md:hidden">{u.email}</p>
                          </div>
                        </div>
                      </td>

                      {/* Email */}
                      <td className="py-3 px-4 text-gray-400 hidden md:table-cell max-w-[160px] truncate">
                        {u.email || '—'}
                      </td>

                      {/* Role / Department */}
                      <td className="py-3 px-4 hidden lg:table-cell">
                        <p className="text-white">{u.role || '—'}</p>
                        <p className="text-xs text-gray-500">{u.department || '—'}</p>
                      </td>

                      {/* siteRole badge */}
                      <td className="py-3 px-4">
                        <RoleBadge role={u.siteRole} />
                      </td>

                      {/* Last seen */}
                      <td className="py-3 px-4 hidden sm:table-cell">
                        <div className="flex items-center gap-1.5 text-gray-400 text-xs">
                          {u.isOnline
                            ? <><Wifi className="w-3 h-3 text-green-400" /><span className="text-green-400">מחובר</span></>
                            : <><WifiOff className="w-3 h-3" />{formatLastSeen(u.lastSeen)}</>
                          }
                        </div>
                      </td>

                      {/* Actions */}
                      <td className="py-3 px-4">
                        {u.uid === user?.uid ? (
                          <span className="text-xs text-gray-600">אתה</span>
                        ) : (
                          <div className="relative">
                            <button
                              onClick={() => setOpenDropdown(openDropdown === u.uid ? null : u.uid)}
                              disabled={updatingRole === u.uid}
                              className="flex items-center gap-1 px-3 py-1.5 bg-gray-800 hover:bg-gray-700 border border-gray-700 rounded-lg text-xs font-medium transition-colors disabled:opacity-40"
                            >
                              {updatingRole === u.uid
                                ? <RefreshCw className="w-3 h-3 animate-spin" />
                                : <><Eye className="w-3 h-3" /><span>שנה גישה</span><ChevronDown className="w-3 h-3" /></>
                              }
                            </button>

                            {openDropdown === u.uid && (
                              <div className="absolute left-0 top-full mt-1 bg-gray-800 border border-gray-700 rounded-xl shadow-xl z-20 min-w-[140px] overflow-hidden">
                                {[
                                  { role: 'admin' as const,     label: 'מנהל',  icon: Crown,     color: 'text-yellow-400' },
                                  { role: 'moderator' as const, label: 'מנחה',  icon: Shield,    color: 'text-blue-400'   },
                                  { role: null,                 label: 'משתמש', icon: UserIcon,  color: 'text-gray-400'   },
                                ].map(opt => {
                                  const Icon = opt.icon;
                                  const current = (u.siteRole ?? null) === opt.role;
                                  return (
                                    <button
                                      key={opt.label}
                                      onClick={() => setUserRole(u.uid, opt.role as 'admin' | 'moderator' | null)}
                                      disabled={current}
                                      className={`w-full flex items-center gap-2 px-4 py-2.5 text-sm transition-colors ${
                                        current
                                          ? 'bg-gray-700/50 cursor-default opacity-60'
                                          : 'hover:bg-gray-700 cursor-pointer'
                                      } ${opt.color}`}
                                    >
                                      <Icon className="w-3.5 h-3.5" />
                                      {opt.label}
                                      {current && <span className="mr-auto text-xs text-gray-500">נוכחי</span>}
                                    </button>
                                  );
                                })}
                              </div>
                            )}
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}

                  {filtered.length === 0 && (
                    <tr>
                      <td colSpan={6} className="py-12 text-center text-gray-500">
                        {search ? 'לא נמצאו משתמשים' : 'אין משתמשים רשומים'}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* ── Sidebar: Contacts by dept + Quick Actions ── */}
          <div className="space-y-4">

            {/* Contacts breakdown */}
            <div className="bg-gray-900 border border-gray-800 rounded-2xl p-5">
              <div className="flex items-center gap-2 mb-4">
                <BarChart3 className="w-5 h-5 text-purple-400" />
                <h3 className="font-bold">אנשי קשר לפי מחלקה</h3>
              </div>
              <div className="space-y-2.5">
                {deptEntries.map(([dept, count]) => (
                  <div key={dept} className="flex items-center justify-between gap-2">
                    <span className="text-sm text-gray-300">{dept}</span>
                    <div className="flex items-center gap-2">
                      <div
                        className="h-1.5 rounded-full bg-purple-500/60"
                        style={{ width: `${Math.round((count / stats.totalContacts) * 80)}px` }}
                      />
                      <span className="text-xs text-gray-400 w-6 text-left">{count}</span>
                    </div>
                  </div>
                ))}
                {deptEntries.length === 0 && (
                  <p className="text-sm text-gray-500 text-center py-2">אין נתונים</p>
                )}
              </div>
            </div>

            {/* Quick Actions */}
            <div className="bg-gray-900 border border-gray-800 rounded-2xl p-5">
              <div className="flex items-center gap-2 mb-4">
                <Wrench className="w-5 h-5 text-purple-400" />
                <h3 className="font-bold">פעולות מהירות</h3>
              </div>
              <div className="space-y-2">
                <Link
                  href="/admin/sync"
                  className="flex items-center justify-between p-3 bg-gray-800 hover:bg-gray-700 rounded-xl transition-colors group"
                >
                  <div className="flex items-center gap-2 text-sm">
                    <Database className="w-4 h-4 text-purple-400" />
                    <span>סנכרון וייבוא</span>
                  </div>
                  <ArrowLeft className="w-4 h-4 text-gray-500 group-hover:text-white transition-colors" />
                </Link>
                <Link
                  href="/directory"
                  className="flex items-center justify-between p-3 bg-gray-800 hover:bg-gray-700 rounded-xl transition-colors group"
                >
                  <div className="flex items-center gap-2 text-sm">
                    <Contact2 className="w-4 h-4 text-purple-400" />
                    <span>אלפון אנשי קשר</span>
                  </div>
                  <ArrowLeft className="w-4 h-4 text-gray-500 group-hover:text-white transition-colors" />
                </Link>
                <Link
                  href="/board"
                  className="flex items-center justify-between p-3 bg-gray-800 hover:bg-gray-700 rounded-xl transition-colors group"
                >
                  <div className="flex items-center gap-2 text-sm">
                    <FileText className="w-4 h-4 text-purple-400" />
                    <span>לוח מודעות</span>
                  </div>
                  <ArrowLeft className="w-4 h-4 text-gray-500 group-hover:text-white transition-colors" />
                </Link>
                <Link
                  href="/chat"
                  className="flex items-center justify-between p-3 bg-gray-800 hover:bg-gray-700 rounded-xl transition-colors group"
                >
                  <div className="flex items-center gap-2 text-sm">
                    <MessageCircle className="w-4 h-4 text-purple-400" />
                    <span>שיחות צ&#39;אט</span>
                  </div>
                  <ArrowLeft className="w-4 h-4 text-gray-500 group-hover:text-white transition-colors" />
                </Link>
              </div>
            </div>

            {/* System info */}
            <div className="bg-gray-900 border border-gray-800 rounded-2xl p-5 space-y-3">
              <div className="flex items-center gap-2 mb-1">
                <Activity className="w-5 h-5 text-purple-400" />
                <h3 className="font-bold">מידע מערכת</h3>
              </div>
              {[
                { label: 'Firebase Project', value: 'tv-industry-il' },
                { label: 'Platform', value: 'Vercel' },
                { label: 'Runtime', value: 'Next.js 16 App Router' },
                { label: 'Database', value: 'Firestore' },
              ].map(({ label, value }) => (
                <div key={label} className="flex justify-between text-xs">
                  <span className="text-gray-500">{label}</span>
                  <span className="text-gray-300 font-mono">{value}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

      </div>

      {/* Close dropdown on outside click */}
      {openDropdown && (
        <div
          className="fixed inset-0 z-10"
          onClick={() => setOpenDropdown(null)}
        />
      )}
    </div>
  );
}
