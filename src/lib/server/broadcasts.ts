import { channels } from '@/data/channels';
import {
  deriveBroadcastChannelState,
  type BroadcastChannelState,
  type BroadcastProgram,
  type BroadcastSnapshotStatus,
  type BroadcastSourceType,
} from '@/lib/broadcasts';
import { getDocument, patchDocument } from '@/lib/server/firestoreAdminRest';

const CACHE_TTL_MS = 3 * 60 * 1000;
const STALE_TTL_MS = 12 * 60 * 60 * 1000;
const REQUEST_TIMEOUT_MS = 12_000;
const HOME_CHANNEL_IDS = ['kan11', 'keshet12', 'reshet13', 'now14'];
const ISRAMEIDA_GUIDE_URL = 'https://www.isramedia.net/tv';
const ISRAMEIDA_SPORTS_GUIDE_URL = 'https://www.isramedia.net/sports-broadcasts';

const ISRAMEIDA_CHANNEL_PAGE_URLS: Partial<Record<string, string>> = {
  i24: 'https://www.isramedia.net/9568/%D7%A2%D7%A8%D7%95%D7%A6%D7%99-%D7%97%D7%93%D7%A9%D7%95%D7%AA/%D7%A2%D7%A8%D7%95%D7%A5-I24NEWS-%D7%91%D7%A9%D7%99%D7%93%D7%95%D7%A8-%D7%97%D7%99',
  knesset: 'https://www.isramedia.net/4/%D7%A2%D7%A8%D7%95%D7%A6%D7%99%D7%9D-%D7%9E%D7%99%D7%A9%D7%A8%D7%90%D7%9C/%D7%A2%D7%A8%D7%95%D7%A5-%D7%94%D7%9B%D7%A0%D7%A1%D7%AA-%D7%A9%D7%99%D7%93%D7%95%D7%A8-%D7%97%D7%99',
  kan33: 'https://www.isramedia.net/5628/%D7%A2%D7%A8%D7%95%D7%A6%D7%99%D7%9D-%D7%9E%D7%99%D7%A9%D7%A8%D7%90%D7%9C/%D7%A2%D7%A8%D7%95%D7%A5-33-%D7%A9%D7%99%D7%93%D7%95%D7%A8-%D7%97%D7%99',
};

const ISRAMEIDA_SCHEDULE_PAGE_URLS: Partial<Record<string, string>> = {
  i24: 'https://www.isramedia.net/%D7%9C%D7%95%D7%97-%D7%A9%D7%99%D7%93%D7%95%D7%A8%D7%99%D7%9D/9568/%D7%A2%D7%A8%D7%95%D7%A5-I24NEWS-%D7%91%D7%A9%D7%99%D7%93%D7%95%D7%A8-%D7%97%D7%99',
  knesset: 'https://www.isramedia.net/%D7%9C%D7%95%D7%97-%D7%A9%D7%99%D7%93%D7%95%D7%A8%D7%99%D7%9D/4/%D7%A2%D7%A8%D7%95%D7%A5-%D7%94%D7%9B%D7%A0%D7%A1%D7%AA-%D7%A9%D7%99%D7%93%D7%95%D7%A8-%D7%97%D7%99',
  kan33: 'https://www.isramedia.net/%D7%9C%D7%95%D7%97-%D7%A9%D7%99%D7%93%D7%95%D7%A8%D7%99%D7%9D/5628/%D7%A2%D7%A8%D7%95%D7%A5-33-%D7%A9%D7%99%D7%93%D7%95%D7%A8-%D7%97%D7%99',
  charlton1: 'https://www.isramedia.net/%D7%9C%D7%95%D7%97-%D7%A9%D7%99%D7%93%D7%95%D7%A8%D7%99%D7%9D/56/%D7%A1%D7%A4%D7%95%D7%A8%D7%98-1',
  charlton2: 'https://www.isramedia.net/%D7%9C%D7%95%D7%97-%D7%A9%D7%99%D7%93%D7%95%D7%A8%D7%99%D7%9D/91/%D7%A1%D7%A4%D7%95%D7%A8%D7%98-2',
  charlton3: 'https://www.isramedia.net/%D7%9C%D7%95%D7%97-%D7%A9%D7%99%D7%93%D7%95%D7%A8%D7%99%D7%9D/14950/%D7%A1%D7%A4%D7%95%D7%A8%D7%98-3',
  charlton4: 'https://www.isramedia.net/%D7%9C%D7%95%D7%97-%D7%A9%D7%99%D7%93%D7%95%D7%A8%D7%99%D7%9D/14951/%D7%A1%D7%A4%D7%95%D7%A8%D7%98-4',
  charlton6: 'https://www.isramedia.net/%D7%9C%D7%95%D7%97-%D7%A9%D7%99%D7%93%D7%95%D7%A8%D7%99%D7%9D/14953/%D7%A1%D7%A4%D7%95%D7%A8%D7%98-6',
};

type AdapterResult = {
  programs: BroadcastProgram[];
  sourceUrl: string;
  sourceType: Extract<BroadcastSourceType, 'official-html' | 'official-json' | 'isramedia-html'>;
};

type CachedBroadcastDocument = {
  channelId?: string;
  programs?: BroadcastProgram[];
  fetchedAt?: string | null;
  expiresAt?: string | null;
  sourceUrl?: string | null;
  sourceType?: BroadcastSourceType;
  status?: BroadcastSnapshotStatus;
  lastError?: string | null;
};

type Adapter = () => Promise<AdapterResult>;

type GuideSnapshot = {
  sourceUrl: string;
  sourceType: Extract<BroadcastSourceType, 'isramedia-html'>;
  channels: Partial<Record<string, BroadcastProgram[]>>;
};

const OFFICIAL_SOURCES: Record<string, string> = {
  kan11: ISRAMEIDA_GUIDE_URL,
  keshet12: ISRAMEIDA_GUIDE_URL,
  reshet13: ISRAMEIDA_GUIDE_URL,
  now14: ISRAMEIDA_GUIDE_URL,
  i24: ISRAMEIDA_GUIDE_URL,
  knesset: ISRAMEIDA_GUIDE_URL,
  kan33: ISRAMEIDA_GUIDE_URL,
  sport55: ISRAMEIDA_GUIDE_URL,
  sport56: ISRAMEIDA_GUIDE_URL,
  live: ISRAMEIDA_GUIDE_URL,
  gold: ISRAMEIDA_GUIDE_URL,
  charlton1: ISRAMEIDA_GUIDE_URL,
  charlton2: ISRAMEIDA_GUIDE_URL,
  charlton3: ISRAMEIDA_GUIDE_URL,
  charlton4: ISRAMEIDA_GUIDE_URL,
  charlton6: ISRAMEIDA_SPORTS_GUIDE_URL,
};

const ISRAMEIDA_MATCHERS: Array<{ channelId: string; test: (label: string, href: string) => boolean }> = [
  { channelId: 'kan11', test: (label, href) => label.includes('ערוץ 11') || label.includes('כאן 11') || href.includes('/1/') },
  { channelId: 'keshet12', test: (label, href) => label.includes('ערוץ 12') || href.includes('/12/') },
  { channelId: 'reshet13', test: (label, href) => label.includes('ערוץ 13') || href.includes('/13/') },
  { channelId: 'now14', test: (label, href) => label.includes('ערוץ 14') || href.includes('/14/') },
  { channelId: 'i24', test: (label, href) => label.includes('i24') || href.includes('/9568/') },
  { channelId: 'sport55', test: (label) => label.includes('ספורט 5 שידור חי') },
  { channelId: 'sport56', test: (label) => label.includes('ספורט 5 פלוס') },
  { channelId: 'live', test: (label) => label.includes('ספורט 5 לייב') },
  { channelId: 'gold', test: (label) => label.includes('ספורט 5 גולד') },
];

const ISRAMEIDA_MATCHERS_V2: Array<{ channelId: string; test: (label: string, href: string) => boolean }> = [
  { channelId: 'kan11', test: (label, href) => label.includes('כאן 11') || label.includes('ערוץ 11') || href.includes('/1/') },
  { channelId: 'keshet12', test: (label, href) => label.includes('ערוץ 12') || href.includes('/12/') },
  { channelId: 'reshet13', test: (label, href) => label.includes('ערוץ 13') || href.includes('/13/') },
  { channelId: 'now14', test: (label, href) => label.includes('ערוץ 14') || href.includes('/14/') },
  { channelId: 'i24', test: (label, href) => label.toLowerCase().includes('i24') || href.includes('/9568/') },
  { channelId: 'knesset', test: (label, href) => label.includes('ערוץ הכנסת') || href.includes('/4/') },
  { channelId: 'kan33', test: (label, href) => label.includes('ערוץ 33') || label.includes('כאן 33') || href.includes('/5628/') },
  { channelId: 'sport55', test: (label) => label.includes('ספורט 5 שידור חי') },
  { channelId: 'sport56', test: (label) => label.includes('ספורט 5 פלוס') },
  { channelId: 'live', test: (label) => label.includes('ספורט 5 לייב') },
  { channelId: 'gold', test: (label) => label.includes('ספורט 5 גולד') },
  { channelId: 'knesset', test: (label, href) => label.includes('ערוץ הכנסת') || href.includes('/4/') },
  { channelId: 'kan33', test: (label, href) => label.includes('ישראל 33') || href.includes('/5628/') },
  { channelId: 'charlton1', test: (label, href) => label.includes('ספורט 1') || href.includes('/56/') },
  { channelId: 'charlton2', test: (label, href) => label.includes('ספורט 2') || href.includes('/91/') },
  { channelId: 'charlton3', test: (label, href) => label.includes('ספורט 3') || href.includes('/14950/') },
  { channelId: 'charlton4', test: (label, href) => label.includes('ספורט 4') || href.includes('/14951/') },
];

function nowIso(): string {
  return new Date().toISOString();
}

function addMinutes(date: Date, minutes: number): Date {
  return new Date(date.getTime() + minutes * 60_000);
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9\u0590-\u05ff]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

function decodeHtmlEntities(value: string): string {
  return value
    .replace(/&nbsp;/gi, ' ')
    .replace(/&#160;/g, ' ')
    .replace(/&#x27;/gi, "'")
    .replace(/&#39;/g, "'")
    .replace(/&quot;/gi, '"')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>');
}

function stripTags(value: string): string {
  return decodeHtmlEntities(value)
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function stripTagsToLines(value: string): string {
  return decodeHtmlEntities(
    value
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<\/(li|ul|div|p|h1|h2|h3|h4|h5|h6|tr|td|span|time)>/gi, '\n')
      .replace(/<br\s*\/?>/gi, '\n'),
  )
    .replace(/<[^>]+>/g, ' ')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n[ \t]+/g, '\n')
    .replace(/\n+/g, '\n')
    .trim();
}

function decodeResponseBody(buffer: ArrayBuffer, contentType: string | null): string {
  const charsetMatch = contentType?.match(/charset=([^;]+)/i);
  const charset = charsetMatch?.[1]?.trim().toLowerCase() || 'utf-8';
  const supportedCharset = charset === 'windows-1255' ? 'windows-1255' : 'utf-8';
  return new TextDecoder(supportedCharset).decode(buffer);
}

function buildProgramsFromEntries(
  channelId: string,
  entries: Array<{ startAt: string; title: string; sourceUrl: string }>,
): BroadcastProgram[] {
  const normalized = entries
    .map((entry, index) => {
      const date = new Date(entry.startAt);
      if (Number.isNaN(date.getTime())) return null;

      return {
        id: `${channelId}-${date.toISOString()}-${slugify(entry.title || `program-${index}`)}`,
        channelId,
        title: entry.title,
        description: '',
        genre: null,
        isLive: false,
        sourceUrl: entry.sourceUrl,
        startAt: date,
      };
    })
    .filter((program): program is NonNullable<typeof program> => Boolean(program))
    .sort((a, b) => a.startAt.getTime() - b.startAt.getTime());

  return normalized.map((program, index) => {
    const next = normalized[index + 1];
    const endAt = next ? next.startAt : addMinutes(program.startAt, 60);

    return {
      ...program,
      startAt: program.startAt.toISOString(),
      endAt: endAt.toISOString(),
    };
  });
}

function parseDurationToMinutes(value: string): number | null {
  const normalized = value.trim();
  const hhmmMatch = normalized.match(/^(\d{2}):(\d{2})$/);
  if (hhmmMatch) {
    return Number(hhmmMatch[1]) * 60 + Number(hhmmMatch[2]);
  }

  const minutesMatch = normalized.match(/^(\d{1,3})$/);
  if (minutesMatch) {
    return Number(minutesMatch[1]);
  }

  return null;
}

function normalizeStaleIsramediaEntriesToToday<T extends { startAt: Date; timeLabel: string }>(entries: T[]): T[] {
  const sorted = [...entries].sort((a, b) => a.startAt.getTime() - b.startAt.getTime());
  const base = new Date();
  base.setHours(0, 0, 0, 0);

  let dayOffset = 0;
  let previousMinutes = -1;

  return sorted.map((entry) => {
    const timeMatch = entry.timeLabel.match(/^(\d{2}):(\d{2})$/);
    if (!timeMatch) return entry;

    const hours = Number(timeMatch[1]);
    const minutes = Number(timeMatch[2]);
    const totalMinutes = hours * 60 + minutes;

    if (previousMinutes >= 0 && totalMinutes < previousMinutes) {
      dayOffset += 1;
    }
    previousMinutes = totalMinutes;

    const normalizedStartAt = new Date(base);
    normalizedStartAt.setDate(base.getDate() + dayOffset);
    normalizedStartAt.setHours(hours, minutes, 0, 0);

    return {
      ...entry,
      startAt: normalizedStartAt,
    };
  });
}

function isFreshSchedule(programs: BroadcastProgram[]): boolean {
  if (!programs.length) return false;

  const newestStartAt = Math.max(...programs.map((program) => Date.parse(program.startAt)));
  if (!Number.isFinite(newestStartAt)) return false;

  const now = Date.now();
  return newestStartAt > now - 36 * 60 * 60 * 1000 && newestStartAt < now + 7 * 24 * 60 * 60 * 1000;
}

function parseIsramediaSchedulePage(html: string, channelId: string, sourceUrl: string): BroadcastProgram[] {
  const rowRegex =
    /<tr class="([^"]*)"[^>]*>\s*<td class="tvguidetime"><time datetime="([^"]+)">([^<]*)<\/time><\/td>\s*<td class="tvguideshowname">([\s\S]*?)<\/td>\s*<td class="tvshowduration">([^<]+)<\/td>\s*<\/tr>(?:\s*<tr class="description"[^>]*>\s*<td><\/td>\s*<td colspan="3">([\s\S]*?)<\/td>\s*<\/tr>)?/gi;

  const entries: Array<{
    startAt: Date;
    timeLabel: string;
    title: string;
    description: string;
    durationMinutes: number | null;
    isLive: boolean;
  }> = [];

  let match: RegExpExecArray | null = rowRegex.exec(html);
  while (match) {
    const rowClass = match[1] || '';
    const startAtRaw = match[2];
    const timeLabel = stripTags(match[3] || '');
    const title = stripTags(match[4] || '');
    const duration = stripTags(match[5] || '');
    const description = stripTags(match[6] || '');
    const startAt = new Date(startAtRaw);

    if (!title || Number.isNaN(startAt.getTime())) {
      match = rowRegex.exec(html);
      continue;
    }

    const durationMinutes = parseDurationToMinutes(duration);
    const liveText = `${title} ${description}`;

    entries.push({
      startAt,
      timeLabel,
      title,
      description,
      durationMinutes,
      isLive: rowClass.includes('current') || liveText.includes('שידור חי'),
    });

    match = rowRegex.exec(html);
  }

  const newestStartAt = Math.max(...entries.map((entry) => entry.startAt.getTime()));
  const normalized =
    Number.isFinite(newestStartAt) && newestStartAt < Date.now() - 3 * 24 * 60 * 60 * 1000
      ? normalizeStaleIsramediaEntriesToToday(entries)
      : entries.sort((a, b) => a.startAt.getTime() - b.startAt.getTime());

  return normalized.map((entry, index) => {
    const nextEntry = normalized[index + 1];
    const inferredEndAt = nextEntry
      ? nextEntry.startAt
      : addMinutes(entry.startAt, entry.durationMinutes || 60);

    return {
      id: `${channelId}-${entry.startAt.toISOString()}-${slugify(entry.title || `program-${index}`)}`,
      channelId,
      title: entry.title,
      description: entry.description,
      startAt: entry.startAt.toISOString(),
      endAt: inferredEndAt.toISOString(),
      genre: null,
      isLive: entry.isLive,
      sourceUrl,
    };
  });
}

function getChannelIdFromIsramedia(label: string, href: string): string | null {
  for (const matcher of ISRAMEIDA_MATCHERS_V2) {
    if (matcher.test(label, href)) {
      return matcher.channelId;
    }
  }
  return null;
}

function parseIsramediaGuide(html: string): GuideSnapshot {
  const sections = html.split('<li><h3><a href="').slice(1);
  const parsed: Partial<Record<string, BroadcastProgram[]>> = {};

  for (const chunk of sections) {
    const sectionHtml = `<li><h3><a href="${chunk}`;
    const hrefMatch = sectionHtml.match(/<li><h3><a href="([^"]+)"/i);
    const altMatch = sectionHtml.match(/alt="([^"]+)"/i);
    const anchorInnerMatch = sectionHtml.match(/<li><h3><a href="[^"]+">([\s\S]*?)<\/a><\/h3>/i);

    const href = hrefMatch?.[1] || '';
    const label = stripTags(altMatch?.[1] || anchorInnerMatch?.[1] || '');
    const channelId = getChannelIdFromIsramedia(label, href);
    if (!channelId) continue;

    const sourceUrl = href.startsWith('http')
      ? href
      : `https://www.isramedia.net/${href.replace(/^\/+/, '')}`;

    const entries: Array<{ startAt: string; title: string; sourceUrl: string }> = [];
    const itemRegex = /<li class="time"><span><time datetime="([^"]+)">[^<]*<\/time><\/span><\/li>\s*<li class="info">([\s\S]*?)<\/li>/gi;

    let match: RegExpExecArray | null = itemRegex.exec(sectionHtml);
    while (match) {
      const startAt = match[1];
      const title = stripTags(match[2]);
      if (startAt && title) {
        entries.push({ startAt, title, sourceUrl });
      }
      match = itemRegex.exec(sectionHtml);
    }

    if (entries.length > 0) {
      parsed[channelId] = buildProgramsFromEntries(channelId, entries);
    }
  }

  return {
    sourceUrl: ISRAMEIDA_GUIDE_URL,
    sourceType: 'isramedia-html',
    channels: parsed,
  };
}

function mapSportsGuideChannel(channelName: string): string | null {
  const normalized = stripTags(channelName);

  switch (normalized) {
    case 'ספורט 1':
      return 'charlton1';
    case 'ספורט 2':
      return 'charlton2';
    case 'ספורט 3':
      return 'charlton3';
    case 'ספורט 4':
      return 'charlton4';
    case 'ספורט 6':
      return 'charlton6';
    case 'ספורט 5':
      return 'sport55';
    case 'ספורט 5+':
      return 'sport56';
    case 'ספורט 5+ לייב':
      return 'live';
    case 'ספורט 5 גולד':
      return 'gold';
    default:
      return null;
  }
}

function parseIsramediaSportsGuide(html: string): GuideSnapshot {
  const rowRegex = /<ul class="show-container">\s*<li class="time">([^<]+)<\/li>\s*<li class="channelname">([\s\S]*?)<\/li>\s*<li class="showname">([\s\S]*?)<\/li>\s*<\/ul>/gi;
  const groupedEntries: Partial<Record<string, Array<{ startAt: string; title: string; sourceUrl: string }>>> = {};
  const today = new Date();
  const datePart = `${String(today.getDate()).padStart(2, '0')}/${String(today.getMonth() + 1).padStart(2, '0')}/${today.getFullYear()}`;

  let match: RegExpExecArray | null = rowRegex.exec(html);
  while (match) {
    const timePart = stripTags(match[1] || '');
    const channelName = stripTags(match[2] || '');
    const title = stripTags(match[3] || '');
    const channelId = mapSportsGuideChannel(channelName);
    const startAt = buildJerusalemIso(datePart, timePart);

    if (!channelId || !title || !startAt) {
      match = rowRegex.exec(html);
      continue;
    }

    if (!groupedEntries[channelId]) {
      groupedEntries[channelId] = [];
    }

    groupedEntries[channelId]?.push({
      startAt,
      title,
      sourceUrl: ISRAMEIDA_SPORTS_GUIDE_URL,
    });

    match = rowRegex.exec(html);
  }

  const channels: Partial<Record<string, BroadcastProgram[]>> = {};
  for (const [channelId, entries] of Object.entries(groupedEntries)) {
    if (!entries?.length) continue;
    channels[channelId] = buildProgramsFromEntries(channelId, entries);
  }

  return {
    sourceUrl: ISRAMEIDA_SPORTS_GUIDE_URL,
    sourceType: 'isramedia-html',
    channels,
  };
}

function buildJerusalemIso(datePart: string, timePart: string): string | null {
  const dateMatch = datePart.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  const timeMatch = timePart.match(/^(\d{2}):(\d{2})$/);
  if (!dateMatch || !timeMatch) return null;

  const [, dd, mm, yyyy] = dateMatch;
  return new Date(`${yyyy}-${mm}-${dd}T${timePart}:00+03:00`).toISOString();
}

function parseIsramediaChannelPage(html: string, channelId: string, sourceUrl: string): BroadcastProgram[] {
  const text = stripTagsToLines(html);
  /*
  const dateMatch = text.match(/(\d{2}\/\d{2}\/\d{4})\s+לוח שידורים/);
  const currentNextMatch = text.match(/כעת\s+(\d{2}:\d{2})\s+([^\n]+)\s+הבאה\s+(\d{2}:\d{2})\s+([^\n]+)/s);

  */
  const dateMatch = text.match(/(\d{2}\/\d{2}\/\d{4})\s+\u05dc\u05d5\u05d7\s+\u05e9\u05d9\u05d3\u05d5\u05e8\u05d9\u05dd/);
  const currentNextMatch = text.match(/\u05db\u05e2\u05ea\s+(\d{2}:\d{2})\s+([^\n]+)\s+\u05d4\u05d1\u05d0\u05d4\s+(\d{2}:\d{2})\s+([^\n]+)/);

  const datePart = dateMatch?.[1];
  const currentTime = currentNextMatch?.[1];
  const currentTitle = currentNextMatch?.[2]?.trim();
  const nextTime = currentNextMatch?.[3];
  const nextTitle = currentNextMatch?.[4]?.trim();

  if (!datePart || !currentTime || !currentTitle || !nextTime || !nextTitle) {
    return [];
  }

  const currentStartAt = buildJerusalemIso(datePart, currentTime);
  const nextStartAt = buildJerusalemIso(datePart, nextTime);
  if (!currentStartAt || !nextStartAt) {
    return [];
  }

  return [
    {
      id: `${channelId}-${currentStartAt}-${slugify(currentTitle)}`,
      channelId,
      title: currentTitle,
      description: '',
      startAt: currentStartAt,
      endAt: nextStartAt,
      genre: null,
      isLive: true,
      sourceUrl,
    },
    {
      id: `${channelId}-${nextStartAt}-${slugify(nextTitle)}`,
      channelId,
      title: nextTitle,
      description: '',
      startAt: nextStartAt,
      endAt: addMinutes(new Date(nextStartAt), 60).toISOString(),
      genre: null,
      isLive: false,
      sourceUrl,
    },
  ];
}

async function fetchGuideSnapshot(): Promise<GuideSnapshot> {
  const response = await fetch(ISRAMEIDA_GUIDE_URL, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36',
      'Accept-Language': 'he-IL,he;q=0.9,en-US;q=0.8',
      Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Cache-Control': 'no-cache',
    },
    cache: 'no-store',
    next: { revalidate: 0 },
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });

  if (!response.ok) {
    throw new Error(`IsraMedia guide failed with ${response.status}`);
  }

  const buffer = await response.arrayBuffer();
  const html = decodeResponseBody(buffer, response.headers.get('content-type'));
  const parsed = parseIsramediaGuide(html);

  if (Object.keys(parsed.channels).length === 0) {
    throw new Error('IsraMedia guide parsing returned no channels');
  }

  return parsed;
}

async function fetchSportsGuideSnapshot(): Promise<GuideSnapshot> {
  const response = await fetch(ISRAMEIDA_SPORTS_GUIDE_URL, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36',
      'Accept-Language': 'he-IL,he;q=0.9,en-US;q=0.8',
      Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Cache-Control': 'no-cache',
    },
    cache: 'no-store',
    next: { revalidate: 0 },
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });

  if (!response.ok) {
    throw new Error(`IsraMedia sports guide failed with ${response.status}`);
  }

  const buffer = await response.arrayBuffer();
  const html = decodeResponseBody(buffer, response.headers.get('content-type'));
  const parsed = parseIsramediaSportsGuide(html);

  if (Object.keys(parsed.channels).length === 0) {
    throw new Error('IsraMedia sports guide parsing returned no channels');
  }

  return parsed;
}

async function fetchIsramediaHtml(sourceUrl: string): Promise<string> {
  const response = await fetch(sourceUrl, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36',
      'Accept-Language': 'he-IL,he;q=0.9,en-US;q=0.8',
      Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Cache-Control': 'no-cache',
    },
    cache: 'no-store',
    next: { revalidate: 0 },
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });

  if (!response.ok) {
    throw new Error(`IsraMedia page failed with ${response.status}`);
  }

  const buffer = await response.arrayBuffer();
  return decodeResponseBody(buffer, response.headers.get('content-type'));
}

async function fetchIsramediaScheduleFallback(channelId: string): Promise<AdapterResult> {
  const sourceUrl = ISRAMEIDA_SCHEDULE_PAGE_URLS[channelId];
  if (!sourceUrl) {
    throw new Error('No IsraMedia schedule page configured for this channel');
  }

  const html = await fetchIsramediaHtml(sourceUrl);
  const programs = parseIsramediaSchedulePage(html, channelId, sourceUrl);

  if (!programs.length) {
    throw new Error('IsraMedia schedule fallback parsing returned no programs');
  }

  if (!isFreshSchedule(programs)) {
    throw new Error('IsraMedia schedule fallback returned stale programs');
  }

  return {
    programs,
    sourceUrl,
    sourceType: 'isramedia-html',
  };
}

async function fetchIsramediaChannelFallback(channelId: string): Promise<AdapterResult> {
  const sourceUrl = ISRAMEIDA_CHANNEL_PAGE_URLS[channelId];
  if (!sourceUrl) {
    throw new Error('No IsraMedia fallback page configured for this channel');
  }

  const html = await fetchIsramediaHtml(sourceUrl);
  const programs = parseIsramediaChannelPage(html, channelId, sourceUrl);

  if (!programs.length) {
    throw new Error('IsraMedia channel fallback parsing returned no programs');
  }

  return {
    programs,
    sourceUrl,
    sourceType: 'isramedia-html',
  };
}

async function fetchIsramediaHybridFallback(channelId: string): Promise<AdapterResult> {
  try {
    return await fetchIsramediaScheduleFallback(channelId);
  } catch {
    return fetchIsramediaChannelFallback(channelId);
  }
}

const fallbackAdapters: Partial<Record<string, Adapter>> = {
  i24: () => fetchIsramediaHybridFallback('i24'),
  knesset: () => fetchIsramediaHybridFallback('knesset'),
  kan33: () => fetchIsramediaHybridFallback('kan33'),
  charlton1: () => fetchIsramediaScheduleFallback('charlton1'),
  charlton2: () => fetchIsramediaScheduleFallback('charlton2'),
  charlton3: () => fetchIsramediaScheduleFallback('charlton3'),
  charlton4: () => fetchIsramediaScheduleFallback('charlton4'),
  charlton6: () => fetchIsramediaScheduleFallback('charlton6'),
};

function hydrateStateFromPrograms(
  channelId: string,
  programs: BroadcastProgram[],
  sourceUrl: string | null,
  sourceType: BroadcastSourceType,
  status: BroadcastSnapshotStatus,
  lastError: string | null,
  fetchedAt: string | null,
  expiresAt: string | null,
  stale: boolean,
): BroadcastChannelState {
  return deriveBroadcastChannelState({
    channelId,
    programs,
    fetchedAt,
    expiresAt,
    sourceUrl,
    sourceType,
    status,
    lastError,
    stale,
    now: {
      current: null,
      next: null,
      status: 'unavailable',
      serverTime: nowIso(),
    },
  }, new Date());
}

function buildUnavailableState(
  channelId: string,
  lastError: string | null,
  stalePrograms: BroadcastProgram[] = [],
): BroadcastChannelState {
  return hydrateStateFromPrograms(
    channelId,
    stalePrograms,
    OFFICIAL_SOURCES[channelId] || null,
    stalePrograms.length > 0 ? 'cache' : 'unavailable',
    stalePrograms.length > 0 ? 'stale' : 'unavailable',
    lastError,
    null,
    null,
    stalePrograms.length > 0,
  );
}

function hydrateStateFromCache(channelId: string, doc: CachedBroadcastDocument, forceStale = false): BroadcastChannelState {
  const programs = Array.isArray(doc.programs) ? doc.programs : [];

  return hydrateStateFromPrograms(
    channelId,
    programs,
    typeof doc.sourceUrl === 'string' ? doc.sourceUrl : OFFICIAL_SOURCES[channelId] || null,
    forceStale ? 'cache' : (doc.sourceType || 'cache'),
    forceStale ? 'stale' : (doc.status || 'ok'),
    typeof doc.lastError === 'string' ? doc.lastError : null,
    typeof doc.fetchedAt === 'string' ? doc.fetchedAt : null,
    typeof doc.expiresAt === 'string' ? doc.expiresAt : null,
    forceStale || doc.status === 'stale',
  );
}

async function saveChannelSnapshot(
  channelId: string,
  snapshot: {
    programs: BroadcastProgram[];
    fetchedAt: string;
    expiresAt: string;
    sourceUrl: string;
    sourceType: BroadcastSourceType;
    status: BroadcastSnapshotStatus;
    lastError: string | null;
  },
): Promise<void> {
  const programs = snapshot.programs.map((program) => ({
    id: program.id,
    channelId: program.channelId,
    title: program.title,
    description: program.description,
    startAt: program.startAt,
    endAt: program.endAt,
    genre: program.genre,
    isLive: program.isLive,
    sourceUrl: program.sourceUrl,
  }));

  await patchDocument(`broadcastChannels/${channelId}`, {
    channelId,
    programs,
    fetchedAt: snapshot.fetchedAt,
    expiresAt: snapshot.expiresAt,
    sourceUrl: snapshot.sourceUrl,
    sourceType: snapshot.sourceType,
    status: snapshot.status,
    lastError: snapshot.lastError,
  });
}

async function loadBroadcastChannel(
  channelId: string,
  guideSnapshot?: GuideSnapshot | null,
  sportsGuideSnapshot?: GuideSnapshot | null,
): Promise<BroadcastChannelState> {
  const cacheDoc = await getDocument<CachedBroadcastDocument>(`broadcastChannels/${channelId}`);
  const now = Date.now();
  const expiresAt = cacheDoc?.expiresAt ? Date.parse(cacheDoc.expiresAt) : Number.NaN;

  if (cacheDoc && Number.isFinite(expiresAt) && expiresAt > now) {
    return hydrateStateFromCache(channelId, cacheDoc);
  }

  try {
    const programsFromGuide = guideSnapshot?.channels[channelId];
    if (guideSnapshot && programsFromGuide?.length) {
      const fetchedAt = nowIso();
      const expiresAtIso = new Date(Date.now() + CACHE_TTL_MS).toISOString();

      await saveChannelSnapshot(channelId, {
        programs: programsFromGuide,
        fetchedAt,
        expiresAt: expiresAtIso,
        sourceUrl: guideSnapshot.sourceUrl,
        sourceType: guideSnapshot.sourceType,
        status: 'ok',
        lastError: null,
      });

      return hydrateStateFromPrograms(
        channelId,
        programsFromGuide,
        guideSnapshot.sourceUrl,
        guideSnapshot.sourceType,
        'ok',
        null,
        fetchedAt,
        expiresAtIso,
        false,
      );
    }

    const programsFromSportsGuide = sportsGuideSnapshot?.channels[channelId];
    if (sportsGuideSnapshot && programsFromSportsGuide?.length) {
      const fetchedAt = nowIso();
      const expiresAtIso = new Date(Date.now() + CACHE_TTL_MS).toISOString();

      await saveChannelSnapshot(channelId, {
        programs: programsFromSportsGuide,
        fetchedAt,
        expiresAt: expiresAtIso,
        sourceUrl: sportsGuideSnapshot.sourceUrl,
        sourceType: sportsGuideSnapshot.sourceType,
        status: 'ok',
        lastError: null,
      });

      return hydrateStateFromPrograms(
        channelId,
        programsFromSportsGuide,
        sportsGuideSnapshot.sourceUrl,
        sportsGuideSnapshot.sourceType,
        'ok',
        null,
        fetchedAt,
        expiresAtIso,
        false,
      );
    }

    const fallback = fallbackAdapters[channelId];
    if (fallback) {
      const result = await fallback();
      const fetchedAt = nowIso();
      const expiresAtIso = new Date(Date.now() + CACHE_TTL_MS).toISOString();

      await saveChannelSnapshot(channelId, {
        programs: result.programs,
        fetchedAt,
        expiresAt: expiresAtIso,
        sourceUrl: result.sourceUrl,
        sourceType: result.sourceType,
        status: 'ok',
        lastError: null,
      });

      return hydrateStateFromPrograms(
        channelId,
        result.programs,
        result.sourceUrl,
        result.sourceType,
        'ok',
        null,
        fetchedAt,
        expiresAtIso,
        false,
      );
    }

    if (cacheDoc?.programs?.length) {
      return hydrateStateFromCache(channelId, cacheDoc, true);
    }

    return buildUnavailableState(channelId, 'No IsraMedia schedule was found for this channel');
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown broadcasts fetch failure';
    const fetchedAt = nowIso();

    if (cacheDoc?.programs?.length) {
      await saveChannelSnapshot(channelId, {
        programs: cacheDoc.programs,
        fetchedAt: cacheDoc.fetchedAt || fetchedAt,
        expiresAt: new Date(Date.now() + 60_000).toISOString(),
        sourceUrl: typeof cacheDoc.sourceUrl === 'string' ? cacheDoc.sourceUrl : OFFICIAL_SOURCES[channelId] || '',
        sourceType: 'cache',
        status: 'stale',
        lastError: message,
      });

      const staleFetchedAt = cacheDoc.fetchedAt ? Date.parse(cacheDoc.fetchedAt) : Number.NaN;
      if (Number.isFinite(staleFetchedAt) && now - staleFetchedAt < STALE_TTL_MS) {
        return hydrateStateFromCache(channelId, {
          ...cacheDoc,
          status: 'stale',
          sourceType: 'cache',
          lastError: message,
        }, true);
      }
    }

    await saveChannelSnapshot(channelId, {
      programs: [],
      fetchedAt,
      expiresAt: new Date(Date.now() + CACHE_TTL_MS).toISOString(),
      sourceUrl: OFFICIAL_SOURCES[channelId] || '',
      sourceType: 'unavailable',
      status: 'unavailable',
      lastError: message,
    });

    return buildUnavailableState(channelId, message);
  }
}

export async function loadBroadcastChannels(scope: string | null, channelId: string | null): Promise<BroadcastChannelState[]> {
  const selectedIds = channelId
    ? [channelId]
    : scope === 'home'
      ? HOME_CHANNEL_IDS
      : channels.map((channel) => channel.id);

  let guideSnapshot: GuideSnapshot | null = null;
  let sportsGuideSnapshot: GuideSnapshot | null = null;
  const shouldFetchGuide = selectedIds.some((id) => OFFICIAL_SOURCES[id] === ISRAMEIDA_GUIDE_URL);
  const shouldFetchSportsGuide = selectedIds.some((id) => OFFICIAL_SOURCES[id] === ISRAMEIDA_SPORTS_GUIDE_URL);

  if (shouldFetchGuide) {
    try {
      guideSnapshot = await fetchGuideSnapshot();
    } catch {
      guideSnapshot = null;
    }
  }

  if (shouldFetchSportsGuide) {
    try {
      sportsGuideSnapshot = await fetchSportsGuideSnapshot();
    } catch {
      sportsGuideSnapshot = null;
    }
  }

  return Promise.all(selectedIds.map((id) => loadBroadcastChannel(id, guideSnapshot, sportsGuideSnapshot)));
}
