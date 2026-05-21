/**
 * Telegram authentication script.
 *
 * Usage from PowerShell:
 *   $env:TELEGRAM_PHONE="+972501234567"; node scripts/telegram-auth.mjs
 *   $env:TELEGRAM_PHONE="+972501234567"; $env:TELEGRAM_CODE="12345"; node scripts/telegram-auth.mjs
 *
 * TELEGRAM_API_ID and TELEGRAM_API_HASH can be stored in .env.local.
 * On success, TELEGRAM_SESSION is written to .env.local.
 */

import { readFileSync, writeFileSync } from 'fs';
import { dirname, resolve } from 'path';
import { createInterface } from 'readline/promises';
import { fileURLToPath } from 'url';
import { Api, TelegramClient } from 'telegram';
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

function upsertEnvValue(content, key, value) {
  const escapedKey = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const line = `${key}=${value}`;

  if (new RegExp(`^${escapedKey}=`, 'm').test(content)) {
    return content.replace(new RegExp(`^${escapedKey}=.*$`, 'm'), line);
  }

  return `${content.trimEnd()}\n${line}\n`;
}

loadEnvFile(ENV_PATH);

const API_ID = Number.parseInt(process.env.TELEGRAM_API_ID || '', 10);
const API_HASH = process.env.TELEGRAM_API_HASH;
const PHONE = process.env.TELEGRAM_PHONE;
const CODE = process.env.TELEGRAM_CODE;
const PHONE_CODE_HASH = process.env.TELEGRAM_PHONE_CODE_HASH;
const PASSWORD = process.env.TELEGRAM_PASSWORD;
const EXISTING_SESSION = process.env.TELEGRAM_SESSION || '';

if (!API_ID || !API_HASH) {
  console.error('Missing TELEGRAM_API_ID or TELEGRAM_API_HASH in environment or .env.local.');
  process.exit(1);
}

if (!PHONE) {
  console.error('Missing TELEGRAM_PHONE. Example: $env:TELEGRAM_PHONE="+972501234567"; node scripts/telegram-auth.mjs');
  process.exit(1);
}

async function saveSession() {
  const sessionString = client.session.save();
  console.log('Authenticated. Session string obtained.');

  let envContent = '';
  try {
    envContent = readFileSync(ENV_PATH, 'utf8');
  } catch {
    // The file will be created below.
  }

  envContent = upsertEnvValue(envContent, 'TELEGRAM_SESSION', sessionString);
  envContent = upsertEnvValue(envContent, 'TELEGRAM_PHONE_CODE_HASH', '');
  writeFileSync(ENV_PATH, envContent, 'utf8');
  console.log('TELEGRAM_SESSION saved to .env.local.');
}

const client = new TelegramClient(new StringSession(EXISTING_SESSION), API_ID, API_HASH, {
  connectionRetries: 3,
});

async function promptForCode() {
  const rl = createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  try {
    return (await rl.question('Enter the Telegram code: ')).trim();
  } finally {
    rl.close();
  }
}

async function signInWithCode(phoneCodeHash, phoneCode) {
  try {
    await client.invoke(new Api.auth.SignIn({
      phoneNumber: PHONE,
      phoneCodeHash,
      phoneCode,
    }));
  } catch (err) {
    if (err.errorMessage === 'SESSION_PASSWORD_NEEDED') {
      if (!PASSWORD) {
        console.error('Two-step verification is enabled. Run again with TELEGRAM_PASSWORD set.');
        await client.disconnect();
        process.exit(1);
      }

      await client.signInWithPassword(
        { apiId: API_ID, apiHash: API_HASH },
        {
          password: async () => PASSWORD,
          onError: (passwordError) => {
            console.error('Password auth error:', passwordError.message);
            return true;
          },
        },
      );
    } else if (err.errorMessage === 'PHONE_CODE_INVALID') {
      console.error('The Telegram code is invalid. Use the newest code from the Telegram app.');
      await client.disconnect();
      process.exit(1);
    } else if (err.errorMessage === 'PHONE_CODE_EXPIRED') {
      console.error('The Telegram code expired. Run this command again and enter the new code immediately.');
      await client.disconnect();
      process.exit(1);
    } else {
      console.error('Auth error:', err.message);
      await client.disconnect();
      process.exit(1);
    }
  }
}

await client.connect();

if (!CODE || !PHONE_CODE_HASH) {
  if (CODE && !PHONE_CODE_HASH) {
    console.log('TELEGRAM_CODE is set, but TELEGRAM_PHONE_CODE_HASH is missing. Requesting a fresh code first.');
  }

  console.log(`Sending verification code to ${PHONE}...`);
  let result;
  try {
    result = await client.sendCode({ apiId: API_ID, apiHash: API_HASH }, PHONE);
  } catch (err) {
    console.error('Failed to send Telegram code:', err.errorMessage || err.message);
    await client.disconnect();
    process.exit(1);
  }

  let envContent = '';
  try {
    envContent = readFileSync(ENV_PATH, 'utf8');
  } catch {
    // The file will be created below.
  }

  writeFileSync(
    ENV_PATH,
    upsertEnvValue(envContent, 'TELEGRAM_PHONE_CODE_HASH', result.phoneCodeHash),
    'utf8',
  );

  console.log('Code sent. Run again with TELEGRAM_CODE set to the code you received.');
  if (result.isCodeViaApp) {
    console.log('Telegram sent the code inside the Telegram app, not by SMS.');
  }

  if (process.stdin.isTTY) {
    const promptedCode = await promptForCode();
    if (!promptedCode) {
      console.error('Code is empty.');
      await client.disconnect();
      process.exit(1);
    }

    await signInWithCode(result.phoneCodeHash, promptedCode);
    await saveSession();
  }

  await client.disconnect();
  process.exit(0);
}

console.log(`Signing in with code ${CODE}...`);
await signInWithCode(PHONE_CODE_HASH, CODE);
await saveSession();

await client.disconnect();
