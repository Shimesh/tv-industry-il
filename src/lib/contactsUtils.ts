export function normalizeContactName(name: string): string {
  if (!name) return '';

  let cleaned = name
    .replace(/[()\[\]{}]/g, ' ')
    .replace(/[,:;|]/g, ' ')
    .replace(/[–-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  const rolePhrases = [
    'צלם רחף',
    'סטדי קאם',
    'סטדי-קאם',
    'ע. במאי',
    'ע. במאית',
    'ע. צילום',
    'ע. סאונד',
    'צילום',
    'צלם',
    'צלמת',
    'רחף',
    'רחפן',
    'רחפנית',
    'סטדיקאם',
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
  ];

  let changed = true;
  while (changed) {
    changed = false;
    for (const phrase of rolePhrases) {
      const re = new RegExp(`(^|\\s)${phrase}(\\s|$)`, 'u');
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
  return digits.length > 9 ? digits.slice(-9) : digits;
}

export function splitName(fullName: string): { firstName: string; lastName: string } {
  const parts = fullName.trim().split(/\s+/);
  if (parts.length === 1) return { firstName: parts[0], lastName: '' };
  return { firstName: parts[0], lastName: parts.slice(1).join(' ') };
}

export function inferDepartment(role: string): string {
  const r = role || '';
  if (/צלם|צילום|רחף|רחפן|סטדיקאם|סטדי/.test(r)) return 'צילום';
  if (/סאונד|קול|מקליט/.test(r)) return 'סאונד';
  if (/במאי|בימוי/.test(r)) return 'הפקה';
  if (/תאור|אור|תאורה/.test(r)) return 'תאורה';
  if (/עריכה|עורך/.test(r)) return 'הפקה';
  return 'כללי';
}
