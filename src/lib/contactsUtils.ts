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
    'צילום',
    'צלם',
    'צלמת',
    'עוזר צלם',
    'ע צלם',
    'רחף',
    'רחפן',
    'רחפנית',
    'סטדיקאם',
    'סטדי',
    'קאם',
    'סאונד',
    'במאי',
    'במאית',
    'בימוי',
    'מפיק',
    'מפיקת',
    'עורך',
    'עורכת',
    'קול',
    'מקליט',
    'מקליטה',
    'תאורה',
    'תאורן',
    'איפור',
    'סטיילינג',
    'ארט',
    'תפאורה',
    'תפאורן',
    'CG',
    'VTR',
    'LSM',
    'CCU',
    'כתוביות',
    'פרומפטר',
    'נתב',
    'ניתוב',
    'מנהל במה',
    'בקליינר',
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
export type ContactWorkArea = 'אולפן' | 'קונטרול' | 'הפקה' | 'פוסט';
export type ContactSpecialty =
  | 'צלם'
  | 'ע. צלם'
  | 'צלם רחף/רחפן'
  | 'סטדי'
  | 'מנהל במה'
  | 'בקליינר'
  | 'במאי'
  | 'ע. במאי'
  | 'נתב'
  | 'VTR'
  | 'LSM'
  | 'CCU'
  | 'CG'
  | 'כתוביות'
  | 'פרומפטר'
  | 'מיקסר/וידאו'
  | 'סאונד'
  | 'תאורן'
  | 'גריפ'
  | 'תפאורן'
  | 'מפיק'
  | 'תחקירן'
  | 'עורך'
  | 'טכני';

export const DIRECTORY_DEPARTMENTS: ContactDepartment[] = ['צילום', 'טכני', 'הפקה', 'סאונד', 'תאורה'];
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
  { pattern: /\b(vtr)\b|וי[\s-]?טי[\s-]?אר/iu, department: 'טכני', workArea: 'קונטרול', specialty: 'VTR' },
  { pattern: /\b(lsm)\b|מפעיל\s*lsm|סלומושן/iu, department: 'טכני', workArea: 'קונטרול', specialty: 'LSM' },
  { pattern: /\b(ccu)\b/iu, department: 'טכני', workArea: 'קונטרול', specialty: 'CCU' },
  { pattern: /\b(cg)\b|גרפיקה|כתוביות גרפיות/iu, department: 'טכני', workArea: 'קונטרול', specialty: 'CG' },
  { pattern: /כתוביות|סאבטייטל|subtitle/iu, department: 'טכני', workArea: 'קונטרול', specialty: 'כתוביות' },
  { pattern: /פרומפטר|טלפרומפטר|prompter/iu, department: 'טכני', workArea: 'קונטרול', specialty: 'פרומפטר' },
  { pattern: /ניתוב|נתב/iu, department: 'טכני', workArea: 'קונטרול', specialty: 'נתב' },
  { pattern: /עוזר\s*במאי|ע\.?\s*במאי/iu, department: 'הפקה', workArea: 'קונטרול', specialty: 'ע. במאי' },
  { pattern: /במאי|במאית|בימוי/iu, department: 'הפקה', workArea: 'קונטרול', specialty: 'במאי' },
  { pattern: /מיקסר|מיקסר וידאו|vision|switcher|וידאו/iu, department: 'טכני', workArea: 'קונטרול', specialty: 'מיקסר/וידאו' },
  { pattern: /סאונד|קול|מקליט|מקליטה|פיקוח\s*קול|boom|sound/iu, department: 'סאונד', workArea: 'קונטרול', specialty: 'סאונד' },
  { pattern: /עוזר\s*צלם|ע\.?\s*צלם/iu, department: 'צילום', workArea: 'אולפן', specialty: 'ע. צלם' },
  { pattern: /רחף|רחפן|רחפנית|drone/iu, department: 'צילום', workArea: 'אולפן', specialty: 'צלם רחף/רחפן' },
  { pattern: /סטדי|סטדיקאם|steadicam/iu, department: 'צילום', workArea: 'אולפן', specialty: 'סטדי' },
  { pattern: /צלם|צלמת|צילום|דולי|camera|cam\b/iu, department: 'צילום', workArea: 'אולפן', specialty: 'צלם' },
  { pattern: /מנהל\s*במה|ניהול\s*במה/iu, department: 'הפקה', workArea: 'אולפן', specialty: 'מנהל במה' },
  { pattern: /בקליינר|backliner/iu, department: 'טכני', workArea: 'אולפן', specialty: 'בקליינר' },
  { pattern: /תאורן|תאורה|אור|light/iu, department: 'תאורה', workArea: 'אולפן', specialty: 'תאורן' },
  { pattern: /גריפ|grip/iu, department: 'טכני', workArea: 'אולפן', specialty: 'גריפ' },
  { pattern: /תפאורן|תפאורה|פירוק\s*במה|הקמת\s*במה|set/iu, department: 'הפקה', workArea: 'אולפן', specialty: 'תפאורן' },
  { pattern: /תחקירן|תחקירנית|תחקיר/iu, department: 'הפקה', workArea: 'הפקה', specialty: 'תחקירן' },
  { pattern: /מפיק|מפיקת|הפקה|תיאום|לוגיסטיקה|מנהל\s*הפקה|מלהקת|producer/iu, department: 'הפקה', workArea: 'הפקה', specialty: 'מפיק' },
  { pattern: /עורך|עורכת|עריכה|edit|editor/iu, department: 'הפקה', workArea: 'פוסט', specialty: 'עורך' },
];

const CANONICAL_NAME_OVERRIDES: Array<{
  match: RegExp;
  classification: ContactClassification;
}> = [
  {
    match: /מוניר\s+אברהים/iu,
    classification: { department: 'צילום', workArea: 'אולפן', specialty: 'ע. צלם' },
  },
  {
    match: /חוסאם\s+אלסוס/iu,
    classification: { department: 'צילום', workArea: 'אולפן', specialty: 'ע. צלם' },
  },
];

function getCanonicalNameOverride(name: string): ContactClassification | null {
  const normalizedName = normalizeContactName(name || '');
  if (!normalizedName) return null;

  for (const override of CANONICAL_NAME_OVERRIDES) {
    if (override.match.test(normalizedName)) {
      return override.classification;
    }
  }

  return null;
}

function normalizeRoleSemanticKey(value: string): string {
  const normalized = String(value || '')
    .replace(/[|,:;]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLocaleLowerCase('he');

  if (!normalized) return '';
  if (/^ע\.?\s*צלם$|^עוזר\s*צלם$/iu.test(normalized)) return 'assistant-camera';
  if (/^צלם\s*רחף\/רחפן$|^צלם\s*רחף$|^רחפן$|^רחף$/iu.test(normalized)) return 'drone-camera';
  if (/^צלם$|^צילום$/iu.test(normalized)) return 'camera';
  if (/^ccu$/iu.test(normalized)) return 'ccu';
  if (/^cg$/iu.test(normalized)) return 'cg';
  if (/^vtr$/iu.test(normalized)) return 'vtr';
  if (/^lsm$/iu.test(normalized)) return 'lsm';
  if (/^במאי$|^בימוי$/iu.test(normalized)) return 'director';
  if (/^ע\.?\s*במאי$|^עוזר\s*במאי$/iu.test(normalized)) return 'assistant-director';
  if (/^מיקסר\/וידאו$|^מיקסר$|^וידאו$/iu.test(normalized)) return 'video-mixer';
  if (/^סאונד$|^קול$/iu.test(normalized)) return 'sound';
  if (/^תאורן$|^תאורה$/iu.test(normalized)) return 'lighting';
  if (/^תפאורן$|^תפאורה$/iu.test(normalized)) return 'set-design';
  if (/^מפיק$|^הפקה$/iu.test(normalized)) return 'producer';
  if (/^תחקירן$|^תחקיר$/iu.test(normalized)) return 'researcher';
  if (/^עורך$|^עריכה$/iu.test(normalized)) return 'editor';

  return normalized
    .replace(/\./g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

const DISPLAY_ROLE_LABELS: Record<string, string> = {
  'assistant-camera': 'ע. צלם',
  'drone-camera': 'צלם רחף/רחפן',
  camera: 'צלם',
  ccu: 'CCU',
  cg: 'CG',
  vtr: 'VTR',
  lsm: 'LSM',
  director: 'במאי',
  'assistant-director': 'ע. במאי',
  'video-mixer': 'מיקסר/וידאו',
  sound: 'סאונד',
  lighting: 'תאורן',
  'set-design': 'תפאורן',
  producer: 'מפיק',
  researcher: 'תחקירן',
  editor: 'עורך',
};

export function normalizeDisplayRoleLabel(value: string): string {
  const semanticKey = normalizeRoleSemanticKey(value);
  if (!semanticKey) return '';
  return DISPLAY_ROLE_LABELS[semanticKey] || String(value || '').replace(/\s+/g, ' ').trim();
}

export function areSemanticallySameRole(a?: string | null, b?: string | null): boolean {
  if (!a || !b) return false;
  return normalizeRoleSemanticKey(a) === normalizeRoleSemanticKey(b);
}

export function classifyContactRole(role: string, name?: string): ContactClassification {
  const override = getCanonicalNameOverride(name || '');
  if (override) {
    return override;
  }

  const normalizedRole = String(role || '').trim().toLowerCase();
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
