import { NextRequest, NextResponse } from 'next/server';

type CurrentWeather = {
  temperature_2m: number | null;
  relative_humidity_2m: number | null;
  wind_speed_10m: number | null;
  weather_code: number | null;
};

type DailyWeather = {
  time: string[];
  weather_code: number[];
  temperature_2m_max: number[];
  temperature_2m_min: number[];
  sunrise?: string[];
  sunset?: string[];
};

type WeatherPayload = {
  current: CurrentWeather;
  daily?: DailyWeather;
  source: string;
};

const TIMEOUT_MS = 6000;

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function toNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

async function fetchJson(url: string, init?: RequestInit) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      ...init,
      cache: 'no-store',
      signal: controller.signal,
    });

    if (!response.ok) throw new Error(`Weather provider returned ${response.status}`);
    return response.json();
  } finally {
    clearTimeout(timeout);
  }
}

function mapWttrCode(code: unknown): number {
  const value = String(code ?? '');
  if (value === '113') return 0;
  if (value === '116') return 2;
  if (value === '119' || value === '122') return 3;
  if (value === '143' || value === '248' || value === '260') return 45;
  if (['176', '263', '266', '293', '296', '299', '302', '305', '308', '353', '356', '359'].includes(value)) return 61;
  if (['389', '392', '395'].includes(value)) return 95;
  return 3;
}

function mapMetSymbol(symbol: unknown): number {
  const value = String(symbol ?? '');
  if (value.includes('clearsky')) return 0;
  if (value.includes('fair')) return 1;
  if (value.includes('partlycloudy')) return 2;
  if (value.includes('cloudy')) return 3;
  if (value.includes('fog')) return 45;
  if (value.includes('thunder')) return 95;
  if (value.includes('rain') || value.includes('showers') || value.includes('sleet')) return 61;
  return 3;
}

async function getOpenMeteoWeather(latitude: number, longitude: number, includeDaily: boolean): Promise<WeatherPayload> {
  const dailyParams = includeDaily
    ? '&daily=weather_code,temperature_2m_max,temperature_2m_min,sunrise,sunset&forecast_days=7'
    : '&daily=sunrise,sunset&forecast_days=1';
  const data = await fetchJson(
    `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&current=temperature_2m,relative_humidity_2m,wind_speed_10m,weather_code${dailyParams}&timezone=Asia/Jerusalem`,
  );

  const current = data?.current;
  if (!current || !isFiniteNumber(current.temperature_2m)) throw new Error('Open-Meteo response is missing current weather');

  return {
    source: 'open-meteo',
    current: {
      temperature_2m: current.temperature_2m,
      relative_humidity_2m: toNumber(current.relative_humidity_2m),
      wind_speed_10m: toNumber(current.wind_speed_10m),
      weather_code: toNumber(current.weather_code),
    },
    daily: data?.daily,
  };
}

async function getMetWeather(latitude: number, longitude: number): Promise<WeatherPayload> {
  const data = await fetchJson(
    `https://api.met.no/weatherapi/locationforecast/2.0/compact?lat=${latitude}&lon=${longitude}`,
    { headers: { 'User-Agent': 'tv-industry-il/2.6.17 https://tv-industry-il.vercel.app' } },
  );
  const timeseries = Array.isArray(data?.properties?.timeseries) ? data.properties.timeseries : [];
  const currentEntry = timeseries[0];
  const currentDetails = currentEntry?.data?.instant?.details;
  if (!currentDetails) throw new Error('MET response is missing current weather');

  const days = new Map<string, { max: number; min: number; code: number }>();
  for (const entry of timeseries) {
    const date = typeof entry?.time === 'string' ? entry.time.slice(0, 10) : null;
    const details = entry?.data?.instant?.details;
    const temp = toNumber(details?.air_temperature);
    if (!date || temp === null) continue;

    const code = mapMetSymbol(entry?.data?.next_6_hours?.summary?.symbol_code ?? entry?.data?.next_1_hours?.summary?.symbol_code);
    const existing = days.get(date);
    days.set(date, {
      max: existing ? Math.max(existing.max, temp) : temp,
      min: existing ? Math.min(existing.min, temp) : temp,
      code: existing?.code ?? code,
    });
  }

  const dailyEntries = Array.from(days.entries()).slice(0, 7);

  return {
    source: 'met.no',
    current: {
      temperature_2m: toNumber(currentDetails.air_temperature),
      relative_humidity_2m: toNumber(currentDetails.relative_humidity),
      wind_speed_10m: toNumber(currentDetails.wind_speed) !== null ? toNumber(currentDetails.wind_speed)! * 3.6 : null,
      weather_code: mapMetSymbol(currentEntry?.data?.next_1_hours?.summary?.symbol_code ?? currentEntry?.data?.next_6_hours?.summary?.symbol_code),
    },
    daily: {
      time: dailyEntries.map(([date]) => date),
      temperature_2m_max: dailyEntries.map(([, day]) => day.max),
      temperature_2m_min: dailyEntries.map(([, day]) => day.min),
      weather_code: dailyEntries.map(([, day]) => day.code),
    },
  };
}

async function getWttrWeather(latitude: number, longitude: number): Promise<WeatherPayload> {
  const data = await fetchJson(`https://wttr.in/${latitude},${longitude}?format=j1`);
  const current = data?.current_condition?.[0];
  if (!current) throw new Error('wttr response is missing current weather');

  const weatherDays = Array.isArray(data?.weather) ? data.weather.slice(0, 7) : [];

  return {
    source: 'wttr.in',
    current: {
      temperature_2m: toNumber(current.temp_C),
      relative_humidity_2m: toNumber(current.humidity),
      wind_speed_10m: toNumber(current.windspeedKmph),
      weather_code: mapWttrCode(current.weatherCode),
    },
    daily: {
      time: weatherDays.map((day: { date?: string }) => day.date ?? ''),
      temperature_2m_max: weatherDays.map((day: { maxtempC?: string }) => toNumber(day.maxtempC) ?? 0),
      temperature_2m_min: weatherDays.map((day: { mintempC?: string }) => toNumber(day.mintempC) ?? 0),
      weather_code: weatherDays.map((day: { hourly?: Array<{ weatherCode?: string }> }) => mapWttrCode(day.hourly?.[4]?.weatherCode ?? day.hourly?.[0]?.weatherCode)),
      sunrise: weatherDays.map((day: { astronomy?: Array<{ sunrise?: string }> }) => day.astronomy?.[0]?.sunrise ?? ''),
      sunset: weatherDays.map((day: { astronomy?: Array<{ sunset?: string }> }) => day.astronomy?.[0]?.sunset ?? ''),
    },
  };
}

export async function GET(request: NextRequest) {
  const latitude = Number(request.nextUrl.searchParams.get('latitude'));
  const longitude = Number(request.nextUrl.searchParams.get('longitude'));
  const includeDaily = request.nextUrl.searchParams.get('daily') === '1';

  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    return NextResponse.json({ error: 'Invalid weather coordinates' }, { status: 400 });
  }

  const providers = includeDaily
    ? [
        () => getMetWeather(latitude, longitude),
        () => getWttrWeather(latitude, longitude),
        () => getOpenMeteoWeather(latitude, longitude, includeDaily),
      ]
    : [
        () => getWttrWeather(latitude, longitude),
        () => getMetWeather(latitude, longitude),
        () => getOpenMeteoWeather(latitude, longitude, includeDaily),
      ];

  for (const provider of providers) {
    try {
      const payload = await provider();
      return NextResponse.json(payload, {
        headers: {
          'Cache-Control': 'public, s-maxage=900, stale-while-revalidate=1800',
        },
      });
    } catch {}
  }

  return NextResponse.json({ error: 'Weather unavailable' }, { status: 503 });
}
