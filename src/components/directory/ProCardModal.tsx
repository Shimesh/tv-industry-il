'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import html2canvas from 'html2canvas';
import { AnimatePresence, motion } from 'framer-motion';
import {
  Briefcase,
  Camera,
  CheckCircle2,
  CalendarRange,
  Copy,
  Clock,
  FileText,
  Film,
  Image as ImageIcon,
  Loader2,
  MapPin,
  MoreHorizontal,
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
import CallButtons from '@/components/CallButtons';

type Props = {
  contact: Contact;
  isCurrentUser: boolean;
  userId?: string;
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
  userId,
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

  const filteredCreditCount = useMemo(
    () => filteredGroups.reduce(
      (total, yearGroup) => total + yearGroup.channels.reduce((yearTotal, channel) => yearTotal + channel.credits.length, 0),
      0,
    ),
    [filteredGroups],
  );

  const hasSkillsOrGear = (contact.skills?.length ?? 0) > 0 || (contact.gear?.length ?? 0) > 0;

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

    const profileId = userId || contact.profileId;
    const profileUrl = profileId ? `${window.location.origin}/profile/${encodeURIComponent(String(profileId))}` : window.location.origin;

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
      profileUrl,
    ].filter(Boolean).join('\n');
  }

  async function copyShareText(text: string): Promise<void> {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return;
    }
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.setAttribute('readonly', '');
    textarea.style.position = 'fixed';
    textarea.style.opacity = '0';
    document.body.appendChild(textarea);
    textarea.select();
    const copied = document.execCommand('copy');
    textarea.remove();
    if (!copied) throw new Error('Copy failed');
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
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') {
        setShareState('idle');
        return;
      }
      try {
        await copyShareText(buildShareText());
        setShareState('done');
        window.setTimeout(() => setShareState('idle'), 1800);
      } catch {
        setShareState('error');
        window.setTimeout(() => setShareState('idle'), 2200);
      }
    }
  }

  async function shareText() {
    if (shareState === 'rendering') return;
    setShareState('rendering');
    setShareMenuOpen(false);
    const textToShare = buildShareText();
    try {
      if (navigator.share) {
        let timeoutId: ReturnType<typeof setTimeout> | null = null;
        await Promise.race([
          navigator.share({ title: name, text: textToShare }),
          new Promise<never>((_, reject) => {
            timeoutId = setTimeout(() => reject(new Error('Share timed out')), 4000);
          }),
        ]).finally(() => {
          if (timeoutId) clearTimeout(timeoutId);
        });
      } else {
        await copyShareText(textToShare);
      }
      setShareState('done');
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') {
        setShareState('idle');
        return;
      }
      try {
        await copyShareText(textToShare);
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
              className="overflow-hidden rounded-3xl border border-white/12 text-white shadow-2xl"
            >
              {/* ── HERO ── */}
              <div className="relative overflow-hidden" style={{ background: 'linear-gradient(170deg, #05080f 0%, #0e0720 45%, #060e0a 100%)' }}>
                <style>{`
                  @keyframes pc-orb1{0%,100%{opacity:.4}50%{opacity:.72}}
                  @keyframes pc-orb2{0%,100%{opacity:.25}50%{opacity:.52}}
                  @keyframes pc-orb3{0%,100%{opacity:.22}50%{opacity:.45}}
                  @keyframes pc-spin{to{transform:rotate(360deg)}}
                  @keyframes pc-scan{0%{transform:translateY(-4px)}62%{transform:translateY(110vh)}62.001%,100%{transform:translateY(-4px)}}
                `}</style>
                <div className="pointer-events-none absolute inset-0"
                  style={{ background: 'radial-gradient(ellipse 80% 70% at 50% 120%, rgba(224,122,95,0.38), transparent)', animation: 'pc-orb1 8s ease-in-out infinite' }} />
                <div className="pointer-events-none absolute inset-0"
                  style={{ background: 'radial-gradient(ellipse 60% 55% at 8% 15%, rgba(96,165,250,0.24), transparent)', animation: 'pc-orb2 9s ease-in-out infinite 2.5s' }} />
                <div className="pointer-events-none absolute inset-0"
                  style={{ background: 'radial-gradient(ellipse 55% 50% at 92% 12%, rgba(167,139,250,0.22), transparent)', animation: 'pc-orb3 10s ease-in-out infinite 5s' }} />
                <div className="pointer-events-none absolute inset-0 opacity-[0.03]"
                  style={{ backgroundImage: 'linear-gradient(rgba(255,255,255,1) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,1) 1px,transparent 1px)', backgroundSize: '40px 40px' }} />
                <div className="pointer-events-none absolute top-0 left-0 right-0 h-[2px]"
                  style={{ background: 'linear-gradient(90deg, transparent, rgba(96,165,250,0.30), rgba(224,122,95,0.30), rgba(96,165,250,0.30), transparent)', animation: 'pc-scan 8s linear infinite', willChange: 'transform' }} />
                <div className="absolute bottom-0 left-0 right-0 h-px"
                  style={{ background: 'linear-gradient(90deg, transparent 0%, rgba(224,122,95,0.5) 30%, rgba(96,165,250,0.5) 70%, transparent 100%)' }} />

                <div className="relative z-10 flex flex-col items-center text-center px-6 pt-8 pb-7">
                  {/* Status badge */}
                  <div
                    className={`mb-5 inline-flex items-center gap-2 rounded-full border px-4 py-1.5 text-[11px] font-black tracking-widest uppercase backdrop-blur-sm ${
                      contact.openToWork
                        ? 'border-emerald-400/25 bg-emerald-400/[0.08] text-emerald-300'
                        : 'border-amber-400/25 bg-amber-400/[0.08] text-amber-300'
                    }`}
                    style={{ boxShadow: contact.openToWork
                      ? '0 0 32px rgba(52,211,153,0.18), inset 0 1px 0 rgba(255,255,255,0.08)'
                      : '0 0 32px rgba(251,191,36,0.18), inset 0 1px 0 rgba(255,255,255,0.08)',
                    }}
                  >
                    <span className="relative flex h-2 w-2">
                      <span className={`absolute inline-flex h-full w-full animate-ping rounded-full opacity-70 ${contact.openToWork ? 'bg-emerald-400' : 'bg-amber-400'}`} />
                      <span className={`relative inline-flex h-2 w-2 rounded-full ${contact.openToWork ? 'bg-emerald-400' : 'bg-amber-400'}`} />
                    </span>
                    <Sparkles className={`h-3 w-3 ${contact.openToWork ? 'text-emerald-400' : 'text-amber-400'}`} />
                    {contact.openToWork ? 'פתוח להצעות' : 'כרטיס מקצועי · TV Industry IL'}
                  </div>

                  {/* Avatar with spinning conic ring */}
                  <div className="relative mb-5 h-24 w-24 shrink-0">
                    <div className="absolute -inset-[3px] rounded-full"
                      style={{ background: 'conic-gradient(from 0deg, #e07a5f, #60a5fa, #a78bfa, #34d399, #fbbf24, #e07a5f)', animation: 'pc-spin 7s linear infinite', willChange: 'transform' }} />
                    <div className="absolute inset-0 rounded-full m-[3px]" style={{ background: '#080c1a' }} />
                    <div className={`absolute inset-0 m-[3px] rounded-full flex items-center justify-center text-2xl font-black text-white bg-gradient-to-br ${gradientClass}`}>
                      {initials(contact)}
                    </div>
                    <img
                      src={avatarUrl || fallbackAvatarUrl}
                      alt={name}
                      className="absolute inset-0 m-[3px] rounded-full object-cover w-[calc(100%-6px)] h-[calc(100%-6px)]"
                      referrerPolicy="no-referrer"
                      onError={(e) => { e.currentTarget.style.display = 'none'; }}
                    />
                    <div className="absolute -inset-2 rounded-full pointer-events-none"
                      style={{ boxShadow: '0 0 60px rgba(224,122,95,0.35), 0 0 120px rgba(96,165,250,0.18)' }} />
                    {isCurrentUser ? (
                      <ProfilePhotoUploadButton
                        className="absolute bottom-0 right-0 z-20 flex h-8 w-8 items-center justify-center rounded-full border-2 border-slate-950 bg-slate-700 text-white shadow-lg transition hover:bg-slate-600"
                        onSuccess={() => { setPhotoToast({ message: 'התמונה עודכנה בהצלחה', type: 'success' }); setTimeout(() => setPhotoToast(null), 3000); }}
                        onError={(msg) => { setPhotoToast({ message: msg, type: 'error' }); setTimeout(() => setPhotoToast(null), 4000); }}
                      >
                        <Camera className="h-4 w-4" />
                      </ProfilePhotoUploadButton>
                    ) : verified ? (
                      <div className="absolute bottom-0 right-0 rounded-full border-2 border-slate-950 bg-sky-400 p-1 text-white">
                        <CheckCircle2 className="h-4 w-4" />
                      </div>
                    ) : null}
                  </div>

                  {/* Name */}
                  <div className="flex flex-wrap items-center justify-center gap-2 mb-1.5">
                    <h2
                      className="font-black leading-none tracking-tight gradient-text"
                      style={{ fontSize: 'clamp(2rem, 8vw, 3.5rem)', textShadow: '0 0 80px rgba(224,122,95,0.40), 0 0 160px rgba(96,165,250,0.20)' }}
                    >
                      {name}
                    </h2>
                    {isCurrentUser && (
                      <span className="inline-flex items-center gap-1 rounded-full border border-amber-300/30 bg-amber-300/12 px-2.5 py-1 text-xs font-bold text-amber-200">
                        <Star className="h-3.5 w-3.5" />
                        זה אני
                      </span>
                    )}
                  </div>

                  {/* Roles */}
                  {roles.length > 0 && (
                    <p className="text-sm font-semibold text-white/45 tracking-wide mb-4">
                      {roles.join(' · ')}
                    </p>
                  )}

                  {/* Decorative rule */}
                  <div className="flex items-center gap-4 mb-5 w-full max-w-xs">
                    <div className="flex-1 h-px" style={{ background: 'linear-gradient(to left, rgba(224,122,95,0.55), transparent)' }} />
                    <span className="shrink-0 text-[9px] font-black tracking-[0.25em] uppercase text-white/25">{primaryDepartment || 'TV Industry IL'}</span>
                    <div className="flex-1 h-px" style={{ background: 'linear-gradient(to right, rgba(96,165,250,0.55), transparent)' }} />
                  </div>

                  {/* Stat pills */}
                  <div className="flex flex-wrap justify-center gap-2">
                    {departments.map((dept, i) => (
                      <div key={dept}
                        className="flex items-center gap-1.5 rounded-full border border-white/[0.09] bg-white/[0.06] px-3 py-1.5 text-[11px] font-black backdrop-blur-sm"
                        style={{ boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.06)' }}>
                        <span className="h-1.5 w-1.5 rounded-full" style={{ background: (['#60a5fa','#34d399','#a78bfa','#fbbf24','#f97316','#e07a5f'] as string[])[i % 6] }} />
                        <span style={{ color: (['#60a5fa','#34d399','#a78bfa','#fbbf24','#f97316','#e07a5f'] as string[])[i % 6] }}>{dept}</span>
                      </div>
                    ))}
                    {contact.city && (
                      <div className="flex items-center gap-1.5 rounded-full border border-white/[0.09] bg-white/[0.06] px-3 py-1.5 text-[11px] font-bold backdrop-blur-sm text-white/55">
                        <MapPin className="h-3 w-3 shrink-0" />{String(contact.city)}
                      </div>
                    )}
                    {contact.yearsOfExperience && (
                      <div className="flex items-center gap-1.5 rounded-full border border-white/[0.09] bg-white/[0.06] px-3 py-1.5 text-[11px] font-bold backdrop-blur-sm text-white/55">
                        <Clock className="h-3 w-3 shrink-0" />{String(contact.yearsOfExperience)} שנות ניסיון
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* ── CONTENT ── */}
              <div className="bg-slate-950 p-5 sm:p-7">

              {hasSkillsOrGear && (
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

              <section className="mt-6 overflow-hidden rounded-2xl border border-white/10 bg-white/[0.045]">
                <div className="border-b border-white/10 p-4 sm:p-5">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h3 className="flex items-center gap-2 text-base font-black text-white">
                        <Film className="h-4 w-4 text-sky-200" />
                        היסטוריית הפקות
                      </h3>
                      <p className="mt-1 text-xs leading-relaxed text-white/45">הפקות, תפקידים וערוצים לאורך השנים</p>
                    </div>
                    {!historyLoading && groupedCredits.length > 0 && (
                      <span className="shrink-0 text-xs font-bold text-white/45">
                        {filteredCreditCount === history.productionCredits.length
                          ? `${filteredCreditCount} הפקות`
                          : `${filteredCreditCount} מתוך ${history.productionCredits.length}`}
                      </span>
                    )}
                  </div>

                  {!historyLoading && groupedCredits.length > 0 && (
                    <div className="mt-4 grid grid-cols-3 divide-x divide-x-reverse divide-white/10 rounded-xl border border-white/10 bg-slate-950/55 py-3">
                      <div className="px-2 text-center">
                        <Briefcase className="mx-auto mb-1 h-4 w-4 text-sky-300" />
                        <div className="text-lg font-black text-white" dir="ltr">{history.productionCredits.length}</div>
                        <div className="text-[10px] font-semibold text-white/40">הפקות</div>
                      </div>
                      <div className="px-2 text-center">
                        <Clock className="mx-auto mb-1 h-4 w-4 text-emerald-300" />
                        <div className="text-lg font-black text-white" dir="ltr">{stats.totalShifts}</div>
                        <div className="text-[10px] font-semibold text-white/40">משמרות</div>
                      </div>
                      <div className="px-2 text-center">
                        <CalendarRange className="mx-auto mb-1 h-4 w-4 text-amber-300" />
                        <div className="whitespace-nowrap text-xs font-black text-white sm:text-sm" dir="ltr">
                          {stats.hasYears
                            ? stats.firstYear === stats.lastYear ? stats.firstYear : `${stats.firstYear}–${stats.lastYear}`
                            : '—'}
                        </div>
                        <div className="mt-1 text-[10px] font-semibold text-white/40">שנות פעילות</div>
                      </div>
                    </div>
                  )}
                </div>

                {historyLoading ? (
                  <div className="flex flex-col items-center gap-3 py-12">
                    <Loader2 className="h-7 w-7 animate-spin text-sky-400/70" />
                    <p className="text-xs text-white/40">טוען היסטוריית הפקות...</p>
                  </div>
                ) : groupedCredits.length > 0 ? (
                  <>
                    <div className="space-y-3 border-b border-white/10 p-4 sm:p-5">
                      <div className="relative">
                        <Search className="pointer-events-none absolute right-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-white/40" />
                        <input
                          type="search"
                          value={searchQuery}
                          onChange={(e) => setSearchQuery(e.target.value)}
                          placeholder="חיפוש הפקה, תפקיד או ערוץ"
                          className="min-h-11 w-full rounded-xl border border-white/12 bg-slate-950/65 py-2.5 pr-10 pl-10 text-sm text-white outline-none transition placeholder:text-white/35 focus:border-sky-400/55 focus:ring-2 focus:ring-sky-400/15"
                          dir="rtl"
                        />
                        {searchQuery && (
                          <button
                            type="button"
                            onClick={() => setSearchQuery('')}
                            className="absolute left-2.5 top-1/2 inline-flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-lg text-white/45 transition hover:bg-white/10 hover:text-white"
                            aria-label="נקה חיפוש"
                          >
                            <X className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </div>

                      {allYears.length > 1 && (
                        <div>
                          <div className="mb-1.5 text-[10px] font-bold text-white/35">שנה</div>
                          <div className="no-scrollbar overflow-x-auto" dir="rtl">
                            <div className="flex w-max gap-1.5 pb-0.5">
                              {['all', ...allYears].map((yr) => (
                                <button
                                  key={yr}
                                  type="button"
                                  onClick={() => setActiveYear(yr)}
                                  className={`min-h-9 shrink-0 rounded-lg px-3 text-xs font-bold transition ${
                                    activeYear === yr
                                      ? 'bg-amber-300 text-slate-950 shadow-sm shadow-amber-300/20'
                                      : 'border border-white/10 bg-white/[0.045] text-white/55 hover:bg-white/10 hover:text-white'
                                  }`}
                                >
                                  {yr === 'all' ? 'הכל' : yr}
                                </button>
                              ))}
                            </div>
                          </div>
                        </div>
                      )}

                      {allChannels.length > 1 && (
                        <div>
                          <div className="mb-1.5 text-[10px] font-bold text-white/35">ערוץ</div>
                          <div className="no-scrollbar overflow-x-auto" dir="rtl">
                            <div className="flex w-max gap-1.5 pb-0.5">
                              {['all', ...allChannels].map((channelName) => (
                                <button
                                  key={channelName}
                                  type="button"
                                  onClick={() => setActiveChannel(channelName)}
                                  className={`min-h-9 shrink-0 rounded-lg px-3 text-xs font-bold transition ${
                                    activeChannel === channelName
                                      ? 'bg-sky-400 text-slate-950 shadow-sm shadow-sky-400/20'
                                      : 'border border-white/10 bg-white/[0.045] text-white/55 hover:bg-white/10 hover:text-white'
                                  }`}
                                >
                                  {channelName === 'all' ? 'הכל' : channelName}
                                </button>
                              ))}
                            </div>
                          </div>
                        </div>
                      )}

                      {(activeYear !== 'all' || activeChannel !== 'all' || searchQuery) && (
                        <button
                          type="button"
                          onClick={() => { setActiveYear('all'); setActiveChannel('all'); setSearchQuery(''); }}
                          className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-white/10 px-3 text-xs font-bold text-white/55 transition hover:bg-white/10 hover:text-white"
                        >
                          <X className="h-3.5 w-3.5" />
                          איפוס סינון
                        </button>
                      )}
                    </div>

                    {filteredGroups.length > 0 ? (
                      <div className="space-y-5 p-4 sm:p-5">
                        {filteredGroups.map((yearGroup) => {
                          const flatCredits = yearGroup.channels.flatMap((channelGroup) => channelGroup.credits);
                          return (
                            <div key={yearGroup.year}>
                              <div className="mb-2 flex items-center justify-between gap-3">
                                <h4 className="text-sm font-black text-amber-100" dir="ltr">{yearGroup.year}</h4>
                                <span className="text-[11px] font-semibold text-white/35">{flatCredits.length} הפקות</span>
                              </div>
                              <div className="overflow-hidden rounded-xl border border-white/10 bg-slate-950/35 divide-y divide-white/8">
                                {flatCredits.map((credit) => (
                                  <div
                                    key={`${credit.id}-${credit.role}`}
                                    className="flex min-h-[72px] items-center gap-3 px-3 py-3 transition hover:bg-white/[0.045]"
                                  >
                                    <ProductionMark credit={credit} />
                                    <div className="min-w-0 flex-1">
                                      <div className="flex flex-wrap items-center gap-1.5">
                                        <span className="text-sm font-bold leading-snug text-white">{credit.productionName}</span>
                                        {credit.isMajor && (
                                          <span className="inline-flex items-center gap-1 rounded-md bg-amber-300/12 px-1.5 py-0.5 text-[10px] font-bold text-amber-200">
                                            <Trophy className="h-2.5 w-2.5" />
                                            הפקה מרכזית
                                          </span>
                                        )}
                                        {credit.isVerified && (
                                          credit.wikiUrl ? (
                                            <a
                                              href={credit.wikiUrl}
                                              target="_blank"
                                              rel="noopener noreferrer"
                                              className="inline-flex h-5 w-5 items-center justify-center rounded-md bg-sky-400/12 text-sky-300/80 transition hover:bg-sky-400/22"
                                              title="מאומת בוויקיפדיה"
                                              onClick={(event) => event.stopPropagation()}
                                            >
                                              <CheckCircle2 className="h-3 w-3" />
                                            </a>
                                          ) : (
                                            <span className="inline-flex h-5 w-5 items-center justify-center rounded-md bg-sky-400/12 text-sky-300/80">
                                              <CheckCircle2 className="h-3 w-3" />
                                            </span>
                                          )
                                        )}
                                      </div>
                                      <div className="mt-1.5 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[11px] text-white/45">
                                        <span className="font-bold text-sky-200/75">{credit.role}</span>
                                        {credit.channelName && credit.channelName !== 'ללא ערוץ' && (
                                          <span className="inline-flex items-center gap-1">
                                            {(() => {
                                              const channel = getChannelById(credit.channelId) || findChannelByName(credit.channelName);
                                              return channel ? <ChannelLogo channel={channel} size={14} rounded={3} /> : null;
                                            })()}
                                            {credit.channelName}
                                          </span>
                                        )}
                                        <span className="text-white/35" dir="ltr">
                                          {credit.shiftCount > 1 ? `${credit.shiftCount} משמרות` : formatDate(credit.date)}
                                        </span>
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
                      <div className="m-4 rounded-xl border border-dashed border-white/14 p-6 text-center">
                        <Search className="mx-auto mb-2 h-5 w-5 text-white/30" />
                        <p className="text-sm font-bold text-white/65">לא נמצאו הפקות</p>
                        <p className="mt-1 text-xs text-white/40">אפשר לשנות את החיפוש או לאפס את הסינון.</p>
                      </div>
                    )}
                  </>
                ) : (
                  <div className="p-7 text-center">
                    <Film className="mx-auto mb-3 h-6 w-6 text-white/25" />
                    <p className="text-sm font-bold text-white/65">עדיין אין היסטוריית הפקות</p>
                    <p className="mt-1 text-xs text-white/40">קרדיטים שיימצאו בלוחות העבודה יופיעו כאן.</p>
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
                TV Industry IL · Pro Card v2.4.0
              </div>
              </div>{/* end content */}
            </div>
          </div>

          <div className="relative z-10 shrink-0 border-t border-white/10 px-4 pb-4 pt-3 sm:px-6 sm:pb-5">
            <div className="grid gap-2 sm:grid-cols-2">
              <div className="relative flex gap-2">
                <button
                  type="button"
                  onClick={() => void shareText()}
                  disabled={shareState === 'rendering'}
                  className="inline-flex min-h-12 flex-1 items-center justify-center gap-2 rounded-xl bg-gradient-to-l from-amber-300 to-sky-400 px-4 text-sm font-black text-slate-950 shadow-lg shadow-sky-500/20 transition hover:brightness-105 active:scale-[0.98] disabled:cursor-wait disabled:opacity-70"
                >
                  {shareState === 'rendering' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Share2 className="h-4 w-4" />}
                  {shareState === 'rendering' ? 'פותח שיתוף...' : shareState === 'done' ? 'הכרטיס שותף' : shareState === 'error' ? 'השיתוף נכשל' : 'שתף כרטיס מקצועי'}
                </button>
                <button
                  type="button"
                  onClick={() => setShareMenuOpen((open) => !open)}
                  className="inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-white/12 bg-white/[0.065] text-white/75 transition hover:bg-white/12 hover:text-white active:scale-95"
                  aria-label="אפשרויות שיתוף נוספות"
                  aria-expanded={shareMenuOpen}
                >
                  <MoreHorizontal className="h-5 w-5" />
                </button>

                {shareMenuOpen ? (
                  <div className="absolute bottom-full right-0 z-30 mb-2 min-w-56 overflow-hidden rounded-xl border border-white/12 bg-slate-900/95 p-2 shadow-2xl backdrop-blur-xl">
                    <button type="button" onClick={() => void shareCard()} className="flex min-h-11 w-full items-center gap-2 rounded-lg px-3 text-right text-sm font-bold text-white/85 transition hover:bg-white/10">
                      <ImageIcon className="h-4 w-4 text-sky-200" />
                      תמונה לשיתוף
                    </button>
                    <button type="button" onClick={() => void sharePdf()} className="flex min-h-11 w-full items-center gap-2 rounded-lg px-3 text-right text-sm font-bold text-white/85 transition hover:bg-white/10">
                      <FileText className="h-4 w-4 text-amber-200" />
                      PDF / הדפסה
                    </button>
                    <button type="button" onClick={() => void shareText()} className="flex min-h-11 w-full items-center gap-2 rounded-lg px-3 text-right text-sm font-bold text-white/85 transition hover:bg-white/10">
                      <Copy className="h-4 w-4 text-emerald-200" />
                      העתקת פרטי הכרטיס
                    </button>
                  </div>
                ) : null}
              </div>

              <CallButtons
                userId={userId}
                displayName={fullName(contact)}
                size="lg"
              />
            </div>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
