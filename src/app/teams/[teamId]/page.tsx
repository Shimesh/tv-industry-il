'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuth, UserProfile } from '@/contexts/AuthContext';
import { useTeam } from '@/hooks/useTeam';
import { TEAM_ROLE_LABELS, isTeamAdmin, type TeamRole, type Team, type TeamMember } from '@/types/team';
import AuthGuard from '@/components/AuthGuard';
import UserAvatar from '@/components/UserAvatar';
import { db } from '@/lib/firebase';
import { collection, onSnapshot } from 'firebase/firestore';
import {
  Users, Settings, Calendar, Crown, Shield, UserIcon, Eye,
  UserPlus, Trash2, LogOut, ArrowRight, MoreVertical,
  Loader2, Search, Check, X,
} from 'lucide-react';

type Tab = 'members' | 'settings';

function TeamDashboardContent() {
  const params = useParams();
  const router = useRouter();
  const teamId = params.teamId as string;
  const { user, profile } = useAuth();
  const {
    teams, loading,
    updateTeam, inviteToTeam, removeMember, leaveTeam,
    changeMemberRole, transferOwnership, deleteTeam, getUserRole,
  } = useTeam();

  const [tab, setTab] = useState<Tab>('members');
  const [team, setTeam] = useState<Team | null>(null);
  const [myRole, setMyRole] = useState<TeamRole | null>(null);

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
      alert(err instanceof Error ? err.message : 'שגיאה');
    }
    setConfirmAction(null);
  };

  const roleIcon = (role: string) => {
    switch (role) {
      case 'owner': return <Crown className="w-4 h-4 text-yellow-400" />;
      case 'admin': return <Shield className="w-4 h-4 text-blue-400" />;
      case 'member': return <UserIcon className="w-4 h-4 text-green-400" />;
      default: return <Eye className="w-4 h-4 text-gray-400" />;
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen pt-24 flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-[var(--theme-accent)]" />
      </div>
    );
  }

  if (!team) {
    return (
      <div className="min-h-screen pt-24 flex flex-col items-center justify-center gap-4">
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

  return (
    <div className="min-h-screen pt-24 pb-12 px-4 sm:px-6" dir="rtl">
      <div className="max-w-4xl mx-auto">
        {/* Back link */}
        <button
          onClick={() => router.push('/teams')}
          className="flex items-center gap-1.5 text-sm text-[var(--theme-text-secondary)] hover:text-[var(--theme-text)] mb-4 transition-colors"
        >
          <ArrowRight className="w-4 h-4" />
          חזרה לצוותים
        </button>

        {/* Team Header */}
        <div className="flex items-center gap-4 mb-6">
          <div className="w-14 h-14 rounded-xl bg-gradient-to-br from-purple-500 to-blue-500 flex items-center justify-center text-white font-bold text-2xl shrink-0">
            {team.name.charAt(0)}
          </div>
          <div className="min-w-0 flex-1">
            <h1 className="text-2xl font-bold text-[var(--theme-text)] truncate">
              {team.name}
            </h1>
            {team.description && (
              <p className="text-sm text-[var(--theme-text-secondary)] truncate">
                {team.description}
              </p>
            )}
            <div className="flex items-center gap-3 mt-1 text-xs text-[var(--theme-text-secondary)]">
              <span className="flex items-center gap-1">
                <Users className="w-3.5 h-3.5" />
                {team.members.length} חברים
              </span>
              {myRole && (
                <span className="flex items-center gap-1">
                  {roleIcon(myRole)}
                  {TEAM_ROLE_LABELS[myRole]}
                </span>
              )}
            </div>
          </div>

          {/* Quick actions */}
          <div className="flex items-center gap-2">
            <button
              onClick={() => router.push(`/productions?team=${teamId}`)}
              className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium bg-[var(--theme-accent-glow)] text-[var(--theme-accent)] hover:opacity-80 transition-opacity"
            >
              <Calendar className="w-4 h-4" />
              לוח הפקות
            </button>
            {isTeamAdmin(myRole || undefined) && (
              <button
                onClick={() => setShowInvite(true)}
                className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium bg-purple-500/20 text-purple-400 hover:bg-purple-500/30 transition-colors"
              >
                <UserPlus className="w-4 h-4" />
                הזמן
              </button>
            )}
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 p-1 rounded-lg mb-6" style={{ background: 'var(--theme-bg-secondary)' }}>
          {([
            { key: 'members' as Tab, label: 'חברי צוות', icon: Users },
            ...(isTeamAdmin(myRole || undefined) ? [{ key: 'settings' as Tab, label: 'הגדרות', icon: Settings }] : []),
          ]).map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              onClick={() => setTab(key)}
              className={`flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium transition-all ${
                tab === key
                  ? 'text-[var(--theme-accent)] shadow-sm'
                  : 'text-[var(--theme-text-secondary)] hover:text-[var(--theme-text)]'
              }`}
              style={tab === key ? { background: 'var(--theme-bg)' } : undefined}
            >
              <Icon className="w-4 h-4" />
              {label}
            </button>
          ))}
        </div>

        {/* Members Tab */}
        {tab === 'members' && (
          <div className="space-y-2">
            {team.members.map((member) => (
              <div
                key={member.uid}
                className="flex items-center gap-3 p-4 rounded-xl border transition-colors"
                style={{
                  background: 'var(--theme-bg-secondary)',
                  borderColor: 'var(--theme-border)',
                }}
              >
                <UserAvatar
                  name={member.displayName}
                  photoURL={member.photoURL}
                  size="md"
                />
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-[var(--theme-text)] truncate">
                    {member.displayName}
                    {member.uid === user?.uid && (
                      <span className="text-xs text-[var(--theme-text-secondary)] mr-1">(את/ה)</span>
                    )}
                  </p>
                  <div className="flex items-center gap-1.5 text-xs text-[var(--theme-text-secondary)]">
                    {roleIcon(member.role)}
                    {TEAM_ROLE_LABELS[member.role]}
                  </div>
                </div>

                {/* Actions menu */}
                {isTeamAdmin(myRole || undefined) && member.uid !== user?.uid && member.role !== 'owner' && (
                  <div className="relative">
                    <button
                      onClick={() => setMenuMember(menuMember === member.uid ? null : member.uid)}
                      className="p-2 rounded-lg text-[var(--theme-text-secondary)] hover:bg-[var(--theme-accent-glow)] transition-colors"
                    >
                      <MoreVertical className="w-4 h-4" />
                    </button>

                    {menuMember === member.uid && (
                      <div
                        className="absolute left-0 top-full mt-1 w-48 rounded-xl border shadow-xl z-30 p-1"
                        style={{
                          background: 'var(--theme-bg-secondary)',
                          borderColor: 'var(--theme-border)',
                        }}
                      >
                        {/* Role change options */}
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
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}

            {/* Leave button for non-owners */}
            {myRole && myRole !== 'owner' && (
              <button
                onClick={() => setConfirmAction({ type: 'leave' })}
                className="w-full flex items-center justify-center gap-2 p-3 rounded-xl border border-red-500/30 text-red-400 hover:bg-red-500/10 transition-colors mt-4"
              >
                <LogOut className="w-4 h-4" />
                עזוב את הצוות
              </button>
            )}
          </div>
        )}

        {/* Settings Tab */}
        {tab === 'settings' && isTeamAdmin(myRole || undefined) && (
          <div className="space-y-6">
            <div
              className="p-6 rounded-xl border"
              style={{
                background: 'var(--theme-bg-secondary)',
                borderColor: 'var(--theme-border)',
              }}
            >
              <h3 className="font-bold text-[var(--theme-text)] mb-4">פרטי הצוות</h3>

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-[var(--theme-text-secondary)] mb-1">
                    שם הצוות
                  </label>
                  <input
                    type="text"
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    maxLength={50}
                    className="w-full px-4 py-2.5 rounded-lg border text-sm text-[var(--theme-text)]"
                    style={{
                      background: 'var(--theme-bg)',
                      borderColor: 'var(--theme-border)',
                    }}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-[var(--theme-text-secondary)] mb-1">
                    תיאור
                  </label>
                  <textarea
                    value={editDesc}
                    onChange={(e) => setEditDesc(e.target.value)}
                    rows={3}
                    className="w-full px-4 py-2.5 rounded-lg border text-sm text-[var(--theme-text)] resize-none"
                    style={{
                      background: 'var(--theme-bg)',
                      borderColor: 'var(--theme-border)',
                    }}
                  />
                </div>
                <button
                  onClick={handleSaveSettings}
                  disabled={saving || !editName.trim()}
                  className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold bg-gradient-to-l from-purple-500 to-blue-600 text-white hover:shadow-lg disabled:opacity-50 transition-all"
                >
                  {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                  {saving ? 'שומר...' : 'שמור שינויים'}
                </button>
              </div>
            </div>

            {/* Danger zone */}
            {myRole === 'owner' && (
              <div
                className="p-6 rounded-xl border border-red-500/30"
                style={{ background: 'var(--theme-bg-secondary)' }}
              >
                <h3 className="font-bold text-red-400 mb-2">אזור מסוכן</h3>
                <p className="text-sm text-[var(--theme-text-secondary)] mb-4">
                  מחיקת הצוות היא פעולה בלתי הפיכה. כל לוחות ההפקות המשותפים יימחקו.
                </p>
                <button
                  onClick={() => setConfirmAction({ type: 'delete' })}
                  className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold bg-red-500/20 text-red-400 hover:bg-red-500/30 transition-colors"
                >
                  <Trash2 className="w-4 h-4" />
                  מחק צוות
                </button>
              </div>
            )}
          </div>
        )}

        {/* Invite Modal */}
        <AnimatePresence>
          {showInvite && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
              onClick={() => setShowInvite(false)}
            >
              <motion.div
                initial={{ scale: 0.9, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.9, opacity: 0 }}
                className="w-full max-w-md max-h-[80vh] flex flex-col rounded-2xl border"
                style={{
                  background: 'var(--theme-bg-secondary)',
                  borderColor: 'var(--theme-border)',
                }}
                onClick={(e) => e.stopPropagation()}
              >
                <div className="p-6 pb-3">
                  <h2 className="text-xl font-bold text-[var(--theme-text)] mb-3">
                    הזמן ל{team.name}
                  </h2>

                  <div className="relative mb-3">
                    <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--theme-text-secondary)]" />
                    <input
                      type="text"
                      value={inviteSearch}
                      onChange={(e) => setInviteSearch(e.target.value)}
                      placeholder="חפש לפי שם או אימייל..."
                      className="w-full pr-10 pl-4 py-2.5 rounded-lg border text-sm text-[var(--theme-text)] placeholder-[var(--theme-text-secondary)]"
                      style={{
                        background: 'var(--theme-bg)',
                        borderColor: 'var(--theme-border)',
                      }}
                    />
                  </div>

                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-xs text-[var(--theme-text-secondary)]">תפקיד:</span>
                    {(['member', 'admin', 'viewer'] as TeamRole[]).map(r => (
                      <button
                        key={r}
                        onClick={() => setInviteRole(r)}
                        className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-colors ${
                          inviteRole === r
                            ? 'bg-[var(--theme-accent-glow)] text-[var(--theme-accent)]'
                            : 'text-[var(--theme-text-secondary)] hover:text-[var(--theme-text)]'
                        }`}
                      >
                        {TEAM_ROLE_LABELS[r]}
                      </button>
                    ))}
                  </div>

                  {inviteError && (
                    <p className="text-xs text-red-400 mb-2">{inviteError}</p>
                  )}
                </div>

                <div className="flex-1 overflow-y-auto px-6 pb-6 space-y-1">
                  {filteredUsers.length === 0 ? (
                    <p className="text-sm text-[var(--theme-text-secondary)] text-center py-8">
                      {inviteSearch ? 'לא נמצאו משתמשים' : 'כל המשתמשים כבר חברי צוות'}
                    </p>
                  ) : (
                    filteredUsers.slice(0, 30).map(u => (
                      <div
                        key={u.uid}
                        className="flex items-center gap-3 p-3 rounded-lg hover:bg-[var(--theme-accent-glow)] transition-colors"
                      >
                        <UserAvatar name={u.displayName} photoURL={u.photoURL} size="sm" />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-[var(--theme-text)] truncate">
                            {u.displayName}
                          </p>
                          <p className="text-xs text-[var(--theme-text-secondary)] truncate">
                            {u.email}
                          </p>
                        </div>
                        <button
                          onClick={() => handleInvite(u.uid)}
                          disabled={inviting === u.uid}
                          className="px-3 py-1.5 rounded-lg text-xs font-medium bg-purple-500/20 text-purple-400 hover:bg-purple-500/30 transition-colors disabled:opacity-50"
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

        {/* Confirm Dialog */}
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
                initial={{ scale: 0.9, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.9, opacity: 0 }}
                className="w-full max-w-sm rounded-2xl border p-6"
                style={{
                  background: 'var(--theme-bg-secondary)',
                  borderColor: 'var(--theme-border)',
                }}
                onClick={(e) => e.stopPropagation()}
              >
                <h3 className="text-lg font-bold text-[var(--theme-text)] mb-2">
                  {confirmAction.type === 'delete' && 'מחיקת צוות'}
                  {confirmAction.type === 'leave' && 'עזיבת צוות'}
                  {confirmAction.type === 'remove' && 'הסרת חבר'}
                  {confirmAction.type === 'transfer' && 'העברת בעלות'}
                </h3>
                <p className="text-sm text-[var(--theme-text-secondary)] mb-5">
                  {confirmAction.type === 'delete' && `האם למחוק את "${team.name}"? פעולה זו בלתי הפיכה.`}
                  {confirmAction.type === 'leave' && `האם לעזוב את "${team.name}"?`}
                  {confirmAction.type === 'remove' && `האם להסיר את ${confirmAction.targetName} מהצוות?`}
                  {confirmAction.type === 'transfer' && `האם להעביר בעלות ל${confirmAction.targetName}? תהפוך למנהל.`}
                </p>
                <div className="flex items-center gap-3">
                  <button
                    onClick={handleConfirm}
                    className={`flex-1 px-4 py-2.5 rounded-lg text-sm font-bold transition-colors ${
                      confirmAction.type === 'transfer'
                        ? 'bg-yellow-500/20 text-yellow-400 hover:bg-yellow-500/30'
                        : 'bg-red-500/20 text-red-400 hover:bg-red-500/30'
                    }`}
                  >
                    אישור
                  </button>
                  <button
                    onClick={() => setConfirmAction(null)}
                    className="flex-1 px-4 py-2.5 rounded-lg text-sm font-medium text-[var(--theme-text-secondary)] hover:bg-[var(--theme-accent-glow)] transition-colors"
                  >
                    ביטול
                  </button>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
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
