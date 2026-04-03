// Parser for Herzliya production schedule system
// Primary: DOMParser-based HTML parser for the real Herzliya calendar structure
// Fallback: Text parser for Ctrl+A, Ctrl+C pasted plain text

import { Production, CrewMember, ParsedSchedule, generateProductionId, getHebrewDay } from './productionDiff';

// ────────── Helpers ──────────

/** Convert DD/MM/YYYY → YYYY-MM-DD */
function convertDateToISO(dateStr: string): string {
  const match = dateStr.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (!match) return '';
  const day = match[1].padStart(2, '0');
  const month = match[2].padStart(2, '0');
  const year = match[3];
  return `${year}-${month}-${day}`;
}

/** Sort two time strings: returns [earlier, later] */
function sortTimes(t1: string, t2: string): [string, string] {
  const toMinutes = (t: string) => {
    const [h, m] = t.split(':').map(Number);
    return h * 60 + m;
  };
  return toMinutes(t1) <= toMinutes(t2) ? [t1, t2] : [t2, t1];
}

/** Extract studio from production name */
function extractStudioFromName(name: string): { studio: string; remaining: string } {
  const match = name.match(/(?:אולפן|סטודיו|studio|st\.?)\s*(\d+\w?)/i);
  if (match) {
    return {
      studio: match[0].trim(),
      remaining: name.replace(match[0], '').replace(/\s{2,}/g, ' ').trim(),
    };
  }
  return { studio: '', remaining: name };
}

/** Check if HTML string is from the Herzliya schedule system */
export function isHerzliyaHTML(text: string): boolean {
  return (
    text.includes('calendar-body') ||
    text.includes('calendar-header') ||
    text.includes('openmd2') ||
    text.includes('day-cell') ||
    text.includes('sat-cell')
  );
}

// ════════════════════════════════════════════
// PRIMARY PARSER: DOMParser-based HTML parser
// ════════════════════════════════════════════

/** Parse Herzliya schedule HTML using browser DOMParser */
export function parseHerzliyaHTML(html: string, currentUserName?: string): ParsedSchedule {
  // Guard: DOMParser only available in browser
  if (typeof DOMParser === 'undefined') {
    return parseScheduleHTML(html, '');
  }

  // Quick check: is this actually Herzliya HTML?
  if (!isHerzliyaHTML(html)) {
    return parseScheduleHTML(html, '');
  }

  const parser = new DOMParser();
  const doc = parser.parseFromString(html, 'text/html');

  // ── Step 1: Extract dates from calendar header ──
  const headerDivs = doc.querySelectorAll('.calendar-header > div');
  const weekDays: { dayName: string; isoDate: string }[] = [];

  headerDivs.forEach(div => {
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
    // No calendar header found – fall back to text parser
    return parseScheduleHTML(html, '');
  }

  // ── Step 2: Extract worker name ──
  let workerName = '';
  const bodyText = doc.body?.textContent || '';
  const nameMatch = bodyText.match(/שלום\s+([^\n,]+)/) || bodyText.match(/עובד[:\s]+([^\n]+)/);
  if (nameMatch) {
    workerName = nameMatch[1].trim();
  }

  // ── Step 3: Extract productions from day cells ──
  const calendarBody = doc.querySelector('.calendar-body');
  if (!calendarBody) {
    return parseScheduleHTML(html, '');
  }

  const dayCells = calendarBody.querySelectorAll('.day-cell, .sat-cell');
  const productions: Production[] = [];

  dayCells.forEach((cell, dayIndex) => {
    const dayInfo = weekDays[dayIndex];
    if (!dayInfo) return;

    const eventDivs = cell.querySelectorAll('.event, .sat');

    eventDivs.forEach(eventDiv => {
      // Get production ID from onclick
      const onclickAttr = eventDiv.getAttribute('onclick') || '';
      const idMatch = onclickAttr.match(/openmd2\((\d+)\)/);
      const herzliyaId = idMatch ? parseInt(idMatch[1]) : 0;

      // Skip empty placeholders (id=0)
      if (herzliyaId === 0) return;

      // Check if this is current user's highlighted shift (.sat class on the event)
      const isHighlightedShift = eventDiv.classList.contains('sat');

      // Get production name from red font
      const nameFont = eventDiv.querySelector('font[color="red"], font[color="RED"]');
      const rawProductionName = nameFont?.textContent?.trim() || '';
      if (!rawProductionName) return;

      // Parse crew from innerHTML (split by <br>)
      const innerHTML = eventDiv.innerHTML;
      const parts = innerHTML.split(/<br\s*\/?>/i);

      const crew: CrewMember[] = [];
      let productionStartTime = '';
      let productionEndTime = '';

      // Skip first part (production name in <font> tag)
      for (let i = 1; i < parts.length; i++) {
        const text = parts[i].replace(/<[^>]+>/g, '').trim();
        if (!text) continue;

        // Try full crew format: "name - role time1 time2"
        // or "name - role time1 -time2"
        const crewWithTimes = text.match(
          /^(.+?)\s*-\s*(.+?)\s+(\d{1,2}:\d{2})\s*-?\s*(\d{1,2}:\d{2})/
        );

        if (crewWithTimes) {
          const memberName = crewWithTimes[1].trim();
          const role = crewWithTimes[2].trim();
          const time1 = crewWithTimes[3];
          const time2 = crewWithTimes[4];
          const [s, e] = sortTimes(time1, time2);

          // Set production times from first crew member
          if (!productionStartTime) {
            productionStartTime = s;
            productionEndTime = e;
          }

          // Check if this is the current user
          const isCrewCurrentUser = matchesUserName(memberName, currentUserName);

          crew.push({
            name: memberName,
            role,
            roleDetail: '',
            phone: '',
            startTime: s,
            endTime: e,
            isCurrentUser: isCrewCurrentUser,
          });
          continue;
        }

        // Try crew without times: "name - role"
        const crewNoTimes = text.match(/^(.+?)\s*-\s*(.+)$/);
        if (crewNoTimes) {
          const memberName = crewNoTimes[1].trim();
          const role = crewNoTimes[2].trim();

          if (memberName.length >= 2 && /[א-ת]/.test(memberName)) {
            crew.push({
              name: memberName,
              role,
              roleDetail: '',
              phone: '',
              startTime: '',
              endTime: '',
              isCurrentUser: matchesUserName(memberName, currentUserName),
            });
          }
        }
      }

      // Extract studio from name
      const { studio, remaining: cleanName } = extractStudioFromName(rawProductionName);
      const finalName = cleanName || rawProductionName;

      // Determine isCurrentUserShift
      const isCurrentUserShift = isHighlightedShift || crew.some(c => c.isCurrentUser);

      productions.push({
        id: generateProductionId(finalName, dayInfo.isoDate, studio),
        herzliyaId,
        name: finalName,
        studio,
        date: dayInfo.isoDate,
        day: dayInfo.dayName || getHebrewDay(dayInfo.isoDate),
        startTime: productionStartTime,
        endTime: productionEndTime,
        status: 'scheduled',
        crew,
        isCurrentUserShift,
      });
    });
  });

  const weekStart = weekDays[0]?.isoDate || '';
  const weekEnd = weekDays[weekDays.length - 1]?.isoDate || '';

  return { workerName, weekStart, weekEnd, productions };
}

/** Fuzzy match crew member name against current user name */
function matchesUserName(crewName: string, currentUserName?: string): boolean {
  if (!currentUserName) return false;
  if (crewName === currentUserName) return true;

  const crewParts = crewName.trim().split(/\s+/);
  const userParts = currentUserName.trim().split(/\s+/);

  // If both have first+last name, require exact match only (already checked above)
  // Only use first-name-only matching when crew entry has a single word (no last name)
  if (crewParts.length === 1 && userParts.length >= 1) {
    return crewParts[0] === userParts[0] && crewParts[0].length >= 2;
  }
  if (userParts.length === 1 && crewParts.length >= 1) {
    return crewParts[0] === userParts[0] && crewParts[0].length >= 2;
  }

  return false;
}

// ════════════════════════════════════════
// FALLBACK: Text-based parser
// ════════════════════════════════════════

/** Find all HH:MM time patterns in a string */
function findTimes(line: string): string[] {
  return [...line.matchAll(/\b(\d{1,2}:\d{2})\b/g)].map(m => m[1]);
}

/** Extract studio from text */
function extractStudio(text: string): { studio: string; remaining: string } {
  const match = text.match(/(?:אולפן|סטודיו|studio|st\.?)\s*(\d+\w?)/i);
  if (match) {
    return { studio: match[0].trim(), remaining: text.replace(match[0], '').trim() };
  }
  return { studio: '', remaining: text };
}

/** Check if line is a date header */
function extractDateHeader(line: string): string | null {
  const trimmed = line.trim();
  if (/\d{1,2}:\d{2}/.test(trimmed)) return null;
  const dateMatch = trimmed.match(/^(\d{1,2}\/\d{1,2}\/\d{4})/);
  return dateMatch ? dateMatch[1] : null;
}

/** Check if line is a crew member */
function isCrewLine(line: string): boolean {
  const trimmed = line.trim();
  if (/^\d{1,2}:\d{2}/.test(trimmed)) return false;
  if (!/\s+[-–—]\s+/.test(trimmed) && !/\t[-–—]\t/.test(trimmed)) return false;
  const parts = trimmed.split(/\s+[-–—]\s+|\t[-–—]\t/);
  if (parts.length < 2) return false;
  const name = parts[0].trim();
  return name.length >= 2 && /[א-ת]/.test(name);
}

/** Parse crew member from text line */
function parseCrewMember(line: string): CrewMember | null {
  const parts = line.split(/\s+[-–—]\s+|\t[-–—]\t/);
  const name = parts[0]?.trim();
  if (!name || name.length < 2 || !/[א-ת]/.test(name)) return null;

  const role = parts[1]?.trim() || '';
  let startTime = '';
  let endTime = '';

  for (let i = 2; i < parts.length; i++) {
    const timeMatch = parts[i].trim().match(/^(\d{1,2}:\d{2})$/);
    if (timeMatch) {
      if (!startTime) startTime = timeMatch[1];
      else if (!endTime) endTime = timeMatch[1];
    }
  }

  const phoneMatch = line.match(/(0\d{1,2}[-\s]?\d{3}[-\s]?\d{4})/);
  const phone = phoneMatch ? phoneMatch[1].replace(/[-\s]/g, '') : '';

  return { name, role, roleDetail: '', phone, startTime, endTime };
}

/** Check if line is header/noise */
function isHeaderLine(line: string): boolean {
  if (line.match(/שלום\s+/)) return true;
  if (line.match(/עובד[:\s]+/)) return true;
  if (line.match(/לוח\s*עבודה/)) return true;
  if (line.match(/\d{1,2}\/\d{1,2}\/\d{4}\s*[-–]\s*\d{1,2}\/\d{1,2}\/\d{4}/)) return true;
  if (/^[-–=_\s*]+$/.test(line)) return true;
  if (line.length <= 1) return true;
  return false;
}

/** Parse pasted plain text from the schedule system */
export function parseManualText(text: string): ParsedSchedule {
  let workerName = '';
  let weekStart = '';
  let weekEnd = '';

  const normalizedText = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const lines = normalizedText.split('\n');

  // Pre-pass: extract worker name & week range
  for (const line of lines) {
    if (!workerName) {
      const nameMatch = line.match(/שלום\s+([^\n,<]+)/) || line.match(/עובד[:\s]+([^\n<]+)/);
      if (nameMatch) workerName = nameMatch[1].trim();
    }
    if (!weekStart) {
      const weekMatch = line.match(/(\d{1,2}\/\d{1,2}\/\d{4})\s*[-–]\s*(\d{1,2}\/\d{1,2}\/\d{4})/);
      if (weekMatch) {
        weekStart = convertDateToISO(weekMatch[1]);
        weekEnd = convertDateToISO(weekMatch[2]);
      }
    }
    if (workerName && weekStart) break;
  }

  // Main pass: parse productions
  let currentDate = '';
  let currentProduction: Production | null = null;
  const productions: Production[] = [];

  const flushProduction = () => {
    if (currentProduction) {
      productions.push(currentProduction);
      currentProduction = null;
    }
  };

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;
    if (isHeaderLine(line)) continue;

    // 1. Date header?
    const dateStr = extractDateHeader(line);
    if (dateStr) {
      flushProduction();
      currentDate = convertDateToISO(dateStr);
      continue;
    }

    // 2. Crew member?
    if (isCrewLine(line) && currentProduction) {
      const crew = parseCrewMember(line);
      if (crew) {
        const exists = currentProduction.crew.find(c => c.name === crew.name);
        if (!exists) currentProduction.crew.push(crew);
      }
      continue;
    }

    // 3. Production line (2+ times)?
    const times = findTimes(line);
    if (times.length >= 2 && currentDate) {
      flushProduction();

      const endTime = times[0];
      const startTime = times[1];

      let rest = line;
      for (const t of times) rest = rest.replace(t, '');
      rest = rest.replace(/\t+/g, ' ').replace(/\s{2,}/g, ' ').trim();

      const { studio, remaining } = extractStudio(rest);
      let name = remaining.replace(/^[\s\-–|,.:]+|[\s\-–|,.:]+$/g, '').replace(/\s{2,}/g, ' ').trim();
      if (!name) name = 'הפקה';

      currentProduction = {
        id: generateProductionId(name, currentDate, studio),
        name,
        studio,
        date: currentDate,
        day: getHebrewDay(currentDate),
        startTime,
        endTime,
        status: 'scheduled',
        crew: [],
      };
      continue;
    }

    // 4. Single-time fallback
    if (times.length === 1 && currentDate && !currentProduction) {
      const time = times[0];
      let rest = line.replace(time, '').replace(/\t+/g, ' ').replace(/\s{2,}/g, ' ').trim();
      const { studio, remaining } = extractStudio(rest);
      const name = remaining.replace(/^[\s\-–|,.:]+|[\s\-–|,.:]+$/g, '').trim();
      if (name && name.length >= 2) {
        currentProduction = {
          id: generateProductionId(name, currentDate, studio),
          name,
          studio,
          date: currentDate,
          day: getHebrewDay(currentDate),
          startTime: time,
          endTime: '',
          status: 'scheduled',
          crew: [],
        };
      }
    }
  }

  flushProduction();

  // Infer week range
  if (!weekStart && productions.length > 0) {
    const dates = productions.map(p => p.date).sort();
    const firstDate = new Date(dates[0]);
    const day = firstDate.getDay();
    const sunday = new Date(firstDate);
    sunday.setDate(firstDate.getDate() - day);
    weekStart = sunday.toISOString().split('T')[0];
    const saturday = new Date(sunday);
    saturday.setDate(sunday.getDate() + 6);
    weekEnd = saturday.toISOString().split('T')[0];
  }

  return { workerName, weekStart, weekEnd, productions };
}

/** Parse HTML by stripping tags → text parser (server-side compatible) */
export function parseScheduleHTML(personalHtml: string, deptHtml: string): ParsedSchedule {
  if (!personalHtml.includes('<') || !personalHtml.includes('>')) {
    return parseManualText(personalHtml);
  }

  // Try DOMParser first (browser only)
  if (typeof DOMParser !== 'undefined' && isHerzliyaHTML(personalHtml)) {
    const result = parseHerzliyaHTML(personalHtml);
    if (result.productions.length > 0) return result;
  }

  // Fallback: strip HTML → text parser
  const textContent = stripHtml(personalHtml);
  const result = parseManualText(textContent);

  if (result.productions.length > 0 && deptHtml) {
    const deptText = stripHtml(deptHtml);
    const deptResult = parseManualText(deptText);
    for (const deptProd of deptResult.productions) {
      const matchingProd = result.productions.find(
        p => p.name === deptProd.name && p.date === deptProd.date
      );
      if (matchingProd && deptProd.crew.length > 0) {
        for (const crew of deptProd.crew) {
          const exists = matchingProd.crew.find(c => c.name === crew.name);
          if (!exists) matchingProd.crew.push(crew);
        }
      }
    }
  }

  return result;
}

// ────────── HTML → Text ──────────

function stripHtml(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/tr>/gi, '\n')
    .replace(/<\/td>/gi, '\t')
    .replace(/<\/th>/gi, '\t')
    .replace(/<\/p>/gi, '\n')
    .replace(/<\/div>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#\d+;/g, '')
    .trim();
}
