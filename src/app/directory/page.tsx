'use client';

import { useState, useMemo } from 'react';
import { contacts, departments, type Contact } from '@/data/contacts';
import { Search, Phone, User, X, Briefcase, Users, LayoutGrid, List, MessageCircle } from 'lucide-react';

const deptColors: Record<string, string> = {
  'צילום': 'from-blue-500 to-blue-600',
  'טכני': 'from-emerald-500 to-emerald-600',
  'הפקה': 'from-purple-500 to-purple-600',
  'סאונד': 'from-orange-500 to-orange-600',
  'תאורה': 'from-yellow-500 to-amber-600',
};

const deptBadgeColors: Record<string, string> = {
  'צילום': 'bg-blue-500/15 text-blue-300',
  'טכני': 'bg-emerald-500/15 text-emerald-300',
  'הפקה': 'bg-purple-500/15 text-purple-300',
  'סאונד': 'bg-orange-500/15 text-orange-300',
  'תאורה': 'bg-yellow-500/15 text-yellow-300',
};

export default function DirectoryPage() {
  const [search, setSearch] = useState('');
  const [deptFilter, setDeptFilter] = useState('');
  const [availFilter, setAvailFilter] = useState('');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [selectedContact, setSelectedContact] = useState<Contact | null>(null);

  const filtered = useMemo(() => {
    return contacts.filter(c => {
      const matchSearch = !search || `${c.firstName} ${c.lastName} ${c.role} ${c.department}`.includes(search);
      const matchDept = !deptFilter || c.department === deptFilter;
      const matchAvail = !availFilter ||
        (availFilter === 'available' && c.availability === 'available') ||
        (availFilter === 'unavailable' && c.availability === 'unavailable');
      return matchSearch && matchDept && matchAvail;
    });
  }, [search, deptFilter, availFilter]);

  const availableCount = contacts.filter(c => c.availability === 'available').length;

  const formatWhatsApp = (phone?: string) => {
    if (!phone) return '';
    const cleaned = phone.replace(/[-\s]/g, '');
    return `https://wa.me/972${cleaned.startsWith('0') ? cleaned.slice(1) : cleaned}`;
  };

  return (
    <div className="min-h-screen">
      {/* Header */}
      <section className="relative overflow-hidden border-b" style={{ borderColor: 'var(--theme-border)' }}>
        <div className="absolute inset-0 bg-gradient-to-bl from-purple-900/20 via-transparent to-blue-900/10" />
        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 py-10">
          <div className="flex items-center gap-4 mb-2">
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-purple-500 to-blue-600 flex items-center justify-center shadow-lg">
              <Users className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="text-3xl sm:text-4xl font-black gradient-text">אלפון מקצועי</h1>
              <p className="text-sm mt-1" style={{ color: 'var(--theme-text-secondary)' }}>מאגר אנשי המקצוע של תעשיית הטלוויזיה הישראלית</p>
            </div>
          </div>
          <div className="flex items-center gap-4 mt-4 text-sm" style={{ color: 'var(--theme-text-secondary)' }}>
            <span>{contacts.length} אנשי מקצוע</span>
            <span style={{ color: 'var(--theme-text-secondary)', opacity: 0.5 }}>|</span>
            <span className="text-green-400">{availableCount} פנויים</span>
          </div>
        </div>
      </section>

      {/* Search & Filters */}
      <section className="sticky top-16 z-30 backdrop-blur-xl border-b" style={{ background: 'var(--theme-bg)', borderColor: 'var(--theme-border)' }}>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-4">
          <div className="flex flex-col sm:flex-row gap-3">
            {/* Search */}
            <div className="relative flex-1">
              <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: 'var(--theme-text-secondary)', opacity: 0.7 }} />
              <input
                type="text"
                placeholder="חיפוש לפי שם, תפקיד..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full pl-4 pr-10 py-2.5 rounded-xl border placeholder-gray-500 text-sm focus:outline-none focus:border-purple-500/50 focus:ring-1 focus:ring-purple-500/20"
                style={{ background: 'var(--theme-bg-secondary)', borderColor: 'var(--theme-border)', color: 'var(--theme-text)' }}
              />
            </div>

            {/* Department Filter */}
            <select
              value={deptFilter}
              onChange={(e) => setDeptFilter(e.target.value)}
              className="px-4 py-2.5 rounded-xl border text-sm focus:outline-none focus:border-purple-500/50 appearance-none cursor-pointer"
              style={{ background: 'var(--theme-bg-secondary)', borderColor: 'var(--theme-border)', color: 'var(--theme-text)' }}
            >
              <option value="">כל המחלקות</option>
              {departments.map(d => (
                <option key={d.id} value={d.label}>{d.icon} {d.label}</option>
              ))}
            </select>

            {/* Availability Filter */}
            <select
              value={availFilter}
              onChange={(e) => setAvailFilter(e.target.value)}
              className="px-4 py-2.5 rounded-xl border text-sm focus:outline-none focus:border-purple-500/50 appearance-none cursor-pointer"
              style={{ background: 'var(--theme-bg-secondary)', borderColor: 'var(--theme-border)', color: 'var(--theme-text)' }}
            >
              <option value="">כל הסטטוסים</option>
              <option value="available">פנויים</option>
              <option value="unavailable">לא פנויים</option>
            </select>

            {/* View Toggle */}
            <div className="flex rounded-xl border overflow-hidden" style={{ borderColor: 'var(--theme-border)' }}>
              <button onClick={() => setViewMode('grid')} className={`p-2.5 ${viewMode === 'grid' ? 'bg-purple-500/20 text-purple-400' : ''}`} style={viewMode !== 'grid' ? { background: 'var(--theme-bg-secondary)', color: 'var(--theme-text-secondary)' } : undefined}>
                <LayoutGrid className="w-4 h-4" />
              </button>
              <button onClick={() => setViewMode('list')} className={`p-2.5 ${viewMode === 'list' ? 'bg-purple-500/20 text-purple-400' : ''}`} style={viewMode !== 'list' ? { background: 'var(--theme-bg-secondary)', color: 'var(--theme-text-secondary)' } : undefined}>
                <List className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Active Filters & Count */}
          <div className="flex items-center justify-between mt-3">
            <span className="text-sm" style={{ color: 'var(--theme-text-secondary)' }}>{filtered.length} תוצאות</span>
            {(search || deptFilter || availFilter) && (
              <button onClick={() => { setSearch(''); setDeptFilter(''); setAvailFilter(''); }}
                className="text-xs text-purple-400 hover:text-purple-300 flex items-center gap-1">
                <X className="w-3 h-3" /> נקה פילטרים
              </button>
            )}
          </div>
        </div>
      </section>

      {/* Contact Cards */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 py-8">
        {viewMode === 'grid' ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {filtered.map(contact => (
              <div key={contact.id} onClick={() => setSelectedContact(contact)}
                className="rounded-xl border p-5 cursor-pointer card-glow transition-colors" style={{ background: 'var(--theme-bg-card)', borderColor: 'var(--theme-border)' }}>
                <div className="flex items-start gap-3">
                  <div className={`w-12 h-12 rounded-full bg-gradient-to-br ${deptColors[contact.department] || 'from-gray-500 to-gray-600'} flex items-center justify-center text-white font-bold text-sm shrink-0`}>
                    {contact.firstName[0]}{contact.lastName[0]}
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="font-bold truncate transition-colors" style={{ color: 'var(--theme-text)' }}>{contact.firstName} {contact.lastName}</h3>
                    <div className="flex items-center gap-2 mt-1 flex-wrap">
                      <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: 'var(--theme-bg-secondary)', color: 'var(--theme-text-secondary)' }}>{contact.role}</span>
                      <span className={`text-xs px-2 py-0.5 rounded-full ${deptBadgeColors[contact.department] || 'bg-gray-700/50 text-gray-300'}`}>
                        {contact.department}
                      </span>
                    </div>
                  </div>
                </div>
                <div className="mt-3 flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <span className={`w-2 h-2 rounded-full ${
                      contact.availability === 'available' ? 'bg-green-400' :
                      contact.availability === 'unavailable' ? 'bg-red-400' : 'bg-gray-500'
                    }`} />
                    <span className={`text-xs ${
                      contact.availability === 'available' ? 'text-green-400' :
                      contact.availability === 'unavailable' ? 'text-red-400' : 'text-gray-500'
                    }`}>
                      {contact.availability === 'available' ? 'פנוי' : contact.availability === 'unavailable' ? 'לא פנוי' : 'לא צוין'}
                    </span>
                  </div>
                  {contact.phone && (
                    <a href={`tel:${contact.phone}`} onClick={(e) => e.stopPropagation()}
                      className="flex items-center gap-1 text-xs hover:text-green-400 transition-colors" style={{ color: 'var(--theme-text-secondary)' }}>
                      <Phone className="w-3 h-3" />
                      <span dir="ltr">{contact.phone}</span>
                    </a>
                  )}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="rounded-xl border overflow-hidden transition-colors" style={{ background: 'var(--theme-bg-card)', borderColor: 'var(--theme-border)' }}>
            {filtered.map((contact, i) => (
              <div key={contact.id} onClick={() => setSelectedContact(contact)}
                className="flex items-center gap-4 px-4 py-3 cursor-pointer hover:opacity-80 transition-colors"
                style={i > 0 ? { borderTop: '1px solid var(--theme-border)' } : undefined}>
                <div className={`w-9 h-9 rounded-full bg-gradient-to-br ${deptColors[contact.department] || 'from-gray-500 to-gray-600'} flex items-center justify-center text-white font-bold text-xs shrink-0`}>
                  {contact.firstName[0]}{contact.lastName[0]}
                </div>
                <div className="flex-1 min-w-0">
                  <span className="font-medium text-sm" style={{ color: 'var(--theme-text)' }}>{contact.firstName} {contact.lastName}</span>
                </div>
                <span className="text-xs hidden sm:block" style={{ color: 'var(--theme-text-secondary)' }}>{contact.role}</span>
                <span className={`text-xs px-2 py-0.5 rounded-full hidden md:block ${deptBadgeColors[contact.department] || 'bg-gray-700/50 text-gray-300'}`}>
                  {contact.department}
                </span>
                <span className={`w-2 h-2 rounded-full ${contact.availability === 'available' ? 'bg-green-400' : contact.availability === 'unavailable' ? 'bg-red-400' : 'bg-gray-500'}`} />
                {contact.phone && (
                  <a href={`tel:${contact.phone}`} onClick={(e) => e.stopPropagation()}
                    className="text-xs hover:text-green-400 hidden sm:block" style={{ color: 'var(--theme-text-secondary)' }} dir="ltr">{contact.phone}</a>
                )}
              </div>
            ))}
          </div>
        )}

        {filtered.length === 0 && (
          <div className="text-center py-16">
            <User className="w-12 h-12 mx-auto mb-4" style={{ color: 'var(--theme-text-secondary)', opacity: 0.5 }} />
            <h3 className="font-bold text-lg mb-2" style={{ color: 'var(--theme-text-secondary)' }}>לא נמצאו תוצאות</h3>
            <p className="text-sm" style={{ color: 'var(--theme-text-secondary)', opacity: 0.7 }}>נסו לשנות את הפילטרים או לחפש מחדש</p>
          </div>
        )}
      </section>

      {/* Department Summary */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 pb-12">
        <h3 className="text-lg font-bold mb-4 transition-colors" style={{ color: 'var(--theme-text)' }}>לפי מחלקה</h3>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
          {departments.map(dept => {
            const count = contacts.filter(c => c.department === dept.label).length;
            return (
              <button key={dept.id} onClick={() => setDeptFilter(deptFilter === dept.label ? '' : dept.label)}
                className={`p-4 rounded-xl border text-center transition-all ${
                  deptFilter === dept.label ? 'border-purple-500/50 bg-purple-500/10' : 'hover:opacity-80'
                }`}
                style={deptFilter !== dept.label ? { borderColor: 'var(--theme-border)', background: 'var(--theme-bg-card)' } : undefined}>
                <span className="text-2xl">{dept.icon}</span>
                <div className="font-bold mt-1 transition-colors" style={{ color: 'var(--theme-text)' }}>{count}</div>
                <div className="text-xs transition-colors" style={{ color: 'var(--theme-text-secondary)' }}>{dept.label}</div>
              </button>
            );
          })}
        </div>
      </section>

      {/* Contact Modal */}
      {selectedContact && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm" onClick={() => setSelectedContact(null)}>
          <div className="rounded-2xl border max-w-md w-full p-6 animate-fade-in" style={{ background: 'var(--theme-bg)', borderColor: 'var(--theme-border)' }} onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-lg font-bold" style={{ color: 'var(--theme-text)' }}>פרופיל איש קשר</h3>
              <button onClick={() => setSelectedContact(null)} className="p-1 rounded-lg hover:opacity-70 transition-colors" style={{ color: 'var(--theme-text-secondary)' }}>
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="text-center mb-6">
              <div className={`w-20 h-20 rounded-full bg-gradient-to-br ${deptColors[selectedContact.department] || 'from-gray-500 to-gray-600'} flex items-center justify-center text-white font-bold text-2xl mx-auto mb-3`}>
                {selectedContact.firstName[0]}{selectedContact.lastName[0]}
              </div>
              <h2 className="text-xl font-black" style={{ color: 'var(--theme-text)' }}>{selectedContact.firstName} {selectedContact.lastName}</h2>
              <div className="flex items-center justify-center gap-2 mt-2">
                <span className="text-sm px-3 py-1 rounded-full" style={{ background: 'var(--theme-bg-secondary)', color: 'var(--theme-text-secondary)' }}><Briefcase className="w-3 h-3 inline ml-1" />{selectedContact.role}</span>
                <span className={`text-sm px-3 py-1 rounded-full ${deptBadgeColors[selectedContact.department]}`}>{selectedContact.department}</span>
              </div>
              <div className="flex items-center justify-center gap-1.5 mt-3">
                <span className={`w-2.5 h-2.5 rounded-full ${selectedContact.availability === 'available' ? 'bg-green-400' : selectedContact.availability === 'unavailable' ? 'bg-red-400' : 'bg-gray-500'}`} />
                <span className={`text-sm font-medium ${selectedContact.availability === 'available' ? 'text-green-400' : selectedContact.availability === 'unavailable' ? 'text-red-400' : 'text-gray-400'}`}>
                  {selectedContact.availability === 'available' ? 'פנוי לעבודה' : selectedContact.availability === 'unavailable' ? 'לא פנוי' : 'סטטוס לא צוין'}
                </span>
              </div>
            </div>

            {selectedContact.skills && selectedContact.skills.length > 0 && (
              <div className="mb-6">
                <h4 className="text-xs font-medium mb-2" style={{ color: 'var(--theme-text-secondary)', opacity: 0.7 }}>מיומנויות</h4>
                <div className="flex flex-wrap gap-2">
                  {selectedContact.skills.map(skill => (
                    <span key={skill} className="text-xs px-2.5 py-1 rounded-full bg-purple-500/10 text-purple-300">{skill}</span>
                  ))}
                </div>
              </div>
            )}

            {selectedContact.phone && (
              <div className="space-y-2">
                <a href={`tel:${selectedContact.phone}`}
                  className="flex items-center justify-center gap-2 w-full py-3 rounded-xl bg-gradient-to-l from-green-600 to-emerald-600 text-white font-bold hover:shadow-lg hover:shadow-green-500/20 transition-all">
                  <Phone className="w-4 h-4" />
                  התקשר - {selectedContact.phone}
                </a>
                <a href={formatWhatsApp(selectedContact.phone)} target="_blank" rel="noopener noreferrer"
                  className="flex items-center justify-center gap-2 w-full py-3 rounded-xl bg-gradient-to-l from-green-700 to-green-800 text-white font-bold hover:shadow-lg transition-all">
                  <MessageCircle className="w-4 h-4" />
                  שלח הודעת WhatsApp
                </a>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
