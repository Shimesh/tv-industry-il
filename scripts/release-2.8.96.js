const fs = require('fs');
const file = 'scripts/fetch-schedules.js';
let source = fs.readFileSync(file, 'utf8');
const before = `      const departmentContext = await findCalendarContext(departmentPage);
      if (!departmentContext) throw new Error('Department calendar not found');
      const departmentDeadline = Date.now() + 12000;
      while (Date.now() < departmentDeadline) {
        const count = await departmentContext.evaluate(() =>
          document.querySelectorAll('.day-cell .event, .day-cell .sat, .sat-cell .event, .sat-cell .sat').length,
        ).catch(() => 0);
        if (count > 0) break;
        await new Promise((resolve) => setTimeout(resolve, 500));
      }

      const departmentEvents = await departmentContext.evaluate(() => {`;
const after = `      const departmentDeadline = Date.now() + 15000;
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

      const departmentEvents = await departmentContext.evaluate(() => {`;
if (!source.includes(after)) {
  if (!source.includes(before)) throw new Error('Could not patch department frame selection');
  source = source.replace(before, after);
}
source = source.replace(
  "        const calendarBody = document.querySelector('.calendar-body');\n        if (!calendarBody) return [];",
  "        const calendarBody = document.querySelector('.calendar-body') || document;",
);
source = source.replace(
  "      console.log('Department crew enrichment:', departmentEnrichedCount + '/' + schedule.productions.length);",
  "      console.log('Department events parsed:', departmentEvents.length);\n      console.log('Department crew enrichment:', departmentEnrichedCount + '/' + schedule.productions.length);",
);
if (!source.includes('departmentEventCount') || !source.includes('Department events parsed:')) {
  throw new Error('Frame-aware department patch failed');
}
fs.writeFileSync(file, source);
const footer = 'src/components/Footer.tsx';
const footerSource = fs.readFileSync(footer, 'utf8').replace(/v2\.8\.\d+/, 'v2.8.96');
if (!footerSource.includes('v2.8.96')) throw new Error('Footer version update failed');
fs.writeFileSync(footer, footerSource);
