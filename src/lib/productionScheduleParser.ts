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

/**
 * Extract the base URL (mgrqispi.dll endpoint) of the Herzliya scheduling system.
 * Returns something like "https://hsil.acc.co.il:5443/magicscripts/mgrqispi.dll"
 */
export function extractHerzliyaBaseUrl(html: string): string {
  // Look for mgrqispi.dll in form actions, hrefs, or src attributes
  const patterns = [
    /action=["'](https?:\/\/[^"']*mgrqispi\.dll[^"']*)["']/i,
    /(?:href|src)=["'](https?:\/\/[^"']*mgrqispi\.dll[^"']*)["']/i,
    /["'](https?:\/\/[^"']*magicscripts[^"']*mgrqispi\.dll[^"']*)["']/i,
  ];
  for (const pattern of patterns) {
    const m = html.match(pattern);
    if (m) {
      try {
        const u = new URL(m[1]);
        return `${u.protocol}//${u.host}${u.pathname}`;
      } catch { /* try next */ }
    }
  }
  // Fallback: look for just the host+port from any hsil/magicscripts URL
  const hostMatch = html.match(/["'](https?:\/\/[^"'/]+\/magicscripts\/mgrqispi\.dll)/i);
  if (hostMatch) return hostMatch[1];
  return '';
}

/**
 * Build the URL for the Herzliya crew popup (ShowCrew endpoint).
 * Confirmed URL pattern from DevTools:
 * https://hsil.acc.co.il:5443/magicscripts/mgrqispi.dll?appname=HsILWeb&prgname=ShowCrew&arguments=-N{id}
 */
export function buildHerzliyaPopupUrl(baseUrl: string, herzliyaId: number): string {
  if (!baseUrl || !herzliyaId) return '';
  const url = new URL(baseUrl);
  url.searchParams.set('appname', 'HsILWeb');
  url.searchParams.set('prgname', 'ShowCrew');
  url.searchParams.set('arguments', `-N${herzliyaId}`);
  return url.toString();
}

/**
 * Extract herzliyaId → production name pairs from Herzliya calendar HTML using regex.
 * Works server-side (no DOMParser needed).
 */
export function extractHerzliyaEventIds(html: string): Array<{ herzliyaId: number; name: string }> {
  const results: Array<{ herzliyaId: number; name: string }> = [];
  const chunks = html.split(/onclick=["']openmd2\(/);
  for (let i = 1; i < chunks.length; i++) {
    const idMatch = chunks[i].match(/^(\d+)\)/);
    if (!idMatch) continue;
    const herzliyaId = parseInt(idMatch[1]);
    const nameMatch = chunks[i].match(/<font[^>]*color=["']?red["']?[^>]*>(.*?)<\/font>/i);
    const name = nameMatch ? nameMatch[1].replace(/<[^>]+>/g, '').trim() : '';
    if (herzliyaId && name) results.push({ herzliyaId, name });
  }
  return results;
}

/** Shared HTML stripper for popup header parsing */
function stripPopupHtml(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<\/tr>/gi, '\n')
    .replace(/<\/td>/gi, '\t')
    .replace(/<\/th>/gi, '\t')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .trim();
}

/** Parse popup header line into [name, studio, isoDate] — returns null if not found */
function parsePopupHeader(html: string): { studio: string; isoDate: string } | null {
  const text = stripPopupHtml(html);
  for (const line of text.split('\n')) {
    const parts = line.split('\t').map(p => p.replace(/\s+/g, ' ').trim()).filter(Boolean);
    const dateIdx = parts.findIndex(p => /\d{1,2}\/\d{1,2}\/\d{4}/.test(p));
    if (dateIdx >= 2) {
      const dm = parts[dateIdx].match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
      if (dm) return {
        studio: parts[dateIdx - 1],
        isoDate: `${dm[3]}-${dm[2].padStart(2,'0')}-${dm[1].padStart(2,'0')}`,
      };
    }
    if (parts.length === 1 && parts[0].includes('|')) {
      const segs = parts[0].split('|').map(s => s.trim()).filter(Boolean);
      const di = segs.findIndex(s => /\d{1,2}\/\d{1,2}\/\d{4}/.test(s));
      if (di >= 2) {
        const dm = segs[di].match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
        if (dm) return {
          studio: segs[di - 1],
          isoDate: `${dm[3]}-${dm[2].padStart(2,'0')}-${dm[1].padStart(2,'0')}`,
        };
      }
    }
  }
  return null;
}

/** Extract the ISO date (YYYY-MM-DD) from a Herzliya ShowCrew popup header */
export function extractDateFromPopup(html: string): string {
  return parsePopupHeader(html)?.isoDate || '';
}

/**
 * Extract studio/location from the Herzliya popup header row.
 * The popup header format is: [Production Name] | [Studio/Location] | [Date dd/mm/yyyy] | [Time]
 * Uses the same HTML-stripping strategy as parseHerzliyaPopupText (handles nested tables).
 */
export function extractStudioFromPopup(html: string): string {
  if (!html) return '';
  const header = parsePopupHeader(html);
  if (header) return header.studio;

  // Legacy fallback (kept for safety)
  const text = stripPopupHtml(html);

  for (const line of text.split('\n')) {
    const parts = line.split('\t').map(p => p.replace(/\s+/g, ' ').trim()).filter(Boolean);

    // Find a cell that contains a date in dd/mm/yyyy format
    const dateIdx = parts.findIndex(p => /\d{1,2}\/\d{1,2}\/\d{4}/.test(p));

    if (dateIdx >= 2) {
      // The cell just before the date is the studio/location
      return parts[dateIdx - 1];
    }

    // Handle case where all 4 values are in a single cell separated by " | "
    if (parts.length === 1 && parts[0].includes('|')) {
      const segs = parts[0].split('|').map(s => s.trim()).filter(Boolean);
      const di = segs.findIndex(s => /\d{1,2}\/\d{1,2}\/\d{4}/.test(s));
      if (di >= 2) return segs[di - 1];
    }
  }

  return '';
}

/**
 * Parse the Herzliya popup HTML (openmd2 detail modal) to extract full crew list.
 * The popup is a table with columns: phone, name, role, time.
 */
export function parseHerzliyaPopupHtml(html: string): Array<{ name: string; role: string; phone: string; startTime: string; endTime: string }> {
  if (!html || typeof DOMParser === 'undefined') return parseHerzliyaPopupText(html);

  const parser = new DOMParser();
  const doc = parser.parseFromString(html, 'text/html');
  const rows = doc.querySelectorAll('tr');
  const crew: Array<{ name: string; role: string; phone: string; startTime: string; endTime: string }> = [];

  rows.forEach(row => {
    const cells = row.querySelectorAll('td');
    if (cells.length < 2) return;

    // Try to identify columns by content pattern
    const texts = Array.from(cells).map(c => c.textContent?.trim() || '');

    // Heuristic: find the cell with a Hebrew name (2+ Hebrew chars)
    const nameIdx = texts.findIndex(t => /[א-ת]{2,}/.test(t) && t.length >= 2);
    if (nameIdx === -1) return;

    const name = texts[nameIdx];
    const role = texts[nameIdx + 1] || '';
    const phone = texts.find(t => /^0\d{8,9}$/.test(t.replace(/[-\s]/g, ''))) || '';
    const times = texts.flatMap(t => t.match(/\d{1,2}:\d{2}/g) || []);
    const [startTime, endTime] = times.length >= 2 ? [times[0], times[1]] : [times[0] || '', ''];

    if (name.length >= 2) {
      crew.push({ name, role: role.replace(/\d{1,2}:\d{2}.*/g, '').trim(), phone: phone.replace(/[-\s]/g, ''), startTime, endTime });
    }
  });

  return crew;
}

/** Fallback: parse popup text (server-side, no DOMParser) */
function parseHerzliyaPopupText(html: string): Array<{ name: string; role: string; phone: string; startTime: string; endTime: string }> {
  const crew: Array<{ name: string; role: string; phone: string; startTime: string; endTime: string }> = [];
  const text = html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/tr>/gi, '\n')
    .replace(/<\/td>/gi, '\t')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .trim();

  for (const line of text.split('\n')) {
    const parts = line.split('\t').map(p => p.trim()).filter(Boolean);
    if (parts.length < 2) continue;
    const phoneIdx = parts.findIndex(p => /^0\d{8,9}$/.test(p.replace(/[-\s]/g, '')));
    const nameIdx = parts.findIndex(p => /[א-ת]{2,}/.test(p));
    if (nameIdx === -1) continue;
    const name = parts[nameIdx];
    const role = parts[nameIdx + 1] && !/\d{1,2}:\d{2}/.test(parts[nameIdx + 1]) ? parts[nameIdx + 1] : '';
    const phone = phoneIdx !== -1 ? parts[phoneIdx].replace(/[-\s]/g, '') : '';
    const times = parts.flatMap(p => p.match(/\d{1,2}:\d{2}/g) || []);
    crew.push({ name, role, phone, startTime: times[0] || '', endTime: times[1] || '' });
  }
  return crew;
}


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

  // Extract injected popup crew data (if available from browserFetch enrichment)
  let popupCrewData: Record<number, string> = {};
  const popupMatch = html.match(/<!-- POPUP_CREW_DATA:([\s\S]+?) -->/);
  if (popupMatch) {
    try { popupCrewData = JSON.parse(popupMatch[1]); } catch { /* ignore */ }
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

      // Enrich crew from popup data (openmd2) if available — gives full list + phones
      if (herzliyaId && popupCrewData[herzliyaId]) {
        const popupCrew = parseHerzliyaPopupHtml(popupCrewData[herzliyaId]);
        for (const pc of popupCrew) {
          const exists = crew.find(c => c.name === pc.name);
          if (!exists) {
            crew.push({ ...pc, roleDetail: '', isCurrentUser: matchesUserName(pc.name, currentUserName) });
          } else if (!exists.phone && pc.phone) {
            // Enrich existing entry with phone number from popup
            exists.phone = pc.phone;
          }
        }
      }

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
      const rest = line.replace(time, '').replace(/\t+/g, ' ').replace(/\s{2,}/g, ' ').trim();
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

/** Extract crew and times from the HTML content after the production name font tag */
function parseEventCrewFromHtml(chunk: string): { crew: CrewMember[]; startTime: string; endTime: string } {
  const crew: CrewMember[] = [];
  let startTime = '';
  let endTime = '';
  const afterFontIdx = chunk.search(/<\/font>/i);
  const afterFont = afterFontIdx !== -1 ? chunk.slice(afterFontIdx + 7) : chunk;

  for (const part of afterFont.split(/<br\s*\/?>/i)) {
    const text = part.replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').trim();
    if (!text || text.length < 2) continue;
    const m1 = text.match(/^(.+?)\s*[-–]\s*(.+?)\s+(\d{1,2}:\d{2})\s*[-–]?\s*(\d{1,2}:\d{2})/);
    if (m1) {
      if (!startTime) { startTime = m1[3]; endTime = m1[4]; }
      crew.push({ name: m1[1].trim(), role: m1[2].trim(), roleDetail: '', phone: '', startTime: m1[3], endTime: m1[4], isCurrentUser: false });
      continue;
    }
    const m2 = text.match(/^(.+?)\s*[-–]\s*(.+)$/);
    if (m2 && /[א-ת]/.test(m2[1])) {
      crew.push({ name: m2[1].trim(), role: m2[2].replace(/\d{1,2}:\d{2}.*/g, '').trim(), roleDetail: '', phone: '', startTime: '', endTime: '', isCurrentUser: false });
    }
  }
  return { crew, startTime, endTime };
}

/**
 * Parse Herzliya schedule HTML using regex — no DOMParser needed (server-side safe).
 * Strategy 1: split by .day-cell/.sat-cell boundaries, assign calendar-header dates by index.
 * Strategy 2 fallback: extract all openmd2 events in order and assign dates by position.
 */
function parseHerzliyaHTMLServer(html: string): ParsedSchedule {
  const headerStart = html.indexOf('calendar-header');
  const bodyStart = html.indexOf('calendar-body');
  if (headerStart === -1 || bodyStart === -1 || headerStart > bodyStart) {
    return { workerName: '', weekStart: '', weekEnd: '', productions: [] };
  }

  // Worker name
  let workerName = '';
  const nameM = html.match(/שלום\s+([^<\n,]+)/) || html.match(/עובד[:\s]+([^<\n]+)/);
  if (nameM) workerName = nameM[1].trim();

  // Weekday dates from the header section (Sun … Sat in order)
  const headerHtml = html.slice(headerStart, bodyStart);
  const weekDays: Array<{ isoDate: string }> = [];
  for (const m of headerHtml.matchAll(/(\d{1,2})\/(\d{1,2})\/(\d{4})/g)) {
    weekDays.push({ isoDate: `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}` });
  }
  if (weekDays.length === 0) return { workerName: '', weekStart: '', weekEnd: '', productions: [] };

  const bodyHtml = html.slice(bodyStart);
  const productions: Production[] = [];

  // ── Strategy 1: split by day/sat cell tags (handles any element type) ──
  // Matches any opening tag with class containing day-cell or sat-cell
  const cellTagRe = /<[^/!>][^>]*class=["'][^"']*(?:day-cell|sat-cell)[^"']*["'][^>]*>/gi;
  const cellMatches = [...bodyHtml.matchAll(cellTagRe)];

  if (cellMatches.length > 0) {
    cellMatches.forEach((match, dayIdx) => {
      if (dayIdx >= weekDays.length) return;
      const { isoDate } = weekDays[dayIdx];
      const cellStart = match.index! + match[0].length;
      const cellEnd = dayIdx + 1 < cellMatches.length ? cellMatches[dayIdx + 1].index! : bodyHtml.length;
      const cellHtml = bodyHtml.slice(cellStart, cellEnd);

      for (const chunk of cellHtml.split(/onclick=["']openmd2\(/)) {
        if (chunk === cellHtml) continue; // first segment (before first onclick)
        const idM = chunk.match(/^(\d+)\)/);
        if (!idM) continue;
        const herzliyaId = parseInt(idM[1]);
        const nameM2 = chunk.match(/<font[^>]*color=["']?red["']?[^>]*>(.*?)<\/font>/i);
        const rawName = nameM2 ? nameM2[1].replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').trim() : '';
        if (!rawName) continue;
        const studioM = rawName.match(/(?:אולפן|סטודיו|studio|st\.?)\s*\d+\w?/i);
        const studio = studioM ? studioM[0].trim() : '';
        const name = studio ? rawName.replace(studioM![0], '').replace(/\s{2,}/g, ' ').trim() : rawName;
        const { crew, startTime, endTime } = parseEventCrewFromHtml(chunk);
        productions.push({ id: generateProductionId(name, isoDate, studio), name, studio, date: isoDate, day: getHebrewDay(isoDate), startTime, endTime, status: 'scheduled', crew, herzliyaId });
      }
    });
  }

  // ── Strategy 2 fallback: if no cells matched, assign events to days by round-robin ──
  // This handles cases where day-cell divs have unusual attributes or tag types.
  if (productions.length === 0) {
    const allEventChunks = bodyHtml.split(/onclick=["']openmd2\(/);
    const eventsPerDay = Math.ceil((allEventChunks.length - 1) / weekDays.length) || 1;
    let dayIdx = 0;
    for (let i = 1; i < allEventChunks.length; i++) {
      // Advance day when we estimate we've consumed that day's events
      if (i > 1 && (i - 1) % eventsPerDay === 0 && dayIdx + 1 < weekDays.length) dayIdx++;
      const chunk = allEventChunks[i];
      const idM = chunk.match(/^(\d+)\)/);
      if (!idM) continue;
      const herzliyaId = parseInt(idM[1]);
      const nameM2 = chunk.match(/<font[^>]*color=["']?red["']?[^>]*>(.*?)<\/font>/i);
      const rawName = nameM2 ? nameM2[1].replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').trim() : '';
      if (!rawName) continue;
      const isoDate = weekDays[dayIdx]?.isoDate || weekDays[0].isoDate;
      const studioM = rawName.match(/(?:אולפן|סטודיו|studio|st\.?)\s*\d+\w?/i);
      const studio = studioM ? studioM[0].trim() : '';
      const name = studio ? rawName.replace(studioM![0], '').replace(/\s{2,}/g, ' ').trim() : rawName;
      const { crew, startTime, endTime } = parseEventCrewFromHtml(chunk);
      productions.push({ id: generateProductionId(name, isoDate, studio), name, studio, date: isoDate, day: getHebrewDay(isoDate), startTime, endTime, status: 'scheduled', crew, herzliyaId });
    }
  }

  const weekStart = weekDays[0]?.isoDate || '';
  const weekEnd = weekDays[weekDays.length - 1]?.isoDate || '';
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

  // Server-side: regex-based Herzliya parser (works without DOMParser)
  if (isHerzliyaHTML(personalHtml)) {
    const result = parseHerzliyaHTMLServer(personalHtml);
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
