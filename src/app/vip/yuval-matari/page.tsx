'use client';

import { useState, useEffect, type ElementType, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import {
  AlertCircle, AlertTriangle, BarChart3, Bell, Building2, Calendar,
  Camera, CheckCircle, ChevronRight, Clock, Download, FileText,
  Fuel, Layers, MapPin, Monitor, Package, Phone, Server,
  Sparkles, TrendingUp, TrendingDown, Truck, Users, Wifi, Wrench,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

// ─── Types ────────────────────────────────────────────────────────────────────

type BlockType = 'live' | 'setup' | 'free' | 'maintenance';

interface GanttBlock  { label: string; start: number; end: number; type: BlockType; client?: string; }
interface StudioRow   { id: string; name: string; blocks: GanttBlock[]; }
interface CostRow     { resource: string; kind: 'studio' | 'van'; electricity: number; depreciation: number; overhead: number; staffBase: number; }
interface AlertItem   { id: string; severity: 'critical' | 'warning' | 'opportunity'; title: string; body: string; time: string; }
interface SubRentRow  { id: string; itemType: string; client: string; supplier: string; dailyCost: number; status: 'פעיל' | 'ממתין לאיסוף'; location: string; }
interface RevenueRow  { source: string; category: string; monthly: number; ytd: number; trend: 'up' | 'down' | 'stable'; }
interface CrewMember  { id: string; name: string; role: string; dept: string; shift: string; status: 'active' | 'break' | 'off'; hoursWeek: number; phone: string; }
interface StudioDetail { id: string; name: string; sqm: number; cameras: number; capacity: number; status: 'active' | 'setup' | 'free' | 'maintenance'; currentClient?: string; nextBooking?: string; equipment: string[]; dailyRate: number; }
interface VanDetail   { id: string; name: string; status: 'deployed' | 'returning' | 'maintenance'; location: string; assignment: string; crew: number; fuel: number; lastService: string; km: number; }
interface SupplierRow { id: string; name: string; category: string; contact: string; monthly: number; paymentStatus: 'שולם' | 'ממתין' | 'באיחור'; sla: number; nextPayment: string; }
interface EquipCat    { category: string; total: number; inUse: number; maintenance: number; value: number; icon: ElementType; color: string; }

// ─── Mock Data ────────────────────────────────────────────────────────────────

const GANTT_ROWS: StudioRow[] = [
  { id: 's1', name: 'אולפן 1', blocks: [
    { label: 'תוכנית בוקר — חדשות 12', start: 6,  end: 10, type: 'live',        client: 'רשת 13'    },
    { label: 'פירוק והקמה',             start: 10, end: 12, type: 'setup'                            },
    { label: 'ריאליטי — "האח הגדול"',   start: 12, end: 18, type: 'live',        client: 'קשת 12'    },
    { label: 'חדשות ערב',               start: 19, end: 22, type: 'live',        client: 'ערוץ 11'   },
  ]},
  { id: 's2', name: 'אולפן 2', blocks: [
    { label: 'ארץ נהדרת ג\'וניור',      start: 8,  end: 11, type: 'live',        client: 'כאן ילדים' },
    { label: 'הקמה',                    start: 11, end: 13, type: 'setup'                            },
    { label: 'פנוי — זמין להשכרה',      start: 13, end: 17, type: 'free'                             },
    { label: 'פריים טיים — ארץ נהדרת',  start: 17, end: 22, type: 'live',        client: 'כאן 11'    },
  ]},
  { id: 's4', name: 'אולפן 4', blocks: [
    { label: 'מגזין בוקר',              start: 7,  end: 11, type: 'live',        client: 'רשת'       },
    { label: 'תחזוקה מתוכננת',          start: 11, end: 14, type: 'maintenance'                      },
    { label: 'הקמה — שעשועון',          start: 14, end: 16, type: 'setup'                            },
    { label: 'שעשועון פריים טיים',      start: 20, end: 23, type: 'live',        client: 'קשת 12'    },
  ]},
  { id: 's8', name: 'אולפן 8', blocks: [
    { label: 'סדרת דוקומנטרי',          start: 9,  end: 15, type: 'live',        client: 'הוט'       },
    { label: 'פירוק והקמה',             start: 15, end: 17, type: 'setup'                            },
    { label: 'הופעה חיה — לייב',        start: 19, end: 23, type: 'live',        client: 'Yes'       },
  ]},
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
  { id: 'a1', severity: 'critical',    title: 'חריגת שעות נוספות',   body: 'צוות תאורה אולפן 4 — חריגה של 18% מתקציב שע"נ חודשי. נדרש אישור מנהל בכיר.', time: '13:15' },
  { id: 'a2', severity: 'warning',     title: 'כיול עדשה נדרש',       body: 'מצלמת מס׳ 3 (אולפן 4) דורשת כיול עדשה. מומלץ לבצע לפני משמרת הערב בשעה 20:00.', time: '14:32' },
  { id: 'a3', severity: 'opportunity', title: 'הזדמנות Yield — אולפן 2', body: 'אולפן 2 פנוי מחר 10:00–16:00 (6 שעות). ניתן לייצר קמפיין מחיר מופחת ללקוחות מאגר.', time: '12:00' },
];

const SUBRENT_ROWS: SubRentRow[] = [
  { id: 'r1', itemType: 'עדשת פוג׳ינון 99x',    client: 'הפקת ריאליטי — "האי"', supplier: 'אוטופיה',   dailyCost: 2500, status: 'פעיל',          location: 'ניידת שידור 1' },
  { id: 'r2', itemType: 'מערכת אינטרקום RTS',    client: 'ידיעות טלוויזיה',      supplier: 'אודיו-ויז', dailyCost: 850,  status: 'פעיל',          location: 'אולפן 4'       },
  { id: 'r3', itemType: 'ריגינג וטרוס תאורה',    client: 'הופעות ישיר',           supplier: 'טרוס-טק',   dailyCost: 3200, status: 'ממתין לאיסוף', location: 'אולפן 1'       },
  { id: 'r4', itemType: 'משדר טלמטרי 5G',        client: 'ספורט 1',               supplier: 'בזק',       dailyCost: 1100, status: 'פעיל',          location: 'ניידת שידור 2' },
];

const REVENUE_ROWS: RevenueRow[] = [
  { source: 'קשת 12',    category: 'השכרת אולפן', monthly: 184000, ytd: 1_092_000, trend: 'up'     },
  { source: 'רשת 13',    category: 'השכרת אולפן', monthly: 156000, ytd: 924_000,   trend: 'stable' },
  { source: 'כאן 11',    category: 'שירותי הפקה', monthly: 98000,  ytd: 588_000,   trend: 'up'     },
  { source: 'הוט',       category: 'ניידת שידור',  monthly: 74000,  ytd: 420_000,   trend: 'down'   },
  { source: 'Yes',       category: 'ניידת שידור',  monthly: 68000,  ytd: 398_000,   trend: 'up'     },
  { source: 'ספורט 1',   category: 'שידור חי',     monthly: 52000,  ytd: 310_000,   trend: 'stable' },
  { source: 'Yield מאגר',category: 'Yield / Spot', monthly: 38000,  ytd: 192_000,   trend: 'up'     },
  { source: 'השכרות ציוד',category: 'ספקי חוץ',   monthly: 21000,  ytd: 126_000,   trend: 'down'   },
];

const CREW_DATA: CrewMember[] = [
  { id: 'c1', name: 'דוד לוי',       role: 'מנהל אולפן',        dept: 'תפעול',   shift: '06:00–18:00', status: 'active', hoursWeek: 46, phone: '050-111-2233' },
  { id: 'c2', name: 'יעל כהן',       role: 'מנהלת הפקה',       dept: 'הפקה',    shift: '08:00–20:00', status: 'active', hoursWeek: 44, phone: '052-234-5678' },
  { id: 'c3', name: 'מיכאל ברגר',    role: 'ראש צוות תאורה',    dept: 'תאורה',   shift: '07:00–19:00', status: 'break',  hoursWeek: 52, phone: '054-987-6543' },
  { id: 'c4', name: 'רונית שמש',     role: 'אינג׳ינר שמע',      dept: 'שמע',     shift: '12:00–24:00', status: 'active', hoursWeek: 38, phone: '053-444-5566' },
  { id: 'c5', name: 'אמיר נחום',     role: 'מפעיל מצלמה',       dept: 'צילום',   shift: '06:00–18:00', status: 'active', hoursWeek: 42, phone: '050-777-8899' },
  { id: 'c6', name: 'שרה גולן',      role: 'עורכת שידור',        dept: 'עריכה',   shift: '14:00–02:00', status: 'active', hoursWeek: 40, phone: '052-112-3344' },
  { id: 'c7', name: 'ניר פרץ',       role: 'טכנאי שידור ניידת', dept: 'ניידות',  shift: '10:00–22:00', status: 'active', hoursWeek: 48, phone: '054-556-7788' },
  { id: 'c8', name: 'תמר אביב',      role: 'מאפרת ראשית',       dept: 'תלבושות', shift: '07:00–16:00', status: 'off',    hoursWeek: 35, phone: '050-998-0011' },
];

const STUDIOS_DETAIL: StudioDetail[] = [
  { id: 's1', name: 'אולפן 1', sqm: 480, cameras: 6, capacity: 120, status: 'active',      currentClient: 'קשת 12',    nextBooking: 'מחר 06:00',  equipment: ['4K Cinecam ×6','Teleprompter','LED wall 12m²','FOH audio Yamaha CL5'], dailyRate: 18000 },
  { id: 's2', name: 'אולפן 2', sqm: 320, cameras: 4, capacity: 80,  status: 'free',        currentClient: undefined,   nextBooking: 'מחר 08:00',  equipment: ['Sony HDC ×4','Green screen','Lighting grid','Dante audio 64ch'], dailyRate: 12000 },
  { id: 's3', name: 'אולפן 3', sqm: 250, cameras: 3, capacity: 60,  status: 'setup',       currentClient: 'כאן 11',    nextBooking: 'היום 17:00', equipment: ['ARRI Amira ×3','Talk-back','LED grid 6m²'], dailyRate: 9500  },
  { id: 's4', name: 'אולפן 4', sqm: 560, cameras: 8, capacity: 180, status: 'maintenance', currentClient: undefined,   nextBooking: 'מחר 20:00', equipment: ['RED MONSTRO ×8','Virtual set XR','6DoF tracking','Genelec 5.1'], dailyRate: 24000 },
  { id: 's5', name: 'אולפן 5', sqm: 180, cameras: 2, capacity: 30,  status: 'active',      currentClient: 'רשת 13',    nextBooking: undefined,    equipment: ['PTZ Camera ×2','Skype gateway','Simple lighting rig'], dailyRate: 6500  },
  { id: 's8', name: 'אולפן 8', sqm: 420, cameras: 5, capacity: 150, status: 'active',      currentClient: 'Yes',       nextBooking: 'מחר 09:00',  equipment: ['Grass Valley LDX ×5','Concert audio L-Acoustics','Moving heads ×24'], dailyRate: 16000 },
];

const VANS_DETAIL: VanDetail[] = [
  { id: 'v1', name: 'ניידת שידור 1 — "אמא"', status: 'deployed',    location: 'נווה אילן — מגרש קדימה',   assignment: 'ליגה א׳ קדימה–מכבי פ"ת', crew: 8,  fuel: 72, lastService: '15.05.26', km: 187340 },
  { id: 'v2', name: 'ניידת שידור 2 — "פריים"', status: 'returning',  location: 'כביש 1 — בדרך לאולפנים',   assignment: 'שידור חי — אירוע מוזיקלי', crew: 6,  fuel: 48, lastService: '02.06.26', km: 143210 },
  { id: 'v3', name: 'ניידת קטנה 3 — "מיני"',   status: 'maintenance', location: 'מוסך האולפנים',             assignment: 'תחזוקה תקופתית',           crew: 0,  fuel: 25, lastService: '06.06.26', km: 89420  },
];

const SUPPLIERS: SupplierRow[] = [
  { id: 'sp1', name: 'אוטופיה',         category: 'ציוד קולנוע',   contact: '03-511-2233', monthly: 28000, paymentStatus: 'שולם',   sla: 98, nextPayment: '15.06.26' },
  { id: 'sp2', name: 'אודיו-ויז',       category: 'מערכות שמע',    contact: '03-622-4455', monthly: 15500, paymentStatus: 'ממתין',  sla: 95, nextPayment: '10.06.26' },
  { id: 'sp3', name: 'טרוס-טק',         category: 'תאורה ובמה',    contact: '09-734-5566', monthly: 22000, paymentStatus: 'שולם',   sla: 92, nextPayment: '20.06.26' },
  { id: 'sp4', name: 'בזק עסקי',        category: 'תקשורת ופס רחב',contact: '03-644-1122', monthly: 18400, paymentStatus: 'ממתין',  sla: 99, nextPayment: '08.06.26' },
  { id: 'sp5', name: 'לייט-טק',         category: 'ציוד תאורה',    contact: '04-855-3344', monthly: 11200, paymentStatus: 'שולם',   sla: 90, nextPayment: '25.06.26' },
  { id: 'sp6', name: 'קלין-סטאר',       category: 'כח אדם חוץ',   contact: '050-766-5544',monthly: 34000, paymentStatus: 'באיחור', sla: 85, nextPayment: '01.06.26' },
  { id: 'sp7', name: 'מובייל-טק',       category: 'שירותי IT',     contact: '052-888-7766',monthly: 8700,  paymentStatus: 'שולם',   sla: 97, nextPayment: '30.06.26' },
];

const EQUIP_CATS: EquipCat[] = [
  { category: 'מצלמות ועדשות',  total: 38, inUse: 28, maintenance: 3, value: 4_200_000, icon: Camera,  color: '#60a5fa' },
  { category: 'מערכות שמע',     total: 24, inUse: 18, maintenance: 1, value: 980_000,   icon: Wifi,    color: '#34d399' },
  { category: 'תאורה ורכיבים',  total: 142,inUse: 96, maintenance: 8, value: 1_450_000, icon: Sparkles,color: '#fbbf24' },
  { category: 'שרתים ונתב',     total: 16, inUse: 15, maintenance: 0, value: 2_100_000, icon: Server,  color: '#a78bfa' },
  { category: 'ציוד ניידת',     total: 52, inUse: 36, maintenance: 4, value: 3_600_000, icon: Truck,   color: '#f97316' },
  { category: 'כבלים ותשתית',   total: 280,inUse: 190,maintenance: 12,value: 320_000,   icon: Layers,  color: '#38bdf8' },
  { category: 'ציוד גיבוי',     total: 22, inUse: 0,  maintenance: 2, value: 750_000,   icon: Package, color: '#ec4899' },
];

const TABS = [
  { id: 'overview',   label: 'תצוגה כוללת',   icon: BarChart3  },
  { id: 'accounting', label: 'הנהלת חשבונות', icon: TrendingUp },
  { id: 'crew',       label: 'כח אדם',         icon: Users      },
  { id: 'studios',    label: 'אולפנים',        icon: Building2  },
  { id: 'vans',       label: 'ניידות שידור',   icon: Truck      },
  { id: 'suppliers',  label: 'ספקים',          icon: Package    },
  { id: 'equipment',  label: 'ציוד ומחסן',     icon: Wrench     },
];

// ─── Gantt config ─────────────────────────────────────────────────────────────

const G_START = 6, G_END = 24, G_SPAN = G_END - G_START;

const BLOCK_CFG: Record<BlockType, { bg: string; border: string; text: string; legend: string }> = {
  live:        { bg: 'rgba(239,68,68,0.20)',   border: 'rgba(239,68,68,0.55)',   text: '#fca5a5', legend: 'בשידור / צילום' },
  setup:       { bg: 'rgba(245,158,11,0.17)',  border: 'rgba(245,158,11,0.50)',  text: '#fcd34d', legend: 'הקמה / פירוק'  },
  free:        { bg: 'rgba(34,197,94,0.12)',   border: 'rgba(34,197,94,0.36)',   text: '#86efac', legend: 'פנוי'           },
  maintenance: { bg: 'rgba(100,116,139,0.22)', border: 'rgba(100,116,139,0.50)', text: '#94a3b8', legend: 'תחזוקה'         },
};

const STATUS_STUDIO: Record<StudioDetail['status'], { label: string; color: string; bg: string }> = {
  active:      { label: 'בשידור',  color: '#4ade80', bg: 'rgba(74,222,128,0.12)'  },
  setup:       { label: 'הקמה',    color: '#fbbf24', bg: 'rgba(251,191,36,0.12)'  },
  free:        { label: 'פנוי',    color: '#38bdf8', bg: 'rgba(56,189,248,0.12)'  },
  maintenance: { label: 'תחזוקה',  color: '#94a3b8', bg: 'rgba(148,163,184,0.12)' },
};

const STATUS_VAN: Record<VanDetail['status'], { label: string; color: string; bg: string }> = {
  deployed:    { label: 'בפריסה',  color: '#4ade80', bg: 'rgba(74,222,128,0.12)'  },
  returning:   { label: 'חוזרת',   color: '#fbbf24', bg: 'rgba(251,191,36,0.12)'  },
  maintenance: { label: 'תחזוקה',  color: '#94a3b8', bg: 'rgba(148,163,184,0.12)' },
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function pct(h: number)           { return `${Math.max(0, Math.min(100, (h - G_START) / G_SPAN * 100))}%`; }
function wPct(s: number, e: number) { return `${Math.max(0, (Math.min(e, G_END) - Math.max(s, G_START)) / G_SPAN * 100)}%`; }
function money(n: number)         { return n.toLocaleString('he-IL'); }
function pad2(n: number)          { return String(n).padStart(2, '0'); }

// ─── Sub-components ───────────────────────────────────────────────────────────

function Badge({ children, color, bg }: { children: ReactNode; color: string; bg: string }) {
  return (
    <span className="inline-block rounded-full px-2.5 py-0.5 text-[10px] font-black" style={{ color, background: bg }}>
      {children}
    </span>
  );
}

function KpiCard({ icon: Icon, label, value, sub, color, live = false }: { icon: ElementType; label: string; value: ReactNode; sub?: ReactNode; color: string; live?: boolean }) {
  return (
    <div className="card-glow relative overflow-hidden rounded-2xl p-5 flex flex-col gap-3"
      style={{ background: 'var(--theme-bg-card)', border: '1px solid var(--theme-border)' }}>
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
        <div className="text-[10px] font-black uppercase tracking-widest mb-1" style={{ color: 'var(--theme-text-secondary)' }}>{label}</div>
        {sub && <div className="text-[11px] leading-snug" style={{ color: 'var(--theme-text-secondary)' }}>{sub}</div>}
      </div>
    </div>
  );
}

function SectionTitle({ icon: Icon, title, badge, color = 'var(--theme-accent)' }: { icon: ElementType; title: string; badge?: ReactNode; color?: string }) {
  return (
    <div className="flex items-center gap-3 mb-5">
      <div className="rounded-xl p-2 shrink-0" style={{ background: `${color}1a`, border: `1px solid ${color}30` }}>
        <Icon className="w-4 h-4" style={{ color }} />
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

function UsageBar({ value, max, color }: { value: number; max: number; color: string }) {
  const pct = Math.round((value / max) * 100);
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 rounded-full overflow-hidden" style={{ height: 6, background: 'rgba(255,255,255,0.07)' }}>
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${pct}%` }}
          transition={{ duration: 0.8, ease: 'easeOut', delay: 0.1 }}
          className="h-full rounded-full"
          style={{ background: color }}
        />
      </div>
      <span className="text-[10px] font-mono font-bold w-7 text-left shrink-0" style={{ color: 'var(--theme-text-secondary)' }}>{pct}%</span>
    </div>
  );
}

// ─── Framer motion variants ───────────────────────────────────────────────────

const stagger = { hidden: {}, show: { transition: { staggerChildren: 0.07 } } } as const;
const fadeUp  = { hidden: { opacity: 0, y: 20 }, show: { opacity: 1, y: 0, transition: { duration: 0.38, ease: 'easeOut' as const } } } as const;

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function VipYuvalMatari() {
  const router = useRouter();
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

  const timeStr = now.toLocaleTimeString('he-IL', { timeZone: 'Asia/Jerusalem', hour: '2-digit', minute: '2-digit', second: '2-digit' });
  const dateStr = now.toLocaleDateString('he-IL', { timeZone: 'Asia/Jerusalem', weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
  const nowH    = now.getHours() + now.getMinutes() / 60;

  function handleGenerate() {
    if (generating) return;
    setGenerating(true); setReportReady(false);
    setTimeout(() => { setGenerating(false); setReportReady(true); }, 2400);
  }

  const hourMarkers = Array.from({ length: G_SPAN / 2 + 1 }, (_, i) => G_START + i * 2);
  const costEnriched = COST_ROWS.map(r => ({ ...r, total: r.electricity + r.depreciation + r.overhead + r.staffBase }));
  const colSums = {
    electricity:  costEnriched.reduce((s, r) => s + r.electricity,  0),
    depreciation: costEnriched.reduce((s, r) => s + r.depreciation, 0),
    overhead:     costEnriched.reduce((s, r) => s + r.overhead,     0),
    staffBase:    costEnriched.reduce((s, r) => s + r.staffBase,    0),
    total:        costEnriched.reduce((s, r) => s + r.total,        0),
  };
  const subrentTotal  = SUBRENT_ROWS.reduce((s, r) => s + r.dailyCost, 0);
  const revenueTotal  = REVENUE_ROWS.reduce((s, r) => s + r.monthly, 0);
  const revenueYTD    = REVENUE_ROWS.reduce((s, r) => s + r.ytd,     0);
  const supplierTotal = SUPPLIERS.reduce((s, r) => s + r.monthly,    0);
  const equipValue    = EQUIP_CATS.reduce((s, r) => s + r.value,     0);

  return (
    <div dir="rtl">

      {/* ══════════════ HERO ══════════════ */}
      <header className="relative overflow-hidden" style={{ background: 'linear-gradient(170deg, #05080f 0%, #0e0720 45%, #060e0a 100%)' }}>

        {/* ── Atmosphere orbs ── */}
        <motion.div animate={{ opacity: [0.4, 0.75, 0.4], scale: [1, 1.1, 1] }} transition={{ duration: 8, repeat: Infinity, ease: 'easeInOut' }}
          className="pointer-events-none absolute inset-0"
          style={{ background: 'radial-gradient(ellipse 80% 70% at 50% 120%, rgba(224,122,95,0.38), transparent)' }} />
        <motion.div animate={{ opacity: [0.25, 0.55, 0.25] }} transition={{ duration: 9, repeat: Infinity, ease: 'easeInOut', delay: 2.5 }}
          className="pointer-events-none absolute inset-0"
          style={{ background: 'radial-gradient(ellipse 60% 55% at 8% 15%, rgba(96,165,250,0.24), transparent)' }} />
        <motion.div animate={{ opacity: [0.22, 0.48, 0.22] }} transition={{ duration: 10, repeat: Infinity, ease: 'easeInOut', delay: 5 }}
          className="pointer-events-none absolute inset-0"
          style={{ background: 'radial-gradient(ellipse 55% 50% at 92% 12%, rgba(167,139,250,0.22), transparent)' }} />

        {/* ── Grid ── */}
        <div className="pointer-events-none absolute inset-0 opacity-[0.03]"
          style={{ backgroundImage: 'linear-gradient(rgba(255,255,255,1) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,1) 1px,transparent 1px)', backgroundSize: '40px 40px' }} />

        {/* ── Scan line — uses translateY (GPU, no flicker) ── */}
        <motion.div
          initial={{ y: '-100%' }}
          animate={{ y: ['0%', '2000%'] }}
          transition={{ duration: 5, repeat: Infinity, ease: 'linear', repeatDelay: 3 }}
          className="pointer-events-none absolute top-0 left-0 right-0 h-[2px]"
          style={{ background: 'linear-gradient(90deg, transparent, rgba(96,165,250,0.30), rgba(224,122,95,0.30), rgba(96,165,250,0.30), transparent)', willChange: 'transform' }}
        />

        {/* ── Bottom border glow ── */}
        <div className="absolute bottom-0 left-0 right-0 h-px" style={{ background: 'linear-gradient(90deg, transparent 0%, rgba(224,122,95,0.5) 30%, rgba(96,165,250,0.5) 70%, transparent 100%)' }} />

        {/* ── Back button ── */}
        <div className="relative z-10 max-w-5xl mx-auto px-6 pt-6">
          <button onClick={() => router.back()}
            className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.06] px-3 py-1.5 text-xs font-bold text-white/50 backdrop-blur-sm transition-all hover:bg-white/12 hover:text-white/85 hover:border-white/20">
            <ChevronRight className="h-3.5 w-3.5" />חזרה
          </button>
        </div>

        {/* ── Main centered content ── */}
        <div className="relative z-10 flex flex-col items-center text-center px-6 pt-6 pb-10 sm:pb-16">

          {/* Live badge */}
          <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}
            className="mb-8 inline-flex items-center gap-2 rounded-full border border-amber-400/25 bg-amber-400/[0.08] px-4 py-1.5 text-[11px] font-black tracking-widest uppercase text-amber-300 backdrop-blur-sm"
            style={{ boxShadow: '0 0 32px rgba(251,191,36,0.18), inset 0 1px 0 rgba(255,255,255,0.08)' }}>
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-amber-400 opacity-70" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-amber-400" />
            </span>
            <Sparkles className="h-3 w-3 text-amber-400" />
            מרכז שליטה · אולפני הרצליה · LIVE
          </motion.div>

          {/* Avatar with spinning gradient ring */}
          <motion.div initial={{ opacity: 0, scale: 0.6 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.6, ease: [0.34,1.56,0.64,1] }}
            className="relative mb-7 h-32 w-32 shrink-0">
            {/* Spinning conic border */}
            <motion.div animate={{ rotate: 360 }} transition={{ duration: 7, repeat: Infinity, ease: 'linear' }}
              className="absolute -inset-[3px] rounded-full"
              style={{ background: 'conic-gradient(from 0deg, #e07a5f, #60a5fa, #a78bfa, #34d399, #fbbf24, #e07a5f)', willChange: 'transform' }} />
            {/* Inner dark fill */}
            <div className="absolute inset-0 rounded-full m-[3px]" style={{ background: '#080c1a' }} />
            {/* Avatar photo */}
            <img
              src="/vip/yuval-matari.jpg"
              alt="יובל מטרי"
              className="absolute inset-0 m-[3px] rounded-full object-cover object-top w-[calc(100%-6px)] h-[calc(100%-6px)]"
            />
            {/* Outer glow */}
            <div className="absolute -inset-2 rounded-full pointer-events-none"
              style={{ boxShadow: '0 0 60px rgba(224,122,95,0.35), 0 0 120px rgba(96,165,250,0.18)' }} />
            {/* Online dot */}
            <span className="absolute bottom-1 left-1 flex h-5 w-5 items-center justify-center rounded-full border-2 bg-emerald-500" style={{ borderColor: '#080c1a' }}>
              <span className="absolute h-full w-full animate-ping rounded-full bg-emerald-400 opacity-55" />
              <span className="relative h-2 w-2 rounded-full bg-emerald-300" />
            </span>
          </motion.div>

          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6, delay: 0.15, ease: 'easeOut' }}
            className="flex flex-col items-center w-full">

            {/* Greeting */}
            <p className="text-base font-semibold tracking-widest text-white/40 mb-1.5 uppercase">ברוך שובך</p>

            {/* Name — the hero moment */}
            <h1 className="font-black leading-none tracking-tight mb-3 gradient-text"
              style={{ fontSize: 'clamp(3.5rem, 10vw, 7rem)', textShadow: '0 0 80px rgba(224,122,95,0.40), 0 0 160px rgba(96,165,250,0.20)' }}>
              יובל מטרי
            </h1>

            {/* Title */}
            <p className="text-sm sm:text-base font-semibold text-white/38 tracking-wide mb-1">
              סמנכ״ל תפעול ושירותים
            </p>

            {/* Decorative rule */}
            <div className="flex items-center gap-4 my-6 w-full max-w-sm">
              <div className="flex-1 h-px" style={{ background: 'linear-gradient(to left, rgba(224,122,95,0.55), transparent)' }} />
              <span className="shrink-0 text-[9px] font-black tracking-[0.25em] uppercase text-white/25">Herzliya Studios</span>
              <div className="flex-1 h-px" style={{ background: 'linear-gradient(to right, rgba(96,165,250,0.55), transparent)' }} />
            </div>

            {/* Stat pills */}
            <div className="flex flex-wrap justify-center gap-2 mb-8">
              {[
                { label: '6/8 אולפנים פעילים', color: '#4ade80', dot: true  },
                { label: '2/2 ניידות בשטח',    color: '#38bdf8', dot: true  },
                { label: '43 עובדים מחוברים',  color: '#a78bfa', dot: false },
                { label: 'SLA 98.7%',           color: '#fbbf24', dot: false },
              ].map(p => (
                <div key={p.label} className="flex items-center gap-1.5 rounded-full border border-white/[0.09] bg-white/[0.06] px-4 py-2 text-[11px] font-black backdrop-blur-sm"
                  style={{ boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.06)' }}>
                  {p.dot ? (
                    <span className="relative flex h-1.5 w-1.5">
                      <span className="absolute h-full w-full animate-ping rounded-full opacity-60" style={{ background: p.color }} />
                      <span className="relative h-1.5 w-1.5 rounded-full" style={{ background: p.color }} />
                    </span>
                  ) : <span className="h-1.5 w-1.5 rounded-full" style={{ background: p.color }} />}
                  <span style={{ color: p.color }}>{p.label}</span>
                </div>
              ))}
            </div>

            {/* Clock */}
            <div className="flex flex-col items-center gap-2 mb-8">
              <span className="font-mono font-black tabular-nums text-white"
                style={{ fontSize: 'clamp(2.5rem, 7vw, 4.5rem)', letterSpacing: '0.08em', textShadow: '0 0 40px rgba(224,122,95,0.45), 0 0 80px rgba(224,122,95,0.20)' }}>
                {timeStr}
              </span>
              <span className="flex items-center gap-2 text-xs text-white/35 tracking-wide">
                <Calendar className="w-3.5 h-3.5 shrink-0" />{dateStr}
              </span>
            </div>

            {/* System status bar */}
            <div className="flex flex-wrap justify-center gap-x-6 gap-y-2">
              {[
                { label: 'מערכות שידור', ok: true  },
                { label: 'שרתי אחסון',  ok: true  },
                { label: 'רשת IP',       ok: true  },
                { label: 'גיבוי אוטו׳', ok: true  },
                { label: 'אינטרקום',     ok: false },
              ].map(s => (
                <div key={s.label} className="flex items-center gap-1.5 text-[10px] font-bold" style={{ color: s.ok ? 'rgba(74,222,128,0.7)' : 'rgba(251,191,36,0.7)' }}>
                  <span className={`h-1.5 w-1.5 rounded-full ${s.ok ? 'bg-emerald-400' : 'bg-amber-400'}`} />
                  {s.label}
                  <span className="text-white/20 font-normal">·</span>
                  <span>{s.ok ? 'OK' : 'אזהרה'}</span>
                </div>
              ))}
            </div>
          </motion.div>
        </div>
      </header>

      {/* ══════════════ BODY ══════════════ */}
      <div className="max-w-[1440px] mx-auto px-4 sm:px-6 pb-16 space-y-5 mt-6">

        {/* Report generator bar */}
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.18, duration: 0.38 }} className="app-panel p-4">
          <div className="flex flex-wrap items-end gap-3">
            <div className="flex items-center gap-2 shrink-0">
              <FileText className="w-4 h-4 shrink-0" style={{ color: 'var(--theme-accent)' }} />
              <span className="text-sm font-black" style={{ color: 'var(--theme-text)' }}>הפקת דוח פעילות</span>
            </div>
            <div className="flex flex-wrap items-end gap-2">
              <div className="flex flex-col gap-0.5">
                <label className="text-[10px] font-bold" style={{ color: 'var(--theme-text-secondary)' }}>מתאריך</label>
                <input type="date" value={reportFrom} onChange={e => { setReportFrom(e.target.value); setReportReady(false); }}
                  className="rounded-lg px-3 py-1.5 text-sm border outline-none"
                  style={{ background: 'var(--theme-bg)', borderColor: 'var(--theme-border)', color: 'var(--theme-text)' }} />
              </div>
              <div className="flex flex-col gap-0.5">
                <label className="text-[10px] font-bold" style={{ color: 'var(--theme-text-secondary)' }}>עד תאריך</label>
                <input type="date" value={reportTo} onChange={e => { setReportTo(e.target.value); setReportReady(false); }}
                  className="rounded-lg px-3 py-1.5 text-sm border outline-none"
                  style={{ background: 'var(--theme-bg)', borderColor: 'var(--theme-border)', color: 'var(--theme-text)' }} />
              </div>
              <button type="button" onClick={handleGenerate} disabled={generating}
                className="h-[34px] px-5 rounded-xl font-black text-sm flex items-center gap-2 transition-all disabled:opacity-70"
                style={{
                  background: reportReady ? 'rgba(34,197,94,0.18)' : 'linear-gradient(135deg, var(--brand-grad-start), var(--brand-grad-mid))',
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

        {/* Tabs */}
        <div className="overflow-x-auto pb-0.5 -mx-1 px-1">
          <div className="flex gap-1.5 min-w-max">
            {TABS.map(tab => {
              const TabIcon = tab.icon;
              const isActive = activeTab === tab.id;
              return (
                <button key={tab.id} type="button" onClick={() => setActiveTab(tab.id)}
                  className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold whitespace-nowrap transition-all duration-200"
                  style={{
                    background: isActive ? 'linear-gradient(135deg, var(--brand-grad-start), var(--brand-grad-mid))' : 'var(--theme-bg-card)',
                    color: isActive ? '#fff' : 'var(--theme-text-secondary)',
                    border: `1px solid ${isActive ? 'transparent' : 'var(--theme-border)'}`,
                    boxShadow: isActive ? '0 4px 14px rgba(200,78,62,0.26)' : 'none',
                  }}>
                  <TabIcon className="w-3.5 h-3.5 shrink-0" />
                  {tab.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Tab content */}
        <AnimatePresence mode="wait">

          {/* ── OVERVIEW ── */}
          {activeTab === 'overview' && (
            <motion.div key="overview" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.22 }} className="space-y-5">
              <motion.div className="grid grid-cols-2 xl:grid-cols-4 gap-4" variants={stagger} initial="hidden" animate="show">
                <motion.div variants={fadeUp}><KpiCard icon={Monitor} label="אולפנים פעילים" value={<>6<span className="text-2xl font-normal opacity-35">/8</span></>} sub="2 אולפנים פתוחים ל-Yield" color="#22c55e" live /></motion.div>
                <motion.div variants={fadeUp}><KpiCard icon={Truck}   label="ניידות שידור"   value={<>2<span className="text-2xl font-normal opacity-35">/2</span></>} sub={<><div>ניידת 1: נווה אילן</div><div>ניידת 2: בלומפילד</div></>} color="#38bdf8" live /></motion.div>
                <motion.div variants={fadeUp}><KpiCard icon={AlertCircle} label="התרעות כח אדם" value="2" sub="חריגת שעות — צוות תאורה אולפן 4" color="#f59e0b" live /></motion.div>
                <motion.div variants={fadeUp}><KpiCard icon={Server} label="שרתים ותקשורת" value="99.9%" sub={<span className="flex items-center gap-1"><Wifi className="w-3 h-3 shrink-0" />כל המערכות תקינות</span>} color="#22c55e" /></motion.div>
              </motion.div>

              {/* Gantt */}
              <div className="app-panel p-6">
                <SectionTitle icon={Layers} title="לוח תפוסה ותמחור דינמי — Studio Yield" badge={<div className="flex items-center gap-1.5 text-[11px] font-bold px-2.5 py-1 rounded-full" style={{ background: 'rgba(239,68,68,0.12)', color: '#fca5a5' }}><LiveDot />עדכון חי</div>} />
                <div className="flex flex-wrap gap-4 mb-5 pb-4" style={{ borderBottom: '1px solid var(--theme-border)' }}>
                  {(Object.entries(BLOCK_CFG) as [BlockType, typeof BLOCK_CFG[BlockType]][]).map(([type, c]) => (
                    <div key={type} className="flex items-center gap-1.5">
                      <div className="w-3 h-3 rounded border" style={{ background: c.bg, borderColor: c.border }} />
                      <span className="text-xs" style={{ color: 'var(--theme-text-secondary)' }}>{c.legend}</span>
                    </div>
                  ))}
                </div>
                <div className="overflow-x-auto">
                  <div className="min-w-[680px]">
                    <div className="relative h-5 mr-[88px] mb-2">
                      {hourMarkers.map(h => (
                        <div key={h} className="absolute -translate-x-1/2 text-[10px] font-mono font-bold" style={{ left: pct(h), color: 'var(--theme-text-secondary)' }}>{pad2(h)}:00</div>
                      ))}
                    </div>
                    {GANTT_ROWS.map(studio => (
                      <div key={studio.id} className="flex items-center mb-3 gap-3">
                        <div className="w-[88px] shrink-0 text-xs font-black text-right" style={{ color: 'var(--theme-text)' }}>{studio.name}</div>
                        <div className="flex-1 relative rounded-xl overflow-hidden" style={{ height: 52, background: 'rgba(255,255,255,0.02)', border: '1px solid var(--theme-border)' }}>
                          {hourMarkers.map(h => <div key={h} className="absolute inset-y-0 border-r" style={{ left: pct(h), borderColor: 'rgba(255,255,255,0.05)' }} />)}
                          {studio.blocks.map((block, bi) => {
                            const c = BLOCK_CFG[block.type];
                            return (
                              <div key={bi} className="absolute inset-y-1.5 rounded-lg flex items-center px-2 overflow-hidden"
                                style={{ left: pct(block.start), width: wPct(block.start, block.end), background: c.bg, border: `1px solid ${c.border}` }}
                                title={`${block.label}${block.client ? ` — ${block.client}` : ''}`}>
                                <span className="text-[9px] font-bold leading-tight truncate" style={{ color: c.text }}>
                                  {block.label}{block.client && <span className="opacity-55"> · {block.client}</span>}
                                </span>
                              </div>
                            );
                          })}
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
                      <tr>{[['משאב', false],['חשמל ₪/שעה',false],['פחת ₪/שעה',false],['תקורות ₪/שעה',false],['צוות בסיס ₪/שעה',false],['Floor Price ₪/שעה',true]].map(([label, accent]) => (
                        <th key={label as string} className="py-3 px-4 text-right text-[10px] font-black uppercase tracking-wide"
                          style={{ color: accent ? 'var(--theme-accent)' : 'var(--theme-text-secondary)', borderBottom: `1px solid ${accent ? 'rgba(224,122,95,0.40)' : 'var(--theme-border)'}`, background: accent ? 'rgba(224,122,95,0.05)' : 'transparent' }}>
                          {label as string}
                        </th>
                      ))}</tr>
                    </thead>
                    <tbody>
                      {costEnriched.map(row => (
                        <tr key={row.resource} className="hover:bg-white/[0.02] transition-colors">
                          <td className="py-3 px-4 font-bold" style={{ color: 'var(--theme-text)', borderBottom: '1px solid var(--theme-border)' }}>
                            <div className="flex items-center gap-1.5">
                              {row.kind === 'van' ? <Truck className="w-3.5 h-3.5 opacity-40 shrink-0" /> : <Monitor className="w-3.5 h-3.5 opacity-40 shrink-0" />}
                              {row.resource}
                            </div>
                          </td>
                          {[row.electricity, row.depreciation, row.overhead, row.staffBase].map((v, i) => (
                            <td key={i} className="py-3 px-4 font-mono" style={{ color: 'var(--theme-text-secondary)', borderBottom: '1px solid var(--theme-border)' }}>₪{money(v)}</td>
                          ))}
                          <td className="py-3 px-4" style={{ background: 'rgba(224,122,95,0.04)', borderBottom: '1px solid rgba(224,122,95,0.15)' }}>
                            <span className="font-black font-mono text-sm px-2.5 py-1 rounded-lg" style={{ background: 'rgba(224,122,95,0.14)', color: 'var(--theme-accent)' }}>₪{money(row.total)}</span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr>
                        <td className="py-4 px-4 font-black" style={{ color: 'var(--theme-text)', borderTop: '2px solid var(--theme-accent)' }}>סה״כ תפעול שוטף</td>
                        {[colSums.electricity, colSums.depreciation, colSums.overhead, colSums.staffBase].map((v, i) => (
                          <td key={i} className="py-4 px-4 font-mono font-bold text-xs" style={{ color: 'var(--theme-text-secondary)', borderTop: '2px solid var(--theme-accent)' }}>₪{money(v)}</td>
                        ))}
                        <td className="py-4 px-4" style={{ background: 'rgba(224,122,95,0.06)', borderTop: '2px solid var(--theme-accent)' }}>
                          <span className="font-black font-mono text-base px-3 py-1.5 rounded-xl" style={{ background: 'linear-gradient(135deg, var(--brand-grad-start), var(--brand-grad-mid))', color: '#fff', boxShadow: '0 4px 14px rgba(200,78,62,0.28)' }}>₪{money(colSums.total)}</span>
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </div>

              {/* Alerts + Sub-rent */}
              <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
                <div className="app-panel p-6">
                  <SectionTitle icon={Bell} title="התרעות מערכת חכמות" badge={<Badge color="#fca5a5" bg="rgba(239,68,68,0.12)">{ALERTS.length} פעילות</Badge>} />
                  <div className="space-y-3">
                    {ALERTS.map((alert, i) => {
                      const cfg = {
                        critical:    { bg: 'rgba(239,68,68,0.09)',  border: 'rgba(239,68,68,0.27)',  Icon: AlertCircle,   ic: '#fca5a5', badge: 'דחוף',    bBg: 'rgba(239,68,68,0.15)',  bC: '#fca5a5' },
                        warning:     { bg: 'rgba(245,158,11,0.09)', border: 'rgba(245,158,11,0.27)', Icon: AlertTriangle, ic: '#fcd34d', badge: 'אזהרה',   bBg: 'rgba(245,158,11,0.15)', bC: '#fcd34d' },
                        opportunity: { bg: 'rgba(34,197,94,0.08)',  border: 'rgba(34,197,94,0.25)',  Icon: TrendingUp,    ic: '#86efac', badge: 'הזדמנות', bBg: 'rgba(34,197,94,0.15)',  bC: '#86efac' },
                      }[alert.severity];
                      const { Icon: Ic } = cfg;
                      return (
                        <motion.div key={alert.id} initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.09 }}
                          className="rounded-2xl p-4 border" style={{ background: cfg.bg, borderColor: cfg.border }}>
                          <div className="flex items-start gap-3">
                            <Ic className="w-4 h-4 mt-0.5 shrink-0" style={{ color: cfg.ic }} />
                            <div className="flex-1 min-w-0">
                              <div className="flex flex-wrap items-center gap-2 mb-1.5">
                                <span className="font-black text-sm" style={{ color: 'var(--theme-text)' }}>{alert.title}</span>
                                <Badge color={cfg.bC} bg={cfg.bBg}>{cfg.badge}</Badge>
                                <span className="mr-auto font-mono text-[10px]" style={{ color: 'var(--theme-text-secondary)' }}>{alert.time}</span>
                              </div>
                              <p className="text-xs leading-relaxed" style={{ color: 'var(--theme-text-secondary)' }}>{alert.body}</p>
                            </div>
                          </div>
                        </motion.div>
                      );
                    })}
                  </div>
                </div>

                <div className="app-panel p-6">
                  <SectionTitle icon={Package} title="השכרות וספקי חוץ פעילים" badge={<Badge color="#7dd3fc" bg="rgba(56,189,248,0.12)">{SUBRENT_ROWS.length} פריטים</Badge>} />
                  <div className="space-y-2.5">
                    {SUBRENT_ROWS.map((row, i) => (
                      <motion.div key={row.id} initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.08 }}
                        className="rounded-2xl p-4 border flex items-start justify-between gap-3"
                        style={{ background: 'rgba(255,255,255,0.025)', borderColor: 'var(--theme-border)' }}>
                        <div className="min-w-0 flex-1">
                          <div className="font-black text-sm mb-1" style={{ color: 'var(--theme-text)' }}>{row.itemType}</div>
                          <div className="text-xs space-y-0.5" style={{ color: 'var(--theme-text-secondary)' }}>
                            <div><span className="font-semibold">לקוח:</span> {row.client}</div>
                            <div><span className="font-semibold">ספק:</span> {row.supplier} · <span className="font-semibold">מיקום:</span> {row.location}</div>
                          </div>
                        </div>
                        <div className="shrink-0 text-right">
                          <div className="font-black font-mono text-lg" style={{ color: 'var(--theme-accent)' }}>₪{money(row.dailyCost)}</div>
                          <div className="text-[10px] mb-1.5" style={{ color: 'var(--theme-text-secondary)' }}>ליום</div>
                          <Badge color={row.status === 'פעיל' ? '#86efac' : '#fcd34d'} bg={row.status === 'פעיל' ? 'rgba(34,197,94,0.14)' : 'rgba(245,158,11,0.14)'}>{row.status}</Badge>
                        </div>
                      </motion.div>
                    ))}
                    <div className="rounded-2xl p-4 border-2 flex items-center justify-between" style={{ borderColor: 'var(--theme-accent)', background: 'rgba(224,122,95,0.06)' }}>
                      <span className="font-black text-sm" style={{ color: 'var(--theme-text)' }}>סה״כ עלות ספקי חוץ יומית</span>
                      <span className="font-black font-mono text-base px-3 py-1.5 rounded-xl" style={{ background: 'linear-gradient(135deg, var(--brand-grad-start), var(--brand-grad-mid))', color: '#fff' }}>₪{money(subrentTotal)}</span>
                    </div>
                  </div>
                </div>
              </div>
            </motion.div>
          )}

          {/* ── ACCOUNTING ── */}
          {activeTab === 'accounting' && (
            <motion.div key="accounting" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.22 }} className="space-y-5">
              <motion.div className="grid grid-cols-2 xl:grid-cols-4 gap-4" variants={stagger} initial="hidden" animate="show">
                <motion.div variants={fadeUp}><KpiCard icon={TrendingUp} label="הכנסות חודש שוטף" value={`₪${money(revenueTotal)}`} sub="↑ 14% לעומת חודש קודם" color="#34d399" /></motion.div>
                <motion.div variants={fadeUp}><KpiCard icon={BarChart3}  label="הכנסות YTD"        value={`₪${(revenueYTD / 1_000_000).toFixed(1)}M`} sub="יעד שנתי: ₪4.2M" color="#60a5fa" /></motion.div>
                <motion.div variants={fadeUp}><KpiCard icon={Package}    label="הוצאות ספקים"      value={`₪${money(supplierTotal)}`} sub="מתוך תקציב ₪180K" color="#f97316" /></motion.div>
                <motion.div variants={fadeUp}><KpiCard icon={CheckCircle} label="גביה שוטפת"       value="96.4%" sub="1 חשבונית באיחור" color="#a78bfa" /></motion.div>
              </motion.div>

              <div className="app-panel p-6">
                <SectionTitle icon={TrendingUp} title="פירוט הכנסות לפי לקוח — יוני 2026" color="#34d399" />
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[600px] text-sm">
                    <thead>
                      <tr>{['לקוח','קטגוריה','חודשי','YTD','מגמה'].map(h => (
                        <th key={h} className="py-3 px-4 text-right text-[10px] font-black uppercase tracking-wide" style={{ color: 'var(--theme-text-secondary)', borderBottom: '1px solid var(--theme-border)' }}>{h}</th>
                      ))}</tr>
                    </thead>
                    <tbody>
                      {REVENUE_ROWS.map((row, i) => (
                        <motion.tr key={row.source} initial={{ opacity: 0, x: 8 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.05 }}
                          className="hover:bg-white/[0.025] transition-colors">
                          <td className="py-3 px-4 font-black" style={{ color: 'var(--theme-text)', borderBottom: '1px solid var(--theme-border)' }}>{row.source}</td>
                          <td className="py-3 px-4" style={{ color: 'var(--theme-text-secondary)', borderBottom: '1px solid var(--theme-border)' }}>{row.category}</td>
                          <td className="py-3 px-4 font-mono font-bold" style={{ color: 'var(--theme-text)', borderBottom: '1px solid var(--theme-border)' }}>₪{money(row.monthly)}</td>
                          <td className="py-3 px-4 font-mono text-xs" style={{ color: 'var(--theme-text-secondary)', borderBottom: '1px solid var(--theme-border)' }}>₪{money(row.ytd)}</td>
                          <td className="py-3 px-4" style={{ borderBottom: '1px solid var(--theme-border)' }}>
                            {row.trend === 'up'   && <TrendingUp   className="w-4 h-4 text-emerald-400" />}
                            {row.trend === 'down' && <TrendingDown className="w-4 h-4 text-red-400" />}
                            {row.trend === 'stable' && <span className="text-xs text-white/35">—</span>}
                          </td>
                        </motion.tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr>
                        <td colSpan={2} className="py-4 px-4 font-black text-sm" style={{ color: 'var(--theme-text)', borderTop: '2px solid var(--theme-accent)' }}>סה״כ</td>
                        <td className="py-4 px-4 font-black font-mono" style={{ color: 'var(--theme-accent)', borderTop: '2px solid var(--theme-accent)' }}>₪{money(revenueTotal)}</td>
                        <td className="py-4 px-4 font-bold font-mono text-xs" style={{ color: 'var(--theme-text-secondary)', borderTop: '2px solid var(--theme-accent)' }}>₪{money(revenueYTD)}</td>
                        <td style={{ borderTop: '2px solid var(--theme-accent)' }} />
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </div>

              <div className="app-panel p-6">
                <SectionTitle icon={BarChart3} title="P&L — הכנסות לעומת הוצאות (חודש שוטף)" color="#60a5fa" />
                <div className="space-y-4">
                  {[
                    { label: 'הכנסות',         value: revenueTotal, max: revenueTotal, color: '#34d399' },
                    { label: 'עלויות תפעול',   value: colSums.total * 200, max: revenueTotal, color: '#f97316' },
                    { label: 'ספקים חיצוניים', value: supplierTotal,        max: revenueTotal, color: '#f59e0b' },
                    { label: 'שכר',            value: 320000,               max: revenueTotal, color: '#a78bfa' },
                  ].map(row => (
                    <div key={row.label}>
                      <div className="flex justify-between text-xs mb-1.5">
                        <span style={{ color: 'var(--theme-text)' }} className="font-bold">{row.label}</span>
                        <span className="font-mono" style={{ color: 'var(--theme-text-secondary)' }}>₪{money(row.value)}</span>
                      </div>
                      <UsageBar value={Math.min(row.value, row.max)} max={row.max} color={row.color} />
                    </div>
                  ))}
                </div>
              </div>
            </motion.div>
          )}

          {/* ── CREW ── */}
          {activeTab === 'crew' && (
            <motion.div key="crew" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.22 }} className="space-y-5">
              <motion.div className="grid grid-cols-2 xl:grid-cols-4 gap-4" variants={stagger} initial="hidden" animate="show">
                <motion.div variants={fadeUp}><KpiCard icon={Users}    label="עובדים מחוברים" value={CREW_DATA.filter(c => c.status !== 'off').length} sub={`מתוך ${CREW_DATA.length} משמרת`} color="#34d399" live /></motion.div>
                <motion.div variants={fadeUp}><KpiCard icon={Clock}    label="ממוצע שעות/שבוע" value={Math.round(CREW_DATA.reduce((s, c) => s + c.hoursWeek, 0) / CREW_DATA.length)} sub="יעד: 42 שעות" color="#60a5fa" /></motion.div>
                <motion.div variants={fadeUp}><KpiCard icon={AlertCircle} label="חריגות שעות"   value="1" sub="מיכאל ברגר — תאורה" color="#f59e0b" live /></motion.div>
                <motion.div variants={fadeUp}><KpiCard icon={CheckCircle} label="שביעות רצון"   value="4.6" sub="מדד עובדים Q2/26" color="#a78bfa" /></motion.div>
              </motion.div>

              <div className="app-panel p-6">
                <SectionTitle icon={Users} title="רשימת משמרת — יוני 2026" color="#34d399" badge={<Badge color="#86efac" bg="rgba(34,197,94,0.12)">{CREW_DATA.length} עובדים</Badge>} />
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[680px] text-sm">
                    <thead>
                      <tr>{['שם','תפקיד','מחלקה','משמרת','שעות/שבוע','סטטוס','טלפון'].map(h => (
                        <th key={h} className="py-3 px-4 text-right text-[10px] font-black uppercase tracking-wide" style={{ color: 'var(--theme-text-secondary)', borderBottom: '1px solid var(--theme-border)' }}>{h}</th>
                      ))}</tr>
                    </thead>
                    <tbody>
                      {CREW_DATA.map((member, i) => {
                        const stCfg = { active: { label: 'פעיל', color: '#4ade80', bg: 'rgba(74,222,128,0.12)' }, break: { label: 'הפסקה', color: '#fbbf24', bg: 'rgba(251,191,36,0.12)' }, off: { label: 'חופש', color: '#94a3b8', bg: 'rgba(148,163,184,0.12)' } }[member.status];
                        return (
                          <motion.tr key={member.id} initial={{ opacity: 0, x: 8 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.05 }} className="hover:bg-white/[0.025] transition-colors">
                            <td className="py-3 px-4 font-black" style={{ color: 'var(--theme-text)', borderBottom: '1px solid var(--theme-border)' }}>{member.name}</td>
                            <td className="py-3 px-4 text-xs" style={{ color: 'var(--theme-text-secondary)', borderBottom: '1px solid var(--theme-border)' }}>{member.role}</td>
                            <td className="py-3 px-4 text-xs" style={{ color: 'var(--theme-text-secondary)', borderBottom: '1px solid var(--theme-border)' }}>{member.dept}</td>
                            <td className="py-3 px-4 font-mono text-xs" style={{ color: 'var(--theme-text-secondary)', borderBottom: '1px solid var(--theme-border)' }}>{member.shift}</td>
                            <td className="py-3 px-4" style={{ borderBottom: '1px solid var(--theme-border)' }}>
                              <div className="w-20">
                                <div className="text-xs font-mono mb-1" style={{ color: member.hoursWeek > 44 ? '#fca5a5' : 'var(--theme-text-secondary)' }}>{member.hoursWeek}h</div>
                                <UsageBar value={member.hoursWeek} max={50} color={member.hoursWeek > 44 ? '#f87171' : '#60a5fa'} />
                              </div>
                            </td>
                            <td className="py-3 px-4" style={{ borderBottom: '1px solid var(--theme-border)' }}><Badge color={stCfg.color} bg={stCfg.bg}>{stCfg.label}</Badge></td>
                            <td className="py-3 px-4 font-mono text-xs" style={{ color: 'var(--theme-text-secondary)', borderBottom: '1px solid var(--theme-border)' }}>
                              <a href={`tel:${member.phone}`} className="flex items-center gap-1 hover:text-white transition-colors"><Phone className="w-3 h-3 shrink-0" />{member.phone}</a>
                            </td>
                          </motion.tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </motion.div>
          )}

          {/* ── STUDIOS ── */}
          {activeTab === 'studios' && (
            <motion.div key="studios" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.22 }} className="space-y-5">
              <motion.div className="grid grid-cols-2 xl:grid-cols-4 gap-4" variants={stagger} initial="hidden" animate="show">
                <motion.div variants={fadeUp}><KpiCard icon={Building2} label="אולפנים פעילים" value={STUDIOS_DETAIL.filter(s => s.status === 'active').length} sub={`מתוך ${STUDIOS_DETAIL.length} אולפנים`} color="#34d399" live /></motion.div>
                <motion.div variants={fadeUp}><KpiCard icon={Camera}    label="מצלמות בשימוש"  value={STUDIOS_DETAIL.filter(s => s.status === 'active').reduce((a, s) => a + s.cameras, 0)} sub="מתוך 28 כלל" color="#60a5fa" /></motion.div>
                <motion.div variants={fadeUp}><KpiCard icon={TrendingUp} label="הכנסות היום"   value="₪84K" sub="6 אולפנים × ממוצע ₪14K" color="#a78bfa" /></motion.div>
                <motion.div variants={fadeUp}><KpiCard icon={Package}   label="תפוסה כוללת"    value="78%" sub="יעד: 80%" color="#f97316" /></motion.div>
              </motion.div>

              <motion.div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4" variants={stagger} initial="hidden" animate="show">
                {STUDIOS_DETAIL.map((studio, i) => {
                  const st = STATUS_STUDIO[studio.status];
                  return (
                    <motion.div key={studio.id} variants={fadeUp} className="app-panel p-5 flex flex-col gap-4">
                      <div className="flex items-start justify-between">
                        <div>
                          <h3 className="font-black text-lg" style={{ color: 'var(--theme-text)' }}>{studio.name}</h3>
                          <div className="text-xs mt-0.5" style={{ color: 'var(--theme-text-secondary)' }}>{studio.sqm} מ״ר · עד {studio.capacity} אנשים</div>
                        </div>
                        <Badge color={st.color} bg={st.bg}>{st.label}</Badge>
                      </div>

                      <div className="grid grid-cols-2 gap-2.5 text-xs">
                        <div className="rounded-xl p-2.5" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid var(--theme-border)' }}>
                          <div style={{ color: 'var(--theme-text-secondary)' }}>מצלמות</div>
                          <div className="font-black text-base mt-0.5" style={{ color: '#60a5fa' }}>{studio.cameras}</div>
                        </div>
                        <div className="rounded-xl p-2.5" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid var(--theme-border)' }}>
                          <div style={{ color: 'var(--theme-text-secondary)' }}>תעריף יומי</div>
                          <div className="font-black text-base mt-0.5" style={{ color: 'var(--theme-accent)' }}>₪{money(studio.dailyRate)}</div>
                        </div>
                      </div>

                      {studio.currentClient && (
                        <div className="rounded-xl p-3" style={{ background: 'rgba(74,222,128,0.07)', border: '1px solid rgba(74,222,128,0.18)' }}>
                          <div className="text-[10px] font-bold mb-1" style={{ color: '#4ade80' }}>לקוח נוכחי</div>
                          <div className="font-black text-sm" style={{ color: 'var(--theme-text)' }}>{studio.currentClient}</div>
                        </div>
                      )}

                      {studio.nextBooking && (
                        <div className="flex items-center gap-2 text-xs" style={{ color: 'var(--theme-text-secondary)' }}>
                          <Clock className="w-3 h-3 shrink-0" />
                          הבוקינג הבא: <span className="font-bold" style={{ color: 'var(--theme-text)' }}>{studio.nextBooking}</span>
                        </div>
                      )}

                      <div>
                        <div className="text-[10px] font-bold mb-2" style={{ color: 'var(--theme-text-secondary)' }}>ציוד עיקרי</div>
                        <div className="flex flex-wrap gap-1">
                          {studio.equipment.map(eq => <span key={eq} className="text-[10px] font-semibold rounded-lg px-2 py-0.5" style={{ background: 'rgba(255,255,255,0.06)', color: 'var(--theme-text-secondary)', border: '1px solid var(--theme-border)' }}>{eq}</span>)}
                        </div>
                      </div>
                    </motion.div>
                  );
                })}
              </motion.div>
            </motion.div>
          )}

          {/* ── VANS ── */}
          {activeTab === 'vans' && (
            <motion.div key="vans" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.22 }} className="space-y-5">
              <motion.div className="grid grid-cols-2 xl:grid-cols-4 gap-4" variants={stagger} initial="hidden" animate="show">
                <motion.div variants={fadeUp}><KpiCard icon={Truck}     label="ניידות פרוסות"  value={VANS_DETAIL.filter(v => v.status === 'deployed').length} sub={`מתוך ${VANS_DETAIL.length} ניידות`} color="#34d399" live /></motion.div>
                <motion.div variants={fadeUp}><KpiCard icon={Users}     label="צוותים בשטח"   value={VANS_DETAIL.filter(v => v.status === 'deployed').reduce((a, v) => a + v.crew, 0)} sub="בפריסה פעילה" color="#60a5fa" live /></motion.div>
                <motion.div variants={fadeUp}><KpiCard icon={Wrench}    label="תחזוקה שוטפת"  value={VANS_DETAIL.filter(v => v.status === 'maintenance').length} sub="ניידת במוסך" color="#f59e0b" /></motion.div>
                <motion.div variants={fadeUp}><KpiCard icon={TrendingUp} label="ק״מ השנה"     value="47K" sub="ממוצע 15,700 לניידת" color="#a78bfa" /></motion.div>
              </motion.div>

              <motion.div className="grid grid-cols-1 xl:grid-cols-3 gap-5" variants={stagger} initial="hidden" animate="show">
                {VANS_DETAIL.map((van, i) => {
                  const st = STATUS_VAN[van.status];
                  return (
                    <motion.div key={van.id} variants={fadeUp} className="app-panel p-5 space-y-4">
                      <div className="flex items-start justify-between">
                        <h3 className="font-black text-base leading-snug" style={{ color: 'var(--theme-text)' }}>{van.name}</h3>
                        <Badge color={st.color} bg={st.bg}>{st.label}</Badge>
                      </div>

                      <div className="rounded-xl p-3" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid var(--theme-border)' }}>
                        <div className="flex items-center gap-2 text-xs mb-1" style={{ color: 'var(--theme-text-secondary)' }}>
                          <MapPin className="w-3 h-3 shrink-0" />{van.location}
                        </div>
                        <div className="font-bold text-sm" style={{ color: 'var(--theme-text)' }}>{van.assignment}</div>
                      </div>

                      <div className="grid grid-cols-2 gap-2 text-xs">
                        <div className="rounded-xl p-2.5" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid var(--theme-border)' }}>
                          <div style={{ color: 'var(--theme-text-secondary)' }}>צוות</div>
                          <div className="font-black text-base" style={{ color: '#60a5fa' }}>{van.crew} איש</div>
                        </div>
                        <div className="rounded-xl p-2.5" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid var(--theme-border)' }}>
                          <div style={{ color: 'var(--theme-text-secondary)' }}>ק״מ כולל</div>
                          <div className="font-black text-base font-mono" style={{ color: 'var(--theme-text)' }}>{money(van.km)}</div>
                        </div>
                      </div>

                      <div>
                        <div className="flex items-center justify-between text-xs mb-1.5">
                          <span className="flex items-center gap-1" style={{ color: 'var(--theme-text-secondary)' }}><Fuel className="w-3 h-3" />דלק</span>
                          <span className="font-bold" style={{ color: van.fuel < 30 ? '#fca5a5' : 'var(--theme-text)' }}>{van.fuel}%</span>
                        </div>
                        <UsageBar value={van.fuel} max={100} color={van.fuel < 30 ? '#f87171' : '#34d399'} />
                      </div>

                      <div className="text-xs" style={{ color: 'var(--theme-text-secondary)' }}>
                        שירות אחרון: <span className="font-bold" style={{ color: 'var(--theme-text)' }}>{van.lastService}</span>
                      </div>
                    </motion.div>
                  );
                })}
              </motion.div>
            </motion.div>
          )}

          {/* ── SUPPLIERS ── */}
          {activeTab === 'suppliers' && (
            <motion.div key="suppliers" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.22 }} className="space-y-5">
              <motion.div className="grid grid-cols-2 xl:grid-cols-4 gap-4" variants={stagger} initial="hidden" animate="show">
                <motion.div variants={fadeUp}><KpiCard icon={Package}    label="ספקים פעילים"  value={SUPPLIERS.length} sub="7 קטגוריות" color="#a78bfa" /></motion.div>
                <motion.div variants={fadeUp}><KpiCard icon={TrendingUp} label="הוצאות חודשי"  value={`₪${money(supplierTotal)}`} sub="בגדר תקציב" color="#34d399" /></motion.div>
                <motion.div variants={fadeUp}><KpiCard icon={AlertCircle} label="חשבוניות לטיפול" value={SUPPLIERS.filter(s => s.paymentStatus !== 'שולם').length} sub="1 באיחור" color="#f59e0b" live /></motion.div>
                <motion.div variants={fadeUp}><KpiCard icon={CheckCircle} label="SLA ממוצע"    value={`${Math.round(SUPPLIERS.reduce((a, s) => a + s.sla, 0) / SUPPLIERS.length)}%`} sub="יעד: 95%" color="#60a5fa" /></motion.div>
              </motion.div>

              <div className="app-panel p-6">
                <SectionTitle icon={Package} title="ספקי האולפן — סטטוס תשלומים" color="#a78bfa" />
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[680px] text-sm">
                    <thead>
                      <tr>{['ספק','קטגוריה','טלפון','חודשי','סטטוס','SLA','תשלום הבא'].map(h => (
                        <th key={h} className="py-3 px-4 text-right text-[10px] font-black uppercase tracking-wide" style={{ color: 'var(--theme-text-secondary)', borderBottom: '1px solid var(--theme-border)' }}>{h}</th>
                      ))}</tr>
                    </thead>
                    <tbody>
                      {SUPPLIERS.map((sp, i) => {
                        const pCfg = { 'שולם': { color: '#4ade80', bg: 'rgba(74,222,128,0.12)' }, 'ממתין': { color: '#fbbf24', bg: 'rgba(251,191,36,0.12)' }, 'באיחור': { color: '#f87171', bg: 'rgba(248,113,113,0.12)' } }[sp.paymentStatus];
                        return (
                          <motion.tr key={sp.id} initial={{ opacity: 0, x: 8 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.05 }} className="hover:bg-white/[0.025] transition-colors">
                            <td className="py-3 px-4 font-black" style={{ color: 'var(--theme-text)', borderBottom: '1px solid var(--theme-border)' }}>{sp.name}</td>
                            <td className="py-3 px-4 text-xs" style={{ color: 'var(--theme-text-secondary)', borderBottom: '1px solid var(--theme-border)' }}>{sp.category}</td>
                            <td className="py-3 px-4 font-mono text-xs" style={{ color: 'var(--theme-text-secondary)', borderBottom: '1px solid var(--theme-border)' }}>{sp.contact}</td>
                            <td className="py-3 px-4 font-mono font-bold" style={{ color: 'var(--theme-text)', borderBottom: '1px solid var(--theme-border)' }}>₪{money(sp.monthly)}</td>
                            <td className="py-3 px-4" style={{ borderBottom: '1px solid var(--theme-border)' }}><Badge color={pCfg.color} bg={pCfg.bg}>{sp.paymentStatus}</Badge></td>
                            <td className="py-3 px-4" style={{ borderBottom: '1px solid var(--theme-border)' }}>
                              <div className="w-16">
                                <div className="text-[10px] font-mono mb-1" style={{ color: sp.sla < 90 ? '#fca5a5' : 'var(--theme-text-secondary)' }}>{sp.sla}%</div>
                                <UsageBar value={sp.sla} max={100} color={sp.sla >= 95 ? '#4ade80' : sp.sla >= 90 ? '#fbbf24' : '#f87171'} />
                              </div>
                            </td>
                            <td className="py-3 px-4 font-mono text-xs" style={{ color: 'var(--theme-text-secondary)', borderBottom: '1px solid var(--theme-border)' }}>{sp.nextPayment}</td>
                          </motion.tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </motion.div>
          )}

          {/* ── EQUIPMENT ── */}
          {activeTab === 'equipment' && (
            <motion.div key="equipment" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.22 }} className="space-y-5">
              <motion.div className="grid grid-cols-2 xl:grid-cols-4 gap-4" variants={stagger} initial="hidden" animate="show">
                <motion.div variants={fadeUp}><KpiCard icon={Package}   label="פריטי ציוד"    value={EQUIP_CATS.reduce((a, e) => a + e.total, 0)} sub={`${EQUIP_CATS.reduce((a, e) => a + e.inUse, 0)} בשימוש`} color="#60a5fa" /></motion.div>
                <motion.div variants={fadeUp}><KpiCard icon={Wrench}    label="ציוד בתחזוקה"  value={EQUIP_CATS.reduce((a, e) => a + e.maintenance, 0)} sub="7 קטגוריות" color="#f59e0b" /></motion.div>
                <motion.div variants={fadeUp}><KpiCard icon={TrendingUp} label="שווי מלאי"    value={`₪${(equipValue / 1_000_000).toFixed(1)}M`} sub="ערך תחלופתי" color="#a78bfa" /></motion.div>
                <motion.div variants={fadeUp}><KpiCard icon={CheckCircle} label="זמינות"       value="91%" sub="יעד: 95%" color="#34d399" /></motion.div>
              </motion.div>

              <motion.div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4" variants={stagger} initial="hidden" animate="show">
                {EQUIP_CATS.map((cat, i) => {
                  const CatIcon = cat.icon;
                  const usePct  = Math.round((cat.inUse / cat.total) * 100);
                  return (
                    <motion.div key={cat.category} variants={fadeUp} className="app-panel p-5 space-y-4">
                      <div className="flex items-center gap-3">
                        <div className="rounded-xl p-2.5 shrink-0" style={{ background: `${cat.color}18`, border: `1px solid ${cat.color}28` }}>
                          <CatIcon className="w-4 h-4" style={{ color: cat.color }} />
                        </div>
                        <div>
                          <h3 className="font-black text-sm" style={{ color: 'var(--theme-text)' }}>{cat.category}</h3>
                          <div className="text-[10px]" style={{ color: 'var(--theme-text-secondary)' }}>₪{money(cat.value)} שווי</div>
                        </div>
                      </div>

                      <div className="grid grid-cols-3 gap-2 text-center text-xs">
                        {[['סה״כ', cat.total, 'var(--theme-text)'], ['בשימוש', cat.inUse, cat.color], ['תחזוקה', cat.maintenance, '#f59e0b']].map(([label, val, col]) => (
                          <div key={label as string} className="rounded-xl py-2" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid var(--theme-border)' }}>
                            <div className="font-black text-lg" style={{ color: col as string }}>{val as number}</div>
                            <div style={{ color: 'var(--theme-text-secondary)' }}>{label as string}</div>
                          </div>
                        ))}
                      </div>

                      <div>
                        <div className="flex justify-between text-[10px] mb-1.5" style={{ color: 'var(--theme-text-secondary)' }}>
                          <span>ניצולת</span>
                          <span className="font-bold" style={{ color: usePct > 85 ? '#fbbf24' : 'var(--theme-text-secondary)' }}>{usePct}%</span>
                        </div>
                        <UsageBar value={cat.inUse} max={cat.total} color={cat.color} />
                      </div>
                    </motion.div>
                  );
                })}
              </motion.div>
            </motion.div>
          )}

        </AnimatePresence>
      </div>
    </div>
  );
}
