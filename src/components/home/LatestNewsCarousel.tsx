'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { ChevronLeft, ChevronRight, Play } from 'lucide-react';

interface RssNewsItem {
  title: string;
  link: string;
  pubDate: string;
  source: string;
  description: string;
  imageUrl?: string;
  videoUrl?: string;
  isSourceLogoFallback?: boolean;
}

const RATINGS_KEYWORDS = ['רייטינג', 'דירוג', 'צפייה', 'פופולריות', 'נתוני'];
const CARD_WIDTH = 288;
const CARD_GAP = 12;

function isRatingsArticle(title: string): boolean {
  return RATINGS_KEYWORDS.some((keyword) => title.includes(keyword));
}

function formatTimeAgo(dateStr: string): string {
  try {
    const diffMin = Math.floor((Date.now() - new Date(dateStr).getTime()) / 60000);
    const diffHours = Math.floor(diffMin / 60);
    if (diffMin < 1) return 'עכשיו';
    if (diffMin < 60) return `לפני ${diffMin} דק׳`;
    if (diffHours < 24) return `לפני ${diffHours} שעות`;
    return `לפני ${Math.floor(diffHours / 24)} ימים`;
  } catch {
    return '';
  }
}

function getSourceBadgeColor(source: string): string {
  if (source.includes('Ynet') || source.includes('ynet')) return 'bg-red-500/70 text-white';
  if (source.includes('Walla') || source.includes('walla')) return 'bg-violet-500/70 text-white';
  if (source.includes('ICE') || source.includes('ice')) return 'bg-cyan-500/70 text-white';
  if (source.includes('Scopt') || source.includes('scopt')) return 'bg-emerald-500/70 text-white';
  if (source.includes('Mako') || source.includes('mako')) return 'bg-orange-500/70 text-white';
  if (source.includes('Globes') || source.includes('globes')) return 'bg-blue-500/70 text-white';
  return 'bg-white/20 text-white';
}

export default function LatestNewsCarousel({ news }: { news: RssNewsItem[] }) {
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
    setActiveIndex(Math.max(0, Math.min(idx, news.length - 1)));
  }, [news.length]);

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

  if (!news.length) return null;

  return (
    <div className="relative">
      {canScrollRight && (
        <button
          onClick={() => scroll('next')}
          className="absolute right-0 top-1/2 z-10 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full opacity-80 shadow-lg transition-opacity hover:opacity-100"
          style={{ background: 'var(--theme-bg-card)', border: '1px solid var(--theme-border)' }}
          aria-label="הבא"
        >
          <ChevronRight className="h-5 w-5" style={{ color: 'var(--theme-text)' }} />
        </button>
      )}

      {canScrollLeft && (
        <button
          onClick={() => scroll('prev')}
          className="absolute left-0 top-1/2 z-10 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full opacity-80 shadow-lg transition-opacity hover:opacity-100"
          style={{ background: 'var(--theme-bg-card)', border: '1px solid var(--theme-border)' }}
          aria-label="הקודם"
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
        {news.map((item, index) => (
          <Link
            key={`${item.link}-${index}`}
            href={`/news?article=${encodeURIComponent(item.link)}`}
            className="group relative h-52 w-72 shrink-0 overflow-hidden rounded-xl"
            style={{ scrollSnapAlign: 'start' }}
          >
            {item.imageUrl ? (
              <img
                src={item.imageUrl}
                alt=""
                className={`absolute inset-0 h-full w-full transition-transform duration-500 group-hover:scale-105 ${item.isSourceLogoFallback ? 'bg-slate-950 object-contain p-8' : 'object-cover'}`}
                loading="lazy"
              />
            ) : (
              <div className="absolute inset-0 flex items-center justify-center bg-slate-950 px-6 text-center text-lg font-black text-white/80">
                {item.source}
              </div>
            )}

            <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/30 to-transparent" />

            {item.videoUrl && (
              <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                <div className="flex h-10 w-10 items-center justify-center rounded-full border border-white/40 bg-white/25 shadow backdrop-blur-sm">
                  <Play className="h-4 w-4 translate-x-0.5 fill-white text-white" />
                </div>
              </div>
            )}

            {isRatingsArticle(item.title) && (
              <div className="absolute right-2.5 top-2.5 flex items-center gap-1 rounded-full bg-amber-400 px-2 py-0.5 text-[10px] font-bold text-black shadow">
                ⭐ רייטינג
              </div>
            )}

            <div className="absolute bottom-0 left-0 right-0 p-4 text-right">
              <div className="mb-1.5 flex flex-row-reverse items-center justify-end gap-1.5">
                <span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${getSourceBadgeColor(item.source)}`}>
                  {item.source}
                </span>
                <span className="text-[10px] text-white/55">{formatTimeAgo(item.pubDate)}</span>
              </div>
              <h3 className="line-clamp-3 text-sm font-bold leading-snug text-white drop-shadow">{item.title}</h3>
            </div>
          </Link>
        ))}
      </div>

      {news.length > 1 && (
        <div className="mt-2.5 flex justify-center gap-1.5">
          {news.map((_, index) => (
            <div
              key={index}
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
