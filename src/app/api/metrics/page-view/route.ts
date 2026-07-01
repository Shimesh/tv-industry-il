import { NextRequest, NextResponse } from 'next/server';
import { verifyAuthToken } from '@/lib/apiAuth';
import { recordPageView, recordRouteMetric } from '@/lib/server/adminTelemetry';

export const runtime = 'nodejs';

function firstHeaderValue(value: string | null): string | null {
  return value?.split(',')[0]?.trim() || null;
}

function getClientIp(request: NextRequest): string | null {
  return (
    firstHeaderValue(request.headers.get('x-forwarded-for')) ||
    firstHeaderValue(request.headers.get('x-real-ip')) ||
    firstHeaderValue(request.headers.get('x-vercel-forwarded-for')) ||
    null
  );
}

function detectDevice(userAgent: string): 'desktop' | 'mobile' | 'tablet' | 'bot' | 'unknown' {
  const ua = userAgent.toLowerCase();
  if (!ua) return 'unknown';
  if (/bot|crawler|spider|slurp|bingpreview/.test(ua)) return 'bot';
  if (/ipad|tablet|kindle|silk/.test(ua)) return 'tablet';
  if (/mobi|android|iphone|ipod/.test(ua)) return 'mobile';
  return 'desktop';
}

function detectBrowser(userAgent: string): string | null {
  if (!userAgent) return null;
  if (/SamsungBrowser\//.test(userAgent)) return 'Samsung Internet';
  if (/Edg\//.test(userAgent)) return 'Edge';
  if (/OPR\//.test(userAgent)) return 'Opera';
  if (/Chrome\//.test(userAgent)) return 'Chrome';
  if (/Safari\//.test(userAgent) && /Version\//.test(userAgent)) return 'Safari';
  if (/Firefox\//.test(userAgent)) return 'Firefox';
  return null;
}

function detectOs(userAgent: string): string | null {
  if (!userAgent) return null;
  if (/Windows NT/.test(userAgent)) return 'Windows';
  if (/Android/.test(userAgent)) return 'Android';
  if (/(iPhone|iPad|iPod)/.test(userAgent)) return 'iOS';
  if (/Mac OS X/.test(userAgent)) return 'macOS';
  if (/Linux/.test(userAgent)) return 'Linux';
  return null;
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as {
      pathname?: string;
      visitorId?: string;
      referrer?: string;
      viewport?: string;
      screen?: string;
      devicePixelRatio?: number;
      colorGamut?: string;
      preferredColorScheme?: string;
      displayMode?: string;
    };
    const pathname = String(body.pathname || '').trim();
    if (!pathname.startsWith('/')) {
      return NextResponse.json({ error: 'Invalid pathname' }, { status: 400 });
    }

    const userAgent = request.headers.get('user-agent') || '';
    const authUser = await verifyAuthToken(request);

    await recordPageView({
      pathname,
      visitorId: String(body.visitorId || '').trim().slice(0, 80) || null,
      authUser,
      ip: getClientIp(request),
      country: request.headers.get('x-vercel-ip-country'),
      region: request.headers.get('x-vercel-ip-country-region'),
      city: request.headers.get('x-vercel-ip-city'),
      latitude: request.headers.get('x-vercel-ip-latitude'),
      longitude: request.headers.get('x-vercel-ip-longitude'),
      deviceType: detectDevice(userAgent),
      browser: detectBrowser(userAgent),
      os: detectOs(userAgent),
      userAgent: userAgent.slice(0, 500) || null,
      deviceModel: request.headers.get('sec-ch-ua-model'),
      platformVersion: request.headers.get('sec-ch-ua-platform-version'),
      browserVersions: request.headers.get('sec-ch-ua-full-version-list'),
      viewport: String(body.viewport || '').slice(0, 40) || null,
      screen: String(body.screen || '').slice(0, 40) || null,
      devicePixelRatio: Number.isFinite(Number(body.devicePixelRatio)) ? Number(body.devicePixelRatio) : null,
      colorGamut: String(body.colorGamut || '').slice(0, 20) || null,
      preferredColorScheme: String(body.preferredColorScheme || '').slice(0, 20) || null,
      displayMode: String(body.displayMode || '').slice(0, 20) || null,
      referrer: String(body.referrer || request.headers.get('referer') || '').slice(0, 500) || null,
    });
    return NextResponse.json({ success: true });
  } catch (error) {
    await recordRouteMetric({
      route: '/api/metrics/page-view',
      ok: false,
      statusCode: 500,
      error,
    });
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to track page view' },
      { status: 500 },
    );
  }
}
