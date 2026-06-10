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
  crewSource?: string;
  lastSyncSnapshotId?: string;
}

function mergeCrewLists(
  existing: GlobalProductionCrewEntry[] = [],
  incoming: GlobalProductionCrewEntry[] = [],
): GlobalProductionCrewEntry[] {
  const byIdentity = new Map<string, GlobalProductionCrewEntry>();
  const byNameAndRole = new Map<string, string>();

  for (const entry of [...existing, ...incoming]) {
    const normalizedPhone = normalizePhone(entry.normalizedPhone || entry.phone_number);
    const normalizedName = normalizeName(entry.name || '');
    const normalizedRole = normalizeRole(entry.profession || '');
    const nameAndRoleIdentity = `${normalizedName}::${normalizedRole}`;
    const identity = byNameAndRole.get(nameAndRoleIdentity) || normalizedPhone || nameAndRoleIdentity;
    if (!identity) continue;
    const previous = byIdentity.get(identity);
    byIdentity.set(identity, {
      name: entry.name || previous?.name || '',
      profession: entry.profession || previous?.profession || '',
      phone_number: normalizedPhone || previous?.phone_number || null,
      startTime: entry.startTime || previous?.startTime || '',
      endTime: entry.endTime || previous?.endTime || '',
      normalizedPhone: normalizedPhone || previous?.normalizedPhone || null,
      shadowKey: normalizedPhone
        ? null
        : entry.shadowKey || previous?.shadowKey || `${normalizedName}::${normalizedRole}`,
    });
    byNameAndRole.set(nameAndRoleIdentity, identity);
  }

  return Array.from(byIdentity.values());
}

export function mergeGlobalProduction(
  existing: GlobalProductionDoc | null,
  incoming: GlobalProductionDoc,
): GlobalProductionDoc {
  if (!existing) return incoming;

  const crewList = mergeCrewLists(existing.crew_list, incoming.crew_list);
  const crewPhones = new Set<string>();
  const crewShadowKeys = new Set<string>();
  for (const entry of crewList) {
    const phone = normalizePhone(entry.normalizedPhone || entry.phone_number);
    if (phone) crewPhones.add(phone);
    else if (entry.shadowKey) crewShadowKeys.add(entry.shadowKey);
  }

  return {
    ...existing,
    ...incoming,
    name: incoming.name || existing.name,
    studio: incoming.studio || existing.studio,
    date: incoming.date || existing.date,
    day: incoming.day || existing.day,
    startTime: incoming.startTime || existing.startTime,
    endTime: incoming.endTime || existing.endTime,
    status: incoming.status || existing.status,
    crew_list: crewList,
    crew_phones: Array.from(crewPhones),
    crew_shadow_keys: Array.from(crewShadowKeys),
    crewSource:
      incoming.crewSource === 'department' || existing.crewSource !== 'department'
        ? incoming.crewSource || existing.crewSource
        : existing.crewSource,
  };
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
