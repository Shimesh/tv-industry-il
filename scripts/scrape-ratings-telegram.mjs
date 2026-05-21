/**
 * scrape-ratings-telegram.mjs
 * Telegram listener for Scopt ratings channel.
 * Exports startTelegramListener(dbInstance?) for use by the watcher.
 * Can also be run standalone: node scripts/scrape-ratings-telegram.mjs
 */

import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

const require = createRequire(import.meta.url);

try {
  process.loadEnvFile(resolve(dirname(fileURLToPath(import.meta.url)), '../.env'));
} catch {}

function ts() { return new Date().toISOString(); }

/**
 * Parse a Scopt ratings message and extract structured data.
 * Returns null if the message doesn't look like a valid ratings post.
 * @param {string} text
 * @returns {{ isoDate: string, households: TelegramRatingRow[], prime: TelegramRatingRow[] } | null}
 */
export function parseScoptRatingsMessage(text) {
  if (!text || !text.includes('לתאריך')) return null;

  // Extract date: "לתאריך DD/MM/YY" or "לתאריך DD/MM/YYYY"
  const dateMatch = text.match(/לתאריך\s+(\d{1,2})\/(\d{1,2})\/(\d{2,4})/);
  if (!dateMatch) return null;

  const day = dateMatch[1].padStart(2, '0');
  const month = dateMatch[2].padStart(2, '0');
  const rawYear = dateMatch[3];
  const year = rawYear.length === 2 ? `20${rawYear}` : rawYear;
  const isoDate = `${year}-${month}-${day}`;

  // Row regex: #rank [emoji] viewersK ratingPercent% - showName
  const rowRegex = /#(\d+)\s*(?:📺|🖥️|📡)?\s*(\d+(?:\.\d+)?)k\s+(\d+(?:\.\d+)?)%\s*[-–]\s*(.+)/g;

  /**
   * Extract rows from a section delimited by a header and the next header (or end of string).
   * @param {string} sectionHeader - the Hebrew section title
   * @returns {Array<{rank,showName,viewers,ratingPercent}>}
   */
  function extractSection(sectionHeader) {
    const sectionIndex = text.indexOf(sectionHeader);
    if (sectionIndex === -1) return [];

    // Find where this section ends: next section header or end of text
    const afterHeader = text.slice(sectionIndex + sectionHeader.length);
    // Look for the next section (another בX header) or end
    const nextSectionMatch = afterHeader.match(/\n(?:בחשבות|בפריים|ריייטינג|לתאריך)/);
    const sectionText = nextSectionMatch
      ? afterHeader.slice(0, nextSectionMatch.index)
      : afterHeader;

    const rows = [];
    let match;
    rowRegex.lastIndex = 0;
    while ((match = rowRegex.exec(sectionText)) !== null) {
      rows.push({
        rank: Number(match[1]),
        viewers: Number(match[2]),
        ratingPercent: Number(match[3]),
        showName: match[4].trim(),
      });
    }
    return rows;
  }

  const households = extractSection('בחשבות');
  const prime = extractSection('בפריים');

  if (households.length === 0 && prime.length === 0) return null;

  return { isoDate, households, prime };
}

/**
 * Save parsed Telegram ratings to Firestore.
 * @param {{ isoDate: string, households: TelegramRatingRow[], prime: TelegramRatingRow[] }} parsed
 * @param {string|number} messageId
 * @param {object} db - Firebase Admin Firestore instance
 */
export async function saveTelegramRatings(parsed, messageId, db) {
  const { isoDate, households, prime } = parsed;

  // Check if midrug data already exists
  const existingDoc = await db.doc(`ratings_daily/${isoDate}`).get();
  const existingData = existingDoc.exists ? existingDoc.data() : null;
  const hasTop20 = existingData?.top20?.length > 0;

  const source = hasTop20 ? 'both' : 'telegram';

  await db.doc(`ratings_daily/${isoDate}`).set({
    date: isoDate,
    telegramHouseholds: households,
    telegramPrime: prime,
    telegramFetchedAt: new Date().toISOString(),
    telegramMessageId: String(messageId),
    source,
  }, { merge: true });

  console.log(`[${ts()}] Saved Telegram ratings for ${isoDate} (source: ${source}, households: ${households.length}, prime: ${prime.length})`);

  await db.doc('adminMetrics/job-ratings-telegram').set({
    key: 'ratings-telegram',
    metricType: 'job',
    label: 'ratings-telegram',
    lastRunAt: new Date().toISOString(),
    lastSuccessAt: new Date().toISOString(),
    lastStatus: 'success',
    lastError: null,
    source: 'telegram',
    lastDate: isoDate,
  }, { merge: true });
}

/**
 * Start the Telegram listener for the Scopt channel.
 * @param {object} [dbInstance] - optional Firebase Admin Firestore instance
 * @returns {Promise<object|null>} Telegram client or null if not configured
 */
export async function startTelegramListener(dbInstance) {
  const apiId = Number(process.env.TELEGRAM_API_ID);
  const apiHash = process.env.TELEGRAM_API_HASH;
  const sessionStr = process.env.TELEGRAM_SESSION;
  const channelUsername = process.env.TELEGRAM_SCOPT_CHANNEL;

  if (!apiId || !apiHash || !sessionStr || !channelUsername) {
    console.log(`[${ts()}] Telegram: missing env vars (TELEGRAM_API_ID, TELEGRAM_API_HASH, TELEGRAM_SESSION, TELEGRAM_SCOPT_CHANNEL) — skipping`);
    return null;
  }

  // Lazily require db if not passed
  let db = dbInstance;
  if (!db) {
    const adminRequire = createRequire(import.meta.url);
    const admin = adminRequire('firebase-admin');
    if (!admin.apps.length) {
      admin.initializeApp({
        credential: admin.credential.cert({
          projectId: process.env.FIREBASE_PROJECT_ID,
          clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
          privateKey: (process.env.FIREBASE_PRIVATE_KEY || '').replace(/\\n/g, '\n'),
        }),
      });
    }
    db = admin.firestore();
  }

  const { TelegramClient } = require('telegram');
  const { StringSession } = require('telegram/sessions');
  const { NewMessage } = require('telegram/events');

  const session = new StringSession(sessionStr);
  const client = new TelegramClient(session, apiId, apiHash, {
    connectionRetries: 5,
    autoReconnect: true,
  });

  try {
    await client.connect();
    const authorized = await client.isUserAuthorized();
    if (!authorized) {
      console.log(`[${ts()}] Telegram: session is not authorized — run telegram-auth.mjs first`);
      await client.disconnect();
      return null;
    }
    console.log(`[${ts()}] Telegram: connected and authorized`);
  } catch (err) {
    console.log(`[${ts()}] Telegram: connection failed — ${err.message}`);
    return null;
  }

  // Catch-up: fetch last 10 messages and check for today's ratings
  try {
    const todayISO = (() => {
      const parts = Intl.DateTimeFormat('en-CA', {
        timeZone: 'Asia/Jerusalem', year: 'numeric', month: '2-digit', day: '2-digit',
      }).formatToParts(new Date());
      const get = t => parts.find(p => p.type === t)?.value || '';
      return `${get('year')}-${get('month')}-${get('day')}`;
    })();

    const messages = await client.getMessages(channelUsername, { limit: 10 });
    for (const msg of messages) {
      if (!msg.message) continue;
      const parsed = parseScoptRatingsMessage(msg.message);
      if (!parsed || parsed.isoDate !== todayISO) continue;

      // Check if we already have telegram data for today
      const existingDoc = await db.doc(`ratings_daily/${todayISO}`).get();
      if (existingDoc.exists && existingDoc.data()?.telegramHouseholds?.length > 0) {
        console.log(`[${ts()}] Telegram: already have today's Scopt data (${todayISO}), skipping catch-up`);
        break;
      }

      console.log(`[${ts()}] Telegram: catch-up found ratings for ${parsed.isoDate}`);
      await saveTelegramRatings(parsed, msg.id, db);
      break;
    }
  } catch (err) {
    console.log(`[${ts()}] Telegram: catch-up failed — ${err.message}`);
  }

  // Live listener
  client.addEventHandler(async (event) => {
    try {
      const msg = event.message;
      if (!msg?.message) return;

      // Only process messages from the configured channel
      const peerId = msg.peerId;
      const chatUsername = peerId?.username || peerId?.channelId?.toString();
      const normalizedChannel = channelUsername.replace(/^@/, '').toLowerCase();
      if (chatUsername && chatUsername.toLowerCase() !== normalizedChannel) return;

      const parsed = parseScoptRatingsMessage(msg.message);
      if (!parsed) return;

      console.log(`[${ts()}] Telegram: new ratings message for ${parsed.isoDate}`);
      await saveTelegramRatings(parsed, msg.id, db);
    } catch (err) {
      console.log(`[${ts()}] Telegram: error handling message — ${err.message}`);
    }
  }, new NewMessage({ chats: [channelUsername] }));

  console.log(`[${ts()}] Telegram: listening for new messages in ${channelUsername}`);
  return client;
}

// Run as standalone script
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  startTelegramListener().then((client) => {
    if (!client) process.exit(1);
    // Keep process alive
    setInterval(() => {}, 60 * 60 * 1000);
  }).catch((err) => {
    console.error(`[${ts()}] Fatal error: ${err.message}`);
    process.exit(1);
  });
}
