'use client';

import { useRef, useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { ChevronLeft, ChevronRight } from 'lucide-react';

interface NowPlayingItem {
  id: string;
  name: string;
  color: string;
  program: { title: string; time: string } | null;
}

const CHANNEL_LOGOS: Record<string, string> = {
  kan11: 'https://upload.wikimedia.org/wikipedia/he/thumb/3/31/Kan_11_logo.svg/240px-Kan_11_logo.svg.png',
  keshet12: 'https://upload.wikimedia.org/wikipedia/he/thumb/2/28/Keshet_12_logo.svg/240px-Keshet_12_logo.svg.png',
  reshet13: 'https://upload.wikimedia.org/wikipedia/he/thumb/5/5e/Reshet_13.svg/240px-Reshet_13.svg.png',
  now14: 'https://upload.wikimedia.org/wikipedia/he/thumb/8/8f/Now_14_logo.svg/120px-Now_14_logo.svg.png',
  sport5: 'https://upload.wikimedia.org/wikipedia/he/thumb/8/88/Sport_5_logo.svg/240px-Sport_5_logo.svg.png',
};

const CHANNEL_FALLBACK: Record<string, { label: string; from: string; to: string }> = {
  kan11:    { label: '11', from: '#1e3a8a', to: '#1e40af' },
  keshet12: { label: '12', from: '#db2777', to: '#ea580c' },
  reshet13: { label: '13', from: '#0891b2', to: '#0e7490' },
  now14:    { label: '14', from: '#7c3aed', to: '#4f46e5' },
  sport5:   { label: '5',  from: '#16a34a', to: '#15803d' },
};

const CARD_WIDTH = 288;
const CARD_GAP = 12;

export default function OnAirNowCarousel({ channels }: { channels: NowPlayingItem[] }) {
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
    setActiveIndex(Math.max(0, Math.min(idx, channels.length - 1)));
  }, [channels.length]);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.addEventListener('scroll', updateScrollState, { passive: true });
    updateScrollState();
    return () => el.removeEventListener('scroll', updateScrollState);
  }, [updateScrollState]);

  const scroll = (direction: 'prev' | 'next') => {
    scrollRef.current?.scrollBy({
      left: direction === 'next' ? -(CARD_WIDTH + CARD_GAP) : (CARD_WIDTH + CARD_GAP),
      behavior: 'smooth',
    });
  };

  if (!channels.length) return null;

  return (
    <div className="relative">
      {canScrollLeft && (
        <button
          onClick={() => scroll('prev')}
          className="absolute right-0 top-1/2 -translate-y-1/2 z-10 w-9 h-9 rounded-full flex items-center justify-center shadow-lg transition-opacity hover:opacity-100 opacity-80"
          style={{ background: 'var(--theme-bg-card)', border: '1px solid var(--theme-border)' }}
          aria-label="הקודם"
        >
          <ChevronRight className="w-5 h-5" style={{ color: 'var(--theme-text)' }} />
        </button>
      )}
      {canScrollRight && (
        <button
          onClick={() => scroll('next')}
          className="absolute left-0 top-1/2 -translate-y-1/2 z-10 w-9 h-9 rounded-full flex items-center justify-center shadow-lg transition-opacity hover:opacity-100 opacity-80"
          style={{ background: 'var(--theme-bg-card)', border: '1px solid var(--theme-border)' }}
          aria-label="הבא"
        >
          <ChevronLeft className="w-5 h-5" style={{ color: 'var(--theme-text)' }} />
        </button>
      )}

      <div
        ref={scrollRef}
        dir="ltr"
        className="flex overflow-x-auto gap-3 pb-2 px-1"
        style={{ scrollbarWidth: 'none', scrollSnapType: 'x mandatory', msOverflowStyle: 'none' }}
      >
        {channels.map((item) => (
          <Link
            key={item.id}
            href={`/schedule?channelId=${item.id}`}
            className="shrink-0 w-72 h-52 rounded-xl relative overflow-hidden group"
            style={{ scrollSnapAlign: 'start' }}
          >
            {/* Channel color gradient background */}
            <div
              className="absolute inset-0 transition-transform duration-500 group-hover:scale-105"
              style={{ background: `linear-gradient(135deg, ${item.color}cc, ${item.color}44)` }}
            />

            {/* Channel logo centered — avatar always visible beneath, logo overlaid on top */}
            <div className="absolute inset-0 flex items-center justify-center">
              {/* Branded avatar — always rendered as the base layer */}
              <div
                className="w-20 h-20 rounded-full flex items-center justify-center shadow-lg border-2 border-white/20"
                style={{
                  background: `linear-gradient(135deg, ${CHANNEL_FALLBACK[item.id]?.from ?? '#374151'}, ${CHANNEL_FALLBACK[item.id]?.to ?? '#1f2937'})`,
                }}
              >
                <span className="text-white text-3xl font-black drop-shadow">
                  {CHANNEL_FALLBACK[item.id]?.label ?? item.name.slice(0, 2)}
                </span>
              </div>

              {/* Logo image — absolute on top; onError hides it, revealing the avatar */}
              {CHANNEL_LOGOS[item.id] && (
                <img
                  src={CHANNEL_LOGOS[item.id]}
                  alt={item.name}
                  className="absolute w-20 h-20 object-contain drop-shadow-lg opacity-90"
                  onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                />
              )}
            </div>

            {/* Dark gradient overlay */}
            <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/30 to-transparent" />

            {/* Live badge top-right */}
            <div className="absolute top-3 right-3 flex items-center gap-1.5 px-2 py-1 rounded-full bg-red-600/90 text-white text-[10px] font-bold shadow">
              <span className="relative flex h-1.5 w-1.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-300 opacity-75" />
                <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-white" />
              </span>
              שידור חי
            </div>

            {/* Program info bottom */}
            <div className="absolute bottom-0 right-0 left-0 p-4 text-right">
              <div className="flex items-center gap-1.5 mb-1 flex-row-reverse justify-end">
                <span className="text-white/70 text-[10px]">{item.program?.time || ''}</span>
                <span className="text-white/90 text-xs font-semibold">{item.name}</span>
              </div>
              <h3 className="text-white font-bold text-sm leading-snug line-clamp-2 drop-shadow">
                {item.program?.title || 'שידור חי'}
              </h3>
            </div>
          </Link>
        ))}
      </div>

      {channels.length > 1 && (
        <div className="flex justify-center gap-1.5 mt-2.5">
          {channels.map((_, i) => (
            <div
              key={i}
              className="rounded-full transition-all duration-300"
              style={{
                width: i === activeIndex ? '16px' : '6px',
                height: '6px',
                background: i === activeIndex ? 'var(--theme-accent)' : 'var(--theme-border)',
                opacity: i === activeIndex ? 1 : 0.5,
              }}
            />
          ))}
        </div>
      )}
    </div>
  );
}
