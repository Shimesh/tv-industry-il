'use client';

import { useRef, useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { ChevronLeft, ChevronRight } from 'lucide-react';

interface RssNewsItem {
  title: string;
  link: string;
  pubDate: string;
  source: string;
  description: string;
  imageUrl?: string;
}

const RATINGS_KEYWORDS = ['רייטינג', 'דירוג', 'צפייה', 'פופולריות', 'נתוני'];

function isRatingsArticle(title: string): boolean {
  return RATINGS_KEYWORDS.some(kw => title.includes(kw));
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
  return 'bg-white/20 text-white';
}

const CARD_WIDTH = 288; // w-72
const CARD_GAP = 12; // gap-3

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
      left: direction === 'next' ? -(CARD_WIDTH + CARD_GAP) : (CARD_WIDTH + CARD_GAP),
      behavior: 'smooth',
    });
  };

  if (!news.length) return null;

  return (
    <div className="relative">
      {/* Nav buttons */}
      {canScrollLeft && (
        <button
          onClick={() => scroll('prev')}
          className="absolute right-0 top-1/2 -translate-y-1/2 -translate-x-0 z-10 w-9 h-9 rounded-full flex items-center justify-center shadow-lg transition-opacity hover:opacity-100 opacity-80"
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

      {/* Scroll container — dir="ltr" keeps scroll direction correct inside RTL page */}
      <div
        ref={scrollRef}
        dir="ltr"
        className="flex overflow-x-auto gap-3 pb-2 px-1"
        style={{ scrollbarWidth: 'none', scrollSnapType: 'x mandatory', msOverflowStyle: 'none' }}
      >
        {news.map((item, i) => (
          <Link
            key={`${item.link}-${i}`}
            href={`/news?article=${encodeURIComponent(item.link)}`}
            className="shrink-0 w-72 h-52 rounded-xl relative overflow-hidden group"
            style={{ scrollSnapAlign: 'start' }}
          >
            {/* Background: image or brand gradient */}
            {item.imageUrl ? (
              <img
                src={item.imageUrl}
                alt=""
                className="absolute inset-0 w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                loading="lazy"
              />
            ) : (
              <div
                className="absolute inset-0 transition-transform duration-500 group-hover:scale-105"
                style={{ background: 'linear-gradient(135deg, var(--brand-grad-start), var(--brand-grad-end))' }}
              />
            )}

            {/* Dark gradient overlay for text readability */}
            <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/30 to-transparent" />

            {/* Ratings badge */}
            {isRatingsArticle(item.title) && (
              <div className="absolute top-2.5 right-2.5 flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-400 text-black text-[10px] font-bold shadow">
                ⭐ רייטינג
              </div>
            )}

            {/* Text — anchored to bottom, RTL */}
            <div className="absolute bottom-0 right-0 left-0 p-4 text-right">
              <div className="flex items-center gap-1.5 mb-1.5 flex-row-reverse justify-end">
                <span className={`px-1.5 py-0.5 rounded text-[10px] font-semibold ${getSourceBadgeColor(item.source)}`}>
                  {item.source}
                </span>
                <span className="text-white/55 text-[10px]">{formatTimeAgo(item.pubDate)}</span>
              </div>
              <h3 className="text-white font-bold text-sm leading-snug line-clamp-3 drop-shadow">
                {item.title}
              </h3>
            </div>
          </Link>
        ))}
      </div>

      {/* Dot indicators */}
      {news.length > 1 && (
        <div className="flex justify-center gap-1.5 mt-2.5">
          {news.map((_, i) => (
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
