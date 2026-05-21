/**
 * Import the latest Scopt Telegram daily ratings message into Firestore.
 *
 * Usage:
 *   npm.cmd run telegram:import-ratings
 */

import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';
import { TelegramClient } from 'telegram';
import { StringSession } from 'telegram/sessions/index.js';
import {
  getFirestoreDocument,
  loadEnvFile,
  parseScoptRatingsMessage,
  patchFirestoreDocument,
} from './telegram-ratings-utils.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ENV_PATH = resolve(__dirname, '../.env.local');

loadEnvFile(ENV_PATH);

const API_ID = Number.parseInt(process.env.TELEGRAM_API_ID || '', 10);
const API_HASH = process.env.TELEGRAM_API_HASH;
const SESSION = process.env.TELEGRAM_SESSION || '';
const CHANNEL = process.env.TELEGRAM_CHANNEL || process.env.TELEGRAM_SCOPT_CHANNEL;
const LIMIT = Number.parseInt(process.env.TELEGRAM_LIMIT || '30', 10);

if (!API_ID || !API_HASH) {
  console.error('Missing TELEGRAM_API_ID or TELEGRAM_API_HASH in environment or .env.local.');
  process.exit(1);
}

if (!SESSION) {
  console.error('Missing TELEGRAM_SESSION. Run npm.cmd run telegram:auth first.');
  process.exit(1);
}

if (!CHANNEL) {
  console.error('Missing TELEGRAM_CHANNEL in .env.local.');
  process.exit(1);
}

const client = new TelegramClient(new StringSession(SESSION), API_ID, API_HASH, {
  connectionRetries: 3,
});

function hasMidrugRows(document) {
  if (!document?.top20?.length || document.source === 'telegram') return false;
  return document.top20.some((row) => Boolean(row.date && row.channel && row.duration > 0));
}

try {
  await client.connect();
  const entity = await client.getEntity(CHANNEL);
  const messages = await client.getMessages(entity, { limit: Number.isFinite(LIMIT) ? LIMIT : 30 });

  let parsed = null;
  let messageId = null;

  for (const message of messages) {
    parsed = parseScoptRatingsMessage(message.message || '', message.date ? new Date(message.date * 1000) : new Date());
    if (parsed) {
      messageId = message.id;
      break;
    }
  }

  if (!parsed) {
    throw new Error(`No Scopt ratings message found in the latest ${messages.length} Telegram messages`);
  }

  const existing = await getFirestoreDocument(`ratings_daily/${parsed.date}`);
  const hasMidrug = hasMidrugRows(existing);
  const doc = {
    date: parsed.date,
    sourceDate: existing?.sourceDate || parsed.sourceDate,
    targetAudience: existing?.targetAudience || parsed.targetAudience,
    telegramHouseholds: parsed.telegramHouseholds,
    telegramPrime: parsed.telegramPrime,
    telegramFetchedAt: parsed.telegramFetchedAt,
    source: hasMidrug ? 'both' : 'telegram',
    sourceMessageId: String(messageId || ''),
  };

  if (!existing?.fetchedAt) doc.fetchedAt = parsed.telegramFetchedAt;
  if (!hasMidrug) doc.top20 = [];
  if (existing?.fallbackUsed === undefined) doc.fallbackUsed = false;

  await patchFirestoreDocument(`ratings_daily/${doc.date}`, doc);

  console.log(`Imported Telegram ratings for ${doc.date}`);
  console.log(`News rows: ${doc.telegramHouseholds.length}`);
  console.log(`Prime rows: ${doc.telegramPrime.length}`);
  console.log(`Preserved Midrug rows: ${hasMidrug ? existing.top20.length : 0}`);
  console.log(`Message ID: ${messageId}`);
} catch (err) {
  console.error('Telegram ratings import failed:', err.errorMessage || err.message);
  process.exitCode = 1;
} finally {
  await client.disconnect();
}
