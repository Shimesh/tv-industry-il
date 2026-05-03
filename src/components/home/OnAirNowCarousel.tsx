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

function appendMutedParams(url: string): string {
  try {
    const parsed = new URL(url);
    parsed.searchParams.set('autoplay', '1');
    parsed.searchParams.set('mute', '1');
    parsed.searchParams.set('muted', '1');
    parsed.searchParams.set('playsinline', '1');
    return parsed.toString();
  } catch {
    const sep = url.includes('?') ? '&' : '?';
    return `${url}${sep}autoplay=1&mute=1&muted=1&playsinline=1`;
  }
}

function MutedLivePreview({ channelId }: { channelId: string }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const stream = streamConfigs[channelId];
  const [dynamicHlsUrl, setDynamicHlsUrl] = useState<string | null>(null);
  const [dynamicStreamResolved, setDynamicStreamResolved] = useState(false);
  const needsDynamicResolution = Boolean(stream?.dynamicStream && !stream.streamUrl);

  // For channels with dynamicStream + no static streamUrl, try to fetch HLS at runtime
  useEffect(() => {
    if (!needsDynamicResolution) return;

    let cancelled = false;
    fetch(`/api/stream-token/${channelId}`)
      .then(res => res.ok ? res.json() : null)
      .then(data => {
        if (cancelled) return;
        if (data?.url) setDynamicHlsUrl(data.url);
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setDynamicStreamResolved(true);
      });

    return () => {
      cancelled = true;
    };
  }, [channelId, needsDynamicResolution]);

  const hlsUrl = stream?.streamUrl ?? dynamicHlsUrl;

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !hlsUrl) return;

    video.muted = true;
    video.volume = 0;

    if (video.canPlayType('application/vnd.apple.mpegurl')) {
      video.src = hlsUrl;
      void video.play().catch(() => {});
      return;
    }

    if (!Hls.isSupported()) return;

    const hls = new Hls({
      lowLatencyMode: true,
      maxBufferLength: 12,
      capLevelToPlayerSize: true,
    });

    hls.loadSource(hlsUrl);
    hls.attachMedia(video);
    hls.on(Hls.Events.MANIFEST_PARSED, () => {
      void video.play().catch(() => {});
    });

    return () => hls.destroy();
  }, [hlsUrl]);

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

  // HLS available (static or dynamically resolved) — native <video> works on mobile
  if (hlsUrl) {
    return (
      <video
        ref={videoRef}
        className="absolute inset-0 h-full w-full object-cover"
        muted
        playsInline
        autoPlay
        preload="metadata"
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

  // Only show iframe preview when the embed player actually respects muted params.
  // Channels with embedRespectsMute: false (e.g. Mako/Video.js) are skipped here
  // to avoid playing audio in the silent carousel.
  if ((stream.type === 'iframe' || stream.type === 'youtube') && stream.embedUrl && stream.embedRespectsMute !== false) {
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
