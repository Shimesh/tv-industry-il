// HTML parser for Herzliya production schedule system
// Completely flexible - handles pasted text, HTML, tab-separated, any format
import { Production, CrewMember, ParsedSchedule, generateProductionId, getHebrewDay } from './productionDiff';

// Hebrew day names for detection
const HEBREW_DAYS = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת'];
const SHORT_DAYS = ['א', 'ב', 'ג', 'ד', 'ה', 'ו'];

// Check if a string is a day name
function isDayName(s: string): boolean {
  const clean = s.replace(/[׳']/g, '').trim();
  if (clean === 'שבת') return true;
  if (/^יום\s+/.test(clean)) return true;
  for (const d of HEBREW_DAYS) {
    if (clean.includes(d)) return true;
  }
  for (const d of SHORT_DAYS) {
    if (clean === `יום ${d}` || clean === d) return true;
  }
  return false;
}

// Extract date from string (DD/MM/YYYY or DD/MM)
function extractDate(s: string, defaultYear: string): string | null {
  const match = s.match(/(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?/);
  if (!match) return null;
  const day = match[1].padStart(2, '0');
  const month = match[2].padStart(2, '0');
  let year = match[3] || defaultYear;
  if (year.length === 2) year = `20${year}`;
  return `${year}-${month}-${day}`;
}

// Extract time range from string
function extractTimeRange(s: string): { start: string; end: string } | null {
  const match = s.match(/(\d{1,2}:\d{2})\s*[-–]\s*(\d{1,2}:\d{2})/);
  if (!match) return null;
  return { start: match[1], end: match[2] };
}

// Extract studio from string
function extractStudio(s: string): string | null {
  // "אולפן 5" / "אולפן 5B" / "סטודיו 7" / "st. 5" / just "5B" in context
  const match = s.match(/(?:אולפן|סטודיו|studio|st\.?)\s*(\d+\w?)/i);
  if (match) return `אולפן ${match[1]}`;
  // Standalone studio number like "5B" or "OB" patterns
  const standaloneMatch = s.match(/^(\d+[A-Za-z]?)$/);
  if (standaloneMatch) return `אולפן ${standaloneMatch[1]}`;
  return null;
}

// Check if line looks like a production name (not a date, time, studio, or day)
function looksLikeProductionName(s: string): boolean {
  const clean = s.trim();
  if (!clean || clean.length < 2) return false;
  if (isDayName(clean)) return false;
  if (extractDate(clean, '2026')) return false;
  if (extractTimeRange(clean)) return false;
  if (extractStudio(clean)) return false;
  if (/^\d+$/.test(clean)) return false;
  if (clean === 'אתר' || clean === ':' || clean === '[אתר : ]') return false;
  if (/^[-–=_\s]+$/.test(clean)) return false;
  // Skip very short single characters
  if (clean.length <= 1) return false;
  return true;
}

// ====== MAIN PARSER: handles any pasted text ======
export function parseManualText(text: string): ParsedSchedule {
  let workerName = '';
  let weekStart = '';
  let weekEnd = '';
  const defaultYear = new Date().getFullYear().toString();

  // Extract worker name
  const nameMatch = text.match(/שלום\s+([^\n,<]+)/) ||
    text.match(/עובד[:\s]+([^\n<]+)/);
  if (nameMatch) workerName = nameMatch[1].trim();

  // Extract week range
  const weekMatch = text.match(/(\d{1,2}\/\d{1,2}\/\d{4})\s*[-–]\s*(\d{1,2}\/\d{1,2}\/\d{4})/);
  if (weekMatch) {
    weekStart = extractDate(weekMatch[1], defaultYear) || '';
    weekEnd = extractDate(weekMatch[2], defaultYear) || '';
  }

  const yearHint = weekStart ? weekStart.split('-')[0] : defaultYear;

  // Try tab-separated (TSV) parsing first - this is how browser tables copy
  const tsvResult = parseTSV(text, yearHint);
  if (tsvResult.length > 0) {
    if (!weekStart && tsvResult.length > 0) {
      // Infer week from first production date
      const firstDate = tsvResult[0].date;
      if (firstDate) {
        const d = new Date(firstDate);
        const day = d.getDay();
        const sunday = new Date(d);
        sunday.setDate(d.getDate() - day);
        weekStart = sunday.toISOString().split('T')[0];
        const saturday = new Date(sunday);
        saturday.setDate(sunday.getDate() + 6);
        weekEnd = saturday.toISOString().split('T')[0];
      }
    }
    return { workerName, weekStart, weekEnd, productions: tsvResult };
  }

  // Line-by-line parsing - flexible multi-line production detection
  const lineResult = parseLineByLine(text, yearHint);
  if (lineResult.length > 0) {
    if (!weekStart && lineResult.length > 0) {
      const firstDate = lineResult[0].date;
      if (firstDate) {
        const d = new Date(firstDate);
        const day = d.getDay();
        const sunday = new Date(d);
        sunday.setDate(d.getDate() - day);
        weekStart = sunday.toISOString().split('T')[0];
        const saturday = new Date(sunday);
        saturday.setDate(sunday.getDate() + 6);
        weekEnd = saturday.toISOString().split('T')[0];
      }
    }
    return { workerName, weekStart, weekEnd, productions: lineResult };
  }

  // Last resort: find ANY time patterns and try to build productions around them
  const timeResult = parseByTimePatterns(text, yearHint);
  if (timeResult.length > 0) {
    if (!weekStart && timeResult.length > 0) {
      const firstDate = timeResult[0].date;
      if (firstDate) {
        const d = new Date(firstDate);
        const day = d.getDay();
        const sunday = new Date(d);
        sunday.setDate(d.getDate() - day);
        weekStart = sunday.toISOString().split('T')[0];
        const saturday = new Date(sunday);
        saturday.setDate(sunday.getDate() + 6);
        weekEnd = saturday.toISOString().split('T')[0];
      }
    }
    return { workerName, weekStart, weekEnd, productions: timeResult };
  }

  return { workerName, weekStart, weekEnd, productions: [] };
}

// Strategy 1: Tab-separated data (from copying browser tables)
function parseTSV(text: string, yearHint: string): Production[] {
  const lines = text.split(/\n/);
  const productions: Production[] = [];

  // Check if any line has tabs
  const hasTabLines = lines.filter(l => l.includes('\t'));
  if (hasTabLines.length < 2) return []; // Not TSV format

  // Find header row with dates
  const dateColumns: string[] = [];
  let dataStartRow = 0;

  for (let i = 0; i < Math.min(lines.length, 5); i++) {
    const cells = lines[i].split('\t').map(c => c.trim());

    // Check if this row contains dates
    let datesFound = 0;
    for (const cell of cells) {
      const date = extractDate(cell, yearHint);
      if (date) {
        dateColumns.push(date);
        datesFound++;
      }
    }
    if (datesFound >= 3) {
      dataStartRow = i + 1;
      break;
    }

    // Check if this row contains day names
    let daysFound = 0;
    for (const cell of cells) {
      if (isDayName(cell)) daysFound++;
    }
    if (daysFound >= 3 && dateColumns.length === 0) {
      // Next row probably has dates
      continue;
    }
  }

  if (dateColumns.length === 0) return [];

  // Parse data rows
  for (let i = dataStartRow; i < lines.length; i++) {
    const cells = lines[i].split('\t').map(c => c.trim());

    for (let col = 0; col < cells.length && col < dateColumns.length; col++) {
      const cellContent = cells[col];
      if (!cellContent) continue;

      // Try to extract production info from cell
      const time = extractTimeRange(cellContent);
      const studio = extractStudio(cellContent);

      // Multi-value cell: might have "Name\nStudio\nTime" joined with spaces/special chars
      const parts = cellContent.split(/\s{2,}|[\n\r]+/).map(p => p.trim()).filter(Boolean);

      let prodName = '';
      let prodStudio = '';
      let prodStart = '';
      let prodEnd = '';

      for (const part of parts) {
        const t = extractTimeRange(part);
        if (t) {
          prodStart = t.start;
          prodEnd = t.end;
          continue;
        }
        const s = extractStudio(part);
        if (s) {
          prodStudio = s;
          continue;
        }
        if (looksLikeProductionName(part) && !prodName) {
          prodName = part;
        }
      }

      // If we got at least a name, create a production
      if (prodName || (time && studio)) {
        productions.push({
          id: generateProductionId(prodName || 'הפקה', dateColumns[col], prodStudio),
          name: prodName || 'הפקה',
          studio: prodStudio || (studio || ''),
          date: dateColumns[col],
          day: getHebrewDay(dateColumns[col]),
          startTime: prodStart || (time?.start || ''),
          endTime: prodEnd || (time?.end || ''),
          status: 'scheduled',
          crew: [],
        });
      }
    }
  }

  return productions;
}

// Strategy 2: Line-by-line parsing - track date context, group adjacent lines
function parseLineByLine(text: string, yearHint: string): Production[] {
  // Normalize: replace tabs with newlines, collapse multiple newlines
  const normalized = text
    .replace(/\t/g, '\n')
    .replace(/\r\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n');

  const lines = normalized.split('\n').map(l => l.trim());
  const productions: Production[] = [];

  let currentDate = '';
  let pendingName = '';
  let pendingStudio = '';
  let pendingStart = '';
  let pendingEnd = '';

  const flushPending = () => {
    if (pendingName && currentDate) {
      productions.push({
        id: generateProductionId(pendingName, currentDate, pendingStudio),
        name: pendingName,
        studio: pendingStudio,
        date: currentDate,
        day: getHebrewDay(currentDate),
        startTime: pendingStart,
        endTime: pendingEnd,
        status: 'scheduled',
        crew: [],
      });
    }
    pendingName = '';
    pendingStudio = '';
    pendingStart = '';
    pendingEnd = '';
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!line) {
      // Empty line might separate productions
      if (pendingName) flushPending();
      continue;
    }

    // Check for date (standalone date line)
    const dateOnly = extractDate(line, yearHint);
    if (dateOnly && !extractTimeRange(line)) {
      // This is a date line - might also have day name
      if (pendingName) flushPending();
      currentDate = dateOnly;
      continue;
    }

    // Check for day name only
    if (isDayName(line) && !extractTimeRange(line)) {
      if (pendingName) flushPending();
      continue;
    }

    // Check for combined line: "ProductionName | אולפן 5 | 08:00-16:00"
    const combinedMatch = line.match(
      /^(.+?)\s*[|,،\t]\s*(?:אולפן|סטודיו|studio)\s*(\d+\w?)\s*[|,،\t]\s*(\d{1,2}:\d{2})\s*[-–]\s*(\d{1,2}:\d{2})/i
    );
    if (combinedMatch && currentDate) {
      if (pendingName) flushPending();
      productions.push({
        id: generateProductionId(combinedMatch[1].trim(), currentDate, `אולפן ${combinedMatch[2]}`),
        name: combinedMatch[1].trim(),
        studio: `אולפן ${combinedMatch[2]}`,
        date: currentDate,
        day: getHebrewDay(currentDate),
        startTime: combinedMatch[3],
        endTime: combinedMatch[4],
        status: 'scheduled',
        crew: [],
      });
      continue;
    }

    // Check for time range on this line
    const timeRange = extractTimeRange(line);
    if (timeRange) {
      // Check if line also has production name and/or studio
      const lineWithoutTime = line.replace(/\d{1,2}:\d{2}\s*[-–]\s*\d{1,2}:\d{2}/, '').trim();
      const studioInLine = extractStudio(lineWithoutTime);
      const nameInLine = lineWithoutTime.replace(/(?:אולפן|סטודיו|studio)\s*\d+\w?/i, '').trim();

      if (nameInLine && looksLikeProductionName(nameInLine)) {
        if (pendingName) flushPending();
        pendingName = nameInLine;
      }
      if (studioInLine) pendingStudio = studioInLine;
      pendingStart = timeRange.start;
      pendingEnd = timeRange.end;

      // If we already have a name from a previous line, this completes it
      if (pendingName) {
        flushPending();
      }
      continue;
    }

    // Check for studio
    const studio = extractStudio(line);
    if (studio) {
      pendingStudio = studio;
      // Check if the rest of the line has a name
      const rest = line.replace(/(?:אולפן|סטודיו|studio)\s*\d+\w?/i, '').trim();
      if (rest && looksLikeProductionName(rest) && !pendingName) {
        pendingName = rest;
      }
      continue;
    }

    // If it looks like a production name
    if (looksLikeProductionName(line) && currentDate) {
      // If we have a pending production, flush it first
      if (pendingName && (pendingStart || pendingStudio)) {
        flushPending();
      }
      // Start new pending production
      if (!pendingName) {
        pendingName = line;
      }
    }
  }

  // Flush any remaining pending production
  flushPending();

  return productions;
}

// Strategy 3: Find all time patterns and build productions around them
function parseByTimePatterns(text: string, yearHint: string): Production[] {
  const productions: Production[] = [];
  const normalized = text.replace(/\t/g, '\n').replace(/\r/g, '');
  const lines = normalized.split('\n').map(l => l.trim());

  // Find all dates in the text
  const datePositions: { date: string; lineIdx: number }[] = [];
  for (let i = 0; i < lines.length; i++) {
    const date = extractDate(lines[i], yearHint);
    if (date && !extractTimeRange(lines[i])) {
      datePositions.push({ date, lineIdx: i });
    }
  }

  // Find all time ranges
  const timePositions: { start: string; end: string; lineIdx: number }[] = [];
  for (let i = 0; i < lines.length; i++) {
    const time = extractTimeRange(lines[i]);
    if (time) {
      timePositions.push({ ...time, lineIdx: i });
    }
  }

  // For each time, find the nearest date before it, and look for name/studio nearby
  for (const timePos of timePositions) {
    // Find nearest date before this time
    let nearestDate = '';
    for (const datePos of datePositions) {
      if (datePos.lineIdx <= timePos.lineIdx) {
        nearestDate = datePos.date;
      }
    }
    if (!nearestDate) continue;

    // Look for production name and studio in nearby lines (±3 lines)
    let name = '';
    let studio = '';

    for (let offset = -3; offset <= 3; offset++) {
      const idx = timePos.lineIdx + offset;
      if (idx < 0 || idx >= lines.length) continue;
      if (idx === timePos.lineIdx) {
        // Check current line for name/studio after removing time
        const rest = lines[idx].replace(/\d{1,2}:\d{2}\s*[-–]\s*\d{1,2}:\d{2}/, '').trim();
        const s = extractStudio(rest);
        if (s) studio = s;
        const nameRest = rest.replace(/(?:אולפן|סטודיו|studio)\s*\d+\w?/i, '').trim();
        if (nameRest && looksLikeProductionName(nameRest)) name = nameRest;
        continue;
      }

      const lineContent = lines[idx];
      if (!studio) {
        const s = extractStudio(lineContent);
        if (s) studio = s;
      }
      if (!name && looksLikeProductionName(lineContent)) {
        name = lineContent;
      }
    }

    if (name || studio) {
      productions.push({
        id: generateProductionId(name || 'הפקה', nearestDate, studio),
        name: name || 'הפקה',
        studio,
        date: nearestDate,
        day: getHebrewDay(nearestDate),
        startTime: timePos.start,
        endTime: timePos.end,
        status: 'scheduled',
        crew: [],
      });
    }
  }

  return productions;
}

// ====== HTML PARSER ======
export function parseScheduleHTML(
  personalHtml: string,
  deptHtml: string
): ParsedSchedule {
  // First try: if it's not actually HTML, use text parser
  if (!personalHtml.includes('<') || !personalHtml.includes('>')) {
    return parseManualText(personalHtml);
  }

  const defaultYear = new Date().getFullYear().toString();
  let workerName = '';
  let weekStart = '';
  let weekEnd = '';

  // Extract worker name
  const nameMatch = personalHtml.match(/שלום\s+([^<\n,]+)/i) ||
    personalHtml.match(/עובד[:\s]+([^<\n]+)/i) ||
    personalHtml.match(/<b>([^<]+)<\/b>\s*-?\s*לוח/i);
  if (nameMatch) workerName = nameMatch[1].trim();

  // Extract week dates
  const weekMatch = personalHtml.match(/(\d{1,2}\/\d{1,2}\/\d{4})\s*[-–]\s*(\d{1,2}\/\d{1,2}\/\d{4})/);
  if (weekMatch) {
    weekStart = extractDate(weekMatch[1], defaultYear) || '';
    weekEnd = extractDate(weekMatch[2], defaultYear) || '';
  }

  const yearHint = weekStart ? weekStart.split('-')[0] : defaultYear;

  // Strip HTML to text and parse with the flexible text parser
  const textContent = stripHtml(personalHtml);
  const textResult = parseManualText(
    (workerName ? `שלום ${workerName}\n` : '') +
    (weekStart && weekEnd ? `${formatDateBack(weekStart)} - ${formatDateBack(weekEnd)}\n` : '') +
    textContent
  );

  if (textResult.productions.length > 0) {
    return textResult;
  }

  // Try HTML table parsing
  const productions = parseHtmlTables(personalHtml, yearHint);

  // Parse department view for crew
  const crewMap = deptHtml ? parseDeptHtml(deptHtml) : new Map<string, CrewMember[]>();

  // Merge crew into productions
  for (const prod of productions) {
    const crewKey = Array.from(crewMap.keys()).find(key =>
      key.includes(prod.name) || prod.name.includes(key)
    );
    if (crewKey) {
      prod.crew = crewMap.get(crewKey) || [];
    }
  }

  return {
    workerName: workerName || textResult.workerName,
    weekStart: weekStart || textResult.weekStart,
    weekEnd: weekEnd || textResult.weekEnd,
    productions,
  };
}

// Parse HTML tables directly
function parseHtmlTables(html: string, yearHint: string): Production[] {
  const productions: Production[] = [];

  // Find all dates in the HTML (likely in header row)
  const dateColumns: string[] = [];
  const allDates = html.match(/\d{1,2}\/\d{1,2}(?:\/\d{2,4})?/g) || [];
  for (const d of allDates) {
    const date = extractDate(d, yearHint);
    if (date && !dateColumns.includes(date)) {
      dateColumns.push(date);
    }
  }

  // Find table cells with production-like content
  const cellRegex = /<td[^>]*>([\s\S]*?)<\/td>/gi;
  let cellMatch;
  let colIndex = 0;

  while ((cellMatch = cellRegex.exec(html)) !== null) {
    const cellHtml = cellMatch[1];
    const cellText = stripHtml(cellHtml).trim();
    if (!cellText || cellText.length < 2) {
      colIndex++;
      continue;
    }

    // Look for time range in cell
    const time = extractTimeRange(cellText);
    if (time) {
      const studio = extractStudio(cellText);
      const nameText = cellText
        .replace(/\d{1,2}:\d{2}\s*[-–]\s*\d{1,2}:\d{2}/, '')
        .replace(/(?:אולפן|סטודיו|studio)\s*\d+\w?/i, '')
        .trim();

      const date = dateColumns[colIndex % dateColumns.length] || dateColumns[0] || '';
      if (date) {
        productions.push({
          id: generateProductionId(nameText || 'הפקה', date, studio || ''),
          name: nameText || 'הפקה',
          studio: studio || '',
          date,
          day: getHebrewDay(date),
          startTime: time.start,
          endTime: time.end,
          status: 'scheduled',
          crew: [],
        });
      }
    }

    colIndex++;
  }

  return productions;
}

// Parse department HTML for crew info
function parseDeptHtml(html: string): Map<string, CrewMember[]> {
  const crewMap = new Map<string, CrewMember[]>();

  const tableRegex = /<table[^>]*>([\s\S]*?)<\/table>/gi;
  let tableMatch;

  while ((tableMatch = tableRegex.exec(html)) !== null) {
    const tableContent = tableMatch[1];
    if (!tableContent.match(/תפקיד|שם\s*עובד|role/i)) continue;

    const precedingHtml = html.substring(Math.max(0, tableMatch.index - 500), tableMatch.index);
    const prodNameMatch = precedingHtml.match(/(?:הפקה|production|תוכנית)[:\s]*([^<\n]+)/i) ||
      precedingHtml.match(/<b>([^<]+)<\/b>\s*$/i);
    const productionKey = prodNameMatch ? prodNameMatch[1].trim() : 'unknown';

    const rows = tableContent.match(/<tr[^>]*>([\s\S]*?)<\/tr>/gi) || [];
    const crewList: CrewMember[] = [];

    for (const row of rows) {
      const cells = (row.match(/<td[^>]*>([\s\S]*?)<\/td>/gi) || [])
        .map(c => stripHtml(c.replace(/<td[^>]*>/i, '').replace(/<\/td>/i, '')).trim());

      if (cells.length >= 2) {
        const role = cells[0] || '';
        const name = cells[1] || '';
        if (name === 'שם' || name === 'שם עובד' || role === 'תפקיד') continue;
        if (!name) continue;

        const roleDetail = cells[2] || '';
        const phone = extractPhone(cells[3] || cells[cells.length - 2] || '');
        const timeStr = cells[cells.length - 1] || '';
        const timeMatch = extractTimeRange(timeStr);

        crewList.push({
          name,
          role,
          roleDetail,
          phone,
          startTime: timeMatch?.start || '',
          endTime: timeMatch?.end || '',
        });
      }
    }

    if (crewList.length > 0) {
      crewMap.set(productionKey, crewList);
    }
  }

  return crewMap;
}

// ====== HELPERS ======
function stripHtml(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/tr>/gi, '\n')
    .replace(/<\/td>/gi, '\t')
    .replace(/<\/th>/gi, '\t')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#\d+;/g, '')
    .trim();
}

function extractPhone(text: string): string {
  const phoneMatch = text.match(/(0\d{1,2}[-\s]?\d{3}[-\s]?\d{4})/);
  return phoneMatch ? phoneMatch[1].replace(/[-\s]/g, '') : '';
}

function formatDateBack(isoDate: string): string {
  const [y, m, d] = isoDate.split('-');
  return `${d}/${m}/${y}`;
}
