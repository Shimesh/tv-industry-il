'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { motion } from 'framer-motion';
import {
  ArrowLeft,
  BarChart3,
  Calendar,
  Cloud,
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
import HotListingsWidget from '@/components/board/HotListingsWidget';
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
  const [greeting, setGreeting] = useState('שלום');
  const firstName = (profile?.displayName || user?.displayName)?.split(' ')[0] ?? '';
  const [liveNews, setLiveNews] = useState<RssNewsItem[]>([]);
  const [newsLoaded, setNewsLoaded] = useState(false);
  const [events, setEvents] = useState<UpcomingEventItem[]>([]);
  const { channels: broadcastChannels, loading: broadcastsLoading } = useBroadcasts({ scope: 'home', pollMs: 120000 });

  useEffect(() => {
    setGreeting(getGreeting());
  }, []);

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

      {/* Greeting — above everything */}
      <header className="app-hero">
        <div className="relative z-10 mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:py-10 text-center">
          <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-amber-400/25 bg-amber-400/10 px-4 py-1.5 text-xs font-black tracking-wide text-amber-200 shadow-[0_0_20px_rgba(251,191,36,0.12)]">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-amber-400 opacity-75" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-amber-400" />
            </span>
            <Sparkles className="h-3.5 w-3.5 text-amber-400" />
            מרכז העבודה של תעשיית הטלוויזיה הישראלית
          </div>
          <h1 className="text-4xl font-black leading-tight sm:text-5xl lg:text-6xl" style={{ color: 'var(--theme-text)' }}>
            <span className="gradient-text">{greeting}{firstName ? ` ${firstName}` : ''}</span>
            <span className="block">מה קורה היום בתעשייה?</span>
          </h1>
          <p className="mx-auto mt-4 max-w-2xl text-base leading-8" style={{ color: 'var(--theme-text-secondary)' }}>
            שידורים חיים, חדשות, יומן אישי, צוותים, אולפנים ואלפון מקצועי —{' '}
            <span style={{ color: 'var(--theme-text)', fontWeight: 700 }}>הכל במקום אחד</span>.
          </p>
        </div>
      </header>

      {/* RSS Ticker */}
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

      {/* 2 → Calendar */}
      <div className="mx-auto max-w-7xl px-4 pt-5 sm:px-6">
        <WeeklyCalendarWidget />
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6 space-y-8">

        {/* 3 → Ratings */}
        <motion.section initial={{ opacity: 0, y: 10 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ duration: 0.4 }}>
          <div className="flex items-center gap-3 mb-4">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-purple-500 to-purple-600 shadow-[0_0_14px_rgba(168,85,247,0.40)]">
              <BarChart3 className="w-4 h-4 text-white" />
            </div>
            <div className="min-w-0">
              <h2 className="text-base font-black leading-none" style={{ color: 'var(--theme-text)' }}>מדד הרייטינג</h2>
              <p className="mt-0.5 text-[11px]" style={{ color: 'var(--theme-text-secondary)' }}>דירוגי צפייה עדכניים</p>
            </div>
            <Link href="/ratings" className="mr-auto flex items-center gap-1 rounded-full border px-3 py-1 text-xs font-bold opacity-60 transition-all hover:opacity-100" style={{ color: 'var(--theme-accent)', borderColor: 'var(--theme-border)' }}>
              לדוח המלא <ArrowLeft className="w-3 h-3" />
            </Link>
          </div>
          <RatingsWidget />
        </motion.section>

        {/* 4 → On Air Now */}
        <motion.section initial={{ opacity: 0, y: 10 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ duration: 0.4 }}>
          <div className="flex items-center gap-3 mb-4">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-red-500 to-red-600 shadow-[0_0_14px_rgba(239,68,68,0.40)]">
              <span className="relative flex h-2.5 w-2.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-200 opacity-75" />
                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-white" />
              </span>
            </div>
            <div className="min-w-0">
              <h2 className="text-base font-black leading-none" style={{ color: 'var(--theme-text)' }}>עכשיו בשידור</h2>
              <p className="mt-0.5 text-[11px]" style={{ color: 'var(--theme-text-secondary)' }}>שידורים חיים ישירים</p>
            </div>
            <Link href="/schedule" className="mr-auto flex items-center gap-1 rounded-full border px-3 py-1 text-xs font-bold opacity-60 transition-all hover:opacity-100" style={{ color: 'var(--theme-accent)', borderColor: 'var(--theme-border)' }}>
              לוח מלא <ArrowLeft className="w-3 h-3" />
            </Link>
          </div>
          <OnAirNowCarousel channels={broadcastChannels} loading={broadcastsLoading} />
        </motion.section>

        {/* 5 → Hot Listings */}
        <motion.section initial={{ opacity: 0, y: 10 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ duration: 0.4 }}>
          <HotListingsWidget />
        </motion.section>

        {/* 6 → WorldCup + ProCard widgets */}
        <motion.section
          initial={{ opacity: 0, y: 10 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.4 }}
          className="app-hero overflow-hidden rounded-[1.5rem]"
        >
          <div className="relative z-10 px-4 py-8 sm:px-6">
            <aside className="grid w-full grid-cols-1 gap-3 md:grid-cols-2 xl:items-stretch">
              <WorldCupCountdown />
              <PersonalProCardWidget />
            </aside>
          </div>
        </motion.section>

        {/* 7 → Latest News */}
        <motion.section initial={{ opacity: 0, y: 10 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ duration: 0.4 }}>
          <div className="flex items-center gap-3 mb-4">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 to-blue-600 shadow-[0_0_14px_rgba(99,102,241,0.40)]">
              <TrendingUp className="w-4 h-4 text-white" />
            </div>
            <div className="min-w-0">
              <h2 className="text-base font-black leading-none" style={{ color: 'var(--theme-text)' }}>חדשות אחרונות</h2>
              <p className="mt-0.5 text-[11px]" style={{ color: 'var(--theme-text-secondary)' }}>עדכוני תעשייה בזמן אמת</p>
            </div>
            <Link href="/news" className="mr-auto flex items-center gap-1 rounded-full border px-3 py-1 text-xs font-bold opacity-60 transition-all hover:opacity-100" style={{ color: 'var(--theme-accent)', borderColor: 'var(--theme-border)' }}>
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

        {/* 8 → Weather */}
        <motion.section initial={{ opacity: 0, y: 10 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ duration: 0.4 }}>
          <div className="flex items-center gap-3 mb-4">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-sky-500 to-cyan-500 shadow-[0_0_14px_rgba(14,165,233,0.40)]">
              <Cloud className="w-4 h-4 text-white" />
            </div>
            <div className="min-w-0">
              <h2 className="text-base font-black leading-none" style={{ color: 'var(--theme-text)' }}>מזג האוויר</h2>
              <p className="mt-0.5 text-[11px]" style={{ color: 'var(--theme-text-secondary)' }}>תחזית ערים מרכזיות בזמן אמת</p>
            </div>
          </div>
          <HomeInfoWidget />
        </motion.section>

        {/* 9 → Upcoming Events */}
        <motion.section initial={{ opacity: 0, y: 10 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ duration: 0.4 }} className="pb-10">
          <div className="flex items-center gap-3 mb-4">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-blue-500 to-blue-600 shadow-[0_0_14px_rgba(59,130,246,0.40)]">
              <Calendar className="w-4 h-4 text-white" />
            </div>
            <div className="min-w-0">
              <h2 className="text-base font-black leading-none" style={{ color: 'var(--theme-text)' }}>אירועים קרובים</h2>
              <p className="mt-0.5 text-[11px]" style={{ color: 'var(--theme-text-secondary)' }}>כנסים, הקרנות ואירועי תעשייה</p>
            </div>
            <Link href="/news?tab=events" className="mr-auto flex items-center gap-1 rounded-full border px-3 py-1 text-xs font-bold opacity-60 transition-all hover:opacity-100" style={{ color: 'var(--theme-accent)', borderColor: 'var(--theme-border)' }}>
              כל האירועים <ArrowLeft className="w-3.5 h-3.5" />
            </Link>
          </div>
          <UpcomingEventsCarousel events={events} />
        </motion.section>
      </div>
    </div>
  );
}
