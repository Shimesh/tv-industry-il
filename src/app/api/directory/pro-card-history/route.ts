import { NextRequest, NextResponse } from 'next/server';
import { verifyAuthToken, unauthorizedResponse } from '@/lib/apiAuth';
import { normalizeName, normalizePhone } from '@/lib/crewNormalization';
import { getChannelName, inferChannelIdFromTitle, isMajorProductionTitle, resolveProCardMedia } from '@/lib/proCardMedia';
import type { ProCardBoardActivity, ProCardHistoryResponse, ProCardProductionCredit } from '@/lib/proCardTypes';
import { listDocuments } from '@/lib/server/firestoreAdminRest';
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
    const key = `${credit.id}:${credit.role}`;
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
    const contact = snapshot.contacts.find((entry) => String(entry.id || '') === contactId);
    if (!contact || contact.hiddenFromDirectory === true) {
      return NextResponse.json({ error: 'Contact not found' }, { status: 404 });
    }

    const fullName = contactName(contact);
    const normalizedContactName = normalizeName(fullName);
    const contactPhone = normalizePhone(cleanString(contact.normalizedPhone) || cleanString(contact.phone));
    const linkedUserIds = await loadLinkedUserIds(contact, normalizedContactName);

    const globalProductions = await listDocuments<GlobalProductionDoc>('global_productions').catch(() => []);
    const productionCredits = dedupeCredits(
      globalProductions.flatMap((production): ProCardProductionCredit[] => {
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
