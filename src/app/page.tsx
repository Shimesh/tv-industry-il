'use client';

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { useContacts } from '@/hooks/useContacts';
import { channels, generateSchedule, getCurrentProgram } from '@/data/channels';
import { industryEvents, categoryLabels } from '@/data/news';
import { motion, useInView } from 'framer-motion';
import {
  Calendar, Users, Newspaper, Building2, Tv, Radio, Zap,
  ArrowLeft, Clock, MapPin, MessageCircle, Megaphone, Wrench,
  Sparkles, Globe, TrendingUp, Play
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
  const currentRef = useRef(0);

  useEffect(() => {
    if (!inView) return;
    const from = currentRef.current;
    const range = target - from;
    if (range === 0) return;
    let elapsed = 0;
    const timer = setInterval(() => {
      elapsed += 16;
      const progress = Math.min(elapsed / duration, 1);
      const val = Math.floor(from + range * progress);
      currentRef.current = val;
      setCount(val);
      if (progress >= 1) { currentRef.current = target; setCount(target); clearInterval(timer); }
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

  if (!now) return <div className="h-5" />;

  return (
    <span className="text-xs font-mono opacity-60" dir="ltr">
      {now.toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' })}
      {' · '}
      {now.toLocaleDateString('he-IL', { weekday: 'long', day: 'numeric', month: 'long' })}
    </span>
  );
}

export default function HomePage() {
  const { contacts: contactsList } = useContacts();
  const availableCount = contactsList.filter(c => c.availability === 'available').length;
  const uniqueDepts = new Set(contactsList.map(c => c.department)).size;

  const [liveNews, setLiveNews] = useState<RssNewsItem[]>([]);
  useEffect(() => {
    fetch('/api/news')
      .then(r => r.json())
      .then(data => { if (data.success && data.items) setLiveNews(data.items.slice(0, 6)); })
      .catch(() => {});
  }, []);

  const upcomingEvents = industryEvents.filter(e => e.isUpcoming).slice(0, 3);

  const [nowPlaying, setNowPlaying] = useState<{ channel: string; color: string; program: ReturnType<typeof getCurrentProgram> }[]>([]);
  useEffect(() => {
    const compute = () => channels.slice(0, 6).map(ch => {
      const schedule = generateSchedule(ch.id);
      return { channel: ch.name, color: ch.color, program: getCurrentProgram(schedule) };
    });
    setNowPlaying(compute());
    const t = setInterval(() => setNowPlaying(compute()), 60000);
    return () => clearInterval(t);
  }, []);

  const profCount = useCountUp(contactsList.length, 1200);
  const availCount = useCountUp(availableCount, 1200);
  const channelCount = useCountUp(channels.length, 1200);

  return (
    <div className="min-h-screen" style={{ background: 'var(--theme-bg)' }}>

      {/* ===== Hero Section with gradient ===== */}
      <section className="relative overflow-hidden">
        {/* Animated gradient bg */}
        <div className="absolute inset-0">
          <div className="absolute inset-0 bg-gradient-to-br from-purple-900/30 via-blue-900/20 to-transparent" />
          <div className="absolute top-0 left-1/4 w-96 h-96 bg-purple-600/10 rounded-full blur-3xl" />
          <div className="absolute bottom-0 right-1/4 w-80 h-80 bg-blue-600/8 rounded-full blur-3xl" />
        </div>

        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 py-10 sm:py-14">
          <motion.div
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
          >
            <div className="flex items-center gap-3 mb-1">
              <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-semibold bg-green-500/10 border border-green-500/20">
                <span className="relative flex h-1.5 w-1.5">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
                  <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-green-500" />
                </span>
                <span className="text-green-400">LIVE</span>
              </div>
              <LiveClock />
            </div>

            <h1 className="text-4xl sm:text-5xl font-black tracking-tight mt-4 leading-tight">
              <span className="bg-gradient-to-l from-purple-400 via-blue-400 to-purple-300 bg-clip-text text-transparent">
                TV Industry
              </span>{' '}
              <span style={{ color: 'var(--theme-text)' }}>IL</span>
            </h1>
            <p className="text-base sm:text-lg mt-2 max-w-lg" style={{ color: 'var(--theme-text-secondary)' }}>
              הפלטפורמה של תעשיית הטלוויזיה הישראלית
            </p>
          </motion.div>

          {/* Stats cards */}
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 0.15 }}
            className="grid grid-cols-3 gap-3 mt-8 max-w-lg"
          >
            <div ref={profCount.ref} className="rounded-2xl p-4 text-center" style={{ background: 'rgba(139, 92, 246, 0.08)', border: '1px solid rgba(139, 92, 246, 0.15)' }}>
              <Users className="w-5 h-5 mx-auto mb-1.5 text-purple-400" />
              <div className="text-2xl font-black text-purple-300">{profCount.count}</div>
              <div className="text-[11px] text-purple-400/70">אנשי מקצוע</div>
            </div>
            <div ref={availCount.ref} className="rounded-2xl p-4 text-center" style={{ background: 'rgba(34, 197, 94, 0.08)', border: '1px solid rgba(34, 197, 94, 0.15)' }}>
              <Zap className="w-5 h-5 mx-auto mb-1.5 text-green-400" />
              <div className="text-2xl font-black text-green-300">{availCount.count}</div>
              <div className="text-[11px] text-green-400/70">זמינים</div>
            </div>
            <div ref={channelCount.ref} className="rounded-2xl p-4 text-center" style={{ background: 'rgba(59, 130, 246, 0.08)', border: '1px solid rgba(59, 130, 246, 0.15)' }}>
              <Tv className="w-5 h-5 mx-auto mb-1.5 text-blue-400" />
              <div className="text-2xl font-black text-blue-300">{channelCount.count}</div>
              <div className="text-[11px] text-blue-400/70">ערוצים</div>
            </div>
          </motion.div>
        </div>
      </section>

      {/* ===== Live News Ticker ===== */}
      {liveNews.length > 0 && (
        <div className="border-y" style={{ borderColor: 'var(--theme-border)', background: 'var(--theme-bg-card)' }}>
          <div className="max-w-7xl mx-auto flex items-center">
            <div className="bg-gradient-to-l from-red-600 to-red-700 px-3 py-2 flex items-center gap-1.5 shrink-0">
              <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
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

      {/* ===== Weekly Calendar Widget (below RSS ticker) ===== */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 pt-6">
        <WeeklyCalendarWidget />
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8 space-y-10">

        {/* ===== Now Playing ===== */}
        <motion.section
          initial={{ opacity: 0, y: 10 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.4 }}
        >
          <div className="flex items-center gap-2 mb-4">
            <span className="relative flex h-2.5 w-2.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-red-500" />
            </span>
            <h2 className="text-base font-black" style={{ color: 'var(--theme-text)' }}>עכשיו בשידור</h2>
            <Link href="/schedule" className="text-xs font-medium flex items-center gap-0.5 mr-auto opacity-50 hover:opacity-100 transition-opacity" style={{ color: 'var(--theme-accent)' }}>
              לוח שידורים <ArrowLeft className="w-3 h-3" />
            </Link>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5">
            {nowPlaying.map((item) => (
              <Link key={item.channel} href="/schedule"
                className="group rounded-xl border p-3 transition-all hover:shadow-md relative overflow-hidden"
                style={{ background: 'var(--theme-bg-card)', borderColor: 'var(--theme-border)' }}>
                <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300" style={{ background: `linear-gradient(135deg, ${item.color}10, transparent)` }} />
                <div className="relative">
                  <div className="flex items-center gap-2 mb-2">
                    <div className="w-3 h-3 rounded-full relative shrink-0" style={{ background: item.color }}>
                      <div className="absolute inset-0 rounded-full animate-ping opacity-30" style={{ background: item.color }} />
                    </div>
                    <span className="text-xs font-bold truncate" style={{ color: 'var(--theme-text)' }}>{item.channel}</span>
                  </div>
                  <div className="text-[11px] truncate" style={{ color: 'var(--theme-text-secondary)' }}>
                    {item.program?.title || 'שידור חי'}
                  </div>
                  <div className="text-[10px] mt-0.5 opacity-40" style={{ color: 'var(--theme-text-secondary)' }}>
                    {item.program?.time || ''}
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </motion.section>

        {/* ===== Quick Navigation ===== */}
        <motion.section
          initial={{ opacity: 0, y: 10 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.4 }}
        >
          <h2 className="text-base font-black mb-4" style={{ color: 'var(--theme-text)' }}>
            ניווט מהיר
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {[
              { href: '/productions', label: 'הפקות', desc: 'לוח הפקות שבועי', icon: Calendar, gradient: 'from-blue-500 to-cyan-500', count: '' },
              { href: '/directory', label: 'אלפון', desc: `${contactsList.length} אנשי מקצוע`, icon: Users, gradient: 'from-purple-500 to-pink-500', count: `${availableCount} זמינים` },
              { href: '/schedule', label: 'לוח שידורים', desc: 'שידור חי בזמן אמת', icon: Tv, gradient: 'from-red-500 to-orange-500', count: `${channels.length} ערוצים` },
              { href: '/chat', label: 'צ\'אט', desc: 'שוחחו עם קולגות', icon: MessageCircle, gradient: 'from-green-500 to-emerald-500', count: '' },
              { href: '/news', label: 'חדשות', desc: 'כותרות וחדשות התעשייה', icon: Newspaper, gradient: 'from-emerald-500 to-teal-500', count: liveNews.length > 0 ? `${liveNews.length}+ כתבות` : '' },
              { href: '/board', label: 'לוח מודעות', desc: 'דרושים וציוד', icon: Megaphone, gradient: 'from-amber-500 to-yellow-500', count: '' },
              { href: '/studios', label: 'אולפנים', desc: 'מפה ומידע על אולפנים', icon: Building2, gradient: 'from-rose-500 to-pink-500', count: '7 אולפנים' },
              { href: '/tools', label: 'ארגז כלים', desc: 'טיימר, מזג אוויר ועוד', icon: Wrench, gradient: 'from-indigo-500 to-blue-500', count: '6 כלים' },
            ].map((item, i) => {
              const Icon = item.icon;
              return (
                <motion.div
                  key={item.href}
                  initial={{ opacity: 0, y: 8 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: i * 0.04, duration: 0.3 }}
                >
                  <Link href={item.href}
                    className="group flex items-center gap-4 rounded-2xl border p-4 transition-all duration-200 hover:shadow-lg relative overflow-hidden"
                    style={{ background: 'var(--theme-bg-card)', borderColor: 'var(--theme-border)' }}>
                    <div className={`absolute inset-0 bg-gradient-to-br ${item.gradient} opacity-0 group-hover:opacity-[0.06] transition-opacity duration-300`} />
                    <div className={`relative w-12 h-12 rounded-xl bg-gradient-to-br ${item.gradient} flex items-center justify-center shrink-0 shadow-lg group-hover:scale-110 transition-transform duration-200`}>
                      <Icon className="w-5.5 h-5.5 text-white" />
                    </div>
                    <div className="relative flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <h3 className="font-bold text-sm" style={{ color: 'var(--theme-text)' }}>{item.label}</h3>
                        <ArrowLeft className="w-3.5 h-3.5 opacity-0 group-hover:opacity-50 -translate-x-1 group-hover:translate-x-0 transition-all" style={{ color: 'var(--theme-accent)' }} />
                      </div>
                      <p className="text-xs mt-0.5" style={{ color: 'var(--theme-text-secondary)' }}>{item.desc}</p>
                      {item.count && (
                        <span className="text-[10px] mt-1 inline-block px-2 py-0.5 rounded-full font-medium"
                          style={{ background: 'rgba(139, 92, 246, 0.1)', color: 'rgba(196, 167, 255, 0.8)' }}>
                          {item.count}
                        </span>
                      )}
                    </div>
                  </Link>
                </motion.div>
              );
            })}
          </div>
        </motion.section>

        {/* ===== Latest News ===== */}
        <motion.section
          initial={{ opacity: 0, y: 10 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.4 }}
        >
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-base font-black flex items-center gap-2" style={{ color: 'var(--theme-text)' }}>
              <TrendingUp className="w-4.5 h-4.5 text-purple-400" />
              חדשות אחרונות
              {liveNews.length > 0 && (
                <span className="flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-green-500/10 text-green-400 text-[10px] font-semibold">
                  <span className="relative flex h-1.5 w-1.5"><span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" /><span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-green-500" /></span>
                  LIVE
                </span>
              )}
            </h2>
            <Link href="/news" className="text-xs font-medium flex items-center gap-1 opacity-50 hover:opacity-100 transition-opacity" style={{ color: 'var(--theme-accent)' }}>
              כל החדשות <ArrowLeft className="w-3.5 h-3.5" />
            </Link>
          </div>

          {liveNews.length > 0 ? (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
              {/* Featured */}
              <Link href="/news" className="rounded-2xl border p-5 transition-all hover:shadow-lg block relative overflow-hidden group"
                style={{ background: 'var(--theme-bg-card)', borderColor: 'var(--theme-border)' }}>
                <div className="absolute inset-0 bg-gradient-to-br from-purple-600/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                <div className="relative">
                  <div className="flex items-center gap-2 mb-3">
                    <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-purple-500/15 text-purple-300 border border-purple-500/20">
                      {liveNews[0].source}
                    </span>
                    <span className="text-[10px]" style={{ color: 'var(--theme-text-secondary)' }}>
                      {(() => { try { const d = new Date(liveNews[0].pubDate); const diff = Math.floor((Date.now() - d.getTime()) / 60000); return diff < 60 ? `לפני ${diff} דקות` : diff < 1440 ? `לפני ${Math.floor(diff/60)} שעות` : d.toLocaleDateString('he-IL'); } catch { return ''; } })()}
                    </span>
                  </div>
                  <h3 className="font-black text-lg mb-2 leading-snug" style={{ color: 'var(--theme-text)' }}>{liveNews[0].title}</h3>
                  {liveNews[0].description && (
                    <p className="text-sm leading-relaxed line-clamp-2 mb-3" style={{ color: 'var(--theme-text-secondary)' }}>{liveNews[0].description}</p>
                  )}
                  <div className="flex items-center gap-1 text-xs" style={{ color: 'var(--theme-accent)' }}>
                    <Globe className="w-3.5 h-3.5" />
                    <span>קרא עוד</span>
                  </div>
                </div>
              </Link>

              {/* Rest */}
              <div className="space-y-2">
                {liveNews.slice(1, 5).map((news, idx) => (
                  <Link key={`${news.link}-${idx}`} href="/news"
                    className="block rounded-xl border px-4 py-3 transition-all hover:shadow-sm group"
                    style={{ background: 'var(--theme-bg-card)', borderColor: 'var(--theme-border)' }}>
                    <div className="flex items-start gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5 mb-1">
                          <span className="text-[10px] px-1.5 py-0.5 rounded-full font-medium bg-blue-500/10 text-blue-300">
                            {news.source}
                          </span>
                        </div>
                        <h3 className="font-semibold text-sm leading-tight line-clamp-1 group-hover:text-purple-300 transition-colors" style={{ color: 'var(--theme-text)' }}>{news.title}</h3>
                        {news.description && (
                          <p className="text-[11px] line-clamp-1 mt-0.5" style={{ color: 'var(--theme-text-secondary)' }}>{news.description}</p>
                        )}
                      </div>
                      <div className="text-[10px] whitespace-nowrap shrink-0 pt-1 opacity-40" style={{ color: 'var(--theme-text-secondary)' }}>
                        {(() => { try { const d = new Date(news.pubDate); const diff = Math.floor((Date.now() - d.getTime()) / 60000); return diff < 60 ? `${diff} דק'` : diff < 1440 ? `${Math.floor(diff/60)} שע'` : d.toLocaleDateString('he-IL', { day: 'numeric', month: 'short' }); } catch { return ''; } })()}
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
              <div className="rounded-2xl border p-5 animate-pulse" style={{ background: 'var(--theme-bg-card)', borderColor: 'var(--theme-border)' }}>
                <div className="h-4 w-20 rounded-full skeleton-shimmer mb-3" />
                <div className="h-5 w-3/4 rounded skeleton-shimmer mb-2" />
                <div className="h-3 w-full rounded skeleton-shimmer mb-1.5" />
                <div className="h-3 w-2/3 rounded skeleton-shimmer" />
              </div>
              <div className="space-y-2">
                {[1,2,3].map(i => (
                  <div key={i} className="rounded-xl border px-4 py-3 animate-pulse" style={{ background: 'var(--theme-bg-card)', borderColor: 'var(--theme-border)' }}>
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
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-base font-black flex items-center gap-2" style={{ color: 'var(--theme-text)' }}>
              <Calendar className="w-4.5 h-4.5 text-blue-400" />
              אירועים קרובים
            </h2>
            <Link href="/news" className="text-xs font-medium flex items-center gap-1 opacity-50 hover:opacity-100 transition-opacity" style={{ color: 'var(--theme-accent)' }}>
              כל האירועים <ArrowLeft className="w-3.5 h-3.5" />
            </Link>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {upcomingEvents.map((event, i) => (
              <motion.div
                key={event.id}
                initial={{ opacity: 0, y: 8 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.06, duration: 0.3 }}
              >
                <div className="rounded-2xl border p-4 transition-colors hover:shadow-md"
                  style={{ background: 'var(--theme-bg-card)', borderColor: 'var(--theme-border)' }}>
                  <div className="flex items-start gap-3">
                    <div className="bg-blue-500/10 rounded-xl p-2.5 text-center shrink-0 min-w-[50px]">
                      <div className="text-xl font-black text-blue-400 leading-none">{new Date(event.date).getDate()}</div>
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
