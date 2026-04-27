'use client';

import { useState, useEffect, useCallback } from 'react';
import { channels, generateSchedule, getCurrentProgram, getNextProgram } from '@/data/channels';
import { streamConfigs } from '@/data/streams';
import { VideoPlayer } from '@/components/schedule/VideoPlayer';
import { ChannelSidebar } from '@/components/schedule/ChannelSidebar';
import { ScheduleTimeline } from '@/components/schedule/ScheduleTimeline';

const STORAGE_KEY = 'tv-last-channel';

export default function SchedulePage() {
  const [selectedChannelId, setSelectedChannelId] = useState<string>('i24');
  const [currentTime, setCurrentTime] = useState<Date | null>(null);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved && channels.find((channel) => channel.id === saved)) {
      setSelectedChannelId(saved);
    }
    setCurrentTime(new Date());
    const interval = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(interval);
  }, []);

  const selectChannel = useCallback((id: string) => {
    setSelectedChannelId(id);
    localStorage.setItem(STORAGE_KEY, id);
  }, []);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) return;

      const currentIndex = channels.findIndex((channel) => channel.id === selectedChannelId);

      switch (event.key) {
        case 'ArrowUp':
        case 'ArrowRight': {
          event.preventDefault();
          const previousIndex = currentIndex > 0 ? currentIndex - 1 : channels.length - 1;
          selectChannel(channels[previousIndex].id);
          break;
        }
        case 'ArrowDown':
        case 'ArrowLeft': {
          event.preventDefault();
          const nextIndex = currentIndex < channels.length - 1 ? currentIndex + 1 : 0;
          selectChannel(channels[nextIndex].id);
          break;
        }
        case 's':
        case 'S':
          setSidebarCollapsed((prev) => !prev);
          break;
        default:
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedChannelId, selectChannel]);

  const channel = channels.find((candidate) => candidate.id === selectedChannelId) || channels[0];
  const stream = streamConfigs[selectedChannelId];
  const schedule = generateSchedule(selectedChannelId);
  const currentProgram = currentTime ? getCurrentProgram(schedule) : null;
  const nextProgram = currentTime ? getNextProgram(schedule) : null;

  const goToNextChannel = useCallback(() => {
    const index = channels.findIndex((candidate) => candidate.id === selectedChannelId);
    const nextIndex = index < channels.length - 1 ? index + 1 : 0;
    selectChannel(channels[nextIndex].id);
  }, [selectedChannelId, selectChannel]);

  const goToPrevChannel = useCallback(() => {
    const index = channels.findIndex((candidate) => candidate.id === selectedChannelId);
    const prevIndex = index > 0 ? index - 1 : channels.length - 1;
    selectChannel(channels[prevIndex].id);
  }, [selectedChannelId, selectChannel]);

  return (
    <div className="min-h-screen" style={{ backgroundColor: '#0a0a0f' }}>
      <div className="lg:hidden sticky z-30 border-b border-white/[0.06] py-2 px-2" style={{ backgroundColor: '#0d0d14', top: 'var(--app-header-offset)' }}>
        <ChannelSidebar selectedChannelId={selectedChannelId} onSelectChannel={selectChannel} isMobile />
      </div>

      <div className="flex" style={{ minHeight: 'calc(100dvh - var(--app-header-offset))' }}>
        <aside
          className={`hidden lg:block shrink-0 border-l border-white/[0.06] transition-all duration-300 overflow-hidden ${sidebarCollapsed ? 'w-0 p-0' : 'w-64 p-3'}`}
          style={{ backgroundColor: '#0d0d14' }}
        >
          {!sidebarCollapsed && (
            <>
              <div className="flex items-center justify-between mb-4 px-1">
                <h2 className="text-xs font-bold text-white/40 uppercase tracking-widest">ערוצים</h2>
                <button onClick={() => setSidebarCollapsed(true)} className="text-white/20 hover:text-white/50 transition-colors text-xs" title="הסתר סרגל (S)">
                  ✕
                </button>
              </div>
              <ChannelSidebar selectedChannelId={selectedChannelId} onSelectChannel={selectChannel} />
            </>
          )}
        </aside>

        {sidebarCollapsed && (
          <button
            onClick={() => setSidebarCollapsed(false)}
            className="hidden lg:flex fixed right-0 top-1/2 -translate-y-1/2 z-40 items-center justify-center w-6 h-16 bg-white/5 hover:bg-white/10 rounded-l-lg border-l border-white/10 transition-colors"
            title="הצג ערוצים (S)"
          >
            <span className="text-white/40 text-xs">◀</span>
          </button>
        )}

        <main className="flex-1 overflow-y-auto">
          <div className="max-w-5xl mx-auto px-3 sm:px-6 py-4 sm:py-6 space-y-5">
            <VideoPlayer channel={channel} stream={stream} onNext={goToNextChannel} onPrev={goToPrevChannel} currentProgram={currentProgram?.title} />

            <div className="flex flex-col sm:flex-row gap-3">
              {currentProgram && (
                <div className="flex-1 rounded-lg p-3 border transition-all" style={{ backgroundColor: `${channel.color}08`, borderColor: `${channel.color}20` }}>
                  <div className="flex items-center gap-2 mb-1.5">
                    <span className="w-2 h-2 rounded-full animate-pulse" style={{ backgroundColor: channel.color }} />
                    <span className="text-[10px] font-bold text-white/40 uppercase tracking-wider">עכשיו משדרים</span>
                  </div>
                  <h3 className="text-base font-black text-white mb-0.5">{currentProgram.title}</h3>
                  {currentProgram.description && <p className="text-xs text-white/40">{currentProgram.description}</p>}
                  <div className="flex items-center gap-2 mt-2">
                    <span className="text-[10px] text-white/30 font-mono">{currentProgram.time}</span>
                    <span className="text-[10px] text-white/20">•</span>
                    <span className="text-[10px] text-white/30">{currentProgram.duration}</span>
                    {currentProgram.genre && (
                      <>
                        <span className="text-[10px] text-white/20">•</span>
                        <span className="text-[9px] px-1.5 py-0.5 rounded" style={{ backgroundColor: `${channel.color}20`, color: channel.color }}>
                          {currentProgram.genre}
                        </span>
                      </>
                    )}
                  </div>
                </div>
              )}

              {nextProgram && (
                <div className="sm:w-64 rounded-lg p-3 border border-white/[0.06]" style={{ backgroundColor: 'rgba(255,255,255,0.02)' }}>
                  <div className="flex items-center gap-2 mb-1.5">
                    <span className="text-[10px] font-bold text-white/25 uppercase tracking-wider">הבא בתור</span>
                  </div>
                  <h4 className="text-sm font-bold text-white/70">{nextProgram.title}</h4>
                  <div className="flex items-center gap-2 mt-1">
                    <span className="text-[10px] text-white/25 font-mono">{nextProgram.time}</span>
                    <span className="text-[10px] text-white/15">•</span>
                    <span className="text-[10px] text-white/25">{nextProgram.duration}</span>
                  </div>
                </div>
              )}
            </div>

            {stream && (
              <div className="flex items-center justify-between px-3 py-2 rounded-lg border border-white/[0.04]" style={{ backgroundColor: 'rgba(255,255,255,0.015)' }}>
                <div className="flex items-center gap-2">
                  <span className="text-[10px]" style={{ color: stream.requiresAuth ? '#fbbf24' : '#4ade80' }}>
                    {stream.requiresAuth ? '🔒' : '🔓'}
                  </span>
                  <span className="text-[10px] text-white/25">{stream.note}</span>
                </div>
                <a href={stream.websiteUrl} target="_blank" rel="noopener noreferrer" className="text-[10px] text-blue-400/60 hover:text-blue-400 transition-colors flex items-center gap-1">
                  {stream.websiteUrl.replace('https://', '').split('/')[0]}
                  <span>↗</span>
                </a>
              </div>
            )}

            <ScheduleTimeline channel={channel} />

            <div className="hidden lg:flex items-center justify-center gap-4 py-3 text-[10px] text-white/15">
              <span>← → החלף ערוץ</span>
              <span>•</span>
              <span>S הסתר/הצג סרגל</span>
              <span>•</span>
              <span>F מסך מלא</span>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
