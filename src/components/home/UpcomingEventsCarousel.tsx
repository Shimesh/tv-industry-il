'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { motion, AnimatePresence } from 'framer-motion';
import { CalendarDays, ChevronLeft, ChevronRight, Clock, ExternalLink, MapPin, Sparkles, Ticket } from 'lucide-react';

export interface UpcomingEventItem {
  id?: string;
  title: string;
  date: string;
  time?: string | null;
  location: string;
  source: string;
  sourceUrl: string;
  category: string;
  description?: string;
  imageUrl?: string | null;
}

const CARD_WIDTH = 320;
const CARD_GAP = 14;

const HEBREW_MONTHS = ['ינואר', 'פברואר', 'מרץ', 'אפריל', 'מאי', 'יוני', 'יולי', 'אוגוסט', 'ספטמבר', 'אוקטובר', 'נובמבר', 'דצמבר'];
const HEBREW_DAYS = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת'];

type CatStyle = {
  bg: string;
  bgVivid: string;
  accent: string;
  glow: string;
  icon: string;
  label: string;
  pattern: string;
};

const CAT_STYLES: Record<string, CatStyle> = {
  'פסטיבל': {
    bg: 'linear-gradient(135deg,#7c2d12 0%,#431407 50%,#1c0a03 100%)',
    bgVivid: 'linear-gradient(135deg,#ea580c,#b45309,#7c2d12)',
    accent: '#fb923c',
    glow: 'rgba(251,146,60,0.35)',
    icon: '🎬',
    label: 'פסטיבל',
    pattern: 'M10 10 L20 0 L30 10 L20 20Z',
  },
  'פרסים': {
    bg: 'linear-gradient(135deg,#713f12 0%,#3b1c05 50%,#0c0500 100%)',
    bgVivid: 'linear-gradient(135deg,#d97706,#92400e,#451a03)',
    accent: '#fbbf24',
    glow: 'rgba(251,191,36,0.4)',
    icon: '🏆',
    label: 'פרסים',
    pattern: 'M15 5 L18 12 L25 12 L19 17 L21 24 L15 20 L9 24 L11 17 L5 12 L12 12Z',
  },
  'כנס': {
    bg: 'linear-gradient(135deg,#1e3a5f 0%,#0f1f3d 50%,#050d1a 100%)',
    bgVivid: 'linear-gradient(135deg,#3b82f6,#1d4ed8,#1e3a5f)',
    accent: '#60a5fa',
    glow: 'rgba(96,165,250,0.3)',
    icon: '🎤',
    label: 'כנס',
    pattern: 'M5 20 L15 5 L25 20Z',
  },
  'הקרנה': {
    bg: 'linear-gradient(135deg,#2e1065 0%,#1a0040 50%,#080015 100%)',
    bgVivid: 'linear-gradient(135deg,#7c3aed,#5b21b6,#2e1065)',
    accent: '#a78bfa',
    glow: 'rgba(167,139,250,0.35)',
    icon: '🎭',
    label: 'הקרנה',
    pattern: 'M5 5 L25 15 L5 25Z',
  },
  'מוזיקה': {
    bg: 'linear-gradient(135deg,#500724 0%,#2d0a14 50%,#0a0005 100%)',
    bgVivid: 'linear-gradient(135deg,#ec4899,#be185d,#500724)',
    accent: '#f472b6',
    glow: 'rgba(244,114,182,0.35)',
    icon: '🎵',
    label: 'מוזיקה',
    pattern: 'M15 5 A10 10 0 1 0 15.01 5Z',
  },
  'סדנה': {
    bg: 'linear-gradient(135deg,#042f2e 0%,#011a18 50%,#000808 100%)',
    bgVivid: 'linear-gradient(135deg,#0d9488,#0f766e,#042f2e)',
    accent: '#2dd4bf',
    glow: 'rgba(45,212,191,0.3)',
    icon: '📚',
    label: 'סדנה',
    pattern: 'M5 5 H25 V25 H5Z',
  },
  'תרבות': {
    bg: 'linear-gradient(135deg,#4a044e 0%,#2d0230 50%,#0d000f 100%)',
    bgVivid: 'linear-gradient(135deg,#c026d3,#86198f,#4a044e)',
    accent: '#e879f9',
    glow: 'rgba(232,121,249,0.35)',
    icon: '🎨',
    label: 'תרבות',
    pattern: 'M15 3 L27 21 L3 21Z',
  },
};

function getCatStyle(cat: string): CatStyle {
  return CAT_STYLES[cat] ?? {
    bg: 'linear-gradient(135deg,#1e293b 0%,#0f172a 50%,#020617 100%)',
    bgVivid: 'linear-gradient(135deg,#6366f1,#4338ca,#1e1b4b)',
    accent: '#818cf8',
    glow: 'rgba(129,140,248,0.3)',
    icon: '📅',
    label: cat,
    pattern: 'M15 3 L27 21 L3 21Z',
  };
}

function daysUntil(dateStr: string): number | null {
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return null;
  const today = new Date(); today.setHours(0, 0, 0, 0);
  d.setHours(0, 0, 0, 0);
  return Math.round((d.getTime() - today.getTime()) / 86_400_000);
}

function CountdownBadge({ days, accent }: { days: number; accent: string }) {
  if (days < 0) return null;
  const urgent = days <= 7;
  const label = days === 0 ? '🔴 היום!' : days === 1 ? '🟠 מחר' : `${days} ימים`;
  return (
    <motion.span
      animate={urgent ? { scale: [1, 1.05, 1] } : {}}
      transition={{ duration: 1.5, repeat: Infinity }}
      className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-black tracking-wide shadow-lg"
      style={{
        background: urgent ? `${accent}` : `${accent}25`,
        color: urgent ? '#000' : accent,
        boxShadow: urgent ? `0 0 12px ${accent}80` : 'none',
      }}
    >
      {label}
    </motion.span>
  );
}

/* Decorative SVG pattern for cards without images */
function CategoryArt({ style }: { style: CatStyle }) {
  return (
    <div className="absolute inset-0 overflow-hidden opacity-[0.07]">
      {[...Array(12)].map((_, i) => (
        <svg
          key={i}
          viewBox="0 0 30 30"
          className="absolute"
          style={{
            width: `${40 + (i % 3) * 20}px`,
            height: `${40 + (i % 3) * 20}px`,
            top: `${(i * 23) % 110 - 10}%`,
            left: `${(i * 31) % 110 - 10}%`,
            opacity: 0.4 + (i % 4) * 0.1,
            transform: `rotate(${i * 17}deg)`,
          }}
        >
          <path d={style.pattern} fill={style.accent} />
        </svg>
      ))}
    </div>
  );
}

export default function UpcomingEventsCarousel({ events }: { events: UpcomingEventItem[] }) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(true);
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);

  const updateScrollState = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    setCanScrollLeft(el.scrollLeft > 8);
    setCanScrollRight(el.scrollLeft < el.scrollWidth - el.clientWidth - 8);
    const idx = Math.round(el.scrollLeft / (CARD_WIDTH + CARD_GAP));
    setActiveIndex(Math.max(0, Math.min(idx, events.length - 1)));
  }, [events.length]);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.addEventListener('scroll', updateScrollState, { passive: true });
    updateScrollState();
    return () => el.removeEventListener('scroll', updateScrollState);
  }, [updateScrollState]);

  const scroll = (dir: 'prev' | 'next') => {
    scrollRef.current?.scrollBy({
      left: dir === 'next' ? CARD_WIDTH + CARD_GAP : -(CARD_WIDTH + CARD_GAP),
      behavior: 'smooth',
    });
  };

  if (!events.length) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-2xl border p-8 text-center"
        style={{ background: 'var(--theme-bg-card)', borderColor: 'var(--theme-border)' }}>
        <CalendarDays className="h-8 w-8 opacity-30" style={{ color: 'var(--theme-text-secondary)' }} />
        <p className="text-sm" style={{ color: 'var(--theme-text-secondary)' }}>אין אירועים עתידיים זמינים כרגע.</p>
        <Link href="/news?tab=events" className="mt-1 rounded-full bg-indigo-500/15 px-4 py-1.5 text-xs font-bold text-indigo-400 hover:bg-indigo-500/25 transition-colors">
          לדף האירועים ←
        </Link>
      </div>
    );
  }

  return (
    <div className="relative">
      {/* Scroll buttons */}
      <AnimatePresence>
        {canScrollRight && (
          <motion.button
            key="right"
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.8 }}
            onClick={() => scroll('next')}
            className="absolute -right-3 top-1/2 z-20 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full shadow-xl transition-all hover:scale-110"
            style={{ background: 'var(--theme-bg-card)', border: '1px solid var(--theme-border)' }}
          >
            <ChevronRight className="h-5 w-5" style={{ color: 'var(--theme-text)' }} />
          </motion.button>
        )}
        {canScrollLeft && (
          <motion.button
            key="left"
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.8 }}
            onClick={() => scroll('prev')}
            className="absolute -left-3 top-1/2 z-20 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full shadow-xl transition-all hover:scale-110"
            style={{ background: 'var(--theme-bg-card)', border: '1px solid var(--theme-border)' }}
          >
            <ChevronLeft className="h-5 w-5" style={{ color: 'var(--theme-text)' }} />
          </motion.button>
        )}
      </AnimatePresence>

      <div
        ref={scrollRef}
        dir="ltr"
        className="flex gap-3.5 overflow-x-auto pb-3 pt-1 px-0.5"
        style={{ scrollbarWidth: 'none', scrollSnapType: 'x mandatory', msOverflowStyle: 'none' }}
      >
        {events.map((event, idx) => {
          const date = new Date(event.date);
          const valid = !Number.isNaN(date.getTime());
          const day = valid ? date.getDate() : '--';
          const month = valid ? HEBREW_MONTHS[date.getMonth()] : '';
          const dayName = valid ? `יום ${HEBREW_DAYS[date.getDay()]}` : '';
          const days = valid ? daysUntil(event.date) : null;
          const style = getCatStyle(event.category);
          const hasImage = Boolean(event.imageUrl);
          const isHovered = hoveredIndex === idx;

          return (
            <motion.div
              key={event.id || `${event.title}-${event.date}`}
              layout
              whileHover={{ y: -6, scale: 1.01 }}
              transition={{ type: 'spring', stiffness: 300, damping: 20 }}
              onHoverStart={() => setHoveredIndex(idx)}
              onHoverEnd={() => setHoveredIndex(null)}
              className="shrink-0 cursor-pointer overflow-hidden rounded-2xl"
              style={{
                width: CARD_WIDTH,
                scrollSnapAlign: 'start',
                boxShadow: isHovered
                  ? `0 20px 60px rgba(0,0,0,0.5), 0 0 0 1.5px ${style.accent}60, 0 0 40px ${style.glow}`
                  : '0 4px 24px rgba(0,0,0,0.4), 0 0 0 1px rgba(255,255,255,0.05)',
              }}
            >
              <Link
                href={event.sourceUrl || '/news?tab=events'}
                target={event.sourceUrl ? '_blank' : undefined}
                rel={event.sourceUrl ? 'noopener noreferrer' : undefined}
                className="group relative block h-[290px]"
              >
                {/* Base background */}
                <div className="absolute inset-0" style={{ background: style.bg }} />

                {/* Vivid color strip at top */}
                <div
                  className="absolute inset-x-0 top-0 h-1"
                  style={{ background: style.bgVivid, opacity: 0.9 }}
                />

                {/* Decorative pattern (no image) */}
                {!hasImage && <CategoryArt style={style} />}

                {/* Image overlay */}
                {hasImage && (
                  <>
                    <div
                      className="absolute inset-0 bg-cover bg-center transition-all duration-700"
                      style={{
                        backgroundImage: `url(${event.imageUrl})`,
                        opacity: isHovered ? 0.45 : 0.3,
                        transform: isHovered ? 'scale(1.06)' : 'scale(1)',
                      }}
                    />
                    {/* Color tint overlay */}
                    <div
                      className="absolute inset-0 opacity-60"
                      style={{ background: `linear-gradient(135deg,${style.bg})` }}
                    />
                  </>
                )}

                {/* Bottom gradient vignette */}
                <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/20 to-transparent" />

                {/* Top ambient glow */}
                <div
                  className="absolute inset-x-0 top-0 h-32 opacity-20 transition-opacity duration-300 group-hover:opacity-35"
                  style={{ background: `radial-gradient(ellipse at 50% 0%, ${style.accent}, transparent 70%)` }}
                />

                {/* Content */}
                <div className="relative flex h-full flex-col p-4 text-right">

                  {/* Top row */}
                  <div className="flex items-start justify-between gap-2">
                    {/* Date block */}
                    <div
                      className="shrink-0 min-w-[52px] rounded-2xl px-2.5 py-2.5 text-center backdrop-blur-sm"
                      style={{
                        background: `${style.accent}20`,
                        border: `1.5px solid ${style.accent}45`,
                        boxShadow: `0 4px 16px ${style.glow}`,
                      }}
                    >
                      <div className="text-2xl font-black leading-none tabular-nums" style={{ color: style.accent }}>
                        {day}
                      </div>
                      <div className="mt-0.5 text-[9px] font-black uppercase tracking-widest" style={{ color: style.accent, opacity: 0.85 }}>
                        {month}
                      </div>
                    </div>

                    {/* Right badges */}
                    <div className="flex min-w-0 flex-1 flex-col items-end gap-1.5">
                      {/* Category pill */}
                      <span
                        className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-black backdrop-blur-sm"
                        style={{
                          background: `${style.accent}22`,
                          color: style.accent,
                          border: `1px solid ${style.accent}35`,
                        }}
                      >
                        <span className="text-sm leading-none">{style.icon}</span>
                        {event.category}
                      </span>
                      {days !== null && <CountdownBadge days={days} accent={style.accent} />}
                      {dayName && (
                        <span className="text-[9px] font-medium text-white/35">{dayName}</span>
                      )}
                    </div>
                  </div>

                  {/* Spacer */}
                  <div className="flex-1" />

                  {/* Title */}
                  <h3
                    className="mb-1.5 line-clamp-2 text-base font-black leading-snug transition-colors duration-200"
                    style={{ color: isHovered ? style.accent : 'rgba(255,255,255,0.96)' }}
                  >
                    {event.title}
                  </h3>

                  {/* Description */}
                  <p className="mb-3 line-clamp-2 text-[11.5px] leading-relaxed text-white/50">
                    {event.description || 'אירוע מקצועי לתעשיית הטלוויזיה, מדיה ותוכן.'}
                  </p>

                  {/* Footer */}
                  <div
                    className="flex items-center justify-between gap-2 rounded-xl px-3 py-2 backdrop-blur-sm"
                    style={{ background: 'rgba(0,0,0,0.35)', border: '1px solid rgba(255,255,255,0.07)' }}
                  >
                    <div className="flex items-center gap-1.5 text-[10px] text-white/45 min-w-0">
                      <MapPin className="h-3 w-3 shrink-0" style={{ color: style.accent, opacity: 0.7 }} />
                      <span className="truncate font-medium">{event.location}</span>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      {event.time && (
                        <div className="flex items-center gap-1 text-[10px] text-white/40">
                          <Clock className="h-2.5 w-2.5 shrink-0" />
                          <span>{event.time}</span>
                        </div>
                      )}
                      <div
                        className="flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold transition-all duration-200"
                        style={{
                          background: isHovered ? style.accent : `${style.accent}18`,
                          color: isHovered ? '#000' : style.accent,
                        }}
                      >
                        <ExternalLink className="h-2.5 w-2.5" />
                        <span>פתח</span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Source label */}
                <div
                  className="absolute left-3 top-3 rounded-full px-2 py-0.5 text-[9px] font-bold text-white/35 backdrop-blur-sm"
                  style={{ background: 'rgba(0,0,0,0.4)' }}
                >
                  {event.source}
                </div>
              </Link>
            </motion.div>
          );
        })}

        {/* "See all" card */}
        <Link
          href="/news?tab=events"
          className="group shrink-0 flex flex-col items-center justify-center gap-3 overflow-hidden rounded-2xl border transition-all hover:-translate-y-1 hover:shadow-2xl"
          style={{
            width: 160,
            height: 290,
            scrollSnapAlign: 'start',
            background: 'var(--theme-bg-card)',
            borderColor: 'var(--theme-border)',
          }}
        >
          <div
            className="flex h-12 w-12 items-center justify-center rounded-full transition-transform group-hover:scale-110"
            style={{ background: 'linear-gradient(135deg,#6366f1,#8b5cf6)' }}
          >
            <Ticket className="h-6 w-6 text-white" />
          </div>
          <div className="text-center px-3">
            <p className="text-xs font-black" style={{ color: 'var(--theme-text)' }}>כל האירועים</p>
            <p className="mt-0.5 text-[10px]" style={{ color: 'var(--theme-text-secondary)' }}>
              {events.length}+ אירועים קרובים
            </p>
          </div>
          <Sparkles className="h-4 w-4 opacity-30" style={{ color: 'var(--theme-accent)' }} />
        </Link>
      </div>

      {/* Dot indicators */}
      {events.length > 1 && (
        <div className="mt-3 flex justify-center gap-1.5">
          {events.map((event, index) => {
            const catAccent = getCatStyle(event.category).accent;
            return (
              <motion.button
                key={event.id || index}
                animate={{
                  width: index === activeIndex ? 20 : 6,
                  opacity: index === activeIndex ? 1 : 0.3,
                }}
                transition={{ duration: 0.25 }}
                onClick={() => scrollRef.current?.scrollTo({ left: index * (CARD_WIDTH + CARD_GAP), behavior: 'smooth' })}
                className="rounded-full"
                style={{
                  height: 6,
                  background: index === activeIndex ? catAccent : 'var(--theme-border)',
                  boxShadow: index === activeIndex ? `0 0 8px ${catAccent}80` : 'none',
                }}
                aria-label={`עבור לאירוע ${index + 1}`}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}
