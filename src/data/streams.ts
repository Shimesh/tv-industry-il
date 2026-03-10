// Live stream configuration for Israeli TV channels
// Streams are categorized by availability:
// - 'iframe': Direct embed (free/public channels)
// - 'youtube': YouTube live embed
// - 'external-free': Link to external website (free, no subscription)
// - 'external-paid': Link to external website (requires subscription)

export interface StreamConfig {
  type: 'iframe' | 'youtube' | 'external-free' | 'external-paid';
  url: string;
  embedUrl?: string; // For iframe/youtube embeds
  websiteUrl: string; // Direct link to channel's live page
  requiresAuth: boolean;
  provider?: string; // HOT/YES/Partner etc.
  note?: string; // Hebrew note about availability
}

export const streamConfigs: Record<string, StreamConfig> = {
  kan11: {
    type: 'youtube',
    url: 'https://www.kan.org.il/live/',
    embedUrl: 'https://www.youtube.com/embed/live_stream?channel=UCKqFqiCe1dCUxRe0_YNZ6gg&autoplay=1',
    websiteUrl: 'https://www.kan.org.il/live/',
    requiresAuth: false,
    note: 'ערוץ ציבורי - צפייה חופשית',
  },
  keshet12: {
    type: 'external-free',
    url: 'https://www.mako.co.il/mako-vod-live-tv/VOD-6540b8dcb64fd31006.htm',
    websiteUrl: 'https://www.mako.co.il/mako-vod-live-tv/VOD-6540b8dcb64fd31006.htm',
    requiresAuth: false,
    note: 'ערוץ חינמי - צפייה ישירה באתר Mako',
  },
  reshet13: {
    type: 'external-free',
    url: 'https://13tv.co.il/live/',
    websiteUrl: 'https://13tv.co.il/live/',
    requiresAuth: false,
    note: 'ערוץ חינמי - צפייה ישירה באתר רשת 13',
  },
  now14: {
    type: 'external-free',
    url: 'https://www.now14.co.il/live/',
    websiteUrl: 'https://www.now14.co.il/live/',
    requiresAuth: false,
    note: 'ערוץ חינמי - צפייה ישירה באתר עכשיו 14',
  },
  i24: {
    type: 'youtube',
    url: 'https://www.youtube.com/@i24NEWS_EN/live',
    embedUrl: 'https://www.youtube.com/embed/live_stream?channel=UCVBogMSgKXMa9n2D4wLBo5A&autoplay=1',
    websiteUrl: 'https://www.i24news.tv/en/tv/live',
    requiresAuth: false,
    note: 'צפייה חופשית באנגלית',
  },
  knesset: {
    type: 'youtube',
    url: 'https://www.youtube.com/@TheKnesset/live',
    embedUrl: 'https://www.youtube.com/embed/live_stream?channel=UCKuHfGNcnbhJkUIKGxKgBLQ&autoplay=1',
    websiteUrl: 'https://main.knesset.gov.il/Activity/Plenum/Pages/default.aspx',
    requiresAuth: false,
    note: 'ערוץ הכנסת - צפייה חופשית',
  },
  sport55: {
    type: 'external-paid',
    url: 'https://sport5.maariv.co.il/LiveTV/',
    websiteUrl: 'https://sport5.maariv.co.il/LiveTV/',
    requiresAuth: true,
    provider: 'ספורט 5',
    note: 'דורש מנוי ספורט 5 או ספק טלוויזיה',
  },
  sport56: {
    type: 'external-paid',
    url: 'https://sport5.maariv.co.il/LiveTV/',
    websiteUrl: 'https://sport5.maariv.co.il/LiveTV/',
    requiresAuth: true,
    provider: 'ספורט 5',
    note: 'דורש מנוי ספורט 5 או ספק טלוויזיה',
  },
  gold: {
    type: 'external-paid',
    url: 'https://sport5.maariv.co.il/LiveTV/',
    websiteUrl: 'https://sport5.maariv.co.il/LiveTV/',
    requiresAuth: true,
    provider: 'ספורט 5',
    note: 'דורש מנוי ספורט 5 GOLD',
  },
  live: {
    type: 'external-paid',
    url: 'https://sport5.maariv.co.il/LiveTV/',
    websiteUrl: 'https://sport5.maariv.co.il/LiveTV/',
    requiresAuth: true,
    provider: 'ספורט 5',
    note: 'דורש מנוי ספורט 5',
  },
  charlton1: {
    type: 'external-paid',
    url: 'https://www.charlton.co.il/',
    websiteUrl: 'https://www.charlton.co.il/',
    requiresAuth: true,
    provider: "צ'רלטון",
    note: "דורש מנוי צ'רלטון ספורט",
  },
  charlton2: {
    type: 'external-paid',
    url: 'https://www.charlton.co.il/',
    websiteUrl: 'https://www.charlton.co.il/',
    requiresAuth: true,
    provider: "צ'רלטון",
    note: "דורש מנוי צ'רלטון ספורט",
  },
  charlton3: {
    type: 'external-paid',
    url: 'https://www.charlton.co.il/',
    websiteUrl: 'https://www.charlton.co.il/',
    requiresAuth: true,
    provider: "צ'רלטון",
    note: "דורש מנוי צ'רלטון ספורט",
  },
  charlton4: {
    type: 'external-paid',
    url: 'https://www.charlton.co.il/',
    websiteUrl: 'https://www.charlton.co.il/',
    requiresAuth: true,
    provider: "צ'רלטון",
    note: "דורש מנוי צ'רלטון ספורט",
  },
  charlton6: {
    type: 'external-paid',
    url: 'https://www.charlton.co.il/',
    websiteUrl: 'https://www.charlton.co.il/',
    requiresAuth: true,
    provider: "צ'רלטון",
    note: "דורש מנוי צ'רלטון ספורט",
  },
};
