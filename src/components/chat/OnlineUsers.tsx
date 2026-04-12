'use client';

import { MessageCircle } from 'lucide-react';
import { UserProfile } from '@/contexts/AuthContext';

interface OnlineUsersProps {
  users: UserProfile[];
  onSelectUser: (userId: string) => void;
  onNewChat?: () => void;
}

export default function OnlineUsers({ users, onSelectUser, onNewChat }: OnlineUsersProps) {
  return (
    <div className="px-3 py-2.5 border-b border-[#2A3942]">
      <p className="text-[11px] text-[#8696a0] mb-2 font-medium uppercase tracking-wider">
        מחוברים עכשיו {users.length > 0 && `(${users.length})`}
      </p>
      {users.length === 0 ? (
        <div className="flex items-center justify-center py-2 gap-2">
          {onNewChat ? (
            <button
              onClick={onNewChat}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-[#00A884]/10 text-[#00A884] text-[11px] hover:bg-[#00A884]/20 transition-colors"
            >
              <MessageCircle className="w-3.5 h-3.5" />
              התחל שיחה חדשה
            </button>
          ) : (
            <p className="text-[11px] text-[#667781]">אף משתמש לא מחובר כרגע</p>
          )}
        </div>
      ) : (
        <div className="flex gap-3 overflow-x-auto pb-1" style={{ scrollbarWidth: 'none' }}>
          {users.map(u => (
            <button
              key={u.uid}
              onClick={() => onSelectUser(u.uid)}
              className="flex flex-col items-center gap-1 shrink-0 group"
            >
              <div className="relative">
                {u.photoURL ? (
                  <img
                    src={u.photoURL}
                    alt={u.displayName}
                    className="w-11 h-11 rounded-full object-cover border-2 border-transparent group-hover:border-[#00A884] transition-colors"
                  />
                ) : (
                  <div className="w-11 h-11 rounded-full bg-[#00A884] flex items-center justify-center text-white text-sm font-bold border-2 border-transparent group-hover:border-[#00A884]/50 transition-colors">
                    {u.displayName.charAt(0)}
                  </div>
                )}
                <span className="absolute bottom-0 right-0 w-3.5 h-3.5 rounded-full bg-[#00A884] border-[2.5px] border-[#111B21]" />
              </div>
              <span className="text-[10px] text-[#8696a0] group-hover:text-[#E9EDEF] truncate max-w-[56px] transition-colors">
                {u.displayName.split(' ')[0]}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
