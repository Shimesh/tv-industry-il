'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import html2canvas from 'html2canvas';
import { AnimatePresence, motion } from 'framer-motion';
import {
  Briefcase,
  Camera,
  CheckCircle2,
  Copy,
  Clock,
  Download,
  FileText,
  Film,
  Image as ImageIcon,
  Loader2,
  Mail,
  MapPin,
  MessageCircle,
  Phone,
  Search,
  Share2,
  Sparkles,
  Star,
  Trophy,
  Wrench,
  X,
} from 'lucide-react';
import type { Contact } from '@/data/contacts';
import ChannelLogo from '@/components/ChannelLogo';
import type { ProCardHistoryResponse, ProCardProductionCredit } from '@/lib/proCardTypes';
import ProfilePhotoUploadButton from '@/components/ProfilePhotoUploadButton';
import { useAuth } from '@/contexts/AuthContext';
import { findChannelByName, getChannelById } from '@/data/channels';

type Props = {
  contact: Contact;
  isCurrentUser: boolean;
  canShowContactInfo: boolean;
  roles: string[];
  departments: string[];
  primaryDepartment: string;
  deptColors: Record<string, string>;
  deptBadgeColors: Record<string, string>;
  removalHref: string;
  onClose: () => void;
};

type GroupedCredits = Array<{
  year: string;
  channels: Array<{
    channelName: string;
    channelId: string | null;
    credits: ProCardProductionCredit[];
  }>;
}>;

const modalVariants = {
  hidden: { opacity: 0, y: 28 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.3, ease: [0.16, 1, 0.3, 1] as [number, number, number, number] },
  },
  exit: {
    opacity: 0,
    y: 12,
    transition: { duration: 0.14 },
  },
};

function fullName(contact: Contact): string {
  return `${contact.firstName || ''} ${contact.lastName || ''}`.replace(/\s+/g, ' ').trim() || 'איש מקצוע';
}

function initials(contact: Contact): string {
  const first = contact.firstName?.trim()?.[0] || '';
  const last = contact.lastName?.trim()?.[0] || '';
  return `${first}${last}` || fullName(contact)[0] || 'TV';
}

function diceBearAvatarUrl(seed: string): string {
  return `https://api.dicebear.com/9.x/thumbs/svg?seed=${encodeURIComponent(seed)}&backgroundColor=0f172a,1e40af,facc15&shapeColor=38bdf8,facc15,2563eb`;
}

function formatWhatsApp(phone?: string): string {
  if (!phone) return '';
  const cleaned = phone.replace(/[-\s]/g, '');
  return `https://wa.me/972${cleaned.startsWith('0') ? cleaned.slice(1) : cleaned}`;
}

function groupCredits(credits: ProCardProductionCredit[]): GroupedCredits {
  const years = new Map<string, Map<string, ProCardProductionCredit[]>>();
  for (const credit of credits) {
    const year = /^\d{4}$/.test(credit.year) ? credit.year : 'ללא תאריך';
    if (!years.has(year)) years.set(year, new Map());
    const channels = years.get(year)!;
    const chName = credit.channelName || 'ללא ערוץ';
    if (!channels.has(chName)) channels.set(chName, []);
    channels.get(chName)!.push(credit);
  }

  return Array.from(years.entries())
    .sort(([a], [b]) => b.localeCompare(a))
    .map(([year, channels]) => ({
      year,
      channels: Array.from(channels.entries())
        .sort(([a], [b]) => {
          // Push "ללא ערוץ" to the end
          if (a === 'ללא ערוץ') return 1;
          if (b === 'ללא ערוץ') return -1;
          return a.localeCompare(b, 'he');
        })
        .map(([channelName, channelCredits]) => ({
          channelName,
          channelId: channelCredits.find((credit) => credit.channelId)?.channelId || null,
          credits: channelCredits.sort((a, b) => b.date.localeCompare(a.date)),
        })),
    }));
}

function formatDate(date: string): string {
  const parsed = new Date(date);
  if (Number.isNaN(parsed.getTime())) return date;
  return parsed.toLocaleDateString('he-IL', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

// Deterministic gradient for productions without a logo or known channel
const INITIALS_GRADIENTS = [
  'linear-gradient(135deg,#4f46e5,#7c3aed)',
  'linear-gradient(135deg,#0284c7,#0891b2)',
  'linear-gradient(135deg,#059669,#0d9488)',
  'linear-gradient(135deg,#b45309,#d97706)',
  'linear-gradient(135deg,#dc2626,#db2777)',
  'linear-gradient(135deg,#7c3aed,#2563eb)',
  'linear-gradient(135deg,#0369a1,#6366f1)',
  'linear-gradient(135deg,#047857,#0284c7)',
];
function nameGradient(name: string): string {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = name.charCodeAt(i) + ((h << 5) - h);
  return INITIALS_GRADIENTS[Math.abs(h) % INITIALS_GRADIENTS.length];
}
function productionInitials(name: string): string {
  const trimmed = name.trim();
  // Take first chars of first two words, falling back to first 2 chars of the name
  const words = trimmed.split(/\s+/).filter(Boolean);
  if (words.length >= 2) return (words[0][0] ?? '') + (words[1][0] ?? '');
  return trimmed.slice(0, 2) || '?';
}

function ProductionMark({ credit }: { credit: ProCardProductionCredit }) {
  // 1. Show Wikipedia-sourced show logo (most accurate)
  if (credit.logoUrl && credit.logoUrl !== 'none') {
    return (
      <div className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-white/8">
        <img src={credit.logoUrl} alt={credit.productionName} className="h-full w-full object-contain" referrerPolicy="no-referrer" />
      </div>
    );
  }

  // 2. Channel logo — covers the common case when no show-specific logo exists
  const channel = getChannelById(credit.channelId) || findChannelByName(credit.channelName);
  if (channel) {
    return <ChannelLogo channel={channel} size={44} rounded={12} />;
  }

  // 3. Named production from registry (ארץ נהדרת, האח הגדול, etc.) — use brand gradient
  if (credit.media.kind === 'production') {
    return (
      <div
        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-xs font-black text-white"
        style={{ background: credit.media.gradient }}
        dir="ltr"
      >
        {credit.media.shortLabel}
      </div>
    );
  }

  // 4. Fallback: colored initials derived from production name — far better than a generic icon
  return (
    <div
      className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-sm font-black text-white"
      style={{ background: nameGradient(credit.productionName) }}
    >
      {productionInitials(credit.productionName)}
    </div>
  );
}

export default function ProCardModal({
  contact,
  isCurrentUser,
  canShowContactInfo,
  roles,
  departments,
  primaryDepartment,
  deptColors,
  deptBadgeColors,
  removalHref,
  onClose,
}: Props) {
  const { user } = useAuth();
  const [history, setHistory] = useState<ProCardHistoryResponse>({ productionCredits: [], boardActivity: [] });
  const [historyLoading, setHistoryLoading] = useState(true);
  const [shareState, setShareState] = useState<'idle' | 'rendering' | 'done' | 'error'>('idle');
  const [shareMenuOpen, setShareMenuOpen] = useState(false);
  const [photoToast, setPhotoToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const shareCardRef = useRef<HTMLDivElement>(null);
  const name = fullName(contact);
  const avatarUrl = typeof contact.customPhotoURL === 'string' && contact.customPhotoURL
    ? contact.customPhotoURL
    : typeof contact.photoURL === 'string' ? contact.photoURL : '';
  const fallbackAvatarUrl = diceBearAvatarUrl(`${contact.id || name}-${name}`);
  const gradientClass = deptColors[primaryDepartment] || 'from-blue-500 to-cyan-500';
  const groupedCredits = useMemo(() => groupCredits(history.productionCredits), [history.productionCredits]);
  const [activeYear, setActiveYear] = useState<string>('all');
  const [activeChannel, setActiveChannel] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');

  const allYears = useMemo(() => groupedCredits.map((g) => g.year), [groupedCredits]);

  const allChannels = useMemo(() => {
    const set = new Set<string>();
    groupedCredits.forEach((yg) =>
      yg.channels.forEach((cg) => {
        if (cg.channelName && cg.channelName !== 'ללא ערוץ') set.add(cg.channelName);
      }),
    );
    return Array.from(set).sort((a, b) => a.localeCompare(b, 'he'));
  }, [groupedCredits]);

  const filteredGroups = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    return groupedCredits
      .filter((yg) => activeYear === 'all' || yg.year === activeYear)
      .map((yg) => ({
        ...yg,
        channels: yg.channels
          .filter((cg) => activeChannel === 'all' || cg.channelName === activeChannel)
          .map((cg) => ({
            ...cg,
            credits: query
              ? cg.credits.filter(
                  (c) =>
                    c.productionName.toLowerCase().includes(query) ||
                    c.role.toLowerCase().includes(query) ||
                    c.channelName.toLowerCase().includes(query),
                )
              : cg.credits,
          }))
          .filter((cg) => cg.credits.length > 0),
      }))
      .filter((yg) => yg.channels.length > 0);
  }, [groupedCredits, activeYear, activeChannel, searchQuery]);

  const stats = useMemo(() => {
    const credits = history.productionCredits;
    const totalShifts = credits.reduce((sum, c) => sum + c.shiftCount, 0);
    const years = new Set(credits.map((c) => c.year).filter((y) => /^\d{4}$/.test(y)));
    const allYearsArr = Array.from(years).map(Number);
    const firstYear = allYearsArr.length ? Math.min(...allYearsArr) : 0;
    const lastYear = allYearsArr.length ? Math.max(...allYearsArr) : 0;
    return { totalShifts, firstYear, lastYear, hasYears: years.size > 0 };
  }, [history.productionCredits]);

  const verified = isCurrentUser || contact.source === 'user-profile' || Boolean(contact.profileId);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  useEffect(() => {
    setActiveYear('all');
    setActiveChannel('all');
    setSearchQuery('');
  }, [contact.id]);

  useEffect(() => {
    let cancelled = false;
    async function loadHistory() {
      setHistoryLoading(true);
      try {
        const token = await user?.getIdToken();
        if (!token || cancelled) { setHistoryLoading(false); return; }
        const response = await fetch(`/api/directory/pro-card-history?contactId=${encodeURIComponent(String(contact.id))}`, {
          headers: { Authorization: `Bearer ${token}` },
          cache: 'no-store',
        });
        const data = response.ok
          ? (await response.json()) as ProCardHistoryResponse
          : { productionCredits: [], boardActivity: [] };
        if (!cancelled) setHistory(data);
      } catch {
        if (!cancelled) setHistory({ productionCredits: [], boardActivity: [] });
      } finally {
        if (!cancelled) setHistoryLoading(false);
      }
    }
    void loadHistory();
    return () => {
      cancelled = true;
    };
  }, [contact.id, user]);

  function buildShareText(): string {
    const title = `*${name}*`;
    const roleText = roles.length ? roles.join(' · ') : 'איש מקצוע בתעשיית הטלוויזיה';
    const departmentText = departments.length ? departments.join(' · ') : '';
    const credits = history.productionCredits.slice(0, 5).map((credit) => {
      const period = credit.shiftCount > 1
        ? `${credit.shiftCount} משמרות, ${formatDate(credit.dateFrom)}-${formatDate(credit.dateTo)}`
        : formatDate(credit.date);
      return `• ${credit.productionName} | ${credit.role} | ${period}`;
    });

    return [
      title,
      roleText,
      departmentText,
      contact.city ? `אזור: ${contact.city}` : '',
      '',
      credits.length ? '*הפקות אחרונות:*' : '',
      ...credits,
      '',
      'TV Industry IL',
    ].filter(Boolean).join('\n');
  }

  async function renderCardImage(): Promise<{ blob: Blob; file: File }> {
    if (!shareCardRef.current) throw new Error('Card is not ready');
    const canvas = await html2canvas(shareCardRef.current, {
      backgroundColor: '#020617',
      scale: Math.min(window.devicePixelRatio || 2, 3),
      useCORS: true,
      allowTaint: false,
      logging: false,
    });
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png', 0.98));
    if (!blob) throw new Error('Canvas export failed');
    const filename = `tv-industry-il-pro-card-${String(contact.id)}.png`;
    return { blob, file: new File([blob], filename, { type: 'image/png' }) };
  }

  async function shareCard() {
    if (shareState === 'rendering') return;
    setShareState('rendering');
    setShareMenuOpen(false);
    try {
      const { blob, file } = await renderCardImage();
      const nav = navigator as Navigator & { canShare?: (data: { files?: File[] }) => boolean };

      if (navigator.share && (!nav.canShare || nav.canShare({ files: [file] }))) {
        await navigator.share({ title: name, text: buildShareText(), files: [file] });
      } else {
        const url = URL.createObjectURL(blob);
        const anchor = document.createElement('a');
        anchor.href = url;
        anchor.download = file.name;
        anchor.click();
        URL.revokeObjectURL(url);
      }
      setShareState('done');
      window.setTimeout(() => setShareState('idle'), 1800);
    } catch {
      setShareState('error');
      window.setTimeout(() => setShareState('idle'), 2200);
    }
  }

  async function shareText() {
    setShareMenuOpen(false);
    const textToShare = buildShareText();
    try {
      if (navigator.share) {
        await navigator.share({ title: name, text: textToShare });
      } else {
        await navigator.clipboard.writeText(textToShare);
      }
      setShareState('done');
    } catch {
      try {
        await navigator.clipboard.writeText(textToShare);
        setShareState('done');
      } catch {
        setShareState('error');
      }
    } finally {
      window.setTimeout(() => setShareState('idle'), 1800);
    }
  }

  async function sharePdf() {
    if (shareState === 'rendering') return;
    setShareState('rendering');
    setShareMenuOpen(false);
    try {
      const { blob } = await renderCardImage();
      const imageUrl = URL.createObjectURL(blob);
      const printWindow = window.open('', '_blank', 'width=900,height=1200');
      if (!printWindow) throw new Error('Popup blocked');
      printWindow.document.write(`
        <!doctype html>
        <html dir="rtl" lang="he">
          <head>
            <meta charset="utf-8" />
            <title>${name} - TV Industry IL Pro Card</title>
            <style>
              body { margin: 0; min-height: 100vh; display: grid; place-items: center; background: #020617; font-family: Arial, sans-serif; }
              img { max-width: 94vw; max-height: 94vh; object-fit: contain; border-radius: 24px; }
              @media print { body { background: #fff; } img { max-width: 100%; max-height: none; border-radius: 0; } }
            </style>
          </head>
          <body><img src="${imageUrl}" alt="${name}" /></body>
        </html>
      `);
      printWindow.document.close();
      printWindow.setTimeout(() => {
        printWindow.focus();
        printWindow.print();
      }, 500);
      window.setTimeout(() => URL.revokeObjectURL(imageUrl), 10_000);
      setShareState('done');
      window.setTimeout(() => setShareState('idle'), 1800);
    } catch {
      setShareState('error');
      window.setTimeout(() => setShareState('idle'), 2200);
    }
  }

  return (
    <AnimatePresence>
      {/* Overlay: animate only background color — NOT opacity on the blur element.
          Animating opacity on a backdrop-blur element causes GPU recomposition on every
          frame (expensive on mobile → heavy flicker). By keeping backdrop-blur at full
          opacity and animating only the background color, the blur is applied once. */}
      <motion.div
        initial={{ backgroundColor: 'rgba(2,6,23,0)' }}
        animate={{ backgroundColor: 'rgba(2,6,23,0.78)', transition: { duration: 0.2 } }}
        exit={{ backgroundColor: 'rgba(2,6,23,0)', transition: { duration: 0.16 } }}
        className="fixed inset-0 z-[12000] flex items-start justify-center overflow-y-auto backdrop-blur-[18px] p-3 pt-[calc(var(--app-header-offset)+0.75rem)] sm:p-6 sm:pt-[calc(var(--app-header-offset)+1rem)]"
        onClick={onClose}
      >
        <motion.div
          variants={modalVariants}
          initial="hidden"
          animate="visible"
          exit="exit"
          className="relative flex max-h-[calc(100dvh-var(--app-header-offset)-1.5rem)] w-full max-w-3xl flex-col overflow-hidden rounded-[28px] border border-white/15 bg-slate-950 shadow-2xl sm:max-h-[calc(100dvh-var(--app-header-offset)-2rem)]"
          style={{ boxShadow: '0 30px 120px rgba(0,0,0,0.64), 0 0 70px rgba(59,130,246,0.16)', backfaceVisibility: 'hidden', willChange: 'transform, opacity' }}
          onClick={(event) => event.stopPropagation()}
          role="dialog"
          aria-modal="true"
          dir="rtl"
        >
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_15%_0%,rgba(250,204,21,0.15),transparent_38%),radial-gradient(circle_at_88%_15%,rgba(56,189,248,0.18),transparent_40%),radial-gradient(circle_at_50%_100%,rgba(37,99,235,0.12),transparent_50%)]" />

          <button
            type="button"
            onClick={onClose}
            className="absolute left-4 top-4 z-20 rounded-full border border-white/10 bg-white/8 p-2 text-white/75 backdrop-blur transition hover:bg-white/15 hover:text-white"
            aria-label="סגור"
          >
            <X className="h-5 w-5" />
          </button>

          {photoToast && (
            <div className={`absolute top-4 right-4 z-30 rounded-xl px-4 py-2 text-sm font-bold shadow-lg ${
              photoToast.type === 'success' ? 'bg-green-500/90 text-white' : 'bg-red-500/90 text-white'
            }`}>
              {photoToast.message}
            </div>
          )}

          <div className="relative z-10 min-h-0 flex-1 overflow-y-auto p-4 sm:p-6">
            <div
              ref={shareCardRef}
              className="overflow-hidden rounded-3xl border border-white/12 bg-slate-950/88 p-5 text-white shadow-2xl backdrop-blur-xl sm:p-7"
            >
              <div className="flex flex-col gap-5 sm:flex-row sm:items-start">
                <div className="flex justify-center sm:justify-start">
                  <div className="relative">
                    <div className="absolute -inset-2 rounded-full bg-gradient-to-br from-amber-300 via-sky-400 to-blue-700 opacity-80 blur-md" />
                    <div className="relative flex h-28 w-28 items-center justify-center overflow-hidden rounded-full border-2 border-amber-200/70 bg-slate-800 text-4xl font-black text-white shadow-2xl sm:h-32 sm:w-32">
                      <img
                        src={avatarUrl || fallbackAvatarUrl}
                        alt={name}
                        className={`h-full w-full object-cover ${avatarUrl ? '' : 'animate-[pulse_4s_ease-in-out_infinite]'}`}
                        referrerPolicy="no-referrer"
                        onError={(event) => {
                          event.currentTarget.style.display = 'none';
                        }}
                      />
                      <div className={`absolute inset-0 -z-10 flex h-full w-full items-center justify-center bg-gradient-to-br ${gradientClass}`}>
                        {initials(contact)}
                      </div>
                    </div>
                    {isCurrentUser ? (
                      <ProfilePhotoUploadButton
                        className="absolute bottom-1 right-1 z-20 flex h-8 w-8 items-center justify-center rounded-full border-2 border-slate-950 bg-slate-700 text-white shadow-lg transition hover:bg-slate-600"
                        onSuccess={() => {
                          setPhotoToast({ message: 'התמונה עודכנה בהצלחה', type: 'success' });
                          setTimeout(() => setPhotoToast(null), 3000);
                        }}
                        onError={(msg) => {
                          setPhotoToast({ message: msg, type: 'error' });
                          setTimeout(() => setPhotoToast(null), 4000);
                        }}
                      >
                        <Camera className="h-4 w-4" />
                      </ProfilePhotoUploadButton>
                    ) : verified && (
                      <div className="absolute bottom-1 right-1 rounded-full border-2 border-slate-950 bg-sky-400 p-1 text-white">
                        <CheckCircle2 className="h-5 w-5" />
                      </div>
                    )}
                  </div>
                </div>

                <div className="min-w-0 flex-1 text-center sm:text-right">
                  <div className="flex flex-wrap items-center justify-center gap-2 sm:justify-start">
                    <h2 className="text-3xl font-black tracking-normal text-white sm:text-4xl">{name}</h2>
                    {isCurrentUser && (
                      <span className="inline-flex items-center gap-1 rounded-full border border-amber-300/30 bg-amber-300/12 px-2.5 py-1 text-xs font-bold text-amber-200">
                        <Star className="h-3.5 w-3.5" />
                        זה אני
                      </span>
                    )}
                  </div>

                  <div className="mt-3 flex flex-wrap justify-center gap-2 sm:justify-start">
                    {roles.map((role) => (
                      <span key={role} className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1.5 text-sm text-white/88">
                        <Briefcase className="h-3.5 w-3.5 text-sky-300" />
                        {role}
                      </span>
                    ))}
                    {departments.map((department) => (
                      <span key={department} className={`rounded-full px-3 py-1.5 text-sm ${deptBadgeColors[department] || 'bg-slate-700 text-slate-200'}`}>
                        {department}
                      </span>
                    ))}
                  </div>

                  <div className="mt-4 flex flex-wrap justify-center gap-2 text-xs text-white/70 sm:justify-start">
                    {contact.city && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-white/8 px-2.5 py-1">
                        <MapPin className="h-3.5 w-3.5" />
                        {String(contact.city)}
                      </span>
                    )}
                    {contact.yearsOfExperience && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-white/8 px-2.5 py-1">
                        <Clock className="h-3.5 w-3.5" />
                        {String(contact.yearsOfExperience)} שנות ניסיון
                      </span>
                    )}
                    {contact.openToWork && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-400/15 px-2.5 py-1 font-bold text-emerald-200">
                        <Sparkles className="h-3.5 w-3.5" />
                        פתוח להצעות
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {(contact.skills?.length || contact.gear?.length) && (
                <div className="mt-6 grid gap-3 sm:grid-cols-2">
                  {contact.skills && contact.skills.length > 0 && (
                    <section className="rounded-2xl border border-white/10 bg-white/[0.06] p-4">
                      <h3 className="mb-3 flex items-center gap-2 text-sm font-black text-white/90">
                        <Star className="h-4 w-4 text-amber-200" />
                        מיומנויות
                      </h3>
                      <div className="flex flex-wrap gap-2">
                        {contact.skills.map((skill) => (
                          <span key={skill} className="rounded-full bg-amber-300/12 px-2.5 py-1 text-xs font-bold text-amber-100">
                            {skill}
                          </span>
                        ))}
                      </div>
                    </section>
                  )}

                  {contact.gear && contact.gear.length > 0 && (
                    <section className="rounded-2xl border border-white/10 bg-white/[0.06] p-4">
                      <h3 className="mb-3 flex items-center gap-2 text-sm font-black text-white/90">
                        <Wrench className="h-4 w-4 text-sky-200" />
                        ציוד
                      </h3>
                      <div className="flex flex-wrap gap-2">
                        {contact.gear.map((item) => (
                          <span key={item} className="rounded-full bg-sky-300/12 px-2.5 py-1 text-xs font-bold text-sky-100">
                            {item}
                          </span>
                        ))}
                      </div>
                    </section>
                  )}
                </div>
              )}

              <section className="mt-6 rounded-2xl border border-white/10 bg-white/[0.055] p-4">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <h3 className="flex items-center gap-2 text-base font-black text-white">
                    <Film className="h-4 w-4 text-sky-200" />
                    היסטוריית הפקות
                  </h3>
                  {!historyLoading && history.productionCredits.length > 0 && (
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="rounded-full bg-sky-400/14 px-2.5 py-1 text-xs font-bold text-sky-100">
                        {history.productionCredits.length} הפקות
                      </span>
                      {stats.totalShifts > history.productionCredits.length && (
                        <span className="rounded-full bg-white/8 px-2.5 py-1 text-xs text-white/60">
                          {stats.totalShifts} משמרות
                        </span>
                      )}
                      {stats.hasYears && (
                        <span className="rounded-full bg-white/8 px-2.5 py-1 text-xs text-white/60" dir="ltr">
                          {stats.firstYear === stats.lastYear ? stats.firstYear : `${stats.firstYear}–${stats.lastYear}`}
                        </span>
                      )}
                    </div>
                  )}
                </div>

                {historyLoading ? (
                  <div className="flex flex-col items-center gap-3 py-10">
                    <Loader2 className="h-7 w-7 animate-spin text-sky-400/70" />
                    <p className="text-xs text-white/40">טוען היסטוריית הפקות...</p>
                  </div>
                ) : groupedCredits.length > 0 ? (
                  <>
                    {/* Search input */}
                    <div className="relative mb-3">
                      <Search className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/35" />
                      <input
                        type="text"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        placeholder="חיפוש לפי הפקה, תפקיד, ערוץ..."
                        className="w-full rounded-xl border border-white/10 bg-white/[0.07] py-2 pr-9 pl-8 text-sm text-white placeholder-white/35 outline-none focus:border-sky-400/40 focus:bg-white/10 transition"
                        dir="rtl"
                      />
                      {searchQuery && (
                        <button
                          type="button"
                          onClick={() => setSearchQuery('')}
                          className="absolute left-3 top-1/2 -translate-y-1/2 text-white/40 hover:text-white/70 transition"
                          aria-label="נקה חיפוש"
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>

                    {/* Filter chips — scroll container must use w-max on inner row so chips don't clip */}
                    {(allYears.length > 1 || allChannels.length > 1) && (
                      <div className="mb-3 space-y-1.5">
                        {allYears.length > 1 && (
                          <div className="no-scrollbar overflow-x-auto" dir="ltr">
                            <div className="flex w-max gap-1.5 pb-0.5">
                              {allYears.map((yr) => (
                                <button
                                  key={yr}
                                  type="button"
                                  onClick={() => setActiveYear(activeYear === yr ? 'all' : yr)}
                                  className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-bold transition ${
                                    activeYear === yr
                                      ? 'bg-amber-300/22 text-amber-100 ring-1 ring-amber-300/40'
                                      : 'bg-white/8 text-white/55 hover:bg-white/14'
                                  }`}
                                >
                                  {yr}
                                </button>
                              ))}
                            </div>
                          </div>
                        )}
                        {allChannels.length > 1 && (
                          <div className="no-scrollbar overflow-x-auto" dir="rtl">
                            <div className="flex w-max gap-1.5 pb-0.5">
                              {allChannels.map((ch) => (
                                <button
                                  key={ch}
                                  type="button"
                                  onClick={() => setActiveChannel(activeChannel === ch ? 'all' : ch)}
                                  className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-bold transition ${
                                    activeChannel === ch
                                      ? 'bg-sky-400/18 text-sky-100 ring-1 ring-sky-400/35'
                                      : 'bg-white/8 text-white/55 hover:bg-white/14'
                                  }`}
                                >
                                  {ch}
                                </button>
                              ))}
                              {(activeYear !== 'all' || activeChannel !== 'all') && (
                                <button
                                  type="button"
                                  onClick={() => { setActiveYear('all'); setActiveChannel('all'); }}
                                  className="shrink-0 rounded-full bg-white/6 px-3 py-1.5 text-xs font-bold text-white/38 hover:bg-white/12 hover:text-white/65 transition"
                                >
                                  ✕ נקה
                                </button>
                              )}
                            </div>
                          </div>
                        )}
                      </div>
                    )}

                    {filteredGroups.length > 0 ? (
                      <div className="space-y-4">
                        {filteredGroups.map((yearGroup) => {
                          const flatCredits = yearGroup.channels.flatMap((cg) => cg.credits);
                          return (
                            <div key={yearGroup.year}>
                              {/* Year header — slim divider, no heavy card wrapper */}
                              <div className="mb-2 flex items-center gap-2">
                                <span className="shrink-0 rounded-full bg-amber-300/12 px-2.5 py-0.5 text-xs font-black text-amber-100" dir="ltr">
                                  {yearGroup.year}
                                </span>
                                <div className="h-px flex-1 bg-white/10" />
                                <span className="shrink-0 text-[10px] text-white/35">{flatCredits.length}</span>
                              </div>
                              <div className="grid gap-1.5">
                                {flatCredits.map((credit) => (
                                  <div
                                    key={`${credit.id}-${credit.role}`}
                                    className="flex items-center gap-3 rounded-xl border border-white/[0.07] bg-white/[0.04] p-3 transition hover:bg-white/[0.07]"
                                  >
                                    <ProductionMark credit={credit} />
                                    <div className="min-w-0 flex-1">
                                      {/* Production name + badges */}
                                      <div className="flex flex-wrap items-center gap-1.5">
                                        <span className="text-[13px] font-bold leading-snug text-white">{credit.productionName}</span>
                                        {credit.isMajor && (
                                          <span className="inline-flex items-center gap-0.5 rounded-full bg-amber-300/15 px-1.5 py-0.5 text-[10px] font-bold text-amber-200">
                                            <Trophy className="h-2.5 w-2.5" />
                                            מרכזית
                                          </span>
                                        )}
                                        {credit.isVerified && (
                                          credit.wikiUrl ? (
                                            <a
                                              href={credit.wikiUrl}
                                              target="_blank"
                                              rel="noopener noreferrer"
                                              className="inline-flex items-center rounded-full bg-sky-400/12 px-1.5 py-0.5 text-[10px] text-sky-300/80 hover:bg-sky-400/22 transition"
                                              title="מאומת בוויקיפדיה"
                                              onClick={(e) => e.stopPropagation()}
                                            >
                                              <CheckCircle2 className="h-2.5 w-2.5" />
                                            </a>
                                          ) : (
                                            <span className="inline-flex items-center rounded-full bg-sky-400/12 px-1.5 py-0.5 text-[10px] text-sky-300/80">
                                              <CheckCircle2 className="h-2.5 w-2.5" />
                                            </span>
                                          )
                                        )}
                                      </div>
                                      {/* Role + channel + date */}
                                      <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-white/45">
                                        <span className="font-semibold text-sky-200/70">{credit.role}</span>
                                        {credit.channelName && credit.channelName !== 'ללא ערוץ' && (
                                          <span className="inline-flex items-center gap-1">
                                            {(() => {
                                              const ch = getChannelById(credit.channelId) || findChannelByName(credit.channelName);
                                              return ch ? <ChannelLogo channel={ch} size={13} rounded={3} /> : <span className="h-1 w-1 rounded-full bg-white/25" />;
                                            })()}
                                            <span>{credit.channelName}</span>
                                          </span>
                                        )}
                                        {credit.shiftCount > 1 ? (
                                          <span dir="ltr" className="text-white/35">{credit.shiftCount} משמרות</span>
                                        ) : (
                                          <span dir="ltr" className="text-white/35">{formatDate(credit.date)}</span>
                                        )}
                                      </div>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      <div className="rounded-xl border border-dashed border-white/14 p-5 text-center text-sm text-white/58">
                        לא נמצאו קרדיטים עבור הסינון הנבחר.
                      </div>
                    )}
                  </>
                ) : (
                  <div className="rounded-xl border border-dashed border-white/14 p-5 text-center text-sm text-white/58">
                    עדיין אין היסטוריית הפקות מחוברת לכרטיס הזה.
                  </div>
                )}
              </section>

              {history.boardActivity.length > 0 && (
                <section className="mt-4 rounded-2xl border border-white/10 bg-white/[0.045] p-4">
                  <h3 className="mb-3 text-sm font-black text-white">פעילות בלוח</h3>
                  <div className="grid gap-2 sm:grid-cols-2">
                    {history.boardActivity.slice(0, 4).map((activity) => (
                      <div key={activity.id} className="rounded-xl bg-white/[0.055] p-3">
                        <div className="line-clamp-1 text-sm font-bold text-white">{activity.title}</div>
                        <div className="mt-1 flex items-center gap-2 text-xs text-white/58">
                          <span>{activity.category || activity.type}</span>
                          <span dir="ltr">{formatDate(activity.date)}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </section>
              )}

              <div className="mt-5 text-center text-[11px] font-medium text-white/45" dir="ltr">
                TV Industry IL · Pro Card v2.3.1
              </div>
            </div>
          </div>

          <div className="relative z-10 shrink-0 border-t border-white/10 px-4 pb-4 pt-3 sm:px-6 sm:pb-5">
            <div className="grid gap-2 sm:grid-cols-2">
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setShareMenuOpen((open) => !open)}
                  disabled={shareState === 'rendering'}
                  className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-l from-amber-300 to-sky-400 px-4 py-3 text-sm font-black text-slate-950 shadow-lg shadow-sky-500/20 transition hover:scale-[1.01] disabled:cursor-wait disabled:opacity-70"
                >
                  {shareState === 'rendering' ? <Download className="h-4 w-4 animate-pulse" /> : <Share2 className="h-4 w-4" />}
                  {shareState === 'rendering' ? 'מכין שיתוף...' : shareState === 'done' ? 'השיתוף מוכן' : shareState === 'error' ? 'לא הצלחנו לשתף' : 'שתף כרטיס מקצועי'}
                </button>

                {shareMenuOpen ? (
                  <div className="absolute bottom-full right-0 z-30 mb-2 w-full overflow-hidden rounded-2xl border border-white/12 bg-slate-900/95 p-2 shadow-2xl backdrop-blur-xl">
                    <button type="button" onClick={() => void shareCard()} className="flex w-full items-center gap-2 rounded-xl px-3 py-2.5 text-right text-sm font-bold text-white/85 transition hover:bg-white/10">
                      <ImageIcon className="h-4 w-4 text-sky-200" />
                      תמונה לשיתוף
                    </button>
                    <button type="button" onClick={() => void sharePdf()} className="flex w-full items-center gap-2 rounded-xl px-3 py-2.5 text-right text-sm font-bold text-white/85 transition hover:bg-white/10">
                      <FileText className="h-4 w-4 text-amber-200" />
                      PDF / הדפסה
                    </button>
                    <button type="button" onClick={() => void shareText()} className="flex w-full items-center gap-2 rounded-xl px-3 py-2.5 text-right text-sm font-bold text-white/85 transition hover:bg-white/10">
                      <Copy className="h-4 w-4 text-emerald-200" />
                      טקסט מעוצב
                    </button>
                  </div>
                ) : null}
              </div>

              <div className="grid grid-cols-2 gap-2">
                {canShowContactInfo && contact.phone ? (
                  <a
                    href={`tel:${contact.phone}`}
                    className="inline-flex items-center justify-center gap-2 rounded-2xl border border-emerald-300/25 bg-emerald-400/12 px-4 py-3 text-sm font-bold text-emerald-100 transition hover:bg-emerald-400/18"
                  >
                    <Phone className="h-4 w-4" />
                    התקשר
                  </a>
                ) : (
                  <a
                    href={removalHref}
                    className="inline-flex items-center justify-center rounded-2xl border border-white/10 bg-white/8 px-4 py-3 text-sm font-bold text-white/65 transition hover:bg-white/12"
                  >
                    חסוי
                  </a>
                )}

                {canShowContactInfo && contact.phone ? (
                  <a
                    href={formatWhatsApp(contact.phone)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center justify-center gap-2 rounded-2xl border border-green-300/25 bg-green-500/12 px-4 py-3 text-sm font-bold text-green-100 transition hover:bg-green-500/18"
                  >
                    <MessageCircle className="h-4 w-4" />
                    WhatsApp
                  </a>
                ) : contact.email && canShowContactInfo ? (
                  <a
                    href={`mailto:${contact.email}`}
                    className="inline-flex items-center justify-center gap-2 rounded-2xl border border-sky-300/25 bg-sky-500/12 px-4 py-3 text-sm font-bold text-sky-100 transition hover:bg-sky-500/18"
                  >
                    <Mail className="h-4 w-4" />
                    אימייל
                  </a>
                ) : (
                  <a
                    href={removalHref}
                    className="inline-flex items-center justify-center rounded-2xl border border-white/10 bg-white/8 px-4 py-3 text-sm font-bold text-white/65 transition hover:bg-white/12"
                  >
                    דיווח
                  </a>
                )}
              </div>
            </div>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
