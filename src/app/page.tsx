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

      {/* ── CINEMATIC HERO ── */}
      <header className="app-hero">
        {/* Ambient glow orbs */}
        <div className="absolute inset-0 pointer-events-none overflow-hidden" aria-hidden="true">
          <div
            className="absolute -top-24 -right-24 w-[44rem] h-[44rem] rounded-full"
            style={{
              background: 'radial-gradient(circle, rgba(157,78,221,0.22) 0%, transparent 65%)',
              filter: 'blur(80px)',
            }}
          />
          <div
            className="absolute -top-16 -left-16 w-[38rem] h-[38rem] rounded-full"
            style={{
              background: 'radial-gradient(circle, rgba(0,240,255,0.15) 0%, transparent 65%)',
              filter: 'blur(80px)',
            }}
          />
        </div>

        <div className="relative z-10 mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:py-12">
          <div className="grid grid-cols-1 gap-6">

            {/* Hero text + CTAs */}
            <div className="mx-auto max-w-4xl text-center">
              <div className="app-section-kicker mb-4">
                <Sparkles className="h-4 w-4" style={{ color: 'var(--theme-accent)' }} />
                מרכז העבודה של תעשיית הטלוויזיה
              </div>

              <h1 className="text-4xl font-black leading-tight sm:text-5xl lg:text-6xl" style={{ color: 'var(--theme-text)' }}>
                <span className="gradient-text">{greeting}{firstName ? ` ${firstName}` : ''}</span>
                <span className="block mt-1">מה קורה היום בתעשייה?</span>
              </h1>

              <p className="mx-auto mt-4 max-w-2xl text-base leading-8" style={{ color: 'var(--theme-text-secondary)' }}>
                שידורים חיים, חדשות, יומן אישי, צוותים, אולפנים ואלפון מקצועי — בממשק אחד, מהיר וויזואלי.
              </p>

              {/* CTA Buttons */}
              <div className="flex flex-wrap items-center justify-center gap-3 mt-6">
                <Link
                  href="/schedule"
                  className="inline-flex items-center gap-2 rounded-full px-5 py-2.5 text-sm font-bold transition-all duration-200 hover:scale-105 active:scale-95"
                  style={{
                    background: 'rgba(0, 240, 255, 0.08)',
                    border: '1px solid rgba(0, 240, 255, 0.35)',
                    color: 'var(--theme-accent)',
                    boxShadow: '0 0 24px rgba(0, 240, 255, 0.12)',
                  }}
                >
                  <span className="relative flex h-2 w-2 shrink-0">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75" />
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500" />
                  </span>
                  שידורים חיים
                </Link>

                <Link
                  href="/phonebook"
                  className="inline-flex items-center gap-2 rounded-full px-5 py-2.5 text-sm font-bold transition-all duration-200 hover:scale-105 active:scale-95"
                  style={{
                    background: 'rgba(157, 78, 221, 0.08)',
                    border: '1px solid rgba(157, 78, 221, 0.35)',
                    color: 'var(--theme-accent-secondary)',
                    boxShadow: '0 0 24px rgba(157, 78, 221, 0.12)',
                  }}
                >
                  אלפון מקצועי
                </Link>
              </div>
            </div>

            {/* Widget row */}
            <aside className="grid w-full grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4 xl:items-stretch">
              <RatingsWidget />
              <PersonalProCardWidget />
              <WorldCupCountdown />
              <HomeInfoWidget />
            </aside>
          </div>
        </div>
      </header>

      {/* ── NEWS TICKER ── */}
      <div className="border-b" style={{ borderColor: 'var(--theme-border)' }}>
        <div
          className="mx-auto flex max-w-7xl items-center overflow-hidden rounded-none sm:mt-4 sm:rounded-2xl sm:border"
          style={{ borderColor: 'var(--theme-border)', background: 'var(--theme-bg-card)' }}
        >
          <div
            className="flex shrink-0 items-center gap-1.5 px-3 py-2"
            style={{ background: 'linear-gradient(to left, var(--theme-accent-secondary), #5a9fff, var(--theme-accent))' }}
          >
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

      {/* ── WEEKLY CALENDAR ── */}
      <div className="mx-auto max-w-7xl px-4 pt-5 sm:px-6">
        <WeeklyCalendarWidget />
      </div>

      {/* ── MAIN CONTENT ── */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6 space-y-8">

        {/* On Air Now */}
        <motion.section
          initial={{ opacity: 0, y: 10 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.4 }}
        >
          <div className="flex items-center gap-2 mb-3">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500" />
            </span>
            <h2 className="text-sm font-bold uppercase tracking-wide" style={{ color: 'var(--theme-text-secondary)' }}>עכשיו בשידור</h2>
            <Link
              href="/schedule"
              className="text-xs font-medium flex items-center gap-0.5 mr-auto opacity-60 hover:opacity-100 transition-opacity"
              style={{ color: 'var(--theme-accent)' }}
            >
              לוח מלא <ArrowLeft className="w-3 h-3" />
            </Link>
          </div>
          <OnAirNowCarousel channels={broadcastChannels} loading={broadcastsLoading} />
        </motion.section>

        {/* Latest News */}
        <motion.section
          initial={{ opacity: 0, y: 10 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.4 }}
        >
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-bold uppercase tracking-wide flex items-center gap-2" style={{ color: 'var(--theme-text-secondary)' }}>
              <TrendingUp className="w-4 h-4" style={{ color: 'var(--theme-accent)' }} />
              חדשות אחרונות
            </h2>
            <Link
              href="/news"
              className="text-xs font-medium flex items-center gap-1 opacity-60 hover:opacity-100 transition-opacity"
              style={{ color: 'var(--theme-accent)' }}
            >
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

        {/* Upcoming Events */}
        <motion.section
          initial={{ opacity: 0, y: 10 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.4 }}
          className="pb-10"
        >
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-bold uppercase tracking-wide flex items-center gap-2" style={{ color: 'var(--theme-text-secondary)' }}>
              <Calendar className="w-4 h-4" style={{ color: 'var(--theme-accent-secondary)' }} />
              אירועים קרובים
            </h2>
            <Link
              href="/news"
              className="text-xs font-medium flex items-center gap-1 opacity-60 hover:opacity-100 transition-opacity"
              style={{ color: 'var(--theme-accent)' }}
            >
              כל האירועים <ArrowLeft className="w-3.5 h-3.5" />
            </Link>
          </div>
          <UpcomingEventsCarousel events={events} />
        </motion.section>
      </div>
    </div>
  );
}
