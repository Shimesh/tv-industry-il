'use client';

import { useState, useEffect, type ElementType, type ReactNode } from 'react';
import {
  AlertCircle, AlertTriangle, BarChart3, Bell, Calendar,
  CheckCircle, Clock, Download, FileText, Layers,
  Monitor, Package, Server, Sparkles, TrendingUp, Truck, Wifi,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

// ─── Types ────────────────────────────────────────────────────────────────────

type BlockType = 'live' | 'setup' | 'free' | 'maintenance';

interface GanttBlock { label: string; start: number; end: number; type: BlockType; client?: string; }
interface StudioRow  { id: string; name: string; blocks: GanttBlock[]; }
interface CostRow    { resource: string; kind: 'studio' | 'van'; electricity: number; depreciation: number; overhead: number; staffBase: number; }
interface AlertItem  { id: string; severity: 'critical' | 'warning' | 'opportunity'; title: string; body: string; time: string; }
interface SubRentRow { id: string; itemType: string; client: string; supplier: string; dailyCost: number; status: 'פעיל' | 'ממתין לאיסוף'; location: string; }

// ─── Mock Data ────────────────────────────────────────────────────────────────

const GANTT_ROWS: StudioRow[] = [
  {
    id: 's1', name: 'אולפן 1',
    blocks: [
      { label: 'תוכנית בוקר — חדשות 12', start: 6,  end: 10, type: 'live',        client: 'רשת 13'    },
      { label: 'פירוק והקמה',             start: 10, end: 12, type: 'setup'                            },
      { label: 'ריאליטי — "האח הגדול"',   start: 12, end: 18, type: 'live',        client: 'קשת 12'    },
      { label: 'פירוק',                   start: 18, end: 19, type: 'setup'                            },
      { label: 'חדשות ערב',               start: 19, end: 22, type: 'live',        client: 'ערוץ 11'   },
    ],
  },
  {
    id: 's2', name: 'אולפן 2',
    blocks: [
      { label: 'ארץ נהדרת ג\'וניור',      start: 8,  end: 11, type: 'live',        client: 'כאן ילדים' },
      { label: 'הקמה',                    start: 11, end: 13, type: 'setup'                            },
      { label: 'פנוי — זמין להשכרה',      start: 13, end: 17, type: 'free'                             },
      { label: 'פריים טיים — ארץ נהדרת',  start: 17, end: 22, type: 'live',        client: 'כאן 11'    },
    ],
  },
  {
    id: 's4', name: 'אולפן 4',
    blocks: [
      { label: 'מגזין בוקר',              start: 7,  end: 11, type: 'live',        client: 'רשת'       },
      { label: 'תחזוקה מתוכננת',          start: 11, end: 14, type: 'maintenance'                      },
      { label: 'הקמה — שעשועון',          start: 14, end: 16, type: 'setup'                            },
      { label: 'שעשועון פריים טיים',      start: 20, end: 23, type: 'live',        client: 'קשת 12'    },
    ],
  },
  {
    id: 's8', name: 'אולפן 8',
    blocks: [
      { label: 'סדרת דוקומנטרי',          start: 9,  end: 15, type: 'live',        client: 'הוט'        },
      { label: 'פירוק והקמה',             start: 15, end: 17, type: 'setup'                            },
      { label: 'הכנה לשידור חי',          start: 17, end: 19, type: 'setup'                            },
      { label: 'הופעה חיה — לייב',        start: 19, end: 23, type: 'live',        client: 'Yes'        },
    ],
  },
];

const COST_ROWS: CostRow[] = [
  { resource: 'אולפן 1',       kind: 'studio', electricity: 85,  depreciation: 320, overhead: 145, staffBase: 480 },
  { resource: 'אולפן 2',       kind: 'studio', electricity: 78,  depreciation: 290, overhead: 145, staffBase: 480 },
  { resource: 'אולפן 4',       kind: 'studio', electricity: 110, depreciation: 380, overhead: 145, staffBase: 560 },
  { resource: 'אולפן 8',       kind: 'studio', electricity: 95,  depreciation: 310, overhead: 145, staffBase: 510 },
  { resource: 'ניידת שידור 1', kind: 'van',    electricity: 140, depreciation: 650, overhead: 210, staffBase: 720 },
  { resource: 'ניידת שידור 2', kind: 'van',    electricity: 135, depreciation: 620, overhead: 210, staffBase: 720 },
];

const ALERTS: AlertItem[] = [
  {
    id: 'a1', severity: 'critical',
    title: 'חריגת שעות נוספות',
    body: 'צוות תאורה אולפן 4 — חריגה של 18% מתקציב שע"נ חודשי. נדרש אישור מנהל בכיר.',
    time: '13:15',
  },
  {
    id: 'a2', severity: 'warning',
    title: 'כיול עדשה נדרש',
    body: 'מצלמת מס׳ 3 (אולפן 4) דורשת כיול עדשה. מומלץ לבצע תחזוקה לפני משמרת הערב בשעה 20:00.',
    time: '14:32',
  },
  {
    id: 'a3', severity: 'opportunity',
    title: 'הזדמנות Yield — אולפן 2',
    body: 'אולפן 2 פנוי מחר 10:00–16:00 (6 שעות). ניתן לייצר קמפיין מחיר מופחת ללקוחות מאגר.',
    time: '12:00',
  },
];

const SUBRENT_ROWS: SubRentRow[] = [
  { id: 'r1', itemType: 'עדשת פוג׳ינון 99x',    client: 'הפקת ריאליטי — "האי"', supplier: 'אוטופיה',   dailyCost: 2500, status: 'פעיל',          location: 'ניידת שידור 1' },
  { id: 'r2', itemType: 'מערכת אינטרקום RTS',    client: 'ידיעות טלוויזיה',      supplier: 'אודיו-ויז', dailyCost: 850,  status: 'פעיל',          location: 'אולפן 4'       },
  { id: 'r3', itemType: 'ריגינג וטרוס תאורה',    client: 'הופעות ישיר',           supplier: 'טרוס-טק',   dailyCost: 3200, status: 'ממתין לאיסוף', location: 'אולפן 1'       },
  { id: 'r4', itemType: 'משדר טלמטרי 5G',        client: 'ספורט 1',               supplier: 'בזק',       dailyCost: 1100, status: 'פעיל',          location: 'ניידת שידור 2' },
];

const TABS = [
  { id: 'overview',   label: 'תצוגה כוללת'     },
  { id: 'accounting', label: 'הנהלת חשבונות'   },
  { id: 'crew',       label: 'מבצעים וכח אדם'  },
  { id: 'studios',    label: 'אולפנים'          },
  { id: 'vans',       label: 'ניידות שידור'     },
  { id: 'suppliers',  label: 'ספקים'            },
  { id: 'equipment',  label: 'ציוד ומחסן'       },
];

// ─── Gantt config ─────────────────────────────────────────────────────────────

const G_START = 6;
const G_END   = 24;
const G_SPAN  = G_END - G_START;

const BLOCK_CFG: Record<BlockType, { bg: string; border: string; text: string; legend: string }> = {
  live:        { bg: 'rgba(239,68,68,0.20)',   border: 'rgba(239,68,68,0.55)',   text: '#fca5a5', legend: 'בשידור / צילום'  },
  setup:       { bg: 'rgba(245,158,11,0.17)',  border: 'rgba(245,158,11,0.50)',  text: '#fcd34d', legend: 'הקמה / פירוק'   },
  free:        { bg: 'rgba(34,197,94,0.12)',   border: 'rgba(34,197,94,0.36)',   text: '#86efac', legend: 'פנוי'            },
  maintenance: { bg: 'rgba(100,116,139,0.22)', border: 'rgba(100,116,139,0.50)', text: '#94a3b8', legend: 'תחזוקה'          },
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function pct(h: number) { return `${Math.max(0, Math.min(100, (h - G_START) / G_SPAN * 100))}%`; }
function wPct(s: number, e: number) { return `${Math.max(0, (Math.min(e, G_END) - Math.max(s, G_START)) / G_SPAN * 100)}%`; }
function money(n: number) { return n.toLocaleString('he-IL'); }
function pad2(n: number)  { return String(n).padStart(2, '0'); }

// ─── Sub-components ───────────────────────────────────────────────────────────

function KpiCard({
  icon: Icon, label, value, sub, color, live = false,
}: {
  icon: ElementType; label: string; value: ReactNode; sub?: ReactNode; color: string; live?: boolean;
}) {
  return (
    <div
      className="card-glow relative overflow-hidden rounded-2xl p-5 flex flex-col gap-3"
      style={{ background: 'var(--theme-bg-card)', border: '1px solid var(--theme-border)' }}
    >
      {/* Top accent bar */}
      <div className="absolute inset-x-0 top-0 h-[2px] rounded-t-2xl"
        style={{ background: `linear-gradient(to left, transparent, ${color}aa, transparent)` }} />

      <div className="flex items-start justify-between">
        <div className="rounded-xl p-2.5" style={{ background: `${color}15`, border: `1px solid ${color}25` }}>
          <Icon className="w-4 h-4" style={{ color }} />
        </div>
        {live && (
          <span className="relative flex h-2 w-2 mt-1">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full opacity-70" style={{ background: color }} />
            <span className="relative inline-flex h-2 w-2 rounded-full" style={{ background: color }} />
          </span>
        )}
      </div>

      <div className="text-[2.4rem] font-black leading-none gradient-text">{value}</div>

      <div>
        <div className="text-[10px] font-black uppercase tracking-widest mb-1"
          style={{ color: 'var(--theme-text-secondary)' }}>{label}</div>
        {sub && <div className="text-[11px] leading-snug" style={{ color: 'var(--theme-text-secondary)' }}>{sub}</div>}
      </div>
    </div>
  );
}

function SectionTitle({ icon: Icon, title, badge }: { icon: ElementType; title: string; badge?: ReactNode }) {
  return (
    <div className="flex items-center gap-3 mb-5">
      <div className="rounded-xl p-2 shrink-0"
        style={{ background: 'rgba(224,122,95,0.12)', border: '1px solid rgba(224,122,95,0.22)' }}>
        <Icon className="w-4 h-4" style={{ color: 'var(--theme-accent)' }} />
      </div>
      <h2 className="text-[15px] font-black" style={{ color: 'var(--theme-text)' }}>{title}</h2>
      {badge && <div className="mr-auto">{badge}</div>}
    </div>
  );
}

function LiveDot() {
  return (
    <span className="relative flex h-2 w-2">
      <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-400 opacity-70" />
      <span className="relative inline-flex h-2 w-2 rounded-full bg-red-400" />
    </span>
  );
}

// ─── Framer motion variants ───────────────────────────────────────────────────

const stagger = {
  hidden: {},
  show: { transition: { staggerChildren: 0.07 } },
} as const;
const fadeUp = {
  hidden: { opacity: 0, y: 20 },
  show:   { opacity: 1, y: 0, transition: { duration: 0.38, ease: 'easeOut' as const } },
} as const;

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function VipYuvalMatari() {
  const [now, setNow]                 = useState(() => new Date());
  const [activeTab, setActiveTab]     = useState('overview');
  const [reportFrom, setReportFrom]   = useState('');
  const [reportTo, setReportTo]       = useState('');
  const [generating, setGenerating]   = useState(false);
  const [reportReady, setReportReady] = useState(false);

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  const timeStr = now.toLocaleTimeString('he-IL',   { timeZone: 'Asia/Jerusalem', hour: '2-digit', minute: '2-digit', second: '2-digit' });
  const dateStr = now.toLocaleDateString('he-IL',   { timeZone: 'Asia/Jerusalem', weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

  const nowH = now.getHours() + now.getMinutes() / 60;

  function handleGenerate() {
    if (generating) return;
    setGenerating(true);
    setReportReady(false);
    setTimeout(() => { setGenerating(false); setReportReady(true); }, 2400);
  }

  const hourMarkers = Array.from({ length: G_SPAN / 2 + 1 }, (_, i) => G_START + i * 2);

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
    <div dir="rtl">

      {/* ══════════════ HERO ══════════════ */}
      <header className="app-hero">
        <div className="relative z-10 max-w-[1440px] mx-auto px-4 sm:px-6 py-12 sm:py-16">
          <motion.div
            initial={{ opacity: 0, y: -16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, ease: 'easeOut' }}
          >
            {/* Live badge — same pattern as home page */}
            <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-amber-400/25 bg-amber-400/10 px-4 py-1.5 text-xs font-black tracking-wide text-amber-200 shadow-[0_0_24px_rgba(251,191,36,0.14)]">
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-amber-400 opacity-75" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-amber-400" />
              </span>
              <Sparkles className="h-3.5 w-3.5 text-amber-400" />
              LIVE · מרכז שליטה · אולפני הרצליה
            </div>

            {/* Greeting + name */}
            <p className="text-base font-semibold mb-1" style={{ color: 'var(--theme-text-secondary)' }}>ברוך שובך,</p>
            <h1 className="text-5xl sm:text-6xl lg:text-7xl font-black leading-tight mb-3">
              <span className="gradient-text">יובל מטרי</span>
            </h1>
            <p className="text-base sm:text-lg font-semibold mb-8" style={{ color: 'var(--theme-text-secondary)' }}>
              סמנכ״ל תפעול ושירותים · אולפני הרצליה
            </p>

            {/* Date & clock row */}
            <div className="flex flex-wrap items-center gap-6">
              <span className="flex items-center gap-2 text-sm" style={{ color: 'var(--theme-text-secondary)' }}>
                <Calendar className="w-4 h-4 shrink-0" />
                {dateStr}
              </span>
              <span className="flex items-center gap-2.5">
                <Clock className="w-4 h-4 shrink-0" style={{ color: 'var(--theme-accent)' }} />
                <span className="font-mono font-black text-2xl tabular-nums" style={{ color: 'var(--theme-text)' }}>
                  {timeStr}
                </span>
              </span>
              <LiveDot />
              <span className="text-xs font-bold" style={{ color: 'var(--theme-text-secondary)' }}>שידור חי</span>
            </div>
          </motion.div>
        </div>
      </header>

      {/* ══════════════ BODY ══════════════ */}
      <div className="max-w-[1440px] mx-auto px-4 sm:px-6 pb-16 space-y-5">

        {/* ── Report generator bar ── */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.18, duration: 0.38 }}
          className="app-panel p-4"
        >
          <div className="flex flex-wrap items-end gap-3">
            <div className="flex items-center gap-2 shrink-0">
              <FileText className="w-4 h-4 shrink-0" style={{ color: 'var(--theme-accent)' }} />
              <span className="text-sm font-black" style={{ color: 'var(--theme-text)' }}>הפקת דוח פעילות</span>
            </div>
            <div className="flex flex-wrap items-end gap-2">
              <div className="flex flex-col gap-0.5">
                <label className="text-[10px] font-bold" style={{ color: 'var(--theme-text-secondary)' }}>מתאריך</label>
                <input type="date" value={reportFrom}
                  onChange={e => { setReportFrom(e.target.value); setReportReady(false); }}
                  className="rounded-lg px-3 py-1.5 text-sm border outline-none"
                  style={{ background: 'var(--theme-bg)', borderColor: 'var(--theme-border)', color: 'var(--theme-text)' }} />
              </div>
              <div className="flex flex-col gap-0.5">
                <label className="text-[10px] font-bold" style={{ color: 'var(--theme-text-secondary)' }}>עד תאריך</label>
                <input type="date" value={reportTo}
                  onChange={e => { setReportTo(e.target.value); setReportReady(false); }}
                  className="rounded-lg px-3 py-1.5 text-sm border outline-none"
                  style={{ background: 'var(--theme-bg)', borderColor: 'var(--theme-border)', color: 'var(--theme-text)' }} />
              </div>
              <button type="button" onClick={handleGenerate} disabled={generating}
                className="h-[34px] px-5 rounded-xl font-black text-sm flex items-center gap-2 transition-all disabled:opacity-70"
                style={{
                  background: reportReady
                    ? 'rgba(34,197,94,0.18)'
                    : 'linear-gradient(135deg, var(--brand-grad-start), var(--brand-grad-mid))',
                  color: reportReady ? '#86efac' : '#fff',
                  boxShadow: reportReady ? 'none' : '0 4px 14px rgba(200,78,62,0.28)',
                }}>
                {generating
                  ? <><div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />מחשב...</>
                  : reportReady
                    ? <><CheckCircle className="w-3.5 h-3.5" />מוכן להורדה</>
                    : <><Download className="w-3.5 h-3.5" />הפק דוח</>}
              </button>
            </div>
          </div>
        </motion.div>

        {/* ── Tabs ── */}
        <div className="overflow-x-auto pb-0.5 -mx-1 px-1">
          <div className="flex gap-1.5 min-w-max">
            {TABS.map(tab => (
              <button key={tab.id} type="button" onClick={() => setActiveTab(tab.id)}
                className="px-4 py-2 rounded-xl text-sm font-bold whitespace-nowrap transition-all duration-200"
                style={{
                  background: activeTab === tab.id
                    ? 'linear-gradient(135deg, var(--brand-grad-start), var(--brand-grad-mid))'
                    : 'var(--theme-bg-card)',
                  color: activeTab === tab.id ? '#fff' : 'var(--theme-text-secondary)',
                  border: `1px solid ${activeTab === tab.id ? 'transparent' : 'var(--theme-border)'}`,
                  boxShadow: activeTab === tab.id ? '0 4px 14px rgba(200,78,62,0.26)' : 'none',
                }}>
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {/* ── Tab content ── */}
        <AnimatePresence mode="wait">
          {activeTab === 'overview' ? (
            <motion.div key="overview" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.22 }} className="space-y-5">

              {/* KPI cards */}
              <motion.div className="grid grid-cols-2 xl:grid-cols-4 gap-4" variants={stagger} initial="hidden" animate="show">
                <motion.div variants={fadeUp}>
                  <KpiCard icon={Monitor} label="אולפנים פעילים"
                    value={<>6<span className="text-2xl font-normal opacity-35">/8</span></>}
                    sub="2 אולפנים פתוחים ל-Yield" color="#22c55e" live />
                </motion.div>
                <motion.div variants={fadeUp}>
                  <KpiCard icon={Truck} label="ניידות שידור"
                    value={<>2<span className="text-2xl font-normal opacity-35">/2</span></>}
                    sub={<><div>ניידת 1: נווה אילן</div><div>ניידת 2: בלומפילד</div></>} color="#38bdf8" live />
                </motion.div>
                <motion.div variants={fadeUp}>
                  <KpiCard icon={AlertTriangle} label="התרעות כח אדם"
                    value="2"
                    sub="חריגת שעות — צוות תאורה אולפן 4" color="#f59e0b" live />
                </motion.div>
                <motion.div variants={fadeUp}>
                  <KpiCard icon={Server} label="שרתים ותקשורת"
                    value="99.9%"
                    sub={<span className="flex items-center gap-1"><Wifi className="w-3 h-3 shrink-0" />כל המערכות תקינות</span>} color="#22c55e" />
                </motion.div>
              </motion.div>

              {/* Gantt */}
              <div className="app-panel p-6">
                <SectionTitle
                  icon={Layers}
                  title="לוח תפוסה ותמחור דינמי — Studio Yield"
                  badge={
                    <div className="flex items-center gap-1.5 text-[11px] font-bold px-2.5 py-1 rounded-full"
                      style={{ background: 'rgba(239,68,68,0.12)', color: '#fca5a5' }}>
                      <LiveDot />עדכון חי
                    </div>
                  }
                />

                {/* Legend */}
                <div className="flex flex-wrap gap-4 mb-5 pb-4" style={{ borderBottom: '1px solid var(--theme-border)' }}>
                  {(Object.entries(BLOCK_CFG) as [BlockType, typeof BLOCK_CFG[BlockType]][]).map(([type, c]) => (
                    <div key={type} className="flex items-center gap-1.5">
                      <div className="w-3 h-3 rounded border" style={{ background: c.bg, borderColor: c.border }} />
                      <span className="text-xs" style={{ color: 'var(--theme-text-secondary)' }}>{c.legend}</span>
                    </div>
                  ))}
                  <div className="flex items-center gap-1.5">
                    <div className="w-0.5 h-3 rounded" style={{ background: 'rgba(239,68,68,0.85)', boxShadow: '0 0 4px rgba(239,68,68,0.6)' }} />
                    <span className="text-xs" style={{ color: 'var(--theme-text-secondary)' }}>עכשיו</span>
                  </div>
                </div>

                <div className="overflow-x-auto">
                  <div className="min-w-[680px]">
                    {/* Hour axis */}
                    <div className="relative h-5 mr-[88px] mb-2">
                      {hourMarkers.map(h => (
                        <div key={h} className="absolute -translate-x-1/2 text-[10px] font-mono font-bold"
                          style={{ left: pct(h), color: 'var(--theme-text-secondary)' }}>
                          {pad2(h)}:00
                        </div>
                      ))}
                    </div>

                    {/* Studio rows */}
                    {GANTT_ROWS.map(studio => (
                      <div key={studio.id} className="flex items-center mb-3 gap-3">
                        <div className="w-[88px] shrink-0 text-xs font-black text-right" style={{ color: 'var(--theme-text)' }}>
                          {studio.name}
                        </div>
                        <div className="flex-1 relative rounded-xl overflow-hidden"
                          style={{ height: 52, background: 'rgba(255,255,255,0.02)', border: '1px solid var(--theme-border)' }}>
                          {/* Grid lines */}
                          {hourMarkers.map(h => (
                            <div key={h} className="absolute inset-y-0 border-r"
                              style={{ left: pct(h), borderColor: 'rgba(255,255,255,0.05)' }} />
                          ))}
                          {/* Blocks */}
                          {studio.blocks.map((block, bi) => {
                            const c = BLOCK_CFG[block.type];
                            return (
                              <div key={bi}
                                className="absolute inset-y-1.5 rounded-lg flex items-center px-2 overflow-hidden"
                                style={{ left: pct(block.start), width: wPct(block.start, block.end), background: c.bg, border: `1px solid ${c.border}` }}
                                title={`${block.label}${block.client ? ` — ${block.client}` : ''} · ${pad2(block.start)}:00–${pad2(block.end)}:00`}>
                                <span className="text-[9px] font-bold leading-tight truncate" style={{ color: c.text }}>
                                  {block.label}{block.client && <span className="opacity-55"> · {block.client}</span>}
                                </span>
                              </div>
                            );
                          })}
                          {/* Current time indicator */}
                          {nowH >= G_START && nowH <= G_END && (
                            <div className="absolute inset-y-0 w-[2px] z-10 pointer-events-none"
                              style={{ left: pct(nowH), background: 'rgba(239,68,68,0.85)', boxShadow: '0 0 8px rgba(239,68,68,0.6)' }} />
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* Cost table */}
              <div className="app-panel p-6">
                <SectionTitle icon={BarChart3} title="עלויות תפעול בזמן אמת — Floor Price Calculator" />
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[700px] text-sm">
                    <thead>
                      <tr>
                        {[
                          { label: 'משאב',                 accent: false },
                          { label: 'חשמל ומיזוג ₪/שעה',   accent: false },
                          { label: 'פחת ובלאי ₪/שעה',     accent: false },
                          { label: 'ארנונה ותקורות ₪/שעה', accent: false },
                          { label: 'עלות צוות בסיס ₪/שעה', accent: false },
                          { label: 'Floor Price ₪/שעה',    accent: true  },
                        ].map(({ label, accent }) => (
                          <th key={label}
                            className="py-3 px-4 text-right text-[10px] font-black uppercase tracking-wide"
                            style={{
                              color: accent ? 'var(--theme-accent)' : 'var(--theme-text-secondary)',
                              borderBottom: `1px solid ${accent ? 'rgba(224,122,95,0.40)' : 'var(--theme-border)'}`,
                              background: accent ? 'rgba(224,122,95,0.05)' : 'transparent',
                            }}>
                            {label}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {costEnriched.map(row => (
                        <tr key={row.resource} className="hover:bg-white/[0.02] transition-colors">
                          <td className="py-3 px-4 font-bold"
                            style={{ color: 'var(--theme-text)', borderBottom: '1px solid var(--theme-border)' }}>
                            <div className="flex items-center gap-1.5">
                              {row.kind === 'van'
                                ? <Truck className="w-3.5 h-3.5 opacity-40 shrink-0" />
                                : <Monitor className="w-3.5 h-3.5 opacity-40 shrink-0" />}
                              {row.resource}
                            </div>
                          </td>
                          {[row.electricity, row.depreciation, row.overhead, row.staffBase].map((v, i) => (
                            <td key={i} className="py-3 px-4 font-mono"
                              style={{ color: 'var(--theme-text-secondary)', borderBottom: '1px solid var(--theme-border)' }}>
                              ₪{money(v)}
                            </td>
                          ))}
                          <td className="py-3 px-4"
                            style={{ background: 'rgba(224,122,95,0.04)', borderBottom: '1px solid rgba(224,122,95,0.15)' }}>
                            <span className="font-black font-mono text-sm px-2.5 py-1 rounded-lg"
                              style={{ background: 'rgba(224,122,95,0.14)', color: 'var(--theme-accent)' }}>
                              ₪{money(row.total)}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr>
                        <td className="py-4 px-4 font-black" style={{ color: 'var(--theme-text)', borderTop: '2px solid var(--theme-accent)' }}>
                          סה״כ תפעול שוטף
                        </td>
                        {[colSums.electricity, colSums.depreciation, colSums.overhead, colSums.staffBase].map((v, i) => (
                          <td key={i} className="py-4 px-4 font-mono font-bold text-xs"
                            style={{ color: 'var(--theme-text-secondary)', borderTop: '2px solid var(--theme-accent)' }}>
                            ₪{money(v)}
                          </td>
                        ))}
                        <td className="py-4 px-4" style={{ background: 'rgba(224,122,95,0.06)', borderTop: '2px solid var(--theme-accent)' }}>
                          <span className="font-black font-mono text-base px-3 py-1.5 rounded-xl"
                            style={{ background: 'linear-gradient(135deg, var(--brand-grad-start), var(--brand-grad-mid))', color: '#fff', boxShadow: '0 4px 14px rgba(200,78,62,0.28)' }}>
                            ₪{money(colSums.total)}
                          </span>
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </div>

              {/* Split view */}
              <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">

                {/* Smart Alerts */}
                <div className="app-panel p-6">
                  <SectionTitle
                    icon={Bell}
                    title="התרעות מערכת חכמות"
                    badge={
                      <span className="text-[10px] font-black px-2 py-0.5 rounded-full"
                        style={{ background: 'rgba(239,68,68,0.12)', color: '#fca5a5' }}>
                        {ALERTS.length} פעילות
                      </span>
                    }
                  />
                  <div className="space-y-3">
                    {ALERTS.map((alert, i) => {
                      const cfg = {
                        critical:    { bg: 'rgba(239,68,68,0.09)',  border: 'rgba(239,68,68,0.27)',  Icon: AlertCircle,   ic: '#fca5a5', badge: 'דחוף',    bBg: 'rgba(239,68,68,0.15)',  bC: '#fca5a5' },
                        warning:     { bg: 'rgba(245,158,11,0.09)', border: 'rgba(245,158,11,0.27)', Icon: AlertTriangle, ic: '#fcd34d', badge: 'אזהרה',   bBg: 'rgba(245,158,11,0.15)', bC: '#fcd34d' },
                        opportunity: { bg: 'rgba(34,197,94,0.08)',  border: 'rgba(34,197,94,0.25)',  Icon: TrendingUp,    ic: '#86efac', badge: 'הזדמנות', bBg: 'rgba(34,197,94,0.15)',  bC: '#86efac' },
                      }[alert.severity];
                      const { Icon: Ic } = cfg;
                      return (
                        <motion.div key={alert.id}
                          initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.09 }}
                          className="rounded-2xl p-4 border" style={{ background: cfg.bg, borderColor: cfg.border }}>
                          <div className="flex items-start gap-3">
                            <Ic className="w-4 h-4 mt-0.5 shrink-0" style={{ color: cfg.ic }} />
                            <div className="flex-1 min-w-0">
                              <div className="flex flex-wrap items-center gap-2 mb-1.5">
                                <span className="font-black text-sm" style={{ color: 'var(--theme-text)' }}>{alert.title}</span>
                                <span className="text-[10px] font-black px-1.5 py-0.5 rounded-full" style={{ background: cfg.bBg, color: cfg.bC }}>{cfg.badge}</span>
                                <span className="mr-auto font-mono text-[10px]" style={{ color: 'var(--theme-text-secondary)' }}>{alert.time}</span>
                              </div>
                              <p className="text-xs leading-relaxed" style={{ color: 'var(--theme-text-secondary)' }}>{alert.body}</p>
                              {alert.severity === 'opportunity' && (
                                <button type="button" className="mt-2.5 text-xs font-black px-3 py-1.5 rounded-xl"
                                  style={{ background: 'rgba(34,197,94,0.14)', color: '#86efac' }}>
                                  ← צור קמפיין Yield
                                </button>
                              )}
                            </div>
                          </div>
                        </motion.div>
                      );
                    })}
                  </div>
                </div>

                {/* Sub-rent */}
                <div className="app-panel p-6">
                  <SectionTitle
                    icon={Package}
                    title="השכרות וספקי חוץ פעילים"
                    badge={
                      <span className="text-[10px] font-black px-2 py-0.5 rounded-full"
                        style={{ background: 'rgba(56,189,248,0.12)', color: '#7dd3fc' }}>
                        {SUBRENT_ROWS.length} פריטים
                      </span>
                    }
                  />
                  <div className="space-y-2.5">
                    {SUBRENT_ROWS.map((row, i) => (
                      <motion.div key={row.id}
                        initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.08 }}
                        className="rounded-2xl p-4 border flex items-start justify-between gap-3"
                        style={{ background: 'rgba(255,255,255,0.025)', borderColor: 'var(--theme-border)' }}>
                        <div className="min-w-0 flex-1">
                          <div className="font-black text-sm mb-1" style={{ color: 'var(--theme-text)' }}>{row.itemType}</div>
                          <div className="text-xs space-y-0.5" style={{ color: 'var(--theme-text-secondary)' }}>
                            <div><span className="font-semibold">לקוח:</span> {row.client}</div>
                            <div>
                              <span className="font-semibold">ספק:</span> {row.supplier}
                              <span className="mx-1.5 opacity-35">·</span>
                              <span className="font-semibold">מיקום:</span> {row.location}
                            </div>
                          </div>
                        </div>
                        <div className="shrink-0 text-right">
                          <div className="font-black font-mono text-lg" style={{ color: 'var(--theme-accent)' }}>₪{money(row.dailyCost)}</div>
                          <div className="text-[10px] mb-1.5" style={{ color: 'var(--theme-text-secondary)' }}>ליום</div>
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full"
                            style={{
                              background: row.status === 'פעיל' ? 'rgba(34,197,94,0.14)' : 'rgba(245,158,11,0.14)',
                              color:      row.status === 'פעיל' ? '#86efac'               : '#fcd34d',
                            }}>
                            {row.status}
                          </span>
                        </div>
                      </motion.div>
                    ))}

                    {/* Total */}
                    <div className="rounded-2xl p-4 border-2 flex items-center justify-between"
                      style={{ borderColor: 'var(--theme-accent)', background: 'rgba(224,122,95,0.06)' }}>
                      <span className="font-black text-sm" style={{ color: 'var(--theme-text)' }}>סה״כ עלות ספקי חוץ יומית</span>
                      <span className="font-black font-mono text-base px-3 py-1.5 rounded-xl"
                        style={{ background: 'linear-gradient(135deg, var(--brand-grad-start), var(--brand-grad-mid))', color: '#fff', boxShadow: '0 4px 12px rgba(200,78,62,0.24)' }}>
                        ₪{money(subrentTotal)}
                      </span>
                    </div>
                  </div>
                </div>

              </div>
            </motion.div>
          ) : (
            <motion.div key={activeTab} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.22 }}
              className="app-panel p-16 flex flex-col items-center justify-center gap-4 text-center">
              <div className="w-16 h-16 rounded-2xl flex items-center justify-center"
                style={{ background: 'var(--theme-bg-card)', border: '1px solid var(--theme-border)' }}>
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
