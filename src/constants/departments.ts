export type CanonicalDepartment =
  | 'בימוי וניתוב'
  | 'צילום'
  | 'סאונד'
  | 'תאורה'
  | 'הפקה'
  | 'טכני'
  | 'ארט ותפאורה'
  | 'ביוטי'
  | 'מבצעים';

export const INDUSTRY_DEPARTMENTS = [
  { id: 'direction-switching', label: 'בימוי וניתוב', value: 'בימוי וניתוב', icon: '🎥' },
  { id: 'camera', label: 'צילום', value: 'צילום', icon: '📷' },
  { id: 'sound', label: 'סאונד', value: 'סאונד', icon: '🎧' },
  { id: 'lighting', label: 'תאורה', value: 'תאורה', icon: '💡' },
  { id: 'production', label: 'הפקה', value: 'הפקה', icon: '🎬' },
  { id: 'technical', label: 'טכני', value: 'טכני', icon: '🛠️' },
  { id: 'art-set', label: 'ארט ותפאורה', value: 'ארט ותפאורה', icon: '🎨' },
  { id: 'beauty', label: 'ביוטי', value: 'ביוטי', icon: '✨' },
  { id: 'operations', label: 'מבצעים', value: 'מבצעים', icon: '📋' },
] as const;

export const LEGACY_PROFILE_DEPARTMENTS = [] as const;

export const INDUSTRY_DEPARTMENT_OPTIONS = INDUSTRY_DEPARTMENTS.map((department) => department.value);

export const PROFILE_DEPARTMENT_OPTIONS = [
  ...INDUSTRY_DEPARTMENT_OPTIONS,
  ...LEGACY_PROFILE_DEPARTMENTS,
] as const;

export const DEPARTMENT_ROLE_OPTIONS: Record<CanonicalDepartment, readonly string[]> = {
  'בימוי וניתוב': ['במאי/ת', 'עוזר/ת במאי', 'נתב/ת תמונה'],
  צילום: ['צלם/ת', 'עוזר/ת צלם', 'מפעיל/ת רחף', 'מפעיל/ת סטדי(קאם)', 'מפעיל/ת דולי'],
  סאונד: ['פיקוח קול', 'טכנאי/ת קול', 'עוזר/ת סאונד / בומן', 'בקליינר/ית'],
  תאורה: ['תאורן/ית', 'עוזר/ת תאורה', 'מעצב/ת תאורה'],
  הפקה: ['מפיק/ה', 'מנהל/ת הפקה', 'מתאם/ת הפקה', 'עוזר/ת הפקה', 'מנהל/ת במה'],
  טכני: ['פיקוח טכני', 'טכנאי', 'VTR', 'בקרת צבעים (CCU)', 'מסכי LED', 'טלפרומפטר', 'כתוביות / CG', 'מפעיל/ת LSM'],
  'ארט ותפאורה': ['מעצב/ת אמנותי (ארט דירקטור)', 'מעצב/ת', 'תפאורן/ית'],
  ביוטי: ['מאפר/ת', 'מעצב/ת שיער', 'מלביש/ה'],
  מבצעים: ['אחראי/ת מבצעים', 'מנהל/ת מבצעים'],
} as const;

export const INDUSTRY_ROLE_OPTIONS = Array.from(
  new Set(Object.values(DEPARTMENT_ROLE_OPTIONS).flat()),
) as string[];

export const STAFFING_CATEGORY_OPTIONS = [
  ...PROFILE_DEPARTMENT_OPTIONS,
  'כתיבה',
  'שחקנות',
  'אחר',
] as const;

export type RoleNormalizationResult = {
  raw: string;
  cleaned: string;
  canonicalRole: string;
  department: CanonicalDepartment | '';
  isCanonical: boolean;
  isCustom: boolean;
  ignoredAsNoise: boolean;
};

const ROLE_TO_DEPARTMENT = new Map<string, CanonicalDepartment>(
  Object.entries(DEPARTMENT_ROLE_OPTIONS).flatMap(([department, roles]) =>
    roles.map((role) => [role, department as CanonicalDepartment]),
  ),
);

const NOISE_WORDS = ['חפיפה', 'הקמה', 'פירוק'];

function compact(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

function roleKey(value: string): string {
  return compact(value)
    .toLocaleLowerCase('he')
    .replace(/[״"׳']/g, '')
    .replace(/[()]/g, ' ')
    .replace(/[./\\_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const ROLE_ALIAS_KEYS: Record<string, string> = {
  [roleKey('במאי')]: 'במאי/ת',
  [roleKey('במאית')]: 'במאי/ת',
  [roleKey('בימוי')]: 'במאי/ת',
  [roleKey('director')]: 'במאי/ת',
  [roleKey('עוזר במאי')]: 'עוזר/ת במאי',
  [roleKey('עוזרת במאי')]: 'עוזר/ת במאי',
  [roleKey('ע. במאי')]: 'עוזר/ת במאי',
  [roleKey('assistant director')]: 'עוזר/ת במאי',
  [roleKey('נתב')]: 'נתב/ת תמונה',
  [roleKey('נתבת')]: 'נתב/ת תמונה',
  [roleKey('ניתוב')]: 'נתב/ת תמונה',
  [roleKey('מיקסר וידאו')]: 'נתב/ת תמונה',
  [roleKey('vision mixer')]: 'נתב/ת תמונה',
  [roleKey('video mixer')]: 'נתב/ת תמונה',
  [roleKey('switcher')]: 'נתב/ת תמונה',

  [roleKey('צלם')]: 'צלם/ת',
  [roleKey('צלמת')]: 'צלם/ת',
  [roleKey('צילום')]: 'צלם/ת',
  [roleKey('camera')]: 'צלם/ת',
  [roleKey('camera operator')]: 'צלם/ת',
  [roleKey('עוזר צלם')]: 'עוזר/ת צלם',
  [roleKey('עוזרת צלם')]: 'עוזר/ת צלם',
  [roleKey('ע. צלם')]: 'עוזר/ת צלם',
  [roleKey('assistant camera')]: 'עוזר/ת צלם',
  [roleKey('צלם רחף')]: 'מפעיל/ת רחף',
  [roleKey('רחף')]: 'מפעיל/ת רחף',
  [roleKey('רחפן')]: 'מפעיל/ת רחף',
  [roleKey('drone')]: 'מפעיל/ת רחף',
  [roleKey('סטדי')]: 'מפעיל/ת סטדי(קאם)',
  [roleKey('סטדיקאם')]: 'מפעיל/ת סטדי(קאם)',
  [roleKey('steadicam')]: 'מפעיל/ת סטדי(קאם)',
  [roleKey('דולי')]: 'מפעיל/ת דולי',
  [roleKey('dolly')]: 'מפעיל/ת דולי',

  [roleKey('סאונד')]: 'טכנאי/ת קול',
  [roleKey('קול')]: 'טכנאי/ת קול',
  [roleKey('טכנאי קול')]: 'טכנאי/ת קול',
  [roleKey('טכנאית קול')]: 'טכנאי/ת קול',
  [roleKey('sound')]: 'טכנאי/ת קול',
  [roleKey('פיקוח קול')]: 'פיקוח קול',
  [roleKey('מקליט')]: 'טכנאי/ת קול',
  [roleKey('מקליטה')]: 'טכנאי/ת קול',
  [roleKey('בום')]: 'עוזר/ת סאונד / בומן',
  [roleKey('בומן')]: 'עוזר/ת סאונד / בומן',
  [roleKey('boom')]: 'עוזר/ת סאונד / בומן',
  [roleKey('עוזר סאונד')]: 'עוזר/ת סאונד / בומן',
  [roleKey('בקליינר')]: 'בקליינר/ית',
  [roleKey('בקליינרית')]: 'בקליינר/ית',
  [roleKey('backliner')]: 'בקליינר/ית',

  [roleKey('תאורה')]: 'תאורן/ית',
  [roleKey('תאורן')]: 'תאורן/ית',
  [roleKey('תאורנית')]: 'תאורן/ית',
  [roleKey('lighting')]: 'תאורן/ית',
  [roleKey('עוזר תאורה')]: 'עוזר/ת תאורה',
  [roleKey('עוזרת תאורה')]: 'עוזר/ת תאורה',
  [roleKey('מעצב תאורה')]: 'מעצב/ת תאורה',
  [roleKey('מעצבת תאורה')]: 'מעצב/ת תאורה',

  [roleKey('מפיק')]: 'מפיק/ה',
  [roleKey('מפיקה')]: 'מפיק/ה',
  [roleKey('producer')]: 'מפיק/ה',
  [roleKey('מנהל הפקה')]: 'מנהל/ת הפקה',
  [roleKey('מנהלת הפקה')]: 'מנהל/ת הפקה',
  [roleKey('production manager')]: 'מנהל/ת הפקה',
  [roleKey('מתאם הפקה')]: 'מתאם/ת הפקה',
  [roleKey('מתאמת הפקה')]: 'מתאם/ת הפקה',
  [roleKey('עוזר הפקה')]: 'עוזר/ת הפקה',
  [roleKey('עוזרת הפקה')]: 'עוזר/ת הפקה',
  [roleKey('מנהל במה')]: 'מנהל/ת במה',
  [roleKey('מנהלת במה')]: 'מנהל/ת במה',
  [roleKey('ניהול במה')]: 'מנהל/ת במה',
  [roleKey('floor manager')]: 'מנהל/ת במה',

  [roleKey('פיקוח טכני')]: 'פיקוח טכני',
  [roleKey('טכני')]: 'טכנאי',
  [roleKey('טכנאי')]: 'טכנאי',
  [roleKey('טכנאית')]: 'טכנאי',
  [roleKey('technical')]: 'טכנאי',
  [roleKey('VTR')]: 'VTR',
  [roleKey('וידאו')]: 'VTR',
  [roleKey('מפעיל VTR')]: 'VTR',
  [roleKey('מפעילת VTR')]: 'VTR',
  [roleKey('CCU')]: 'בקרת צבעים (CCU)',
  [roleKey('בקרת צבעים')]: 'בקרת צבעים (CCU)',
  [roleKey('מסכי LED')]: 'מסכי LED',
  [roleKey('LED')]: 'מסכי LED',
  [roleKey('טלפרומפטר')]: 'טלפרומפטר',
  [roleKey('פרומפטר')]: 'טלפרומפטר',
  [roleKey('prompter')]: 'טלפרומפטר',
  [roleKey('teleprompter')]: 'טלפרומפטר',
  [roleKey('כתוביות')]: 'כתוביות / CG',
  [roleKey('כתוביות CG')]: 'כתוביות / CG',
  [roleKey('CG')]: 'כתוביות / CG',
  [roleKey('graphics')]: 'כתוביות / CG',
  [roleKey('LSM')]: 'מפעיל/ת LSM',
  [roleKey('מפעיל LSM')]: 'מפעיל/ת LSM',
  [roleKey('מפעילת LSM')]: 'מפעיל/ת LSM',

  [roleKey('ארט דירקטור')]: 'מעצב/ת אמנותי (ארט דירקטור)',
  [roleKey('מעצב אמנותי')]: 'מעצב/ת אמנותי (ארט דירקטור)',
  [roleKey('מעצבת אמנותית')]: 'מעצב/ת אמנותי (ארט דירקטור)',
  [roleKey('art director')]: 'מעצב/ת אמנותי (ארט דירקטור)',
  [roleKey('מעצב')]: 'מעצב/ת',
  [roleKey('מעצבת')]: 'מעצב/ת',
  [roleKey('מעצב תפאורה')]: 'מעצב/ת',
  [roleKey('מעצבת תפאורה')]: 'מעצב/ת',
  [roleKey('תפאורן')]: 'תפאורן/ית',
  [roleKey('תפאורנית')]: 'תפאורן/ית',
  [roleKey('תפאורה')]: 'תפאורן/ית',
  [roleKey('set designer')]: 'תפאורן/ית',

  [roleKey('מאפר')]: 'מאפר/ת',
  [roleKey('מאפרת')]: 'מאפר/ת',
  [roleKey('איפור')]: 'מאפר/ת',
  [roleKey('makeup')]: 'מאפר/ת',
  [roleKey('מעצב שיער')]: 'מעצב/ת שיער',
  [roleKey('מעצבת שיער')]: 'מעצב/ת שיער',
  [roleKey('שיער')]: 'מעצב/ת שיער',
  [roleKey('hair')]: 'מעצב/ת שיער',
  [roleKey('מלביש')]: 'מלביש/ה',
  [roleKey('מלבישה')]: 'מלביש/ה',
  [roleKey('הלבשה')]: 'מלביש/ה',
  [roleKey('wardrobe')]: 'מלביש/ה',

  [roleKey('אחראי מבצעים')]: 'אחראי/ת מבצעים',
  [roleKey('אחראית מבצעים')]: 'אחראי/ת מבצעים',
  [roleKey('שיבוץ')]: 'אחראי/ת מבצעים',
  [roleKey('כח אדם')]: 'אחראי/ת מבצעים',
  [roleKey('כוח אדם')]: 'אחראי/ת מבצעים',
  [roleKey('מנהל מבצעים')]: 'מנהל/ת מבצעים',
  [roleKey('מנהלת מבצעים')]: 'מנהל/ת מבצעים',
};

for (const role of INDUSTRY_ROLE_OPTIONS) {
  ROLE_ALIAS_KEYS[roleKey(role)] = role;
}

export function stripRoleNoise(value: unknown): string {
  if (typeof value !== 'string') return '';
  const beforePlus = value.split('+')[0] || '';
  const withoutNoise = NOISE_WORDS.reduce(
    (current, word) => current.replace(new RegExp(`(^|\\s)${word}(?=\\s|$)`, 'giu'), ' '),
    beforePlus,
  );
  return compact(withoutNoise.replace(/[|,:;]+/g, ' '));
}

export function isCanonicalRole(role: string): boolean {
  return ROLE_TO_DEPARTMENT.has(role);
}

export function getDepartmentForRole(role: string): CanonicalDepartment | '' {
  return ROLE_TO_DEPARTMENT.get(role) || '';
}

export function normalizeRoleToCanonical(value: unknown): RoleNormalizationResult {
  const raw = typeof value === 'string' ? value : '';
  const cleaned = stripRoleNoise(raw);
  const canonicalRole = ROLE_ALIAS_KEYS[roleKey(cleaned)] || '';
  const department = canonicalRole ? getDepartmentForRole(canonicalRole) : '';
  const ignoredAsNoise = Boolean(raw.trim()) && !cleaned;

  return {
    raw,
    cleaned,
    canonicalRole,
    department,
    isCanonical: Boolean(canonicalRole),
    isCustom: Boolean(cleaned && !canonicalRole),
    ignoredAsNoise,
  };
}

export function normalizeRolesToCanonical(values: unknown, fallback?: unknown): string[] {
  const rawValues = [
    ...(Array.isArray(values) ? values : values ? [values] : []),
    ...(Array.isArray(fallback) ? fallback : fallback ? [fallback] : []),
  ];
  const seen = new Set<string>();
  const roles: string[] = [];

  for (const value of rawValues) {
    const normalized = normalizeRoleToCanonical(value);
    const role = normalized.canonicalRole || normalized.cleaned;
    if (!role || normalized.ignoredAsNoise) continue;
    const key = normalized.isCanonical ? role : roleKey(role);
    if (seen.has(key)) continue;
    seen.add(key);
    roles.push(role);
  }

  return roles;
}

export function getRolesForDepartment(department: string): string[] {
  return [...(DEPARTMENT_ROLE_OPTIONS[department as CanonicalDepartment] || [])];
}
