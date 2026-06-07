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

const encoder = new TextEncoder();
const decoder = new TextDecoder();

function base64ToBytes(value: string): ArrayBuffer {
  const binary = atob(value.trim());
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes.buffer;
}

function bytesToBase64(value: ArrayBuffer): string {
  const bytes = new Uint8Array(value);
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

async function importAesKey(value: string, usages: KeyUsage[]) {
  return crypto.subtle.importKey(
    'raw',
    encoder.encode(value),
    { name: 'AES-CBC' },
    false,
    usages,
  );
}

async function decryptPayload<T>(encrypted: string, keyValue: string): Promise<T> {
  const key = await importAesKey(keyValue, ['decrypt']);
  const decrypted = await crypto.subtle.decrypt(
    { name: 'AES-CBC', iv: encoder.encode(KESHET_CRYPTO_IV) },
    key,
    base64ToBytes(encrypted),
  );
  return JSON.parse(decoder.decode(decrypted)) as T;
}

async function encryptPayload(payload: object, keyValue: string): Promise<string> {
  const key = await importAesKey(keyValue, ['encrypt']);
  const encrypted = await crypto.subtle.encrypt(
    { name: 'AES-CBC', iv: encoder.encode(KESHET_CRYPTO_IV) },
    key,
    encoder.encode(JSON.stringify(payload)),
  );
  return bytesToBase64(encrypted);
}

export async function resolveKeshet12BrowserStream(): Promise<string | null> {
  try {
    const playlistResponse = await fetch(KESHET_PLAYLIST_URL, {
      headers: { Accept: 'text/plain,*/*' },
      cache: 'no-store',
      credentials: 'omit',
    });
    if (!playlistResponse.ok) return null;

    const playlist = await decryptPayload<KeshetPlaylist>(
      await playlistResponse.text(),
      KESHET_PLAYLIST_KEY,
    );
    const source = playlist.media?.find(item => item.cdn === 'AWS' && item.ssai === false)
      ?? playlist.media?.find(item => item.cdn === 'AWS')
      ?? playlist.media?.[0];
    if (!source?.url || !source.cdn) return null;

    const sourceUrl = new URL(source.url);
    const entitlementPayload = await encryptPayload({
      lp: `${sourceUrl.pathname}${sourceUrl.search}`,
      rv: source.cdn,
      du: 'null',
      dv: KESHET_VCM_ID,
      na: KESHET_PLAYER_VERSION,
    }, KESHET_TOKEN_KEY);
    const entitlementResponse = await fetch(KESHET_ENTITLEMENT_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=UTF-8' },
      body: entitlementPayload,
      cache: 'no-store',
      credentials: 'omit',
    });
    if (!entitlementResponse.ok) return null;

    const entitlement = await decryptPayload<KeshetEntitlement>(
      await entitlementResponse.text(),
      KESHET_TOKEN_KEY,
    );
    const ticket = entitlement.caseId === '1' ? entitlement.tickets?.[0]?.ticket : null;
    if (!ticket) return null;

    const signedUrl = `${source.url}${source.url.includes('?') ? '&' : '?'}${ticket}`;
    return `/api/stream-proxy/keshet12?url=${encodeURIComponent(signedUrl)}`;
  } catch (error) {
    console.error('[KeshetStream] Failed to resolve signed browser stream', error);
    return null;
  }
}
