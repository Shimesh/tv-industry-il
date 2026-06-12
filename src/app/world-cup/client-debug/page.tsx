'use client';

import { useEffect, useState } from 'react';

type DebugResult = {
  label: string;
  url: string;
  status: number | string;
  ok: boolean;
  data?: unknown;
  error?: string;
  duration: number;
};

async function testUrl(label: string, url: string): Promise<DebugResult> {
  const t0 = Date.now();
  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(8000) });
    let data: unknown;
    try { data = await r.json(); } catch { data = '(not JSON)'; }
    return { label, url, status: r.status, ok: r.ok, data, duration: Date.now() - t0 };
  } catch (e) {
    return { label, url, status: 'error', ok: false, error: String(e).slice(0, 200), duration: Date.now() - t0 };
  }
}

const TODAY = new Date().toISOString().slice(0, 10).replace(/-/g, '');
const MATCH_DATE = '20260611';

const TESTS: [string, string][] = [
  ['ESPN fifa.world scoreboard today', `https://site.api.espn.com/apis/site/v2/sports/soccer/fifa.world/scoreboard?dates=${TODAY}`],
  ['ESPN fifa.world scoreboard 20260611', `https://site.api.espn.com/apis/site/v2/sports/soccer/fifa.world/scoreboard?dates=${MATCH_DATE}`],
  ['ESPN fifa.world scoreboard range', `https://site.api.espn.com/apis/site/v2/sports/soccer/fifa.world/scoreboard?dates=${MATCH_DATE}-${TODAY}`],
  ['ESPN fifa.world.2026 scoreboard', `https://site.api.espn.com/apis/site/v2/sports/soccer/fifa.world.2026/scoreboard?dates=${MATCH_DATE}`],
  ['ESPN soccer scoreboard today', `https://site.api.espn.com/apis/site/v2/sports/soccer/scoreboard?dates=${TODAY}`],
  ['ESPN Core fifa.world events', `https://sports.core.api.espn.com/v2/sports/soccer/leagues/fifa.world/events?dates=${MATCH_DATE}&limit=20`],
  ['SofaScore WC 2026 seasons', 'https://api.sofascore.com/api/v1/unique-tournament/16/seasons'],
  ['SofaScore events by date 2026-06-11', 'https://api.sofascore.com/api/v1/sport/football/scheduled-events/2026-06-11'],
  ['OpenFootball WC 2026', 'https://raw.githubusercontent.com/openfootball/worldcup.json/master/2026/worldcup.json'],
];

function extractMatchesInfo(data: unknown): string {
  if (!data || typeof data !== 'object') return '—';
  const d = data as Record<string, unknown>;
  if (Array.isArray(d.events)) {
    const evs = d.events as Array<Record<string, unknown>>;
    return `${evs.length} events: ${evs.slice(0, 5).map(e => String(e.name ?? e.shortName ?? e.id ?? '')).join(', ')}`;
  }
  if (d.seasons && Array.isArray(d.seasons)) {
    const ss = d.seasons as Array<Record<string, unknown>>;
    return `${ss.length} seasons: ${ss.slice(0, 5).map(s => `${s.name}(${s.id})`).join(', ')}`;
  }
  if (d.events && typeof d.events === 'object') {
    const evs = d.events as Array<Record<string, unknown>>;
    if (Array.isArray(evs)) return `${evs.length} events`;
  }
  if (d.rounds && Array.isArray(d.rounds)) {
    const rs = d.rounds as Array<Record<string, unknown>>;
    const total = rs.reduce((acc, r) => acc + ((r.matches as unknown[])?.length ?? 0), 0);
    return `${rs.length} rounds, ${total} matches`;
  }
  const keys = Object.keys(d).slice(0, 8).join(', ');
  return `keys: {${keys}}`;
}

export default function ClientDebugPage() {
  const [results, setResults] = useState<DebugResult[]>([]);
  const [running, setRunning] = useState(false);
  const [done, setDone] = useState(false);

  const runTests = async () => {
    setRunning(true);
    setResults([]);
    setDone(false);
    for (const [label, url] of TESTS) {
      const r = await testUrl(label, url);
      setResults(prev => [...prev, r]);
    }
    setDone(true);
    setRunning(false);
  };

  useEffect(() => { void runTests(); }, []);

  return (
    <div style={{ fontFamily: 'monospace', padding: '16px', background: '#111', color: '#eee', minHeight: '100vh' }}>
      <h1 style={{ fontSize: '18px', color: '#FFD700', marginBottom: '8px' }}>🔍 World Cup Client Debug</h1>
      <p style={{ color: '#888', fontSize: '12px', marginBottom: '16px' }}>
        Tests run from your browser — shows what each sports API returns.<br/>
        Date: {new Date().toISOString()}
      </p>

      {running && (
        <div style={{ color: '#4AF', marginBottom: '12px' }}>⏳ Running tests...</div>
      )}

      {done && (
        <div style={{ color: '#4F4', marginBottom: '12px' }}>✅ All tests complete</div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
        {results.map((r, i) => (
          <div key={i} style={{
            background: r.ok ? '#1a2a1a' : '#2a1a1a',
            border: `1px solid ${r.ok ? '#2a4a2a' : '#4a2a2a'}`,
            borderRadius: '8px',
            padding: '10px',
          }}>
            <div style={{ fontWeight: 'bold', color: r.ok ? '#4F4' : '#F44', fontSize: '14px' }}>
              {r.ok ? '✅' : '❌'} {r.label}
            </div>
            <div style={{ color: '#888', fontSize: '11px', marginTop: '4px' }}>
              {r.url.slice(0, 80)}{r.url.length > 80 ? '…' : ''}
            </div>
            <div style={{ fontSize: '12px', marginTop: '4px' }}>
              <span style={{ color: r.ok ? '#4F4' : '#F44' }}>HTTP {r.status}</span>
              {' · '}{r.duration}ms
            </div>
            {r.error && (
              <div style={{ color: '#F84', fontSize: '11px', marginTop: '4px' }}>
                Error: {r.error}
              </div>
            )}
            {r.ok && r.data && (
              <div style={{ color: '#AAA', fontSize: '11px', marginTop: '4px', wordBreak: 'break-all' }}>
                {extractMatchesInfo(r.data)}
              </div>
            )}
          </div>
        ))}
      </div>

      {done && (
        <button
          onClick={() => void runTests()}
          style={{
            marginTop: '16px',
            padding: '8px 16px',
            background: '#333',
            color: '#FFD700',
            border: '1px solid #555',
            borderRadius: '6px',
            cursor: 'pointer',
            fontSize: '14px',
          }}
        >
          🔄 Run Again
        </button>
      )}
    </div>
  );
}
