'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { motion } from 'framer-motion';
import {
  ArrowLeft,
  Briefcase,
  Calendar,
  CircleDot,
  Clock,
  Film,
  Mail,
  Sparkles,
  TrendingUp,
  Tv,
  Users,
  Zap,
} from 'lucide-react';

import WeeklyCalendarWidget from '@/components/WeeklyCalendarWidget';
import LiveNewsTicker from '@/components/home/LiveNewsTicker';
import LatestNewsCarousel from '@/components/home/LatestNewsCarousel';
import OnAirNowCarousel from '@/components/home/OnAirNowCarousel';
import UpcomingEventsCarousel, { type UpcomingEventItem } from '@/components/home/UpcomingEventsCarousel';
import { useAppData } from '@/contexts/AppDataContext';
import { channels } from '@/data/channels';
import { useBroadcasts } from '@/hooks/useBroadcasts';

interface RssNewsItem {
  title: string;
  link: string;
  pubDate: string;
  source: string;
  sourceUrl: string;
  description: string;
  imageUrl?: string;
  imageSource?: string;
  isSourceLogoFallback?: boolean;
}

function LiveClock() {
  const [now, setNow] = useState<Date | null>(null);

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  if (!now) return <div className="h-4" />;

  return (
    <div className="flex items-center gap-2 text-xs" style={{ color: 'var(--theme-text-secondary)' }}>
      <Clock className="w-3.5 h-3.5 opacity-60" />
      <span className="font-mono font-medium" dir="ltr">
        {now.toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
      </span>
      <span className="opacity-30">|</span>
      <span className="opacity-70">
        {now.toLocaleDateString('he-IL', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
      </span>
    </div>
  );
}

function getGreeting(): string {
  const hour = new Date().getHours();
  if (hour >= 5 && hour < 12) return 'בוקר טוב';
  if (hour >= 12 && hour < 17) return 'צהריים טובים';
  if (hour >= 17 && hour < 21) return 'ערב טוב';
  return 'לילה טוב';
}

export default function HomePage() {
  const { totalCount, availableCount, openToWorkCount } = useAppData();
  const [greeting] = useState(() => getGreeting());
  const [liveNews, setLiveNews] = useState<RssNewsItem[]>([]);
  const [newsLoaded, setNewsLoaded] = useState(false);
  const [events, setEvents] = useState<UpcomingEventItem[]>([]);
  const { channels: broadcastChannels, loading: broadcastsLoading } = useBroadcasts({ scope: 'home', pollMs: 120000 });

  useEffect(() => {
    let cancelled = false;
    fetch('/api/news')
      .then((response) => response.json())
      .then((data) => {
        if (!cancelled && data.success && Array.isArray(data.items)) {
          setLiveNews(data.items.slice(0, 8));
        }
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setNewsLoaded(true);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/news/events')
      .then((response) => response.json())
      .then((data) => {
        if (!cancelled && data.success && Array.isArray(data.items)) {
          setEvents(data.items.slice(0, 10));
        }
      })
      .catch(() => {});

    return () => {
      cancelled = true;
    };
  }, []);

  const stats = [
    { label: 'אנשי מקצוע', value: totalCount, icon: Users, color: '#a855f7' },
    { label: 'זמינים לעבודה', value: availableCount, icon: Zap, color: '#22c55e' },
    { label: 'ערוצי טלוויזיה', value: channels.length, icon: Tv, color: '#3b82f6' },
    { label: 'מחפשים עבודה', value: openToWorkCount, icon: Briefcase, color: '#f97316' },
  ];

  const dashboardCards = [
    { id: 'status', icon: CircleDot, label: 'הסטטוס שלי', value: 'פנוי לעבודה', href: '/settings' },
    { id: 'jobs', icon: Briefcase, label: 'לוח מודעות', value: 'דרושים ושיתופי פעולה', href: '/board' },
    { id: 'directory', icon: Users, label: 'אלפון מקצועי', value: `${totalCount} אנשי מקצוע`, href: '/directory' },
    { id: 'messages', icon: Mail, label: 'הודעות', value: 'מעבר ישיר לצ׳אט', href: '/chat' },
    { id: 'production', icon: Film, label: 'יומן אישי', value: 'מעבר ליומן האישי', href: '/productions' },
  ];

  return (
    <div className="min-h-screen">
      <header className="app-hero">
        <div className="relative z-10 mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:py-10">
          <div className="grid gap-6 lg:grid-cols-[1fr_420px] lg:items-end">
            <div>
              <div className="app-section-kicker mb-4">
                <Sparkles className="h-4 w-4 text-amber-400" />
                מרכז העבודה של תעשיית הטלוויזיה
              </div>
              <h1 className="max-w-3xl text-4xl font-black leading-tight sm:text-5xl" style={{ color: 'var(--theme-text)' }}>
                <span className="gradient-text">{greeting}</span>
                <span className="block">מה קורה היום בתעשייה?</span>
              </h1>
              <p className="mt-3 max-w-2xl text-base leading-8" style={{ color: 'var(--theme-text-secondary)' }}>
                שידורים חיים, חדשות, יומן אישי, צוותים, אולפנים ואלפון מקצועי בממשק אחד מסודר, מהיר וויזואלי.
              </p>
              <div className="mt-5 flex flex-wrap gap-3">
                <Link
                  href="/studios"
                  className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-l from-purple-500 via-fuchsia-500 to-blue-600 px-4 py-2.5 text-sm font-black text-white shadow-lg shadow-purple-500/20 transition hover:shadow-purple-500/35"
                >
                  אולפנים
                  <ArrowLeft className="h-4 w-4" />
                </Link>
                <Link
                  href="/schedule"
                  className="inline-flex items-center gap-2 rounded-xl border px-4 py-2.5 text-sm font-black transition hover:bg-[var(--theme-accent-glow)]"
                  style={{ borderColor: 'var(--theme-border)', color: 'var(--theme-text)' }}
                >
                  שידור חי
                  <CircleDot className="h-4 w-4 text-red-400" />
                </Link>
              </div>
            </div>

            <div className="app-panel p-4">
              <LiveClock />
              <div className="mt-4 grid grid-cols-2 gap-3">
                {stats.map((stat) => {
                  const Icon = stat.icon;
                  return (
                    <div
                      key={stat.label}
                      className="rounded-xl border p-3"
                      style={{ borderColor: 'var(--theme-border)', background: `${stat.color}12` }}
                    >
                      <Icon className="mb-2 h-5 w-5" style={{ color: stat.color }} />
                      <div className="text-2xl font-black" style={{ color: 'var(--theme-text)' }}>{stat.value}</div>
                      <div className="text-xs font-semibold" style={{ color: 'var(--theme-text-secondary)' }}>{stat.label}</div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      </header>

      <div className="border-b" style={{ borderColor: 'var(--theme-border)' }}>
        <div className="mx-auto flex max-w-7xl items-center overflow-hidden rounded-none sm:mt-4 sm:rounded-2xl sm:border" style={{ borderColor: 'var(--theme-border)', background: 'var(--theme-bg-card)' }}>
          <div className="flex shrink-0 items-center gap-1.5 bg-gradient-to-l from-purple-600 via-fuchsia-600 to-blue-600 px-3 py-2">
            <span className="w-1.5 h-1.5 rounded-full bg-white pulse-live" />
            <span className="text-white font-bold text-xs whitespace-nowrap">חדשות</span>
          </div>
          {liveNews.length > 0 ? (
            <LiveNewsTicker items={liveNews} speedPxPerSecond={40} />
          ) : (
            <div className="flex-1 py-2 px-4 text-xs" style={{ color: 'var(--theme-text-secondary)' }}>
              {newsLoaded ? 'אין חדשות זמינות כרגע' : 'טוען חדשות בזמן אמת...'}
            </div>
          )}
        </div>
      </div>

      <div className="mx-auto max-w-7xl px-4 pt-5 sm:px-6">
        <WeeklyCalendarWidget />
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6 space-y-8">
        <motion.section initial={{ opacity: 0, y: 10 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ duration: 0.4 }}>
          <div className="mb-3 flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-amber-400" />
            <h2 className="app-section-kicker">האזור שלי</h2>
          </div>
          <div className="flex gap-2.5 overflow-x-auto pb-2 scrollbar-hide md:grid md:grid-cols-5 md:overflow-visible">
            {dashboardCards.map((card) => {
              const Icon = card.icon;
              return (
                <Link
                  key={card.id}
                  href={card.href}
                  className="app-card block min-w-[160px] p-3.5 md:min-w-0"
                >
                  <div className="flex items-center gap-2 mb-2">
                    <Icon className="w-4 h-4" style={{ color: 'var(--theme-accent)' }} />
                    <span className="text-[11px] font-medium" style={{ color: 'var(--theme-text-secondary)' }}>{card.label}</span>
                  </div>
                  <div className="text-xs font-bold leading-snug" style={{ color: 'var(--theme-text)' }}>{card.value}</div>
                </Link>
              );
            })}
          </div>
        </motion.section>

        <motion.section initial={{ opacity: 0, y: 10 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ duration: 0.4 }}>
          <div className="flex items-center gap-2 mb-3">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500" />
            </span>
            <h2 className="text-sm font-bold uppercase tracking-wide" style={{ color: 'var(--theme-text-secondary)' }}>עכשיו בשידור</h2>
            <Link href="/schedule" className="text-xs font-medium flex items-center gap-0.5 mr-auto opacity-60 hover:opacity-100 transition-opacity" style={{ color: 'var(--theme-accent)' }}>
              לוח מלא <ArrowLeft className="w-3 h-3" />
            </Link>
          </div>
          <OnAirNowCarousel channels={broadcastChannels} loading={broadcastsLoading} />
        </motion.section>

        <motion.section initial={{ opacity: 0, y: 10 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ duration: 0.4 }}>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-bold uppercase tracking-wide flex items-center gap-2" style={{ color: 'var(--theme-text-secondary)' }}>
              <TrendingUp className="w-4 h-4 text-purple-400" />
              חדשות אחרונות
            </h2>
            <Link href="/news" className="text-xs font-medium flex items-center gap-1 opacity-60 hover:opacity-100 transition-opacity" style={{ color: 'var(--theme-accent)' }}>
              כל החדשות <ArrowLeft className="w-3.5 h-3.5" />
            </Link>
          </div>

          {liveNews.length > 0 ? (
            <LatestNewsCarousel news={liveNews.slice(0, 10)} />
          ) : (
            <div className="rounded-xl border p-4 text-sm" style={{ background: 'var(--theme-bg-card)', borderColor: 'var(--theme-border)', color: 'var(--theme-text-secondary)' }}>
              {newsLoaded ? 'אין חדשות זמינות כרגע.' : 'טוען כותרות בזמן אמת...'}
            </div>
          )}
        </motion.section>

        <motion.section initial={{ opacity: 0, y: 10 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ duration: 0.4 }} className="pb-10">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-bold uppercase tracking-wide flex items-center gap-2" style={{ color: 'var(--theme-text-secondary)' }}>
              <Calendar className="w-4 h-4 text-blue-400" />
              אירועים קרובים
            </h2>
            <Link href="/news" className="text-xs font-medium flex items-center gap-1 opacity-60 hover:opacity-100 transition-opacity" style={{ color: 'var(--theme-accent)' }}>
              כל האירועים <ArrowLeft className="w-3.5 h-3.5" />
            </Link>
          </div>
          <UpcomingEventsCarousel events={events} />
        </motion.section>
      </div>
    </div>
  );
}
