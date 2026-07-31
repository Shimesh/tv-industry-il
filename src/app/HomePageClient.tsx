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

export default function HomePageClient({ greeting }: { greeting: string }) {
  const { user, profile } = useAuth();
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

      {/* Greeting — above everything */}
      <header className="app-hero">
        <div className="relative z-10 mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:py-10 text-center">
          <div className="home-greeting-badge mb-4 inline-flex items-center gap-2 rounded-full border px-4 py-1.5 text-xs font-black tracking-wide">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-amber-400 opacity-75" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-amber-400" />
            </span>
            <Sparkles className="h-3.5 w-3.5 text-amber-400" />
            מרכז העבודה של תעשיית הטלוויזיה הישראלית
          </div>
          <h1 className="text-4xl font-black leading-tight sm:text-5xl lg:text-6xl">
            <span className="home-greeting-name">{greeting}{firstName ? ` ${firstName}` : ''}</span>
            <span className="home-greeting-title block">מה קורה היום בתעשייה?</span>
          </h1>
          <p className="home-greeting-copy mx-auto mt-4 max-w-2xl text-base font-medium leading-8">
            שידורים חיים, חדשות, יומן אישי, צוותים, אולפנים ואלפון מקצועי —{' '}
            <span className="home-greeting-title font-bold">הכל במקום אחד</span>.
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

      <div className="mx-auto max-w-7xl px-4 pt-4 sm:px-6">
        <Link
          href="/productions#calendar-insights"
          className="group relative block overflow-hidden rounded-[2rem] border border-cyan-300/25 bg-[radial-gradient(circle_at_12%_12%,rgba(34,211,238,0.26),transparent_30%),radial-gradient(circle_at_88%_10%,rgba(251,146,60,0.30),transparent_28%),linear-gradient(135deg,rgba(8,13,31,0.98),rgba(45,22,98,0.92)_55%,rgba(15,23,42,0.98))] p-4 shadow-[0_24px_70px_rgba(14,165,233,0.22)] transition-all duration-300 hover:-translate-y-1 hover:border-orange-300/60 hover:shadow-[0_28px_90px_rgba(236,72,153,0.30)] sm:p-5"
        >
          <div className="pointer-events-none absolute -left-16 -top-16 h-36 w-36 rounded-full bg-cyan-300/20 blur-3xl transition group-hover:bg-cyan-300/30" />
          <div className="pointer-events-none absolute -bottom-20 right-10 h-44 w-44 rounded-full bg-orange-400/20 blur-3xl transition group-hover:bg-fuchsia-400/25" />
          <div className="pointer-events-none absolute inset-x-8 top-0 h-px bg-gradient-to-r from-transparent via-cyan-200 to-transparent" />

          <div className="relative flex flex-col gap-4 sm:flex-row sm:items-center">
            <div className="flex min-w-0 flex-1 items-start gap-4">
              <div className="relative flex h-16 w-16 shrink-0 items-center justify-center rounded-[1.35rem] bg-gradient-to-br from-orange-400 via-fuchsia-500 to-cyan-400 text-white shadow-[0_0_34px_rgba(34,211,238,0.28)]">
                <TrendingUp className="h-8 w-8" />
                <span className="absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full bg-emerald-400 text-[10px] font-black text-slate-950 shadow-lg">
                  !
                </span>
              </div>

              <div className="min-w-0 flex-1">
                <div className="mb-2 flex flex-wrap items-center gap-2">
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-white px-3 py-1 text-[11px] font-black text-slate-950 shadow-[0_8px_20px_rgba(255,255,255,0.14)]">
                    <Sparkles className="h-3.5 w-3.5 text-orange-500" />
                    חדש ביומן
                  </span>
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-cyan-200/25 bg-cyan-200/10 px-3 py-1 text-[11px] font-bold text-cyan-100">
                    <BarChart3 className="h-3.5 w-3.5" />
                    גרפים ותובנות
                  </span>
                </div>

                <h2 className="text-2xl font-black leading-tight text-white sm:text-3xl">
                  כמה הפקות עשית השנה?
                </h2>
                <p className="mt-1.5 max-w-2xl text-sm leading-6 text-slate-200 sm:text-base">
                  פתח את תמונת המצב האישית שלך: שבועות, חודשים, שנים, שעות עבודה ותובנות מתוך היומן.
                </p>

                <div className="mt-3 flex flex-wrap gap-2 text-[11px] font-black text-white sm:text-xs">
                  <span className="rounded-full bg-white/10 px-3 py-1.5 ring-1 ring-white/10">12 שבועות אחרונים</span>
                  <span className="rounded-full bg-white/10 px-3 py-1.5 ring-1 ring-white/10">כל חודשי השנה</span>
                  <span className="rounded-full bg-white/10 px-3 py-1.5 ring-1 ring-white/10">השוואה שנתית</span>
                </div>
              </div>
            </div>

            <div className="rounded-[1.35rem] border border-white/10 bg-white/10 p-3 backdrop-blur sm:w-60">
              <div className="mb-2 flex items-center justify-between text-[11px] font-bold text-slate-200">
                <span>הגרפים שלי</span>
                <span className="rounded-full bg-orange-400/20 px-2 py-0.5 text-orange-100">הצצה</span>
              </div>
              <div className="flex h-20 items-end justify-between gap-2 rounded-2xl bg-slate-950/35 px-3 pb-3 pt-4">
                {[55, 76, 48, 92, 68, 84].map((height, index) => (
                  <span
                    key={index}
                    className="w-full rounded-t-xl bg-gradient-to-t from-cyan-300 via-blue-500 to-orange-300 shadow-[0_0_16px_rgba(34,211,238,0.28)] transition-all duration-500 group-hover:scale-y-110"
                    style={{ height: `${height}%` }}
                  />
                ))}
              </div>
              <div className="mt-3 flex items-center justify-between gap-3">
                <span className="text-xs font-bold leading-5 text-slate-200">לחץ כדי לראות איפה אתה עומד</span>
                <span className="flex shrink-0 items-center gap-1 rounded-full bg-white px-3 py-2 text-xs font-black text-slate-950 shadow-lg transition group-hover:bg-cyan-100">
                  פתח
                  <ArrowLeft className="h-3.5 w-3.5" />
                </span>
              </div>
            </div>
          </div>
        </Link>
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
            <Link href="/ratings" className="mr-auto flex items-center gap-1 rounded-full border px-3 py-1 text-xs font-bold opacity-90 transition-all hover:opacity-100" style={{ color: 'var(--theme-accent)', borderColor: 'var(--theme-border)' }}>
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
            <Link href="/schedule" className="mr-auto flex items-center gap-1 rounded-full border px-3 py-1 text-xs font-bold opacity-90 transition-all hover:opacity-100" style={{ color: 'var(--theme-accent)', borderColor: 'var(--theme-border)' }}>
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
            <Link href="/news" className="mr-auto flex items-center gap-1 rounded-full border px-3 py-1 text-xs font-bold opacity-90 transition-all hover:opacity-100" style={{ color: 'var(--theme-accent)', borderColor: 'var(--theme-border)' }}>
              כל החדשות <ArrowLeft className="w-3.5 h-3.5" />
            </Link>
          </div>
          {liveNews.length > 0 ? (
            <LatestNewsCarousel news={liveNews.slice(0, 10)} />
          ) : (
            <div className="rounded-xl border p-4 text-sm flex items-center" style={{ background: 'var(--theme-bg-card)', borderColor: 'var(--theme-border)', color: 'var(--theme-text-secondary)', minHeight: '14rem' }}>
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
            <Link href="/news?tab=events" className="mr-auto flex items-center gap-1 rounded-full border px-3 py-1 text-xs font-bold opacity-90 transition-all hover:opacity-100" style={{ color: 'var(--theme-accent)', borderColor: 'var(--theme-border)' }}>
              כל האירועים <ArrowLeft className="w-3.5 h-3.5" />
            </Link>
          </div>
          <UpcomingEventsCarousel events={events} />
        </motion.section>
      </div>
    </div>
  );
}
