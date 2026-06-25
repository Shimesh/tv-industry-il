const { initializeApp, cert, getApps } = require('firebase-admin/app');
const { getFirestore, FieldValue } = require('firebase-admin/firestore');
const puppeteer = require('puppeteer-core');
const chromiumModule = require('@sparticuz/chromium');
const chromium = chromiumModule.default || chromiumModule;
const fs = require('fs');
const os = require('os');
const path = require('path');

if (!getApps().length) {
  const hasExplicitCredentials =
    process.env.FIREBASE_PROJECT_ID
    && process.env.FIREBASE_CLIENT_EMAIL
    && process.env.FIREBASE_PRIVATE_KEY;
  initializeApp(hasExplicitCredentials ? {
    credential: cert({
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
    }),
  } : undefined);
}

const db = getFirestore();
const USER_SCHEDULES_ROOT = 'userSchedules';
const getUserProductionsRoot = (uid) => `productions/${uid}/weeks`;
const AUTO_SYNC_SAVED_CALENDARS = process.env.SYNC_SAVED_CALENDARS === '1';
const WINDOWS_BROWSER_PATHS = [
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
];

function getCurrentWeekStartIsrael() {
  const israelDate = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Jerusalem',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
  const date = new Date(`${israelDate}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() - date.getUTCDay());
  return date.toISOString().split('T')[0];
}

function getPreviousWeekStart(weekStart) {
  const date = new Date(`${weekStart}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() - 7);
  return date.toISOString().split('T')[0];
}

function getNextWeekStart(weekStart) {
  const date = new Date(`${weekStart}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + 7);
  return date.toISOString().split('T')[0];
}

function getWeekStartFromIsoDate(dateStr) {
  const [year, month, day] = String(dateStr).split('-').map(Number);
  const date = new Date(Date.UTC(year, (month || 1) - 1, day || 1, 12));
  date.setUTCDate(date.getUTCDate() - date.getUTCDay());
  return date.toISOString().split('T')[0];
}

function getWeekStartFromHerzliyaUrl(url) {
  const match = String(url || '').match(/,(\d{2})(\d{2})(\d{4})(?:\b|$)/);
  if (!match) return '';
  const [, dd, mm, yyyy] = match;
  return getWeekStartFromIsoDate(`${yyyy}-${mm}-${dd}`);
}

// Replace the embedded date in a Herzliya URL (format: ?A=UUID,DDMMYYYY)
// with a date inside the given ISO week so we always fetch the current week.
function urlForWeek(url, weekStart) {
  const d = new Date(`${weekStart}T12:00:00Z`);
  const dd = String(d.getUTCDate()).padStart(2, '0');
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
  const yyyy = String(d.getUTCFullYear());
  return url.replace(/,\d{8}(\b|$)/, `,${dd}${mm}${yyyy}`);
}

async function getBrowserExecutablePath() {
  if (process.env.PUPPETEER_EXECUTABLE_PATH) return process.env.PUPPETEER_EXECUTABLE_PATH;
  if (process.platform === 'win32') {
    const localBrowser = WINDOWS_BROWSER_PATHS.find((browserPath) => fs.existsSync(browserPath));
    if (localBrowser) return localBrowser;
  }
  return chromium.executablePath();
}

function normalizeName(name) {
  if (!name) return '';

  let cleaned = String(name);

  // Strip role prefix with colon FIRST (before cleaning punctuation)
  // "צילום: ירון אורבך" → "ירון אורבך"
  cleaned = cleaned.replace(/^[\u05d0-\u05ea]+:\s*/u, '');
  // Strip role suffix with dash FIRST
  // "ירון אורבך - צילום" → "ירון אורבך"
  cleaned = cleaned.replace(/\s*[-\u2013\u2014]\s*[\u05d0-\u05ea\s]+$/u, '');

  // Now clean general punctuation
  cleaned = cleaned
    .replace(/[()\[\]{}]/g, ' ')
    .replace(/[,:;|]/g, ' ')
    .replace(/["\u201C\u201D\u2013\u2014-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  const rolePhrases = [
    'צלם רחף', 'סטדי קאם', 'סטדי-קאם', 'ע. במאי', 'ע. במאית', 'ע. צילום',
    'צילום', 'צלם', 'צלמת', 'רחף', 'רחפן', 'רחפנית', 'סטדיקאם', 'סאונד',
    'במאי', 'במאית', 'בימוי', 'מפיק', 'מפיקת', 'עורך', 'עורכת', 'קול',
    'מקליט', 'מקליטה', 'תאורה', 'תאורן', 'איפור', 'סטיילינג', 'ארט', 'תפאורה',
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

const HERZLIYA_ROLE_SUFFIXES = [
  'ניהול הפקה', 'ניהול במה', 'עריכת שיא', 'ע. בימוי', 'ע. מפיק', 'ע. מפיקה', 'ע. צילום',
  'ע. עריכה', 'ע. תאורה', 'ע. סאונד', 'סטדי קאם', 'סטדי-קאם', 'סטדיקאם',
  'צלם רחף', 'רחף', 'רחפן', 'רחפנית',
  'צילום', 'עריכה', 'סאונד', 'תאורה', 'בימוי', 'עיצוב', 'ניהול',
  'שידור', 'מפיקה', 'מפיק', 'ספרות', 'תסריט', 'גרפיקה', 'תפאורה',
  'איפור', 'לוגיסטיקה', 'הנחיה', 'הפקה', 'עורך', 'עורכת',
  'מנהל', 'מנהלת', 'הדלקות', 'לייטינג', 'חשמל', 'קאמרה', 'קול', 'CCU',
];

function splitHerzliyaRole(fullName) {
  // Strip Herzliya "+הקמה..." additional-duty notation (space + plus at end, e.g. "+הקמה פינס")
  const t = (fullName || '').trim().replace(/ \+\S.*$/, '').trim();
  for (const role of HERZLIYA_ROLE_SUFFIXES) {
    if (t === role) return { name: t, userRole: role };
    if (t.endsWith(' ' + role)) {
      const name = t.slice(0, t.length - role.length - 1).trim();
      if (name) return { name, userRole: role };
    }
  }
  return { name: t, userRole: '' };
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

function sanitizeForFirestore(value) {
  if (Array.isArray(value)) {
    return value
      .filter((item) => item !== undefined)
      .map((item) => sanitizeForFirestore(item));
  }
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([, nested]) => nested !== undefined)
        .map(([key, nested]) => [key, sanitizeForFirestore(nested)]),
    );
  }
  return value;
}

function getHebrewDay(dateStr) {
  const days = ['יום א׳', 'יום ב׳', 'יום ג׳', 'יום ד׳', 'יום ה׳', 'יום ו׳', 'שבת'];
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

function normalizeProductionLookup(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^\u05d0-\u05eaa-z0-9\s]/g, ' ')
    .replace(/\b(\u05e6\u05d9\u05dc\u05d5\u05dd|\u05e6\u05dc\u05dd|\u05e6\u05dc\u05de\u05ea|\u05e6\u05dc\u05dd\s+\u05e8\u05d7\u05e3|\u05e8\u05d7\u05e3)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// Browser-side function: opens openmd2 popup and captures crew table snapshot.
// Must be a module-level const so it can be reused for both personal and department page contexts.
const POPUP_EVAL_FN = async (hId) => {
  const cleanText = (value) => String(value || '').replace(/\s+/g, ' ').trim();
  const isVisible = (el) => {
    if (!el) return false;
    const rect = el.getBoundingClientRect();
    if (rect.width < 30 || rect.height < 30) return false;
    const style = window.getComputedStyle(el);
    return style.display !== 'none' && style.visibility !== 'hidden' && style.opacity !== '0';
  };
  const closePopup = () => {
    const closeBtn = document.querySelector('.close') || document.querySelector('.modal-close') || document.querySelector('[onclick*="close"]') || document.querySelector('button[class*="close"]');
    if (closeBtn) closeBtn.click();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
  };
  const getVisibleTables = () => Array.from(document.querySelectorAll('table')).filter((table) => {
    const rect = table.getBoundingClientRect();
    return rect.width > 30 && rect.height > 30;
  });
  const getModalTitle = (root) => {
    if (!root) return '';
    const selectors = ['.modal-title', '.popup-title', '[class*="title"]', 'font[color="red"]'];
    for (const selector of selectors) {
      const candidates = Array.from(root.querySelectorAll(selector)).filter(isVisible);
      const best = candidates.map((el) => cleanText(el.textContent || '')).filter(Boolean).sort((a, b) => b.length - a.length)[0];
      if (best) return best;
    }
    return '';
  };
  const getModalFingerprint = (root) => { if (!root) return ''; return cleanText(root.textContent || '').slice(0, 400); };
  const getActiveModalRoot = () => {
    const titleCandidates = Array.from(document.querySelectorAll('.modal-title, .popup-title, [class*="title"], font[color="red"]')).filter(isVisible);
    let best = null; let bestScore = -1;
    for (const titleEl of titleCandidates) {
      let node = titleEl;
      for (let depth = 0; depth < 8 && node; depth++) {
        const parent = node.parentElement;
        if (!parent) break;
        node = parent;
        if (!isVisible(node)) continue;
        const rect = node.getBoundingClientRect();
        if (rect.width < 220 || rect.height < 120) continue;
        const tableCount = node.querySelectorAll('table').length;
        if (!tableCount) continue;
        const titleText = getModalTitle(node);
        const closeExists = !!node.querySelector('.close, .modal-close, [onclick*="close"], button[class*="close"]');
        const zIndex = Number(window.getComputedStyle(node).zIndex || 0) || 0;
        const score = tableCount * 4000 + rect.width * rect.height + (titleText ? 3000 : 0) + (closeExists ? 1500 : 0) + zIndex;
        if (score > bestScore) { best = node; bestScore = score; }
      }
    }
    return best;
  };
  const scoreTable = (table) => {
    const text = cleanText(table.textContent || '');
    const rowsCount = table.querySelectorAll('tr').length;
    if (rowsCount < 3) return -1;
    const headerText = cleanText(table.querySelector('tr')?.textContent || '');
    const headerHits = [/שם/u, /תפקיד/u, /נייד|טלפון/u, /שעות/u].reduce((sum, re) => (re.test(headerText) ? sum + 1 : sum), 0);
    const phones = (text.match(/(?:\+?972[-\s.]?)?0?(?:[2-9]\d|5\d)[-\s.]?\d{3}[-\s.]?\d{4}/g) || []).length;
    const times = (text.match(/\d{1,2}:\d{2}\s*[-–—]\s*\d{1,2}:\d{2}/g) || []).length;
    return rowsCount * 2 + phones * 3 + times * 2 + headerHits * 8;
  };
  const snapshotTable = (table) => ({
    score: scoreTable(table),
    rows: Array.from(table.querySelectorAll('tr')).map((row) => Array.from(row.querySelectorAll('th,td')).map((cell) => cleanText(cell.textContent || ''))),
  });
  if (typeof openmd2 !== 'function') {
    return { tables: [], studio: '', title: '', invalid: true, reason: 'openmd2_missing' };
  }
  const previousRoot = getActiveModalRoot();
  const previousFingerprint = getModalFingerprint(previousRoot);
  closePopup();
  await new Promise((r) => setTimeout(r, 120));
  openmd2(hId);
  const deadline = Date.now() + 3000;
  const snapshotBySignature = new Map();
  let activeModalRoot = null; let bestCombined = -1; let lastImprovementAt = Date.now();
  while (Date.now() < deadline) {
    const modalRoot = getActiveModalRoot();
    if (modalRoot) {
      const fingerprint = getModalFingerprint(modalRoot);
      if (!previousFingerprint || fingerprint !== previousFingerprint) { activeModalRoot = modalRoot; }
    }
    const rootForParsing = activeModalRoot || modalRoot;
    const modalTables = rootForParsing ? Array.from(rootForParsing.querySelectorAll('table')).filter((table) => { const rect = table.getBoundingClientRect(); return rect.width > 30 && rect.height > 30; }) : [];
    const tables = modalTables.length ? modalTables : getVisibleTables();
    for (const table of tables) {
      const score = scoreTable(table);
      if (score < 6) continue;
      const snapshot = snapshotTable(table);
      const rowsCount = snapshot.rows.filter((row) => row.length >= 3).length;
      if (rowsCount === 0) continue;
      const combined = score + rowsCount * 5;
      const signature = JSON.stringify(snapshot.rows);
      const existing = snapshotBySignature.get(signature);
      if (!existing || combined > existing.combined) {
        snapshotBySignature.set(signature, { ...snapshot, combined });
        if (combined > bestCombined) { bestCombined = combined; lastImprovementAt = Date.now(); }
      }
    }
    const strongCount = Array.from(snapshotBySignature.values()).filter((entry) => entry.combined >= 20).length;
    if (strongCount >= 1 && Date.now() - lastImprovementAt >= 700) break;
    await new Promise((r) => setTimeout(r, 120));
  }
  const collectedSnapshots = Array.from(snapshotBySignature.values()).sort((a, b) => b.combined - a.combined).map(({ combined, ...snapshot }) => snapshot);
  const titleText = getModalTitle(activeModalRoot || getActiveModalRoot());
  const studioMatchTitle = titleText.match(/(?:אולפן|studio|st\.?)\s*(\d+\w?)/i);
  let studio = studioMatchTitle ? studioMatchTitle[0] : '';
  if (!studio) {
    const allPageRows = Array.from(document.querySelectorAll('table tr'));
    for (const row of allPageRows) {
      const cells = Array.from(row.querySelectorAll('td,th')).map((c) => cleanText(c.textContent || '')).filter((c) => c.length > 0);
      const exactStudio = cells.find((c) => /^(?:אולפן|סטודיו|studio)\s*\d+\w?$/i.test(c));
      if (exactStudio) { studio = exactStudio; break; }
      const dateIdx = cells.findIndex((c) => /\d{1,2}\/\d{1,2}\/\d{4}/.test(c));
      if (dateIdx >= 2 && cells[dateIdx - 1]) {
        const candidate = cells[dateIdx - 1];
        if (!/^[א-ת]{2,5}$/.test(candidate)) { studio = candidate; break; }
      }
    }
  }
  closePopup();
  return { tables: collectedSnapshots, studio, title: titleText, invalid: !collectedSnapshots.length, reason: collectedSnapshots.length ? '' : 'no_tables' };
};

async function fetchSchedule(browser, url) {
  const page = await browser.newPage();
  const snapshotDir = path.join(os.tmpdir(), 'tv-industry-il-schedule-snapshots');
  fs.mkdirSync(snapshotDir, { recursive: true });
  const snapshotPath = path.join(snapshotDir, `schedule-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.json`);
  const popupSnapshots = [];

  const writePopupSnapshot = () => {
    try {
      fs.writeFileSync(
        snapshotPath,
        JSON.stringify(
          {
            url,
            writtenAt: new Date().toISOString(),
            productions: popupSnapshots,
          },
          null,
          2,
        ),
        'utf8',
      );
    } catch (error) {
      console.warn('Failed writing popup snapshot:', error.message);
    }
  };

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

    // Magic XPA renders the calendar container first, then populates cells with JS.
    // Wait up to 12 seconds for actual day-cells or openmd2 onclick handlers to appear.
    {
      const cellDeadline = Date.now() + 12000;
      let cellsFound = false;
      while (Date.now() < cellDeadline) {
        try {
          const hasCells = await context.evaluate(() =>
            document.querySelectorAll('.day-cell, .sat-cell, [onclick*="openmd2"]').length > 0
          );
          if (hasCells) { cellsFound = true; break; }
        } catch { /* context lost, will be caught on next evaluate */ }
        await new Promise((r) => setTimeout(r, 400));
      }
      console.log('Calendar cells populated:', cellsFound);
    }

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

    // Keep ShowEmp3: ShowEmp6 no longer exposes the production IDs needed
    // to load crew details through openmd2.
    console.log('Keeping personal calendar view for stable production IDs');

    const workerName = await evaluateWithContext(() => {
      const text = document.body.textContent || '';
      const match = text.match(/שלום\s+([^\n,]+)/) || text.match(/עובד[:\s]+([^\n]+)/);
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

          const isCurrentUserShift = eventDiv.classList.contains('sat');
          const nameFont = eventDiv.querySelector('font[color="red"], font[color="RED"]');
          const eventText = (eventDiv.textContent || '').replace(/\s+/g, ' ').trim();
          const eventTimeMatch = eventText.match(
            /(\d{1,2}:\d{2})\s*[-\u2013\u2014]\s*(\d{1,2}:\d{2})/,
          );
          const rawProductionName = nameFont
            ? (nameFont.textContent || '').trim()
            : eventText
                .replace(/(\d{1,2}:\d{2})\s*[-\u2013\u2014]\s*(\d{1,2}:\d{2})/, ' ')
                .replace(/\s+CCU\s*$/i, '')
                .replace(/\s+/g, ' ')
                .trim();
          if (!rawProductionName) return;

          const innerHTML = eventDiv.innerHTML || '';
          const parts = innerHTML.split(/<br\s*\/?>/i);
          const crew = [];
          let startTime = eventTimeMatch ? eventTimeMatch[1] : '';
          let endTime = eventTimeMatch ? eventTimeMatch[2] : '';

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

          const studioMatch = rawProductionName.match(/(?:\u05d0\u05d5\u05dc\u05e4\u05df|\u05e1\u05d8\u05d5\u05d3\u05d9\u05d5|studio|st\.?)\s*(\d+\w?)/i);
          const studio = studioMatch ? studioMatch[0].trim() : '';

          productions.push({
            herzliyaId,
            name: rawProductionName,
            userRole: '',
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

    // Filter out non-production Herzliya entries (vacations, sick leave, etc.)
    const NON_PRODUCTION_PREFIXES = ['חופש', 'מחלה', 'יום עיון', 'השתלמות', 'אבל', 'מנוחה'];
    schedule.productions = schedule.productions.filter((prod) =>
      !NON_PRODUCTION_PREFIXES.some((prefix) => prod.name.startsWith(prefix)),
    );

    // Apply role/studio stripping in Node.js (splitHerzliyaRole is not available in browser context)
    for (const prod of schedule.productions) {
      const { name, userRole } = splitHerzliyaRole(prod.name);
      const cleanName = prod.studio ? (name || prod.name).replace(prod.studio, '').replace(/\s{2,}/g, ' ').trim() : (name || prod.name);
      prod.name = cleanName || name || prod.name;
      if (userRole) prod.userRole = userRole;
    }

    let departmentEnrichedCount = 0;
    let departmentPage = null;
    try {
      const departmentUrl = new URL(page.url());
      departmentUrl.searchParams.set('prgname', 'ShowEmp6');
      const departmentArguments = departmentUrl.searchParams.get('arguments') || '';
      departmentUrl.searchParams.set(
        'arguments',
        departmentArguments.endsWith(',-Atrue') ? departmentArguments : departmentArguments + ',-Atrue',
      );

      departmentPage = await browser.newPage();
      await departmentPage.setUserAgent(
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
      );
      await departmentPage.setExtraHTTPHeaders({ 'Accept-Language': 'he-IL,he;q=0.9,en;q=0.8' });
      departmentPage.setDefaultNavigationTimeout(45000);
      console.log('Loading hidden department calendar for complete crew lists...');
      await departmentPage.goto(departmentUrl.toString(), { waitUntil: 'domcontentloaded', timeout: 35000 });

      const departmentDeadline = Date.now() + 15000;
      let departmentContext = null;
      let departmentEventCount = 0;
      while (Date.now() < departmentDeadline) {
        const candidates = [departmentPage, ...departmentPage.frames()];
        for (const candidate of candidates) {
          const count = await candidate.evaluate(() =>
            document.querySelectorAll('.event, .sat').length,
          ).catch(() => 0);
          if (count > departmentEventCount) {
            departmentEventCount = count;
            departmentContext = candidate;
          }
        }
        if (departmentEventCount > 0) break;
        await new Promise((resolve) => setTimeout(resolve, 500));
      }
      if (!departmentContext || !departmentEventCount) {
        throw new Error('Department calendar events not found');
      }
      console.log('Department calendar events found:', departmentEventCount);

      const departmentEvents = await departmentContext.evaluate(() => {
        const weekDays = Array.from(document.querySelectorAll('.calendar-header > div'))
          .map((div) => {
            const text = div.textContent || '';
            const match = text.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
            if (!match) return null;
            return {
              dayName: text.replace(/\d{1,2}\/\d{1,2}\/\d{4}/, '').trim(),
              isoDate: match[3] + '-' + String(match[2]).padStart(2, '0') + '-' + String(match[1]).padStart(2, '0'),
            };
          })
          .filter(Boolean);
        const calendarBody = document.querySelector('.calendar-body') || document;
        const events = [];
        Array.from(calendarBody.querySelectorAll('.day-cell, .sat-cell')).forEach((cell, dayIndex) => {
          const day = weekDays[dayIndex];
          if (!day) return;
          Array.from(cell.querySelectorAll('.event, .sat')).forEach((eventDiv) => {
            const onclickRaw = eventDiv.getAttribute('onclick') || '';
            const idMatchRaw = onclickRaw.match(/openmd2\((\d+)\)/);
            const herzliyaId = idMatchRaw ? parseInt(idMatchRaw[1], 10) : 0;
            const nameFont = eventDiv.querySelector('font[color="red"], font[color="RED"]');
            const name = (nameFont?.textContent || '').replace(/\s+/g, ' ').trim();
            if (!name) return;
            const crew = [];
            const parts = (eventDiv.innerHTML || '').split(/<br\s*\/?>/i);
            for (let index = 1; index < parts.length; index++) {
              const holder = document.createElement('div');
              holder.innerHTML = parts[index];
              const text = (holder.textContent || '').replace(/\s+/g, ' ').trim();
              const match = text.match(/^(.+?)\s*-\s*(.+?)\s+(\d{1,2}:\d{2})\s*-?\s*(\d{1,2}:\d{2})/);
              if (!match) continue;
              crew.push({
                name: match[1].trim(),
                role: match[2].trim(),
                roleDetail: '',
                phone: null,
                startTime: match[3],
                endTime: match[4],
              });
            }
            if (!crew.length && !herzliyaId) return;
            const evText = (eventDiv.textContent || '').replace(/\s+/g, ' ').trim();
            const evTimeMatch = evText.match(/(\d{1,2}:\d{2})\s*[-–—]\s*(\d{1,2}:\d{2})/);
            events.push({
              herzliyaId,
              name,
              date: day.isoDate,
              day: day.dayName,
              startTime: crew[0]?.startTime || (evTimeMatch ? evTimeMatch[1] : ''),
              endTime: crew[0]?.endTime || (evTimeMatch ? evTimeMatch[2] : ''),
              crew,
            });
          });
        });
        return events;
      });

      for (const production of schedule.productions) {
        const expectedName = normalizeProductionLookup(production.name);
        const match = departmentEvents.find((event) => {
          if (event.date !== production.date) return false;
          const eventName = normalizeProductionLookup(event.name);
          const nameMatches = expectedName === eventName
            || (expectedName.length >= 5 && eventName.includes(expectedName))
            || (eventName.length >= 5 && expectedName.includes(eventName));
          if (!nameMatches) return false;
          if (production.startTime && event.startTime && production.startTime !== event.startTime) return false;
          if (production.endTime && event.endTime && production.endTime !== event.endTime) return false;
          return true;
        });
        if (!match) continue;
        production.crew = match.crew.map((member) => ({
          ...member,
          isCurrentUser: normalizeName(member.name) === normalizeName(schedule.workerName),
        }));
        production.departmentEnriched = true;
        departmentEnrichedCount++;
      }
      // Fetch ShowCrew popups for ALL department productions and write to global_productions
      const DEPT_VACATION_RE = /(^|[-–\s/|,])(חופש|ביטול|מחלה|שמירה|היעדרות|טכנאי\s+תורן)/i;
      const allDepartmentProductions = [];
      const deptEvalCtx = async (fn, ...args) => {
        for (let attempt = 0; attempt < 3; attempt++) {
          try {
            return await departmentContext.evaluate(fn, ...args);
          } catch (err) {
            if (!isContextLostError(err) || attempt === 2) throw err;
            await new Promise((r) => setTimeout(r, 500));
          }
        }
        throw new Error('dept ctx eval failed');
      };
      let deptPopupSuccess = 0;
      let deptPopupFail = 0;
      for (const deptProd of departmentEvents) {
        if (DEPT_VACATION_RE.test(deptProd.name)) continue;
        const prodEntry = {
          ...deptProd,
          status: 'scheduled',
          isCurrentUserShift: false,
          departmentEnriched: true,
          popupParsed: false,
        };
        if (deptProd.herzliyaId) {
          try {
            const deptPopupSnapshot = await deptEvalCtx(POPUP_EVAL_FN, deptProd.herzliyaId);
            const deptDetailed = parsePopupSnapshot(deptProd, deptPopupSnapshot);
            if (deptDetailed?.crew?.length) {
              prodEntry.crew = deptDetailed.crew.map((m) => ({ ...m, phone: normalizePhone(m.phone) }));
              if (deptDetailed.studio) prodEntry.studio = deptDetailed.studio;
              prodEntry.popupParsed = true;
              deptPopupSuccess++;
              console.log(`  [dept] ${deptProd.name}: ${prodEntry.crew.length} crew via popup`);
            } else {
              deptPopupFail++;
              console.log(`  [dept] ${deptProd.name}: popup empty, BR crew=${deptProd.crew.length}`);
            }
          } catch (err) {
            console.warn(`  [dept] popup error for ${deptProd.name}:`, err.message);
            deptPopupFail++;
          }
          await new Promise((r) => setTimeout(r, 40));
        }
        allDepartmentProductions.push(prodEntry);
      }
      console.log(`Dept full sync: ${deptPopupSuccess} popup, ${deptPopupFail} fallback, ${allDepartmentProductions.length} total`);
      schedule.allDepartmentProductions = allDepartmentProductions;

      console.log('Department events parsed:', departmentEvents.length);
      console.log('Department crew enrichment:', departmentEnrichedCount + '/' + schedule.productions.length);
    } catch (error) {
      console.warn('Department crew enrichment unavailable:', error.message);
    } finally {
      if (departmentPage) await departmentPage.close().catch(() => {});
    }

    console.log(`Fetching details for ${schedule.productions.length} productions...`);

    let crewParsed = 0;
    let phonesFound = 0;
    let dedupRemoved = 0;
    let missingPhones = 0;
    let popupSuccessCount = 0;
    let popupFallbackCount = 0;
    let popupRejectedCount = 0;
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

      const evaluateCrewFromPopup = async () => evaluateWithContext(POPUP_EVAL_FN, prod.herzliyaId);

      const popupSnapshot = await evaluateCrewFromPopup();
      const detailed = parsePopupSnapshot(prod, popupSnapshot);
      popupSnapshots.push({
        herzliyaId: prod.herzliyaId,
        productionName: prod.name,
        date: prod.date,
        studio: prod.studio || '',
        expectedStartTime: prod.startTime || '',
        expectedEndTime: prod.endTime || '',
        popupTitle: detailed?.title || '',
        popupStudio: detailed?.studio || '',
        rejected: !!detailed?.rejected,
        overlapCount: detailed?.overlapCount || 0,
        rawCrewCount: detailed?.rawCrewCount || 0,
        parseQuality: detailed?.parseQuality || null,
        tables: popupSnapshot?.tables || [],
        crew: (detailed?.crew || []).map((member) => ({
          name: member.name || '',
          role: member.role || '',
          roleDetail: member.roleDetail || '',
          phone: normalizePhone(member.phone),
          startTime: member.startTime || '',
          endTime: member.endTime || '',
        })),
      });
      writePopupSnapshot();

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
          console.log(`  Studio enriched: ${prod.name} → "${detailed.studio}"`);
        } else {
          console.log(`  Studio: prod="${prod.studio || ''}" popup="${detailed.studio || ''}" (snapshot.studio="${popupSnapshot?.studio || ''}")`);
        }

        console.log(
          `  Production ${prod.name}: ${withNormalized.length} crew rows parsed ` +
          `(source=${detailed.parseQuality?.selectedSource || 'unknown'}, candidates=${detailed.parseQuality?.candidateCount || 0})`
        );
        popupSuccessCount += 1;
        consecutivePopupMiss = 0;
      } else {
        if (detailed?.rejected) {
          console.log(`  Production ${prod.name}: popup rejected after snapshot validation`);
          popupRejectedCount += 1;
          consecutivePopupMiss = 0;
        } else {
          console.log(`  Production ${prod.name}: popup parsing returned 0 rows (kept calendar crew fallback)`);
          consecutivePopupMiss += 1;
        }
        schedule.productions[i].popupParsed = false;
        popupFallbackCount += 1;
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
    console.log('popup rejected:', popupRejectedCount);
    schedule.parseStats = {
      popupSuccessCount,
      popupFallbackCount,
      popupRejectedCount,
      popupSuccessRate: schedule.productions.length
        ? popupSuccessCount / schedule.productions.length
        : 0,
    };
    schedule.snapshotPath = snapshotPath;

    return schedule;
  } finally {
    await page.close();
  }
}

function createVisibleProductionId(production) {
  const key = [production.name || '', production.date || '', production.studio || '', production.startTime || ''].join('::').toLowerCase();
  let hash = 0;
  for (let i = 0; i < key.length; i++) {
    hash = ((hash << 5) - hash) + key.charCodeAt(i);
    hash |= 0;
  }
  return 'visible-' + Math.abs(hash).toString(36);
}

function validateScheduleForWrite(schedule) {
  const errors = [];
  const warnings = [];
  const productions = Array.isArray(schedule?.productions) ? schedule.productions : [];

  if (!/^\d{4}-\d{2}-\d{2}$/.test(schedule?.weekStart || '')) errors.push('invalid_week_start');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(schedule?.weekEnd || '')) errors.push('invalid_week_end');
  if (!productions.length) errors.push('empty_schedule');

  const keys = new Set();
  let duplicateCount = 0;
  let invalidProductionCount = 0;
  for (const production of productions) {
    if (!production?.name || !/^\d{4}-\d{2}-\d{2}$/.test(production?.date || '')) {
      invalidProductionCount++;
      continue;
    }
    const key = String(production.herzliyaId || createVisibleProductionId(production));
    if (keys.has(key)) duplicateCount++;
    keys.add(key);
  }

  if (invalidProductionCount) errors.push(`invalid_productions:${invalidProductionCount}`);
  if (duplicateCount) warnings.push(`duplicate_ids:${duplicateCount}`);

  return {
    ok: errors.length === 0,
    errors,
    warnings,
    productionCount: productions.length,
    validProductionCount: productions.length - invalidProductionCount,
    popupSuccessRate: schedule?.parseStats?.popupSuccessRate ?? null,
  };
}

function mergeCrewPreservingExisting(existingCrew, incomingCrew) {
  const merged = new Map();
  const byNameAndRole = new Map();
  const byName = new Map();
  const put = (member, incoming) => {
    if (!member || !member.name) return;
    const normalizedPhone = normalizePhone(member.phone || member.phone_number);
    const normalizedCrewName = normalizeName(member.name || '');
    const normalizedCrewRole = normalizeRole(member.role || member.roleDetail || member.profession || '');
    const nameAndRoleKey = `${normalizedCrewName}::${normalizedCrewRole}`;
    const existingKey = byNameAndRole.get(nameAndRoleKey)
      || (!normalizedPhone ? byName.get(normalizedCrewName) : undefined);
    const key = existingKey || normalizedPhone || nameAndRoleKey;
    if (!key) return;
    const previous = merged.get(key) || {};
    merged.set(key, {
      ...previous,
      ...member,
      name: member.name || previous.name || '',
      role: member.role || member.roleDetail || member.profession || previous.role || previous.profession || '',
      roleDetail: member.roleDetail || member.role || member.profession || previous.roleDetail || previous.profession || '',
      phone: normalizedPhone || normalizePhone(previous.phone || previous.phone_number) || null,
      startTime: member.startTime || previous.startTime || '',
      endTime: member.endTime || previous.endTime || '',
      ...(incoming ? { observedAt: new Date().toISOString() } : {}),
    });
    byNameAndRole.set(nameAndRoleKey, key);
    if (!normalizedPhone) byName.set(normalizedCrewName, key);
  };

  for (const member of existingCrew || []) put(member, false);
  for (const member of incomingCrew || []) put(member, true);
  return Array.from(merged.values());
}

function stableNotificationHash(value) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index++) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

function summarizeProductionChange(existing, incoming) {
  if (!existing || !Object.keys(existing).length) {
    return `נוספה הפקה חדשה בתאריך ${incoming.date || 'לא ידוע'} בשעות ${incoming.startTime || '--:--'}–${incoming.endTime || '--:--'}`;
  }

  const details = [];
  const clean = (value) => String(value || '').replace(/\s+/g, ' ').trim();
  const addScalarChange = (label, oldValue, newValue) => {
    if (clean(oldValue) !== clean(newValue)) {
      details.push(`${label}: ${clean(oldValue) || 'לא צוין'} ← ${clean(newValue) || 'לא צוין'}`);
    }
  };

  addScalarChange('שם', existing.name, incoming.name);
  addScalarChange('תאריך', existing.date, incoming.date);
  addScalarChange('אולפן', existing.studio, incoming.studio);

  if (
    clean(existing.startTime) !== clean(incoming.startTime)
    || clean(existing.endTime) !== clean(incoming.endTime)
  ) {
    details.push(
      `שעות: ${clean(existing.startTime) || '--:--'}–${clean(existing.endTime) || '--:--'}`
      + ` ← ${clean(incoming.startTime) || '--:--'}–${clean(incoming.endTime) || '--:--'}`,
    );
  }

  addScalarChange('סטטוס', existing.status, incoming.status);
  if ((existing.isCurrentUserShift === true) !== (incoming.isCurrentUserShift === true)) {
    details.push(incoming.isCurrentUserShift ? 'נוספת למשמרת בהפקה' : 'הוסרת מהמשמרת בהפקה');
  }

  const canonicalCrew = (crew) => (crew || [])
    .map((member) => ({
      name: normalizeName(member.name || ''),
      role: normalizeRole(member.role || member.roleDetail || member.profession || ''),
      phone: normalizePhone(member.phone || member.phone_number) || '',
      startTime: clean(member.startTime),
      endTime: clean(member.endTime),
    }))
    .filter((member) => member.name)
    .sort((a, b) => a.name.localeCompare(b.name, 'he'));
  const oldCrew = canonicalCrew(existing.crew);
  const newCrew = canonicalCrew(incoming.crew);
  const oldByName = new Map(oldCrew.map((member) => [member.name, member]));
  const newByName = new Map(newCrew.map((member) => [member.name, member]));
  const addedCrew = newCrew.filter((member) => !oldByName.has(member.name));
  const removedCrew = oldCrew.filter((member) => !newByName.has(member.name));
  const updatedCrew = newCrew.filter((member) => {
    const oldMember = oldByName.get(member.name);
    return oldMember && JSON.stringify(oldMember) !== JSON.stringify(member);
  });

  if (addedCrew.length) details.push(`נוספו לצוות: ${addedCrew.map((member) => member.name).join(', ')}`);
  if (removedCrew.length) details.push(`הוסרו מהצוות: ${removedCrew.map((member) => member.name).join(', ')}`);
  if (updatedCrew.length) details.push(`עודכנו פרטי צוות: ${updatedCrew.map((member) => member.name).join(', ')}`);

  return details.length ? details.join(' • ') : null;
}

async function captureCalendarSnapshot({
  userId,
  weekId,
  schedule,
  quality,
  source,
}) {
  const userProductionsRoot = getUserProductionsRoot(userId);
  const personalSnap = await db.collection(`${userProductionsRoot}/${weekId}/productions`).get();
  const existingPersonalById = new Map(personalSnap.docs.map((doc) => [doc.id, doc.data()]));
  const incomingById = new Map(
    schedule.productions.map((production) => [
      String(production.herzliyaId || createVisibleProductionId(production)),
      production,
    ]),
  );
  const productionIds = new Set([...existingPersonalById.keys(), ...incomingById.keys()]);
  const existingGlobalById = new Map();
  for (const productionId of productionIds) {
    const globalDoc = await db.doc(`global_productions/${productionId}`).get();
    if (globalDoc.exists) existingGlobalById.set(productionId, globalDoc.data());
  }

  const runId = `${Date.now()}-${userId.slice(0, 10)}`;
  const snapshotRef = db.doc(`calendar_sync_snapshots/${runId}`);
  await snapshotRef.set({
    runId,
    userId,
    weekId,
    source,
    createdAt: FieldValue.serverTimestamp(),
    status: 'captured',
    existingPersonalCount: existingPersonalById.size,
    existingGlobalCount: existingGlobalById.size,
    incomingCount: incomingById.size,
    quality,
  });

  let batch = db.batch();
  let batchCount = 0;
  const commitBatch = async () => {
    if (!batchCount) return;
    await batch.commit();
    batch = db.batch();
    batchCount = 0;
  };

  for (const productionId of productionIds) {
    const entryId = `${userId}_${productionId}`.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 1400);
    batch.set(snapshotRef.collection('entries').doc(entryId), {
      productionId,
      restorePersonal: true,
      beforePersonal: existingPersonalById.get(productionId) || null,
      beforeGlobal: existingGlobalById.get(productionId) || null,
      incoming: sanitizeForFirestore(incomingById.get(productionId) || null),
    });
    batchCount++;
    if (batchCount >= 400) await commitBatch();
  }
  await commitBatch();

  return {
    runId,
    snapshotRef,
    existingPersonalById,
    existingGlobalById,
    incomingById,
  };
}

async function saveSchedule(schedule, userId, requestedWorkerName) {
  const weekId = getWeekId(schedule.weekStart);
  const quality = validateScheduleForWrite(schedule);
  if (!quality.ok) {
    throw new Error(`Schedule quality gate failed: ${quality.errors.join(', ')}`);
  }
  // Save to per-user path: productions/{userId}/weeks/{weekId}
  const userProductionsRoot = getUserProductionsRoot(userId);
  console.log('Preserving existing productions for week ' + weekId + '; sync is merge-only');

  const snapshot = await captureCalendarSnapshot({
    userId,
    weekId,
    schedule,
    quality,
    source: AUTO_SYNC_SAVED_CALENDARS ? 'scheduled-browser-sync' : 'browser-request-sync',
  });
  console.log(`Captured calendar snapshot ${snapshot.runId}`);

  const batch = db.batch();
  const weekRef = db.doc(`${userProductionsRoot}/${weekId}`);
  batch.set(weekRef, {
    weekId,
    weekStart: schedule.weekStart,
    weekEnd: schedule.weekEnd,
    lastUpdated: FieldValue.serverTimestamp(),
    contributors: [userId],
  });

  for (const prod of schedule.productions) {
    const prodId = String(prod.herzliyaId || createVisibleProductionId(prod));

    const prodRef = db.doc(`${userProductionsRoot}/${weekId}/productions/${prodId}`);
    const existingPersonal = snapshot.existingPersonalById.get(prodId) || {};
    const currentWorkerName = String(schedule.workerName || requestedWorkerName || '').trim();
    const normalizedProductionName = String(prod.name || '').replace(/\s+/g, ' ').replace(/\s*-\s*/g, '-').trim().toLowerCase();
    const sourceCrew = (prod.crew || []).filter((member) => {
      const parsedAsNameRole = `${member.name || ''}-${member.role || member.roleDetail || ''}`
        .replace(/\s+/g, ' ')
        .replace(/\s*-\s*/g, '-')
        .trim()
        .toLowerCase();
      return parsedAsNameRole !== normalizedProductionName;
    });
    if (!prod.departmentEnriched && prod.isCurrentUserShift && currentWorkerName && !sourceCrew.some((member) => normalizeName(member.name) === normalizeName(currentWorkerName))) {
      sourceCrew.push({
        name: currentWorkerName,
        role: prod.userRole || (prod.name && /צילום/u.test(prod.name) ? 'צילום' : ''),
        roleDetail: '',
        phone: null,
        startTime: prod.startTime || '',
        endTime: prod.endTime || '',
        isCurrentUser: true,
        userId,
      });
    }
    const incomingCrew = sanitizeCrewForFirestore(sourceCrew);
    const cleanCrew = sanitizeCrewForFirestore(
      prod.popupParsed
        ? incomingCrew
        : mergeCrewPreservingExisting(existingPersonal.crew || [], incomingCrew),
    );
    const previousShiftRemovalObservations = Number(existingPersonal.shiftRemovalObservations || 0);
    const incomingIsCurrentUserShift = !!prod.isCurrentUserShift;
    const preserveExistingShift =
      existingPersonal.isCurrentUserShift === true
      && !incomingIsCurrentUserShift
      && previousShiftRemovalObservations < 1;
    const isCurrentUserShift = incomingIsCurrentUserShift || preserveExistingShift;
    const shiftRemovalObservations = incomingIsCurrentUserShift
      ? 0
      : existingPersonal.isCurrentUserShift === true
        ? previousShiftRemovalObservations + 1
        : 0;

    const herzliyaId = prod.herzliyaId || existingPersonal.herzliyaId;
    const nextPersonal = {
      name: prod.name || existingPersonal.name || '',
      studio: prod.studio || existingPersonal.studio || '',
      date: prod.date,
      day: prod.day || getHebrewDay(prod.date),
      startTime: prod.startTime || existingPersonal.startTime || '',
      endTime: prod.endTime || existingPersonal.endTime || '',
      status: prod.status || existingPersonal.status || 'scheduled',
      ...(herzliyaId ? { herzliyaId } : {}),
      isCurrentUserShift,
      shiftRemovalObservations,
      missingObservationCount: 0,
      missingSince: null,
      missingCandidate: false,
      lastUpdatedBy: userId,
      lastUpdatedAt: new Date().toISOString(),
      popupParsed: !!prod.popupParsed,
      departmentEnriched: !!prod.departmentEnriched,
      crewSource: prod.popupParsed ? 'popup' : prod.departmentEnriched ? 'department' : 'fallback',
      parseQuality: schedule.parseStats,
      crew: cleanCrew,
      lastSyncSnapshotId: snapshot.runId,
    };
    batch.set(prodRef, nextPersonal, { merge: true });

    const changeMessage = summarizeProductionChange(existingPersonal, nextPersonal);
    if (changeMessage) {
      const notificationId = `production-change-${stableNotificationHash(`${userId}|${prodId}|${snapshot.runId}`)}`;
      batch.set(db.doc(`notifications/${notificationId}`), {
        userId,
        recipientUid: userId,
        type: 'status_change',
        title: `הפקה עודכנה: ${nextPersonal.name}`,
        message: changeMessage,
        productionId: prodId,
        productionName: nextPersonal.name,
        linkUrl: '/productions',
        source: 'system',
        read: false,
        createdAt: Date.now(),
      });
    }

    const crewList = cleanCrew.map((member) => {
      const normalizedPhone = normalizePhone(member.phone);
      const normalizedCrewName = normalizeName(member.name || '');
      const normalizedCrewRole = normalizeRole(member.role || member.roleDetail || '');
      return {
        name: member.name || '',
        profession: member.role || member.roleDetail || '',
        phone_number: normalizedPhone,
        startTime: member.startTime || '',
        endTime: member.endTime || '',
        normalizedPhone,
        shadowKey: !normalizedPhone && normalizedCrewName
          ? `${normalizedCrewName}::${normalizedCrewRole}`
          : null,
      };
    });
    const globalRef = db.doc(`global_productions/${prodId}`);
    const existingGlobal = snapshot.existingGlobalById.get(prodId) || {};
    const existingCrewList = Array.isArray(existingGlobal.crew_list)
      ? existingGlobal.crew_list.filter((member) => {
          const parsedAsNameRole = `${member.name || ''}-${member.profession || ''}`
            .replace(/\s+/g, ' ')
            .replace(/\s*-\s*/g, '-')
            .trim()
            .toLowerCase();
          return parsedAsNameRole !== normalizedProductionName;
        })
      : [];
    const sourceGlobalCrewList = prod.popupParsed
      ? crewList
      : mergeCrewPreservingExisting(existingCrewList, crewList);
    const mergedCrewList = sourceGlobalCrewList.map((member) => {
      const normalizedPhone = normalizePhone(member.phone || member.phone_number);
      const normalizedCrewName = normalizeName(member.name || '');
      const normalizedCrewRole = normalizeRole(member.role || member.roleDetail || member.profession || '');
      return {
        name: member.name || '',
        profession: member.role || member.roleDetail || member.profession || '',
        phone_number: normalizedPhone,
        startTime: member.startTime || '',
        endTime: member.endTime || '',
        normalizedPhone,
        shadowKey: !normalizedPhone && normalizedCrewName
          ? `${normalizedCrewName}::${normalizedCrewRole}`
          : null,
      };
    });
    const globalHerzliyaId = prod.herzliyaId || existingGlobal.herzliyaId;
    // Always merge fresh crew into existing accumulated crew from all users' syncs.
    // The disown step (below) removes stale personal entries — no REPLACE needed here.
    const finalCrewList = mergedCrewList;
    const globalFields = {
      id: prodId,
      name: prod.name || existingGlobal.name || '',
      studio: prod.studio || existingGlobal.studio || '',
      date: prod.date || '',
      day: prod.day || getHebrewDay(prod.date),
      startTime: prod.startTime || existingGlobal.startTime || '',
      endTime: prod.endTime || existingGlobal.endTime || '',
      status: prod.status || existingGlobal.status || 'scheduled',
      ...(globalHerzliyaId ? { herzliyaId: globalHerzliyaId } : {}),
      crewSource: prod.popupParsed
        ? 'popup'
        : existingGlobal.crewSource || (prod.departmentEnriched ? 'department' : 'fallback'),
      crew_list: finalCrewList,
      crew_phones: [...new Set(finalCrewList.map((member) => member.normalizedPhone).filter(Boolean))],
      crew_shadow_keys: [...new Set(finalCrewList.map((member) => member.shadowKey).filter(Boolean))],
      lastUpdatedAt: new Date().toISOString(),
      lastUpdatedBy: userId,
      sourceWeekPath: `${userProductionsRoot}/${weekId}`,
      lastSyncSnapshotId: snapshot.runId,
    };
    batch.set(globalRef, globalFields, { merge: true }); // MERGE: accumulate crew across all users' syncs
  }

  for (const [prodId, existingPersonal] of snapshot.existingPersonalById) {
    if (snapshot.incomingById.has(prodId)) continue;
    const missingObservationCount = Number(existingPersonal.missingObservationCount || 0) + 1;
    batch.set(
      db.doc(`${userProductionsRoot}/${weekId}/productions/${prodId}`),
      {
        missingObservationCount,
        missingSince: existingPersonal.missingSince || new Date().toISOString(),
        missingCandidate: true,
        isCurrentUserShift: false,
        shiftRemovalObservations: Number(existingPersonal.shiftRemovalObservations || 0) + 1,
        lastSyncSnapshotId: snapshot.runId,
      },
      { merge: true },
    );
  }

  const myProductionIds = schedule.productions
    .filter((p) => p.isCurrentUserShift)
    .map((p) => String(p.herzliyaId || createVisibleProductionId(p)));

  console.log('Saving userSchedule for userId:', userId);
  console.log('My productions:', myProductionIds.length);

  const userSchedulesRef = db.doc(`${USER_SCHEDULES_ROOT}/${userId}/weeks/${weekId}`);
  batch.set(userSchedulesRef, {
    workerName: schedule.workerName || requestedWorkerName,
    weekStart: schedule.weekStart,
    weekEnd: schedule.weekEnd,
    fetchedAt: schedule.fetchedAt,
    productionCount: schedule.productions.length,
    myProductionIds,
    parseStats: schedule.parseStats || null,
  });

  await batch.commit();
  await snapshot.snapshotRef.set({
    status: 'applied',
    appliedAt: FieldValue.serverTimestamp(),
  }, { merge: true });
  console.log(`Saved ${schedule.productions.length} productions to week ${weekId}`);

  if (schedule.snapshotPath) {
    try {
      fs.unlinkSync(schedule.snapshotPath);
    } catch (error) {
      console.warn('Failed deleting popup snapshot:', error.message);
    }
  }

  // Save all department productions to global_productions (not personal schedules)
  if (Array.isArray(schedule.allDepartmentProductions) && schedule.allDepartmentProductions.length) {
    const personalProdIds = new Set(
      schedule.productions.map((p) => String(p.herzliyaId || createVisibleProductionId(p))),
    );
    console.log(`Saving ${schedule.allDepartmentProductions.length} dept productions to global_productions (${personalProdIds.size} personal already saved)...`);
    let deptBatch = db.batch();
    let deptBatchCount = 0;
    const commitDeptBatch = async () => {
      if (!deptBatchCount) return;
      await deptBatch.commit();
      deptBatch = db.batch();
      deptBatchCount = 0;
    };
    const userProductionsRoot = getUserProductionsRoot(userId);

    // Pre-fetch existing global docs so we can merge crew at the JS level.
    // Firestore { merge: true } only prevents other top-level fields from being
    // deleted — it still replaces the crew_list array entirely. Pre-fetching and
    // merging in JS is the only way to accumulate crew across multiple users' syncs.
    const deptProdIdsList = schedule.allDepartmentProductions
      .map((p) => String(p.herzliyaId || createVisibleProductionId(p)))
      .filter((id) => !personalProdIds.has(id));
    const existingDeptGlobalById = new Map();
    for (const prodId of deptProdIdsList) {
      const snap = await db.doc(`global_productions/${prodId}`).get();
      if (snap.exists) existingDeptGlobalById.set(prodId, snap.data());
    }

    for (const prod of schedule.allDepartmentProductions) {
      const prodId = String(prod.herzliyaId || createVisibleProductionId(prod));
      if (personalProdIds.has(prodId)) continue; // already saved in main batch
      const normalizedProductionName = String(prod.name || '').replace(/\s+/g, ' ').replace(/\s*-\s*/g, '-').trim().toLowerCase();
      const incomingCrewList = (prod.crew || [])
        .filter((member) => {
          const key = `${member.name || ''}-${member.role || member.roleDetail || ''}`
            .replace(/\s+/g, ' ').replace(/\s*-\s*/g, '-').trim().toLowerCase();
          return key !== normalizedProductionName;
      });
      const existingDeptGlobal = existingDeptGlobalById.get(prodId) || {};
      const existingDeptCrewList = Array.isArray(existingDeptGlobal.crew_list) ? existingDeptGlobal.crew_list : [];
      const sourceDeptCrewList = prod.popupParsed
        ? incomingCrewList
        : existingDeptGlobal.crewSource === 'popup'
          ? existingDeptCrewList
          : [];
      const crewList = sourceDeptCrewList.map((member) => {
        const normalizedPhone = normalizePhone(member.phone || member.phone_number);
        const normalizedCrewName = normalizeName(member.name || '');
        const normalizedCrewRole = normalizeRole(member.role || member.roleDetail || member.profession || '');
        return {
          name: member.name || '',
          profession: member.role || member.roleDetail || member.profession || '',
          phone_number: normalizedPhone,
          startTime: member.startTime || '',
          endTime: member.endTime || '',
          normalizedPhone,
          shadowKey: !normalizedPhone && normalizedCrewName
            ? `${normalizedCrewName}::${normalizedCrewRole}`
            : null,
        };
      });
      const globalRef = db.doc(`global_productions/${prodId}`);
      const globalData = {
        id: prodId,
        name: prod.name || existingDeptGlobal.name || '',
        studio: prod.studio || existingDeptGlobal.studio || '',
        date: prod.date || '',
        day: prod.day || getHebrewDay(prod.date),
        startTime: prod.startTime || existingDeptGlobal.startTime || '',
        endTime: prod.endTime || existingDeptGlobal.endTime || '',
        status: prod.status || existingDeptGlobal.status || 'scheduled',
        ...(prod.herzliyaId ? { herzliyaId: prod.herzliyaId } : {}),
        crewSource: prod.popupParsed ? 'popup' : (existingDeptGlobal.crewSource || 'department'),
        crew_list: crewList,
        crew_phones: [...new Set(crewList.map((m) => m.normalizedPhone).filter(Boolean))],
        crew_shadow_keys: [...new Set(crewList.map((m) => m.shadowKey).filter(Boolean))],
        lastUpdatedAt: new Date().toISOString(),
        lastUpdatedBy: userId,
        sourceWeekPath: `${userProductionsRoot}/${weekId}`,
      };
      deptBatch.set(globalRef, globalData, { merge: true });
      deptBatchCount++;
      if (deptBatchCount >= 400) await commitDeptBatch();
    }
    await commitDeptBatch();
    console.log('Dept global_productions save complete.');
    if (schedule.allDepartmentProductions.length > personalProdIds.size) {
      await db.doc(`users/${userId}`).set({
        calendarEmploymentType: 'employee',
        calendarEmploymentDetectedAt: new Date().toISOString(),
        calendarEmploymentDetectedBy: 'herzliya-github-action-full-calendar',
        calendarEmploymentDetectionPersonalCount: personalProdIds.size,
        calendarEmploymentDetectionDepartmentCount: schedule.allDepartmentProductions.length,
      }, { merge: true });
      console.log(`Auto-marked ${userId} as employee after full department calendar upload.`);
    }
  }

  // Disown step: remove user's phone from every global_production for this week
  // where they are NOT personally scheduled. Handles stale entries that accumulate via
  // MERGE semantics when the user was once assigned then removed, or via old sync bugs.
  try {
    const userProfileDoc = await db.doc(`users/${userId}`).get();
    const rawPhone = userProfileDoc.exists ? (userProfileDoc.data()?.phone || '') : '';
    let workerNormalizedPhone = rawPhone ? normalizePhone(rawPhone) : null;

    // Fallback: scan personal productions' crew for this worker's phone
    if (!workerNormalizedPhone) {
      const normWorkerForFallback = normalizeName(schedule.workerName || requestedWorkerName || '');
      let foundFallbackPhone = false;
      for (const prod of (schedule.productions || [])) {
        if (foundFallbackPhone) break;
        for (const member of (prod.crew || [])) {
          if (normalizeName(member.name || '') === normWorkerForFallback && member.phone) {
            const p = normalizePhone(member.phone);
            if (p) { workerNormalizedPhone = p; foundFallbackPhone = true; break; }
          }
        }
      }
      if (workerNormalizedPhone) {
        console.log(`Disown step: found worker phone from crew data (not profile): ${workerNormalizedPhone}`);
      }
    }

    if (workerNormalizedPhone) {
      const phoneQuery = await db.collection('global_productions')
        .where('crew_phones', 'array-contains', workerNormalizedPhone)
        .get();

      const myProdIdSet = new Set(myProductionIds);
      const workerNormName = normalizeName(schedule.workerName || requestedWorkerName || '');
      const disownBatch = db.batch();
      let disownCount = 0;

      for (const doc of phoneQuery.docs) {
        if (myProdIdSet.has(doc.id)) continue; // user is genuinely in this production
        const data = doc.data();
        // Only process productions in the current sync's date window
        if (data.date < schedule.weekStart || data.date > schedule.weekEnd) continue;

        const updatedCrewList = (data.crew_list || []).filter(
          (m) => m.normalizedPhone !== workerNormalizedPhone,
        );
        const updatedPhones = (data.crew_phones || []).filter(
          (p) => p !== workerNormalizedPhone,
        );
        const updatedShadowKeys = (data.crew_shadow_keys || []).filter(
          (k) => !k.startsWith(`${workerNormName}::`),
        );
        disownBatch.update(doc.ref, {
          crew_list: updatedCrewList,
          crew_phones: updatedPhones,
          crew_shadow_keys: updatedShadowKeys,
          lastUpdatedAt: new Date().toISOString(),
          lastUpdatedBy: `disown:${userId}`,
        });
        disownCount++;
        console.log(`Disowning ${userId} from stale production: ${doc.id} (${data.name || '?'})`);
      }

      if (disownCount > 0) {
        await disownBatch.commit();
        console.log(`Disowned user from ${disownCount} stale global_productions.`);
      }
    }

    // Name-based disown: catch entries where the user appears by name only (no phone in crew_phones).
    // The profileRes API query does name matching in crew_list — stale name entries cause productions
    // to appear highlighted even after phone disown.
    const workerNormName = normalizeName(schedule.workerName || requestedWorkerName || '');
    if (workerNormName) {
      const weekDocs = await db.collection('global_productions')
        .where('date', '>=', schedule.weekStart)
        .where('date', '<=', schedule.weekEnd)
        .get();

      const myProdIdSetForName = new Set(myProductionIds);
      const nameBatch = db.batch();
      let nameDisownCount = 0;

      for (const doc of weekDocs.docs) {
        if (myProdIdSetForName.has(doc.id)) continue;
        const data = doc.data();
        const crewList = data.crew_list || [];
        const hasNameOnly = crewList.some(
          (m) => normalizeName(m.name || '') === workerNormName && !m.normalizedPhone,
        );
        if (!hasNameOnly) continue;

        const updatedCrewList = crewList.filter(
          (m) => !(normalizeName(m.name || '') === workerNormName && !m.normalizedPhone),
        );
        const updatedShadowKeys = (data.crew_shadow_keys || []).filter(
          (k) => !k.startsWith(`${workerNormName}::`),
        );
        nameBatch.update(doc.ref, {
          crew_list: updatedCrewList,
          crew_shadow_keys: updatedShadowKeys,
          lastUpdatedAt: new Date().toISOString(),
          lastUpdatedBy: `disown-name:${userId}`,
        });
        nameDisownCount++;
        console.log(`Disowning (name-only) ${userId} from stale production: ${doc.id} (${data.name || '?'})`);
      }

      if (nameDisownCount > 0) {
        await nameBatch.commit();
        console.log(`Name-based disown: removed from ${nameDisownCount} stale global_productions.`);
      }
    }
  } catch (disownError) {
    console.warn('Disown step failed (non-fatal):', disownError?.message);
  }
}

function cleanSnapshotText(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function normalizeLookup(value) {
  return cleanSnapshotText(value)
    .toLowerCase()
    .replace(/[^\u05d0-\u05eaa-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeNameKey(value) {
  return normalizeLookup(value)
    .replace(/\b(\u05e6\u05dc\u05dd|\u05e6\u05d9\u05dc\u05d5\u05dd|\u05e8\u05d7\u05e3|\u05de\u05e0\u05d4\u05dc|\u05d1\u05de\u05d0\u05d9|\u05ea\u05d0\u05d5\u05e8\u05d4|\u05e7\u05d5\u05dc)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function extractPhoneFromText(text) {
  const raw = String(text || '');
  // First try: match with dashes/spaces between digit groups (common Israeli format: 052-7805152, 052-780-5152)
  const withSeps = raw.match(/(?:\+?972[-\s.]?)?0?(?:[2-9]\d|5\d)[-\s.]?\d{3}[-\s.]?\d{4}/g);
  if (withSeps && withSeps.length) return normalizePhone(withSeps[0]);
  // Fallback: strip separators between adjacent digits and try consecutive match
  const cleaned = raw.replace(/(\d)[-–—\s.]+(\d)/g, '$1$2');
  const matches = cleaned.match(/(?:\+?972)?0?(?:[2-9]\d|5\d)\d{6,7}/g);
  if (matches && matches.length) return normalizePhone(matches[0]);
  return null;
}

function extractTimeRangeFromText(text) {
  const m = String(text || '').match(/(\d{1,2}:\d{2})\s*[-\u2013\u2014]\s*(\d{1,2}:\d{2})/);
  if (!m) return { startTime: '', endTime: '' };
  return { startTime: m[1], endTime: m[2] };
}

function findHeaderRowFromSnapshot(rows) {
  for (let i = 0; i < Math.min(rows.length, 6); i++) {
    const cells = (rows[i] || []).map((cell) => cleanSnapshotText(cell));
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
}

function chooseIndexesByContentSnapshot(dataRows, columnCount) {
  const stats = Array.from({ length: columnCount }, () => ({
    time: 0,
    phone: 0,
    empty: 0,
    unique: new Set(),
  }));

  dataRows.forEach((row) => {
    for (let i = 0; i < columnCount; i++) {
      const txt = cleanSnapshotText(row[i] || '');
      if (!txt) {
        stats[i].empty++;
        continue;
      }
      stats[i].unique.add(txt);
      if (extractPhoneFromText(txt)) stats[i].phone++;
      if (extractTimeRangeFromText(txt).startTime) stats[i].time++;
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
}

function parseCrewTableSnapshot(tableRows) {
  const rows = Array.isArray(tableRows) ? tableRows : [];
  if (rows.length < 2) return { crew: [], score: -1 };

  const header = findHeaderRowFromSnapshot(rows);
  if (header.index < 0) return { crew: [], score: -1 };

  const headerCells = header.cells;
  const findIndex = (pred) => headerCells.findIndex((h) => pred(h));
  let timeIdx = findIndex((h) => /\u05e9\u05e2\u05d5\u05ea/u.test(h));
  let roleIdx = findIndex((h) => /\u05ea\u05e4\u05e7\u05d9\u05d3/u.test(h));
  let nameIdx = findIndex((h) => /\u05e9\u05dd/u.test(h));
  let detailsIdx = findIndex((h) => /\u05e4\u05e8\u05d8\u05d9\u05dd/u.test(h));
  let phoneIdx = findIndex((h) => /\u05e0\u05d9\u05d9\u05d3|\u05d8\u05dc\u05e4\u05d5\u05df/u.test(h));

  const rawRows = rows
    .slice(header.index + 1)
    .map((row) => (Array.isArray(row) ? row.map((cell) => cleanSnapshotText(cell)) : []))
    .filter((cells) => cells.length >= 3);

  if (!rawRows.length) return { crew: [], score: -1 };

  const colCount = Math.max(...rawRows.map((r) => r.length));
  if (nameIdx < 0 || nameIdx >= colCount || timeIdx < 0 || phoneIdx < 0) {
    const byContent = chooseIndexesByContentSnapshot(rawRows, colCount);
    nameIdx = nameIdx >= 0 ? nameIdx : byContent.nameIdx;
    roleIdx = roleIdx >= 0 ? roleIdx : byContent.roleIdx;
    detailsIdx = detailsIdx >= 0 ? detailsIdx : byContent.detailsIdx;
    timeIdx = timeIdx >= 0 ? timeIdx : byContent.timeIdx;
    phoneIdx = phoneIdx >= 0 ? phoneIdx : byContent.phoneIdx;
  }

  if (nameIdx < 0) return { crew: [], score: -1 };

  const crew = [];
  for (const cells of rawRows) {
    const joined = cleanSnapshotText(cells.join(' | '));
    const name = cleanSnapshotText((cells[nameIdx] || '').replace(/^[:\-]+|[:\-]+$/g, ''));
    if (!name || name.length < 2) continue;
    if (/\u05e9\u05dd|\u05ea\u05e4\u05e7\u05d9\u05d3|\u05e0\u05d9\u05d9\u05d3/u.test(name)) continue;

    const role = cleanSnapshotText(roleIdx >= 0 ? cells[roleIdx] || '' : '');
    const roleDetail = cleanSnapshotText(detailsIdx >= 0 ? cells[detailsIdx] || '' : '');
    const phoneRaw = phoneIdx >= 0 ? cells[phoneIdx] || '' : joined;
    const phone = extractPhoneFromText(phoneRaw) || extractPhoneFromText(joined);
    const timeSource = timeIdx >= 0 ? cells[timeIdx] || '' : joined;
    const { startTime, endTime } = extractTimeRangeFromText(timeSource);

    crew.push({ name, role, roleDetail, phone, startTime, endTime });
  }

  const headerText = cleanSnapshotText(headerCells.join(' '));
  const headerHits = [
    /\u05e9\u05dd/u,
    /\u05ea\u05e4\u05e7\u05d9\u05d3/u,
    /\u05e0\u05d9\u05d9\u05d3|\u05d8\u05dc\u05e4\u05d5\u05df/u,
    /\u05e9\u05e2\u05d5\u05ea/u,
  ].reduce((sum, re) => (re.test(headerText) ? sum + 1 : sum), 0);

  const score = crew.length * 10 + headerHits * 8 + crew.filter((member) => member.phone).length * 3;
  return { crew, score };
}

function parsePopupSnapshot(production, snapshot) {
  const tables = Array.isArray(snapshot?.tables) ? snapshot.tables : [];
  const titleText = cleanSnapshotText(snapshot?.title || '');
  const titleNorm = normalizeLookup(titleText);
  const expectedNorm = normalizeLookup(production?.name || '');
  const expectedTokens = expectedNorm.split(' ').filter((token) => token.length > 1);
  const titleTokenHits = expectedTokens.filter((token) => titleNorm.includes(token)).length;
  const titleMatch =
    !titleText ||
    !expectedNorm ||
    titleNorm.includes(expectedNorm) ||
    expectedNorm.includes(titleNorm) ||
    titleTokenHits >= Math.min(2, expectedTokens.length || 0);

  const expectedNameKeys = (production?.crew || [])
    .map((member) => normalizeNameKey(member.name))
    .filter((name) => name.length >= 2);

  const parsedTables = tables
    .map((table, index) => ({
      index,
      ...parseCrewTableSnapshot(table.rows || []),
    }))
    .filter((table) => table.crew.length > 0);

  const mergedCrew = parsedTables.length > 1
    ? deduplicateCrew(parsedTables.flatMap((table) => table.crew || []))
    : [];

  const candidates = [
    ...parsedTables.map((table) => ({
      source: `table:${table.index}`,
      score: table.score,
      crew: deduplicateCrew(table.crew || []),
    })),
    ...(mergedCrew.length > 0
      ? [{
          source: 'merged',
          score: parsedTables.reduce((sum, table) => sum + Math.max(0, table.score || 0), 0),
          crew: mergedCrew,
        }]
      : []),
  ];

  const scoredCandidates = candidates.map((candidate) => {
    const overlapCount = expectedNameKeys.length
      ? candidate.crew.filter((member) => {
          const key = normalizeNameKey(member.name);
          return expectedNameKeys.some((expectedKey) => key.includes(expectedKey) || expectedKey.includes(key));
        }).length
      : 0;

    const phoneCount = candidate.crew.filter((member) => normalizePhone(member.phone)).length;
    const strongCrewShape = candidate.crew.length >= Math.max(4, (production?.crew || []).length + 2);
    const accepted = candidate.crew.length > 0 && (titleMatch || strongCrewShape || overlapCount >= 1);

    return {
      ...candidate,
      overlapCount,
      phoneCount,
      strongCrewShape,
      accepted,
    };
  });

  const ranked = (scoredCandidates.filter((candidate) => candidate.accepted).length
    ? scoredCandidates.filter((candidate) => candidate.accepted)
    : scoredCandidates
  ).sort((a, b) => {
    if (b.crew.length !== a.crew.length) return b.crew.length - a.crew.length;
    if (b.overlapCount !== a.overlapCount) return b.overlapCount - a.overlapCount;
    if (b.phoneCount !== a.phoneCount) return b.phoneCount - a.phoneCount;
    return b.score - a.score;
  });

  const best = ranked[0] || {
    source: 'none',
    crew: [],
    score: -1,
    overlapCount: 0,
    phoneCount: 0,
    strongCrewShape: false,
    accepted: false,
  };

  return {
    crew: best.crew,
    title: titleText,
    studio: cleanSnapshotText(snapshot?.studio || ''),
    rejected: !best.accepted,
    overlapCount: best.overlapCount,
    rawCrewCount: best.crew.length,
    parseQuality: {
      titleMatch,
      strongCrewShape: best.strongCrewShape,
      overlapCount: best.overlapCount,
      tableCount: tables.length,
      selectedSource: best.source,
      candidateCount: scoredCandidates.length,
    },
  };
}

async function main() {
  if (AUTO_SYNC_SAVED_CALENDARS) {
    console.log('Checking saved calendar URLs for hourly sync...');
    const currentWeekStart = getCurrentWeekStartIsrael();
    const previousWeekStart = getPreviousWeekStart(currentWeekStart);
    const nextWeekStart = getNextWeekStart(currentWeekStart);
    const eligibleWeekStarts = new Set([currentWeekStart, previousWeekStart, nextWeekStart]);
    const savedSnap = await db.collection('user_calendar_sync').get();
    const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
    const savedCalendars = savedSnap.docs
      .map((doc) => ({ uid: doc.id, ...doc.data() }))
      .filter((entry) =>
        entry.url && (
          eligibleWeekStarts.has(entry.weekStart) ||
          (entry.savedAt && entry.savedAt >= sevenDaysAgo)
        ),
      );

    console.log(
      `Found ${savedCalendars.length} eligible saved calendars `
      + `(${previousWeekStart}, ${currentWeekStart}, ${nextWeekStart})`,
    );
    if (!savedCalendars.length) {
      console.log('No eligible saved calendars found — nothing to sync, exiting cleanly.');
      return;
    }

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
      executablePath: await getBrowserExecutablePath(),
      headless: true,
    });

    let successCount = 0;
    let productionCount = 0;
    let licenseFailCount = 0;
    try {
      for (const saved of savedCalendars) {
        const syncRef = db.doc(`user_calendar_sync/${saved.uid}`);
        try {
          const urlWeekStart = getWeekStartFromHerzliyaUrl(saved.url);
          const targetWeekStart = eligibleWeekStarts.has(urlWeekStart)
            ? urlWeekStart
            : eligibleWeekStarts.has(saved.weekStart) ? saved.weekStart : currentWeekStart;
          const urlToFetch = urlForWeek(saved.url, targetWeekStart);
          console.log(`Syncing ${saved.uid}: ${urlToFetch}`);
          let schedule = null;
          let lastErr = null;
          // Retry once on license errors — server may free a slot within 20s
          for (let attempt = 0; attempt < 2; attempt++) {
            try {
              schedule = await fetchSchedule(browser, urlToFetch);
              lastErr = null;
              break;
            } catch (fetchErr) {
              lastErr = fetchErr;
              const msg = fetchErr instanceof Error ? fetchErr.message : String(fetchErr);
              if (msg.includes('no free license slot') && attempt === 0) {
                console.log(`License busy for ${saved.uid}, waiting 25s then retrying...`);
                await new Promise(r => setTimeout(r, 25000));
              } else {
                break;
              }
            }
          }
          if (lastErr) throw lastErr;
          if (!schedule || !schedule.productions.length) {
            throw new Error('No productions found in saved Herzliya calendar');
          }

          await saveSchedule(schedule, saved.uid, saved.workerName || '');
          successCount++;
          productionCount += schedule.productions.length;
          await syncRef.set({
            weekStart: schedule.weekStart || currentWeekStart,
            lastSyncAt: Date.now(),
            lastSyncStatus: 'success',
            lastSyncCount: schedule.productions.length,
            lastSyncError: null,
          }, { merge: true });
          console.log(`Hourly sync saved ${schedule.productions.length} productions for ${saved.uid}`);
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          const isLicense = message.includes('no free license slot');
          if (isLicense) licenseFailCount++;
          console.error(`Hourly sync failed for ${saved.uid}:`, message);
          await syncRef.set({
            lastSyncAt: Date.now(),
            lastSyncStatus: isLicense ? 'license_busy' : 'error',
            lastSyncCount: 0,
            lastSyncError: message.slice(0, 300),
          }, { merge: true });
        }
        // Brief pause between users to avoid hammering the Herzliya server
        if (savedCalendars.indexOf(saved) < savedCalendars.length - 1) {
          await new Promise(r => setTimeout(r, 3000));
        }
      }
    } finally {
      await browser.close();
    }

    await db.doc('system/calendarSync').set({
      lastSyncAt: Date.now(),
      lastSyncStatus: successCount === savedCalendars.length ? 'success' : 'partial',
      lastSyncCount: productionCount,
    }, { merge: true });

    console.log(
      `Hourly saved-calendar sync completed: ${successCount}/${savedCalendars.length} users, `
      + `${productionCount} productions`,
    );
    if (successCount === 0) {
      const allLicense = licenseFailCount === savedCalendars.length;
      if (allLicense) {
        // Transient — Herzliya server busy. Exit cleanly; next 5-min run will retry.
        console.log('All failures were Herzliya license-busy errors — will retry on next scheduled run.');
        return;
      }
      throw new Error('Hourly saved-calendar sync did not update any calendars');
    }
    return;
  }

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
      executablePath: await getBrowserExecutablePath(),
    headless: true,
  });

  for (const requestDoc of requestsSnap.docs) {
    const request = requestDoc.data();
    console.log(`Processing request for user: ${request.userId}`);

    try {
      await requestDoc.ref.update({ status: 'processing', startedAt: new Date() });

      const schedule = await fetchSchedule(browser, request.url);
      if (!schedule || !schedule.productions.length) {
        throw new Error('לא נמצאו הפקות בלוח האישי של הרצליה');
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

module.exports = {
  main,
  mergeCrewPreservingExisting,
  sanitizeForFirestore,
  summarizeProductionChange,
  validateScheduleForWrite,
};

if (require.main === module) {
  main().catch((error) => { console.error(error); process.exitCode = 1; });
}
