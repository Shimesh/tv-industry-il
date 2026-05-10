'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
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
  const [isMuted, setIsMuted] = useState(false);
  const [brightness, setBrightness] = useState(100);
  const [contrast, setContrast] = useState(100);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showControls, setShowControls] = useState(true);
  const [showSettings, setShowSettings] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // needsUserGesture: autoplay was blocked — show tap-to-play overlay
  const [needsUserGesture, setNeedsUserGesture] = useState(false);

  const appendAutoplayParams = (url: string): string => {
    try {
      const parsed = new URL(url);
      parsed.searchParams.set('autoplay', '1');
      parsed.searchParams.set('autoPlay', 'true');
      parsed.searchParams.set('playsinline', '1');
      parsed.searchParams.set('playsInline', '1');
      parsed.searchParams.delete('mute');
      parsed.searchParams.delete('muted');
      parsed.searchParams.delete('isMuted');
      parsed.searchParams.delete('isMute');
      parsed.searchParams.delete('volume');
      parsed.searchParams.set('mute', '0');
      parsed.searchParams.set('muted', '0');
      parsed.searchParams.set('isMuted', 'false');
      parsed.searchParams.set('isMute', 'false');
      parsed.searchParams.set('volume', '1');
      return parsed.toString();
    } catch {
      const separator = url.includes('?') ? '&' : '?';
      return `${url}${separator}autoplay=1&autoPlay=true&playsinline=1&mute=0&muted=0&isMuted=false&isMute=false&volume=1`;
    }
  };
  const [loading, setLoading] = useState(false);
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Dynamic stream state for channels resolved at runtime
  const [dynamicStreamUrl, setDynamicStreamUrl] = useState<string | null>(null);
  const [dynamicEmbedUrl, setDynamicEmbedUrl] = useState<string | null>(null);
  const [dynamicLoading, setDynamicLoading] = useState(false);

  // Reset dynamic state when channel changes
  useEffect(() => {
    setDynamicStreamUrl(null);
    setDynamicEmbedUrl(null);
    setError(null);
    setNeedsUserGesture(false);
    setIsMuted(false);
  }, [channel.id]);

  // Fetch stream URL at runtime for channels with dynamicStream flag
  useEffect(() => {
    if (!stream?.dynamicStream) return;

    setDynamicLoading(true);
    setError(null);

    fetch(`/api/stream-token/${channel.id}`)
      .then(res => res.ok ? res.json() : null)
      .then(data => {
        if (data?.type === 'kaltura' && data.embedUrl) {
          setDynamicEmbedUrl(data.embedUrl);
        } else if (data?.url) {
          setDynamicStreamUrl(data.url);
        }
        // No URL found → fall through to placeholder (no error overlay)
      })
      .catch(() => { /* network error → fall through to placeholder */ })
      .finally(() => setDynamicLoading(false));
  }, [channel.id, stream?.dynamicStream]);

  // Load HLS stream (either static streamUrl or dynamic URL fetched from API)
  useEffect(() => {
    const hlsUrl = dynamicStreamUrl ?? stream?.streamUrl;
    if (!videoRef.current || !hlsUrl) return;

    let hlsInstance: import('hls.js').default | null = null;
    setLoading(true);
    setError(null);
    setNeedsUserGesture(false);

    const loadStream = async () => {
      if (hlsUrl.includes('.m3u8')) {
        const HlsModule = await import('hls.js');
        const Hls = HlsModule.default;

        if (Hls.isSupported()) {
          hlsInstance = new Hls({
            enableWorker: true,
            lowLatencyMode: true,
          });
          hlsInstance.loadSource(hlsUrl);
          hlsInstance.attachMedia(videoRef.current!);
          if (videoRef.current) { videoRef.current.muted = false; videoRef.current.volume = 1; }
          hlsInstance.on(Hls.Events.MANIFEST_PARSED, () => {
            const vid = videoRef.current;
            if (!vid) return;
            vid.play().then(() => {
              setIsPlaying(true);
              setLoading(false);
              setNeedsUserGesture(false);
            }).catch(() => {
              setLoading(false);
              setNeedsUserGesture(true);
            });
          });
          hlsInstance.on(Hls.Events.ERROR, (_, data) => {
            if (data.fatal) {
              setError('שגיאה בטעינת השידור');
              setLoading(false);
            }
          });
        } else if (videoRef.current?.canPlayType('application/vnd.apple.mpegurl')) {
          // Safari / iOS native HLS support
          const vid = videoRef.current;
          vid.src = hlsUrl;
          vid.load();
          vid.play().then(() => {
            setIsPlaying(true);
            setLoading(false);
            setNeedsUserGesture(false);
          }).catch(() => {
            setLoading(false);
            setNeedsUserGesture(true);
          });
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
  }, [stream?.streamUrl, dynamicStreamUrl]);

  // Sync volume and muted state to the video element
  // Note: React's `muted` JSX prop is broken (known React bug) — must use ref imperatively
  useEffect(() => {
    if (videoRef.current) {
      videoRef.current.volume = isMuted ? 0 : volume / 100;
      videoRef.current.muted = isMuted;
    }
  }, [volume, isMuted]);

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
      setIsPlaying(false);
    } else {
      videoRef.current.play().then(() => {
        setIsPlaying(true);
        setNeedsUserGesture(false);
      }).catch(() => {});
    }
  }, [isPlaying]);

  // Tap-to-play: called when user taps the overlay after autoplay was blocked
  const handleUserGesturePlay = useCallback(() => {
    const vid = videoRef.current;
    if (!vid) return;
    vid.play().then(() => {
      setIsPlaying(true);
      setNeedsUserGesture(false);
    }).catch(() => {});
  }, []);

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
      if (e.key === 'm' || e.key === 'M') setIsMuted(v => !v);
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

  // Resolve final URLs: HLS takes priority over iframe embed
  const resolvedEmbedUrl = stream?.embedUrl ?? dynamicEmbedUrl;
  const resolvedAutoplayEmbedUrl = resolvedEmbedUrl ? appendAutoplayParams(resolvedEmbedUrl) : null;
  const resolvedHlsUrl = stream?.streamUrl ?? dynamicStreamUrl;
  const hasDirectStream = !!resolvedHlsUrl;
  const hasEmbed = !!resolvedEmbedUrl;
  const isResolvingDynamicStream = !!(stream?.dynamicStream && dynamicLoading && !hasDirectStream);

  // Rendering priority: HLS stream > iframe embed > loading spinner > fallback placeholder
  const showHls = hasDirectStream && !error;
  const showEmbed = !showHls && hasEmbed && !error && !isResolvingDynamicStream;
  const showLiveBadge = showHls || showEmbed;
  const showDynamicLoading = isResolvingDynamicStream;
  const showFallback = !showEmbed && !showHls && !showDynamicLoading;

  return (
    <div
      ref={containerRef}
      className="relative bg-black rounded-xl overflow-hidden group"
      style={{ aspectRatio: '16/9' }}
      onMouseMove={resetHideTimer}
      onClick={resetHideTimer}
    >
      {showEmbed ? (
        <iframe
          key={resolvedEmbedUrl}
          src={resolvedAutoplayEmbedUrl || resolvedEmbedUrl}
          allow="autoplay; fullscreen; encrypted-media; picture-in-picture"
          allowFullScreen
          loading="eager"
          className="absolute inset-0 w-full h-full border-0"
          title={channel.name}
        />
      ) : showHls ? (
        <>
          {/* playsInline is required for iOS to play inline (not fullscreen).
              muted is NOT set as a JSX prop because React doesn't sync it reliably —
              we control it imperatively via ref in the useEffect above. */}
          <video
            ref={videoRef}
            style={videoStyle}
            playsInline
            muted={false}
            controls={true}
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

          {/* Tap-to-play overlay: shown when autoplay was blocked by the browser */}
          {needsUserGesture && !loading && (
            <div
              className="absolute inset-0 flex items-center justify-center bg-black/60 z-10 cursor-pointer"
              onClick={handleUserGesturePlay}
            >
              <div className="flex flex-col items-center gap-3 text-white select-none">
                <div className="w-16 h-16 bg-white/20 hover:bg-white/30 transition-colors rounded-full flex items-center justify-center text-3xl">
                  ▶
                </div>
                <span className="text-sm text-white/80">הקש להפעלה</span>
              </div>
            </div>
          )}

        </>
      ) : showDynamicLoading ? (
        /* Fetching dynamic stream URL */
        <div className="absolute inset-0 flex items-center justify-center bg-black">
          <div className="flex flex-col items-center gap-3 text-white">
            <div className="w-10 h-10 border-3 border-white/20 border-t-white rounded-full animate-spin" />
            <span className="text-white/70 text-sm">מתחבר לשידור...</span>
          </div>
        </div>
      ) : showFallback ? (
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
      ) : null}

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
              {showLiveBadge && (
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
            <div className="mb-3 rounded-xl border p-4 text-sm backdrop-blur-sm" style={{ background: 'var(--theme-bg-card)', borderColor: 'var(--theme-border)', color: 'var(--theme-text)' }}>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block mb-1.5 text-xs text-[var(--theme-text-secondary)]">בהירות</label>
                  <input
                    type="range" min="50" max="150" value={brightness}
                    onChange={e => setBrightness(Number(e.target.value))}
                    className="w-full accent-blue-500 h-1"
                  />
                  <span className="text-[10px] text-[var(--theme-text-secondary)]">{brightness}%</span>
                </div>
                <div>
                  <label className="block mb-1.5 text-xs text-[var(--theme-text-secondary)]">קונטרסט</label>
                  <input
                    type="range" min="50" max="150" value={contrast}
                    onChange={e => setContrast(Number(e.target.value))}
                    className="w-full accent-blue-500 h-1"
                  />
                  <span className="text-[10px] text-[var(--theme-text-secondary)]">{contrast}%</span>
                </div>
              </div>
              <button
                onClick={() => { setBrightness(100); setContrast(100); }}
                className="mt-2 text-[10px] text-[var(--theme-text-secondary)] transition-colors hover:text-[var(--theme-text)]"
              >
                אפס הגדרות
              </button>
            </div>
          )}

          {/* Main controls row */}
          <div className="flex items-center gap-2 sm:gap-3 text-white" dir="ltr">
            {/* Next channel: visually left in the player controls */}
            <button
              onClick={onNext}
              className="hover:text-blue-400 transition-colors p-1"
              aria-label="הערוץ הבא"
            >
              <ChevronLeft className="h-5 w-5" />
            </button>

            {/* Play/Pause (HLS only) */}
            {showHls && (
              <button
                onClick={togglePlay}
                className="w-9 h-9 bg-white/15 rounded-full flex items-center justify-center hover:bg-white/25 transition-colors text-sm"
              >
                {isPlaying ? '⏸' : '▶'}
              </button>
            )}

            {/* Previous channel: visually right of the play button */}
            <button
              onClick={onPrev}
              className="hover:text-blue-400 transition-colors p-1"
              aria-label="הערוץ הקודם"
            >
              <ChevronRight className="h-5 w-5" />
            </button>

            {/* Volume (HLS only — iframe controls its own audio) */}
            {showHls && (
              <div className="flex items-center gap-1.5 max-w-28">
                <button
                  onClick={() => {
                    if (isMuted) {
                      // Unmute: restore volume (ensure at least some volume)
                      setIsMuted(false);
                      if (volume === 0) setVolume(80);
                    } else {
                      setIsMuted(true);
                    }
                  }}
                  className="text-sm shrink-0 hover:text-blue-400 transition-colors"
                  aria-label={isMuted ? 'בטל השתקה' : 'השתק'}
                >
                  {isMuted ? '🔇' : volume < 50 ? '🔉' : '🔊'}
                </button>
                <input
                  type="range" min="0" max="100" value={isMuted ? 0 : volume}
                  onChange={e => {
                    const newVol = Number(e.target.value);
                    setVolume(newVol);
                    // Automatically unmute when user raises the slider
                    if (newVol > 0) {
                      setIsMuted(false);
                    } else {
                      setIsMuted(true);
                    }
                  }}
                  className="w-full accent-white h-0.5 cursor-pointer"
                />
              </div>
            )}

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
