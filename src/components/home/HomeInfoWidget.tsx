'use client';

import { useEffect, useMemo, useState } from 'react';
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

function SunIcon() {
  return (
    <span className="relative flex h-7 w-7 items-center justify-center">
      <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-amber-400 opacity-15" style={{ animationDuration: '2s' }} />
      <span className="relative inline-flex h-4 w-4 rounded-full border-[3px] border-amber-300" style={{ boxShadow: '0 0 12px rgba(251,191,36,0.7), 0 0 24px rgba(251,191,36,0.35)' }} />
    </span>
  );
}

function HeatIcon() {
  return <CloudSun className="h-6 w-6 text-orange-300 animate-pulse" style={{ animationDuration: '1.5s' }} />;
}

function RainIcon() {
  return (
    <span className="relative flex items-center justify-center">
      <CloudRain className="h-6 w-6 text-sky-300" style={{ filter: 'drop-shadow(0 0 6px rgba(125,211,252,0.6))' }} />
    </span>
  );
}

function ThunderIcon() {
  return <Zap className="h-6 w-6 fill-yellow-300 text-yellow-300 animate-pulse" style={{ animationDuration: '0.8s', filter: 'drop-shadow(0 0 6px rgba(253,224,71,0.8))' }} />;
}

function CloudyIcon() {
  return <Cloud className="h-6 w-6 text-white/50" />;
}

function WeatherIconLarge({ kind, heatwave }: { kind: WeatherKind; heatwave: boolean }) {
  if (heatwave) return <HeatIcon />;
  if (kind === 'sunny') return <SunIcon />;
  if (kind === 'rain') return <RainIcon />;
  if (kind === 'thunder') return <ThunderIcon />;
  return <CloudyIcon />;
}

function WeatherIconSmall({ kind, heatwave }: { kind: WeatherKind; heatwave: boolean }) {
  if (heatwave) return <CloudSun className="h-4 w-4 text-orange-300" />;
  if (kind === 'sunny') return <span className="inline-flex h-4 w-4 items-center justify-center rounded-full border-[3px] border-amber-300" style={{ boxShadow: '0 0 8px rgba(251,191,36,0.55)' }} />;
  if (kind === 'rain') return <CloudRain className="h-4 w-4 text-sky-300" />;
  if (kind === 'thunder') return <Zap className="h-4 w-4 fill-yellow-300 text-yellow-300" />;
  return <Cloud className="h-4 w-4 text-white/50" />;
}

function getCardGradient(kind: WeatherKind, heatwave: boolean): string {
  if (heatwave) return 'from-orange-500/20 to-red-500/10';
  if (kind === 'sunny') return 'from-amber-400/15 to-sky-500/10';
  if (kind === 'rain') return 'from-sky-500/15 to-blue-600/10';
  if (kind === 'thunder') return 'from-purple-600/15 to-slate-700/10';
  return 'from-slate-500/15 to-slate-600/10';
}

function getTempColor(temp: number | null): string {
  if (temp === null) return 'text-white';
  if (temp >= 36) return 'text-red-300';
  if (temp >= 30) return 'text-orange-300';
  if (temp >= 20) return 'text-amber-200';
  if (temp >= 10) return 'text-sky-200';
  return 'text-blue-300';
}

export default function HomeInfoWidget() {
  const [mounted, setMounted] = useState(false);
  const [now, setNow] = useState<Date | null>(null);
  const [weather, setWeather] = useState<WeatherState[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    const mountTimer = window.setTimeout(() => {
      setMounted(true);
      setNow(new Date());
    }, 0);
    const timer = window.setInterval(() => setNow(new Date()), 60000);
    return () => {
      window.clearTimeout(mountTimer);
      window.clearInterval(timer);
    };
  }, []);

  useEffect(() => {
    if (!mounted) return;
    const cached = readWeatherCache();
    if (cached) {
      const cacheTimer = window.setTimeout(() => { setWeather(cached); setLoaded(true); }, 0);
      return () => window.clearTimeout(cacheTimer);
    }
    let cancelled = false;
    fetchWeather()
      .then((nextWeather) => {
        if (cancelled) return;
        setWeather(nextWeather);
        setLoaded(true);
        writeWeatherCache(nextWeather);
      })
      .catch(() => {
        if (!cancelled) { setWeather(WEATHER_CITIES.map(emptyWeatherState)); setLoaded(true); }
      });
    return () => { cancelled = true; };
  }, [mounted]);

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
    ? 'from-orange-950/50 via-red-950/30 to-slate-950/40'
    : primaryKind === 'rain'
      ? 'from-sky-950/50 via-blue-950/30 to-slate-950/40'
      : primaryKind === 'thunder'
        ? 'from-purple-950/50 via-slate-950/30 to-slate-950/40'
        : 'from-slate-950/50 via-indigo-950/30 to-slate-950/40';

  const glowColor = heatwave
    ? 'rgba(251,146,60,0.28)'
    : primaryKind === 'rain'
      ? 'rgba(56,189,248,0.22)'
      : primaryKind === 'thunder'
        ? 'rgba(168,85,247,0.22)'
        : 'rgba(56,189,248,0.18)';

  return (
    <div
      dir="rtl"
      className={`relative isolate w-full max-w-full overflow-hidden rounded-[1.5rem] border p-4 shadow-2xl backdrop-blur-2xl ${
        heatwave ? 'border-orange-400/25' : 'border-white/10'
      } bg-gradient-to-br ${bgGradient}`}
    >
      {/* Ambient glow */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{ background: `radial-gradient(ellipse 60% 40% at 15% 20%, ${glowColor}, transparent 55%)` }}
      />

      {/* Subtle star/particle background */}
      <div className="pointer-events-none absolute inset-0 opacity-20"
        style={{ background: 'radial-gradient(circle at 85% 75%, rgba(255,255,255,0.05) 1px, transparent 1px), radial-gradient(circle at 45% 55%, rgba(255,255,255,0.04) 1px, transparent 1px), radial-gradient(circle at 65% 25%, rgba(255,255,255,0.03) 1px, transparent 1px)' }}
      />

      <div className="relative flex flex-col gap-4">
        {/* Header: clock + label + icon */}
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

          <div className={`flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl ${
            heatwave ? 'bg-orange-500/20 border border-orange-400/25' : 'bg-white/10 border border-white/10'
          }`}>
            <WeatherIconLarge kind={primaryKind} heatwave={heatwave} />
          </div>
        </div>

        {/* Divider */}
        <div className="h-px" style={{ background: 'linear-gradient(to left, transparent, rgba(255,255,255,0.12), transparent)' }} />

        {/* City cards grid */}
        <div className="grid grid-cols-2 gap-2.5">
          {WEATHER_CITIES.map((city) => {
            const item = weather.find((entry) => entry.key === city.key);
            const kind = getWeatherKind(item?.code ?? null);
            const isHot = typeof item?.temperature === 'number' && item.temperature > 35;
            const tempColor = getTempColor(item?.temperature ?? null);
            const cardGrad = getCardGradient(kind, isHot);

            return (
              <div
                key={city.key}
                className={`relative overflow-hidden rounded-2xl border border-white/10 bg-gradient-to-br ${cardGrad} p-3 transition-all duration-200 hover:border-white/20 hover:scale-[1.02] active:scale-[0.98]`}
              >
                {/* City name + icon row */}
                <div className="mb-2.5 flex items-center justify-between gap-1">
                  <span className="text-xs font-black text-white/85">{city.city}</span>
                  <WeatherIconSmall kind={kind} heatwave={isHot} />
                </div>

                {/* Temperature */}
                {loaded ? (
                  <div className={`font-mono text-[2rem] font-black leading-none ${tempColor}`} dir="ltr">
                    {typeof item?.temperature === 'number' ? `${item.temperature}°` : '--°'}
                  </div>
                ) : (
                  <div className="h-8 w-14 animate-pulse rounded-lg bg-white/10" />
                )}

                {/* Sunrise / Sunset */}
                <div className="mt-3 grid grid-cols-2 gap-1.5">
                  <div className="flex flex-col items-center rounded-xl bg-amber-400/10 py-2 px-1">
                    <Sunrise className="mb-0.5 h-3 w-3 text-amber-300/80" />
                    <span className="text-[9px] font-bold text-amber-200/55 leading-none mb-0.5">זריחה</span>
                    {loaded ? (
                      <span className="font-mono text-[11px] font-black text-amber-200 leading-none" dir="ltr">
                        {formatSunTime(item?.sunrise)}
                      </span>
                    ) : (
                      <span className="mt-0.5 h-3 w-10 animate-pulse rounded bg-amber-400/15 inline-block" />
                    )}
                  </div>
                  <div className="flex flex-col items-center rounded-xl bg-orange-500/10 py-2 px-1">
                    <Sunset className="mb-0.5 h-3 w-3 text-orange-300/80" />
                    <span className="text-[9px] font-bold text-orange-200/55 leading-none mb-0.5">שקיעה</span>
                    {loaded ? (
                      <span className="font-mono text-[11px] font-black text-orange-200 leading-none" dir="ltr">
                        {formatSunTime(item?.sunset)}
                      </span>
                    ) : (
                      <span className="mt-0.5 h-3 w-10 animate-pulse rounded bg-orange-400/15 inline-block" />
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
