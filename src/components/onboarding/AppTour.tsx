'use client';

import { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  Tv,
  Users,
  Radio,
  Megaphone,
  MessageCircle,
  UsersRound,
  CalendarDays,
  CheckCircle2,
} from 'lucide-react';

export type AppTourProps = {
  onComplete: () => void;
};

const variants = {
  enter: (dir: number) => ({
    x: dir > 0 ? 60 : -60,
    opacity: 0,
  }),
  center: {
    x: 0,
    opacity: 1,
  },
  exit: (dir: number) => ({
    x: dir > 0 ? -60 : 60,
    opacity: 0,
  }),
};

const features = [
  { icon: Users, color: '#f59e0b', label: 'אלפון מקצועי', desc: 'מצא אנשי מקצוע' },
  { icon: Radio, color: '#ef4444', label: 'שידור חי', desc: 'ערוצי טלוויזיה' },
  { icon: Megaphone, color: '#38bdf8', label: 'לוח מודעות', desc: 'הזדמנויות עבודה' },
  { icon: MessageCircle, color: '#ec4899', label: "צ'אט", desc: 'תקשורת ישירה' },
  { icon: UsersRound, color: '#34d399', label: 'צוותים', desc: 'ניהול הפקה' },
  { icon: CalendarDays, color: '#a78bfa', label: 'יומן', desc: 'פרויקטים שלך' },
];

function Slide0() {
  return (
    <div className="flex flex-col items-center text-center gap-4">
      <div
        className="w-16 h-16 rounded-2xl flex items-center justify-center"
        style={{ background: 'linear-gradient(135deg, #a855f7, #3b82f6)' }}
      >
        <Tv className="w-8 h-8 text-white" />
      </div>
      <div className="space-y-1">
        <h2 className="gradient-text text-2xl font-black" dir="ltr">
          TV Industry IL
        </h2>
        <p className="text-base font-semibold" style={{ color: 'var(--theme-text)' }}>
          פלטפורמת תעשיית הטלוויזיה הישראלית
        </p>
      </div>
      <p className="text-sm leading-relaxed" style={{ color: 'var(--theme-text-secondary)' }}>
        כל מה שצריך לאנשי תעשייה — במקום אחד. אלפון מקצועי, שידורים חיים, לוח מודעות, צ&apos;אט, כלי הפקה ועוד.
      </p>
    </div>
  );
}

function Slide1() {
  return (
    <div className="flex flex-col gap-4">
      <h2 className="text-lg font-black text-center" style={{ color: 'var(--theme-text)' }}>
        מה תמצא כאן?
      </h2>
      <div className="grid grid-cols-3 gap-2">
        {features.map(({ icon: Icon, color, label, desc }) => (
          <div
            key={label}
            className="rounded-xl p-3 flex flex-col items-center gap-1"
            style={{ background: 'var(--theme-bg-secondary)' }}
          >
            <Icon style={{ color }} className="w-5 h-5 shrink-0" />
            <span className="text-xs font-bold leading-tight text-center" style={{ color: 'var(--theme-text)' }}>
              {label}
            </span>
            <span className="text-[10px] leading-tight text-center" style={{ color: 'var(--theme-text-secondary)' }}>
              {desc}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function Slide2({ onComplete }: { onComplete: () => void }) {
  return (
    <div className="flex flex-col items-center text-center gap-4">
      <CheckCircle2 className="w-16 h-16" style={{ color: '#4ade80' }} />
      <div className="space-y-1">
        <h2 className="gradient-text text-2xl font-black">מוכן להתחיל?</h2>
        <p className="text-sm leading-relaxed" style={{ color: 'var(--theme-text-secondary)' }}>
          הפרופיל שלך כבר מוגדר. גלה את כל מה שהפלטפורמה מציעה לך.
        </p>
      </div>
      <button
        onClick={onComplete}
        className="w-full rounded-xl px-4 py-3 text-base font-black text-white transition-opacity hover:opacity-90 active:opacity-80"
        style={{ background: 'linear-gradient(135deg, #a855f7, #3b82f6)' }}
      >
        בואו נתחיל 🚀
      </button>
    </div>
  );
}

export default function AppTour({ onComplete }: AppTourProps) {
  const [slide, setSlide] = useState(0);
  const [direction, setDirection] = useState(1);

  const goNext = () => {
    if (slide === 2) {
      onComplete();
      return;
    }
    setDirection(1);
    setSlide((s) => s + 1);
  };

  const totalSlides = 3;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-md"
      role="dialog"
      aria-modal="true"
      dir="rtl"
    >
      <div
        className="relative w-full max-w-sm rounded-2xl overflow-hidden"
        style={{
          background: 'var(--theme-bg-card)',
          border: '1px solid var(--theme-border)',
        }}
      >
        {/* Skip button */}
        <button
          onClick={onComplete}
          className="absolute top-3 left-4 text-xs transition-opacity hover:opacity-100 opacity-50 z-10"
          style={{ color: 'var(--theme-text-secondary)' }}
        >
          דלג
        </button>

        {/* Slide content */}
        <div className="px-6 pt-10 pb-6 min-h-[280px] flex items-center justify-center overflow-hidden">
          <AnimatePresence mode="wait" custom={direction}>
            <motion.div
              key={slide}
              custom={direction}
              variants={variants}
              initial="enter"
              animate="center"
              exit="exit"
              transition={{ duration: 0.28, ease: 'easeInOut' }}
              className="w-full"
            >
              {slide === 0 && <Slide0 />}
              {slide === 1 && <Slide1 />}
              {slide === 2 && <Slide2 onComplete={onComplete} />}
            </motion.div>
          </AnimatePresence>
        </div>

        {/* Footer: dots + next button */}
        <div className="px-6 pb-6 flex items-center justify-between">
          {/* Progress dots */}
          <div className="flex gap-1.5">
            {Array.from({ length: totalSlides }).map((_, i) => (
              <span
                key={i}
                className="w-2 h-2 rounded-full transition-colors"
                style={{
                  background: i === slide ? 'var(--theme-accent)' : 'var(--theme-border)',
                }}
              />
            ))}
          </div>

          {/* Next / finish button — hidden on last slide (CTA is inline) */}
          {slide < 2 && (
            <button
              onClick={goNext}
              className="rounded-xl px-4 py-2 text-sm font-bold text-white transition-opacity hover:opacity-90"
              style={{ background: 'linear-gradient(135deg, #a855f7, #3b82f6)' }}
            >
              {slide === 1 ? 'בואו נתחיל' : 'הבא'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
