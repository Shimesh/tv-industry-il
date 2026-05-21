'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, BarChart3, RefreshCw } from 'lucide-react';
import RatingLogo from '@/components/ratings/RatingLogo';
import type { RatingsApiResponse, RatingsMode } from '@/lib/ratingsTypes';
import type { TelegramRatingRow } from '@/lib/ratingsTypes';

const MODES: Array<{ key: RatingsMode; label: string }> = [
  { key: 'daily', label: 'רייטינג יומי' },
  { key: 'weekly', label: 'רייטינג שבועי' },
];

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

  const { rows, dataSource } = useMemo(() => {
    if (mode === 'daily') {
      if (data?.daily?.top20?.length) {
        return {
          rows: data.daily.top20.slice(0, 5),
          dataSource: 'midrug' as const,
        };
      }
      if (data?.daily?.telegramHouseholds?.length) {
        const telegramRows = (data.daily.telegramHouseholds as TelegramRatingRow[]).slice(0, 5).map((r) => ({
          rank: r.rank,
          showName: r.showName,
          channel: '',
          date: data.daily?.date ?? '',
          duration: 0,
          ratingPercent: r.ratingPercent,
          _viewers: r.viewers,
        }));
        return { rows: telegramRows, dataSource: 'telegram' as const };
      }
      return { rows: [], dataSource: null };
    }
    return { rows: data?.weekly?.top25?.slice(0, 5) ?? [], dataSource: null };
  }, [data, mode]);

  const scoptNews = mode === 'daily' ? (data?.daily?.telegramHouseholds ?? []).slice(0, 3) : [];
  const scoptPrime = mode === 'daily' ? (data?.daily?.telegramPrime ?? []).slice(0, 3) : [];
  const hasScoptSections = dataSource === 'midrug' && (scoptNews.length > 0 || scoptPrime.length > 0);

  const subtitle = mode === 'daily'
    ? data?.daily?.date
      ? new Date(data.daily.date).toLocaleDateString('he-IL')
      : 'עדכון יומי אחרון'
    : data?.weekly?.weekRange || 'עדכון שבועי אחרון';

  return (
    <section className="rounded-2xl border border-purple-300/25 bg-gradient-to-br from-slate-950 via-purple-950/70 to-slate-950 p-4 shadow-[0_22px_60px_rgba(88,28,135,0.28),inset_0_1px_0_rgba(255,255,255,0.08)] transition duration-200 hover:-translate-y-0.5 hover:border-purple-200/45 hover:shadow-[0_28px_72px_rgba(147,51,234,0.34),inset_0_1px_0_rgba(255,255,255,0.12)]" dir="rtl">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 text-purple-200">
            <BarChart3 className="h-4 w-4" />
            <h2 className="text-base font-black text-white">מדד הרייטינג</h2>
          </div>
          <p className="mt-1 text-xs text-purple-100/65">{subtitle}</p>
          {dataSource === 'telegram' && (
            <span className="mt-1 text-[10px] text-blue-300/80">מקור: Scopt (מוקדם)</span>
          )}
        </div>
        <div className="grid grid-cols-2 rounded-lg border border-white/10 bg-black/25 p-1 text-[11px] font-bold">
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
        <div className="space-y-2.5">
          {rows.map((row) => {
            const isTelegram = dataSource === 'telegram';
            const viewersK = (row as { _viewers?: number })._viewers;
            return (
              <div key={`${mode}-${row.rank}-${row.showName}`} className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/[0.06] p-2.5">
                <div className="w-5 shrink-0 text-center text-sm font-black text-purple-200" dir="ltr">{row.rank}</div>
                {!isTelegram && (
                  <RatingLogo src={(row as import('@/lib/ratingsTypes').RatingRow).logoUrl} name={(row as import('@/lib/ratingsTypes').RatingRow).canonicalShowName || row.showName} channel={row.channel} compact />
                )}
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-bold text-white">{(row as import('@/lib/ratingsTypes').RatingRow).canonicalShowName || row.showName}</p>
                  {isTelegram && viewersK != null ? (
                    <p className="truncate text-xs text-blue-200/70">{viewersK}K צופים</p>
                  ) : (
                    <p className="truncate text-xs text-purple-100/60">{row.channel}</p>
                  )}
                </div>
                <div className="rounded-lg bg-fuchsia-400/15 px-2.5 py-1 text-sm font-black text-fuchsia-100" dir="ltr">
                  {row.ratingPercent}%
                </div>
              </div>
            );
          })}
          {hasScoptSections ? (
            <div className="mt-3 grid gap-2 border-t border-white/10 pt-3 sm:grid-cols-2">
              {[
                { title: 'חדשות Scopt', rows: scoptNews },
                { title: 'פריים טיים Scopt', rows: scoptPrime },
              ].map((section) => section.rows.length > 0 ? (
                <div key={section.title} className="rounded-xl border border-blue-300/15 bg-blue-950/20 p-2.5">
                  <p className="mb-2 text-[11px] font-black text-blue-100">{section.title}</p>
                  <div className="space-y-1.5">
                    {section.rows.map((row) => (
                      <div key={`${section.title}-${row.rank}-${row.showName}`} className="flex items-center gap-2 text-xs">
                        <span className="w-4 shrink-0 font-black text-blue-300" dir="ltr">{row.rank}</span>
                        <span className="min-w-0 flex-1 truncate text-white">{row.showName}</span>
                        <span className="shrink-0 font-black text-fuchsia-200" dir="ltr">{row.ratingPercent}%</span>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null)}
            </div>
          ) : null}
        </div>
      ) : (
        <div className="rounded-xl border border-white/10 bg-white/[0.04] p-4 text-sm text-purple-100/70">
          עדיין אין נתוני רייטינג זמינים.
        </div>
      )}

      <Link
        href="/ratings"
        className="mt-4 flex items-center justify-center gap-2 rounded-xl bg-white px-4 py-2.5 text-sm font-black text-purple-950 transition-colors hover:bg-purple-100"
      >
        לדוח הרייטינג המלא
        <ArrowLeft className="h-4 w-4" />
      </Link>
    </section>
  );
}
