const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore, FieldValue } = require('firebase-admin/firestore');
const puppeteer = require('puppeteer-core');
const chromium = require('@sparticuz/chromium');

initializeApp({
  credential: cert({
    projectId: process.env.FIREBASE_PROJECT_ID,
    clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
    privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
  }),
});

const db = getFirestore();

function normalizeName(name) {
  if (!name) return '';

  let cleaned = String(name)
    .replace(/^[\u05d0-\u05ea]+:\s*/u, '')
    .replace(/\s*[-ג€“]\s*[\u05d0-\u05ea\s]+$/u, '')
    .replace(/[()\[\]{}]/g, ' ')
    .replace(/[,:;|]/g, ' ')
    .replace(/[ג€“ג€”-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  const rolePhrases = [
    '׳¦׳׳ ׳¨׳—׳£', '׳¡׳˜׳“׳™ ׳§׳׳', '׳¡׳˜׳“׳™-׳§׳׳', '׳¢. ׳‘׳׳׳™', '׳¢. ׳‘׳׳׳™׳×', '׳¢. ׳¦׳™׳׳•׳',
    '׳¦׳™׳׳•׳', '׳¦׳׳', '׳¦׳׳׳×', '׳¨׳—׳£', '׳¨׳—׳₪׳', '׳¨׳—׳₪׳ ׳™׳×', '׳¡׳˜׳“׳™׳§׳׳', '׳¡׳׳•׳ ׳“',
    '׳‘׳׳׳™', '׳‘׳׳׳™׳×', '׳‘׳™׳׳•׳™', '׳׳₪׳™׳§', '׳׳₪׳™׳§׳×', '׳¢׳•׳¨׳', '׳¢׳•׳¨׳›׳×', '׳§׳•׳',
    '׳׳§׳׳™׳˜', '׳׳§׳׳™׳˜׳”', '׳×׳׳•׳¨׳”', '׳×׳׳•׳¨׳', '׳׳™׳₪׳•׳¨', '׳¡׳˜׳™׳™׳׳™׳ ׳’', '׳׳¨׳˜', '׳×׳₪׳׳•׳¨׳”',
  ];

  let changed = true;
  while (changed) {
    changed = false;
    for (const phrase of rolePhrases) {
      const re = new RegExp(`(^|\\s)${phrase}(\\s|$)`, 'u');
      if (re.test(cleaned)) {
        cleaned = cleaned.replace(re, ' ').replace(/\s+/g, ' ').trim();
        changed = true;
      }
    }
  }

  return cleaned;
}

function normalizeRole(role) {
  return String(role || '')
    .replace(/[|,:;]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizePhone(phone) {
  const digits = String(phone || '').replace(/\D/g, '');
  if (!digits) return null;
  if (digits.startsWith('972') && digits.length >= 12) return `0${digits.slice(-9)}`;
  if (digits.length === 9) return `0${digits}`;
  if (digits.length >= 10) return digits.slice(-10);
  return null;
}

function buildCrewIdentity(member) {
  const normalizedName = normalizeName(member.name || '');
  const normalizedPhone = normalizePhone(member.phone);
  if (!normalizedName || normalizedName.length < 2) {
    return { normalizedName, normalizedPhone, identityKey: null };
  }

  return {
    normalizedName,
    normalizedPhone,
    identityKey: normalizedPhone ? `${normalizedName}::${normalizedPhone}` : normalizedName,
  };
}

function deduplicateCrew(crew) {
  const byIdentity = new Map();
  const byName = new Map();

  for (const member of crew || []) {
    const { normalizedName, normalizedPhone, identityKey } = buildCrewIdentity(member);
    if (!identityKey) continue;

    const existingKey = byName.get(normalizedName);
    const key = existingKey || identityKey;
    const normalized = {
      ...member,
      name: normalizedName,
      role: normalizeRole(member.role),
      roleDetail: normalizeRole(member.roleDetail),
      phone: normalizedPhone,
      normalizedName,
      normalizedPhone,
      identityKey: key,
      startTime: member.startTime || '',
      endTime: member.endTime || '',
    };

    if (!byIdentity.has(key)) {
      byIdentity.set(key, normalized);
      byName.set(normalizedName, key);
      continue;
    }

    const existing = byIdentity.get(key);
    byIdentity.set(key, {
      ...existing,
      name: normalizedName,
      role: existing.role || normalized.role,
      roleDetail: existing.roleDetail || normalized.roleDetail,
      phone: existing.phone || normalized.phone,
      normalizedName,
      normalizedPhone: existing.normalizedPhone || normalized.normalizedPhone,
      identityKey: key,
      startTime: existing.startTime || normalized.startTime,
      endTime: existing.endTime || normalized.endTime,
      isCurrentUser: existing.isCurrentUser || normalized.isCurrentUser,
      userId: existing.userId || normalized.userId,
    });
  }

  return Array.from(byIdentity.values());
}

function sanitizeCrewForFirestore(crew) {
  return deduplicateCrew(crew).map((member) => ({
    name: member.name || '',
    role: member.role || '',
    roleDetail: member.roleDetail || '',
    phone: member.phone || null,
    normalizedName: member.normalizedName || normalizeName(member.name || ''),
    normalizedPhone: member.normalizedPhone || normalizePhone(member.phone),
    identityKey: member.identityKey || normalizeName(member.name || ''),
    startTime: member.startTime || '',
    endTime: member.endTime || '',
    isCurrentUser: !!member.isCurrentUser,
    userId: member.userId || '',
  }));
}

function getHebrewDay(dateStr) {
  const days = ['׳™׳•׳ ׳׳³', '׳™׳•׳ ׳‘׳³', '׳™׳•׳ ׳’׳³', '׳™׳•׳ ׳“׳³', '׳™׳•׳ ׳”׳³', '׳™׳•׳ ׳•׳³', '׳©׳‘׳×'];
  const date = new Date(dateStr);
  return days[date.getDay()];
}

function getWeekId(dateStr) {
  const [y, m, d] = String(dateStr).split('-').map(Number);
  const date = new Date(y, (m || 1) - 1, d || 1);
  const day = date.getDay();
  date.setDate(date.getDate() - day);
  const yy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  return `${yy}-${mm}-${dd}`;
}

async function cleanupWeek(weekId) {
  console.log(`Cleaning up existing data for week ${weekId}...`);
  const prodsSnap = await db.collection(`productions/global/weeks/${weekId}/productions`).get();

  if (prodsSnap.empty) {
    console.log('No existing productions to clean up');
    return;
  }

  for (const prodDoc of prodsSnap.docs) {
    const crewSnap = await db
      .collection(`productions/global/weeks/${weekId}/productions/${prodDoc.id}/crew`)
      .get();

    const batch = db.batch();
    for (const crewDoc of crewSnap.docs) batch.delete(crewDoc.ref);
    batch.delete(prodDoc.ref);
    await batch.commit();
  }

  console.log(`Deleted ${prodsSnap.size} old productions and their crew`);
}

async function findCalendarContext(page) {
  const selector = '.calendar-body, .calendar, #calendar, .calendar-body *';
  const deadline = Date.now() + 20000;

  while (Date.now() < deadline) {
    try {
      await page.waitForSelector(selector, { timeout: 1500 });
      return page;
    } catch {
      // noop
    }

    for (const frame of page.frames()) {
      try {
        const handle = await frame.$(selector);
        if (handle) return frame;
      } catch {
        // noop
      }
    }

    await new Promise((r) => setTimeout(r, 600));
  }

  return null;
}

async function fetchSchedule(browser, url) {
  const page = await browser.newPage();

  try {
    await page.setUserAgent(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
    );
    await page.setExtraHTTPHeaders({ 'Accept-Language': 'he-IL,he;q=0.9,en;q=0.8' });
    await page.evaluateOnNewDocument(() => {
      Object.defineProperty(navigator, 'webdriver', { get: () => false });
      window.chrome = { runtime: {} };
      Object.defineProperty(navigator, 'languages', { get: () => ['he-IL', 'he', 'en-US', 'en'] });
      Object.defineProperty(navigator, 'plugins', { get: () => [1, 2, 3, 4, 5] });
    });

    page.setDefaultNavigationTimeout(45000);

    console.log('Navigating to:', url);
    await page.goto(url, { waitUntil: 'networkidle0', timeout: 35000 });

    let context = await findCalendarContext(page);
    if (!context) throw new Error('Calendar not found in page or iframe');

    console.log('Calendar context:', context === page ? 'page' : 'iframe');

    const checkboxClicked = await context.evaluate(() => {
      const checkbox = document.getElementById('allDep') || document.querySelector('input[type="checkbox"]');
      if (!checkbox) return false;
      if (!checkbox.checked) checkbox.click();
      return true;
    });

    if (checkboxClicked) {
      await page
        .waitForNavigation({ waitUntil: 'networkidle0', timeout: 12000 })
        .catch(() => new Promise((r) => setTimeout(r, 1200)));
      const refreshed = await findCalendarContext(page);
      if (refreshed) context = refreshed;
      console.log('Calendar context after refresh:', context === page ? 'page' : 'iframe');
    }

    const workerName = await context.evaluate(() => {
      const text = document.body.textContent || '';
      const match = text.match(/׳©׳׳•׳\s+([^\n,]+)/) || text.match(/׳¢׳•׳‘׳“[:\s]+([^\n]+)/);
      return match ? match[1].trim() : '';
    });

    const schedule = await context.evaluate((currentWorkerName) => {
      const headerDivs = document.querySelectorAll('.calendar-header > div');
      const weekDays = [];
      for (const div of headerDivs) {
        const text = div.textContent || '';
        const dateMatch = text.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
        if (!dateMatch) continue;
        const dayName = text.replace(/\d{1,2}\/\d{1,2}\/\d{4}/, '').trim();
        const day = String(dateMatch[1]).padStart(2, '0');
        const month = String(dateMatch[2]).padStart(2, '0');
        const year = dateMatch[3];
        weekDays.push({ dayName, isoDate: `${year}-${month}-${day}` });
      }

      if (!weekDays.length) return { productions: [], weekDays: [], workerName: '' };

      const calendarBody = document.querySelector('.calendar-body');
      if (!calendarBody) return { productions: [], weekDays, workerName: '' };

      const dayCells = calendarBody.querySelectorAll('.day-cell, .sat-cell');
      const productions = [];

      dayCells.forEach((cell, dayIndex) => {
        const dayInfo = weekDays[dayIndex];
        if (!dayInfo) return;

        const eventDivs = cell.querySelectorAll('.event, .sat');
        eventDivs.forEach((eventDiv) => {
          const onclickAttr = eventDiv.getAttribute('onclick') || '';
          const idMatch = onclickAttr.match(/openmd2\((\d+)\)/);
          const herzliyaId = idMatch ? parseInt(idMatch[1], 10) : 0;
          if (!herzliyaId) return;

          const isCurrentUserShift = eventDiv.classList.contains('sat');
          const nameFont = eventDiv.querySelector('font[color="red"], font[color="RED"]');
          const rawProductionName = nameFont ? (nameFont.textContent || '').trim() : '';
          if (!rawProductionName) return;

          const innerHTML = eventDiv.innerHTML || '';
          const parts = innerHTML.split(/<br\s*\/?>/i);
          const crew = [];
          let startTime = '';
          let endTime = '';

          for (let i = 1; i < parts.length; i++) {
            const tempDiv = document.createElement('div');
            tempDiv.innerHTML = parts[i];
            const text = (tempDiv.textContent || '').trim();
            if (!text) continue;

            const m = text.match(/^(.+?)\s*-\s*(.+?)\s+(\d{1,2}:\d{2})\s*-?\s*(\d{1,2}:\d{2})/);
            if (m) {
              const s = m[3];
              const e = m[4];
              if (!startTime) {
                startTime = s;
                endTime = e;
              }
              crew.push({
                name: m[1].trim(),
                role: m[2].trim(),
                roleDetail: '',
                phone: null,
                startTime: s,
                endTime: e,
              });
              continue;
            }

            const m2 = text.match(/^(.+?)\s*-\s*(.+)$/);
            if (m2) {
              crew.push({
                name: m2[1].trim(),
                role: m2[2].trim(),
                roleDetail: '',
                phone: null,
                startTime: '',
                endTime: '',
              });
            }
          }

          const studioMatch = rawProductionName.match(/(?:׳׳•׳׳₪׳|׳¡׳˜׳•׳“׳™׳•|studio|st\.?)\s*(\d+\w?)/i);
          const studio = studioMatch ? studioMatch[0].trim() : '';
          const cleanName = studio ? rawProductionName.replace(studioMatch[0], '').replace(/\s{2,}/g, ' ').trim() : rawProductionName;

          productions.push({
            herzliyaId,
            name: cleanName || rawProductionName,
            studio,
            date: dayInfo.isoDate,
            day: dayInfo.dayName,
            startTime,
            endTime,
            crew,
            isCurrentUserShift,
            status: 'scheduled',
          });
        });
      });

      return { productions, weekDays, workerName: currentWorkerName || '' };
    }, workerName);

    schedule.weekStart = schedule.weekDays[0]?.isoDate || '';
    schedule.weekEnd = schedule.weekDays[schedule.weekDays.length - 1]?.isoDate || '';
    schedule.workerName = workerName || schedule.workerName;
    schedule.fetchedAt = new Date().toISOString();

    console.log(`Fetching details for ${schedule.productions.length} productions...`);

    let crewParsed = 0;
    let phonesFound = 0;
    let dedupRemoved = 0;
    let missingPhones = 0;

    for (let i = 0; i < schedule.productions.length; i++) {
      const prod = schedule.productions[i];
      if (!prod.herzliyaId) continue;
      console.log(
        `[${i + 1}/${schedule.productions.length}] parsing production`,
        prod.herzliyaId,
        prod.date,
        prod.name,
      );

      const detailed = await context.evaluate(async (hId, expectedProductionName) => {
        const cleanText = (value) => String(value || '').replace(/\s+/g, ' ').trim();
        const extractPhone = (text) => {
          const matches = text.match(/(?:\+?972[-\s]?)?(?:0)?(?:[2-9]\d|5\d)\d{6,7}/g);
          if (!matches || !matches.length) return null;
          return matches[0];
        };
        const extractTimeRange = (text) => {
          const m = text.match(/(\d{1,2}:\d{2})\s*[-ג€“ג€”]\s*(\d{1,2}:\d{2})/);
          if (!m) return { startTime: '', endTime: '' };
          return { startTime: m[1], endTime: m[2] };
        };
        const normalizeLookup = (value) =>
          cleanText(value)
            .toLowerCase()
            .replace(/[^\u05d0-\u05eaa-z0-9\s]/g, ' ')
            .replace(/\s+/g, ' ')
            .trim();
        const closeExistingPopup = () => {
          const closeBtn =
            document.querySelector('.close') ||
            document.querySelector('.modal-close') ||
            document.querySelector('[onclick*="close"]') ||
            document.querySelector('button[class*="close"]');
          if (closeBtn) closeBtn.click();
          document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
        };
        const tableFingerprint = (table) => {
          if (!table) return '';
          const rows = Array.from(table.querySelectorAll('tr'))
            .slice(0, 6)
            .map((row) => cleanText(row.textContent || ''))
            .join('||');
          return rows;
        };

        return new Promise((resolve) => {
          if (typeof openmd2 !== 'function') {
            resolve({ crew: [], studio: '' });
            return;
          }

          const preTables = Array.from(document.querySelectorAll('table')).filter((table) => {
            const rect = table.getBoundingClientRect();
            return rect.width > 0 && rect.height > 0;
          });
          const preFingerprint = preTables.length ? tableFingerprint(preTables[0]) : '';

          closeExistingPopup();
          openmd2(hId);

          const deadline = Date.now() + 7000;
          const timer = setInterval(() => {
            try {
              const tables = Array.from(document.querySelectorAll('table'));
              const visibleTables = tables.filter((table) => {
                const rect = table.getBoundingClientRect();
                return rect.width > 0 && rect.height > 0;
              });

              const keywords = ['׳×׳₪׳§׳™׳“', '׳©׳', '׳ ׳™׳™׳“', '׳˜׳׳₪׳•׳', '׳₪׳¨׳˜׳™׳', '׳©׳¢׳•׳×'];
              const expectedKey = normalizeLookup(expectedProductionName || '');

              const scored = visibleTables
                .map((table) => {
                  const rowsCount = table.querySelectorAll('tr').length;
                  if (rowsCount < 2) return null;

                  const headerCells = Array.from(table.querySelectorAll('tr:first-child th, tr:first-child td')).map((cell) => cleanText(cell.textContent || ''));
                  const headerText = cleanText(headerCells.join(' | '));
                  const headerHits = keywords.reduce((sum, key) => (headerText.includes(key) ? sum + 1 : sum), 0);
                  if (headerHits < 2) return null;

                  const fullText = normalizeLookup(table.textContent || '');
                  const phonesCount = (table.textContent || '').match(/(?:\+?972[-\s]?)?(?:0)?(?:[2-9]\d|5\d)\d{6,7}/g)?.length || 0;
                  let score = headerHits * 10 + Math.min(rowsCount, 25) + Math.min(phonesCount, 30);
                  if (expectedKey && fullText.includes(expectedKey)) score += 100;

                  return { table, score };
                })
                .filter(Boolean)
                .sort((a, b) => b.score - a.score);

              if (!scored.length && Date.now() < deadline) {
                return;
              }

              const table = scored.length ? scored[0].table : null;
              if (!table) {
                if (Date.now() < deadline) return;
                clearInterval(timer);
                resolve({ crew: [], studio: '' });
                return;
              }

              // Wait until table content differs from what was visible before opening this popup.
              const currentFingerprint = tableFingerprint(table);
              if (preFingerprint && currentFingerprint === preFingerprint && Date.now() < deadline) {
                return;
              }

              clearInterval(timer);              const parseCrewTable = (candidateTable) => {
                const rows = Array.from(candidateTable.querySelectorAll('tr'));
                if (rows.length < 2) return [];

                let headerRowIndex = -1;
                let headerCells = [];

                for (let h = 0; h < Math.min(rows.length, 4); h++) {
                  const cells = Array.from(rows[h].querySelectorAll('th, td')).map((cell) => cleanText(cell.textContent || ''));
                  if (!cells.length) continue;
                  const headerText = cells.join(' ');
                  const hits = [
                    /\u05ea\u05e4\u05e7\u05d9\u05d3/u,
                    /\u05e9\u05dd/u,
                    /\u05e0\u05d9\u05d9\u05d3|\u05d8\u05dc\u05e4\u05d5\u05df/u,
                    /\u05e9\u05e2\u05d5\u05ea/u,
                  ].reduce((sum, re) => (re.test(headerText) ? sum + 1 : sum), 0);

                  if (hits >= 2) {
                    headerRowIndex = h;
                    headerCells = cells;
                    break;
                  }
                }

                if (headerRowIndex < 0) return [];

                const findIndex = (pred) => headerCells.findIndex((h) => pred(h));
                const timeIdx = findIndex((h) => /\u05e9\u05e2\u05d5\u05ea/u.test(h));
                const roleIdx = findIndex((h) => /\u05ea\u05e4\u05e7\u05d9\u05d3/u.test(h));
                const nameIdx = findIndex((h) => /\u05e9\u05dd/u.test(h));
                const detailsIdx = findIndex((h) => /\u05e4\u05e8\u05d8\u05d9\u05dd/u.test(h));
                const phoneIdx = findIndex((h) => /\u05e0\u05d9\u05d9\u05d3|\u05d8\u05dc\u05e4\u05d5\u05df/u.test(h));

                if (nameIdx < 0) return [];

                const parsed = [];
                for (let r = headerRowIndex + 1; r < rows.length; r++) {
                  const cells = Array.from(rows[r].querySelectorAll('td')).map((td) => cleanText(td.textContent || ''));
                  if (!cells.length) continue;

                  const joined = cleanText(cells.join(' | '));
                  const name = cleanText((cells[nameIdx] || '').replace(/^[:\\-]+|[:\\-]+$/g, ''));
                  if (!name || name.length < 2) continue;

                  const role = cleanText(roleIdx >= 0 ? cells[roleIdx] || '' : '');
                  const roleDetail = cleanText(detailsIdx >= 0 ? cells[detailsIdx] || '' : '');
                  const phoneRaw = phoneIdx >= 0 ? cells[phoneIdx] || '' : joined;
                  const phone = extractPhone(phoneRaw) || extractPhone(joined);

                  const timeSource = timeIdx >= 0 ? cells[timeIdx] || '' : joined;
                  const { startTime, endTime } = extractTimeRange(timeSource);

                  parsed.push({ name, role, roleDetail, phone, startTime, endTime });
                }

                return parsed;
              };

              let bestCrew = [];
              for (const candidate of scored) {
                const parsed = parseCrewTable(candidate.table);
                if (parsed.length > bestCrew.length) {
                  bestCrew = parsed;
                }
              }

              if (bestCrew.length === 0 && Date.now() < deadline) {
                return;
              }

              clearInterval(timer);

              const crew = bestCrew;

              const titleEl =
                document.querySelector('.modal-title') ||
                document.querySelector('.popup-title') ||
                document.querySelector('[class*="title"]') ||
                document.querySelector('font[color="red"]');
              const titleText = cleanText(titleEl?.textContent || '');
              const studioMatch = titleText.match(/(?:׳׳•׳׳₪׳|׳¡׳˜׳•׳“׳™׳•)\s*\d+\w?/i);
              const studio = studioMatch ? studioMatch[0] : '';

              const closeBtn =
                document.querySelector('.close') ||
                document.querySelector('.modal-close') ||
                document.querySelector('[onclick*="close"]') ||
                document.querySelector('button[class*="close"]');
              if (closeBtn) closeBtn.click();
              document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));

              resolve({ crew, studio });
            } catch {
              if (Date.now() >= deadline) {
                clearInterval(timer);
                resolve({ crew: [], studio: '' });
              }
            }
          }, 250);
        });
      }, prod.herzliyaId, prod.name);

      if (detailed && detailed.crew && detailed.crew.length) {
        const withNormalized = detailed.crew.map((member) => ({
          ...member,
          phone: normalizePhone(member.phone),
        }));

        const calendarByName = new Map(
          deduplicateCrew(prod.crew || []).map((member) => [normalizeName(member.name), member]),
        );

        const popupAuthoritative = deduplicateCrew(withNormalized).map((member) => {
          if (member.phone) return member;
          const calendarMember = calendarByName.get(normalizeName(member.name));
          return {
            ...member,
            phone: member.phone || calendarMember?.phone || null,
            startTime: member.startTime || calendarMember?.startTime || '',
            endTime: member.endTime || calendarMember?.endTime || '',
          };
        });

        const before = withNormalized.length;
        const after = popupAuthoritative.length;

        crewParsed += withNormalized.length;
        phonesFound += popupAuthoritative.filter((member) => member.phone).length;
        dedupRemoved += Math.max(0, before - after);
        missingPhones += popupAuthoritative.filter((member) => !member.phone).length;

        schedule.productions[i].crew = popupAuthoritative;
        if (detailed.studio && !prod.studio) {
          schedule.productions[i].studio = detailed.studio;
        }

        console.log(`  Production ${prod.name}: ${withNormalized.length} crew rows parsed`);
      } else {
        console.log(`  Production ${prod.name}: popup parsing returned 0 rows (kept calendar crew fallback)`);
      }

      await new Promise((r) => setTimeout(r, 90));
    }

    console.log('productions opened:', schedule.productions.length);
    console.log('crew parsed:', crewParsed);
    console.log('phones found:', phonesFound);
    console.log('dedup removed:', dedupRemoved);
    console.log('missing phones:', missingPhones);

    return schedule;
  } finally {
    await page.close();
  }
}

async function saveSchedule(schedule, userId, requestedWorkerName) {
  const weekId = getWeekId(schedule.weekStart);

  await cleanupWeek(weekId);

  const batch = db.batch();

  const weekRef = db.doc(`productions/global/weeks/${weekId}`);
  batch.set(weekRef, {
    weekId,
    weekStart: schedule.weekStart,
    weekEnd: schedule.weekEnd,
    lastUpdated: FieldValue.serverTimestamp(),
    contributors: [userId],
  });

  for (const prod of schedule.productions) {
    const prodId = String(prod.herzliyaId);
    if (!prodId || prodId === '0') continue;

    const prodRef = db.doc(`productions/global/weeks/${weekId}/productions/${prodId}`);
    const cleanCrew = sanitizeCrewForFirestore(prod.crew);

    batch.set(prodRef, {
      name: prod.name,
      studio: prod.studio,
      date: prod.date,
      day: prod.day || getHebrewDay(prod.date),
      startTime: prod.startTime,
      endTime: prod.endTime,
      status: prod.status,
      herzliyaId: prod.herzliyaId,
      isCurrentUserShift: !!prod.isCurrentUserShift,
      lastUpdatedBy: userId,
      lastUpdatedAt: new Date().toISOString(),
      crew: cleanCrew,
    });
  }

  const myProductionIds = schedule.productions
    .filter((p) => p.isCurrentUserShift)
    .map((p) => p.herzliyaId);

  console.log('Saving userSchedule for userId:', userId);
  console.log('My productions:', myProductionIds.length);

  const userScheduleRef = db.doc(`users/${userId}/schedules/${weekId}`);
  batch.set(userScheduleRef, {
    workerName: schedule.workerName || requestedWorkerName,
    weekStart: schedule.weekStart,
    weekEnd: schedule.weekEnd,
    fetchedAt: schedule.fetchedAt,
    productionCount: schedule.productions.length,
  });

  const userSchedulesRef = db.doc(`userSchedules/${userId}/weeks/${weekId}`);
  batch.set(userSchedulesRef, {
    workerName: schedule.workerName || requestedWorkerName,
    weekStart: schedule.weekStart,
    weekEnd: schedule.weekEnd,
    fetchedAt: schedule.fetchedAt,
    productionCount: schedule.productions.length,
    myProductionIds,
  });

  await batch.commit();
  console.log(`Saved ${schedule.productions.length} productions to week ${weekId} (clean)`);
}

async function main() {
  console.log('Checking for pending schedule requests...');

  const requestsSnap = await db
    .collection('scheduleRequests')
    .where('status', '==', 'pending')
    .get();

  if (requestsSnap.empty) {
    console.log('No pending requests');
    return;
  }

  console.log(`Found ${requestsSnap.size} pending requests`);

  const browser = await puppeteer.launch({
    args: [
      ...chromium.args,
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--no-first-run',
      '--disable-extensions',
    ],
    defaultViewport: chromium.defaultViewport,
    executablePath: await chromium.executablePath(),
    headless: true,
  });

  for (const requestDoc of requestsSnap.docs) {
    const request = requestDoc.data();
    console.log(`Processing request for user: ${request.userId}`);

    try {
      await requestDoc.ref.update({ status: 'processing', startedAt: new Date() });

      const schedule = await fetchSchedule(browser, request.url);
      if (!schedule || !schedule.productions.length) {
        throw new Error('No productions found');
      }

      await saveSchedule(schedule, request.userId, request.workerName);

      await requestDoc.ref.update({
        status: 'done',
        completedAt: new Date(),
        productionCount: schedule.productions.length,
      });

      console.log(`Done: saved ${schedule.productions.length} productions for ${request.userId}`);
    } catch (error) {
      console.error(`Error processing ${requestDoc.id}:`, error.message);
      await requestDoc.ref.update({
        status: 'error',
        error: error.message,
        failedAt: new Date(),
      });
    }
  }

  await browser.close();
}

main().catch(console.error);

