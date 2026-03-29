'use client';

import { useState } from 'react';
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
  users, contacts, onlineUsers, currentUserId,
  onCreatePrivate, onCreateGroup, onClose,
}: NewChatModalProps) {
  const [mode, setMode] = useState<'private' | 'group'>('private');
  const [search, setSearch] = useState('');
  const [groupName, setGroupName] = useState('');
  const [selectedUsers, setSelectedUsers] = useState<string[]>([]);
  const [expandedKey, setExpandedKey] = useState<string | null>(null);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  // Build merged list: registered users first, then contacts not already represented
  const people: DisplayPerson[] = [];

  for (const u of users) {
    if (u.uid === currentUserId) continue;
    people.push({
      key: `user-${u.uid}`,
      displayName: u.displayName || '',
      role: u.role || '',
      department: u.department || '',
      phone: u.phone || undefined,
      photoURL: u.photoURL,
      userId: u.uid,
      isOnline: onlineUsers.some(o => o.uid === u.uid),
    });
  }

  const registeredNames = new Set(people.map(p => normalizeName(p.displayName)));
  const registeredPhones = new Set(
    people.filter(p => p.phone).map(p => normalizePhone(p.phone!) ?? '').filter(Boolean)
  );

  for (const c of contacts) {
    const fullName = `${c.firstName || ''} ${c.lastName || ''}`.trim();
    if (!fullName) continue;
    const normName = normalizeName(fullName);
    const normPhone = normalizePhone(c.phone || null);
    if (registeredNames.has(normName) || (normPhone && registeredPhones.has(normPhone))) continue;

    people.push({
      key: `contact-${c.id}`,
      displayName: fullName,
      role: c.role || '',
      department: c.department || '',
      phone: c.phone,
      photoURL: null,
      userId: undefined,
      isOnline: false,
    });
  }

  people.sort((a, b) => {
    if (a.isOnline && !b.isOnline) return -1;
    if (!a.isOnline && b.isOnline) return 1;
    if (a.userId && !b.userId) return -1;
    if (!a.userId && b.userId) return 1;
    return a.displayName.localeCompare(b.displayName, 'he');
  });

  const filtered = people.filter(p =>
    p.displayName.toLowerCase().includes(search.toLowerCase()) ||
    p.role.toLowerCase().includes(search.toLowerCase()) ||
    p.department.toLowerCase().includes(search.toLowerCase()) ||
    (p.phone && p.phone.includes(search))
  );

  const toggleUser = (userId: string) => {
    setSelectedUsers(prev =>
      prev.includes(userId) ? prev.filter(id => id !== userId) : [...prev, userId]
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
    } else {
      // Non-registered: toggle expand to show phone
      setExpandedKey(prev => prev === person.key ? null : person.key);
    }
  };

  const onlineCount = people.filter(p => p.isOnline).length;

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div
        className="w-full max-w-md rounded-xl shadow-2xl overflow-hidden border border-[#2A3942]"
        style={{ backgroundColor: '#202C33' }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 bg-[#00A884]">
          <div>
            <h2 className="text-[17px] font-bold text-white">שיחה חדשה</h2>
            {onlineCount > 0 && (
              <p className="text-[11px] text-white/70">{onlineCount} מחוברים עכשיו</p>
            )}
          </div>
          <button onClick={onClose} className="p-1 rounded-full hover:bg-white/20 transition-colors">
            <X className="w-5 h-5 text-white" />
          </button>
        </div>

        {/* Mode Toggle */}
        <div className="flex gap-1 p-3 border-b border-[#2A3942]">
          <button
            onClick={() => { setMode('private'); setSelectedUsers([]); setExpandedKey(null); }}
            className={`flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
              mode === 'private' ? 'bg-[#00A884] text-white' : 'text-[#8696a0] hover:bg-[#2A3942]'
            }`}
          >
            <User className="w-4 h-4" />
            שיחה פרטית
          </button>
          <button
            onClick={() => { setMode('group'); setExpandedKey(null); }}
            className={`flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
              mode === 'group' ? 'bg-[#00A884] text-white' : 'text-[#8696a0] hover:bg-[#2A3942]'
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
              className="w-full px-4 py-2.5 rounded-lg text-sm outline-none bg-[#2A3942] text-[#E9EDEF] placeholder:text-[#8696a0] focus:ring-1 focus:ring-[#00A884]"
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
              placeholder="שם, תפקיד, מחלקה, טלפון..."
              className="w-full pr-10 pl-3 py-2 rounded-lg text-sm outline-none bg-[#2A3942] text-[#E9EDEF] placeholder:text-[#8696a0] focus:ring-1 focus:ring-[#00A884]"
            />
          </div>
        </div>

        {/* Selected users (group mode) */}
        {mode === 'group' && selectedUsers.length > 0 && (
          <div className="px-3 pb-2 flex flex-wrap gap-1.5">
            {selectedUsers.map(uid => {
              const p = people.find(p => p.userId === uid);
              if (!p) return null;
              return (
                <span key={uid} className="flex items-center gap-1 px-2.5 py-1 rounded-full text-xs bg-[#00A884] text-white">
                  {p.displayName.split(' ')[0]}
                  <button onClick={() => toggleUser(uid)}><X className="w-3 h-3" /></button>
                </span>
              );
            })}
          </div>
        )}

        {/* Stats bar */}
        <div className="px-4 py-1.5 border-t border-[#2A3942] flex items-center justify-between">
          <span className="text-[11px] text-[#8696a0]">
            {mode === 'group' ? filtered.filter(p => !!p.userId).length : filtered.length} אנשי קשר
          </span>
          {onlineCount > 0 && (
            <span className="text-[11px] text-[#00A884] flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-[#00A884]" />
              {onlineCount} מחוברים
            </span>
          )}
        </div>

        {/* List */}
        <div className="max-h-[320px] overflow-y-auto border-t border-[#2A3942]">
          {filtered.length === 0 ? (
            <div className="p-8 text-center">
              <p className="text-sm text-[#8696a0]">לא נמצאו אנשי קשר</p>
            </div>
          ) : mode === 'group' && filtered.every(p => !p.userId) ? (
            <div className="p-8 text-center flex flex-col items-center gap-2">
              <Users className="w-10 h-10 text-[#3B4A54]" />
              <p className="text-sm text-[#8696a0]">אין משתמשים רשומים לבחירה</p>
              <p className="text-[11px] text-[#667781]">רק משתמשים שהצטרפו לאפליקציה יכולים להיות חלק מקבוצה</p>
            </div>
          ) : (
            filtered
              .filter(p => mode === 'group' ? !!p.userId : true)
              .map(p => {
              const isSelected = p.userId ? selectedUsers.includes(p.userId) : false;
              const canChat = !!p.userId;
              const isExpanded = expandedKey === p.key;

              return (
                <div key={p.key}>
                  <button
                    onClick={() => handlePersonClick(p)}
                    className={`w-full flex items-center gap-3 px-4 py-3 transition-colors hover:bg-[#2A3942] ${
                      isSelected ? 'bg-[#2A394280]' : ''} ${isExpanded ? 'bg-[#2A3942]' : ''}`}
                  >
                    {p.photoURL ? (
                      <img src={p.photoURL} alt="" className="w-10 h-10 rounded-full object-cover shrink-0" />
                    ) : (
                      <div className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 text-white font-bold text-sm relative ${
                        canChat ? 'bg-[#00A884]' : 'bg-[#3B4A54]'
                      }`}>
                        {p.displayName.charAt(0)}
                        {p.isOnline && (
                          <span className="absolute bottom-0 left-0 w-3 h-3 rounded-full bg-[#00A884] border-2 border-[#202C33]" />
                        )}
                      </div>
                    )}

                    <div className="flex-1 text-right min-w-0">
                      <p className="text-[14px] font-medium text-[#E9EDEF] truncate">{p.displayName}</p>
                      <p className="text-[11px] text-[#8696a0] truncate">
                        {p.isOnline ? <span className="text-[#00A884]">מחובר • </span> : ''}
                        {p.role}{p.role && p.department ? ' · ' : ''}{p.department}
                      </p>
                    </div>

                    {mode === 'private' && canChat && (
                      <MessageCircle className="w-4 h-4 text-[#00A884] shrink-0 opacity-60" />
                    )}
                    {mode === 'private' && !canChat && p.phone && (
                      <Phone className="w-4 h-4 text-[#8696a0] shrink-0 opacity-60" />
                    )}
                    {mode === 'group' && canChat && isSelected && (
                      <div className="w-5 h-5 rounded-full bg-[#00A884] flex items-center justify-center shrink-0">
                        <span className="text-white text-xs font-bold">✓</span>
                      </div>
                    )}
                  </button>

                  {/* Expanded phone panel for non-registered contacts */}
                  {isExpanded && !canChat && p.phone && (
                    <div className="px-4 pb-3 bg-[#2A3942] flex items-center justify-between gap-2" dir="ltr">
                      <button
                        onClick={() => handleCopyPhone(p.phone!, p.key)}
                        className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-[#202C33] hover:bg-[#111B21] transition-colors"
                      >
                        {copiedKey === p.key
                          ? <Check className="w-4 h-4 text-[#00A884]" />
                          : <Copy className="w-4 h-4 text-[#8696a0]" />
                        }
                        <span className="text-[13px] text-[#E9EDEF] font-mono">{p.phone}</span>
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
          <div className="p-3 border-t border-[#2A3942]">
            <button
              onClick={() => { if (groupName.trim() && selectedUsers.length > 0) onCreateGroup(groupName.trim(), selectedUsers); }}
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
