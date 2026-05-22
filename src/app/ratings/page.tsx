'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { ArrowRight, BarChart3, RefreshCw, Trophy } from 'lucide-react';
import RatingLogo from '@/components/ratings/RatingLogo';
import type { RatingRow, RatingsApiResponse, RatingsMode } from '@/lib/ratingsTypes';
import { buildUnifiedDailyRatings, sourceSummary, type UnifiedRatingRow } from '@/lib/ratingsMerge';

const DISCLAIMER = [
  'הנתונים נאספו והופקו על ידי חברת קאנטר מדיה עבור הוועדה הישראלית למדרוג.',
  'ציטוט הנתונים או פרסומם בציבור מותר ובלבד שיעשה תוך הקפדה על שלמותם ודיוקם של הנתונים ותוך ציון העובדה כי הנתונים נמסרו על ידי הוועדה הישראלית למדרוג והופקו על ידי חברת קנטאר מדיה.',
  "השימוש במידע כפוף ל''כללי השימוש במידע'' של הוועדה והינו באחריות המשתמש בלבד.",
  'כל הזכויות שמורות.',
];

function formatDate(value: string | undefined): string {
  if (!value) return 'לא זמין';
  const parsed = Date.parse(value);
  if (Number.isNaN(parsed)) return value;
  return new Date(parsed).toLocaleDateString('he-IL');
}

function RatingsTable({ rows }: { rows: Array<RatingRow | UnifiedRatingRow> }) {
  return (
    <div className="overflow-hidden rounded-2xl border border-white/10 bg-slate-950/80">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[760px] text-right">
          <thead className="bg-white/[0.06] text-xs text-purple-100/70">
            <tr>
              <th className="px-4 py-3 font-bold">דירוג</th>
              <th className="px-4 py-3 font-bold">תוכנית</th>
              <th className="px-4 py-3 font-bold">ערוץ/קטגוריה</th>
              <th className="px-4 py-3 font-bold">תאריך</th>
              <th className="px-4 py-3 font-bold">מקור</th>
              <th className="px-4 py-3 font-bold">שיעור צפייה</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/10">
            {rows.map((row) => {
              const unifiedRow = row as UnifiedRatingRow;
              const sources = Array.isArray(unifiedRow.sources) ? unifiedRow.sources : [{ name: 'Midrug' as const, ratingPercent: row.ratingPercent }];
              const hasDifferentValues = new Set(sources.map((source) => source.ratingPercent)).size > 1;

              return (
              <tr key={`${row.rank}-${row.showName}-${row.date}`} className="align-middle text-sm text-slate-100">
                <td className="px-4 py-3">
                  <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-purple-500/15 font-black text-purple-100" dir="ltr">
                    {unifiedRow.displayRank || row.rank}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <div className="flex min-w-0 items-center gap-3">
                    <RatingLogo src={row.logoUrl} name={row.canonicalShowName || row.showName} channel={row.channel} />
                    <div className="min-w-0">
                      <div className="font-bold text-white">{row.canonicalShowName || row.showName}</div>
                      {row.canonicalShowName && row.canonicalShowName !== row.showName ? (
                        <div className="mt-0.5 text-xs text-slate-400">{row.showName}</div>
                      ) : null}
                      {hasDifferentValues ? (
                        <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px] font-bold text-blue-200/80">
                          {sources.map((source) => (
                            <span key={`${source.name}-${source.category || 'all'}-${source.ratingPercent}`} dir="ltr">
                              {source.name}{source.category ? ` ${source.category}` : ''} {source.ratingPercent}%
                            </span>
                          ))}
                        </div>
                      ) : null}
                    </div>
                  </div>
                </td>
                <td className="px-4 py-3 text-slate-300">
                  {row.channel}
                  {unifiedRow.category ? <span className="mr-2 rounded-full bg-blue-400/10 px-2 py-0.5 text-xs text-blue-200">{unifiedRow.category}</span> : null}
                </td>
                <td className="px-4 py-3 text-slate-300" dir="ltr">{formatDate(row.date)}</td>
                <td className="px-4 py-3 text-slate-300">
                  <div className="flex flex-wrap gap-1.5">
                    <span>{sourceSummary(unifiedRow) || 'מדרוג'}</span>
                    {unifiedRow.viewers ? <span dir="ltr">{unifiedRow.viewers}K</span> : null}
                  </div>
                </td>
                <td className="px-4 py-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="inline-flex rounded-lg bg-fuchsia-400/15 px-3 py-1.5 font-black text-fuchsia-100" dir="ltr">
                      {row.ratingPercent}%
                    </span>
                  </div>
                </td>
              </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default function RatingsPage() {
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

  const rows = useMemo<Array<RatingRow | UnifiedRatingRow>>(() => (
    mode === 'daily' ? buildUnifiedDailyRatings(data?.daily) : data?.weekly?.top25 ?? []
  ), [data, mode]);

  const sourceBadge = useMemo(() => {
    if (mode !== 'daily') return null;
    const hasTelegram = (data?.daily?.telegramHouseholds?.length ?? 0) > 0;
    const hasMidrug = (data?.daily?.top20?.length ?? 0) > 0;
    if (hasMidrug && hasTelegram) return 'מקור: Midrug + Scopt';
    if (hasMidrug) return 'מקור: הוועדה למדרוג';
    return null;
  }, [data, mode]);

  const meta = mode === 'daily'
    ? `Top ${rows.length} · ${formatDate(data?.daily?.date)}`
    : `Top 25 · ${data?.weekly?.weekRange || 'השבוע האחרון'}`;

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,#4c1d95_0,#0f1020_42%,#050712_100%)] text-white" dir="rtl">
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:py-12">
        <Link href="/" className="mb-6 inline-flex items-center gap-2 text-sm font-bold text-purple-100/75 transition-colors hover:text-white">
          <ArrowRight className="h-4 w-4" />
          חזרה לדף הבית
        </Link>

        <section className="mb-8 flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-3xl">
            <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-purple-300/20 bg-purple-300/10 px-3 py-1 text-sm font-bold text-purple-100">
              <Trophy className="h-4 w-4" />
              נתוני צפייה רשמיים
            </div>
            <h1 className="text-4xl font-black leading-tight sm:text-5xl">נתוני רייטינג</h1>
            <p className="mt-3 max-w-2xl text-base leading-8 text-slate-300">
              טבלת התוכניות המובילות לפי שיעור צפייה, עם זיהוי הפקות מתוך מאגר התעשייה והצגת לוגואים כאשר קיימים.
            </p>
          </div>

          <div className="grid w-full grid-cols-2 rounded-2xl border border-white/10 bg-black/25 p-1.5 text-sm font-black shadow-xl shadow-black/20 sm:w-auto">
            <button
              type="button"
              onClick={() => setMode('daily')}
              className={`rounded-xl px-5 py-3 transition-colors ${mode === 'daily' ? 'bg-white text-purple-950' : 'text-purple-100/75 hover:text-white'}`}
            >
              רייטינג יומי (Top 20)
            </button>
            <button
              type="button"
              onClick={() => setMode('weekly')}
              className={`rounded-xl px-5 py-3 transition-colors ${mode === 'weekly' ? 'bg-white text-purple-950' : 'text-purple-100/75 hover:text-white'}`}
            >
              רייטינג שבועי (Top 25)
            </button>
          </div>
        </section>

        <div className="mb-4 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-purple-100">
            <BarChart3 className="h-5 w-5" />
            <h2 className="text-xl font-black">{mode === 'daily' ? 'רייטינג יומי' : 'רייטינג שבועי'}</h2>
          </div>
          <span className="rounded-full border border-white/10 bg-white/[0.06] px-3 py-1 text-xs font-bold text-slate-300" dir="ltr">
            {sourceBadge ?? meta}
          </span>
        </div>

        {loading ? (
          <div className="flex min-h-64 items-center justify-center gap-3 rounded-2xl border border-white/10 bg-slate-950/70 text-purple-100/75">
            <RefreshCw className="h-5 w-5 animate-spin" />
            טוען נתוני רייטינג
          </div>
        ) : rows.length > 0 ? (
          <RatingsTable rows={rows} />
        ) : (
          <div className="rounded-2xl border border-white/10 bg-slate-950/70 p-8 text-center text-slate-300">
            עדיין אין נתוני רייטינג זמינים.
          </div>
        )}

        <section className="mt-8 rounded-2xl border border-white/10 bg-white/[0.04] p-5 text-sm leading-7 text-slate-400">
          {DISCLAIMER.map((line) => (
            <p key={line}>* {line}</p>
          ))}
        </section>
      </div>
    </main>
  );
}
