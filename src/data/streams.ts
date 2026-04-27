// Live stream configuration for Israeli TV channels
// Types:
// - 'hls': Direct HLS stream (m3u8) - plays in VideoPlayer via hls.js
// - 'youtube': YouTube live embed (iframe)
// - 'iframe': Generic iframe embed (Univtec, Kaltura, etc.)
// - 'external-free': Free channel, link to website only
// - 'external-paid': Paid channel, requires subscription

export interface StreamConfig {
  type: 'hls' | 'youtube' | 'iframe' | 'external-free' | 'external-paid';
  streamUrl: string | null; // HLS m3u8 URL for direct playback
  embedUrl?: string; // YouTube / Univtec / generic iframe embed URL
  websiteUrl: string; // Direct link to channel's live page
  requiresAuth: boolean;
  hasLiveStream: boolean; // Whether we can play it directly
  dynamicStream?: boolean; // Fetch stream URL at runtime from /api/stream-token/[channel]
  provider?: string;
  note?: string;
}

export const streamConfigs: Record<string, StreamConfig> = {
  // === CHANNELS WITH DIRECT HLS STREAMS ===

  // כאן 11 — token-free CDN from kancdn.medonecdn.net (confirmed 24/7)
  kan11: {
    type: 'hls',
    streamUrl: 'https://kancdn.medonecdn.net/livehls/oil/kancdn-live/live/kan11/live.livx/playlist.m3u8',
    websiteUrl: 'https://www.kan.org.il/live/',
    requiresAuth: false,
    hasLiveStream: true,
    dynamicStream: true,
    note: 'כאן 11 - שידור חי',
  },

  // רשת 13 — CloudFront HLS (confirmed working)
  reshet13: {
    type: 'hls',
    streamUrl: 'https://d18b0e6mopany4.cloudfront.net/out/v1/2f2bc414a3db4698a8e94b89eaf2da2a/index.m3u8',
    websiteUrl: 'https://13tv.co.il/live/',
    requiresAuth: false,
    hasLiveStream: true,
    note: 'רשת 13 - שידור חי',
  },

  // i24NEWS — YouTube live embed (channel UCvHDpsWKADrDia0c99X37vg, confirmed 24/7)
  i24: {
    type: 'iframe',
    streamUrl: null,
    embedUrl: 'https://video.i24news.tv/live/brightcove/he',
    websiteUrl: 'https://www.isramedia.net/9568/%D7%A2%D7%A8%D7%95%D7%A6%D7%99-%D7%97%D7%93%D7%A9%D7%95%D7%AA/i24news-%D7%91%D7%A2%D7%91%D7%A8%D7%99%D7%AA-%D7%A9%D7%99%D7%93%D7%95%D7%A8-%D7%97%D7%99',
    requiresAuth: false,
    hasLiveStream: true,
    note: 'שידור חי חינמי',
  },

  // ערוץ הכנסת — GoStreaming CDN (confirmed live, token-free, 720p H.264)
  knesset: {
    type: 'hls',
    streamUrl: 'https://kneset.gostreaming.tv/p2-kneset/_definst_/myStream/playlist.m3u8',
    websiteUrl: 'https://main.knesset.gov.il/Activity/Plenum/Pages/default.aspx',
    requiresAuth: false,
    hasLiveStream: true,
    note: 'ערוץ הכנסת - שידור חי',
  },

  // === CHANNELS WITH YOUTUBE LIVE EMBEDS ===

  // קשת 12 — Mako embed player (AjaxPage embed, used by third-party sites as iframe)
  keshet12: {
    type: 'iframe',
    streamUrl: null,
    embedUrl: 'https://www.mako.co.il/AjaxPage?jspName=embedHTML5video.jsp&galleryChannelId=7c5076a9b8757810VgnVCM100000700a10acRCRD&videoChannelId=d1d6f5dfc8517810VgnVCM100000700a10acRCRD&vcmid=1e2258089b67f510VgnVCM2000002a0c10acRCRD&autoPlay=true',
    websiteUrl: 'https://www.mako.co.il/mako-vod-live-tv/VOD-6540b8dcb64fd31006.htm',
    requiresAuth: false,
    hasLiveStream: true,
    note: 'קשת 12 - שידור חי',
  },

  kan33: {
    type: 'hls',
    streamUrl: null,
    websiteUrl: 'https://www.isramedia.net/5628/%D7%A2%D7%A8%D7%95%D7%A6%D7%99%D7%9D-%D7%9E%D7%99%D7%A9%D7%A8%D7%90%D7%9C/%D7%A2%D7%A8%D7%95%D7%A5-33-%D7%A9%D7%99%D7%93%D7%95%D7%A8-%D7%97%D7%99',
    requiresAuth: false,
    hasLiveStream: true,
    dynamicStream: true,
    note: 'כאן 33 - תרבות ואמנות',
  },

  // === CHANNELS WITH IFRAME EMBEDS ===

  // עכשיו 14 — uses Univtec player (served from snippet.univtec.com, cross-origin embeddable)
  now14: {
    type: 'iframe',
    streamUrl: null,
    embedUrl: 'https://snippet.univtec.com/player.html?data-insight=eyJndWlkIjoiOWZiMTRjZTctZmNjMi00Njk1LTgzOWItZTY0MTM5MGQ3YTAwIiwidHlwZSI6ImNoYW5uZWxzIiwiYWNjb3VudElkIjoiNjM5Nzc1M2ZmZjg3MTk3MWFlNmEzYzAzIiwiY2xpZW50IjoiY2hhbm5lbDE0IiwiYXBpIjoiaHR0cHM6Ly9pbnNpZ2h0LWFwaS1jaGFubmVsMTQudW5pdnRlYy5jb20vIn0=',
    websiteUrl: 'https://www.c14.co.il/live/',
    requiresAuth: false,
    hasLiveStream: true,
    note: 'עכשיו 14 - שידור חי',
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
    websiteUrl: 'https://www.isramedia.net/56/%D7%A2%D7%A8%D7%95%D7%A6%D7%99-%D7%A1%D7%A4%D7%95%D7%A8%D7%98/%D7%A1%D7%A4%D7%95%D7%A8%D7%98-1-%D7%A9%D7%99%D7%93%D7%95%D7%A8-%D7%97%D7%99',
    requiresAuth: true,
    hasLiveStream: false,
    provider: "צ'רלטון",
    note: "דורש מנוי צ'רלטון",
  },
  charlton2: {
    type: 'external-paid',
    streamUrl: null,
    websiteUrl: 'https://www.isramedia.net/91/%D7%A2%D7%A8%D7%95%D7%A6%D7%99-%D7%A1%D7%A4%D7%95%D7%A8%D7%98/%D7%A1%D7%A4%D7%95%D7%A8%D7%98-2-%D7%A9%D7%99%D7%93%D7%95%D7%A8-%D7%97%D7%99',
    requiresAuth: true,
    hasLiveStream: false,
    provider: "צ'רלטון",
    note: "דורש מנוי צ'רלטון",
  },
  charlton3: {
    type: 'external-paid',
    streamUrl: null,
    websiteUrl: 'https://www.isramedia.net/14950/%D7%A2%D7%A8%D7%95%D7%A6%D7%99-%D7%A1%D7%A4%D7%95%D7%A8%D7%98/%D7%A1%D7%A4%D7%95%D7%A8%D7%98-3-%D7%A9%D7%99%D7%93%D7%95%D7%A8-%D7%97%D7%99',
    requiresAuth: true,
    hasLiveStream: false,
    provider: "צ'רלטון",
    note: "דורש מנוי צ'רלטון",
  },
  charlton4: {
    type: 'external-paid',
    streamUrl: null,
    websiteUrl: 'https://www.isramedia.net/14951/%D7%A2%D7%A8%D7%95%D7%A6%D7%99-%D7%A1%D7%A4%D7%95%D7%A8%D7%98/%D7%A1%D7%A4%D7%95%D7%A8%D7%98-4-%D7%A9%D7%99%D7%93%D7%95%D7%A8-%D7%97%D7%99',
    requiresAuth: true,
    hasLiveStream: false,
    provider: "צ'רלטון",
    note: "דורש מנוי צ'רלטון",
  },
  charlton6: {
    type: 'external-paid',
    streamUrl: null,
    websiteUrl: 'https://www.isramedia.net/14953/%D7%A2%D7%A8%D7%95%D7%A6%D7%99-%D7%A1%D7%A4%D7%95%D7%A8%D7%98/%D7%A1%D7%A4%D7%95%D7%A8%D7%98-6-%D7%A9%D7%99%D7%93%D7%95%D7%A8-%D7%97%D7%99',
    requiresAuth: true,
    hasLiveStream: false,
    provider: "צ'רלטון",
    note: "דורש מנוי צ'רלטון",
  },
};
