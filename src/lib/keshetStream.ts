import CryptoJS from 'crypto-js';

const KESHET_PLAYLIST_URL = 'https://www.mako.co.il/AjaxPage?jspName=playlist12.jsp&videoChannelId=5d28d21b4580e310VgnVCM2000002a0c10acRCRD&galleryChannelId=6540b8dcb64fd310VgnVCM2000002a0c10acRCRD&vcmid=6540b8dcb64fd310VgnVCM2000002a0c10acRCRD';
const KESHET_ENTITLEMENT_URL = 'https://mass.mako.co.il/ClicksStatistics/entitlementsServicesV2.jsp?et=egt';
const KESHET_VCM_ID = '6540b8dcb64fd310VgnVCM2000002a0c10acRCRD';
const KESHET_PLAYER_VERSION = '7.15.0';
const KESHET_PLAYLIST_KEY = 'LTf7r/zM2VndHwP+4So6bw==';
const KESHET_TOKEN_KEY = 'YhnUaXMmltB6gd8p9SWleQ==';
const KESHET_CRYPTO_IV = 'theExact16Chars=';

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

async function resolveKeshet12ServerStream(): Promise<string | null> {
  try {
    const response = await fetch('/api/stream-token/keshet12', { cache: 'no-store' });
    if (!response.ok) return null;
    const data = (await response.json()) as { url?: string | null };
    return data.url ?? null;
  } catch {
    return null;
  }
}

function decryptPayload<T>(encrypted: string, keyValue: string): T {
  const ciphertext = encrypted.trim();
  const decrypted = CryptoJS.AES.decrypt(
    CryptoJS.lib.CipherParams.create({
      ciphertext: CryptoJS.enc.Base64.parse(ciphertext),
    }),
    CryptoJS.enc.Utf8.parse(keyValue),
    {
      iv: CryptoJS.enc.Utf8.parse(KESHET_CRYPTO_IV),
      mode: CryptoJS.mode.CBC,
      padding: CryptoJS.pad.Pkcs7,
    },
  );
  const plaintext = decrypted.toString(CryptoJS.enc.Utf8);
  if (!plaintext) {
    throw new Error(`Empty decrypted payload (ciphertext length: ${ciphertext.length})`);
  }
  return JSON.parse(plaintext) as T;
}

function encryptPayload(payload: object, keyValue: string): string {
  const encrypted = CryptoJS.AES.encrypt(
    JSON.stringify(payload),
    CryptoJS.enc.Utf8.parse(keyValue),
    {
      iv: CryptoJS.enc.Utf8.parse(KESHET_CRYPTO_IV),
      mode: CryptoJS.mode.CBC,
      padding: CryptoJS.pad.Pkcs7,
    },
  );
  return encrypted.ciphertext.toString(CryptoJS.enc.Base64);
}

export async function resolveKeshet12BrowserStream(): Promise<string | null> {
  let stage = 'playlist-request';
  try {
    const playlistResponse = await fetch(KESHET_PLAYLIST_URL, {
      headers: { Accept: 'text/plain,*/*' },
      credentials: 'omit',
    });
    if (!playlistResponse.ok) return resolveKeshet12ServerStream();

    stage = 'playlist-decrypt';
    const encryptedPlaylist = await playlistResponse.text();
    const playlist = decryptPayload<KeshetPlaylist>(
      encryptedPlaylist,
      KESHET_PLAYLIST_KEY,
    );
    const source = playlist.media?.find(item => item.cdn === 'AWS' && item.ssai === false)
      ?? playlist.media?.find(item => item.cdn === 'AWS')
      ?? playlist.media?.[0];
    if (!source?.url || !source.cdn) return resolveKeshet12ServerStream();

    stage = 'server-entitlement-request';
    const serverEntitlementResponse = await fetch('/api/stream-token/keshet12', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sourceUrl: source.url, sourceCdn: source.cdn }),
      cache: 'no-store',
    });
    if (serverEntitlementResponse.ok) {
      const serverEntitlement = (await serverEntitlementResponse.json()) as { url?: string | null };
      if (serverEntitlement.url) return serverEntitlement.url;
    }

    const sourceUrl = new URL(source.url);
    stage = 'entitlement-encrypt';
    const entitlementPayload = encryptPayload({
      lp: `${sourceUrl.pathname}${sourceUrl.search}`,
      rv: source.cdn,
      du: 'null',
      dv: KESHET_VCM_ID,
      na: KESHET_PLAYER_VERSION,
    }, KESHET_TOKEN_KEY);
    stage = 'entitlement-request';
    const entitlementResponse = await fetch(KESHET_ENTITLEMENT_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=UTF-8' },
      body: entitlementPayload,
      credentials: 'omit',
    });
    if (!entitlementResponse.ok) return resolveKeshet12ServerStream();

    stage = 'entitlement-decrypt';
    const encryptedEntitlement = await entitlementResponse.text();
    if (!/^[A-Za-z0-9+/=\s]+$/.test(encryptedEntitlement)) {
      const preview = encryptedEntitlement.slice(0, 80).replace(/\s+/g, ' ');
      throw new Error(
        `Unexpected entitlement response (${entitlementResponse.headers.get('content-type')}, ${preview})`,
      );
    }
    const entitlement = decryptPayload<KeshetEntitlement>(
      encryptedEntitlement,
      KESHET_TOKEN_KEY,
    );
    const ticket = entitlement.caseId === '1' ? entitlement.tickets?.[0]?.ticket : null;
    if (!ticket) return resolveKeshet12ServerStream();

    const signedUrl = `${source.url}${source.url.includes('?') ? '&' : '?'}${ticket}`;
    return `/api/stream-proxy/keshet12?url=${encodeURIComponent(signedUrl)}`;
  } catch (error) {
    const serverStream = await resolveKeshet12ServerStream();
    if (serverStream) return serverStream;

    const name = error instanceof Error ? error.name : 'UnknownError';
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[KeshetStream] Failed at ${stage}: ${name}: ${message}`);
    return null;
  }
}
