export function normalizeContactName(name: string): string {
  if (!name) return '';

  let cleaned = name
    .replace(/^[\u05d0-\u05ea]+:\s*/u, '')
    .replace(/\s*[-–]\s*[\u05d0-\u05ea\s]+$/u, '')
    .trim()
    .replace(/\s+/g, ' ');

  const rolePhrases = [
    'צילום',
    'צלם',
    'צלמת',
    'צלם רחף',
    'רחף',
    'רחפן',
    'רחפנית',
    'סטדיקאם',
    'סטדי קאם',
    'סטדי-קאם',
    'סאונד',
    'במאי',
    'במאית',
    'בימוי',
    'מפיק',
    'מפיקת',
    'עורך',
    'עורכת',
    'ע. במאי',
    'ע. במאית',
    'ע. צילום',
    'ע. סאונד',
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
      const prefix = new RegExp('^' + phrase + '\\s+', 'u');
      const suffix = new RegExp('\\s+' + phrase + '$', 'u');
      if (prefix.test(cleaned)) {
        cleaned = cleaned.replace(prefix, '').trim();
        changed = true;
      }
      if (suffix.test(cleaned)) {
        cleaned = cleaned.replace(suffix, '').trim();
        changed = true;
      }
    }
  }

  cleaned = cleaned.replace(/^[–-]\\s*/u, '').replace(/\\s*[–-]$/u, '').trim();
  cleaned = cleaned.replace(/\\s+/g, ' ');

  return cleaned;
}

export function normalizePhone(phone: string): string {
  if (!phone) return '';
  const digits = phone.replace(/\D/g, '');
  if (!digits) return '';
  // Compare by last 9 digits to normalize local vs international
  return digits.length > 9 ? digits.slice(-9) : digits;
}

export function splitName(fullName: string): { firstName: string; lastName: string } {
  const parts = fullName.trim().split(/\s+/);
  if (parts.length === 1) return { firstName: parts[0], lastName: '' };
  return { firstName: parts[0], lastName: parts.slice(1).join(' ') };
}
