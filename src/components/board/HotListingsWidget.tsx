'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Flame, ArrowLeft, MapPin, Eye } from 'lucide-react';
import { LISTING_TYPE_CONFIG, formatPrice, type BoardListing } from '@/lib/boardTypes';

const CACHE_KEY = 'hot-listings-widget-v1';
const CACHE_TTL_MS = 5 * 60 * 1000;

function readCache(): BoardListing[] | null {
  try {
    if (typeof window === 'undefined') return null;
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const { data, savedAt } = JSON.parse(raw) as { data: BoardListing[]; savedAt: number };
    if (Date.now() - savedAt > CACHE_TTL_MS) return null;
    return Array.isArray(data) ? data : null;
  } catch { return null; }
}

function writeCache(data: BoardListing[]) {
  try { localStorage.setItem(CACHE_KEY, JSON.stringify({ data, savedAt: Date.now() })); } catch {}
}

export default function HotListingsWidget() {
  const [{ listings, loading }, setState] = useState<{ listings: BoardListing[]; loading: boolean }>(() => {
    const cached = readCache();
    return { listings: cached ?? [], loading: cached === null };
  });

  useEffect(() => {
    fetch('/api/board/listings?hot=1&limit=6')
      .then(r => r.json())
      .then(data => {
        if (data.ok) {
          setState({ listings: data.listings ?? [], loading: false });
          writeCache(data.listings ?? []);
        } else {
          setState(prev => ({ ...prev, loading: false }));
        }
      })
      .catch(() => setState(prev => ({ ...prev, loading: false })));
  }, []);

  if (!loading && listings.length === 0) return null;

  return (
    <div
      className="rounded-2xl p-4"
      style={{ background: 'var(--theme-bg-card)', border: '1px solid var(--theme-border)' }}
    >
      <div className="flex items-center gap-2 mb-3">
        <div
          className="flex items-center justify-center w-7 h-7 rounded-lg"
          style={{ background: 'linear-gradient(135deg,#f97316,#ef4444)' }}
        >
          <Flame className="w-4 h-4 text-white" />
        </div>
        <span className="text-sm font-black" style={{ color: 'var(--theme-text)' }}>מודעות חמות</span>
        <Link
          href="/board"
          className="mr-auto flex items-center gap-1 text-xs font-semibold opacity-60 hover:opacity-100 transition-opacity"
          style={{ color: 'var(--theme-accent)' }}
        >
          לכל המודעות <ArrowLeft className="w-3 h-3" />
        </Link>
      </div>

      {loading ? (
        <div className="flex gap-3 overflow-x-hidden">
          {[1, 2, 3].map(i => (
            <div
              key={i}
              className="flex-shrink-0 w-48 h-20 rounded-xl animate-pulse"
              style={{ background: 'var(--theme-bg-secondary)' }}
            />
          ))}
        </div>
      ) : (
        <div className="flex gap-3 overflow-x-auto hide-scrollbar pb-1">
          {listings.map(listing => {
            const cfg = LISTING_TYPE_CONFIG[listing.type];
            const price = formatPrice(listing.price, listing.priceMax, listing.priceUnit);
            return (
              <Link
                key={listing.id}
                href={`/board?listing=${listing.id}`}
                className="flex-shrink-0 w-52 rounded-xl p-3 transition-all hover:scale-[1.02] hover:shadow-lg cursor-pointer"
                style={{
                  background: cfg.bg,
                  border: `1px solid ${cfg.border}`,
                }}
              >
                <div className="flex items-start gap-2 mb-1.5">
                  <span
                    className="inline-block px-2 py-0.5 rounded-md text-[10px] font-bold whitespace-nowrap flex-shrink-0"
                    style={{ background: cfg.bg, color: cfg.color, border: `1px solid ${cfg.border}` }}
                  >
                    {cfg.label}
                  </span>
                  {listing.isUrgent && (
                    <span className="inline-block px-1.5 py-0.5 rounded-md text-[10px] font-bold bg-red-500/15 text-red-400 flex-shrink-0">
                      דחוף
                    </span>
                  )}
                </div>
                <p
                  className="text-sm font-bold leading-snug mb-1"
                  style={{ color: 'var(--theme-text)' }}
                >
                  {listing.title.length > 40 ? listing.title.slice(0, 40) + '…' : listing.title}
                </p>
                <div className="flex items-center justify-between text-[11px]" style={{ color: 'var(--theme-text-secondary)' }}>
                  {price ? (
                    <span className="font-semibold" style={{ color: cfg.color }}>{price}</span>
                  ) : listing.location ? (
                    <span className="flex items-center gap-0.5">
                      <MapPin className="w-3 h-3" />
                      {listing.location}
                    </span>
                  ) : (
                    <span>{listing.authorName}</span>
                  )}
                  {(listing.viewCount ?? 0) > 0 && (
                    <span className="flex items-center gap-0.5">
                      <Eye className="w-3 h-3" />
                      {listing.viewCount}
                    </span>
                  )}
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
