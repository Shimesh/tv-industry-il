'use client';

import { useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { Cloud, CloudRain, CloudSun, MapPin, Sunrise, Sunset, Zap } from 'lucide-react';

type WeatherKind = 'sunny' | 'rain' | 'thunder' | 'cloudy';

type WeatherCity = {
  key: string;
  city: string;
  latitude: number;
  longitude: number;
};

type WeatherState = {
  key: string;
  city: string;
  temperature: number | null;
  code: number | null;
  sunrise: string | null;
  sunset: string | null;
  fetchedAt: number;
};

const WEATHER_CACHE_KEY = 'tv-home-weather-cache-v8';
const WEATHER_CACHE_TTL_MS = 15 * 60 * 1000;

const WEATHER_CITIES: WeatherCity[] = [
  { key: 'tel-aviv', city: 'תל אביב', latitude: 32.0853, longitude: 34.7818 },
  { key: 'jerusalem', city: 'ירושלים', latitude: 31.7683, longitude: 35.2137 },
  { key: 'beer-sheva', city: 'באר שבע', latitude: 31.2529, longitude: 34.7915 },
  { key: 'haifa', city: 'חיפה', latitude: 32.794, longitude: 34.9896 },
];

function getWeatherKind(code: number | null): WeatherKind {
  if (code === null) return 'cloudy';
  if (code === 0 || code === 1) return 'sunny';
  if ((code >= 51 && code <= 67) || (code >= 80 && code <= 82)) return 'rain';
  if (code >= 95 && code <= 99) return 'thunder';
  return 'cloudy';
}

function readWeatherCache(): WeatherState[] | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.sessionStorage.getItem(WEATHER_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<WeatherState>[];
    if (!Array.isArray(parsed) || parsed.length !== WEATHER_CITIES.length) return null;
    if (!parsed.some((item) => typeof item?.temperature === 'number')) return null;
    const fetchedAt = parsed[0]?.fetchedAt;
    if (typeof fetchedAt !== 'number' || Date.now() - fetchedAt >= WEATHER_CACHE_TTL_MS) return null;
    return WEATHER_CITIES.map((city) => {
      const item = parsed.find((entry) => entry?.key === city.key);
      return {
        key: city.key,
        city: city.city,
        temperature: typeof item?.temperature === 'number' ? item.temperature : null,
        code: typeof item?.code === 'number' ? item.code : null,
        sunrise: typeof item?.sunrise === 'string' ? item.sunrise : null,
        sunset: typeof item?.sunset === 'string' ? item.sunset : null,
        fetchedAt,
      };
    });
  } catch {}
  return null;
}

function writeWeatherCache(weather: WeatherState[]) {
  if (typeof window === 'undefined') return;
  if (!weather.some((item) => typeof item.temperature === 'number')) return;
  try {
    window.sessionStorage.setItem(WEATHER_CACHE_KEY, JSON.stringify(weather));
  } catch {}
}

function emptyWeatherState(city: WeatherCity): WeatherState {
  return { key: city.key, city: city.city, temperature: null, code: null, sunrise: null, sunset: null, fetchedAt: Date.now() };
}

async function fetchCityWeather(city: WeatherCity): Promise<WeatherState> {
  const response = await fetch(`/api/weather?latitude=${city.latitude}&longitude=${city.longitude}&astronomy=1`);
  if (!response.ok) throw new Error(`Weather request failed for ${city.key}`);
  const weatherData = await response.json();
  const current = weatherData?.current;
  const temperature = typeof current?.temperature_2m === 'number' ? Math.round(current.temperature_2m) : null;
  const code = typeof current?.weather_code === 'number' ? current.weather_code : null;
  const sunrise = typeof weatherData?.daily?.sunrise?.[0] === 'string' ? weatherData.daily.sunrise[0] : null;
  const sunset = typeof weatherData?.daily?.sunset?.[0] === 'string' ? weatherData.daily.sunset[0] : null;
  return { key: city.key, city: city.city, temperature, code, sunrise, sunset, fetchedAt: Date.now() };
}

async function fetchWeather(): Promise<WeatherState[]> {
  const results = await Promise.allSettled(WEATHER_CITIES.map(fetchCityWeather));
  return WEATHER_CITIES.map((city, index) => {
    const result = results[index];
    return result.status === 'fulfilled' ? result.value : emptyWeatherState(city);
  });
}

function formatSunTime(value: string | null | undefined): string {
  if (!value) return '--:--';
  const parsed = Date.parse(value.includes('T') ? value : `1970-01-01 ${value}`);
  if (Number.isNaN(parsed)) return '--:--';
  return new Date(parsed).toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' });
}

// Per-weather-type card visual config
function getCardConfig(kind: WeatherKind, heatwave: boolean) {
  if (heatwave) return {
    gradient: 'radial-gradient(ellipse 100% 65% at 50% 0%, rgba(251,146,60,0.48) 0%, rgba(185,28,28,0.22) 60%, transparent 100%)',
    border: 'rgba(251,146,60,0.38)',
    bottomGlow: 'rgba(251,146,60,0.18)',
    breatheDuration: 2.8,
  };
  if (kind === 'sunny') return {
    gradient: 'radial-gradient(ellipse 100% 65% at 50% 0%, rgba(251,191,36,0.42) 0%, rgba(14,165,233,0.18) 60%, transparent 100%)',
    border: 'rgba(251,191,36,0.32)',
    bottomGlow: 'rgba(251,191,36,0.16)',
    breatheDuration: 3.5,
  };
  if (kind === 'rain') return {
    gradient: 'radial-gradient(ellipse 100% 65% at 50% 0%, rgba(56,189,248,0.40) 0%, rgba(37,99,235,0.20) 60%, transparent 100%)',
    border: 'rgba(56,189,248,0.30)',
    bottomGlow: 'rgba(56,189,248,0.16)',
    breatheDuration: 2.5,
  };
  if (kind === 'thunder') return {
    gradient: 'radial-gradient(ellipse 100% 65% at 50% 0%, rgba(168,85,247,0.42) 0%, rgba(88,28,235,0.20) 60%, transparent 100%)',
    border: 'rgba(168,85,247,0.30)',
    bottomGlow: 'rgba(168,85,247,0.16)',
    breatheDuration: 1.8,
  };
  return {
    gradient: 'radial-gradient(ellipse 100% 65% at 50% 0%, rgba(148,163,184,0.28) 0%, rgba(71,85,105,0.14) 60%, transparent 100%)',
    border: 'rgba(148,163,184,0.20)',
    bottomGlow: 'rgba(148,163,184,0.10)',
    breatheDuration: 4,
  };
}

function getTempStyle(temp: number | null): React.CSSProperties {
  if (temp === null) return { color: 'rgba(255,255,255,0.55)' };
  if (temp >= 36) return {
    color: '#fca5a5',
    textShadow: '0 0 18px rgba(252,165,165,0.75), 0 0 36px rgba(239,68,68,0.45), 0 0 60px rgba(239,68,68,0.22)',
  };
  if (temp >= 30) return {
    color: '#fdba74',
    textShadow: '0 0 18px rgba(253,186,116,0.75), 0 0 36px rgba(249,115,22,0.45), 0 0 60px rgba(249,115,22,0.22)',
  };
  if (temp >= 20) return {
    color: '#fde68a',
    textShadow: '0 0 18px rgba(253,230,138,0.65), 0 0 36px rgba(245,158,11,0.35)',
  };
  if (temp >= 10) return {
    color: '#bae6fd',
    textShadow: '0 0 18px rgba(186,230,253,0.65), 0 0 36px rgba(14,165,233,0.35)',
  };
  return {
    color: '#93c5fd',
    textShadow: '0 0 18px rgba(147,197,253,0.65), 0 0 36px rgba(59,130,246,0.35)',
  };
}

// Animated weather icons
function SunIcon() {
  return (
    <div className="relative flex h-7 w-7 items-center justify-center overflow-hidden rounded-full">
      <motion.div
        className="absolute inset-0 rounded-full"
        style={{ background: 'radial-gradient(circle, rgba(251,191,36,0.55), transparent 70%)' }}
        animate={{ scale: [1, 1.65, 1], opacity: [0.4, 0.85, 0.4] }}
        transition={{ duration: 2.5, repeat: Infinity, ease: 'easeInOut' }}
      />
      <motion.div
        className="absolute rounded-full"
        style={{ inset: '18%', background: 'rgba(251,191,36,0.35)' }}
        animate={{ scale: [1, 1.35, 1], opacity: [0.5, 0.95, 0.5] }}
        transition={{ duration: 2.5, repeat: Infinity, ease: 'easeInOut', delay: 0.45 }}
      />
      <span
        className="relative z-10 h-3.5 w-3.5 rounded-full border-[2.5px] border-amber-300"
        style={{ boxShadow: '0 0 12px rgba(251,191,36,0.95), 0 0 26px rgba(251,191,36,0.55)' }}
      />
    </div>
  );
}

function HeatIcon() {
  return (
    <motion.div
      animate={{ scale: [1, 1.12, 1] }}
      transition={{ duration: 1.5, repeat: Infinity, ease: 'easeInOut' }}
    >
      <CloudSun
        className="h-6 w-6 text-orange-300"
        style={{ filter: 'drop-shadow(0 0 8px rgba(251,146,60,0.85))' }}
      />
    </motion.div>
  );
}

function RainIcon() {
  return (
    <motion.div
      animate={{ y: [0, 2.5, 0] }}
      transition={{ duration: 1.8, repeat: Infinity, ease: 'easeInOut' }}
    >
      <CloudRain
        className="h-6 w-6 text-sky-300"
        style={{ filter: 'drop-shadow(0 0 8px rgba(125,211,252,0.78))' }}
      />
    </motion.div>
  );
}

function ThunderIcon() {
  return (
    <motion.div
      animate={{ opacity: [0.65, 1, 0.65], scale: [0.94, 1.1, 0.94] }}
      transition={{ duration: 0.72, repeat: Infinity, ease: 'easeInOut' }}
    >
      <Zap
        className="h-6 w-6 fill-yellow-300 text-yellow-300"
        style={{ filter: 'drop-shadow(0 0 10px rgba(253,224,71,0.95))' }}
      />
    </motion.div>
  );
}

function CloudyIcon() {
  return (
    <motion.div
      animate={{ x: [0, 3, -3, 0] }}
      transition={{ duration: 4.5, repeat: Infinity, ease: 'easeInOut' }}
    >
      <Cloud className="h-6 w-6 text-slate-300/60" />
    </motion.div>
  );
}

function WeatherIcon({ kind, heatwave }: { kind: WeatherKind; heatwave: boolean }) {
  if (heatwave) return <HeatIcon />;
  if (kind === 'sunny') return <SunIcon />;
  if (kind === 'rain') return <RainIcon />;
  if (kind === 'thunder') return <ThunderIcon />;
  return <CloudyIcon />;
}

// Large hero icon for the header badge
function WeatherIconLarge({ kind, heatwave }: { kind: WeatherKind; heatwave: boolean }) {
  if (heatwave) return <motion.div animate={{ scale: [1, 1.1, 1] }} transition={{ duration: 1.5, repeat: Infinity, ease: 'easeInOut' }}><CloudSun className="h-7 w-7 text-orange-300" style={{ filter: 'drop-shadow(0 0 10px rgba(251,146,60,0.9))' }} /></motion.div>;
  if (kind === 'sunny') return (
    <div className="relative flex h-9 w-9 items-center justify-center">
      <motion.div className="absolute inset-0 rounded-full" style={{ background: 'radial-gradient(circle, rgba(251,191,36,0.5), transparent 70%)' }} animate={{ scale: [1, 1.6, 1], opacity: [0.4, 0.85, 0.4] }} transition={{ duration: 2.5, repeat: Infinity, ease: 'easeInOut' }} />
      <span className="relative z-10 h-4.5 w-4.5 rounded-full border-[3px] border-amber-300" style={{ boxShadow: '0 0 16px rgba(251,191,36,0.95), 0 0 32px rgba(251,191,36,0.55)', width: 18, height: 18, borderRadius: '50%' }} />
    </div>
  );
  if (kind === 'rain') return <motion.div animate={{ y: [0, 3, 0] }} transition={{ duration: 1.8, repeat: Infinity, ease: 'easeInOut' }}><CloudRain className="h-7 w-7 text-sky-300" style={{ filter: 'drop-shadow(0 0 10px rgba(125,211,252,0.8))' }} /></motion.div>;
  if (kind === 'thunder') return <motion.div animate={{ opacity: [0.65, 1, 0.65], scale: [0.92, 1.12, 0.92] }} transition={{ duration: 0.72, repeat: Infinity, ease: 'easeInOut' }}><Zap className="h-7 w-7 fill-yellow-300 text-yellow-300" style={{ filter: 'drop-shadow(0 0 12px rgba(253,224,71,0.95))' }} /></motion.div>;
  return <motion.div animate={{ x: [0, 3, -3, 0] }} transition={{ duration: 4.5, repeat: Infinity, ease: 'easeInOut' }}><Cloud className="h-7 w-7 text-slate-300/60" /></motion.div>;
}

export default function HomeInfoWidget() {
  const [now, setNow] = useState<Date | null>(null);
  // Read weather cache synchronously — no skeleton on repeat visits
  const [weather, setWeather] = useState<WeatherState[]>(() => readWeatherCache() ?? []);
  const [loaded, setLoaded] = useState(() => readWeatherCache() !== null);

  // Clock: always update client-side (avoid SSR time mismatch by starting null)
  useEffect(() => {
    setNow(new Date());
    const timer = window.setInterval(() => setNow(new Date()), 60000);
    return () => window.clearInterval(timer);
  }, []);

  // Weather: fetch fresh on mount (silently if cache exists)
  useEffect(() => {
    let cancelled = false;
    fetchWeather()
      .then((nextWeather) => {
        if (cancelled) return;
        setWeather(nextWeather);
        setLoaded(true);
        writeWeatherCache(nextWeather);
      })
      .catch(() => {
        if (!cancelled && !loaded) {
          setWeather(WEATHER_CITIES.map(emptyWeatherState));
          setLoaded(true);
        }
      });
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const clock = useMemo(() => {
    if (!now) return { time: '--:--', date: '--/--' };
    return {
      time: now.toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' }),
      date: now.toLocaleDateString('he-IL', { day: '2-digit', month: '2-digit' }),
    };
  }, [now]);

  const primaryWeather = weather[0] ?? null;
  const primaryKind = getWeatherKind(primaryWeather?.code ?? null);
  const heatwave = typeof primaryWeather?.temperature === 'number' && primaryWeather.temperature > 35;

  const bgGradient = heatwave
    ? 'from-orange-950/55 via-red-950/30 to-slate-950/50'
    : primaryKind === 'rain'
      ? 'from-sky-950/55 via-blue-950/30 to-slate-950/50'
      : primaryKind === 'thunder'
        ? 'from-purple-950/55 via-slate-950/30 to-slate-950/50'
        : 'from-slate-950/55 via-indigo-950/25 to-slate-950/50';

  const ambientGradient = heatwave
    ? 'radial-gradient(ellipse 70% 50% at 20% 15%, rgba(251,146,60,0.38), transparent 55%), radial-gradient(ellipse 50% 40% at 80% 85%, rgba(185,28,28,0.18), transparent 55%)'
    : primaryKind === 'rain'
      ? 'radial-gradient(ellipse 70% 50% at 20% 15%, rgba(56,189,248,0.30), transparent 55%), radial-gradient(ellipse 50% 40% at 80% 85%, rgba(37,99,235,0.15), transparent 55%)'
      : primaryKind === 'thunder'
        ? 'radial-gradient(ellipse 70% 50% at 20% 15%, rgba(168,85,247,0.30), transparent 55%), radial-gradient(ellipse 50% 40% at 80% 85%, rgba(88,28,235,0.15), transparent 55%)'
        : 'radial-gradient(ellipse 70% 50% at 20% 15%, rgba(99,102,241,0.24), transparent 55%), radial-gradient(ellipse 50% 40% at 80% 85%, rgba(56,189,248,0.12), transparent 55%)';

  return (
    <div
      dir="rtl"
      className={`relative isolate w-full max-w-full overflow-hidden rounded-[1.5rem] border shadow-2xl backdrop-blur-2xl ${
        heatwave ? 'border-orange-400/25' : 'border-white/10'
      } bg-gradient-to-br ${bgGradient}`}
    >
      {/* Breathing ambient glow */}
      <motion.div
        className="pointer-events-none absolute inset-0"
        style={{ background: ambientGradient }}
        animate={{ opacity: [0.65, 1, 0.65] }}
        transition={{ duration: 4.5, repeat: Infinity, ease: 'easeInOut' }}
      />

      {/* Subtle floating star dots */}
      <div
        className="pointer-events-none absolute inset-0 opacity-20"
        style={{
          background:
            'radial-gradient(circle at 88% 18%, rgba(255,255,255,0.07) 1px, transparent 1px), ' +
            'radial-gradient(circle at 38% 62%, rgba(255,255,255,0.06) 1px, transparent 1px), ' +
            'radial-gradient(circle at 68% 78%, rgba(255,255,255,0.05) 1px, transparent 1px), ' +
            'radial-gradient(circle at 22% 42%, rgba(255,255,255,0.04) 1px, transparent 1px)',
        }}
      />

      <div className="relative flex flex-col gap-4 p-4">
        {/* Header: clock + label + hero icon */}
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="mb-1 text-[10px] font-black uppercase tracking-widest text-white/40">
              Live Weather
            </p>
            <div className="flex items-end gap-2">
              <span className="font-mono text-4xl font-black leading-none text-white" dir="ltr">
                {clock.time}
              </span>
              <span className="pb-1 font-mono text-sm font-bold text-white/45" dir="ltr">
                {clock.date}
              </span>
            </div>
            <div className="mt-2 flex items-center gap-1.5">
              <MapPin className="h-3.5 w-3.5 text-[var(--theme-accent)]" />
              <span className="text-xs font-bold text-white/60">ישראל</span>
              <span className="text-white/25">·</span>
              <span className="text-xs text-white/45">
                {loaded ? 'זמן אמת' : (
                  <span className="inline-block w-10 h-3 rounded animate-pulse bg-white/15 align-middle" />
                )}
              </span>
            </div>
          </div>

          <motion.div
            className={`flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl ${
              heatwave ? 'bg-orange-500/20 border border-orange-400/25' : 'bg-white/10 border border-white/10'
            }`}
            animate={{ scale: [1, 1.05, 1] }}
            transition={{ duration: 3.5, repeat: Infinity, ease: 'easeInOut' }}
          >
            <WeatherIconLarge kind={primaryKind} heatwave={heatwave} />
          </motion.div>
        </div>

        {/* Divider */}
        <div
          className="h-px"
          style={{ background: 'linear-gradient(to left, transparent, rgba(255,255,255,0.12), transparent)' }}
        />

        {/* City cards 2×2 grid */}
        <div className="grid grid-cols-2 gap-2.5">
          {WEATHER_CITIES.map((city, index) => {
            const item = weather.find((entry) => entry.key === city.key);
            const kind = getWeatherKind(item?.code ?? null);
            const isHot = typeof item?.temperature === 'number' && item.temperature > 35;
            const config = getCardConfig(kind, isHot);
            const tempStyle = getTempStyle(item?.temperature ?? null);

            return (
              <motion.div
                key={city.key}
                className="relative overflow-hidden rounded-2xl"
                style={{ border: `1px solid ${config.border}` }}
                initial={{ opacity: 0, y: 14, scale: 0.94 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                transition={{ duration: 0.45, delay: index * 0.09, ease: [0.25, 0.46, 0.45, 0.94] }}
                whileHover={{ scale: 1.03, transition: { duration: 0.18 } }}
                whileTap={{ scale: 0.97, transition: { duration: 0.1 } }}
              >
                {/* Dark base */}
                <div className="absolute inset-0 bg-black/38" />

                {/* Breathing weather gradient overlay */}
                <motion.div
                  className="pointer-events-none absolute inset-0"
                  style={{ background: config.gradient }}
                  animate={{ opacity: [0.55, 1, 0.55] }}
                  transition={{
                    duration: config.breatheDuration,
                    repeat: Infinity,
                    ease: 'easeInOut',
                    delay: index * 0.65,
                  }}
                />

                {/* Bottom ambient glow */}
                <div
                  className="pointer-events-none absolute bottom-0 left-0 right-0 h-2/3"
                  style={{ background: `linear-gradient(to top, ${config.bottomGlow}, transparent)` }}
                />

                {/* Card content — z-10 keeps it above the animated gradient overlays */}
                <div className="relative z-10 flex flex-col p-3 gap-1.5">

                  {/* Row 1: city name + weather icon */}
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-black tracking-wide text-white/90">
                      {city.city}
                    </span>
                    <WeatherIcon kind={kind} heatwave={isHot} />
                  </div>

                  {/* Row 2: temperature — centered */}
                  <div className="flex justify-center items-center py-1.5">
                    {loaded ? (
                      <motion.span
                        className="font-mono font-black leading-none"
                        style={{ fontSize: '2.5rem', ...tempStyle }}
                        dir="ltr"
                        initial={{ opacity: 0, scale: 0.72 }}
                        animate={{ opacity: 1, scale: 1 }}
                        transition={{ duration: 0.5, delay: index * 0.1 + 0.25, ease: 'backOut' }}
                      >
                        {typeof item?.temperature === 'number' ? `${item.temperature}°` : '--°'}
                      </motion.span>
                    ) : (
                      <div className="h-10 w-16 animate-pulse rounded-xl bg-white/10" />
                    )}
                  </div>

                  {/* Row 3: sunrise / sunset chips */}
                  <div className="grid grid-cols-2 gap-1.5">
                    <div className="flex flex-col items-center rounded-xl bg-amber-400/10 border border-amber-400/12 py-1.5 px-1">
                      <Sunrise className="mb-0.5 h-3 w-3 text-amber-300/85" />
                      <span className="text-[8px] font-bold text-amber-200/55 leading-none mb-0.5">זריחה</span>
                      {loaded ? (
                        <span className="font-mono text-[10px] font-black text-amber-200/90 leading-none" dir="ltr">
                          {formatSunTime(item?.sunrise)}
                        </span>
                      ) : (
                        <span className="mt-0.5 h-2.5 w-9 animate-pulse rounded bg-amber-400/15 inline-block" />
                      )}
                    </div>
                    <div className="flex flex-col items-center rounded-xl bg-orange-500/10 border border-orange-400/12 py-1.5 px-1">
                      <Sunset className="mb-0.5 h-3 w-3 text-orange-300/85" />
                      <span className="text-[8px] font-bold text-orange-200/55 leading-none mb-0.5">שקיעה</span>
                      {loaded ? (
                        <span className="font-mono text-[10px] font-black text-orange-200/90 leading-none" dir="ltr">
                          {formatSunTime(item?.sunset)}
                        </span>
                      ) : (
                        <span className="mt-0.5 h-2.5 w-9 animate-pulse rounded bg-orange-400/15 inline-block" />
                      )}
                    </div>
                  </div>

                </div>
              </motion.div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
