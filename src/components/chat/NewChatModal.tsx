'use client';

import { useState } from 'react';
import { X, Search, Users, User } from 'lucide-react';
import type { UserProfile } from '@/contexts/AuthContext';

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
    .filter(u =>
      u.displayName.toLowerCase().includes(search.toLowerCase()) ||
      u.role?.toLowerCase().includes(search.toLowerCase()) ||
      u.department?.toLowerCase().includes(search.toLowerCase())
    );

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
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div
        className="w-full max-w-md rounded-xl shadow-2xl overflow-hidden border border-[#2A3942]"
        style={{ backgroundColor: '#202C33' }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 bg-[#00A884]">
          <h2 className="text-[17px] font-bold text-white">שיחה חדשה</h2>
          <button onClick={onClose} className="p-1 rounded-full hover:bg-white/20 transition-colors">
            <X className="w-5 h-5 text-white" />
          </button>
        </div>

        {/* Mode Toggle */}
        <div className="flex gap-1 p-3 border-b border-[#2A3942]">
          <button
            onClick={() => { setMode('private'); setSelectedUsers([]); }}
            className={`flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
              mode === 'private'
                ? 'bg-[#00A884] text-white'
                : 'text-[#8696a0] hover:bg-[#2A3942]'
            }`}
          >
            <User className="w-4 h-4" />
            שיחה פרטית
          </button>
          <button
            onClick={() => setMode('group')}
            className={`flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
              mode === 'group'
                ? 'bg-[#00A884] text-white'
                : 'text-[#8696a0] hover:bg-[#2A3942]'
            }`}
          >
            <Users className="w-4 h-4" />
            קבוצה חדשה
          </button>
        </div>

        {/* Group Name */}
        {mode === 'group' && (
          <div className="p-3 border-b border-[#2A3942]">
            <input
              type="text"
              value={groupName}
              onChange={e => setGroupName(e.target.value)}
              placeholder="שם הקבוצה..."
              className="w-full px-4 py-2.5 rounded-lg text-sm outline-none bg-[#2A3942] text-[#E9EDEF] placeholder:text-[#8696a0] focus:ring-1 focus:ring-[#00A884] transition"
            />
          </div>
        )}

        {/* Search */}
        <div className="p-3">
          <div className="relative">
            <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#8696a0]" />
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="חיפוש משתמשים..."
              className="w-full pr-10 pl-3 py-2 rounded-lg text-sm outline-none bg-[#2A3942] text-[#E9EDEF] placeholder:text-[#8696a0] focus:ring-1 focus:ring-[#00A884] transition"
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
                  className="flex items-center gap-1 px-2.5 py-1 rounded-full text-xs bg-[#00A884] text-white"
                >
                  {u.displayName.split(' ')[0]}
                  <button onClick={() => toggleUser(uid)} className="hover:text-red-200 transition-colors">
                    <X className="w-3 h-3" />
                  </button>
                </span>
              );
            })}
          </div>
        )}

        {/* User List */}
        <div className="max-h-[300px] overflow-y-auto border-t border-[#2A3942]">
          {filteredUsers.length === 0 ? (
            <div className="p-8 text-center">
              <p className="text-sm text-[#8696a0]">לא נמצאו משתמשים</p>
            </div>
          ) : (
            filteredUsers.map(u => (
              <button
                key={u.uid}
                onClick={() => mode === 'private' ? onCreatePrivate(u.uid) : toggleUser(u.uid)}
                className={`w-full flex items-center gap-3 px-4 py-3 transition-colors hover:bg-[#2A3942] ${
                  selectedUsers.includes(u.uid) ? 'bg-[#2A394280]' : ''
                }`}
              >
                {u.photoURL ? (
                  <img src={u.photoURL} alt="" className="w-10 h-10 rounded-full object-cover shrink-0" />
                ) : (
                  <div className="w-10 h-10 rounded-full bg-[#6B7C85] flex items-center justify-center shrink-0 text-white font-bold">
                    {u.displayName.charAt(0)}
                  </div>
                )}
                <div className="flex-1 text-right min-w-0">
                  <p className="text-[14px] font-medium text-[#E9EDEF] truncate">{u.displayName}</p>
                  <p className="text-[12px] text-[#8696a0] truncate">
                    {u.role}{u.role && u.department ? ' • ' : ''}{u.department}
                  </p>
                </div>
                {u.isOnline && (
                  <span className="w-2.5 h-2.5 rounded-full bg-[#00A884] shrink-0" />
                )}
                {mode === 'group' && selectedUsers.includes(u.uid) && (
                  <div className="w-5 h-5 rounded-full bg-[#00A884] flex items-center justify-center shrink-0">
                    <span className="text-white text-xs font-bold">✓</span>
                  </div>
                )}
              </button>
            ))
          )}
        </div>

        {/* Create Group Button */}
        {mode === 'group' && (
          <div className="p-3 border-t border-[#2A3942]">
            <button
              onClick={handleCreateGroup}
              disabled={!groupName.trim() || selectedUsers.length === 0}
              className="w-full py-3 rounded-xl bg-[#00A884] text-white text-sm font-bold hover:bg-[#06CF9C] transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
            >
              צור קבוצה ({selectedUsers.length} חברים)
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
