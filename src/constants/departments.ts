export const INDUSTRY_DEPARTMENTS = [
  { id: 'photo', label: 'צילום', value: 'צילום', icon: '📷' },
  { id: 'direction', label: 'בימוי', value: 'בימוי', icon: '🎥' },
  { id: 'tech', label: 'טכני', value: 'טכני', icon: '🛠️' },
  { id: 'production', label: 'הפקה', value: 'הפקה', icon: '🎬' },
  { id: 'sound', label: 'סאונד', value: 'סאונד', icon: '🎧' },
  { id: 'lighting', label: 'תאורה', value: 'תאורה', icon: '💡' },
  { id: 'operations', label: 'מבצעים', value: 'מבצעים', icon: '📋' },
  { id: 'art-set', label: 'ארט ותפאורה', value: 'ארט ותפאורה', icon: '🎨' },
  { id: 'beauty', label: 'ביוטי', value: 'ביוטי', icon: '✨' },
] as const;

export const LEGACY_PROFILE_DEPARTMENTS = [
  'עריכה',
  'גרפיקה',
  'שידור',
] as const;

export const INDUSTRY_DEPARTMENT_OPTIONS = INDUSTRY_DEPARTMENTS.map((department) => department.value);

export const PROFILE_DEPARTMENT_OPTIONS = [
  ...INDUSTRY_DEPARTMENT_OPTIONS,
  ...LEGACY_PROFILE_DEPARTMENTS,
] as const;

export const DEPARTMENT_ROLE_OPTIONS: Record<string, readonly string[]> = {
  צילום: ['צילום', 'ע. צלם'],
  בימוי: ['במאי/ת', 'עוזר/ת במאי'],
  טכני: ['טלפרומפטר', 'LSM', 'כתוביות / CG', 'VTR', 'CCU', 'נתב', 'מיקסר/וידאו', 'טכני', 'גריפ', 'בקליינר'],
  הפקה: ['מפיק/ה', 'מנהל הפקה', 'תחקירן', 'עורך'],
  סאונד: ['סאונד'],
  תאורה: ['תאורה'],
  מבצעים: ['שיבוץ/כח אדם'],
  'ארט ותפאורה': ['תפאורן', 'ארט דירקטור', 'מעצב/ת תפאורה', 'אביזרים'],
  ביוטי: ['מאפר/ת', 'מעצב/ת שיער', 'מלביש/ה'],
  עריכה: ['עורך'],
  גרפיקה: ['כתוביות / CG'],
  שידור: ['נתב', 'VTR', 'CCU'],
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

export function getRolesForDepartment(department: string): string[] {
  return [...(DEPARTMENT_ROLE_OPTIONS[department] || [])];
}
