'use client';

import { useState, useEffect, type ElementType } from 'react';
import {
  Activity, AlertCircle, AlertTriangle, BarChart3, Bell,
  Building2, Calendar, CheckCircle, ChevronDown, Clock,
  Download, FileText, Layers, Monitor, Package,
  Server, Shield, TrendingUp, Truck, Users, Wifi, Wrench, Zap,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

// ─── Types ──────────────────────────────────────────────────────────────────

type BlockType = 'live' | 'setup' | 'free' | 'maintenance';

interface GanttBlock {
  label: string;
  start: number; // decimal hour, e.g. 8.5 = 08:30
  end: number;
  type: BlockType;
  client?: string;
}

interface StudioRow {
  id: string;
  name: string;
  blocks: GanttBlock[];
}

interface CostRow {
  resource: string;
  kind: 'studio' | 'van';
  electricity: number;
  depreciation: number;
  overhead: number;
  staffBase: number;
}

interface AlertItem {
  id: string;
  severity: 'critical' | 'warning' | 'opportunity';
  title: string;
  body: string;
  time: string;
}

interface SubRentRow {
  id: string;
  itemType: string;
  client: string;
  supplier: string;
  dailyCost: number;
  status: 'פעיל' | 'ממתין לאיסוף';
  location: string;
}

// ─── Mock Data ───────────────────────────────────────────────────────────────

const GANTT_ROWS: StudioRow[] = [
  {
    id: 's1', name: 'אולפן 1',
    blocks: [
      { label: 'תוכנית בוקר — חדשות 12', start: 6, end: 10, type: 'live', client: 'רשת 13' },
      { label: 'פירוק והקמה', start: 10, end: 12, type: 'setup' },
      { label: 'ריאליטי — "האח הגדול"', start: 12, end: 18, type: 'live', client: 'קשת 12' },
      { label: 'פירוק', start: 18, end: 19, type: 'setup' },
      { label: 'חדשות ערב', start: 19, end: 22, type: 'live', client: 'ערוץ 11' },
    ],
  },
  {
    id: 's2', name: 'אולפן 2',
    blocks: [
      { label: 'תוכנית ילדים — "ארץ נהדרת ג\'וניור"', start: 8, end: 11, type: 'live', client: 'כאן ילדים' },
      { label: 'הקמה', start: 11, end: 13, type: 'setup' },
      { label: 'פנוי — זמין להשכרה', start: 13, end: 17, type: 'free' },
      { label: 'פריים טיים — "ארץ נהדרת"', start: 17, end: 22, type: 'live', client: 'כאן 11' },
    ],
  },
  {
    id: 's4', name: 'אולפן 4',
    blocks: [
      { label: 'מגזין בוקר', start: 7, end: 11, type: 'live', client: 'רשת' },
      { label: 'תחזוקה מתוכננת', start: 11, end: 14, type: 'maintenance' },
      { label: 'הקמה — שעשועון', start: 14, end: 16, type: 'setup' },
      { label: 'שעשועון פריים טיים', start: 20, end: 23, type: 'live', client: 'קשת 12' },
    ],
  },
  {
    id: 's8', name: 'אולפן 8',
    blocks: [
      { label: 'סדרת דוקומנטרי', start: 9, end: 15, type: 'live', client: 'הוט' },
      { label: 'פירוק והקמה', start: 15, end: 17, type: 'setup' },
      { label: 'הכנה לשידור חי', start: 17, end: 19, type: 'setup' },
      { label: 'הופעה חיה — תוכנית לייב', start: 19, end: 23, type: 'live', client: 'Yes' },
    ],
  },
];

const COST_ROWS: CostRow[] = [
  { resource: 'אולפן 1',         kind: 'studio', electricity: 85,  depreciation: 320, overhead: 145, staffBase: 480 },
  { resource: 'אולפן 2',         kind: 'studio', electricity: 78,  depreciation: 290, overhead: 145, staffBase: 480 },
  { resource: 'אולפן 4',         kind: 'studio', electricity: 110, depreciation: 380, overhead: 145, staffBase: 560 },
  { resource: 'אולפן 8',         kind: 'studio', electricity: 95,  depreciation: 310, overhead: 145, staffBase: 510 },
  { resource: 'ניידת שידור 1',   kind: 'van',    electricity: 140, depreciation: 650, overhead: 210, staffBase: 720 },
  { resource: 'ניידת שידור 2',   kind: 'van',    electricity: 135, depreciation: 620, overhead: 210, staffBase: 720 },
];

const ALERTS: AlertItem[] = [
  {
    id: 'a1', severity: 'warning',
    title: 'כיול עדשה נדרש',
    body: 'מצלמת מס׳ 3 (אולפן 4) דורשת כיול עדשה. מומלץ לבצע תחזוקה לפני משמרת הערב (20:00).',
    time: '14:32',
  },
  {
    id: 'a2', severity: 'critical',
    title: 'חריגת שעות נוספות',
    body: 'צוות תאורה אולפן 4 — חריגה של 18% מתקציב שע"נ חודשי. נדרש אישור מנהל בכיר.',
    time: '13:15',
  },
  {
    id: 'a3', severity: 'opportunity',
    title: 'הזדמנות Yield — אולפן 2',
    body: 'אולפן 2 פנוי מחר 10:00–16:00 (6 שעות). צור קמפיין מחיר מופחת ללקוחות מאגר.',
    time: '12:00',
  },
];

const SUBRENT_ROWS: SubRentRow[] = [
  { id: 'r1', itemType: 'עדשת פוג׳ינון 99x',      client: 'הפקת ריאליטי — "האי"',  supplier: 'אוטופיה',    dailyCost: 2500, status: 'פעיל',          location: 'ניידת שידור 1' },
  { id: 'r2', itemType: 'מערכת אינטרקום RTS',      client: 'ידיעות טלוויזיה',      supplier: 'אודיו-ויז',  dailyCost: 850,  status: 'פעיל',          location: 'אולפן 4' },
  { id: 'r3', itemType: 'ריגינג וטרוס תאורה',      client: 'הופעות ישיר',           supplier: 'טרוס-טק',    dailyCost: 3200, status: 'ממתין לאיסוף', location: 'אולפן 1' },
  { id: 'r4', itemType: 'משדר טלמטרי 5G',          client: 'ספורט 1',               supplier: 'בזק',        dailyCost: 1100, status: 'פעיל',          location: 'ניידת שידור 2' },
];

const TABS = [
  { id: 'overview',    label: 'תצוגה כוללת' },
  { id: 'accounting',  label: 'הנהלת חשבונות' },
  { id: 'crew',        label: 'מבצעים וכח אדם' },
  { id: 'studios',     label: 'אולפנים' },
  { id: 'vans',        label: 'ניידות שידור' },
  { id: 'suppliers',   label: 'ספקים' },
  { id: 'equipment',   label: 'ציוד ומחסן' },
];

const BLOCK_CFG: Record<BlockType, { bg: string; border: string; text: string; legend: string }> = {
  live:        { bg: 'rgba(239,68,68,0.22)',   border: 'rgba(239,68,68,0.60)',   text: '#fca5a5', legend: 'בשידור / צילום' },
  setup:       { bg: 'rgba(245,158,11,0.18)',  border: 'rgba(245,158,11,0.55)',  text: '#fcd34d', legend: 'הקמה / פירוק' },
  free:        { bg: 'rgba(34,197,94,0.12)',   border: 'rgba(34,197,94,0.38)',   text: '#86efac', legend: 'פנוי' },
  maintenance: { bg: 'rgba(100,116,139,0.25)', border: 'rgba(100,116,139,0.55)', text: '#94a3b8', legend: 'השבתת תחזוקה' },
};

// ─── Constants ───────────────────────────────────────────────────────────────

const G_START = 6;
const G_END   = 24;
const G_SPAN  = G_END - G_START;

// ─── Helpers ─────────────────────────────────────────────────────────────────

function pct(hour: number): string {
  return `${Math.max(0, Math.min(100, (hour - G_START) / G_SPAN * 100))}%`;
}
function widthPct(start: number, end: number): string {
  const s = Math.max(start, G_START);
  const e = Math.min(end, G_END);
  return `${Math.max(0, (e - s) / G_SPAN * 100)}%`;
}
function money(n: number): string {
  return n.toLocaleString('he-IL');
}
function pad(n: number): string {
  return String(n).padStart(2, '0');
}

// ─── KPI Card ────────────────────────────────────────────────────────────────

function KpiCard({
  icon: Icon,
  label,
  value,
  sub,
  accent,
  borderAccent,
  live = false,
}: {
  icon: ElementType;
  label: string;
  value: React.ReactNode;
  sub?: React.ReactNode;
  accent: string;
  borderAccent: string;
  live?: boolean;
}) {
  return (
    <div
      className="app-card p-4 flex flex-col gap-2 min-h-[120px]"
      style={{ borderColor: borderAccent }}
    >
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-bold uppercase tracking-wide" style={{ color: 'var(--theme-text-secondary)' }}>
          {label}
        </span>
        <div className={live ? 'pulse-live' : ''}>
          <Icon className="w-4 h-4" style={{ color: accent }} />
        </div>
      </div>
      <div className="text-[1.6rem] font-black leading-none" style={{ color: 'var(--theme-text)' }}>
        {value}
      </div>
      {sub && (
        <div className="text-[11px] leading-snug mt-auto" style={{ color: 'var(--theme-text-secondary)' }}>
          {sub}
        </div>
      )}
    </div>
  );
}

// ─── Main Page ───────────────────────────────────────────────────────────────

export default function VipYuvalMatari() {
  const [now, setNow]               = useState(() => new Date());
  const [activeTab, setActiveTab]   = useState('overview');
  const [reportFrom, setReportFrom] = useState('');
  const [reportTo, setReportTo]     = useState('');
  const [generating, setGenerating] = useState(false);
  const [reportReady, setReportReady] = useState(false);

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  const timeStr = now.toLocaleTimeString('he-IL', { timeZone: 'Asia/Jerusalem', hour: '2-digit', minute: '2-digit', second: '2-digit' });
  const dateStr = now.toLocaleDateString('he-IL', { timeZone: 'Asia/Jerusalem', weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

  function handleGenerate() {
    if (generating) return;
    setGenerating(true);
    setReportReady(false);
    setTimeout(() => { setGenerating(false); setReportReady(true); }, 2400);
  }

  // Gantt hour markers: 06, 08, …, 24
  const hourMarkers = Array.from({ length: G_SPAN / 2 + 1 }, (_, i) => G_START + i * 2);

  // Enriched cost rows
  const costEnriched = COST_ROWS.map(r => ({ ...r, total: r.electricity + r.depreciation + r.overhead + r.staffBase }));
  const colSums = {
    electricity:  costEnriched.reduce((s, r) => s + r.electricity, 0),
    depreciation: costEnriched.reduce((s, r) => s + r.depreciation, 0),
    overhead:     costEnriched.reduce((s, r) => s + r.overhead, 0),
    staffBase:    costEnriched.reduce((s, r) => s + r.staffBase, 0),
    total:        costEnriched.reduce((s, r) => s + r.total, 0),
  };

  const subrentTotal = SUBRENT_ROWS.reduce((s, r) => s + r.dailyCost, 0);

  return (
    <div dir="rtl" className="min-h-screen pb-16" style={{ background: 'var(--theme-bg)' }}>
      <div className="max-w-[1440px] mx-auto px-3 sm:px-6 pt-4 space-y-5">

        {/* ══════════════ HEADER ══════════════ */}
        <motion.div
          initial={{ opacity: 0, y: -18 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45 }}
          className="app-panel p-5"
        >
          <div className="flex flex-col xl:flex-row xl:items-start xl:justify-between gap-5">

            {/* Identity */}
            <div>
              <div className="flex items-center gap-2 mb-1.5">
                <span className="h-2 w-2 rounded-full bg-red-500 pulse-live shrink-0" />
                <span className="text-[10px] font-black uppercase tracking-[0.18em]" style={{ color: 'var(--theme-text-secondary)' }}>
                  LIVE CONTROL · HERZLIYA STUDIOS · IL
                </span>
              </div>
              <h1 className="text-2xl sm:text-[1.75rem] font-black leading-tight" style={{ color: 'var(--theme-text)' }}>
                אולפני הרצליה — מערכת שליטה סמנכ״ל
              </h1>
              <p className="mt-1.5 text-base font-bold" style={{ color: 'var(--theme-accent)' }}>
                ברוך שובך, יובל מטרי
              </p>
              <div className="flex flex-wrap items-center gap-4 mt-2.5">
                <span className="flex items-center gap-1.5 text-sm" style={{ color: 'var(--theme-text-secondary)' }}>
                  <Calendar className="w-3.5 h-3.5 shrink-0" />{dateStr}
                </span>
                <span
                  className="flex items-center gap-1.5 font-mono font-black text-lg tabular-nums"
                  style={{ color: 'var(--theme-text)' }}
                >
                  <Clock className="w-4 h-4 shrink-0" style={{ color: 'var(--theme-accent)' }} />
                  {timeStr}
                </span>
              </div>
            </div>

            {/* Report generator */}
            <div className="app-card p-4 xl:min-w-[340px] shrink-0">
              <div className="flex items-center gap-2 mb-3">
                <FileText className="w-4 h-4 shrink-0" style={{ color: 'var(--theme-accent)' }} />
                <span className="text-sm font-black" style={{ color: 'var(--theme-text)' }}>מחולל דוחות מנהלים</span>
              </div>
              <div className="grid grid-cols-2 gap-2 mb-3">
                <div className="flex flex-col gap-0.5">
                  <label className="text-[10px] font-bold" style={{ color: 'var(--theme-text-secondary)' }}>מתאריך</label>
                  <input
                    type="date"
                    value={reportFrom}
                    onChange={e => { setReportFrom(e.target.value); setReportReady(false); }}
                    className="rounded-lg px-2 py-1.5 text-sm border outline-none focus:ring-1"
                    style={{ background: 'var(--theme-bg)', borderColor: 'var(--theme-border)', color: 'var(--theme-text)' }}
                  />
                </div>
                <div className="flex flex-col gap-0.5">
                  <label className="text-[10px] font-bold" style={{ color: 'var(--theme-text-secondary)' }}>עד תאריך</label>
                  <input
                    type="date"
                    value={reportTo}
                    onChange={e => { setReportTo(e.target.value); setReportReady(false); }}
                    className="rounded-lg px-2 py-1.5 text-sm border outline-none focus:ring-1"
                    style={{ background: 'var(--theme-bg)', borderColor: 'var(--theme-border)', color: 'var(--theme-text)' }}
                  />
                </div>
              </div>
              <button
                type="button"
                onClick={handleGenerate}
                disabled={generating}
                className="w-full py-2.5 rounded-xl font-black text-sm flex items-center justify-center gap-2 transition-all duration-300 disabled:opacity-70"
                style={{
                  background: reportReady
                    ? 'rgba(34,197,94,0.18)'
                    : 'linear-gradient(135deg, var(--brand-grad-start), var(--brand-grad-mid))',
                  color: reportReady ? '#86efac' : '#fff',
                  boxShadow: reportReady ? 'none' : '0 4px 18px rgba(200,78,62,0.35)',
                }}
              >
                {generating ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    שולף נתונים ומחשב...
                  </>
                ) : reportReady ? (
                  <><CheckCircle className="w-4 h-4" /> הדוח מוכן — לחץ להורדה</>
                ) : (
                  <><Download className="w-4 h-4" /> הפק דוח פעילות כולל</>
                )}
              </button>
            </div>
          </div>
        </motion.div>

        {/* ══════════════ DEPARTMENT TABS ══════════════ */}
        <div className="overflow-x-auto pb-0.5 -mx-1 px-1">
          <div className="flex gap-1.5 min-w-max">
            {TABS.map(tab => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className="px-4 py-2 rounded-xl text-sm font-bold whitespace-nowrap transition-all duration-200"
                style={{
                  background: activeTab === tab.id
                    ? 'linear-gradient(135deg, var(--brand-grad-start), var(--brand-grad-mid))'
                    : 'var(--theme-bg-card)',
                  color: activeTab === tab.id ? '#fff' : 'var(--theme-text-secondary)',
                  border: `1px solid ${activeTab === tab.id ? 'transparent' : 'var(--theme-border)'}`,
                  boxShadow: activeTab === tab.id ? '0 4px 14px rgba(200,78,62,0.30)' : 'none',
                }}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {/* ══════════════ TAB CONTENT ══════════════ */}
        <AnimatePresence mode="wait">
          {activeTab === 'overview' ? (
            <motion.div
              key="overview"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.28 }}
              className="space-y-5"
            >

              {/* ── KPI Row ── */}
              <div className="grid grid-cols-2 xl:grid-cols-4 gap-3">
                <KpiCard
                  icon={Monitor}
                  label="אולפנים פעילים"
                  value={<>6<span className="text-lg font-normal opacity-50">/8</span></>}
                  sub="2 אולפנים במסלול Yield פתוח"
                  accent="#22c55e"
                  borderAccent="rgba(34,197,94,0.35)"
                  live
                />
                <KpiCard
                  icon={Truck}
                  label="ניידות שידור"
                  value={<>2<span className="text-lg font-normal opacity-50">/2</span></>}
                  sub={<><div>ניידת 1: נווה אילן</div><div>ניידת 2: בלומפילד</div></>}
                  accent="#38bdf8"
                  borderAccent="rgba(56,189,248,0.35)"
                  live
                />
                <KpiCard
                  icon={AlertTriangle}
                  label="התרעות כח אדם"
                  value="2 חריגות"
                  sub="צוות תאורה אולפן 4 — חריגת שעות נוספות"
                  accent="#f59e0b"
                  borderAccent="rgba(245,158,11,0.40)"
                  live
                />
                <KpiCard
                  icon={Server}
                  label="שרתים ותקשורת"
                  value="99.9%"
                  sub={
                    <span className="flex items-center gap-1">
                      <Wifi className="w-3 h-3 shrink-0" />כל המערכות תקינות
                    </span>
                  }
                  accent="#22c55e"
                  borderAccent="rgba(34,197,94,0.28)"
                />
              </div>

              {/* ── Studio Yield Gantt ── */}
              <div className="app-panel p-5">
                <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
                  <div className="flex items-center gap-2">
                    <Layers className="w-5 h-5 shrink-0" style={{ color: 'var(--theme-accent)' }} />
                    <h2 className="text-[15px] font-black" style={{ color: 'var(--theme-text)' }}>
                      לוח תפוסה ותמחור דינמי — Studio Yield Gantt
                    </h2>
                  </div>
                  <div className="flex flex-wrap items-center gap-3">
                    {(Object.entries(BLOCK_CFG) as [BlockType, typeof BLOCK_CFG[BlockType]][]).map(([type, c]) => (
                      <div key={type} className="flex items-center gap-1.5">
                        <div className="w-3 h-3 rounded-sm border shrink-0" style={{ background: c.bg, borderColor: c.border }} />
                        <span className="text-[11px] font-semibold" style={{ color: 'var(--theme-text-secondary)' }}>{c.legend}</span>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="overflow-x-auto">
                  <div className="min-w-[680px]">
                    {/* Hour axis */}
                    <div className="relative h-6 mr-[88px] mb-1">
                      {hourMarkers.map(h => (
                        <div
                          key={h}
                          className="absolute -translate-x-1/2 text-[10px] font-mono font-bold"
                          style={{ left: pct(h), color: 'var(--theme-text-secondary)' }}
                        >
                          {pad(h)}:00
                        </div>
                      ))}
                    </div>

                    {/* Studio rows */}
                    {GANTT_ROWS.map(studio => (
                      <div key={studio.id} className="flex items-center mb-2 gap-2">
                        <div
                          className="w-[88px] shrink-0 text-xs font-black text-right"
                          style={{ color: 'var(--theme-text)' }}
                        >
                          {studio.name}
                        </div>
                        <div
                          className="flex-1 relative rounded-lg overflow-hidden"
                          style={{
                            height: 46,
                            background: 'rgba(255,255,255,0.025)',
                            border: '1px solid var(--theme-border)',
                          }}
                        >
                          {/* Grid lines */}
                          {hourMarkers.map(h => (
                            <div
                              key={h}
                              className="absolute inset-y-0 border-r"
                              style={{ left: pct(h), borderColor: 'rgba(255,255,255,0.06)' }}
                            />
                          ))}
                          {/* Blocks */}
                          {studio.blocks.map((block, bi) => {
                            const c = BLOCK_CFG[block.type];
                            return (
                              <div
                                key={bi}
                                className="absolute inset-y-1 rounded flex items-center px-1.5 overflow-hidden"
                                style={{
                                  left: pct(block.start),
                                  width: widthPct(block.start, block.end),
                                  background: c.bg,
                                  border: `1px solid ${c.border}`,
                                }}
                                title={`${block.label}${block.client ? ` — ${block.client}` : ''} (${pad(block.start)}:00–${pad(block.end)}:00)`}
                              >
                                <span className="text-[9px] font-bold leading-tight truncate" style={{ color: c.text }}>
                                  {block.label}
                                  {block.client && <span className="opacity-60"> · {block.client}</span>}
                                </span>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* ── Operations Cost Table ── */}
              <div className="app-panel p-5">
                <div className="flex items-center gap-2 mb-4">
                  <BarChart3 className="w-5 h-5 shrink-0" style={{ color: 'var(--theme-accent)' }} />
                  <h2 className="text-[15px] font-black" style={{ color: 'var(--theme-text)' }}>
                    עלויות תפעול בזמן אמת — Floor Price Calculator
                  </h2>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full min-w-[700px] text-sm border-separate border-spacing-0">
                    <thead>
                      <tr style={{ borderBottom: '1px solid var(--theme-border)' }}>
                        {[
                          'משאב',
                          'חשמל ומיזוג ₪/שעה',
                          'פחת ובלאי ₪/שעה',
                          'ארנונה ותקורות ₪/שעה',
                          'עלות צוות בסיס ₪/שעה',
                          'Floor Price ₪/שעה',
                        ].map(h => (
                          <th
                            key={h}
                            className="py-2 px-3 text-right text-[10px] font-black uppercase tracking-wide pb-3"
                            style={{ color: 'var(--theme-text-secondary)', borderBottom: '1px solid var(--theme-border)' }}
                          >
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {costEnriched.map(row => (
                        <tr
                          key={row.resource}
                          className="group transition-colors hover:bg-white/[0.025]"
                        >
                          <td className="py-2.5 px-3 font-bold" style={{ color: 'var(--theme-text)', borderBottom: '1px solid var(--theme-border)' }}>
                            <div className="flex items-center gap-1.5">
                              {row.kind === 'van'
                                ? <Truck className="w-3.5 h-3.5 opacity-50 shrink-0" />
                                : <Monitor className="w-3.5 h-3.5 opacity-50 shrink-0" />
                              }
                              {row.resource}
                            </div>
                          </td>
                          {[row.electricity, row.depreciation, row.overhead, row.staffBase].map((val, i) => (
                            <td
                              key={i}
                              className="py-2.5 px-3 font-mono text-sm"
                              style={{ color: 'var(--theme-text-secondary)', borderBottom: '1px solid var(--theme-border)' }}
                            >
                              ₪{money(val)}
                            </td>
                          ))}
                          <td
                            className="py-2.5 px-3"
                            style={{ borderBottom: '1px solid var(--theme-border)' }}
                          >
                            <span
                              className="inline-block font-black font-mono text-sm px-2.5 py-1 rounded-lg"
                              style={{ background: 'rgba(224,122,95,0.16)', color: 'var(--theme-accent)' }}
                            >
                              ₪{money(row.total)}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr>
                        <td
                          className="py-3 px-3 font-black text-sm"
                          style={{ color: 'var(--theme-text)', borderTop: '2px solid var(--theme-accent)' }}
                        >
                          סה״כ תפעול שוטף
                        </td>
                        {[colSums.electricity, colSums.depreciation, colSums.overhead, colSums.staffBase].map((v, i) => (
                          <td
                            key={i}
                            className="py-3 px-3 font-mono text-xs"
                            style={{ color: 'var(--theme-text-secondary)', borderTop: '2px solid var(--theme-accent)' }}
                          >
                            ₪{money(v)}
                          </td>
                        ))}
                        <td
                          className="py-3 px-3"
                          style={{ borderTop: '2px solid var(--theme-accent)' }}
                        >
                          <span
                            className="inline-block font-black font-mono text-base px-3 py-1.5 rounded-xl"
                            style={{
                              background: 'linear-gradient(135deg, var(--brand-grad-start), var(--brand-grad-mid))',
                              color: '#fff',
                              boxShadow: '0 4px 16px rgba(200,78,62,0.30)',
                            }}
                          >
                            ₪{money(colSums.total)}
                          </span>
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </div>

              {/* ── Split View ── */}
              <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">

                {/* Smart Alerts — right */}
                <div className="app-panel p-5">
                  <div className="flex items-center gap-2 mb-4">
                    <Bell className="w-5 h-5 shrink-0" style={{ color: 'var(--theme-accent)' }} />
                    <h2 className="text-[15px] font-black" style={{ color: 'var(--theme-text)' }}>
                      התרעות מערכת חכמות
                    </h2>
                    <span
                      className="mr-auto text-[10px] font-black px-2 py-0.5 rounded-full"
                      style={{ background: 'rgba(239,68,68,0.14)', color: '#fca5a5' }}
                    >
                      {ALERTS.length} פעילות
                    </span>
                  </div>
                  <div className="space-y-3">
                    {ALERTS.map(alert => {
                      const cfg = {
                        critical:    { bg: 'rgba(239,68,68,0.10)',  border: 'rgba(239,68,68,0.32)',  Icon: AlertCircle,  iconColor: '#fca5a5', badge: 'דחוף',     badgeBg: 'rgba(239,68,68,0.16)',  badgeColor: '#fca5a5' },
                        warning:     { bg: 'rgba(245,158,11,0.09)', border: 'rgba(245,158,11,0.32)', Icon: AlertTriangle,iconColor: '#fcd34d', badge: 'אזהרה',    badgeBg: 'rgba(245,158,11,0.16)', badgeColor: '#fcd34d' },
                        opportunity: { bg: 'rgba(34,197,94,0.08)',  border: 'rgba(34,197,94,0.28)',  Icon: TrendingUp,   iconColor: '#86efac', badge: 'הזדמנות', badgeBg: 'rgba(34,197,94,0.16)',  badgeColor: '#86efac' },
                      }[alert.severity];
                      const { Icon: Ic } = cfg;
                      return (
                        <div
                          key={alert.id}
                          className="rounded-2xl p-3.5 border"
                          style={{ background: cfg.bg, borderColor: cfg.border }}
                        >
                          <div className="flex items-start gap-2.5">
                            <Ic className="w-4 h-4 mt-0.5 shrink-0" style={{ color: cfg.iconColor }} />
                            <div className="flex-1 min-w-0">
                              <div className="flex flex-wrap items-center gap-2 mb-1.5">
                                <span className="font-black text-sm" style={{ color: 'var(--theme-text)' }}>{alert.title}</span>
                                <span
                                  className="text-[10px] font-bold px-1.5 py-0.5 rounded-full"
                                  style={{ background: cfg.badgeBg, color: cfg.badgeColor }}
                                >
                                  {cfg.badge}
                                </span>
                                <span
                                  className="mr-auto font-mono text-[10px]"
                                  style={{ color: 'var(--theme-text-secondary)' }}
                                >
                                  {alert.time}
                                </span>
                              </div>
                              <p className="text-xs leading-relaxed" style={{ color: 'var(--theme-text-secondary)' }}>
                                {alert.body}
                              </p>
                              {alert.severity === 'opportunity' && (
                                <button
                                  type="button"
                                  className="mt-2.5 text-xs font-bold px-3 py-1.5 rounded-lg transition-colors"
                                  style={{ background: 'rgba(34,197,94,0.14)', color: '#86efac' }}
                                >
                                  ← צור קמפיין Yield
                                </button>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Sub-rent / Suppliers — left */}
                <div className="app-panel p-5">
                  <div className="flex items-center gap-2 mb-4">
                    <Package className="w-5 h-5 shrink-0" style={{ color: 'var(--theme-accent)' }} />
                    <h2 className="text-[15px] font-black" style={{ color: 'var(--theme-text)' }}>
                      השכרות וספקי חוץ פעילים
                    </h2>
                    <span
                      className="mr-auto text-[10px] font-black px-2 py-0.5 rounded-full"
                      style={{ background: 'rgba(56,189,248,0.14)', color: '#7dd3fc' }}
                    >
                      {SUBRENT_ROWS.length} פריטים
                    </span>
                  </div>

                  <div className="space-y-2.5">
                    {SUBRENT_ROWS.map(row => (
                      <div
                        key={row.id}
                        className="rounded-2xl p-3.5 border"
                        style={{ background: 'rgba(255,255,255,0.03)', borderColor: 'var(--theme-border)' }}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0 flex-1">
                            <div
                              className="font-black text-sm truncate"
                              style={{ color: 'var(--theme-text)' }}
                            >
                              {row.itemType}
                            </div>
                            <div className="mt-1 space-y-0.5">
                              <div className="text-xs" style={{ color: 'var(--theme-text-secondary)' }}>
                                <span className="font-semibold">לקוח:</span> {row.client}
                              </div>
                              <div className="text-xs" style={{ color: 'var(--theme-text-secondary)' }}>
                                <span className="font-semibold">ספק:</span> {row.supplier}
                                <span className="mx-1.5 opacity-40">·</span>
                                <span className="font-semibold">מיקום:</span> {row.location}
                              </div>
                            </div>
                          </div>
                          <div className="shrink-0 text-right">
                            <div className="font-black font-mono text-base" style={{ color: 'var(--theme-accent)' }}>
                              ₪{money(row.dailyCost)}
                            </div>
                            <div className="text-[10px] mb-1" style={{ color: 'var(--theme-text-secondary)' }}>ליום</div>
                            <span
                              className="text-[10px] font-bold px-2 py-0.5 rounded-full"
                              style={{
                                background: row.status === 'פעיל' ? 'rgba(34,197,94,0.15)' : 'rgba(245,158,11,0.15)',
                                color:      row.status === 'פעיל' ? '#86efac'               : '#fcd34d',
                              }}
                            >
                              {row.status}
                            </span>
                          </div>
                        </div>
                      </div>
                    ))}

                    {/* Subtotal */}
                    <div
                      className="rounded-2xl p-3.5 border-2 flex items-center justify-between"
                      style={{ borderColor: 'var(--theme-accent)', background: 'rgba(224,122,95,0.07)' }}
                    >
                      <span className="font-black text-sm" style={{ color: 'var(--theme-text)' }}>
                        סה״כ עלות השכרות חוץ יומית
                      </span>
                      <span
                        className="font-black font-mono text-base px-3 py-1.5 rounded-xl"
                        style={{
                          background: 'linear-gradient(135deg, var(--brand-grad-start), var(--brand-grad-mid))',
                          color: '#fff',
                          boxShadow: '0 4px 16px rgba(200,78,62,0.25)',
                        }}
                      >
                        ₪{money(subrentTotal)}
                      </span>
                    </div>
                  </div>
                </div>
              </div>

            </motion.div>
          ) : (
            /* ── Placeholder for non-overview tabs ── */
            <motion.div
              key={activeTab}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.25 }}
              className="app-panel p-16 flex flex-col items-center justify-center gap-4 text-center"
            >
              <div
                className="w-16 h-16 rounded-2xl flex items-center justify-center"
                style={{ background: 'var(--theme-bg-card)', border: '1px solid var(--theme-border)' }}
              >
                <Layers className="w-7 h-7" style={{ color: 'var(--theme-accent)' }} />
              </div>
              <p className="text-lg font-black" style={{ color: 'var(--theme-text)' }}>
                {TABS.find(t => t.id === activeTab)?.label}
              </p>
              <p className="text-sm max-w-xs" style={{ color: 'var(--theme-text-secondary)' }}>
                מודול זה יהיה זמין בגרסה הבאה — מוכן לפי לוח הפיתוח המוסכם
              </p>
            </motion.div>
          )}
        </AnimatePresence>

      </div>
    </div>
  );
}
