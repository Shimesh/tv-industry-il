'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useAuth } from '@/contexts/AuthContext';
import { useAppData } from '@/contexts/AppDataContext';
import type { Contact } from '@/data/contacts';
import { motion, AnimatePresence } from 'framer-motion';
import { CheckCircle, ChevronRight, Loader2, Phone, Search, ShieldCheck, UserCheck, X } from 'lucide-react';
import { registerFcmToken } from '@/components/FCMTokenRegistration';
import { normalizePhone, normalizeName } from '@/lib/crewNormalization';

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
    linkedContactId?: number | string;
    is_consented?: boolean;
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
          uid: profile.uid,
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

function OnboardingModal({
  profile,
  onComplete,
  onDismiss,
}: {
  profile: { uid: string; displayName: string; email: string; phone: string; department: string; role: string };
  onComplete: (data: { displayName: string; department: string; role: string; phone: string; linkedContactId?: number | string; is_consented?: boolean }) => void;
  onDismiss: () => void;
}) {
  const { updateUserProfile } = useAuth();
  const [step, setStep] = useState(1);
  const { contacts: contactsList } = useAppData();

  // Step 1 state
  const [termsChecked, setTermsChecked] = useState(false);
  const [termsSaving, setTermsSaving] = useState(false);

  // Step 2 state
  const [phoneInput, setPhoneInput] = useState(profile.phone || '');
  const [phoneError, setPhoneError] = useState('');

  // Step 3 state
  const [phoneMatchFound, setPhoneMatchFound] = useState(false);
  const [selectedContact, setSelectedContact] = useState<Contact | null>(null);
  const [manualName, setManualName] = useState('');

  // Step 4 (confirm) form state
  const [form, setForm] = useState({
    displayName: profile.displayName || '',
    department: profile.department || '',
    role: profile.role || '',
    phone: profile.phone || '',
  });

  // ── Step 1: accept terms + trigger FCM ──────────────────────────────────
  const handleTermsAccept = async () => {
    if (!termsChecked || termsSaving) return;
    setTermsSaving(true);
    try {
      // Fire-and-forget FCM — user gesture required for permission prompt
      registerFcmToken(profile.uid).catch(() => undefined);
      // Write terms acceptance; termsAcceptedAt is generated server-side
      await updateUserProfile({ is_consented: true, termsAccepted: true });
      setStep(2);
    } finally {
      setTermsSaving(false);
    }
  };

  // ── Step 2: phone lookup ─────────────────────────────────────────────────
  const handlePhoneLookup = () => {
    const normalized = normalizePhone(phoneInput);
    if (!normalized || normalized.length < 9) {
      setPhoneError('יש להזין מספר טלפון תקין (לפחות 9 ספרות)');
      return;
    }
    setPhoneError('');

    const match = contactsList.find(
      (c) => normalizePhone(c.phone ?? '') === normalized,
    );

    const updatedPhone = normalized;

    if (match) {
      setSelectedContact(match);
      setForm({
        displayName: `${match.firstName || ''} ${match.lastName || ''}`.trim(),
        department: String(match.department || ''),
        role: match.role || '',
        phone: match.phone || updatedPhone,
      });
      setPhoneMatchFound(true);
    } else {
      setSelectedContact(null);
      setForm((prev) => ({ ...prev, phone: updatedPhone }));
      setPhoneMatchFound(false);
      // Pre-filter contacts dropdown using normalized Google name tokens
      // (filtering happens inline in the render)
    }
    setStep(3);
  };

  // ── Step 3: contact selected from dropdown ───────────────────────────────
  const handleContactSelect = (contact: Contact | null) => {
    setSelectedContact(contact);
    if (contact) {
      setForm({
        displayName: `${contact.firstName || ''} ${contact.lastName || ''}`.trim(),
        department: String(contact.department || ''),
        role: contact.role || '',
        phone: contact.phone || form.phone,
      });
      setManualName('');
    } else {
      // "אחר" — manual entry
      setForm((prev) => ({ ...prev, displayName: manualName }));
    }
  };

  // ── Step 4: final submit ─────────────────────────────────────────────────
  const handleSubmit = () => {
    const finalName = selectedContact === null && !phoneMatchFound
      ? manualName || form.displayName
      : form.displayName;

    onComplete({
      displayName: finalName,
      department: form.department,
      role: form.role,
      phone: form.phone,
      linkedContactId: selectedContact?.id,
      is_consented: true,
    });
  };

  // ── Pre-filtered contacts for Step 3B dropdown ───────────────────────────
  const filteredContacts = (() => {
    const googleName = normalizeName(profile.displayName || '');
    const tokens = googleName.split(/\s+/).filter((t) => t.length >= 2);
    if (!tokens.length) return contactsList.slice(0, 50);
    return contactsList.filter((c) => {
      const fullName = normalizeName(`${c.firstName || ''} ${c.lastName || ''}`);
      return tokens.some((token) => fullName.includes(token));
    });
  })();

  const stepTitles: Record<number, string> = {
    1: 'ברוך הבא',
    2: 'מה מספר הטלפון שלך?',
    3: phoneMatchFound ? 'נמצאת בצוות!' : 'בחר את שמך',
    4: 'אשר פרטים',
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[400] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
      style={{ pointerEvents: 'auto' }}
      onClick={onDismiss}
    >
      <motion.div
        initial={{ scale: 0.95, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.95, opacity: 0 }}
        className="rounded-2xl border max-w-md w-full overflow-hidden"
        style={{ background: 'var(--theme-bg)', borderColor: 'var(--theme-border)' }}
        onClick={(e) => e.stopPropagation()}
        dir="rtl"
      >
        {/* Header */}
        <div className="px-6 py-4 border-b flex items-center justify-between" style={{ borderColor: 'var(--theme-border)' }}>
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-purple-500 to-blue-500 flex items-center justify-center">
              {step === 1 ? <ShieldCheck className="w-4 h-4 text-white" /> : <UserCheck className="w-4 h-4 text-white" />}
            </div>
            <h2 className="font-bold" style={{ color: 'var(--theme-text)' }}>
              {stepTitles[step]}
            </h2>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-xs" style={{ color: 'var(--theme-text-secondary)' }}>
              שלב {step} מתוך 4
            </span>
            <button onClick={onDismiss} className="p-1 rounded-lg hover:bg-[var(--theme-accent-glow)]">
              <X className="w-4 h-4 text-[var(--theme-text-secondary)]" />
            </button>
          </div>
        </div>

        <div className="p-6">
          {/* ── Step 1: Terms + FCM ── */}
          {step === 1 && (
            <div className="space-y-4">
              <p className="text-sm leading-relaxed" style={{ color: 'var(--theme-text-secondary)' }}>
                כדי להשתמש באפליקציה, עליך לאשר את{' '}
                <Link href="/terms" target="_blank" className="underline underline-offset-4 hover:text-[var(--theme-accent)]">
                  תנאי השימוש
                </Link>{' '}
                ו
                <Link href="/privacy" target="_blank" className="underline underline-offset-4 hover:text-[var(--theme-accent)]">
                  מדיניות הפרטיות
                </Link>.
              </p>

              <label
                className="flex cursor-pointer items-start gap-3 rounded-xl border p-3 text-sm leading-6"
                style={{ borderColor: 'var(--theme-border)', background: 'var(--theme-bg-secondary)' }}
              >
                <input
                  type="checkbox"
                  checked={termsChecked}
                  onChange={(e) => setTermsChecked(e.target.checked)}
                  className="mt-1 h-4 w-4 shrink-0 accent-purple-500"
                />
                <span style={{ color: 'var(--theme-text)' }}>קראתי והסכמתי לתנאי השימוש ומדיניות הפרטיות</span>
              </label>

              <button
                onClick={handleTermsAccept}
                disabled={!termsChecked || termsSaving}
                className="w-full py-3 rounded-xl bg-gradient-to-l from-purple-500 to-blue-600 text-white font-bold flex items-center justify-center gap-2 hover:shadow-lg hover:shadow-purple-500/20 transition-all disabled:opacity-50"
              >
                {termsSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <ChevronRight className="w-4 h-4" />}
                המשך
              </button>
            </div>
          )}

          {/* ── Step 2: Phone input ── */}
          {step === 2 && (
            <div className="space-y-4">
              <p className="text-sm" style={{ color: 'var(--theme-text-secondary)' }}>
                הכנס את מספר הטלפון שלך כדי שנוכל לזהות אותך בצוות אוטומטית.
              </p>

              <div>
                <div className="relative">
                  <Phone className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: 'var(--theme-text-secondary)' }} />
                  <input
                    type="tel"
                    value={phoneInput}
                    onChange={(e) => { setPhoneInput(e.target.value); setPhoneError(''); }}
                    onKeyDown={(e) => { if (e.key === 'Enter') handlePhoneLookup(); }}
                    placeholder="050-0000000"
                    className="w-full pl-4 pr-10 py-2.5 rounded-xl border text-sm outline-none focus:border-[var(--theme-accent)]"
                    style={{ background: 'var(--theme-bg-secondary)', borderColor: phoneError ? 'rgb(248 113 113)' : 'var(--theme-border)', color: 'var(--theme-text)' }}
                    dir="ltr"
                    autoFocus
                  />
                </div>
                {phoneError && (
                  <p className="mt-1 text-xs text-red-400">{phoneError}</p>
                )}
              </div>

              <button
                onClick={handlePhoneLookup}
                className="w-full py-3 rounded-xl bg-gradient-to-l from-purple-500 to-blue-600 text-white font-bold flex items-center justify-center gap-2 hover:shadow-lg hover:shadow-purple-500/20 transition-all"
              >
                <Search className="w-4 h-4" />
                חפש בצוות
              </button>

              <button
                onClick={() => { setPhoneMatchFound(false); setStep(3); }}
                className="w-full py-2.5 rounded-xl text-sm font-medium transition-colors"
                style={{ background: 'var(--theme-bg-secondary)', color: 'var(--theme-text-secondary)' }}
              >
                דלג — אמלא ידנית
              </button>
            </div>
          )}

          {/* ── Step 3A: Phone match found — confirm auto-populated fields ── */}
          {step === 3 && phoneMatchFound && (
            <div className="space-y-4">
              <div className="flex items-center gap-3 p-3 rounded-xl bg-green-500/10 border border-green-500/20">
                <CheckCircle className="w-4 h-4 text-green-400 shrink-0" />
                <span className="text-sm text-green-400 font-medium">
                  נמצאת בצוות! הפרטים מולאו אוטומטית.
                </span>
              </div>

              <div className="space-y-3">
                <div>
                  <label className="text-xs mb-1 block" style={{ color: 'var(--theme-text-secondary)' }}>שם מלא</label>
                  <input
                    value={form.displayName}
                    onChange={(e) => setForm({ ...form, displayName: e.target.value })}
                    className="w-full px-4 py-2.5 rounded-lg text-sm outline-none border focus:border-[var(--theme-accent)]"
                    style={{ background: 'var(--theme-bg-secondary)', borderColor: 'var(--theme-border)', color: 'var(--theme-text)' }}
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs mb-1 block" style={{ color: 'var(--theme-text-secondary)' }}>מחלקה</label>
                    <select
                      value={form.department}
                      onChange={(e) => setForm({ ...form, department: e.target.value })}
                      className="w-full px-4 py-2.5 rounded-lg text-sm outline-none border focus:border-[var(--theme-accent)]"
                      style={{ background: 'var(--theme-bg-secondary)', borderColor: 'var(--theme-border)', color: 'var(--theme-text)' }}
                    >
                      <option value="">בחר</option>
                      {departmentOptions.map((d) => <option key={d} value={d}>{d}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="text-xs mb-1 block" style={{ color: 'var(--theme-text-secondary)' }}>תפקיד</label>
                    <input
                      value={form.role}
                      onChange={(e) => setForm({ ...form, role: e.target.value })}
                      className="w-full px-4 py-2.5 rounded-lg text-sm outline-none border focus:border-[var(--theme-accent)]"
                      style={{ background: 'var(--theme-bg-secondary)', borderColor: 'var(--theme-border)', color: 'var(--theme-text)' }}
                    />
                  </div>
                </div>
              </div>

              <button
                onClick={() => setStep(4)}
                disabled={!form.displayName || !form.department}
                className="w-full py-3 rounded-xl bg-gradient-to-l from-purple-500 to-blue-600 text-white font-bold flex items-center justify-center gap-2 hover:shadow-lg hover:shadow-purple-500/20 transition-all disabled:opacity-50"
              >
                <CheckCircle className="w-4 h-4" />
                אשר ✓
              </button>
            </div>
          )}

          {/* ── Step 3B: No phone match — name dropdown ── */}
          {step === 3 && !phoneMatchFound && (
            <div className="space-y-4">
              <p className="text-sm" style={{ color: 'var(--theme-text-secondary)' }}>
                לא נמצאה התאמה לפי טלפון. בחר את שמך מהרשימה או הכנס ידנית.
              </p>

              <div className="max-h-52 overflow-y-auto rounded-xl border divide-y" style={{ borderColor: 'var(--theme-border)' }}>
                {filteredContacts.map((c) => (
                  <button
                    key={c.id}
                    onClick={() => handleContactSelect(c)}
                    className="w-full flex items-center gap-3 p-3 text-right hover:bg-[var(--theme-accent-glow)] transition-all"
                    style={{
                      background: selectedContact?.id === c.id ? 'var(--theme-accent-glow)' : 'var(--theme-bg-secondary)',
                    }}
                  >
                    <div className="w-8 h-8 rounded-full bg-gradient-to-br from-purple-500 to-blue-500 flex items-center justify-center text-white text-xs font-bold shrink-0">
                      {(c.firstName?.[0] || '') + (c.lastName?.[0] || '')}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate" style={{ color: 'var(--theme-text)' }}>{c.firstName} {c.lastName}</p>
                      {(c.role || c.department) && (
                        <p className="text-xs truncate" style={{ color: 'var(--theme-text-secondary)' }}>{c.role}{c.role && c.department ? ' · ' : ''}{c.department}</p>
                      )}
                    </div>
                    {selectedContact?.id === c.id && <CheckCircle className="w-4 h-4 text-green-400 shrink-0" />}
                  </button>
                ))}

                {/* "אחר" option */}
                <button
                  onClick={() => handleContactSelect(null)}
                  className="w-full flex items-center gap-3 p-3 text-right hover:bg-[var(--theme-accent-glow)] transition-all"
                  style={{
                    background: selectedContact === null ? 'var(--theme-accent-glow)' : 'var(--theme-bg-secondary)',
                  }}
                >
                  <div className="w-8 h-8 rounded-full bg-gray-600 flex items-center justify-center text-white text-xs font-bold shrink-0">
                    ?
                  </div>
                  <span className="text-sm font-medium" style={{ color: 'var(--theme-text)' }}>אחר</span>
                </button>
              </div>

              {selectedContact === null && (
                <input
                  value={manualName}
                  onChange={(e) => setManualName(e.target.value)}
                  placeholder="כתוב את שמך בעברית"
                  className="w-full px-4 py-2.5 rounded-xl border text-sm outline-none focus:border-[var(--theme-accent)]"
                  style={{ background: 'var(--theme-bg-secondary)', borderColor: 'var(--theme-border)', color: 'var(--theme-text)' }}
                  autoFocus
                />
              )}

              <button
                onClick={() => {
                  if (selectedContact) {
                    setStep(4);
                  } else if (manualName.trim()) {
                    setForm((prev) => ({ ...prev, displayName: manualName.trim() }));
                    setStep(4);
                  }
                }}
                disabled={!selectedContact && !manualName.trim()}
                className="w-full py-3 rounded-xl bg-gradient-to-l from-purple-500 to-blue-600 text-white font-bold flex items-center justify-center gap-2 hover:shadow-lg hover:shadow-purple-500/20 transition-all disabled:opacity-50"
              >
                <ChevronRight className="w-4 h-4" />
                המשך
              </button>
            </div>
          )}

          {/* ── Step 4: Final confirm & submit ── */}
          {step === 4 && (
            <div className="space-y-4">
              <p className="text-sm" style={{ color: 'var(--theme-text-secondary)' }}>
                בדוק שהפרטים נכונים ולחץ על ״סיום״.
              </p>

              <div className="space-y-3">
                <div>
                  <label className="text-xs mb-1 block" style={{ color: 'var(--theme-text-secondary)' }}>שם מלא</label>
                  <input
                    value={form.displayName}
                    onChange={(e) => setForm({ ...form, displayName: e.target.value })}
                    className="w-full px-4 py-2.5 rounded-lg text-sm outline-none border focus:border-[var(--theme-accent)]"
                    style={{ background: 'var(--theme-bg-secondary)', borderColor: 'var(--theme-border)', color: 'var(--theme-text)' }}
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs mb-1 block" style={{ color: 'var(--theme-text-secondary)' }}>מחלקה</label>
                    <select
                      value={form.department}
                      onChange={(e) => setForm({ ...form, department: e.target.value })}
                      className="w-full px-4 py-2.5 rounded-lg text-sm outline-none border focus:border-[var(--theme-accent)]"
                      style={{ background: 'var(--theme-bg-secondary)', borderColor: 'var(--theme-border)', color: 'var(--theme-text)' }}
                    >
                      <option value="">בחר</option>
                      {departmentOptions.map((d) => <option key={d} value={d}>{d}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="text-xs mb-1 block" style={{ color: 'var(--theme-text-secondary)' }}>תפקיד</label>
                    <input
                      value={form.role}
                      onChange={(e) => setForm({ ...form, role: e.target.value })}
                      className="w-full px-4 py-2.5 rounded-lg text-sm outline-none border focus:border-[var(--theme-accent)]"
                      style={{ background: 'var(--theme-bg-secondary)', borderColor: 'var(--theme-border)', color: 'var(--theme-text)' }}
                    />
                  </div>
                </div>
                <div>
                  <label className="text-xs mb-1 block" style={{ color: 'var(--theme-text-secondary)' }}>טלפון</label>
                  <input
                    value={form.phone}
                    onChange={(e) => setForm({ ...form, phone: e.target.value })}
                    className="w-full px-4 py-2.5 rounded-lg text-sm outline-none border focus:border-[var(--theme-accent)]"
                    style={{ background: 'var(--theme-bg-secondary)', borderColor: 'var(--theme-border)', color: 'var(--theme-text)' }}
                    dir="ltr"
                  />
                </div>
              </div>

              <button
                onClick={handleSubmit}
                disabled={!form.displayName || !form.department}
                className="w-full py-3 rounded-xl bg-gradient-to-l from-purple-500 to-blue-600 text-white font-bold flex items-center justify-center gap-2 hover:shadow-lg hover:shadow-purple-500/20 transition-all disabled:opacity-50"
              >
                <CheckCircle className="w-4 h-4" />
                סיום
              </button>
            </div>
          )}
        </div>
      </motion.div>
    </motion.div>
  );
}
