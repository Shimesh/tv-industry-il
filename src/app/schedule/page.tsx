'use client';

import { Suspense, useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { channels } from '@/data/channels';
import { streamConfigs } from '@/data/streams';
import { VideoPlayer } from '@/components/schedule/VideoPlayer';
import { ChannelSidebar } from '@/components/schedule/ChannelSidebar';
import { ScheduleTimeline } from '@/components/schedule/ScheduleTimeline';
import { useBroadcasts } from '@/hooks/useBroadcasts';
import { formatBroadcastDuration, formatBroadcastTime } from '@/lib/broadcasts';

const STORAGE_KEY = 'tv-last-channel';

export default function SchedulePage() {
  return (
    <Suspense>
      <SchedulePageInner />
    </Suspense>
  );
}

function SchedulePageInner() {
  const searchParams = useSearchParams();
  const [selectedChannelId, setSelectedChannelId] = useState<string>(() => {
    const urlChannel = searchParams.get('channelId');
    if (urlChannel && channels.some((channel) => channel.id === urlChannel)) return urlChannel;
    if (typeof window === 'undefined') return 'i24';
    const saved = window.localStorage.getItem(STORAGE_KEY);
    return saved && channels.some((channel) => channel.id === saved) ? saved : 'i24';
  });
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const { byChannelId, loading: broadcastsLoading, error: broadcastsError } = useBroadcasts({ scope: 'all', pollMs: 120000 });

  useEffect(() => {
    const urlChannel = searchParams.get('channelId');
    if (urlChannel && channels.find((channel) => channel.id === urlChannel)) {
      const timer = window.setTimeout(() => setSelectedChannelId(urlChannel), 0);
      return () => window.clearTimeout(timer);
    }

    if (typeof window === 'undefined') {
      return;
    }

    const saved = window.localStorage.getItem(STORAGE_KEY);
    if (saved && channels.find((channel) => channel.id === saved)) {
      const timer = window.setTimeout(() => setSelectedChannelId(saved), 0);
      return () => window.clearTimeout(timer);
    }
  }, [searchParams]);

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
  const broadcastState = byChannelId[selectedChannelId];
  const currentProgram = broadcastState?.now.current ?? null;
  const nextProgram = broadcastState?.now.next ?? null;

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
      <div className="sticky z-30 border-b border-white/[0.06] px-2 py-2 lg:hidden" style={{ backgroundColor: '#0d0d14', top: 'var(--app-header-offset)' }}>
        <ChannelSidebar selectedChannelId={selectedChannelId} onSelectChannel={selectChannel} isMobile byChannelId={byChannelId} loading={broadcastsLoading} />
      </div>

      <div className="flex" style={{ minHeight: 'calc(100dvh - var(--app-header-offset))' }}>
        <aside
          className={`hidden shrink-0 overflow-hidden border-l border-white/[0.06] transition-all duration-300 lg:block ${sidebarCollapsed ? 'w-0 p-0' : 'w-64 p-3'}`}
          style={{ backgroundColor: '#0d0d14' }}
        >
          {!sidebarCollapsed && (
            <>
              <div className="mb-4 flex items-center justify-between px-1">
                <h2 className="text-xs font-bold uppercase tracking-widest text-white/40">ערוצים</h2>
                <button onClick={() => setSidebarCollapsed(true)} className="text-xs text-white/20 transition-colors hover:text-white/50" title="הסתר סרגל (S)">
                  ×
                </button>
              </div>
              <ChannelSidebar selectedChannelId={selectedChannelId} onSelectChannel={selectChannel} byChannelId={byChannelId} loading={broadcastsLoading} />
            </>
          )}
        </aside>

        {sidebarCollapsed && (
          <button
            onClick={() => setSidebarCollapsed(false)}
            className="fixed right-0 top-1/2 z-40 hidden h-16 w-6 -translate-y-1/2 items-center justify-center rounded-l-lg border-l border-white/10 bg-white/5 transition-colors hover:bg-white/10 lg:flex"
            title="הצג ערוצים (S)"
          >
            <span className="text-xs text-white/40">‹</span>
          </button>
        )}

        <main className="flex-1 overflow-y-auto">
          <div className="mx-auto max-w-5xl space-y-5 px-3 py-4 sm:px-6 sm:py-6">
            <VideoPlayer channel={channel} stream={stream} onNext={goToNextChannel} onPrev={goToPrevChannel} currentProgram={currentProgram?.title} />

            {broadcastsError && (
              <div className="rounded-lg border border-amber-400/20 bg-amber-400/10 px-3 py-2 text-xs text-amber-200">
                לא הצלחנו לרענן את לוח השידורים כרגע. אם יש cache תקין הוא מוצג עד לרענון הבא.
              </div>
            )}

            <div className="flex flex-col gap-3 sm:flex-row">
              {currentProgram ? (
                <div className="flex-1 rounded-lg border p-3 transition-all" style={{ backgroundColor: `${channel.color}08`, borderColor: `${channel.color}20` }}>
                  <div className="mb-1.5 flex items-center gap-2">
                    <span className="h-2 w-2 animate-pulse rounded-full" style={{ backgroundColor: channel.color }} />
                    <span className="text-[10px] font-bold uppercase tracking-wider text-white/40">עכשיו משדרים</span>
                  </div>
                  <h3 className="mb-0.5 text-base font-black text-white">{currentProgram.title}</h3>
                  {currentProgram.description && <p className="text-xs text-white/40">{currentProgram.description}</p>}
                  <div className="mt-2 flex items-center gap-2">
                    <span className="font-mono text-[10px] text-white/30">{formatBroadcastTime(currentProgram.startAt)}</span>
                    <span className="text-[10px] text-white/20">•</span>
                    <span className="text-[10px] text-white/30">{formatBroadcastDuration(currentProgram.startAt, currentProgram.endAt)}</span>
                    {currentProgram.genre && (
                      <>
                        <span className="text-[10px] text-white/20">•</span>
                        <span className="rounded px-1.5 py-0.5 text-[9px]" style={{ backgroundColor: `${channel.color}20`, color: channel.color }}>
                          {currentProgram.genre}
                        </span>
                      </>
                    )}
                  </div>
                </div>
              ) : (
                <div className="flex-1 rounded-lg border border-white/[0.06] bg-white/[0.03] p-3 text-sm text-white/45">
                  {broadcastsLoading ? 'טוען את התוכנית הנוכחית...' : 'אין כרגע תוכנית נוכחית זמינה לערוץ הזה.'}
                </div>
              )}

              {nextProgram && (
                <div className="rounded-lg border border-white/[0.06] p-3 sm:w-64" style={{ backgroundColor: 'rgba(255,255,255,0.02)' }}>
                  <div className="mb-1.5 flex items-center gap-2">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-white/25">הבא בתור</span>
                  </div>
                  <h4 className="text-sm font-bold text-white/70">{nextProgram.title}</h4>
                  <div className="mt-1 flex items-center gap-2">
                    <span className="font-mono text-[10px] text-white/25">{formatBroadcastTime(nextProgram.startAt)}</span>
                    <span className="text-[10px] text-white/15">•</span>
                    <span className="text-[10px] text-white/25">{formatBroadcastDuration(nextProgram.startAt, nextProgram.endAt)}</span>
                  </div>
                </div>
              )}
            </div>

            {stream && (
              <div className="flex items-center justify-between rounded-lg border border-white/[0.04] px-3 py-2" style={{ backgroundColor: 'rgba(255,255,255,0.015)' }}>
                <div className="flex items-center gap-2">
                  <span className="text-[10px]" style={{ color: stream.requiresAuth ? '#fbbf24' : '#4ade80' }}>
                    {stream.requiresAuth ? '🔒' : '🔓'}
                  </span>
                  <span className="text-[10px] text-white/25">{stream.note}</span>
                </div>
                <a href={stream.websiteUrl} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-[10px] text-blue-400/60 transition-colors hover:text-blue-400">
                  {stream.websiteUrl.replace('https://', '').split('/')[0]}
                  <span>↗</span>
                </a>
              </div>
            )}

            <ScheduleTimeline channel={channel} programs={broadcastState?.programs ?? []} loading={broadcastsLoading} />

            <div className="hidden items-center justify-center gap-4 py-3 text-[10px] text-white/15 lg:flex">
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
