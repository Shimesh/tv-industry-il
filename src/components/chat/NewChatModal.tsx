'use client';

import { useState } from 'react';
import { X, Search, Users, User, Hash } from 'lucide-react';
import UserAvatar from '@/components/UserAvatar';
import { UserProfile } from '@/contexts/AuthContext';

interface NewChatModalProps {
  users: UserProfile[];
  currentUserId: string;
  onCreatePrivate: (userId: string) => void;
  onCreateGroup: (name: string, memberIds: string[]) => void;
  onClose: () => void;
}

export default function NewChatModal({ users, currentUserId, onCreatePrivate, onCreateGroup, onClose }: NewChatModalProps) {
  const [mode, setMode] = useState<'private' | 'group'>('private');
  const [search, setSearch] = useState('');
  const [groupName, setGroupName] = useState('');
  const [selectedUsers, setSelectedUsers] = useState<string[]>([]);

  const filteredUsers = users
    .filter(u => u.uid !== currentUserId)
    .filter(u => u.displayName.toLowerCase().includes(search.toLowerCase()) ||
                 u.role?.toLowerCase().includes(search.toLowerCase()) ||
                 u.department?.toLowerCase().includes(search.toLowerCase()));

  const toggleUser = (userId: string) => {
    setSelectedUsers(prev =>
      prev.includes(userId) ? prev.filter(id => id !== userId) : [...prev, userId]
    );
  };

  const handleCreateGroup = () => {
    if (groupName.trim() && selectedUsers.length > 0) {
      onCreateGroup(groupName.trim(), selectedUsers);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <div
        className="w-full max-w-md rounded-2xl border shadow-2xl overflow-hidden"
        style={{ background: 'var(--theme-bg-secondary)', borderColor: 'var(--theme-border)' }}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-[var(--theme-border)]">
          <h2 className="text-lg font-bold text-[var(--theme-text)]">שיחה חדשה</h2>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-[var(--theme-accent-glow)] transition-all">
            <X className="w-5 h-5 text-[var(--theme-text-secondary)]" />
          </button>
        </div>

        {/* Mode Toggle */}
        <div className="flex gap-1 p-3 border-b border-[var(--theme-border)]">
          <button
            onClick={() => { setMode('private'); setSelectedUsers([]); }}
            className={`flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-all ${
              mode === 'private' ? 'bg-[var(--theme-accent-glow)] text-[var(--theme-accent)]' : 'text-[var(--theme-text-secondary)]'
            }`}
          >
            <User className="w-4 h-4" />
            שיחה פרטית
          </button>
          <button
            onClick={() => setMode('group')}
            className={`flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-all ${
              mode === 'group' ? 'bg-[var(--theme-accent-glow)] text-[var(--theme-accent)]' : 'text-[var(--theme-text-secondary)]'
            }`}
          >
            <Users className="w-4 h-4" />
            קבוצה חדשה
          </button>
        </div>

        {/* Group Name */}
        {mode === 'group' && (
          <div className="p-3 border-b border-[var(--theme-border)]">
            <input
              type="text"
              value={groupName}
              onChange={e => setGroupName(e.target.value)}
              placeholder="שם הקבוצה..."
              className="w-full px-4 py-2.5 rounded-lg text-sm outline-none"
              style={{ background: 'var(--theme-bg)', border: '1px solid var(--theme-border)', color: 'var(--theme-text)' }}
            />
          </div>
        )}

        {/* Search */}
        <div className="p-3">
          <div className="relative">
            <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--theme-text-secondary)]" />
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="חיפוש משתמשים..."
              className="w-full pr-10 pl-3 py-2 rounded-lg text-sm outline-none"
              style={{ background: 'var(--theme-bg)', border: '1px solid var(--theme-border)', color: 'var(--theme-text)' }}
            />
          </div>
        </div>

        {/* Selected users (group mode) */}
        {mode === 'group' && selectedUsers.length > 0 && (
          <div className="px-3 pb-2 flex flex-wrap gap-1.5">
            {selectedUsers.map(uid => {
              const u = users.find(u => u.uid === uid);
              if (!u) return null;
              return (
                <span
                  key={uid}
                  className="flex items-center gap-1 px-2 py-1 rounded-full text-xs bg-[var(--theme-accent-glow)] text-[var(--theme-accent)]"
                >
                  {u.displayName}
                  <button onClick={() => toggleUser(uid)} className="hover:text-red-400">
                    <X className="w-3 h-3" />
                  </button>
                </span>
              );
            })}
          </div>
        )}

        {/* User List */}
        <div className="max-h-64 overflow-y-auto border-t border-[var(--theme-border)]">
          {filteredUsers.length === 0 ? (
            <div className="p-6 text-center">
              <p className="text-sm text-[var(--theme-text-secondary)]">לא נמצאו משתמשים</p>
            </div>
          ) : (
            filteredUsers.map(u => (
              <button
                key={u.uid}
                onClick={() => {
                  if (mode === 'private') {
                    onCreatePrivate(u.uid);
                  } else {
                    toggleUser(u.uid);
                  }
                }}
                className={`w-full flex items-center gap-3 px-4 py-3 transition-all hover:bg-[var(--theme-accent-glow)] ${
                  selectedUsers.includes(u.uid) ? 'bg-[var(--theme-accent-glow)]' : ''
                }`}
              >
                <UserAvatar name={u.displayName} photoURL={u.photoURL} size="sm" isOnline={u.isOnline} />
                <div className="flex-1 text-right min-w-0">
                  <p className="text-sm font-medium text-[var(--theme-text)] truncate">{u.displayName}</p>
                  <p className="text-xs text-[var(--theme-text-secondary)] truncate">
                    {u.role}{u.role && u.department ? ' • ' : ''}{u.department}
                  </p>
                </div>
                {mode === 'group' && selectedUsers.includes(u.uid) && (
                  <div className="w-5 h-5 rounded-full bg-[var(--theme-accent)] flex items-center justify-center">
                    <span className="text-white text-xs">✓</span>
                  </div>
                )}
              </button>
            ))
          )}
        </div>

        {/* Create Group Button */}
        {mode === 'group' && (
          <div className="p-3 border-t border-[var(--theme-border)]">
            <button
              onClick={handleCreateGroup}
              disabled={!groupName.trim() || selectedUsers.length === 0}
              className="w-full py-2.5 rounded-xl bg-gradient-to-l from-purple-500 to-blue-600 text-white text-sm font-bold hover:shadow-lg transition-all disabled:opacity-30"
            >
              צור קבוצה ({selectedUsers.length} חברים)
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
