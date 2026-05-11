import { NextRequest, NextResponse } from 'next/server';

const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
const I24_ACCOUNT_ID = '5377161796001';
const I24_VIDEO_ID = '6352464366112';
const I24_POLICY_KEY = 'BCpkADawqM1UIU4favtR1Jj4rqM0ZAkYwMEbgN9bsEpJ2150CdxJmRIG8jK-Up_9w4w37x3tP1AsoO_MZhD_XoAGkdKWxymaaw4OHuhPn_lEJczODTm3AO7S08gLFPnLnb-FcKJwXhbxCQ10';
const NOW14_GUID = '9fb14ce7-fcc2-4695-839b-e641390d7a00';
const NOW14_API_BASE = 'https://insight-api-channel14.univtec.com/';
const NOW14_TENANT_ID = 'channel14';
const NOW14_STABLE_HLS = 'https://r.il.cdn-redge.media/livehls/oil/ch14/live/ch14/live.livx/playlist.m3u8';
const KAN11_STABLE_HLS = 'https://r.il.cdn-redge.media/livehls/oil/kancdn-live/live/kan11/live.livx/playlist.m3u8';

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

async function fetchPage(url: string): Promise<string | null> {
  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': USER_AGENT,
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

async function resolveKeshet12Stream(): Promise<string | null> {
  const candidateUrls = [
    'https://www.mako.co.il/mako-vod-live-tv/VOD-6540b8dcb64fd31006.htm',
    'https://www.mako.co.il/AjaxPage?jspName=embedHTML5video.jsp&galleryChannelId=6540b8dcb64fd310VgnVCM2000002a0c10acRCRD&videoChannelId=5d28d21b4580e310VgnVCM2000002a0c10acRCRD&vcmid=6540b8dcb64fd310VgnVCM2000002a0c10acRCRD&autoPlay=true',
    'https://www.mako.co.il/AjaxPage?jspName=embedHTML5video.jsp&galleryChannelId=7c5076a9b8757810VgnVCM100000700a10acRCRD&videoChannelId=d1d6f5dfc8517810VgnVCM100000700a10acRCRD&vcmid=1e2258089b67f510VgnVCM2000002a0c10acRCRD&autoPlay=true',
    'https://www.mako.co.il/live-news?partner=NavBar',
  ];

  for (const url of candidateUrls) {
    const html = await fetchPage(url);
    if (!html) continue;

    const cloudFrontMatch = html.match(/https:\/\/[^"']+(?:cloudfront|akamaized|mako)[^"']+\.m3u8[^"']*/i);
    if (cloudFrontMatch?.[0]) {
      return cloudFrontMatch[0].replace(/\\\//g, '/');
    }

    const extracted = extractM3u8(html);
    if (extracted) return extracted;
  }

  return null;
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
        'User-Agent': USER_AGENT,
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

  try {
    // === כאן 11 — prefer the stable HTTPS Redge CDN URL ===
    if (channel === 'kan11') {
      const html = await fetchPage('https://www.kan.org.il/live/');
      if (html) {
        const url = extractM3u8(html);
        if (url?.includes('cdn-redge.media')) return NextResponse.json({ url, expires: Date.now() + 3600000 });
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
      const url = await resolveKeshet12Stream();
      return NextResponse.json({
        url,
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
