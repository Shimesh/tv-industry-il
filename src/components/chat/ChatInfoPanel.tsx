'use client';

import { useState, useMemo } from 'react';
import { X, UserPlus, Phone, MapPin, Briefcase, Search, Check, ExternalLink } from 'lucide-react';
import Link from 'next/link';
import type { ChatRoom } from '@/hooks/useChat';
import { PHONES_VISIBLE } from '@/lib/featureFlags';
import type { UserProfile } from '@/contexts/AuthContext';

function statusColor(isOnline?: boolean, status?: string): string {
  if (!isOnline) return '#6b7280'; // gray – offline
  if (status === 'busy') return '#ef4444'; // red
  return 'var(--theme-success)'; // green
}

function statusLabel(isOnline?: boolean, status?: string): string {
  if (!isOnline) return 'לא מחובר/ת';
  if (status === 'busy') return 'תפוס/ה';
  return 'מחובר/ת';
}

interface ChatInfoPanelProps {
  chat: ChatRoom;
  currentUserId: string;
  otherUser: UserProfile | null;
  allUsers: UserProfile[];
  onlineUsers: UserProfile[];
  onClose: () => void;
  onAddMembers: (memberIds: string[]) => Promise<void>;
}

export default function ChatInfoPanel({
  chat,
  currentUserId,
  otherUser,
  allUsers,
  onlineUsers,
  onClose,
  onAddMembers,
}: ChatInfoPanelProps) {
  const [addingMembers, setAddingMembers] = useState(false);
  const [memberSearch, setMemberSearch] = useState('');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [adding, setAdding] = useState(false);

  const isGroup = chat.type !== 'private';
  const isOtherOnline = !isGroup && otherUser
    ? onlineUsers.some(u => u.uid === otherUser.uid)
    : false;

  const onlineUserIds = useMemo(
    () => new Set([...onlineUsers.map(u => u.uid), currentUserId]),
    [onlineUsers, currentUserId],
  );

  // For groups: users not already in the chat
  const addableCandidates = useMemo(() => {
    if (!isGroup) return [];
    const memberSet = new Set(chat.members);
    return allUsers
      .filter(u => u.uid !== currentUserId && !memberSet.has(u.uid))
      .filter(u => {
        if (!memberSearch.trim()) return true;
        const q = memberSearch.toLowerCase();
        return (u.displayName || '').toLowerCase().includes(q) ||
               (u.department || '').toLowerCase().includes(q);
      })
      .sort((a, b) => {
        const aOnline = onlineUserIds.has(a.uid) ? 0 : 1;
        const bOnline = onlineUserIds.has(b.uid) ? 0 : 1;
        return aOnline - bOnline;
      });
  }, [isGroup, chat.members, allUsers, currentUserId, memberSearch, onlineUserIds]);

  // Members of the group with online status
  const enrichedMembers = useMemo(() => {
    return chat.membersInfo.map(m => {
      const profile = allUsers.find(u => u.uid === m.uid);
      const isOnline = m.uid ? onlineUserIds.has(m.uid) : false;
      return { ...m, isOnline, status: profile?.status ?? m.status };
    });
  }, [chat.membersInfo, allUsers, onlineUserIds]);

  const toggleSelect = (uid: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(uid)) next.delete(uid);
      else next.add(uid);
      return next;
    });
  };

  const handleAddMembers = async () => {
    if (!selectedIds.size) return;
    setAdding(true);
    try {
      await onAddMembers([...selectedIds]);
      setSelectedIds(new Set());
      setAddingMembers(false);
      setMemberSearch('');
    } finally {
      setAdding(false);
    }
  };

  return (
    <div
      className="absolute inset-0 z-30 flex flex-col overflow-hidden"
      style={{ background: 'var(--theme-bg)' }}
      dir="rtl"
    >
      {/* Header */}
      <div
        className="flex shrink-0 items-center justify-between border-b px-4 py-[13px]"
        style={{ background: 'var(--theme-bg-secondary)', borderColor: 'var(--theme-border)' }}
      >
        <div className="flex items-center gap-2">
          {addingMembers ? (
            <button
              onClick={() => { setAddingMembers(false); setSelectedIds(new Set()); setMemberSearch(''); }}
              className="rounded-full p-1 transition-colors hover:bg-[var(--theme-accent-glow)]"
            >
              <X className="h-5 w-5 text-[var(--theme-text-secondary)]" />
            </button>
          ) : (
            <button
              onClick={onClose}
              className="rounded-full p-1 transition-colors hover:bg-[var(--theme-accent-glow)]"
            >
              <X className="h-5 w-5 text-[var(--theme-text-secondary)]" />
            </button>
          )}
          <h2 className="text-[15px] font-semibold text-[var(--theme-text)]">
            {addingMembers ? 'הוסף חברים לקבוצה' : isGroup ? 'מידע על הקבוצה' : 'מידע על המשתמש'}
          </h2>
        </div>
        {addingMembers && selectedIds.size > 0 && (
          <button
            onClick={handleAddMembers}
            disabled={adding}
            className="rounded-lg bg-[var(--theme-accent)] px-3 py-1.5 text-[13px] font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            {adding ? 'מוסיף...' : `הוסף (${selectedIds.size})`}
          </button>
        )}
      </div>

      {addingMembers ? (
        /* ── Add Members Screen ── */
        <div className="flex min-h-0 flex-1 flex-col">
          <div className="px-4 py-3">
            <div className="relative">
              <Search className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--theme-text-secondary)]" />
              <input
                type="text"
                value={memberSearch}
                onChange={e => setMemberSearch(e.target.value)}
                placeholder="חיפוש משתמשים..."
                className="w-full rounded-lg border pr-10 pl-4 py-2 text-[13px] text-[var(--theme-text)] outline-none placeholder:text-[var(--theme-text-secondary)] focus:border-[var(--theme-accent)]"
                style={{ background: 'var(--theme-bg-secondary)', borderColor: 'var(--theme-border)' }}
                autoFocus
              />
            </div>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto">
            {addableCandidates.length === 0 ? (
              <p className="p-6 text-center text-[13px] text-[var(--theme-text-secondary)]">
                {memberSearch ? 'לא נמצאו משתמשים' : 'כל המשתמשים כבר בקבוצה'}
              </p>
            ) : addableCandidates.map(u => {
              const isSelected = selectedIds.has(u.uid);
              const isOnline = onlineUserIds.has(u.uid);
              return (
                <button
                  key={u.uid}
                  onClick={() => toggleSelect(u.uid)}
                  className="flex w-full items-center gap-3 px-4 py-2.5 transition-colors hover:bg-[var(--theme-accent-glow)]"
                  style={isSelected ? { background: 'var(--theme-accent-glow)' } : undefined}
                >
                  <div className="relative shrink-0">
                    {u.photoURL ? (
                      <img src={u.photoURL} alt="" className="h-10 w-10 rounded-full object-cover"
                        onError={e => { e.currentTarget.style.display = 'none'; }} />
                    ) : (
                      <div className="flex h-10 w-10 items-center justify-center rounded-full text-white font-bold"
                        style={{ backgroundColor: 'var(--theme-text-secondary)' }}>
                        {(u.displayName || 'מ').charAt(0)}
                      </div>
                    )}
                    <span
                      className="absolute bottom-0 right-0 h-3 w-3 rounded-full border-2"
                      style={{ backgroundColor: statusColor(isOnline, u.status), borderColor: 'var(--theme-bg)' }}
                    />
                  </div>
                  <div className="min-w-0 flex-1 text-right">
                    <p className="truncate text-[14px] font-medium text-[var(--theme-text)]">{u.displayName}</p>
                    <p className="truncate text-[12px] text-[var(--theme-text-secondary)]">
                      {[u.department, u.role].filter(Boolean).join(' · ') || statusLabel(isOnline, u.status)}
                    </p>
                  </div>
                  <div className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 transition-colors ${
                    isSelected ? 'bg-[var(--theme-accent)] border-[var(--theme-accent)]' : 'border-[var(--theme-border)]'
                  }`}>
                    {isSelected && <Check className="h-3 w-3 text-white" />}
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      ) : isGroup ? (
        /* ── Group Info ── */
        <div className="min-h-0 flex-1 overflow-y-auto">
          {/* Group avatar + name */}
          <div className="flex flex-col items-center gap-3 py-6 px-4">
            <div className="flex h-20 w-20 items-center justify-center rounded-full text-white text-3xl font-bold"
              style={{ background: 'var(--theme-accent)' }}>
              {chat.name.charAt(0)}
            </div>
            <div className="text-center">
              <h3 className="text-[18px] font-bold text-[var(--theme-text)]">{chat.name}</h3>
              <p className="mt-0.5 text-[13px] text-[var(--theme-text-secondary)]">{chat.members.length} משתתפים</p>
            </div>
          </div>

          <div className="border-t px-4 py-3" style={{ borderColor: 'var(--theme-border)' }}>
            <div className="flex items-center justify-between mb-2">
              <p className="text-[12px] font-semibold uppercase tracking-wider text-[var(--theme-text-secondary)]">
                חברי הקבוצה
              </p>
              <button
                onClick={() => setAddingMembers(true)}
                className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[12px] font-medium transition-colors hover:bg-[var(--theme-accent-glow)]"
                style={{ color: 'var(--theme-accent)' }}
              >
                <UserPlus className="h-3.5 w-3.5" />
                הוסף
              </button>
            </div>
            {enrichedMembers.map(m => (
              <div key={m.uid || m.displayName} className="flex items-center gap-3 py-2">
                <div className="relative shrink-0">
                  {m.photoURL ? (
                    <img src={m.photoURL} alt="" className="h-9 w-9 rounded-full object-cover"
                      onError={e => { e.currentTarget.style.display = 'none'; }} />
                  ) : (
                    <div className="flex h-9 w-9 items-center justify-center rounded-full text-white font-bold text-sm"
                      style={{ backgroundColor: 'var(--theme-text-secondary)' }}>
                      {m.displayName.charAt(0)}
                    </div>
                  )}
                  <span
                    className="absolute bottom-0 right-0 h-2.5 w-2.5 rounded-full border-[2px]"
                    style={{ backgroundColor: statusColor(m.isOnline, m.status), borderColor: 'var(--theme-bg)' }}
                  />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13px] font-medium text-[var(--theme-text)]">
                    {m.displayName}
                    {m.uid === currentUserId && <span className="mr-1 text-[11px] text-[var(--theme-text-secondary)]">(אתה)</span>}
                  </p>
                  <p className="text-[11px]" style={{ color: statusColor(m.isOnline, m.status) }}>
                    {statusLabel(m.isOnline, m.status)}
                  </p>
                </div>
                {m.uid && m.uid !== currentUserId && (
                  <Link
                    href={`/profile/${m.uid}`}
                    className="shrink-0 rounded-full p-1.5 transition-colors hover:bg-[var(--theme-accent-glow)]"
                    title="פרופיל"
                  >
                    <ExternalLink className="h-3.5 w-3.5 text-[var(--theme-text-secondary)]" />
                  </Link>
                )}
              </div>
            ))}
          </div>
        </div>
      ) : (
        /* ── Private Chat – User Info ── */
        <div className="min-h-0 flex-1 overflow-y-auto">
          {/* Avatar + name */}
          <div className="flex flex-col items-center gap-3 py-6 px-4">
            <div className="relative">
              {(otherUser?.photoURL || chat.membersInfo.find(m => m.uid !== currentUserId)?.photoURL) ? (
                <img
                  src={(otherUser?.photoURL || chat.membersInfo.find(m => m.uid !== currentUserId)?.photoURL)!}
                  alt=""
                  className="h-20 w-20 rounded-full object-cover"
                  onError={e => { e.currentTarget.style.display = 'none'; }}
                />
              ) : (
                <div className="flex h-20 w-20 items-center justify-center rounded-full text-white text-3xl font-bold"
                  style={{ backgroundColor: 'var(--theme-text-secondary)' }}>
                  {(otherUser?.displayName || chat.membersInfo.find(m => m.uid !== currentUserId)?.displayName || 'מ').charAt(0)}
                </div>
              )}
              <span
                className="absolute bottom-1 right-1 h-4 w-4 rounded-full border-[3px]"
                style={{
                  backgroundColor: statusColor(isOtherOnline, otherUser?.status),
                  borderColor: 'var(--theme-bg)',
                }}
              />
            </div>
            <div className="text-center">
              <h3 className="text-[18px] font-bold text-[var(--theme-text)]">
                {otherUser?.displayName || chat.membersInfo.find(m => m.uid !== currentUserId)?.displayName}
              </h3>
              <p className="mt-0.5 text-[13px] font-medium" style={{ color: statusColor(isOtherOnline, otherUser?.status) }}>
                {statusLabel(isOtherOnline, otherUser?.status)}
              </p>
            </div>
          </div>

          {/* Details */}
          <div className="border-t px-4 py-3 space-y-3" style={{ borderColor: 'var(--theme-border)' }}>
            {(otherUser?.department || otherUser?.role) && (
              <div className="flex items-center gap-3">
                <Briefcase className="h-4 w-4 shrink-0 text-[var(--theme-text-secondary)]" />
                <p className="text-[13px] text-[var(--theme-text)]">
                  {[otherUser.department, otherUser.role].filter(Boolean).join(' · ')}
                </p>
              </div>
            )}
            {otherUser?.city && (
              <div className="flex items-center gap-3">
                <MapPin className="h-4 w-4 shrink-0 text-[var(--theme-text-secondary)]" />
                <p className="text-[13px] text-[var(--theme-text)]">{otherUser.city}</p>
              </div>
            )}
            {PHONES_VISIBLE && otherUser?.showPhone && otherUser.phone && (
              <div className="flex items-center gap-3">
                <Phone className="h-4 w-4 shrink-0 text-[var(--theme-text-secondary)]" />
                <a href={`tel:${otherUser.phone}`} className="text-[13px] hover:underline"
                  style={{ color: 'var(--theme-accent)' }} dir="ltr">
                  {otherUser.phone}
                </a>
              </div>
            )}
            {otherUser?.bio && (
              <p className="text-[13px] text-[var(--theme-text-secondary)] border-t pt-3 leading-relaxed"
                style={{ borderColor: 'var(--theme-border)' }}>
                {otherUser.bio}
              </p>
            )}
          </div>

          {otherUser?.uid && (
            <div className="px-4 pb-6 pt-2">
              <Link
                href={`/profile/${otherUser.uid}`}
                className="flex w-full items-center justify-center gap-2 rounded-xl border py-2.5 text-[13px] font-medium transition-colors hover:bg-[var(--theme-accent-glow)]"
                style={{ borderColor: 'var(--theme-border)', color: 'var(--theme-text)' }}
              >
                <ExternalLink className="h-4 w-4" />
                פתח פרופיל מלא
              </Link>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
