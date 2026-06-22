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
  const byName = new Map<string, string>();

  for (const entry of [...existing, ...incoming]) {
    const normalizedPhone = normalizePhone(entry.normalizedPhone || entry.phone_number);
    const normalizedName = normalizeName(entry.name || '');
    const normalizedRole = normalizeRole(entry.profession || '');
    const nameAndRoleIdentity = `${normalizedName}::${normalizedRole}`;
    const identity = byNameAndRole.get(nameAndRoleIdentity)
      || (!normalizedPhone ? byName.get(normalizedName) : undefined)
      || normalizedPhone
      || nameAndRoleIdentity;
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
    if (!normalizedPhone) byName.set(normalizedName, identity);
  }

  return Array.from(byIdentity.values());
}

export function mergeGlobalProduction(
  existing: GlobalProductionDoc | null,
  incoming: GlobalProductionDoc,
): GlobalProductionDoc {
  if (!existing) return incoming;

  const incomingAuthoritative = incoming.crewSource === 'popup';
  const crewList = incomingAuthoritative
    ? incoming.crew_list ?? []
    : mergeCrewLists(existing.crew_list, incoming.crew_list);
  const crewPhones = new Set<string>();
  const crewShadowKeys = new Set<string>();
  for (const entry of crewList) {
    const phone = normalizePhone(entry.normalizedPhone || entry.phone_number);
    if (phone) crewPhones.add(phone);
    else if (entry.shadowKey) crewShadowKeys.add(entry.shadowKey);
  }

  const isGenericName = (n: string) => !n || n === 'הפקה';
  return {
    ...existing,
    ...incoming,
    name: !isGenericName(existing.name) && isGenericName(incoming.name) ? existing.name : (incoming.name || existing.name),
    studio: incoming.studio || existing.studio,
    date: incoming.date || existing.date,
    day: incoming.day || existing.day,
    startTime: incoming.startTime || existing.startTime,
    endTime: incoming.endTime || existing.endTime,
    status: incoming.status || existing.status,
    crew_list: crewList,
    crew_phones: Array.from(crewPhones),
    crew_shadow_keys: Array.from(crewShadowKeys),
    crewSource: incoming.crewSource === 'popup'
      ? 'popup'
      : existing.crewSource || incoming.crewSource,
  };
}

function crewKey(entry: GlobalProductionCrewEntry): string {
  const phone = normalizePhone(entry.phone_number || entry.normalizedPhone || null);
  if (phone) return `phone:${phone}`;

  const name = normalizeName(entry.name || '');
  const role = normalizeRole(entry.profession || '');
  return `name:${name}${role ? `::${role}` : ''}`;
}

function mergeCrewEntry(
  existing: GlobalProductionCrewEntry,
  incoming: GlobalProductionCrewEntry,
): GlobalProductionCrewEntry {
  const phone = normalizePhone(incoming.phone_number || incoming.normalizedPhone || existing.phone_number || existing.normalizedPhone || null);
  const name = normalizeName(existing.name || incoming.name || '');
  const profession = existing.profession || incoming.profession || '';
  const shadowKey = phone
    ? null
    : existing.shadowKey || incoming.shadowKey || (name ? `${name}::${normalizeRole(profession)}` : null);

  return {
    name: existing.name || incoming.name || name,
    profession,
    phone_number: phone,
    startTime: existing.startTime || incoming.startTime || '',
    endTime: existing.endTime || incoming.endTime || '',
    normalizedPhone: phone,
    shadowKey,
  };
}

export function mergeGlobalProductionDocs(
  existing: GlobalProductionDoc | null | undefined,
  incoming: GlobalProductionDoc,
): GlobalProductionDoc {
  if (!existing) return incoming;

  if (incoming.crewSource === 'popup') {
    return {
      ...existing,
      ...incoming,
      crew_phones: Array.from(new Set((incoming.crew_list ?? []).map((member) => normalizePhone(member.phone_number || member.normalizedPhone)).filter((phone): phone is string => Boolean(phone)))),
      crew_shadow_keys: Array.from(new Set((incoming.crew_list ?? []).map((member) => member.shadowKey).filter((key): key is string => Boolean(key)))),
    };
  }

  const crewByKey = new Map<string, GlobalProductionCrewEntry>();
  const noPhoneByName = new Map<string, string>();
  for (const entry of [...(existing.crew_list ?? []), ...(incoming.crew_list ?? [])]) {
    const phone = normalizePhone(entry.phone_number || entry.normalizedPhone || null);
    const name = normalizeName(entry.name || '');
    const key = !phone && noPhoneByName.has(name) ? noPhoneByName.get(name)! : crewKey(entry);
    if (!key || key === 'name:') continue;
    const current = crewByKey.get(key);
    crewByKey.set(key, current ? mergeCrewEntry(current, entry) : entry);
    if (!phone) noPhoneByName.set(name, key);
  }

  const crewList = Array.from(crewByKey.values());

  return {
    ...existing,
    ...incoming,
    crew_list: crewList,
    crew_phones: Array.from(new Set(crewList.map((member) => normalizePhone(member.phone_number || member.normalizedPhone)).filter((phone): phone is string => Boolean(phone)))),
    crew_shadow_keys: Array.from(new Set(crewList.map((member) => member.shadowKey).filter((key): key is string => Boolean(key)))),
    crewSource: incoming.crewSource === 'popup'
      ? 'popup'
      : existing.crewSource || incoming.crewSource,
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
  // Deduplicate crew by normalizedName::normalizedRole so the same person
  // listed in multiple Herzliya schedule blocks doesn't create duplicate entries.
  const seenCrewKeys = new Set<string>();

  for (const member of prod.crew ?? []) {
    const normPhone = normalizePhone(member.phone);
    const normName = normalizeName(member.name || '');
    const normRole = normalizeRole(member.role || '');
    const dedupKey = normPhone ?? `${normName}::${normRole || member.role || ''}`;
    if (dedupKey && seenCrewKeys.has(dedupKey)) continue;
    if (dedupKey) seenCrewKeys.add(dedupKey);

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
    crewSource: ((prod as Production & { popupParsed?: boolean }).popupParsed ? 'popup' : undefined)
      || (prod as Production & { crewSource?: string }).crewSource
      || ((prod as Production & { departmentEnriched?: boolean }).departmentEnriched ? 'department' : undefined),
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
