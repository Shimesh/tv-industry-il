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
    args: chromium.args,
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

    // Wait for calendar to load
    await page.waitForSelector('.calendar-body, .calendar', { timeout: 10000 });

    // Check if "department view" checkbox exists and click it
    const checkboxClicked = await page.evaluate(() => {
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

    // Get the full HTML
    const html = await page.content();

    // Also extract worker name from the page
    const workerName = await page.evaluate(() => {
      // Try various patterns for worker name
      const bodyText = document.body.textContent || '';
      const nameMatch =
        bodyText.match(/שלום\s+([^\n,]+)/) ||
        bodyText.match(/עובד[:\s]+([^\n]+)/);
      return nameMatch ? nameMatch[1].trim() : '';
    });

    // Parse the HTML using Puppeteer's DOM (real DOMParser!)
    const schedule = await page.evaluate((currentWorkerName) => {
      // ── Extract dates from calendar header ──
      const headerDivs = document.querySelectorAll('.calendar-header > div');
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

      // ── Extract productions from day cells ──
      const calendarBody = document.querySelector('.calendar-body');
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
          // Get production ID from onclick
          const onclickAttr = eventDiv.getAttribute('onclick') || '';
          const idMatch = onclickAttr.match(/openmd2\((\d+)\)/);
          const herzliyaId = idMatch ? parseInt(idMatch[1]) : 0;

          // Skip empty placeholders
          if (herzliyaId === 0) return;

          // Check if current user's shift
          const isCurrentUserShift = eventDiv.classList.contains('sat');

          // Get production name from red font
          const nameFont = eventDiv.querySelector(
            'font[color="red"], font[color="RED"]'
          );
          const rawProductionName = nameFont
            ? nameFont.textContent.trim()
            : '';
          if (!rawProductionName) return;

          // Parse crew from innerHTML (split by <br>)
          const innerHTML = eventDiv.innerHTML;
          const parts = innerHTML.split(/<br\s*\/?>/i);

          const crew = [];
          let startTime = '';
          let endTime = '';

          for (let i = 1; i < parts.length; i++) {
            const tempDiv = document.createElement('div');
            tempDiv.innerHTML = parts[i];
            const text = tempDiv.textContent.trim();
            if (!text) continue;

            // Match: "name - role time1 time2" or "name - role time1 -time2"
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

            // Try crew without times
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

          // Extract studio from name
          const studioMatch = rawProductionName.match(
            /(?:אולפן|סטודיו|studio|st\.?)\s*(\d+\w?)/i
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
    }, workerName);

    // Add week range
    schedule.weekStart =
      schedule.weekDays[0]?.isoDate || '';
    schedule.weekEnd =
      schedule.weekDays[schedule.weekDays.length - 1]?.isoDate || '';
    schedule.workerName = workerName || schedule.workerName;
    schedule.fetchedAt = new Date().toISOString();

    return schedule;
  } finally {
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

async function saveSchedule(schedule, userId, requestedWorkerName) {
  const weekId = getWeekId(schedule.weekStart);
  const batch = db.batch();

  // Save week metadata
  const weekRef = db.doc(`productions/global/weeks/${weekId}`);
  batch.set(
    weekRef,
    {
      weekId,
      weekStart: schedule.weekStart,
      weekEnd: schedule.weekEnd,
      lastUpdated: FieldValue.serverTimestamp(),
      contributors: FieldValue.arrayUnion(userId),
    },
    { merge: true }
  );

  // Save each production
  for (const prod of schedule.productions) {
    const prodId =
      generateProductionId(prod.name, prod.date, prod.studio) ||
      String(prod.herzliyaId);
    const prodRef = db.doc(
      `productions/global/weeks/${weekId}/productions/${prodId}`
    );

    // Get existing to merge crew
    const existing = await prodRef.get();
    let mergedCrew = prod.crew;

    if (existing.exists) {
      const existingCrew = existing.data().crew || [];
      mergedCrew = [...existingCrew];
      for (const newMember of prod.crew) {
        const found = mergedCrew.find((m) => m.name === newMember.name);
        if (!found) mergedCrew.push(newMember);
      }
    }

    batch.set(
      prodRef,
      {
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
        versions: [],
      },
      { merge: true }
    );

    // Save crew as subcollection
    for (const crew of mergedCrew) {
      const crewId = crew.name.replace(/\s+/g, '_').toLowerCase();
      const crewRef = db.doc(
        `productions/global/weeks/${weekId}/productions/${prodId}/crew/${crewId}`
      );
      batch.set(
        crewRef,
        {
          ...crew,
          addedBy: crew.addedBy || userId,
          addedAt: crew.addedAt || new Date().toISOString(),
        },
        { merge: true }
      );
    }
  }

  // Save user's schedule reference
  const userScheduleRef = db.doc(`users/${userId}/schedules/${weekId}`);
  batch.set(
    userScheduleRef,
    {
      workerName: schedule.workerName || requestedWorkerName,
      weekStart: schedule.weekStart,
      weekEnd: schedule.weekEnd,
      fetchedAt: schedule.fetchedAt,
      productionCount: schedule.productions.length,
    },
    { merge: true }
  );

  await batch.commit();
  console.log(`Saved ${schedule.productions.length} productions to week ${weekId}`);
}

main().catch(console.error);
