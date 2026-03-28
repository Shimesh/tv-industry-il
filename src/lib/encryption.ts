/**
 * E2E Encryption utilities using TweetNaCl (client-side only).
 *
 * Key model:
 *  - Each user has an asymmetric key pair (NaCl box): public key stored in Firestore,
 *    private key stored in localStorage.
 *  - Each chat has a symmetric key (NaCl secretbox): generated once, stored in
 *    Firestore as `encryptedKeys[uid]` — encrypted per member using nacl.box.
 *  - Messages are encrypted with the chat's symmetric key before writing to Firestore.
 */

// Guard: all exports are no-ops on the server
const isBrowser = typeof window !== 'undefined';

// Lazy import — avoids SSR issues with tweetnacl
let nacl: typeof import('tweetnacl') | null = null;
let naclUtil: typeof import('tweetnacl-util') | null = null;

async function getNacl() {
  if (!isBrowser) return null;
  if (!nacl) {
    nacl = (await import('tweetnacl')).default;
    naclUtil = await import('tweetnacl-util');
  }
  return { nacl, naclUtil: naclUtil! };
}

// ── Key pair management ─────────────────────────────────────────────────────

export interface KeyPair {
  publicKey: string;   // base64
  privateKey: string;  // base64
}

export function getOrCreateKeyPair(uid: string): KeyPair | null {
  if (!isBrowser) return null;
  const storageKey = `tv-enc-key-${uid}`;
  try {
    const stored = localStorage.getItem(storageKey);
    if (stored) return JSON.parse(stored) as KeyPair;

    // Need nacl synchronously for initial creation — use sync require
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const naclSync = require('tweetnacl').default ?? require('tweetnacl');
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const utilSync = require('tweetnacl-util');

    const kp = naclSync.box.keyPair();
    const pair: KeyPair = {
      publicKey: utilSync.encodeBase64(kp.publicKey),
      privateKey: utilSync.encodeBase64(kp.secretKey),
    };
    localStorage.setItem(storageKey, JSON.stringify(pair));
    return pair;
  } catch {
    return null;
  }
}

export function getKeyPair(uid: string): KeyPair | null {
  if (!isBrowser) return null;
  try {
    const stored = localStorage.getItem(`tv-enc-key-${uid}`);
    return stored ? JSON.parse(stored) as KeyPair : null;
  } catch {
    return null;
  }
}

// ── Symmetric chat key ──────────────────────────────────────────────────────

export async function generateSymmetricKey(): Promise<string | null> {
  const libs = await getNacl();
  if (!libs) return null;
  const { nacl: n, naclUtil: u } = libs;
  return u.encodeBase64(n.randomBytes(n.secretbox.keyLength));
}

// ── Asymmetric (box) encrypt/decrypt — for distributing the chat key ────────

export async function encryptChatKeyForMember(
  chatKey: string,
  recipientPublicKeyB64: string,
  senderPrivateKeyB64: string
): Promise<string | null> {
  const libs = await getNacl();
  if (!libs) return null;
  try {
    const { nacl: n, naclUtil: u } = libs;
    const nonce = n.randomBytes(n.box.nonceLength);
    const encrypted = n.box(
      u.decodeBase64(chatKey),
      nonce,
      u.decodeBase64(recipientPublicKeyB64),
      u.decodeBase64(senderPrivateKeyB64)
    );
    if (!encrypted) return null;
    const combined = new Uint8Array(nonce.length + encrypted.length);
    combined.set(nonce);
    combined.set(encrypted, nonce.length);
    return u.encodeBase64(combined);
  } catch {
    return null;
  }
}

export async function decryptChatKey(
  encryptedB64: string,
  senderPublicKeyB64: string,
  recipientPrivateKeyB64: string
): Promise<string | null> {
  const libs = await getNacl();
  if (!libs) return null;
  try {
    const { nacl: n, naclUtil: u } = libs;
    const combined = u.decodeBase64(encryptedB64);
    const nonce = combined.slice(0, n.box.nonceLength);
    const ciphertext = combined.slice(n.box.nonceLength);
    const decrypted = n.box.open(
      ciphertext,
      nonce,
      u.decodeBase64(senderPublicKeyB64),
      u.decodeBase64(recipientPrivateKeyB64)
    );
    if (!decrypted) return null;
    return u.encodeBase64(decrypted);
  } catch {
    return null;
  }
}

// ── Symmetric (secretbox) encrypt/decrypt — for message text ────────────────

export async function encryptMessage(
  plaintext: string,
  chatKeyB64: string
): Promise<string | null> {
  const libs = await getNacl();
  if (!libs) return null;
  try {
    const { nacl: n, naclUtil: u } = libs;
    const nonce = n.randomBytes(n.secretbox.nonceLength);
    const msgBytes = new TextEncoder().encode(plaintext);
    const encrypted = n.secretbox(
      msgBytes,
      nonce,
      u.decodeBase64(chatKeyB64)
    );
    if (!encrypted) return null;
    const combined = new Uint8Array(nonce.length + encrypted.length);
    combined.set(nonce);
    combined.set(encrypted, nonce.length);
    return u.encodeBase64(combined);
  } catch {
    return null;
  }
}

export async function decryptMessage(
  ciphertextB64: string,
  chatKeyB64: string
): Promise<string | null> {
  const libs = await getNacl();
  if (!libs) return null;
  try {
    const { nacl: n, naclUtil: u } = libs;
    const combined = u.decodeBase64(ciphertextB64);
    const nonce = combined.slice(0, n.secretbox.nonceLength);
    const ciphertext = combined.slice(n.secretbox.nonceLength);
    const decrypted = n.secretbox.open(ciphertext, nonce, u.decodeBase64(chatKeyB64));
    if (!decrypted) return null;
    return new TextDecoder().decode(decrypted);
  } catch {
    return null;
  }
}

// ── Helpers ─────────────────────────────────────────────────────────────────

/** Quick check: is this string a valid base64 ciphertext (not plaintext)? */
export function looksEncrypted(text: string): boolean {
  // Encrypted blobs are base64 and noticeably longer than plaintext
  return /^[A-Za-z0-9+/]{30,}={0,2}$/.test(text);
}
