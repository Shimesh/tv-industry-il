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
      const selector = '.calendar-body, .calendar, #calendar, .calendar-body *';
      const deadline = Date.now() + 20000;

      const dateRegex = /(\d{1,2})\/(\d{1,2})\/(\d{4})/g;

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

      // Fallback: scan frames for calendar-like content
      try {
        const frames = page.frames();
        for (const frame of frames) {
          try {
            const html = await frame.content();
            const dateMatches = (html.match(dateRegex) || []).length;
            const hasCalendar = /calendar/i.test(html);
            if (dateMatches >= 5 || hasCalendar) {
              console.log('Calendar heuristic match in frame:', frame.url(), 'dates:', dateMatches, 'calendarWord:', hasCalendar);
              return frame;
            }
          } catch {
            // Ignore
          }
        }
      } catch {
        // Ignore
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
    const html = await context.content();

    // Also extract worker name from the page
    const workerName = await context.evaluate(() => {
      // Try various patterns for worker name
      const bodyText = document.body.textContent || '';
      const nameMatch =
        bodyText.match(/שלום\s+([^\n,]+)/) ||
        bodyText.match(/עובד[:\s]+([^\n]+)/);
      return nameMatch ? nameMatch[1].trim() : '';
    });

    // Parse the HTML using Puppeteer's DOM (real DOMParser!)
    const schedule = await context.evaluate((currentWorkerName) => {
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

    // ── Phase 2: Click each production to get detailed crew with phone numbers ──
    console.log(`Fetching details for ${schedule.productions.length} productions...`);

    for (let i = 0; i < schedule.productions.length; i++) {
      const prod = schedule.productions[i];
      if (!prod.herzliyaId) continue;

      try {
        // Click the production to open detail popup
        const detailedCrew = await context.evaluate(async (hId) => {
          return new Promise((resolve) => {
            // Call the Herzliya openmd2 function
            if (typeof openmd2 === 'function') {
              openmd2(hId);
            } else {
              resolve(null);
              return;
            }

            // Wait for the popup/table to appear
            setTimeout(() => {
              try {
                // Find the popup table - look for the detail modal/table
                const tables = document.querySelectorAll('table');
                let crewData = [];
                let studioName = '';

                for (const table of tables) {
                  // Check if this table is visible and contains crew data
                  const rect = table.getBoundingClientRect();
                  if (rect.width === 0 || rect.height === 0) continue;

                  const rows = table.querySelectorAll('tr');
                  if (rows.length < 2) continue;

                  // Check header to identify the crew table
                  const headerText = rows[0]?.textContent || '';
                  if (!headerText.includes('תפקיד') && !headerText.includes('שם')) continue;

                  // Parse each row (skip header)
                  for (let r = 1; r < rows.length; r++) {
                    const cells = rows[r].querySelectorAll('td');
                    if (cells.length < 3) continue;

                    // Herzliya popup table columns:
                    // תפקיד (role) | שם (name) | פרטים (roleDetail) | מס' (phone) | שעות (times)
                    const cellTexts = Array.from(cells).map(c => c.textContent.trim());

                    let phone = '';
                    let name = '';
                    let role = '';
                    let roleDetail = '';
                    let startTime = '';
                    let endTime = '';

                    if (cells.length >= 5) {
                      // Standard Herzliya format: role | name | roleDetail | phone | times
                      role = cellTexts[0] || '';
                      name = cellTexts[1] || '';
                      roleDetail = cellTexts[2] || '';
                      phone = (cellTexts[3] || '').replace(/\D/g, '');
                      const timeMatch = (cellTexts[4] || '').match(/(\d{1,2}:\d{2})\s*[-–]\s*(\d{1,2}:\d{2})/);
                      if (timeMatch) {
                        startTime = timeMatch[1];
                        endTime = timeMatch[2];
                      }
                    } else if (cells.length >= 4) {
                      role = cellTexts[0] || '';
                      name = cellTexts[1] || '';
                      roleDetail = cellTexts[2] || '';
                      phone = (cellTexts[3] || '').replace(/\D/g, '');
                    } else if (cells.length >= 3) {
                      role = cellTexts[0] || '';
                      name = cellTexts[1] || '';
                      phone = (cellTexts[2] || '').replace(/\D/g, '');
                    }

                    // Format phone: add leading 0 if needed
                    if (phone && phone.length === 9 && !phone.startsWith('0')) {
                      phone = '0' + phone;
                    }

                    if (name && name.length >= 2) {
                      crewData.push({ name, role, roleDetail, phone: phone || '', startTime, endTime });
                    }
                  }

                  if (crewData.length > 0) break; // Found the right table
                }

                // Try to get studio from popup title/header
                const popupTitle = document.querySelector('.modal-title, .popup-title, [class*="title"]');
                if (popupTitle) {
                  const titleText = popupTitle.textContent || '';
                  const stMatch = titleText.match(/(?:אולפן|סטודיו)\s*\d+\w?/i);
                  if (stMatch) studioName = stMatch[0];
                }

                // Close the popup
                const closeBtn = document.querySelector('.close, .modal-close, [onclick*="close"], button[class*="close"]');
                if (closeBtn) closeBtn.click();
                // Also try clicking backdrop
                const backdrop = document.querySelector('.modal-backdrop, .overlay');
                if (backdrop) backdrop.click();
                // Try pressing Escape
                document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));

                resolve({ crew: crewData, studio: studioName });
              } catch (e) {
                resolve(null);
              }
            }, 2000); // Wait 2s for popup to load
          });
        }, prod.herzliyaId);

        if (detailedCrew && detailedCrew.crew && detailedCrew.crew.length > 0) {
          console.log(`  Production ${prod.name}: ${detailedCrew.crew.length} crew with phones`);

          // Merge detailed data into existing crew (normalized match)
          const existingCrew = prod.crew;
          const existingByName = new Map(
            existingCrew.map(c => [normalizeName(c.name), c])
          );
          const mergedCrew = [];

          for (const detail of detailedCrew.crew) {
            const key = normalizeName(detail.name);
            const existing = existingByName.get(key);

            mergedCrew.push({
              name: key || detail.name,
              role: detail.role || (existing ? existing.role : ''),
              roleDetail: detail.roleDetail || (existing ? existing.roleDetail : ''),
              phone: detail.phone || (existing ? existing.phone : '') || '',
              startTime: detail.startTime || (existing ? existing.startTime : ''),
              endTime: detail.endTime || (existing ? existing.endTime : ''),
            });
          }

          // Add any crew from calendar that weren't in the detail popup
          for (const cal of existingCrew) {
            const key = normalizeName(cal.name);
            const inMerged = mergedCrew.find(m => normalizeName(m.name) === key);
            if (!inMerged) {
              mergedCrew.push({
                ...cal,
                name: key || cal.name,
              });
            }
          }

          schedule.productions[i].crew = mergedCrew;
          // Update studio if found
          if (detailedCrew.studio && !prod.studio) {
            schedule.productions[i].studio = detailedCrew.studio;
          }
        }

        // Small delay between clicks
        await new Promise(r => setTimeout(r, 200));

      } catch (err) {
        console.log(`  Skipping detail for ${prod.name}: ${err.message}`);
      }
    }

    console.log('Finished fetching all production details');
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
















