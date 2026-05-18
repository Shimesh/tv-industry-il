'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { ChevronLeft, Trophy } from 'lucide-react';
import { WORLD_CUP_START_ISO } from '@/lib/world-cup/static-data';
import { useWorldCup } from '@/contexts/WorldCupContext';

function getDiff() {
  const diffMs = Math.max(0, Date.parse(WORLD_CUP_START_ISO) - Date.now());
  const days = Math.floor(diffMs / 86_400_000);
  const hours = Math.floor((diffMs % 86_400_000) / 3_600_000);
  const minutes = Math.floor((diffMs % 3_600_000) / 60_000);
  const seconds = Math.floor((diffMs % 60_000) / 1000);
  return { days, hours, minutes, seconds };
}

function Digit({ value, label, compact = false }: { value: number; label: string; compact?: boolean }) {
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
        key={value}
        initial={{ scale: 0.92, opacity: 0.55 }}
        animate={{ scale: label === 'שניות' ? [1, 1.09, 1] : 1, opacity: 1 }}
        transition={{ duration: label === 'שניות' ? 0.45 : 0.22 }}
        className={`${compact ? 'text-sm' : 'text-2xl sm:text-3xl'} font-black leading-none tabular-nums text-[var(--wc-gold,#D4AF37)] drop-shadow-[0_0_12px_rgba(212,175,55,.32)]`}
        dir="ltr"
      >
        {String(value).padStart(2, '0')}
      </motion.span>
      <span className={`${compact ? 'text-[8px]' : 'mt-1 text-[11px] sm:text-xs'} font-black leading-none text-white/86`}>{label}</span>
    </div>
  );
}

export default function WorldCupCountdown({ compact = false }: { compact?: boolean }) {
  const router = useRouter();
  const { activeMatch } = useWorldCup();
  const [diff, setDiff] = useState(() => getDiff());

  useEffect(() => {
    const interval = window.setInterval(() => setDiff(getDiff()), 1000);
    return () => window.clearInterval(interval);
  }, []);

  const label = useMemo(() => activeMatch ? 'מונדיאל LIVE' : 'מונדיאל 2026', [activeMatch]);

  return (
    <motion.button
      type="button"
      onClick={() => router.push('/world-cup')}
      whileHover={{ y: -3, scale: 1.015 }}
      whileTap={{ scale: 0.97, y: 0 }}
      className={`group relative isolate flex shrink-0 cursor-pointer overflow-hidden rounded-[1.5rem] border text-right backdrop-blur-2xl transition-all duration-200 hover:border-[#D4AF37]/60 ${
        compact
          ? 'min-h-16 max-w-[min(56vw,190px)] items-center gap-2 px-2 py-2 sm:max-w-none'
          : 'h-[148px] w-full max-w-full flex-col justify-between gap-3 p-4'
      }`}
      style={{
        borderColor: activeMatch ? 'color-mix(in srgb, var(--wc-gold, #D4AF37) 45%, transparent)' : 'rgba(255,255,255,.10)',
        background: 'rgba(2, 6, 23, .42)',
        boxShadow: activeMatch
          ? '0 0 28px var(--wc-gold-glow, rgba(212,175,55,.34)), 0 24px 64px rgba(0,0,0,.25)'
          : '0 14px 40px rgba(212,175,55,0.12), inset 0 1px 0 rgba(255,255,255,0.08)',
      }}
      title="מרכז מונדיאל 2026"
    >
      <span className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_18%_18%,rgba(212,175,55,0.20),transparent_42%)]" />
      <span className="pointer-events-none absolute inset-0 -translate-x-full skew-x-[-20deg] bg-gradient-to-r from-transparent via-white/[0.07] to-transparent transition-transform duration-700 ease-out group-hover:translate-x-full" />
      <span className={`${compact ? 'items-center' : 'items-start'} relative flex w-full justify-between gap-3`}>
        <span className="flex min-w-0 items-center gap-2">
          <span className={`${compact ? 'h-8 w-8' : 'h-11 w-11'} relative flex shrink-0 items-center justify-center rounded-full bg-[var(--wc-gold,#D4AF37)] text-[#002046]`}>
            <Trophy className={compact ? 'h-4 w-4' : 'h-5 w-5'} />
            <span className="absolute -left-0.5 -top-0.5 flex h-3 w-3">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-400 opacity-75" />
              <span className="relative inline-flex h-3 w-3 rounded-full bg-red-500 ring-2 ring-[#002046]" />
            </span>
          </span>
          <span className={compact ? 'hidden' : 'min-w-0 text-right'}>
            <span className="block text-xs font-black uppercase tracking-wide text-white/45">World Cup</span>
            <span className="block text-base font-black leading-tight text-white">{label}</span>
          </span>
        </span>
        {!compact && (
          <span className="shrink-0 flex items-center gap-1 rounded-full border border-[#D4AF37]/30 bg-[#D4AF37]/10 px-2.5 py-1 text-[11px] font-black text-[#D4AF37] transition-all duration-200 group-hover:bg-[#D4AF37]/20 group-hover:border-[#D4AF37]/50">
            כניסה
            <ChevronLeft className="h-3 w-3 transition-transform duration-200 group-hover:-translate-x-0.5" />
          </span>
        )}
      </span>
      <span className={`${compact ? 'relative flex flex-1 gap-1' : 'relative grid w-full grid-cols-4 gap-2'}`} dir="ltr">
        <Digit value={diff.days} label="ימים" compact={compact} />
        <Digit value={diff.hours} label="שעות" compact={compact} />
        <Digit value={diff.minutes} label="דקות" compact={compact} />
        <Digit value={diff.seconds} label="שניות" compact={compact} />
      </span>
    </motion.button>
  );
}
