'use client';

import { useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { addDoc, collection, deleteDoc, doc, limit, onSnapshot, orderBy, query, serverTimestamp } from 'firebase/firestore';
import { CalendarDays, CloudSun, Landmark, MessageCircle, Send, ShieldCheck, Trophy, Tv, Zap } from 'lucide-react';
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

function formatKickoff(value: string) {
  return new Date(value).toLocaleString('he-IL', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
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
  if (match.status === 'live') return `חי${match.minute ? ` · דקה ${match.minute}` : ''}`;
  if (match.status === 'finished') return 'הסתיים';
  return formatKickoff(match.kickoff);
}

function Card({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <section className={`rounded-2xl border ${className}`} style={{ background: 'var(--theme-bg-card)', borderColor: 'var(--theme-border)' }}>
      {children}
    </section>
  );
}

function MatchScore({ match }: { match: WorldCupMatch }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-2xl border p-3" style={{ borderColor: 'var(--theme-border)', background: 'var(--theme-bg-secondary)' }}>
      <div className="flex min-w-0 flex-1 items-center gap-2">
        <span className="text-2xl">{match.homeTeam.flag}</span>
        <span className="truncate text-sm font-black text-[var(--theme-text)]">{match.homeTeam.nameHe}</span>
      </div>
      <div className="rounded-xl bg-[#002046] px-3 py-2 text-center text-lg font-black tabular-nums text-[#D4AF37]" dir="ltr">
        {match.homeScore ?? '-'} : {match.awayScore ?? '-'}
      </div>
      <div className="flex min-w-0 flex-1 items-center justify-end gap-2">
        <span className="truncate text-sm font-black text-[var(--theme-text)]">{match.awayTeam.nameHe}</span>
        <span className="text-2xl">{match.awayTeam.flag}</span>
      </div>
    </div>
  );
}

function ScheduleGrid({ matches, activeId, onSelect }: { matches: WorldCupMatch[]; activeId: string; onSelect: (match: WorldCupMatch) => void }) {
  const byDay = useMemo(() => {
    return matches.reduce<Record<string, WorldCupMatch[]>>((acc, match) => {
      const key = match.kickoff.slice(0, 10);
      acc[key] = [...(acc[key] ?? []), match];
      return acc;
    }, {});
  }, [matches]);

  return (
    <Card className="overflow-hidden">
      <div className="flex items-center gap-2 border-b px-4 py-3" style={{ borderColor: 'var(--theme-border)' }}>
        <CalendarDays className="h-5 w-5 text-[#D4AF37]" />
        <h2 className="text-lg font-black text-[var(--theme-text)]">לוח משחקים</h2>
      </div>
      <div className="grid gap-3 p-3 md:grid-cols-2 xl:grid-cols-3">
        {Object.entries(byDay).map(([day, dayMatches]) => (
          <div key={day} className="rounded-xl border p-3" style={{ borderColor: 'var(--theme-border)', background: 'var(--theme-bg-secondary)' }}>
            <div className="mb-2 text-xs font-black text-[var(--theme-text-secondary)]">
              {new Date(`${day}T12:00:00`).toLocaleDateString('he-IL', { weekday: 'long', day: 'numeric', month: 'long' })}
            </div>
            <div className="space-y-2">
              {dayMatches.map((match) => (
                <button
                  key={match.id}
                  onClick={() => onSelect(match)}
                  className="w-full rounded-lg border px-3 py-2 text-right transition hover:-translate-y-0.5"
                  style={{
                    borderColor: match.id === activeId ? '#D4AF37' : 'var(--theme-border)',
                    background: match.id === activeId ? 'rgba(212,175,55,.10)' : 'var(--theme-bg-card)',
                  }}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-bold text-[#D4AF37]">{statusLabel(match)}</span>
                    <span className="text-[11px] text-[var(--theme-text-secondary)]">{stageLabel(match.stage)}{match.group ? ` · בית ${match.group}` : ''}</span>
                  </div>
                  <div className="mt-1 flex items-center justify-between gap-2 text-sm font-black text-[var(--theme-text)]">
                    <span>{match.homeTeam.flag} {match.homeTeam.nameHe}</span>
                    <span className="text-[var(--theme-text-secondary)]">-</span>
                    <span>{match.awayTeam.nameHe} {match.awayTeam.flag}</span>
                  </div>
                </button>
              ))}
            </div>
          </div>
        ))}
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
      <div className="flex items-center gap-2 border-b px-4 py-3" style={{ borderColor: 'var(--theme-border)' }}>
        <ShieldCheck className="h-5 w-5 text-[#D4AF37]" />
        <h2 className="text-lg font-black text-[var(--theme-text)]">טבלאות בתים</h2>
      </div>
      <div className="grid gap-4 p-3 lg:grid-cols-2">
        {Object.entries(groups).map(([group, rows]) => (
          <div key={group} className="overflow-hidden rounded-xl border" style={{ borderColor: 'var(--theme-border)' }}>
            <div className="bg-[#002046] px-3 py-2 text-sm font-black text-[#D4AF37]">בית {group}</div>
            <table className="w-full text-right text-xs">
              <thead style={{ color: 'var(--theme-text-secondary)' }}>
                <tr>
                  <th className="px-3 py-2">נבחרת</th><th>מש׳</th><th>נצ׳</th><th>ת׳</th><th>הפ׳</th><th>יחס</th><th className="px-3">נק׳</th>
                </tr>
              </thead>
              <tbody className="divide-y" style={{ borderColor: 'var(--theme-border)' }}>
                {rows.map((row, index) => (
                  <tr key={`${group}-${row.team.id}-${index}`} className="text-[var(--theme-text)]">
                    <td className="px-3 py-2 font-bold">{row.team.flag} {row.team.nameHe}</td>
                    <td>{row.played}</td><td>{row.won}</td><td>{row.drawn}</td><td>{row.lost}</td><td dir="ltr">{row.goalsFor}:{row.goalsAgainst}</td><td className="px-3 font-black text-[#D4AF37]">{row.points}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))}
      </div>
    </Card>
  );
}

function PlayerStatsTable({ stats }: { stats: WorldCupPlayerStat[] }) {
  return (
    <Card className="overflow-hidden">
      <div className="flex items-center gap-2 border-b px-4 py-3" style={{ borderColor: 'var(--theme-border)' }}>
        <Zap className="h-5 w-5 text-[#D4AF37]" />
        <h2 className="text-lg font-black text-[var(--theme-text)]">סטטיסטיקות שחקנים</h2>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[620px] text-right text-sm">
          <thead style={{ color: 'var(--theme-text-secondary)' }}>
            <tr><th className="px-4 py-3">#</th><th>שחקן</th><th>נבחרת</th><th>שערים</th><th>בישולים</th><th>בעיטות</th><th className="px-4">דקות</th></tr>
          </thead>
          <tbody className="divide-y" style={{ borderColor: 'var(--theme-border)' }}>
            {stats.map((stat) => (
              <tr key={`${stat.rank}-${stat.playerName}`} className="text-[var(--theme-text)]">
                <td className="px-4 py-3 font-black text-[#D4AF37]">{stat.rank}</td>
                <td className="font-bold">{stat.playerName}</td>
                <td>{stat.team.flag} {stat.team.nameHe}</td>
                <td>{stat.goals}</td><td>{stat.assists}</td><td>{stat.shots}</td><td className="px-4">{stat.minutes}</td>
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
    <span className="inline-flex items-center gap-1 rounded-full bg-black/35 px-2 py-1 text-[11px] text-white">
      <CloudSun className="h-3.5 w-3.5 text-[#D4AF37]" />
      {typeof weather?.temperature === 'number' ? `${weather.temperature}°C` : 'מזג אוויר'}
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
  return (
    <Card className="overflow-hidden">
      <div className="flex items-center gap-2 border-b px-4 py-3" style={{ borderColor: 'var(--theme-border)' }}>
        <Landmark className="h-5 w-5 text-[#D4AF37]" />
        <h2 className="text-lg font-black text-[var(--theme-text)]">16 אצטדיונים</h2>
      </div>
      <div className="grid gap-3 p-3 md:grid-cols-2 xl:grid-cols-4">
        {venues.map((venue) => (
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
              <p className="text-xs text-[var(--theme-text-secondary)]">{venue.cityHe}, {venue.countryHe}</p>
              <p className="mt-2 text-xs leading-5 text-[var(--theme-text-secondary)]">{venue.factHe}</p>
            </div>
          </article>
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

  useEffect(() => {
    const q = query(collection(db, 'world-cup-chat', match.id, 'messages'), orderBy('createdAt', 'asc'), limit(120));
    return onSnapshot(q, (snapshot) => {
      setMessages(snapshot.docs.map((entry) => ({ id: entry.id, ...entry.data() } as ChatMessage)));
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
        <div>
          <h2 className="text-lg font-black text-[var(--theme-text)]">צ׳אט משחק</h2>
          <p className="text-xs text-[var(--theme-text-secondary)]">{match.homeTeam.nameHe} נגד {match.awayTeam.nameHe}</p>
        </div>
      </div>
      <div className="flex-1 space-y-2 overflow-y-auto p-3">
        {messages.length === 0 ? (
          <p className="rounded-xl border p-4 text-center text-sm text-[var(--theme-text-secondary)]" style={{ borderColor: 'var(--theme-border)' }}>
            עוד אין הודעות למשחק הזה.
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
            <button disabled={sending || !text.trim()} onClick={() => void send()} className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#D4AF37] text-[#002046] disabled:opacity-50">
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

export default function WorldCupHubClient({ matches, standings, playerStats, venues, source, updatedAt }: HubProps) {
  const [selectedMatch, setSelectedMatch] = useState(() => matches.find((match) => match.status === 'live') ?? matches[0]);
  const [news, setNews] = useState<WorldCupNewsItem[]>([]);
  const kan11 = channels.find((channel) => channel.id === 'kan11') ?? channels[0];
  const selectedVenue = venues.find((venue) => venue.id === selectedMatch.venueId);

  useEffect(() => {
    fetch('/api/world-cup/news')
      .then((res) => res.json())
      .then((payload) => setNews(Array.isArray(payload.items) ? payload.items : []))
      .catch(() => {});
  }, []);

  return (
    <div className="min-h-screen bg-[var(--theme-bg)]" dir="rtl">
      <header className="relative overflow-hidden border-b" style={{ borderColor: 'var(--theme-border)', background: 'linear-gradient(135deg, #002046, #064523 70%, #002046)' }}>
        <div className="absolute inset-0 opacity-20" style={{ backgroundImage: 'linear-gradient(90deg, rgba(255,255,255,.08) 1px, transparent 1px), linear-gradient(rgba(255,255,255,.08) 1px, transparent 1px)', backgroundSize: '42px 42px' }} />
        <div className="relative mx-auto grid max-w-7xl gap-6 px-4 py-8 sm:px-6 lg:grid-cols-[1.15fr_.85fr] lg:items-center">
          <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
            <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-[#D4AF37]/40 bg-black/20 px-3 py-1 text-sm font-bold text-[#D4AF37]">
              <Trophy className="h-4 w-4" />
              מרכז מונדיאל 2026
            </div>
            <h1 className="text-4xl font-black leading-tight text-white sm:text-5xl">כל המשחקים, השידור והדופק של הטורניר במקום אחד</h1>
            <p className="mt-3 max-w-2xl text-base leading-8 text-white/72">לוח משחקים, כאן 11, חדשות, טבלאות, אצטדיונים, מזג אוויר וצ׳אט משחקים חי לקהילת TV Industry IL.</p>
            <div className="mt-4 flex flex-wrap gap-2 text-xs text-white/64">
              <span className="rounded-full bg-white/10 px-3 py-1">מקור נתונים: {source === 'football-data' ? 'Football-Data.org' : 'Fallback מקומי'}</span>
              <span className="rounded-full bg-white/10 px-3 py-1">עודכן: {new Date(updatedAt).toLocaleTimeString('he-IL')}</span>
            </div>
          </motion.div>
          <Card className="border-[#D4AF37]/35 bg-black/20 p-4">
            <div className="mb-3 flex items-center justify-between gap-3">
              <div>
                <p className="text-xs font-bold text-[#D4AF37]">{statusLabel(selectedMatch)}</p>
                <h2 className="text-xl font-black text-white">{stageLabel(selectedMatch.stage)}{selectedMatch.group ? ` · בית ${selectedMatch.group}` : ''}</h2>
              </div>
              <Tv className="h-7 w-7 text-[#D4AF37]" />
            </div>
            <MatchScore match={selectedMatch} />
            <p className="mt-3 text-sm text-white/68">{selectedVenue ? `${selectedVenue.nameHe}, ${selectedVenue.cityHe}` : 'אצטדיון ייקבע בהמשך'}</p>
          </Card>
        </div>
      </header>

      <main className="mx-auto max-w-7xl space-y-6 px-4 py-6 sm:px-6">
        <div className="grid gap-6 xl:grid-cols-[1fr_380px]">
          <div className="space-y-6">
            <Card className="overflow-hidden p-3">
              <VideoPlayer channel={kan11} stream={streamConfigs.kan11} onNext={() => {}} onPrev={() => {}} currentProgram={`מונדיאל 2026 · ${selectedMatch.homeTeam.nameHe} - ${selectedMatch.awayTeam.nameHe}`} initialMuted />
            </Card>
            <ScheduleGrid matches={matches} activeId={selectedMatch.id} onSelect={setSelectedMatch} />
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

        <StandingsTables standings={standings} />
        <PlayerStatsTable stats={playerStats} />
        <VenuesGrid venues={venues} />
      </main>
    </div>
  );
}
