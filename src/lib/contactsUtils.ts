export function normalizeContactName(name: string): string {
  if (!name) return '';

  // Strip role prefix with colon (e.g. "צילום: ירון אורבך" → "ירון אורבך")
  let cleaned = name.replace(/^[\u05d0-\u05ea]+:\s*/u, '');
  // Strip role suffix with dash (e.g. "ירון אורבך - צילום" → "ירון אורבך")
  cleaned = cleaned.replace(/\s*[-\u2013\u2014]\s*[\u05d0-\u05ea\s]+$/u, '');

  cleaned = cleaned
    .replace(/[()\[\]{}]/g, ' ')
    .replace(/[,:;|]/g, ' ')
    .replace(/[\u2013\u2014-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  const roleWords = [
    '\u05e6\u05d9\u05dc\u05d5\u05dd', // צילום
    '\u05e6\u05dc\u05dd', // צלם
    '\u05e6\u05dc\u05de\u05ea', // צלמת
    '\u05e8\u05d7\u05e3', // רחף
    '\u05e8\u05d7\u05e4\u05df', // רחפן
    '\u05e8\u05d7\u05e4\u05e0\u05d9\u05ea', // רחפנית
    '\u05e1\u05d8\u05d3\u05d9\u05e7\u05d0\u05dd', // סטדיקאם
    '\u05e1\u05d8\u05d3\u05d9', // סטדי
    '\u05e7\u05d0\u05dd', // קאם
    '\u05e1\u05d0\u05d5\u05e0\u05d3', // סאונד
    '\u05d1\u05de\u05d0\u05d9', // במאי
    '\u05d1\u05de\u05d0\u05d9\u05ea', // במאית
    '\u05d1\u05d9\u05de\u05d5\u05d9', // בימוי
    '\u05de\u05e4\u05d9\u05e7', // מפיק
    '\u05de\u05e4\u05d9\u05e7\u05ea', // מפיקת
    '\u05e2\u05d5\u05e8\u05da', // עורך
    '\u05e2\u05d5\u05e8\u05db\u05ea', // עורכת
    '\u05e7\u05d5\u05dc', // קול
    '\u05de\u05e7\u05dc\u05d9\u05d8', // מקליט
    '\u05de\u05e7\u05dc\u05d9\u05d8\u05d4', // מקליטה
    '\u05ea\u05d0\u05d5\u05e8\u05d4', // תאורה
    '\u05ea\u05d0\u05d5\u05e8\u05df', // תאורן
    '\u05d0\u05d9\u05e4\u05d5\u05e8', // איפור
    '\u05e1\u05d8\u05d9\u05d9\u05dc\u05d9\u05e0\u05d2', // סטיילינג
    '\u05d0\u05e8\u05d8', // ארט
    '\u05ea\u05e4\u05d0\u05d5\u05e8\u05d4', // תפאורה
  ];

  let changed = true;
  while (changed) {
    changed = false;
    for (const word of roleWords) {
      const re = new RegExp(`(^|\\s)${word}(\\s|$)`, 'u');
      if (re.test(cleaned)) {
        cleaned = cleaned.replace(re, ' ').replace(/\s+/g, ' ').trim();
        changed = true;
      }
    }
  }

  return cleaned;
}

export function normalizePhone(phone: string): string {
  if (!phone) return '';
  const digits = phone.replace(/\D/g, '');
  if (!digits) return '';
  if (digits.startsWith('972') && digits.length >= 12) {
    return `0${digits.slice(-9)}`;
  }
  if (digits.length === 9) {
    return `0${digits}`;
  }
  if (digits.length >= 10) {
    return digits.slice(-10);
  }
  return '';
}

export function splitName(fullName: string): { firstName: string; lastName: string } {
  const parts = fullName.trim().split(/\s+/);
  if (parts.length === 1) return { firstName: parts[0], lastName: '' };
  return { firstName: parts[0], lastName: parts.slice(1).join(' ') };
}

export type ContactDepartment = 'צילום' | 'סאונד' | 'תאורה' | 'טכני' | 'הפקה';
export type ContactWorkArea = 'אולפן' | 'קונטרול' | null;

export function inferWorkArea(role: string): ContactWorkArea {
  const r = (role || '').toLowerCase();

  if (/\u05e0\u05d9\u05ea\u05d5\u05d1|\u05e0\u05ea\u05d1/u.test(r)) return '\u05e7\u05d5\u05e0\u05d8\u05e8\u05d5\u05dc';
  if (/\u05d1\u05de\u05d0\u05d9|\u05d1\u05d9\u05de\u05d5\u05d9|\u05e2\u05d5\u05d6\u05e8.?\u05d1\u05de\u05d0\u05d9/u.test(r)) return '\u05e7\u05d5\u05e0\u05d8\u05e8\u05d5\u05dc';
  if (/\u05e4\u05e8\u05d5\u05de\u05e4\u05d8\u05e8|\u05d8\u05dc\u05e4\u05e8\u05d5\u05de\u05e4\u05d8\u05e8|prompter/iu.test(r)) return '\u05e7\u05d5\u05e0\u05d8\u05e8\u05d5\u05dc';
  if (/ccu|vtr|lsm|vision|\u05de\u05e4\u05e2\u05d9\u05dc.?lsm|\u05de\u05e7\u05e1\u05e8|\u05de\u05d9\u05e7\u05e1\u05e8|\u05e4\u05d9\u05e7\u05d5\u05d7.?\u05e7\u05d5\u05dc/iu.test(r)) return '\u05e7\u05d5\u05e0\u05d8\u05e8\u05d5\u05dc';
  if (/\u05e1\u05d0\u05d5\u05e0\u05d3|\u05e7\u05d5\u05dc|\u05de\u05e7\u05dc\u05d9\u05d8|\u05de\u05d9\u05e7\u05e8\u05d5\u05e4\u05d5\u05df|boom|sound/iu.test(r)) return '\u05e7\u05d5\u05e0\u05d8\u05e8\u05d5\u05dc';

  if (/\u05e6\u05dc\u05dd|\u05e6\u05d9\u05dc\u05d5\u05dd|\u05e8\u05d7\u05e3|\u05e8\u05d7\u05e4\u05df|\u05e1\u05d8\u05d3\u05d9\u05e7\u05d0\u05dd|\u05e1\u05d8\u05d3\u05d9|\u05e7\u05d0\u05dd|camera/iu.test(r)) return '\u05d0\u05d5\u05dc\u05e4\u05df';
  if (/\u05d1\u05de\u05d4|\u05e0\u05d9\u05d4\u05d5\u05dc.?\u05d1\u05de\u05d4|stage|\u05d1\u05e7\u05dc\u05d9\u05d9\u05e0\u05e8|\u05d1\u05e7\u05dc\u05d9\u05d9\u05e0\u05e8\u05d9\u05ea/u.test(r)) return '\u05d0\u05d5\u05dc\u05e4\u05df';
  if (/\u05ea\u05d0\u05d5\u05e8\u05d4|\u05ea\u05d0\u05d5\u05e8\u05df|\u05d0\u05d5\u05e8|light/iu.test(r)) return '\u05d0\u05d5\u05dc\u05e4\u05df';
  if (/\u05ea\u05e4\u05d0\u05d5\u05e8\u05d4|\u05ea\u05e4\u05d0\u05d5\u05e8\u05df|\u05e4\u05d9\u05e8\u05d5\u05e7.?\u05d1\u05de\u05d4|\u05d4\u05e7\u05de\u05ea.?\u05d1\u05de\u05d4|\u05d2\u05e8\u05d9\u05e4|grip/iu.test(r)) return '\u05d0\u05d5\u05dc\u05e4\u05df';

  return null;
}

export function inferDepartment(role: string): ContactDepartment {
  const r = (role || '').toLowerCase();

  if (/\u05e6\u05dc\u05dd|\u05e6\u05d9\u05dc\u05d5\u05dd|\u05e8\u05d7\u05e3|\u05e8\u05d7\u05e4\u05df|\u05e1\u05d8\u05d3\u05d9\u05e7\u05d0\u05dd|\u05e1\u05d8\u05d3\u05d9|\u05e7\u05d0\u05dd|camera|\u05d3\u05d5\u05dc\u05d9/u.test(r)) {
    return '\u05e6\u05d9\u05dc\u05d5\u05dd';
  }

  if (/\u05e1\u05d0\u05d5\u05e0\u05d3|\u05e7\u05d5\u05dc|\u05de\u05e7\u05dc\u05d9\u05d8|\u05de\u05d9\u05e7\u05e8\u05d5\u05e4\u05d5\u05df|boom|sound|\u05e4\u05d9\u05e7\u05d5\u05d7.?\u05e7\u05d5\u05dc/u.test(r)) {
    return '\u05e1\u05d0\u05d5\u05e0\u05d3';
  }

  if (/\u05ea\u05d0\u05d5\u05e8\u05d4|\u05ea\u05d0\u05d5\u05e8\u05df|\u05d0\u05d5\u05e8|light/u.test(r)) {
    return '\u05ea\u05d0\u05d5\u05e8\u05d4';
  }

  if (/\u05de\u05e4\u05d9\u05e7|\u05de\u05e0\u05d4\u05dc.?\u05d4\u05e4\u05e7\u05d4|\u05d4\u05e4\u05e7\u05d4|\u05e2\u05d5\u05e8\u05da|\u05e2\u05d5\u05e8\u05db\u05ea|\u05ea\u05d7\u05e7\u05d9\u05e8|\u05ea\u05d7\u05e7\u05d9\u05e8\u05df|\u05ea\u05d7\u05e7\u05d9\u05e8\u05e0\u05d9\u05ea|\u05ea\u05d5\u05db\u05df|\u05ea\u05d9\u05d0\u05d5\u05dd|\u05dc\u05d5\u05d2\u05d9\u05e1\u05d8\u05d9\u05e7\u05d4|\u05d1\u05de\u05d4|\u05e0\u05d9\u05d4\u05d5\u05dc.?\u05d1\u05de\u05d4|stage|produc/iu.test(r)) {
    return '\u05d4\u05e4\u05e7\u05d4';
  }

  return '\u05d8\u05db\u05e0\u05d9';
}
