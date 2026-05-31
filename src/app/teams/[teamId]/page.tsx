'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useToast } from '@/contexts/ToastContext';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuth } from '@/contexts/AuthContext';
import type { UserProfile } from '@/contexts/AuthContext';
import { useTeam } from '@/hooks/useTeam';
import { TEAM_ROLE_LABELS, isTeamAdmin, type TeamRole, type Team } from '@/types/team';
import AuthGuard from '@/components/AuthGuard';
import UserAvatar from '@/components/UserAvatar';
import { db } from '@/lib/firebase';
import { collection, onSnapshot, getDoc, doc } from 'firebase/firestore';
import Link from 'next/link';
import {
  Users, Settings, Calendar, Crown, Shield, UserIcon, Eye,
  UserPlus, Trash2, LogOut, ArrowRight, MoreVertical,
  Loader2, Search, Check, X, Phone, ExternalLink, Activity,
} from 'lucide-react';

type Tab = 'members' | 'settings';

/* ── helpers ─────────────────────────────────────────────────────────── */

function statusConfig(status: UserProfile['status'] | undefined) {
  switch (status) {
    case 'available':
      return { color: '#4ade80', bg: 'rgba(74,222,128,0.12)', border: 'rgba(74,222,128,0.25)', label: 'זמין/ה' };
    case 'busy':
      return { color: '#fbbf24', bg: 'rgba(251,191,36,0.12)', border: 'rgba(251,191,36,0.25)', label: 'עסוק/ה' };
    default:
      return { color: '#6b7280', bg: 'rgba(107,114,128,0.12)', border: 'rgba(107,114,128,0.12)', label: 'לא מחובר/ת' };
  }
}

function lastSeenText(ts: number | null | undefined): string | null {
  if (!ts) return null;
  const diffMs = Date.now() - ts;
  const mins = Math.floor(diffMs / 60000);
  const hours = Math.floor(mins / 60);
  const days = Math.floor(hours / 24);
  if (days > 0) return `פעיל/ה לפני ${days} ${days === 1 ? 'יום' : 'ימים'}`;
  if (hours > 0) return `פעיל/ה לפני ${hours} ${hours === 1 ? 'שעה' : 'שעות'}`;
  if (mins > 1) return `פעיל/ה לפני ${mins} דקות`;
  return 'פעיל/ה לאחרונה';
}

function RoleBadge({ role }: { role: string }) {
  const configs: Record<string, { icon: React.ReactNode; label: string; color: string; bg: string }> = {
    owner: { icon: <Crown className="w-3 h-3" />, label: 'בעלים', color: '#fbbf24', bg: 'rgba(251,191,36,0.12)' },
    admin: { icon: <Shield className="w-3 h-3" />, label: 'מנהל', color: '#60a5fa', bg: 'rgba(96,165,250,0.12)' },
    member: { icon: <UserIcon className="w-3 h-3" />, label: 'חבר צוות', color: '#4ade80', bg: 'rgba(74,222,128,0.12)' },
    viewer: { icon: <Eye className="w-3 h-3" />, label: 'צופה', color: '#9ca3af', bg: 'rgba(156,163,175,0.12)' },
  };
  const cfg = configs[role] ?? configs.viewer;
  return (
    <span
      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium"
      style={{ color: cfg.color, background: cfg.bg, border: `1px solid ${cfg.color}40` }}
    >
      {cfg.icon}
      {cfg.label}
    </span>
  );
}

function roleIcon(role: string) {
  switch (role) {
    case 'owner': return <Crown className="w-4 h-4 text-yellow-400" />;
    case 'admin': return <Shield className="w-4 h-4 text-blue-400" />;
    case 'member': return <UserIcon className="w-4 h-4 text-green-400" />;
    default: return <Eye className="w-4 h-4 text-gray-400" />;
  }
}

/* ── main component ───────────────────────────────────────────────────── */

function TeamDashboardContent() {
  const params = useParams();
  const router = useRouter();
  const teamId = params.teamId as string;
  const { user } = useAuth();
  const { showToast } = useToast();
  const {
    teams, loading,
    updateTeam, inviteToTeam, removeMember, leaveTeam,
    changeMemberRole, transferOwnership, deleteTeam, getUserRole,
  } = useTeam();

  const [tab, setTab] = useState<Tab>('members');
  const [team, setTeam] = useState<Team | null>(null);
  const [myRole, setMyRole] = useState<TeamRole | null>(null);

  // Member profiles fetched from Firestore
  const [memberProfiles, setMemberProfiles] = useState<Record<string, UserProfile>>({});

  // Invite state
  const [showInvite, setShowInvite] = useState(false);
  const [allUsers, setAllUsers] = useState<UserProfile[]>([]);
  const [inviteSearch, setInviteSearch] = useState('');
  const [inviteRole, setInviteRole] = useState<TeamRole>('member');
  const [inviting, setInviting] = useState<string | null>(null);
  const [inviteError, setInviteError] = useState('');

  // Settings state
  const [editName, setEditName] = useState('');
  const [editDesc, setEditDesc] = useState('');
  const [saving, setSaving] = useState(false);

  // Member action menu
  const [menuMember, setMenuMember] = useState<string | null>(null);

  // Phone reveal per member
  const [revealedPhones, setRevealedPhones] = useState<Set<string>>(new Set());

  // Close member menu on outside click
  useEffect(() => {
    if (!menuMember) return;
    const handler = () => setMenuMember(null);
    document.addEventListener('click', handler);
    return () => document.removeEventListener('click', handler);
  }, [menuMember]);

  // Confirm dialogs
  const [confirmAction, setConfirmAction] = useState<{
    type: 'delete' | 'leave' | 'remove' | 'transfer';
    targetUid?: string;
    targetName?: string;
  } | null>(null);

  useEffect(() => {
    const found = teams.find(t => t.id === teamId);
    setTeam(found || null);
    if (found) {
      setEditName(found.name);
      setEditDesc(found.description || '');
    }
  }, [teams, teamId]);

  useEffect(() => {
    setMyRole(getUserRole(teamId));
  }, [getUserRole, teamId]);

  // Fetch full user profiles for all team members
  useEffect(() => {
    if (!team) return;
    Promise.all(
      team.memberUids.map(uid => getDoc(doc(db, 'users', uid)))
    ).then(docs => {
      const profiles: Record<string, UserProfile> = {};
      docs.forEach(d => {
        if (d.exists()) profiles[d.id] = { uid: d.id, ...d.data() } as UserProfile;
      });
      setMemberProfiles(profiles);
    }).catch(() => {});
  }, [team]);

  // Load all users for invite
  useEffect(() => {
    if (!showInvite || !user) return;
    const unsubscribe = onSnapshot(collection(db, 'users'), (snapshot) => {
      const users: UserProfile[] = snapshot.docs.map(d => ({
        uid: d.id,
        ...d.data(),
      })) as UserProfile[];
      setAllUsers(users);
    });
    return () => unsubscribe();
  }, [showInvite, user]);

  const filteredUsers = allUsers.filter(u => {
    if (!team) return false;
    if (team.memberUids.includes(u.uid)) return false;
    if (u.uid === user?.uid) return false;
    if (!inviteSearch) return true;
    const search = inviteSearch.toLowerCase();
    return (
      u.displayName?.toLowerCase().includes(search) ||
      u.email?.toLowerCase().includes(search)
    );
  });

  const handleInvite = async (uid: string) => {
    setInviting(uid);
    setInviteError('');
    try {
      await inviteToTeam(teamId, uid, inviteRole);
      setInviting(null);
    } catch (err: unknown) {
      setInviteError(err instanceof Error ? err.message : 'שגיאה');
      setInviting(null);
    }
  };

  const handleSaveSettings = async () => {
    if (!editName.trim() || editName.trim().length < 2) return;
    setSaving(true);
    try {
      await updateTeam(teamId, {
        name: editName.trim(),
        description: editDesc.trim(),
      });
    } catch {
      // silently fail
    }
    setSaving(false);
  };

  const handleConfirm = async () => {
    if (!confirmAction) return;
    try {
      switch (confirmAction.type) {
        case 'delete':
          await deleteTeam(teamId);
          router.push('/teams');
          return;
        case 'leave':
          await leaveTeam(teamId);
          router.push('/teams');
          return;
        case 'remove':
          if (confirmAction.targetUid) await removeMember(teamId, confirmAction.targetUid);
          break;
        case 'transfer':
          if (confirmAction.targetUid) await transferOwnership(teamId, confirmAction.targetUid);
          break;
      }
    } catch (err: unknown) {
      showToast(err instanceof Error ? err.message : 'שגיאה בביצוע הפעולה', 'error');
    }
    setConfirmAction(null);
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ paddingTop: 'var(--app-header-offset)' }}>
        <Loader2 className="w-8 h-8 animate-spin text-[var(--theme-accent)]" />
      </div>
    );
  }

  if (!team) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4" style={{ paddingTop: 'var(--app-header-offset)' }}>
        <p className="text-[var(--theme-text-secondary)]">הצוות לא נמצא</p>
        <button
          onClick={() => router.push('/teams')}
          className="text-[var(--theme-accent)] hover:underline"
        >
          חזרה לצוותים
        </button>
      </div>
    );
  }

  // Sort members: available first, then busy, then offline
  const statusOrder: Record<string, number> = { available: 0, busy: 1, offline: 2 };
  const sortedMembers = [...team.members].sort((a, b) => {
    const sa = memberProfiles[a.uid]?.status ?? 'offline';
    const sb = memberProfiles[b.uid]?.status ?? 'offline';
    return (statusOrder[sa] ?? 2) - (statusOrder[sb] ?? 2);
  });

  return (
    <div className="min-h-screen pb-12" dir="rtl">

      {/* ── Hero header ── */}
      <section className="app-hero relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-bl from-purple-900/10 via-transparent to-blue-900/10 pointer-events-none" />
        <div className="relative max-w-4xl mx-auto px-4 sm:px-6 py-8">
          {/* Back link */}
          <button
            onClick={() => router.push('/teams')}
            className="flex items-center gap-1.5 text-sm text-[var(--theme-text-secondary)] hover:text-[var(--theme-text)] mb-5 transition-colors"
          >
            <ArrowRight className="w-4 h-4" />
            חזרה לצוותים
          </button>

          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-5"
          >
            <div className="flex items-center gap-4">
              {/* Team avatar */}
              <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-purple-500 to-blue-600 flex items-center justify-center text-white font-black text-2xl shrink-0 shadow-lg shadow-purple-500/20">
                {team.name.charAt(0)}
              </div>
              <div className="min-w-0">
                <h1 className="text-2xl font-black gradient-text truncate">{team.name}</h1>
                {team.description && (
                  <p className="text-sm text-[var(--theme-text-secondary)] truncate mt-0.5">
                    {team.description}
                  </p>
                )}
                <div className="flex items-center gap-3 mt-2 flex-wrap">
                  <span className="flex items-center gap-1 text-xs text-[var(--theme-text-secondary)]">
                    <Users className="w-3.5 h-3.5" />
                    {team.members.length} חברים
                  </span>
                  {myRole && <RoleBadge role={myRole} />}
                </div>
              </div>
            </div>

            {/* Quick actions */}
            <div className="flex items-center gap-2 shrink-0">
              <button
                onClick={() => router.push(`/productions?team=${teamId}`)}
                className="flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-medium transition-colors"
                style={{
                  background: 'var(--theme-bg-card)',
                  border: '1px solid var(--theme-border)',
                  color: 'var(--theme-accent)',
                }}
              >
                <Calendar className="w-4 h-4" />
                לוח הפקות
              </button>
              {isTeamAdmin(myRole || undefined) && (
                <button
                  onClick={() => setShowInvite(true)}
                  className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold text-white transition-all hover:shadow-lg hover:shadow-purple-500/25 hover:scale-105 active:scale-95"
                  style={{ background: 'linear-gradient(135deg, var(--theme-accent), #7c3aed)' }}
                >
                  <UserPlus className="w-4 h-4" />
                  הזמן חבר
                </button>
              )}
            </div>
          </motion.div>
        </div>
      </section>

      {/* ── Sticky tab bar ── */}
      <div
        className="sticky z-30 border-b backdrop-blur-xl"
        style={{
          top: 'var(--app-header-offset)',
          background: 'color-mix(in srgb, var(--theme-nav-bg) 80%, transparent)',
          borderColor: 'var(--theme-border)',
        }}
      >
        <div className="max-w-4xl mx-auto px-4 sm:px-6">
          <div className="flex gap-0">
            {([
              { key: 'members' as Tab, label: 'חברים', icon: Users },
              ...(isTeamAdmin(myRole || undefined)
                ? [{ key: 'settings' as Tab, label: 'הגדרות', icon: Settings }]
                : []),
            ]).map(({ key, label, icon: Icon }) => (
              <button
                key={key}
                onClick={() => setTab(key)}
                className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-all ${
                  tab === key
                    ? 'text-[var(--theme-accent)] border-[var(--theme-accent)]'
                    : 'text-[var(--theme-text-secondary)] border-transparent hover:text-[var(--theme-text)]'
                }`}
              >
                <Icon className="w-4 h-4" />
                {label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ── Tab content ── */}
      <div className="max-w-4xl mx-auto px-4 sm:px-6 py-6">

        {/* Members tab */}
        {tab === 'members' && (
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
          >
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {sortedMembers.map((member, i) => {
                const mp = memberProfiles[member.uid];
                const sc = statusConfig(mp?.status);
                const isMe = member.uid === user?.uid;
                const phoneRevealed = revealedPhones.has(member.uid);

                return (
                  <motion.div
                    key={member.uid}
                    initial={{ opacity: 0, y: 16 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.04 }}
                    className="rounded-2xl p-4 flex flex-col gap-3"
                    style={{
                      background: 'var(--theme-bg-card)',
                      border: '1px solid var(--theme-border)',
                    }}
                  >
                    {/* Top row: avatar + name + menu */}
                    <div className="flex items-start gap-3">
                      {/* Avatar with status dot */}
                      <div className="relative shrink-0">
                        <UserAvatar
                          name={member.displayName}
                          photoURL={member.photoURL}
                          size="lg"
                        />
                        <span
                          className="absolute bottom-0 right-0 w-3.5 h-3.5 rounded-full border-2 border-[var(--theme-bg-card)]"
                          style={{ background: sc.color }}
                        />
                      </div>

                      {/* Name + role/dept */}
                      <div className="flex-1 min-w-0">
                        <p className="font-black text-sm text-[var(--theme-text)] truncate leading-snug">
                          {member.displayName}
                          {isMe && (
                            <span className="text-xs font-normal text-[var(--theme-text-secondary)] mr-1">(את/ה)</span>
                          )}
                        </p>
                        {(mp?.role || mp?.department) && (
                          <p className="text-xs text-[var(--theme-text-secondary)] truncate mt-0.5">
                            {[mp.role, mp.department].filter(Boolean).join(' · ')}
                          </p>
                        )}
                        <div className="mt-1.5">
                          <RoleBadge role={member.role} />
                        </div>
                      </div>

                      {/* Action menu for admins (not self, not owner) */}
                      {isTeamAdmin(myRole || undefined) && !isMe && member.role !== 'owner' && (
                        <div className="relative shrink-0">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setMenuMember(menuMember === member.uid ? null : member.uid);
                            }}
                            className="p-1.5 rounded-lg text-[var(--theme-text-secondary)] hover:bg-[var(--theme-accent-glow)] transition-colors"
                          >
                            <MoreVertical className="w-4 h-4" />
                          </button>

                          <AnimatePresence>
                            {menuMember === member.uid && (
                              <motion.div
                                initial={{ opacity: 0, scale: 0.95, y: -4 }}
                                animate={{ opacity: 1, scale: 1, y: 0 }}
                                exit={{ opacity: 0, scale: 0.95, y: -4 }}
                                className="absolute left-0 top-full mt-1 w-48 rounded-xl border shadow-xl z-30 p-1"
                                style={{
                                  background: 'var(--theme-bg-secondary)',
                                  borderColor: 'var(--theme-border)',
                                }}
                                onClick={(e) => e.stopPropagation()}
                              >
                                {/* Role change */}
                                {(['admin', 'member', 'viewer'] as TeamRole[])
                                  .filter(r => r !== member.role)
                                  .map(r => (
                                    <button
                                      key={r}
                                      onClick={() => {
                                        changeMemberRole(teamId, member.uid, r);
                                        setMenuMember(null);
                                      }}
                                      className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-[var(--theme-text-secondary)] hover:text-[var(--theme-text)] hover:bg-[var(--theme-accent-glow)] transition-colors"
                                    >
                                      {roleIcon(r)}
                                      שנה ל{TEAM_ROLE_LABELS[r]}
                                    </button>
                                  ))}

                                {myRole === 'owner' && (
                                  <button
                                    onClick={() => {
                                      setConfirmAction({ type: 'transfer', targetUid: member.uid, targetName: member.displayName });
                                      setMenuMember(null);
                                    }}
                                    className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-yellow-400 hover:bg-yellow-500/10 transition-colors"
                                  >
                                    <Crown className="w-4 h-4" />
                                    העבר בעלות
                                  </button>
                                )}

                                <div className="my-1 border-t" style={{ borderColor: 'var(--theme-border)' }} />
                                <button
                                  onClick={() => {
                                    setConfirmAction({ type: 'remove', targetUid: member.uid, targetName: member.displayName });
                                    setMenuMember(null);
                                  }}
                                  className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-red-400 hover:bg-red-500/10 transition-colors"
                                >
                                  <Trash2 className="w-4 h-4" />
                                  הסר מהצוות
                                </button>
                              </motion.div>
                            )}
                          </AnimatePresence>
                        </div>
                      )}
                    </div>

                    {/* Status pill */}
                    <div className="flex items-center gap-2">
                      <span
                        className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium"
                        style={{ color: sc.color, background: sc.bg, border: `1px solid ${sc.border}` }}
                      >
                        <Activity className="w-3 h-3" />
                        {sc.label}
                      </span>
                      {mp?.lastSeen && mp?.status !== 'available' && (
                        <span className="text-xs text-[var(--theme-text-secondary)]">
                          {lastSeenText(mp.lastSeen)}
                        </span>
                      )}
                    </div>

                    {/* Action buttons */}
                    <div className="flex items-center gap-2 mt-auto pt-1">
                      {/* Phone reveal (admins only) */}
                      {isTeamAdmin(myRole || undefined) && mp?.phone && (
                        <button
                          onClick={() =>
                            phoneRevealed
                              ? window.open(`tel:${mp.phone}`)
                              : setRevealedPhones(prev => new Set([...prev, member.uid]))
                          }
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all flex-1"
                          style={{
                            background: 'rgba(74,222,128,0.10)',
                            color: '#4ade80',
                            border: '1px solid rgba(74,222,128,0.2)',
                          }}
                        >
                          <Phone className="w-3.5 h-3.5 shrink-0" />
                          {phoneRevealed ? mp.phone : 'צור קשר'}
                        </button>
                      )}

                      {/* Professional card link */}
                      <Link
                        href={`/directory?uid=${member.uid}`}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors"
                        style={{
                          background: 'var(--theme-bg-secondary)',
                          color: 'var(--theme-text-secondary)',
                          border: '1px solid var(--theme-border)',
                        }}
                      >
                        <ExternalLink className="w-3.5 h-3.5 shrink-0" />
                        כרטיס מקצועי
                      </Link>
                    </div>
                  </motion.div>
                );
              })}
            </div>

            {/* Leave button (non-owners) */}
            {myRole && myRole !== 'owner' && (
              <motion.button
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.3 }}
                onClick={() => setConfirmAction({ type: 'leave' })}
                className="w-full flex items-center justify-center gap-2 p-3 rounded-xl mt-6 text-sm font-medium transition-colors"
                style={{
                  background: 'rgba(239,68,68,0.06)',
                  border: '1px solid rgba(239,68,68,0.25)',
                  color: '#f87171',
                }}
              >
                <LogOut className="w-4 h-4" />
                עזוב את הצוות
              </motion.button>
            )}
          </motion.div>
        )}

        {/* Settings tab */}
        {tab === 'settings' && isTeamAdmin(myRole || undefined) && (
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            className="space-y-6"
          >
            <div
              className="p-6 rounded-2xl"
              style={{
                background: 'var(--theme-bg-card)',
                border: '1px solid var(--theme-border)',
              }}
            >
              <h3 className="font-bold text-[var(--theme-text)] mb-5 flex items-center gap-2">
                <Settings className="w-4 h-4 text-[var(--theme-accent)]" />
                פרטי הצוות
              </h3>

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-bold text-[var(--theme-text-secondary)] mb-1.5">
                    שם הצוות *
                  </label>
                  <input
                    type="text"
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    maxLength={50}
                    className="w-full px-4 py-3 rounded-xl text-sm text-[var(--theme-text)] outline-none transition-all focus:ring-2 focus:ring-[var(--theme-accent)]/40"
                    style={{
                      background: 'var(--theme-bg)',
                      border: '1px solid var(--theme-border)',
                    }}
                  />
                </div>
                <div>
                  <label className="block text-sm font-bold text-[var(--theme-text-secondary)] mb-1.5">
                    תיאור <span className="font-normal opacity-60">(אופציונלי)</span>
                  </label>
                  <textarea
                    value={editDesc}
                    onChange={(e) => setEditDesc(e.target.value)}
                    rows={3}
                    className="w-full px-4 py-3 rounded-xl text-sm text-[var(--theme-text)] resize-none outline-none transition-all focus:ring-2 focus:ring-[var(--theme-accent)]/40"
                    style={{
                      background: 'var(--theme-bg)',
                      border: '1px solid var(--theme-border)',
                    }}
                  />
                </div>
                <button
                  onClick={handleSaveSettings}
                  disabled={saving || !editName.trim()}
                  className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-black text-white transition-all hover:shadow-lg disabled:opacity-50 disabled:cursor-not-allowed"
                  style={{ background: 'linear-gradient(135deg, var(--theme-accent), #7c3aed)' }}
                >
                  {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                  {saving ? 'שומר...' : 'שמור שינויים'}
                </button>
              </div>
            </div>

            {/* Danger zone */}
            {myRole === 'owner' && (
              <div
                className="p-6 rounded-2xl"
                style={{
                  background: 'rgba(239,68,68,0.04)',
                  border: '1px solid rgba(239,68,68,0.25)',
                }}
              >
                <h3 className="font-bold text-red-400 mb-2">אזור מסוכן</h3>
                <p className="text-sm text-[var(--theme-text-secondary)] mb-4">
                  מחיקת הצוות היא פעולה בלתי הפיכה. כל לוחות ההפקות המשותפים יימחקו.
                </p>
                <button
                  onClick={() => setConfirmAction({ type: 'delete' })}
                  className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold transition-colors"
                  style={{
                    background: 'rgba(239,68,68,0.12)',
                    color: '#f87171',
                    border: '1px solid rgba(239,68,68,0.25)',
                  }}
                >
                  <Trash2 className="w-4 h-4" />
                  מחק צוות
                </button>
              </div>
            )}
          </motion.div>
        )}
      </div>

      {/* ── Invite Modal ── */}
      <AnimatePresence>
        {showInvite && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm p-0 sm:p-4"
            onClick={() => setShowInvite(false)}
          >
            <motion.div
              initial={{ y: '100%', opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: '100%', opacity: 0 }}
              transition={{ type: 'spring', damping: 28, stiffness: 300 }}
              className="w-full sm:max-w-md max-h-[85vh] flex flex-col rounded-t-3xl sm:rounded-2xl"
              style={{
                background: 'var(--theme-bg-secondary)',
                border: '1px solid var(--theme-border)',
                borderBottom: 'none',
              }}
              onClick={(e) => e.stopPropagation()}
            >
              {/* Drag handle on mobile */}
              <div className="flex justify-center pt-3 pb-1 sm:hidden">
                <div className="w-12 h-1.5 rounded-full" style={{ background: 'var(--theme-border)' }} />
              </div>

              <div className="p-6 pb-3">
                <div className="flex items-center gap-3 mb-5">
                  <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-purple-500 to-blue-600 flex items-center justify-center shrink-0">
                    <UserPlus className="w-5 h-5 text-white" />
                  </div>
                  <div>
                    <h2 className="text-lg font-black text-[var(--theme-text)]">
                      הזמן ל{team.name}
                    </h2>
                    <p className="text-xs text-[var(--theme-text-secondary)]">חפש וכ הזמן חברי צוות</p>
                  </div>
                </div>

                <div className="relative mb-3">
                  <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--theme-text-secondary)]" />
                  <input
                    type="text"
                    value={inviteSearch}
                    onChange={(e) => setInviteSearch(e.target.value)}
                    placeholder="חפש לפי שם או אימייל..."
                    autoFocus
                    className="w-full pr-10 pl-4 py-2.5 rounded-xl text-sm text-[var(--theme-text)] placeholder-[var(--theme-text-secondary)] outline-none focus:ring-2 focus:ring-[var(--theme-accent)]/40"
                    style={{
                      background: 'var(--theme-bg)',
                      border: '1px solid var(--theme-border)',
                    }}
                  />
                </div>

                {/* Role selector */}
                <div className="flex items-center gap-2 mb-3 flex-wrap">
                  <span className="text-xs text-[var(--theme-text-secondary)] shrink-0">תפקיד:</span>
                  {(['member', 'admin', 'viewer'] as TeamRole[]).map(r => (
                    <button
                      key={r}
                      onClick={() => setInviteRole(r)}
                      className="px-2.5 py-1 rounded-lg text-xs font-medium transition-all"
                      style={
                        inviteRole === r
                          ? { background: 'var(--theme-accent-glow)', color: 'var(--theme-accent)', border: '1px solid var(--theme-accent)' }
                          : { color: 'var(--theme-text-secondary)', border: '1px solid transparent' }
                      }
                    >
                      {TEAM_ROLE_LABELS[r]}
                    </button>
                  ))}
                </div>

                {inviteError && (
                  <p className="text-xs text-red-400 mb-2 flex items-center gap-1">
                    <X className="w-3.5 h-3.5 shrink-0" />
                    {inviteError}
                  </p>
                )}
              </div>

              <div className="flex-1 overflow-y-auto px-6 pb-6 space-y-1.5">
                {filteredUsers.length === 0 ? (
                  <p className="text-sm text-[var(--theme-text-secondary)] text-center py-10">
                    {inviteSearch ? 'לא נמצאו משתמשים' : 'כל המשתמשים כבר חברי צוות'}
                  </p>
                ) : (
                  filteredUsers.slice(0, 30).map(u => (
                    <div
                      key={u.uid}
                      className="flex items-center gap-3 p-3 rounded-xl transition-colors hover:bg-[var(--theme-accent-glow)]"
                    >
                      <UserAvatar name={u.displayName} photoURL={u.photoURL} size="md" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-bold text-[var(--theme-text)] truncate">
                          {u.displayName}
                        </p>
                        <p className="text-xs text-[var(--theme-text-secondary)] truncate">
                          {[u.role, u.department].filter(Boolean).join(' · ') || u.email}
                        </p>
                      </div>
                      <button
                        onClick={() => handleInvite(u.uid)}
                        disabled={inviting === u.uid}
                        className="px-3 py-1.5 rounded-xl text-xs font-bold transition-all text-white disabled:opacity-50 hover:scale-105 active:scale-95"
                        style={{ background: 'linear-gradient(135deg, var(--theme-accent), #7c3aed)' }}
                      >
                        {inviting === u.uid ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          'הזמן'
                        )}
                      </button>
                    </div>
                  ))
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Confirm Dialog ── */}
      <AnimatePresence>
        {confirmAction && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
            onClick={() => setConfirmAction(null)}
          >
            <motion.div
              initial={{ scale: 0.92, opacity: 0, y: 8 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.92, opacity: 0, y: 8 }}
              transition={{ type: 'spring', damping: 26, stiffness: 320 }}
              className="w-full max-w-sm rounded-2xl p-6"
              style={{
                background: 'var(--theme-bg-secondary)',
                border: '1px solid var(--theme-border)',
              }}
              onClick={(e) => e.stopPropagation()}
            >
              {/* Icon */}
              <div
                className="w-12 h-12 rounded-xl flex items-center justify-center mb-4"
                style={{
                  background: confirmAction.type === 'transfer' ? 'rgba(251,191,36,0.12)' : 'rgba(239,68,68,0.12)',
                }}
              >
                {confirmAction.type === 'transfer' ? (
                  <Crown className="w-5 h-5 text-yellow-400" />
                ) : (
                  <Trash2 className="w-5 h-5 text-red-400" />
                )}
              </div>

              <h3 className="text-lg font-black text-[var(--theme-text)] mb-2">
                {confirmAction.type === 'delete' && 'מחיקת צוות'}
                {confirmAction.type === 'leave' && 'עזיבת צוות'}
                {confirmAction.type === 'remove' && 'הסרת חבר'}
                {confirmAction.type === 'transfer' && 'העברת בעלות'}
              </h3>
              <p className="text-sm text-[var(--theme-text-secondary)] mb-6 leading-relaxed">
                {confirmAction.type === 'delete' && `האם למחוק את "${team.name}"? פעולה זו בלתי הפיכה.`}
                {confirmAction.type === 'leave' && `האם לעזוב את "${team.name}"?`}
                {confirmAction.type === 'remove' && `האם להסיר את ${confirmAction.targetName} מהצוות?`}
                {confirmAction.type === 'transfer' && `האם להעביר בעלות ל${confirmAction.targetName}? תהפוך למנהל.`}
              </p>
              <div className="flex items-center gap-3">
                <button
                  onClick={handleConfirm}
                  className="flex-1 px-4 py-2.5 rounded-xl text-sm font-bold transition-colors"
                  style={
                    confirmAction.type === 'transfer'
                      ? { background: 'rgba(251,191,36,0.15)', color: '#fbbf24', border: '1px solid rgba(251,191,36,0.3)' }
                      : { background: 'rgba(239,68,68,0.15)', color: '#f87171', border: '1px solid rgba(239,68,68,0.3)' }
                  }
                >
                  אישור
                </button>
                <button
                  onClick={() => setConfirmAction(null)}
                  className="flex-1 px-4 py-2.5 rounded-xl text-sm font-medium text-[var(--theme-text-secondary)] hover:bg-[var(--theme-accent-glow)] transition-colors"
                  style={{ border: '1px solid var(--theme-border)' }}
                >
                  ביטול
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export default function TeamDashboardPage() {
  return (
    <AuthGuard>
      <TeamDashboardContent />
    </AuthGuard>
  );
}
