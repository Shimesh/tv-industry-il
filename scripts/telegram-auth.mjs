/**
 * telegram-auth.mjs
 * One-time interactive script to generate a TELEGRAM_SESSION string.
 * Run with: node scripts/telegram-auth.mjs
 * Copy the printed session string into your .env as TELEGRAM_SESSION=...
 */

import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';
import readline from 'readline';

const require = createRequire(import.meta.url);

try {
  process.loadEnvFile(resolve(dirname(fileURLToPath(import.meta.url)), '../.env'));
} catch {}

const { TelegramClient } = require('telegram');
const { StringSession } = require('telegram/sessions');

const apiId = Number(process.env.TELEGRAM_API_ID);
const apiHash = process.env.TELEGRAM_API_HASH || '';

if (!apiId || !apiHash) {
  console.error('Missing TELEGRAM_API_ID or TELEGRAM_API_HASH in .env');
  process.exit(1);
}

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

function ask(question) {
  return new Promise((resolve) => rl.question(question, resolve));
}

(async () => {
  const session = new StringSession('');
  const client = new TelegramClient(session, apiId, apiHash, { connectionRetries: 5 });

  await client.start({
    phoneNumber: async () => ask('Enter your phone number (with country code, e.g. +972501234567): '),
    password: async () => ask('Enter your 2FA password (press Enter if none): '),
    phoneCode: async () => ask('Enter the code you received via Telegram: '),
    onError: (err) => console.error('Auth error:', err),
  });

  console.log('\n=== Session string (copy this into .env as TELEGRAM_SESSION) ===');
  console.log(client.session.save());
  console.log('=== End of session string ===\n');

  rl.close();
  await client.disconnect();
  process.exit(0);
})();
