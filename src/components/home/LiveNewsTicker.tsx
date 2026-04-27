'use client';

import { useEffect, useLayoutEffect, useMemo, useRef } from 'react';

export type LiveNewsTickerItem = {
  title: string;
  link: string;
  source: string;
  pubDate?: string;
};

type LiveNewsTickerProps = {
  items: LiveNewsTickerItem[];
  speedPxPerSecond?: number;
};

function formatSourceBadge(source: string, pubDate?: string) {
  const parts = source.split(' - ').map((part) => part.trim()).filter(Boolean);
  const formattedSource = parts.length >= 2
    ? `${parts.slice(1).join(' - ')} - ${parts[0]}`
    : source;

  if (!pubDate) {
    return `[${formattedSource}]`;
  }

  const publishedAt = new Date(pubDate);
  if (Number.isNaN(publishedAt.getTime())) {
    return `[${formattedSource}]`;
  }

  const timeLabel = publishedAt.toLocaleTimeString('he-IL', {
    hour: '2-digit',
    minute: '2-digit',
  });

  return `[${formattedSource} ${timeLabel}]`;
}

function repeatItems(items: LiveNewsTickerItem[]) {
  if (items.length === 0) {
    return [];
  }

  const repeated = [...items];
  while (repeated.length < 24) {
    repeated.push(...items);
  }
  return repeated;
}

export default function LiveNewsTicker({
  items,
  speedPxPerSecond = 50,
}: LiveNewsTickerProps) {
  const trackRef = useRef<HTMLDivElement | null>(null);
  const primaryGroupRef = useRef<HTMLDivElement | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const lastFrameTimeRef = useRef<number | null>(null);
  const offsetRef = useRef(0);
  const widthRef = useRef(0);

  const repeatedItems = useMemo(() => repeatItems(items), [items]);

  useLayoutEffect(() => {
    const measure = () => {
      widthRef.current = primaryGroupRef.current?.scrollWidth ?? 0;
      if (!trackRef.current || !widthRef.current) {
        return;
      }

      offsetRef.current = -widthRef.current;
      trackRef.current.style.transform = `translate3d(${offsetRef.current}px, 0, 0)`;
    };

    measure();

    const resizeObserver = typeof ResizeObserver !== 'undefined'
      ? new ResizeObserver(() => measure())
      : null;

    if (primaryGroupRef.current && resizeObserver) {
      resizeObserver.observe(primaryGroupRef.current);
    }

    window.addEventListener('resize', measure);
    return () => {
      resizeObserver?.disconnect();
      window.removeEventListener('resize', measure);
    };
  }, [repeatedItems]);

  useEffect(() => {
    if (!trackRef.current || repeatedItems.length === 0) {
      return;
    }

    const step = (timestamp: number) => {
      if (!trackRef.current || !widthRef.current) {
        animationFrameRef.current = window.requestAnimationFrame(step);
        return;
      }

      if (lastFrameTimeRef.current == null) {
        lastFrameTimeRef.current = timestamp;
      }

      const delta = timestamp - lastFrameTimeRef.current;
      lastFrameTimeRef.current = timestamp;

      offsetRef.current += (speedPxPerSecond * delta) / 1000;
      if (offsetRef.current >= 0) {
        offsetRef.current -= widthRef.current;
      }

      trackRef.current.style.transform = `translate3d(${offsetRef.current}px, 0, 0)`;
      animationFrameRef.current = window.requestAnimationFrame(step);
    };

    animationFrameRef.current = window.requestAnimationFrame(step);

    return () => {
      if (animationFrameRef.current != null) {
        window.cancelAnimationFrame(animationFrameRef.current);
      }
      animationFrameRef.current = null;
      lastFrameTimeRef.current = null;
    };
  }, [repeatedItems, speedPxPerSecond]);

  const renderGroup = (groupItems: LiveNewsTickerItem[]) => (
    <div className="inline-flex items-center shrink-0 whitespace-nowrap">
      {groupItems.map((news, index) => (
        <span
          key={`${news.link}-${index}`}
          className="inline-flex items-center shrink-0 text-xs"
          style={{ color: 'var(--theme-text)' }}
        >
          <span className="opacity-50 whitespace-nowrap" dir="rtl">
            {formatSourceBadge(news.source, news.pubDate)}
          </span>
          <span className="mr-2 whitespace-nowrap" dir="rtl">
            {news.title}
          </span>
          <span className="mx-5 opacity-15">|</span>
        </span>
      ))}
    </div>
  );

  return (
    <div className="flex-1 overflow-hidden" dir="ltr">
      <div className="overflow-hidden py-2">
        <div
          ref={trackRef}
          className="flex items-center w-max will-change-transform"
          style={{ transform: 'translate3d(0, 0, 0)' }}
        >
          <div ref={primaryGroupRef} className="shrink-0 whitespace-nowrap">
            {renderGroup(repeatedItems)}
          </div>
          <div className="shrink-0 whitespace-nowrap">
            {renderGroup(repeatedItems)}
          </div>
        </div>
      </div>
    </div>
  );
}
