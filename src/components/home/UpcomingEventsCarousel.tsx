'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { ChevronLeft, ChevronRight, MapPin, ExternalLink } from 'lucide-react';

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

const CARD_WIDTH = 280;
const CARD_GAP = 12;

const HEBREW_MONTHS = ['ינואר', 'פברואר', 'מרץ', 'אפריל', 'מאי', 'יוני', 'יולי', 'אוגוסט', 'ספטמבר', 'אוקטובר', 'נובמבר', 'דצמבר'];
const HEBREW_DAYS = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת'];

type CategoryStyle = { gradient: string; accent: string; dimAccent: string; icon: string; label: string };
const CAT_STYLES: Record<string, CategoryStyle> = {
  'פסטיבל': { gradient: 'from-amber-950 via-yellow-950 to-orange-950', accent: '#F59E0B', dimAccent: 'rgba(245,158,11,0.18)', icon: '🎬', label: 'פסטיבל' },
  'פרסים':  { gradient: 'from-orange-950 via-amber-950 to-yellow-950', accent: '#F97316', dimAccent: 'rgba(249,115,22,0.18)', icon: '🏆', label: 'פרסים' },
  'כנס':    { gradient: 'from-blue-950 via-indigo-950 to-blue-950',    accent: '#3B82F6', dimAccent: 'rgba(59,130,246,0.18)', icon: '🎤', label: 'כנס' },
  'הקרנה':  { gradient: 'from-purple-950 via-violet-950 to-purple-950', accent: '#8B5CF6', dimAccent: 'rgba(139,92,246,0.18)', icon: '🎭', label: 'הקרנה' },
  'מוזיקה': { gradient: 'from-pink-950 via-rose-950 to-pink-950',      accent: '#EC4899', dimAccent: 'rgba(236,72,153,0.18)', icon: '🎵', label: 'מוזיקה' },
  'סדנה':   { gradient: 'from-teal-950 via-cyan-950 to-teal-950',      accent: '#14B8A6', dimAccent: 'rgba(20,184,166,0.18)', icon: '📚', label: 'סדנה' },
  'תרבות':  { gradient: 'from-fuchsia-950 via-purple-950 to-fuchsia-950', accent: '#D946EF', dimAccent: 'rgba(217,70,239,0.18)', icon: '🎨', label: 'תרבות' },
};

function getCatStyle(category: string): CategoryStyle {
  return CAT_STYLES[category] ?? { gradient: 'from-slate-900 via-gray-950 to-slate-900', accent: '#6366F1', dimAccent: 'rgba(99,102,241,0.18)', icon: '📅', label: category };
}

function daysUntil(dateStr: string): number | null {
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  d.setHours(0, 0, 0, 0);
  return Math.round((d.getTime() - today.getTime()) / 86_400_000);
}

function DaysUntilBadge({ days, accent }: { days: number; accent: string }) {
  if (days < 0) return null;
  const label = days === 0 ? 'היום!' : days === 1 ? 'מחר' : `${days} ימים`;
  return (
    <span
      className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-black tracking-wide"
      style={{ background: `${accent}30`, color: accent, border: `1px solid ${accent}55` }}
    >
      {label}
    </span>
  );
}

export default function UpcomingEventsCarousel({ events }: { events: UpcomingEventItem[] }) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(true);

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

  const scroll = (direction: 'prev' | 'next') => {
    scrollRef.current?.scrollBy({
      left: direction === 'next' ? CARD_WIDTH + CARD_GAP : -(CARD_WIDTH + CARD_GAP),
      behavior: 'smooth',
    });
  };

  if (!events.length) {
    return (
      <div className="rounded-xl border p-4 text-sm" style={{ background: 'var(--theme-bg-card)', borderColor: 'var(--theme-border)', color: 'var(--theme-text-secondary)' }}>
        אין אירועים עתידיים זמינים כרגע.
      </div>
    );
  }

  return (
    <div className="relative">
      {canScrollRight && (
        <button
          onClick={() => scroll('next')}
          className="absolute right-0 top-1/2 z-10 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full shadow-lg transition-all hover:scale-110"
          style={{ background: 'var(--theme-bg-card)', border: '1px solid var(--theme-border)' }}
          aria-label="הבא"
        >
          <ChevronRight className="h-4 w-4" style={{ color: 'var(--theme-text)' }} />
        </button>
      )}
      {canScrollLeft && (
        <button
          onClick={() => scroll('prev')}
          className="absolute left-0 top-1/2 z-10 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full shadow-lg transition-all hover:scale-110"
          style={{ background: 'var(--theme-bg-card)', border: '1px solid var(--theme-border)' }}
          aria-label="הקודם"
        >
          <ChevronLeft className="h-4 w-4" style={{ color: 'var(--theme-text)' }} />
        </button>
      )}

      <div
        ref={scrollRef}
        dir="ltr"
        className="flex gap-3 overflow-x-auto px-1 pb-2 pt-0.5"
        style={{ scrollbarWidth: 'none', scrollSnapType: 'x mandatory', msOverflowStyle: 'none' }}
      >
        {events.map((event) => {
          const date = new Date(event.date);
          const valid = !Number.isNaN(date.getTime());
          const day = valid ? date.getDate() : '--';
          const month = valid ? HEBREW_MONTHS[date.getMonth()] : '';
          const dayName = valid ? `יום ${HEBREW_DAYS[date.getDay()]}` : '';
          const days = valid ? daysUntil(event.date) : null;
          const style = getCatStyle(event.category);

          return (
            <Link
              key={event.id || `${event.title}-${event.date}`}
              href={event.sourceUrl || '/news'}
              target={event.sourceUrl ? '_blank' : undefined}
              rel={event.sourceUrl ? 'noopener noreferrer' : undefined}
              className="group relative block shrink-0 overflow-hidden rounded-2xl transition-all duration-300 hover:-translate-y-1 hover:shadow-2xl"
              style={{
                width: CARD_WIDTH,
                scrollSnapAlign: 'start',
                boxShadow: `0 4px 24px rgba(0,0,0,0.35), 0 0 0 1px rgba(255,255,255,0.05)`,
              }}
            >
              {/* Card background */}
              <div
                className={`absolute inset-0 bg-gradient-to-br ${style.gradient}`}
                style={{ opacity: 0.97 }}
              />

              {/* Image overlay (if available) */}
              {event.imageUrl && (
                <div
                  className="absolute inset-0 bg-cover bg-center opacity-20 transition-opacity duration-300 group-hover:opacity-30"
                  style={{ backgroundImage: `url(${event.imageUrl})` }}
                />
              )}

              {/* Gradient vignette */}
              <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-black/20" />

              {/* Accent glow */}
              <div
                className="pointer-events-none absolute inset-0 rounded-2xl opacity-0 transition-opacity duration-300 group-hover:opacity-100"
                style={{ boxShadow: `inset 0 0 0 1.5px ${style.accent}55` }}
              />

              {/* Content */}
              <div className="relative flex h-[210px] flex-col p-4 text-right">
                {/* Top row: date block + days badge */}
                <div className="mb-3 flex items-start justify-between gap-2">
                  {/* Date */}
                  <div
                    className="shrink-0 rounded-xl px-2.5 py-2 text-center"
                    style={{ background: `${style.accent}22`, border: `1px solid ${style.accent}40` }}
                  >
                    <div className="text-xl font-black leading-none" style={{ color: style.accent }}>{day}</div>
                    <div className="mt-0.5 text-[9px] font-bold uppercase tracking-wider" style={{ color: style.accent, opacity: 0.8 }}>{month}</div>
                  </div>

                  {/* Right side: category + days */}
                  <div className="flex min-w-0 flex-1 flex-col items-end gap-1.5">
                    <span
                      className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-bold"
                      style={{ background: `${style.accent}22`, color: style.accent }}
                    >
                      <span className="text-sm leading-none">{style.icon}</span>
                      {event.category}
                    </span>
                    {days !== null && <DaysUntilBadge days={days} accent={style.accent} />}
                    {dayName && (
                      <span className="text-[9px] font-medium text-white/40">{dayName}</span>
                    )}
                  </div>
                </div>

                {/* Title */}
                <h3 className="mb-1.5 line-clamp-2 text-sm font-black leading-snug text-white/95 transition-colors group-hover:text-white">
                  {event.title}
                </h3>

                {/* Description */}
                <p className="line-clamp-2 text-[11px] leading-relaxed text-white/50">
                  {event.description || 'אירוע מקצועי לתעשיית הטלוויזיה והמדיה.'}
                </p>

                {/* Footer */}
                <div className="mt-auto flex items-center justify-between gap-2 pt-2">
                  <div className="flex items-center gap-1 text-[10px] text-white/40 truncate">
                    <MapPin className="h-2.5 w-2.5 shrink-0" />
                    <span className="truncate">{event.location}</span>
                  </div>
                  <ExternalLink
                    className="h-3 w-3 shrink-0 text-white/25 transition-colors group-hover:text-white/60"
                  />
                </div>
              </div>
            </Link>
          );
        })}
      </div>

      {/* Dot indicators */}
      {events.length > 1 && (
        <div className="mt-3 flex justify-center gap-1.5">
          {events.map((event, index) => (
            <button
              key={event.id || index}
              onClick={() => {
                scrollRef.current?.scrollTo({ left: index * (CARD_WIDTH + CARD_GAP), behavior: 'smooth' });
              }}
              className="rounded-full transition-all duration-300"
              style={{
                width: index === activeIndex ? '20px' : '6px',
                height: '6px',
                background: index === activeIndex
                  ? getCatStyle(events[index]?.category ?? '').accent
                  : 'var(--theme-border)',
                opacity: index === activeIndex ? 1 : 0.4,
              }}
              aria-label={`עבור לאירוע ${index + 1}`}
            />
          ))}
        </div>
      )}
    </div>
  );
}
