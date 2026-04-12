'use client';

import { useMemo, useState } from 'react';
import { X, Search, Users, User, MessageCircle, Phone, Copy, Check } from 'lucide-react';
import type { UserProfile } from '@/contexts/AuthContext';
import type { Contact } from '@/data/contacts';
import { normalizeName, normalizePhone } from '@/lib/crewNormalization';

interface NewChatModalProps {
  users: UserProfile[];
  contacts: Contact[];
  onlineUsers: UserProfile[];
  currentUserId: string;
  onCreatePrivate: (userId: string) => void;
  onCreateGroup: (name: string, memberIds: string[]) => void;
  onClose: () => void;
}

interface DisplayPerson {
  key: string;
  displayName: string;
  role: string;
  department: string;
  phone?: string;
  photoURL?: string | null;
  userId?: string;
  isOnline?: boolean;
}

export default function NewChatModal({
  users,
  contacts,
  onlineUsers,
  currentUserId,
  onCreatePrivate,
  onCreateGroup,
  onClose,
}: NewChatModalProps) {
  const [mode, setMode] = useState<'private' | 'group'>('private');
  const [search, setSearch] = useState('');
  const [groupName, setGroupName] = useState('');
  const [selectedUsers, setSelectedUsers] = useState<string[]>([]);
  const [expandedKey, setExpandedKey] = useState<string | null>(null);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  const people = useMemo<DisplayPerson[]>(() => {
    const nextPeople: DisplayPerson[] = [];

    for (const u of users) {
      if (u.uid === currentUserId) continue;
      nextPeople.push({
        key: `user-${u.uid}`,
        displayName: u.displayName || '',
        role: u.role || '',
        department: u.department || '',
        phone: u.phone || undefined,
        photoURL: u.photoURL,
        userId: u.uid,
        isOnline: onlineUsers.some((onlineUser) => onlineUser.uid === u.uid),
      });
    }

    const registeredNames = new Set(nextPeople.map((person) => normalizeName(person.displayName)));
    const registeredPhones = new Set(
      nextPeople
        .filter((person) => person.phone)
        .map((person) => normalizePhone(person.phone!) ?? '')
        .filter(Boolean)
    );

    for (const contact of contacts) {
      const fullName = `${contact.firstName || ''} ${contact.lastName || ''}`.trim();
      if (!fullName) continue;

      const normalizedName = normalizeName(fullName);
      const normalizedPhone = normalizePhone(contact.phone || null);
      if (registeredNames.has(normalizedName) || (normalizedPhone && registeredPhones.has(normalizedPhone))) {
        continue;
      }

      nextPeople.push({
        key: `contact-${contact.id}`,
        displayName: fullName,
        role: contact.role || '',
        department: contact.department || '',
        phone: contact.phone,
        photoURL: null,
        userId: undefined,
        isOnline: false,
      });
    }

    nextPeople.sort((left, right) => {
      if (left.isOnline && !right.isOnline) return -1;
      if (!left.isOnline && right.isOnline) return 1;
      if (left.userId && !right.userId) return -1;
      if (!left.userId && right.userId) return 1;
      return left.displayName.localeCompare(right.displayName, 'he');
    });

    return nextPeople;
  }, [contacts, currentUserId, onlineUsers, users]);

  const filtered = useMemo(
    () =>
      people.filter((person) =>
        person.displayName.toLowerCase().includes(search.toLowerCase()) ||
        person.role.toLowerCase().includes(search.toLowerCase()) ||
        person.department.toLowerCase().includes(search.toLowerCase()) ||
        (person.phone && person.phone.includes(search))
      ),
    [people, search]
  );

  const toggleUser = (userId: string) => {
    setSelectedUsers((prev) =>
      prev.includes(userId) ? prev.filter((id) => id !== userId) : [...prev, userId]
    );
  };

  const handleCopyPhone = (phone: string, key: string) => {
    navigator.clipboard.writeText(phone).then(() => {
      setCopiedKey(key);
      setTimeout(() => setCopiedKey(null), 2000);
    });
  };

  const handlePersonClick = (person: DisplayPerson) => {
    if (mode === 'group') {
      if (person.userId) toggleUser(person.userId);
      return;
    }

    if (person.userId) {
      onCreatePrivate(person.userId);
      return;
    }

    setExpandedKey((prev) => (prev === person.key ? null : person.key));
  };

  const onlineCount = people.filter((person) => person.isOnline).length;

  return (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md overflow-hidden rounded-xl border border-[#2A3942] shadow-2xl"
        style={{ backgroundColor: '#202C33' }}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-center justify-between bg-[#00A884] px-5 py-4">
          <div>
            <h2 className="text-[17px] font-bold text-white">שיחה חדשה</h2>
            {onlineCount > 0 && (
              <p className="text-[11px] text-white/70">{onlineCount} מחוברים עכשיו</p>
            )}
          </div>
          <button onClick={onClose} className="rounded-full p-1 transition-colors hover:bg-white/20">
            <X className="h-5 w-5 text-white" />
          </button>
        </div>

        <div className="flex gap-1 border-b border-[#2A3942] p-3">
          <button
            onClick={() => {
              setMode('private');
              setSelectedUsers([]);
              setExpandedKey(null);
            }}
            className={`flex-1 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
              mode === 'private' ? 'bg-[#00A884] text-white' : 'text-[#8696a0] hover:bg-[#2A3942]'
            }`}
          >
            <span className="flex items-center justify-center gap-2">
              <User className="h-4 w-4" />
              שיחה פרטית
            </span>
          </button>
          <button
            onClick={() => {
              setMode('group');
              setExpandedKey(null);
            }}
            className={`flex-1 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
              mode === 'group' ? 'bg-[#00A884] text-white' : 'text-[#8696a0] hover:bg-[#2A3942]'
            }`}
          >
            <span className="flex items-center justify-center gap-2">
              <Users className="h-4 w-4" />
              קבוצה חדשה
            </span>
          </button>
        </div>

        {mode === 'group' && (
          <div className="border-b border-[#2A3942] p-3">
            <input
              type="text"
              value={groupName}
              onChange={(event) => setGroupName(event.target.value)}
              placeholder="שם הקבוצה..."
              className="w-full rounded-lg bg-[#2A3942] px-4 py-2.5 text-sm text-[#E9EDEF] outline-none placeholder:text-[#8696a0] focus:ring-1 focus:ring-[#00A884]"
            />
          </div>
        )}

        <div className="p-3">
          <div className="relative">
            <Search className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#8696a0]" />
            <input
              type="text"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="שם, תפקיד, מחלקה, טלפון..."
              className="w-full rounded-lg bg-[#2A3942] py-2 pl-3 pr-10 text-sm text-[#E9EDEF] outline-none placeholder:text-[#8696a0] focus:ring-1 focus:ring-[#00A884]"
            />
          </div>
        </div>

        {mode === 'group' && selectedUsers.length > 0 && (
          <div className="flex flex-wrap gap-1.5 px-3 pb-2">
            {selectedUsers.map((uid) => {
              const person = people.find((candidate) => candidate.userId === uid);
              if (!person) return null;

              return (
                <span
                  key={uid}
                  className="flex items-center gap-1 rounded-full bg-[#00A884] px-2.5 py-1 text-xs text-white"
                >
                  {person.displayName.split(' ')[0]}
                  <button onClick={() => toggleUser(uid)}>
                    <X className="h-3 w-3" />
                  </button>
                </span>
              );
            })}
          </div>
        )}

        <div className="flex items-center justify-between border-y border-[#2A3942] px-4 py-1.5">
          <span className="text-[11px] text-[#8696a0]">
            {mode === 'group' ? filtered.filter((person) => Boolean(person.userId)).length : filtered.length} אנשי קשר
          </span>
          {onlineCount > 0 && (
            <span className="flex items-center gap-1 text-[11px] text-[#00A884]">
              <span className="h-1.5 w-1.5 rounded-full bg-[#00A884]" />
              {onlineCount} מחוברים
            </span>
          )}
        </div>

        <div className="max-h-[320px] overflow-y-auto">
          {filtered.length === 0 ? (
            <div className="p-8 text-center">
              <p className="text-sm text-[#8696a0]">לא נמצאו אנשי קשר</p>
            </div>
          ) : mode === 'group' && filtered.every((person) => !person.userId) ? (
            <div className="flex flex-col items-center gap-2 p-8 text-center">
              <Users className="h-10 w-10 text-[#3B4A54]" />
              <p className="text-sm text-[#8696a0]">אין משתמשים רשומים לבחירה</p>
              <p className="text-[11px] text-[#667781]">רק משתמשים שהצטרפו לאפליקציה יכולים להיות חלק מקבוצה</p>
            </div>
          ) : (
            filtered
              .filter((person) => (mode === 'group' ? Boolean(person.userId) : true))
              .map((person) => {
                const isSelected = person.userId ? selectedUsers.includes(person.userId) : false;
                const canChat = Boolean(person.userId);
                const isExpanded = expandedKey === person.key;

                return (
                  <div key={person.key}>
                    <button
                      onClick={() => handlePersonClick(person)}
                      className={`w-full px-4 py-3 transition-colors hover:bg-[#2A3942] ${
                        isSelected ? 'bg-[#2A394280]' : ''
                      } ${isExpanded ? 'bg-[#2A3942]' : ''}`}
                    >
                      <div className="flex items-center gap-3">
                        {person.photoURL ? (
                          <img src={person.photoURL} alt="" className="h-10 w-10 shrink-0 rounded-full object-cover" />
                        ) : (
                          <div
                            className={`relative flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-sm font-bold text-white ${
                              canChat ? 'bg-[#00A884]' : 'bg-[#3B4A54]'
                            }`}
                          >
                            {person.displayName.charAt(0)}
                            {person.isOnline && (
                              <span className="absolute bottom-0 left-0 h-3 w-3 rounded-full border-2 border-[#202C33] bg-[#00A884]" />
                            )}
                          </div>
                        )}

                        <div className="min-w-0 flex-1 text-right">
                          <p className="truncate text-[14px] font-medium text-[#E9EDEF]">{person.displayName}</p>
                          <p className="truncate text-[11px] text-[#8696a0]">
                            {person.isOnline ? <span className="text-[#00A884]">מחובר • </span> : ''}
                            {person.role}
                            {person.role && person.department ? ' · ' : ''}
                            {person.department}
                          </p>
                        </div>

                        {mode === 'private' && canChat && (
                          <MessageCircle className="h-4 w-4 shrink-0 text-[#00A884] opacity-60" />
                        )}
                        {mode === 'private' && !canChat && person.phone && (
                          <Phone className="h-4 w-4 shrink-0 text-[#8696a0] opacity-60" />
                        )}
                        {mode === 'group' && canChat && isSelected && (
                          <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[#00A884]">
                            <span className="text-xs font-bold text-white">✓</span>
                          </div>
                        )}
                      </div>
                    </button>

                    {isExpanded && !canChat && person.phone && (
                      <div className="flex items-center justify-between gap-2 bg-[#2A3942] px-4 pb-3" dir="ltr">
                        <button
                          onClick={() => handleCopyPhone(person.phone!, person.key)}
                          className="flex items-center gap-2 rounded-lg bg-[#202C33] px-3 py-1.5 transition-colors hover:bg-[#111B21]"
                        >
                          {copiedKey === person.key ? (
                            <Check className="h-4 w-4 text-[#00A884]" />
                          ) : (
                            <Copy className="h-4 w-4 text-[#8696a0]" />
                          )}
                          <span className="font-mono text-[13px] text-[#E9EDEF]">{person.phone}</span>
                        </button>
                        <span className="text-[11px] text-[#8696a0]">לא רשום באפליקציה</span>
                      </div>
                    )}
                  </div>
                );
              })
          )}
        </div>

        {mode === 'group' && (
          <div className="border-t border-[#2A3942] p-3">
            <button
              onClick={() => {
                if (groupName.trim() && selectedUsers.length > 0) {
                  onCreateGroup(groupName.trim(), selectedUsers);
                }
              }}
              disabled={!groupName.trim() || selectedUsers.length === 0}
              className="w-full rounded-xl bg-[#00A884] py-3 text-sm font-bold text-white transition-colors hover:bg-[#06CF9C] disabled:cursor-not-allowed disabled:opacity-30"
            >
              צור קבוצה ({selectedUsers.length} חברים)
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
