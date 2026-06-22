export type CalendarEmploymentType = 'employee' | 'freelancer';
export type CalendarPreviewMode = 'policy' | 'full' | 'personal';

export const CALENDAR_PREVIEW_STORAGE_KEY = 'tv-calendar-preview-mode';
export const CALENDAR_PREVIEW_CHANGED_EVENT = 'tv-calendar-preview-mode-changed';

export type CalendarAccessProfile = {
  siteRole?: string | null;
  calendarEmploymentType?: string | null;
  calendarFullAccess?: boolean | null;
};

export function normalizeCalendarEmploymentType(value: unknown): CalendarEmploymentType {
  return value === 'employee' ? 'employee' : 'freelancer';
}

export function hasFullCalendarAccess(profile: CalendarAccessProfile | null | undefined): boolean {
  if (!profile) return false;
  if (profile.siteRole === 'admin') return true;
  if (profile.calendarFullAccess === true) return true;
  return normalizeCalendarEmploymentType(profile.calendarEmploymentType) === 'employee';
}

export function resolveCalendarAccessMode(
  profile: CalendarAccessProfile | null | undefined,
  previewMode: CalendarPreviewMode = 'policy',
): 'full' | 'personal' {
  if (previewMode === 'full') return 'full';
  if (previewMode === 'personal') return 'personal';
  return hasFullCalendarAccess(profile) ? 'full' : 'personal';
}
