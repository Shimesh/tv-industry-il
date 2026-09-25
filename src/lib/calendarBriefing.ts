import { canonicalProductionName, getWeekId, type Production } from '@/lib/productionDiff';
import { normalizeName, normalizePhone } from '@/lib/crewNormalization';

export interface BriefingShift {
  key: string;
  name: string;
  date: string;
  studio: string;
  startTime: string;
  endTime: string;
  role: string;
  status: Production['status'];
}
export interface BriefingSnapshot {
  start: string;
  end: string;
  checkedAt: number;
  shifts: BriefingShift[];
}
export interface BriefingChange {
  key: string;
  name: string;
  date: string;
  kind: 'added' | 'removed' | 'changed';
  details: string[];
}
export interface CalendarBriefingData extends BriefingSnapshot {
  sync: { source: 'personal' | 'phone' | 'shared' | 'unknown'; at: number | null; status: string | null; weekStart: string | null };
}

export function israelToday(now = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jerusalem', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
}

export function addCalendarDays(date: string, days: number): string {
  const value = new Date(`${date}T12:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

export function briefingRange(now = new Date()) {
  const start = getWeekId(israelToday(now));
  return { start, end: addCalendarDays(start, 27) };
}

export function formatBriefingDate(date: string): string {
  return new Intl.DateTimeFormat('he-IL', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${date}T12:00:00Z`));
}

export function toBriefingShift(production: Production, names: string[], phones: string[]): BriefingShift {
  const myNames = new Set(names.map(normalizeName).filter(Boolean));
  const myPhones = new Set(phones.map(normalizePhone).filter(Boolean));
  const members = (production.crew || []).filter(member => {
    const phone = normalizePhone(member.normalizedPhone || member.phone || '');
    // A known different phone must not be overridden by a matching display name.
    return phone ? myPhones.has(phone) : myNames.has(normalizeName(member.name));
  });
  const starts = members.map(member => member.startTime).filter(Boolean).sort();
  const ends = members.map(member => member.endTime).filter(Boolean).sort();
  return {
    key: production.herzliyaId ? `${production.herzliyaId}:${production.date}` : production.id,
    name: production.name,
    date: production.date,
    studio: production.studio || '',
    startTime: starts[0] || production.startTime || '',
    endTime: ends.at(-1) || production.endTime || '',
    role: Array.from(new Set(members.map(member => member.role || member.roleDetail).filter(Boolean))).join(' / '),
    status: production.status,
  };
}

export function compareBriefing(previous: BriefingSnapshot, current: BriefingSnapshot, today: string): BriefingChange[] {
  // Never report a removal merely because a rolling window moved forward.
  const start = [previous.start, current.start, today].sort().at(-1)!;
  const end = [previous.end, current.end].sort()[0];
  const within = (shift: BriefingShift) => shift.date >= start && shift.date <= end;
  const old = previous.shifts.filter(within);
  const incoming = current.shifts.filter(within);
  const used = new Set<BriefingShift>();
  const changes: BriefingChange[] = [];
  for (const shift of incoming) {
    const candidates = old.filter(item => !used.has(item) && item.date === shift.date && canonicalProductionName(item.name) === canonicalProductionName(shift.name));
    const before = old.find(item => !used.has(item) && item.key === shift.key) || (candidates.length === 1 ? candidates[0] : undefined);
    if (!before) {
      if (shift.status !== 'cancelled') changes.push({ ...shift, kind: 'added', details: ['נוסף שיבוץ ליומן האישי'] });
      continue;
    }
    used.add(before);
    const details: string[] = [];
    const time = (item: BriefingShift) => `${item.startTime || 'לא צוין'}–${item.endTime || 'לא צוין'}`;
    if (time(before) !== time(shift)) details.push(`שעות: ${time(before)} ← ${time(shift)}`);
    if (before.studio !== shift.studio) details.push(`מיקום: ${before.studio || 'לא צוין'} ← ${shift.studio || 'לא צוין'}`);
    if (before.role !== shift.role) details.push(`תפקיד: ${before.role || 'לא צוין'} ← ${shift.role || 'לא צוין'}`);
    if (before.status !== shift.status) details.push(shift.status === 'cancelled' ? 'ההפקה סומנה כמבוטלת' : before.status === 'cancelled' ? 'ההפקה כבר אינה מסומנת כמבוטלת' : 'מצב ההפקה השתנה');
    if (details.length) changes.push({ ...shift, kind: 'changed', details });
  }
  for (const shift of old) {
    if (!used.has(shift) && shift.status !== 'cancelled') changes.push({ ...shift, kind: 'removed', details: ['השיבוץ אינו מופיע כעת ביומן האישי. יש לוודא מול ההפקה; אין זו הודעת ביטול.'] });
  }
  return changes;
}

export function nextBriefingShift(shifts: BriefingShift[], now = new Date()): BriefingShift | undefined {
  const today = israelToday(now);
  const time = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Jerusalem', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(now);
  return shifts.filter(shift => shift.status === 'scheduled' && (shift.date > today || (shift.date === today && (!shift.startTime || shift.startTime >= time))))
    .sort((a, b) => `${a.date} ${a.startTime || '23:59'}`.localeCompare(`${b.date} ${b.startTime || '23:59'}`))[0];
}
