'use client';

import { useEffect, useMemo, useState } from 'react';
import { Cloud, CloudRain, CloudSun, MapPin, Zap } from 'lucide-react';

type WeatherKind = 'sunny' | 'rain' | 'thunder' | 'cloudy';

type WeatherState = {
  city: string;
  temperature: number | null;
  code: number | null;
  fetchedAt: number;
};

const WEATHER_CACHE_KEY = 'tv-home-weather-cache-v2';
const WEATHER_CACHE_TTL_MS = 25 * 60 * 1000;
const TEL_AVIV = { latitude: 32.0853, longitude: 34.7818, city: 'תל אביב' };

function getWeatherKind(code: number | null): WeatherKind {
  if (code === null) return 'cloudy';
  if (code === 0 || code === 1) return 'sunny';
  if ((code >= 51 && code <= 67) || (code >= 80 && code <= 82) || (code >= 61 && code <= 65)) return 'rain';
  if (code >= 95 && code <= 99) return 'thunder';
  return 'cloudy';
}

function readWeatherCache(): WeatherState | null {
  if (typeof window === 'undefined') return null;

  try {
    const raw = window.sessionStorage.getItem(WEATHER_CACHE_KEY);
    if (!raw) return null;

    const parsed = JSON.parse(raw) as Partial<WeatherState>;
    if (
      typeof parsed.city === 'string' &&
      typeof parsed.fetchedAt === 'number' &&
      Date.now() - parsed.fetchedAt < WEATHER_CACHE_TTL_MS
    ) {
      return {
        city: parsed.city,
        temperature: typeof parsed.temperature === 'number' ? parsed.temperature : null,
        code: typeof parsed.code === 'number' ? parsed.code : null,
        fetchedAt: parsed.fetchedAt,
      };
    }
  } catch {}

  return null;
}

function writeWeatherCache(weather: WeatherState) {
  if (typeof window === 'undefined') return;

  try {
    window.sessionStorage.setItem(WEATHER_CACHE_KEY, JSON.stringify(weather));
  } catch {}
}

function getCurrentPosition(): Promise<{ latitude: number; longitude: number; fallback: boolean }> {
  if (typeof window === 'undefined' || !('geolocation' in navigator)) {
    return Promise.resolve({ latitude: TEL_AVIV.latitude, longitude: TEL_AVIV.longitude, fallback: true });
  }

  return new Promise((resolve) => {
    navigator.geolocation.getCurrentPosition(
      (position) => {
        resolve({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          fallback: false,
        });
      },
      () => resolve({ latitude: TEL_AVIV.latitude, longitude: TEL_AVIV.longitude, fallback: true }),
      { enableHighAccuracy: false, timeout: 6500, maximumAge: WEATHER_CACHE_TTL_MS },
    );
  });
}

async function fetchCity(latitude: number, longitude: number, fallback: boolean): Promise<string> {
  if (fallback) return TEL_AVIV.city;

  try {
    const response = await fetch(
      `https://geocoding-api.open-meteo.com/v1/reverse?latitude=${latitude}&longitude=${longitude}&language=he&count=1`,
    );
    const data = await response.json();
    const result = Array.isArray(data?.results) ? data.results[0] : null;
    return typeof result?.name === 'string' && result.name.trim() ? result.name : TEL_AVIV.city;
  } catch {
    return TEL_AVIV.city;
  }
}

async function fetchWeather(): Promise<WeatherState> {
  const position = await getCurrentPosition();
  const [city, weatherResponse] = await Promise.all([
    fetchCity(position.latitude, position.longitude, position.fallback),
    fetch(
      `https://api.open-meteo.com/v1/forecast?latitude=${position.latitude}&longitude=${position.longitude}&current=temperature_2m,weather_code&timezone=auto`,
    ),
  ]);
  const weatherData = await weatherResponse.json();
  const current = weatherData?.current;
  const temperature = typeof current?.temperature_2m === 'number' ? Math.round(current.temperature_2m) : null;
  const code = typeof current?.weather_code === 'number' ? current.weather_code : null;

  return { city, temperature, code, fetchedAt: Date.now() };
}

function WeatherAnimation({ kind, heatwave }: { kind: WeatherKind; heatwave: boolean }) {
  if (heatwave) {
    return (
      <span className="relative flex h-11 w-11 items-center justify-center rounded-full bg-orange-500/20 text-orange-200">
        <span className="absolute inset-0 rounded-full border border-orange-300/40 animate-ping" />
        <CloudSun className="h-6 w-6" />
      </span>
    );
  }

  if (kind === 'sunny') {
    return (
      <span className="flex h-11 w-11 items-center justify-center rounded-full bg-amber-400/15 text-amber-200">
        <span className="h-6 w-6 rounded-full border-[6px] border-amber-300 shadow-[0_0_22px_rgba(251,191,36,0.55)] animate-[spin_8s_linear_infinite]" />
      </span>
    );
  }

  if (kind === 'rain') {
    return (
      <span className="relative flex h-11 w-11 items-center justify-center rounded-full bg-sky-400/15 text-sky-200">
        <CloudRain className="h-6 w-6" />
        <span className="absolute bottom-2 left-3 h-1.5 w-0.5 rounded-full bg-sky-200 animate-bounce" />
        <span className="absolute bottom-1.5 left-5 h-2 w-0.5 rounded-full bg-sky-200 animate-bounce [animation-delay:120ms]" />
        <span className="absolute bottom-2 right-3 h-1.5 w-0.5 rounded-full bg-sky-200 animate-bounce [animation-delay:220ms]" />
      </span>
    );
  }

  if (kind === 'thunder') {
    return (
      <span className="flex h-11 w-11 items-center justify-center rounded-full bg-violet-400/15 text-yellow-200 animate-pulse">
        <Zap className="h-6 w-6 fill-yellow-200" />
      </span>
    );
  }

  return (
    <span className="flex h-11 w-11 items-center justify-center rounded-full bg-white/10 text-white/75">
      <Cloud className="h-6 w-6 animate-pulse" />
    </span>
  );
}

export default function HomeInfoWidget() {
  const [mounted, setMounted] = useState(false);
  const [now, setNow] = useState<Date | null>(null);
  const [weather, setWeather] = useState<WeatherState | null>(null);

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
        const fallbackWeather = { city: TEL_AVIV.city, temperature: null, code: null, fetchedAt: Date.now() };
        if (!cancelled) {
          setWeather(fallbackWeather);
          writeWeatherCache(fallbackWeather);
        }
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

  const weatherKind = getWeatherKind(weather?.code ?? null);
  const heatwave = typeof weather?.temperature === 'number' && weather.temperature > 35;

  return (
    <div
      dir="rtl"
      className={`relative isolate flex h-[148px] w-full max-w-full items-center overflow-hidden rounded-[1.5rem] border p-4 shadow-2xl backdrop-blur-2xl transition ${
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
      {heatwave ? <span className="pointer-events-none absolute inset-4 rounded-[1.25rem] border border-orange-300/20 animate-ping" /> : null}

      <div className="relative flex w-full items-center justify-between gap-5">
        <div className="text-right">
          <p className="text-xs font-black uppercase tracking-wide text-white/45">Live Info</p>
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
            <span>{weather?.city ?? 'תל אביב'}</span>
            <span className="text-white/35">·</span>
            <span dir="ltr">{typeof weather?.temperature === 'number' ? `${weather.temperature}°C` : '--°C'}</span>
          </div>
        </div>

        <WeatherAnimation kind={weatherKind} heatwave={heatwave} />
      </div>
    </div>
  );
}
