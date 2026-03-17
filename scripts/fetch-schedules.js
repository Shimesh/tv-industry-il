const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore, FieldValue } = require('firebase-admin/firestore');
const puppeteer = require('puppeteer-core');
const chromium = require('@sparticuz/chromium');

// Init Firebase Admin
initializeApp({
  credential: cert({
    projectId: process.env.FIREBASE_PROJECT_ID,
    clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
    privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
  }),
});

const db = getFirestore();

async function main() {
  console.log('Checking for pending schedule requests...');

  // Get all pending requests
  const requestsSnap = await db
    .collection('scheduleRequests')
    .where('status', '==', 'pending')
    .get();

  if (requestsSnap.empty) {
    console.log('No pending requests');
    return;
  }

  console.log(`Found ${requestsSnap.size} pending requests`);

  // Launch Puppeteer
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

  for (const doc of requestsSnap.docs) {
    const request = doc.data();
    console.log(`Processing request for user: ${request.userId}`);

    try {
      // Mark as processing
      await doc.ref.update({ status: 'processing', startedAt: new Date() });

      const schedule = await fetchSchedule(browser, request.url);

      if (!schedule || schedule.productions.length === 0) {
        throw new Error('No productions found');
      }

      // Save to Firestore
      await saveSchedule(schedule, request.userId, request.workerName);

      // Mark as done
      await doc.ref.update({
        status: 'done',
        completedAt: new Date(),
        productionCount: schedule.productions.length,
      });

      console.log(`Done: saved ${schedule.productions.length} productions for ${request.userId}`);
    } catch (error) {
      console.error(`Error processing ${doc.id}:`, error.message);
      await doc.ref.update({
        status: 'error',
        error: error.message,
        failedAt: new Date(),
      });
    }
  }

  await browser.close();
}

async function fetchSchedule(browser, url) {
  const page = await browser.newPage();

  try {
    console.log('Navigating to:', url);

    // Bypass SSL errors (self-signed cert on Herzliya server)
    await page.setBypassCSP(true);

    await page.goto(url, {
      waitUntil: 'networkidle0',
      timeout: 30000,
    });

    // Wait for calendar to load (page or iframe)
    const findCalendarContext = async () => {
      const selector = '.calendar-body, .calendar';
      const deadline = Date.now() + 20000;

      while (Date.now() < deadline) {
        try {
          await page.waitForSelector(selector, { timeout: 2000 });
          return page;
        } catch {
          // Ignore
        }

        for (const frame of page.frames()) {
          try {
            const handle = await frame.$(selector);
            if (handle) return frame;
          } catch {
            // Ignore
          }
        }

        for (const frame of page.frames()) {
          try {
            await frame.waitForSelector(selector, { timeout: 2000 });
            return frame;
          } catch {
            // Ignore
          }
        }

        await new Promise((r) => setTimeout(r, 1000));
      }

      return null;
    };

    let context = await findCalendarContext();
    if (!context) {
      throw new Error('Calendar not found in page or iframe');
    }

    console.log('Calendar context:', context === page ? 'page' : 'iframe');

    // Check if "department view" checkbox exists and click it
    const checkboxClicked = await context.evaluate(() => {
      const checkbox =
        document.getElementById('allDep') ||
        document.querySelector('input[type="checkbox"]');

      if (checkbox && !checkbox.checked) {
        checkbox.click();
        return true;
      }
      return checkbox ? checkbox.checked : false;
    });

    if (checkboxClicked) {
      console.log('Clicked department checkbox, waiting for reload...');
      await page
        .waitForNavigation({
          waitUntil: 'networkidle0',
          timeout: 15000,
        })
        .catch(() => {
          // Sometimes it doesn't navigate, just updates DOM
          return new Promise((r) => setTimeout(r, 3000));
        });
    }

    const refreshed = await findCalendarContext();
    if (refreshed) context = refreshed;
    console.log('Calendar context after refresh:', context === page ? 'page' : 'iframe');
    // Get the full HTML
    let html = '';
    if (context) {
      html = await context.content();
    } else {
      const candidates = [];
      try { candidates.push(await page.content()); } catch {}
      for (const frame of page.frames()) {
        try { candidates.push(await frame.content()); } catch {}
      }
      html = candidates.find((h) => h.includes('calendar-header') || h.includes('calendar-body') || h.includes('openmd2')) || candidates[0] || '';
    }

    // Also extract worker name from the HTML
    const workerName = await page.evaluate((htmlStr) => {
      const doc = new DOMParser().parseFromString(htmlStr || '', 'text/html');
      const bodyText = doc.body?.textContent || '';
      const nameMatch =
        bodyText.match(/שלום\s+([^\n,]+)/) ||
        bodyText.match(/עובד[:\s]+([^\n]+)/);
      return nameMatch ? nameMatch[1].trim() : '';
    }, html);

    // Parse the HTML using DOMParser
    const schedule = await page.evaluate((htmlStr, currentWorkerName) => {
      const doc = new DOMParser().parseFromString(htmlStr || '', 'text/html');

      // Extract dates from calendar header
      const headerDivs = doc.querySelectorAll('.calendar-header > div');
      const weekDays = [];

      headerDivs.forEach((div) => {
        const text = div.textContent || '';
        const dateMatch = text.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
        if (dateMatch) {
          const dayName = text.replace(/\d{1,2}\/\d{1,2}\/\d{4}/, '').trim();
          const day = dateMatch[1].padStart(2, '0');
          const month = dateMatch[2].padStart(2, '0');
          const year = dateMatch[3];
          weekDays.push({
            dayName,
            isoDate: `${year}-${month}-${day}`,
          });
        }
      });

      if (weekDays.length === 0) {
        return { productions: [], weekDays: [], workerName: '' };
      }

      // Extract productions from day cells
      const calendarBody = doc.querySelector('.calendar-body');
      if (!calendarBody) {
        return { productions: [], weekDays, workerName: '' };
      }

      const dayCells = calendarBody.querySelectorAll('.day-cell, .sat-cell');
      const productions = [];

      function sortTimes(t1, t2) {
        const toMin = (t) => {
          const [h, m] = t.split(':').map(Number);
          return h * 60 + m;
        };
        return toMin(t1) <= toMin(t2) ? [t1, t2] : [t2, t1];
      }

      dayCells.forEach((cell, dayIndex) => {
        const dayInfo = weekDays[dayIndex];
        if (!dayInfo) return;

        const eventDivs = cell.querySelectorAll('.event, .sat');

        eventDivs.forEach((eventDiv) => {
          const onclickAttr = eventDiv.getAttribute('onclick') || '';
          const idMatch = onclickAttr.match(/openmd2\((\d+)\)/);
          const herzliyaId = idMatch ? parseInt(idMatch[1]) : 0;
          if (herzliyaId === 0) return;

          const isCurrentUserShift = eventDiv.classList.contains('sat');

          const nameFont = eventDiv.querySelector('font[color="red"], font[color="RED"]');
          const rawProductionName = nameFont ? nameFont.textContent.trim() : '';
          if (!rawProductionName) return;

          const innerHTML = eventDiv.innerHTML;
          const parts = innerHTML.split(/<br\s*\/?>(?i)/i);

          const crew = [];
          let startTime = '';
          let endTime = '';

          for (let i = 1; i < parts.length; i++) {
            const tempDiv = doc.createElement('div');
            tempDiv.innerHTML = parts[i];
            const text = tempDiv.textContent.trim();
            if (!text) continue;

            const crewMatch = text.match(
              /^(.+?)\s*-\s*(.+?)\s+(\d{1,2}:\d{2})\s*-?\s*(\d{1,2}:\d{2})/
            );

            if (crewMatch) {
              const memberName = crewMatch[1].trim();
              const role = crewMatch[2].trim();
              const [s, e] = sortTimes(crewMatch[3], crewMatch[4]);

              if (!startTime) {
                startTime = s;
                endTime = e;
              }

              crew.push({
                name: memberName,
                role,
                roleDetail: '',
                phone: '',
                startTime: s,
                endTime: e,
              });
              continue;
            }

            const crewNoTimes = text.match(/^(.+?)\s*-\s*(.+)$/);
            if (crewNoTimes) {
              const memberName = crewNoTimes[1].trim();
              const role = crewNoTimes[2].trim();
              if (memberName.length >= 2) {
                crew.push({
                  name: memberName,
                  role,
                  roleDetail: '',
                  phone: '',
                  startTime: '',
                  endTime: '',
                });
              }
            }
          }

          const studioMatch = rawProductionName.match(
            /(?:אולפן|סטודיו|studio|st\.?)+\s*(\d+\w?)/i
          );
          const studio = studioMatch ? studioMatch[0].trim() : '';
          const cleanName = studio
            ? rawProductionName
                .replace(studioMatch[0], '')
                .replace(/\s{2,}/g, ' ')
                .trim()
            : rawProductionName;
          const finalName = cleanName || rawProductionName;

          productions.push({
            herzliyaId,
            name: finalName,
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
    }, html, workerName);

    // Add week range
    schedule.weekStart =
      schedule.weekDays[0]?.isoDate || '';
    schedule.weekEnd =
      schedule.weekDays[schedule.weekDays.length - 1]?.isoDate || '';
    schedule.workerName = workerName || schedule.workerName;
    schedule.fetchedAt = new Date().toISOString();

    // Phase 2: Click each production to get detailed crew with phone numbers
    console.log(`Fetching details for ${schedule.productions.length} productions...`);

    const canOpenDetails = context ? await context.evaluate(() => typeof openmd2 === 'function') : false;
    if (!canOpenDetails) {
      console.log('Skipping detail fetch: openmd2 not available');
      return schedule;
    }
    await page.close();
  }
}

// Generate stable production ID (same algorithm as client-side)
function generateProductionId(name, date, studio) {
  const key = `${name}::${date}::${studio}`.toLowerCase().trim();
  let hash = 0;
  for (let i = 0; i < key.length; i++) {
    const char = key.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash;
  }
  return Math.abs(hash).toString(36);
}

// Get Hebrew day name from ISO date
function getHebrewDay(dateStr) {
  const days = [
    'יום א׳',
    'יום ב׳',
    'יום ג׳',
    'יום ד׳',
    'יום ה׳',
    'יום ו׳',
    'שבת',
  ];
  const date = new Date(dateStr);
  return days[date.getDay()];
}

// Get week ID (Sunday of that week)
function getWeekId(dateStr) {
  const date = new Date(dateStr);
  const day = date.getDay();
  const diff = date.getDate() - day;
  const sunday = new Date(date.setDate(diff));
  return sunday.toISOString().split('T')[0];
}

// Delete all existing productions for a week before saving fresh data
async function cleanupWeek(weekId) {
  console.log(`Cleaning up existing data for week ${weekId}...`);
  const prodsSnap = await db
    .collection(`productions/global/weeks/${weekId}/productions`)
    .get();

  if (prodsSnap.empty) {
    console.log('No existing productions to clean up');
    return;
  }

  // Delete crew subcollections first, then productions
  for (const prodDoc of prodsSnap.docs) {
    const crewSnap = await db
      .collection(`productions/global/weeks/${weekId}/productions/${prodDoc.id}/crew`)
      .get();
    const batch = db.batch();
    for (const crewDoc of crewSnap.docs) {
      batch.delete(crewDoc.ref);
    }
    batch.delete(prodDoc.ref);
    await batch.commit();
  }

  console.log(`Deleted ${prodsSnap.size} old productions and their crew`);
}

function normalizeName(name) {
  return String(name || '')
    // Remove role prefixes like "�����: " "�����: " etc
    .replace(/^[\u05d0-\u05ea]+:\s*/u, '')
    // Remove role suffixes
    .replace(/\s*[-�]\s*[\u05d0-\u05ea\s]+$/, '')
    // Trim whitespace
    .trim()
    // Remove extra spaces
    .replace(/\s+/g, ' ');
}

// Deduplicate crew array by normalized name
function deduplicateCrew(crew) {
  const seen = new Map();

  for (const member of crew) {
    const key = normalizeName(member.name);
    if (!key || key.length < 2) continue;

    if (!seen.has(key)) {
      seen.set(key, {
        ...member,
        name: key, // Use clean name
      });
    } else {
      const existing = seen.get(key);
      seen.set(key, {
        name: key,
        role: existing.role || member.role,
        roleDetail: existing.roleDetail || member.roleDetail,
        phone: existing.phone || member.phone,
        startTime: existing.startTime || member.startTime,
        endTime: existing.endTime || member.endTime,
        isCurrentUser: existing.isCurrentUser || member.isCurrentUser,
        userId: existing.userId || member.userId,
      });
    }
  }

  return Array.from(seen.values());
}
function sanitizeCrewForFirestore(crew) {
  return (crew || []).map((member) => ({
    name: member.name || '',
    role: member.role || '',
    roleDetail: member.roleDetail || '',
    phone: member.phone || '',
    startTime: member.startTime || '',
    endTime: member.endTime || '',
    isCurrentUser: !!member.isCurrentUser,
    userId: member.userId || '',
  }));
}

async function saveSchedule(schedule, userId, requestedWorkerName) {
  const weekId = getWeekId(schedule.weekStart);

  // STEP 1: Wipe existing week data to prevent duplicates
  await cleanupWeek(weekId);

  // STEP 2: Save fresh data with SET (not merge)
  const batch = db.batch();

  // Save week metadata (SET, not merge - fresh data)
  const weekRef = db.doc(`productions/global/weeks/${weekId}`);
  batch.set(weekRef, {
    weekId,
    weekStart: schedule.weekStart,
    weekEnd: schedule.weekEnd,
    lastUpdated: FieldValue.serverTimestamp(),
    contributors: [userId],
  });

  // Save each production using herzliyaId as stable document ID
  for (const prod of schedule.productions) {
    // Use herzliyaId as the document ID - it's the stable identifier from Herzliya
    const prodId = String(prod.herzliyaId);
    if (!prodId || prodId === '0') continue;

    const prodRef = db.doc(
      `productions/global/weeks/${weekId}/productions/${prodId}`
    );

    // Deduplicate crew by name before saving
    const cleanCrew = sanitizeCrewForFirestore(deduplicateCrew(prod.crew));

    // SET (not merge) - replace entire document
    batch.set(prodRef, {
      name: prod.name,
      studio: prod.studio,
      date: prod.date,
      day: prod.day || getHebrewDay(prod.date),
      startTime: prod.startTime,
      endTime: prod.endTime,
      status: prod.status,
      herzliyaId: prod.herzliyaId,
      isCurrentUserShift: prod.isCurrentUserShift || false,
      lastUpdatedBy: userId,
      lastUpdatedAt: new Date().toISOString(),
      crew: cleanCrew,
    });
  }

  // Save user's schedule reference
  const myProductionIds = schedule.productions
    .filter(p => p.isCurrentUserShift)
    .map(p => p.herzliyaId);

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

  // Also write to userSchedules collection (new path)
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

main().catch(console.error);

















