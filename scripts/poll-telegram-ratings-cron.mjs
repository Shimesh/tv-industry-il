const DEFAULT_URL = 'https://tv-industry-il.vercel.app/api/cron/scrape-ratings/telegram';

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function expectedDate() {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Jerusalem',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date());
  const get = (type) => parts.find((part) => part.type === type)?.value || '';
  const today = new Date(`${get('year')}-${get('month')}-${get('day')}T12:00:00Z`);
  today.setUTCDate(today.getUTCDate() - 1);
  return today.toISOString().slice(0, 10);
}

async function callCron(url, secret, date) {
  const target = new URL(url);
  target.searchParams.set('expectedDate', date);
  const res = await fetch(target, {
    headers: { Authorization: `Bearer ${secret}` },
    cache: 'no-store',
  });
  const payload = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, payload };
}

async function main() {
  const secret = process.env.CRON_SECRET;
  if (!secret) throw new Error('CRON_SECRET is required');

  const url = process.env.RATINGS_TELEGRAM_CRON_URL || DEFAULT_URL;
  const date = process.env.EXPECTED_DATE || expectedDate();
  const watchMinutes = Number.parseInt(process.env.WATCH_MINUTES || '20', 10);
  const intervalSeconds = Number.parseInt(process.env.POLL_INTERVAL_SECONDS || '60', 10);
  const deadline = Date.now() + Math.max(1, watchMinutes) * 60_000;
  let attempt = 0;
  let lastError = '';

  while (Date.now() <= deadline) {
    attempt += 1;
    const result = await callCron(url, secret, date);
    const body = result.payload;
    console.log(`[telegram-ratings] attempt=${attempt} status=${result.status} expectedDate=${date} body=${JSON.stringify(body).slice(0, 700)}`);

    if (result.ok && body?.success !== false && body?.daily?.date === date) {
      console.log(`[telegram-ratings] imported ${body.daily.rows || 0} rows for ${date}`);
      return;
    }

    lastError = body?.error || body?.reason || `HTTP ${result.status}`;
    if (Date.now() + intervalSeconds * 1000 > deadline) break;
    await sleep(intervalSeconds * 1000);
  }

  throw new Error(`Telegram ratings were not imported for ${date}: ${lastError || 'timeout'}`);
}

main().catch((error) => {
  console.error(`[telegram-ratings] failed: ${error.message}`);
  process.exit(1);
});

