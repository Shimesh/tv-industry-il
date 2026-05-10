'use client';

import { useEffect, useMemo, useState } from 'react';
import type { Channel } from '@/data/channels';
import type { BroadcastProgram } from '@/lib/broadcasts';
import { formatBroadcastDuration, formatBroadcastTime } from '@/lib/broadcasts';

interface ScheduleTimelineProps {
  channel: Channel;
  programs: BroadcastProgram[];
  loading?: boolean;
  onProgramClick?: (item: BroadcastProgram) => void;
}

function isCurrentProgram(item: BroadcastProgram, now: Date): boolean {
  const startAt = Date.parse(item.startAt);
  const endAt = Date.parse(item.endAt);
  if (!Number.isFinite(startAt) || !Number.isFinite(endAt)) return false;
  const current = now.getTime();
  return startAt <= current && current < endAt;
}

function isPastProgram(item: BroadcastProgram, now: Date): boolean {
  const endAt = Date.parse(item.endAt);
  return Number.isFinite(endAt) && endAt < now.getTime();
}

export function ScheduleTimeline({ channel, programs, loading = false, onProgramClick }: ScheduleTimelineProps) {
  const [modalOpen, setModalOpen] = useState(false);
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 30_000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!modalOpen) return;
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setModalOpen(false);
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [modalOpen]);

  const sortedPrograms = useMemo(
    () => [...programs].sort((a, b) => Date.parse(a.startAt) - Date.parse(b.startAt)),
    [programs],
  );

  const currentIndex = sortedPrograms.findIndex((item) => isCurrentProgram(item, now));
  const contextItems = [
    currentIndex > 0 ? sortedPrograms[currentIndex - 1] : null,
    currentIndex >= 0 ? sortedPrograms[currentIndex] : null,
    currentIndex >= 0 && currentIndex < sortedPrograms.length - 1 ? sortedPrograms[currentIndex + 1] : null,
  ].filter(Boolean) as BroadcastProgram[];

  const visibleContext = contextItems.length > 0 ? contextItems : sortedPrograms.slice(0, 3);

  return (
    <div className="w-full">
      <div className="mb-3 flex items-center justify-between px-1">
        <h3 className="flex items-center gap-2 text-sm font-bold text-[var(--theme-text)]">
          <span style={{ color: channel.color }}>●</span>
          לוח שידורים - {channel.name}
        </h3>
        <span className="text-[10px] text-[var(--theme-text-secondary)]">
          {now.toLocaleDateString('he-IL', { weekday: 'long', day: 'numeric', month: 'long' })}
        </span>
      </div>

      {loading && sortedPrograms.length === 0 ? (
        <div className="rounded-xl border p-5 text-center text-sm text-[var(--theme-text-secondary)]" style={{ background: 'var(--theme-bg-card)', borderColor: 'var(--theme-border)' }}>
          טוען את לוח השידורים מ־IsraMedia...
        </div>
      ) : sortedPrograms.length === 0 ? (
        <div className="rounded-xl border p-5 text-center text-sm text-[var(--theme-text-secondary)]" style={{ background: 'var(--theme-bg-card)', borderColor: 'var(--theme-border)' }}>
          לא נמצא לוח שידורים עדכני לערוץ הזה כרגע.
        </div>
      ) : (
        <>
          <div className="hide-scrollbar flex snap-x snap-mandatory gap-2 overflow-x-auto pb-3">
            {sortedPrograms.map((item) => {
              const current = isCurrentProgram(item, now);
              const past = isPastProgram(item, now) && !current;

              return (
                <button
                  key={item.id}
                  onClick={() => onProgramClick?.(item)}
                  className={`group shrink-0 snap-start rounded-lg p-3 text-right transition-all duration-200 ${
                    current ? 'min-w-[210px] ring-1' : past ? 'min-w-[170px] opacity-50 hover:opacity-70' : 'min-w-[170px] hover:bg-[var(--theme-accent-glow)]'
                  }`}
                  style={{
                    backgroundColor: current ? `${channel.color}15` : 'var(--theme-bg-card)',
                    border: current ? `1px solid ${channel.color}40` : '1px solid var(--theme-border)',
                    ...(current ? { boxShadow: `0 0 20px ${channel.color}15` } : {}),
                  }}
                >
                  <div className="mb-1.5 flex items-center gap-2">
                    <span className={`font-mono text-xs font-bold ${current ? 'text-[var(--theme-text)]' : 'text-[var(--theme-text-secondary)]'}`}>{formatBroadcastTime(item.startAt)}</span>
                    {current && (
                      <span className="rounded px-1.5 py-0.5 text-[9px] font-bold" style={{ backgroundColor: `${channel.color}30`, color: channel.color }}>
                        עכשיו
                      </span>
                    )}
                    {item.isLive && (
                      <span className="flex items-center gap-1 rounded bg-red-500/20 px-1.5 py-0.5 text-[9px] font-bold text-red-400">
                        <span className="h-1 w-1 animate-pulse rounded-full bg-red-400" />
                        LIVE
                      </span>
                    )}
                  </div>
                  <h4 className="mb-0.5 truncate text-sm font-bold text-[var(--theme-text)]">{item.title}</h4>
                  {item.description && <p className="truncate text-[11px] text-[var(--theme-text-secondary)]">{item.description}</p>}
                  <div className="mt-1.5 flex items-center gap-2">
                    <span className="text-[10px] text-[var(--theme-text-secondary)] opacity-70">{formatBroadcastDuration(item.startAt, item.endAt)}</span>
                    {item.genre && (
                      <span className="rounded px-1.5 py-0.5 text-[9px]" style={{ backgroundColor: `${channel.color}15`, color: `${channel.color}80` }}>
                        {item.genre}
                      </span>
                    )}
                  </div>
                </button>
              );
            })}
          </div>

          <div className="mt-4 overflow-hidden rounded-xl border" style={{ background: 'var(--theme-bg-card)', borderColor: 'var(--theme-border)' }}>
            {visibleContext.map((item, index) => {
              const current = isCurrentProgram(item, now);
              const past = isPastProgram(item, now) && !current;

              return (
                <button
                  key={item.id}
                  onClick={() => onProgramClick?.(item)}
                  className={`flex w-full cursor-pointer items-center gap-3 px-4 py-3 text-right transition-colors hover:bg-[var(--theme-accent-glow)] ${past ? 'opacity-50' : ''} ${index < visibleContext.length - 1 ? 'border-b border-[var(--theme-border)]' : ''}`}
                  style={current ? { backgroundColor: 'var(--theme-accent-glow)', borderRight: '3px solid var(--theme-accent)' } : {}}
                >
                  <span className={`w-10 shrink-0 font-mono text-xs ${current ? 'font-bold text-[var(--theme-text)]' : 'text-[var(--theme-text-secondary)]'}`}>{formatBroadcastTime(item.startAt)}</span>
                  {current && <span className="h-1.5 w-1.5 shrink-0 animate-pulse rounded-full bg-[var(--theme-accent)]" />}
                  <span className={`flex-1 truncate text-sm ${current ? 'font-bold text-[var(--theme-text)]' : 'text-[var(--theme-text-secondary)]'}`}>{item.title}</span>
                  <div className="flex shrink-0 items-center gap-2">
                    {current && <span className="rounded bg-blue-400/10 px-1.5 py-0.5 text-[9px] font-bold text-blue-400">עכשיו</span>}
                    {!current && index === 0 && <span className="hidden text-[9px] text-[var(--theme-text-secondary)] opacity-70 sm:inline">קודם</span>}
                    {!current && index === visibleContext.length - 1 && <span className="hidden text-[9px] text-[var(--theme-text-secondary)] opacity-70 sm:inline">הבא</span>}
                    {item.isLive && <span className="rounded bg-red-400/10 px-1.5 py-0.5 text-[9px] font-bold text-red-400">LIVE</span>}
                    <span className="text-[10px] text-[var(--theme-text-secondary)] opacity-70">{formatBroadcastDuration(item.startAt, item.endAt)}</span>
                  </div>
                </button>
              );
            })}
          </div>

          <div className="mt-3 flex justify-center">
            <button onClick={() => setModalOpen(true)} className="rounded-lg border px-4 py-1.5 text-xs text-[var(--theme-text-secondary)] transition-colors hover:border-[var(--theme-accent)] hover:text-[var(--theme-text)]" style={{ borderColor: 'var(--theme-border)' }}>
              לוח שידורים מלא ↓
            </button>
          </div>
        </>
      )}

      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70" onClick={() => setModalOpen(false)}>
          <div className="mx-4 w-full max-w-2xl rounded-xl border p-5 shadow-2xl" style={{ background: 'var(--theme-bg-card)', borderColor: 'var(--theme-border)' }} onClick={(event) => event.stopPropagation()}>
            <div className="mb-4 flex items-center justify-between">
              <h3 className="flex items-center gap-2 text-sm font-bold text-[var(--theme-text)]">
                <span style={{ color: channel.color }}>●</span>
                לוח שידורים מלא - {channel.name}
              </h3>
              <button onClick={() => setModalOpen(false)} className="text-lg leading-none text-[var(--theme-text-secondary)] transition-colors hover:text-[var(--theme-text)]">
                ×
              </button>
            </div>

            <div className="max-h-[60vh] divide-y overflow-y-auto" style={{ borderColor: 'var(--theme-border)' }}>
              {sortedPrograms.map((item) => {
                const current = isCurrentProgram(item, now);
                const past = isPastProgram(item, now) && !current;

                return (
                  <div
                    key={item.id}
                    className={`flex items-center gap-3 px-3 py-2.5 transition-colors hover:bg-[var(--theme-accent-glow)] ${past ? 'opacity-50' : ''}`}
                    style={current ? { backgroundColor: 'var(--theme-accent-glow)', borderRight: '3px solid var(--theme-accent)' } : {}}
                  >
                    <span className={`w-10 shrink-0 font-mono text-xs ${current ? 'font-bold text-[var(--theme-text)]' : 'text-[var(--theme-text-secondary)]'}`}>{formatBroadcastTime(item.startAt)}</span>
                    {current && <span className="h-1.5 w-1.5 shrink-0 animate-pulse rounded-full bg-[var(--theme-accent)]" />}
                    <span className={`flex-1 truncate text-sm ${current ? 'font-bold text-[var(--theme-text)]' : 'text-[var(--theme-text-secondary)]'}`}>{item.title}</span>
                    <div className="flex shrink-0 items-center gap-2">
                      {current && <span className="rounded bg-blue-400/10 px-1.5 py-0.5 text-[9px] font-bold text-blue-400">עכשיו</span>}
                      {item.isLive && <span className="rounded bg-red-400/10 px-1.5 py-0.5 text-[9px] font-bold text-red-400">LIVE</span>}
                      <span className="text-[10px] text-[var(--theme-text-secondary)] opacity-70">{formatBroadcastDuration(item.startAt, item.endAt)}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
