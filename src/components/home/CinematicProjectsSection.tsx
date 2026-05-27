'use client';

import { useRef } from 'react';
import Link from 'next/link';
import { ChevronLeft, ChevronRight } from 'lucide-react';

interface ProjectItem {
  title: string;
  link: string;
  imageUrl?: string;
  isSourceLogoFallback?: boolean;
  source?: string;
  pubDate?: string;
}

interface Props {
  items: ProjectItem[];
}

const SOURCE_TAGS: Record<string, string> = {
  ynet: 'ידיעות',
  walla: 'וואלה',
  mako: 'מאקו',
  kan: 'כאן',
  ice: 'ICE',
  globes: 'גלובס',
};

export default function CinematicProjectsSection({ items }: Props) {
  const scrollRef = useRef<HTMLDivElement>(null);

  const scroll = (dir: 'right' | 'left') => {
    if (!scrollRef.current) return;
    scrollRef.current.scrollBy({ left: dir === 'left' ? 280 : -280, behavior: 'smooth' });
  };

  const cards = items.filter((i) => i.imageUrl && !i.isSourceLogoFallback).slice(0, 10);
  if (cards.length === 0) return null;

  return (
    <section className="max-w-7xl mx-auto px-4 sm:px-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-3">
          <div
            className="w-1 h-6 rounded-full"
            style={{ background: '#00f0ff', boxShadow: '0 0 10px rgba(0,240,255,0.7)' }}
          />
          <h2 className="text-base font-black tracking-wide" style={{ color: '#fff' }}>
            חדשות מהתעשייה
          </h2>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href="/news"
            className="text-xs font-medium opacity-60 hover:opacity-100 transition-opacity ml-2"
            style={{ color: '#00f0ff' }}
          >
            כל החדשות
          </Link>
          <button
            onClick={() => scroll('right')}
            className="w-8 h-8 rounded-full flex items-center justify-center transition-all hover:scale-105"
            style={{
              background: 'rgba(0,240,255,0.08)',
              border: '1px solid rgba(0,240,255,0.25)',
              color: '#00f0ff',
            }}
          >
            <ChevronRight className="w-4 h-4" />
          </button>
          <button
            onClick={() => scroll('left')}
            className="w-8 h-8 rounded-full flex items-center justify-center transition-all hover:scale-105"
            style={{
              background: 'rgba(0,240,255,0.08)',
              border: '1px solid rgba(0,240,255,0.25)',
              color: '#00f0ff',
            }}
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Scroll row */}
      <div
        ref={scrollRef}
        className="flex gap-4 overflow-x-auto pb-2 hide-scrollbar"
        style={{ scrollSnapType: 'x mandatory' }}
      >
        {cards.map((card, i) => (
          <Link
            key={i}
            href={card.link}
            target="_blank"
            rel="noopener noreferrer"
            className="flex-none group"
            style={{ width: '260px', scrollSnapAlign: 'start' }}
          >
            <div
              className="relative overflow-hidden rounded-2xl transition-all duration-300 group-hover:scale-[1.02]"
              style={{
                height: '180px',
                background: '#13131f',
                border: '1px solid rgba(255,255,255,0.08)',
                boxShadow: '0 4px 24px rgba(0,0,0,0.40)',
              }}
            >
              {card.imageUrl && (
                <img
                  src={card.imageUrl}
                  alt={card.title}
                  className="absolute inset-0 w-full h-full object-cover transition-transform duration-500 group-hover:scale-110"
                  loading="lazy"
                  onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }}
                />
              )}

              {/* Gradient overlay */}
              <div
                className="absolute inset-0"
                style={{
                  background:
                    'linear-gradient(to top, rgba(8,8,30,0.95) 0%, rgba(8,8,30,0.40) 50%, transparent 100%)',
                }}
              />

              {/* Neon border on hover */}
              <div
                className="absolute inset-0 rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none"
                style={{ border: '1px solid rgba(0,240,255,0.40)' }}
              />

              {/* Source tag */}
              {card.source && (
                <div
                  className="absolute top-3 right-3 rounded-full px-2 py-0.5 text-[10px] font-bold text-white"
                  style={{ background: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(8px)' }}
                >
                  {SOURCE_TAGS[card.source.toLowerCase()] ?? card.source}
                </div>
              )}

              {/* Title */}
              <div className="absolute bottom-0 left-0 right-0 p-3">
                <p
                  className="text-xs font-bold leading-snug line-clamp-2"
                  style={{ color: '#fff' }}
                >
                  {card.title}
                </p>
              </div>
            </div>
          </Link>
        ))}
      </div>
    </section>
  );
}
