import { INDUSTRY_DEPARTMENT_OPTIONS } from '@/constants/departments';

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
    'צילום', 'צלם', 'צלמת', 'עוזר צלם', 'ע צלם', 'רחף', 'רחפן', 'רחפנית', 'סטדיקאם', 'סטדי',
    'סאונד', 'במאי', 'במאית', 'בימוי', 'מפיק', 'מפיקה', 'עורך', 'עורכת', 'קול', 'מקליט',
    'מקליטה', 'תאורה', 'תאורן', 'איפור', 'סטיילינג', 'ארט', 'תפאורה', 'תפאורן',
    'CG', 'VTR', 'LSM', 'CCU', 'כתוביות', 'פרומפטר', 'טלפרומפטר', 'נתב', 'ניתוב',
    'מנהל במה', 'בקליינר',
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
  return { firstName: parts[0], lastName: parts.slice(1).join(' ') };
}

export type ContactDepartment = (typeof INDUSTRY_DEPARTMENT_OPTIONS)[number];
export type ContactWorkArea = 'אולפן' | 'קונטרול' | 'הפקה' | 'פוסט';
export type ContactSpecialty =
  | 'צילום'
  | 'ע. צלם'
  | 'טלפרומפטר'
  | 'LSM'
  | 'כתוביות / CG'
  | 'מנהל במה'
  | 'סאונד'
  | 'תאורה'
  | 'טכני'
  | 'במאי/ת'
  | 'עוזר/ת במאי'
  | 'נתב'
  | 'VTR'
  | 'CCU'
  | 'מיקסר/וידאו'
  | 'גריפ'
  | 'בקליינר'
  | 'תפאורן'
  | 'מפיק/ה'
  | 'מנהל הפקה'
  | 'תחקירן'
  | 'עורך'
  | 'שיבוץ/כח אדם'
  | 'ארט דירקטור'
  | 'מעצב/ת תפאורה'
  | 'אביזרים'
  | 'מאפר/ת'
  | 'מעצב/ת שיער'
  | 'מלביש/ה';

export const DIRECTORY_DEPARTMENTS: ContactDepartment[] = [...INDUSTRY_DEPARTMENT_OPTIONS];
export const DIRECTORY_WORK_AREAS: ContactWorkArea[] = ['אולפן', 'קונטרול', 'הפקה', 'פוסט'];

type ContactClassification = {
  department: ContactDepartment;
  workArea: ContactWorkArea;
  specialty: ContactSpecialty;
};

type ClassificationRule = ContactClassification & {
  pattern: RegExp;
};

const CLASSIFICATION_RULES: ClassificationRule[] = [
  { pattern: /שיבוץ|כח\s*אדם|כוח\s*אדם|staffing|personnel/iu, department: 'מבצעים', workArea: 'הפקה', specialty: 'שיבוץ/כח אדם' },
  { pattern: /עוזר\/ת\s*במאי|עוזרת\s*במאי|עוזר\s*במאי|ע\.?\s*במאי|assistant\s*director/iu, department: 'בימוי', workArea: 'קונטרול', specialty: 'עוזר/ת במאי' },
  { pattern: /במאי\/ת|במאית|במאי|בימוי|director/iu, department: 'בימוי', workArea: 'קונטרול', specialty: 'במאי/ת' },
  { pattern: /מפעיל\s*lsm|\blsm\b|סלומושן/iu, department: 'טכני', workArea: 'קונטרול', specialty: 'LSM' },
  { pattern: /כתוביות\s*\/?\s*cg|\bcg\b|כתוביות|גרפיקה|subtitle/iu, department: 'טכני', workArea: 'קונטרול', specialty: 'כתוביות / CG' },
  { pattern: /מפעיל\s*טלפרומפטר|טלפרומפטר|פרומפטר|prompter/iu, department: 'טכני', workArea: 'קונטרול', specialty: 'טלפרומפטר' },
  { pattern: /\bvtr\b|וי[\s-]?טי[\s-]?אר/iu, department: 'טכני', workArea: 'קונטרול', specialty: 'VTR' },
  { pattern: /\bccu\b/iu, department: 'טכני', workArea: 'קונטרול', specialty: 'CCU' },
  { pattern: /ניתוב|נתב/iu, department: 'טכני', workArea: 'קונטרול', specialty: 'נתב' },
  { pattern: /מיקסר|vision|video\s*mixer|switcher|וידאו/iu, department: 'טכני', workArea: 'קונטרול', specialty: 'מיקסר/וידאו' },
  { pattern: /פיקוח\s*טכני|טכנאי\s*תורן|טכני|technical/iu, department: 'טכני', workArea: 'קונטרול', specialty: 'טכני' },
  { pattern: /פיקוח\s*קול|סאונד|קול|מקליט|מקליטה|boom|sound/iu, department: 'סאונד', workArea: 'קונטרול', specialty: 'סאונד' },
  { pattern: /תאורן|עיצוב\s*תאורה|תאורה|light/iu, department: 'תאורה', workArea: 'אולפן', specialty: 'תאורה' },
  { pattern: /סטדי|סטדיקאם|רחף|רחפן|רחפנית|צלם\s*רחף|צלם|צלמת|צילום|camera|cam\b|drone/iu, department: 'צילום', workArea: 'אולפן', specialty: 'צילום' },
  { pattern: /עוזר\s*צלם|ע\.?\s*צלם/iu, department: 'צילום', workArea: 'אולפן', specialty: 'ע. צלם' },
  { pattern: /מנהל\s*במה|ניהול\s*במה|floor\s*manager/iu, department: 'הפקה', workArea: 'אולפן', specialty: 'מנהל במה' },
  { pattern: /בקליינר|backliner/iu, department: 'טכני', workArea: 'אולפן', specialty: 'בקליינר' },
  { pattern: /גריפ|grip/iu, department: 'טכני', workArea: 'אולפן', specialty: 'גריפ' },
  { pattern: /תפאורן|תפאורה|set/iu, department: 'ארט ותפאורה', workArea: 'אולפן', specialty: 'תפאורן' },
  { pattern: /ארט\s*דירקטור|art\s*director/iu, department: 'ארט ותפאורה', workArea: 'אולפן', specialty: 'ארט דירקטור' },
  { pattern: /מעצב\/ת\s*תפאורה|מעצבת\s*תפאורה|מעצב\s*תפאורה|set\s*designer/iu, department: 'ארט ותפאורה', workArea: 'אולפן', specialty: 'מעצב/ת תפאורה' },
  { pattern: /אביזרים|props?/iu, department: 'ארט ותפאורה', workArea: 'אולפן', specialty: 'אביזרים' },
  { pattern: /מאפר\/ת|מאפרת|מאפר|makeup/iu, department: 'ביוטי', workArea: 'אולפן', specialty: 'מאפר/ת' },
  { pattern: /מעצב\/ת\s*שיער|מעצבת\s*שיער|מעצב\s*שיער|hair/iu, department: 'ביוטי', workArea: 'אולפן', specialty: 'מעצב/ת שיער' },
  { pattern: /מלביש\/ה|מלבישה|מלביש|wardrobe/iu, department: 'ביוטי', workArea: 'אולפן', specialty: 'מלביש/ה' },
  { pattern: /מפיק\/ה|מפיקה|מפיק|הפקה|producer/iu, department: 'הפקה', workArea: 'הפקה', specialty: 'מפיק/ה' },
  { pattern: /מנהל\s*הפקה|production\s*manager/iu, department: 'הפקה', workArea: 'הפקה', specialty: 'מנהל הפקה' },
  { pattern: /תחקירן|תחקירנית|תחקיר/iu, department: 'הפקה', workArea: 'הפקה', specialty: 'תחקירן' },
  { pattern: /עורך|עורכת|עריכה|edit|editor/iu, department: 'הפקה', workArea: 'פוסט', specialty: 'עורך' },
];

const SEMANTIC_KEY_RULES: Array<[RegExp, string]> = [
  [/מפעיל\s*טלפרומפטר|טלפרומפטר|פרומפטר|prompter/iu, 'teleprompter'],
  [/מפעיל\s*lsm|\blsm\b/iu, 'lsm'],
  [/כתוביות\s*\/?\s*cg|\bcg\b|כתוביות|subtitle/iu, 'subtitles-cg'],
  [/ניהול\s*במה|מנהל\s*במה|floor\s*manager/iu, 'floor-manager'],
  [/פיקוח\s*קול|סאונד|קול|sound/iu, 'sound'],
  [/תאורן|עיצוב\s*תאורה|תאורה|light/iu, 'lighting'],
  [/פיקוח\s*טכני|טכנאי\s*תורן|טכני|technical/iu, 'technical'],
  [/עוזר\/ת\s*צלם|עוזרת\s*צלם|עוזר\s*צלם|ע\.?\s*צלם|assistant\s*camera|camera\s*assistant/iu, 'assistant-camera'],
  [/סטדי|סטדיקאם|צלם\s*רחף|רחף|רחפן|צילום|צלם|צלמת|camera|drone/iu, 'camera'],
  [/עוזר\/ת\s*במאי|עוזרת\s*במאי|עוזר\s*במאי|ע\.?\s*במאי|assistant\s*director/iu, 'assistant-director'],
  [/במאי\/ת|במאית|במאי|בימוי|director/iu, 'director'],
];

const DISPLAY_ROLE_LABELS: Record<string, string> = {
  teleprompter: 'טלפרומפטר',
  lsm: 'LSM',
  'subtitles-cg': 'כתוביות / CG',
  'floor-manager': 'מנהל במה',
  sound: 'סאונד',
  lighting: 'תאורה',
  technical: 'טכני',
  'assistant-camera': 'עוזר צלם',
  camera: 'צילום',
  director: 'במאי/ת',
  'assistant-director': 'עוזר/ת במאי',
};

function normalizeRoleSemanticKey(value: string): string {
  const normalized = String(value || '')
    .replace(/[|,:;]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLocaleLowerCase('he');

  if (!normalized) return '';

  for (const [pattern, key] of SEMANTIC_KEY_RULES) {
    if (pattern.test(normalized)) return key;
  }

  return normalized.replace(/\./g, '').replace(/\s+/g, ' ').trim();
}

export function normalizeDisplayRoleLabel(value: string): string {
  const semanticKey = normalizeRoleSemanticKey(value);
  if (!semanticKey) return '';
  return DISPLAY_ROLE_LABELS[semanticKey] || String(value || '').replace(/\s+/g, ' ').trim();
}

export function areSemanticallySameRole(a?: string | null, b?: string | null): boolean {
  if (!a || !b) return false;
  return normalizeRoleSemanticKey(a) === normalizeRoleSemanticKey(b);
}

export function classifyContactRole(role: string, _name?: string): ContactClassification {
  void _name;
  const normalizedRole = String(role || '').trim();
  for (const rule of CLASSIFICATION_RULES) {
    if (rule.pattern.test(normalizedRole)) {
      return {
        department: rule.department,
        workArea: rule.workArea,
        specialty: rule.specialty,
      };
    }
  }

  return {
    department: 'טכני',
    workArea: 'קונטרול',
    specialty: 'טכני',
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
