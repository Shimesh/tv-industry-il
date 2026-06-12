'use client';

import { useEffect, useState } from 'react';

type Line = { label: string; value: string; ok?: boolean };

function row(label: string, value: string, ok?: boolean): Line {
  return { label, value, ok };
}

async function runDebug(): Promise<Line[]> {
  const out: Line[] = [];
  const base = 'https://site.api.espn.com/apis/site/v2/sports/soccer/fifa.world/scoreboard';

  // 1. Fetch scoreboard for June 11
  out.push(row('Step', '1 — Fetch ESPN scoreboard for 2026-06-11'));
  let mexico_id = '';
  let czechia_id = '';
  try {
    const r = await fetch(`${base}?dates=20260611`, { signal: AbortSignal.timeout(8000) });
    out.push(row('Scoreboard HTTP', String(r.status), r.ok));
    if (r.ok) {
      const d = await r.json() as Record<string, unknown>;
      const events = (d.events as Array<Record<string, unknown>>) ?? [];
      out.push(row('Events found', String(events.length), events.length > 0));
      for (const ev of events) {
        const name = String(ev.name ?? ev.shortName ?? '');
        const id = String(ev.id ?? '');
        const comps = ((ev.competitions as Array<Record<string, unknown>>)?.[0]?.competitors as Array<Record<string, unknown>>) ?? [];
        const teams = comps.map(c => String((c.team as Record<string, unknown>)?.displayName ?? '')).join(' vs ');
        out.push(row(`  Event [${id}]`, `${name} | teams: ${teams}`));
        const nameLow = name.toLowerCase();
        if (nameLow.includes('mexico') || nameLow.includes('south africa')) mexico_id = id;
        if (nameLow.includes('czechia') || nameLow.includes('korea')) czechia_id = id;
        // also check competitor names
        if (!mexico_id && (teams.toLowerCase().includes('mexico') || teams.toLowerCase().includes('south africa'))) mexico_id = id;
        if (!czechia_id && (teams.toLowerCase().includes('czechia') || teams.toLowerCase().includes('korea'))) czechia_id = id;
      }
    }
  } catch (e) { out.push(row('Scoreboard error', String(e), false)); }

  // 2. Fetch summary for Mexico vs South Africa
  out.push(row('', ''));
  out.push(row('Step', `2 — ESPN summary for Mexico vs South Africa (id=${mexico_id || '?'})`));
  if (mexico_id) {
    try {
      const sr = await fetch(`https://site.api.espn.com/apis/site/v2/sports/soccer/fifa.world/summary?event=${mexico_id}`, { signal: AbortSignal.timeout(8000) });
      out.push(row('Summary HTTP', String(sr.status), sr.ok));
      if (sr.ok) {
        const s = await sr.json() as Record<string, unknown>;
        const topKeys = Object.keys(s).join(', ');
        out.push(row('Summary keys', topKeys));
        const plays = (s.plays as unknown[]) ?? [];
        const scoringPlays = (s.scoringPlays as unknown[]) ?? [];
        out.push(row('plays count', String(plays.length), plays.length > 0));
        out.push(row('scoringPlays count', String(scoringPlays.length), scoringPlays.length > 0));
        // Show all unique play types
        const typeSet = new Set<string>();
        for (const p of plays) {
          const pt = ((p as Record<string, unknown>).type as Record<string, unknown>)?.text;
          if (pt) typeSet.add(String(pt));
        }
        out.push(row('Play types', Array.from(typeSet).join(' | ') || '(none)', typeSet.size > 0));
        // Show first 10 plays with type+minute+team+player
        const playLines = plays.slice(0, 20).map(p => {
          const pp = p as Record<string, unknown>;
          const type = ((pp.type as Record<string, unknown>)?.text as string) ?? '?';
          const clock = ((pp.clock as Record<string, unknown>)?.displayValue as string) ?? '';
          const team = ((pp.team as Record<string, unknown>)?.displayName as string) ?? '';
          const parts = pp.participants as Array<Record<string, unknown>> | undefined;
          const player = (parts?.[0]?.athlete as Record<string, unknown>)?.displayName as string ?? '';
          return `${clock} ${type} | ${team} | ${player}`;
        });
        out.push(row('First 20 plays', playLines.join('\n') || '(empty)'));
        // Cards count
        const yellows = plays.filter(p => String(((p as Record<string,unknown>).type as Record<string,unknown>)?.text ?? '').toLowerCase().includes('yellow'));
        const reds = plays.filter(p => String(((p as Record<string,unknown>).type as Record<string,unknown>)?.text ?? '').toLowerCase().includes('red'));
        out.push(row('Yellow card plays', String(yellows.length), yellows.length > 0));
        out.push(row('Red card plays', String(reds.length), reds.length >= 0));
      }
    } catch (e) { out.push(row('Summary error', String(e), false)); }
  } else {
    out.push(row('⚠️ Mexico match ID', 'not found in scoreboard'));
  }

  // 3. Fetch summary for Czechia vs South Korea
  out.push(row('', ''));
  out.push(row('Step', `3 — ESPN summary for Czechia vs South Korea (id=${czechia_id || '?'})`));
  if (czechia_id) {
    try {
      const sr = await fetch(`https://site.api.espn.com/apis/site/v2/sports/soccer/fifa.world/summary?event=${czechia_id}`, { signal: AbortSignal.timeout(8000) });
      out.push(row('Summary HTTP', String(sr.status), sr.ok));
      if (sr.ok) {
        const s = await sr.json() as Record<string, unknown>;
        const plays = (s.plays as unknown[]) ?? [];
        const typeSet = new Set<string>();
        for (const p of plays) {
          const pt = ((p as Record<string, unknown>).type as Record<string, unknown>)?.text;
          if (pt) typeSet.add(String(pt));
        }
        out.push(row('plays count', String(plays.length), plays.length > 0));
        out.push(row('Play types', Array.from(typeSet).join(' | ') || '(none)', typeSet.size > 0));
        const yellows = plays.filter(p => String(((p as Record<string,unknown>).type as Record<string,unknown>)?.text ?? '').toLowerCase().includes('yellow'));
        out.push(row('Yellow card plays', String(yellows.length), yellows.length > 0));
      }
    } catch (e) { out.push(row('Summary error', String(e), false)); }
  } else {
    out.push(row('⚠️ Czechia match ID', 'not found in scoreboard'));
  }

  // 4. Test /api/world-cup/match-events for Mexico vs South Africa
  out.push(row('', ''));
  out.push(row('Step', '4 — Our own match-events API for Mexico vs SA'));
  try {
    const r = await fetch('/api/world-cup/match-events?home=Mexico&away=South+Africa&date=20260611&matchId=wc-2026-1', { signal: AbortSignal.timeout(10000) });
    out.push(row('match-events HTTP', String(r.status), r.ok));
    if (r.ok) {
      const d = await r.json() as Record<string, unknown>;
      const events = (d.events as unknown[]) ?? [];
      const source = String(d.source ?? '');
      out.push(row('source', source));
      out.push(row('events count', String(events.length), events.length > 0));
      const types = events.map(e => String((e as Record<string,unknown>).type ?? '')).join(', ');
      out.push(row('event types', types || '(none)'));
    }
  } catch (e) { out.push(row('match-events error', String(e), false)); }

  return out;
}

export default function ClientDebugPage() {
  const [lines, setLines] = useState<Line[]>([]);
  const [done, setDone] = useState(false);

  useEffect(() => {
    runDebug().then(l => { setLines(l); setDone(true); });
  }, []);

  return (
    <div style={{ fontFamily: 'monospace', padding: '16px', background: '#0a0a0a', color: '#eee', minHeight: '100vh', fontSize: '12px' }}>
      <h1 style={{ fontSize: '16px', color: '#FFD700', marginBottom: '4px' }}>🔍 ESPN Deep Debug — WC 2026</h1>
      <p style={{ color: '#666', marginBottom: '12px' }}>Date: {new Date().toISOString()}</p>

      {!done && <div style={{ color: '#4AF' }}>⏳ Running...</div>}

      <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
        {lines.map((l, i) => {
          if (l.label === '') return <div key={i} style={{ height: '6px' }} />;
          if (l.label === 'Step') return (
            <div key={i} style={{ color: '#FFD700', fontWeight: 'bold', marginTop: '4px' }}>{l.value}</div>
          );
          if (l.label === 'First 20 plays') return (
            <div key={i} style={{ background: '#111', border: '1px solid #333', borderRadius: '4px', padding: '6px', marginTop: '2px' }}>
              <div style={{ color: '#888', marginBottom: '2px' }}>Plays:</div>
              {l.value.split('\n').map((line, j) => (
                <div key={j} style={{ color: line.toLowerCase().includes('yellow') ? '#FF0' : line.toLowerCase().includes('red') ? '#F55' : line.toLowerCase().includes('goal') ? '#4F4' : '#CCC' }}>
                  {line}
                </div>
              ))}
            </div>
          );
          const color = l.ok === true ? '#4F4' : l.ok === false ? '#F55' : '#AAA';
          return (
            <div key={i} style={{ display: 'flex', gap: '8px' }}>
              <span style={{ color: '#666', minWidth: '140px', flexShrink: 0 }}>{l.label}:</span>
              <span style={{ color, wordBreak: 'break-all' }}>{l.value}</span>
            </div>
          );
        })}
      </div>

      {done && (
        <button
          onClick={() => { setLines([]); setDone(false); runDebug().then(l => { setLines(l); setDone(true); }); }}
          style={{ marginTop: '16px', padding: '8px 16px', background: '#222', color: '#FFD700', border: '1px solid #444', borderRadius: '6px', cursor: 'pointer' }}
        >
          🔄 Run Again
        </button>
      )}
    </div>
  );
}
