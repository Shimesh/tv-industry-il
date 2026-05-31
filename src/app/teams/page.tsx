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
      router.refresh();
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

  const roleBadge = (role: string) => {
    const configs: Record<string, { icon: React.ReactNode; label: string; color: string; bg: string }> = {
      owner: { icon: <Crown className="w-3.5 h-3.5" />, label: 'בעלים', color: '#fbbf24', bg: 'rgba(251,191,36,0.12)' },
      admin: { icon: <Shield className="w-3.5 h-3.5" />, label: 'מנהל', color: '#60a5fa', bg: 'rgba(96,165,250,0.12)' },
      member: { icon: <UserIcon className="w-3.5 h-3.5" />, label: 'חבר צוות', color: '#4ade80', bg: 'rgba(74,222,128,0.12)' },
      viewer: { icon: <Eye className="w-3.5 h-3.5" />, label: 'צופה', color: '#9ca3af', bg: 'rgba(156,163,175,0.12)' },
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
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ paddingTop: 'var(--app-header-offset)' }}>
        <Loader2 className="w-8 h-8 animate-spin text-[var(--theme-accent)]" />
      </div>
    );
  }

  return (
    <div className="min-h-screen" dir="rtl">
      {/* ── Hero ── */}
      <section className="app-hero relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-bl from-purple-900/10 via-transparent to-blue-900/10 pointer-events-none" />
        <div className="relative max-w-5xl mx-auto px-4 sm:px-6 py-10">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-6"
          >
            <div>
              <h1 className="text-4xl font-black gradient-text mb-1">צוותים</h1>
              <p className="text-sm text-[var(--theme-text-secondary)]">
                צור צוות, הזמן עמיתים ועקוב אחר הזמינות שלהם
              </p>
              {/* Stats row */}
              <div className="flex items-center gap-5 mt-4">
                <div className="flex flex-col">
                  <span className="text-2xl font-black text-[var(--theme-accent)]">{teams.length}</span>
                  <span className="text-xs text-[var(--theme-text-secondary)]">צוותים שלי</span>
                </div>
                <div className="w-px h-8" style={{ background: 'var(--theme-border)' }} />
                <div className="flex flex-col">
                  <span className="text-2xl font-black text-blue-400">{invites.length}</span>
                  <span className="text-xs text-[var(--theme-text-secondary)]">הזמנות ממתינות</span>
                </div>
              </div>
            </div>
            <button
              onClick={() => setShowCreate(true)}
              className="self-start sm:self-auto flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold transition-all text-white hover:shadow-lg hover:shadow-purple-500/25 hover:scale-105 active:scale-95"
              style={{ background: 'linear-gradient(135deg, var(--theme-accent), #7c3aed)' }}
            >
              <Plus className="w-4 h-4" />
              צור צוות
            </button>
          </motion.div>
        </div>
      </section>

      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-8 space-y-8">

        {/* ── Feature explanation grid ── */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="grid sm:grid-cols-3 gap-4"
        >
          {[
            {
              emoji: '👥',
              title: 'הזמן ושתף פעולה',
              desc: 'הזמן עמיתים לצוות, הגדר תפקידים וראה מי זמין',
            },
            {
              emoji: '📅',
              title: 'יומן הפקות משותף',
              desc: 'קישור ישיר ללוח הפקות המשותף של הצוות',
            },
            {
              emoji: '📋',
              title: 'ניהול הרשאות',
              desc: 'בעלים, מנהל, חבר צוות וצופה — לכל תפקיד הרשאות מותאמות',
            },
          ].map((feat, i) => (
            <motion.div
              key={feat.title}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.15 + i * 0.07 }}
              className="rounded-2xl p-5 flex flex-col gap-2"
              style={{
                background: 'var(--theme-bg-card)',
                border: '1px solid var(--theme-border)',
              }}
            >
              <span className="text-2xl">{feat.emoji}</span>
              <p className="font-bold text-sm text-[var(--theme-text)]">{feat.title}</p>
              <p className="text-xs text-[var(--theme-text-secondary)] leading-relaxed">{feat.desc}</p>
            </motion.div>
          ))}
        </motion.div>

        {/* ── Pending invites ── */}
        <AnimatePresence>
          {invites.length > 0 && (
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              className="rounded-2xl overflow-hidden"
              style={{
                border: '1px solid rgba(251,191,36,0.35)',
                background: 'rgba(251,191,36,0.06)',
              }}
            >
              <div
                className="px-5 py-4 flex items-center gap-2 border-b"
                style={{ borderColor: 'rgba(251,191,36,0.2)' }}
              >
                <UserPlus className="w-4 h-4 text-amber-400" />
                <h2 className="font-bold text-amber-400">
                  הזמנות ממתינות ({invites.length})
                </h2>
              </div>
              <div className="p-4 space-y-3">
                {invites.map((invite, i) => (
                  <motion.div
                    key={invite.id}
                    initial={{ opacity: 0, x: 12 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -12 }}
                    transition={{ delay: i * 0.05 }}
                    className="flex items-center justify-between p-4 rounded-xl gap-3"
                    style={{
                      background: 'var(--theme-bg-card)',
                      border: '1px solid var(--theme-border)',
                    }}
                  >
                    <div className="min-w-0">
                      <p className="font-bold text-[var(--theme-text)] truncate">
                        {invite.teamName}
                      </p>
                      <p className="text-sm text-[var(--theme-text-secondary)] truncate">
                        הוזמנת ע&quot;י {invite.invitedByName} כ{TEAM_ROLE_LABELS[invite.role]}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        onClick={() => handleAccept(invite)}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors"
                        style={{
                          background: 'rgba(74,222,128,0.15)',
                          color: '#4ade80',
                          border: '1px solid rgba(74,222,128,0.25)',
                        }}
                      >
                        <Check className="w-4 h-4" />
                        קבל
                      </button>
                      <button
                        onClick={() => declineInvite(invite.id)}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors"
                        style={{
                          background: 'rgba(239,68,68,0.12)',
                          color: '#f87171',
                          border: '1px solid rgba(239,68,68,0.2)',
                        }}
                      >
                        <X className="w-4 h-4" />
                        דחה
                      </button>
                    </div>
                  </motion.div>
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* ── Teams grid / empty state ── */}
        {teams.length === 0 ? (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex flex-col items-center justify-center py-24 text-center"
          >
            <div
              className="w-24 h-24 rounded-2xl flex items-center justify-center mb-6"
              style={{ background: 'var(--theme-bg-card)', border: '1px solid var(--theme-border)' }}
            >
              <Users className="w-12 h-12 text-[var(--theme-text-secondary)] opacity-50" />
            </div>
            <h2 className="text-2xl font-black text-[var(--theme-text)] mb-2">אין לך צוותים עדיין</h2>
            <p className="text-[var(--theme-text-secondary)] mb-8 max-w-sm">
              צור צוות חדש, הזמן עמיתים ועקוב אחר לוחות ההפקות המשותפים
            </p>
            <button
              onClick={() => setShowCreate(true)}
              className="inline-flex items-center gap-2 px-6 py-3 rounded-xl text-sm font-bold text-white transition-all hover:shadow-lg hover:shadow-purple-500/20 hover:scale-105 active:scale-95"
              style={{ background: 'linear-gradient(135deg, var(--theme-accent), #7c3aed)' }}
            >
              <Plus className="w-4 h-4" />
              צור צוות ראשון
            </button>
          </motion.div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {teams.map((team, i) => {
              const myRole = team.members.find(m => m.uid === user?.uid)?.role;
              return (
                <motion.div
                  key={team.id}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.06 }}
                >
                  <Link
                    href={`/teams/${team.id}`}
                    className="group block relative rounded-2xl overflow-hidden transition-all hover:shadow-xl hover:shadow-purple-500/10 hover:-translate-y-0.5"
                    style={{
                      background: 'var(--theme-bg-card)',
                      border: '1px solid var(--theme-border)',
                      borderRightWidth: 3,
                      borderRightColor: '#a78bfa',
                    }}
                  >
                    <div className="p-5">
                      {/* Header row */}
                      <div className="flex items-start gap-3 mb-4">
                        <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-purple-500 to-blue-600 flex items-center justify-center text-white font-black text-xl shrink-0">
                          {team.name.charAt(0)}
                        </div>
                        <div className="min-w-0 flex-1">
                          <h3 className="font-black text-[var(--theme-text)] truncate group-hover:text-[var(--theme-accent)] transition-colors">
                            {team.name}
                          </h3>
                          {team.description ? (
                            <p className="text-xs text-[var(--theme-text-secondary)] truncate mt-0.5">
                              {team.description}
                            </p>
                          ) : (
                            <p className="text-xs text-[var(--theme-text-secondary)] opacity-50 mt-0.5 italic">
                              ללא תיאור
                            </p>
                          )}
                        </div>
                      </div>

                      {/* Role badge */}
                      {myRole && (
                        <div className="mb-4">
                          {roleBadge(myRole)}
                        </div>
                      )}

                      {/* Member avatar stack */}
                      <div className="flex items-center gap-1.5">
                        <div className="flex items-center -space-x-2 space-x-reverse">
                          {team.members.slice(0, 4).map((member) => (
                            <UserAvatar
                              key={member.uid}
                              name={member.displayName}
                              photoURL={member.photoURL}
                              size="sm"
                            />
                          ))}
                          {team.members.length > 4 && (
                            <div
                              className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold"
                              style={{
                                background: 'var(--theme-bg-secondary)',
                                border: '2px solid var(--theme-bg-card)',
                                color: 'var(--theme-text-secondary)',
                              }}
                            >
                              +{team.members.length - 4}
                            </div>
                          )}
                        </div>
                        <span className="text-xs text-[var(--theme-text-secondary)] mr-1">
                          {team.members.length} חברים
                        </span>
                      </div>

                      {/* Hover hint */}
                      <div className="mt-3 flex items-center justify-end opacity-0 group-hover:opacity-100 transition-opacity">
                        <span className="text-xs font-medium text-[var(--theme-accent)] flex items-center gap-1">
                          לדף הצוות ←
                        </span>
                      </div>
                    </div>
                  </Link>
                </motion.div>
              );
            })}
          </div>
        )}
      </div>

      {/* ── Create Team Modal ── */}
      <AnimatePresence>
        {showCreate && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm p-0 sm:p-4"
            onClick={() => { setShowCreate(false); setError(''); }}
          >
            <motion.div
              initial={{ y: '100%', opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: '100%', opacity: 0 }}
              transition={{ type: 'spring', damping: 28, stiffness: 300 }}
              className="w-full sm:max-w-md rounded-t-3xl sm:rounded-2xl p-6 pb-8 sm:pb-6"
              style={{
                background: 'var(--theme-bg-secondary)',
                border: '1px solid var(--theme-border)',
                borderBottom: 'none',
              }}
              onClick={(e) => e.stopPropagation()}
            >
              {/* Drag handle on mobile */}
              <div className="flex justify-center mb-5 sm:hidden">
                <div className="w-12 h-1.5 rounded-full" style={{ background: 'var(--theme-border)' }} />
              </div>

              <div className="flex items-center gap-3 mb-6">
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-purple-500 to-blue-600 flex items-center justify-center shrink-0">
                  <Users className="w-5 h-5 text-white" />
                </div>
                <div>
                  <h2 className="text-xl font-black text-[var(--theme-text)]">צור צוות חדש</h2>
                  <p className="text-xs text-[var(--theme-text-secondary)]">הזמן עמיתים לאחר היצירה</p>
                </div>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-bold text-[var(--theme-text-secondary)] mb-1.5">
                    שם הצוות *
                  </label>
                  <input
                    type="text"
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    placeholder="לדוגמה: צוות הרצליה"
                    maxLength={50}
                    autoFocus
                    className="w-full px-4 py-3 rounded-xl text-sm text-[var(--theme-text)] placeholder-[var(--theme-text-secondary)] outline-none transition-all focus:ring-2 focus:ring-[var(--theme-accent)]/40"
                    style={{
                      background: 'var(--theme-bg)',
                      border: '1px solid var(--theme-border)',
                    }}
                    onKeyDown={(e) => e.key === 'Enter' && !creating && handleCreate()}
                  />
                </div>

                <div>
                  <label className="block text-sm font-bold text-[var(--theme-text-secondary)] mb-1.5">
                    תיאור <span className="font-normal opacity-60">(אופציונלי)</span>
                  </label>
                  <textarea
                    value={newDesc}
                    onChange={(e) => setNewDesc(e.target.value)}
                    placeholder="תיאור קצר של הצוות ומטרותיו..."
                    rows={3}
                    className="w-full px-4 py-3 rounded-xl text-sm text-[var(--theme-text)] placeholder-[var(--theme-text-secondary)] resize-none outline-none transition-all focus:ring-2 focus:ring-[var(--theme-accent)]/40"
                    style={{
                      background: 'var(--theme-bg)',
                      border: '1px solid var(--theme-border)',
                    }}
                  />
                </div>

                <AnimatePresence>
                  {error && (
                    <motion.p
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      exit={{ opacity: 0, height: 0 }}
                      className="text-sm text-red-400 flex items-center gap-1.5"
                    >
                      <X className="w-3.5 h-3.5 shrink-0" />
                      {error}
                    </motion.p>
                  )}
                </AnimatePresence>

                <div className="flex items-center gap-3 pt-1">
                  <button
                    onClick={handleCreate}
                    disabled={creating || !newName.trim()}
                    className="flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-xl text-sm font-black transition-all text-white hover:shadow-lg disabled:opacity-50 disabled:cursor-not-allowed"
                    style={{ background: 'linear-gradient(135deg, var(--theme-accent), #7c3aed)' }}
                  >
                    {creating ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Plus className="w-4 h-4" />
                    )}
                    {creating ? 'יוצר...' : 'צור צוות'}
                  </button>
                  <button
                    onClick={() => { setShowCreate(false); setError(''); }}
                    className="px-4 py-3 rounded-xl text-sm font-medium text-[var(--theme-text-secondary)] hover:bg-[var(--theme-accent-glow)] transition-colors"
                  >
                    ביטול
                  </button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
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
