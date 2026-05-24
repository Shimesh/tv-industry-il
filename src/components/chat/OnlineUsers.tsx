'use client';

import { UserProfile } from '@/contexts/AuthContext';

interface OnlineUsersProps {
  users: UserProfile[];
  onSelectUser: (userId: string) => void;
}

export default function OnlineUsers({ users, onSelectUser }: OnlineUsersProps) {
  if (users.length === 0) return null;

  return (
    <div className="px-3 py-2.5 border-b" style={{ borderColor: 'var(--theme-border)' }} dir="rtl">
      <p className="text-[11px] text-[var(--theme-text-secondary)] mb-2 font-medium uppercase tracking-wider">
        מחוברים עכשיו ({users.length})
      </p>
      <div className="flex gap-3 overflow-x-auto pb-1" style={{ scrollbarWidth: 'none' }}>
        {users.map((onlineUser) => (
          <button
            key={onlineUser.uid}
            onClick={() => onSelectUser(onlineUser.uid)}
            className="flex flex-col items-center gap-1 shrink-0 group"
          >
            <div className="relative">
              {onlineUser.photoURL ? (
                <img
                  src={onlineUser.photoURL}
                  alt={onlineUser.displayName}
                  className="w-11 h-11 rounded-full object-cover border-2 border-transparent group-hover:border-[#00A884] transition-colors"
                />
              ) : (
                <div className="w-11 h-11 rounded-full bg-[#00A884] flex items-center justify-center text-white text-sm font-bold border-2 border-transparent group-hover:border-[#00A884]/50 transition-colors">
                  {(onlineUser.displayName || 'מ').charAt(0)}
                </div>
              )}
              <span className="absolute bottom-0 right-0 w-3.5 h-3.5 rounded-full bg-[var(--theme-success)] border-[2.5px]" style={{ borderColor: 'var(--theme-bg)' }} />
            </div>
            <span className="text-[10px] text-[var(--theme-text-secondary)] group-hover:text-[var(--theme-text)] truncate max-w-[56px] transition-colors">
              {(onlineUser.displayName || 'משתמש').split(' ')[0]}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
