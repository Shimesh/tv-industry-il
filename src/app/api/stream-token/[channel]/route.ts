import { NextRequest, NextResponse } from 'next/server';
import { createCipheriv, createDecipheriv } from 'node:crypto';

const DESKTOP_USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
const I24_ACCOUNT_ID = '5377161796001';
const I24_VIDEO_ID = '6352464366112';
const I24_POLICY_KEY = 'BCpkADawqM1UIU4favtR1Jj4rqM0ZAkYwMEbgN9bsEpJ2150CdxJmRIG8jK-Up_9w4w37x3tP1AsoO_MZhD_XoAGkdKWxymaaw4OHuhPn_lEJczODTm3AO7S08gLFPnLnb-FcKJwXhbxCQ10';
const NOW14_GUID = '9fb14ce7-fcc2-4695-839b-e641390d7a00';
const NOW14_API_BASE = 'https://insight-api-channel14.univtec.com/';
const NOW14_TENANT_ID = 'channel14';
const NOW14_STABLE_HLS = 'https://r.il.cdn-redge.media/livehls/oil/ch14/live/ch14/live.livx/playlist.m3u8';
const KAN11_STABLE_HLS = 'https://r.il.cdn-redge.media/livehls/oil/kancdn-live/live/kan11/live.livx/playlist.m3u8';
const KESHET_LIVE_PAGE = 'https://www.mako.co.il/mako-vod-live-tv/VOD-6540b8dcb64fd31006.htm';
const KESHET_PLAYLIST_URL = 'https://www.mako.co.il/AjaxPage?jspName=playlist12.jsp&videoChannelId=5d28d21b4580e310VgnVCM2000002a0c10acRCRD&galleryChannelId=6540b8dcb64fd310VgnVCM2000002a0c10acRCRD&vcmid=6540b8dcb64fd310VgnVCM2000002a0c10acRCRD';
const KESHET_ENTITLEMENT_URL = 'https://mass.mako.co.il/ClicksStatistics/entitlementsServicesV2.jsp?et=egt';
const KESHET_VCM_ID = '6540b8dcb64fd310VgnVCM2000002a0c10acRCRD';
const KESHET_PLAYER_VERSION = '7.15.0';
const KESHET_PLAYLIST_KEY = Buffer.from('LTf7r/zM2VndHwP+4So6bw==', 'utf8');
const KESHET_TOKEN_KEY = Buffer.from('YhnUaXMmltB6gd8p9SWleQ==', 'utf8');
const KESHET_CRYPTO_IV = Buffer.from('theExact16Chars=', 'utf8');

type BrightcovePlaybackResponse = {
  sources?: Array<{
    src?: string;
    type?: string;
  }>;
};

type UnivtecPlayResponse = {
  vod?: {
    hlsMaster?: string;
    hlsStream?: string;
  };
};

type KeshetPlaylist = {
  media?: Array<{
    url?: string;
    cdn?: string;
    ssai?: boolean;
  }>;
};

type KeshetEntitlement = {
  caseId?: string;
  tickets?: Array<{
    ticket?: string;
  }>;
};

function isMobileUserAgent(userAgent: string | null): boolean {
  return /Android|iPhone|iPad|iPod|Mobile|CriOS|FxiOS/i.test(userAgent ?? '');
}

async function fetchPage(url: string, userAgent = DESKTOP_USER_AGENT): Promise<string | null> {
  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': userAgent,
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'he-IL,he;q=0.9,en-US;q=0.8',
        'Cache-Control': 'no-cache',
      },
      signal: AbortSignal.timeout(12000),
    });
    return await response.text();
  } catch {
    return null;
  }
}

function extractM3u8(html: string): string | null {
  const patterns = [
    /https:\/\/[^"'\s<>]+\.m3u8[^"'\s<>]*/,
    /"(https:\/\/[^"]+\.m3u8[^"]*)"/,
    /'(https:\/\/[^']+\.m3u8[^']*)'/,
    /https:\\\/\\\/[^"'<>]+\.m3u8[^"'<>]*/,
  ];
  for (const pattern of patterns) {
    const match = html.match(pattern);
    const rawUrl = match?.[1] ?? match?.[0];
    if (!rawUrl) continue;
    return rawUrl.replace(/\\\//g, '/').replace(/\\\\/g, '');
  }
  return null;
}

function decryptKeshetPayload<T>(encrypted: string, key: Buffer): T | null {
  try {
    const decipher = createDecipheriv('aes-192-cbc', key, KESHET_CRYPTO_IV);
    const decrypted = Buffer.concat([
      decipher.update(Buffer.from(encrypted.trim(), 'base64')),
      decipher.final(),
    ]);
    return JSON.parse(decrypted.toString('utf8')) as T;
  } catch {
    return null;
  }
}

function encryptKeshetPayload(payload: object, key: Buffer): string {
  const cipher = createCipheriv('aes-192-cbc', key, KESHET_CRYPTO_IV);
  return Buffer.concat([
    cipher.update(JSON.stringify(payload), 'utf8'),
    cipher.final(),
  ]).toString('base64');
}

async function resolveKeshet12Stream(userAgent: string | null): Promise<string | null> {
  try {
    const headers = {
      'User-Agent': userAgent || DESKTOP_USER_AGENT,
      Accept: 'text/plain,*/*',
      Referer: KESHET_LIVE_PAGE,
      Origin: 'https://www.mako.co.il',
      'Cache-Control': 'no-cache',
    };
    const playlistResponse = await fetch(KESHET_PLAYLIST_URL, {
      headers,
      signal: AbortSignal.timeout(12000),
      cache: 'no-store',
    });
    if (!playlistResponse.ok) return null;

    const encryptedPlaylist = await playlistResponse.text();
    const playlist = decryptKeshetPayload<KeshetPlaylist>(encryptedPlaylist, KESHET_PLAYLIST_KEY);
    const source = playlist?.media?.find(item => item.cdn === 'AWS' && item.ssai === false)
      ?? playlist?.media?.find(item => item.cdn === 'AWS')
      ?? playlist?.media?.[0];
    if (!source?.url || !source.cdn) return null;

    const sourceUrl = new URL(source.url);
    const entitlementPayload = encryptKeshetPayload({
      lp: `${sourceUrl.pathname}${sourceUrl.search}`,
      rv: source.cdn,
      du: 'null',
      dv: KESHET_VCM_ID,
      na: KESHET_PLAYER_VERSION,
    }, KESHET_TOKEN_KEY);
    const entitlementResponse = await fetch(KESHET_ENTITLEMENT_URL, {
      method: 'POST',
      headers: {
        ...headers,
        'Content-Type': 'text/plain;charset=UTF-8',
      },
      body: entitlementPayload,
      signal: AbortSignal.timeout(12000),
      cache: 'no-store',
    });
    if (!entitlementResponse.ok) return null;

    const encryptedEntitlement = await entitlementResponse.text();
    const entitlement = decryptKeshetPayload<KeshetEntitlement>(encryptedEntitlement, KESHET_TOKEN_KEY);
    const ticket = entitlement?.caseId === '1' ? entitlement.tickets?.[0]?.ticket : null;
    if (!ticket) return null;

    return `${source.url}${source.url.includes('?') ? '&' : '?'}${ticket}`;
  } catch {
    return null;
  }
}

async function isPlayableHlsManifest(url: string, userAgent: string | null): Promise<boolean> {
  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': userAgent || DESKTOP_USER_AGENT,
        Accept: 'application/vnd.apple.mpegurl,application/x-mpegURL,text/plain,*/*',
        Referer: KESHET_LIVE_PAGE,
        Origin: 'https://www.mako.co.il',
      },
      signal: AbortSignal.timeout(8000),
      cache: 'no-store',
    });
    if (!response.ok) return false;

    const manifest = await response.text();
    return manifest.trimStart().startsWith('#EXTM3U');
  } catch {
    return false;
  }
}

async function resolveI24Stream(): Promise<string | null> {
  try {
    const response = await fetch(`https://edge.api.brightcove.com/playback/v1/accounts/${I24_ACCOUNT_ID}/videos/${I24_VIDEO_ID}`, {
      headers: {
        Accept: 'application/json',
        'BCOV-Policy': I24_POLICY_KEY,
      },
      signal: AbortSignal.timeout(12000),
      cache: 'no-store',
    });

    if (!response.ok) return null;

    const data = (await response.json()) as BrightcovePlaybackResponse;
    const hlsSource = data.sources?.find(source => source.src?.includes('.m3u8'))
      ?? data.sources?.find(source => source.type === 'application/vnd.apple.mpegurl');

    return hlsSource?.src ?? null;
  } catch {
    return null;
  }
}

async function resolveNow14Stream(): Promise<string | null> {
  try {
    const url = `${NOW14_API_BASE}cms/interface/channels/play?relations=true&filter=guid||$eq||${NOW14_GUID}`;
    const response = await fetch(url, {
      headers: {
        Accept: 'application/json',
        'User-Agent': DESKTOP_USER_AGENT,
        'x-tenant-id': NOW14_TENANT_ID,
      },
      signal: AbortSignal.timeout(12000),
      cache: 'no-store',
    });

    if (!response.ok) return NOW14_STABLE_HLS;

    const data = (await response.json()) as UnivtecPlayResponse;
    return data.vod?.hlsMaster ?? data.vod?.hlsStream ?? NOW14_STABLE_HLS;
  } catch {
    return NOW14_STABLE_HLS;
  }
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ channel: string }> }
) {
  const { channel } = await params;
  const requestUserAgent = request.headers.get('user-agent');

  try {
    // === כאן 11 — try scraping live page first, fall back to stable CDN ===
    if (channel === 'kan11') {
      const pagesToTry = [
        'https://www.kan.org.il/live/',
        'https://www.kan.org.il/live/tv.aspx?stationid=2',
      ];
      for (const pageUrl of pagesToTry) {
        const html = await fetchPage(pageUrl);
        if (!html) continue;
        const url = extractM3u8(html);
        if (url) return NextResponse.json({ url, expires: Date.now() + 3600000 });
      }
      // Return known stable CDN as fallback
      return NextResponse.json({
        url: KAN11_STABLE_HLS,
        expires: Date.now() + 3600000,
      });
    }

    // === כאן 33 ===
    if (channel === 'kan33') {
      const html = await fetchPage('https://www.kan.org.il/live/tv.aspx?stationid=23');
      if (html) {
        const url = extractM3u8(html);
        if (url) return NextResponse.json({ url, expires: Date.now() + 3600000 });
      }
    }

    // === רשת 13 — scrape for latest URL; fallback to known stable CloudFront URLs ===
    if (channel === 'reshet13') {
      const html = await fetchPage('https://13tv.co.il/live/');
      if (html) {
        // Prefer CloudFront URLs (more stable than g-mana session URLs)
        const cloudFrontMatch = html.match(/https:\/\/[^"']+cloudfront\.net[^"']+\.m3u8[^"']*/);
        if (cloudFrontMatch) {
          return NextResponse.json({ url: cloudFrontMatch[0], expires: Date.now() + 3600000 });
        }
        const url = extractM3u8(html);
        if (url) return NextResponse.json({ url, expires: Date.now() + 3600000 });
      }
      // Fallback: known stable CloudFront URLs for Reshet 13
      return NextResponse.json({
        url: 'https://d2xg1g9o5vns8m.cloudfront.net/out/v1/66d4ac8748ce4a9298b4e40e48d1ae2f/index.m3u8',
        expires: Date.now() + 3600000,
      });
    }

    if (channel === 'i24') {
      const url = await resolveI24Stream();
      return NextResponse.json({
        url,
        expires: Date.now() + (url ? 1800000 : 300000),
      });
    }

    // === קשת 12 — try to resolve direct HLS, otherwise client falls back to iframe ===
    if (channel === 'keshet12') {
      const resolvedUrl = await resolveKeshet12Stream(requestUserAgent);
      const upstreamUrl = resolvedUrl && await isPlayableHlsManifest(resolvedUrl, requestUserAgent)
        ? resolvedUrl
        : null;
      const url = upstreamUrl
        ? `/api/stream-proxy/keshet12?url=${encodeURIComponent(upstreamUrl)}`
        : null;
      return NextResponse.json({
        url,
        type: url ? 'hls' : null,
        source: url ? 'signed-hls-proxy' : 'mako-embed-fallback',
        mobileRequest: isMobileUserAgent(requestUserAgent),
        expires: Date.now() + (url ? 1800000 : 300000),
      });
    }

    // === ׳¢׳›׳©׳™׳• 14 ג€” resolve the OK live HLS for muted homepage previews ===
    if (channel === 'now14') {
      const url = await resolveNow14Stream();
      return NextResponse.json({
        url,
        expires: Date.now() + (url ? 1800000 : 300000),
      });
    }

    return NextResponse.json({ url: null }, { status: 404 });
  } catch {
    return NextResponse.json({ url: null, error: 'Failed to fetch stream' }, { status: 500 });
  }
}
