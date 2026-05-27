'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, BarChart3, RefreshCw } from 'lucide-react';
import RatingLogo from '@/components/ratings/RatingLogo';
import { findChannelByName } from '@/data/channels';
import type { RatingsApiResponse, RatingsMode } from '@/lib/ratingsTypes';
import { buildUnifiedDailyRatings, sourceSummary, type UnifiedRatingRow } from '@/lib/ratingsMerge';

const MODES: Array<{ key: RatingsMode; label: string }> = [
  { key: 'daily', label: 'רייטינג יומי' },
  { key: 'weekly', label: 'רייטינג שבועי' },
];

function channelLabel(channelName?: string): string {
  if (!channelName) return '';
  const channel = findChannelByName(channelName);
  if (channel?.number) return `ערוץ ${channel.number}`;
  const match = channelName.match(/\d+/);
  if (match) return `ערוץ ${match[0]}`;
  return channelName;
}

export default function RatingsWidget() {
  const [mode, setMode] = useState<RatingsMode>('daily');
  const [data, setData] = useState<RatingsApiResponse | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/ratings', { cache: 'no-store' })
      .then((response) => response.json())
      .then((payload: RatingsApiResponse) => {
        if (!cancelled) setData(payload);
      })
      .catch(() => {
        if (!cancelled) setData({ success: false });
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const rows = useMemo(() => {
    if (mode === 'daily') {
      return buildUnifiedDailyRatings(data?.daily).slice(0, 5);
    }
    return data?.weekly?.top25?.slice(0, 5).map((row) => ({ ...row, _source: 'midrug' as const })) ?? [];
  }, [data, mode]);

  const subtitle = mode === 'daily'
    ? data?.daily?.date
      ? new Date(data.daily.date).toLocaleDateString('he-IL')
      : 'עדכון יומי אחרון'
    : data?.weekly?.weekRange || 'עדכון שבועי אחרון';

  return (
    <section className="flex h-[360px] flex-col rounded-2xl border border-purple-300/25 bg-gradient-to-br from-slate-950 via-purple-950/70 to-slate-950 p-3 shadow-[0_22px_60px_rgba(88,28,135,0.28),inset_0_1px_0_rgba(255,255,255,0.08)] transition duration-200 hover:-translate-y-0.5 hover:border-purple-200/45 hover:shadow-[0_28px_72px_rgba(147,51,234,0.34),inset_0_1px_0_rgba(255,255,255,0.12)]" dir="rtl">
      <div className="mb-2 flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 text-purple-200">
            <BarChart3 className="h-4 w-4" />
            <h2 className="text-base font-black text-white">מדד הרייטינג</h2>
          </div>
          <p className="mt-1 text-xs text-purple-100/65">{subtitle}</p>
        </div>
        <div className="grid grid-cols-2 rounded-lg border border-white/10 bg-black/25 p-1 text-[10px] font-bold">
          {MODES.map((item) => (
            <button
              key={item.key}
              type="button"
              onClick={() => setMode(item.key)}
              className={`rounded-md px-2.5 py-1.5 transition-colors ${
                mode === item.key ? 'bg-white text-purple-950' : 'text-purple-100/75 hover:text-white'
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center gap-2 py-8 text-sm text-purple-100/70">
          <RefreshCw className="h-4 w-4 animate-spin" />
          טוען נתוני רייטינג
        </div>
      ) : rows.length > 0 ? (
        <div className="min-h-0 flex-1 space-y-1 overflow-hidden">
          {rows.map((row) => {
            const unifiedRow = row as UnifiedRatingRow;
            const viewersK = unifiedRow.viewers;
            const isUnified = Array.isArray(unifiedRow.sources);
            return (
              <div key={`${mode}-${row.rank}-${row.showName}`} className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.06] p-1">
                <div className="w-5 shrink-0 text-center text-sm font-black text-purple-200" dir="ltr">{isUnified ? unifiedRow.displayRank : row.rank}</div>
                <RatingLogo src={(row as import('@/lib/ratingsTypes').RatingRow).logoUrl} name={row.showName} channel={row.channel} compact />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs font-bold text-white">{row.showName}</p>
                  <p className="flex min-w-0 flex-wrap items-center gap-1 text-[11px] text-purple-100/60">
                    <span>{channelLabel(row.channel)}</span>
                    {unifiedRow.category ? <span className="rounded-full bg-blue-400/10 px-1.5 py-0.5 text-[10px] text-blue-300">{unifiedRow.category}</span> : null}
                    {isUnified && sourceSummary(unifiedRow) ? <span>· {sourceSummary(unifiedRow)}</span> : null}
                    {viewersK != null ? <span dir="ltr">· {viewersK}K</span> : null}
                  </p>
                </div>
                <div className="rounded-lg bg-fuchsia-400/15 px-2.5 py-1 text-sm font-black text-fuchsia-100" dir="ltr">
                  {row.ratingPercent}%
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="rounded-xl border border-white/10 bg-white/[0.04] p-4 text-sm text-purple-100/70">
          עדיין אין נתוני רייטינג זמינים.
        </div>
      )}

      <Link
        href="/ratings"
        className="mt-2 flex items-center justify-center gap-2 rounded-xl bg-white px-4 py-1.5 text-sm font-black text-purple-950 transition-colors hover:bg-purple-100"
      >
        לדוח הרייטינג המלא
        <ArrowLeft className="h-4 w-4" />
      </Link>
    </section>
  );
}
