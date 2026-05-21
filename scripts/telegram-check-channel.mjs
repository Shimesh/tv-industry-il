/**
 * Check Telegram channel access and print recent message previews.
 *
 * Usage:
 *   npm.cmd run telegram:check
 *
 * Required in .env.local:
 *   TELEGRAM_API_ID
 *   TELEGRAM_API_HASH
 *   TELEGRAM_SESSION
 *   TELEGRAM_CHANNEL or legacy TELEGRAM_SCOPT_CHANNEL
 */

import { readFileSync } from 'fs';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';
import { TelegramClient } from 'telegram';
import { StringSession } from 'telegram/sessions/index.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ENV_PATH = resolve(__dirname, '../.env.local');

function loadEnvFile(path) {
  try {
    const lines = readFileSync(path, 'utf8').split(/\r?\n/);

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#') || !trimmed.includes('=')) continue;

      const index = trimmed.indexOf('=');
      const key = trimmed.slice(0, index).trim();
      let value = trimmed.slice(index + 1).trim();

      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }

      process.env[key] ??= value;
    }
  } catch {
    // .env.local is optional; explicit environment variables still work.
  }
}

function previewMessage(value) {
  return String(value || '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 500);
}

loadEnvFile(ENV_PATH);

const API_ID = Number.parseInt(process.env.TELEGRAM_API_ID || '', 10);
const API_HASH = process.env.TELEGRAM_API_HASH;
const SESSION = process.env.TELEGRAM_SESSION || '';
const CHANNEL = process.env.TELEGRAM_CHANNEL || process.env.TELEGRAM_SCOPT_CHANNEL;
const LIMIT = Number.parseInt(process.env.TELEGRAM_LIMIT || '5', 10);

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

try {
  await client.connect();
  const entity = await client.getEntity(CHANNEL);
  const title = entity.title || entity.username || CHANNEL;
  console.log(`Connected to Telegram channel: ${title}`);

  const messages = await client.getMessages(entity, { limit: Number.isFinite(LIMIT) ? LIMIT : 5 });
  if (!messages.length) {
    console.log('No messages found.');
  }

  for (const message of messages) {
    const date = message.date ? new Date(message.date * 1000).toISOString() : 'unknown-date';
    const text = previewMessage(message.message);
    console.log(`\n#${message.id} ${date}`);
    console.log(text || '[no text]');
  }
} catch (err) {
  console.error('Telegram channel check failed:', err.errorMessage || err.message);
  process.exitCode = 1;
} finally {
  await client.disconnect();
}
