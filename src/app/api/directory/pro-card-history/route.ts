import { NextRequest, NextResponse } from 'next/server';
import { verifyAuthToken, unauthorizedResponse } from '@/lib/apiAuth';
import { normalizeName, normalizePhone } from '@/lib/crewNormalization';
import { getChannelName, inferChannelIdFromTitle, isMajorProductionTitle, resolveProCardMedia } from '@/lib/proCardMedia';
import type { ProCardBoardActivity, ProCardHistoryResponse, ProCardProductionCredit } from '@/lib/proCardTypes';
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

function docMatchesUser(doc: FlexibleHistoryDoc, userIds: Set<string>, emails: Set<string>): boolean {
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

  if (uidCandidates.some((uid) => userIds.has(uid))) return true;

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

  if (emailCandidates.some((email) => emails.has(email))) return true;

  const crew = Array.isArray(doc.crew) ? doc.crew : Array.isArray(doc.crew_list) ? doc.crew_list : [];
  return crew.some((entry) => {
    if (!entry || typeof entry !== 'object') return false;
    const record = entry as Record<string, unknown>;
    const uid = cleanString(record.uid || record.userId || record.profileUid);
    const email = cleanString(record.email || record.userEmail).toLocaleLowerCase();
    return Boolean((uid && userIds.has(uid)) || (email && emails.has(email)));
  });
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
    year: date.slice(0, 4),
    studio: cleanString(doc.studio || doc.location || doc.channel || doc.network),
    role: roleFromFlexibleDoc(doc),
    channelId: channelId || null,
    channelName: cleanString(doc.channelName || doc.channel || doc.network) || getChannelName(channelId || null),
    isMajor,
    media: resolveProCardMedia(productionName, channelId || null),
  };
}

function matchingCrewEntry(
  crew: GlobalProductionCrewEntry[],
  contactPhone: string | null,
  normalizedContactName: string,
): GlobalProductionCrewEntry | null {
  return crew.find((entry) => {
    const entryPhone = normalizePhone(entry.normalizedPhone || entry.phone_number || '');
    if (contactPhone && entryPhone && entryPhone === contactPhone) return true;
    return Boolean(normalizedContactName && normalizeName(entry.name || '') === normalizedContactName);
  }) || null;
}

function dedupeCredits(credits: ProCardProductionCredit[]): ProCardProductionCredit[] {
  const seen = new Set<string>();
  const result: ProCardProductionCredit[] = [];
  for (const credit of credits) {
    const key = `${credit.productionName}:${credit.date}:${credit.role}:${credit.channelName}`;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(credit);
  }
  return result;
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

    const [globalProductions, calendarDocs, workBoardDocs] = await Promise.all([
      listDocuments<GlobalProductionDoc>('global_productions').catch(() => []),
      listDocuments<FlexibleHistoryDoc>('calendar').catch(() => []),
      listDocuments<FlexibleHistoryDoc>('work-boards').catch(() => []),
    ]);
    const productionCredits = dedupeCredits(
      [
        ...globalProductions.flatMap((production): ProCardProductionCredit[] => {
        const crewEntry = matchingCrewEntry(production.crew_list || [], contactPhone, normalizedContactName);
        if (!crewEntry) return [];

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
          year,
          studio: production.studio || '',
          role,
          channelId,
          channelName: getChannelName(channelId),
          isMajor,
          media: resolveProCardMedia(production.name || '', channelId),
        }];
        }),
        ...calendarDocs
          .filter((doc) => docMatchesUser(doc, linkedUserIds, userEmails))
          .map((doc) => creditFromFlexibleDoc(doc, 'calendar')),
        ...workBoardDocs
          .filter((doc) => docMatchesUser(doc, linkedUserIds, userEmails))
          .map((doc) => creditFromFlexibleDoc(doc, 'work-boards')),
      ],
    ).sort((a, b) => b.date.localeCompare(a.date));

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
    };

    return NextResponse.json(response);
  } catch (error) {
    console.error('[/api/directory/pro-card-history] failed:', error);
    return NextResponse.json({ productionCredits: [], boardActivity: [] } satisfies ProCardHistoryResponse);
  }
}
