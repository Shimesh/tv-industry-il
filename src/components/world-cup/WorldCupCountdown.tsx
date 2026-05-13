'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { Trophy } from 'lucide-react';
import { WORLD_CUP_START_ISO } from '@/lib/world-cup/static-data';
import { useWorldCup } from '@/contexts/WorldCupContext';

function getDiff() {
  const diffMs = Math.max(0, Date.parse(WORLD_CUP_START_ISO) - Date.now());
  const days = Math.floor(diffMs / 86_400_000);
  const hours = Math.floor((diffMs % 86_400_000) / 3_600_000);
  const minutes = Math.floor((diffMs % 3_600_000) / 60_000);
  return { days, hours, minutes };
}

function Digit({ value, label }: { value: number; label: string }) {
  return (
    <div className="flex min-w-9 flex-col items-center rounded-lg border px-1.5 py-1 leading-none" style={{ borderColor: 'color-mix(in srgb, var(--wc-gold, #D4AF37) 36%, transparent)', background: 'color-mix(in srgb, var(--wc-deep-blue, #002046) 72%, transparent)' }}>
      <motion.span
        key={value}
        initial={{ y: -8, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        className="text-xs font-black tabular-nums text-[var(--wc-gold,#D4AF37)]"
        dir="ltr"
      >
        {String(value).padStart(2, '0')}
      </motion.span>
      <span className="mt-0.5 text-[8px] font-bold text-white/58">{label}</span>
    </div>
  );
}

export default function WorldCupCountdown({ compact = false }: { compact?: boolean }) {
  const router = useRouter();
  const { activeMatch } = useWorldCup();
  const [diff, setDiff] = useState(() => getDiff());

  useEffect(() => {
    const interval = window.setInterval(() => setDiff(getDiff()), 30_000);
    return () => window.clearInterval(interval);
  }, []);

  const label = useMemo(() => activeMatch ? 'מונדיאל LIVE' : 'מונדיאל 2026', [activeMatch]);

  return (
    <motion.button
      type="button"
      onClick={() => router.push('/world-cup')}
      whileHover={{ y: -1 }}
      whileTap={{ scale: 0.97 }}
      className={`group hidden items-center gap-2 rounded-xl border px-2 py-1.5 text-right shadow-lg transition-all md:flex ${compact ? 'scale-95' : ''}`}
      style={{
        borderColor: 'color-mix(in srgb, var(--wc-gold, #D4AF37) 42%, transparent)',
        background: 'linear-gradient(135deg, color-mix(in srgb, var(--wc-deep-blue, #002046) 92%, transparent), color-mix(in srgb, var(--wc-stadium-green, #138a36) 28%, transparent))',
        boxShadow: activeMatch ? '0 0 28px var(--wc-gold-glow, rgba(212,175,55,.34))' : '0 10px 28px rgba(0,0,0,.20)',
      }}
      title="מרכז מונדיאל 2026"
    >
      <motion.span
        animate={{ scale: activeMatch ? [1, 1.12, 1] : [1, 1.05, 1] }}
        transition={{ duration: activeMatch ? 1 : 2.5, repeat: Infinity }}
        className="flex h-8 w-8 items-center justify-center rounded-lg bg-[var(--wc-gold,#D4AF37)] text-[#002046]"
      >
        <Trophy className="h-4 w-4" />
      </motion.span>
      <span className="hidden flex-col lg:flex">
        <span className="text-[10px] font-black text-white">{label}</span>
        <span className="text-[9px] text-white/55">כניסה מהירה למרכז המשחקים</span>
      </span>
      <span className="flex gap-1" dir="rtl">
        <Digit value={diff.days} label="ימים" />
        <Digit value={diff.hours} label="ש׳" />
        <Digit value={diff.minutes} label="ד׳" />
      </span>
    </motion.button>
  );
}
