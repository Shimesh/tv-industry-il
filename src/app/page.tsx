'use client';

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { useAppData } from '@/contexts/AppDataContext';
import { mockJobs } from '@/data/jobs';
import { channels, generateSchedule, getCurrentProgram } from '@/data/channels';
import { industryEvents, categoryLabels } from '@/data/news';
import { motion, useInView } from 'framer-motion';
import {
  Calendar, Users, Newspaper, Building2, Tv, TrendingUp, Radio, Zap,
  ArrowLeft, Clock, MapPin, Tag, MessageCircle, Megaphone, Wrench,
  Play, Sparkles, Signal, ChevronDown, Globe,
  Briefcase, Bookmark, Mail, Film, CircleDot
} from 'lucide-react';
import WeeklyCalendarWidget from '@/components/WeeklyCalendarWidget';

interface RssNewsItem {
  title: string;
  link: string;
  pubDate: string;
  source: string;
  sourceUrl: string;
  description: string;
}

/* ===== Count-up animation hook ===== */
function useCountUp(target: number, duration = 2000) {
  const [count, setCount] = useState(0);
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, margin: '-50px' });

  useEffect(() => {
    if (!inView) return;
    let start = 0;
    const step = target / (duration / 16);
    const timer = setInterval(() => {
      start += step;
      if (start >= target) { setCount(target); clearInterval(timer); }
      else setCount(Math.floor(start));
    }, 16);
    return () => clearInterval(timer);
  }, [inView, target, duration]);

  return { count, ref };
}

/* ===== Live Clock ===== */
function LiveClock() {
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    setNow(new Date());
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  if (!now) {
    return (
      <div className="flex items-center gap-2 text-xs h-4" style={{ color: 'var(--theme-text-secondary)' }}>
        <Clock className="w-3.5 h-3.5" />
        <span className="font-mono" dir="ltr">&nbsp;</span>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2 text-xs" style={{ color: 'var(--theme-text-secondary)' }}>
      <Clock className="w-3.5 h-3.5 opacity-60" />
      <span className="font-mono font-medium" dir="ltr">{now.toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</span>
      <span className="opacity-30">|</span>
      <span className="opacity-70">{now.toLocaleDateString('he-IL', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</span>
    </div>
  );
}

/* ===== Time-based greeting ===== */
function getGreeting(): string {
  const hour = new Date().getHours();
  if (hour >= 5 && hour < 12) return 'בוקר טוב';
  if (hour >= 12 && hour < 17) return 'צהריים טובים';
  if (hour >= 17 && hour < 21) return 'ערב טוב';
  return 'לילה טוב';
}

export default function HomePage() {
  // Single source of truth — live count synced with Firestore via shared context
  const { contacts, totalCount, availableCount, openToWorkCount } = useAppData();
  const uniqueDepts = new Set(contacts.map(c => c.department)).size;

  const [greeting, setGreeting] = useState('');
  useEffect(() => {
    setGreeting(getGreeting());
  }, []);

  // Real-time news from API
  const [liveNews, setLiveNews] = useState<RssNewsItem[]>([]);
  useEffect(() => {
    fetch('/api/news')
      .then(r => r.json())
      .then(data => { if (data.success && data.items) setLiveNews(data.items.slice(0, 6)); })
      .catch(() => {});
  }, []);

  const stats = [
    { label: 'אנשי מקצוע', value: totalCount, icon: Users, color: 'bg-purple-500' },
    { label: 'זמינים לעבודה', value: availableCount, icon: Zap, color: 'bg-green-500' },
    { label: 'ערוצי טלוויזיה', value: channels.length, icon: Tv, color: 'bg-blue-500' },
    { label: 'מחפשים עבודה', value: openToWorkCount, icon: Briefcase, color: 'bg-orange-500' },
  ];

  const newsCount = liveNews.length || 0;
  const allNavItems = [
    { href: '/schedule', label: 'לוח שידורים', desc: 'לוח שידורים חי של כל הערוצים', icon: Calendar, gradient: 'from-blue-600 to-cyan-500', iconBg: 'bg-blue-500/15', preview: `${channels.length} ערוצים` },
    { href: '/directory', label: 'אלפון מקצועי', desc: `${totalCount} אנשי מקצוע • ${availableCount} זמינים`, icon: Users, gradient: 'from-purple-600 to-pink-500', iconBg: 'bg-purple-500/15', preview: `${uniqueDepts} מחלקות` },
    { href: '/chat', label: 'צ\'אט מקצועי', desc: 'שוחחו עם קולגות בזמן אמת', icon: MessageCircle, gradient: 'from-green-600 to-emerald-500', iconBg: 'bg-green-500/15', preview: 'הודעות חדשות' },
    { href: '/news', label: 'חדשות ואירועים', desc: 'כותרות בזמן אמת מאתרי חדשות', icon: Newspaper, gradient: 'from-emerald-600 to-teal-500', iconBg: 'bg-emerald-500/15', preview: newsCount > 0 ? `${newsCount}+ כתבות` : 'חדשות חמות' },
    { href: '/board', label: 'לוח מודעות', desc: 'דרושים, ציוד ושיתופי פעולה', icon: Megaphone, gradient: 'from-amber-600 to-yellow-500', iconBg: 'bg-amber-500/15', preview: 'מודעות חמות' },
    { href: '/studios', label: 'אולפני טלוויזיה', desc: 'מפה, ניווט ומידע על אולפנים', icon: Building2, gradient: 'from-rose-600 to-pink-500', iconBg: 'bg-rose-500/15', preview: '7 אולפנים' },
    { href: '/tools', label: 'ארגז כלים', desc: 'טיימר, מזג אוויר, מחשבון ועוד', icon: Wrench, gradient: 'from-indigo-600 to-blue-500', iconBg: 'bg-indigo-500/15', preview: '6 כלים' },
  ];

  const upcomingEvents = industryEvents.filter(e => e.isUpcoming).slice(0, 3);

  // Currently airing - computed client-side only to avoid hydration mismatch
  const [nowPlaying, setNowPlaying] = useState<{ channel: string; color: string; program: ReturnType<typeof getCurrentProgram> }[]>([]);
  useEffect(() => {
    const compute = () => channels.slice(0, 4).map(ch => {
      const schedule = generateSchedule(ch.id);
      return { channel: ch.name, color: ch.color, program: getCurrentProgram(schedule) };
    });
    setNowPlaying(compute());
    const t = setInterval(() => setNowPlaying(compute()), 60000);
    return () => clearInterval(t);
  }, []);

  // Personal dashboard cards data
  const dashboardCards = [
    {
      id: 'status',
      icon: CircleDot,
      label: 'הסטטוס שלי',
      value: 'פנוי לעבודה',
      dotColor: 'bg-green-500',
      dotPing: 'bg-green-400',
      href: '/directory',
      gradient: 'from-green-600 to-emerald-500',
      iconBg: 'bg-green-500/15',
      iconColor: 'text-green-400',
    },
    {
      id: 'jobs',
      icon: Briefcase,
      label: 'משרות פתוחות',
      value: `${mockJobs.length} משרות חדשות`,
      href: '/board',
      gradient: 'from-blue-600 to-cyan-500',
      iconBg: 'bg-blue-500/15',
      iconColor: 'text-blue-400',
    },
    {
      id: 'saved',
      icon: Bookmark,
      label: 'משרות שמורות',
      value: '3 משרות שמורות',
      href: '/board',
      gradient: 'from-amber-600 to-yellow-500',
      iconBg: 'bg-amber-500/15',
      iconColor: 'text-amber-400',
    },
    {
      id: 'messages',
      icon: Mail,
      label: 'הודעות',
      value: '2 הודעות חדשות',
      href: '/chat',
      gradient: 'from-purple-600 to-pink-500',
      iconBg: 'bg-purple-500/15',
      iconColor: 'text-purple-400',
    },
    {
      id: 'production',
      icon: Film,
      label: 'הפקה קרובה',
      value: 'יהיה טוב - יום א\' 05:15',
      href: '/productions',
      gradient: 'from-rose-600 to-pink-500',
      iconBg: 'bg-rose-500/15',
      iconColor: 'text-rose-400',
    },
  ];

  return (
    <div className="min-h-screen" style={{ background: 'var(--theme-bg)' }}>

      {/* ===== Compact Header Bar ===== */}
      <header className="border-b" style={{ borderColor: 'var(--theme-border)' }}>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-4">
          <div className="flex items-center justify-between">
            <motion.div
              initial={{ opacity: 0, x: 10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.4 }}
              className="flex items-center gap-3"
            >
              <div>
                <h1 className="text-xl sm:text-2xl font-black tracking-tight" style={{ color: 'var(--theme-text)' }}>
                  {greeting ? (
                    <>
                      <span className="gradient-text">{greeting}</span>{' '}
                      <span className="text-base sm:text-lg font-bold opacity-60" style={{ color: 'var(--theme-text-secondary)' }}>
                        &#x1f44b;
                      </span>
                    </>
                  ) : (
                    <>
                      <span className="gradient-text">TV Industry</span>{' '}
                      <span style={{ color: 'var(--theme-text)' }}>IL</span>
                    </>
                  )}
                </h1>
                <p className="text-xs mt-0.5" style={{ color: 'var(--theme-text-secondary)' }}>
                  מה חדש בתעשייה היום?
                </p>
              </div>
              <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-semibold border"
                style={{ background: 'var(--theme-accent-glow)', borderColor: 'var(--theme-border)' }}>
                <span className="relative flex h-1.5 w-1.5">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
                  <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-green-500" />
                </span>
                <span style={{ color: 'var(--theme-text-secondary)' }}>LIVE</span>
              </div>
            </motion.div>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.4, delay: 0.1 }}
            >
              <LiveClock />
            </motion.div>
          </div>

          {/* Inline stats bar */}
          <motion.div
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 0.15 }}
            className="flex items-center gap-4 sm:gap-6 mt-3 pt-3 border-t flex-wrap"
            style={{ borderColor: 'var(--theme-border)' }}
          >
            {stats.map((stat) => {
              const Icon = stat.icon;
              const { count, ref } = useCountUp(stat.value, 1500);
              return (
                <div key={stat.label} ref={ref} className="flex items-center gap-2">
                  <div className={`w-2 h-2 rounded-full ${stat.color}`} />
                  <span className="text-sm font-bold" style={{ color: 'var(--theme-text)' }}>{count}</span>
                  <span className="text-xs" style={{ color: 'var(--theme-text-secondary)' }}>{stat.label}</span>
                </div>
              );
            })}
          </motion.div>
        </div>
      </header>

      {/* ===== Live News Ticker ===== */}
      {liveNews.length > 0 && (
        <div className="border-b" style={{ borderColor: 'var(--theme-border)', background: 'var(--theme-bg-card)' }}>
          <div className="max-w-7xl mx-auto flex items-center">
            <div className="bg-gradient-to-l from-purple-600 to-blue-600 px-3 py-2 flex items-center gap-1.5 shrink-0">
              <span className="w-1.5 h-1.5 rounded-full bg-white pulse-live" />
              <span className="text-white font-bold text-xs whitespace-nowrap">חדשות</span>
            </div>
            <div className="overflow-hidden flex-1">
              <div className="ticker-animation whitespace-nowrap py-2 px-4">
                {liveNews.slice(0, 5).map((news, i) => (
                  <span key={`${news.link}-${i}`} className="text-xs" style={{ color: 'var(--theme-text)' }}>
                    <span className="opacity-40">[{news.source}]</span> {news.title}
                    {i < Math.min(liveNews.length, 5) - 1 && <span className="mx-5 opacity-15">|</span>}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="max-w-7xl mx-auto px-4 sm:px-6 pt-4">
        <WeeklyCalendarWidget />
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6 space-y-8">

        {/* ===== Personal Dashboard - האזור שלי ===== */}
        <motion.section
          initial={{ opacity: 0, y: 10 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.4 }}
        >
          <div className="flex items-center gap-2 mb-3">
            <Sparkles className="w-4 h-4 text-amber-400" />
            <h2 className="text-sm font-bold uppercase tracking-wide" style={{ color: 'var(--theme-text-secondary)' }}>האזור שלי</h2>
          </div>
          <div className="flex gap-2.5 overflow-x-auto pb-2 scrollbar-hide md:grid md:grid-cols-5 md:overflow-visible">
            {dashboardCards.map((card, i) => {
              const Icon = card.icon;
              return (
                <motion.div
                  key={card.id}
                  initial={{ opacity: 0, y: 8 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: i * 0.05, duration: 0.3 }}
                  className="min-w-[160px] md:min-w-0 flex-shrink-0 md:flex-shrink"
                >
                  <Link
                    href={card.href}
                    className="group block rounded-xl border p-3.5 transition-all duration-200 hover:shadow-md relative overflow-hidden h-full"
                    style={{ background: 'var(--theme-bg-card)', borderColor: 'var(--theme-border)' }}
                  >
                    <div className={`absolute inset-0 bg-gradient-to-br ${card.gradient} opacity-0 group-hover:opacity-[0.06] transition-opacity duration-200`} />
                    <div className="relative">
                      <div className="flex items-center gap-2 mb-2">
                        <div className={`w-8 h-8 ${card.iconBg} rounded-lg flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform duration-200`}>
                          <Icon className={`w-4 h-4 ${card.iconColor}`} />
                        </div>
                        {card.id === 'status' && card.dotColor && (
                          <span className="relative flex h-2.5 w-2.5 mr-auto">
                            <span className={`animate-ping absolute inline-flex h-full w-full rounded-full ${card.dotPing} opacity-75`} />
                            <span className={`relative inline-flex rounded-full h-2.5 w-2.5 ${card.dotColor}`} />
                          </span>
                        )}
                      </div>
                      <div className="text-[11px] font-medium mb-0.5" style={{ color: 'var(--theme-text-secondary)' }}>
                        {card.label}
                      </div>
                      <div className="text-xs font-bold leading-snug" style={{ color: 'var(--theme-text)' }}>
                        {card.value}
                      </div>
                    </div>
                    <ArrowLeft className="absolute left-2.5 bottom-2.5 w-3.5 h-3.5 opacity-0 group-hover:opacity-50 group-hover:-translate-x-0.5 transition-all" style={{ color: 'var(--theme-accent)' }} />
                  </Link>
                </motion.div>
              );
            })}
          </div>
        </motion.section>

        {/* ===== Now Playing ===== */}
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
            <Link href="/schedule" className="text-xs font-medium flex items-center gap-0.5 mr-auto opacity-60 hover:opacity-100 transition-opacity" style={{ color: 'var(--theme-accent)' }}>
              לוח מלא <ArrowLeft className="w-3 h-3" />
            </Link>
          </div>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
            {nowPlaying.map((item) => (
              <Link key={item.channel} href="/schedule"
                className="group flex items-center gap-3 rounded-lg border px-3 py-2.5 transition-all hover:shadow-sm"
                style={{ background: 'var(--theme-bg-card)', borderColor: 'var(--theme-border)' }}>
                <div className="relative shrink-0">
                  <div className="w-2.5 h-2.5 rounded-full" style={{ background: item.color }} />
                  <div className="absolute inset-0 rounded-full animate-ping opacity-30" style={{ background: item.color }} />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-xs font-bold truncate" style={{ color: 'var(--theme-text)' }}>{item.channel}</div>
                  <div className="text-[11px] truncate" style={{ color: 'var(--theme-text-secondary)' }}>
                    {item.program?.title || 'שידור חי'}
                  </div>
                </div>
                <span className="text-[10px] opacity-50 shrink-0" style={{ color: 'var(--theme-text-secondary)' }}>
                  {item.program?.time || ''}
                </span>
              </Link>
            ))}
          </div>
        </motion.section>

        {/* ===== Navigation Grid ===== */}
        <motion.section
          initial={{ opacity: 0, y: 10 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.4 }}
        >
          <h2 className="text-sm font-bold uppercase tracking-wide mb-3" style={{ color: 'var(--theme-text-secondary)' }}>
            גישה מהירה
          </h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2.5">
            {allNavItems.map((item, i) => {
              const Icon = item.icon;
              return (
                <motion.div
                  key={item.href}
                  initial={{ opacity: 0, y: 8 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: i * 0.03, duration: 0.3 }}
                >
                  <Link href={item.href}
                    className="group flex items-start gap-3 rounded-xl border p-3.5 transition-all duration-200 hover:shadow-md relative overflow-hidden"
                    style={{ background: 'var(--theme-bg-card)', borderColor: 'var(--theme-border)' }}>
                    <div className={`absolute inset-0 bg-gradient-to-br ${item.gradient} opacity-0 group-hover:opacity-[0.04] transition-opacity duration-200`} />
                    <div className="relative flex flex-col flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <div className={`w-8 h-8 ${item.iconBg} rounded-lg flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform duration-200`}>
                          <Icon className="w-4 h-4" style={{ color: 'var(--theme-accent)' }} />
                        </div>
                        <div className="min-w-0">
                          <h3 className="font-bold text-sm leading-tight" style={{ color: 'var(--theme-text)' }}>{item.label}</h3>
                        </div>
                        <ArrowLeft className="w-3.5 h-3.5 shrink-0 opacity-0 group-hover:opacity-60 group-hover:-translate-x-0.5 transition-all mr-auto" style={{ color: 'var(--theme-accent)' }} />
                      </div>
                      <p className="text-[11px] leading-snug line-clamp-1 pr-10" style={{ color: 'var(--theme-text-secondary)' }}>{item.desc}</p>
                      <span className="text-[10px] mt-1.5 px-2 py-0.5 rounded-full font-medium self-start"
                        style={{ background: 'var(--theme-bg-secondary)', color: 'var(--theme-text-secondary)' }}>
                        {item.preview}
                      </span>
                    </div>
                  </Link>
                </motion.div>
              );
            })}
          </div>
        </motion.section>

        {/* ===== Latest News (Live from API) ===== */}
        <motion.section
          initial={{ opacity: 0, y: 10 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.4 }}
        >
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-bold uppercase tracking-wide flex items-center gap-2" style={{ color: 'var(--theme-text-secondary)' }}>
              <TrendingUp className="w-4 h-4 text-purple-400" />
              חדשות אחרונות
              {liveNews.length > 0 && (
                <span className="flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-green-500/10 text-green-400 text-[10px] font-semibold normal-case">
                  <span className="relative flex h-1.5 w-1.5"><span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" /><span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-green-500" /></span>
                  LIVE
                </span>
              )}
            </h2>
            <Link href="/news" className="text-xs font-medium flex items-center gap-1 opacity-60 hover:opacity-100 transition-opacity" style={{ color: 'var(--theme-accent)' }}>
              כל החדשות <ArrowLeft className="w-3.5 h-3.5" />
            </Link>
          </div>

          {liveNews.length > 0 ? (
            <div className="grid grid-cols-1 lg:grid-cols-5 gap-3">
              {/* Featured article */}
              <Link href="/news" className="lg:col-span-2 rounded-xl border p-4 transition-all hover:shadow-sm block"
                style={{ background: 'var(--theme-bg-card)', borderColor: 'var(--theme-border)' }}>
                <div className="flex items-center gap-2 mb-2">
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-purple-500/15 text-purple-300 border border-purple-500/20">
                    {liveNews[0].source}
                  </span>
                  <span className="text-[10px]" style={{ color: 'var(--theme-text-secondary)' }}>
                    {(() => { try { const d = new Date(liveNews[0].pubDate); const diff = Math.floor((Date.now() - d.getTime()) / 60000); return diff < 60 ? `לפני ${diff} דקות` : diff < 1440 ? `לפני ${Math.floor(diff/60)} שעות` : d.toLocaleDateString('he-IL'); } catch { return ''; } })()}
                  </span>
                </div>
                <h3 className="font-bold text-base mb-2 leading-snug" style={{ color: 'var(--theme-text)' }}>{liveNews[0].title}</h3>
                {liveNews[0].description && (
                  <p className="text-xs leading-relaxed mb-3 line-clamp-2" style={{ color: 'var(--theme-text-secondary)' }}>{liveNews[0].description}</p>
                )}
                <div className="flex items-center gap-1 text-[11px]" style={{ color: 'var(--theme-accent)' }}>
                  <Globe className="w-3 h-3" />
                  <span>קרא עוד</span>
                </div>
              </Link>

              {/* Rest as compact list */}
              <div className="lg:col-span-3 space-y-2">
                {liveNews.slice(1, 5).map((news, idx) => (
                  <Link key={`${news.link}-${idx}`} href="/news"
                    className="block rounded-lg border px-3.5 py-2.5 transition-all hover:shadow-sm"
                    style={{ background: 'var(--theme-bg-card)', borderColor: 'var(--theme-border)' }}>
                    <div className="flex items-start gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5 mb-0.5">
                          <span className="text-[10px] px-1.5 py-0.5 rounded-full font-medium bg-blue-500/10 text-blue-300">
                            {news.source}
                          </span>
                        </div>
                        <h3 className="font-semibold text-sm leading-tight line-clamp-1" style={{ color: 'var(--theme-text)' }}>{news.title}</h3>
                        {news.description && (
                          <p className="text-[11px] line-clamp-1 mt-0.5" style={{ color: 'var(--theme-text-secondary)' }}>{news.description}</p>
                        )}
                      </div>
                      <div className="text-[10px] whitespace-nowrap shrink-0 pt-1 opacity-50" style={{ color: 'var(--theme-text-secondary)' }}>
                        {(() => { try { const d = new Date(news.pubDate); const diff = Math.floor((Date.now() - d.getTime()) / 60000); return diff < 60 ? `${diff} דק'` : diff < 1440 ? `${Math.floor(diff/60)} שע'` : d.toLocaleDateString('he-IL', { day: 'numeric', month: 'short' }); } catch { return ''; } })()}
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          ) : (
            /* Skeleton while loading */
            <div className="grid grid-cols-1 lg:grid-cols-5 gap-3">
              <div className="lg:col-span-2 rounded-xl border p-4 animate-pulse" style={{ background: 'var(--theme-bg-card)', borderColor: 'var(--theme-border)' }}>
                <div className="h-4 w-20 rounded-full skeleton-shimmer mb-3" />
                <div className="h-5 w-3/4 rounded skeleton-shimmer mb-2" />
                <div className="h-3 w-full rounded skeleton-shimmer mb-1.5" />
                <div className="h-3 w-2/3 rounded skeleton-shimmer" />
              </div>
              <div className="lg:col-span-3 space-y-2">
                {[1,2,3].map(i => (
                  <div key={i} className="rounded-lg border px-3.5 py-2.5 animate-pulse" style={{ background: 'var(--theme-bg-card)', borderColor: 'var(--theme-border)' }}>
                    <div className="h-3 w-16 rounded-full skeleton-shimmer mb-1.5" />
                    <div className="h-4 w-3/4 rounded skeleton-shimmer" />
                  </div>
                ))}
              </div>
            </div>
          )}
        </motion.section>

        {/* ===== Upcoming Events ===== */}
        <motion.section
          initial={{ opacity: 0, y: 10 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.4 }}
          className="pb-10"
        >
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-bold uppercase tracking-wide flex items-center gap-2" style={{ color: 'var(--theme-text-secondary)' }}>
              <Calendar className="w-4 h-4 text-blue-400" />
              אירועים קרובים
            </h2>
            <Link href="/news" className="text-xs font-medium flex items-center gap-1 opacity-60 hover:opacity-100 transition-opacity" style={{ color: 'var(--theme-accent)' }}>
              כל האירועים <ArrowLeft className="w-3.5 h-3.5" />
            </Link>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-2.5">
            {upcomingEvents.map((event, i) => (
              <motion.div
                key={event.id}
                initial={{ opacity: 0, y: 8 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.06, duration: 0.3 }}
              >
                <div className="rounded-xl border p-3.5 transition-colors"
                  style={{ background: 'var(--theme-bg-card)', borderColor: 'var(--theme-border)' }}>
                  <div className="flex items-start gap-3">
                    <div className="bg-blue-500/10 rounded-lg p-2 text-center shrink-0 min-w-[44px]">
                      <div className="text-lg font-black text-blue-400 leading-none">{new Date(event.date).getDate()}</div>
                      <div className="text-[10px] text-blue-300 mt-0.5">{new Date(event.date).toLocaleDateString('he-IL', { month: 'short' })}</div>
                    </div>
                    <div className="flex-1 min-w-0">
                      <span className={`inline-block px-1.5 py-0.5 rounded-full text-[10px] font-medium mb-1 ${
                        event.category === 'festival' ? 'bg-yellow-500/15 text-yellow-300' :
                        event.category === 'conference' ? 'bg-blue-500/15 text-blue-300' :
                        event.category === 'premiere' ? 'bg-purple-500/15 text-purple-300' :
                        event.category === 'workshop' ? 'bg-emerald-500/15 text-emerald-300' :
                        'bg-orange-500/15 text-orange-300'
                      }`}>
                        {categoryLabels[event.category]}
                      </span>
                      <h3 className="font-bold text-sm leading-tight mb-0.5" style={{ color: 'var(--theme-text)' }}>{event.title}</h3>
                      <p className="text-[11px] flex items-center gap-1" style={{ color: 'var(--theme-text-secondary)' }}>
                        <MapPin className="w-3 h-3 shrink-0 opacity-50" />
                        <span className="truncate">{event.location}</span>
                      </p>
                    </div>
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        </motion.section>
      </div>
    </div>
  );
}
