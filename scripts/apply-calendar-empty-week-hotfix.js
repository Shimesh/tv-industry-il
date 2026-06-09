const fs = require('fs');

function replaceOnce(path, from, to) {
  const source = fs.readFileSync(path, 'utf8');
  if (!source.includes(from)) throw new Error(`Expected text not found in ${path}`);
  fs.writeFileSync(path, source.replace(from, to));
}

const schedulePath = 'scripts/fetch-schedules.js';
replaceOnce(
  schedulePath,
  "function normalizeName(name) {",
  "function normalizeSavedCalendarUrl(rawUrl) {\n  const value = String(rawUrl || '').trim();\n  const firstUrl = value.match(/https?:\\/\\/[\\s\\S]*?(?=https?:\\/\\/|$)/i)?.[0]?.trim();\n  if (!firstUrl) throw new Error('Saved Herzliya calendar URL is invalid');\n  return firstUrl;\n}\n\nfunction normalizeName(name) {",
);
replaceOnce(
  schedulePath,
  "          const schedule = await fetchSchedule(browser, saved.url);\n          if (!schedule || !schedule.productions.length) {\n            throw new Error('No productions found in saved Herzliya calendar');\n          }",
  "          const calendarUrl = normalizeSavedCalendarUrl(saved.url);\n          const schedule = await fetchSchedule(browser, calendarUrl);\n          if (!schedule?.weekStart) throw new Error('Calendar week could not be parsed');",
);

for (const path of ['package.json', 'package-lock.json', 'realtime-server/package.json']) {
  const source = fs.readFileSync(path, 'utf8');
  const updated = source.replaceAll('2.8.87', '2.8.88');
  if (updated === source) throw new Error(`Version not found in ${path}`);
  fs.writeFileSync(path, updated);
}
replaceOnce('src/components/Footer.tsx', 'v2.8.87', 'v2.8.88');
