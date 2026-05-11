export const INDUSTRY_DEPARTMENTS = [
  { id: 'photo', label: 'צילום', value: 'צילום', icon: '📷' },
  { id: 'tech', label: 'טכני', value: 'טכני', icon: '🛠️' },
  { id: 'production', label: 'הפקה', value: 'הפקה', icon: '🎬' },
  { id: 'sound', label: 'סאונד', value: 'סאונד', icon: '🎧' },
  { id: 'lighting', label: 'תאורה', value: 'תאורה', icon: '💡' },
  { id: 'operations', label: 'מבצעים', value: 'מבצעים', icon: '📋' },
  { id: 'direction', label: 'בימוי', value: 'בימוי', icon: '🎥' },
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

export const INDUSTRY_ROLE_OPTIONS = [
  'צלם',
  'צלם רחף',
  'כתוביות',
  'ניהול במה',
  'פיקוח קול',
  'VTR',
  'תפאורן',
  'ניתוב',
  'CCU',
  'טלפרומפטר',
  'תאורן',
  'קול',
  'עורך',
  'מנהל הפקה',
  'מפיק',
  'במאי',
  'שיבוץ/כח אדם',
  'במאי/ת',
  'עוזר/ת במאי',
  'מפיק/ה',
  'ארט דירקטור',
  'מעצב/ת תפאורה',
  'אביזרים',
  'מאפר/ת',
  'מעצב/ת שיער',
  'מלביש/ה',
] as const;

export const STAFFING_CATEGORY_OPTIONS = [
  ...PROFILE_DEPARTMENT_OPTIONS,
  'כתיבה',
  'שחקנות',
  'אחר',
] as const;
