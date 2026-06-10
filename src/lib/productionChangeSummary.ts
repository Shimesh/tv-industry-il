type CrewLike = {
  name?: string;
  role?: string;
  roleDetail?: string;
  phone?: string | null;
  normalizedPhone?: string | null;
  startTime?: string;
  endTime?: string;
};

export type ProductionChangeData = {
  name?: string;
  studio?: string;
  date?: string;
  startTime?: string;
  endTime?: string;
  status?: string;
  isCurrentUserShift?: boolean;
  crew?: CrewLike[];
  lastSyncSnapshotId?: string;
};

export type ProductionChangeSummary = {
  title: string;
  message: string;
  fingerprint: string;
  details: string[];
};

function clean(value: unknown): string {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

function normalizePhone(value: unknown): string {
  const digits = clean(value).replace(/\D/g, '');
  if (!digits) return '';
  if (digits.startsWith('972') && digits.length >= 12) return `0${digits.slice(-9)}`;
  if (digits.length === 9) return `0${digits}`;
  return digits.length >= 10 ? digits.slice(-10) : digits;
}

function formatDate(value: string): string {
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return match ? `${match[3]}/${match[2]}/${match[1]}` : value || 'לא ידוע';
}

function formatTimeRange(start: string, end: string): string {
  return `${start || '--:--'}–${end || '--:--'}`;
}

function statusLabel(status: string): string {
  if (status === 'scheduled') return 'מתוכננת';
  if (status === 'cancelled') return 'בוטלה';
  if (status === 'completed') return 'הושלמה';
  return status || 'לא ידוע';
}

type CanonicalCrew = {
  identity: string;
  name: string;
  role: string;
  phone: string;
  startTime: string;
  endTime: string;
};

function canonicalCrew(crew: CrewLike[] | undefined): CanonicalCrew[] {
  const byIdentity = new Map<string, CanonicalCrew>();

  for (const member of crew || []) {
    const name = clean(member.name).toLocaleLowerCase('he');
    if (!name) continue;
    const role = clean(member.role || member.roleDetail);
    const phone = normalizePhone(member.normalizedPhone || member.phone);
    const identity = name;
    const previous = byIdentity.get(identity);
    byIdentity.set(identity, {
      identity,
      name: clean(member.name) || previous?.name || '',
      role: role || previous?.role || '',
      phone: phone || previous?.phone || '',
      startTime: clean(member.startTime) || previous?.startTime || '',
      endTime: clean(member.endTime) || previous?.endTime || '',
    });
  }

  return [...byIdentity.values()].sort((a, b) => a.identity.localeCompare(b.identity, 'he'));
}

function crewDescription(member: CanonicalCrew): string {
  return member.role ? `${member.name} (${member.role})` : member.name;
}

export function summarizeProductionChange(
  previous: ProductionChangeData | undefined,
  current: ProductionChangeData,
): ProductionChangeSummary | null {
  if (!previous) return null;

  const details: string[] = [];
  const fingerprintParts: string[] = [];
  const addChange = (key: string, description: string, before: unknown, after: unknown) => {
    details.push(description);
    fingerprintParts.push(`${key}:${JSON.stringify(before)}>${JSON.stringify(after)}`);
  };

  const previousName = clean(previous.name);
  const currentName = clean(current.name);
  if (previousName !== currentName) {
    addChange('name', `השם השתנה מ־"${previousName || 'ללא שם'}" ל־"${currentName || 'ללא שם'}"`, previousName, currentName);
  }

  const previousDate = clean(previous.date);
  const currentDate = clean(current.date);
  if (previousDate !== currentDate) {
    addChange('date', `התאריך השתנה מ־${formatDate(previousDate)} ל־${formatDate(currentDate)}`, previousDate, currentDate);
  }

  const previousStudio = clean(previous.studio);
  const currentStudio = clean(current.studio);
  if (previousStudio !== currentStudio) {
    addChange('studio', `האולפן השתנה מ־"${previousStudio || 'לא צוין'}" ל־"${currentStudio || 'לא צוין'}"`, previousStudio, currentStudio);
  }

  const previousStart = clean(previous.startTime);
  const previousEnd = clean(previous.endTime);
  const currentStart = clean(current.startTime);
  const currentEnd = clean(current.endTime);
  if (previousStart !== currentStart || previousEnd !== currentEnd) {
    addChange(
      'time',
      `השעות השתנו מ־${formatTimeRange(previousStart, previousEnd)} ל־${formatTimeRange(currentStart, currentEnd)}`,
      [previousStart, previousEnd],
      [currentStart, currentEnd],
    );
  }

  const previousStatus = clean(previous.status);
  const currentStatus = clean(current.status);
  if (previousStatus !== currentStatus) {
    addChange(
      'status',
      `הסטטוס השתנה מ־${statusLabel(previousStatus)} ל־${statusLabel(currentStatus)}`,
      previousStatus,
      currentStatus,
    );
  }

  const previousAssignment = previous.isCurrentUserShift === true;
  const currentAssignment = current.isCurrentUserShift === true;
  if (previousAssignment !== currentAssignment) {
    addChange(
      'assignment',
      currentAssignment ? 'נוספת למשמרת בהפקה' : 'הוסרת מהמשמרת בהפקה',
      previousAssignment,
      currentAssignment,
    );
  }

  const previousCrew = canonicalCrew(previous.crew);
  const currentCrew = canonicalCrew(current.crew);
  const previousById = new Map(previousCrew.map((member) => [member.identity, member]));
  const currentById = new Map(currentCrew.map((member) => [member.identity, member]));

  const addedCrew = currentCrew.filter((member) => !previousById.has(member.identity));
  const removedCrew = previousCrew.filter((member) => !currentById.has(member.identity));
  const updatedCrew = currentCrew.filter((member) => {
    const oldMember = previousById.get(member.identity);
    return oldMember && (
      oldMember.name !== member.name
      || oldMember.role !== member.role
      || oldMember.phone !== member.phone
      || oldMember.startTime !== member.startTime
      || oldMember.endTime !== member.endTime
    );
  });

  if (addedCrew.length) {
    addChange('crew-added', `נוספו לצוות: ${addedCrew.map(crewDescription).join(', ')}`, [], addedCrew);
  }
  if (removedCrew.length) {
    addChange('crew-removed', `הוסרו מהצוות: ${removedCrew.map(crewDescription).join(', ')}`, removedCrew, []);
  }
  if (updatedCrew.length) {
    addChange(
      'crew-updated',
      `עודכנו פרטי צוות: ${updatedCrew.map(crewDescription).join(', ')}`,
      updatedCrew.map((member) => previousById.get(member.identity)),
      updatedCrew,
    );
  }

  if (!details.length) return null;

  const productionName = currentName || previousName || 'הפקה';
  return {
    title: `הפקה עודכנה: ${productionName}`,
    message: details.join(' • '),
    fingerprint: fingerprintParts.join('|'),
    details,
  };
}

export function stableNotificationHash(value: string): string {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index++) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}
