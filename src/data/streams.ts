// Live stream configuration for Israeli TV channels
// Types:
// - 'hls': Direct HLS stream (m3u8) - plays in VideoPlayer
// - 'youtube': YouTube live embed
// - 'external-free': Free channel, link to website
// - 'external-paid': Paid channel, requires subscription

export interface StreamConfig {
  type: 'hls' | 'youtube' | 'external-free' | 'external-paid';
  streamUrl: string | null; // HLS m3u8 URL for direct playback
  embedUrl?: string; // YouTube embed URL
  websiteUrl: string; // Direct link to channel's live page
  requiresAuth: boolean;
  hasLiveStream: boolean; // Whether we can play it directly
  provider?: string;
  note?: string;
}

export const streamConfigs: Record<string, StreamConfig> = {
  // === CHANNELS WITH DIRECT HLS STREAMS ===
  i24: {
    type: 'hls',
    streamUrl: 'https://d18b0e6mopany4.cloudfront.net/out/v1/2f2bc414a3db4698a8e94b89eaf2da2a/index.m3u8',
    websiteUrl: 'https://www.i24news.tv/en/tv/live',
    requiresAuth: false,
    hasLiveStream: true,
    note: 'שידור חי חינמי',
  },
  knesset: {
    type: 'hls',
    streamUrl: 'https://d3bp6dwmpbdajl.cloudfront.net/v1/master/3722c60a815c199d9c0ef36c5b73da68a62b09d1/cc-ury0meh5m4nzm/index.m3u8',
    websiteUrl: 'https://main.knesset.gov.il/Activity/Plenum/Pages/default.aspx',
    requiresAuth: false,
    hasLiveStream: true,
    note: 'ערוץ הכנסת - שידור חי',
  },

  // === CHANNELS WITH YOUTUBE EMBEDS ===
  kan11: {
    type: 'youtube',
    streamUrl: null, // Requires dynamic token
    embedUrl: 'https://www.youtube.com/embed/live_stream?channel=UCKqFqiCe1dCUxRe0_YNZ6gg&autoplay=1',
    websiteUrl: 'https://www.kan.org.il/live/',
    requiresAuth: false,
    hasLiveStream: false,
    note: 'ערוץ ציבורי - צפייה באתר כאן',
  },
  kan33: {
    type: 'youtube',
    streamUrl: null,
    embedUrl: 'https://www.youtube.com/embed/live_stream?channel=UCKqFqiCe1dCUxRe0_YNZ6gg&autoplay=1',
    websiteUrl: 'https://www.kan.org.il/live/tv.aspx?stationid=3',
    requiresAuth: false,
    hasLiveStream: false,
    note: 'כאן 33 - תרבות ואמנות',
  },

  // === FREE CHANNELS (website link) ===
  keshet12: {
    type: 'external-free',
    streamUrl: null,
    websiteUrl: 'https://www.mako.co.il/mako-vod-live-tv/VOD-6540b8dcb64fd31006.htm',
    requiresAuth: false,
    hasLiveStream: false,
    note: 'צפייה חינמית באתר Mako',
  },
  reshet13: {
    type: 'external-free',
    streamUrl: null,
    websiteUrl: 'https://13tv.co.il/live/',
    requiresAuth: false,
    hasLiveStream: false,
    note: 'צפייה חינמית באתר רשת 13',
  },
  now14: {
    type: 'external-free',
    streamUrl: null,
    websiteUrl: 'https://www.now14.co.il/live/',
    requiresAuth: false,
    hasLiveStream: false,
    note: 'צפייה חינמית באתר עכשיו 14',
  },

  // === PAID CHANNELS ===
  sport55: {
    type: 'external-paid',
    streamUrl: null,
    websiteUrl: 'https://sport5.maariv.co.il/LiveTV/',
    requiresAuth: true,
    hasLiveStream: false,
    provider: 'ספורט 5',
    note: 'דורש מנוי ספורט 5',
  },
  sport56: {
    type: 'external-paid',
    streamUrl: null,
    websiteUrl: 'https://sport5.maariv.co.il/LiveTV/',
    requiresAuth: true,
    hasLiveStream: false,
    provider: 'ספורט 5',
    note: 'דורש מנוי ספורט 5',
  },
  gold: {
    type: 'external-paid',
    streamUrl: null,
    websiteUrl: 'https://sport5.maariv.co.il/LiveTV/',
    requiresAuth: true,
    hasLiveStream: false,
    provider: 'ספורט 5',
    note: 'דורש מנוי ספורט 5 GOLD',
  },
  live: {
    type: 'external-paid',
    streamUrl: null,
    websiteUrl: 'https://sport5.maariv.co.il/LiveTV/',
    requiresAuth: true,
    hasLiveStream: false,
    provider: 'ספורט 5',
    note: 'דורש מנוי ספורט 5',
  },
  charlton1: {
    type: 'external-paid',
    streamUrl: null,
    websiteUrl: 'https://www.charlton.co.il/',
    requiresAuth: true,
    hasLiveStream: false,
    provider: "צ'רלטון",
    note: "דורש מנוי צ'רלטון",
  },
  charlton2: {
    type: 'external-paid',
    streamUrl: null,
    websiteUrl: 'https://www.charlton.co.il/',
    requiresAuth: true,
    hasLiveStream: false,
    provider: "צ'רלטון",
    note: "דורש מנוי צ'רלטון",
  },
  charlton3: {
    type: 'external-paid',
    streamUrl: null,
    websiteUrl: 'https://www.charlton.co.il/',
    requiresAuth: true,
    hasLiveStream: false,
    provider: "צ'רלטון",
    note: "דורש מנוי צ'רלטון",
  },
  charlton4: {
    type: 'external-paid',
    streamUrl: null,
    websiteUrl: 'https://www.charlton.co.il/',
    requiresAuth: true,
    hasLiveStream: false,
    provider: "צ'רלטון",
    note: "דורש מנוי צ'רלטון",
  },
  charlton6: {
    type: 'external-paid',
    streamUrl: null,
    websiteUrl: 'https://www.charlton.co.il/',
    requiresAuth: true,
    hasLiveStream: false,
    provider: "צ'רלטון",
    note: "דורש מנוי צ'רלטון",
  },
};
