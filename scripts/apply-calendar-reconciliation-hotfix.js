const fs = require('fs');

const version = '2.8.87';
const replaceOnce = (text, marker, replacement, label) => {
  if (!text.includes(marker)) throw new Error(`${label} marker not found`);
  return text.replace(marker, replacement);
};

const scriptPath = 'scripts/fetch-schedules.js';
let script = fs.readFileSync(scriptPath, 'utf8');

if (!script.includes('async function reconcileGlobalWeek(')) {
  const marker = 'async function findCalendarContext(page) {';
  const helper = `async function reconcileGlobalWeek(weekId, expectedProductionIds) {
  const [year, month, day] = weekId.split('-').map(Number);
  const weekEndDate = new Date(Date.UTC(year, month - 1, day + 6));
  const weekEnd = weekEndDate.toISOString().slice(0, 10);
  const expectedIds = new Set([...expectedProductionIds].map(String));

  const globalSnap = await db
    .collection('global_productions')
    .where('date', '>=', weekId)
    .where('date', '<=', weekEnd)
    .get();

  const staleDocs = globalSnap.docs.filter((doc) => {
    const data = doc.data();
    return data.herzliyaId && !expectedIds.has(doc.id);
  });

  if (!staleDocs.length) {
    console.log(\`Global week \${weekId} is already reconciled\`);
    return 0;
  }

  for (let i = 0; i < staleDocs.length; i += 400) {
    const batch = db.batch();
    for (const staleDoc of staleDocs.slice(i, i + 400)) batch.delete(staleDoc.ref);
    await batch.commit();
  }

  console.log(\`Deleted \${staleDocs.length} stale global productions for week \${weekId}\`);
  return staleDocs.length;
}

${marker}`;
  script = replaceOnce(script, marker, helper, 'global reconciliation helper');
}

const oldCleanup = `  const popupSuccessRate = schedule.parseStats?.popupSuccessRate ?? 1;
  const cleanupAllowed = popupSuccessRate >= 0.5;
  // Save to per-user path: productions/{userId}/weeks/{weekId}
  const userProductionsRoot = getUserProductionsRoot(userId);

  if (cleanupAllowed) {
    await cleanupWeek(userProductionsRoot, weekId);
  } else {
    console.log(
      \`Skipping cleanup for week \${weekId} (popup success rate \${(popupSuccessRate * 100).toFixed(1)}%)\`,
    );
  }`;
const newCleanup = `  // Save to per-user path: productions/{userId}/weeks/{weekId}
  const userProductionsRoot = getUserProductionsRoot(userId);

  // The calendar grid is authoritative for existence; popup parsing only enriches crew.
  await cleanupWeek(userProductionsRoot, weekId);`;
if (script.includes(oldCleanup)) script = script.replace(oldCleanup, newCleanup);

if (!script.includes('const expectedGlobalIdsByWeek = new Map();')) {
  script = replaceOnce(
    script,
    `    let successCount = 0;
    let productionCount = 0;`,
    `    let successCount = 0;
    let productionCount = 0;
    const expectedGlobalIdsByWeek = new Map();`,
    'expected IDs map',
  );

  script = replaceOnce(
    script,
    `          successCount++;
          productionCount += schedule.productions.length;`,
    `          successCount++;
          productionCount += schedule.productions.length;
          const scheduleWeekId = getWeekId(schedule.weekStart);
          const expectedIds = expectedGlobalIdsByWeek.get(scheduleWeekId) || new Set();
          for (const production of schedule.productions) {
            const productionId = String(production.herzliyaId || production.id || '');
            if (productionId && productionId !== '0') expectedIds.add(productionId);
          }
          expectedGlobalIdsByWeek.set(scheduleWeekId, expectedIds);`,
    'expected IDs collection',
  );

  script = replaceOnce(
    script,
    `    await db.doc('system/calendarSync').set({`,
    `    let deletedGlobalCount = 0;
    if (successCount === savedCalendars.length) {
      for (const [weekId, expectedIds] of expectedGlobalIdsByWeek) {
        deletedGlobalCount += await reconcileGlobalWeek(weekId, expectedIds);
      }
    } else {
      console.warn(\`Skipping global reconciliation because only \${successCount}/\${savedCalendars.length} calendars succeeded\`);
    }

    await db.doc('system/calendarSync').set({`,
    'global reconciliation call',
  );

  script = replaceOnce(
    script,
    '      lastSyncCount: productionCount,',
    `      lastSyncCount: productionCount,
      lastSyncDeletedCount: deletedGlobalCount,`,
    'deleted count metric',
  );

  script = replaceOnce(
    script,
    '      + `${productionCount} productions`,',
    '      + `${productionCount} productions, ${deletedGlobalCount} stale global productions deleted`,',
    'completion log',
  );
}

fs.writeFileSync(scriptPath, script);

for (const path of ['package.json', 'package-lock.json', 'realtime-server/package.json']) {
  const json = JSON.parse(fs.readFileSync(path, 'utf8'));
  json.version = version;
  if (path === 'package-lock.json' && json.packages?.['']) json.packages[''].version = version;
  fs.writeFileSync(path, JSON.stringify(json, null, 2) + '\n');
}

const footerPath = 'src/components/Footer.tsx';
const footer = fs.readFileSync(footerPath, 'utf8').replace(/v\d+\.\d+\.\d+/, `v${version}`);
fs.writeFileSync(footerPath, footer);
