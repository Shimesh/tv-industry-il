'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { addDoc, collection, deleteDoc, doc, limit, onSnapshot, orderBy, query, serverTimestamp } from 'firebase/firestore';
import { CalendarDays, ChevronRight, Clock, CloudSun, Filter, Landmark, MessageCircle, Send, ShieldCheck, Timer, Trophy, Users, X, Zap } from 'lucide-react';
import { channels } from '@/data/channels';
import { streamConfigs } from '@/data/streams';
import { db } from '@/lib/firebase';
import { useAuth } from '@/contexts/AuthContext';
import LatestNewsCarousel from '@/components/home/LatestNewsCarousel';
import ChannelLogo from '@/components/ChannelLogo';
import { VideoPlayer } from '@/components/schedule/VideoPlayer';
import type { WorldCupMatch, WorldCupNewsItem, WorldCupPlayerStat, WorldCupStanding, WorldCupTeamDetail, WorldCupVenue, WorldCupWeather } from '@/lib/world-cup/types';
import { teamDetails } from '@/lib/world-cup/static-data';

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
type SectionTab = 'matches' | 'standings' | 'venues' | 'stats' | 'teams';

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
    <motion.div
      layout
      className={`flex items-center justify-between gap-2 rounded-2xl border p-3 transition-all ${isLive ? 'border-red-500/40 shadow-[0_0_24px_rgba(239,68,68,.18)]' : ''}`}
      style={{ borderColor: isLive ? undefined : 'var(--theme-border)', background: 'var(--theme-bg-secondary)' }}
    >
      <div className="flex min-w-0 flex-1 items-center gap-2">
        <motion.span
          key={match.homeTeam.id}
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          className={compact ? 'text-xl' : 'text-2xl'}
        >{match.homeTeam.flag}</motion.span>
        <span className={`min-w-0 truncate font-black text-[var(--theme-text)] ${compact ? 'text-xs' : 'text-sm'}`}>{match.homeTeam.nameHe}</span>
      </div>
      <div className={`shrink-0 rounded-xl bg-[#002046] text-center font-black tabular-nums text-[#D4AF37] ${compact ? 'px-2 py-1.5 text-sm' : 'px-3 py-2 text-lg'}`} dir="ltr">
        {isLive ? (
          <motion.span animate={{ opacity: [1, 0.4, 1] }} transition={{ duration: 1.2, repeat: Infinity }}>
            {match.homeScore ?? '0'} : {match.awayScore ?? '0'}
          </motion.span>
        ) : (
          <>{match.homeScore ?? '-'} : {match.awayScore ?? '-'}</>
        )}
      </div>
      <div className="flex min-w-0 flex-1 items-center justify-end gap-2">
        <span className={`min-w-0 truncate font-black text-[var(--theme-text)] ${compact ? 'text-xs' : 'text-sm'}`}>{match.awayTeam.nameHe}</span>
        <motion.span
          key={match.awayTeam.id}
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          className={compact ? 'text-xl' : 'text-2xl'}
        >{match.awayTeam.flag}</motion.span>
      </div>
    </motion.div>
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

function ScheduleGrid({ matches, activeId, onSelect, onDetail }: { matches: WorldCupMatch[]; activeId: string; onSelect: (match: WorldCupMatch) => void; onDetail: (match: WorldCupMatch) => void }) {
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
      <div className="max-h-[640px] overflow-y-auto">
        <div className="grid gap-3 p-3 sm:grid-cols-2 xl:grid-cols-3">
          {Object.entries(byDay).map(([day, dayMatches], di) => (
            <motion.div
              key={day}
              initial={{ opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: di * 0.05 }}
              className="rounded-xl border p-3"
              style={{ borderColor: 'var(--theme-border)', background: 'var(--theme-bg-secondary)' }}
            >
              <div className="mb-2.5 flex items-center gap-1.5 text-xs font-black text-[var(--theme-text-secondary)]">
                <CalendarDays className="h-3 w-3 text-[#D4AF37]" />
                {new Date(`${day}T12:00:00`).toLocaleDateString('he-IL', { weekday: 'long', day: 'numeric', month: 'long' })}
                <span className="mr-auto rounded-full bg-white/8 px-1.5 py-0.5 text-[9px]">{dayMatches.length}</span>
              </div>
              <div className="space-y-2">
                {dayMatches.map((match, mi) => {
                  const isLive = match.status === 'live';
                  const isFinished = match.status === 'finished';
                  const isActive = match.id === activeId;
                  return (
                    <motion.button
                      key={match.id}
                      initial={{ opacity: 0, x: -8 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: di * 0.05 + mi * 0.04 }}
                      whileHover={{ y: -2, transition: { duration: 0.15 } }}
                      whileTap={{ scale: 0.98 }}
                      onClick={() => { onSelect(match); onDetail(match); }}
                      className={`w-full rounded-xl border px-3 py-2.5 text-right transition-colors ${isLive ? 'border-red-500/40' : ''}`}
                      style={{
                        borderColor: isActive ? '#D4AF37' : isLive ? undefined : 'var(--theme-border)',
                        background: isActive ? 'rgba(212,175,55,.12)' : isLive ? 'rgba(239,68,68,.07)' : 'var(--theme-bg-card)',
                        boxShadow: isActive ? '0 0 0 1px rgba(212,175,55,.3)' : undefined,
                      }}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className={`text-xs font-bold ${isLive ? 'text-red-400' : isFinished ? 'text-[var(--theme-text-secondary)]' : 'text-[#D4AF37]'}`}>
                          {match.status === 'scheduled' ? (
                            <span className="flex items-center gap-1">
                              <Clock className="h-3 w-3" />
                              {formatIsraelTimeShort(match.kickoff)}
                            </span>
                          ) : (
                            <span className="flex items-center gap-1">
                              {isLive && <motion.span animate={{ opacity: [1, 0, 1] }} transition={{ duration: 1, repeat: Infinity }} className="inline-block h-1.5 w-1.5 rounded-full bg-red-400" />}
                              {statusLabel(match)}
                            </span>
                          )}
                        </span>
                        <span className="rounded-full bg-white/6 px-1.5 py-0.5 text-[9px] text-[var(--theme-text-secondary)]">
                          {stageLabel(match.stage)}{match.group ? ` · ${match.group}` : ''}
                        </span>
                      </div>
                      <div className="mt-1.5 flex items-center justify-between gap-2 text-sm font-black text-[var(--theme-text)]">
                        <span className="min-w-0 truncate">{match.homeTeam.flag} {match.homeTeam.nameHe}</span>
                        <span className={`shrink-0 rounded-lg px-2 py-0.5 text-xs tabular-nums ${isFinished ? 'bg-white/10 text-[var(--theme-text)]' : 'text-[var(--theme-text-secondary)]'}`} dir="ltr">
                          {match.homeScore != null ? `${match.homeScore} – ${match.awayScore}` : 'vs'}
                        </span>
                        <span className="min-w-0 truncate text-left">{match.awayTeam.nameHe} {match.awayTeam.flag}</span>
                      </div>
                    </motion.button>
                  );
                })}
              </div>
            </motion.div>
          ))}
          {Object.keys(byDay).length === 0 && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="col-span-full rounded-xl border p-8 text-center text-sm text-[var(--theme-text-secondary)]"
              style={{ borderColor: 'var(--theme-border)' }}
            >
              אין משחקים בשלב זה
            </motion.div>
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

  const groupKeys = useMemo(() => Object.keys(groups).sort(), [groups]);
  const [activeGroup, setActiveGroup] = useState<string | null>(null);
  const displayed = useMemo(() => activeGroup ? { [activeGroup]: groups[activeGroup] } : groups, [activeGroup, groups]);

  return (
    <Card className="overflow-hidden">
      <SectionHeader icon={ShieldCheck} title="טבלאות בתים" badge={`${groupKeys.length} בתים`} />

      {groupKeys.length > 1 && (
        <div className="flex items-center gap-1.5 overflow-x-auto px-4 py-2" style={{ scrollbarWidth: 'none' }}>
          <button
            onClick={() => setActiveGroup(null)}
            className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-bold transition-all ${!activeGroup ? 'bg-[#D4AF37] text-[#002046] shadow-md' : 'bg-white/10 text-[var(--theme-text-secondary)] hover:bg-white/15'}`}
          >
            הכל
          </button>
          {groupKeys.map((g) => (
            <button
              key={g}
              onClick={() => setActiveGroup(g === activeGroup ? null : g)}
              className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-black transition-all ${activeGroup === g ? 'bg-[#D4AF37] text-[#002046] shadow-md' : 'bg-white/10 text-[var(--theme-text-secondary)] hover:bg-white/15'}`}
            >
              {g}
            </button>
          ))}
        </div>
      )}

      <div className="grid gap-4 p-3 sm:grid-cols-2">
        <AnimatePresence mode="popLayout">
          {Object.entries(displayed).map(([group, rows], gi) => (
            <motion.div
              key={group}
              layout
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.96 }}
              transition={{ duration: 0.25, delay: gi * 0.04 }}
              className="overflow-hidden rounded-xl border"
              style={{ borderColor: 'var(--theme-border)' }}
            >
              <div className="flex items-center gap-2 bg-gradient-to-l from-[#002046] to-[#063a1a] px-3 py-2">
                <span className="text-sm font-black text-[#D4AF37]">בית {group}</span>
                <span className="mr-auto text-[10px] text-white/40">{rows.length} נבחרות</span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[320px] text-right text-xs">
                  <thead>
                    <tr style={{ color: 'var(--theme-text-secondary)', background: 'var(--theme-bg-secondary)' }}>
                      <th className="px-3 py-2 font-bold">נבחרת</th>
                      <th className="w-8 text-center">מש׳</th>
                      <th className="w-8 text-center">נצ׳</th>
                      <th className="w-8 text-center">ת׳</th>
                      <th className="w-8 text-center">הפ׳</th>
                      <th className="w-12 text-center">יחס</th>
                      <th className="w-10 px-3 text-center">נק׳</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row, index) => (
                      <motion.tr
                        key={`${group}-${row.team.id}`}
                        initial={{ opacity: 0, x: 10 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: gi * 0.04 + index * 0.03 }}
                        className="border-t text-[var(--theme-text)] transition-colors hover:bg-white/3"
                        style={{
                          borderColor: 'var(--theme-border)',
                          background: index < 2 ? 'rgba(34,197,94,.05)' : undefined,
                        }}
                      >
                        <td className="px-3 py-2.5 font-bold">
                          <div className="flex items-center gap-1.5">
                            {index < 2 && (
                              <span className="h-4 w-1 shrink-0 rounded-full bg-emerald-400" />
                            )}
                            <span>{row.team.flag}</span>
                            <span className="truncate">{row.team.nameHe}</span>
                          </div>
                        </td>
                        <td className="text-center">{row.played}</td>
                        <td className="text-center font-bold text-emerald-400">{row.won}</td>
                        <td className="text-center">{row.drawn}</td>
                        <td className="text-center text-red-400/70">{row.lost}</td>
                        <td className="text-center tabular-nums" dir="ltr">{row.goalsFor}:{row.goalsAgainst}</td>
                        <td className="px-3 text-center font-black text-[#D4AF37]">{row.points}</td>
                      </motion.tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </motion.div>
          ))}
        </AnimatePresence>
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

const positionLabel: Record<string, string> = { GK: 'שוער', DEF: 'הגנה', MID: 'קישור', FWD: 'תקיפה' };
const positionColor: Record<string, string> = { GK: '#D4AF37', DEF: '#4ade80', MID: '#60a5fa', FWD: '#f87171' };
const confederationLabel: Record<string, string> = { UEFA: 'אירופה', CONMEBOL: 'דרום אמריקה', CONCACAF: 'צפון/מרכז אמריקה', CAF: 'אפריקה', AFC: 'אסיה', OFC: 'אוקיאניה' };

function TeamDetailPanel({ team, onClose }: { team: WorldCupTeamDetail; onClose: () => void }) {
  const [tab, setTab] = useState<'squad' | 'history'>('squad');
  const byPosition = ['GK', 'DEF', 'MID', 'FWD'].map(pos => ({
    pos,
    players: team.squad.filter(p => p.position === pos),
  })).filter(g => g.players.length > 0);

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center" style={{ background: 'rgba(0,0,0,.65)', backdropFilter: 'blur(4px)' }}>
      <motion.div
        initial={{ opacity: 0, y: 40 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 40 }}
        className="relative w-full max-w-lg overflow-hidden rounded-t-3xl sm:rounded-3xl"
        style={{ background: 'var(--theme-bg-card)', border: '1px solid var(--theme-border)', maxHeight: '90dvh' }}
      >
        <div className="flex items-center gap-3 border-b px-4 py-4" style={{ borderColor: 'var(--theme-border)', background: 'linear-gradient(135deg,#002046,#064523)' }}>
          <span className="text-4xl">{team.flag}</span>
          <div className="min-w-0 flex-1">
            <h2 className="text-lg font-black text-white">{team.nameHe}</h2>
            <p className="text-xs text-white/60">{confederationLabel[team.confederation]} · מאמן: {team.coachHe}</p>
          </div>
          <div className="flex flex-col items-end gap-1 shrink-0">
            {team.worldCupTitles > 0 && (
              <span className="flex items-center gap-1 rounded-full bg-[#D4AF37] px-2 py-0.5 text-[11px] font-black text-[#002046]">
                <Trophy className="h-3 w-3" />×{team.worldCupTitles}
              </span>
            )}
            {team.fifaRanking && (
              <span className="rounded-full bg-white/15 px-2 py-0.5 text-[10px] font-bold text-white">
                FIFA #{team.fifaRanking}
              </span>
            )}
          </div>
          <button onClick={onClose} className="rounded-full bg-white/10 p-1.5 text-white hover:bg-white/20">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex border-b" style={{ borderColor: 'var(--theme-border)' }}>
          {(['squad', 'history'] as const).map(t => (
            <button key={t} onClick={() => setTab(t)}
              className={`flex-1 py-2.5 text-xs font-black transition-colors ${tab === t ? 'text-[#D4AF37] border-b-2 border-[#D4AF37]' : 'text-[var(--theme-text-secondary)]'}`}
            >
              {t === 'squad' ? '👥 הרכב' : '📅 היסטוריה'}
            </button>
          ))}
        </div>

        <div className="overflow-y-auto" style={{ maxHeight: 'calc(90dvh - 140px)' }}>
          {tab === 'squad' ? (
            <div className="p-3 space-y-3">
              <div className="rounded-lg border px-3 py-2 text-xs text-[var(--theme-text-secondary)]" style={{ borderColor: 'var(--theme-border)', background: 'var(--theme-bg-secondary)' }}>
                🏆 הישג הטוב ביותר: <span className="font-bold text-[var(--theme-text)]">{team.bestResult}</span>
              </div>
              {byPosition.map(({ pos, players }) => (
                <div key={pos}>
                  <div className="mb-1.5 flex items-center gap-2">
                    <span className="rounded-full px-2 py-0.5 text-[10px] font-black" style={{ background: positionColor[pos] + '22', color: positionColor[pos] }}>
                      {positionLabel[pos]}
                    </span>
                    <span className="text-[10px] text-[var(--theme-text-secondary)]">{players.length} שחקנים</span>
                  </div>
                  <div className="space-y-1">
                    {players.map(p => (
                      <div key={p.name} className="flex items-center gap-2 rounded-lg border px-3 py-2" style={{ borderColor: 'var(--theme-border)', background: 'var(--theme-bg-secondary)' }}>
                        {p.number && (
                          <span className="w-6 shrink-0 text-center text-[10px] font-black text-[var(--theme-text-secondary)]">#{p.number}</span>
                        )}
                        <span className="flex-1 font-bold text-xs text-[var(--theme-text)]">{p.name}</span>
                        {p.club && <span className="text-[10px] text-[var(--theme-text-secondary)]">{p.club}</span>}
                        {(p.caps != null || p.goals != null) && (
                          <span className="text-[10px] text-[#D4AF37] shrink-0">
                            {p.caps != null ? `${p.caps} מש׳` : ''}
                            {p.goals != null ? ` · ⚽${p.goals}` : ''}
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="p-3 space-y-2">
              {team.tournamentHistory.length === 0 ? (
                <p className="text-center text-sm text-[var(--theme-text-secondary)] py-6">אין היסטוריית מונדיאל</p>
              ) : team.tournamentHistory.map(h => (
                <div key={h.year} className="flex items-start gap-3 rounded-lg border px-3 py-2.5" style={{ borderColor: 'var(--theme-border)', background: 'var(--theme-bg-secondary)' }}>
                  <span className="shrink-0 rounded-lg bg-[#002046] px-2 py-1 text-xs font-black text-[#D4AF37]">{h.year}</span>
                  <div className="min-w-0">
                    <div className="text-xs font-bold text-[var(--theme-text)]">{h.stage}</div>
                    <div className="text-[10px] text-[var(--theme-text-secondary)]">{h.host}{h.notes ? ` · ${h.notes}` : ''}</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </motion.div>
    </div>
  );
}

function TeamsTab() {
  const [selectedTeam, setSelectedTeam] = useState<WorldCupTeamDetail | null>(null);
  const [confFilter, setConfFilter] = useState<string>('all');
  const confederations = ['all', 'UEFA', 'CONMEBOL', 'CONCACAF', 'CAF', 'AFC', 'OFC'];
  const filtered = confFilter === 'all' ? teamDetails : teamDetails.filter(t => t.confederation === confFilter);

  return (
    <Card className="overflow-hidden">
      <SectionHeader icon={Users} title="נבחרות מונדיאל 2026" badge={`${teamDetails.length} נבחרות`} />
      <div className="flex gap-1.5 overflow-x-auto px-4 py-2" style={{ scrollbarWidth: 'none' }}>
        {confederations.map(c => (
          <button key={c} onClick={() => setConfFilter(c)}
            className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-bold transition-all ${
              confFilter === c ? 'bg-[#D4AF37] text-[#002046] shadow-md' : 'bg-white/10 text-[var(--theme-text-secondary)] hover:bg-white/15'
            }`}
          >
            {c === 'all' ? 'הכל' : confederationLabel[c]}
          </button>
        ))}
      </div>
      <div className="grid gap-2 p-3 sm:grid-cols-2 xl:grid-cols-3">
        <AnimatePresence mode="popLayout">
          {filtered.map((team, i) => (
            <motion.button
              key={team.id}
              layout
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              transition={{ duration: 0.18, delay: i * 0.02 }}
              whileHover={{ y: -3, transition: { duration: 0.15 } }}
              whileTap={{ scale: 0.97 }}
              onClick={() => setSelectedTeam(team)}
              className="flex items-center gap-3 rounded-xl border px-4 py-3 text-right"
              style={{ borderColor: 'var(--theme-border)', background: 'var(--theme-bg-secondary)' }}
            >
              <span className="shrink-0 text-3xl">{team.flag}</span>
              <div className="min-w-0 flex-1">
                <div className="font-black text-sm text-[var(--theme-text)]">{team.nameHe}</div>
                <div className="text-[10px] text-[var(--theme-text-secondary)]">{confederationLabel[team.confederation]}{team.group ? ` · בית ${team.group}` : ''}</div>
                <div className="mt-1 flex items-center gap-1.5">
                  {team.worldCupTitles > 0 && (
                    <span className="flex items-center gap-0.5 rounded-full bg-[#D4AF37]/15 px-1.5 py-0.5 text-[9px] font-black text-[#D4AF37]">
                      <Trophy className="h-2.5 w-2.5" />×{team.worldCupTitles}
                    </span>
                  )}
                  {team.fifaRanking && (
                    <span className="rounded-full bg-white/8 px-1.5 py-0.5 text-[9px] text-[var(--theme-text-secondary)]">#{team.fifaRanking}</span>
                  )}
                </div>
              </div>
              <ChevronRight className="h-4 w-4 shrink-0 text-[var(--theme-text-secondary)]" />
            </motion.button>
          ))}
          {filtered.length === 0 && (
            <motion.div
              key="empty"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="col-span-full rounded-xl border p-6 text-center text-sm text-[var(--theme-text-secondary)]"
              style={{ borderColor: 'var(--theme-border)' }}
            >
              אין נבחרות בקונפדרציה זו
            </motion.div>
          )}
        </AnimatePresence>
      </div>
      <AnimatePresence>
        {selectedTeam && (
          <TeamDetailPanel team={selectedTeam} onClose={() => setSelectedTeam(null)} />
        )}
      </AnimatePresence>
    </Card>
  );
}

type MatchEvent = {
  type: string;
  minute: number;
  teamName: string;
  player: string;
  detail: string;
};

const xSpread: Record<number, number[]> = {
  1: [50],
  2: [25, 75],
  3: [17, 50, 83],
  4: [12, 37, 63, 88],
  5: [10, 28, 50, 72, 90],
};

function FormationPitch({ squad, flag, teamName, formation }: { squad: import('@/lib/world-cup/types').WorldCupPlayer[]; flag: string; teamName: string; formation?: string }) {
  const pColor: Record<string, string> = { GK: '#D4AF37', DEF: '#4ade80', MID: '#60a5fa', FWD: '#f87171' };

  // Use only starters (isStarter !== false and first 11)
  const starters = squad.filter(p => p.isStarter !== false).slice(0, 11);

  // Parse formation string e.g. "4-3-3" → [4,3,3]
  const formRows = (formation ?? '').split('-').map(Number).filter(n => n > 0);
  const totalOutfield = formRows.reduce((a, b) => a + b, 0);

  const gk = starters.filter(p => p.position === 'GK').slice(0, 1);
  const outfield = starters.filter(p => p.position !== 'GK').slice(0, 10);

  // Assign outfield players to rows bottom-to-top (DEF → MID → FWD)
  type Dot = { p: typeof starters[0]; x: number; y: number; pos: string };
  const dots: Dot[] = [];

  if (formRows.length >= 2 && totalOutfield <= 10) {
    // Use formation-based layout
    const rowYs = formRows.length === 2 ? [67, 32]
      : formRows.length === 3 ? [70, 48, 23]
      : [72, 52, 35, 18];
    let offset = 0;
    formRows.forEach((count, ri) => {
      const rowPlayers = outfield.slice(offset, offset + count);
      const xs = xSpread[rowPlayers.length] ?? xSpread[4];
      const pos = ri === 0 ? 'DEF' : ri === formRows.length - 1 ? 'FWD' : 'MID';
      rowPlayers.forEach((p, i) => dots.push({ p, x: xs[i] ?? 50, y: rowYs[ri], pos }));
      offset += count;
    });
  } else {
    // Fallback: group by position tag
    const rowY: Record<string, number> = { DEF: 70, MID: 48, FWD: 23 };
    (['DEF', 'MID', 'FWD'] as const).forEach(pos => {
      const players = outfield.filter(p => p.position === pos);
      const xs = xSpread[Math.min(players.length, 5)] ?? xSpread[4];
      players.forEach((p, i) => dots.push({ p, x: xs[i] ?? 50, y: rowY[pos], pos }));
    });
  }

  // Add GK
  if (gk.length) dots.push({ p: gk[0], x: 50, y: 88, pos: 'GK' });

  const displayFormation = formation ?? (
    `${outfield.filter(p => p.position === 'DEF').length}-${outfield.filter(p => p.position === 'MID').length}-${outfield.filter(p => p.position === 'FWD').length}`
  );

  return (
    <div className="overflow-hidden rounded-xl" style={{ background: 'linear-gradient(180deg,#1a6e30 0%,#0e5222 100%)' }}>
      <div className="flex items-center gap-1.5 border-b border-white/10 px-3 py-2">
        <span className="text-lg leading-none">{flag}</span>
        <span className="text-xs font-black text-white">{teamName}</span>
        <span className="mr-auto rounded-full bg-white/10 px-1.5 py-0.5 text-[9px] font-bold text-white/60">{displayFormation}</span>
      </div>
      <svg viewBox="0 0 100 100" className="w-full" xmlns="http://www.w3.org/2000/svg">
        {/* Grass stripes */}
        {[0,1,2,3,4,5].map(i => (
          <rect key={i} x="0" y={i*16.6} width="100" height="8.3" fill={i%2===0?'rgba(0,0,0,.08)':'rgba(255,255,255,.025)'} />
        ))}
        {/* Halfway line */}
        <line x1="2" y1="99" x2="98" y2="99" stroke="rgba(255,255,255,.35)" strokeWidth="0.5" />
        {/* Penalty arc */}
        <path d="M 34 99 A 16 16 0 0 0 66 99" fill="none" stroke="rgba(255,255,255,.35)" strokeWidth="0.5" />
        {/* Penalty box */}
        <rect x="18" y="83" width="64" height="16" fill="none" stroke="rgba(255,255,255,.35)" strokeWidth="0.5" />
        {/* 6-yard box */}
        <rect x="33" y="93" width="34" height="6" fill="none" stroke="rgba(255,255,255,.35)" strokeWidth="0.5" />
        {/* Goal */}
        <rect x="38.5" y="98" width="23" height="3.5" fill="rgba(255,255,255,.15)" stroke="rgba(255,255,255,.6)" strokeWidth="0.7" rx="0.4" />
        {/* Penalty spot */}
        <circle cx="50" cy="88.5" r="0.7" fill="rgba(255,255,255,.5)" />
        {/* Players */}
        {dots.map(({ p, x, y, pos }) => {
          const lastName = p.name.split(' ').slice(-1)[0] ?? p.name;
          const shortName = lastName.length > 8 ? lastName.slice(0, 7) + '.' : lastName;
          return (
            <g key={`${p.name}-${x}-${y}`} transform={`translate(${x},${y})`}>
              <circle r="5.5" fill={pColor[pos] ?? pColor[p.position]} stroke="rgba(255,255,255,.6)" strokeWidth="0.6" />
              <text textAnchor="middle" dominantBaseline="middle" fontSize="3.8" fontWeight="bold" fill="white">
                {p.number ?? '?'}
              </text>
              <text textAnchor="middle" y="8.8" fontSize="2.8" fill="rgba(255,255,255,.9)" fontWeight="600">
                {shortName}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

function LiveEventsPanel({ match }: { match: WorldCupMatch }) {
  const [events, setEvents] = useState<MatchEvent[]>([]);
  const [liveMinute, setLiveMinute] = useState<number | null>(match.minute ?? null);
  const [fetching, setFetching] = useState(true);
  const isApiMatch = /^\d+$/.test(match.id);

  useEffect(() => {
    if (!isApiMatch) { setFetching(false); return; }
    const load = () => {
      fetch(`/api/world-cup/match-events?matchId=${match.id}`)
        .then(r => r.ok ? r.json() : null)
        .then(d => {
          if (!d?.success) return;
          setEvents(d.events ?? []);
          setLiveMinute(d.minute ?? null);
        })
        .catch(() => {})
        .finally(() => setFetching(false));
    };
    load();
    const id = setInterval(load, 30_000);
    return () => clearInterval(id);
  }, [match.id, isApiMatch]);

  const eventIcon: Record<string, string> = {
    goal: '⚽', owngoal: '⚽', yellowcard: '🟨', redcard: '🟥', substitution: '🔄',
  };

  return (
    <div className="space-y-3 p-3">
      <div className="flex items-center justify-between rounded-xl border px-4 py-3" style={{ borderColor: 'var(--theme-border)', background: 'var(--theme-bg-secondary)' }}>
        <div className="flex items-center gap-2">
          <motion.span animate={{ opacity: [1, 0.2, 1] }} transition={{ duration: 1, repeat: Infinity }} className="h-2.5 w-2.5 rounded-full bg-red-500" />
          <span className="font-black text-red-400 text-sm">שידור חי</span>
        </div>
        {liveMinute != null && (
          <span className="rounded-full bg-red-500/15 px-3 py-1 text-sm font-black text-red-400">דקה {liveMinute}׳</span>
        )}
      </div>

      {fetching && (
        <div className="py-8 text-center text-sm text-[var(--theme-text-secondary)]">טוען אירועי משחק...</div>
      )}

      {!fetching && !isApiMatch && (
        <div className="rounded-xl border px-4 py-6 text-center text-sm text-[var(--theme-text-secondary)]" style={{ borderColor: 'var(--theme-border)' }}>
          <div className="text-2xl mb-2">⚡</div>
          אירועי משחק חי יופיעו כאן בזמן אמת
        </div>
      )}

      {!fetching && isApiMatch && events.length === 0 && (
        <div className="rounded-xl border px-4 py-6 text-center text-sm text-[var(--theme-text-secondary)]" style={{ borderColor: 'var(--theme-border)' }}>
          <div className="text-2xl mb-2">⏱️</div>
          אין אירועים עדיין · המשחק בתהליך
        </div>
      )}

      <div className="space-y-2">
        {events.map((ev, i) => {
          const isHome = match.homeTeam.nameEn.toLowerCase().includes(ev.teamName.toLowerCase().split(' ')[0]);
          return (
            <motion.div
              key={i}
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.05 }}
              className={`flex items-start gap-3 rounded-xl border px-3 py-2.5 ${ev.type === 'goal' || ev.type === 'owngoal' ? 'border-[#D4AF37]/30' : ''}`}
              style={{ borderColor: ev.type.includes('goal') ? undefined : 'var(--theme-border)', background: ev.type.includes('goal') ? 'rgba(212,175,55,.07)' : 'var(--theme-bg-secondary)' }}
            >
              <span className="shrink-0 rounded-full bg-black/20 px-2 py-1 text-[10px] font-black text-[#D4AF37] tabular-nums">{ev.minute}׳</span>
              <span className="text-lg leading-none">{eventIcon[ev.type] ?? '•'}</span>
              <div className={`flex-1 min-w-0 ${isHome ? '' : 'text-left'}`}>
                <div className="text-xs font-black text-[var(--theme-text)]">{ev.player || ev.teamName}</div>
                {ev.detail && <div className="text-[10px] text-[var(--theme-text-secondary)]">{ev.detail}</div>}
              </div>
              <span className="shrink-0 text-lg">{isHome ? match.homeTeam.flag : match.awayTeam.flag}</span>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}

function PlayerRow({ p }: { p: import('@/lib/world-cup/types').WorldCupPlayer }) {
  const pColor: Record<string, string> = { GK: '#D4AF37', DEF: '#4ade80', MID: '#60a5fa', FWD: '#f87171' };
  const pLabel: Record<string, string> = { GK: 'שוער', DEF: 'הגנה', MID: 'קישור', FWD: 'תקיפה' };
  return (
    <div className="flex items-center gap-2 border-t px-3 py-1.5" style={{ borderColor: 'var(--theme-border)' }}>
      <span className="w-5 shrink-0 text-center text-[10px] font-black text-[var(--theme-text-secondary)]">{p.number ?? '–'}</span>
      <span className="flex-1 truncate text-xs font-bold text-[var(--theme-text)]">{p.name}</span>
      {p.club && <span className="hidden text-[10px] text-[var(--theme-text-secondary)] sm:inline">{p.club}</span>}
      <span className="shrink-0 rounded-full px-1.5 py-0.5 text-[9px] font-bold" style={{ background: (pColor[p.position] ?? '#888') + '22', color: pColor[p.position] ?? '#888' }}>
        {pLabel[p.position] ?? p.position}
      </span>
    </div>
  );
}

function MatchDetailModal({ match, onClose, venues }: { match: WorldCupMatch; onClose: () => void; venues: WorldCupVenue[] }) {
  const venue = venues.find(v => v.id === match.venueId);
  const homeDetail = teamDetails.find(t => t.id === match.homeTeam.id);
  const awayDetail = teamDetails.find(t => t.id === match.awayTeam.id);
  const broadcasterLabel = match.broadcaster === 'kan11' ? 'כאן 11' : match.broadcaster === 'sport5' ? 'ספורט 5' : 'ייקבע';
  const isLive = match.status === 'live';
  const [tab, setTab] = useState<'lineup' | 'live'>(isLive ? 'live' : 'lineup');

  const homeStarters = (homeDetail?.squad.filter(p => p.isStarter !== false) ?? []).slice(0, 11);
  const homeSubs = homeDetail?.squad.filter(p => p.isStarter === false) ?? [];
  const awayStarters = (awayDetail?.squad.filter(p => p.isStarter !== false) ?? []).slice(0, 11);
  const awaySubs = awayDetail?.squad.filter(p => p.isStarter === false) ?? [];

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center" style={{ background: 'rgba(0,0,0,.7)', backdropFilter: 'blur(6px)' }}>
      <motion.div
        initial={{ opacity: 0, y: 48 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 48 }}
        transition={{ type: 'spring', damping: 28, stiffness: 320 }}
        className="relative w-full max-w-2xl overflow-hidden rounded-t-3xl sm:rounded-3xl"
        style={{ background: 'var(--theme-bg-card)', border: '1px solid var(--theme-border)', maxHeight: '93dvh' }}
      >
        {/* Header */}
        <div className="border-b px-4 py-3" style={{ borderColor: 'var(--theme-border)', background: 'linear-gradient(135deg,#002046,#064523)' }}>
          <div className="flex items-start justify-between gap-2">
            <div className="text-[10px] font-bold text-white/50 uppercase tracking-wider">{stageLabel(match.stage)}{match.group ? ` · בית ${match.group}` : ''}</div>
            <button onClick={onClose} className="rounded-full bg-white/10 p-1.5 text-white hover:bg-white/20">
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="mt-2 flex items-center justify-center gap-3">
            <div className="flex min-w-0 flex-1 flex-col items-center gap-1">
              <span className="text-3xl">{match.homeTeam.flag}</span>
              <span className="text-center text-sm font-black text-white leading-tight">{match.homeTeam.nameHe}</span>
            </div>
            <div className="shrink-0 text-center">
              <div className="rounded-xl bg-black/35 px-3 py-2 font-black text-[#D4AF37] text-xl tabular-nums" dir="ltr">
                {isLive ? (
                  <motion.span animate={{ opacity: [1, 0.4, 1] }} transition={{ duration: 1.2, repeat: Infinity }}>
                    {match.homeScore ?? '0'} : {match.awayScore ?? '0'}
                  </motion.span>
                ) : (match.homeScore != null ? `${match.homeScore} : ${match.awayScore}` : formatIsraelTimeShort(match.kickoff))}
              </div>
              {isLive && match.minute && (
                <div className="mt-1 text-[10px] font-bold text-red-400">דקה {match.minute}׳</div>
              )}
            </div>
            <div className="flex min-w-0 flex-1 flex-col items-center gap-1">
              <span className="text-3xl">{match.awayTeam.flag}</span>
              <span className="text-center text-sm font-black text-white leading-tight">{match.awayTeam.nameHe}</span>
            </div>
          </div>
        </div>

        {/* Info strip */}
        <div className="flex gap-2 overflow-x-auto border-b px-3 py-2" style={{ borderColor: 'var(--theme-border)', background: 'var(--theme-bg-secondary)', scrollbarWidth: 'none' }}>
          <span className="shrink-0 rounded-full bg-[#D4AF37]/15 px-2.5 py-1 text-[10px] font-bold text-[#D4AF37]">📺 {broadcasterLabel}</span>
          <span className="shrink-0 rounded-full bg-white/8 px-2.5 py-1 text-[10px] text-[var(--theme-text-secondary)]">🕐 {formatIsraelTime(match.kickoff)}</span>
          {venue && <span className="shrink-0 rounded-full bg-white/8 px-2.5 py-1 text-[10px] text-[var(--theme-text-secondary)]">📍 {venue.nameHe}, {venue.cityHe}</span>}
        </div>

        {/* Tabs */}
        <div className="flex border-b" style={{ borderColor: 'var(--theme-border)' }}>
          <button
            onClick={() => setTab('lineup')}
            className={`flex-1 py-2.5 text-xs font-black transition-colors ${tab === 'lineup' ? 'text-[#D4AF37] border-b-2 border-[#D4AF37]' : 'text-[var(--theme-text-secondary)]'}`}
          >
            👥 הרכב &amp; חילופים
          </button>
          {isLive && (
            <button
              onClick={() => setTab('live')}
              className={`flex-1 py-2.5 text-xs font-black transition-colors ${tab === 'live' ? 'text-red-400 border-b-2 border-red-500' : 'text-[var(--theme-text-secondary)]'}`}
            >
              <motion.span animate={{ opacity: [1, 0.3, 1] }} transition={{ duration: 1, repeat: Infinity }}>🔴</motion.span> שידור חי
            </button>
          )}
        </div>

        {/* Body */}
        <div className="overflow-y-auto" style={{ maxHeight: 'calc(93dvh - 185px)' }}>
          {tab === 'live' && isLive ? (
            <LiveEventsPanel match={match} />
          ) : (
            <div className="space-y-4 p-3">
              {/* Formations side by side */}
              <div className="grid gap-3 sm:grid-cols-2">
                {homeDetail && homeStarters.length > 0 && (
                  <FormationPitch squad={homeStarters} flag={match.homeTeam.flag} teamName={match.homeTeam.nameHe} formation={homeDetail.formation} />
                )}
                {awayDetail && awayStarters.length > 0 && (
                  <FormationPitch squad={awayStarters} flag={match.awayTeam.flag} teamName={match.awayTeam.nameHe} formation={awayDetail.formation} />
                )}
              </div>

              {/* Starters */}
              <div className="grid gap-3 sm:grid-cols-2">
                {[
                  { team: match.homeTeam, starters: homeStarters, subs: homeSubs, detail: homeDetail },
                  { team: match.awayTeam, starters: awayStarters, subs: awaySubs, detail: awayDetail },
                ].map(({ team, starters, subs, detail }) => (
                  <div key={team.id} className="overflow-hidden rounded-xl border" style={{ borderColor: 'var(--theme-border)' }}>
                    <div className="flex items-center gap-2 px-3 py-2" style={{ background: 'var(--theme-bg-secondary)' }}>
                      <span className="text-xl">{team.flag}</span>
                      <div>
                        <div className="text-xs font-black text-[var(--theme-text)]">{team.nameHe}</div>
                        {detail && <div className="text-[9px] text-[var(--theme-text-secondary)]">מאמן: {detail.coachHe}</div>}
                      </div>
                    </div>

                    {starters.length > 0 && (
                      <>
                        <div className="px-3 py-1 text-[9px] font-black uppercase tracking-wider text-[var(--theme-text-secondary)]" style={{ background: 'var(--theme-bg-secondary)' }}>
                          הרכב פותח
                        </div>
                        {starters.map(p => <PlayerRow key={p.name} p={p} />)}
                      </>
                    )}

                    {subs.length > 0 && (
                      <>
                        <div className="px-3 py-1.5 text-[9px] font-black uppercase tracking-wider text-[var(--theme-text-secondary)]" style={{ background: 'rgba(255,255,255,.04)' }}>
                          ספסל חילופים ({subs.length})
                        </div>
                        {subs.map(p => <PlayerRow key={p.name} p={p} />)}
                      </>
                    )}

                    {starters.length === 0 && (
                      <div className="px-4 py-4 text-center text-xs text-[var(--theme-text-secondary)]">הרכב לא פורסם</div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </motion.div>
    </div>
  );
}

function MobileSectionTabs({ value, onChange }: { value: SectionTab; onChange: (v: SectionTab) => void }) {
  const tabs: { key: SectionTab; label: string; icon: typeof Trophy }[] = [
    { key: 'matches', label: 'משחקים', icon: CalendarDays },
    { key: 'teams', label: 'נבחרות', icon: Users },
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
              className={`relative flex flex-1 flex-col items-center gap-1 py-2.5 text-[11px] font-bold transition-colors ${
                value === tab.key ? 'text-[#D4AF37]' : 'text-[var(--theme-text-secondary)]'
              }`}
            >
              <Icon className="h-4 w-4" />
              {tab.label}
              {value === tab.key && (
                <motion.div layoutId="tab-indicator" className="absolute bottom-0 h-0.5 w-8 rounded-full bg-[#D4AF37]" />
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export default function WorldCupHubClient({ matches: initialMatches, standings: initialStandings, playerStats, venues, source: initialSource, updatedAt: initialUpdatedAt }: HubProps) {
  const [matches, setMatches] = useState(initialMatches);
  const [standings, setStandings] = useState(initialStandings);
  const [source, setSource] = useState(initialSource);
  const [updatedAt, setUpdatedAt] = useState(initialUpdatedAt);
  const [selectedMatch, setSelectedMatch] = useState(() => initialMatches.find((match) => match.status === 'live') ?? initialMatches[0]);
  const [matchDetail, setMatchDetail] = useState<WorldCupMatch | null>(null);
  const [news, setNews] = useState<WorldCupNewsItem[]>([]);
  const [activeSection, setActiveSection] = useState<SectionTab>('matches');

  useEffect(() => {
    const hasLive = () => matches.some((m) => m.status === 'live');
    const interval = hasLive() ? 30_000 : 60_000;
    const id = window.setInterval(() => {
      fetch('/api/world-cup/matches')
        .then((res) => res.ok ? res.json() : null)
        .then((payload) => {
          if (!payload) return;
          if (Array.isArray(payload.matches) && payload.matches.length > 0) setMatches(payload.matches);
          if (Array.isArray(payload.standings) && payload.standings.length > 0) setStandings(payload.standings);
          if (payload.source) setSource(payload.source);
          if (payload.updatedAt) setUpdatedAt(payload.updatedAt);
        })
        .catch(() => {});
    }, interval);
    return () => window.clearInterval(id);
  }, [matches]);
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
    teams: useRef<HTMLDivElement>(null),
  };

  const handleSectionChange = (section: SectionTab) => {
    setActiveSection(section);
    sectionRefs[section].current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  return (
    <div className="min-h-screen overflow-x-hidden bg-[var(--theme-bg)]" dir="rtl">
      {/* Hero */}
      <header className="relative overflow-hidden border-b" style={{ borderColor: 'var(--theme-border)', background: 'linear-gradient(135deg, #002046, #064523 70%, #002046)' }}>
        <div className="absolute inset-0 opacity-20" style={{ backgroundImage: 'linear-gradient(90deg, rgba(255,255,255,.08) 1px, transparent 1px), linear-gradient(rgba(255,255,255,.08) 1px, transparent 1px)', backgroundSize: '42px 42px' }} />
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,rgba(212,175,55,.18),transparent_50%)]" />
        <div className="relative mx-auto grid max-w-7xl grid-cols-1 gap-6 px-4 py-6 sm:px-6 lg:grid-cols-[1.15fr_.85fr] lg:items-center lg:py-8">
          <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
            <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-[#D4AF37]/40 bg-black/20 px-3 py-1 text-sm font-bold text-[#D4AF37]">
              <Trophy className="h-4 w-4" />
              מרכז מונדיאל 2026
            </div>
            <h1 className="text-3xl font-black leading-tight text-white sm:text-4xl lg:text-5xl">כל המשחקים, השידור והדופק של הטורניר</h1>
            <p className="mt-2 max-w-2xl text-sm leading-7 text-white/72 sm:text-base">לוח משחקים, כאן 11, חדשות, טבלאות, אצטדיונים, מזג אוויר וצ׳אט משחקים חי.</p>

            {nextCountdown && (
              <div className="mt-4 rounded-2xl border border-[#D4AF37]/25 bg-black/25 px-4 py-3 backdrop-blur-sm">
                <div className="mb-1.5 flex items-center justify-center gap-2">
                  <Timer className="h-4 w-4 shrink-0 text-[#D4AF37]" />
                  <span className="text-xs font-bold text-white/55">המשחק הבא</span>
                </div>
                <div className="mb-3 text-center text-sm font-black text-white">
                  {nextCountdown.match.homeTeam.flag} {nextCountdown.match.homeTeam.nameHe} <span className="text-white/40">vs</span> {nextCountdown.match.awayTeam.nameHe} {nextCountdown.match.awayTeam.flag}
                </div>
                <div className="flex gap-1.5 text-center" dir="ltr">
                  {nextCountdown.days > 0 && (
                    <div className="flex-1 rounded-lg bg-[#D4AF37]/15 px-2 py-1.5">
                      <div className="text-xl font-black tabular-nums text-[#D4AF37]">{String(nextCountdown.days).padStart(2, '0')}</div>
                      <div className="text-[9px] font-bold text-white/55">ימים</div>
                    </div>
                  )}
                  <div className="flex-1 rounded-lg bg-[#D4AF37]/15 px-2 py-1.5">
                    <div className="text-xl font-black tabular-nums text-[#D4AF37]">{String(nextCountdown.hours).padStart(2, '0')}</div>
                    <div className="text-[9px] font-bold text-white/55">שעות</div>
                  </div>
                  <div className="flex-1 rounded-lg bg-[#D4AF37]/15 px-2 py-1.5">
                    <div className="text-xl font-black tabular-nums text-[#D4AF37]">{String(nextCountdown.minutes).padStart(2, '0')}</div>
                    <div className="text-[9px] font-bold text-white/55">דקות</div>
                  </div>
                  <div className="flex-1 rounded-lg bg-[#D4AF37]/15 px-2 py-1.5">
                    <div className="text-xl font-black tabular-nums text-[#D4AF37]">{String(nextCountdown.seconds).padStart(2, '0')}</div>
                    <div className="text-[9px] font-bold text-white/55">שניות</div>
                  </div>
                </div>
              </div>
            )}

            <div className="mt-3 flex max-w-full gap-2 overflow-x-auto text-[11px] text-white/55" style={{ scrollbarWidth: 'none' }}>
              <span className="shrink-0 rounded-full px-2.5 py-1" style={{ background: source === 'football-data' ? 'rgba(212,175,55,.18)' : 'rgba(255,255,255,.08)', color: source === 'football-data' ? '#D4AF37' : undefined }}>
                📡 {source === 'football-data' ? 'Football-Data.org' : 'Fallback מקומי'}
              </span>
              <span className="shrink-0 rounded-full bg-white/8 px-2.5 py-1">🕐 {new Date(updatedAt).toLocaleTimeString('he-IL', { timeZone: 'Asia/Jerusalem' })}</span>
              <span className="shrink-0 rounded-full bg-white/8 px-2.5 py-1">🇮🇱 שעון ישראל</span>
            </div>
          </motion.div>

          <Card className="border-[#D4AF37]/35 bg-black/20 p-4">
            <div className="mb-3 flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className={`text-xs font-bold ${selectedMatch.status === 'live' ? 'text-red-400' : 'text-[#D4AF37]'}`}>{statusLabel(selectedMatch)}</p>
                <h2 className="truncate text-lg font-black text-white sm:text-xl">{stageLabel(selectedMatch.stage)}{selectedMatch.group ? ` · בית ${selectedMatch.group}` : ''}</h2>
              </div>
              <div className="flex shrink-0 items-center gap-1.5 rounded-full bg-white/10 px-2 py-1">
                <ChannelLogo channel={kan11} size={22} rounded={6} />
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
        <div className="grid grid-cols-1 gap-6 xl:grid-cols-[1fr_380px]">
          <div className="space-y-6">
            <Card className="overflow-hidden p-3">
              <VideoPlayer channel={kan11} stream={streamConfigs.kan11} onNext={() => {}} onPrev={() => {}} currentProgram={`מונדיאל 2026 · ${selectedMatch.homeTeam.nameHe} - ${selectedMatch.awayTeam.nameHe}`} initialMuted />
            </Card>
            <div ref={sectionRefs.matches}>
              <ScheduleGrid matches={matches} activeId={selectedMatch.id} onSelect={setSelectedMatch} onDetail={setMatchDetail} />
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

        <div ref={sectionRefs.teams}>
          <TeamsTab />
        </div>
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

      <AnimatePresence>
        {matchDetail && (
          <MatchDetailModal match={matchDetail} venues={venues} onClose={() => setMatchDetail(null)} />
        )}
      </AnimatePresence>
    </div>
  );
}
