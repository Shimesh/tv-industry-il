'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import type { Channel } from '@/data/channels';
import type { StreamConfig } from '@/data/streams';

interface VideoPlayerProps {
  channel: Channel;
  stream: StreamConfig | undefined;
  onNext: () => void;
  onPrev: () => void;
  currentProgram?: string;
}

export function VideoPlayer({ channel, stream, onNext, onPrev, currentProgram }: VideoPlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [volume, setVolume] = useState(80);
  const [brightness, setBrightness] = useState(100);
  const [contrast, setContrast] = useState(100);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showControls, setShowControls] = useState(true);
  const [showSettings, setShowSettings] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Load HLS stream
  useEffect(() => {
    if (!videoRef.current || !stream?.streamUrl) return;

    let hlsInstance: import('hls.js').default | null = null;
    setLoading(true);
    setError(null);

    const loadStream = async () => {
      const url = stream.streamUrl!;

      if (url.includes('.m3u8')) {
        const HlsModule = await import('hls.js');
        const Hls = HlsModule.default;

        if (Hls.isSupported()) {
          hlsInstance = new Hls({
            enableWorker: true,
            lowLatencyMode: true,
          });
          hlsInstance.loadSource(url);
          hlsInstance.attachMedia(videoRef.current!);
          hlsInstance.on(Hls.Events.MANIFEST_PARSED, () => {
            videoRef.current?.play().then(() => {
              setIsPlaying(true);
              setLoading(false);
            }).catch(() => {
              setLoading(false);
            });
          });
          hlsInstance.on(Hls.Events.ERROR, (_, data) => {
            if (data.fatal) {
              setError('שגיאה בטעינת השידור');
              setLoading(false);
            }
          });
        } else if (videoRef.current?.canPlayType('application/vnd.apple.mpegurl')) {
          // Safari native HLS
          videoRef.current.src = url;
          videoRef.current.play().then(() => {
            setIsPlaying(true);
            setLoading(false);
          }).catch(() => setLoading(false));
        } else {
          setError('הדפדפן לא תומך בפורמט השידור');
          setLoading(false);
        }
      }
    };

    loadStream();

    return () => {
      hlsInstance?.destroy();
    };
  }, [stream?.streamUrl]);

  // Set volume on video element
  useEffect(() => {
    if (videoRef.current) {
      videoRef.current.volume = volume / 100;
    }
  }, [volume]);

  // Auto-hide controls
  const resetHideTimer = useCallback(() => {
    setShowControls(true);
    if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    hideTimerRef.current = setTimeout(() => setShowControls(false), 3500);
  }, []);

  useEffect(() => {
    return () => {
      if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    };
  }, []);

  const togglePlay = useCallback(() => {
    if (!videoRef.current) return;
    if (isPlaying) {
      videoRef.current.pause();
    } else {
      videoRef.current.play();
    }
    setIsPlaying(!isPlaying);
  }, [isPlaying]);

  const toggleFullscreen = useCallback(() => {
    const el = containerRef.current;
    if (!el) return;
    if (!document.fullscreenElement) {
      el.requestFullscreen();
      setIsFullscreen(true);
    } else {
      document.exitFullscreen();
      setIsFullscreen(false);
    }
  }, []);

  // Keyboard shortcuts: F = fullscreen, M = mute
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.key === 'f' || e.key === 'F') toggleFullscreen();
      if (e.key === 'm' || e.key === 'M') setVolume(v => v === 0 ? 80 : 0);
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [toggleFullscreen]);

  const videoStyle = {
    filter: `brightness(${brightness}%) contrast(${contrast}%)`,
    width: '100%',
    height: '100%',
    objectFit: 'contain' as const,
  };

  const hasDirectStream = stream?.hasLiveStream && stream?.streamUrl;

  return (
    <div
      ref={containerRef}
      className="relative bg-black rounded-xl overflow-hidden group"
      style={{ aspectRatio: '16/9' }}
      onMouseMove={resetHideTimer}
      onClick={resetHideTimer}
    >
      {hasDirectStream ? (
        <>
          <video
            ref={videoRef}
            style={videoStyle}
            playsInline
            onError={() => {
              setError('השידור אינו זמין כרגע');
              setLoading(false);
            }}
          />

          {/* Loading spinner */}
          {loading && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/60 z-10">
              <div className="flex flex-col items-center gap-3">
                <div className="w-10 h-10 border-3 border-white/20 border-t-white rounded-full animate-spin" />
                <span className="text-white/70 text-sm">טוען שידור...</span>
              </div>
            </div>
          )}
        </>
      ) : (
        /* No direct stream - styled placeholder */
        <div className="flex flex-col items-center justify-center h-full text-white relative overflow-hidden">
          {/* Animated background gradient */}
          <div
            className="absolute inset-0 opacity-20"
            style={{
              background: `radial-gradient(ellipse at 30% 50%, ${channel.color}40 0%, transparent 60%),
                           radial-gradient(ellipse at 70% 50%, ${channel.color}20 0%, transparent 60%)`,
            }}
          />

          {/* Scan lines effect */}
          <div
            className="absolute inset-0 opacity-[0.03] pointer-events-none"
            style={{
              backgroundImage: 'repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(255,255,255,0.1) 2px, rgba(255,255,255,0.1) 4px)',
            }}
          />

          <div className="relative z-10 text-center px-6">
            <div className="text-7xl mb-4 drop-shadow-2xl">{channel.logo}</div>
            <h3 className="text-2xl font-black mb-1 tracking-tight">{channel.name}</h3>
            {currentProgram && (
              <p className="text-white/50 text-sm mb-5">כרגע: {currentProgram}</p>
            )}

            {stream ? (
              <div className="space-y-3">
                {/* Status badge */}
                <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium"
                  style={{
                    backgroundColor: stream.requiresAuth ? 'rgba(234,179,8,0.15)' : 'rgba(34,197,94,0.15)',
                    color: stream.requiresAuth ? '#fbbf24' : '#4ade80',
                    border: `1px solid ${stream.requiresAuth ? 'rgba(234,179,8,0.25)' : 'rgba(34,197,94,0.25)'}`,
                  }}
                >
                  {stream.requiresAuth ? '🔒' : '🔓'} {stream.note}
                </div>

                {/* Watch button */}
                <div>
                  <a
                    href={stream.websiteUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-3 px-6 py-3 rounded-xl text-white font-bold text-sm transition-all duration-200 hover:scale-105 hover:shadow-2xl active:scale-100"
                    style={{
                      background: `linear-gradient(135deg, ${channel.color}, ${channel.color}cc)`,
                      boxShadow: `0 8px 30px ${channel.color}35`,
                    }}
                  >
                    <span className="text-lg">▶</span>
                    פתח באתר הערוץ
                    <span className="text-xs opacity-60">↗</span>
                  </a>
                </div>
              </div>
            ) : (
              <p className="text-white/30 text-sm">אין שידור זמין</p>
            )}
          </div>
        </div>
      )}

      {/* Error overlay */}
      {error && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/80 z-20">
          <div className="text-center text-white px-6">
            <div className="text-4xl mb-3">⚠️</div>
            <p className="text-red-400 mb-4 text-sm">{error}</p>
            {stream?.websiteUrl && (
              <button
                onClick={() => window.open(stream.websiteUrl, '_blank')}
                className="bg-white/10 hover:bg-white/20 px-4 py-2 rounded-lg text-sm transition-colors"
              >
                פתח באתר הערוץ ↗
              </button>
            )}
          </div>
        </div>
      )}

      {/* Controls overlay */}
      <div className={`absolute inset-0 transition-opacity duration-300 pointer-events-none ${showControls ? 'opacity-100' : 'opacity-0'}`}>
        {/* Top bar - LIVE indicator + channel name */}
        <div className="absolute top-0 inset-x-0 bg-gradient-to-b from-black/70 to-transparent p-3 sm:p-4 pointer-events-auto">
          <div className="flex items-center justify-between text-white">
            <div className="flex items-center gap-2.5">
              {(hasDirectStream || stream?.type === 'youtube') && (
                <span className="bg-red-600 px-2 py-0.5 rounded text-[10px] font-black tracking-wider flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 bg-white rounded-full animate-pulse" />
                  LIVE
                </span>
              )}
              <span className="text-lg">{channel.logo}</span>
              <span className="font-bold text-sm">{channel.name}</span>
              {currentProgram && (
                <span className="text-white/50 text-xs hidden sm:inline">• {currentProgram}</span>
              )}
            </div>
            <button
              onClick={() => setShowSettings(!showSettings)}
              className="text-white/60 hover:text-white transition-colors pointer-events-auto text-lg"
            >
              ⚙️
            </button>
          </div>
        </div>

        {/* Bottom controls */}
        <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/80 to-transparent p-3 sm:p-4 pointer-events-auto">
          {/* Settings panel */}
          {showSettings && (
            <div className="mb-3 bg-black/80 backdrop-blur-sm rounded-xl p-4 text-white text-sm border border-white/10">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block mb-1.5 text-gray-400 text-xs">בהירות</label>
                  <input
                    type="range" min="50" max="150" value={brightness}
                    onChange={e => setBrightness(Number(e.target.value))}
                    className="w-full accent-blue-500 h-1"
                  />
                  <span className="text-[10px] text-gray-500">{brightness}%</span>
                </div>
                <div>
                  <label className="block mb-1.5 text-gray-400 text-xs">קונטרסט</label>
                  <input
                    type="range" min="50" max="150" value={contrast}
                    onChange={e => setContrast(Number(e.target.value))}
                    className="w-full accent-blue-500 h-1"
                  />
                  <span className="text-[10px] text-gray-500">{contrast}%</span>
                </div>
              </div>
              <button
                onClick={() => { setBrightness(100); setContrast(100); }}
                className="mt-2 text-[10px] text-gray-400 hover:text-white transition-colors"
              >
                אפס הגדרות
              </button>
            </div>
          )}

          {/* Main controls row */}
          <div className="flex items-center gap-2 sm:gap-3 text-white">
            {/* Prev channel */}
            <button onClick={onPrev} className="hover:text-blue-400 transition-colors text-lg p-1">
              ⏮
            </button>

            {/* Play/Pause */}
            {hasDirectStream && (
              <button
                onClick={togglePlay}
                className="w-9 h-9 bg-white/15 rounded-full flex items-center justify-center hover:bg-white/25 transition-colors text-sm"
              >
                {isPlaying ? '⏸' : '▶'}
              </button>
            )}

            {/* Next channel */}
            <button onClick={onNext} className="hover:text-blue-400 transition-colors text-lg p-1">
              ⏭
            </button>

            {/* Volume */}
            <div className="flex items-center gap-1.5 max-w-28">
              <button
                onClick={() => setVolume(v => v === 0 ? 80 : 0)}
                className="text-sm shrink-0 hover:text-blue-400 transition-colors"
              >
                {volume === 0 ? '🔇' : volume < 50 ? '🔉' : '🔊'}
              </button>
              <input
                type="range" min="0" max="100" value={volume}
                onChange={e => setVolume(Number(e.target.value))}
                className="w-full accent-white h-0.5 cursor-pointer"
              />
            </div>

            {/* Spacer */}
            <div className="flex-1" />

            {/* Fullscreen */}
            <button
              onClick={toggleFullscreen}
              className="hover:text-blue-400 transition-colors text-lg p-1"
            >
              {isFullscreen ? '⊡' : '⛶'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
