'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { CalendarDays, ChevronLeft, ChevronRight, ExternalLink, MapPin } from 'lucide-react';

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
}

const CARD_WIDTH = 300;
const CARD_GAP = 12;

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
      left: direction === 'next' ? -(CARD_WIDTH + CARD_GAP) : CARD_WIDTH + CARD_GAP,
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
      {canScrollLeft && (
        <button
          onClick={() => scroll('prev')}
          className="absolute right-0 top-1/2 z-10 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full opacity-85 shadow-lg transition-opacity hover:opacity-100"
          style={{ background: 'var(--theme-bg-card)', border: '1px solid var(--theme-border)' }}
          aria-label="הקודם"
        >
          <ChevronRight className="h-5 w-5" style={{ color: 'var(--theme-text)' }} />
        </button>
      )}

      {canScrollRight && (
        <button
          onClick={() => scroll('next')}
          className="absolute left-0 top-1/2 z-10 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full opacity-85 shadow-lg transition-opacity hover:opacity-100"
          style={{ background: 'var(--theme-bg-card)', border: '1px solid var(--theme-border)' }}
          aria-label="הבא"
        >
          <ChevronLeft className="h-5 w-5" style={{ color: 'var(--theme-text)' }} />
        </button>
      )}

      <div
        ref={scrollRef}
        dir="ltr"
        className="flex gap-3 overflow-x-auto px-1 pb-2"
        style={{ scrollbarWidth: 'none', scrollSnapType: 'x mandatory', msOverflowStyle: 'none' }}
      >
        {events.map((event) => {
          const date = new Date(event.date);
          const day = Number.isNaN(date.getTime()) ? '--' : date.getDate();
          const month = Number.isNaN(date.getTime()) ? '' : date.toLocaleDateString('he-IL', { month: 'short' });

          return (
            <Link
              key={event.id || `${event.title}-${event.date}`}
              href={event.sourceUrl || '/news'}
              target={event.sourceUrl ? '_blank' : undefined}
              rel={event.sourceUrl ? 'noopener noreferrer' : undefined}
              className="group block h-52 w-[300px] shrink-0 rounded-xl border p-4 transition-all duration-200 hover:shadow-md"
              style={{ background: 'var(--theme-bg-card)', borderColor: 'var(--theme-border)', scrollSnapAlign: 'start' }}
            >
              <div className="flex h-full flex-col text-right">
                <div className="mb-3 flex items-start gap-3">
                  <div className="min-w-[52px] shrink-0 rounded-xl border border-blue-400/20 bg-blue-500/10 p-2 text-center">
                    <div className="text-2xl font-black leading-none text-blue-400">{day}</div>
                    <div className="mt-1 text-[10px] text-blue-300">{month}</div>
                  </div>
                  <div className="min-w-0 flex-1">
                    <span className="inline-flex items-center gap-1 rounded-full bg-blue-500/15 px-2 py-0.5 text-[10px] font-bold text-blue-300">
                      <CalendarDays className="h-3 w-3" />
                      {event.category}
                    </span>
                    <h3 className="mt-2 line-clamp-2 text-sm font-bold leading-tight" style={{ color: 'var(--theme-text)' }}>
                      {event.title}
                    </h3>
                  </div>
                </div>

                <p className="line-clamp-2 text-[11px] leading-relaxed" style={{ color: 'var(--theme-text-secondary)' }}>
                  {event.description || 'אירוע מקצועי לתעשיית הטלוויזיה והמדיה.'}
                </p>

                <div className="mt-auto space-y-1.5 text-[11px]" style={{ color: 'var(--theme-text-secondary)' }}>
                  <div className="flex items-center gap-1">
                    <MapPin className="h-3 w-3 shrink-0 opacity-50" />
                    <span className="truncate">{event.location}</span>
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate">{event.source}</span>
                    <ExternalLink className="h-3 w-3 shrink-0 opacity-40 transition-opacity group-hover:opacity-80" />
                  </div>
                </div>
              </div>
            </Link>
          );
        })}
      </div>

      {events.length > 1 && (
        <div className="mt-2.5 flex justify-center gap-1.5">
          {events.map((event, index) => (
            <div
              key={event.id || index}
              className="rounded-full transition-all duration-300"
              style={{
                width: index === activeIndex ? '16px' : '6px',
                height: '6px',
                background: index === activeIndex ? 'var(--theme-accent)' : 'var(--theme-border)',
                opacity: index === activeIndex ? 1 : 0.5,
              }}
            />
          ))}
        </div>
      )}
    </div>
  );
}
