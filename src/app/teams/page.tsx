'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuth } from '@/contexts/AuthContext';
import { useTeam } from '@/hooks/useTeam';
import { useToast } from '@/contexts/ToastContext';
import { TEAM_ROLE_LABELS } from '@/types/team';
import AuthGuard from '@/components/AuthGuard';
import UserAvatar from '@/components/UserAvatar';
import Link from 'next/link';
import {
  Users, Plus, UserPlus, Check, X, Crown,
  Shield, Eye, UserIcon, Loader2,
} from 'lucide-react';

function TeamsContent() {
  const router = useRouter();
  const { user } = useAuth();
  const { showToast } = useToast();
  const {
    teams, invites, loading,
    createTeam, acceptInvite, declineInvite,
  } = useTeam();

  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState('');

  const handleCreate = async () => {
    if (!newName.trim() || newName.trim().length < 2) {
      setError('שם הצוות חייב להכיל לפחות 2 תווים');
      return;
    }
    setCreating(true);
    setError('');
    try {
      const teamId = await createTeam(newName.trim(), newDesc.trim());
      if (!teamId) {
        throw new Error('לא ניתן היה ליצור את הצוות כרגע');
      }
      showToast('הצוות נוצר בהצלחה', 'success');
      setShowCreate(false);
      setNewName('');
      setNewDesc('');
      router.push(`/teams/${teamId}`);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'שגיאה ביצירת הצוות');
    } finally {
      setCreating(false);
    }
  };

  const handleAccept = async (invite: typeof invites[0]) => {
    try {
      await acceptInvite(invite);
    } catch (err: unknown) {
      showToast(err instanceof Error ? err.message : 'שגיאה בקבלת ההזמנה', 'error');
    }
  };

  const roleIcon = (role: string) => {
    switch (role) {
      case 'owner': return <Crown className="w-3.5 h-3.5 text-yellow-400" />;
      case 'admin': return <Shield className="w-3.5 h-3.5 text-blue-400" />;
      case 'member': return <UserIcon className="w-3.5 h-3.5 text-green-400" />;
      default: return <Eye className="w-3.5 h-3.5 text-gray-400" />;
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen pt-24 flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-[var(--theme-accent)]" />
      </div>
    );
  }

  return (
    <div className="min-h-screen pt-24 pb-12 px-4 sm:px-6" dir="rtl">
      <div className="max-w-5xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold text-[var(--theme-text)]">צוותים</h1>
            <p className="text-[var(--theme-text-secondary)] mt-1">
              ניהול צוותי הפקה ולוחות זמנים משותפים
            </p>
          </div>
          <button
            onClick={() => setShowCreate(true)}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold transition-all bg-gradient-to-l from-purple-500 to-blue-600 text-white hover:shadow-lg hover:shadow-purple-500/20"
          >
            <Plus className="w-4 h-4" />
            צור צוות
          </button>
        </div>

        <div
          className="mb-8 rounded-2xl border p-5"
          style={{
            background: 'linear-gradient(135deg, rgba(99,102,241,0.10), rgba(59,130,246,0.07))',
            borderColor: 'var(--theme-border)',
          }}
        >
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-lg font-bold text-[var(--theme-text)] mb-1">
                מה עושים כאן?
              </h2>
              <p className="text-sm text-[var(--theme-text-secondary)] max-w-2xl">
                צוותים מרכזים אנשים, הרשאות ולוחות עבודה משותפים. אחרי יצירת צוות עוברים ישר לדף הצוות, ושם אפשר להזמין חברים ולהמשיך ליומן האישי.
              </p>
            </div>
            <button
              onClick={() => setShowCreate(true)}
              className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold transition-all bg-white/5 text-[var(--theme-text)] hover:bg-white/10"
            >
              <Plus className="w-4 h-4" />
              צור צוות חדש
            </button>
          </div>
        </div>

        {/* Pending Invites */}
        {invites.length > 0 && (
          <div className="mb-8">
            <h2 className="text-lg font-bold text-[var(--theme-text)] mb-3 flex items-center gap-2">
              <UserPlus className="w-5 h-5 text-purple-400" />
              הזמנות ממתינות ({invites.length})
            </h2>
            <div className="space-y-3">
              {invites.map((invite) => (
                <motion.div
                  key={invite.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="flex items-center justify-between p-4 rounded-xl border"
                  style={{
                    background: 'var(--theme-bg-secondary)',
                    borderColor: 'var(--theme-border)',
                  }}
                >
                  <div>
                    <p className="font-medium text-[var(--theme-text)]">
                      {invite.teamName}
                    </p>
                    <p className="text-sm text-[var(--theme-text-secondary)]">
                      הוזמנת ע&quot;י {invite.invitedByName} כ{TEAM_ROLE_LABELS[invite.role]}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => handleAccept(invite)}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium bg-green-500/20 text-green-400 hover:bg-green-500/30 transition-colors"
                    >
                      <Check className="w-4 h-4" />
                      קבל
                    </button>
                    <button
                      onClick={() => declineInvite(invite.id)}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium bg-red-500/20 text-red-400 hover:bg-red-500/30 transition-colors"
                    >
                      <X className="w-4 h-4" />
                      דחה
                    </button>
                  </div>
                </motion.div>
              ))}
            </div>
          </div>
        )}

        {/* Create Team Modal */}
        <AnimatePresence>
          {showCreate && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
              onClick={() => setShowCreate(false)}
            >
              <motion.div
                initial={{ scale: 0.9, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.9, opacity: 0 }}
                className="w-full max-w-md rounded-2xl border p-6"
                style={{
                  background: 'var(--theme-bg-secondary)',
                  borderColor: 'var(--theme-border)',
                }}
                onClick={(e) => e.stopPropagation()}
              >
                <h2 className="text-xl font-bold text-[var(--theme-text)] mb-4">
                  צור צוות חדש
                </h2>

                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-[var(--theme-text-secondary)] mb-1">
                      שם הצוות *
                    </label>
                    <input
                      type="text"
                      value={newName}
                      onChange={(e) => setNewName(e.target.value)}
                      placeholder="לדוגמה: צוות הרצליה"
                      maxLength={50}
                      className="w-full px-4 py-2.5 rounded-lg border text-sm text-[var(--theme-text)] placeholder-[var(--theme-text-secondary)]"
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
                      value={newDesc}
                      onChange={(e) => setNewDesc(e.target.value)}
                      placeholder="תיאור קצר של הצוות..."
                      rows={3}
                      className="w-full px-4 py-2.5 rounded-lg border text-sm text-[var(--theme-text)] placeholder-[var(--theme-text-secondary)] resize-none"
                      style={{
                        background: 'var(--theme-bg)',
                        borderColor: 'var(--theme-border)',
                      }}
                    />
                  </div>

                  {error && (
                    <p className="text-sm text-red-400">{error}</p>
                  )}

                  <div className="flex items-center gap-3 pt-2">
                    <button
                      onClick={handleCreate}
                      disabled={creating || !newName.trim()}
                      className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-bold transition-all bg-gradient-to-l from-purple-500 to-blue-600 text-white hover:shadow-lg disabled:opacity-50"
                    >
                      {creating ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <Plus className="w-4 h-4" />
                      )}
                      {creating ? 'יוצר...' : 'צור צוות'}
                    </button>
                    <button
                      onClick={() => setShowCreate(false)}
                      className="px-4 py-2.5 rounded-lg text-sm font-medium text-[var(--theme-text-secondary)] hover:bg-[var(--theme-accent-glow)] transition-colors"
                    >
                      ביטול
                    </button>
                  </div>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Teams Grid */}
        {teams.length === 0 ? (
          <div className="text-center py-20">
            <Users className="w-16 h-16 mx-auto text-[var(--theme-text-secondary)] opacity-40 mb-4" />
            <h2 className="text-xl font-bold text-[var(--theme-text)] mb-2">
              אין לך צוותים עדיין
            </h2>
            <p className="text-[var(--theme-text-secondary)] mb-6">
              צור צוות חדש או המתן להזמנה מצוות קיים
            </p>
            <button
              onClick={() => setShowCreate(true)}
              className="inline-flex items-center gap-2 px-6 py-3 rounded-xl text-sm font-bold bg-gradient-to-l from-purple-500 to-blue-600 text-white hover:shadow-lg hover:shadow-purple-500/20 transition-all"
            >
              <Plus className="w-4 h-4" />
              צור צוות ראשון
            </button>
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {teams.map((team, i) => {
              const myRole = team.members.find(m => m.uid === user?.uid)?.role;
              return (
                <motion.div
                  key={team.id}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.05 }}
                >
                  <Link
                    href={`/teams/${team.id}`}
                    className="block p-5 rounded-xl border transition-all hover:shadow-lg group"
                    style={{
                      background: 'var(--theme-bg-secondary)',
                      borderColor: 'var(--theme-border)',
                    }}
                  >
                    {/* Team avatar & name */}
                    <div className="flex items-center gap-3 mb-3">
                      <div className="w-11 h-11 rounded-lg bg-gradient-to-br from-purple-500 to-blue-500 flex items-center justify-center text-white font-bold text-lg shrink-0">
                        {team.name.charAt(0)}
                      </div>
                      <div className="min-w-0">
                        <h3 className="font-bold text-[var(--theme-text)] truncate group-hover:text-[var(--theme-accent)] transition-colors">
                          {team.name}
                        </h3>
                        {team.description && (
                          <p className="text-xs text-[var(--theme-text-secondary)] truncate">
                            {team.description}
                          </p>
                        )}
                      </div>
                    </div>

                    {/* Stats row */}
                    <div className="flex items-center justify-between text-sm">
                      <div className="flex items-center gap-1.5 text-[var(--theme-text-secondary)]">
                        <Users className="w-4 h-4" />
                        <span>{team.members.length} חברים</span>
                      </div>
                      {myRole && (
                        <div className="flex items-center gap-1.5">
                          {roleIcon(myRole)}
                          <span className="text-xs text-[var(--theme-text-secondary)]">
                            {TEAM_ROLE_LABELS[myRole]}
                          </span>
                        </div>
                      )}
                    </div>

                    {/* Member avatars */}
                    <div className="flex items-center mt-3 -space-x-2 space-x-reverse">
                      {team.members.slice(0, 5).map((member) => (
                        <UserAvatar
                          key={member.uid}
                          name={member.displayName}
                          photoURL={member.photoURL}
                          size="sm"
                        />
                      ))}
                      {team.members.length > 5 && (
                        <div className="w-8 h-8 rounded-full bg-[var(--theme-bg)] border border-[var(--theme-border)] flex items-center justify-center text-xs text-[var(--theme-text-secondary)]">
                          +{team.members.length - 5}
                        </div>
                      )}
                    </div>
                  </Link>
                </motion.div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

export default function TeamsPage() {
  return (
    <AuthGuard>
      <TeamsContent />
    </AuthGuard>
  );
}
