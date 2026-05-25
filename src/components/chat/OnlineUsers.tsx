'use client';

import { UserProfile } from '@/contexts/AuthContext';

interface OnlineUsersProps {
  users: UserProfile[];
  onSelectUser: (userId: string) => void;
}

export default function OnlineUsers({ users, onSelectUser }: OnlineUsersProps) {
  if (users.length === 0) return null;

  return (
    <div className="border-b px-3 py-2.5" style={{ borderColor: 'var(--theme-border)' }} dir="rtl">
      <p className="mb-2 text-[11px] font-medium uppercase tracking-wider text-[var(--theme-text-secondary)]">
        מחוברים עכשיו ({users.length})
      </p>
      <div className="flex gap-3 overflow-x-auto pb-1" style={{ scrollbarWidth: 'none' }}>
        {users.map((onlineUser) => (
          <button
            key={onlineUser.uid}
            onClick={() => onSelectUser(onlineUser.uid)}
            className="group flex shrink-0 flex-col items-center gap-1"
            title={`${onlineUser.displayName || 'משתמש'} מחובר/ת עכשיו`}
          >
            <div className="relative">
              {onlineUser.photoURL ? (
                <img
                  src={onlineUser.photoURL}
                  alt={onlineUser.displayName || 'משתמש'}
                  className="h-11 w-11 rounded-full border-2 border-transparent object-cover transition-colors group-hover:border-[#00A884]"
                  onError={(event) => {
                    event.currentTarget.style.display = 'none';
                    const fallback = event.currentTarget.nextElementSibling;
                    if (fallback instanceof HTMLElement) fallback.style.setProperty('display', 'flex');
                  }}
                />
              ) : null}
              <div
                className="h-11 w-11 items-center justify-center rounded-full border-2 border-transparent bg-[#00A884] text-sm font-bold text-white transition-colors group-hover:border-[#00A884]/50"
                style={{ display: onlineUser.photoURL ? 'none' : 'flex' }}
              >
                {(onlineUser.displayName || 'מ').charAt(0)}
              </div>
              <span
                className="absolute bottom-0 right-0 h-3.5 w-3.5 rounded-full border-[2.5px]"
                style={{
                  backgroundColor: onlineUser.status === 'busy' ? '#ef4444' : 'var(--theme-success)',
                  borderColor: 'var(--theme-bg)',
                }}
              />
            </div>
            <span className="max-w-[56px] truncate text-[10px] text-[var(--theme-text-secondary)] transition-colors group-hover:text-[var(--theme-text)]">
              {(onlineUser.displayName || 'משתמש').split(' ')[0]}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
