'use client';

import { useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useAppData } from '@/contexts/AppDataContext';
import { motion, AnimatePresence } from 'framer-motion';
import { CheckCircle, X, Search, Link2, UserCheck } from 'lucide-react';

const departmentOptions = ['צילום', 'טכני', 'הפקה', 'סאונד', 'תאורה'];

export function ProfileLinker({ onComplete }: { onComplete?: () => void }) {
  const { profile, updateUserProfile } = useAuth();
  const [open, setOpen] = useState(true);

  if (!profile || !open) return null;

  const handleComplete = async (data: {
    displayName: string;
    department: string;
    role: string;
    phone: string;
    linkedContactId?: number;
  }) => {
    await updateUserProfile({
      ...data,
      onboardingComplete: true,
    });
    setOpen(false);
    onComplete?.();
  };

  return (
    <AnimatePresence>
      <OnboardingModal
        profile={{
          displayName: profile.displayName,
          email: profile.email,
          phone: profile.phone,
          department: profile.department,
          role: profile.role,
        }}
        onComplete={handleComplete}
        onDismiss={() => setOpen(false)}
      />
    </AnimatePresence>
  );
}

// Onboarding Modal - Link to contacts
function OnboardingModal({
  profile,
  onComplete,
  onDismiss,
}: {
  profile: { displayName: string; email: string; phone: string; department: string; role: string };
  onComplete: (data: { displayName: string; department: string; role: string; phone: string; linkedContactId?: number }) => void;
  onDismiss: () => void;
}) {
  const [step, setStep] = useState(1);
  const { contacts: contactsList } = useAppData();
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedContact, setSelectedContact] = useState<any | null>(null);
  const [form, setForm] = useState({
    displayName: profile.displayName,
    department: profile.department || '',
    role: profile.role || '',
    phone: profile.phone || '',
  });

  const matchedContacts = searchQuery.length >= 2
    ? contactsList.filter(c => {
        const fullName = `${c.firstName} ${c.lastName}`;
        return fullName.includes(searchQuery) || (c.phone && c.phone.includes(searchQuery));
      })
    : [];

  const handleLinkContact = (contact: any) => {
    setSelectedContact(contact);
    setForm({
      displayName: `${contact.firstName} ${contact.lastName}`,
      department: contact.department,
      role: contact.role,
      phone: contact.phone || form.phone,
    });
    setStep(2);
  };

  const handleFinish = () => {
    onComplete({
      ...form,
      linkedContactId: selectedContact?.id,
    });
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[300] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
      onClick={onDismiss}
    >
      <motion.div
        initial={{ scale: 0.95, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.95, opacity: 0 }}
        className="rounded-2xl border max-w-md w-full overflow-hidden"
        style={{ background: 'var(--theme-bg)', borderColor: 'var(--theme-border)' }}
        onClick={e => e.stopPropagation()}
        dir="rtl"
      >
        <div className="px-6 py-4 border-b flex items-center justify-between" style={{ borderColor: 'var(--theme-border)' }}>
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-purple-500 to-blue-500 flex items-center justify-center">
              <UserCheck className="w-4 h-4 text-white" />
            </div>
            <h2 className="font-bold" style={{ color: 'var(--theme-text)' }}>
              {step === 1 ? 'קשר לאלפון' : 'השלם פרטים'}
            </h2>
          </div>
          <button onClick={onDismiss} className="p-1 rounded-lg hover:bg-[var(--theme-accent-glow)]">
            <X className="w-4 h-4 text-[var(--theme-text-secondary)]" />
          </button>
        </div>

        <div className="p-6">
          {step === 1 ? (
            <>
              <p className="text-sm mb-4" style={{ color: 'var(--theme-text-secondary)' }}>
                חפש את עצמך באלפון כדי לקשר את הפרופיל שלך. כך ניתן יהיה לזהות אותך אוטומטית בלוח ההפקות.
              </p>

              <div className="relative mb-4">
                <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: 'var(--theme-text-secondary)' }} />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  placeholder="חפש לפי שם או טלפון..."
                  className="w-full pl-4 pr-10 py-2.5 rounded-xl border text-sm outline-none focus:border-[var(--theme-accent)]"
                  style={{ background: 'var(--theme-bg-secondary)', borderColor: 'var(--theme-border)', color: 'var(--theme-text)' }}
                  dir="rtl"
                  autoFocus
                />
              </div>

              {matchedContacts.length > 0 && (
                <div className="space-y-2 max-h-60 overflow-y-auto mb-4">
                  {matchedContacts.map(c => (
                    <button
                      key={c.id}
                      onClick={() => handleLinkContact(c)}
                      className="w-full flex items-center gap-3 p-3 rounded-xl text-right hover:bg-[var(--theme-accent-glow)] transition-all"
                      style={{ background: 'var(--theme-bg-secondary)' }}
                    >
                      <div className="w-9 h-9 rounded-full bg-gradient-to-br from-purple-500 to-blue-500 flex items-center justify-center text-white text-xs font-bold shrink-0">
                        {c.firstName[0]}{c.lastName[0]}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-bold" style={{ color: 'var(--theme-text)' }}>{c.firstName} {c.lastName}</p>
                        <p className="text-xs" style={{ color: 'var(--theme-text-secondary)' }}>
                          {c.role} - {c.department}
                          {c.phone && ` | ${c.phone}`}
                        </p>
                      </div>
                      <Link2 className="w-4 h-4 text-[var(--theme-accent)]" />
                    </button>
                  ))}
                </div>
              )}

              {searchQuery.length >= 2 && matchedContacts.length === 0 && (
                <p className="text-sm text-center py-4" style={{ color: 'var(--theme-text-secondary)' }}>
                  לא נמצאו תוצאות
                </p>
              )}

              <button
                onClick={() => setStep(2)}
                className="w-full py-2.5 rounded-xl text-sm font-medium transition-colors"
                style={{ background: 'var(--theme-bg-secondary)', color: 'var(--theme-text-secondary)' }}
              >
                דלג - אמלא ידנית
              </button>
            </>
          ) : (
            <>
              {selectedContact && (
                <div className="flex items-center gap-3 p-3 rounded-xl mb-4 bg-green-500/10 border border-green-500/20">
                  <CheckCircle className="w-4 h-4 text-green-400" />
                  <span className="text-sm text-green-400 font-medium">
                    מקושר ל: {selectedContact.firstName} {selectedContact.lastName}
                  </span>
                </div>
              )}

              <div className="space-y-4">
                <div>
                  <label className="text-xs mb-1 block" style={{ color: 'var(--theme-text-secondary)' }}>שם מלא</label>
                  <input
                    value={form.displayName}
                    onChange={e => setForm({ ...form, displayName: e.target.value })}
                    className="w-full px-4 py-2.5 rounded-lg text-sm outline-none border focus:border-[var(--theme-accent)]"
                    style={{ background: 'var(--theme-bg-secondary)', borderColor: 'var(--theme-border)', color: 'var(--theme-text)' }}
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs mb-1 block" style={{ color: 'var(--theme-text-secondary)' }}>מחלקה</label>
                    <select
                      value={form.department}
                      onChange={e => setForm({ ...form, department: e.target.value })}
                      className="w-full px-4 py-2.5 rounded-lg text-sm outline-none border focus:border-[var(--theme-accent)]"
                      style={{ background: 'var(--theme-bg-secondary)', borderColor: 'var(--theme-border)', color: 'var(--theme-text)' }}
                    >
                      <option value="">בחר</option>
                      {departmentOptions.map(d => <option key={d} value={d}>{d}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="text-xs mb-1 block" style={{ color: 'var(--theme-text-secondary)' }}>תפקיד</label>
                    <input
                      value={form.role}
                      onChange={e => setForm({ ...form, role: e.target.value })}
                      className="w-full px-4 py-2.5 rounded-lg text-sm outline-none border focus:border-[var(--theme-accent)]"
                      style={{ background: 'var(--theme-bg-secondary)', borderColor: 'var(--theme-border)', color: 'var(--theme-text)' }}
                    />
                  </div>
                </div>
                <div>
                  <label className="text-xs mb-1 block" style={{ color: 'var(--theme-text-secondary)' }}>טלפון</label>
                  <input
                    value={form.phone}
                    onChange={e => setForm({ ...form, phone: e.target.value })}
                    className="w-full px-4 py-2.5 rounded-lg text-sm outline-none border focus:border-[var(--theme-accent)]"
                    style={{ background: 'var(--theme-bg-secondary)', borderColor: 'var(--theme-border)', color: 'var(--theme-text)' }}
                    dir="ltr"
                  />
                </div>

                <button
                  onClick={handleFinish}
                  disabled={!form.displayName || !form.department}
                  className="w-full py-3 rounded-xl bg-gradient-to-l from-purple-500 to-blue-600 text-white font-bold flex items-center justify-center gap-2 hover:shadow-lg hover:shadow-purple-500/20 transition-all disabled:opacity-50"
                >
                  <CheckCircle className="w-4 h-4" />
                  סיום
                </button>
              </div>
            </>
          )}
        </div>
      </motion.div>
    </motion.div>
  );
}
