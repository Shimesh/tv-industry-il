// Parser for Herzliya production schedule system
// Handles pasted text from Ctrl+A, Ctrl+C of the schedule web page
//
// Herzliya format (when pasted):
//   שלום [worker name]
//   לוח עבודה לתאריכים DD/MM/YYYY - DD/MM/YYYY
//
//   DD/MM/YYYY                          ← date header
//   END_TIME  START_TIME  PROD_NAME  STUDIO   ← production (2 time values)
//   CrewName - Role                     ← crew member (dash separator)
//   CrewName - Role - StartTime - EndTime
//
//   DD/MM/YYYY                          ← next date
//   ...

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

/** Check if a line is a date header. Returns DD/MM/YYYY string or null. */
function extractDateHeader(line: string): string | null {
  const trimmed = line.trim();
  // Must NOT contain time patterns (HH:MM) – that would be a production line
  if (/\d{1,2}:\d{2}/.test(trimmed)) return null;

  // Match DD/MM/YYYY possibly followed by day name, whitespace, etc.
  const dateMatch = trimmed.match(/^(\d{1,2}\/\d{1,2}\/\d{4})/);
  if (dateMatch) return dateMatch[1];

  return null;
}

/** Find all HH:MM time patterns in a string */
function findTimes(line: string): string[] {
  return [...line.matchAll(/\b(\d{1,2}:\d{2})\b/g)].map(m => m[1]);
}

/** Extract studio from text. Returns studio name and remaining text. */
function extractStudio(text: string): { studio: string; remaining: string } {
  // "אולפן 5" / "אולפן 5B" / "סטודיו 7" / "studio 5" / "st. 5"
  const match = text.match(/(?:אולפן|סטודיו|studio|st\.?)\s*(\d+\w?)/i);
  if (match) {
    return {
      studio: match[0].trim(),
      remaining: text.replace(match[0], '').trim(),
    };
  }
  return { studio: '', remaining: text };
}

/** Check if a line is a crew member (has dash/en-dash separator, starts with a name) */
function isCrewLine(line: string): boolean {
  const trimmed = line.trim();
  // Must NOT start with a time pattern (production lines start with times)
  if (/^\d{1,2}:\d{2}/.test(trimmed)) return false;
  // Must have a dash separator surrounded by whitespace
  if (!/\s+[-–—]\s+/.test(trimmed) && !/\t[-–—]\t/.test(trimmed)) return false;

  const parts = trimmed.split(/\s+[-–—]\s+|\t[-–—]\t/);
  if (parts.length < 2) return false;

  const name = parts[0].trim();
  // Name must be ≥ 2 chars and contain Hebrew letters
  return name.length >= 2 && /[א-ת]/.test(name);
}

/** Parse a crew member from a line like "שם - תפקיד" or "שם - תפקיד - 08:00 - 16:00" */
function parseCrewMember(line: string): CrewMember | null {
  const parts = line.split(/\s+[-–—]\s+|\t[-–—]\t/);
  const name = parts[0]?.trim();
  if (!name || name.length < 2 || !/[א-ת]/.test(name)) return null;

  const role = parts[1]?.trim() || '';
  let startTime = '';
  let endTime = '';

  // Look for times in remaining parts
  for (let i = 2; i < parts.length; i++) {
    const timeMatch = parts[i].trim().match(/^(\d{1,2}:\d{2})$/);
    if (timeMatch) {
      if (!startTime) startTime = timeMatch[1];
      else if (!endTime) endTime = timeMatch[1];
    }
  }

  // Also try extracting phone
  const phoneMatch = line.match(/(0\d{1,2}[-\s]?\d{3}[-\s]?\d{4})/);
  const phone = phoneMatch ? phoneMatch[1].replace(/[-\s]/g, '') : '';

  return { name, role, roleDetail: '', phone, startTime, endTime };
}

/** Check if line is a header/noise line to skip */
function isHeaderLine(line: string): boolean {
  if (line.match(/שלום\s+/)) return true;
  if (line.match(/עובד[:\s]+/)) return true;
  if (line.match(/לוח\s*עבודה/)) return true;
  // Week range line "DD/MM/YYYY - DD/MM/YYYY"
  if (line.match(/\d{1,2}\/\d{1,2}\/\d{4}\s*[-–]\s*\d{1,2}\/\d{1,2}\/\d{4}/)) return true;
  // Pure separator lines
  if (/^[-–=_\s*]+$/.test(line)) return true;
  // Very short non-meaningful lines
  if (line.length <= 1) return true;
  return false;
}

// ────────── Main Parsers ──────────

/** Parse pasted text from the Herzliya schedule system */
export function parseManualText(text: string): ParsedSchedule {
  let workerName = '';
  let weekStart = '';
  let weekEnd = '';

  // Normalize line endings
  const normalizedText = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const lines = normalizedText.split('\n');

  // ── Pre-pass: extract worker name & week range ──
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

  // ── Main pass: parse productions line by line ──
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

    // Skip known header/noise lines
    if (isHeaderLine(line)) continue;

    // ── 1. Date header? ──
    const dateStr = extractDateHeader(line);
    if (dateStr) {
      flushProduction();
      currentDate = convertDateToISO(dateStr);
      continue;
    }

    // ── 2. Crew member? (dash separator, starts with Hebrew name, NOT a time) ──
    if (isCrewLine(line) && currentProduction) {
      const crew = parseCrewMember(line);
      if (crew) {
        // Avoid duplicate crew members in the same production
        const exists = currentProduction.crew.find(c => c.name === crew.name);
        if (!exists) {
          currentProduction.crew.push(crew);
        }
      }
      continue;
    }

    // ── 3. Production line? (has 2+ time values under a known date) ──
    const times = findTimes(line);
    if (times.length >= 2 && currentDate) {
      flushProduction();

      // Herzliya format: first time = end, second = start
      const endTime = times[0];
      const startTime = times[1];

      // Remove ALL time patterns to get production name + studio
      let rest = line;
      for (const t of times) {
        rest = rest.replace(t, '');
      }
      // Clean up leftover separators/whitespace
      rest = rest.replace(/\t+/g, ' ').replace(/\s{2,}/g, ' ').trim();

      // Extract studio
      const { studio, remaining } = extractStudio(rest);

      // Clean up name
      let name = remaining
        .replace(/^[\s\-–|,.:]+|[\s\-–|,.:]+$/g, '')
        .replace(/\s{2,}/g, ' ')
        .trim();

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

    // ── 4. Single-time line (fallback: production with only one time shown) ──
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
      continue;
    }

    // Lines that don't match any pattern are silently skipped
  }

  // Flush remaining production
  flushProduction();

  // ── Infer week range if not found ──
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

/** Parse HTML from the schedule system (strips tags → delegates to text parser) */
export function parseScheduleHTML(personalHtml: string, deptHtml: string): ParsedSchedule {
  // If not HTML, use text parser directly
  if (!personalHtml.includes('<') || !personalHtml.includes('>')) {
    return parseManualText(personalHtml);
  }

  // Strip HTML → plain text → parse
  const textContent = stripHtml(personalHtml);
  const result = parseManualText(textContent);

  // If we got productions and there's a dept HTML, enhance with dept crew data
  if (result.productions.length > 0 && deptHtml) {
    const deptText = stripHtml(deptHtml);
    const deptResult = parseManualText(deptText);

    // Merge crew from dept view into matching productions
    for (const deptProd of deptResult.productions) {
      const matchingProd = result.productions.find(
        p => p.name === deptProd.name && p.date === deptProd.date
      );
      if (matchingProd && deptProd.crew.length > 0) {
        for (const crew of deptProd.crew) {
          const exists = matchingProd.crew.find(c => c.name === crew.name);
          if (!exists) {
            matchingProd.crew.push(crew);
          }
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
