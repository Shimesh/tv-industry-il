const DEFAULT_URL = 'https://tv-industry-il.vercel.app/api/cron/sync-calendar';

async function callCron(url, secret) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 320_000);
  try {
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${secret}` },
      cache: 'no-store',
      signal: controller.signal,
    });
    const payload = await res.json().catch(() => ({}));
    return { ok: res.ok, status: res.status, payload };
  } finally {
    clearTimeout(timeout);
  }
}

async function main() {
  const secret = process.env.CRON_SECRET;
  if (!secret) throw new Error('CRON_SECRET is required');

  const url = process.env.CALENDAR_SYNC_CRON_URL || DEFAULT_URL;
  const result = await callCron(url, secret);
  const body = result.payload || {};
  console.log(`[calendar-sync] status=${result.status} body=${JSON.stringify(body).slice(0, 1200)}`);

  if (!result.ok || body.ok === false) {
    throw new Error(body.error || body.reason || `HTTP ${result.status}`);
  }

  if (typeof body.success === 'number' && body.success <= 0) {
    throw new Error(`Calendar sync completed with no successful users: ${JSON.stringify(body).slice(0, 700)}`);
  }

  console.log(`[calendar-sync] synced ${body.success ?? '?'} users, ${body.productions ?? '?'} productions`);
}

main().catch((error) => {
  console.error(`[calendar-sync] failed: ${error.message}`);
  process.exit(1);
});
