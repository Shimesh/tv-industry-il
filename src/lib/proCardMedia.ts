import { channels } from '@/data/channels';
import type { ProCardMedia } from '@/lib/proCardTypes';

type ProductionMediaEntry = {
  aliases: string[];
  label: string;
  shortLabel: string;
  color: string;
  gradient: string;
  channelId?: string;
  major?: boolean;
};

const productionRegistry: ProductionMediaEntry[] = [
  {
    aliases: ['ארץ נהדרת', 'ארץ'],
    label: 'ארץ נהדרת',
    shortLabel: 'א״נ',
    color: '#facc15',
    gradient: 'linear-gradient(135deg, #facc15 0%, #38bdf8 100%)',
    channelId: 'keshet12',
    major: true,
  },
  {
    aliases: ['האח הגדול', 'האח הגדול vip'],
    label: 'האח הגדול',
    shortLabel: 'האח',
    color: '#22c55e',
    gradient: 'linear-gradient(135deg, #22c55e 0%, #2563eb 100%)',
    channelId: 'reshet13',
    major: true,
  },
  {
    aliases: ['הישרדות', 'הישרדות vip'],
    label: 'הישרדות',
    shortLabel: 'VIP',
    color: '#f97316',
    gradient: 'linear-gradient(135deg, #f97316 0%, #0f766e 100%)',
    channelId: 'keshet12',
    major: true,
  },
  {
    aliases: ['מאסטר שף', 'masterchef', 'master chef'],
    label: 'MasterChef',
    shortLabel: 'MC',
    color: '#ef4444',
    gradient: 'linear-gradient(135deg, #ef4444 0%, #f59e0b 100%)',
    channelId: 'keshet12',
    major: true,
  },
  {
    aliases: ['חדשות 12', 'מהדורת חדשות מרכזית'],
    label: 'חדשות 12',
    shortLabel: '12',
    color: '#dc2626',
    gradient: 'linear-gradient(135deg, #dc2626 0%, #1d4ed8 100%)',
    channelId: 'keshet12',
    major: true,
  },
  {
    aliases: ['חדשות 13'],
    label: 'חדשות 13',
    shortLabel: '13',
    color: '#059669',
    gradient: 'linear-gradient(135deg, #059669 0%, #0ea5e9 100%)',
    channelId: 'reshet13',
    major: true,
  },
  {
    aliases: ['חדשות כאן', 'חדשות כאן 11'],
    label: 'כאן 11',
    shortLabel: '11',
    color: '#1e40af',
    gradient: 'linear-gradient(135deg, #1e40af 0%, #60a5fa 100%)',
    channelId: 'kan11',
    major: true,
  },
  {
    aliases: ['נינג׳ה ישראל', 'נינגה ישראל'],
    label: 'נינג׳ה ישראל',
    shortLabel: 'N',
    color: '#14b8a6',
    gradient: 'linear-gradient(135deg, #14b8a6 0%, #f97316 100%)',
    channelId: 'reshet13',
    major: true,
  },
  {
    // Matches any football production regardless of city/stadium:
    // "כדורגל ב"ש", "כדורגל אשדוד", "כדורגל - מכבי ת"א" etc.
    aliases: ['כדורגל'],
    label: 'כדורגל',
    shortLabel: 'כד',
    color: '#16a34a',
    gradient: 'linear-gradient(135deg, #16a34a 0%, #064e3b 100%)',
    major: false,
  },
  {
    aliases: ['הכוכב הבא', 'כוכב הבא'],
    label: 'הכוכב הבא',
    shortLabel: 'כוכב',
    color: '#f59e0b',
    gradient: 'linear-gradient(135deg, #f59e0b 0%, #b45309 100%)',
    channelId: 'keshet12',
    major: true,
  },
  {
    aliases: ['זהו זה'],
    label: 'זהו זה',
    shortLabel: 'זז',
    color: '#7c3aed',
    gradient: 'linear-gradient(135deg, #7c3aed 0%, #2563eb 100%)',
    major: true,
  },
  {
    // "רצועת ערב", "רצועת בוקר", "רצועת צהריים", "רצועת שישי" etc.
    // These are broadcast strip slots, not individual show titles.
    aliases: ['רצועת ערב', 'רצועת בוקר', 'רצועת צהריים', 'רצועת לילה', 'רצועת שישי', 'רצועת'],
    label: 'רצועת שידור',
    shortLabel: 'רצ',
    color: '#64748b',
    gradient: 'linear-gradient(135deg, #475569 0%, #0ea5e9 100%)',
    major: false,
  },
];

const channelAliases: Array<{ channelId: string; aliases: string[] }> = [
  { channelId: 'kan11', aliases: ['כאן 11', 'ערוץ 11', 'kan 11'] },
  { channelId: 'keshet12', aliases: ['קשת 12', 'ערוץ 12', 'חדשות 12', 'keshet'] },
  { channelId: 'reshet13', aliases: ['רשת 13', 'ערוץ 13', 'חדשות 13', 'reshet'] },
  { channelId: 'now14', aliases: ['עכשיו 14', 'ערוץ 14'] },
  { channelId: 'i24', aliases: ['i24', 'i24news'] },
  { channelId: 'sport55', aliases: ['ספורט 5', 'ערוץ הספורט'] },
];

function normalizeText(value: string): string {
  return value
    .toLocaleLowerCase('he')
    .replace(/[״"׳']/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function inferChannelIdFromTitle(title: string, studio = ''): string | null {
  const normalized = normalizeText(`${title} ${studio}`);
  const production = productionRegistry.find((entry) =>
    entry.aliases.some((alias) => normalized.includes(normalizeText(alias))),
  );
  if (production?.channelId) return production.channelId;

  const channel = channelAliases.find((entry) =>
    entry.aliases.some((alias) => normalized.includes(normalizeText(alias))),
  );
  return channel?.channelId || null;
}

export function isMajorProductionTitle(title: string): boolean {
  const normalized = normalizeText(title);
  return productionRegistry.some((entry) =>
    entry.major === true && entry.aliases.some((alias) => normalized.includes(normalizeText(alias))),
  );
}

export function getChannelName(channelId: string | null): string {
  if (!channelId) return 'ללא ערוץ';
  return channels.find((channel) => channel.id === channelId)?.name || 'ללא ערוץ';
}

export function resolveProCardMedia(title: string, channelId: string | null): ProCardMedia {
  const normalized = normalizeText(title);
  const production = productionRegistry.find((entry) =>
    entry.aliases.some((alias) => normalized.includes(normalizeText(alias))),
  );

  if (production) {
    return {
      kind: 'production',
      label: production.label,
      shortLabel: production.shortLabel,
      color: production.color,
      gradient: production.gradient,
    };
  }

  const channel = channelId ? channels.find((item) => item.id === channelId) : null;
  if (channel) {
    return {
      kind: 'channel',
      label: channel.name,
      shortLabel: String(channel.number || channel.name.slice(0, 2)),
      color: channel.color,
      gradient: `linear-gradient(135deg, ${channel.color} 0%, #38bdf8 100%)`,
    };
  }

  return {
    kind: 'fallback',
    label: 'הפקה',
    shortLabel: 'TV',
    color: '#94a3b8',
    gradient: 'linear-gradient(135deg, #475569 0%, #0f172a 100%)',
  };
}
