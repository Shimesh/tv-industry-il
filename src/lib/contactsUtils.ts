import {
  INDUSTRY_DEPARTMENT_OPTIONS,
  getDepartmentForRole,
  normalizeRoleToCanonical,
  type CanonicalDepartment,
} from '@/constants/departments';

export function normalizeContactName(name: string): string {
  if (!name) return '';

  let cleaned = name.replace(/^[\u05d0-\u05ea"'׳]+?\s*:\s*/u, '');
  cleaned = cleaned.replace(/\s*[-\u2013\u2014]\s*[\u05d0-\u05ea\s"'׳]+$/u, '');
  cleaned = cleaned
    .replace(/[()[\]{}]/g, ' ')
    .replace(/[,:;|]/g, ' ')
    .replace(/[\u2013\u2014-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  const roleWords = [
    'צילום', 'צלם', 'צלמת', 'עוזר צלם', 'ע. צלם', 'רחף', 'רחפן', 'סטדיקאם', 'סטדי', 'דולי',
    'סאונד', 'פיקוח קול', 'טכנאי קול', 'בומן', 'בקליינר', 'קול', 'מקליט', 'מקליטה',
    'במאי', 'במאית', 'בימוי', 'עוזר במאי', 'נתב', 'ניתוב',
    'תאורה', 'תאורן', 'תאורנית', 'הפקה', 'מפיק', 'מפיקה', 'מנהל הפקה', 'מנהל במה',
    'טכני', 'טכנאי', 'CCU', 'LSM', 'LED', 'כתוביות', 'CG', 'טלפרומפטר',
    'ארט', 'תפאורה', 'תפאורן', 'איפור', 'מאפר', 'שיער', 'מלביש', 'מבצעים',
  ];

  let changed = true;
  while (changed) {
    changed = false;
    for (const word of roleWords) {
      const re = new RegExp(`(^|\\s)${word}(\\s|$)`, 'iu');
      if (re.test(cleaned)) {
        cleaned = cleaned.replace(re, ' ').replace(/\s+/g, ' ').trim();
        changed = true;
      }
    }
  }

  return cleaned;
}

export function normalizePhone(phone: string | null | undefined): string {
  if (!phone) return '';
  const digits = phone.replace(/\D/g, '');
  if (!digits) return '';
  if (digits.startsWith('972') && digits.length >= 12) return `0${digits.slice(-9)}`;
  if (digits.length === 9) return `0${digits}`;
  if (digits.length >= 10) return digits.slice(-10);
  return '';
}

export function splitName(fullName: string): { firstName: string; lastName: string } {
  const parts = fullName.trim().split(/\s+/);
  if (parts.length === 1) return { firstName: parts[0], lastName: '' };
  return { firstName: parts[0] || '', lastName: parts.slice(1).join(' ') };
}

export type ContactDepartment = (typeof INDUSTRY_DEPARTMENT_OPTIONS)[number];
export type ContactWorkArea = 'אולפן' | 'קונטרול' | 'הפקה' | 'פוסט';
export type ContactSpecialty = string;

export const DIRECTORY_DEPARTMENTS: ContactDepartment[] = [...INDUSTRY_DEPARTMENT_OPTIONS];
export const DIRECTORY_WORK_AREAS: ContactWorkArea[] = ['אולפן', 'קונטרול', 'הפקה', 'פוסט'];

type ContactClassification = {
  department: ContactDepartment;
  workArea: ContactWorkArea;
  specialty: ContactSpecialty;
};

const DEPARTMENT_WORK_AREA: Record<CanonicalDepartment, ContactWorkArea> = {
  'בימוי וניתוב': 'קונטרול',
  צילום: 'אולפן',
  סאונד: 'קונטרול',
  תאורה: 'אולפן',
  הפקה: 'הפקה',
  טכני: 'קונטרול',
  'ארט ותפאורה': 'אולפן',
  ביוטי: 'אולפן',
  מבצעים: 'הפקה',
};

export function normalizeDisplayRoleLabel(value: string): string {
  const normalized = normalizeRoleToCanonical(value);
  if (normalized.ignoredAsNoise) return '';
  return normalized.canonicalRole || normalized.cleaned;
}

export function areSemanticallySameRole(a?: string | null, b?: string | null): boolean {
  if (!a || !b) return false;
  const normalizedA = normalizeRoleToCanonical(a);
  const normalizedB = normalizeRoleToCanonical(b);
  if (!normalizedA.canonicalRole || !normalizedB.canonicalRole) return false;
  return normalizedA.canonicalRole === normalizedB.canonicalRole;
}

export function classifyContactRole(role: string, _name?: string): ContactClassification {
  void _name;
  const normalized = normalizeRoleToCanonical(role);
  const department = normalized.department || getDepartmentForRole(normalized.canonicalRole);

  if (department) {
    return {
      department,
      workArea: DEPARTMENT_WORK_AREA[department],
      specialty: normalized.canonicalRole,
    };
  }

  return {
    department: 'טכני',
    workArea: 'קונטרול',
    specialty: normalized.cleaned || role || 'טכנאי',
  };
}

export function inferDepartment(role: string, name?: string): ContactDepartment {
  return classifyContactRole(role, name).department;
}

export function inferWorkArea(role: string, name?: string): ContactWorkArea {
  return classifyContactRole(role, name).workArea;
}

export function inferSpecialty(role: string, name?: string): ContactSpecialty {
  return classifyContactRole(role, name).specialty;
}
