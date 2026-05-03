'use client';

import { Suspense, useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { AnimatePresence, motion } from 'framer-motion';
import {
  Newspaper, Calendar, Clock, MapPin, ExternalLink, TrendingUp,
  Filter, RefreshCw, X, Loader2, AlertCircle,
  Globe, Rss, Eye, Play
} from 'lucide-react';

/* ===== Types ===== */
interface RssNewsItem {
  title: string;
  link: string;
  pubDate: string;
  source: string;
  sourceUrl: string;
  description: string;
  newsType: 'אקטואליה' | 'ספורט' | 'תרבות' | 'כלכלה' | 'טכנולוגיה' | 'תקשורת' | 'טלוויזיה' | 'מוזיקה' | 'כללי';
  imageUrl?: string;
  videoUrl?: string;
}

interface ArticleContent {
  title: string;
  content: string;
  date: string;
  source: string;
  coverImageUrl?: string;
  smartSummary?: string;
  videoUrl?: string;
  fallbackGradient?: { from: string; to: string; label: string };
}

interface UpcomingEventItem {
  id: string;
  title: string;
  date: string;
  time?: string | null;
  location: string;
  source: string;
  sourceUrl: string;
  category: string;
  description: string;
}

const RATINGS_KEYWORDS = ['רייטינג', 'דירוג', 'צפייה', 'פופולריות', 'נתוני'];
function isRatingsArticle(title: string): boolean {
  return RATINGS_KEYWORDS.some(kw => title.includes(kw));
}

/* ===== ICS Calendar helpers ===== */
function toICSDate(dateStr: string, timeStr?: string): string {
  const d = new Date(dateStr);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  if (timeStr) {
    const [h, m] = timeStr.split(':');
    return `${year}${month}${day}T${h.padStart(2, '0')}${m.padStart(2, '0')}00`;
  }
  return `${year}${month}${day}`;
}

function addToCalendar(event: { title: string; date: string; time?: string | null; location: string; description: string }) {
  const dtStart = toICSDate(event.date, event.time || undefined);
  // Default end time: 2 hours after start if time provided, else all-day
  let dtEnd: string;
  if (event.time) {
    const [h, m] = event.time.split(':').map(Number);
    const endHour = String(h + 2).padStart(2, '0');
    const endMin = String(m).padStart(2, '0');
    dtEnd = toICSDate(event.date, `${endHour}:${endMin}`);
  } else {
    dtEnd = dtStart;
  }

  const icsContent = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//TVIndustryIL//HE',
    'BEGIN:VEVENT',
    `DTSTART:${dtStart}`,
    `DTEND:${dtEnd}`,
    `SUMMARY:${event.title}`,
    `DESCRIPTION:${event.description}`,
    `LOCATION:${event.location}`,
    'END:VEVENT',
    'END:VCALENDAR',
  ].join('\r\n');

  const blob = new Blob([icsContent], { type: 'text/calendar' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = 'event.ics';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

const catColors: Record<string, string> = {
  festival: 'bg-yellow-400/15 text-yellow-300 border border-yellow-400/20',
  conference: 'bg-blue-500/15 text-blue-300 border border-blue-500/20',
  premiere: 'bg-purple-500/15 text-purple-300 border border-purple-500/20',
  workshop: 'bg-teal-500/15 text-teal-300 border border-teal-500/20',
  award: 'bg-orange-500/15 text-orange-300 border border-orange-500/20',
  'פסטיבל': 'bg-yellow-400/15 text-yellow-300 border border-yellow-400/20',
  'כנס': 'bg-blue-500/15 text-blue-300 border border-blue-500/20',
  'הקרנה': 'bg-purple-500/15 text-purple-300 border border-purple-500/20',
  'סדנה': 'bg-teal-500/15 text-teal-500 border border-teal-500/20',
  'פרסים': 'bg-orange-500/15 text-orange-300 border border-orange-500/20',
  'מוזיקה': 'bg-pink-500/15 text-pink-300 border border-pink-500/20',
  'תרבות': 'bg-fuchsia-500/15 text-fuchsia-300 border border-fuchsia-500/20',
  'טלוויזיה': 'bg-cyan-500/15 text-cyan-300 border border-cyan-500/20',
};

/* Source badge colors */
function getSourceColor(source: string): string {
  if (source.includes('Ynet') || source.includes('ynet')) return 'bg-red-500/15 text-red-400 border-red-500/20';
  if (source.includes('Mako') || source.includes('mako')) return 'bg-orange-500/15 text-orange-400 border-orange-500/20';
  if (source.includes('Globes') || source.includes('globes')) return 'bg-blue-500/15 text-blue-400 border-blue-500/20';
  if (source.includes('Walla') || source.includes('walla')) return 'bg-violet-500/15 text-violet-400 border-violet-500/20';
  if (source.includes('ICE') || source.includes('ice')) return 'bg-cyan-500/15 text-cyan-400 border-cyan-500/20';
  if (source.includes('Scopt') || source.includes('scopt')) return 'bg-emerald-500/15 text-emerald-400 border-emerald-500/20';
  if (source.includes('Mako') || source.includes('mako')) return 'bg-orange-500/15 text-orange-400 border-orange-500/20';
  if (source.includes('Globes') || source.includes('globes')) return 'bg-blue-500/15 text-blue-400 border-blue-500/20';
  return 'bg-purple-500/15 text-purple-400 border-purple-500/20';
}

function formatTimeAgo(dateStr: string): string {
  try {
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMin = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMin / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffMin < 1) return 'עכשיו';
    if (diffMin < 60) return `לפני ${diffMin} דקות`;
    if (diffHours < 24) return `לפני ${diffHours} שעות`;
    if (diffDays < 7) return `לפני ${diffDays} ימים`;
    return date.toLocaleDateString('he-IL', { day: 'numeric', month: 'short', year: 'numeric' });
  } catch {
    return dateStr;
  }
}

function formatFullDate(dateStr: string): string {
  try {
    const date = new Date(dateStr);
    return date.toLocaleDateString('he-IL', {
      weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit'
    });
  } catch {
    return dateStr;
  }
}

/* ===== Skeleton Loader ===== */
function NewsSkeleton() {
  return (
    <div className="space-y-4">
      {[1, 2, 3, 4, 5, 6].map(i => (
        <div key={i} className="rounded-xl border p-5 animate-pulse" style={{ background: 'var(--theme-bg-card)', borderColor: 'var(--theme-border)' }}>
          <div className="flex items-center gap-2 mb-3">
            <div className="h-5 w-20 rounded-full skeleton-shimmer" />
            <div className="h-5 w-16 rounded-full skeleton-shimmer" />
          </div>
          <div className="h-6 w-3/4 rounded skeleton-shimmer mb-2" />
          <div className="h-4 w-full rounded skeleton-shimmer mb-1" />
          <div className="h-4 w-2/3 rounded skeleton-shimmer" />
          <div className="flex items-center gap-4 mt-4 pt-3 border-t" style={{ borderColor: 'var(--theme-border)' }}>
            <div className="h-3 w-24 rounded skeleton-shimmer" />
            <div className="h-3 w-20 rounded skeleton-shimmer" />
          </div>
        </div>
      ))}
    </div>
  );
}

/* ===== Summary Skeleton ===== */
function SmartSummarySkeleton() {
  return (
    <div className="space-y-3 py-2">
      {[90, 100, 75].map((w, i) => (
        <div key={i} className="h-4 rounded skeleton-shimmer" style={{ width: `${w}%` }} />
      ))}
      <div className="pt-2 space-y-3">
        {[85, 100, 60].map((w, i) => (
          <div key={i} className="h-4 rounded skeleton-shimmer" style={{ width: `${w}%` }} />
        ))}
      </div>
    </div>
  );
}

/* ===== Reader Mode Modal ===== */
function ArticleModal({ article, newsItem, onClose, isLoading, error }: {
  article: ArticleContent | null;
  newsItem: RssNewsItem;
  onClose: () => void;
  isLoading: boolean;
  error: string | null;
}) {
  // Esc key to close
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  const coverImage = article?.coverImageUrl || newsItem.imageUrl;

  return (
    <>
      {/* Backdrop */}
      <motion.div
        className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.15 }}
        onClick={onClose}
      >
        {/* Panel */}
        <motion.div
          className="relative w-full sm:max-w-2xl max-h-[92vh] overflow-y-auto rounded-t-2xl sm:rounded-2xl text-right"
          style={{ background: 'var(--theme-bg-card)' }}
          initial={{ y: 60, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 60, opacity: 0 }}
          transition={{ type: 'spring', damping: 28, stiffness: 280 }}
          onClick={e => e.stopPropagation()}
        >
          {/* Cover image */}
          {coverImage && (
            <div className="relative h-48 sm:h-64 overflow-hidden rounded-t-2xl sm:rounded-t-2xl">
              <img src={coverImage} alt="" className="w-full h-full object-cover" />
              <div className="absolute inset-0 bg-gradient-to-t from-[var(--theme-bg-card)] via-black/20 to-transparent" />
            </div>
          )}

          {/* Fallback gradient header when no cover image */}
          {!coverImage && article?.fallbackGradient && (
            <div
              className="h-24 rounded-t-2xl flex items-center justify-center"
              style={{ background: `linear-gradient(135deg, ${article.fallbackGradient.from}, ${article.fallbackGradient.to})` }}
            >
              {article.fallbackGradient.label && (
                <span className="text-white font-bold text-lg opacity-70">{article.fallbackGradient.label}</span>
              )}
            </div>
          )}

          {/* Header */}
          <div className={`flex items-center justify-between px-5 gap-3 ${coverImage ? 'pt-3 pb-2' : 'pt-5 pb-2'}`}>
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg transition-colors hover:bg-white/10 shrink-0"
              aria-label="סגור"
            >
              <X className="w-5 h-5" style={{ color: 'var(--theme-text-secondary)' }} />
            </button>
            <div className="flex items-center gap-2 flex-wrap justify-end">
              <span className="text-xs" style={{ color: 'var(--theme-text-secondary)' }}>
                {formatFullDate(newsItem.pubDate)}
              </span>
              <span className={`px-2.5 py-1 rounded-full text-xs font-medium border ${getSourceColor(newsItem.source)}`}>
                {newsItem.source}
              </span>
            </div>
          </div>

          {/* Title */}
          <h2 className="px-5 pb-4 text-xl sm:text-2xl font-black leading-tight" style={{ color: 'var(--theme-text)' }}>
            {newsItem.title}
          </h2>

          <div className="mx-5 border-b" style={{ borderColor: 'var(--theme-border)' }} />

          {/* Content */}
          <div className="px-5 py-5 min-h-[100px]">
            {isLoading && (
              <>
                <p className="text-xs mb-4 flex items-center gap-1.5" style={{ color: 'var(--theme-text-secondary)' }}>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  מייצר סיכום חכם...
                </p>
                <SmartSummarySkeleton />
              </>
            )}

            {error && !isLoading && (
              <div className="flex flex-col items-center py-8 gap-3 text-center">
                <AlertCircle className="w-8 h-8 text-red-400" />
                <p className="text-sm" style={{ color: 'var(--theme-text-secondary)' }}>
                  לא הצלחנו לטעון את תוכן הכתבה
                </p>
              </div>
            )}

            {!isLoading && !error && article && (
              <div className="space-y-3 text-sm leading-relaxed" style={{ color: 'var(--theme-text-secondary)' }}>
                {article.smartSummary
                  ? article.smartSummary.split('\n\n').map((p, i) => <p key={i}>{p}</p>)
                  : article.content.slice(0, 500).split('\n\n').map((p, i) => <p key={i}>{p}</p>)
                }
              </div>
            )}
          </div>

          {/* Footer CTA */}
          <div className="px-5 pb-6 pt-2 space-y-2">
            {article?.videoUrl && (
              <a
                href={article.videoUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-center gap-2 w-full py-3 rounded-xl font-semibold text-sm transition-opacity hover:opacity-90"
                style={{ background: '#5fb0a8', color: '#fff' }}
              >
                <Play className="w-4 h-4 fill-white" />
                צפה בסרטון
              </a>
            )}
            <a
              href={newsItem.link}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-center gap-2 w-full py-3.5 rounded-xl font-semibold text-sm transition-opacity hover:opacity-90"
              style={{ background: 'var(--theme-accent)', color: '#fff' }}
            >
              <ExternalLink className="w-4 h-4" />
              קרא את הכתבה המלאה במקור
            </a>
          </div>
        </motion.div>
      </motion.div>
    </>
  );
}

/* ===== Main Page ===== */
function NewsPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [activeTab, setActiveTab] = useState<'news' | 'events'>('news');
  const [eventCatFilter, setEventCatFilter] = useState('');
  const [sourceFilter, setSourceFilter] = useState('');

  // News state
  const [news, setNews] = useState<RssNewsItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdate, setLastUpdate] = useState<string | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [highlightedLink, setHighlightedLink] = useState<string | null>(null);
  const articleRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const handledArticleRef = useRef<string | null>(null);

  // Article modal state
  const [selectedNewsItem, setSelectedNewsItem] = useState<RssNewsItem | null>(null);
  const [articleContent, setArticleContent] = useState<ArticleContent | null>(null);
  const [articleLoading, setArticleLoading] = useState(false);
  const [articleError, setArticleError] = useState<string | null>(null);
  const [events, setEvents] = useState<UpcomingEventItem[]>([]);

  // Fetch news
  const fetchNews = useCallback(async (showRefreshing = false) => {
    if (showRefreshing) setIsRefreshing(true);
    else setIsLoading(true);
    setError(null);

    try {
      const res = await fetch('/api/news', { cache: 'no-store' });
      const data = await res.json();

      if (data.success && data.items?.length > 0) {
        setNews(data.items);
        setLastUpdate(data.lastUpdate);
      } else {
        setError('לא נמצאו חדשות');
      }
    } catch {
      setError('שגיאה בטעינת חדשות');
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, []);

  // Initial fetch + auto refresh every 15 min
  useEffect(() => {
    fetchNews();
    const interval = setInterval(() => fetchNews(true), 15 * 60 * 1000);
    return () => clearInterval(interval);
  }, [fetchNews]);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/news/events', { cache: 'no-store' })
      .then((res) => res.json())
      .then((data) => {
        if (!cancelled && data.success && Array.isArray(data.items)) {
          setEvents(data.items);
        }
      })
      .catch(() => {});

    return () => {
      cancelled = true;
    };
  }, []);

  // Fetch article content
  const openArticle = async (newsItem: RssNewsItem) => {
    setSelectedNewsItem(newsItem);
    setArticleContent(null);
    setArticleLoading(true);
    setArticleError(null);

    try {
      const res = await fetch(`/api/news/article?url=${encodeURIComponent(newsItem.link)}`);
      const data = await res.json();

      if (data.success && data.content) {
        setArticleContent({
          title: data.title,
          content: data.content,
          date: data.date,
          source: data.source,
          coverImageUrl: data.coverImageUrl,
          smartSummary: data.smartSummary,
          videoUrl: data.videoUrl,
          fallbackGradient: data.fallbackGradient,
        });
      } else {
        setArticleError(data.error || 'לא ניתן לטעון את התוכן');
      }
    } catch {
      setArticleError('שגיאה בטעינת הכתבה');
    } finally {
      setArticleLoading(false);
    }
  };

  const closeArticle = () => {
    setSelectedNewsItem(null);
    setArticleContent(null);
    setArticleError(null);
  };

  // Get unique sources for filter
  const sources = Array.from(new Set(news.map(n => n.source)));
  const filteredNews = useMemo(
    () => news.filter(n => !sourceFilter || n.source === sourceFilter),
    [news, sourceFilter],
  );
  const requestedArticle = searchParams.get('article');
  const sourceCards = useMemo(
    () => [
      { name: 'Ynet', desc: 'חדשות, ספורט, כלכלה ותרבות', url: 'https://www.ynet.co.il', color: 'from-red-500 to-red-600' },
      { name: 'Walla', desc: 'חדשות ותרבות', url: 'https://www.walla.co.il', color: 'from-purple-500 to-fuchsia-600' },
      { name: 'ICE', desc: 'מדיה, טלוויזיה ותקשורת', url: 'https://www.ice.co.il/media', color: 'from-cyan-500 to-teal-600' },
      { name: 'Scopt', desc: 'ידיעות תקשורת ומדיה', url: 'https://scopt.co.il', color: 'from-emerald-500 to-green-600' },
      { name: 'Mako', desc: 'טלוויזיה, תרבות ומוזיקה', url: 'https://www.mako.co.il/rss', color: 'from-orange-500 to-red-600' },
      { name: 'Globes', desc: 'שיווק, פרסום, טכנולוגיה ותרבות', url: 'https://www.globes.co.il/rss/', color: 'from-blue-500 to-indigo-600' },
    ],
    [],
  );

  const eventCategories = ['', ...Array.from(new Set(events.map((event) => event.category)))];
  const filteredEvents = events
    .filter(e => !eventCatFilter || e.category === eventCatFilter)
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

  useEffect(() => {
    if (!requestedArticle || filteredNews.length === 0) return;
    if (handledArticleRef.current === requestedArticle) return;

    const target = filteredNews.find((item) => item.link === requestedArticle);
    if (!target) return;

    const frame = window.requestAnimationFrame(() => {
      const node = articleRefs.current[target.link];
      if (!node) return;
      handledArticleRef.current = requestedArticle;
      node.scrollIntoView({ behavior: 'smooth', block: 'center' });
      setHighlightedLink(target.link);
      window.setTimeout(() => {
        setHighlightedLink((current) => (current === target.link ? null : current));
      }, 1200);
      router.replace('/news', { scroll: false });
    });

    return () => window.cancelAnimationFrame(frame);
  }, [filteredNews, requestedArticle, router]);

  return (
    <div className="min-h-screen">
      {/* Header */}
      <section className="relative overflow-hidden border-b" style={{ borderColor: 'var(--theme-border)' }}>
        <div className="absolute inset-0 bg-gradient-to-bl from-emerald-900/15 via-transparent to-purple-900/10" />
        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 py-10">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-emerald-500 to-blue-600 flex items-center justify-center shadow-lg">
                <Newspaper className="w-6 h-6 text-white" />
              </div>
              <div>
                <h1 className="text-3xl sm:text-4xl font-black gradient-text">חדשות ואירועים</h1>
                <p className="text-sm mt-1" style={{ color: 'var(--theme-text-secondary)' }}>
                  כותרות בזמן אמת מאתרי החדשות המובילים
                </p>
              </div>
            </div>

            {/* Live indicator + refresh */}
            <div className="flex items-center gap-3">
              {lastUpdate && (
                <span className="text-xs hidden sm:block" style={{ color: 'var(--theme-text-secondary)' }}>
                  עדכון: {new Date(lastUpdate).toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' })}
                </span>
              )}
              <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-green-500/10 border border-green-500/20">
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500" />
                </span>
                <span className="text-xs font-medium text-green-400">LIVE</span>
              </div>
              <button
                onClick={() => fetchNews(true)}
                disabled={isRefreshing}
                className="p-2 rounded-lg border transition-all hover:scale-105"
                style={{ borderColor: 'var(--theme-border)', background: 'var(--theme-bg-card)' }}
                title="רענן חדשות"
              >
                <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin' : ''}`} style={{ color: 'var(--theme-text-secondary)' }} />
              </button>
            </div>
          </div>

          {/* Stats */}
          {news.length > 0 && (
            <div className="flex items-center gap-4 mt-4 text-xs" style={{ color: 'var(--theme-text-secondary)' }}>
              <span className="flex items-center gap-1">
                <Rss className="w-3.5 h-3.5" />
                {news.length} כתבות
              </span>
              <span className="flex items-center gap-1">
                <Globe className="w-3.5 h-3.5" />
                {sources.length} מקורות
              </span>
            </div>
          )}
        </div>
      </section>

      {/* Tab Switcher */}
      <section className="sticky z-30 backdrop-blur-xl border-b" style={{ background: 'var(--theme-bg)', borderColor: 'var(--theme-border)', top: 'var(--app-header-offset)' }}>
        <div className="max-w-7xl mx-auto px-4 sm:px-6">
          <div className="flex gap-1 py-3">
            <button
              onClick={() => setActiveTab('news')}
              className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-medium transition-all ${
                activeTab === 'news' ? 'bg-purple-500/15 text-purple-400 border border-purple-500/20' : 'hover:opacity-80'
              }`}
              style={activeTab !== 'news' ? { color: 'var(--theme-text-secondary)' } : undefined}
            >
              <Newspaper className="w-4 h-4" />
              חדשות בזמן אמת
              {news.length > 0 && (
                <span className="px-1.5 py-0.5 rounded-full text-[10px] bg-purple-500/20 text-purple-400">{news.length}</span>
              )}
            </button>
            <button
              onClick={() => setActiveTab('events')}
              className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-medium transition-all ${
                activeTab === 'events' ? 'bg-blue-500/15 text-blue-400 border border-blue-500/20' : 'hover:opacity-80'
              }`}
              style={activeTab !== 'events' ? { color: 'var(--theme-text-secondary)' } : undefined}
            >
              <Calendar className="w-4 h-4" />
              אירועים קרובים
            </button>
          </div>
        </div>
      </section>

      <section className="max-w-7xl mx-auto px-4 sm:px-6 py-8">
        {/* News Tab */}
        {activeTab === 'news' && (
          <div>
            {/* Source Filter */}
            {sources.length > 0 && (
              <div className="flex items-center gap-2 flex-wrap mb-6">
                <Filter className="w-4 h-4" style={{ color: 'var(--theme-text-secondary)', opacity: 0.7 }} />
                <button
                  onClick={() => setSourceFilter('')}
                  className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all ${
                    !sourceFilter ? 'bg-purple-500/20 text-purple-300 border border-purple-500/30' : 'hover:opacity-80'
                  }`}
                  style={sourceFilter ? { background: 'var(--theme-bg-secondary)', color: 'var(--theme-text-secondary)' } : undefined}
                >
                  הכל
                </button>
                {sources.map(src => (
                  <button
                    key={src}
                    onClick={() => setSourceFilter(sourceFilter === src ? '' : src)}
                    className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all ${
                      sourceFilter === src ? 'bg-purple-500/20 text-purple-300 border border-purple-500/30' : 'hover:opacity-80'
                    }`}
                    style={sourceFilter !== src ? { background: 'var(--theme-bg-secondary)', color: 'var(--theme-text-secondary)' } : undefined}
                  >
                    {src}
                  </button>
                ))}
              </div>
            )}

            {/* Loading State */}
            {isLoading && <NewsSkeleton />}

            {/* Error State */}
            {error && !isLoading && (
              <div className="flex flex-col items-center justify-center py-20">
                <AlertCircle className="w-12 h-12 mb-4 text-red-400" />
                <p className="text-lg font-bold mb-2" style={{ color: 'var(--theme-text)' }}>שגיאה בטעינת חדשות</p>
                <p className="text-sm mb-4" style={{ color: 'var(--theme-text-secondary)' }}>{error}</p>
                <button
                  onClick={() => fetchNews()}
                  className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors"
                  style={{ background: 'var(--theme-accent)', color: '#fff' }}
                >
                  <RefreshCw className="w-4 h-4" />
                  נסה שוב
                </button>
              </div>
            )}

            {/* News Grid */}
            {!isLoading && !error && filteredNews.length > 0 && (
              <div className="space-y-3">
                {/* Featured (first item large) */}
                {filteredNews.length > 0 && (() => {
                  const featured = filteredNews[0];
                  const isRatings = isRatingsArticle(featured.title);
                  return (
                    <button
                      ref={(node) => { articleRefs.current[featured.link] = node; }}
                      onClick={() => openArticle(featured)}
                      className={`w-full text-right rounded-xl border overflow-hidden card-glow transition-all hover:scale-[1.005] hover:shadow-xl hover:shadow-black/20 group ${
                        highlightedLink === featured.link ? 'ring-2 ring-yellow-400 border-yellow-400' : isRatings ? 'border-amber-400/40' : 'hover:border-purple-500/30'
                      }`}
                      style={{
                        background: isRatings ? 'color-mix(in srgb, var(--theme-bg-card) 92%, #78350f)' : 'var(--theme-bg-card)',
                        borderColor: isRatings ? undefined : 'var(--theme-border)',
                      }}
                    >
                      {/* Cover image */}
                      {featured.imageUrl && (
                        <div className="relative h-52 sm:h-64 overflow-hidden">
                          <img src={featured.imageUrl} alt="" className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105" />
                          <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/10 to-transparent" />
                          {featured.videoUrl && (
                            <div className="absolute inset-0 flex items-center justify-center">
                              <div className="w-12 h-12 rounded-full bg-white/25 backdrop-blur-sm flex items-center justify-center border border-white/40 shadow-lg">
                                <Play className="w-5 h-5 text-white fill-white translate-x-0.5" />
                              </div>
                            </div>
                          )}
                          {isRatings && (
                            <div className="absolute top-3 right-3 flex items-center gap-1 px-2.5 py-1 rounded-full bg-amber-400 text-black text-xs font-bold shadow">
                              ⭐ רייטינג
                            </div>
                          )}
                        </div>
                      )}
                      <div className="p-6">
                        <div className="flex items-center gap-2 mb-3">
                          {isRatings && !featured.imageUrl && (
                            <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-amber-400 text-black">⭐ רייטינג</span>
                          )}
                          <span className={`px-2.5 py-1 rounded-full text-xs font-medium border ${getSourceColor(featured.source)}`}>
                            {featured.source}
                          </span>
                          <span className="text-xs" style={{ color: 'var(--theme-text-secondary)' }}>
                            {formatTimeAgo(featured.pubDate)}
                          </span>
                        </div>
                        <h2 className="text-xl sm:text-2xl font-black mb-3 leading-tight group-hover:text-purple-400 transition-colors" style={{ color: 'var(--theme-text)' }}>
                          {featured.title}
                        </h2>
                        {featured.description && (
                          <p className="text-sm leading-relaxed mb-3" style={{ color: 'var(--theme-text-secondary)' }}>
                            {featured.description}
                          </p>
                        )}
                        <div className="flex items-center gap-2 text-xs" style={{ color: 'var(--theme-accent)' }}>
                          <Eye className="w-3.5 h-3.5" />
                          <span>לחץ לקריאת הכתבה המלאה</span>
                        </div>
                      </div>
                    </button>
                  );
                })()}

                {/* Rest of news */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {filteredNews.slice(1).map((item, index) => {
                    const isRatings = isRatingsArticle(item.title);
                    return (
                      <button
                        key={`${item.link}-${index}`}
                        ref={(node) => { articleRefs.current[item.link] = node; }}
                        onClick={() => openArticle(item)}
                        className={`w-full text-right rounded-xl border overflow-hidden card-glow transition-all hover:scale-[1.015] hover:shadow-xl hover:shadow-black/20 group ${
                          highlightedLink === item.link ? 'ring-2 ring-yellow-400 border-yellow-400' : isRatings ? 'border-amber-400/40 hover:border-amber-400/60' : 'hover:border-purple-500/30'
                        }`}
                        style={{
                          background: isRatings ? 'color-mix(in srgb, var(--theme-bg-card) 92%, #78350f)' : 'var(--theme-bg-card)',
                          borderColor: isRatings ? undefined : 'var(--theme-border)',
                        }}
                      >
                        {/* Thumbnail image */}
                        {item.imageUrl && (
                          <div className="relative h-32 overflow-hidden">
                            <img src={item.imageUrl} alt="" className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105" />
                            <div className="absolute inset-0 bg-gradient-to-t from-black/40 to-transparent" />
                            {item.videoUrl && (
                              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                                <div className="w-10 h-10 rounded-full bg-white/25 backdrop-blur-sm flex items-center justify-center border border-white/40 shadow">
                                  <Play className="w-4 h-4 text-white fill-white translate-x-0.5" />
                                </div>
                              </div>
                            )}
                            {isRatings && (
                              <div className="absolute top-2 right-2 px-1.5 py-0.5 rounded-full bg-amber-400 text-black text-[10px] font-bold">⭐ רייטינג</div>
                            )}
                          </div>
                        )}
                        <div className="p-5">
                          <div className="flex items-center gap-2 mb-2">
                            {isRatings && !item.imageUrl && (
                              <span className="px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-amber-400 text-black">⭐ רייטינג</span>
                            )}
                            <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium border ${getSourceColor(item.source)}`}>
                              {item.source}
                            </span>
                            <span className="text-[10px]" style={{ color: 'var(--theme-text-secondary)' }}>
                              {formatTimeAgo(item.pubDate)}
                            </span>
                          </div>
                          <h3 className="font-bold text-base mb-2 leading-tight group-hover:text-purple-400 transition-colors line-clamp-2" style={{ color: 'var(--theme-text)' }}>
                            {item.title}
                          </h3>
                          {item.description && !item.imageUrl && (
                            <p className="text-xs leading-relaxed line-clamp-2 mb-2" style={{ color: 'var(--theme-text-secondary)' }}>
                              {item.description}
                            </p>
                          )}
                          <div className="flex items-center gap-1.5 text-[10px]" style={{ color: 'var(--theme-accent)' }}>
                            <Eye className="w-3 h-3" />
                            <span>קרא עוד</span>
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Events Tab */}
        {activeTab === 'events' && (
          <div>
            {/* Category Filter */}
            <div className="flex items-center gap-2 flex-wrap mb-6">
              <Filter className="w-4 h-4" style={{ color: 'var(--theme-text-secondary)', opacity: 0.7 }} />
              {eventCategories.map(cat => (
                <button key={cat || 'all'} onClick={() => setEventCatFilter(cat)}
                  className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all ${
                    eventCatFilter === cat ? 'bg-blue-500/20 text-blue-300 border border-blue-500/30' : 'hover:opacity-80'
                  }`}
                  style={eventCatFilter !== cat ? { background: 'var(--theme-bg-secondary)', color: 'var(--theme-text-secondary)' } : undefined}>
                  {cat || 'הכל'}
                </button>
              ))}
            </div>

            {/* Events List */}
            <div className="space-y-4">
              {filteredEvents.map(event => {
                const eventDate = new Date(event.date);
                return (
                  <div key={event.id} className="rounded-xl border p-6 card-glow transition-colors" style={{ background: 'var(--theme-bg-card)', borderColor: 'var(--theme-border)' }}>
                    <div className="flex items-start gap-5">
                      <div className="bg-blue-500/10 rounded-xl p-4 text-center shrink-0 min-w-[80px]">
                        <div className="text-3xl font-black text-blue-400">{eventDate.getDate()}</div>
                        <div className="text-sm text-blue-300 font-medium">
                          {eventDate.toLocaleDateString('he-IL', { month: 'short' })}
                        </div>
                        <div className="text-xs text-blue-400/50 mt-0.5">
                          {eventDate.getFullYear()}
                        </div>
                      </div>
                      <div className="flex-1">
                        <span className={`inline-block px-2.5 py-1 rounded-full text-xs font-medium mb-2 ${catColors[event.category] || 'bg-gray-700/50 text-gray-300'}`}>
                          {event.category}
                        </span>
                        <h3 className="font-bold text-xl mb-2 transition-colors" style={{ color: 'var(--theme-text)' }}>{event.title}</h3>
                        <p className="text-sm leading-relaxed mb-3 transition-colors" style={{ color: 'var(--theme-text-secondary)' }}>{event.description}</p>
                        <div className="flex items-center gap-4 text-sm transition-colors" style={{ color: 'var(--theme-text-secondary)', opacity: 0.7 }}>
                          {event.time && (
                            <span className="flex items-center gap-1.5"><Clock className="w-3.5 h-3.5" />{event.time}</span>
                          )}
                          <span className="flex items-center gap-1.5"><MapPin className="w-3.5 h-3.5" />{event.location}</span>
                        </div>
                        <button
                          onClick={() => addToCalendar(event)}
                          className="mt-3 px-4 py-2 rounded-lg bg-blue-500/10 text-blue-400 text-sm font-medium hover:bg-blue-500/20 transition-colors"
                        >
                          <Calendar className="w-3.5 h-3.5 inline ml-1" />
                          הוסף ליומן
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </section>

      {/* RSS Sources */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 pb-12">
        <h3 className="text-lg font-bold mb-4 flex items-center gap-2 transition-colors" style={{ color: 'var(--theme-text)' }}>
          <TrendingUp className="w-5 h-5 text-purple-400" />
          מקורות חדשות
        </h3>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {sourceCards.map((src) => (
            <a
              key={src.name}
              href={src.url}
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-xl border p-4 card-glow transition-colors text-center group"
              style={{ background: 'var(--theme-bg-card)', borderColor: 'var(--theme-border)' }}
            >
              <div className={`w-10 h-10 mx-auto rounded-lg bg-gradient-to-br ${src.color} flex items-center justify-center mb-2 shadow-lg`}>
                <Globe className="w-5 h-5 text-white" />
              </div>
              <h4 className="font-bold text-sm group-hover:text-purple-400 transition-colors" style={{ color: 'var(--theme-text)' }}>{src.name}</h4>
              <p className="text-[10px] mt-0.5" style={{ color: 'var(--theme-text-secondary)' }}>{src.desc}</p>
            </a>
          ))}
        </div>
        <p className="text-xs mt-4 text-center flex items-center justify-center gap-1.5" style={{ color: 'var(--theme-text-secondary)', opacity: 0.5 }}>
          <Rss className="w-3 h-3" />
          החדשות והאירועים מתעדכנים אוטומטית ממקורות RSS ציבוריים ומאתרי החדשות
        </p>
      </section>

      {/* Reader Mode Modal */}
      <AnimatePresence>
        {selectedNewsItem && (
          <ArticleModal
            article={articleContent}
            newsItem={selectedNewsItem}
            onClose={closeArticle}
            isLoading={articleLoading}
            error={articleError}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

export default function NewsPage() {
  return (
    <Suspense fallback={<NewsSkeleton />}>
      <NewsPageContent />
    </Suspense>
  );
}
