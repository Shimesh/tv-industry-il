'use client';

import { useEffect, useRef } from 'react';
import type { Channel, ScheduleItem } from '@/data/channels';
import { generateSchedule, getCurrentProgram } from '@/data/channels';

interface ScheduleTimelineProps {
  channel: Channel;
  onProgramClick?: (item: ScheduleItem) => void;
}

export function ScheduleTimeline({ channel, onProgramClick }: ScheduleTimelineProps) {
  const schedule = generateSchedule(channel.id);
  const currentProgram = getCurrentProgram(schedule);
  const currentRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  const now = new Date();
  const timeStr = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;

  const isPast = (time: string) => time < timeStr;
  const isCurrent = (item: ScheduleItem) => item === currentProgram;

  useEffect(() => {
    setTimeout(() => {
      currentRef.current?.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
    }, 300);
  }, [channel.id]);

  return (
    <div className="w-full">
      {/* Header */}
      <div className="flex items-center justify-between mb-3 px-1">
        <h3 className="text-sm font-bold text-white/80 flex items-center gap-2">
          <span style={{ color: channel.color }}>●</span>
          לוח שידורים - {channel.name}
        </h3>
        <span className="text-[10px] text-white/30">
          {now.toLocaleDateString('he-IL', { weekday: 'long', day: 'numeric', month: 'long' })}
        </span>
      </div>

      {/* Horizontal timeline */}
      <div
        ref={scrollContainerRef}
        className="flex gap-2 overflow-x-auto pb-3 hide-scrollbar snap-x snap-mandatory"
      >
        {schedule.map((item, i) => {
          const current = isCurrent(item);
          const past = isPast(item.time) && !current;

          return (
            <div
              key={i}
              ref={current ? currentRef : undefined}
              onClick={() => onProgramClick?.(item)}
              className={`shrink-0 snap-start rounded-lg p-3 transition-all duration-200 cursor-pointer group ${
                current
                  ? 'ring-1 min-w-[200px]'
                  : past
                    ? 'min-w-[160px] opacity-40 hover:opacity-60'
                    : 'min-w-[160px] hover:bg-white/[0.06]'
              }`}
              style={{
                backgroundColor: current ? `${channel.color}15` : 'rgba(255,255,255,0.03)',
                border: current ? `1px solid ${channel.color}40` : '1px solid rgba(255,255,255,0.06)',
                ...(current ? { boxShadow: `0 0 20px ${channel.color}15` } : {}),
              }}
            >
              {/* Time */}
              <div className="flex items-center gap-2 mb-1.5">
                <span className={`font-mono font-bold text-xs ${current ? 'text-white' : 'text-white/50'}`}>
                  {item.time}
                </span>
                {item.isLive && (
                  <span className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-red-500/20 text-red-400 text-[9px] font-bold">
                    <span className="w-1 h-1 rounded-full bg-red-400 animate-pulse" />
                    LIVE
                  </span>
                )}
                {current && (
                  <span
                    className="px-1.5 py-0.5 rounded text-[9px] font-bold"
                    style={{ backgroundColor: `${channel.color}30`, color: channel.color }}
                  >
                    עכשיו
                  </span>
                )}
              </div>

              {/* Title */}
              <h4 className={`text-sm font-bold mb-0.5 truncate ${current ? 'text-white' : 'text-white/70'}`}>
                {item.title}
              </h4>

              {/* Description */}
              {item.description && (
                <p className="text-[11px] text-white/30 truncate">{item.description}</p>
              )}

              {/* Meta */}
              <div className="flex items-center gap-2 mt-1.5">
                <span className="text-[10px] text-white/20">{item.duration}</span>
                {item.genre && (
                  <span
                    className="text-[9px] px-1.5 py-0.5 rounded"
                    style={{ backgroundColor: `${channel.color}15`, color: `${channel.color}80` }}
                  >
                    {item.genre}
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Full schedule list (vertical, below timeline) */}
      <div className="mt-4 rounded-lg overflow-hidden border border-white/[0.06]" style={{ backgroundColor: 'rgba(255,255,255,0.02)' }}>
        <div className="max-h-[350px] overflow-y-auto custom-scrollbar">
          {schedule.map((item, i) => {
            const current = isCurrent(item);
            const past = isPast(item.time) && !current;

            return (
              <div
                key={i}
                ref={current ? currentRef : undefined}
                className={`flex items-center gap-3 px-3 py-2.5 border-b border-white/[0.04] transition-all ${
                  past ? 'opacity-35' : ''
                } ${current ? '' : 'hover:bg-white/[0.03]'}`}
                style={current ? {
                  backgroundColor: `${channel.color}10`,
                  borderRight: `3px solid ${channel.color}`,
                } : {}}
              >
                {/* Time */}
                <span className={`font-mono text-xs shrink-0 w-10 ${current ? 'text-white font-bold' : 'text-white/40'}`}>
                  {item.time}
                </span>

                {/* Current indicator */}
                {current && (
                  <span className="w-1.5 h-1.5 rounded-full shrink-0 animate-pulse" style={{ backgroundColor: channel.color }} />
                )}

                {/* Title */}
                <span className={`text-sm flex-1 truncate ${current ? 'text-white font-bold' : 'text-white/60'}`}>
                  {item.title}
                </span>

                {/* Badges */}
                <div className="flex items-center gap-1.5 shrink-0">
                  {item.isLive && (
                    <span className="text-[9px] font-bold text-red-400 bg-red-400/10 px-1.5 py-0.5 rounded">LIVE</span>
                  )}
                  {item.genre && (
                    <span className="text-[9px] text-white/25 hidden sm:inline">{item.genre}</span>
                  )}
                  <span className="text-[10px] text-white/20">{item.duration}</span>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
