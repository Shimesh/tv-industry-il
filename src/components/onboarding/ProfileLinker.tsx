'use client';

import { useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { CheckCircle, Loader2, Phone, Search, ShieldCheck, UserCheck, X } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useAppData } from '@/contexts/AppDataContext';
import type { Contact } from '@/data/contacts';
import { normalizeName, normalizePhone } from '@/lib/crewNormalization';
import { registerFcmToken } from '@/components/FCMTokenRegistration';
import { INDUSTRY_ROLE_OPTIONS, PROFILE_DEPARTMENT_OPTIONS, getRolesForDepartment } from '@/constants/departments';

type IdentityCandidate = {
  id: string;
  source: 'profiles' | 'industry_people' | 'contacts';
  displayName: string;
  phone: string;
  department: string;
  role: string;
  profileId: string;
  isAdmin: boolean;
  siteRole?: string;
};

type CandidateResponse = {
  verifiedPhone?: string;
  verifiedPhoneDisplay?: string;
  candidates?: IdentityCandidate[];
  primaryCandidate?: IdentityCandidate | null;
};

const sourceLabels: Record<IdentityCandidate['source'], string> = {
  profiles: 'פרופיל מקצועי',
  industry_people: 'מאגר אנשי התעשייה',
  contacts: 'אלפון',
};

function fullContactName(contact: Contact): string {
  return `${contact.firstName || ''} ${contact.lastName || ''}`.trim();
}

export function ProfileLinker({ onComplete }: { onComplete?: () => void }) {
  const { user, profile, updateUserProfile, refreshUserProfile } = useAuth();
  const { contacts } = useAppData();
  const [open, setOpen] = useState(true);
  const [loadingCandidates, setLoadingCandidates] = useState(true);
  const [candidate, setCandidate] = useState<IdentityCandidate | null>(null);
  const [manualMode, setManualMode] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [selectedContact, setSelectedContact] = useState<Contact | null>(null);
  const [manualName, setManualName] = useState(profile?.displayName || '');
  const [manualRole, setManualRole] = useState(profile?.role || '');
  const [manualDepartment, setManualDepartment] = useState(profile?.department || '');

  useEffect(() => {
    if (!user || !open) return;
    let cancelled = false;

    const loadCandidates = async () => {
      setLoadingCandidates(true);
      setError('');
      try {
        const token = await user.getIdToken();
        const response = await fetch('/api/me/identity-link/candidates', {
          headers: { Authorization: `Bearer ${token}` },
          cache: 'no-store',
        });
        if (!response.ok) throw new Error('candidate lookup failed');
        const payload = (await response.json()) as CandidateResponse;
        console.debug('[ProfileLinker] identity candidates response', payload);
        if (cancelled) return;
        const nextCandidate = payload.primaryCandidate || payload.candidates?.[0] || null;
        setCandidate(nextCandidate);
        setManualMode(!nextCandidate);
      } catch {
        if (!cancelled) {
          setCandidate(null);
          setManualMode(true);
        }
      } finally {
        if (!cancelled) setLoadingCandidates(false);
      }
    };

    void loadCandidates();
    return () => {
      cancelled = true;
    };
  }, [user, open]);

  const filteredContacts = useMemo(() => {
    const needle = normalizeName(query || manualName || profile?.displayName || '');
    if (!needle) return contacts.slice(0, 50);

    return contacts
      .filter((contact) => {
        const name = normalizeName(fullContactName(contact));
        const role = normalizeName(String(contact.role || ''));
        const department = normalizeName(String(contact.department || ''));
        return name.includes(needle) || role.includes(needle) || department.includes(needle);
      })
      .slice(0, 50);
  }, [contacts, manualName, profile?.displayName, query]);
  const manualDepartmentOptions = Array.from(new Set([...PROFILE_DEPARTMENT_OPTIONS, manualDepartment].filter(Boolean)));
  const manualRoleOptions = Array.from(new Set([
    ...getRolesForDepartment(manualDepartment),
    ...INDUSTRY_ROLE_OPTIONS,
    manualRole,
  ].filter(Boolean)));

  if (!profile || !user || !open) return null;

  const candidateLookupLocked = loadingCandidates || Boolean(candidate && !manualMode);

  const complete = () => {
    setOpen(false);
    onComplete?.();
  };

  const confirmCandidate = async () => {
    if (!candidate || saving) return;
    setSaving(true);
    setError('');
    try {
      const token = await user.getIdToken();
      const response = await fetch('/api/me/identity-link/confirm', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ source: candidate.source, candidateId: candidate.id }),
      });
      if (!response.ok) {
        const payload = (await response.json().catch(() => ({}))) as { error?: string };
        throw new Error(payload.error || 'identity link failed');
      }
      await refreshUserProfile();
      void registerFcmToken(profile.uid).catch(() => undefined);
      complete();
    } catch {
      setError('לא הצלחנו לקשר את הפרופיל. נסה שוב או עבור לחיפוש ידני.');
    } finally {
      setSaving(false);
    }
  };

  const completeManual = async () => {
    if (saving) return;
    const selectedName = selectedContact ? fullContactName(selectedContact) : manualName.trim();
    if (!selectedName) {
      setError('יש לבחור פרופיל או להזין שם מלא.');
      return;
    }

    setSaving(true);
    setError('');
    try {
      await updateUserProfile({
        displayName: selectedName,
        department: selectedContact ? String(selectedContact.department || '') : manualDepartment,
        role: selectedContact ? String(selectedContact.role || '') : manualRole,
        phone: selectedContact ? String(selectedContact.phone || profile.phone || '') : profile.phone,
        linkedContactId: selectedContact?.id,
        profileId: selectedContact ? String(selectedContact.id) : profile.profileId,
        profileSource: selectedContact ? 'contacts' : profile.profileSource,
        crewName: selectedName,
        onboardingComplete: true,
        is_consented: true,
      });
      await refreshUserProfile();
      void registerFcmToken(profile.uid).catch(() => undefined);
      complete();
    } catch {
      setError('לא הצלחנו לשמור את הפרטים. נסה שוב.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[1001] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
        dir="rtl"
        role="dialog"
        aria-modal="true"
      >
        <motion.div
          initial={{ scale: 0.96, opacity: 0, y: 10 }}
          animate={{ scale: 1, opacity: 1, y: 0 }}
          exit={{ scale: 0.96, opacity: 0, y: 10 }}
          className="w-full max-w-lg overflow-hidden rounded-2xl border shadow-2xl"
          style={{ background: 'var(--theme-bg)', borderColor: 'var(--theme-border)' }}
        >
          <div className="flex items-center justify-between border-b px-5 py-4" style={{ borderColor: 'var(--theme-border)' }}>
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-purple-500 to-blue-600">
                {manualMode ? <Search className="h-5 w-5 text-white" /> : <ShieldCheck className="h-5 w-5 text-white" />}
              </div>
              <div>
                <h2 className="text-lg font-black text-[var(--theme-text)]">קישור זהות מקצועית</h2>
                <p className="text-xs text-[var(--theme-text-secondary)]">כדי להציג הרשאות ומשמרות קיימות</p>
              </div>
            </div>
            {!candidateLookupLocked && (
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded-lg p-2 text-[var(--theme-text-secondary)] transition hover:bg-[var(--theme-accent-glow)] hover:text-[var(--theme-text)]"
                aria-label="סגור"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>

          <div className="p-5">
            {loadingCandidates ? (
              <div className="flex items-center justify-center gap-3 py-12 text-sm text-[var(--theme-text-secondary)]">
                <Loader2 className="h-5 w-5 animate-spin" />
                מחפש התאמה לפי מספר הטלפון המאומת...
              </div>
            ) : candidate && !manualMode ? (
              <div className="space-y-5">
                <div className="rounded-2xl border border-emerald-400/30 bg-emerald-500/10 p-4">
                  <div className="mb-3 flex items-center gap-3">
                    <div className="flex h-12 w-12 items-center justify-center rounded-full bg-emerald-500/20 text-lg font-black text-emerald-300" suppressHydrationWarning>
                      {candidate.displayName.charAt(0)}
                    </div>
                    <div>
                      <p className="text-xl font-black text-[var(--theme-text)]" suppressHydrationWarning>
                        היי, זיהינו אותך כ-{candidate.displayName}. האם זה אתה?
                      </p>
                      <p className="mt-1 text-xs text-[var(--theme-text-secondary)]" suppressHydrationWarning>
                        נמצא ב{sourceLabels[candidate.source]}
                        {candidate.role ? ` · ${candidate.role}` : ''}
                        {candidate.department ? ` · ${candidate.department}` : ''}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 text-xs text-[var(--theme-text-secondary)]">
                    <Phone className="h-3.5 w-3.5" />
                    <span dir="ltr" {...{ 'x-apple-data-detectors': 'false' }} suppressHydrationWarning>
                      {normalizePhone(candidate.phone) || candidate.phone}
                    </span>
                    {candidate.isAdmin && (
                      <span className="rounded-full bg-yellow-500/15 px-2 py-0.5 font-bold text-yellow-300">Admin</span>
                    )}
                  </div>
                </div>

                {error && <p className="rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-300">{error}</p>}

                <div className="grid gap-3 sm:grid-cols-2">
                  <button
                    type="button"
                    onClick={confirmCandidate}
                    disabled={saving}
                    className="inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-l from-emerald-500 to-teal-600 px-4 py-3 text-sm font-black text-white transition hover:shadow-lg disabled:opacity-50"
                  >
                    {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle className="h-4 w-4" />}
                    כן, זה אני
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setManualMode(true);
                      setError('');
                    }}
                    disabled={saving}
                    className="rounded-xl border px-4 py-3 text-sm font-bold text-[var(--theme-text)] transition hover:bg-[var(--theme-accent-glow)] disabled:opacity-50"
                    style={{ borderColor: 'var(--theme-border)' }}
                  >
                    לא, חפש ידנית
                  </button>
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="rounded-xl border p-3 text-sm text-[var(--theme-text-secondary)]" style={{ borderColor: 'var(--theme-border)', background: 'var(--theme-bg-secondary)' }}>
                  לא נמצאה התאמה ודאית לפי הטלפון. בחר את עצמך מהרשימה או מלא ידנית.
                </div>

                <div className="relative">
                  <Search className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--theme-text-secondary)]" />
                  <input
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    placeholder="חיפוש לפי שם, תפקיד או מחלקה"
                    className="w-full rounded-xl border bg-[var(--theme-bg-secondary)] py-3 pl-4 pr-10 text-sm text-[var(--theme-text)] outline-none transition focus:border-[var(--theme-accent)]"
                    style={{ borderColor: 'var(--theme-border)' }}
                    dir="rtl"
                  />
                </div>

                <div className="max-h-56 overflow-y-auto rounded-xl border" style={{ borderColor: 'var(--theme-border)' }}>
                  {filteredContacts.map((contact) => {
                    const name = fullContactName(contact);
                    const selected = String(selectedContact?.id) === String(contact.id);
                    return (
                      <button
                        key={String(contact.id)}
                        type="button"
                        onClick={() => {
                          setSelectedContact(contact);
                          setManualName(name);
                          setManualRole(String(contact.role || ''));
                          setManualDepartment(String(contact.department || ''));
                          setError('');
                        }}
                        className="flex w-full items-center gap-3 border-b p-3 text-right transition last:border-b-0 hover:bg-[var(--theme-accent-glow)]"
                        style={{ borderColor: 'var(--theme-border)', background: selected ? 'var(--theme-accent-glow)' : undefined }}
                      >
                        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-purple-500/20 text-sm font-black text-purple-200">
                          {name.charAt(0) || '?'}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-bold text-[var(--theme-text)]" suppressHydrationWarning>{name || 'ללא שם'}</p>
                          <p className="truncate text-xs text-[var(--theme-text-secondary)]" suppressHydrationWarning>
                            {String(contact.role || '')}
                            {contact.role && contact.department ? ' · ' : ''}
                            {String(contact.department || '')}
                          </p>
                        </div>
                        {selected && <CheckCircle className="h-4 w-4 text-emerald-400" />}
                      </button>
                    );
                  })}
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  <input
                    value={manualName}
                    onChange={(event) => setManualName(event.target.value)}
                    placeholder="שם מלא"
                    className="rounded-xl border bg-[var(--theme-bg-secondary)] px-4 py-3 text-sm text-[var(--theme-text)] outline-none focus:border-[var(--theme-accent)]"
                    style={{ borderColor: 'var(--theme-border)' }}
                  />
                  <select
                    value={manualRole}
                    onChange={(event) => setManualRole(event.target.value)}
                    className="rounded-xl border bg-[var(--theme-bg-secondary)] px-4 py-3 text-sm text-[var(--theme-text)] outline-none focus:border-[var(--theme-accent)]"
                    style={{ borderColor: 'var(--theme-border)' }}
                  >
                    <option value="">תפקיד</option>
                    {manualRoleOptions.map((role) => (
                      <option key={role} value={role}>{role}</option>
                    ))}
                  </select>
                  <select
                    value={manualDepartment}
                    onChange={(event) => setManualDepartment(event.target.value)}
                    className="rounded-xl border bg-[var(--theme-bg-secondary)] px-4 py-3 text-sm text-[var(--theme-text)] outline-none focus:border-[var(--theme-accent)] sm:col-span-2"
                    style={{ borderColor: 'var(--theme-border)' }}
                  >
                    <option value="">מחלקה</option>
                    {manualDepartmentOptions.map((department) => (
                      <option key={department} value={department}>{department}</option>
                    ))}
                  </select>
                </div>

                {error && <p className="rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-300">{error}</p>}

                <button
                  type="button"
                  onClick={completeManual}
                  disabled={saving || !manualName.trim()}
                  className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-l from-purple-500 to-blue-600 px-4 py-3 text-sm font-black text-white transition hover:shadow-lg disabled:opacity-50"
                >
                  {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserCheck className="h-4 w-4" />}
                  שמור וקשר פרופיל
                </button>
              </div>
            )}
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
