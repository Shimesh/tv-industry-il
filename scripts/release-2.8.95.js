const fs = require('fs');

const file = 'scripts/fetch-schedules.js';
let source = fs.readFileSync(file, 'utf8');
const replaceRequired = (before, after, label) => {
  if (source.includes(after)) return;
  if (!source.includes(before)) throw new Error(`Could not patch ${label}`);
  source = source.replace(before, after);
};

replaceRequired(
  'async function fetchSchedule(browser, url) {',
  `function normalizeProductionLookup(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^\\u05d0-\\u05eaa-z0-9\\s]/g, ' ')
    .replace(/\\b(\\u05e6\\u05d9\\u05dc\\u05d5\\u05dd|\\u05e6\\u05dc\\u05dd|\\u05e6\\u05dc\\u05de\\u05ea|\\u05e6\\u05dc\\u05dd\\s+\\u05e8\\u05d7\\u05e3|\\u05e8\\u05d7\\u05e3)\\b/g, ' ')
    .replace(/\\s+/g, ' ')
    .trim();
}

async function fetchSchedule(browser, url) {`,
  'production lookup normalizer',
);

replaceRequired(
  "    schedule.fetchedAt = new Date().toISOString();\n\n    console.log(`Fetching details for ${schedule.productions.length} productions...`);",
  `    schedule.fetchedAt = new Date().toISOString();

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

      const departmentContext = await findCalendarContext(departmentPage);
      if (!departmentContext) throw new Error('Department calendar not found');
      const departmentDeadline = Date.now() + 12000;
      while (Date.now() < departmentDeadline) {
        const count = await departmentContext.evaluate(() =>
          document.querySelectorAll('.day-cell .event, .day-cell .sat, .sat-cell .event, .sat-cell .sat').length,
        ).catch(() => 0);
        if (count > 0) break;
        await new Promise((resolve) => setTimeout(resolve, 500));
      }

      const departmentEvents = await departmentContext.evaluate(() => {
        const weekDays = Array.from(document.querySelectorAll('.calendar-header > div'))
          .map((div) => {
            const text = div.textContent || '';
            const match = text.match(/(\\d{1,2})\\/(\\d{1,2})\\/(\\d{4})/);
            if (!match) return null;
            return {
              dayName: text.replace(/\\d{1,2}\\/\\d{1,2}\\/\\d{4}/, '').trim(),
              isoDate: match[3] + '-' + String(match[2]).padStart(2, '0') + '-' + String(match[1]).padStart(2, '0'),
            };
          })
          .filter(Boolean);
        const calendarBody = document.querySelector('.calendar-body');
        if (!calendarBody) return [];
        const events = [];
        Array.from(calendarBody.querySelectorAll('.day-cell, .sat-cell')).forEach((cell, dayIndex) => {
          const day = weekDays[dayIndex];
          if (!day) return;
          Array.from(cell.querySelectorAll('.event, .sat')).forEach((eventDiv) => {
            const nameFont = eventDiv.querySelector('font[color="red"], font[color="RED"]');
            const name = (nameFont?.textContent || '').replace(/\\s+/g, ' ').trim();
            if (!name) return;
            const crew = [];
            const parts = (eventDiv.innerHTML || '').split(/<br\\s*\\/?>/i);
            for (let index = 1; index < parts.length; index++) {
              const holder = document.createElement('div');
              holder.innerHTML = parts[index];
              const text = (holder.textContent || '').replace(/\\s+/g, ' ').trim();
              const match = text.match(/^(.+?)\\s*-\\s*(.+?)\\s+(\\d{1,2}:\\d{2})\\s*-?\\s*(\\d{1,2}:\\d{2})/);
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
            if (!crew.length) return;
            events.push({
              name,
              date: day.isoDate,
              day: day.dayName,
              startTime: crew[0].startTime,
              endTime: crew[0].endTime,
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
      console.log('Department crew enrichment:', departmentEnrichedCount + '/' + schedule.productions.length);
    } catch (error) {
      console.warn('Department crew enrichment unavailable:', error.message);
    } finally {
      if (departmentPage) await departmentPage.close().catch(() => {});
    }

    console.log(\`Fetching details for \${schedule.productions.length} productions...\`);`,
  'department crew enrichment',
);

replaceRequired(
  '    if (prod.isCurrentUserShift && currentWorkerName && !sourceCrew.some((member) => normalizeName(member.name) === normalizeName(currentWorkerName))) {',
  '    if (!prod.departmentEnriched && prod.isCurrentUserShift && currentWorkerName && !sourceCrew.some((member) => normalizeName(member.name) === normalizeName(currentWorkerName))) {',
  'authoritative owner handling',
);
replaceRequired(
  "      crewSource: prod.popupParsed ? 'popup' : 'fallback',",
  "      crewSource: prod.departmentEnriched ? 'department' : prod.popupParsed ? 'popup' : 'fallback',",
  'department source marker',
);
replaceRequired(
  '    const existingCrewList = Array.isArray(existingGlobal.crew_list)\n      ? existingGlobal.crew_list.filter((member) => {',
  '    const existingCrewList = !prod.departmentEnriched && Array.isArray(existingGlobal.crew_list)\n      ? existingGlobal.crew_list.filter((member) => {',
  'authoritative global crew',
);
replaceRequired(
  '      popupParsed: !!prod.popupParsed,\n      crewSource:',
  '      popupParsed: !!prod.popupParsed,\n      departmentEnriched: !!prod.departmentEnriched,\n      crewSource:',
  'department persistence',
);

if (!source.includes('departmentEnrichedCount')) throw new Error('Department crew patch failed');
fs.writeFileSync(file, source);

const footer = 'src/components/Footer.tsx';
const footerSource = fs.readFileSync(footer, 'utf8').replace(/v2\.8\.\d+/, 'v2.8.95');
if (!footerSource.includes('v2.8.95')) throw new Error('Footer version update failed');
fs.writeFileSync(footer, footerSource);
