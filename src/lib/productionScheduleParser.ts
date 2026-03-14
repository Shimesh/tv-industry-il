// HTML parser for Herzliya production schedule system
import { Production, CrewMember, ParsedSchedule, generateProductionId, getHebrewDay } from './productionDiff';

// Parse the personal schedule HTML
function parsePersonalHtml(html: string): {
  workerName: string;
  weekStart: string;
  weekEnd: string;
  productions: Partial<Production>[];
} {
  let workerName = '';
  let weekStart = '';
  let weekEnd = '';
  const productions: Partial<Production>[] = [];

  // Extract worker name - look for greeting pattern "שלום [name]" or name in header
  const nameMatch = html.match(/שלום\s+([^<\n,]+)/i) ||
    html.match(/עובד[:\s]+([^<\n]+)/i) ||
    html.match(/<b>([^<]+)<\/b>\s*-?\s*לוח/i);
  if (nameMatch) {
    workerName = nameMatch[1].trim();
  }

  // Extract week dates
  const weekMatch = html.match(/(\d{2}\/\d{2}\/\d{4})\s*[-–]\s*(\d{2}\/\d{2}\/\d{4})/);
  if (weekMatch) {
    weekStart = parseDateDMY(weekMatch[1]);
    weekEnd = parseDateDMY(weekMatch[2]);
  }

  // Try to parse HTML table rows
  // Look for table rows with production data
  const rowRegex = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
  let rowMatch;

  // Track current date context from column headers
  const dateColumns: string[] = [];
  const headerMatch = html.match(/<tr[^>]*class=["']?header["']?[^>]*>([\s\S]*?)<\/tr>/i) ||
    html.match(/<tr[^>]*>([\s\S]*?)<\/tr>/i);

  if (headerMatch) {
    const headerCells = headerMatch[1].match(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi) || [];
    for (const cell of headerCells) {
      const dateInCell = cell.match(/(\d{2}\/\d{2})/);
      if (dateInCell) {
        // Build full date from weekStart year
        const year = weekStart ? weekStart.split('-')[0] : new Date().getFullYear().toString();
        const [day, month] = dateInCell[1].split('/');
        dateColumns.push(`${year}-${month}-${day}`);
      }
    }
  }

  // Parse production entries from table cells
  const cellRegex = /<td[^>]*>([\s\S]*?)<\/td>/gi;
  let cellMatch;
  let cellIndex = 0;

  while ((cellMatch = cellRegex.exec(html)) !== null) {
    const cellContent = cellMatch[1].trim();
    if (!cellContent || cellContent === '&nbsp;') continue;

    // Look for production info patterns
    // Common patterns: "ProductionName\nStudio X\n08:00-16:00"
    const prodMatch = cellContent.replace(/\n/g, '<br>').match(/([^<\n]+?)(?:<br\s*\/?>)[\s\S]*?(?:אולפן|סטודיו|studio)\s*(\d+\w?)(?:<br\s*\/?>)[\s\S]*?(\d{2}:\d{2})\s*[-–]\s*(\d{2}:\d{2})/i);

    if (prodMatch) {
      const name = stripHtml(prodMatch[1]).trim();
      const studio = prodMatch[2];
      const startTime = prodMatch[3];
      const endTime = prodMatch[4];

      // Determine date from column position
      const date = dateColumns[cellIndex % dateColumns.length] || weekStart || '';

      if (name && date) {
        productions.push({
          name,
          studio: `אולפן ${studio}`,
          date,
          startTime,
          endTime,
          status: 'scheduled',
          crew: [],
        });
      }
    }

    cellIndex++;
  }

  // Fallback: text-based parsing if no table rows found
  if (productions.length === 0) {
    const textContent = stripHtml(html);
    const lines = textContent.split(/\n/).map(l => l.trim()).filter(Boolean);

    let currentDate = '';
    for (const line of lines) {
      // Date line detection
      const dateLine = line.match(/(?:יום\s+[א-ש][׳']?\s+)?(\d{2}\/\d{2}(?:\/\d{4})?)/);
      if (dateLine) {
        const dateStr = dateLine[1];
        if (dateStr.length === 5) {
          const year = weekStart ? weekStart.split('-')[0] : new Date().getFullYear().toString();
          const [d, m] = dateStr.split('/');
          currentDate = `${year}-${m}-${d}`;
        } else {
          currentDate = parseDateDMY(dateStr);
        }
        continue;
      }

      // Production line: "Name | Studio X | 08:00-16:00" or similar
      const prodLine = line.match(/(.+?)\s*[|,]\s*(?:אולפן|סטודיו|studio)\s*(\d+\w?)\s*[|,]\s*(\d{2}:\d{2})\s*[-–]\s*(\d{2}:\d{2})/i);
      if (prodLine && currentDate) {
        productions.push({
          name: prodLine[1].trim(),
          studio: `אולפן ${prodLine[2]}`,
          date: currentDate,
          startTime: prodLine[3],
          endTime: prodLine[4],
          status: 'scheduled',
          crew: [],
        });
      }
    }
  }

  return { workerName, weekStart, weekEnd, productions };
}

// Parse department view HTML to extract all crew for all productions
function parseDeptHtml(html: string): Map<string, CrewMember[]> {
  const crewMap = new Map<string, CrewMember[]>(); // key: production name + date

  // Department view typically shows popup tables with crew info
  // Look for crew tables: תפקיד | שם | פרטים | זיד | שעות
  const tableRegex = /<table[^>]*>([\s\S]*?)<\/table>/gi;
  let tableMatch;

  while ((tableMatch = tableRegex.exec(html)) !== null) {
    const tableContent = tableMatch[1];

    // Check if this is a crew table (has role/name headers)
    if (!tableContent.match(/תפקיד|שם\s*עובד|role/i)) continue;

    // Find which production this table belongs to
    // Usually in a preceding header or title
    const precedingHtml = html.substring(Math.max(0, tableMatch.index - 500), tableMatch.index);
    const prodNameMatch = precedingHtml.match(/(?:הפקה|production|תוכנית)[:\s]*([^<\n]+)/i) ||
      precedingHtml.match(/<b>([^<]+)<\/b>\s*$/i) ||
      precedingHtml.match(/<h\d[^>]*>([^<]+)<\/h\d>/i);

    const productionKey = prodNameMatch ? prodNameMatch[1].trim() : 'unknown';

    // Parse crew rows
    const rows = tableContent.match(/<tr[^>]*>([\s\S]*?)<\/tr>/gi) || [];
    const crewList: CrewMember[] = [];

    for (const row of rows) {
      const cells = (row.match(/<td[^>]*>([\s\S]*?)<\/td>/gi) || [])
        .map(c => stripHtml(c.replace(/<td[^>]*>/i, '').replace(/<\/td>/i, '')).trim());

      if (cells.length >= 2) {
        // Try different column orderings
        // Common: [role, name, details, phone, hours]
        const role = cells[0] || '';
        const name = cells[1] || '';

        // Skip header rows
        if (name === 'שם' || name === 'שם עובד' || role === 'תפקיד') continue;
        if (!name || name === '&nbsp;') continue;

        const roleDetail = cells[2] || '';
        const phone = extractPhone(cells[3] || cells[cells.length - 2] || '');
        const timeStr = cells[cells.length - 1] || '';
        const timeMatch = timeStr.match(/(\d{2}:\d{2})\s*[-–]\s*(\d{2}:\d{2})/);

        crewList.push({
          name,
          role,
          roleDetail,
          phone,
          startTime: timeMatch ? timeMatch[1] : '',
          endTime: timeMatch ? timeMatch[2] : '',
        });
      }
    }

    if (crewList.length > 0) {
      const existing = crewMap.get(productionKey) || [];
      crewMap.set(productionKey, [...existing, ...crewList]);
    }
  }

  // Fallback text parsing for crew
  if (crewMap.size === 0) {
    const textContent = stripHtml(html);
    const lines = textContent.split(/\n/).map(l => l.trim()).filter(Boolean);
    let currentProd = 'unknown';
    const crewList: CrewMember[] = [];

    for (const line of lines) {
      // Production header
      const prodHeader = line.match(/^(?:הפקה|תוכנית)[:\s]*(.+)/i);
      if (prodHeader) {
        if (crewList.length > 0) {
          crewMap.set(currentProd, [...crewList]);
          crewList.length = 0;
        }
        currentProd = prodHeader[1].trim();
        continue;
      }

      // Crew line: "Name - Role - 08:00-16:00" or "Role | Name | Phone"
      const crewLine = line.match(/(.+?)\s*[-–|]\s*(.+?)(?:\s*[-–|]\s*(\d{2}:\d{2})\s*[-–]\s*(\d{2}:\d{2}))?$/);
      if (crewLine && crewLine[1] && crewLine[2]) {
        crewList.push({
          name: crewLine[1].trim(),
          role: crewLine[2].trim(),
          roleDetail: '',
          phone: '',
          startTime: crewLine[3] || '',
          endTime: crewLine[4] || '',
        });
      }
    }

    if (crewList.length > 0) {
      crewMap.set(currentProd, crewList);
    }
  }

  return crewMap;
}

// Main parse function
export function parseScheduleHTML(
  personalHtml: string,
  deptHtml: string
): ParsedSchedule {
  const personal = parsePersonalHtml(personalHtml);
  const crewMap = parseDeptHtml(deptHtml);

  // Merge crew into productions
  const productions: Production[] = personal.productions.map(p => {
    const name = p.name || '';
    const date = p.date || '';
    const studio = p.studio || '';

    // Try to find matching crew from department view
    const crewKey = Array.from(crewMap.keys()).find(key =>
      key.includes(name) || name.includes(key)
    );
    const crew = crewKey ? crewMap.get(crewKey) || [] : (p.crew || []);

    const prod: Production = {
      id: generateProductionId(name, date, studio),
      name,
      studio,
      date,
      day: date ? getHebrewDay(date) : '',
      startTime: p.startTime || '',
      endTime: p.endTime || '',
      status: (p.status as Production['status']) || 'scheduled',
      crew,
    };

    return prod;
  });

  // Add any productions from dept view not in personal view
  for (const [prodKey, crew] of crewMap) {
    const alreadyExists = productions.some(p =>
      p.name === prodKey || prodKey.includes(p.name) || p.name.includes(prodKey)
    );
    if (!alreadyExists && prodKey !== 'unknown') {
      productions.push({
        id: generateProductionId(prodKey, personal.weekStart, ''),
        name: prodKey,
        studio: '',
        date: personal.weekStart,
        day: personal.weekStart ? getHebrewDay(personal.weekStart) : '',
        startTime: '',
        endTime: '',
        status: 'scheduled',
        crew,
      });
    }
  }

  return {
    workerName: personal.workerName,
    weekStart: personal.weekStart,
    weekEnd: personal.weekEnd,
    productions,
  };
}

// Parse demo/manual text input (for when the URL is unavailable)
export function parseManualText(text: string): ParsedSchedule {
  const lines = text.split(/\n/).map(l => l.trim()).filter(Boolean);
  const productions: Production[] = [];
  let workerName = '';
  let weekStart = '';
  let weekEnd = '';
  let currentDate = '';

  // Try to extract name from greeting
  const nameMatch = text.match(/שלום\s+([^\n,]+)/);
  if (nameMatch) workerName = nameMatch[1].trim();

  // Try to extract week range
  const weekMatch = text.match(/(\d{2}\/\d{2}\/\d{4})\s*[-–]\s*(\d{2}\/\d{2}\/\d{4})/);
  if (weekMatch) {
    weekStart = parseDateDMY(weekMatch[1]);
    weekEnd = parseDateDMY(weekMatch[2]);
  }

  for (const line of lines) {
    // Date header: "יום א׳ 15/03" or "15/03/2026" or "Sunday 15/03"
    const dateMatch = line.match(/(?:יום\s+[א-שׁ][׳']*\s+)?(\d{1,2}\/\d{1,2}(?:\/\d{2,4})?)/);
    if (dateMatch && !line.match(/\d{2}:\d{2}/)) {
      const dateStr = dateMatch[1];
      if (dateStr.includes('/')) {
        const parts = dateStr.split('/');
        const day = parts[0].padStart(2, '0');
        const month = parts[1].padStart(2, '0');
        const year = parts[2] || (weekStart ? weekStart.split('-')[0] : new Date().getFullYear().toString());
        const fullYear = year.length === 2 ? `20${year}` : year;
        currentDate = `${fullYear}-${month}-${day}`;
      }
      continue;
    }

    // Production line detection
    // Pattern: "ProductionName | Studio X | 08:00-16:00"
    // Or: "ProductionName, אולפן 5, 08:00-16:00"
    const prodPattern = line.match(
      /^(.+?)\s*[|,،]\s*(?:אולפן|סטודיו|studio|st\.?)\s*(\d+\w?)\s*[|,،]\s*(\d{1,2}:\d{2})\s*[-–]\s*(\d{1,2}:\d{2})/i
    );

    if (prodPattern && currentDate) {
      const name = prodPattern[1].trim();
      const studio = `אולפן ${prodPattern[2]}`;
      const startTime = prodPattern[3];
      const endTime = prodPattern[4];

      productions.push({
        id: generateProductionId(name, currentDate, studio),
        name,
        studio,
        date: currentDate,
        day: getHebrewDay(currentDate),
        startTime,
        endTime,
        status: 'scheduled',
        crew: [],
      });
      continue;
    }

    // Simpler pattern: "08:00-16:00 ProductionName אולפן 5"
    const altPattern = line.match(
      /(\d{1,2}:\d{2})\s*[-–]\s*(\d{1,2}:\d{2})\s+(.+?)\s+(?:אולפן|סטודיו)\s*(\d+\w?)/i
    );

    if (altPattern && currentDate) {
      const startTime = altPattern[1];
      const endTime = altPattern[2];
      const name = altPattern[3].trim();
      const studio = `אולפן ${altPattern[4]}`;

      productions.push({
        id: generateProductionId(name, currentDate, studio),
        name,
        studio,
        date: currentDate,
        day: getHebrewDay(currentDate),
        startTime,
        endTime,
        status: 'scheduled',
        crew: [],
      });
    }
  }

  return { workerName, weekStart, weekEnd, productions };
}

// Helpers
function stripHtml(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .trim();
}

function parseDateDMY(dateStr: string): string {
  const [day, month, year] = dateStr.split('/');
  return `${year}-${month}-${day}`;
}

function extractPhone(text: string): string {
  const phoneMatch = text.match(/(0\d{1,2}[-\s]?\d{7,8})/);
  return phoneMatch ? phoneMatch[1].replace(/\s/g, '') : '';
}
