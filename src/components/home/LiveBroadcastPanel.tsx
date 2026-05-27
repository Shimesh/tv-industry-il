'use client';

import type { BroadcastChannelState } from '@/lib/broadcasts';
import { getChannelDisplayName } from '@/lib/channelLabels';

interface Props {
  channels: BroadcastChannelState[];
}

const CHANNEL_COLORS: Record<string, string> = {
  kan11:    '#1e6fd9',
  keshet12: '#f5c518',
  reshet13: '#0ea5a4',
  now14:    '#ef3b2c',
  i24:      '#0bc1d4',
  knesset:  '#8b5a2b',
  kan33:    '#a855f7',
  sport55:  '#22c55e',
  sport56:  '#22c55e',
  gold:     '#f59e0b',
  live:     '#ff2d2d',
};

function progress(startAt: string, endAt: string): number {
  try {
    const now = Date.now();
    const s = new Date(startAt).getTime();
    const e = new Date(endAt).getTime();
    if (e <= s) return 0;
    return Math.min(100, Math.max(0, ((now - s) / (e - s)) * 100));
  } catch { return 0; }
}

function timeLeft(endAt: string): string {
  try {
    const ms = new Date(endAt).getTime() - Date.now();
    if (ms <= 0) return 'מסתיים';
    const m = Math.floor(ms / 60000);
    if (m < 60) return `${m} דקות`;
    return `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')} שעות`;
  } catch { return ''; }
}

export default function LiveBroadcastPanel({ channels }: Props) {
  const live = channels
    .filter((c) => c.now?.current)
    .slice(0, 5);

  const liveCount = channels.filter((c) => c.now?.current).length;

  return (
    <div className="relative select-none w-full max-w-[480px] mx-auto lg:mx-0">
      {/* Ambient glow */}
      <div
        className="absolute pointer-events-none"
        style={{
          inset: '-40px',
          background: 'radial-gradient(ellipse 80% 60% at 50% 50%, rgba(157,78,221,0.28) 0%, transparent 70%)',
          filter: 'blur(30px)',
        }}
      />

      {/* Main panel */}
      <div
        className="relative rounded-2xl overflow-hidden"
        style={{
          border: '1px solid rgba(157,78,221,0.30)',
          boxShadow: '0 0 0 1px rgba(0,240,255,0.07), 0 32px 80px rgba(0,0,0,0.60)',
          background: 'rgba(10,10,30,0.90)',
          backdropFilter: 'blur(20px)',
        }}
      >
        {/* Panel header */}
        <div
          className="flex items-center justify-between px-4 py-3"
          style={{ borderBottom: '1px solid rgba(255,255,255,0.07)' }}
        >
          <div className="flex items-center gap-2">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500" />
            </span>
            <span className="text-xs font-black tracking-widest uppercase" style={{ color: '#fff' }}>
              עכשיו בשידור חי
            </span>
          </div>
          <span
            className="text-xs font-bold rounded-full px-2.5 py-0.5"
            style={{
              background: 'rgba(0,240,255,0.12)',
              border: '1px solid rgba(0,240,255,0.25)',
              color: '#00f0ff',
            }}
          >
            {liveCount} ערוצים
          </span>
        </div>

        {/* Channel rows */}
        <div className="p-3 space-y-2">
          {live.length > 0 ? (
            live.map((ch) => {
              const color = CHANNEL_COLORS[ch.channelId] ?? '#a0aec0';
              const prog = ch.now.current!;
              const pct  = progress(prog.startAt, prog.endAt);
              const left = timeLeft(prog.endAt);

              return (
                <div
                  key={ch.channelId}
                  className="rounded-xl p-3 transition-all duration-200 hover:scale-[1.01]"
                  style={{
                    background: 'rgba(255,255,255,0.04)',
                    border: `1px solid ${color}28`,
                  }}
                >
                  <div className="flex items-start justify-between gap-2 mb-2">
                    {/* Channel badge */}
                    <span
                      className="shrink-0 rounded-lg px-2 py-0.5 text-[10px] font-black"
                      style={{
                        background: `${color}22`,
                        border: `1px solid ${color}55`,
                        color,
                      }}
                    >
                      {getChannelDisplayName(ch.channelId)}
                    </span>
                    {left && (
                      <span className="text-[10px] shrink-0" style={{ color: '#a0aec0' }}>
                        {left}
                      </span>
                    )}
                  </div>

                  {/* Show title */}
                  <p
                    className="text-sm font-bold leading-snug line-clamp-1 mb-2"
                    style={{ color: '#fff' }}
                  >
                    {prog.title}
                  </p>

                  {/* Progress bar */}
                  <div className="h-1 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.08)' }}>
                    <div
                      className="h-full rounded-full"
                      style={{
                        width: `${pct}%`,
                        background: `linear-gradient(90deg, ${color}99, ${color})`,
                        boxShadow: `0 0 8px ${color}66`,
                        transition: 'width 1s ease',
                      }}
                    />
                  </div>
                </div>
              );
            })
          ) : (
            // Skeleton / loading state
            Array.from({ length: 4 }).map((_, i) => (
              <div
                key={i}
                className="rounded-xl p-3 skeleton-shimmer"
                style={{ height: '72px', border: '1px solid rgba(255,255,255,0.05)' }}
              />
            ))
          )}
        </div>

        {/* Footer */}
        <div
          className="flex items-center justify-between px-4 py-2.5"
          style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}
        >
          <span className="text-[11px]" style={{ color: '#a0aec0' }}>מתעדכן כל 2 דקות</span>
          <a
            href="/schedule"
            className="text-[11px] font-bold transition-opacity hover:opacity-100 opacity-70"
            style={{ color: '#00f0ff' }}
          >
            לוח שידורים מלא ←
          </a>
        </div>
      </div>

      {/* Floating badge */}
      <div
        className="absolute -bottom-5 -right-4 flex items-center gap-2 rounded-2xl px-4 py-2.5"
        style={{
          background: 'rgba(10,10,25,0.95)',
          border: '1px solid rgba(0,240,255,0.22)',
          boxShadow: '0 8px 32px rgba(0,0,0,0.50)',
          backdropFilter: 'blur(16px)',
        }}
      >
        <div
          className="w-8 h-8 rounded-full flex items-center justify-center text-sm"
          style={{
            background: 'linear-gradient(135deg, #9d4edd, #00f0ff)',
            boxShadow: '0 0 16px rgba(157,78,221,0.40)',
          }}
        >
          📺
        </div>
        <div>
          <div className="text-[10px] font-bold" style={{ color: '#00f0ff' }}>תעשיית הטלוויזיה</div>
          <div className="text-white font-black text-sm leading-none">הכל, במקום אחד</div>
        </div>
      </div>
    </div>
  );
}
