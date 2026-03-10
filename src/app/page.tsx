'use client';

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { contacts } from '@/data/contacts';
import { channels, generateSchedule, getCurrentProgram } from '@/data/channels';
import { industryEvents, categoryLabels } from '@/data/news';
import { motion, useInView } from 'framer-motion';
import {
  Calendar, Users, Newspaper, Building2, Tv, TrendingUp, Radio, Zap,
  ArrowLeft, Clock, MapPin, Tag, MessageCircle, Megaphone, Wrench,
  Play, Sparkles, Signal, ChevronDown, Globe
} from 'lucide-react';

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
      <div className="flex items-center gap-3 text-sm h-5" style={{ color: 'var(--theme-text-secondary)' }}>
        <div className="flex items-center gap-1.5">
          <Clock className="w-4 h-4" />
          <span className="font-mono font-bold" dir="ltr">&nbsp;</span>
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-3 text-sm" style={{ color: 'var(--theme-text-secondary)' }}>
      <div className="flex items-center gap-1.5">
        <Clock className="w-4 h-4" />
        <span className="font-mono font-bold" dir="ltr">{now.toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</span>
      </div>
      <span className="opacity-40">|</span>
      <span>{now.toLocaleDateString('he-IL', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</span>
    </div>
  );
}

export default function HomePage() {
  const availableCount = contacts.filter(c => c.availability === 'available').length;
  const uniqueDepts = new Set(contacts.map(c => c.department)).size;

  // Real-time news from API
  const [liveNews, setLiveNews] = useState<RssNewsItem[]>([]);
  useEffect(() => {
    fetch('/api/news')
      .then(r => r.json())
      .then(data => { if (data.success && data.items) setLiveNews(data.items.slice(0, 6)); })
      .catch(() => {});
  }, []);

  const stats = [
    { label: 'אנשי מקצוע', value: contacts.length, icon: Users, color: 'from-purple-500 to-violet-600' },
    { label: 'זמינים לעבודה', value: availableCount, icon: Zap, color: 'from-green-500 to-emerald-600' },
    { label: 'ערוצי טלוויזיה', value: channels.length, icon: Tv, color: 'from-blue-500 to-cyan-600' },
    { label: 'מחלקות', value: uniqueDepts, icon: Radio, color: 'from-orange-500 to-amber-600' },
  ];

  const newsCount = liveNews.length || 0;
  const allNavItems = [
    { href: '/schedule', label: 'לוח שידורים', desc: 'לוח שידורים חי של כל הערוצים', icon: Calendar, gradient: 'from-blue-600 to-cyan-500', iconBg: 'bg-blue-500/15', preview: `${channels.length} ערוצים` },
    { href: '/directory', label: 'אלפון מקצועי', desc: `${contacts.length} אנשי מקצוע • ${availableCount} זמינים`, icon: Users, gradient: 'from-purple-600 to-pink-500', iconBg: 'bg-purple-500/15', preview: `${uniqueDepts} מחלקות` },
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

  return (
    <div className="min-h-screen">
      {/* ===== Hero Section ===== */}
      <section className="relative overflow-hidden min-h-[70vh] flex items-center">
        {/* Animated background */}
        <div className="absolute inset-0">
          <div className="absolute inset-0 animated-gradient" style={{ background: 'linear-gradient(135deg, rgba(88,28,135,0.25) 0%, var(--theme-bg) 40%, rgba(30,58,138,0.2) 70%, var(--theme-bg) 100%)' }} />
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,rgba(139,92,246,0.12),transparent_50%)]" />
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_bottom_left,rgba(59,130,246,0.08),transparent_50%)]" />
          {/* Floating orbs */}
          <div className="absolute top-20 right-[15%] w-64 h-64 rounded-full bg-purple-500/5 blur-3xl animate-pulse" />
          <div className="absolute bottom-20 left-[10%] w-80 h-80 rounded-full bg-blue-500/5 blur-3xl animate-pulse" style={{ animationDelay: '1s' }} />
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-96 rounded-full bg-indigo-500/3 blur-3xl animate-pulse" style={{ animationDelay: '2s' }} />
        </div>

        <div className="relative w-full max-w-7xl mx-auto px-4 sm:px-6 py-16 sm:py-24">
          <div className="text-center max-w-4xl mx-auto">
            {/* Live badge */}
            <motion.div
              initial={{ opacity: 0, y: -20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5 }}
              className="flex justify-center mb-6"
            >
              <div className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full border backdrop-blur-sm"
                style={{ background: 'var(--theme-accent-glow)', borderColor: 'var(--theme-border)' }}>
                <span className="relative flex h-2.5 w-2.5">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
                  <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-green-500" />
                </span>
                <Signal className="w-4 h-4" style={{ color: 'var(--theme-accent)' }} />
                <span className="text-sm font-bold" style={{ color: 'var(--theme-text)' }}>הפלטפורמה המובילה לתעשיית הטלוויזיה</span>
              </div>
            </motion.div>

            {/* Title */}
            <motion.h1
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.1 }}
              className="text-6xl sm:text-8xl font-black mb-6 leading-[1.1]"
            >
              <span className="gradient-text">TV Industry</span>
              <br />
              <span className="transition-colors relative" style={{ color: 'var(--theme-text)' }}>
                IL
                <Sparkles className="inline-block w-8 h-8 mr-2 text-yellow-400 animate-pulse" />
              </span>
            </motion.h1>

            {/* Subtitle */}
            <motion.p
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.2 }}
              className="text-lg sm:text-xl leading-relaxed mb-8 max-w-2xl mx-auto transition-colors"
              style={{ color: 'var(--theme-text-secondary)' }}
            >
              לוח שידורים חי, אלפון {contacts.length} אנשי מקצוע, צ&apos;אט, חדשות בזמן אמת,
              לוח מודעות וכלים מקצועיים — הכל במקום אחד.
            </motion.p>

            {/* CTA Buttons */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.3 }}
              className="flex flex-col sm:flex-row items-center justify-center gap-4 mb-8"
            >
              <Link href="/schedule" className="group w-full sm:w-auto px-8 py-4 rounded-2xl bg-gradient-to-l from-purple-600 to-blue-600 text-white font-bold text-lg hover:shadow-xl hover:shadow-purple-500/25 transition-all hover:scale-105 flex items-center justify-center gap-2">
                <Play className="w-5 h-5 group-hover:scale-110 transition-transform" />
                לוח שידורים חי
              </Link>
              <Link href="/directory" className="w-full sm:w-auto px-8 py-4 rounded-2xl font-bold text-lg transition-all border hover:scale-105 flex items-center justify-center gap-2"
                style={{ background: 'var(--theme-bg-card)', borderColor: 'var(--theme-border)', color: 'var(--theme-text)' }}>
                <Users className="w-5 h-5" />
                אלפון מקצועי
              </Link>
              <Link href="/chat" className="w-full sm:w-auto px-8 py-4 rounded-2xl font-bold text-lg transition-all border hover:scale-105 flex items-center justify-center gap-2"
                style={{ background: 'var(--theme-bg-card)', borderColor: 'var(--theme-border)', color: 'var(--theme-text)' }}>
                <MessageCircle className="w-5 h-5" />
                צ&apos;אט
              </Link>
            </motion.div>

            {/* Live clock */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.6, delay: 0.5 }}
              className="flex justify-center"
            >
              <LiveClock />
            </motion.div>
          </div>
        </div>

        {/* Scroll indicator */}
        <div className="absolute bottom-6 left-1/2 -translate-x-1/2 animate-bounce">
          <ChevronDown className="w-6 h-6" style={{ color: 'var(--theme-text-secondary)', opacity: 0.5 }} />
        </div>
      </section>

      {/* ===== Animated Stats ===== */}
      <section className="relative -mt-6 z-10 max-w-6xl mx-auto px-4 sm:px-6">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-5">
          {stats.map((stat, i) => {
            const Icon = stat.icon;
            const { count, ref } = useCountUp(stat.value);
            return (
              <motion.div
                key={stat.label}
                initial={{ opacity: 0, y: 30 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.1, duration: 0.5 }}
              >
                <div ref={ref} className="backdrop-blur-xl rounded-2xl border p-5 sm:p-6 text-center card-glow transition-colors group cursor-default"
                  style={{ background: 'var(--theme-bg-card)', borderColor: 'var(--theme-border)' }}>
                  <div className={`w-12 h-12 mx-auto mb-3 rounded-xl bg-gradient-to-br ${stat.color} flex items-center justify-center shadow-lg group-hover:scale-110 transition-transform`}>
                    <Icon className="w-6 h-6 text-white" />
                  </div>
                  <div className="text-3xl sm:text-4xl font-black mb-1 transition-colors" style={{ color: 'var(--theme-text)' }}>
                    {count}
                  </div>
                  <div className="text-xs sm:text-sm font-medium transition-colors" style={{ color: 'var(--theme-text-secondary)' }}>{stat.label}</div>
                </div>
              </motion.div>
            );
          })}
        </div>
      </section>

      {/* ===== Live News Ticker ===== */}
      {liveNews.length > 0 && (
        <section className="mt-10 max-w-7xl mx-auto px-4 sm:px-6">
          <div className="rounded-xl overflow-hidden border" style={{ background: 'var(--theme-bg-card)', borderColor: 'var(--theme-border)' }}>
            <div className="flex items-center">
              <div className="bg-gradient-to-l from-purple-600 to-blue-600 px-4 py-2.5 flex items-center gap-2 shrink-0">
                <span className="w-2 h-2 rounded-full bg-white pulse-live" />
                <span className="text-white font-bold text-sm whitespace-nowrap">חדשות חמות</span>
              </div>
              <div className="overflow-hidden flex-1">
                <div className="ticker-animation whitespace-nowrap py-2.5 px-4">
                  {liveNews.slice(0, 5).map((news, i) => (
                    <span key={`${news.link}-${i}`} className="text-sm" style={{ color: 'var(--theme-text)' }}>
                      <span className="opacity-50 text-xs">[{news.source}]</span> {news.title}
                      {i < Math.min(liveNews.length, 5) - 1 && <span className="mx-6 opacity-20">|</span>}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </section>
      )}

      {/* ===== Now Playing ===== */}
      <section className="mt-10 max-w-7xl mx-auto px-4 sm:px-6">
        <motion.div initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ duration: 0.5 }}>
          <div className="flex items-center gap-3 mb-4">
            <div className="flex items-center gap-2">
              <span className="relative flex h-2.5 w-2.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-red-500" />
              </span>
              <h2 className="text-xl font-bold" style={{ color: 'var(--theme-text)' }}>עכשיו בשידור</h2>
            </div>
            <Link href="/schedule" className="text-xs font-medium flex items-center gap-1 mr-auto" style={{ color: 'var(--theme-accent)' }}>
              לוח מלא <ArrowLeft className="w-3 h-3" />
            </Link>
          </div>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {nowPlaying.map((item) => (
              <Link key={item.channel} href="/schedule"
                className="group rounded-xl border p-4 transition-all hover:scale-[1.02] hover:shadow-lg"
                style={{ background: 'var(--theme-bg-card)', borderColor: 'var(--theme-border)' }}>
                <div className="flex items-center gap-2 mb-2">
                  <div className="w-3 h-3 rounded-full shrink-0" style={{ background: item.color }} />
                  <span className="text-sm font-bold truncate" style={{ color: 'var(--theme-text)' }}>{item.channel}</span>
                </div>
                <p className="text-xs truncate" style={{ color: 'var(--theme-text-secondary)' }}>
                  {item.program?.title || 'שידור חי'}
                </p>
                <p className="text-[10px] mt-1" style={{ color: 'var(--theme-text-secondary)', opacity: 0.6 }}>
                  {item.program?.time || ''}
                </p>
              </Link>
            ))}
          </div>
        </motion.div>
      </section>

      {/* ===== Navigation Grid ===== */}
      <section className="mt-14 max-w-7xl mx-auto px-4 sm:px-6">
        <motion.div initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ duration: 0.5 }}>
          <h2 className="text-2xl font-bold mb-6 flex items-center gap-2" style={{ color: 'var(--theme-text)' }}>
            <Sparkles className="w-5 h-5" style={{ color: 'var(--theme-accent)' }} />
            גישה מהירה
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {allNavItems.map((item, i) => {
              const Icon = item.icon;
              return (
                <motion.div
                  key={item.href}
                  initial={{ opacity: 0, y: 20 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: i * 0.05, duration: 0.4 }}
                >
                  <Link href={item.href}
                    className="group block rounded-2xl border p-5 transition-all duration-300 hover:scale-[1.03] hover:shadow-xl relative overflow-hidden"
                    style={{ background: 'var(--theme-bg-card)', borderColor: 'var(--theme-border)' }}>
                    {/* Gradient hover background */}
                    <div className={`absolute inset-0 bg-gradient-to-br ${item.gradient} opacity-0 group-hover:opacity-[0.06] transition-opacity duration-300`} />

                    <div className="relative">
                      <div className={`w-14 h-14 ${item.iconBg} rounded-2xl flex items-center justify-center mb-4 group-hover:scale-110 transition-transform duration-300`}>
                        <Icon className={`w-7 h-7 bg-gradient-to-br ${item.gradient} bg-clip-text`} style={{ color: 'var(--theme-accent)' }} />
                      </div>
                      <h3 className="font-bold text-lg mb-1 transition-colors" style={{ color: 'var(--theme-text)' }}>{item.label}</h3>
                      <p className="text-sm leading-relaxed mb-3 transition-colors" style={{ color: 'var(--theme-text-secondary)' }}>{item.desc}</p>
                      <div className="flex items-center justify-between">
                        <span className="text-[11px] px-2.5 py-1 rounded-full font-medium"
                          style={{ background: 'var(--theme-bg-secondary)', color: 'var(--theme-text-secondary)' }}>
                          {item.preview}
                        </span>
                        <ArrowLeft className="w-4 h-4 group-hover:-translate-x-1 transition-transform" style={{ color: 'var(--theme-accent)' }} />
                      </div>
                    </div>
                  </Link>
                </motion.div>
              );
            })}
          </div>
        </motion.div>
      </section>

      {/* ===== Latest News (Live from API) ===== */}
      <section className="mt-16 max-w-7xl mx-auto px-4 sm:px-6">
        <motion.div initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ duration: 0.5 }}>
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-2xl font-bold flex items-center gap-3 transition-colors" style={{ color: 'var(--theme-text)' }}>
              <TrendingUp className="w-6 h-6 text-purple-400" />
              חדשות אחרונות
              {liveNews.length > 0 && (
                <span className="flex items-center gap-1.5 px-2 py-1 rounded-full bg-green-500/10 text-green-400 text-xs font-medium">
                  <span className="relative flex h-1.5 w-1.5"><span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" /><span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-green-500" /></span>
                  LIVE
                </span>
              )}
            </h2>
            <Link href="/news" className="text-sm font-medium flex items-center gap-1 transition-colors hover:gap-2" style={{ color: 'var(--theme-accent)' }}>
              כל החדשות <ArrowLeft className="w-4 h-4" />
            </Link>
          </div>

          {/* Live news from API */}
          {liveNews.length > 0 ? (
            <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
              {/* Featured article */}
              <Link href="/news" className="lg:col-span-2 rounded-2xl border p-6 card-glow transition-all hover:scale-[1.01] block"
                style={{ background: 'var(--theme-bg-card)', borderColor: 'var(--theme-border)' }}>
                <div className="flex items-center gap-2 mb-3">
                  <span className="px-2.5 py-1 rounded-full text-xs font-medium bg-purple-500/15 text-purple-300 border border-purple-500/20">
                    {liveNews[0].source}
                  </span>
                  <span className="text-xs" style={{ color: 'var(--theme-text-secondary)' }}>
                    {(() => { try { const d = new Date(liveNews[0].pubDate); const diff = Math.floor((Date.now() - d.getTime()) / 60000); return diff < 60 ? `לפני ${diff} דקות` : diff < 1440 ? `לפני ${Math.floor(diff/60)} שעות` : d.toLocaleDateString('he-IL'); } catch { return ''; } })()}
                  </span>
                </div>
                <h3 className="font-black text-xl mb-3 leading-tight" style={{ color: 'var(--theme-text)' }}>{liveNews[0].title}</h3>
                {liveNews[0].description && (
                  <p className="text-sm leading-relaxed mb-4" style={{ color: 'var(--theme-text-secondary)' }}>{liveNews[0].description}</p>
                )}
                <div className="flex items-center gap-1.5 text-xs" style={{ color: 'var(--theme-accent)' }}>
                  <Globe className="w-3.5 h-3.5" />
                  <span>קרא עוד</span>
                </div>
              </Link>

              {/* Rest as list */}
              <div className="lg:col-span-3 space-y-3">
                {liveNews.slice(1, 5).map((news, idx) => (
                  <Link key={`${news.link}-${idx}`} href="/news"
                    className="block rounded-xl border p-4 card-glow transition-all hover:scale-[1.01]"
                    style={{ background: 'var(--theme-bg-card)', borderColor: 'var(--theme-border)' }}>
                    <div className="flex items-start gap-4">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-[10px] px-2 py-0.5 rounded-full font-medium bg-blue-500/10 text-blue-300">
                            {news.source}
                          </span>
                        </div>
                        <h3 className="font-bold mb-1 leading-tight line-clamp-2" style={{ color: 'var(--theme-text)' }}>{news.title}</h3>
                        {news.description && (
                          <p className="text-xs line-clamp-1" style={{ color: 'var(--theme-text-secondary)' }}>{news.description}</p>
                        )}
                      </div>
                      <div className="text-[10px] whitespace-nowrap shrink-0 pt-1" style={{ color: 'var(--theme-text-secondary)', opacity: 0.6 }}>
                        {(() => { try { const d = new Date(news.pubDate); const diff = Math.floor((Date.now() - d.getTime()) / 60000); return diff < 60 ? `${diff} דק'` : diff < 1440 ? `${Math.floor(diff/60)} שע'` : d.toLocaleDateString('he-IL', { day: 'numeric', month: 'short' }); } catch { return ''; } })()}
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          ) : (
            /* Skeleton while loading */
            <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
              <div className="lg:col-span-2 rounded-2xl border p-6 animate-pulse" style={{ background: 'var(--theme-bg-card)', borderColor: 'var(--theme-border)' }}>
                <div className="h-5 w-24 rounded-full skeleton-shimmer mb-4" />
                <div className="h-6 w-3/4 rounded skeleton-shimmer mb-3" />
                <div className="h-4 w-full rounded skeleton-shimmer mb-2" />
                <div className="h-4 w-2/3 rounded skeleton-shimmer" />
              </div>
              <div className="lg:col-span-3 space-y-3">
                {[1,2,3].map(i => (
                  <div key={i} className="rounded-xl border p-4 animate-pulse" style={{ background: 'var(--theme-bg-card)', borderColor: 'var(--theme-border)' }}>
                    <div className="h-4 w-20 rounded-full skeleton-shimmer mb-2" />
                    <div className="h-5 w-3/4 rounded skeleton-shimmer mb-1" />
                    <div className="h-3 w-1/2 rounded skeleton-shimmer" />
                  </div>
                ))}
              </div>
            </div>
          )}
        </motion.div>
      </section>

      {/* ===== Events ===== */}
      <section className="mt-14 mb-20 max-w-7xl mx-auto px-4 sm:px-6">
        <motion.div initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ duration: 0.5 }}>
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-2xl font-bold flex items-center gap-3" style={{ color: 'var(--theme-text)' }}>
              <Calendar className="w-6 h-6 text-blue-400" />
              אירועים קרובים
            </h2>
            <Link href="/news" className="text-sm font-medium flex items-center gap-1 hover:gap-2 transition-all" style={{ color: 'var(--theme-accent)' }}>
              כל האירועים <ArrowLeft className="w-4 h-4" />
            </Link>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {upcomingEvents.map((event, i) => (
              <motion.div
                key={event.id}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.1, duration: 0.4 }}
              >
                <div className="rounded-2xl border p-5 card-glow transition-colors"
                  style={{ background: 'var(--theme-bg-card)', borderColor: 'var(--theme-border)' }}>
                  <div className="flex items-start gap-4">
                    <div className="bg-blue-500/10 rounded-xl p-3 text-center shrink-0">
                      <div className="text-2xl font-black text-blue-400">{new Date(event.date).getDate()}</div>
                      <div className="text-xs text-blue-300">{new Date(event.date).toLocaleDateString('he-IL', { month: 'short' })}</div>
                    </div>
                    <div className="flex-1 min-w-0">
                      <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium mb-2 ${
                        event.category === 'festival' ? 'bg-yellow-500/15 text-yellow-300' :
                        event.category === 'conference' ? 'bg-blue-500/15 text-blue-300' :
                        event.category === 'premiere' ? 'bg-purple-500/15 text-purple-300' :
                        event.category === 'workshop' ? 'bg-emerald-500/15 text-emerald-300' :
                        'bg-orange-500/15 text-orange-300'
                      }`}>
                        {categoryLabels[event.category]}
                      </span>
                      <h3 className="font-bold mb-1 leading-tight" style={{ color: 'var(--theme-text)' }}>{event.title}</h3>
                      <p className="text-sm flex items-center gap-1" style={{ color: 'var(--theme-text-secondary)' }}>
                        <MapPin className="w-3 h-3 shrink-0" />
                        <span className="truncate">{event.location}</span>
                      </p>
                    </div>
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        </motion.div>
      </section>
    </div>
  );
}
