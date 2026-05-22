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

const WEATHER_CACHE_KEY = 'tv-home-weather-cache-v4';
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
  if ((code >= 51 && code <= 67) || (code >= 80 && code <= 82) || (code >= 61 && code <= 65)) return 'rain';
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

  try {
    window.sessionStorage.setItem(WEATHER_CACHE_KEY, JSON.stringify(weather));
  } catch {}
}

async function fetchCityWeather(city: WeatherCity): Promise<WeatherState> {
  const response = await fetch(
    `https://api.open-meteo.com/v1/forecast?latitude=${city.latitude}&longitude=${city.longitude}&current=temperature_2m,weather_code&daily=sunrise,sunset&timezone=auto`,
  );
  const weatherData = await response.json();
  const current = weatherData?.current;
  const temperature = typeof current?.temperature_2m === 'number' ? Math.round(current.temperature_2m) : null;
  const code = typeof current?.weather_code === 'number' ? current.weather_code : null;
  const sunrise = typeof weatherData?.daily?.sunrise?.[0] === 'string' ? weatherData.daily.sunrise[0] : null;
  const sunset = typeof weatherData?.daily?.sunset?.[0] === 'string' ? weatherData.daily.sunset[0] : null;

  return { key: city.key, city: city.city, temperature, code, sunrise, sunset, fetchedAt: Date.now() };
}

async function fetchWeather(): Promise<WeatherState[]> {
  return Promise.all(WEATHER_CITIES.map(fetchCityWeather));
}

function formatSunTime(value: string | null | undefined): string {
  if (!value) return '--:--';
  const parsed = Date.parse(value);
  if (Number.isNaN(parsed)) return '--:--';
  return new Date(parsed).toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' });
}

function WeatherIcon({ kind, heatwave }: { kind: WeatherKind; heatwave: boolean }) {
  if (heatwave) return <CloudSun className="h-4 w-4 text-orange-200" />;
  if (kind === 'sunny') return <span className="h-4 w-4 rounded-full border-[4px] border-amber-300 shadow-[0_0_16px_rgba(251,191,36,0.55)]" />;
  if (kind === 'rain') return <CloudRain className="h-4 w-4 text-sky-200" />;
  if (kind === 'thunder') return <Zap className="h-4 w-4 fill-yellow-200 text-yellow-200" />;
  return <Cloud className="h-4 w-4 text-white/70" />;
}

export default function HomeInfoWidget() {
  const [mounted, setMounted] = useState(false);
  const [now, setNow] = useState<Date | null>(null);
  const [weather, setWeather] = useState<WeatherState[]>([]);

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
      const cacheTimer = window.setTimeout(() => setWeather(cached), 0);
      return () => window.clearTimeout(cacheTimer);
    }

    let cancelled = false;
    fetchWeather()
      .then((nextWeather) => {
        if (cancelled) return;
        setWeather(nextWeather);
        writeWeatherCache(nextWeather);
      })
      .catch(() => {
        const fallbackWeather = WEATHER_CITIES.map((city) => ({
          key: city.key,
          city: city.city,
          temperature: null,
          code: null,
          sunrise: null,
          sunset: null,
          fetchedAt: Date.now(),
        }));
        if (!cancelled) setWeather(fallbackWeather);
      });

    return () => {
      cancelled = true;
    };
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

  return (
    <div
      dir="rtl"
      className={`relative isolate flex h-[360px] w-full max-w-full items-center overflow-hidden rounded-[1.5rem] border p-4 shadow-2xl backdrop-blur-2xl transition ${
        heatwave
          ? 'border-orange-300/35 bg-orange-950/35 shadow-orange-500/20'
          : 'border-white/10 bg-slate-950/[0.42] shadow-black/25'
      }`}
    >
      <div
        className={`pointer-events-none absolute inset-0 ${
          heatwave
            ? 'bg-[radial-gradient(circle_at_20%_18%,rgba(251,146,60,0.34),transparent_42%)]'
            : 'bg-[radial-gradient(circle_at_18%_18%,rgba(56,189,248,0.18),transparent_42%)]'
        }`}
      />
      <div className="relative flex h-full w-full flex-col justify-between gap-3">
        <div className="flex items-start justify-between gap-4">
          <div className="text-right">
            <p className="text-xs font-black uppercase tracking-wide text-white/45">Live Weather</p>
            <div className="mt-1 flex items-end gap-2">
              <span className="font-mono text-3xl font-black leading-none text-white" dir="ltr">
                {clock.time}
              </span>
              <span className="pb-0.5 font-mono text-sm font-bold text-white/55" dir="ltr">
                {clock.date}
              </span>
            </div>
            <div className="mt-3 flex items-center gap-1.5 text-sm font-bold text-white/72">
              <MapPin className="h-4 w-4 text-[var(--theme-accent)]" />
              <span>ישראל</span>
              <span className="text-white/35">·</span>
              <span>{weather.length ? 'זמן אמת' : 'טוען...'}</span>
            </div>
          </div>

          <span className="flex h-11 w-11 items-center justify-center rounded-full bg-white/10">
            <WeatherIcon kind={primaryKind} heatwave={heatwave} />
          </span>
        </div>

        <div className="grid grid-cols-2 gap-2">
          {WEATHER_CITIES.map((city) => {
            const item = weather.find((entry) => entry.key === city.key);
            const kind = getWeatherKind(item?.code ?? null);
            const isHot = typeof item?.temperature === 'number' && item.temperature > 35;
            return (
              <div key={city.key} className="rounded-2xl border border-white/10 bg-white/[0.06] p-2.5">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <span className="truncate text-xs font-black text-white/85">{city.city}</span>
                  <WeatherIcon kind={kind} heatwave={isHot} />
                </div>
                <div className="font-mono text-2xl font-black text-white" dir="ltr">
                  {typeof item?.temperature === 'number' ? `${item.temperature}°` : '--°'}
                </div>
                <div className="mt-2 grid grid-cols-2 gap-1 text-[10px] font-bold text-white/65">
                  <span className="flex items-center gap-1">
                    <Sunrise className="h-3 w-3 text-amber-200" />
                    <span dir="ltr">{formatSunTime(item?.sunrise)}</span>
                  </span>
                  <span className="flex items-center gap-1">
                    <Sunset className="h-3 w-3 text-orange-200" />
                    <span dir="ltr">{formatSunTime(item?.sunset)}</span>
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
