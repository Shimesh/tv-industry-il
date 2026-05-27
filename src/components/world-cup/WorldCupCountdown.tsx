'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { ChevronLeft } from 'lucide-react';
import { fallbackMatches, WORLD_CUP_START_ISO } from '@/lib/world-cup/static-data';
import { useWorldCup } from '@/contexts/WorldCupContext';

const TROPHY_IMG = 'https://upload.wikimedia.org/wikipedia/commons/thumb/2/2a/FIFA_World_Cup_Trophy_2010.jpg/240px-FIFA_World_Cup_Trophy_2010.jpg';

function getDiff() {
  const diffMs = Math.max(0, Date.parse(WORLD_CUP_START_ISO) - Date.now());
  const days = Math.floor(diffMs / 86_400_000);
  const hours = Math.floor((diffMs % 86_400_000) / 3_600_000);
  const minutes = Math.floor((diffMs % 3_600_000) / 60_000);
  const seconds = Math.floor((diffMs % 60_000) / 1000);
  return { days, hours, minutes, seconds };
}

function Digit({ value, label, compact = false }: { value: number | null; label: string; compact?: boolean }) {
  return (
    <div
      className={`flex min-w-0 flex-1 flex-col items-center justify-center rounded-xl border leading-none ${
        compact ? 'px-1 py-1' : 'px-1.5 py-2'
      }`}
      style={{
        borderColor: 'color-mix(in srgb, var(--wc-gold, #D4AF37) 34%, transparent)',
        background: 'color-mix(in srgb, var(--wc-deep-blue, #002046) 62%, transparent)',
      }}
    >
      <motion.span
        key={value ?? label}
        initial={{ scale: 0.92, opacity: 0.55 }}
        animate={{ scale: label === 'שניות' ? [1, 1.09, 1] : 1, opacity: 1 }}
        transition={{ duration: label === 'שניות' ? 0.45 : 0.22 }}
        className={`${compact ? 'text-sm' : 'text-xl sm:text-2xl'} font-black leading-none tabular-nums text-[var(--wc-gold,#D4AF37)] drop-shadow-[0_0_12px_rgba(212,175,55,.32)]`}
        dir="ltr"
      >
        {value === null ? '--' : String(value).padStart(2, '0')}
      </motion.span>
      <span className={`${compact ? 'text-[8px]' : 'mt-1 text-[10px]'} font-black leading-none text-white/75`}>{label}</span>
    </div>
  );
}

const FLAG_IMAGE_CODES: Record<string, string> = {
  mex: 'mx',
  rsa: 'za',
  can: 'ca',
  qat: 'qa',
  usa: 'us',
  par: 'py',
  bra: 'br',
  mar: 'ma',
  arg: 'ar',
  alg: 'dz',
  ger: 'de',
  nzl: 'nz',
  eng: 'gb-eng',
  cro: 'hr',
  esp: 'es',
  jpn: 'jp',
};

function FlagBadge({ team, small = false }: { team: { id: string; nameHe: string; flag: string }; small?: boolean }) {
  const code = FLAG_IMAGE_CODES[team.id];
  return (
    <span className={`flex ${small ? 'h-10 w-10' : 'h-14 w-14'} items-center justify-center overflow-hidden rounded-xl border border-white/10 bg-white/95 shadow-md shadow-black/20`}>
      {code ? (
        <img
          src={`https://flagcdn.com/w80/${code}.png`}
          alt={team.nameHe}
          className="h-full w-full object-cover"
          loading="lazy"
        />
      ) : (
        <span className={`${small ? 'text-xl' : 'text-3xl'} leading-none`}>{team.flag}</span>
      )}
    </span>
  );
}

export default function WorldCupCountdown({ compact = false }: { compact?: boolean }) {
  const router = useRouter();
  const { activeMatch, nextMatch } = useWorldCup();
  const [diff, setDiff] = useState<ReturnType<typeof getDiff> | null>(null);
  const [trophyError, setTrophyError] = useState(false);

  useEffect(() => {
    setDiff(getDiff());
    const interval = window.setInterval(() => setDiff(getDiff()), 1000);
    return () => window.clearInterval(interval);
  }, []);

  const label = useMemo(() => activeMatch ? 'מונדיאל LIVE' : 'מונדיאל 2026', [activeMatch]);
  const previewMatch = nextMatch ?? fallbackMatches[0] ?? null;

  return (
    <motion.button
      type="button"
      onClick={() => router.push('/world-cup')}
      whileHover={{ y: -3, scale: 1.015 }}
      whileTap={{ scale: 0.97, y: 0 }}
      className={`group relative isolate flex shrink-0 cursor-pointer overflow-hidden rounded-[1.5rem] border text-right backdrop-blur-2xl transition-all duration-200 hover:border-[#D4AF37]/60 ${
        compact
          ? 'min-h-16 max-w-[min(56vw,190px)] items-center gap-2 px-2 py-2 sm:max-w-none'
          : 'h-[360px] w-full max-w-full flex-col gap-2.5 p-4'
      }`}
      style={{
        borderColor: activeMatch
          ? 'color-mix(in srgb, var(--wc-gold, #D4AF37) 45%, transparent)'
          : 'rgba(212,175,55,0.24)',
        background:
          'linear-gradient(170deg, rgba(0,18,52,0.94) 0%, rgba(2,6,23,0.97) 52%, rgba(0,10,32,0.99) 100%)',
        boxShadow: activeMatch
          ? '0 0 28px var(--wc-gold-glow, rgba(212,175,55,.34)), 0 24px 64px rgba(0,0,0,.25)'
          : '0 16px 48px rgba(212,175,55,0.16), inset 0 1px 0 rgba(255,255,255,0.09)',
      }}
      title="מרכז מונדיאל 2026"
    >
      {/* Backgrounds */}
      <span className="pointer-events-none absolute inset-0">
        <span className="absolute inset-0 bg-[radial-gradient(ellipse_100%_55%_at_50%_115%,rgba(0,80,20,0.28),transparent_60%)]" />
        <span className="absolute inset-0 bg-[radial-gradient(circle_at_22%_22%,rgba(212,175,55,0.20),transparent_46%)]" />
        <span className="absolute inset-0 bg-[radial-gradient(circle_at_80%_80%,rgba(0,32,80,0.35),transparent_40%)]" />
      </span>
      <span className="pointer-events-none absolute inset-0 -translate-x-full skew-x-[-20deg] bg-gradient-to-r from-transparent via-white/[0.07] to-transparent transition-transform duration-700 ease-out group-hover:translate-x-full" />

      {/* Header */}
      <span className="relative flex w-full items-center justify-between gap-3">
        <span className="flex min-w-0 items-center gap-2.5">
          {compact ? (
            <span className="relative flex h-9 w-9 shrink-0 items-center justify-center">
              {trophyError ? (
                <span className="text-2xl drop-shadow-[0_0_10px_rgba(212,175,55,0.65)]">🏆</span>
              ) : (
                <img
                  src={TROPHY_IMG}
                  alt="גביע העולם"
                  referrerPolicy="no-referrer"
                  className="h-full w-auto object-contain drop-shadow-[0_0_10px_rgba(212,175,55,0.65)]"
                  loading="eager"
                  onError={() => setTrophyError(true)}
                />
              )}
            </span>
          ) : null}
          <span className={compact ? 'min-w-0 text-right' : 'min-w-0 text-right'}>
            <span className="block text-[10px] font-black uppercase tracking-widest text-white/40">FIFA World Cup</span>
            <span className={`block font-black leading-tight text-white ${compact ? 'text-sm' : 'text-base'}`}>{label}</span>
          </span>
        </span>
        {!compact && (
          <span className="flex shrink-0 items-center gap-1 rounded-full border border-[#D4AF37]/30 bg-[#D4AF37]/10 px-2.5 py-1 text-[11px] font-black text-[#D4AF37] transition-all duration-200 group-hover:border-[#D4AF37]/50 group-hover:bg-[#D4AF37]/20">
            כניסה
            <ChevronLeft className="h-3 w-3 transition-transform duration-200 group-hover:-translate-x-0.5" />
          </span>
        )}
      </span>

      {/* Trophy centerpiece (non-compact only) */}
      {!compact && (
        <span className="relative flex min-h-0 flex-1 items-center justify-center" style={{ maxHeight: '176px' }}>
          <span className="pointer-events-none absolute inset-x-8 inset-y-0 rounded-full bg-[#D4AF37] opacity-[0.08] blur-2xl" />
          <span className="pointer-events-none absolute bottom-0 left-1/2 h-16 w-16 -translate-x-1/2 rounded-full bg-[#D4AF37] opacity-20 blur-2xl" />
          {trophyError ? (
            <span className="relative z-10 text-[88px] leading-none drop-shadow-[0_4px_30px_rgba(212,175,55,0.68)] transition-all duration-500 group-hover:scale-105">
              🏆
            </span>
          ) : (
            <img
              src={TROPHY_IMG}
              alt="גביע העולם FIFA"
              referrerPolicy="no-referrer"
              className="relative z-10 h-full w-auto object-contain drop-shadow-[0_4px_30px_rgba(212,175,55,0.68)] transition-all duration-500 group-hover:scale-105 group-hover:drop-shadow-[0_8px_44px_rgba(212,175,55,0.92)]"
              loading="eager"
              onError={() => setTrophyError(true)}
            />
          )}
        </span>
      )}

      {/* Match preview */}
      {!compact && previewMatch ? (
        <span className="relative flex w-full items-center justify-center gap-2 rounded-2xl border border-[#D4AF37]/18 bg-black/25 px-3 py-2 text-center" dir="rtl">
          <span className="flex min-w-0 flex-1 flex-col items-center gap-1">
            <FlagBadge team={previewMatch.homeTeam} small />
            <span className="max-w-full truncate text-[11px] font-black text-white/85">{previewMatch.homeTeam.nameHe}</span>
          </span>
          <span className="rounded-full border border-[#D4AF37]/30 bg-[#D4AF37]/10 px-2.5 py-0.5 text-[11px] font-black text-[#D4AF37]" dir="ltr">
            VS
          </span>
          <span className="flex min-w-0 flex-1 flex-col items-center gap-1">
            <FlagBadge team={previewMatch.awayTeam} small />
            <span className="max-w-full truncate text-[11px] font-black text-white/85">{previewMatch.awayTeam.nameHe}</span>
          </span>
        </span>
      ) : null}

      {/* Countdown */}
      <span className={`${compact ? 'relative flex flex-1 gap-1' : 'relative grid w-full grid-cols-4 gap-1.5'}`} dir="ltr">
        <Digit value={diff?.days ?? null} label="ימים" compact={compact} />
        <Digit value={diff?.hours ?? null} label="שעות" compact={compact} />
        <Digit value={diff?.minutes ?? null} label="דקות" compact={compact} />
        <Digit value={diff?.seconds ?? null} label="שניות" compact={compact} />
      </span>
    </motion.button>
  );
}
