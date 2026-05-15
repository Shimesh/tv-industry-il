import { NextRequest, NextResponse } from 'next/server';
import { verifyAuthToken, unauthorizedResponse } from '@/lib/apiAuth';
import { normalizeName, normalizePhone } from '@/lib/crewNormalization';
import { getChannelName, inferChannelIdFromTitle, isMajorProductionTitle, resolveProCardMedia } from '@/lib/proCardMedia';
import type { IndustryMasterEntry, NearMiss, ProCardBoardActivity, ProCardHistoryResponse, ProCardProductionCredit, ProductionRegistryEntry } from '@/lib/proCardTypes';
import { stripProductionSuffixes } from '@/lib/productionNameNormalization';
import { getDocument, listDocuments } from '@/lib/server/firestoreAdminRest';
import { loadContactsSnapshot } from '@/lib/server/sessionBootstrap';
import type { GlobalProductionDoc, GlobalProductionCrewEntry } from '@/lib/globalProductions';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

type RawContact = Record<string, unknown>;
type RawUser = {
  uid?: string;
  id?: string;
  displayName?: string;
  linkedContactId?: string | number | null;
  profileId?: string;
};
type RawPost = {
  id?: string;
  title?: string;
  type?: string;
  category?: string;
  authorId?: string;
  authorName?: string;
  createdAt?: string | number;
};
type FlexibleHistoryDoc = Record<string, unknown> & { id?: string };

function cleanString(value: unknown): string {
  return typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : '';
}

function contactName(contact: RawContact): string {
  const explicit = cleanString(contact.displayName || contact.name || contact.fullName || contact.crewName);
  if (explicit) return explicit;
  return `${cleanString(contact.firstName)} ${cleanString(contact.lastName)}`.trim();
}

function asDateValue(value: unknown): string {
  if (typeof value === 'string' && value) return value.slice(0, 10);
  if (typeof value === 'number') return new Date(value).toISOString().slice(0, 10);
  return new Date().toISOString().slice(0, 10);
}

function stringArray(value: unknown): string[] {
  if (Array.isArray(value)) return value.map((item) => cleanString(item)).filter(Boolean);
  const single = cleanString(value);
  return single ? [single] : [];
}

// Fuzzy word-based match — handles:
// • word-order independence: "אורבך ירון" matches "ירון אורבך"
// • abbreviations: "ירון א." matches "ירון אורבך" (sw.startsWith(ew))
// • dashes as word separators: "ירון-אורבך" → "ירון אורבך"
// • partial single-word: entry "ירון" or "אורבך" alone matches full name
function nameMatchesFuzzy(entryName: string, displayNames: Set<string>): boolean {
  if (!entryName) return false;
  // Treat dashes as word separators before normalizing
  const normalized = normalizeName(entryName.replace(/[-–—]/g, ' '));
  if (!normalized || normalized.length < 2) return false;
  const entryWords = normalized.split(/\s+/).filter(Boolean);
  for (const dn of displayNames) {
    if (!dn || dn.length < 2) continue;
    if (normalized === dn) return true;
    const searchWords = dn.split(/\s+/).filter(Boolean);
    // All search words found in entry (handles abbreviation: "א" matches "אורבך")
    if (searchWords.every((sw) => entryWords.some((ew) => ew === sw || ew.startsWith(sw) || sw.startsWith(ew)))) return true;
    // All entry words found in search (handles single-token entries like "ירון" or "אורבך")
    if (entryWords.every((ew) => searchWords.some((sw) => sw === ew || sw.startsWith(ew) || ew.startsWith(sw)))) return true;
  }
  return false;
}

// Near-miss: entry name shares at least one token's first character with displayNames (weak signal only)
function nameIsNearMiss(entryName: string, displayNames: Set<string>): boolean {
  if (!entryName) return false;
  const normalized = normalizeName(entryName.replace(/[-–—]/g, ' '));
  if (!normalized) return false;
  const entryWords = normalized.split(/\s+/).filter((w) => w.length >= 2);
  for (const dn of displayNames) {
    const searchWords = dn.split(/\s+/).filter((w) => w.length >= 2);
    if (searchWords.some((sw) => entryWords.some((ew) => ew[0] === sw[0]))) return true;
  }
  return false;
}

// Broader fallback: any token from displayNames (≥3 chars) appears as substring of the entry name
function nameContainsToken(entryName: string, displayNames: Set<string>): boolean {
  if (!entryName) return false;
  const normalized = normalizeName(entryName.replace(/[-–—]/g, ' '));
  if (!normalized) return false;
  for (const dn of displayNames) {
    const tokens = dn.split(/\s+/).filter((w) => w.length >= 3);
    if (tokens.some((tok) => normalized.includes(tok) || tok.includes(normalized))) return true;
  }
  return false;
}

function docMatchesUser(
  doc: FlexibleHistoryDoc,
  userIds: Set<string>,
  emails: Set<string>,
  displayNames: Set<string>,
  phones?: Set<string>,
): boolean {
  const uidCandidates = [
    doc.uid,
    doc.userId,
    doc.authorId,
    doc.ownerId,
    doc.profileUid,
    doc.createdBy,
    doc.assignedUid,
    ...stringArray(doc.uids),
    ...stringArray(doc.userIds),
    ...stringArray(doc.participantUids),
    ...stringArray(doc.assignedUids),
  ].map(cleanString).filter(Boolean);

  if (uidCandidates.some((uid) => userIds.has(uid))) {
    console.log('[pro-card-history] uid match on doc', doc.id);
    return true;
  }

  const emailCandidates = [
    doc.email,
    doc.userEmail,
    doc.authorEmail,
    doc.ownerEmail,
    doc.profileEmail,
    ...stringArray(doc.emails),
    ...stringArray(doc.userEmails),
    ...stringArray(doc.participantEmails),
    ...stringArray(doc.assignedEmails),
  ].map((value) => cleanString(value).toLocaleLowerCase()).filter(Boolean);

  if (emailCandidates.some((email) => emails.has(email))) {
    console.log('[pro-card-history] email match on doc', doc.id);
    return true;
  }

  const allPersonnel = [
    ...(Array.isArray(doc.crew) ? doc.crew : []),
    ...(Array.isArray(doc.crew_list) ? doc.crew_list : []),
    ...(Array.isArray(doc.personnel) ? doc.personnel : []),
    ...(Array.isArray(doc.team) ? doc.team : []),
  ];

  const matched = allPersonnel.some((entry) => {
    if (!entry) return false;
    if (typeof entry === 'string') {
      return nameMatchesFuzzy(entry, displayNames) || nameContainsToken(entry, displayNames);
    }
    if (typeof entry !== 'object') return false;
    const record = entry as Record<string, unknown>;
    const uid = cleanString(record.uid || record.userId || record.profileUid);
    const email = cleanString(record.email || record.userEmail).toLocaleLowerCase();
    const entryPhone = normalizePhone(cleanString(record.phone || record.phone_number || record.normalizedPhone));
    const rawName = cleanString(record.name || record.displayName || record.fullName || '');
    return Boolean(
      (uid && userIds.has(uid)) ||
      (email && emails.has(email)) ||
      (entryPhone && phones?.has(entryPhone)) ||
      (rawName && (nameMatchesFuzzy(rawName, displayNames) || nameContainsToken(rawName, displayNames))),
    );
  });

  if (matched) console.log('[pro-card-history] personnel match on doc', doc.id);
  return matched;
}

function roleFromFlexibleDoc(doc: FlexibleHistoryDoc): string {
  return cleanString(doc.role || doc.profession || doc.roleDetail || doc.position || doc.category) || 'קרדיט';
}

function titleFromFlexibleDoc(doc: FlexibleHistoryDoc): string {
  return cleanString(doc.productionName || doc.title || doc.name || doc.eventTitle || doc.projectName) || 'הפקה';
}

function dateFromFlexibleDoc(doc: FlexibleHistoryDoc): string {
  return asDateValue(doc.date || doc.startDate || doc.startAt || doc.eventDate || doc.createdAt);
}

function creditFromFlexibleDoc(doc: FlexibleHistoryDoc, source: 'calendar' | 'work-boards'): ProCardProductionCredit {
  const productionName = titleFromFlexibleDoc(doc);
  const date = dateFromFlexibleDoc(doc);
  const channelId = cleanString(doc.channelId) || inferChannelIdFromTitle(productionName, cleanString(doc.channel || doc.network || doc.studio));
  const isMajor = doc.isMajor === true || doc.majorProduction === true || isMajorProductionTitle(productionName);

  return {
    id: `${source}-${cleanString(doc.id) || productionName}-${date}`,
    productionName,
    date,
    dateFrom: date,
    dateTo: date,
    year: date.slice(0, 4),
    studio: cleanString(doc.studio || doc.location || doc.channel || doc.network),
    role: roleFromFlexibleDoc(doc),
    channelId: channelId || null,
    channelName: cleanString(doc.channelName || doc.channel || doc.network) || getChannelName(channelId || null),
    isMajor,
    media: resolveProCardMedia(productionName, channelId || null),
    shiftCount: 1,
  };
}

function matchingCrewEntry(
  crew: GlobalProductionCrewEntry[],
  contactPhone: string | null,
  displayNames: Set<string>,
): GlobalProductionCrewEntry | null {
  // Pass 1: exact phone or full fuzzy name match
  const exact = crew.find((entry) => {
    const entryPhone = normalizePhone(entry.normalizedPhone || entry.phone_number || '');
    if (contactPhone && entryPhone && entryPhone === contactPhone) return true;
    return nameMatchesFuzzy(entry.name || '', displayNames);
  });
  if (exact) return exact;
  // Pass 2: substring token match (broader — e.g. "ירון" in "ירון כהן")
  return crew.find((entry) => nameContainsToken(entry.name || '', displayNames)) || null;
}

// Deduplicate by id/key, then merge multiple shifts of the same show into one entry
function mergeAndDedupeCredits(credits: ProCardProductionCredit[]): ProCardProductionCredit[] {
  // Step 1: dedup exact duplicates by id + composite key
  const seenIds = new Set<string>();
  const seenKeys = new Set<string>();
  const deduped: ProCardProductionCredit[] = [];
  for (const credit of credits) {
    const key = `${credit.productionName}:${credit.date}:${credit.role}:${credit.channelName}`;
    if (seenIds.has(credit.id) || seenKeys.has(key)) continue;
    seenIds.add(credit.id);
    seenKeys.add(key);
    deduped.push(credit);
  }

  // Step 2: merge multiple shifts on the same show (same productionName + role) into one entry
  const groups = new Map<string, ProCardProductionCredit[]>();
  for (const credit of deduped) {
    const groupKey = `${normalizeName(credit.productionName)}::${normalizeName(credit.role)}`;
    if (!groups.has(groupKey)) groups.set(groupKey, []);
    groups.get(groupKey)!.push(credit);
  }

  return Array.from(groups.values()).map((group) => {
    if (group.length === 1) return { ...group[0], dateFrom: group[0].date, dateTo: group[0].date, shiftCount: 1 };
    const sorted = [...group].sort((a, b) => a.date.localeCompare(b.date));
    const mostRecent = sorted[sorted.length - 1];
    return {
      ...mostRecent,
      id: sorted[0].id,
      dateFrom: sorted[0].date,
      dateTo: mostRecent.date,
      date: mostRecent.date,
      year: mostRecent.year,
      shiftCount: group.length,
    };
  });
}

function applyRegistryOverrides(
  credits: ProCardProductionCredit[],
  registry: Map<string, ProductionRegistryEntry>,
  master: Map<string, IndustryMasterEntry>,
): ProCardProductionCredit[] {
  return credits.map((credit) => {
    // Strip operational suffixes so "ארץ נהדרת - טסטים" resolves to "ארץ נהדרת" master entry
    const canonicalName = stripProductionSuffixes(credit.productionName);
    const key = normalizeName(canonicalName);
    const rawKey = normalizeName(credit.productionName);
    const reg = registry.get(key) ?? registry.get(rawKey);
    const mst = master.get(key) ?? master.get(rawKey);
    // industry_master takes priority over production-registry for logo and network
    // Only use logo if it passed title verification (wikiTitleMatch !== 'needs_review')
    const masterLogo = (mst?.logoUrl && mst.logoUrl !== 'none' && mst.wikiTitleMatch !== 'needs_review')
      ? mst.logoUrl
      : null;
    const logoUrl = masterLogo
      ?? (reg?.logoUrl && reg.logoUrl !== 'none' ? reg.logoUrl : null)
      ?? credit.logoUrl;
    const channelName = mst?.network || reg?.channel || credit.channelName;
    const isMajor = credit.isMajor || Boolean(reg?.isMajor);
    return { ...credit, logoUrl, channelName, isMajor };
  });
}

async function loadLinkedUserIds(contact: RawContact, normalizedContactName: string): Promise<Set<string>> {
  const contactId = String(contact.id || '');
  const users = await listDocuments<RawUser>('users').catch(() => []);
  return users.reduce((acc, user) => {
    const linkedContactId = user.linkedContactId === null || user.linkedContactId === undefined
      ? ''
      : String(user.linkedContactId);
    const userName = normalizeName(user.displayName || '');
    if ((contactId && linkedContactId === contactId) || (normalizedContactName && userName === normalizedContactName)) {
      const uid = user.uid || user.id;
      if (uid) acc.add(uid);
    }
    return acc;
  }, new Set<string>());
}

export async function GET(request: NextRequest) {
  const authUser = await verifyAuthToken(request);
  if (!authUser) return unauthorizedResponse();

  const contactId = request.nextUrl.searchParams.get('contactId')?.trim();
  if (!contactId) {
    return NextResponse.json({ error: 'contactId is required' }, { status: 400 });
  }

  try {
    const snapshot = await loadContactsSnapshot();
    const userDoc = await getDocument<RawUser & { email?: string; phone?: string; photoURL?: string | null; customPhotoURL?: string | null }>(`users/${authUser.uid}`).catch(() => null);
    const contact = snapshot.contacts.find((entry) => String(entry.id || '') === contactId)
      || (contactId === authUser.uid && userDoc ? {
        id: authUser.uid,
        firstName: cleanString(userDoc.displayName || authUser.displayName).split(/\s+/)[0] || '',
        lastName: cleanString(userDoc.displayName || authUser.displayName).split(/\s+/).slice(1).join(' '),
        email: cleanString(userDoc.email || authUser.email),
        phone: cleanString(userDoc.phone),
        photoURL: cleanString(userDoc.photoURL || authUser.photoURL || ''),
        customPhotoURL: cleanString(userDoc.customPhotoURL || ''),
      } : null);
    if (!contact || contact.hiddenFromDirectory === true) {
      return NextResponse.json({ error: 'Contact not found' }, { status: 404 });
    }

    const fullName = contactName(contact);
    const normalizedContactName = normalizeName(fullName);
    const contactPhone = normalizePhone(cleanString(contact.normalizedPhone) || cleanString(contact.phone));
    const linkedUserIds = await loadLinkedUserIds(contact, normalizedContactName);
    linkedUserIds.add(authUser.uid);
    const userEmails = new Set<string>(
      [
        cleanString(contact.email),
        cleanString(userDoc?.email),
        cleanString(authUser.email),
      ].map((email) => email.toLocaleLowerCase()).filter(Boolean),
    );

    const displayNames = new Set<string>([normalizedContactName].filter(Boolean));
    const nameParts = (fullName || '').split(/\s+/).filter(Boolean);
    const firstName = normalizeName(nameParts[0] || '');
    const lastName = normalizeName(nameParts[nameParts.length - 1] || '');
    if (firstName && firstName.length >= 2) displayNames.add(firstName);
    if (lastName && lastName.length >= 2 && lastName !== firstName) displayNames.add(lastName);

    const userPhones = new Set<string>(
      [contactPhone, normalizePhone(cleanString(userDoc?.phone))].filter(Boolean) as string[],
    );

    console.log('[pro-card-history] searching for', {
      contactId,
      fullName,
      normalizedContactName,
      linkedUserIds: [...linkedUserIds],
      emails: [...userEmails],
    });

    const [globalProductions, calendarDocs, workBoardDocs, registryDocs, masterDocs] = await Promise.all([
      listDocuments<GlobalProductionDoc>('global_productions').catch(() => []),
      listDocuments<FlexibleHistoryDoc>('calendar').catch(() => []),
      listDocuments<FlexibleHistoryDoc>('work-boards').catch(() => []),
      listDocuments<ProductionRegistryEntry>('production-registry').catch(() => []),
      listDocuments<IndustryMasterEntry>('industry_master').catch(() => []),
    ]);

    const registry = new Map<string, ProductionRegistryEntry>();
    for (const entry of registryDocs) {
      registry.set(normalizeName(entry.name || ''), entry);
    }

    // Build masterMap keyed by all known names: masterName, showName (suffix-stripped),
    // and every stored variation. This lets raw titles like "ארץ נהדרת - טסטים" resolve
    // directly via their variation key without relying solely on suffix stripping.
    const masterMap = new Map<string, IndustryMasterEntry>();
    for (const entry of masterDocs) {
      const displayName = entry.masterName ?? entry.showName ?? '';
      const canonical = stripProductionSuffixes(displayName);
      masterMap.set(normalizeName(canonical), entry);
      if (canonical !== displayName) {
        masterMap.set(normalizeName(displayName), entry);
      }
      for (const v of (entry.variations ?? [])) {
        if (v) masterMap.set(normalizeName(v), entry);
      }
    }

    const isDebug = request.nextUrl.searchParams.get('debug') === '1';
    const nearMisses: NearMiss[] = [];

    const rawCredits: ProCardProductionCredit[] = [
      ...globalProductions.flatMap((production): ProCardProductionCredit[] => {
        const crewEntry = matchingCrewEntry(production.crew_list || [], contactPhone, displayNames);
        if (!crewEntry) {
          if (isDebug) {
            const crewNames = (production.crew_list || []).map((e) => e.name).filter(Boolean);
            if (crewNames.some((n) => nameIsNearMiss(n, displayNames))) {
              nearMisses.push({ productionName: production.name || '', date: asDateValue(production.date), crewSample: crewNames.slice(0, 6) });
            }
          }
          return [];
        }

        const date = asDateValue(production.date);
        const year = date.slice(0, 4);
        const channelId = inferChannelIdFromTitle(production.name || '', production.studio || '');
        const role = cleanString(crewEntry.profession) || 'קרדיט';
        const isMajor = Boolean((production as unknown as { isMajor?: boolean; majorProduction?: boolean }).isMajor)
          || Boolean((production as unknown as { isMajor?: boolean; majorProduction?: boolean }).majorProduction)
          || isMajorProductionTitle(production.name || '');

        return [{
          id: production.id || `${production.name}-${date}-${role}`,
          productionName: production.name || 'הפקה',
          date,
          dateFrom: date,
          dateTo: date,
          year,
          studio: production.studio || '',
          role,
          channelId,
          channelName: getChannelName(channelId),
          isMajor,
          media: resolveProCardMedia(production.name || '', channelId),
          shiftCount: 1,
        }];
      }),
      ...calendarDocs
        .filter((doc) => docMatchesUser(doc, linkedUserIds, userEmails, displayNames, userPhones))
        .map((doc) => creditFromFlexibleDoc(doc, 'calendar')),
      ...workBoardDocs
        .filter((doc) => docMatchesUser(doc, linkedUserIds, userEmails, displayNames, userPhones))
        .map((doc) => creditFromFlexibleDoc(doc, 'work-boards')),
    ];

    const productionCredits = applyRegistryOverrides(
      mergeAndDedupeCredits(rawCredits).sort((a, b) => b.date.localeCompare(a.date)),
      registry,
      masterMap,
    );

    console.log('[pro-card-history] found', productionCredits.length, 'production credits for', fullName);

    const posts = await listDocuments<RawPost>('posts').catch(() => []);
    const boardActivity: ProCardBoardActivity[] = posts
      .filter((post) => {
        const authorId = cleanString(post.authorId);
        const authorName = normalizeName(post.authorName || '');
        return Boolean(
          (authorId && linkedUserIds.has(authorId)) ||
          (normalizedContactName && authorName === normalizedContactName),
        );
      })
      .map((post) => {
        const date = asDateValue(post.createdAt);
        return {
          id: cleanString(post.id) || `${post.title}-${date}`,
          title: cleanString(post.title) || 'פעילות בלוח',
          type: cleanString(post.type) || 'post',
          date,
          year: date.slice(0, 4),
          category: cleanString(post.category),
        };
      })
      .sort((a, b) => b.date.localeCompare(a.date));

    const response: ProCardHistoryResponse = {
      productionCredits,
      boardActivity,
      ...(isDebug ? { nearMisses } : {}),
    };

    return NextResponse.json(response);
  } catch (error) {
    console.error('[/api/directory/pro-card-history] failed:', error);
    return NextResponse.json({ productionCredits: [], boardActivity: [] } satisfies ProCardHistoryResponse);
  }
}
