'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { ArrowLeft, Calendar, Sparkles, TrendingUp } from 'lucide-react';

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

  useEffect(() => { setGreeting(getGreeting()); }, []);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/news')
      .then(r => r.json())
      .then(data => { if (!cancelled && data.success && Array.isArray(data.items)) setLiveNews(data.items.slice(0, 8)); })
      .catch(() => {})
      .finally(() => { if (!cancelled) setNewsLoaded(true); });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/news/events')
      .then(r => r.json())
      .then(data => { if (!cancelled && data.success && Array.isArray(data.items)) setEvents(data.items.slice(0, 10)); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

  return (
    <div className="min-h-screen overflow-x-hidden" style={{ background: '#0a0a0f' }}>

      {/* ━━━━━━━━ CINEMATIC HERO ━━━━━━━━ */}
      <header
        className="relative flex flex-col overflow-hidden"
        style={{
          minHeight: 'calc(88vh - var(--app-header-offset))',
          borderBottom: '1px solid rgba(0,240,255,0.12)',
        }}
      >
        {/* Background: deep black + neon glow orbs */}
        <div
          className="absolute inset-0"
          style={{
            background: '#0a0a0f',
            backgroundImage: `
              radial-gradient(ellipse 80% 60% at 75% -10%, rgba(157,78,221,0.38) 0%, transparent 60%),
              radial-gradient(ellipse 70% 50% at 15% -5%,  rgba(0,240,255,0.22)  0%, transparent 55%)
            `,
          }}
        />

        {/* Grid overlay */}
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            backgroundImage: `
              linear-gradient(rgba(0,240,255,0.06) 1px, transparent 1px),
              linear-gradient(90deg, rgba(0,240,255,0.06) 1px, transparent 1px)
            `,
            backgroundSize: '52px 52px',
            maskImage: 'linear-gradient(to bottom, rgba(0,0,0,0.6) 0%, transparent 72%)',
          }}
        />

        {/* Bottom fade to content */}
        <div
          className="absolute bottom-0 left-0 right-0 h-32 pointer-events-none"
          style={{ background: 'linear-gradient(to bottom, transparent, #0a0a0f)' }}
        />

        {/* Hero body */}
        <div className="relative z-10 flex flex-col items-center justify-center flex-1 mx-auto w-full max-w-6xl px-4 sm:px-6 pt-10 pb-8">

          {/* Kicker pill */}
          <div
            className="inline-flex items-center gap-2 rounded-full px-4 py-1.5 mb-7 text-xs font-bold tracking-widest uppercase"
            style={{
              background: 'rgba(0,240,255,0.06)',
              border: '1px solid rgba(0,240,255,0.22)',
              color: '#00f0ff',
            }}
          >
            <Sparkles className="h-3 w-3" />
            מרכז העבודה של תעשיית הטלוויזיה
          </div>

          {/* Main heading */}
          <h1
            className="text-center font-black leading-tight"
            style={{
              fontSize: 'clamp(2.6rem, 6.5vw, 5.2rem)',
              color: '#fff',
              textShadow: '0 0 120px rgba(157,78,221,0.30), 0 0 60px rgba(0,240,255,0.15)',
            }}
          >
            <span
              className="block"
              style={{
                background: 'linear-gradient(135deg, #9d4edd 0%, #5a9fff 50%, #00f0ff 100%)',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
                backgroundClip: 'text',
              }}
            >
              {greeting}{firstName ? `, ${firstName}` : ''}
            </span>
            <span className="block mt-2" style={{ color: '#fff' }}>
              מה קורה היום בתעשייה?
            </span>
          </h1>

          {/* Subtitle */}
          <p
            className="mt-5 text-center max-w-lg leading-relaxed"
            style={{ fontSize: 'clamp(0.9rem, 2vw, 1.1rem)', color: '#a0aec0' }}
          >
            שידורים חיים · חדשות · יומן · צוותים · אולפנים · אלפון מקצועי
          </p>

          {/* CTA row */}
          <div className="flex flex-wrap items-center justify-center gap-3 mt-8">
            {/* Primary — Live broadcasts */}
            <Link
              href="/schedule"
              className="inline-flex items-center gap-2.5 rounded-full font-bold transition-all duration-300 hover:scale-105 active:scale-95"
              style={{
                padding: '0.7rem 1.8rem',
                fontSize: '0.9rem',
                background: 'linear-gradient(135deg, rgba(0,240,255,0.18), rgba(0,240,255,0.06))',
                border: '1px solid rgba(0,240,255,0.45)',
                color: '#00f0ff',
                boxShadow: '0 0 36px rgba(0,240,255,0.18), inset 0 1px 0 rgba(255,255,255,0.10)',
              }}
            >
              <span className="relative flex h-2 w-2 shrink-0">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full opacity-75" style={{ background: '#f87171' }} />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500" />
              </span>
              שידורים חיים
            </Link>

            {/* Secondary — Directory */}
            <Link
              href="/phonebook"
              className="inline-flex items-center gap-2.5 rounded-full font-bold transition-all duration-300 hover:scale-105 active:scale-95"
              style={{
                padding: '0.7rem 1.8rem',
                fontSize: '0.9rem',
                background: 'linear-gradient(135deg, rgba(157,78,221,0.18), rgba(157,78,221,0.06))',
                border: '1px solid rgba(157,78,221,0.45)',
                color: '#9d4edd',
                boxShadow: '0 0 36px rgba(157,78,221,0.18), inset 0 1px 0 rgba(255,255,255,0.08)',
              }}
            >
              אלפון מקצועי
            </Link>

            {/* Tertiary — News */}
            <Link
              href="/news"
              className="inline-flex items-center gap-2.5 rounded-full font-bold transition-all duration-300 hover:scale-105 active:scale-95"
              style={{
                padding: '0.7rem 1.8rem',
                fontSize: '0.9rem',
                background: 'rgba(255,255,255,0.04)',
                border: '1px solid rgba(255,255,255,0.12)',
                color: '#a0aec0',
                boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.06)',
              }}
            >
              חדשות
            </Link>
          </div>

          {/* Widgets row */}
          <div className="w-full mt-12 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4 xl:items-stretch">
            <RatingsWidget />
            <PersonalProCardWidget />
            <WorldCupCountdown />
            <HomeInfoWidget />
          </div>
        </div>
      </header>

      {/* ━━━━━━━━ NEWS TICKER ━━━━━━━━ */}
      <div style={{ borderBottom: '1px solid rgba(0,240,255,0.08)' }}>
        <div
          className="mx-auto flex max-w-7xl items-center overflow-hidden sm:mt-4 sm:rounded-2xl sm:border"
          style={{
            borderColor: 'rgba(0,240,255,0.10)',
            background: 'rgba(19,19,31,0.80)',
            backdropFilter: 'blur(12px)',
          }}
        >
          <div
            className="flex shrink-0 items-center gap-1.5 px-3 py-2 font-bold text-xs whitespace-nowrap text-white"
            style={{ background: 'linear-gradient(to left, #9d4edd, #5a9fff, #00f0ff)' }}
          >
            <span className="w-1.5 h-1.5 rounded-full bg-white pulse-live" />
            חדשות
          </div>
          {liveNews.length > 0 ? (
            <LiveNewsTicker items={liveNews} speedPxPerSecond={40} />
          ) : (
            <div className="flex-1 py-2 px-4 text-xs" style={{ color: '#a0aec0' }}>
              {newsLoaded ? 'אין חדשות זמינות כרגע' : 'טוען חדשות בזמן אמת...'}
            </div>
          )}
        </div>
      </div>

      {/* ━━━━━━━━ WEEKLY CALENDAR ━━━━━━━━ */}
      <div className="mx-auto max-w-7xl px-4 pt-6 sm:px-6">
        <WeeklyCalendarWidget />
      </div>

      {/* ━━━━━━━━ MAIN SECTIONS ━━━━━━━━ */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6 space-y-10">

        {/* On Air Now */}
        <motion.section
          initial={{ opacity: 0, y: 14 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.45 }}
        >
          <div className="flex items-center gap-3 mb-4">
            <div className="w-1 h-5 rounded-full" style={{ background: '#ef4444', boxShadow: '0 0 8px rgba(239,68,68,0.7)' }} />
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500" />
            </span>
            <h2 className="text-xs font-bold uppercase tracking-widest" style={{ color: '#a0aec0' }}>עכשיו בשידור</h2>
            <Link
              href="/schedule"
              className="text-xs font-medium flex items-center gap-0.5 mr-auto opacity-60 hover:opacity-100 transition-opacity"
              style={{ color: '#00f0ff' }}
            >
              לוח מלא <ArrowLeft className="w-3 h-3" />
            </Link>
          </div>
          <OnAirNowCarousel channels={broadcastChannels} loading={broadcastsLoading} />
        </motion.section>

        {/* Latest News */}
        <motion.section
          initial={{ opacity: 0, y: 14 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.45 }}
        >
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <div className="w-1 h-5 rounded-full" style={{ background: '#00f0ff', boxShadow: '0 0 8px rgba(0,240,255,0.6)' }} />
              <TrendingUp className="w-4 h-4" style={{ color: '#00f0ff' }} />
              <h2 className="text-xs font-bold uppercase tracking-widest" style={{ color: '#a0aec0' }}>חדשות אחרונות</h2>
            </div>
            <Link href="/news" className="text-xs font-medium flex items-center gap-1 opacity-60 hover:opacity-100 transition-opacity" style={{ color: '#00f0ff' }}>
              כל החדשות <ArrowLeft className="w-3.5 h-3.5" />
            </Link>
          </div>
          {liveNews.length > 0 ? (
            <LatestNewsCarousel news={liveNews.slice(0, 10)} />
          ) : (
            <div
              className="rounded-2xl border p-5 text-sm"
              style={{ background: 'rgba(19,19,31,0.8)', borderColor: 'rgba(0,240,255,0.10)', color: '#a0aec0' }}
            >
              {newsLoaded ? 'אין חדשות זמינות כרגע.' : 'טוען כותרות בזמן אמת...'}
            </div>
          )}
        </motion.section>

        {/* Upcoming Events */}
        <motion.section
          initial={{ opacity: 0, y: 14 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.45 }}
          className="pb-10"
        >
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <div className="w-1 h-5 rounded-full" style={{ background: '#9d4edd', boxShadow: '0 0 8px rgba(157,78,221,0.6)' }} />
              <Calendar className="w-4 h-4" style={{ color: '#9d4edd' }} />
              <h2 className="text-xs font-bold uppercase tracking-widest" style={{ color: '#a0aec0' }}>אירועים קרובים</h2>
            </div>
            <Link href="/news" className="text-xs font-medium flex items-center gap-1 opacity-60 hover:opacity-100 transition-opacity" style={{ color: '#00f0ff' }}>
              כל האירועים <ArrowLeft className="w-3.5 h-3.5" />
            </Link>
          </div>
          <UpcomingEventsCarousel events={events} />
        </motion.section>
      </div>
    </div>
  );
}
