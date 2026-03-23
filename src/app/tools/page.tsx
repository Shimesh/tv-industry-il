'use client';

import { useState, useEffect, useRef } from 'react';
import {
  Timer, Calculator, Radio, ClipboardCheck, Cloud, Clapperboard,
  Play, Pause, RotateCcw, Plus, Minus, Check, X, Trash2,
  Sun, CloudRain, Wind, Thermometer, Wrench,
  FileText, CheckSquare, Receipt, StickyNote, Lock
} from 'lucide-react';
import { motion } from 'framer-motion';

export default function ToolsPage() {
  return (
    <div className="min-h-screen">
      {/* Hero */}
      <section className="relative overflow-hidden border-b border-[var(--theme-border)]">
        <div className="absolute inset-0 bg-gradient-to-bl from-amber-900/10 via-transparent to-purple-900/10" />
        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 py-8 text-center">
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
            <h1 className="text-3xl font-black gradient-text mb-2">ארגז כלים 🛠️</h1>
            <p className="text-[var(--theme-text-secondary)] text-sm">כלים מקצועיים לאנשי הפקה וצוות טלוויזיה</p>
          </motion.div>
        </div>
      </section>

      {/* Tools Grid */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 py-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <ProductionTimer />
          <BroadcastCountdown />
          <CostCalculator />
          <EquipmentChecklist />
          <WeatherWidget />
          <ClapperBoard />
        </div>

        {/* Coming Soon */}
        <h2 className="text-lg font-bold mt-10 mb-4" style={{ color: 'var(--theme-text)' }}>בקרוב...</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 pb-8">
          {([
            { icon: FileText, title: 'קורא Call Sheet', desc: 'העלה קובץ Call Sheet ופענח אותו אוטומטית', gradient: 'from-blue-600 to-cyan-500' },
            { icon: CheckSquare, title: "צ'קליסט ציוד", desc: 'רשימת ציוד מותאמת לסוג ההפקה', gradient: 'from-green-600 to-emerald-500' },
            { icon: Receipt, title: 'עוזר חשבוניות', desc: 'הפקת חשבוניות ומעקב תשלומים', gradient: 'from-orange-600 to-amber-500' },
            { icon: StickyNote, title: 'פנקס הפקה', desc: 'רשימות, הערות ומעקב משימות להפקה', gradient: 'from-purple-600 to-pink-500' },
          ] as const).map((tool, i) => {
            const Icon = tool.icon;
            return (
              <motion.div
                key={tool.title}
                initial={{ opacity: 0, y: 10 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.05, duration: 0.3 }}
                className="relative rounded-2xl border p-5 overflow-hidden group"
                style={{ background: 'var(--theme-bg-card)', borderColor: 'var(--theme-border)' }}
              >
                <div className={`absolute inset-0 bg-gradient-to-br ${tool.gradient} opacity-[0.03] group-hover:opacity-[0.06] transition-opacity`} />
                <div className="relative">
                  <div className="flex items-center gap-3 mb-3">
                    <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${tool.gradient} flex items-center justify-center opacity-60`}>
                      <Icon className="w-5 h-5 text-white" />
                    </div>
                    <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-bold" style={{ background: 'var(--theme-bg-secondary)', color: 'var(--theme-text-secondary)' }}>
                      <Lock className="w-3 h-3" />
                      בקרוב
                    </div>
                  </div>
                  <h3 className="font-bold text-sm mb-1" style={{ color: 'var(--theme-text)' }}>{tool.title}</h3>
                  <p className="text-xs leading-relaxed" style={{ color: 'var(--theme-text-secondary)' }}>{tool.desc}</p>
                </div>
              </motion.div>
            );
          })}
        </div>
      </section>
    </div>
  );
}

/* ========== Production Timer ========== */
function ProductionTimer() {
  const [time, setTime] = useState(0);
  const [running, setRunning] = useState(false);
  const [laps, setLaps] = useState<number[]>([]);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (running) {
      intervalRef.current = setInterval(() => setTime(t => t + 10), 10);
    } else if (intervalRef.current) {
      clearInterval(intervalRef.current);
    }
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [running]);

  const formatTime = (ms: number) => {
    const minutes = Math.floor(ms / 60000);
    const seconds = Math.floor((ms % 60000) / 1000);
    const centiseconds = Math.floor((ms % 1000) / 10);
    return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}.${centiseconds.toString().padStart(2, '0')}`;
  };

  return (
    <ToolCard title="טיימר הפקה" icon={<Timer className="w-5 h-5" />} color="from-blue-500 to-cyan-500">
      <div className="text-center">
        <p className="text-4xl font-mono font-black text-[var(--theme-text)] mb-4" dir="ltr">
          {formatTime(time)}
        </p>
        <div className="flex items-center justify-center gap-2">
          <button
            onClick={() => setRunning(!running)}
            className={`px-5 py-2 rounded-xl font-bold text-sm text-white transition-all ${
              running ? 'bg-yellow-500 hover:bg-yellow-600' : 'bg-green-500 hover:bg-green-600'
            }`}
          >
            {running ? <Pause className="w-4 h-4 inline ml-1" /> : <Play className="w-4 h-4 inline ml-1" />}
            {running ? 'עצור' : 'התחל'}
          </button>
          <button
            onClick={() => laps.length < 10 && setLaps([time, ...laps])}
            disabled={!running}
            className="px-4 py-2 rounded-xl border border-[var(--theme-border)] text-sm font-bold text-[var(--theme-text-secondary)] hover:bg-[var(--theme-accent-glow)] transition-all disabled:opacity-30"
          >
            הקפה
          </button>
          <button
            onClick={() => { setTime(0); setRunning(false); setLaps([]); }}
            className="p-2 rounded-xl border border-[var(--theme-border)] text-[var(--theme-text-secondary)] hover:text-red-400 hover:border-red-500/30 transition-all"
          >
            <RotateCcw className="w-4 h-4" />
          </button>
        </div>
        {laps.length > 0 && (
          <div className="mt-3 max-h-24 overflow-y-auto space-y-1">
            {laps.map((lap, i) => (
              <div key={i} className="flex items-center justify-between px-3 py-1 rounded-lg bg-[var(--theme-bg)] text-xs">
                <span className="text-[var(--theme-text-secondary)]">הקפה {laps.length - i}</span>
                <span className="font-mono text-[var(--theme-text)]" dir="ltr">{formatTime(lap)}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </ToolCard>
  );
}

/* ========== Broadcast Countdown ========== */
function BroadcastCountdown() {
  const [targetTime, setTargetTime] = useState('20:00');
  const [remaining, setRemaining] = useState('');
  const [totalSec, setTotalSec] = useState(-1);
  const [isLive, setIsLive] = useState(false);
  const [stopped, setStopped] = useState(false);
  const lastBeepRef = useRef(-1);
  const audioCtxRef = useRef<AudioContext | null>(null);

  const playBeep = (freq: number = 880, dur: number = 0.12) => {
    try {
      if (!audioCtxRef.current) audioCtxRef.current = new AudioContext();
      const ctx = audioCtxRef.current;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.25, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + dur);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + dur);
    } catch {}
  };

  useEffect(() => {
    if (stopped) return;
    const timer = setInterval(() => {
      const now = new Date();
      const [hours, minutes] = targetTime.split(':').map(Number);
      const target = new Date();
      target.setHours(hours, minutes, 0, 0);

      // If target already passed and we're not near it, set for tomorrow
      const diff = target.getTime() - now.getTime();
      if (diff < -2000) {
        target.setDate(target.getDate() + 1);
      }

      const newDiff = target.getTime() - now.getTime();
      if (newDiff <= 0) {
        setIsLive(true);
        setStopped(true);
        setRemaining('ON AIR!');
        setTotalSec(0);
        playBeep(1200, 0.5);
        return;
      }

      const sec = Math.ceil(newDiff / 1000);
      setTotalSec(sec);
      setIsLive(false);

      // Beep in last 10 seconds (once per second)
      if (sec <= 10 && sec !== lastBeepRef.current) {
        lastBeepRef.current = sec;
        playBeep(sec <= 3 ? 1100 : 880, sec <= 3 ? 0.2 : 0.1);
      }

      const h = Math.floor(newDiff / 3600000);
      const m = Math.floor((newDiff % 3600000) / 60000);
      const s = Math.floor((newDiff % 60000) / 1000);
      setRemaining(`${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`);
    }, 200);
    return () => clearInterval(timer);
  }, [targetTime, stopped]);

  const reset = () => {
    setStopped(false);
    setIsLive(false);
    setTotalSec(-1);
    lastBeepRef.current = -1;
  };

  const flashClass = isLive ? 'text-red-500 pulse-live' :
    totalSec <= 5 && totalSec > 0 ? 'countdown-flash-intense' :
    totalSec <= 10 && totalSec > 0 ? 'countdown-flash' :
    'text-[var(--theme-text)]';

  return (
    <ToolCard title="ספירה לאחור לשידור" icon={<Radio className="w-5 h-5" />} color="from-red-500 to-pink-500">
      <div className="text-center">
        <div className={`text-5xl font-mono font-black mb-4 transition-all ${flashClass}`} dir="ltr"
          style={totalSec <= 10 && totalSec > 0 ? { textShadow: '0 0 30px rgba(239,68,68,0.4)' } : undefined}>
          {remaining || '--:--:--'}
        </div>
        {totalSec <= 10 && totalSec > 0 && (
          <div className="mb-3">
            <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-red-500/20 border border-red-500/30">
              <span className="w-2 h-2 rounded-full bg-red-500 pulse-live" />
              <span className="text-red-400 font-bold text-sm">{totalSec} שניות לשידור</span>
            </div>
          </div>
        )}
        {isLive && (
          <div className="flex items-center justify-center gap-2 mb-3">
            <div className="inline-flex items-center gap-2 px-5 py-2 rounded-full bg-red-600 shadow-lg shadow-red-500/30">
              <span className="w-3 h-3 rounded-full bg-white pulse-live" />
              <span className="text-white font-black text-lg tracking-wider">ON AIR</span>
            </div>
          </div>
        )}
        <div className="flex items-center justify-center gap-2">
          <label className="text-sm text-[var(--theme-text-secondary)]">שעת שידור:</label>
          <input
            type="time"
            value={targetTime}
            onChange={e => { setTargetTime(e.target.value); reset(); }}
            className="px-3 py-1.5 rounded-lg text-sm outline-none"
            style={{ background: 'var(--theme-bg)', border: '1px solid var(--theme-border)', color: 'var(--theme-text)' }}
          />
          {stopped && (
            <button onClick={reset} className="px-3 py-1.5 rounded-lg text-xs font-bold bg-[var(--theme-bg-secondary)] text-[var(--theme-text-secondary)] hover:text-[var(--theme-accent)] border border-[var(--theme-border)] transition-all flex items-center gap-1">
              <RotateCcw className="w-3 h-3" /> איפוס
            </button>
          )}
        </div>
      </div>
    </ToolCard>
  );
}

/* ========== Cost Calculator ========== */
function CostCalculator() {
  const [items, setItems] = useState([
    { name: 'צלם', days: 1, rate: 2500 },
    { name: 'עורך', days: 1, rate: 2000 },
  ]);

  const addItem = () => setItems([...items, { name: '', days: 1, rate: 0 }]);
  const removeItem = (i: number) => setItems(items.filter((_, idx) => idx !== i));
  const updateItem = (i: number, field: string, value: string | number) => {
    setItems(items.map((item, idx) => idx === i ? { ...item, [field]: value } : item));
  };

  const total = items.reduce((sum, item) => sum + (item.days * item.rate), 0);

  return (
    <ToolCard title="מחשבון עלויות הפקה" icon={<Calculator className="w-5 h-5" />} color="from-green-500 to-emerald-500">
      <div className="space-y-2">
        {items.map((item, i) => (
          <div key={i} className="flex items-center gap-2">
            <input
              type="text"
              value={item.name}
              onChange={e => updateItem(i, 'name', e.target.value)}
              placeholder="פריט"
              className="flex-1 px-2 py-1.5 rounded-lg text-xs outline-none"
              style={{ background: 'var(--theme-bg)', border: '1px solid var(--theme-border)', color: 'var(--theme-text)' }}
            />
            <input
              type="number"
              value={item.days}
              onChange={e => updateItem(i, 'days', parseInt(e.target.value) || 0)}
              className="w-14 px-2 py-1.5 rounded-lg text-xs outline-none text-center"
              style={{ background: 'var(--theme-bg)', border: '1px solid var(--theme-border)', color: 'var(--theme-text)' }}
              placeholder="ימים"
            />
            <input
              type="number"
              value={item.rate}
              onChange={e => updateItem(i, 'rate', parseInt(e.target.value) || 0)}
              className="w-20 px-2 py-1.5 rounded-lg text-xs outline-none text-center"
              style={{ background: 'var(--theme-bg)', border: '1px solid var(--theme-border)', color: 'var(--theme-text)' }}
              placeholder="₪ ליום"
            />
            <span className="text-xs font-mono text-[var(--theme-text)] w-16 text-left">₪{(item.days * item.rate).toLocaleString()}</span>
            <button onClick={() => removeItem(i)} className="p-1 text-red-400 hover:bg-red-500/10 rounded-lg">
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        ))}
        <button onClick={addItem} className="w-full py-1.5 rounded-lg border border-dashed border-[var(--theme-border)] text-xs text-[var(--theme-text-secondary)] hover:border-[var(--theme-accent)] hover:text-[var(--theme-accent)] transition-all flex items-center justify-center gap-1">
          <Plus className="w-3.5 h-3.5" />
          הוסף שורה
        </button>
        <div className="flex items-center justify-between pt-2 border-t border-[var(--theme-border)]">
          <span className="text-sm font-bold text-[var(--theme-text)]">סה&quot;כ</span>
          <span className="text-lg font-black text-green-400">₪{total.toLocaleString()}</span>
        </div>
      </div>
    </ToolCard>
  );
}

/* ========== Equipment Checklist ========== */
function EquipmentChecklist() {
  const [items, setItems] = useState([
    { text: 'מצלמה ראשית + סוללות', checked: false },
    { text: 'עדשות (24-70, 70-200)', checked: false },
    { text: 'חצובה + ראש', checked: false },
    { text: 'תאורה (3 פנסים)', checked: false },
    { text: 'מיקרופון + בום', checked: false },
    { text: 'כרטיסי זיכרון (x4)', checked: false },
    { text: 'מוניטור שטח', checked: false },
    { text: 'רפלקטור', checked: false },
  ]);
  const [newItem, setNewItem] = useState('');

  const toggle = (i: number) => setItems(items.map((item, idx) => idx === i ? { ...item, checked: !item.checked } : item));
  const removeItem = (i: number) => setItems(items.filter((_, idx) => idx !== i));
  const addItem = () => {
    if (newItem.trim()) {
      setItems([...items, { text: newItem.trim(), checked: false }]);
      setNewItem('');
    }
  };

  const checkedCount = items.filter(i => i.checked).length;
  const progress = items.length > 0 ? (checkedCount / items.length) * 100 : 0;

  return (
    <ToolCard title="צ'קליסט ציוד" icon={<ClipboardCheck className="w-5 h-5" />} color="from-purple-500 to-indigo-500">
      <div>
        {/* Progress */}
        <div className="flex items-center gap-2 mb-3">
          <div className="flex-1 h-2 rounded-full bg-[var(--theme-bg)] overflow-hidden">
            <div className="h-full rounded-full bg-gradient-to-l from-green-500 to-emerald-400 transition-all" style={{ width: `${progress}%` }} />
          </div>
          <span className="text-xs font-bold text-[var(--theme-text-secondary)]">{checkedCount}/{items.length}</span>
        </div>

        {/* Items */}
        <div className="space-y-1 max-h-48 overflow-y-auto">
          {items.map((item, i) => (
            <div key={i} className="flex items-center gap-2 group">
              <button
                onClick={() => toggle(i)}
                className={`w-5 h-5 rounded border shrink-0 flex items-center justify-center transition-all ${
                  item.checked
                    ? 'bg-green-500 border-green-500 text-white'
                    : 'border-[var(--theme-border)] hover:border-[var(--theme-accent)]'
                }`}
              >
                {item.checked && <Check className="w-3 h-3" />}
              </button>
              <span className={`flex-1 text-xs ${item.checked ? 'line-through text-[var(--theme-text-secondary)]' : 'text-[var(--theme-text)]'}`}>
                {item.text}
              </span>
              <button onClick={() => removeItem(i)} className="opacity-0 group-hover:opacity-100 p-0.5 text-red-400 transition-opacity">
                <X className="w-3 h-3" />
              </button>
            </div>
          ))}
        </div>

        {/* Add item */}
        <div className="flex gap-1.5 mt-2">
          <input
            type="text"
            value={newItem}
            onChange={e => setNewItem(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && addItem()}
            placeholder="הוסף פריט..."
            className="flex-1 px-3 py-1.5 rounded-lg text-xs outline-none"
            style={{ background: 'var(--theme-bg)', border: '1px solid var(--theme-border)', color: 'var(--theme-text)' }}
          />
          <button onClick={addItem} className="px-3 py-1.5 rounded-lg bg-[var(--theme-accent-glow)] text-[var(--theme-accent)] text-xs font-bold">
            <Plus className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </ToolCard>
  );
}

/* ========== Weather Widget ========== */
const CITIES = [
  { name: 'תל אביב', lat: 32.0853, lon: 34.7818 },
  { name: 'ירושלים', lat: 31.7683, lon: 35.2137 },
  { name: 'חיפה', lat: 32.794, lon: 34.9896 },
  { name: 'באר שבע', lat: 31.253, lon: 34.7915 },
  { name: 'אילת', lat: 29.5577, lon: 34.9519 },
  { name: 'צפת', lat: 32.9646, lon: 35.496 },
  { name: 'נתניה', lat: 32.3215, lon: 34.8532 },
  { name: 'אשדוד', lat: 31.804, lon: 34.6553 },
];

const WMO_CODES: Record<number, { label: string; emoji: string; icon: typeof Sun }> = {
  0: { label: 'בהיר', emoji: '☀️', icon: Sun },
  1: { label: 'בהיר חלקית', emoji: '🌤️', icon: Sun },
  2: { label: 'מעונן חלקית', emoji: '⛅', icon: Cloud },
  3: { label: 'מעונן', emoji: '☁️', icon: Cloud },
  45: { label: 'ערפל', emoji: '🌫️', icon: Cloud },
  48: { label: 'ערפל כבד', emoji: '🌫️', icon: Cloud },
  51: { label: 'טפטוף קל', emoji: '🌦️', icon: CloudRain },
  53: { label: 'טפטוף', emoji: '🌦️', icon: CloudRain },
  55: { label: 'טפטוף חזק', emoji: '🌦️', icon: CloudRain },
  61: { label: 'גשם קל', emoji: '🌧️', icon: CloudRain },
  63: { label: 'גשם', emoji: '🌧️', icon: CloudRain },
  65: { label: 'גשם חזק', emoji: '🌧️', icon: CloudRain },
  80: { label: 'ממטרים', emoji: '🌦️', icon: CloudRain },
  81: { label: 'ממטרים חזקים', emoji: '🌧️', icon: CloudRain },
  95: { label: 'סופת רעמים', emoji: '⛈️', icon: CloudRain },
};

function getWmoInfo(code: number) {
  return WMO_CODES[code] || WMO_CODES[Math.floor(code / 10) * 10] || { label: 'לא ידוע', emoji: '❓', icon: Cloud };
}

interface WeatherData {
  temp: number;
  humidity: number;
  windSpeed: number;
  weatherCode: number;
  daily: { date: string; maxTemp: number; minTemp: number; weatherCode: number }[];
}

function WeatherWidget() {
  const [cityIdx, setCityIdx] = useState(0);
  const [weather, setWeather] = useState<WeatherData | null>(null);
  const [loading, setLoading] = useState(true);
  const [lastUpdate, setLastUpdate] = useState('');

  const fetchWeather = async (city: typeof CITIES[0]) => {
    setLoading(true);
    try {
      const res = await fetch(
        `https://api.open-meteo.com/v1/forecast?latitude=${city.lat}&longitude=${city.lon}&current=temperature_2m,relative_humidity_2m,wind_speed_10m,weather_code&daily=weather_code,temperature_2m_max,temperature_2m_min&timezone=Asia/Jerusalem&forecast_days=7`
      );
      const data = await res.json();
      setWeather({
        temp: Math.round(data.current.temperature_2m),
        humidity: data.current.relative_humidity_2m,
        windSpeed: Math.round(data.current.wind_speed_10m),
        weatherCode: data.current.weather_code,
        daily: data.daily.time.map((date: string, i: number) => ({
          date,
          maxTemp: Math.round(data.daily.temperature_2m_max[i]),
          minTemp: Math.round(data.daily.temperature_2m_min[i]),
          weatherCode: data.daily.weather_code[i],
        })),
      });
      setLastUpdate(new Date().toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' }));
    } catch { setWeather(null); }
    setLoading(false);
  };

  useEffect(() => {
    fetchWeather(CITIES[cityIdx]);
    const interval = setInterval(() => fetchWeather(CITIES[cityIdx]), 30 * 60 * 1000);
    return () => clearInterval(interval);
  }, [cityIdx]);

  const dayName = (dateStr: string, idx: number) => {
    if (idx === 0) return 'היום';
    if (idx === 1) return 'מחר';
    return new Date(dateStr).toLocaleDateString('he-IL', { weekday: 'short' });
  };

  const city = CITIES[cityIdx];
  const current = weather ? getWmoInfo(weather.weatherCode) : null;
  const CurrentIcon = current?.icon || Sun;

  return (
    <ToolCard title="מזג אוויר לצילומים" icon={<Cloud className="w-5 h-5" />} color="from-cyan-500 to-blue-500">
      <div>
        {/* City selector */}
        <div className="flex items-center gap-2 mb-3">
          <select
            value={cityIdx}
            onChange={e => setCityIdx(Number(e.target.value))}
            className="flex-1 px-3 py-1.5 rounded-lg text-sm outline-none cursor-pointer"
            style={{ background: 'var(--theme-bg)', border: '1px solid var(--theme-border)', color: 'var(--theme-text)' }}
          >
            {CITIES.map((c, i) => <option key={c.name} value={i}>{c.name}</option>)}
          </select>
          {lastUpdate && <span className="text-[10px] text-[var(--theme-text-secondary)]">עודכן {lastUpdate}</span>}
        </div>

        {loading ? (
          <div className="text-center py-6">
            <div className="w-8 h-8 mx-auto rounded-full border-2 border-[var(--theme-accent)] border-t-transparent animate-spin" />
            <p className="text-xs text-[var(--theme-text-secondary)] mt-2">טוען...</p>
          </div>
        ) : weather && current ? (
          <>
            <div className="text-center mb-3">
              <div className="flex items-center justify-center gap-4 mb-1">
                <div className="text-4xl">{current.emoji}</div>
                <div>
                  <p className="text-3xl font-black text-[var(--theme-text)]">{weather.temp}°C</p>
                  <p className="text-sm text-[var(--theme-text-secondary)]">{city.name} • {current.label}</p>
                </div>
              </div>
              <div className="flex items-center justify-center gap-4 text-xs text-[var(--theme-text-secondary)]">
                <span className="flex items-center gap-1"><Thermometer className="w-3 h-3" /> לחות {weather.humidity}%</span>
                <span className="flex items-center gap-1"><Wind className="w-3 h-3" /> רוח {weather.windSpeed} קמ&quot;ש</span>
              </div>
            </div>

            {/* 7-day forecast */}
            <div className="grid grid-cols-7 gap-1">
              {weather.daily.map((day, i) => {
                const info = getWmoInfo(day.weatherCode);
                return (
                  <div key={day.date} className="text-center p-1.5 rounded-lg bg-[var(--theme-bg)]">
                    <p className="text-[10px] text-[var(--theme-text-secondary)] mb-0.5 truncate">{dayName(day.date, i)}</p>
                    <div className="text-base mb-0.5">{info.emoji}</div>
                    <p className="text-[10px] font-bold text-[var(--theme-text)]">{day.maxTemp}°</p>
                    <p className="text-[10px] text-[var(--theme-text-secondary)]">{day.minTemp}°</p>
                  </div>
                );
              })}
            </div>
          </>
        ) : (
          <div className="text-center py-4">
            <p className="text-sm text-red-400">שגיאה בטעינת נתונים</p>
            <button onClick={() => fetchWeather(city)} className="mt-2 text-xs text-[var(--theme-accent)] hover:underline">נסה שוב</button>
          </div>
        )}
      </div>
    </ToolCard>
  );
}

/* ========== Clapper Board ========== */
function ClapperBoard() {
  const [scene, setScene] = useState(1);
  const [take, setTake] = useState(1);
  const [showClap, setShowClap] = useState(false);

  const clap = () => {
    setShowClap(true);
    setTimeout(() => setShowClap(false), 500);
  };

  return (
    <ToolCard title="קלאפר דיגיטלי" icon={<Clapperboard className="w-5 h-5" />} color="from-yellow-500 to-amber-500">
      <div className="text-center">
        <motion.div
          animate={showClap ? { rotate: [-5, 5, -5, 0], scale: [1, 1.05, 1] } : {}}
          transition={{ duration: 0.3 }}
          className="inline-block mb-4 p-4 rounded-xl bg-gradient-to-br from-gray-900 to-gray-800 border border-gray-700 min-w-[200px]"
        >
          <div className="flex items-center justify-between text-white text-xs mb-2 border-b border-gray-600 pb-1">
            <span>TV Industry IL</span>
            <span>{new Date().toLocaleDateString('he-IL')}</span>
          </div>
          <div className="flex items-center justify-center gap-6">
            <div>
              <p className="text-xs text-gray-400">סצנה</p>
              <p className="text-2xl font-mono font-black text-white">{scene}</p>
            </div>
            <div className="w-px h-10 bg-gray-600" />
            <div>
              <p className="text-xs text-gray-400">טייק</p>
              <p className="text-2xl font-mono font-black text-white">{take}</p>
            </div>
          </div>
        </motion.div>

        <div className="flex items-center justify-center gap-2">
          <div className="flex items-center gap-1">
            <label className="text-xs text-[var(--theme-text-secondary)]">סצנה:</label>
            <button onClick={() => setScene(Math.max(1, scene - 1))} className="p-1 rounded bg-[var(--theme-bg)] text-[var(--theme-text-secondary)]">
              <Minus className="w-3 h-3" />
            </button>
            <span className="w-8 text-center text-sm font-bold text-[var(--theme-text)]">{scene}</span>
            <button onClick={() => setScene(scene + 1)} className="p-1 rounded bg-[var(--theme-bg)] text-[var(--theme-text-secondary)]">
              <Plus className="w-3 h-3" />
            </button>
          </div>
          <div className="flex items-center gap-1">
            <label className="text-xs text-[var(--theme-text-secondary)]">טייק:</label>
            <button onClick={() => setTake(Math.max(1, take - 1))} className="p-1 rounded bg-[var(--theme-bg)] text-[var(--theme-text-secondary)]">
              <Minus className="w-3 h-3" />
            </button>
            <span className="w-8 text-center text-sm font-bold text-[var(--theme-text)]">{take}</span>
            <button onClick={() => setTake(take + 1)} className="p-1 rounded bg-[var(--theme-bg)] text-[var(--theme-text-secondary)]">
              <Plus className="w-3 h-3" />
            </button>
          </div>
          <button
            onClick={clap}
            className="px-4 py-2 rounded-xl bg-gradient-to-l from-yellow-500 to-amber-500 text-white text-sm font-bold hover:shadow-lg transition-all"
          >
            🎬 CLAP
          </button>
        </div>
      </div>
    </ToolCard>
  );
}

/* ========== Tool Card Wrapper ========== */
function ToolCard({ title, icon, color, children }: { title: string; icon: React.ReactNode; color: string; children: React.ReactNode }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-xl border overflow-hidden"
      style={{ background: 'var(--theme-bg-card)', borderColor: 'var(--theme-border)' }}
    >
      <div className={`h-1 bg-gradient-to-l ${color}`} />
      <div className="p-5">
        <h3 className="text-base font-bold text-[var(--theme-text)] mb-4 flex items-center gap-2">
          <span className="text-[var(--theme-accent)]">{icon}</span>
          {title}
        </h3>
        {children}
      </div>
    </motion.div>
  );
}
