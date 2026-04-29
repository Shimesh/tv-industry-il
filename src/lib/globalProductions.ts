import { normalizePhone, normalizeName, normalizeRole } from '@/lib/crewNormalization';
import type { Production, CrewMember } from '@/lib/productionDiff';

export interface GlobalProductionCrewEntry {
  name: string;
  profession: string;
  phone_number: string | null;
  startTime: string;
  endTime: string;
  normalizedPhone: string | null;
  shadowKey: string | null;
}

export interface GlobalProductionDoc {
  id: string;
  name: string;
  studio: string;
  date: string;
  day: string;
  startTime: string;
  endTime: string;
  status: string;
  herzliyaId?: number;
  crew_list: GlobalProductionCrewEntry[];
  crew_phones: string[];         // flat — supports array-contains
  crew_shadow_keys: string[];    // flat — supports array-contains for phoneless crew
  lastUpdatedAt: string;
  lastUpdatedBy: string;
  sourceWeekPath: string;
}

export function toGlobalProduction(
  prod: Production,
  uploaderUid: string,
  sourceWeekPath: string,
): GlobalProductionDoc {
  const crewList: GlobalProductionCrewEntry[] = [];
  const phonesSet = new Set<string>();
  const shadowKeysSet = new Set<string>();

  for (const member of prod.crew ?? []) {
    const normPhone = normalizePhone(member.phone);
    const normName = normalizeName(member.name || '');
    const normRole = normalizeRole(member.role || '');

    const shadowKey =
      normPhone === null && normName
        ? `${normName}::${normRole || member.role || ''}`
        : null;

    crewList.push({
      name: member.name || '',
      profession: member.role || member.roleDetail || '',
      phone_number: normPhone,
      startTime: member.startTime || '',
      endTime: member.endTime || '',
      normalizedPhone: normPhone,
      shadowKey,
    });

    if (normPhone) {
      phonesSet.add(normPhone);
    } else if (shadowKey) {
      shadowKeysSet.add(shadowKey);
    }
  }

  return {
    id: prod.id,
    name: prod.name || '',
    studio: prod.studio || '',
    date: prod.date || '',
    day: prod.day || '',
    startTime: prod.startTime || '',
    endTime: prod.endTime || '',
    status: prod.status || 'scheduled',
    ...(prod.herzliyaId !== undefined ? { herzliyaId: prod.herzliyaId } : {}),
    crew_list: crewList,
    crew_phones: Array.from(phonesSet),
    crew_shadow_keys: Array.from(shadowKeysSet),
    lastUpdatedAt: prod.lastUpdatedAt || new Date().toISOString(),
    lastUpdatedBy: uploaderUid,
    sourceWeekPath,
  };
}

export function fromGlobalProduction(doc: GlobalProductionDoc): Production {
  const crew: CrewMember[] = (doc.crew_list ?? []).map((entry) => ({
    name: entry.name,
    role: entry.profession,
    roleDetail: entry.profession,
    phone: entry.phone_number,
    startTime: entry.startTime,
    endTime: entry.endTime,
    normalizedName: normalizeName(entry.name),
    normalizedPhone: entry.normalizedPhone,
    identityKey: entry.normalizedPhone
      ? `${normalizeName(entry.name)}::${entry.normalizedPhone}`
      : normalizeName(entry.name),
  }));

  return {
    id: doc.id,
    name: doc.name,
    studio: doc.studio,
    date: doc.date,
    day: doc.day,
    startTime: doc.startTime,
    endTime: doc.endTime,
    status: (doc.status as Production['status']) || 'scheduled',
    crew,
    lastUpdatedAt: doc.lastUpdatedAt,
    lastUpdatedBy: doc.lastUpdatedBy,
    ...(doc.herzliyaId !== undefined ? { herzliyaId: doc.herzliyaId } : {}),
  };
}
