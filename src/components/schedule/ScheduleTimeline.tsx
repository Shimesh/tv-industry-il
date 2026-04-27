'use client';

import { useEffect, useRef, useState } from 'react';
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
  const [modalOpen, setModalOpen] = useState(false);

  const now = new Date();
  const timeStr = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;

  const isPast = (time: string) => time < timeStr;
  const isCurrent = (item: ScheduleItem) => item === currentProgram;

  const currentIndex = schedule.findIndex(isCurrent);
  const contextItems = [
    currentIndex > 0 ? schedule[currentIndex - 1] : null,
    currentIndex >= 0 ? schedule[currentIndex] : null,
    currentIndex < schedule.length - 1 ? schedule[currentIndex + 1] : null,
  ].filter(Boolean) as ScheduleItem[];

  useEffect(() => {
    setTimeout(() => {
      currentRef.current?.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
    }, 300);
  }, [channel.id]);

  useEffect(() => {
    if (!modalOpen) return;
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setModalOpen(false);
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [modalOpen]);

  return (
    <div className="w-full">
      <div className="flex items-center justify-between mb-3 px-1">
        <h3 className="text-sm font-bold text-white/80 flex items-center gap-2">
          <span style={{ color: channel.color }}>●</span>
          לוח שידורים - {channel.name}
        </h3>
        <span className="text-[10px] text-white/30">
          {now.toLocaleDateString('he-IL', { weekday: 'long', day: 'numeric', month: 'long' })}
        </span>
      </div>

      <div className="flex gap-2 overflow-x-auto pb-3 hide-scrollbar snap-x snap-mandatory">
        {schedule.map((item, index) => {
          const current = isCurrent(item);
          const past = isPast(item.time) && !current;

          return (
            <div
              key={index}
              ref={current ? currentRef : undefined}
              onClick={() => onProgramClick?.(item)}
              className={`shrink-0 snap-start rounded-lg p-3 transition-all duration-200 cursor-pointer group ${
                current ? 'ring-1 min-w-[200px]' : past ? 'min-w-[160px] opacity-40 hover:opacity-60' : 'min-w-[160px] hover:bg-white/[0.06]'
              }`}
              style={{
                backgroundColor: current ? `${channel.color}15` : 'rgba(255,255,255,0.03)',
                border: current ? `1px solid ${channel.color}40` : '1px solid rgba(255,255,255,0.06)',
                ...(current ? { boxShadow: `0 0 20px ${channel.color}15` } : {}),
              }}
            >
              <div className="flex items-center gap-2 mb-1.5">
                <span className={`font-mono font-bold text-xs ${current ? 'text-white' : 'text-white/50'}`}>{item.time}</span>
                {item.isLive && (
                  <span className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-red-500/20 text-red-400 text-[9px] font-bold">
                    <span className="w-1 h-1 rounded-full bg-red-400 animate-pulse" />
                    LIVE
                  </span>
                )}
                {current && (
                  <span className="px-1.5 py-0.5 rounded text-[9px] font-bold" style={{ backgroundColor: `${channel.color}30`, color: channel.color }}>
                    עכשיו
                  </span>
                )}
              </div>
              <h4 className={`text-sm font-bold mb-0.5 truncate ${current ? 'text-white' : 'text-white/70'}`}>{item.title}</h4>
              {item.description && <p className="text-[11px] text-white/30 truncate">{item.description}</p>}
              <div className="flex items-center gap-2 mt-1.5">
                <span className="text-[10px] text-white/20">{item.duration}</span>
                {item.genre && (
                  <span className="text-[9px] px-1.5 py-0.5 rounded" style={{ backgroundColor: `${channel.color}15`, color: `${channel.color}80` }}>
                    {item.genre}
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <div className="mt-4 rounded-xl overflow-hidden border border-white/[0.06]" style={{ backgroundColor: 'rgba(255,255,255,0.02)' }}>
        {contextItems.map((item, index) => {
          const current = isCurrent(item);
          const past = isPast(item.time) && !current;

          return (
            <div
              key={index}
              onClick={() => onProgramClick?.(item)}
              className={`flex items-center gap-3 px-4 py-3 cursor-pointer transition-colors hover:bg-gray-800 ${past ? 'opacity-40' : ''} ${index < contextItems.length - 1 ? 'border-b border-white/[0.05]' : ''}`}
              style={current ? { backgroundColor: 'rgba(59,130,246,0.08)', borderRight: '3px solid #3b82f6' } : {}}
            >
              <span className={`font-mono text-xs shrink-0 w-10 ${current ? 'text-white font-bold' : 'text-white/40'}`}>{item.time}</span>
              {current && <span className="w-1.5 h-1.5 rounded-full shrink-0 animate-pulse bg-blue-400" />}
              <span className={`text-sm flex-1 truncate ${current ? 'text-white font-bold' : 'text-white/60'}`}>{item.title}</span>
              <div className="flex items-center gap-2 shrink-0">
                {current && <span className="text-[9px] font-bold text-blue-400 bg-blue-400/10 px-1.5 py-0.5 rounded">עכשיו</span>}
                {!current && index === 0 && <span className="text-[9px] text-white/20 hidden sm:inline">קודם</span>}
                {!current && index === contextItems.length - 1 && <span className="text-[9px] text-white/20 hidden sm:inline">הבא</span>}
                {item.isLive && <span className="text-[9px] font-bold text-red-400 bg-red-400/10 px-1.5 py-0.5 rounded">LIVE</span>}
                {item.genre && <span className="text-[9px] text-white/25 hidden sm:inline">{item.genre}</span>}
                <span className="text-[10px] text-white/20">{item.duration}</span>
              </div>
            </div>
          );
        })}
      </div>

      <div className="mt-3 flex justify-center">
        <button onClick={() => setModalOpen(true)} className="text-xs text-white/40 hover:text-white/70 border border-white/[0.08] hover:border-white/20 px-4 py-1.5 rounded-lg transition-colors">
          לוח שידורים מלא ↓
        </button>
      </div>

      {modalOpen && (
        <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center" onClick={() => setModalOpen(false)}>
          <div className="w-full max-w-2xl mx-4 bg-gray-900 border border-gray-800 rounded-xl shadow-2xl p-5" onClick={(event) => event.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-bold text-white/80 flex items-center gap-2">
                <span style={{ color: channel.color }}>●</span>
                לוח שידורים מלא — {channel.name}
              </h3>
              <button onClick={() => setModalOpen(false)} className="text-white/30 hover:text-white/70 transition-colors text-lg leading-none">
                ✕
              </button>
            </div>

            <div className="max-h-[60vh] overflow-y-auto divide-y divide-gray-800">
              {schedule.map((item, index) => {
                const current = isCurrent(item);
                const past = isPast(item.time) && !current;

                return (
                  <div
                    key={index}
                    className={`flex items-center gap-3 px-3 py-2.5 transition-colors hover:bg-gray-800 ${past ? 'opacity-35' : ''}`}
                    style={current ? { backgroundColor: 'rgba(59,130,246,0.1)', borderRight: '3px solid #3b82f6' } : {}}
                  >
                    <span className={`font-mono text-xs shrink-0 w-10 ${current ? 'text-white font-bold' : 'text-white/40'}`}>{item.time}</span>
                    {current && <span className="w-1.5 h-1.5 rounded-full shrink-0 animate-pulse bg-blue-400" />}
                    <span className={`text-sm flex-1 truncate ${current ? 'text-white font-bold' : 'text-white/60'}`}>{item.title}</span>
                    <div className="flex items-center gap-2 shrink-0">
                      {current && <span className="text-[9px] font-bold text-blue-400 bg-blue-400/10 px-1.5 py-0.5 rounded">עכשיו</span>}
                      {item.isLive && <span className="text-[9px] font-bold text-red-400 bg-red-400/10 px-1.5 py-0.5 rounded">LIVE</span>}
                      {item.genre && <span className="text-[9px] text-white/25 hidden sm:inline">{item.genre}</span>}
                      <span className="text-[10px] text-white/20">{item.duration}</span>
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
