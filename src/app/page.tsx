'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { motion } from 'framer-motion';
import {
  ArrowLeft,
  Briefcase,
  Building2,
  Calendar,
  CircleDot,
  Clock,
  Film,
  Globe,
  Mail,
  MapPin,
  Megaphone,
  MessageCircle,
  Newspaper,
  Sparkles,
  TrendingUp,
  Tv,
  Users,
  Wrench,
  Zap,
} from 'lucide-react';

import WeeklyCalendarWidget from '@/components/WeeklyCalendarWidget';
import LiveNewsTicker from '@/components/home/LiveNewsTicker';
import { useAppData } from '@/contexts/AppDataContext';
import { mockJobs } from '@/data/jobs';
import { channels, generateSchedule, getCurrentProgram } from '@/data/channels';
import { industryEvents, categoryLabels } from '@/data/news';
import { getChannelDisplayName } from '@/lib/channelLabels';

interface RssNewsItem {
  title: string;
  link: string;
  pubDate: string;
  source: string;
  sourceUrl: string;
  description: string;
}

function LiveClock() {
  const [now, setNow] = useState<Date | null>(null);

  useEffect(() => {
    setNow(new Date());
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
  const { contacts, totalCount, availableCount, openToWorkCount } = useAppData();
  const [greeting, setGreeting] = useState('');
  const [liveNews, setLiveNews] = useState<RssNewsItem[]>([]);
  const [newsLoaded, setNewsLoaded] = useState(false);

  const uniqueDepartments = useMemo(() => new Set(contacts.map((contact) => contact.department)).size, [contacts]);
  const nowPlaying = useMemo(() => {
    return channels.slice(0, 4).map((channel) => {
      const schedule = generateSchedule(channel.id);
      return {
        id: channel.id,
        name: getChannelDisplayName(channel.id, channel.name),
        color: channel.color,
        program: getCurrentProgram(schedule),
      };
    });
  }, []);

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

  const stats = [
    { label: 'אנשי מקצוע', value: totalCount, icon: Users, color: 'bg-purple-500' },
    { label: 'זמינים לעבודה', value: availableCount, icon: Zap, color: 'bg-green-500' },
    { label: 'ערוצי טלוויזיה', value: channels.length, icon: Tv, color: 'bg-blue-500' },
    { label: 'מחפשים עבודה', value: openToWorkCount, icon: Briefcase, color: 'bg-orange-500' },
  ];

  const quickLinks = [
    { href: '/schedule', label: 'שידור חי', desc: `לוח שידורים ו־${channels.length} ערוצים`, icon: Calendar },
    { href: '/directory', label: 'אלפון מקצועי', desc: `${totalCount} אנשי מקצוע • ${availableCount} זמינים`, icon: Users },
    { href: '/chat', label: 'צ׳אט מקצועי', desc: 'שיחות בזמן אמת עם קולגות', icon: MessageCircle },
    { href: '/news', label: 'חדשות ואירועים', desc: newsLoaded ? `${liveNews.length || 0} ידיעות חיות` : 'מתעדכן עכשיו', icon: Newspaper },
    { href: '/board', label: 'לוח מודעות', desc: 'דרושים, ציוד ושיתופי פעולה', icon: Megaphone },
    { href: '/studios', label: 'אולפני טלוויזיה', desc: 'מידע, ניווט והיסטוריה של אולפנים', icon: Building2 },
    { href: '/tools', label: 'ארגז כלים', desc: 'טיימר, מזג אוויר ומחשבון', icon: Wrench },
  ];

  const dashboardCards = [
    { id: 'status', icon: CircleDot, label: 'הסטטוס שלי', value: 'פנוי לעבודה', href: '/settings' },
    { id: 'jobs', icon: Briefcase, label: 'משמרות פתוחות', value: `${mockJobs.length} משרות חדשות`, href: '/board' },
    { id: 'directory', icon: Users, label: 'אלפון מקצועי', value: `${totalCount} אנשי מקצוע`, href: '/directory' },
    { id: 'messages', icon: Mail, label: 'הודעות', value: 'מעבר ישיר לצ׳אט', href: '/chat' },
    { id: 'production', icon: Film, label: 'יומן אישי', value: 'מעבר ליומן האישי', href: '/productions' },
  ];

  const upcomingEvents = industryEvents.filter((event) => event.isUpcoming).slice(0, 3);

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
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
            {nowPlaying.map((item) => (
              <Link
                key={item.id}
                href={`/schedule?channelId=${item.id}`}
                className="group flex items-center gap-3 rounded-lg border px-3 py-2.5 transition-all hover:shadow-sm"
                style={{ background: 'var(--theme-bg-card)', borderColor: 'var(--theme-border)' }}
              >
                <div className="relative shrink-0">
                  <div className="w-2.5 h-2.5 rounded-full" style={{ background: item.color }} />
                  <div className="absolute inset-0 rounded-full animate-ping opacity-30" style={{ background: item.color }} />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-xs font-bold truncate" style={{ color: 'var(--theme-text)' }}>{item.name}</div>
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

        <motion.section initial={{ opacity: 0, y: 10 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ duration: 0.4 }}>
          <h2 className="text-sm font-bold uppercase tracking-wide mb-3" style={{ color: 'var(--theme-text-secondary)' }}>גישה מהירה</h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2.5">
            {quickLinks.map((item) => {
              const Icon = item.icon;
              return (
                <Link key={item.href} href={item.href} className="rounded-xl border p-3.5 transition-all duration-200 hover:shadow-md block" style={{ background: 'var(--theme-bg-card)', borderColor: 'var(--theme-border)' }}>
                  <div className="flex items-center gap-2 mb-2">
                    <Icon className="w-4 h-4" style={{ color: 'var(--theme-accent)' }} />
                    <h3 className="font-bold text-sm leading-tight" style={{ color: 'var(--theme-text)' }}>{item.label}</h3>
                  </div>
                  <p className="text-[11px] leading-snug line-clamp-2" style={{ color: 'var(--theme-text-secondary)' }}>{item.desc}</p>
                </Link>
              );
            })}
          </div>
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
            <div className="grid grid-cols-1 lg:grid-cols-5 gap-3">
              <Link href={`/news?article=${encodeURIComponent(liveNews[0].link)}`} className="lg:col-span-2 rounded-xl border p-4 transition-all hover:shadow-sm block" style={{ background: 'var(--theme-bg-card)', borderColor: 'var(--theme-border)' }}>
                <div className="flex items-center gap-2 mb-2">
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-purple-500/15 text-purple-300 border border-purple-500/20">
                    {liveNews[0].source}
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

              <div className="lg:col-span-3 space-y-2">
                {liveNews.slice(1, 5).map((news, index) => (
                  <Link key={`${news.link}-${index}`} href={`/news?article=${encodeURIComponent(news.link)}`} className="block rounded-lg border px-3.5 py-2.5 transition-all hover:shadow-sm" style={{ background: 'var(--theme-bg-card)', borderColor: 'var(--theme-border)' }}>
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
                    </div>
                  </Link>
                ))}
              </div>
            </div>
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
          <div className="grid grid-cols-1 md:grid-cols-3 gap-2.5">
            {upcomingEvents.map((event) => (
              <div key={event.id} className="rounded-xl border p-3.5" style={{ background: 'var(--theme-bg-card)', borderColor: 'var(--theme-border)' }}>
                <div className="flex items-start gap-3">
                  <div className="bg-blue-500/10 rounded-lg p-2 text-center shrink-0 min-w-[44px]">
                    <div className="text-lg font-black text-blue-400 leading-none">{new Date(event.date).getDate()}</div>
                    <div className="text-[10px] text-blue-300 mt-0.5">{new Date(event.date).toLocaleDateString('he-IL', { month: 'short' })}</div>
                  </div>
                  <div className="flex-1 min-w-0">
                    <span className="inline-block px-1.5 py-0.5 rounded-full text-[10px] font-medium mb-1 bg-blue-500/15 text-blue-300">
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
            ))}
          </div>
        </motion.section>
      </div>
    </div>
  );
}
