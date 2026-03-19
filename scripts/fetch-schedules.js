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

    const isContextLostError = (error) => {
      const message = String(error?.message || error || '');
      return (
        message.includes('Execution context was destroyed') ||
        message.includes('Cannot find context') ||
        message.includes('Target closed')
      );
    };

    const evaluateOnPageWithRetry = async (fn, ...args) => {
      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          return await page.evaluate(fn, ...args);
        } catch (error) {
          if (!isContextLostError(error) || attempt === 2) {
            throw error;
          }
          console.log('Page context lost, retrying page evaluate...');
          await new Promise((r) => setTimeout(r, 600));
        }
      }
      throw new Error('Failed page evaluation');
    };

    console.log('Navigating to:', url);
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 35000 });
    await new Promise((r) => setTimeout(r, 900));

    const blockingError = await evaluateOnPageWithRetry(() => {
      const text = (document.body?.innerText || '').toLowerCase();
      if (text.includes('no more licenses available') || text.includes('magic xpa partitioning message')) {
        return 'Herzliya server has no free license slot right now';
      }
      return '';
    });
    if (blockingError) {
      throw new Error(blockingError);
    }

    let context = await findCalendarContext(page);
    if (!context) throw new Error('Calendar not found in page or iframe');

    console.log('Calendar context:', context === page ? 'page' : 'iframe');

    const evaluateWithContext = async (fn, ...args) => {
      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          return await context.evaluate(fn, ...args);
        } catch (error) {
          if (!isContextLostError(error) || attempt === 2) {
            throw error;
          }
          console.log('Context lost during evaluate, reacquiring...');
          await new Promise((r) => setTimeout(r, 500));
          const refreshed = await findCalendarContext(page);
          if (!refreshed) {
            throw new Error('Calendar context lost and could not be reacquired');
          }
          context = refreshed;
          console.log('Calendar context reacquired:', context === page ? 'page' : 'iframe');
        }
      }
      throw new Error('Failed to evaluate in context');
    };

    const checkboxClicked = await evaluateWithContext(() => {
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

    const workerName = await evaluateWithContext(() => {
      const text = document.body.textContent || '';
      const match = text.match(/׳©׳׳•׳\s+([^\n,]+)/) || text.match(/׳¢׳•׳‘׳“[:\s]+([^\n]+)/);
      return match ? match[1].trim() : '';
    });

    const schedule = await evaluateWithContext((currentWorkerName) => {
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
    let popupSuccessCount = 0;
    let popupFallbackCount = 0;
    let consecutivePopupMiss = 0;

    for (let i = 0; i < schedule.productions.length; i++) {
      const prod = schedule.productions[i];
      if (!prod.herzliyaId) continue;
      console.log(
        `[${i + 1}/${schedule.productions.length}] parsing production`,
        prod.herzliyaId,
        prod.date,
        prod.name,
      );

      const evaluateCrewFromPopup = async () =>
        evaluateWithContext(async (hId, expectedProductionName, expectedCrewNames, expectedStartTime, expectedEndTime) => {
        const cleanText = (value) => String(value || '').replace(/\s+/g, ' ').trim();
        const extractPhone = (text) => {
          const matches = String(text || '').match(/(?:\+?972[-\s]?)?(?:0)?(?:[2-9]\d|5\d)\d{6,7}/g);
          if (!matches || !matches.length) return null;
          return matches[0];
        };
        const extractTimeRange = (text) => {
          const m = String(text || '').match(/(\d{1,2}:\d{2})\s*[-\u2013\u2014]\s*(\d{1,2}:\d{2})/);
          if (!m) return { startTime: '', endTime: '' };
          return { startTime: m[1], endTime: m[2] };
        };
        const normalizeLookup = (value) =>
          cleanText(value)
            .toLowerCase()
            .replace(/[^\u05d0-\u05eaa-z0-9\s]/g, ' ')
            .replace(/\s+/g, ' ')
            .trim();
        const normalizeNameKey = (value) =>
          normalizeLookup(value)
            .replace(/\b(\u05e6\u05dc\u05dd|\u05e6\u05d9\u05dc\u05d5\u05dd|\u05e8\u05d7\u05e3|\u05de\u05e0\u05d4\u05dc|\u05d1\u05de\u05d0\u05d9|\u05ea\u05d0\u05d5\u05e8\u05d4|\u05e7\u05d5\u05dc)\b/g, ' ')
            .replace(/\s+/g, ' ')
            .trim();
        const toMinutes = (t) => {
          if (!t || !/^\d{1,2}:\d{2}$/.test(t)) return null;
          const [h, m] = t.split(':').map(Number);
          return h * 60 + m;
        };

        const closePopup = () => {
          const closeBtn =
            document.querySelector('.close') ||
            document.querySelector('.modal-close') ||
            document.querySelector('[onclick*="close"]') ||
            document.querySelector('button[class*="close"]');
          if (closeBtn) closeBtn.click();
          document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
        };

        const getVisibleTables = () =>
          Array.from(document.querySelectorAll('table')).filter((table) => {
            const rect = table.getBoundingClientRect();
            return rect.width > 30 && rect.height > 30;
          });
        const getActiveModalRoot = () => {
          const titleEl =
            document.querySelector('.modal-title') ||
            document.querySelector('.popup-title') ||
            document.querySelector('font[color="red"]');
          if (!titleEl) return null;
          let node = titleEl;
          let best = null;
          for (let i = 0; i < 6 && node; i++) {
            const parent = node.parentElement;
            if (!parent) break;
            const rect = parent.getBoundingClientRect();
            if (rect.width > 200 && rect.height > 120) {
              best = parent;
            }
            node = parent;
          }
          return best;
        };

        const findHeaderRow = (rows) => {
          for (let i = 0; i < Math.min(rows.length, 6); i++) {
            const cells = Array.from(rows[i].querySelectorAll('th,td')).map((c) => cleanText(c.textContent || ''));
            if (!cells.length) continue;
            const headerText = cells.join(' ');
            const hits = [
              /\u05e9\u05e2\u05d5\u05ea/u,
              /\u05ea\u05e4\u05e7\u05d9\u05d3/u,
              /\u05e9\u05dd/u,
              /\u05e0\u05d9\u05d9\u05d3|\u05d8\u05dc\u05e4\u05d5\u05df/u,
              /\u05e4\u05e8\u05d8\u05d9\u05dd/u,
            ].reduce((sum, re) => (re.test(headerText) ? sum + 1 : sum), 0);
            if (hits >= 2) return { index: i, cells };
          }
          return { index: -1, cells: [] };
        };

        const chooseIndexesByContent = (dataRows, columnCount) => {
          const stats = Array.from({ length: columnCount }, () => ({
            time: 0,
            phone: 0,
            empty: 0,
            unique: new Set(),
          }));

          dataRows.forEach((row) => {
            for (let i = 0; i < columnCount; i++) {
              const txt = cleanText(row[i] || '');
              if (!txt) {
                stats[i].empty++;
                continue;
              }
              stats[i].unique.add(txt);
              if (extractPhone(txt)) stats[i].phone++;
              if (extractTimeRange(txt).startTime) stats[i].time++;
            }
          });

          const colIndexes = Array.from({ length: columnCount }, (_, i) => i);
          const phoneIdx = colIndexes.slice().sort((a, b) => stats[b].phone - stats[a].phone)[0] ?? -1;
          const timeIdx = colIndexes.slice().sort((a, b) => stats[b].time - stats[a].time)[0] ?? -1;

          const nonName = new Set([phoneIdx, timeIdx]);
          let nameIdx = -1;
          let bestNameScore = -1;
          colIndexes.forEach((i) => {
            if (nonName.has(i)) return;
            const uniqueCount = stats[i].unique.size;
            const filled = dataRows.length - stats[i].empty;
            const score = uniqueCount * 2 + filled - stats[i].phone * 3 - stats[i].time * 3;
            if (score > bestNameScore) {
              bestNameScore = score;
              nameIdx = i;
            }
          });

          const roleIdx = colIndexes.find((i) => i !== nameIdx && i !== phoneIdx && i !== timeIdx) ?? -1;
          const detailsIdx =
            colIndexes.find((i) => i !== nameIdx && i !== phoneIdx && i !== timeIdx && i !== roleIdx) ?? -1;

          return { nameIdx, roleIdx, detailsIdx, timeIdx, phoneIdx };
        };

        const parseCrewTable = (table) => {
          const rows = Array.from(table.querySelectorAll('tr'));
          if (rows.length < 2) return [];

          const header = findHeaderRow(rows);
          if (header.index < 0) return [];

          const headerCells = header.cells;
          const findIndex = (pred) => headerCells.findIndex((h) => pred(h));
          let timeIdx = findIndex((h) => /\u05e9\u05e2\u05d5\u05ea/u.test(h));
          let roleIdx = findIndex((h) => /\u05ea\u05e4\u05e7\u05d9\u05d3/u.test(h));
          let nameIdx = findIndex((h) => /\u05e9\u05dd/u.test(h));
          let detailsIdx = findIndex((h) => /\u05e4\u05e8\u05d8\u05d9\u05dd/u.test(h));
          let phoneIdx = findIndex((h) => /\u05e0\u05d9\u05d9\u05d3|\u05d8\u05dc\u05e4\u05d5\u05df/u.test(h));

          const rawRows = rows
            .slice(header.index + 1)
            .map((row) => Array.from(row.querySelectorAll('td')).map((td) => cleanText(td.textContent || '')))
            .filter((cells) => cells.length >= 3);

          if (!rawRows.length) return [];

          const colCount = Math.max(...rawRows.map((r) => r.length));
          if (nameIdx < 0 || nameIdx >= colCount || timeIdx < 0 || phoneIdx < 0) {
            const byContent = chooseIndexesByContent(rawRows, colCount);
            nameIdx = nameIdx >= 0 ? nameIdx : byContent.nameIdx;
            roleIdx = roleIdx >= 0 ? roleIdx : byContent.roleIdx;
            detailsIdx = detailsIdx >= 0 ? detailsIdx : byContent.detailsIdx;
            timeIdx = timeIdx >= 0 ? timeIdx : byContent.timeIdx;
            phoneIdx = phoneIdx >= 0 ? phoneIdx : byContent.phoneIdx;
          }

          if (nameIdx < 0) return [];

          const parsed = [];
          for (const cells of rawRows) {
            const joined = cleanText(cells.join(' | '));
            const name = cleanText((cells[nameIdx] || '').replace(/^[:\-]+|[:\-]+$/g, ''));
            if (!name || name.length < 2) continue;
            if (/\u05e9\u05dd|\u05ea\u05e4\u05e7\u05d9\u05d3|\u05e0\u05d9\u05d9\u05d3/u.test(name)) continue;

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

        const scoreTable = (table) => {
          const text = cleanText(table.textContent || '');
          const rowsCount = table.querySelectorAll('tr').length;
          if (rowsCount < 3) return -1;
          const phones = (text.match(/(?:\+?972[-\s]?)?(?:0)?(?:[2-9]\d|5\d)\d{6,7}/g) || []).length;
          const times = (text.match(/\d{1,2}:\d{2}\s*[-\u2013\u2014]\s*\d{1,2}:\d{2}/g) || []).length;
          const header = findHeaderRow(Array.from(table.querySelectorAll('tr')));
          const headerText = cleanText((header.cells || []).join(' '));
          const headerHits = [
            /\u05e9\u05dd/u,
            /\u05ea\u05e4\u05e7\u05d9\u05d3/u,
            /\u05e0\u05d9\u05d9\u05d3|\u05d8\u05dc\u05e4\u05d5\u05df/u,
            /\u05e9\u05e2\u05d5\u05ea/u,
          ].reduce((sum, re) => (re.test(headerText) ? sum + 1 : sum), 0);
          return rowsCount * 2 + phones * 3 + times * 2 + headerHits * 8;
        };

        if (typeof openmd2 !== 'function') {
          return { crew: [], studio: '', title: '' };
        }

        closePopup();
        openmd2(hId);

        const deadline = Date.now() + 1800;
        let bestCrew = [];
        let bestScore = -1;
        while (Date.now() < deadline) {
          const modalRoot = getActiveModalRoot();
          const modalTables = modalRoot
            ? Array.from(modalRoot.querySelectorAll('table')).filter((table) => {
              const rect = table.getBoundingClientRect();
              return rect.width > 30 && rect.height > 30;
            })
            : [];
          const tables = modalTables.length ? modalTables : getVisibleTables();
          for (const table of tables) {
            const score = scoreTable(table);
            if (score < 6) continue;
            const parsed = parseCrewTable(table);
            if (parsed.length === 0) continue;
            const combined = score + parsed.length * 5;
            if (combined > bestScore) {
              bestScore = combined;
              bestCrew = parsed;
            }
          }
          if (bestCrew.length >= 4) break;
          await new Promise((r) => setTimeout(r, 120));
        }

        const titleEl =
          document.querySelector('.modal-title') ||
          document.querySelector('.popup-title') ||
          document.querySelector('[class*="title"]') ||
          document.querySelector('font[color="red"]');
        const titleText = cleanText(titleEl?.textContent || '');
        const studioMatch = titleText.match(/(?:\u05d0\u05d5\u05dc\u05e4\u05df|studio|st\.?)\s*(\d+\w?)/i);
        const studio = studioMatch ? studioMatch[0] : '';
        const expected = normalizeLookup(expectedProductionName || '');
        const titleNorm = normalizeLookup(titleText || '');
        const expectedTokens = expected.split(' ').filter((token) => token.length > 2);
        const expectedTokenHits = expectedTokens.filter((token) => titleNorm.includes(token)).length;
        const titleMatch =
          expectedTokens.length === 0 ||
          titleNorm.includes(expected) ||
          expected.includes(titleNorm) ||
          expectedTokenHits >= Math.min(2, expectedTokens.length);
        const expectedNameKeys = (expectedCrewNames || [])
          .map((name) => normalizeNameKey(name))
          .filter((name) => name.length >= 2);
        const overlapCount = expectedNameKeys.length
          ? bestCrew.filter((member) => {
            const key = normalizeNameKey(member.name);
            return expectedNameKeys.some((expectedKey) => key.includes(expectedKey) || expectedKey.includes(key));
          }).length
          : 1;
        const expectedStartMin = toMinutes(expectedStartTime);
        const expectedEndMin = toMinutes(expectedEndTime);
        const expectedTimeMatchCount =
          expectedStartMin !== null && expectedEndMin !== null
            ? bestCrew.filter((member) => member.startTime === expectedStartTime && member.endTime === expectedEndTime).length
            : 1;

        closePopup();

        if (!titleMatch || overlapCount === 0 || expectedTimeMatchCount === 0) {
          return { crew: [], studio, title: titleText, rejected: true };
        }

        return { crew: bestCrew, studio, title: titleText, rejected: false };
        }, prod.herzliyaId, prod.name, (prod.crew || []).map((member) => member.name), prod.startTime, prod.endTime);

      const detailed = await evaluateCrewFromPopup();

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
        schedule.productions[i].popupParsed = true;
        if (detailed.studio && !prod.studio) {
          schedule.productions[i].studio = detailed.studio;
        }

        console.log(`  Production ${prod.name}: ${withNormalized.length} crew rows parsed`);
        popupSuccessCount += 1;
        consecutivePopupMiss = 0;
      } else {
        if (detailed?.rejected) {
          console.log(`  Production ${prod.name}: popup rejected by title/time/name validation (kept calendar fallback)`);
        } else {
          console.log(`  Production ${prod.name}: popup parsing returned 0 rows (kept calendar crew fallback)`);
        }
        schedule.productions[i].popupParsed = false;
        popupFallbackCount += 1;
        consecutivePopupMiss += 1;
        if (popupSuccessCount === 0 && i >= 5 && consecutivePopupMiss >= 6) {
          throw new Error('Popup extraction unavailable (likely Herzliya license/session limit) - stopped early');
        }
      }

      await new Promise((r) => setTimeout(r, 40));
    }

    console.log('productions opened:', schedule.productions.length);
    console.log('crew parsed:', crewParsed);
    console.log('phones found:', phonesFound);
    console.log('dedup removed:', dedupRemoved);
    console.log('missing phones:', missingPhones);
    console.log('popup success:', popupSuccessCount);
    console.log('popup fallback:', popupFallbackCount);
    schedule.parseStats = {
      popupSuccessCount,
      popupFallbackCount,
      popupSuccessRate: schedule.productions.length
        ? popupSuccessCount / schedule.productions.length
        : 0,
    };

    return schedule;
  } finally {
    await page.close();
  }
}

async function saveSchedule(schedule, userId, requestedWorkerName) {
  const weekId = getWeekId(schedule.weekStart);

  const popupSuccessRate = schedule.parseStats?.popupSuccessRate ?? 1;
  const cleanupAllowed = popupSuccessRate >= 0.5;
  if (cleanupAllowed) {
    await cleanupWeek(weekId);
  } else {
    console.log(
      `Skipping destructive cleanup for week ${weekId} (popup success rate ${(popupSuccessRate * 100).toFixed(1)}%)`,
    );
  }

  const batch = db.batch();
  const existingMap = new Map();
  if (!cleanupAllowed) {
    const existingSnap = await db.collection(`productions/global/weeks/${weekId}/productions`).get();
    existingSnap.docs.forEach((docSnap) => {
      existingMap.set(docSnap.id, docSnap.data());
    });
  }

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
    let cleanCrew = sanitizeCrewForFirestore(prod.crew);

    if (!cleanupAllowed && !prod.popupParsed) {
      const existing = existingMap.get(prodId);
      const existingCrew = sanitizeCrewForFirestore(existing?.crew || []);
      if (existingCrew.length > cleanCrew.length) {
        cleanCrew = existingCrew;
      }
    }

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

