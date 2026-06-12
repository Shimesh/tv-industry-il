'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { addDoc, collection, deleteDoc, doc, limit, onSnapshot, orderBy, query, serverTimestamp } from 'firebase/firestore';
import { CalendarDays, ChevronDown, ChevronRight, Clock, CloudSun, Filter, Landmark, MessageCircle, Newspaper, Send, ShieldCheck, Timer, Trophy, Tv, Users, X, Zap } from 'lucide-react';
import { channels } from '@/data/channels';
import { streamConfigs } from '@/data/streams';
import { db } from '@/lib/firebase';
import { useAuth } from '@/contexts/AuthContext';
import LatestNewsCarousel from '@/components/home/LatestNewsCarousel';
import ChannelLogo from '@/components/ChannelLogo';
import { VideoPlayer } from '@/components/schedule/VideoPlayer';
import type { WorldCupCardStat, WorldCupMatch, WorldCupNewsItem, WorldCupPlayerStat, WorldCupStanding, WorldCupTeamDetail, WorldCupVenue, WorldCupWeather } from '@/lib/world-cup/types';
import { teamDetails } from '@/lib/world-cup/static-data';

type WcArticleContent = {
  title: string;
  content: string;
  date: string;
  source: string;
  coverImageUrl?: string;
  smartSummary?: string;
  fallbackGradient?: string;
};

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

function CollapsibleCard({
  icon: Icon,
  title,
  badge,
  subtitle,
  defaultOpen = false,
  className = '',
  children,
}: {
  icon: typeof Trophy;
  title: string;
  badge?: string;
  subtitle?: React.ReactNode;
  defaultOpen?: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <section className={`rounded-2xl border overflow-hidden ${className}`} style={{ background: 'var(--theme-bg-card)', borderColor: 'var(--theme-border)' }}>
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-2 px-4 py-3 text-right transition-colors hover:bg-white/5"
        style={{ borderBottom: open ? '1px solid var(--theme-border)' : 'none' }}
      >
        <Icon className="h-5 w-5 shrink-0 text-[#D4AF37]" />
        <div className="min-w-0 flex-1">
          <h2 className="text-base font-black text-[var(--theme-text)]">{title}</h2>
          {subtitle && <p className="truncate text-xs text-[var(--theme-text-secondary)]">{subtitle}</p>}
        </div>
        {badge && <span className="shrink-0 rounded-full bg-[#D4AF37]/15 px-2 py-0.5 text-[11px] font-bold text-[#D4AF37]">{badge}</span>}
        <ChevronDown className={`h-4 w-4 shrink-0 text-[var(--theme-text-secondary)] transition-transform duration-200 ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && children}
    </section>
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
    <CollapsibleCard icon={CalendarDays} title="לוח משחקים" badge={`${matches.length} משחקים`} className="overflow-hidden">
      <StageFilterTabs value={stageFilter} onChange={setStageFilter} />
      <div className="max-h-[640px] overflow-y-auto">
        <div className="grid gap-3 p-3 sm:grid-cols-2 xl:grid-cols-3">
          {Object.entries(byDay).map(([day, dayMatches], di) => (
            <motion.div
              key={day}
              initial={{ opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: di * 0.05 }}
              className="overflow-hidden rounded-xl border"
              style={{ borderColor: 'var(--theme-border)', background: 'var(--theme-bg-secondary)' }}
            >
              {/* Day header */}
              <div className="flex items-center gap-1.5 border-b px-3 py-2.5" style={{ borderColor: 'var(--theme-border)', background: 'linear-gradient(135deg, rgba(0,32,70,.75), rgba(6,53,24,.75))' }}>
                <CalendarDays className="h-3.5 w-3.5 text-[#D4AF37]" />
                <span className="text-xs font-black text-white/90">
                  {new Date(`${day}T12:00:00`).toLocaleDateString('he-IL', { weekday: 'long', day: 'numeric', month: 'long' })}
                </span>
                <span className="mr-auto rounded-full bg-[#D4AF37]/20 px-1.5 py-0.5 text-[9px] font-bold text-[#D4AF37]">{dayMatches.length}</span>
              </div>
              <div className="space-y-2 p-2.5">
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
                      whileHover={{ scale: 1.01, transition: { duration: 0.15 } }}
                      whileTap={{ scale: 0.97 }}
                      onClick={() => { onSelect(match); onDetail(match); }}
                      className="relative w-full overflow-hidden rounded-xl border text-right transition-all"
                      style={{
                        borderColor: isActive ? '#D4AF37' : isLive ? 'rgba(239,68,68,.45)' : 'var(--theme-border)',
                        background: isActive
                          ? 'linear-gradient(135deg, rgba(212,175,55,.13), rgba(212,175,55,.04))'
                          : isLive
                          ? 'linear-gradient(135deg, rgba(239,68,68,.10), rgba(239,68,68,.03))'
                          : 'var(--theme-bg-card)',
                        boxShadow: isActive
                          ? '0 2px 16px rgba(212,175,55,.18), 0 0 0 1px rgba(212,175,55,.22)'
                          : isLive
                          ? '0 2px 10px rgba(239,68,68,.12)'
                          : undefined,
                      }}
                    >
                      {isLive && (
                        <motion.div
                          className="pointer-events-none absolute inset-0"
                          animate={{ opacity: [0.07, 0.18, 0.07] }}
                          transition={{ duration: 2.5, repeat: Infinity, ease: 'easeInOut' }}
                          style={{ background: 'radial-gradient(ellipse at 50% 50%, rgba(239,68,68,1), transparent 70%)' }}
                        />
                      )}
                      {/* Status row */}
                      <div className="flex items-center justify-between gap-2 border-b px-2.5 py-1.5"
                           style={{ borderColor: isActive ? 'rgba(212,175,55,.18)' : 'var(--theme-border)', background: 'rgba(0,0,0,.12)' }}>
                        <span className={`flex items-center gap-1 text-[10px] font-black ${isLive ? 'text-red-400' : isFinished ? 'text-[var(--theme-text-secondary)]' : 'text-[#D4AF37]'}`}>
                          {isLive && (
                            <motion.span animate={{ opacity: [1, 0, 1] }} transition={{ duration: 1, repeat: Infinity }} className="inline-block h-1.5 w-1.5 rounded-full bg-red-400" />
                          )}
                          {match.status === 'scheduled' ? (
                            <><Clock className="h-3 w-3" />{formatIsraelTimeShort(match.kickoff)}</>
                          ) : statusLabel(match)}
                        </span>
                        <span className="rounded-full bg-white/6 px-1.5 py-0.5 text-[9px] text-[var(--theme-text-secondary)]">
                          {stageLabel(match.stage)}{match.group ? ` · ${match.group}` : ''}
                        </span>
                      </div>
                      {/* Teams + score */}
                      <div className="flex items-center gap-2 px-2.5 py-2.5">
                        <div className="flex min-w-0 flex-1 items-center gap-1.5">
                          <span className="text-2xl leading-none">{match.homeTeam.flag}</span>
                          <span className="min-w-0 truncate text-xs font-black text-[var(--theme-text)]">{match.homeTeam.nameHe}</span>
                        </div>
                        <div className={`shrink-0 min-w-[48px] rounded-lg px-1.5 py-1 text-center font-black tabular-nums ${
                          isLive ? 'border border-red-500/30 bg-red-500/15 text-sm text-red-300'
                          : isFinished ? 'bg-white/10 text-sm text-[var(--theme-text)]'
                          : 'bg-[#D4AF37]/12 text-xs text-[#D4AF37]'
                        }`} dir="ltr">
                          {isLive ? (
                            <motion.span animate={{ opacity: [1, 0.3, 1] }} transition={{ duration: 1.2, repeat: Infinity }}>
                              {match.homeScore ?? '0'}:{match.awayScore ?? '0'}
                            </motion.span>
                          ) : match.homeScore != null
                            ? `${match.homeScore}:${match.awayScore}`
                            : 'vs'}
                        </div>
                        <div className="flex min-w-0 flex-1 items-center justify-end gap-1.5">
                          <span className="min-w-0 truncate text-left text-xs font-black text-[var(--theme-text)]">{match.awayTeam.nameHe}</span>
                          <span className="text-2xl leading-none">{match.awayTeam.flag}</span>
                        </div>
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
    </CollapsibleCard>
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
    <CollapsibleCard icon={ShieldCheck} title="טבלאות בתים" badge={`${groupKeys.length} בתים`} className="overflow-hidden">
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
    </CollapsibleCard>
  );
}

type TournamentStats = {
  success: boolean;
  goals: WorldCupCardStat[];
  assists: WorldCupCardStat[];
  yellowCards: WorldCupCardStat[];
  redCards: WorldCupCardStat[];
  playerStats: WorldCupPlayerStat[];
};

type StatTab = 'goals' | 'assists' | 'yellow' | 'red';

function StatRow({ rank, name, teamFlag, teamName, value, label }: { rank: number; name: string; teamFlag: string; teamName: string; value: number; label: string }) {
  return (
    <div className="flex items-center gap-3 px-4 py-2.5 border-b last:border-0" style={{ borderColor: 'var(--theme-border)' }}>
      <span className="w-6 shrink-0 text-center text-xs font-black text-[#D4AF37]">{rank}</span>
      <span className="text-lg leading-none">{teamFlag}</span>
      <div className="flex-1 min-w-0">
        <div className="text-sm font-bold text-[var(--theme-text)] truncate">{name}</div>
        <div className="text-[11px] text-[var(--theme-text-secondary)]">{teamName}</div>
      </div>
      <div className="shrink-0 text-center">
        <div className="text-lg font-black text-[var(--theme-text)]">{value}</div>
        <div className="text-[9px] font-bold uppercase tracking-wide text-[var(--theme-text-secondary)]">{label}</div>
      </div>
    </div>
  );
}

function StatsSection({ initialPlayerStats }: { initialPlayerStats: WorldCupPlayerStat[] }) {
  const [activeTab, setActiveTab] = useState<StatTab>('goals');
  const [stats, setStats] = useState<TournamentStats | null>(null);
  const [cardsLoading, setCardsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/world-cup/tournament-stats')
      .then(r => r.ok ? r.json() : null)
      .then((d: TournamentStats | null) => { if (!cancelled && d?.success) setStats(d); })
      .catch(() => {})
      .finally(() => { if (!cancelled) setCardsLoading(false); });
    return () => { cancelled = true; };
  }, []);

  const tabs: { key: StatTab; label: string; icon: string }[] = [
    { key: 'goals', label: 'שערים', icon: '⚽' },
    { key: 'assists', label: 'בישולים', icon: '🅰️' },
    { key: 'yellow', label: 'צהוב', icon: '🟨' },
    { key: 'red', label: 'אדום', icon: '🟥' },
  ];

  // Goals & assists: always from football-data.org (reliable, available immediately)
  const goalsData: WorldCupCardStat[] = initialPlayerStats
    .filter(s => s.goals > 0)
    .sort((a, b) => b.goals - a.goals)
    .map((s, i) => ({ rank: i + 1, playerName: s.playerName, team: s.team, count: s.goals }));

  const assistsData: WorldCupCardStat[] = initialPlayerStats
    .filter(s => s.assists > 0)
    .sort((a, b) => b.assists - a.assists)
    .map((s, i) => ({ rank: i + 1, playerName: s.playerName, team: s.team, count: s.assists }));

  // Cards: from ESPN summary aggregation via tournament-stats endpoint
  const yellowData = stats?.yellowCards ?? [];
  const redData = stats?.redCards ?? [];

  const isCardTab = activeTab === 'yellow' || activeTab === 'red';

  const isEmpty = (tab: StatTab) => {
    if (tab === 'goals') return goalsData.length === 0;
    if (tab === 'assists') return assistsData.length === 0;
    if (tab === 'yellow') return yellowData.length === 0;
    return redData.length === 0;
  };

  return (
    <CollapsibleCard icon={Zap} title="סטטיסטיקות" className="overflow-hidden">
      {/* Tab bar */}
      <div className="flex border-b" style={{ borderColor: 'var(--theme-border)' }}>
        {tabs.map(t => (
          <button
            key={t.key}
            onClick={() => setActiveTab(t.key)}
            className={`flex-1 py-2.5 text-xs font-black transition-colors flex items-center justify-center gap-1.5 ${
              activeTab === t.key
                ? 'text-[#D4AF37] border-b-2 border-[#D4AF37] -mb-px'
                : 'text-[var(--theme-text-secondary)]'
            }`}
          >
            <span>{t.icon}</span>
            <span>{t.label}</span>
          </button>
        ))}
      </div>

      {/* Tab content — cards tabs wait for ESPN data, goals/assists show immediately */}
      {isCardTab && cardsLoading ? (
        <div className="py-8 text-center text-sm text-[var(--theme-text-secondary)]">טוען נתונים...</div>
      ) : isEmpty(activeTab) ? (
        <div className="py-8 text-center text-sm text-[var(--theme-text-secondary)]">
          <div className="text-2xl mb-2">{activeTab === 'yellow' ? '🟨' : activeTab === 'red' ? '🟥' : '📊'}</div>
          אין נתונים זמינים עדיין
        </div>
      ) : (
        <div>
          {activeTab === 'goals' && goalsData.map(s => (
            <StatRow key={`${s.rank}-${s.playerName}`} rank={s.rank} name={s.playerName} teamFlag={s.team.flag} teamName={s.team.nameHe} value={s.count} label="שערים" />
          ))}
          {activeTab === 'assists' && assistsData.map(s => (
            <StatRow key={`${s.rank}-${s.playerName}`} rank={s.rank} name={s.playerName} teamFlag={s.team.flag} teamName={s.team.nameHe} value={s.count} label="בישולים" />
          ))}
          {activeTab === 'yellow' && yellowData.map(s => (
            <StatRow key={`${s.rank}-${s.playerName}`} rank={s.rank} name={s.playerName} teamFlag={s.team.flag} teamName={s.team.nameHe} value={s.count} label="כרטיסים" />
          ))}
          {activeTab === 'red' && redData.map(s => (
            <StatRow key={`${s.rank}-${s.playerName}`} rank={s.rank} name={s.playerName} teamFlag={s.team.flag} teamName={s.team.nameHe} value={s.count} label="כרטיסים" />
          ))}
        </div>
      )}
    </CollapsibleCard>
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

function VenueLocalClock({ timezone }: { timezone: string }) {
  const timeRef = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    function tick() {
      if (timeRef.current) {
        timeRef.current.textContent = new Date().toLocaleTimeString('he-IL', {
          timeZone: timezone, hour: '2-digit', minute: '2-digit', second: '2-digit',
        });
      }
    }
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [timezone]);
  return <span ref={timeRef} className="font-mono tabular-nums text-[#D4AF37]" dir="ltr" />;
}

const COUNTRY_COLORS: Record<string, { bg: string; border: string; flag: string }> = {
  'מקסיקו':        { bg: 'from-green-900/60 to-green-950/80', border: 'border-green-700/40', flag: '🇲🇽' },
  'קנדה':          { bg: 'from-red-900/60 to-red-950/80',   border: 'border-red-700/40',   flag: '🇨🇦' },
  'ארצות הברית':   { bg: 'from-blue-900/60 to-blue-950/80',  border: 'border-blue-700/40',  flag: '🇺🇸' },
};

function VenuesGrid({ venues, matches }: { venues: WorldCupVenue[]; matches: WorldCupMatch[] }) {
  const grouped = useMemo(() => {
    const map: Record<string, WorldCupVenue[]> = {};
    for (const v of venues) {
      map[v.countryHe] = [...(map[v.countryHe] ?? []), v];
    }
    return Object.entries(map);
  }, [venues]);

  const matchCountByVenue = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const m of matches) {
      counts[m.venueId] = (counts[m.venueId] ?? 0) + 1;
    }
    return counts;
  }, [matches]);

  return (
    <CollapsibleCard icon={Landmark} title="16 אצטדיונים" badge="3 מדינות" className="overflow-hidden">
      <div className="space-y-6 p-3">
        {grouped.map(([country, countryVenues]) => {
          const cc = COUNTRY_COLORS[country] ?? { bg: 'from-slate-800/60 to-slate-900/80', border: 'border-slate-600/40', flag: '🏳️' };
          return (
            <div key={country}>
              {/* Country header */}
              <div className={`mb-3 rounded-xl border bg-gradient-to-l p-3 ${cc.bg} ${cc.border}`}>
                <div className="flex items-center gap-3">
                  <span className="text-2xl leading-none">{cc.flag}</span>
                  <div className="flex-1">
                    <h3 className="text-base font-black text-white">{country}</h3>
                    <p className="text-xs text-white/60">{countryVenues.length} אצטדיונים</p>
                  </div>
                  <span className="rounded-full bg-[#D4AF37]/20 px-3 py-1 text-xs font-black text-[#D4AF37]">
                    {countryVenues.reduce((s, v) => s + v.capacity, 0).toLocaleString()} מקומות
                  </span>
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {countryVenues.map((venue) => {
                  const gameCount = matchCountByVenue[venue.id] ?? 0;
                  const isFinal = venue.id === 'new-york-new-jersey';
                  return (
                    <article key={venue.id} className="group overflow-hidden rounded-xl border transition-all duration-300 hover:-translate-y-0.5 hover:shadow-xl" style={{ borderColor: isFinal ? '#D4AF37' : 'var(--theme-border)', background: 'var(--theme-bg-secondary)' }}>
                      {/* Image */}
                      <div className="relative h-44 overflow-hidden">
                        <VenueImage venue={venue} />
                        <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/20 to-transparent" />
                        {/* Final badge */}
                        {isFinal && (
                          <div className="absolute top-2 right-2 flex items-center gap-1 rounded-full bg-[#D4AF37] px-2 py-0.5 text-[10px] font-black text-[#002046]">
                            🏆 גמר
                          </div>
                        )}
                        {/* Weather + capacity row */}
                        <div className="absolute bottom-2 right-2 left-2 flex items-center justify-between gap-2">
                          <WeatherPill venueId={venue.id} />
                          <span className="rounded-full bg-[#D4AF37] px-2 py-1 text-[11px] font-black text-[#002046]" dir="ltr">
                            {venue.capacity.toLocaleString()}
                          </span>
                        </div>
                      </div>

                      {/* Content */}
                      <div className="p-3 space-y-2">
                        {/* Name + city */}
                        <div>
                          <h3 className="font-black leading-tight text-[var(--theme-text)]">{venue.nameHe}</h3>
                          <p className="text-xs text-[var(--theme-text-secondary)]">{venue.cityHe}</p>
                        </div>

                        {/* Info pills row */}
                        <div className="flex flex-wrap gap-1.5">
                          {gameCount > 0 && (
                            <span className="rounded-full bg-blue-500/15 px-2 py-0.5 text-[10px] font-bold text-blue-400">
                              {gameCount} משחקים
                            </span>
                          )}
                          <span className="rounded-full bg-white/8 px-2 py-0.5 text-[10px] text-[var(--theme-text-secondary)]">
                            {venue.roofHe}
                          </span>
                          <span className="rounded-full bg-emerald-500/12 px-2 py-0.5 text-[10px] text-emerald-400">
                            דשא טבעי
                          </span>
                        </div>

                        {/* Local time */}
                        <div className="flex items-center gap-1.5 rounded-lg border px-2 py-1.5 text-[11px]" style={{ borderColor: 'var(--theme-border)', background: 'var(--theme-bg)' }}>
                          <Clock className="h-3 w-3 shrink-0 text-[#D4AF37]" />
                          <span className="text-[var(--theme-text-secondary)]">שעה מקומית:</span>
                          <VenueLocalClock timezone={venue.timezone} />
                        </div>

                        {/* Fact */}
                        <p className="line-clamp-2 text-xs leading-relaxed text-[var(--theme-text-secondary)]">{venue.factHe}</p>
                      </div>
                    </article>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </CollapsibleCard>
  );
}

function WorldCupChat({ match }: { match: WorldCupMatch }) {
  const { user, profile } = useAuth();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

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
      setTimeout(() => {
        const c = containerRef.current;
        if (c) c.scrollTop = c.scrollHeight;
      }, 100);
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
  const subtitle = `${match.homeTeam.flag} ${match.homeTeam.nameHe} נגד ${match.awayTeam.nameHe} ${match.awayTeam.flag}`;

  return (
    <CollapsibleCard icon={MessageCircle} title="צ׳אט משחק" subtitle={subtitle} className="flex flex-col overflow-hidden">
      <div ref={containerRef} className="min-h-[380px] flex-1 space-y-2 overflow-y-auto p-3">
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
    </CollapsibleCard>
  );
}

const positionLabel: Record<string, string> = { GK: 'שוער', DEF: 'הגנה', MID: 'קישור', FWD: 'תקיפה' };
const positionColor: Record<string, string> = { GK: '#D4AF37', DEF: '#4ade80', MID: '#60a5fa', FWD: '#f87171' };
const confederationLabel: Record<string, string> = { UEFA: 'אירופה', CONMEBOL: 'דרום אמריקה', CONCACAF: 'צפון/מרכז אמריקה', CAF: 'אפריקה', AFC: 'אסיה', OFC: 'אוקיאניה' };
const confAccent: Record<string, string> = { UEFA: '59,130,246', CONMEBOL: '34,197,94', CONCACAF: '239,68,68', CAF: '249,115,22', AFC: '168,85,247', OFC: '20,184,166' };

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
  const base = confFilter === 'all' ? teamDetails : teamDetails.filter(t => t.confederation === confFilter);
  const filtered = [...base].sort((a, b) => {
    if (a.fifaRanking == null && b.fifaRanking == null) return 0;
    if (a.fifaRanking == null) return 1;
    if (b.fifaRanking == null) return -1;
    return a.fifaRanking - b.fifaRanking;
  });

  return (
    <CollapsibleCard icon={Users} title="נבחרות מונדיאל 2026" badge={`${teamDetails.length} נבחרות`} className="overflow-hidden">
      {/* Confederation filter */}
      <div className="flex gap-1.5 overflow-x-auto px-4 py-2.5" style={{ scrollbarWidth: 'none' }}>
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
      {/* 4-column flag grid */}
      <div className="grid grid-cols-2 gap-2 p-3 sm:grid-cols-4">
        <AnimatePresence mode="popLayout">
          {filtered.map((team, i) => {
            const accent = confAccent[team.confederation] ?? '212,175,55';
            /* Stagger the CSS animation start so cards breathe out of sync.
               Negative delay = already in progress when mounted (no pause before start). */
            const dur   = `${3.2 + (i % 7) * 0.44}s`;
            const delay = `-${((i * 0.55) % 3.2).toFixed(2)}s`;
            return (
              <motion.button
                key={team.id}
                layout
                initial={{ opacity: 0, scale: 0.78, y: 28 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.78, y: 16 }}
                transition={{ duration: 0.26, delay: Math.min(i * 0.016, 0.52), ease: [0.22, 1, 0.36, 1] }}
                whileHover={{ y: -7, scale: 1.06, transition: { duration: 0.18, ease: 'easeOut' } }}
                whileTap={{ scale: 0.93, transition: { duration: 0.08 } }}
                onClick={() => setSelectedTeam(team)}
                className="group relative overflow-hidden rounded-2xl text-center"
                style={{
                  aspectRatio: '3 / 4',
                  background: '#000',
                  boxShadow: `0 4px 20px rgba(0,0,0,.55), 0 0 0 1px rgba(${accent},.25)`,
                }}
              >
                {/* ── Flag — CSS-animated breathing (compositor-threaded, no JS loop) ── */}
                <div
                  className="absolute inset-0 flex items-center justify-center"
                  style={{
                    animation: `wc-flag-breathe ${dur} ease-in-out infinite`,
                    animationDelay: delay,
                    willChange: 'transform',
                  }}
                >
                  <span
                    className="select-none leading-none"
                    style={{ fontSize: 'clamp(18rem, 50vw, 26rem)', lineHeight: 1 }}
                  >
                    {team.flag}
                  </span>
                </div>

                {/* ── Golden glow — CSS-animated, synced to flag ── */}
                <div
                  className="pointer-events-none absolute inset-0"
                  style={{
                    background: 'radial-gradient(ellipse at 50% 50%, rgba(212,175,55,.6) 0%, transparent 60%)',
                    animation: `wc-gold-pulse ${dur} ease-in-out infinite`,
                    animationDelay: delay,
                    willChange: 'opacity',
                  }}
                />

                {/* Confederation colour bloom (static, only intensifies on hover) */}
                <div
                  className="pointer-events-none absolute inset-0 opacity-18 transition-opacity duration-300 group-hover:opacity-38"
                  style={{ background: `radial-gradient(circle at 50% 50%, rgba(${accent},.55) 0%, transparent 58%)` }}
                />

                {/* Vignette — dark edges keep text readable */}
                <div
                  className="pointer-events-none absolute inset-0"
                  style={{ background: 'radial-gradient(ellipse at 50% 50%, transparent 32%, rgba(0,0,0,.65) 100%)' }}
                />
                <div className="pointer-events-none absolute inset-x-0 top-0 h-12 bg-gradient-to-b from-black/40 to-transparent" />
                <div className="pointer-events-none absolute inset-x-0 bottom-0 h-20 bg-gradient-to-t from-black/65 to-transparent" />

                {/* ── Pulsing golden border ring (CSS) ── */}
                <div
                  className="pointer-events-none absolute inset-0 rounded-2xl"
                  style={{
                    boxShadow: 'inset 0 0 0 1.5px rgba(212,175,55,.5)',
                    animation: `wc-gold-pulse ${dur} ease-in-out infinite`,
                    animationDelay: delay,
                    willChange: 'opacity',
                  }}
                />

                {/* ── Centred content ── */}
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 px-2">
                  <div
                    className="rounded-2xl px-3 py-2 backdrop-blur-md"
                    style={{ background: 'rgba(0,0,0,.72)', border: '1px solid rgba(255,255,255,.22)' }}
                  >
                    <div
                      className="font-black text-white leading-tight"
                      style={{ fontSize: 'clamp(.95rem, 2.8vw, 1.2rem)', textShadow: '0 2px 12px rgba(0,0,0,1)' }}
                    >
                      {team.nameHe}
                    </div>
                  </div>

                  {(team.worldCupTitles > 0 || team.group || team.fifaRanking) && (
                    <div className="flex flex-wrap items-center justify-center gap-1">
                      {team.worldCupTitles > 0 && (
                        <span className="flex items-center gap-0.5 rounded-full bg-black/70 px-1.5 py-0.5 text-[9px] font-black text-[#D4AF37] backdrop-blur-sm" style={{ border: '1px solid rgba(212,175,55,.38)' }}>
                          <Trophy className="h-2.5 w-2.5" />×{team.worldCupTitles}
                        </span>
                      )}
                      {team.group && (
                        <span
                          className="rounded-full bg-black/70 px-1.5 py-0.5 text-[9px] font-bold text-white backdrop-blur-sm"
                          style={{ border: `1px solid rgba(${accent},.48)` }}
                        >
                          בית {team.group}
                        </span>
                      )}
                      {team.fifaRanking && (
                        <span className="rounded-full bg-black/70 px-1.5 py-0.5 text-[9px] text-white/90 backdrop-blur-sm" style={{ border: '1px solid rgba(255,255,255,.18)' }}>
                          #{team.fifaRanking}
                        </span>
                      )}
                    </div>
                  )}
                </div>
              </motion.button>
            );
          })}
          {filtered.length === 0 && (
            <motion.div
              key="empty"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="col-span-full rounded-xl border p-8 text-center text-sm text-[var(--theme-text-secondary)]"
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
    </CollapsibleCard>
  );
}

type MatchEvent = {
  type: string;
  minute: number;
  teamName: string;
  player: string;
  detail: string;
};

const EVENT_ICONS: Record<string, string> = { goal: '⚽', owngoal: '⚽', yellowcard: '🟨', redcard: '🟥', substitution: '🔄' };

function LiveMatchBanner({ matches, onClickMatch }: { matches: WorldCupMatch[]; onClickMatch: (m: WorldCupMatch) => void }) {
  const liveMatches = matches.filter(m => m.status === 'live');
  const [eventsMap, setEventsMap] = useState<Record<string, MatchEvent[]>>({});
  const [minuteMap, setMinuteMap] = useState<Record<string, number | null>>({});
  const liveIds = liveMatches.map(m => m.id).join(',');

  useEffect(() => {
    if (!liveIds) return;
    let cancelled = false;

    const fetchAll = async () => {
      for (const match of liveMatches) {
        if (!/^\d+$/.test(match.id)) continue; // events API only works with numeric football-data IDs
        try {
          const r = await fetch(`/api/world-cup/match-events?matchId=${match.id}`, { cache: 'no-store' });
          if (!r.ok || cancelled) continue;
          const d = await r.json() as { success?: boolean; events?: MatchEvent[]; minute?: number | null };
          if (d.success && !cancelled) {
            setEventsMap(prev => ({ ...prev, [match.id]: d.events ?? [] }));
            setMinuteMap(prev => ({ ...prev, [match.id]: d.minute ?? null }));
          }
        } catch { /* ignore */ }
      }
    };

    void fetchAll();
    const id = setInterval(() => void fetchAll(), 30_000);
    return () => { cancelled = true; clearInterval(id); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [liveIds]);

  if (!liveMatches.length) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: -16 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -16 }}
      className="overflow-hidden rounded-2xl border border-red-500/35"
      style={{ background: 'linear-gradient(135deg, rgba(30,4,4,.97), rgba(0,32,70,.97))' }}
    >
      {/* Header bar */}
      <div className="flex items-center gap-2 border-b border-red-500/20 px-4 py-2" style={{ background: 'rgba(239,68,68,.14)' }}>
        <motion.div animate={{ opacity: [1, 0.15, 1] }} transition={{ duration: 0.9, repeat: Infinity }} className="h-2.5 w-2.5 rounded-full bg-red-500" />
        <span className="text-sm font-black text-red-400">🔴 שידור חי עכשיו</span>
        {liveMatches.length > 1 && (
          <span className="rounded-full bg-red-500/25 px-2 py-0.5 text-[10px] font-black text-red-400">{liveMatches.length} משחקים</span>
        )}
        <span className="mr-auto text-[11px] text-white/35">מתעדכן כל 30 שניות</span>
      </div>

      <div className={`grid gap-0 divide-y divide-white/8 ${liveMatches.length > 1 ? 'sm:grid-cols-2 sm:divide-x sm:divide-y-0' : ''}`}>
        {liveMatches.map(match => {
          const events = eventsMap[match.id] ?? [];
          const minute = minuteMap[match.id] ?? match.minute;

          return (
            <button key={match.id} onClick={() => onClickMatch(match)} className="w-full p-4 text-right transition-colors hover:bg-white/3">
              {/* Score row */}
              <div className="flex items-center justify-between gap-3">
                <div className="flex min-w-0 flex-1 flex-col items-start gap-0.5">
                  <span className="text-4xl leading-none">{match.homeTeam.flag}</span>
                  <span className="mt-1 max-w-full truncate text-sm font-black text-white">{match.homeTeam.nameHe}</span>
                </div>
                <div className="shrink-0 text-center">
                  <motion.div
                    className="rounded-2xl border border-red-500/25 bg-black/55 px-5 py-3 text-3xl font-black tabular-nums text-[#D4AF37]"
                    animate={{ opacity: [1, 0.55, 1] }}
                    transition={{ duration: 1.8, repeat: Infinity, ease: 'easeInOut' }}
                    dir="ltr"
                  >
                    {match.homeScore ?? 0} : {match.awayScore ?? 0}
                  </motion.div>
                  <div className="mt-1.5 flex items-center justify-center gap-1.5 text-xs font-black text-red-400">
                    <motion.span animate={{ opacity: [1, 0, 1] }} transition={{ duration: 1, repeat: Infinity }} className="inline-block h-1.5 w-1.5 rounded-full bg-red-500" />
                    {minute != null ? `דקה ${minute}׳` : 'חי'}
                  </div>
                </div>
                <div className="flex min-w-0 flex-1 flex-col items-end gap-0.5">
                  <span className="text-4xl leading-none">{match.awayTeam.flag}</span>
                  <span className="mt-1 max-w-full truncate text-right text-sm font-black text-white">{match.awayTeam.nameHe}</span>
                </div>
              </div>

              {/* Events chips */}
              {events.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {events.slice(0, 8).map((ev, i) => (
                    <span key={i} className="flex items-center gap-1 rounded-full bg-white/8 px-2.5 py-1 text-[10px] font-bold text-white/90">
                      <span className="font-black text-[#D4AF37] tabular-nums">{ev.minute}׳</span>
                      <span>{EVENT_ICONS[ev.type] ?? '•'}</span>
                      <span className="max-w-[100px] truncate">{ev.player || ev.teamName}</span>
                    </span>
                  ))}
                </div>
              )}

              <div className="mt-2 text-[10px] text-white/30">לחץ לפרטים ואירועי משחק ←</div>
            </button>
          );
        })}
      </div>
    </motion.div>
  );
}

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

const ESPN_SITE_SCOREBOARD = 'https://site.api.espn.com/apis/site/v2/sports/soccer/fifa.world/scoreboard';
const ESPN_SITE_SUMMARY = 'https://site.api.espn.com/apis/site/v2/sports/soccer/fifa.world/summary?event=';
const ESPN_CORE_EVENTS = 'https://sports.core.api.espn.com/v2/sports/soccer/leagues/fifa.world/events';

function parseESPNSummaryClient(data: Record<string, unknown>): MatchEvent[] {
  const evts: MatchEvent[] = [];
  type AnyPlay = Record<string, unknown>;
  function getMinute(play: AnyPlay): number {
    const clock = play.clock as Record<string, unknown> | undefined;
    if (typeof clock?.value === 'number') return Math.round(clock.value as number / 60);
    const m = (String(clock?.displayValue ?? '')).match(/^(\d+)/);
    return m ? parseInt(m[1], 10) : 0;
  }
  function normType(text?: unknown): string | null {
    if (!text) return null;
    const t = String(text).toLowerCase();
    if (t.includes('own goal') || t.includes('own-goal')) return 'owngoal';
    if (t.includes('goal') || t.includes('score')) return 'goal';
    if (t.includes('red card')) return 'redcard';
    if (t.includes('yellow card')) return 'yellowcard';
    if (t.includes('substitut')) return 'substitution';
    return null;
  }
  for (const play of (data.scoringPlays as AnyPlay[] ?? [])) {
    const type = normType((play.type as Record<string,unknown>)?.text);
    if (!type) continue;
    const involved = play.athletesInvolved as Array<Record<string,unknown>> | undefined;
    const parts = play.participants as Array<Record<string,unknown>> | undefined;
    const scorer = involved?.[0]?.displayName ?? parts?.[0]?.athlete as string ?? '';
    const assistObj = involved?.find(a => String(a.type ?? '').toLowerCase().includes('assist'));
    const assist = assistObj?.displayName ?? '';
    evts.push({ type, minute: getMinute(play), teamName: String((play.team as Record<string,unknown>)?.displayName ?? ''), player: String(scorer), detail: assist ? `בישול: ${assist}` : (type === 'owngoal' ? 'שער עצמי' : '') });
  }
  for (const play of (data.plays as AnyPlay[] ?? [])) {
    const type = normType((play.type as Record<string,unknown>)?.text);
    if (!type || type === 'goal' || type === 'owngoal') continue;
    const parts = play.participants as Array<Record<string,unknown>> | undefined;
    const player = (parts?.[0]?.athlete as Record<string,unknown>)?.displayName ?? play.text ?? '';
    const subOut = type === 'substitution'
      ? parts?.find(p => String((p.type as Record<string,unknown>)?.description ?? '').toLowerCase().includes('out'))?.athlete as string
      : undefined;
    evts.push({ type, minute: getMinute(play), teamName: String((play.team as Record<string,unknown>)?.displayName ?? ''), player: String(player), detail: subOut ? `יצא: ${String(subOut)}` : '' });
  }
  return evts.sort((a, b) => b.minute - a.minute);
}

async function clientFindEspnIdAndFetchSummary(homeEn: string, awayEn: string, dateStr: string): Promise<MatchEvent[] | null> {
  const home = homeEn.toLowerCase();
  const away = awayEn.toLowerCase();
  const word0 = (s: string) => s.split(' ')[0];

  function matchTeams(events: Array<Record<string,unknown>>): string | null {
    const found = events.find(ev => {
      const comps = ((ev.competitions as Array<Record<string,unknown>>)?.[0]?.competitors as Array<Record<string,unknown>>) ?? [];
      const names = comps.map(c => String((c.team as Record<string,unknown>)?.displayName ?? '').toLowerCase());
      const hasHome = names.some(n => n && (n.startsWith(word0(home)) || home.startsWith(word0(n))));
      const hasAway = names.some(n => n && (n.startsWith(word0(away)) || away.startsWith(word0(n))));
      return hasHome && hasAway;
    });
    return found ? String(found.id ?? '') || null : null;
  }

  // 1. Try site API scoreboard (live + date-specific)
  for (const url of [ESPN_SITE_SCOREBOARD, `${ESPN_SITE_SCOREBOARD}?dates=${dateStr}`]) {
    try {
      const r = await fetch(url);
      if (!r.ok) continue;
      const d = await r.json() as Record<string, unknown>;
      const id = matchTeams((d.events as Array<Record<string,unknown>>) ?? []);
      if (id) {
        const sr = await fetch(`${ESPN_SITE_SUMMARY}${id}`);
        if (sr.ok) return parseESPNSummaryClient(await sr.json() as Record<string,unknown>);
      }
    } catch { /* try next */ }
  }

  // 2. Try Core API (retains historical events even after site API stops showing them)
  try {
    const r = await fetch(`${ESPN_CORE_EVENTS}?dates=${dateStr}&limit=30`);
    if (r.ok) {
      const d = await r.json() as Record<string, unknown>;
      const refs = ((d.items as Array<Record<string,unknown>>) ?? []).map(i => String(i.$ref ?? '')).filter(Boolean);
      const evData = await Promise.all(refs.slice(0, 20).map(ref =>
        fetch(ref).then(r2 => r2.ok ? r2.json() as Promise<Record<string,unknown>> : null).catch(() => null),
      ));
      for (const ev of evData) {
        if (!ev?.id) continue;
        const name = String(ev.name ?? ev.shortName ?? '').toLowerCase();
        const comps = ((ev.competitions as Array<Record<string,unknown>>)?.[0]?.competitors as Array<Record<string,unknown>>) ?? [];
        const names = comps.map(c => String((c.team as Record<string,unknown>)?.displayName ?? '').toLowerCase());
        const hasHome = name.includes(word0(home)) || names.some(n => n.startsWith(word0(home)) || home.startsWith(word0(n)));
        const hasAway = name.includes(word0(away)) || names.some(n => n.startsWith(word0(away)) || away.startsWith(word0(n)));
        if (hasHome && hasAway) {
          const evId = String(ev.id);
          const sr = await fetch(`${ESPN_SITE_SUMMARY}${evId}`);
          if (sr.ok) return parseESPNSummaryClient(await sr.json() as Record<string,unknown>);
        }
      }
    }
  } catch { /* ignore */ }

  return null;
}

function LiveEventsPanel({ match }: { match: WorldCupMatch }) {
  const [events, setEvents] = useState<MatchEvent[]>([]);
  const [liveMinute, setLiveMinute] = useState<number | null>(match.minute ?? null);
  const [fetching, setFetching] = useState(true);
  const isFinished = match.status === 'finished';

  useEffect(() => {
    const params = new URLSearchParams({ matchId: match.id });
    if (match.espnEventId) params.set('espnId', match.espnEventId);
    if (match.homeTeam.nameEn) params.set('home', match.homeTeam.nameEn);
    if (match.awayTeam.nameEn) params.set('away', match.awayTeam.nameEn);
    const dateStr = match.kickoff ? match.kickoff.slice(0, 10).replace(/-/g, '') : '';
    if (dateStr) params.set('date', dateStr);
    const serverUrl = `/api/world-cup/match-events?${params}`;

    const load = async () => {
      try {
        const r = await fetch(serverUrl);
        const d = r.ok ? await r.json() as { success?: boolean; events?: MatchEvent[]; minute?: number | null } : null;
        if (d?.success && (d.events?.length ?? 0) > 0) {
          setEvents(d.events ?? []);
          setLiveMinute(d.minute ?? null);
          setFetching(false);
          return;
        }
      } catch { /* fall through */ }

      // Server API found no events — try client-side ESPN (different IP, better CORS access for historical data)
      if (match.homeTeam.nameEn && match.awayTeam.nameEn && dateStr) {
        const clientEvents = await clientFindEspnIdAndFetchSummary(match.homeTeam.nameEn, match.awayTeam.nameEn, dateStr).catch(() => null);
        if (clientEvents && clientEvents.length > 0) setEvents(clientEvents);
      }
      setFetching(false);
    };

    void load();
    if (isFinished) return;
    const id = setInterval(() => void load(), 30_000);
    return () => clearInterval(id);
  }, [match.id, match.espnEventId, match.kickoff, match.homeTeam.nameEn, match.awayTeam.nameEn, isFinished]);

  const eventIcon: Record<string, string> = {
    goal: '⚽', owngoal: '⚽', yellowcard: '🟨', redcard: '🟥', substitution: '🔄',
  };

  return (
    <div className="space-y-3 p-3">
      <div className="flex items-center justify-between rounded-xl border px-4 py-3" style={{ borderColor: 'var(--theme-border)', background: 'var(--theme-bg-secondary)' }}>
        <div className="flex items-center gap-2">
          {isFinished ? (
            <span className="font-black text-[#D4AF37] text-sm">📋 סיכום משחק</span>
          ) : (
            <>
              <motion.span animate={{ opacity: [1, 0.2, 1] }} transition={{ duration: 1, repeat: Infinity }} className="h-2.5 w-2.5 rounded-full bg-red-500" />
              <span className="font-black text-red-400 text-sm">🔴 שידור חי</span>
            </>
          )}
        </div>
        {!isFinished && liveMinute != null && (
          <span className="rounded-full bg-red-500/15 px-3 py-1 text-sm font-black text-red-400">דקה {liveMinute}׳</span>
        )}
      </div>

      {fetching && (
        <div className="py-8 text-center text-sm text-[var(--theme-text-secondary)]">טוען אירועי משחק...</div>
      )}

      {!fetching && events.length === 0 && (
        <div className="rounded-xl border px-4 py-6 text-center text-sm text-[var(--theme-text-secondary)]" style={{ borderColor: 'var(--theme-border)' }}>
          <div className="text-2xl mb-2">{isFinished ? '📊' : '⏱️'}</div>
          {isFinished ? 'אין נתוני אירועים זמינים עבור משחק זה' : 'אין אירועים עדיין · המשחק בתהליך'}
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
  const isFinished = match.status === 'finished';
  const hasEvents = isLive || isFinished;
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
          {hasEvents && (
            <button
              onClick={() => setTab('live')}
              className={`flex-1 py-2.5 text-xs font-black transition-colors ${tab === 'live' ? (isLive ? 'text-red-400 border-b-2 border-red-500' : 'text-[#D4AF37] border-b-2 border-[#D4AF37]') : 'text-[var(--theme-text-secondary)]'}`}
            >
              {isLive ? (
                <><motion.span animate={{ opacity: [1, 0.3, 1] }} transition={{ duration: 1, repeat: Infinity }}>🔴</motion.span> שידור חי</>
              ) : '📋 אירועי משחק'}
            </button>
          )}
        </div>

        {/* Body */}
        <div className="overflow-y-auto" style={{ maxHeight: 'calc(93dvh - 185px)' }}>
          {tab === 'live' && hasEvents ? (
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

function WcArticleModal({
  item,
  content,
  isLoading,
  error,
  onClose,
}: {
  item: WorldCupNewsItem;
  content: WcArticleContent | null;
  isLoading: boolean;
  error: string | null;
  onClose: () => void;
}) {
  const coverImage = content?.coverImageUrl || item.imageUrl;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center" style={{ background: 'rgba(0,0,0,.72)', backdropFilter: 'blur(6px)' }}>
      <motion.div
        initial={{ opacity: 0, y: 48 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 48 }}
        transition={{ type: 'spring', damping: 28, stiffness: 320 }}
        className="relative w-full max-w-lg overflow-hidden rounded-t-3xl sm:rounded-3xl"
        style={{ background: 'var(--theme-bg-card)', border: '1px solid var(--theme-border)', maxHeight: '90dvh' }}
      >
        {/* Cover image */}
        <div className="relative h-48 w-full shrink-0 overflow-hidden sm:h-56">
          {coverImage ? (
            <img src={coverImage} alt="" className="h-full w-full object-cover" />
          ) : (
            <div className="h-full w-full" style={{ background: content?.fallbackGradient || 'linear-gradient(135deg, #002046, #064523)' }} />
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/25 to-transparent" />
          <button
            onClick={onClose}
            className="absolute right-3 top-3 flex h-8 w-8 items-center justify-center rounded-full bg-black/50 text-white backdrop-blur-sm hover:bg-black/70"
          >
            <X className="h-4 w-4" />
          </button>
          <div className="absolute bottom-3 right-3 left-3">
            <div className="mb-1.5 flex items-center gap-1.5">
              <span className="rounded bg-[#D4AF37]/90 px-1.5 py-0.5 text-[10px] font-bold text-[#002046]">{item.source}</span>
              <span className="text-[10px] text-white/55">
                {(() => {
                  try {
                    const diffMin = Math.floor((Date.now() - new Date(item.pubDate).getTime()) / 60000);
                    const diffHours = Math.floor(diffMin / 60);
                    if (diffMin < 1) return 'עכשיו';
                    if (diffMin < 60) return `לפני ${diffMin} דק׳`;
                    if (diffHours < 24) return `לפני ${diffHours} שעות`;
                    return `לפני ${Math.floor(diffHours / 24)} ימים`;
                  } catch { return ''; }
                })()}
              </span>
            </div>
            <h2 className="text-base font-black leading-snug text-white drop-shadow">{content?.title || item.title}</h2>
          </div>
        </div>

        {/* Body */}
        <div className="overflow-y-auto p-4" style={{ maxHeight: 'calc(90dvh - 224px)' }}>
          {isLoading && (
            <div className="space-y-2">
              {[100, 85, 92, 78].map((w, i) => (
                <div key={i} className="h-3 animate-pulse rounded-full bg-white/10" style={{ width: `${w}%` }} />
              ))}
            </div>
          )}

          {error && !isLoading && (
            <p className="text-center text-sm" style={{ color: 'var(--theme-text-secondary)' }}>{error}</p>
          )}

          {!isLoading && !error && content && (
            <>
              {content.smartSummary ? (
                <div className="rounded-xl border p-3 text-sm leading-7 text-right" style={{ borderColor: 'var(--theme-border)', background: 'var(--theme-bg-secondary)', color: 'var(--theme-text)' }}>
                  <div className="mb-1.5 flex items-center gap-1.5 text-[10px] font-bold text-[#D4AF37]">
                    <Zap className="h-3 w-3" /> סיכום חכם
                  </div>
                  {content.smartSummary}
                </div>
              ) : (
                <p className="text-sm leading-7 text-right" style={{ color: 'var(--theme-text)' }}>
                  {item.description}
                </p>
              )}
            </>
          )}

          {!isLoading && !content && !error && (
            <p className="text-center text-sm" style={{ color: 'var(--theme-text-secondary)' }}>{item.description}</p>
          )}
        </div>

        {/* Footer */}
        <div className="border-t p-3" style={{ borderColor: 'var(--theme-border)' }}>
          <a
            href={item.link}
            target="_blank"
            rel="noopener noreferrer"
            className="flex w-full items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-black text-[#002046] transition hover:opacity-90"
            style={{ background: '#D4AF37' }}
          >
            <Newspaper className="h-4 w-4" />
            קרא את הכתבה המלאה
          </a>
        </div>
      </motion.div>
    </div>
  );
}

function CountdownBox({ matches }: { matches: WorldCupMatch[] }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1_000);
    return () => window.clearInterval(id);
  }, []);
  const cd = useMemo(() => getNextCountdown(matches, now), [matches, now]);
  if (!cd) return null;
  return (
    <div className="mt-4 rounded-2xl border border-[#D4AF37]/25 bg-black/25 px-4 py-3 backdrop-blur-sm">
      <div className="mb-1.5 flex items-center justify-center gap-2">
        <Timer className="h-4 w-4 shrink-0 text-[#D4AF37]" />
        <span className="text-xs font-bold text-white/55">המשחק הבא</span>
      </div>
      <div className="mb-3 text-center text-sm font-black text-white">
        {cd.match.homeTeam.flag} {cd.match.homeTeam.nameHe} <span className="text-white/40">vs</span> {cd.match.awayTeam.nameHe} {cd.match.awayTeam.flag}
      </div>
      <div className="flex gap-1.5 text-center" dir="ltr">
        {cd.days > 0 && (
          <div className="flex-1 rounded-lg bg-[#D4AF37]/15 px-2 py-1.5">
            <div className="text-xl font-black tabular-nums text-[#D4AF37]">{String(cd.days).padStart(2, '0')}</div>
            <div className="text-[9px] font-bold text-white/55">ימים</div>
          </div>
        )}
        <div className="flex-1 rounded-lg bg-[#D4AF37]/15 px-2 py-1.5">
          <div className="text-xl font-black tabular-nums text-[#D4AF37]">{String(cd.hours).padStart(2, '0')}</div>
          <div className="text-[9px] font-bold text-white/55">שעות</div>
        </div>
        <div className="flex-1 rounded-lg bg-[#D4AF37]/15 px-2 py-1.5">
          <div className="text-xl font-black tabular-nums text-[#D4AF37]">{String(cd.minutes).padStart(2, '00')}</div>
          <div className="text-[9px] font-bold text-white/55">דקות</div>
        </div>
        <div className="flex-1 rounded-lg bg-[#D4AF37]/15 px-2 py-1.5">
          <div className="text-xl font-black tabular-nums text-[#D4AF37]">{String(cd.seconds).padStart(2, '00')}</div>
          <div className="text-[9px] font-bold text-white/55">שניות</div>
        </div>
      </div>
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

export default function WorldCupHubClient({ matches: initialMatches, standings: initialStandings, playerStats: initialPlayerStats, venues, source: initialSource, updatedAt: initialUpdatedAt }: HubProps) {
  const [matches, setMatches] = useState(initialMatches);
  const [standings, setStandings] = useState(initialStandings);
  const [playerStats, setPlayerStats] = useState(initialPlayerStats);
  const [source, setSource] = useState(initialSource);
  const [updatedAt, setUpdatedAt] = useState(initialUpdatedAt);
  const [selectedMatch, setSelectedMatch] = useState(() => initialMatches.find((match) => match.status === 'live') ?? initialMatches[0]);
  const [matchDetail, setMatchDetail] = useState<WorldCupMatch | null>(null);
  const [news, setNews] = useState<WorldCupNewsItem[]>([]);
  const [activeSection, setActiveSection] = useState<SectionTab>('matches');
  const [wcSelectedItem, setWcSelectedItem] = useState<WorldCupNewsItem | null>(null);
  const [wcArticleContent, setWcArticleContent] = useState<WcArticleContent | null>(null);
  const [wcArticleLoading, setWcArticleLoading] = useState(false);
  const [wcArticleError, setWcArticleError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const poll = () => {
      fetch('/api/world-cup/matches', { cache: 'no-store' })
        .then((res) => res.ok ? res.json() : null)
        .then((payload) => {
          if (cancelled || !payload) return;
          if (Array.isArray(payload.matches) && payload.matches.length > 0) setMatches(payload.matches);
          if (Array.isArray(payload.standings) && payload.standings.length > 0) setStandings(payload.standings);
          if (Array.isArray(payload.playerStats) && payload.playerStats.length > 0) setPlayerStats(payload.playerStats);
          if (payload.source) setSource(payload.source);
          if (payload.updatedAt) setUpdatedAt(payload.updatedAt);
        })
        .catch(() => {});
    };
    poll();
    const id = window.setInterval(poll, 30_000);
    return () => { cancelled = true; window.clearInterval(id); };
  }, []);
  const kan11 = channels.find((channel) => channel.id === 'kan11') ?? channels[0];
  const featureMatch = useMemo(() => {
    const live = matches.find((m) => m.status === 'live');
    if (live) return live;
    return (
      [...matches]
        .filter((m) => m.status === 'scheduled')
        .sort((a, b) => Date.parse(a.kickoff) - Date.parse(b.kickoff))[0] ?? matches[0]
    );
  }, [matches]);
  const selectedVenue = venues.find((venue) => venue.id === featureMatch.venueId);

  useEffect(() => {
    fetch('/api/world-cup/news')
      .then((res) => res.json())
      .then((payload) => setNews(Array.isArray(payload.items) ? payload.items : []))
      .catch(() => {});
  }, []);

  const openWcArticle = async (item: WorldCupNewsItem) => {
    setWcSelectedItem(item);
    setWcArticleContent(null);
    setWcArticleLoading(true);
    setWcArticleError(null);
    try {
      const res = await fetch(`/api/news/article?url=${encodeURIComponent(item.link)}`);
      const data = await res.json();
      if (data.success && data.content) {
        setWcArticleContent({
          title: data.title,
          content: data.content,
          date: data.date,
          source: data.source,
          coverImageUrl: data.coverImageUrl,
          smartSummary: data.smartSummary,
          fallbackGradient: data.fallbackGradient
            ? `linear-gradient(135deg, ${data.fallbackGradient.from}, ${data.fallbackGradient.to})`
            : undefined,
        });
      } else {
        setWcArticleError(data.error || 'לא ניתן לטעון את הכתבה');
      }
    } catch {
      setWcArticleError('שגיאה בטעינת הכתבה');
    } finally {
      setWcArticleLoading(false);
    }
  };

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

            <CountdownBox matches={matches} />

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
                <div className="mb-0.5 flex items-center gap-1.5">
                  <span className="text-[10px] font-bold text-[#D4AF37]/70 uppercase tracking-wider">המשחק הבא</span>
                </div>
                <p className={`text-xs font-bold ${featureMatch.status === 'live' ? 'text-red-400' : 'text-[#D4AF37]'}`}>{statusLabel(featureMatch)}</p>
                <h2 className="truncate text-lg font-black text-white sm:text-xl">{stageLabel(featureMatch.stage)}{featureMatch.group ? ` · בית ${featureMatch.group}` : ''}</h2>
              </div>
              <div className="flex shrink-0 items-center gap-1.5 rounded-full bg-white/10 px-2 py-1">
                <ChannelLogo channel={kan11} size={22} rounded={6} />
                <span className="text-[11px] font-bold text-white/80">כאן 11</span>
              </div>
            </div>
            <MatchScore match={featureMatch} />
            <div className="mt-3 flex items-center justify-between text-xs text-white/55">
              <span>{selectedVenue ? `📍 ${selectedVenue.nameHe}, ${selectedVenue.cityHe}` : 'אצטדיון ייקבע'}</span>
              {featureMatch.status === 'scheduled' && (
                <span className="flex items-center gap-1 rounded-full bg-white/8 px-2 py-0.5">
                  <Clock className="h-3 w-3" />
                  {formatIsraelTimeShort(featureMatch.kickoff)} IL
                </span>
              )}
            </div>
          </Card>
        </div>
      </header>

      <MobileSectionTabs value={activeSection} onChange={handleSectionChange} />

      <main className="mx-auto max-w-7xl space-y-6 px-4 py-6 sm:px-6">
        <AnimatePresence>
          {matches.some(m => m.status === 'live') && (
            <LiveMatchBanner
              key="live-banner"
              matches={matches}
              onClickMatch={(m) => { setSelectedMatch(m); setMatchDetail(m); }}
            />
          )}
        </AnimatePresence>

        <div className="grid grid-cols-1 gap-6 xl:grid-cols-[1fr_380px]">
          <div className="space-y-6">
            <CollapsibleCard icon={Tv} title="שידור ישיר · כאן 11" subtitle={`${featureMatch.homeTeam.flag} ${featureMatch.homeTeam.nameHe} - ${featureMatch.awayTeam.nameHe} ${featureMatch.awayTeam.flag}`} defaultOpen className="overflow-hidden">
              <div className="p-3">
                <VideoPlayer channel={kan11} stream={streamConfigs.kan11} onNext={() => {}} onPrev={() => {}} currentProgram={`מונדיאל 2026 · ${featureMatch.homeTeam.nameHe} - ${featureMatch.awayTeam.nameHe}`} initialMuted />
              </div>
            </CollapsibleCard>
            <CollapsibleCard icon={Newspaper} title="חדשות מונדיאל 2026" badge={news.length > 0 ? `${news.length}` : undefined} defaultOpen className="overflow-hidden">
              {news.length > 0 ? (
                <div className="p-4">
                  <LatestNewsCarousel news={news} onCardClick={openWcArticle} />
                </div>
              ) : (
                <div className="flex items-center justify-center gap-2 p-6 text-sm" style={{ color: 'var(--theme-text-secondary)' }}>
                  <div className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                  טוען כתבות...
                </div>
              )}
            </CollapsibleCard>
            <div ref={sectionRefs.matches}>
              <ScheduleGrid matches={matches} activeId={selectedMatch.id} onSelect={setSelectedMatch} onDetail={setMatchDetail} />
            </div>
          </div>
          <div className="space-y-6">
            <WorldCupChat match={featureMatch} />
          </div>
        </div>

        <div ref={sectionRefs.teams}>
          <TeamsTab />
        </div>
        <div ref={sectionRefs.standings}>
          <StandingsTables standings={standings} />
        </div>
        <div ref={sectionRefs.stats}>
          <StatsSection initialPlayerStats={playerStats} />
        </div>
        <div ref={sectionRefs.venues}>
          <VenuesGrid venues={venues} matches={matches} />
        </div>
      </main>

      <AnimatePresence>
        {matchDetail && (
          <MatchDetailModal match={matchDetail} venues={venues} onClose={() => setMatchDetail(null)} />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {wcSelectedItem && (
          <WcArticleModal
            item={wcSelectedItem}
            content={wcArticleContent}
            isLoading={wcArticleLoading}
            error={wcArticleError}
            onClose={() => { setWcSelectedItem(null); setWcArticleContent(null); setWcArticleError(null); }}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
