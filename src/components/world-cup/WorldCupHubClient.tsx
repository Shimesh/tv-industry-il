'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { addDoc, collection, deleteDoc, doc, limit, onSnapshot, orderBy, query, serverTimestamp } from 'firebase/firestore';
import { CalendarDays, Clock, CloudSun, Filter, Landmark, MessageCircle, Send, ShieldCheck, Timer, Trophy, Tv, Zap } from 'lucide-react';
import { channels } from '@/data/channels';
import { streamConfigs } from '@/data/streams';
import { db } from '@/lib/firebase';
import { useAuth } from '@/contexts/AuthContext';
import LatestNewsCarousel from '@/components/home/LatestNewsCarousel';
import { VideoPlayer } from '@/components/schedule/VideoPlayer';
import type { WorldCupMatch, WorldCupNewsItem, WorldCupPlayerStat, WorldCupStanding, WorldCupVenue, WorldCupWeather } from '@/lib/world-cup/types';

type HubProps = {
  matches: WorldCupMatch[];
  standings: WorldCupStanding[];
  playerStats: WorldCupPlayerStat[];
  venues: WorldCupVenue[];
  source: string;
  updatedAt: string;
};

type ChatMessage = {
  id: string;
  text?: string;
  senderId?: string;
  senderName?: string;
  senderPhoto?: string | null;
  createdAt?: { toMillis?: () => number } | number | null;
};

type StageFilter = 'all' | 'group' | 'knockout' | 'final';
type SectionTab = 'matches' | 'standings' | 'venues' | 'stats';

function formatIsraelTime(isoDate: string): string {
  return new Date(isoDate).toLocaleString('he-IL', {
    timeZone: 'Asia/Jerusalem',
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatIsraelTimeShort(isoDate: string): string {
  return new Date(isoDate).toLocaleString('he-IL', {
    timeZone: 'Asia/Jerusalem',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function stageLabel(stage: WorldCupMatch['stage']) {
  const labels: Record<WorldCupMatch['stage'], string> = {
    group: 'שלב הבתים',
    round_of_32: '32 האחרונות',
    round_of_16: 'שמינית גמר',
    quarter_final: 'רבע גמר',
    semi_final: 'חצי גמר',
    third_place: 'מקום שלישי',
    final: 'גמר',
  };
  return labels[stage];
}

function statusLabel(match: WorldCupMatch) {
  if (match.status === 'live') return `🔴 חי${match.minute ? ` · דקה ${match.minute}` : ''}`;
  if (match.status === 'finished') return 'הסתיים';
  return formatIsraelTime(match.kickoff);
}

function isKnockout(stage: WorldCupMatch['stage']) {
  return ['round_of_32', 'round_of_16', 'quarter_final', 'semi_final', 'third_place', 'final'].includes(stage);
}

function getNextCountdown(matches: WorldCupMatch[], now: number) {
  const next = matches
    .filter((m) => m.status === 'scheduled' && Date.parse(m.kickoff) > now)
    .sort((a, b) => Date.parse(a.kickoff) - Date.parse(b.kickoff))[0];
  if (!next) return null;
  const diffMs = Math.max(0, Date.parse(next.kickoff) - now);
  return {
    match: next,
    days: Math.floor(diffMs / 86_400_000),
    hours: Math.floor((diffMs % 86_400_000) / 3_600_000),
    minutes: Math.floor((diffMs % 3_600_000) / 60_000),
    seconds: Math.floor((diffMs % 60_000) / 1000),
  };
}

function Card({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <section className={`rounded-2xl border ${className}`} style={{ background: 'var(--theme-bg-card)', borderColor: 'var(--theme-border)' }}>
      {children}
    </section>
  );
}

function SectionHeader({ icon: Icon, title, badge }: { icon: typeof Trophy; title: string; badge?: string }) {
  return (
    <div className="flex items-center gap-2 border-b px-4 py-3" style={{ borderColor: 'var(--theme-border)' }}>
      <Icon className="h-5 w-5 text-[#D4AF37]" />
      <h2 className="text-lg font-black text-[var(--theme-text)]">{title}</h2>
      {badge && <span className="mr-auto rounded-full bg-[#D4AF37]/15 px-2 py-0.5 text-[11px] font-bold text-[#D4AF37]">{badge}</span>}
    </div>
  );
}

function MatchScore({ match, compact = false }: { match: WorldCupMatch; compact?: boolean }) {
  const isLive = match.status === 'live';
  return (
    <div
      className={`flex items-center justify-between gap-2 rounded-2xl border p-3 transition-all ${isLive ? 'border-red-500/40 shadow-[0_0_20px_rgba(239,68,68,.15)]' : ''}`}
      style={{ borderColor: isLive ? undefined : 'var(--theme-border)', background: 'var(--theme-bg-secondary)' }}
    >
      <div className="flex min-w-0 flex-1 items-center gap-2">
        <span className={compact ? 'text-xl' : 'text-2xl'}>{match.homeTeam.flag}</span>
        <span className={`min-w-0 truncate font-black text-[var(--theme-text)] ${compact ? 'text-xs' : 'text-sm'}`}>{match.homeTeam.nameHe}</span>
      </div>
      <div className={`shrink-0 rounded-xl bg-[#002046] text-center font-black tabular-nums text-[#D4AF37] ${compact ? 'px-2 py-1.5 text-sm' : 'px-3 py-2 text-lg'}`} dir="ltr">
        {match.homeScore ?? '-'} : {match.awayScore ?? '-'}
      </div>
      <div className="flex min-w-0 flex-1 items-center justify-end gap-2">
        <span className={`min-w-0 truncate font-black text-[var(--theme-text)] ${compact ? 'text-xs' : 'text-sm'}`}>{match.awayTeam.nameHe}</span>
        <span className={compact ? 'text-xl' : 'text-2xl'}>{match.awayTeam.flag}</span>
      </div>
    </div>
  );
}

function StageFilterTabs({ value, onChange }: { value: StageFilter; onChange: (v: StageFilter) => void }) {
  const tabs: { key: StageFilter; label: string }[] = [
    { key: 'all', label: 'הכל' },
    { key: 'group', label: 'בתים' },
    { key: 'knockout', label: 'נוקאאוט' },
    { key: 'final', label: 'גמר' },
  ];
  return (
    <div className="flex gap-1.5 overflow-x-auto px-4 py-2" style={{ scrollbarWidth: 'none' }}>
      {tabs.map((tab) => (
        <button
          key={tab.key}
          onClick={() => onChange(tab.key)}
          className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-bold transition-all ${
            value === tab.key
              ? 'bg-[#D4AF37] text-[#002046] shadow-md'
              : 'bg-white/10 text-[var(--theme-text-secondary)] hover:bg-white/15'
          }`}
        >
          <Filter className={`mr-1 inline h-3 w-3 ${value === tab.key ? '' : 'opacity-50'}`} />
          {tab.label}
        </button>
      ))}
    </div>
  );
}

function ScheduleGrid({ matches, activeId, onSelect }: { matches: WorldCupMatch[]; activeId: string; onSelect: (match: WorldCupMatch) => void }) {
  const [stageFilter, setStageFilter] = useState<StageFilter>('all');

  const filtered = useMemo(() => {
    if (stageFilter === 'all') return matches;
    if (stageFilter === 'group') return matches.filter((m) => m.stage === 'group');
    if (stageFilter === 'final') return matches.filter((m) => m.stage === 'final' || m.stage === 'third_place');
    return matches.filter((m) => isKnockout(m.stage) && m.stage !== 'final' && m.stage !== 'third_place');
  }, [matches, stageFilter]);

  const byDay = useMemo(() => {
    return filtered.reduce<Record<string, WorldCupMatch[]>>((acc, match) => {
      const key = new Date(match.kickoff).toLocaleDateString('en-CA', { timeZone: 'Asia/Jerusalem' });
      acc[key] = [...(acc[key] ?? []), match];
      return acc;
    }, {});
  }, [filtered]);

  return (
    <Card className="overflow-hidden">
      <SectionHeader icon={CalendarDays} title="לוח משחקים" badge={`${matches.length} משחקים`} />
      <StageFilterTabs value={stageFilter} onChange={setStageFilter} />
      <div className="max-h-[600px] overflow-y-auto">
        <div className="grid gap-3 p-3 sm:grid-cols-2 xl:grid-cols-3">
          {Object.entries(byDay).map(([day, dayMatches]) => (
            <div key={day} className="rounded-xl border p-3" style={{ borderColor: 'var(--theme-border)', background: 'var(--theme-bg-secondary)' }}>
              <div className="mb-2 flex items-center gap-1.5 text-xs font-black text-[var(--theme-text-secondary)]">
                <CalendarDays className="h-3 w-3 text-[#D4AF37]" />
                {new Date(`${day}T12:00:00`).toLocaleDateString('he-IL', { weekday: 'long', day: 'numeric', month: 'long' })}
              </div>
              <div className="space-y-2">
                {dayMatches.map((match) => {
                  const isLive = match.status === 'live';
                  const isFinished = match.status === 'finished';
                  return (
                    <button
                      key={match.id}
                      onClick={() => onSelect(match)}
                      className={`w-full rounded-lg border px-3 py-2 text-right transition-all hover:-translate-y-0.5 ${isLive ? 'animate-pulse border-red-500/40' : ''}`}
                      style={{
                        borderColor: match.id === activeId ? '#D4AF37' : isLive ? undefined : 'var(--theme-border)',
                        background: match.id === activeId ? 'rgba(212,175,55,.10)' : isLive ? 'rgba(239,68,68,.06)' : 'var(--theme-bg-card)',
                      }}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className={`text-xs font-bold ${isLive ? 'text-red-400' : isFinished ? 'text-[var(--theme-text-secondary)]' : 'text-[#D4AF37]'}`}>
                          {match.status === 'scheduled' ? (
                            <span className="flex items-center gap-1">
                              <Clock className="h-3 w-3" />
                              {formatIsraelTimeShort(match.kickoff)}
                            </span>
                          ) : statusLabel(match)}
                        </span>
                        <span className="text-[10px] text-[var(--theme-text-secondary)]">{stageLabel(match.stage)}{match.group ? ` · ${match.group}` : ''}</span>
                      </div>
                      <div className="mt-1 flex items-center justify-between gap-2 text-sm font-black text-[var(--theme-text)]">
                        <span className="min-w-0 truncate">{match.homeTeam.flag} {match.homeTeam.nameHe}</span>
                        <span className="shrink-0 text-xs text-[var(--theme-text-secondary)]">
                          {match.homeScore != null ? `${match.homeScore} - ${match.awayScore}` : 'vs'}
                        </span>
                        <span className="min-w-0 truncate text-left">{match.awayTeam.nameHe} {match.awayTeam.flag}</span>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
          {Object.keys(byDay).length === 0 && (
            <div className="col-span-full rounded-xl border p-6 text-center text-sm text-[var(--theme-text-secondary)]" style={{ borderColor: 'var(--theme-border)' }}>
              אין משחקים בשלב זה
            </div>
          )}
        </div>
      </div>
    </Card>
  );
}

function StandingsTables({ standings }: { standings: WorldCupStanding[] }) {
  const groups = useMemo(() => {
    return standings.reduce<Record<string, WorldCupStanding[]>>((acc, row) => {
      acc[row.group] = [...(acc[row.group] ?? []), row].sort((a, b) => b.points - a.points || (b.goalsFor - b.goalsAgainst) - (a.goalsFor - a.goalsAgainst));
      return acc;
    }, {});
  }, [standings]);

  return (
    <Card className="overflow-hidden">
      <SectionHeader icon={ShieldCheck} title="טבלאות בתים" badge={`${Object.keys(groups).length} בתים`} />
      <div className="grid gap-4 p-3 sm:grid-cols-2">
        {Object.entries(groups).map(([group, rows]) => (
          <div key={group} className="overflow-hidden rounded-xl border" style={{ borderColor: 'var(--theme-border)' }}>
            <div className="bg-[#002046] px-3 py-2 text-sm font-black text-[#D4AF37]">בית {group}</div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[340px] text-right text-xs">
                <thead style={{ color: 'var(--theme-text-secondary)' }}>
                  <tr>
                    <th className="px-3 py-2">נבחרת</th><th className="w-8">מש׳</th><th className="w-8">נצ׳</th><th className="w-8">ת׳</th><th className="w-8">הפ׳</th><th className="w-10">יחס</th><th className="w-8 px-3">נק׳</th>
                  </tr>
                </thead>
                <tbody className="divide-y" style={{ borderColor: 'var(--theme-border)' }}>
                  {rows.map((row, index) => (
                    <tr
                      key={`${group}-${row.team.id}-${index}`}
                      className="text-[var(--theme-text)]"
                      style={index < 2 ? { background: 'rgba(34,197,94,.06)' } : undefined}
                    >
                      <td className="px-3 py-2 font-bold">
                        <span className="ml-1.5">{row.team.flag}</span>
                        {row.team.nameHe}
                        {index < 2 && <span className="mr-1.5 text-[9px] text-emerald-400">▲</span>}
                      </td>
                      <td>{row.played}</td><td>{row.won}</td><td>{row.drawn}</td><td>{row.lost}</td><td dir="ltr">{row.goalsFor}:{row.goalsAgainst}</td><td className="px-3 font-black text-[#D4AF37]">{row.points}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}

function PlayerStatsTable({ stats }: { stats: WorldCupPlayerStat[] }) {
  return (
    <Card className="overflow-hidden">
      <SectionHeader icon={Zap} title="מלכי שערים" />
      <div className="overflow-x-auto">
        <table className="w-full min-w-[560px] text-right text-sm">
          <thead style={{ color: 'var(--theme-text-secondary)' }}>
            <tr><th className="px-4 py-3">#</th><th>שחקן</th><th>נבחרת</th><th>שערים</th><th>בישולים</th><th>בעיטות</th><th className="px-4">דקות</th></tr>
          </thead>
          <tbody className="divide-y" style={{ borderColor: 'var(--theme-border)' }}>
            {stats.map((stat) => (
              <tr key={`${stat.rank}-${stat.playerName}`} className="text-[var(--theme-text)]">
                <td className="px-4 py-3 font-black text-[#D4AF37]">{stat.rank}</td>
                <td className="font-bold">{stat.playerName}</td>
                <td><span className="ml-1">{stat.team.flag}</span>{stat.team.nameHe}</td>
                <td className="font-black">{stat.goals}</td><td>{stat.assists}</td><td>{stat.shots}</td><td className="px-4">{stat.minutes}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

function WeatherPill({ venueId }: { venueId: string }) {
  const [weather, setWeather] = useState<WorldCupWeather | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/world-cup/weather?venueId=${encodeURIComponent(venueId)}`)
      .then((res) => res.ok ? res.json() : null)
      .then((payload) => {
        if (!cancelled) setWeather(payload?.weather ?? null);
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [venueId]);

  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-black/35 px-2 py-1 text-[11px] text-white backdrop-blur-sm">
      <CloudSun className="h-3.5 w-3.5 text-[#D4AF37]" />
      {typeof weather?.temperature === 'number' ? `${weather.temperature}°C` : '...'}
      {typeof weather?.windSpeed === 'number' ? ` · ${weather.windSpeed} קמ״ש` : ''}
    </span>
  );
}

function stadiumPlaceholderDataUrl(venue: WorldCupVenue) {
  const label = `${venue.nameHe} - ${venue.cityHe}`;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="675" viewBox="0 0 1200 675"><defs><linearGradient id="g" x1="0" x2="1" y1="0" y2="1"><stop stop-color="#002046"/><stop offset=".55" stop-color="#07552b"/><stop offset="1" stop-color="#002046"/></linearGradient><radialGradient id="light" cx="50%" cy="30%" r="65%"><stop stop-color="rgba(212,175,55,.45)"/><stop offset="1" stop-color="rgba(212,175,55,0)"/></radialGradient></defs><rect width="1200" height="675" fill="url(#g)"/><rect width="1200" height="675" fill="url(#light)"/><ellipse cx="600" cy="475" rx="410" ry="95" fill="rgba(0,0,0,.34)"/><path d="M170 392c112-132 748-132 860 0v80H170z" fill="rgba(255,255,255,.13)" stroke="#D4AF37" stroke-width="5"/><path d="M265 400c82-74 588-74 670 0" fill="none" stroke="rgba(255,255,255,.48)" stroke-width="14" stroke-linecap="round"/><rect x="360" y="430" width="480" height="150" rx="70" fill="#138a36" stroke="rgba(255,255,255,.45)" stroke-width="4"/><path d="M600 430v150M440 505h320" stroke="rgba(255,255,255,.55)" stroke-width="4"/><circle cx="600" cy="505" r="42" fill="none" stroke="rgba(255,255,255,.55)" stroke-width="4"/><text x="600" y="190" text-anchor="middle" font-family="Arial,sans-serif" font-size="62" font-weight="900" fill="#D4AF37">World Cup 2026</text><text x="600" y="255" text-anchor="middle" font-family="Arial,sans-serif" font-size="34" font-weight="700" fill="white">${label}</text></svg>`;
  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
}

function VenueImage({ venue }: { venue: WorldCupVenue }) {
  const fallback = useMemo(() => stadiumPlaceholderDataUrl(venue), [venue]);
  const [src, setSrc] = useState(venue.imageUrl || fallback);

  useEffect(() => {
    setSrc(venue.imageUrl || fallback);
  }, [fallback, venue.imageUrl]);

  return (
    <img
      src={src}
      alt=""
      className="h-full w-full object-cover transition duration-500 group-hover:scale-105"
      loading="lazy"
      onError={() => setSrc(fallback)}
    />
  );
}

function VenuesGrid({ venues }: { venues: WorldCupVenue[] }) {
  const grouped = useMemo(() => {
    const map: Record<string, WorldCupVenue[]> = {};
    for (const v of venues) {
      const country = v.countryHe;
      map[country] = [...(map[country] ?? []), v];
    }
    return Object.entries(map);
  }, [venues]);

  return (
    <Card className="overflow-hidden">
      <SectionHeader icon={Landmark} title="16 אצטדיונים" badge="3 מדינות" />
      <div className="space-y-4 p-3">
        {grouped.map(([country, countryVenues]) => (
          <div key={country}>
            <div className="mb-2 flex items-center gap-2 text-sm font-black text-[var(--theme-text)]">
              <span className="h-px flex-1" style={{ background: 'var(--theme-border)' }} />
              <span>{country === 'ארצות הברית' ? '🇺🇸' : country === 'קנדה' ? '🇨🇦' : '🇲🇽'} {country}</span>
              <span className="rounded-full bg-[#D4AF37]/15 px-2 py-0.5 text-[10px] text-[#D4AF37]">{countryVenues.length}</span>
              <span className="h-px flex-1" style={{ background: 'var(--theme-border)' }} />
            </div>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              {countryVenues.map((venue) => (
                <article key={venue.id} className="group overflow-hidden rounded-xl border" style={{ borderColor: 'var(--theme-border)', background: 'var(--theme-bg-secondary)' }}>
                  <div className="relative h-36 overflow-hidden">
                    <VenueImage venue={venue} />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/80 to-transparent" />
                    <div className="absolute bottom-2 right-2 left-2 flex items-center justify-between gap-2">
                      <WeatherPill venueId={venue.id} />
                      <span className="rounded-full bg-[#D4AF37] px-2 py-1 text-[11px] font-black text-[#002046]" dir="ltr">{venue.capacity.toLocaleString()}</span>
                    </div>
                  </div>
                  <div className="p-3">
                    <h3 className="font-black text-[var(--theme-text)]">{venue.nameHe}</h3>
                    <p className="text-xs text-[var(--theme-text-secondary)]">{venue.cityHe}</p>
                    <p className="mt-2 line-clamp-2 text-xs leading-5 text-[var(--theme-text-secondary)]">{venue.factHe}</p>
                  </div>
                </article>
              ))}
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}

function WorldCupChat({ match }: { match: WorldCupMatch }) {
  const { user, profile } = useAuth();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  const isInitialLoad = useRef(true);

  useEffect(() => {
    isInitialLoad.current = true;
    const q = query(collection(db, 'world-cup-chat', match.id, 'messages'), orderBy('createdAt', 'asc'), limit(120));
    return onSnapshot(q, (snapshot) => {
      setMessages(snapshot.docs.map((entry) => ({ id: entry.id, ...entry.data() } as ChatMessage)));
      if (isInitialLoad.current) {
        isInitialLoad.current = false;
        return;
      }
      setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }), 100);
    });
  }, [match.id]);

  const send = async () => {
    if (!user || !text.trim()) return;
    setSending(true);
    try {
      await addDoc(collection(db, 'world-cup-chat', match.id, 'messages'), {
        text: text.trim().slice(0, 500),
        senderId: user.uid,
        senderName: profile?.displayName || user.displayName || user.email?.split('@')[0] || 'משתמש',
        senderPhoto: profile?.photoURL || user.photoURL || null,
        matchId: match.id,
        createdAt: serverTimestamp(),
      });
      setText('');
    } finally {
      setSending(false);
    }
  };

  const canModerate = profile?.siteRole === 'admin' || profile?.siteRole === 'moderator';

  return (
    <Card className="flex min-h-[420px] flex-col overflow-hidden">
      <div className="flex items-center gap-2 border-b px-4 py-3" style={{ borderColor: 'var(--theme-border)' }}>
        <MessageCircle className="h-5 w-5 text-[#D4AF37]" />
        <div className="min-w-0">
          <h2 className="text-base font-black text-[var(--theme-text)]">צ׳אט משחק</h2>
          <p className="truncate text-xs text-[var(--theme-text-secondary)]">{match.homeTeam.flag} {match.homeTeam.nameHe} נגד {match.awayTeam.nameHe} {match.awayTeam.flag}</p>
        </div>
      </div>
      <div className="flex-1 space-y-2 overflow-y-auto p-3">
        {messages.length === 0 ? (
          <p className="rounded-xl border p-4 text-center text-sm text-[var(--theme-text-secondary)]" style={{ borderColor: 'var(--theme-border)' }}>
            עוד אין הודעות למשחק הזה. היו הראשונים!
          </p>
        ) : messages.map((message) => {
          const mine = message.senderId === user?.uid;
          return (
            <div key={message.id} className={`flex ${mine ? 'justify-start' : 'justify-end'}`}>
              <div className="max-w-[82%] rounded-2xl border px-3 py-2" style={{ borderColor: mine ? '#D4AF37' : 'var(--theme-border)', background: mine ? 'rgba(212,175,55,.10)' : 'var(--theme-bg-secondary)' }}>
                <div className="mb-1 flex items-center gap-2 text-[11px] text-[var(--theme-text-secondary)]">
                  <span className="font-bold text-[var(--theme-text)]">{message.senderName || 'משתמש'}</span>
                  {(mine || canModerate) && (
                    <button onClick={() => deleteDoc(doc(db, 'world-cup-chat', match.id, 'messages', message.id))} className="text-red-300 hover:text-red-200">
                      מחק
                    </button>
                  )}
                </div>
                <p className="whitespace-pre-wrap text-sm leading-6 text-[var(--theme-text)]">{message.text}</p>
              </div>
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>
      <div className="border-t p-3" style={{ borderColor: 'var(--theme-border)' }}>
        {user ? (
          <div className="flex gap-2">
            <input
              value={text}
              onChange={(event) => setText(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && !event.shiftKey) void send();
              }}
              placeholder="כתוב הודעה לקהל..."
              className="min-w-0 flex-1 rounded-xl border px-3 py-2 text-sm outline-none"
              style={{ borderColor: 'var(--theme-border)', background: 'var(--theme-bg-secondary)', color: 'var(--theme-text)' }}
            />
            <button disabled={sending || !text.trim()} onClick={() => void send()} className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#D4AF37] text-[#002046] disabled:opacity-50">
              <Send className="h-4 w-4" />
            </button>
          </div>
        ) : (
          <p className="text-center text-sm text-[var(--theme-text-secondary)]">צריך להתחבר כדי להשתתף בצ׳אט.</p>
        )}
      </div>
    </Card>
  );
}

function MobileSectionTabs({ value, onChange }: { value: SectionTab; onChange: (v: SectionTab) => void }) {
  const tabs: { key: SectionTab; label: string; icon: typeof Trophy }[] = [
    { key: 'matches', label: 'משחקים', icon: CalendarDays },
    { key: 'standings', label: 'טבלאות', icon: ShieldCheck },
    { key: 'venues', label: 'אצטדיונים', icon: Landmark },
    { key: 'stats', label: 'סטטיסטיקות', icon: Zap },
  ];
  return (
    <div className="sticky top-[var(--app-header-offset)] z-30 border-b backdrop-blur-xl xl:hidden" style={{ borderColor: 'var(--theme-border)', background: 'color-mix(in srgb, var(--theme-bg) 85%, transparent)' }}>
      <div className="mx-auto flex max-w-7xl">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          return (
            <button
              key={tab.key}
              onClick={() => onChange(tab.key)}
              className={`flex flex-1 flex-col items-center gap-1 py-2.5 text-[11px] font-bold transition-colors ${
                value === tab.key ? 'text-[#D4AF37]' : 'text-[var(--theme-text-secondary)]'
              }`}
            >
              <Icon className="h-4 w-4" />
              {tab.label}
              {value === tab.key && <div className="h-0.5 w-6 rounded-full bg-[#D4AF37]" />}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export default function WorldCupHubClient({ matches, standings, playerStats, venues, source, updatedAt }: HubProps) {
  const [selectedMatch, setSelectedMatch] = useState(() => matches.find((match) => match.status === 'live') ?? matches[0]);
  const [news, setNews] = useState<WorldCupNewsItem[]>([]);
  const [activeSection, setActiveSection] = useState<SectionTab>('matches');
  const kan11 = channels.find((channel) => channel.id === 'kan11') ?? channels[0];
  const selectedVenue = venues.find((venue) => venue.id === selectedMatch.venueId);
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);
  const nextCountdown = useMemo(() => getNextCountdown(matches, now), [matches, now]);

  useEffect(() => {
    fetch('/api/world-cup/news')
      .then((res) => res.json())
      .then((payload) => setNews(Array.isArray(payload.items) ? payload.items : []))
      .catch(() => {});
  }, []);

  const sectionRefs = {
    matches: useRef<HTMLDivElement>(null),
    standings: useRef<HTMLDivElement>(null),
    venues: useRef<HTMLDivElement>(null),
    stats: useRef<HTMLDivElement>(null),
  };

  const handleSectionChange = (section: SectionTab) => {
    setActiveSection(section);
    sectionRefs[section].current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  return (
    <div className="min-h-screen bg-[var(--theme-bg)]" dir="rtl">
      {/* Hero */}
      <header className="relative overflow-hidden border-b" style={{ borderColor: 'var(--theme-border)', background: 'linear-gradient(135deg, #002046, #064523 70%, #002046)' }}>
        <div className="absolute inset-0 opacity-20" style={{ backgroundImage: 'linear-gradient(90deg, rgba(255,255,255,.08) 1px, transparent 1px), linear-gradient(rgba(255,255,255,.08) 1px, transparent 1px)', backgroundSize: '42px 42px' }} />
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,rgba(212,175,55,.18),transparent_50%)]" />
        <div className="relative mx-auto grid max-w-7xl gap-6 px-4 py-6 sm:px-6 lg:grid-cols-[1.15fr_.85fr] lg:items-center lg:py-8">
          <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
            <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-[#D4AF37]/40 bg-black/20 px-3 py-1 text-sm font-bold text-[#D4AF37]">
              <Trophy className="h-4 w-4" />
              מרכז מונדיאל 2026
            </div>
            <h1 className="text-3xl font-black leading-tight text-white sm:text-4xl lg:text-5xl">כל המשחקים, השידור והדופק של הטורניר</h1>
            <p className="mt-2 max-w-2xl text-sm leading-7 text-white/72 sm:text-base">לוח משחקים, כאן 11, חדשות, טבלאות, אצטדיונים, מזג אוויר וצ׳אט משחקים חי.</p>

            {nextCountdown && (
              <div className="mt-4 inline-flex items-center gap-3 rounded-2xl border border-[#D4AF37]/25 bg-black/25 px-4 py-2.5 backdrop-blur-sm">
                <Timer className="h-5 w-5 shrink-0 text-[#D4AF37]" />
                <div className="min-w-0">
                  <div className="text-xs font-bold text-white/55">המשחק הבא</div>
                  <div className="truncate text-sm font-black text-white">{nextCountdown.match.homeTeam.flag} {nextCountdown.match.homeTeam.nameHe} vs {nextCountdown.match.awayTeam.nameHe} {nextCountdown.match.awayTeam.flag}</div>
                </div>
                <div className="flex shrink-0 gap-2 text-center" dir="ltr">
                  {nextCountdown.days > 0 && (
                    <div className="rounded-lg bg-[#D4AF37]/15 px-2 py-1">
                      <div className="text-lg font-black tabular-nums text-[#D4AF37]">{String(nextCountdown.days).padStart(2, '0')}</div>
                      <div className="text-[9px] font-bold text-white/55">ימים</div>
                    </div>
                  )}
                  <div className="rounded-lg bg-[#D4AF37]/15 px-2 py-1">
                    <div className="text-lg font-black tabular-nums text-[#D4AF37]">{String(nextCountdown.hours).padStart(2, '0')}</div>
                    <div className="text-[9px] font-bold text-white/55">שעות</div>
                  </div>
                  <div className="rounded-lg bg-[#D4AF37]/15 px-2 py-1">
                    <div className="text-lg font-black tabular-nums text-[#D4AF37]">{String(nextCountdown.minutes).padStart(2, '0')}</div>
                    <div className="text-[9px] font-bold text-white/55">דקות</div>
                  </div>
                  <div className="rounded-lg bg-[#D4AF37]/15 px-2 py-1">
                    <div className="text-lg font-black tabular-nums text-[#D4AF37]">{String(nextCountdown.seconds).padStart(2, '0')}</div>
                    <div className="text-[9px] font-bold text-white/55">שניות</div>
                  </div>
                </div>
              </div>
            )}

            <div className="mt-3 flex flex-wrap gap-2 text-[11px] text-white/55">
              <span className="rounded-full bg-white/8 px-2.5 py-1">📡 {source === 'football-data' ? 'Football-Data.org' : 'Fallback מקומי'}</span>
              <span className="rounded-full bg-white/8 px-2.5 py-1">🕐 עודכן {new Date(updatedAt).toLocaleTimeString('he-IL', { timeZone: 'Asia/Jerusalem' })}</span>
              <span className="rounded-full bg-white/8 px-2.5 py-1">🇮🇱 כל השעות בשעון ישראל</span>
            </div>
          </motion.div>

          <Card className="border-[#D4AF37]/35 bg-black/20 p-4">
            <div className="mb-3 flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className={`text-xs font-bold ${selectedMatch.status === 'live' ? 'text-red-400' : 'text-[#D4AF37]'}`}>{statusLabel(selectedMatch)}</p>
                <h2 className="truncate text-lg font-black text-white sm:text-xl">{stageLabel(selectedMatch.stage)}{selectedMatch.group ? ` · בית ${selectedMatch.group}` : ''}</h2>
              </div>
              <div className="flex shrink-0 items-center gap-1.5 rounded-full bg-white/10 px-2 py-1">
                <Tv className="h-4 w-4 text-[#D4AF37]" />
                <span className="text-[11px] font-bold text-white/80">כאן 11</span>
              </div>
            </div>
            <MatchScore match={selectedMatch} />
            <div className="mt-3 flex items-center justify-between text-xs text-white/55">
              <span>{selectedVenue ? `📍 ${selectedVenue.nameHe}, ${selectedVenue.cityHe}` : 'אצטדיון ייקבע'}</span>
              {selectedMatch.status === 'scheduled' && (
                <span className="flex items-center gap-1 rounded-full bg-white/8 px-2 py-0.5">
                  <Clock className="h-3 w-3" />
                  {formatIsraelTimeShort(selectedMatch.kickoff)} IL
                </span>
              )}
            </div>
          </Card>
        </div>
      </header>

      <MobileSectionTabs value={activeSection} onChange={handleSectionChange} />

      <main className="mx-auto max-w-7xl space-y-6 px-4 py-6 sm:px-6">
        <div className="grid gap-6 xl:grid-cols-[1fr_380px]">
          <div className="space-y-6">
            <Card className="overflow-hidden p-3">
              <VideoPlayer channel={kan11} stream={streamConfigs.kan11} onNext={() => {}} onPrev={() => {}} currentProgram={`מונדיאל 2026 · ${selectedMatch.homeTeam.nameHe} - ${selectedMatch.awayTeam.nameHe}`} initialMuted />
            </Card>
            <div ref={sectionRefs.matches}>
              <ScheduleGrid matches={matches} activeId={selectedMatch.id} onSelect={setSelectedMatch} />
            </div>
          </div>
          <div className="space-y-6">
            <WorldCupChat match={selectedMatch} />
          </div>
        </div>

        {news.length > 0 && (
          <Card className="overflow-hidden p-4">
            <div className="mb-3 flex items-center gap-2">
              <Trophy className="h-5 w-5 text-[#D4AF37]" />
              <h2 className="text-lg font-black text-[var(--theme-text)]">חדשות מונדיאל</h2>
            </div>
            <LatestNewsCarousel news={news} />
          </Card>
        )}

        <div ref={sectionRefs.standings}>
          <StandingsTables standings={standings} />
        </div>
        <div ref={sectionRefs.stats}>
          <PlayerStatsTable stats={playerStats} />
        </div>
        <div ref={sectionRefs.venues}>
          <VenuesGrid venues={venues} />
        </div>
      </main>
    </div>
  );
}
