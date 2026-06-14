'use client';

import { useState, useEffect, useCallback, useRef, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Plus, Search, Megaphone, Clock, TrendingUp, Filter, MapPin,
  Briefcase, Package, Gift, Wrench, Home, HelpCircle, RefreshCw, X
} from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import HotListingsWidget from '@/components/board/HotListingsWidget';
import ListingCard from '@/components/board/ListingCard';
import NewListingModal from '@/components/board/NewListingModal';
import { LISTING_TYPE_CONFIG, type BoardListing, type ListingType } from '@/lib/boardTypes';

const BOARD_CACHE_PREFIX = 'board-listings-v1:';
const BOARD_CACHE_TTL_MS = 5 * 60 * 1000;

function readBoardCache(filter: string): BoardListing[] | null {
  try {
    if (typeof window === 'undefined') return null;
    const raw = localStorage.getItem(BOARD_CACHE_PREFIX + filter);
    if (!raw) return null;
    const { data, savedAt } = JSON.parse(raw) as { data: BoardListing[]; savedAt: number };
    if (Date.now() - savedAt > BOARD_CACHE_TTL_MS) return null;
    return Array.isArray(data) ? data : null;
  } catch { return null; }
}

function writeBoardCache(filter: string, data: BoardListing[]) {
  try { localStorage.setItem(BOARD_CACHE_PREFIX + filter, JSON.stringify({ data, savedAt: Date.now() })); } catch {}
}

const TYPE_ICONS: Record<ListingType | 'all', React.ElementType> = {
  all: Megaphone,
  job_offer: Briefcase,
  job_search: Search,
  equipment_sale: Package,
  equipment_free: Gift,
  equipment_rental: Wrench,
  service: RefreshCw,
  space: Home,
  wanted: HelpCircle,
  other: Filter,
};

const TYPE_FILTERS: Array<{ key: ListingType | 'all'; label: string }> = [
  { key: 'all', label: 'הכל' },
  ...Object.entries(LISTING_TYPE_CONFIG).map(([k, v]) => ({ key: k as ListingType, label: v.label })),
];

const LOCATION_OPTIONS = ['הכל', 'תל אביב', 'ירושלים', 'חיפה', 'מרכז', 'צפון', 'דרום', 'שרון'];

function BoardStats({ listings }: { listings: BoardListing[] }) {
  const urgent = listings.filter(l => l.isUrgent).length;
  const withPrice = listings.filter(l => l.price != null && l.price > 0).length;
  return (
    <div className="flex items-center justify-center gap-6 mt-4">
      <div className="text-center">
        <p className="text-xl font-black text-green-400">{listings.length}</p>
        <p className="text-xs" style={{ color: 'var(--theme-text-secondary)' }}>מודעות פעילות</p>
      </div>
      <div className="w-px h-8" style={{ background: 'var(--theme-border)' }} />
      <div className="text-center">
        <p className="text-xl font-black text-red-400">{urgent}</p>
        <p className="text-xs" style={{ color: 'var(--theme-text-secondary)' }}>דחופות</p>
      </div>
      <div className="w-px h-8" style={{ background: 'var(--theme-border)' }} />
      <div className="text-center">
        <p className="text-xl font-black text-amber-400">{withPrice}</p>
        <p className="text-xs" style={{ color: 'var(--theme-text-secondary)' }}>עם מחיר</p>
      </div>
    </div>
  );
}

function BoardPageContent() {
  const { user } = useAuth();
  const searchParams = useSearchParams();
  const highlightId = searchParams.get('listing');

  const [allListings, setAllListings] = useState<BoardListing[]>(() => readBoardCache('all') ?? []);
  const [loading, setLoading] = useState(() => {
    if (typeof window === 'undefined') return true;
    return readBoardCache('all') === null;
  });
  const [typeFilter, setTypeFilter] = useState<ListingType | 'all'>('all');
  const [locationFilter, setLocationFilter] = useState('הכל');
  const [search, setSearch] = useState('');
  const [sortBy, setSortBy] = useState<'newest' | 'popular'>('newest');
  const [showNewModal, setShowNewModal] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const [fabBottom, setFabBottom] = useState(24);
  const fabRef = useRef<HTMLButtonElement>(null);

  const loadListings = useCallback((silent = false) => {
    if (!silent) {
      // Show cached data immediately while fetching, or skeleton if no cache
      const cached = readBoardCache(typeFilter);
      if (cached) setAllListings(cached);
      else setLoading(true);
    }
    const url = typeFilter !== 'all'
      ? `/api/board/listings?type=${typeFilter}`
      : '/api/board/listings';
    fetch(url)
      .then(r => r.json())
      .then(data => {
        if (data.ok) {
          setAllListings(data.listings ?? []);
          writeBoardCache(typeFilter, data.listings ?? []);
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [typeFilter]);

  useEffect(() => { loadListings(); }, [loadListings]);

  // Auto-refresh every 90 seconds — silent, no loading state
  useEffect(() => {
    const t = setInterval(() => loadListings(true), 90000);
    return () => clearInterval(t);
  }, [loadListings]);

  // Keep FAB above footer
  useEffect(() => {
    const footer = document.querySelector('footer');
    if (!footer) return;
    const obs = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          const footerVisible = entry.intersectionRect.height;
          setFabBottom(footerVisible + 16);
        } else {
          setFabBottom(24);
        }
      },
      { threshold: Array.from({ length: 101 }, (_, i) => i / 100) },
    );
    obs.observe(footer);
    return () => obs.disconnect();
  }, []);

  const filtered = allListings
    .filter(l => {
      if (locationFilter !== 'הכל' && !l.location?.includes(locationFilter)) return false;
      if (!search) return true;
      const s = search.toLowerCase();
      return (
        l.title.toLowerCase().includes(s) ||
        l.description.toLowerCase().includes(s) ||
        l.authorName.toLowerCase().includes(s) ||
        (l.tags ?? []).some(t => t.toLowerCase().includes(s)) ||
        (l.location ?? '').toLowerCase().includes(s)
      );
    })
    .sort((a, b) => {
      if (sortBy === 'popular') {
        const aScore = (a.isHot ? 100 : 0) + (a.isUrgent ? 50 : 0) + (a.contactCount ?? 0) * 5 + (a.viewCount ?? 0);
        const bScore = (b.isHot ? 100 : 0) + (b.isUrgent ? 50 : 0) + (b.contactCount ?? 0) * 5 + (b.viewCount ?? 0);
        return bScore - aScore;
      }
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });

  const handleClosed = (id: string) => {
    setAllListings(prev => prev.filter(l => l.id !== id));
  };

  return (
    <div className="min-h-screen">
      {/* Hero */}
      <section className="app-hero">
        <div className="absolute inset-0 bg-gradient-to-bl from-orange-900/10 via-transparent to-purple-900/10" />
        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 py-8">
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="text-center">
            <h1 className="text-3xl font-black gradient-text mb-1">לוח מודעות</h1>
            <p className="text-sm" style={{ color: 'var(--theme-text-secondary)' }}>
              עבודה, ציוד, שירותים, חללים ועוד — הכל במקום אחד
            </p>
            <BoardStats listings={allListings} />
          </motion.div>
        </div>
      </section>

      {/* Hot listings */}
      {allListings.length > 0 && (
        <div className="max-w-7xl mx-auto px-4 sm:px-6 pt-4">
          <HotListingsWidget />
        </div>
      )}

      {/* Sticky toolbar */}
      <section
        className="sticky z-30 border-b backdrop-blur-xl"
        style={{ background: 'var(--theme-nav-bg)', top: 'var(--app-header-offset)', borderColor: 'var(--theme-border)' }}
      >
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-3 space-y-2.5">
          {/* Search + actions row */}
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: 'var(--theme-text-secondary)' }} />
              <input
                type="text"
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="חיפוש מודעות..."
                className="w-full pr-9 pl-3 py-2 rounded-xl text-sm outline-none"
                style={{ background: 'var(--theme-bg)', border: '1px solid var(--theme-border)', color: 'var(--theme-text)' }}
              />
              {search && (
                <button onClick={() => setSearch('')} className="absolute left-3 top-1/2 -translate-y-1/2">
                  <X className="w-3.5 h-3.5" style={{ color: 'var(--theme-text-secondary)' }} />
                </button>
              )}
            </div>

            {/* Sort */}
            <button
              onClick={() => setSortBy(s => s === 'newest' ? 'popular' : 'newest')}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-medium transition-all"
              style={{
                background: 'var(--theme-bg)',
                border: '1px solid var(--theme-border)',
                color: 'var(--theme-text-secondary)',
              }}
            >
              {sortBy === 'newest' ? <Clock className="w-3.5 h-3.5" /> : <TrendingUp className="w-3.5 h-3.5" />}
              {sortBy === 'newest' ? 'חדש' : 'פופולרי'}
            </button>

            {/* More filters toggle */}
            <button
              onClick={() => setShowFilters(f => !f)}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-medium transition-all"
              style={{
                background: showFilters ? 'var(--theme-accent-glow)' : 'var(--theme-bg)',
                border: '1px solid var(--theme-border)',
                color: showFilters ? 'var(--theme-accent)' : 'var(--theme-text-secondary)',
              }}
            >
              <Filter className="w-3.5 h-3.5" />
              סינון
            </button>

            {/* New listing */}
            {user && (
              <button
                onClick={() => setShowNewModal(true)}
                className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-bold text-white transition-all hover:shadow-lg hover:scale-[1.02]"
                style={{ background: 'linear-gradient(135deg, var(--theme-accent), #7c3aed)' }}
              >
                <Plus className="w-4 h-4" />
                <span className="hidden sm:inline">מודעה חדשה</span>
              </button>
            )}
          </div>

          {/* Type filter pills */}
          <div className="flex gap-1.5 overflow-x-auto hide-scrollbar pb-1">
            {TYPE_FILTERS.map(f => {
              const Icon = TYPE_ICONS[f.key];
              const cfg = f.key !== 'all' ? LISTING_TYPE_CONFIG[f.key] : null;
              const active = typeFilter === f.key;
              return (
                <button
                  key={f.key}
                  onClick={() => setTypeFilter(f.key)}
                  className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-all flex-shrink-0"
                  style={{
                    background: active ? (cfg ? cfg.bg : 'var(--theme-accent-glow)') : 'transparent',
                    color: active ? (cfg ? cfg.color : 'var(--theme-accent)') : 'var(--theme-text-secondary)',
                    border: active ? `1px solid ${cfg ? cfg.border : 'var(--theme-accent)'}` : '1px solid transparent',
                  }}
                >
                  <Icon className="w-3.5 h-3.5 flex-shrink-0" />
                  {f.label}
                </button>
              );
            })}
          </div>

          {/* Location filter (collapsible) */}
          <AnimatePresence>
            {showFilters && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                className="overflow-hidden"
              >
                <div className="flex items-center gap-2 overflow-x-auto hide-scrollbar pb-2">
                  <MapPin className="w-3.5 h-3.5 flex-shrink-0" style={{ color: 'var(--theme-text-secondary)' }} />
                  {LOCATION_OPTIONS.map(loc => (
                    <button
                      key={loc}
                      onClick={() => setLocationFilter(loc)}
                      className="px-2.5 py-1 rounded-lg text-xs font-medium whitespace-nowrap transition-all flex-shrink-0"
                      style={{
                        background: locationFilter === loc ? 'var(--theme-accent-glow)' : 'transparent',
                        color: locationFilter === loc ? 'var(--theme-accent)' : 'var(--theme-text-secondary)',
                      }}
                    >
                      {loc}
                    </button>
                  ))}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </section>

      {/* Content */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 py-6">
        {loading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {[1, 2, 3, 4, 5, 6].map(i => (
              <div
                key={i}
                className="rounded-2xl h-64 animate-pulse"
                style={{ background: 'var(--theme-bg-card)', border: '1px solid var(--theme-border)' }}
              />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-16">
            <Megaphone className="w-16 h-16 mx-auto mb-4 opacity-20" style={{ color: 'var(--theme-text-secondary)' }} />
            <p className="text-lg font-bold mb-2" style={{ color: 'var(--theme-text)' }}>
              {allListings.length === 0 ? 'הלוח עדיין ריק' : 'לא נמצאו מודעות'}
            </p>
            <p className="text-sm mb-6" style={{ color: 'var(--theme-text-secondary)' }}>
              {allListings.length === 0
                ? 'היה/י הראשון/ה לפרסם מודעה!'
                : 'נסה/י לשנות את הסינון או החיפוש'}
            </p>
            {user && allListings.length === 0 && (
              <button
                onClick={() => setShowNewModal(true)}
                className="inline-flex items-center gap-2 px-6 py-3 rounded-2xl text-sm font-bold text-white transition-all hover:shadow-lg"
                style={{ background: 'linear-gradient(135deg, var(--theme-accent), #7c3aed)' }}
              >
                <Plus className="w-4 h-4" />
                פרסם מודעה ראשונה
              </button>
            )}
          </div>
        ) : (
          <>
            <p className="text-xs mb-4" style={{ color: 'var(--theme-text-secondary)' }}>
              {filtered.length} מודעות{search || typeFilter !== 'all' || locationFilter !== 'הכל' ? ' (מסוננות)' : ''}
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              <AnimatePresence>
                {filtered.map((listing, idx) => (
                  <motion.div
                    key={listing.id}
                    initial={{ opacity: 0, y: 16 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.95 }}
                    transition={{ delay: idx * 0.03 }}
                    className={highlightId === listing.id ? 'ring-2 ring-offset-2 ring-[var(--theme-accent)] rounded-2xl' : ''}
                  >
                    <ListingCard
                      listing={listing}
                      onClose={handleClosed}
                    />
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>
          </>
        )}
      </section>

      {/* FAB for mobile */}
      {user && !showNewModal && (
        <button
          ref={fabRef}
          onClick={() => setShowNewModal(true)}
          className="fixed left-6 z-40 sm:hidden w-14 h-14 rounded-full flex items-center justify-center text-white shadow-2xl transition-all hover:scale-110 active:scale-95"
          style={{
            background: 'linear-gradient(135deg, var(--theme-accent), #7c3aed)',
            bottom: fabBottom,
            transition: 'bottom 0.2s ease, transform 0.1s ease',
          }}
        >
          <Plus className="w-6 h-6" />
        </button>
      )}

      {showNewModal && (
        <NewListingModal
          onCreated={loadListings}
          onClose={() => setShowNewModal(false)}
        />
      )}
    </div>
  );
}

export default function BoardPage() {
  return (
    <Suspense>
      <BoardPageContent />
    </Suspense>
  );
}
