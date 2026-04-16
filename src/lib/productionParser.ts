import * as XLSX from 'xlsx';
import { contacts } from '@/data/contacts';
import {
  ParsedProduction,
  CrewAssignment,
  columnMappings,
  roleDepartmentMap,
} from '@/data/productions';

/**
 * Parse an uploaded file (Excel or CSV) into production records
 */
export function parseProductionFile(file: File): Promise<ParsedProduction[]> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = (e) => {
      try {
        const data = e.target?.result;
        if (!data) {
          reject(new Error('לא ניתן לקרוא את הקובץ'));
          return;
        }

        const workbook = XLSX.read(data, { type: 'array', cellDates: true });
        const sheetName = workbook.SheetNames[0];
        const sheet = workbook.Sheets[sheetName];
        const rawRows: Record<string, unknown>[] = XLSX.utils.sheet_to_json(sheet, { defval: '' });

        if (rawRows.length === 0) {
          reject(new Error('הקובץ ריק - לא נמצאו שורות'));
          return;
        }

        const productions = parseRows(rawRows);
        resolve(productions);
      } catch (err) {
        reject(new Error(`שגיאה בקריאת הקובץ: ${err instanceof Error ? err.message : 'שגיאה לא ידועה'}`));
      }
    };

    reader.onerror = () => reject(new Error('שגיאה בקריאת הקובץ'));
    reader.readAsArrayBuffer(file);
  });
}

/**
 * Map raw column headers to known field names
 */
function mapColumns(headers: string[]): Record<string, string> {
  const mapping: Record<string, string> = {};

  for (const header of headers) {
    const normalized = header.trim().toLowerCase();

    // Direct match
    if (columnMappings[header.trim()]) {
      mapping[header] = columnMappings[header.trim()];
      continue;
    }
    if (columnMappings[normalized]) {
      mapping[header] = columnMappings[normalized];
      continue;
    }

    // Partial match for crew columns (e.g., "צלם 1", "צלם ראשי")
    for (const [key, value] of Object.entries(columnMappings)) {
      if (normalized.includes(key.toLowerCase()) && value.startsWith('crew_')) {
        mapping[header] = value;
        break;
      }
    }
  }

  return mapping;
}

/**
 * Parse raw rows into production objects
 */
function parseRows(rawRows: Record<string, unknown>[]): ParsedProduction[] {
  const headers = Object.keys(rawRows[0]);
  const colMap = mapColumns(headers);
  const productions: ParsedProduction[] = [];

  for (const row of rawRows) {
    const production: ParsedProduction = {
      name: '',
      date: '',
      startTime: '',
      endTime: '',
      location: '',
      studio: '',
      notes: '',
      crew: [],
    };

    for (const [originalHeader, mappedField] of Object.entries(colMap)) {
      const value = row[originalHeader];
      if (value === undefined || value === null || value === '') continue;

      if (mappedField.startsWith('crew_')) {
        // This is a crew assignment column
        const role = mappedField.replace('crew_', '');
        const names = String(value).split(/[,،\/]/).map(n => n.trim()).filter(Boolean);

        for (const name of names) {
          const assignment = matchCrewMember(name, role);
          production.crew.push(assignment);
        }
      } else {
        // Regular field
        const strValue = formatFieldValue(mappedField, value);
        (production as unknown as Record<string, unknown>)[mappedField] = strValue;
      }
    }

    // Skip rows without a production name
    if (!production.name) continue;

    // Ensure date is formatted
    production.date = normalizeDate(production.date);

    // Ensure times are formatted
    production.startTime = normalizeTime(production.startTime);
    production.endTime = normalizeTime(production.endTime);

    productions.push(production);
  }

  return productions;
}

/**
 * Format a field value based on its type
 */
function formatFieldValue(field: string, value: unknown): string {
  if (value instanceof Date) {
    if (field === 'date') {
      return formatDateToISO(value);
    }
    if (field === 'startTime' || field === 'endTime') {
      return value.toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit', hour12: false });
    }
  }
  return String(value).trim();
}

/**
 * Normalize various date formats to YYYY-MM-DD
 */
function normalizeDate(dateStr: string): string {
  if (!dateStr) return '';

  // Already ISO format
  if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return dateStr;

  // Try Date parsing
  const d = new Date(dateStr);
  if (!isNaN(d.getTime())) {
    return formatDateToISO(d);
  }

  // Try DD/MM/YYYY or DD.MM.YYYY
  const parts = dateStr.split(/[\/\.\-]/);
  if (parts.length === 3) {
    const [day, month, year] = parts.map(Number);
    if (day && month && year) {
      const fullYear = year < 100 ? 2000 + year : year;
      return `${fullYear}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    }
  }

  return dateStr;
}

/**
 * Normalize time to HH:MM format
 */
function normalizeTime(timeStr: string): string {
  if (!timeStr) return '';

  // Already in HH:MM format
  if (/^\d{1,2}:\d{2}$/.test(timeStr)) {
    const [h, m] = timeStr.split(':');
    return `${h.padStart(2, '0')}:${m}`;
  }

  // Number (e.g., Excel serial time)
  const num = Number(timeStr);
  if (!isNaN(num) && num >= 0 && num < 1) {
    const totalMinutes = Math.round(num * 24 * 60);
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
  }

  // HHMM format
  if (/^\d{4}$/.test(timeStr)) {
    return `${timeStr.slice(0, 2)}:${timeStr.slice(2)}`;
  }

  return timeStr;
}

function formatDateToISO(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/**
 * Try to match a crew member name to the contacts database
 */
function matchCrewMember(name: string, role: string): CrewAssignment {
  const normalized = name.trim();
  const department = roleDepartmentMap[role] || '';

  // Try to find in contacts
  const match = contacts.find(c => {
    const fullName = `${c.firstName} ${c.lastName}`;
    return (
      fullName === normalized ||
      c.firstName === normalized ||
      c.lastName === normalized ||
      fullName.includes(normalized) ||
      (c.firstName && c.lastName && normalized.includes(c.firstName) && normalized.includes(c.lastName))
    );
  });

  if (match) {
    return {
      contactId: match.id,
      name: `${match.firstName} ${match.lastName}`,
      role,
      department: match.department || department,
      phone: match.phone,
      confirmed: false,
    };
  }

  return {
    name: normalized,
    role,
    department,
    confirmed: false,
  };
}
