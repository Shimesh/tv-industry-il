'use client';

import { useState, useEffect, useRef } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { db } from '@/lib/firebase';
import {
  collection, doc, onSnapshot, updateDoc, setDoc, getDocs,
  query, where, limit, serverTimestamp,
  clearIndexedDbPersistence, terminate, type Timestamp,
} from 'firebase/firestore';
import Link from 'next/link';
import {
  Users, Contact2, FileText, MessageCircle, ShieldCheck, Activity,
  Search, RefreshCw, Crown, Shield, UserIcon, Eye, Ban, ChevronDown,
  ArrowLeft, Wrench, Database, BarChart3, Wifi, WifiOff,
  AlertTriangle, Megaphone, Trash2, CheckCircle, Save, Settings,
} from 'lucide-react';

/* ─── Types ─────────────────────────────────────────────────── */

interface AdminUser {
  uid: string;
  displayName: string;
  email: string;
  role: string;
  department: string;
  siteRole?: string;
  isOnline: boolean;
  lastSeen?: unknown;     // ISO string OR Firestore Timestamp
  onboardingComplete?: boolean;
  photoURL?: string | null;
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

interface AppConfig {
  maintenanceMode: boolean;
  boardAnnouncement: string;
}

/* ─── Helpers ───────────────────────────────────────────────── */

/** Normalise any lastSeen representation → ms epoch (or null). */
function toMs(v: unknown): number | null {
  if (!v) return null;
  if (typeof v === 'string') return new Date(v).getTime();
  if (typeof v === 'number') return v;
  if (typeof v === 'object' && 'toDate' in (v as object)) {
    return (v as Timestamp).toDate().getTime();
  }
  return null;
}

function formatLastSeen(v: unknown): string {
  const ms = toMs(v);
  if (!ms || isNaN(ms)) return '—';
  const diff = Date.now() - ms;
  if (diff < 60_000)     return 'עכשיו';
  if (diff < 3_600_000)  return `לפני ${Math.floor(diff / 60_000)} דק׳`;
  if (diff < 86_400_000) return `לפני ${Math.floor(diff / 3_600_000)} ש׳`;
  return new Date(ms).toLocaleDateString('he-IL');
}

/* ─── Sub-components ────────────────────────────────────────── */

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

function StatCard({
  icon: Icon, label, value, color, live = false,
}: {
  icon: React.ElementType; label: string; value: number; color: string; live?: boolean;
}) {
  return (
    <div className="bg-gray-900 border border-gray-800 rounded-2xl p-5 flex items-center gap-4">
      <div className={`w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0 ${color}`}>
        <Icon className="w-6 h-6" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-2xl font-bold text-white">{value}</p>
        <p className="text-xs text-gray-400 mt-0.5">{label}</p>
      </div>
      {live && <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse flex-shrink-0" title="שידור חי" />}
    </div>
  );
}

/* ─── Constants ─────────────────────────────────────────────── */

const EMPTY_STATS: Stats = {
  totalUsers: 0, onlineNow: 0, active24h: 0,
  admins: 0, moderators: 0,
  totalContacts: 0, totalPosts: 0, totalChats: 0,
};

/* ─── Main Component ────────────────────────────────────────── */

export default function AdminPage() {
  const { user, profile, loading: authLoading, updateUserProfile } = useAuth();

  const [users, setUsers]               = useState<AdminUser[]>([]);
  const [stats, setStats]               = useState<Stats>(EMPTY_STATS);
  const [contactDepts, setContactDepts] = useState<Record<string, number>>({});
  const [appConfig, setAppConfig]       = useState<AppConfig>({ maintenanceMode: false, boardAnnouncement: '' });
  const [dataLoading, setDataLoading]   = useState(true);
  const [error, setError]               = useState<string | null>(null);
  const [noAdminExists, setNoAdminExists] = useState(false);
  const [claiming, setClaiming]         = useState(false);

  // User table
  const [search, setSearch]             = useState('');
  const [updatingRole, setUpdatingRole] = useState<string | null>(null);
  const [openDropdown, setOpenDropdown] = useState<string | null>(null);

  // Admin controls
  const [announcementDraft, setAnnouncementDraft] = useState('');
  const [savingAnnouncement, setSavingAnnouncement] = useState(false);
  const [togglingMaintenance, setTogglingMaintenance] = useState(false);
  const [clearingCache, setClearingCache] = useState(false);
  const [toast, setToast] = useState<{ type: 'ok' | 'err'; msg: string } | null>(null);

  const configInitialized = useRef(false);
  const isAdmin = profile?.siteRole === 'admin';

  /* ── Toast helper ─────────────────────────────────────────── */
  function showToast(type: 'ok' | 'err', msg: string) {
    setToast({ type, msg });
    setTimeout(() => setToast(null), 3000);
  }

  /* ── Real-time data setup ─────────────────────────────────── */
  useEffect(() => {
    // Wait for Firebase Auth + profile to fully resolve before deciding access
    if (authLoading) return;
    if (!user) { setDataLoading(false); return; }

    const unsubs: (() => void)[] = [];

    async function setup() {
      setDataLoading(true);
      setError(null);
      configInitialized.current = false;

      try {
        // Bootstrap: does ANY admin account exist?
        const adminQ = query(collection(db, 'users'), where('siteRole', '==', 'admin'), limit(1));
        const adminSnap = await getDocs(adminQ);
        setNoAdminExists(adminSnap.empty);

        if (!isAdmin && !adminSnap.empty) {
          setDataLoading(false);
          return;
        }

        /* Users — real-time listener ───────────────────────── */
        unsubs.push(onSnapshot(
          collection(db, 'users'),
          (snap) => {
            const h24 = Date.now() - 86_400_000;
            const usersData: AdminUser[] = snap.docs.map(d => ({
              uid: d.id, displayName: '', email: '', role: '',
              department: '', isOnline: false,
              ...d.data(),
            } as AdminUser));

            setUsers(usersData);
            setStats(prev => ({
              ...prev,
              totalUsers:  usersData.length,
              onlineNow:   usersData.filter(u => u.isOnline === true).length,
              active24h:   usersData.filter(u => { const ms = toMs(u.lastSeen); return ms !== null && ms > h24; }).length,
              admins:      usersData.filter(u => u.siteRole === 'admin').length,
              moderators:  usersData.filter(u => u.siteRole === 'moderator').length,
            }));
            setDataLoading(false);
          },
          (err) => {
            setError('שגיאה בטעינת משתמשים: ' + err.message);
            setDataLoading(false);
          },
        ));

        /* Contacts — real-time listener ────────────────────── */
        unsubs.push(onSnapshot(
          collection(db, 'contacts'),
          (snap) => {
            const depts: Record<string, number> = {};
            for (const d of snap.docs) {
              const dept = (d.data().department as string) || 'כללי';
              depts[dept] = (depts[dept] ?? 0) + 1;
            }
            setContactDepts(depts);
            setStats(prev => ({ ...prev, totalContacts: snap.size }));
          },
        ));

        /* Posts — one-time (sufficient for a count) ────────── */
        getDocs(collection(db, 'posts'))
          .then(snap => setStats(prev => ({ ...prev, totalPosts: snap.size })))
          .catch(() => {});

        /* Chats — one-time (admin rule allows full read) ───── */
        getDocs(collection(db, 'chats'))
          .then(snap => setStats(prev => ({ ...prev, totalChats: snap.size })))
          .catch(() => {});

        /* App config — real-time listener ──────────────────── */
        unsubs.push(onSnapshot(
          doc(db, 'appConfig', 'global'),
          (snap) => {
            if (snap.exists()) {
              const data = snap.data() as AppConfig;
              setAppConfig(data);
              // Initialise draft only on first load — don't override unsaved edits
              if (!configInitialized.current) {
                setAnnouncementDraft(data.boardAnnouncement || '');
                configInitialized.current = true;
              }
            }
          },
        ));

      } catch (err) {
        setError('שגיאה בטעינת נתוני ניהול: ' + (err instanceof Error ? err.message : String(err)));
        setDataLoading(false);
      }
    }

    setup();
    return () => unsubs.forEach(fn => fn());
  }, [user, isAdmin, authLoading]);

  /* ── Claim first admin ───────────────────────────────────── */
  async function claimAdmin() {
    if (!user || !noAdminExists) return;
    setClaiming(true);
    try {
      await updateUserProfile({ siteRole: 'admin' });
      window.location.reload();
    } catch {
      setClaiming(false);
    }
  }

  /* ── Change user role ────────────────────────────────────── */
  async function setUserRole(uid: string, newSiteRole: 'admin' | 'moderator' | null) {
    if (!isAdmin) return;
    setUpdatingRole(uid);
    setOpenDropdown(null);
    try {
      await updateDoc(doc(db, 'users', uid), {
        siteRole: newSiteRole,
        updatedAt: serverTimestamp(),
      });
      // onSnapshot updates state automatically
    } catch (err) {
      showToast('err', 'שגיאה בשינוי הרשאות: ' + (err instanceof Error ? err.message : ''));
    } finally {
      setUpdatingRole(null);
    }
  }

  /* ── Toggle maintenance mode ─────────────────────────────── */
  async function toggleMaintenance() {
    setTogglingMaintenance(true);
    try {
      await setDoc(doc(db, 'appConfig', 'global'), {
        maintenanceMode: !appConfig.maintenanceMode,
        boardAnnouncement: appConfig.boardAnnouncement || '',
        updatedAt: serverTimestamp(),
      }, { merge: true });
      showToast('ok', appConfig.maintenanceMode ? 'מצב תחזוקה כובה' : 'מצב תחזוקה הופעל');
    } catch (err) {
      showToast('err', 'שגיאה: ' + (err instanceof Error ? err.message : ''));
    } finally {
      setTogglingMaintenance(false);
    }
  }

  /* ── Save announcement ───────────────────────────────────── */
  async function saveAnnouncement() {
    setSavingAnnouncement(true);
    try {
      await setDoc(doc(db, 'appConfig', 'global'), {
        boardAnnouncement: announcementDraft.trim(),
        maintenanceMode: appConfig.maintenanceMode,
        updatedAt: serverTimestamp(),
      }, { merge: true });
      showToast('ok', 'ההודעה נשמרה בהצלחה');
    } catch (err) {
      showToast('err', 'שגיאה בשמירה: ' + (err instanceof Error ? err.message : ''));
    } finally {
      setSavingAnnouncement(false);
    }
  }

  /* ── Clear IndexedDB offline cache ───────────────────────── */
  async function clearCache() {
    if (!confirm('פעולה זו תאפס את ה-Cache המקומי ותטען את הדף מחדש. להמשיך?')) return;
    setClearingCache(true);
    try {
      await terminate(db);
      await clearIndexedDbPersistence(db);
      window.location.reload();
    } catch (err) {
      showToast('err', 'שגיאה בניקוי Cache: ' + (err instanceof Error ? err.message : ''));
      setClearingCache(false);
    }
  }

  /* ─────────────────────────────── Guards ─────────────────── */

  if (authLoading || dataLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center gap-3 bg-gray-950" dir="rtl">
        <RefreshCw className="w-5 h-5 text-purple-400 animate-spin" />
        <p className="text-gray-400">טוען נתוני ניהול...</p>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-950" dir="rtl">
        <p className="text-gray-400">יש להתחבר תחילה</p>
      </div>
    );
  }

  if (noAdminExists) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-8 p-8 bg-gray-950" dir="rtl">
        <div className="text-center space-y-4 max-w-md">
          <div className="w-20 h-20 rounded-full bg-yellow-400/10 border border-yellow-400/30 flex items-center justify-center mx-auto">
            <Crown className="w-10 h-10 text-yellow-400" />
          </div>
          <h1 className="text-2xl font-bold text-white">הגדרת מנהל ראשון</h1>
          <p className="text-gray-400 leading-relaxed">
            לא קיים מנהל מערכת. כבעלים של{' '}
            <span className="text-white font-medium">TV Industry IL</span>,
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

  if (!isAdmin) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4 p-8 bg-gray-950" dir="rtl">
        <Ban className="w-16 h-16 text-red-400" />
        <p className="text-red-400 font-bold text-xl">גישה מוגבלת למנהלים בלבד</p>
        <Link href="/" className="text-purple-400 hover:underline">חזרה לדף הבית</Link>
      </div>
    );
  }

  /* ─────────────────────── Derived data ──────────────────── */

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
  const totalContacts = stats.totalContacts || 1; // prevent /0

  /* ─────────────────────────── Render ────────────────────── */

  return (
    <div className="min-h-screen bg-gray-950 text-white pb-16" dir="rtl">

      {/* Floating toast */}
      {toast && (
        <div className={`fixed top-4 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2 px-5 py-3 rounded-2xl shadow-xl text-sm font-medium pointer-events-none ${
          toast.type === 'ok'
            ? 'bg-green-900/95 border border-green-500/40 text-green-300'
            : 'bg-red-900/95 border border-red-500/40 text-red-300'
        }`}>
          {toast.type === 'ok'
            ? <CheckCircle className="w-4 h-4" />
            : <AlertTriangle className="w-4 h-4" />
          }
          {toast.msg}
        </div>
      )}

      <div className="max-w-7xl mx-auto px-4 py-8 space-y-8">

        {/* Error banner */}
        {error && (
          <div className="bg-red-900/30 border border-red-500/40 rounded-2xl p-4 flex items-center gap-3 text-red-400">
            <AlertTriangle className="w-5 h-5 flex-shrink-0" />
            <p className="text-sm flex-1">{error}</p>
            <button
              onClick={() => setError(null)}
              className="text-red-500 hover:text-red-300 text-lg leading-none"
            >
              ✕
            </button>
          </div>
        )}

        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <ShieldCheck className="w-7 h-7 text-yellow-400" />
              <h1 className="text-3xl font-bold">לוח ניהול</h1>
              <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse" title="שידור חי" />
            </div>
            <p className="text-gray-400 text-sm">
              TV Industry IL · שלום,{' '}
              <span className="text-white">{profile?.displayName}</span>
            </p>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={() => window.location.reload()}
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

        {/* Stats Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <StatCard icon={Users}         label="משתמשים רשומים"   value={stats.totalUsers}    color="bg-blue-500/20 text-blue-400" />
          <StatCard icon={Wifi}          label="מחוברים עכשיו"    value={stats.onlineNow}     color="bg-green-500/20 text-green-400"   live />
          <StatCard icon={Activity}      label="פעילים ב-24 שעות" value={stats.active24h}     color="bg-teal-500/20 text-teal-400"     live />
          <StatCard icon={Crown}         label="מנהלים"           value={stats.admins}        color="bg-yellow-500/20 text-yellow-400" />
          <StatCard icon={Contact2}      label="אנשי קשר"         value={stats.totalContacts} color="bg-purple-500/20 text-purple-400" live />
          <StatCard icon={FileText}      label="פוסטים בלוח"      value={stats.totalPosts}    color="bg-pink-500/20 text-pink-400" />
          <StatCard icon={MessageCircle} label="שיחות צ'אט"       value={stats.totalChats}    color="bg-indigo-500/20 text-indigo-400" />
          <StatCard icon={Shield}        label="מנחים"            value={stats.moderators}    color="bg-sky-500/20 text-sky-400" />
        </div>

        {/* Main Grid */}
        <div className="grid grid-cols-1 xl:grid-cols-4 gap-6">

          {/* User Management Table */}
          <div className="xl:col-span-3 bg-gray-900 border border-gray-800 rounded-2xl overflow-hidden">
            <div className="p-5 border-b border-gray-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <Users className="w-5 h-5 text-purple-400" />
                <h2 className="font-bold text-lg">ניהול משתמשים</h2>
                <span className="text-xs text-gray-500 bg-gray-800 px-2 py-0.5 rounded-full">
                  {stats.totalUsers}
                </span>
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
                            {u.photoURL ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img src={u.photoURL} alt="" className="w-8 h-8 rounded-full object-cover" />
                            ) : (
                              <div className="w-8 h-8 rounded-full bg-purple-600 flex items-center justify-center text-xs font-bold">
                                {u.displayName?.charAt(0) || '?'}
                              </div>
                            )}
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
                      <td className="py-3 px-4 text-gray-400 hidden md:table-cell max-w-[160px]">
                        <span className="truncate block">{u.email || '—'}</span>
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
                                  { role: 'admin' as const,     label: 'מנהל',  icon: Crown,    color: 'text-yellow-400' },
                                  { role: 'moderator' as const, label: 'מנחה',  icon: Shield,   color: 'text-blue-400'   },
                                  { role: null,                 label: 'משתמש', icon: UserIcon, color: 'text-gray-400'   },
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
                                      {current && (
                                        <span className="mr-auto text-xs text-gray-500">נוכחי</span>
                                      )}
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

          {/* Sidebar */}
          <div className="space-y-4">

            {/* Contacts by department */}
            <div className="bg-gray-900 border border-gray-800 rounded-2xl p-5">
              <div className="flex items-center gap-2 mb-4">
                <BarChart3 className="w-5 h-5 text-purple-400" />
                <h3 className="font-bold">אנשי קשר לפי מחלקה</h3>
              </div>
              <div className="space-y-3">
                {deptEntries.map(([dept, count]) => (
                  <div key={dept}>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs text-gray-300">{dept}</span>
                      <span className="text-xs text-gray-400 tabular-nums">
                        {count} ({Math.round(count / totalContacts * 100)}%)
                      </span>
                    </div>
                    <div className="h-1.5 rounded-full bg-gray-800 overflow-hidden">
                      <div
                        className="h-full rounded-full bg-purple-500 transition-all duration-500"
                        style={{ width: `${Math.round(count / totalContacts * 100)}%` }}
                      />
                    </div>
                  </div>
                ))}
                {deptEntries.length === 0 && (
                  <p className="text-sm text-gray-500 text-center py-2">אין נתונים</p>
                )}
              </div>
            </div>

            {/* Quick navigation */}
            <div className="bg-gray-900 border border-gray-800 rounded-2xl p-5">
              <div className="flex items-center gap-2 mb-4">
                <Wrench className="w-5 h-5 text-purple-400" />
                <h3 className="font-bold">ניווט מהיר</h3>
              </div>
              <div className="space-y-2">
                {[
                  { href: '/admin/sync', icon: Database,       label: 'סנכרון וייבוא' },
                  { href: '/directory',  icon: Contact2,       label: 'אלפון אנשי קשר' },
                  { href: '/board',      icon: FileText,       label: 'לוח מודעות' },
                  { href: '/chat',       icon: MessageCircle,  label: "שיחות צ'אט" },
                ].map(({ href, icon: Icon, label }) => (
                  <Link
                    key={href}
                    href={href}
                    className="flex items-center justify-between p-3 bg-gray-800 hover:bg-gray-700 rounded-xl transition-colors group"
                  >
                    <div className="flex items-center gap-2 text-sm">
                      <Icon className="w-4 h-4 text-purple-400" />
                      <span>{label}</span>
                    </div>
                    <ArrowLeft className="w-4 h-4 text-gray-500 group-hover:text-white transition-colors" />
                  </Link>
                ))}
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
                { label: 'Platform',         value: 'Vercel' },
                { label: 'Runtime',          value: 'Next.js 16 App Router' },
                { label: 'Database',         value: 'Firestore (real-time)' },
              ].map(({ label, value }) => (
                <div key={label} className="flex justify-between text-xs">
                  <span className="text-gray-500">{label}</span>
                  <span className="text-gray-300 font-mono">{value}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* ── Admin Controls — full-width section ─────────────── */}
        <div className="bg-gray-900 border border-gray-800 rounded-2xl overflow-hidden">
          <div className="p-5 border-b border-gray-800 flex items-center gap-2">
            <Settings className="w-5 h-5 text-purple-400" />
            <h2 className="font-bold text-lg">בקרת מערכת</h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 divide-y md:divide-y-0 md:divide-x md:divide-x-reverse divide-gray-800">

            {/* 1. Maintenance mode */}
            <div className="p-6 space-y-4">
              <div className="flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-orange-400" />
                <h3 className="font-semibold text-sm">מצב תחזוקה</h3>
              </div>
              <p className="text-xs text-gray-500 leading-relaxed">
                כשמופעל, האתר יציג הודעת תחזוקה למשתמשים שאינם מנהלים.
                מנהלים ממשיכים לגשת כרגיל.
              </p>
              <div className="flex items-center justify-between">
                <span className={`text-sm font-medium ${appConfig.maintenanceMode ? 'text-orange-400' : 'text-gray-400'}`}>
                  {appConfig.maintenanceMode ? '⚠ פעיל' : 'כבוי'}
                </span>
                {/* Toggle — keep LTR so transform direction is predictable */}
                <div dir="ltr">
                  <button
                    onClick={toggleMaintenance}
                    disabled={togglingMaintenance}
                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors duration-200 focus:outline-none disabled:opacity-50 ${
                      appConfig.maintenanceMode ? 'bg-orange-500' : 'bg-gray-600'
                    }`}
                    aria-label="toggle maintenance"
                  >
                    <span
                      className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform duration-200 ${
                        appConfig.maintenanceMode ? 'translate-x-6' : 'translate-x-1'
                      }`}
                    />
                  </button>
                </div>
              </div>
            </div>

            {/* 2. Board announcement */}
            <div className="p-6 space-y-3">
              <div className="flex items-center gap-2">
                <Megaphone className="w-4 h-4 text-blue-400" />
                <h3 className="font-semibold text-sm">הודעה גלובלית ללוח</h3>
              </div>
              <p className="text-xs text-gray-500">
                מוצגת בראש לוח המודעות לכל המשתמשים. השאר ריק להסרה.
              </p>
              <textarea
                value={announcementDraft}
                onChange={e => setAnnouncementDraft(e.target.value)}
                placeholder="כתוב הודעה לכל המשתמשים..."
                rows={3}
                className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-xl text-sm text-white placeholder-gray-500 focus:outline-none focus:border-purple-500 resize-none"
              />
              <button
                onClick={saveAnnouncement}
                disabled={savingAnnouncement}
                className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-sm font-medium transition-colors disabled:opacity-50 w-full justify-center"
              >
                {savingAnnouncement
                  ? <RefreshCw className="w-4 h-4 animate-spin" />
                  : <Save className="w-4 h-4" />
                }
                {savingAnnouncement ? 'שומר...' : 'שמור הודעה'}
              </button>
            </div>

            {/* 3. Cache & tools */}
            <div className="p-6 space-y-3">
              <div className="flex items-center gap-2">
                <Database className="w-4 h-4 text-red-400" />
                <h3 className="font-semibold text-sm">כלים טכניים</h3>
              </div>
              <p className="text-xs text-gray-500 leading-relaxed">
                ניקוי Cache מאפס את IndexedDB המקומי — פותר בעיות תצוגה לא עקבית (כמו
                אנשי קשר שנראים קיימים למרות שנמחקו). הדף יטען מחדש.
              </p>
              <button
                onClick={clearCache}
                disabled={clearingCache}
                className="flex items-center gap-2 px-4 py-2 bg-red-600/80 hover:bg-red-600 text-white rounded-xl text-sm font-medium transition-colors disabled:opacity-50 w-full justify-center"
              >
                {clearingCache
                  ? <RefreshCw className="w-4 h-4 animate-spin" />
                  : <Trash2 className="w-4 h-4" />
                }
                {clearingCache ? 'מנקה...' : 'נקה Cache מקומי'}
              </button>
              <Link
                href="/admin/sync"
                className="flex items-center gap-2 px-4 py-2 bg-gray-800 hover:bg-gray-700 text-gray-300 rounded-xl text-sm font-medium transition-colors w-full justify-center"
              >
                <Wrench className="w-4 h-4" />
                כלי סנכרון נתונים
              </Link>
            </div>

          </div>
        </div>

      </div>

      {/* Backdrop — closes the role dropdown */}
      {openDropdown && (
        <div className="fixed inset-0 z-10" onClick={() => setOpenDropdown(null)} />
      )}
    </div>
  );
}
