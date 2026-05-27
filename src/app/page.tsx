'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { ArrowLeft, Calendar, TrendingUp, Tv } from 'lucide-react';

import WeeklyCalendarWidget from '@/components/WeeklyCalendarWidget';
import LiveNewsTicker from '@/components/home/LiveNewsTicker';
import LatestNewsCarousel from '@/components/home/LatestNewsCarousel';
import OnAirNowCarousel from '@/components/home/OnAirNowCarousel';
import UpcomingEventsCarousel, { type UpcomingEventItem } from '@/components/home/UpcomingEventsCarousel';
import HomeInfoWidget from '@/components/home/HomeInfoWidget';
import PersonalProCardWidget from '@/components/home/PersonalProCardWidget';
import RatingsWidget from '@/components/home/RatingsWidget';
import WorldCupCountdown from '@/components/world-cup/WorldCupCountdown';
import HeroCinematicCollage from '@/components/home/HeroCinematicCollage';
import CinematicProjectsSection from '@/components/home/CinematicProjectsSection';
import ProfessionalsSection from '@/components/home/ProfessionalsSection';
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

/* ─── Stat counter card ─── */
function StatCard({ value, label }: { value: string; label: string }) {
  return (
    <div
      className="flex flex-col items-center justify-center px-6 py-4 rounded-2xl"
      style={{
        background: 'rgba(19,19,31,0.70)',
        border: '1px solid rgba(255,255,255,0.07)',
        backdropFilter: 'blur(12px)',
        flex: '1 1 0',
        minWidth: '120px',
      }}
    >
      <span
        className="text-3xl font-black"
        style={{
          background: 'linear-gradient(135deg, #9d4edd, #00f0ff)',
          WebkitBackgroundClip: 'text',
          WebkitTextFillColor: 'transparent',
          backgroundClip: 'text',
        }}
      >
        {value}
      </span>
      <span className="text-xs mt-1 font-medium" style={{ color: '#a0aec0' }}>{label}</span>
    </div>
  );
}

/* ─── Section header ─── */
function SectionHeader({
  label,
  color,
  href,
  linkText,
  icon: Icon,
}: {
  label: string;
  color: string;
  href: string;
  linkText: string;
  icon: React.ElementType;
}) {
  return (
    <div className="flex items-center justify-between mb-4">
      <div className="flex items-center gap-3">
        <div
          className="w-1 h-5 rounded-full"
          style={{ background: color, boxShadow: `0 0 8px ${color}99` }}
        />
        <Icon className="w-4 h-4" style={{ color }} />
        <h2 className="text-sm font-black uppercase tracking-widest" style={{ color: '#a0aec0' }}>
          {label}
        </h2>
      </div>
      <Link
        href={href}
        className="text-xs font-medium flex items-center gap-1 opacity-60 hover:opacity-100 transition-opacity"
        style={{ color }}
      >
        {linkText} <ArrowLeft className="w-3 h-3" />
      </Link>
    </div>
  );
}

/* ════════════════════════════════════════════════════════════ */
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
      .then((r) => r.json())
      .then((d) => { if (!cancelled && d.success) setLiveNews(d.items.slice(0, 12)); })
      .catch(() => {})
      .finally(() => { if (!cancelled) setNewsLoaded(true); });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/news/events')
      .then((r) => r.json())
      .then((d) => { if (!cancelled && d.success) setEvents(d.items.slice(0, 10)); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

  return (
    <div className="min-h-screen overflow-x-hidden" style={{ background: '#0a0a0f' }}>

      {/* ════════ CINEMATIC HERO ════════ */}
      <header
        className="relative overflow-hidden"
        style={{
          background: `
            radial-gradient(ellipse 70% 80% at 85% -15%, rgba(157,78,221,0.40) 0%, transparent 55%),
            radial-gradient(ellipse 55% 60% at 10% -10%, rgba(0,240,255,0.20) 0%, transparent 50%),
            radial-gradient(ellipse 40% 50% at 50% 110%, rgba(90,159,255,0.12) 0%, transparent 60%),
            #08082a
          `,
          borderBottom: '1px solid rgba(157,78,221,0.18)',
        }}
      >
        {/* Grid overlay */}
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            backgroundImage: `
              linear-gradient(rgba(0,240,255,0.05) 1px, transparent 1px),
              linear-gradient(90deg, rgba(0,240,255,0.05) 1px, transparent 1px)
            `,
            backgroundSize: '56px 56px',
            maskImage: 'linear-gradient(to bottom, rgba(0,0,0,0.5) 0%, transparent 65%)',
          }}
        />

        <div className="relative z-10 mx-auto max-w-7xl px-4 sm:px-6 py-10 lg:py-14">
          {/* ── Split layout ── */}
          <div className="flex flex-col lg:flex-row items-center gap-10 lg:gap-16">

            {/* LEFT in LTR = RIGHT side in RTL → Text block */}
            <div className="flex-1 text-center lg:text-right order-2 lg:order-1">
              {/* Logo wordmark */}
              <div className="flex items-center justify-center lg:justify-end gap-2.5 mb-6">
                <span
                  className="text-sm font-black tracking-widest uppercase"
                  style={{ color: '#a0aec0' }}
                >
                  TV INDUSTRY IL
                </span>
                <div
                  className="w-9 h-9 rounded-xl flex items-center justify-center"
                  style={{
                    background: 'linear-gradient(135deg, #9d4edd, #00f0ff)',
                    boxShadow: '0 0 20px rgba(157,78,221,0.40)',
                  }}
                >
                  <Tv className="w-5 h-5 text-white" />
                </div>
              </div>

              {/* Main heading */}
              <h1
                className="font-black leading-tight"
                style={{ fontSize: 'clamp(2.2rem, 5.5vw, 4.2rem)', color: '#fff' }}
              >
                {firstName ? (
                  <span
                    className="block"
                    style={{
                      background: 'linear-gradient(135deg, #9d4edd 0%, #5a9fff 50%, #00f0ff 100%)',
                      WebkitBackgroundClip: 'text',
                      WebkitTextFillColor: 'transparent',
                      backgroundClip: 'text',
                    }}
                  >
                    {greeting}, {firstName}
                  </span>
                ) : null}
                <span className="block mt-1">
                  כל תעשיית הטלוויזיה
                  <br />
                  בישראל. במקום אחד.
                </span>
              </h1>

              <p
                className="mt-4 max-w-md mx-auto lg:mr-0 leading-relaxed text-base"
                style={{ color: '#a0aec0' }}
              >
                שידורים חיים, חדשות, אלפון מקצועי, יומן, צוותים ואולפנים — בממשק אחד, מהיר וויזואלי.
              </p>

              {/* CTAs */}
              <div className="flex flex-wrap items-center justify-center lg:justify-end gap-3 mt-7">
                <Link
                  href="/directory"
                  className="inline-flex items-center gap-2 rounded-full font-bold transition-all duration-300 hover:scale-105 active:scale-95"
                  style={{
                    padding: '0.65rem 1.6rem',
                    fontSize: '0.875rem',
                    background: 'linear-gradient(135deg, #9d4edd, #5a9fff)',
                    color: '#fff',
                    boxShadow: '0 0 32px rgba(157,78,221,0.35)',
                  }}
                >
                  גלה אנשי מקצוע
                </Link>
                <Link
                  href="/schedule"
                  className="inline-flex items-center gap-2 rounded-full font-bold transition-all duration-300 hover:scale-105 active:scale-95"
                  style={{
                    padding: '0.65rem 1.6rem',
                    fontSize: '0.875rem',
                    background: 'rgba(0,240,255,0.08)',
                    border: '1px solid rgba(0,240,255,0.40)',
                    color: '#00f0ff',
                    boxShadow: '0 0 24px rgba(0,240,255,0.12)',
                  }}
                >
                  <span className="relative flex h-2 w-2 shrink-0">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75" />
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500" />
                  </span>
                  שידורים חיים
                </Link>
              </div>
            </div>

            {/* RIGHT side in LTR = LEFT in RTL → Cinematic collage */}
            <div className="flex-1 w-full order-1 lg:order-2 lg:max-w-[500px]">
              <HeroCinematicCollage />
            </div>
          </div>

          {/* ── Stats / Info widgets row ── */}
          <div className="mt-12 grid grid-cols-2 sm:grid-cols-4 gap-3">
            <RatingsWidget />
            <PersonalProCardWidget />
            <WorldCupCountdown />
            <HomeInfoWidget />
          </div>
        </div>

        {/* Bottom fade */}
        <div
          className="absolute bottom-0 left-0 right-0 h-16 pointer-events-none"
          style={{ background: 'linear-gradient(to bottom, transparent, #0a0a0f)' }}
        />
      </header>

      {/* ════════ NEWS TICKER ════════ */}
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
              {newsLoaded ? 'אין חדשות זמינות כרגע' : 'טוען חדשות...'}
            </div>
          )}
        </div>
      </div>

      {/* ════════ MAIN CONTENT ════════ */}
      <div className="space-y-10 py-8">

        {/* Projects carousel */}
        <motion.div initial={{ opacity: 0, y: 14 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ duration: 0.45 }}>
          <CinematicProjectsSection items={liveNews} />
        </motion.div>

        {/* Professionals row */}
        <motion.div initial={{ opacity: 0, y: 14 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ duration: 0.45 }}>
          <ProfessionalsSection />
        </motion.div>

        {/* Stats bar */}
        <motion.div
          initial={{ opacity: 0, y: 14 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.45 }}
          className="max-w-7xl mx-auto px-4 sm:px-6"
        >
          <div className="flex flex-wrap gap-3 justify-center sm:justify-start">
            <StatCard value="1,200+" label="חברי קהילה" />
            <StatCard value="350+" label="הפקות" />
            <StatCard value="50+" label="משרות פתוחות" />
            <StatCard value="7" label="ערוצי שידור" />
          </div>
        </motion.div>

        {/* Weekly calendar */}
        <div className="mx-auto max-w-7xl px-4 sm:px-6">
          <WeeklyCalendarWidget />
        </div>

        {/* On Air Now */}
        <motion.section
          initial={{ opacity: 0, y: 14 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.45 }}
          className="max-w-7xl mx-auto px-4 sm:px-6"
        >
          <SectionHeader
            label="עכשיו בשידור"
            color="#ef4444"
            href="/schedule"
            linkText="לוח מלא"
            icon={({ className, style }: { className?: string; style?: React.CSSProperties }) => (
              <span className="relative flex h-2 w-2">
                <span className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${className}`} style={{ background: '#f87171', ...style }} />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500" />
              </span>
            )}
          />
          <OnAirNowCarousel channels={broadcastChannels} loading={broadcastsLoading} />
        </motion.section>

        {/* Latest News */}
        <motion.section
          initial={{ opacity: 0, y: 14 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.45 }}
          className="max-w-7xl mx-auto px-4 sm:px-6"
        >
          <SectionHeader label="כותרות אחרונות" color="#00f0ff" href="/news" linkText="כל החדשות" icon={TrendingUp} />
          {liveNews.length > 0 ? (
            <LatestNewsCarousel news={liveNews.slice(0, 10)} />
          ) : (
            <div
              className="rounded-2xl border p-5 text-sm"
              style={{ background: 'rgba(19,19,31,0.8)', borderColor: 'rgba(0,240,255,0.10)', color: '#a0aec0' }}
            >
              {newsLoaded ? 'אין חדשות זמינות כרגע.' : 'טוען כותרות...'}
            </div>
          )}
        </motion.section>

        {/* Upcoming events */}
        <motion.section
          initial={{ opacity: 0, y: 14 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.45 }}
          className="max-w-7xl mx-auto px-4 sm:px-6 pb-12"
        >
          <SectionHeader label="אירועים קרובים" color="#9d4edd" href="/news" linkText="כל האירועים" icon={Calendar} />
          <UpcomingEventsCarousel events={events} />
        </motion.section>
      </div>
    </div>
  );
}
