'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { motion } from 'framer-motion';
import {
  ArrowLeft,
  Calendar,
  CalendarDays,
  Clock,
  MessageCircle,
  Newspaper,
  Radio,
  SlidersHorizontal,
  Sparkles,
  TrendingUp,
  Users,
  UserRoundCog,
  Wrench,
  Building2,
} from 'lucide-react';

import WeeklyCalendarWidget from '@/components/WeeklyCalendarWidget';
import LiveNewsTicker from '@/components/home/LiveNewsTicker';
import LatestNewsCarousel from '@/components/home/LatestNewsCarousel';
import OnAirNowCarousel from '@/components/home/OnAirNowCarousel';
import UpcomingEventsCarousel, { type UpcomingEventItem } from '@/components/home/UpcomingEventsCarousel';
import { useAuth } from '@/contexts/AuthContext';
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

  const controlHubCards = [
    { id: 'live', icon: Radio, label: 'שידורים חיים', value: `${channels.length} ערוצים`, href: '/live', accent: '#ef4444' },
    { id: 'news', icon: Newspaper, label: 'חדשות', value: liveNews.length > 0 ? `${liveNews.length} כותרות` : 'מתעדכן עכשיו', href: '/news', accent: '#38bdf8' },
    { id: 'calendar', icon: CalendarDays, label: 'יומן אישי', value: 'הפקות ולו״ז', href: '/calendar', accent: '#60a5fa' },
    { id: 'teams', icon: Users, label: 'צוותים', value: 'ניהול צוותים', href: '/teams', accent: '#22c55e' },
    { id: 'studios', icon: Building2, label: 'אולפנים', value: 'מפת אולפנים', href: '/studios', accent: '#a855f7' },
    { id: 'directory', icon: UserRoundCog, label: 'אלפון מקצועי', value: '203 אנשי מקצוע', href: '/directory', accent: '#f59e0b' },
    { id: 'chat', icon: MessageCircle, label: 'צ׳אט', value: 'שיחות תעשייה', href: '/chat', accent: '#ec4899' },
    { id: 'toolbox', icon: Wrench, label: 'ארגז כלים', value: 'כלי הפקה', href: '/toolbox', accent: '#14b8a6' },
  ];

  return (
    <div className="min-h-screen">
      <header className="app-hero">
        <div className="relative z-10 mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:py-10">
          <div className="grid gap-6 lg:grid-cols-[1fr_520px] lg:items-end">
            <div>
              <div className="app-section-kicker mb-4">
                <Sparkles className="h-4 w-4 text-amber-400" />
                מרכז העבודה של תעשיית הטלוויזיה
              </div>
              <h1 className="max-w-3xl text-4xl font-black leading-tight sm:text-5xl" style={{ color: 'var(--theme-text)' }}>
                <span className="gradient-text">{greeting}{firstName ? ` ${firstName}` : ''}</span>
                <span className="block">מה קורה היום בתעשייה?</span>
              </h1>
              <p className="mt-3 max-w-2xl text-base leading-8" style={{ color: 'var(--theme-text-secondary)' }}>
                שידורים חיים, חדשות, יומן אישי, צוותים, אולפנים ואלפון מקצועי בממשק אחד מסודר, מהיר וויזואלי.
              </p>
            </div>

            <div className="rounded-[1.75rem] border border-white/10 bg-slate-950/[0.45] p-3 shadow-2xl shadow-black/30 backdrop-blur-2xl" dir="rtl">
              <div className="mb-3 flex items-center justify-between gap-3 px-1">
                <div className="flex items-center gap-2">
                  <span className="flex h-9 w-9 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.08] text-cyan-200 shadow-lg shadow-cyan-500/10">
                    <SlidersHorizontal className="h-[18px] w-[18px]" />
                  </span>
                  <div className="text-right">
                    <p className="text-xs font-bold uppercase tracking-wide text-white/50">Control Hub</p>
                    <p className="text-sm font-black text-white">מרכז שליטה</p>
                  </div>
                </div>
                <LiveClock />
              </div>

              <div className="grid grid-cols-2 gap-3">
                {controlHubCards.map((card) => {
                  const Icon = card.icon;
                  return (
                    <Link
                      key={card.id}
                      href={card.href}
                      className="group relative isolate min-h-[122px] overflow-hidden rounded-2xl border border-white/10 bg-white/[0.07] p-4 text-right shadow-lg shadow-black/15 backdrop-blur-xl transition duration-200 hover:-translate-y-0.5 hover:border-white/20 hover:bg-white/[0.1] hover:shadow-xl active:translate-y-0 active:scale-[0.97] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-300"
                      style={{ boxShadow: `0 16px 42px rgba(0, 0, 0, 0.18), 0 0 0 1px ${card.accent}00` }}
                    >
                      <div
                        className="pointer-events-none absolute inset-0 opacity-0 blur-xl transition duration-200 group-hover:opacity-40 group-focus-visible:opacity-40"
                        style={{ background: `radial-gradient(circle at 82% 16%, ${card.accent}88, transparent 42%)` }}
                      />
                      <div className="relative flex h-full flex-col items-start justify-between gap-5">
                        <div className="flex w-full items-start justify-between gap-3">
                          <div className="min-w-0 text-right">
                            <div className="text-[15px] font-black leading-tight text-white">{card.label}</div>
                            <div className="mt-1 text-xs font-semibold leading-snug text-white/60">{card.value}</div>
                          </div>
                          <span
                            className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-white/10 bg-white/10 transition duration-200 group-hover:scale-105"
                            style={{ color: card.accent }}
                          >
                            <Icon className="h-6 w-6" />
                          </span>
                        </div>
                        <span className="inline-flex items-center gap-1 text-[11px] font-bold text-white/50 transition group-hover:text-white/75">
                          פתיחה מהירה
                          <ArrowLeft className="h-3.5 w-3.5" />
                        </span>
                      </div>
                    </Link>
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
