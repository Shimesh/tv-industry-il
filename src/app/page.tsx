'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { motion } from 'framer-motion';
import {
  ArrowLeft,
  Calendar,
  Sparkles,
  TrendingUp,
} from 'lucide-react';

import WeeklyCalendarWidget from '@/components/WeeklyCalendarWidget';
import LiveNewsTicker from '@/components/home/LiveNewsTicker';
import LatestNewsCarousel from '@/components/home/LatestNewsCarousel';
import OnAirNowCarousel from '@/components/home/OnAirNowCarousel';
import UpcomingEventsCarousel, { type UpcomingEventItem } from '@/components/home/UpcomingEventsCarousel';
import HomeInfoWidget from '@/components/home/HomeInfoWidget';
import PersonalProCardWidget from '@/components/home/PersonalProCardWidget';
import RatingsWidget from '@/components/home/RatingsWidget';
import WorldCupCountdown from '@/components/world-cup/WorldCupCountdown';
import { useAuth } from '@/contexts/AuthContext';
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

function getGreeting(): string {
  const hour = new Date().getHours();
  if (hour >= 5 && hour < 12) return 'בוקר טוב';
  if (hour >= 12 && hour < 17) return 'צהריים טובים';
  if (hour >= 17 && hour < 21) return 'ערב טוב';
  return 'לילה טוב';
}

export default function HomePage() {
  const { user, profile } = useAuth();
  const [greeting] = useState(() => getGreeting());
  const firstName = (profile?.displayName || user?.displayName)?.split(' ')[0] ?? '';
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

  return (
    <div className="min-h-screen overflow-x-hidden">
      <header className="app-hero">
        <div className="relative z-10 mx-auto max-w-7xl px-4 py-5 sm:px-6 lg:py-7">
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_360px] lg:items-start">
            <div className="max-w-3xl pt-1 lg:pt-4">
              <div className="app-section-kicker mb-4">
                <Sparkles className="h-4 w-4 text-amber-400" />
                מרכז העבודה של תעשיית הטלוויזיה
              </div>
              <h1 className="text-4xl font-black leading-tight sm:text-5xl" style={{ color: 'var(--theme-text)' }}>
                <span className="gradient-text">{greeting}{firstName ? ` ${firstName}` : ''}</span>
                <span className="block">מה קורה היום בתעשייה?</span>
              </h1>
              <p className="mt-3 text-base leading-8" style={{ color: 'var(--theme-text-secondary)' }}>
                שידורים חיים, חדשות, יומן אישי, צוותים, אולפנים ואלפון מקצועי בממשק אחד מסודר, מהיר וויזואלי.
              </p>
            </div>
            <aside className="grid w-full grid-cols-1 gap-3 sm:grid-cols-2 lg:max-w-sm lg:grid-cols-1">
              <RatingsWidget />
              <PersonalProCardWidget />
              <WorldCupCountdown />
              <HomeInfoWidget />
            </aside>
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
