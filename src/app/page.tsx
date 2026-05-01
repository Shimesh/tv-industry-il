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
  const [now, setNow] = useState<Date | null>(() => new Date());

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
    { label: 'אנשי מקצוע', value: totalCount, icon: Users, color: 'bg-purple-500' },
    { label: 'זמינים לעבודה', value: availableCount, icon: Zap, color: 'bg-green-500' },
    { label: 'ערוצי טלוויזיה', value: channels.length, icon: Tv, color: 'bg-blue-500' },
    { label: 'מחפשים עבודה', value: openToWorkCount, icon: Briefcase, color: 'bg-orange-500' },
  ];

  const dashboardCards = [
    { id: 'status', icon: CircleDot, label: 'הסטטוס שלי', value: 'פנוי לעבודה', href: '/settings' },
    { id: 'jobs', icon: Briefcase, label: 'לוח מודעות', value: 'דרושים ושיתופי פעולה', href: '/board' },
    { id: 'directory', icon: Users, label: 'אלפון מקצועי', value: `${totalCount} אנשי מקצוע`, href: '/directory' },
    { id: 'messages', icon: Mail, label: 'הודעות', value: 'מעבר ישיר לצ׳אט', href: '/chat' },
    { id: 'production', icon: Film, label: 'יומן אישי', value: 'מעבר ליומן האישי', href: '/productions' },
  ];

  return (
    <div className="min-h-screen" style={{ background: 'var(--theme-bg)' }}>
      <header className="border-b" style={{ borderColor: 'var(--theme-border)' }}>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-4">
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div>
              <h1 className="text-xl sm:text-2xl font-black tracking-tight" style={{ color: 'var(--theme-text)' }}>
                <span className="gradient-text">{greeting}</span>
                <span className="text-base sm:text-lg font-bold opacity-60 mr-2" style={{ color: 'var(--theme-text-secondary)' }}>
                  👋
                </span>
              </h1>
              <p className="text-xs mt-0.5" style={{ color: 'var(--theme-text-secondary)' }}>
                מה חדש בתעשייה היום?
              </p>
            </div>
            <LiveClock />
          </div>

          <div className="flex items-center gap-4 sm:gap-6 mt-3 pt-3 border-t flex-wrap" style={{ borderColor: 'var(--theme-border)' }}>
            {stats.map((stat) => {
              const Icon = stat.icon;
              return (
                <div key={stat.label} className="flex items-center gap-2">
                  <div className={`w-2 h-2 rounded-full ${stat.color}`} />
                  <Icon className="w-3.5 h-3.5 opacity-70" style={{ color: 'var(--theme-text-secondary)' }} />
                  <span className="text-sm font-bold" style={{ color: 'var(--theme-text)' }}>{stat.value}</span>
                  <span className="text-xs" style={{ color: 'var(--theme-text-secondary)' }}>{stat.label}</span>
                </div>
              );
            })}
          </div>
        </div>
      </header>

      <div className="border-b" style={{ borderColor: 'var(--theme-border)', background: 'var(--theme-bg-card)' }}>
        <div className="max-w-7xl mx-auto flex items-center">
          <div className="bg-gradient-to-l from-purple-600 to-blue-600 px-3 py-2 flex items-center gap-1.5 shrink-0">
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

      <div className="max-w-7xl mx-auto px-4 sm:px-6 pt-4">
        <WeeklyCalendarWidget />
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6 space-y-8">
        <motion.section initial={{ opacity: 0, y: 10 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ duration: 0.4 }}>
          <div className="flex items-center gap-2 mb-3">
            <Sparkles className="w-4 h-4 text-amber-400" />
            <h2 className="text-sm font-bold uppercase tracking-wide" style={{ color: 'var(--theme-text-secondary)' }}>האזור שלי</h2>
          </div>
          <div className="flex gap-2.5 overflow-x-auto pb-2 scrollbar-hide md:grid md:grid-cols-5 md:overflow-visible">
            {dashboardCards.map((card) => {
              const Icon = card.icon;
              return (
                <Link
                  key={card.id}
                  href={card.href}
                  className="min-w-[160px] md:min-w-0 rounded-xl border p-3.5 transition-all duration-200 hover:shadow-md block"
                  style={{ background: 'var(--theme-bg-card)', borderColor: 'var(--theme-border)' }}
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
