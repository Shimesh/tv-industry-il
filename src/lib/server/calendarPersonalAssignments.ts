import { normalizeName, normalizePhone } from '@/lib/crewNormalization';
import type { CrewMember, Production } from '@/lib/productionDiff';
import { getWeekId } from '@/lib/productionDiff';
import { deleteDocument, listDocuments } from '@/lib/server/firestoreAdminRest';
import { getLinkedProductionIdentity } from '@/lib/server/identityLink';

type AssignmentIdentity = {
  phones: Set<string>;
  names: Set<string>;
  available: boolean;
};

function productionId(production: Pick<Production, 'id' | 'herzliyaId'>): string {
  return String(production.herzliyaId || production.id || '').trim();
}

async function getAssignmentIdentity(uid: string): Promise<AssignmentIdentity> {
  const identity = await getLinkedProductionIdentity({ uid, phoneNumber: null } as Parameters<typeof getLinkedProductionIdentity>[0]).catch(() => null);
  const phones = new Set<string>();
  const names = new Set<string>();

  for (const phone of identity?.phones || []) {
    const normalized = normalizePhone(phone);
    if (normalized) phones.add(normalized);
  }

  for (const name of identity?.names || []) {
    const normalized = normalizeName(name);
    if (normalized && normalized.length >= 2) names.add(normalized);
  }

  return {
    phones,
    names,
    available: phones.size > 0 || names.size > 0,
  };
}

function crewMemberMatchesIdentity(member: CrewMember, identity: AssignmentIdentity): boolean {
  const phone = normalizePhone(member.phone);
  if (phone && identity.phones.has(phone)) return true;

  const name = normalizeName(member.name || '');
  return Boolean(name && identity.names.has(name));
}

function hasAuthoritativePopupCrew(production: Production): boolean {
  const source = (production as Production & { crewSource?: string; popupParsed?: boolean }).crewSource;
  const popupParsed = (production as Production & { crewSource?: string; popupParsed?: boolean }).popupParsed;
  return (production.crew || []).length > 0 && (source === 'popup' || popupParsed === true);
}

export async function markPersonalAssignmentsFromCrew<T extends Production>(
  targetUid: string,
  productions: T[],
): Promise<{ productions: T[]; identityAvailable: boolean }> {
  const identity = await getAssignmentIdentity(targetUid);
  if (!identity.available) {
    return { productions, identityAvailable: false };
  }

  return {
    identityAvailable: true,
    productions: productions.map((production) => {
      if (!hasAuthoritativePopupCrew(production)) return production;
      return {
        ...production,
        isCurrentUserShift: (production.crew || []).some((member) => crewMemberMatchesIdentity(member, identity)),
      };
    }),
  };
}

export async function removeStalePersonalAssignments(
  targetUid: string,
  productions: Production[],
): Promise<number> {
  const byWeek = new Map<string, { importedIds: Set<string>; personalIds: Set<string> }>();

  for (const production of productions) {
    const id = productionId(production);
    if (!id || !production.date) continue;
    const weekId = getWeekId(production.date);
    const bucket = byWeek.get(weekId) || { importedIds: new Set<string>(), personalIds: new Set<string>() };
    bucket.importedIds.add(id);
    if (production.isCurrentUserShift === true) bucket.personalIds.add(id);
    byWeek.set(weekId, bucket);
  }

  let deleted = 0;
  for (const [weekId, bucket] of byWeek.entries()) {
    const docs = await listDocuments<Production>(`productions/${targetUid}/weeks/${weekId}/productions`).catch(() => []);
    await Promise.all(docs.map(async (doc) => {
      const id = productionId(doc);
      if (!id || !bucket.importedIds.has(id) || bucket.personalIds.has(id)) return;
      await deleteDocument(`productions/${targetUid}/weeks/${weekId}/productions/${id}`);
      deleted += 1;
    }));
  }

  return deleted;
}
