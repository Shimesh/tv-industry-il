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

  // כאן 11 — stable HTTPS Redge CDN source
  kan11: {
    type: 'hls',
    streamUrl: 'https://r.il.cdn-redge.media/livehls/oil/kancdn-live/live/kan11/live.livx/playlist.m3u8',
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

  // i24NEWS Hebrew direct Brightcove embed. The i24 app shell opens a language picker, so use the Hebrew live video directly.
  // embedUrl has NO muted params — appendMutedParams adds them for the carousel,
  // and appendAutoplayParams (without muted) lets the schedule page play with sound.
  i24: {
    type: 'iframe',
    streamUrl: null,
    embedUrl: 'https://players.brightcove.net/5377161796001/NwpCHKlKW_default/index.html?videoId=6352464366112&autoplay=1&playsinline=true',
    websiteUrl: 'https://www.isramedia.net/9568/%D7%A2%D7%A8%D7%95%D7%A6%D7%99-%D7%97%D7%93%D7%A9%D7%95%D7%AA/i24news-%D7%91%D7%A2%D7%91%D7%A8%D7%99%D7%AA-%D7%A9%D7%99%D7%93%D7%95%D7%A8-%D7%97%D7%99',
    requiresAuth: false,
    hasLiveStream: true,
    dynamicStream: true,
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

  // קשת 12 — tries to resolve direct HLS at runtime; falls back to Mako iframe embed
  keshet12: {
    type: 'iframe',
    streamUrl: null,
    embedUrl: 'https://www.mako.co.il/AjaxPage?jspName=embedHTML5video.jsp&galleryChannelId=6540b8dcb64fd310VgnVCM2000002a0c10acRCRD&videoChannelId=5d28d21b4580e310VgnVCM2000002a0c10acRCRD&vcmid=6540b8dcb64fd310VgnVCM2000002a0c10acRCRD&autoPlay=true&autoplay=1&playsinline=1&playsInline=1&webkit-playsinline=1',
    websiteUrl: 'https://www.mako.co.il/mako-vod-live-tv/VOD-6540b8dcb64fd31006.htm',
    requiresAuth: false,
    hasLiveStream: true,
    dynamicStream: true,
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

  // עכשיו 14 — official Univtec/Redge HLS from Channel 14 live player
  now14: {
    type: 'hls',
    streamUrl: 'https://r.il.cdn-redge.media/livehls/oil/ch14/live/ch14/live.livx/playlist.m3u8',
    embedUrl: 'https://snippet.univtec.com/player.html?data-insight=eyJndWlkIjoiOWZiMTRjZTctZmNjMi00Njk1LTgzOWItZTY0MTM5MGQ3YTAwIiwidHlwZSI6ImNoYW5uZWxzIiwiYWNjb3VudElkIjoiNjM5Nzc1M2ZmZjg3MTk3MWFlNmEzYzAzIiwiY2xpZW50IjoiY2hhbm5lbDE0IiwiYXBpIjoiaHR0cHM6Ly9pbnNpZ2h0LWFwaS1jaGFubmVsMTQudW5pdnRlYy5jb20vIn0=',
    websiteUrl: 'https://www.c14.co.il/live/',
    requiresAuth: false,
    hasLiveStream: true,
    dynamicStream: true,
    note: 'עכשיו 14 - שידור חי',
  },

  // === PAID CHANNELS ===
  sport55: {
    type: 'external-paid',
    streamUrl: null,
    websiteUrl: 'https://www.sport5.co.il/',
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
    websiteUrl: 'https://www.sport5.co.il/',
    requiresAuth: true,
    hasLiveStream: false,
    provider: 'ספורט 5',
    note: 'דורש מנוי ספורט 5 GOLD',
  },
  live: {
    type: 'external-paid',
    streamUrl: null,
    websiteUrl: 'https://www.sport5.co.il/',
    requiresAuth: true,
    hasLiveStream: false,
    provider: 'ספורט 5',
    note: 'דורש מנוי ספורט 5',
  },
  charlton1: {
    type: 'external-paid',
    streamUrl: null,
    websiteUrl: 'https://sport1.maariv.co.il/',
    requiresAuth: true,
    hasLiveStream: false,
    provider: "צ'רלטון",
    note: "דורש מנוי צ'רלטון",
  },
  charlton2: {
    type: 'external-paid',
    streamUrl: null,
    websiteUrl: 'https://sport1.maariv.co.il/',
    requiresAuth: true,
    hasLiveStream: false,
    provider: "צ'רלטון",
    note: "דורש מנוי צ'רלטון",
  },
  charlton3: {
    type: 'external-paid',
    streamUrl: null,
    websiteUrl: 'https://sport1.maariv.co.il/',
    requiresAuth: true,
    hasLiveStream: false,
    provider: "צ'רלטון",
    note: "דורש מנוי צ'רלטון",
  },
  charlton4: {
    type: 'external-paid',
    streamUrl: null,
    websiteUrl: 'https://sport1.maariv.co.il/',
    requiresAuth: true,
    hasLiveStream: false,
    provider: "צ'רלטון",
    note: "דורש מנוי צ'רלטון",
  },
  charlton6: {
    type: 'external-paid',
    streamUrl: null,
    websiteUrl: 'https://sport1.maariv.co.il/',
    requiresAuth: true,
    hasLiveStream: false,
    provider: "צ'רלטון",
    note: "דורש מנוי צ'רלטון",
  },
};
