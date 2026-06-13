'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { ChevronLeft } from 'lucide-react';
import { WORLD_CUP_START_ISO } from '@/lib/world-cup/static-data';
import { useWorldCup } from '@/contexts/WorldCupContext';

const TROPHY_IMG = '/wc2026-logo.png';

function getDiff(targetIso: string) {
  const diffMs = Math.max(0, Date.parse(targetIso) - Date.now());
  return {
    days: Math.floor(diffMs / 86_400_000),
    hours: Math.floor((diffMs % 86_400_000) / 3_600_000),
    minutes: Math.floor((diffMs % 3_600_000) / 60_000),
    seconds: Math.floor((diffMs % 60_000) / 1000),
  };
}

function Digit({ value, label, compact = false }: { value: number | null; label: string; compact?: boolean }) {
  const isSeconds = label === 'שניות';
  return (
    <div
      className={`relative flex min-w-0 flex-1 flex-col items-center justify-center overflow-hidden rounded-xl leading-none ${
        compact ? 'px-1 py-1.5' : 'px-1 py-3'
      }`}
      style={{
        background: 'linear-gradient(180deg, rgba(0,20,60,0.85) 0%, rgba(0,10,35,0.95) 100%)',
        border: '1px solid rgba(212,175,55,0.22)',
        boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.06)',
      }}
    >
      {/* Subtle inner glow on digit */}
      <span className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_80%_60%_at_50%_0%,rgba(212,175,55,0.08),transparent_70%)]" />
      <motion.span
        key={value ?? label}
        initial={{ y: isSeconds ? -6 : 0, opacity: isSeconds ? 0.4 : 0.7, scale: 0.88 }}
        animate={{ y: 0, opacity: 1, scale: 1 }}
        transition={{ duration: isSeconds ? 0.3 : 0.18, ease: 'easeOut' }}
        className={`relative font-black tabular-nums text-[#D4AF37] ${
          compact ? 'text-sm' : 'text-2xl sm:text-3xl'
        }`}
        style={{ textShadow: '0 0 18px rgba(212,175,55,0.55), 0 0 40px rgba(212,175,55,0.2)' }}
        dir="ltr"
      >
        {value === null ? '--' : String(value).padStart(2, '0')}
      </motion.span>
      <span
        className={`relative font-bold uppercase tracking-wide text-white/50 ${
          compact ? 'text-[7px] mt-0.5' : 'text-[9px] mt-1.5'
        }`}
      >
        {label}
      </span>
    </div>
  );
}

const FLAG_IMAGE_CODES: Record<string, string> = {
  mex: 'mx', rsa: 'za', can: 'ca', qat: 'qa', usa: 'us', par: 'py',
  bra: 'br', mar: 'ma', arg: 'ar', alg: 'dz', ger: 'de', nzl: 'nz',
  eng: 'gb-eng', cro: 'hr', esp: 'es', jpn: 'jp',
};

function FlagBadge({ team, small = false }: { team: { id: string; nameHe: string; flag: string }; small?: boolean }) {
  const code = FLAG_IMAGE_CODES[team.id];
  return (
    <span
      className={`flex ${small ? 'h-11 w-11' : 'h-14 w-14'} items-center justify-center overflow-hidden rounded-xl shadow-lg shadow-black/30`}
      style={{ border: '1.5px solid rgba(255,255,255,0.12)', background: 'rgba(255,255,255,0.92)' }}
    >
      {code ? (
        <img
          src={`https://flagcdn.com/w80/${code}.png`}
          alt={team.nameHe}
          className="h-full w-full object-cover"
          loading="lazy"
        />
      ) : (
        <span className={`${small ? 'text-2xl' : 'text-3xl'} leading-none`}>{team.flag}</span>
      )}
    </span>
  );
}

export default function WorldCupCountdown({ compact = false }: { compact?: boolean }) {
  const router = useRouter();
  const { activeMatch, nextMatch } = useWorldCup();
  const [diff, setDiff] = useState<ReturnType<typeof getDiff> | null>(null);

  const label = useMemo(() => (activeMatch ? 'מונדיאל LIVE' : 'מונדיאל 2026'), [activeMatch]);
  const previewMatch = activeMatch ?? nextMatch ?? null;

  // Count down to next/active match kickoff, not to the fixed tournament start date
  const targetIso = nextMatch?.kickoff ?? activeMatch?.kickoff ?? WORLD_CUP_START_ISO;

  useEffect(() => {
    setDiff(getDiff(targetIso));
    const interval = window.setInterval(() => setDiff(getDiff(targetIso)), 1000);
    return () => window.clearInterval(interval);
  }, [targetIso]);

  return (
    <motion.button
      type="button"
      onClick={() => router.push('/world-cup')}
      whileHover={{ y: -4, scale: 1.018 }}
      whileTap={{ scale: 0.97, y: 0 }}
      className={`group relative isolate flex shrink-0 cursor-pointer text-right ${
        compact
          ? 'min-h-16 max-w-[min(56vw,190px)] items-center gap-2 overflow-hidden rounded-2xl px-2 py-2 sm:max-w-none'
          : 'w-full max-w-full flex-col gap-3 overflow-hidden rounded-[1.75rem] p-4'
      }`}
      style={{
        background: 'linear-gradient(175deg, #001230 0%, #000c22 45%, #000818 100%)',
        boxShadow: activeMatch
          ? '0 0 0 1.5px rgba(212,175,55,0.6), 0 8px 32px rgba(212,175,55,0.25), 0 24px 64px rgba(0,0,0,0.5)'
          : '0 0 0 1.5px rgba(212,175,55,0.18), 0 8px 32px rgba(0,0,0,0.4), 0 2px 0 rgba(255,255,255,0.04) inset',
      }}
      title="מרכז מונדיאל 2026"
    >
      {/* ── Breathing border glow ── */}
      <motion.span
        className="pointer-events-none absolute inset-0 rounded-[inherit]"
        animate={{
          boxShadow: activeMatch
            ? [
                '0 0 0 1.5px rgba(212,175,55,0.5), 0 0 24px rgba(212,175,55,0.25)',
                '0 0 0 2px rgba(212,175,55,0.9), 0 0 48px rgba(212,175,55,0.55)',
                '0 0 0 1.5px rgba(212,175,55,0.5), 0 0 24px rgba(212,175,55,0.25)',
              ]
            : [
                '0 0 0 1.5px rgba(212,175,55,0.15), 0 0 16px rgba(212,175,55,0.06)',
                '0 0 0 1.5px rgba(212,175,55,0.45), 0 0 32px rgba(212,175,55,0.18)',
                '0 0 0 1.5px rgba(212,175,55,0.15), 0 0 16px rgba(212,175,55,0.06)',
              ],
        }}
        transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
      />

      {/* ── Breathing background layers ── */}
      <span className="pointer-events-none absolute inset-0">
        {/* Gold top-corner glow */}
        <span className="absolute inset-0 bg-[radial-gradient(circle_at_18%_18%,rgba(212,175,55,0.18),transparent_42%)]" />
        {/* Green pitch glow at bottom — breathing */}
        <motion.span
          className="absolute bottom-0 left-0 right-0 h-2/5"
          style={{
            background: 'radial-gradient(ellipse_110%_80%_at_50%_110%, rgba(0,100,28,0.55), rgba(0,60,16,0.25) 55%, transparent 80%)',
          }}
          animate={{ opacity: [0.7, 1, 0.7] }}
          transition={{ duration: 4, repeat: Infinity, ease: 'easeInOut' }}
        />
        {/* Deep blue side accent */}
        <span className="absolute inset-0 bg-[radial-gradient(circle_at_85%_75%,rgba(0,40,100,0.3),transparent_38%)]" />
      </span>

      {/* ── Shimmer on hover ── */}
      <span className="pointer-events-none absolute inset-0 -translate-x-full skew-x-[-20deg] bg-gradient-to-r from-transparent via-white/[0.06] to-transparent transition-transform duration-700 ease-out group-hover:translate-x-full" />

      {/* ══════════════ COMPACT LAYOUT ══════════════ */}
      {compact && (
        <>
          {/* Logo — inverted so black bg disappears on dark card, gold stays gold */}
          <span className="relative flex h-10 w-10 shrink-0 items-center justify-center">
            <img
              src={TROPHY_IMG}
              alt="FIFA World Cup 2026"
              className="h-full w-full object-contain"
              style={{ filter: 'invert(1) hue-rotate(180deg) brightness(1.1)' }}
              loading="eager"
            />
          </span>

          <span className="min-w-0 flex-1 text-right">
            <span className="block text-[9px] font-black uppercase tracking-widest text-white/35">
              FIFA World Cup
            </span>
            <span className="block text-sm font-black leading-tight text-white">{label}</span>
          </span>

          {activeMatch ? (
            <span className="relative flex shrink-0 items-center gap-1.5" dir="ltr">
              <motion.span
                className="rounded-lg px-2.5 py-1 text-sm font-black tabular-nums text-[#D4AF37]"
                style={{
                  background: 'rgba(212,175,55,0.15)',
                  border: '1px solid rgba(212,175,55,0.4)',
                }}
                animate={{ opacity: [1, 0.5, 1] }}
                transition={{ duration: 1.8, repeat: Infinity, ease: 'easeInOut' }}
              >
                {activeMatch.awayScore ?? 0}:{activeMatch.homeScore ?? 0}
              </motion.span>
              <motion.span
                animate={{ opacity: [1, 0, 1] }}
                transition={{ duration: 0.9, repeat: Infinity }}
                className="h-2 w-2 rounded-full bg-red-500"
              />
            </span>
          ) : (
            <span className="relative flex shrink-0 gap-1" dir="ltr">
              <Digit value={diff?.days ?? null} label="ימים" compact />
              <Digit value={diff?.hours ?? null} label="שעות" compact />
              <Digit value={diff?.minutes ?? null} label="דקות" compact />
              <Digit value={diff?.seconds ?? null} label="שניות" compact />
            </span>
          )}
        </>
      )}

      {/* ══════════════ FULL LAYOUT ══════════════ */}
      {!compact && (
        <>
          {/* Header row */}
          <span className="relative flex w-full items-start justify-between gap-3">
            <span className="flex min-w-0 flex-col">
              <span className="text-[10px] font-black uppercase tracking-[0.2em] text-white/35">
                FIFA World Cup
              </span>
              <span className="mt-0.5 text-lg font-black leading-tight text-white">{label}</span>
            </span>

            {/* Official logo — inverted filter */}
            <span className="relative flex h-16 w-16 shrink-0 items-center justify-center">
              <motion.span
                className="pointer-events-none absolute inset-0 rounded-2xl"
                animate={{ opacity: [0.3, 0.7, 0.3] }}
                transition={{ duration: 2.5, repeat: Infinity, ease: 'easeInOut' }}
                style={{ boxShadow: '0 0 20px rgba(212,175,55,0.5)' }}
              />
              <img
                src={TROPHY_IMG}
                alt="גביע העולם FIFA 2026"
                className="relative z-10 h-full w-full object-contain drop-shadow-[0_0_14px_rgba(212,175,55,0.6)] transition-transform duration-500 group-hover:scale-110"
                style={{ filter: 'invert(1) hue-rotate(180deg) brightness(1.15)' }}
                loading="eager"
              />
            </span>

            <span className="flex shrink-0 items-center gap-1 self-start rounded-full border border-[#D4AF37]/30 bg-[#D4AF37]/10 px-2.5 py-1 text-[11px] font-black text-[#D4AF37] transition-all duration-200 group-hover:border-[#D4AF37]/55 group-hover:bg-[#D4AF37]/20">
              כניסה
              <ChevronLeft className="h-3 w-3 transition-transform duration-200 group-hover:-translate-x-0.5" />
            </span>
          </span>

          {/* Match preview */}
          {previewMatch && (
            <motion.span
              className="relative flex w-full items-center justify-center gap-3 rounded-2xl px-4 py-3"
              style={{
                background: 'linear-gradient(135deg, rgba(0,15,45,0.85) 0%, rgba(0,10,30,0.9) 100%)',
                border: '1px solid rgba(212,175,55,0.15)',
                boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.04)',
              }}
              dir="rtl"
            >
              {/* Team home */}
              <span className="flex min-w-0 flex-1 flex-col items-center gap-1.5">
                <FlagBadge team={previewMatch.homeTeam} small />
                <span className="max-w-full truncate text-[11px] font-black text-white/80">
                  {previewMatch.homeTeam.nameHe}
                </span>
              </span>

              {/* Live score or VS badge */}
              {activeMatch ? (
                <span className="flex flex-col items-center gap-1">
                  <motion.span
                    className="rounded-xl px-3 py-1.5 text-2xl font-black tabular-nums text-[#D4AF37]"
                    style={{
                      background: 'linear-gradient(135deg, rgba(212,175,55,0.2), rgba(212,175,55,0.08))',
                      border: '1px solid rgba(212,175,55,0.45)',
                      boxShadow: '0 0 16px rgba(212,175,55,0.2)',
                    }}
                    animate={{ opacity: [1, 0.55, 1] }}
                    transition={{ duration: 1.8, repeat: Infinity, ease: 'easeInOut' }}
                    dir="ltr"
                  >
                    {activeMatch.awayScore ?? 0}:{activeMatch.homeScore ?? 0}
                  </motion.span>
                  <span className="flex items-center gap-1 text-[10px] font-black text-red-400">
                    <motion.span
                      animate={{ opacity: [1, 0, 1] }}
                      transition={{ duration: 0.9, repeat: Infinity }}
                      className="inline-block h-1.5 w-1.5 rounded-full bg-red-500"
                    />
                    {activeMatch.minute != null ? `דקה ${activeMatch.minute}׳` : 'חי'}
                  </span>
                </span>
              ) : (
                <span className="flex flex-col items-center gap-0.5">
                  <span
                    className="rounded-full px-3 py-1 text-[12px] font-black text-[#D4AF37]"
                    style={{
                      background: 'linear-gradient(135deg, rgba(212,175,55,0.18), rgba(212,175,55,0.08))',
                      border: '1px solid rgba(212,175,55,0.35)',
                    }}
                    dir="ltr"
                  >
                    VS
                  </span>
                </span>
              )}

              {/* Team away */}
              <span className="flex min-w-0 flex-1 flex-col items-center gap-1.5">
                <FlagBadge team={previewMatch.awayTeam} small />
                <span className="max-w-full truncate text-[11px] font-black text-white/80">
                  {previewMatch.awayTeam.nameHe}
                </span>
              </span>
            </motion.span>
          )}

          {/* Countdown or live indicator */}
          {activeMatch ? (
            <span
              className="relative flex w-full items-center justify-center gap-2 rounded-2xl py-2.5"
              style={{
                background: 'rgba(239,68,68,0.1)',
                border: '1px solid rgba(239,68,68,0.25)',
              }}
            >
              <motion.span
                animate={{ opacity: [1, 0.1, 1] }}
                transition={{ duration: 0.9, repeat: Infinity }}
                className="h-2.5 w-2.5 rounded-full bg-red-500"
              />
              <span className="text-sm font-black text-red-400">שידור חי עכשיו</span>
            </span>
          ) : (
            <span className="relative grid w-full grid-cols-4 gap-2" dir="ltr">
              <Digit value={diff?.days ?? null} label="ימים" />
              <Digit value={diff?.hours ?? null} label="שעות" />
              <Digit value={diff?.minutes ?? null} label="דקות" />
              <Digit value={diff?.seconds ?? null} label="שניות" />
            </span>
          )}
        </>
      )}
    </motion.button>
  );
}
