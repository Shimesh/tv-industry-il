// Production Schedule Types & Diff Algorithm

export interface CrewMember {
  name: string;
  role: string;
  roleDetail: string;
  phone: string;
  startTime: string;
  endTime: string;
  addedBy?: string;
  addedAt?: string;
  isCurrentUser?: boolean;
}

export interface Production {
  id: string; // hash of name+date+studio
  name: string;
  studio: string;
  date: string; // YYYY-MM-DD
  day: string; // יום א׳, יום ב׳...
  startTime: string;
  endTime: string;
  status: 'scheduled' | 'cancelled' | 'completed';
  crew: CrewMember[];
  lastUpdatedBy?: string;
  lastUpdatedAt?: string;
  versions?: VersionEntry[];
  isCurrentUserShift?: boolean;
  herzliyaId?: number;
}

export interface VersionEntry {
  timestamp: string;
  changedBy: string;
  changedByName: string;
  changes: Change[];
}

export interface Change {
  type: 'ADD_PRODUCTION' | 'UPDATE_TIME' | 'ADD_CREW' | 'CANCEL_PRODUCTION' | 'UPDATE_CREW';
  productionName: string;
  productionDate: string;
  description: string;
  details?: Record<string, unknown>;
}

export interface ScheduleDiff {
  changes: Change[];
  hasChanges: boolean;
  summary: string;
}

export interface WeekMetadata {
  weekId: string;
  weekStart: string;
  weekEnd: string;
  lastUpdated: string;
  updateCount: number;
  contributors: string[];
}

export interface ParsedSchedule {
  workerName: string;
  weekStart: string;
  weekEnd: string;
  productions: Production[];
}

// Generate a stable ID for a production (composite key)
export function generateProductionId(name: string, date: string, studio: string): string {
  const key = `${name}::${date}::${studio}`.toLowerCase().trim();
  // Simple hash
  let hash = 0;
  for (let i = 0; i < key.length; i++) {
    const char = key.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  return Math.abs(hash).toString(36);
}

// Generate weekId from a date (Sunday of that week)
export function getWeekId(dateStr: string): string {
  const date = new Date(dateStr);
  const day = date.getDay();
  const diff = date.getDate() - day; // Sunday
  const sunday = new Date(date.setDate(diff));
  return sunday.toISOString().split('T')[0];
}

// Format date for display: "16/03"
export function formatDateShort(dateStr: string): string {
  const [, month, day] = dateStr.split('-');
  return `${day}/${month}`;
}

// Hebrew day names
const hebrewDays = ['יום א׳', 'יום ב׳', 'יום ג׳', 'יום ד׳', 'יום ה׳', 'יום ו׳', 'שבת'];

export function getHebrewDay(dateStr: string): string {
  const date = new Date(dateStr);
  return hebrewDays[date.getDay()];
}

// Main diff algorithm
export function diffSchedules(
  existing: Production[],
  incoming: Production[]
): ScheduleDiff {
  const changes: Change[] = [];

  for (const newProd of incoming) {
    const existingProd = existing.find(p =>
      p.name === newProd.name &&
      p.date === newProd.date &&
      p.studio === newProd.studio
    );

    if (!existingProd) {
      // Completely new production
      changes.push({
        type: 'ADD_PRODUCTION',
        productionName: newProd.name,
        productionDate: newProd.date,
        description: `הוספת הפקה "${newProd.name}" (${formatDateShort(newProd.date)})`,
        details: { production: newProd },
      });
      continue;
    }

    // Check time changes
    if (existingProd.startTime !== newProd.startTime ||
      existingProd.endTime !== newProd.endTime) {
      changes.push({
        type: 'UPDATE_TIME',
        productionName: newProd.name,
        productionDate: newProd.date,
        description: `שינוי שעות "${newProd.name}" (${formatDateShort(newProd.date)}): ${existingProd.startTime}-${existingProd.endTime} → ${newProd.startTime}-${newProd.endTime}`,
        details: {
          oldStart: existingProd.startTime,
          oldEnd: existingProd.endTime,
          newStart: newProd.startTime,
          newEnd: newProd.endTime,
        },
      });
    }

    // Check crew changes (by name - no duplicates)
    for (const newCrew of newProd.crew) {
      const exists = existingProd.crew.find(c => c.name === newCrew.name);
      if (!exists) {
        changes.push({
          type: 'ADD_CREW',
          productionName: existingProd.name,
          productionDate: existingProd.date,
          description: `הוספת ${newCrew.role} "${newCrew.name}" להפקת "${existingProd.name}" (${formatDateShort(existingProd.date)})`,
          details: { crewMember: newCrew },
        });
      }
    }
  }

  // Check for cancellations
  for (const existingProd of existing) {
    const stillExists = incoming.find(p =>
      p.name === existingProd.name &&
      p.date === existingProd.date
    );
    if (!stillExists && existingProd.status !== 'cancelled') {
      changes.push({
        type: 'CANCEL_PRODUCTION',
        productionName: existingProd.name,
        productionDate: existingProd.date,
        description: `ביטול הפקה "${existingProd.name}" (${formatDateShort(existingProd.date)})`,
      });
    }
  }

  // Build summary
  const parts: string[] = [];
  const addCount = changes.filter(c => c.type === 'ADD_PRODUCTION').length;
  const updateCount = changes.filter(c => c.type === 'UPDATE_TIME').length;
  const crewCount = changes.filter(c => c.type === 'ADD_CREW').length;
  const cancelCount = changes.filter(c => c.type === 'CANCEL_PRODUCTION').length;

  if (addCount > 0) parts.push(`${addCount} הפקות חדשות`);
  if (updateCount > 0) parts.push(`${updateCount} שינויי שעות`);
  if (crewCount > 0) parts.push(`${crewCount} אנשי צוות חדשים`);
  if (cancelCount > 0) parts.push(`${cancelCount} ביטולים`);

  const summary = parts.length > 0
    ? `עודכן! ${changes.length} שינויים: ${parts.join(', ')}`
    : 'אין שינויים';

  return { changes, hasChanges: changes.length > 0, summary };
}

// Apply diff changes to existing productions
export function applyDiff(
  existing: Production[],
  incoming: Production[],
  diff: ScheduleDiff,
  userId: string,
  userName: string
): Production[] {
  const result = [...existing];
  const now = new Date().toISOString();

  for (const change of diff.changes) {
    switch (change.type) {
      case 'ADD_PRODUCTION': {
        const newProd = (change.details as { production: Production }).production;
        result.push({
          ...newProd,
          lastUpdatedBy: userId,
          lastUpdatedAt: now,
          versions: [{
            timestamp: now,
            changedBy: userId,
            changedByName: userName,
            changes: [change],
          }],
        });
        break;
      }
      case 'UPDATE_TIME': {
        const idx = result.findIndex(p =>
          p.name === change.productionName &&
          p.date === change.productionDate
        );
        if (idx >= 0) {
          const details = change.details as { newStart: string; newEnd: string };
          result[idx] = {
            ...result[idx],
            startTime: details.newStart,
            endTime: details.newEnd,
            lastUpdatedBy: userId,
            lastUpdatedAt: now,
            versions: [
              ...(result[idx].versions || []),
              { timestamp: now, changedBy: userId, changedByName: userName, changes: [change] },
            ],
          };
        }
        break;
      }
      case 'ADD_CREW': {
        const idx = result.findIndex(p =>
          p.name === change.productionName &&
          p.date === change.productionDate
        );
        if (idx >= 0) {
          const crewMember = (change.details as { crewMember: CrewMember }).crewMember;
          const existingCrew = result[idx].crew.find(c => c.name === crewMember.name);
          if (!existingCrew) {
            result[idx] = {
              ...result[idx],
              crew: [...result[idx].crew, { ...crewMember, addedBy: userId, addedAt: now }],
              lastUpdatedBy: userId,
              lastUpdatedAt: now,
              versions: [
                ...(result[idx].versions || []),
                { timestamp: now, changedBy: userId, changedByName: userName, changes: [change] },
              ],
            };
          }
        }
        break;
      }
      case 'CANCEL_PRODUCTION': {
        const idx = result.findIndex(p =>
          p.name === change.productionName &&
          p.date === change.productionDate
        );
        if (idx >= 0) {
          result[idx] = {
            ...result[idx],
            status: 'cancelled',
            lastUpdatedBy: userId,
            lastUpdatedAt: now,
            versions: [
              ...(result[idx].versions || []),
              { timestamp: now, changedBy: userId, changedByName: userName, changes: [change] },
            ],
          };
        }
        break;
      }
    }
  }

  return result;
}
