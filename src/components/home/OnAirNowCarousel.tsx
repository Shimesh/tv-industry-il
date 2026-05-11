'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import Hls from 'hls.js';
import { ChevronLeft, ChevronRight, ExternalLink, VolumeX } from 'lucide-react';

import { channels as channelCatalog } from '@/data/channels';
import { streamConfigs } from '@/data/streams';
import type { BroadcastChannelState } from '@/lib/broadcasts';
import { formatBroadcastTime } from '@/lib/broadcasts';
import { getChannelDisplayName } from '@/lib/channelLabels';

const CARD_WIDTH = 320;
const CARD_GAP = 12;
const NOW14_PREVIEW_HLS_URL = 'https://n-121-11.il.cdn-redge.media/livehls/oil/ch14/live/ch14/live.livx/playlist.m3u8?bitrate=928000&audioId=1&videoId=12';

function appendMutedParams(url: string): string {
  try {
    const parsed = new URL(url);
    parsed.searchParams.set('autoplay', '1');
    parsed.searchParams.set('autoPlay', 'true');
    parsed.searchParams.set('mute', '1');
    parsed.searchParams.delete('muted');
    parsed.searchParams.append('muted', '1');
    parsed.searchParams.append('muted', 'true');
    parsed.searchParams.set('isMuted', 'true');
    parsed.searchParams.set('isMute', 'true');
    parsed.searchParams.set('volume', '0');
    parsed.searchParams.set('playsinline', '1');
    parsed.searchParams.set('playsInline', '1');
    parsed.searchParams.set('webkit-playsinline', '1');
    return parsed.toString();
  } catch {
    const sep = url.includes('?') ? '&' : '?';
    return `${url}${sep}autoplay=1&autoPlay=true&mute=1&muted=1&muted=true&isMuted=true&isMute=true&volume=0&playsinline=1&playsInline=1&webkit-playsinline=1`;
  }
}

function getVideoErrorDetails(video: HTMLVideoElement | null) {
  const error = video?.error;
  return error ? { code: error.code, message: error.message } : null;
}

function isMobileBrowser() {
  if (typeof navigator === 'undefined') return false;
  return /Android|iPhone|iPad|iPod|Mobile|CriOS|FxiOS/i.test(navigator.userAgent);
}

function logMobileKeshetStartAttempt(mode: 'HLS' | 'IFRAME', sourceUrl: string | null) {
  if (typeof window === 'undefined' || !isMobileBrowser()) return;

  const body = JSON.stringify({
    source: 'home-carousel',
    version: '1.9.2',
    name: 'MOBILE_KESHET_START_ATTEMPT',
    message: 'MOBILE_KESHET_START_ATTEMPT',
    href: window.location.href,
    pathname: window.location.pathname,
    userAgent: navigator.userAgent,
    platform: navigator.platform,
    language: navigator.language,
    stack: JSON.stringify({
      channelId: 'keshet12',
      mode,
      sourceUrl,
    }),
  });

  try {
    if (typeof navigator.sendBeacon === 'function') {
      const sent = navigator.sendBeacon('/api/client-system-logs', new Blob([body], { type: 'application/json' }));
      if (sent) return;
    }
  } catch {}

  void fetch('/api/client-system-logs', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body,
    keepalive: true,
  }).catch(() => undefined);
}

function configureAutoplayVideo(video: HTMLVideoElement | null) {
  if (!video) return;
  video.autoplay = true;
  video.loop = true;
  video.playsInline = true;
  video.defaultMuted = true;
  video.muted = true;
  video.volume = 0;
  video.setAttribute('autoplay', '');
  video.setAttribute('loop', '');
  video.setAttribute('muted', '');
  video.setAttribute('playsinline', '');
  video.setAttribute('webkit-playsinline', '');
}

function MutedLivePreview({ channelId }: { channelId: string }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const loggedKeshetStartRef = useRef<string | null>(null);
  const stream = streamConfigs[channelId];
  const [dynamicHlsUrl, setDynamicHlsUrl] = useState<string | null>(null);
  const [dynamicStreamResolved, setDynamicStreamResolved] = useState(false);
  const [failedHlsUrl, setFailedHlsUrl] = useState<string | null>(null);
  const needsDynamicResolution = Boolean((stream?.dynamicStream && !stream.streamUrl) || channelId === 'now14');

  useEffect(() => {
    if (!needsDynamicResolution) return;

    let cancelled = false;
    fetch(`/api/stream-token/${channelId}`)
      .then(res => {
        if (!res.ok) {
          console.error('[OnAirNowCarousel] Failed to resolve dynamic stream', {
            channelId,
            status: res.status,
            statusText: res.statusText,
          });
          return null;
        }
        return res.json();
      })
      .then(data => {
        if (cancelled) return;
        if (data?.url) {
          setDynamicHlsUrl(data.url);
          setFailedHlsUrl(null);
        } else {
          console.error('[OnAirNowCarousel] Dynamic stream returned no HLS URL', { channelId });
        }
      })
      .catch(error => {
        console.error('[OnAirNowCarousel] Dynamic stream request failed', { channelId, error });
      })
      .finally(() => {
        if (!cancelled) setDynamicStreamResolved(true);
      });

    return () => {
      cancelled = true;
    };
  }, [channelId, needsDynamicResolution]);

  const rawHlsUrl = channelId === 'now14' ? NOW14_PREVIEW_HLS_URL : (stream?.streamUrl ?? dynamicHlsUrl);
  const hlsUrl = rawHlsUrl && rawHlsUrl !== failedHlsUrl ? rawHlsUrl : null;
  const isKeshetMobile = channelId === 'keshet12' && isMobileBrowser();

  useEffect(() => {
    if (!isKeshetMobile) return;

    const mode = hlsUrl ? 'HLS' : (dynamicStreamResolved && stream?.embedUrl ? 'IFRAME' : null);
    if (!mode) return;

    const key = `${mode}:${hlsUrl ?? stream?.embedUrl ?? ''}`;
    if (loggedKeshetStartRef.current === key) return;
    loggedKeshetStartRef.current = key;
    logMobileKeshetStartAttempt(mode, hlsUrl ?? stream?.embedUrl ?? null);
  }, [dynamicStreamResolved, hlsUrl, isKeshetMobile, stream?.embedUrl]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !hlsUrl) return;

    let hls: Hls | null = null;

    const logPlaybackError = (message: string, details?: unknown) => {
      console.error(`[OnAirNowCarousel] ${message}`, {
        channelId,
        sourceUrl: hlsUrl,
        networkState: video.networkState,
        readyState: video.readyState,
        videoError: getVideoErrorDetails(video),
        details,
      });
    };

    const failPreview = (message: string, details?: unknown) => {
      logPlaybackError(message, details);
      setFailedHlsUrl(hlsUrl);
    };

    const playMutedPreview = (context: string) => {
      configureAutoplayVideo(video);
      void video.play().catch(error => {
        failPreview(`Autoplay failed during ${context}`, error);
      });
      if (isKeshetMobile) {
        window.setTimeout(() => {
          configureAutoplayVideo(video);
          void video.play().catch(error => {
            failPreview(`Delayed mobile autoplay failed during ${context}`, error);
          });
        }, 200);
      }
    };

    const handleNativeVideoError = () => {
      failPreview('Native video error');
    };

    const handleStalled = () => {
      logPlaybackError('Native video stalled');
    };

    const handleWaiting = () => {
      logPlaybackError('Native video waiting for data');
    };

    video.addEventListener('error', handleNativeVideoError);
    video.addEventListener('stalled', handleStalled);
    video.addEventListener('waiting', handleWaiting);

    configureAutoplayVideo(video);

    if (video.canPlayType('application/vnd.apple.mpegurl')) {
      video.src = hlsUrl;
      video.load();
      playMutedPreview('native HLS setup');
      return () => {
        video.removeEventListener('error', handleNativeVideoError);
        video.removeEventListener('stalled', handleStalled);
        video.removeEventListener('waiting', handleWaiting);
      };
    }

    if (!Hls.isSupported()) {
      failPreview('Browser does not support HLS playback');
      return () => {
        video.removeEventListener('error', handleNativeVideoError);
        video.removeEventListener('stalled', handleStalled);
        video.removeEventListener('waiting', handleWaiting);
      };
    }

    hls = new Hls({
      lowLatencyMode: false,
      maxBufferLength: 30,
      maxMaxBufferLength: 60,
      capLevelToPlayerSize: true,
      startLevel: 0,
    });

    hls.loadSource(hlsUrl);
    hls.attachMedia(video);
    configureAutoplayVideo(video);
    hls.on(Hls.Events.MANIFEST_PARSED, () => {
      playMutedPreview('HLS manifest parsed');
    });
    hls.on(Hls.Events.ERROR, (_, data) => {
      logPlaybackError('HLS error', data);
      if (data.fatal) {
        failPreview('Fatal HLS error', data);
      }
    });

    return () => {
      video.removeEventListener('error', handleNativeVideoError);
      video.removeEventListener('stalled', handleStalled);
      video.removeEventListener('waiting', handleWaiting);
      hls?.destroy();
    };
  }, [channelId, hlsUrl, isKeshetMobile]);

  const keepMuted = useCallback(() => {
    configureAutoplayVideo(videoRef.current);
  }, []);

  const handleLoadedMetadata = useCallback(() => {
    const video = videoRef.current;
    configureAutoplayVideo(video);
    if (!video || !isKeshetMobile) return;
    window.setTimeout(() => {
      configureAutoplayVideo(video);
      void video.play().catch(error => {
        console.error('[OnAirNowCarousel] Delayed mobile Keshet metadata play failed', {
          channelId,
          sourceUrl: hlsUrl,
          error,
          videoError: getVideoErrorDetails(video),
        });
      });
    }, 200);
  }, [channelId, hlsUrl, isKeshetMobile]);

  if (!stream?.hasLiveStream) {
    return (
      <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-slate-950">
        <ExternalLink className="h-7 w-7 text-white/35" />
        <span className="text-xs font-bold text-white/70">אין preview ישיר</span>
        <span className="max-w-[220px] text-center text-[11px] leading-snug text-white/35">
          הערוץ זמין דרך מקור חיצוני או דורש הרשאה.
        </span>
      </div>
    );
  }

  if (hlsUrl) {
    return (
      <video
        ref={videoRef}
        className="absolute inset-0 h-full w-full object-cover"
        autoPlay={true}
        muted={true}
        playsInline={true}
        loop={true}
        preload="metadata"
        controls={false}
        disablePictureInPicture
        controlsList="nodownload"
        onLoadedMetadata={handleLoadedMetadata}
        onPlay={keepMuted}
        onVolumeChange={keepMuted}
        onError={() => {
          console.error('[OnAirNowCarousel] React video onError', {
            channelId,
            sourceUrl: hlsUrl,
            networkState: videoRef.current?.networkState,
            readyState: videoRef.current?.readyState,
            videoError: getVideoErrorDetails(videoRef.current),
          });
          if (hlsUrl) setFailedHlsUrl(hlsUrl);
        }}
      />
    );
  }

  if (needsDynamicResolution && !dynamicStreamResolved) {
    return (
      <div className="absolute inset-0 flex items-center justify-center bg-slate-950 text-xs font-bold text-white/50">
        טוען תצוגה שקטה...
      </div>
    );
  }

  if ((stream.type === 'iframe' || stream.type === 'youtube') && stream.embedUrl) {
    return (
      <iframe
        src={appendMutedParams(stream.embedUrl)}
        title="תצוגה מקדימה לשידור חי"
        className="absolute inset-0 h-full w-full border-0"
        allow="autoplay; encrypted-media; picture-in-picture"
        allowFullScreen
        loading="eager"
      />
    );
  }

  return (
    <div className="absolute inset-0 flex items-center justify-center bg-slate-950 text-xs font-bold text-white/50">
      השידור זמין באתר הערוץ
    </div>
  );
}

export default function OnAirNowCarousel({
  channels,
  loading = false,
}: {
  channels: BroadcastChannelState[];
  loading?: boolean;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(true);

  const items = useMemo(
    () =>
      channels
        .map((state) => {
          const metadata = channelCatalog.find((channel) => channel.id === state.channelId);
          if (!metadata) return null;
          return {
            state,
            metadata,
            program: state.now.current ?? state.now.next,
            stream: streamConfigs[state.channelId],
          };
        })
        .filter((item): item is NonNullable<typeof item> => Boolean(item)),
    [channels],
  );

  const updateScrollState = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    setCanScrollLeft(el.scrollLeft > 8);
    setCanScrollRight(el.scrollLeft < el.scrollWidth - el.clientWidth - 8);
    const idx = Math.round(el.scrollLeft / (CARD_WIDTH + CARD_GAP));
    setActiveIndex(Math.max(0, Math.min(idx, Math.max(items.length - 1, 0))));
  }, [items.length]);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.addEventListener('scroll', updateScrollState, { passive: true });
    updateScrollState();
    return () => el.removeEventListener('scroll', updateScrollState);
  }, [updateScrollState]);

  const scroll = (direction: 'prev' | 'next') => {
    scrollRef.current?.scrollBy({
      left: direction === 'next' ? CARD_WIDTH + CARD_GAP : -(CARD_WIDTH + CARD_GAP),
      behavior: 'smooth',
    });
  };

  if (!items.length && !loading) return null;

  return (
    <div className="relative">
      {canScrollRight && items.length > 1 && (
        <button
          onClick={() => scroll('next')}
          className="absolute right-0 top-1/2 z-10 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full opacity-85 shadow-lg transition-opacity hover:opacity-100"
          style={{ background: 'var(--theme-bg-card)', border: '1px solid var(--theme-border)' }}
          aria-label="הבא"
        >
          <ChevronRight className="h-5 w-5" style={{ color: 'var(--theme-text)' }} />
        </button>
      )}

      {canScrollLeft && (
        <button
          onClick={() => scroll('prev')}
          className="absolute left-0 top-1/2 z-10 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full opacity-85 shadow-lg transition-opacity hover:opacity-100"
          style={{ background: 'var(--theme-bg-card)', border: '1px solid var(--theme-border)' }}
          aria-label="הקודם"
        >
          <ChevronLeft className="h-5 w-5" style={{ color: 'var(--theme-text)' }} />
        </button>
      )}

      <div
        ref={scrollRef}
        dir="ltr"
        className="flex gap-3 overflow-x-auto px-1 pb-2"
        style={{ scrollbarWidth: 'none', scrollSnapType: 'x mandatory', msOverflowStyle: 'none' }}
      >
        {loading && !items.length
          ? Array.from({ length: 4 }).map((_, index) => (
              <div
                key={index}
                className="h-56 w-80 shrink-0 animate-pulse rounded-xl border bg-white/[0.04]"
                style={{ borderColor: 'var(--theme-border)', scrollSnapAlign: 'start' }}
              />
            ))
          : items.map(({ state, metadata, program, stream }) => (
              <Link
                key={state.channelId}
                href={`/schedule?channelId=${state.channelId}`}
                className="group relative h-56 w-80 shrink-0 overflow-hidden rounded-xl border bg-slate-950"
                style={{ borderColor: 'var(--theme-border)', scrollSnapAlign: 'start' }}
              >
                <MutedLivePreview channelId={state.channelId} />

                <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/25 to-black/20" />

                <div className="absolute right-3 top-3 flex items-center gap-1.5 rounded-full bg-red-600/90 px-2 py-1 text-[10px] font-bold text-white shadow">
                  <span className="relative flex h-1.5 w-1.5">
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-300 opacity-75" />
                    <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-white" />
                  </span>
                  עכשיו בשידור
                </div>

                <div className="absolute left-3 top-3 flex items-center gap-1 rounded-full bg-black/55 px-2 py-1 text-[10px] font-bold text-white/80">
                  <VolumeX className="h-3 w-3" />
                  מושתק
                </div>

                {!stream?.hasLiveStream && (
                  <div className="absolute bottom-20 left-3 rounded-full border border-white/15 bg-black/55 px-2 py-1 text-[10px] font-bold text-white/70">
                    צפייה דרך אתר הערוץ
                  </div>
                )}

                <div className="absolute bottom-0 left-0 right-0 p-4 text-right">
                  <div className="mb-1 flex flex-row-reverse items-center justify-end gap-1.5">
                    <span className="text-[10px] text-white/70">
                      {program ? formatBroadcastTime(program.startAt) : ''}
                    </span>
                    <span className="text-xs font-semibold text-white/90">
                      {getChannelDisplayName(state.channelId, metadata.name)}
                    </span>
                  </div>
                  <h3 className="line-clamp-2 text-sm font-bold leading-snug text-white drop-shadow">
                    {program?.title || 'לוח השידורים מתעדכן'}
                  </h3>
                </div>
              </Link>
            ))}
      </div>

      {items.length > 1 && (
        <div className="mt-2.5 flex justify-center gap-1.5">
          {items.map((item, index) => (
            <div
              key={item.state.channelId}
              className="rounded-full transition-all duration-300"
              style={{
                width: index === activeIndex ? '16px' : '6px',
                height: '6px',
                background: index === activeIndex ? 'var(--theme-accent)' : 'var(--theme-border)',
                opacity: index === activeIndex ? 1 : 0.5,
              }}
            />
          ))}
        </div>
      )}
    </div>
  );
}
