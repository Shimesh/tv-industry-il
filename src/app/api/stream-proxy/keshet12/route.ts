import { NextRequest, NextResponse } from 'next/server';

const KESHET_LIVE_PAGE = 'https://www.mako.co.il/mako-vod-live-tv/VOD-6540b8dcb64fd31006.htm';
const ALLOWED_HOST = 'd2249b6f08tjt0.cloudfront.net';
const ALLOWED_PATH_PREFIX = '/k12dvr/';

export const dynamic = 'force-dynamic';

function parseAllowedUrl(rawUrl: string | null): URL | null {
  if (!rawUrl) return null;

  try {
    const url = new URL(rawUrl);
    if (url.protocol !== 'https:') return null;
    if (url.hostname !== ALLOWED_HOST) return null;
    if (!url.pathname.startsWith(ALLOWED_PATH_PREFIX)) return null;
    return url;
  } catch {
    return null;
  }
}

function proxyUrl(request: NextRequest, upstreamUrl: URL): string {
  const url = new URL('/api/stream-proxy/keshet12', request.nextUrl.origin);
  url.searchParams.set('url', upstreamUrl.toString());
  return url.toString();
}

function trimDvrManifest(manifest: string, segmentLimit = 12): string {
  const lines = manifest.split(/\r?\n/);
  if (!lines.some(line => line.startsWith('#EXTINF:'))) return manifest;

  const segmentIndexes = lines
    .map((line, index) => ({ line: line.trim(), index }))
    .filter(item => item.line && !item.line.startsWith('#'))
    .map(item => item.index);
  if (segmentIndexes.length <= segmentLimit) return manifest;

  const selectedOffset = segmentIndexes.length - segmentLimit;
  const firstSegmentIndex = segmentIndexes[0];
  const selectedGroupStart = segmentIndexes[selectedOffset - 1] + 1;
  const prefix = lines.slice(0, firstSegmentIndex).filter(line =>
    !line.startsWith('#EXTINF:')
    && !line.startsWith('#EXT-X-PROGRAM-DATE-TIME:')
    && !line.startsWith('#EXT-X-BYTERANGE:')
    && line !== '#EXT-X-DISCONTINUITY'
  );
  const mediaSequenceIndex = prefix.findIndex(line => line.startsWith('#EXT-X-MEDIA-SEQUENCE:'));
  if (mediaSequenceIndex >= 0) {
    const mediaSequence = Number(prefix[mediaSequenceIndex].split(':')[1]);
    if (Number.isFinite(mediaSequence)) {
      prefix[mediaSequenceIndex] = `#EXT-X-MEDIA-SEQUENCE:${mediaSequence + selectedOffset}`;
    }
  }

  return [...prefix, ...lines.slice(selectedGroupStart)].join('\n');
}

function rewriteManifest(request: NextRequest, upstreamUrl: URL, manifest: string): string {
  return trimDvrManifest(manifest)
    .split(/\r?\n/)
    .map(line => {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) return line;
      return proxyUrl(request, new URL(trimmed, upstreamUrl));
    })
    .join('\n');
}

export async function GET(request: NextRequest) {
  const upstreamUrl = parseAllowedUrl(request.nextUrl.searchParams.get('url'));
  if (!upstreamUrl) {
    return NextResponse.json({ error: 'Invalid stream URL' }, { status: 400 });
  }

  const range = request.headers.get('range');
  const upstreamResponse = await fetch(upstreamUrl, {
    headers: {
      Accept: request.headers.get('accept') || '*/*',
      Origin: 'https://www.mako.co.il',
      Referer: KESHET_LIVE_PAGE,
      ...(range ? { Range: range } : {}),
    },
    signal: AbortSignal.timeout(15000),
    cache: 'no-store',
  });

  if (!upstreamResponse.ok || !upstreamResponse.body) {
    return NextResponse.json(
      { error: 'Upstream stream unavailable' },
      { status: upstreamResponse.status || 502 },
    );
  }

  const contentType = upstreamResponse.headers.get('content-type') || 'application/octet-stream';
  const isManifest = upstreamUrl.pathname.endsWith('.m3u8')
    || contentType.includes('mpegurl');
  const headers = new Headers({
    'Content-Type': contentType,
    'Cache-Control': isManifest ? 'no-store' : 'public, max-age=30',
  });

  const contentRange = upstreamResponse.headers.get('content-range');
  const acceptRanges = upstreamResponse.headers.get('accept-ranges');
  if (contentRange) headers.set('Content-Range', contentRange);
  if (acceptRanges) headers.set('Accept-Ranges', acceptRanges);

  if (isManifest) {
    const manifest = await upstreamResponse.text();
    return new NextResponse(rewriteManifest(request, upstreamUrl, manifest), {
      status: upstreamResponse.status,
      headers,
    });
  }

  return new NextResponse(upstreamResponse.body, {
    status: upstreamResponse.status,
    headers,
  });
}
