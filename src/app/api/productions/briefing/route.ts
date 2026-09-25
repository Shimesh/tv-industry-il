import { NextRequest, NextResponse } from 'next/server';
import { verifyAuthToken, unauthorizedResponse } from '@/lib/apiAuth';
import { getDocument, listDocuments, runQuery } from '@/lib/server/firestoreAdminRest';
import { getLinkedProductionIdentity } from '@/lib/server/identityLink';
import { fromGlobalProduction, type GlobalProductionDoc } from '@/lib/globalProductions';
import { normalizePhone } from '@/lib/crewNormalization';
import { canonicalProductionName, getWeekIdsInRange, type Production } from '@/lib/productionDiff';
import { briefingRange, toBriefingShift, type CalendarBriefingData } from '@/lib/calendarBriefing';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;
const headers = { 'Cache-Control': 'private, no-store, max-age=0' };
type SyncRecord = { lastSyncAt?: number; lastSyncStatus?: string; weekStart?: string };
type BridgeSyncRecord = {
  targetUid?: string;
  status?: string;
  bridgePhase?: string;
  createdAt?: number;
  usedAt?: number | null;
  lastStatusAt?: number;
  productionCount?: number;
  personalCount?: number;
  error?: string | null;
};

function syncTime(sync: SyncRecord | null | undefined): number {
  return typeof sync?.lastSyncAt === 'number' && sync.lastSyncAt > 0 ? sync.lastSyncAt : 0;
}

function bridgeTime(sync: BridgeSyncRecord | null | undefined): number {
  return Math.max(
    typeof sync?.usedAt === 'number' ? sync.usedAt : 0,
    typeof sync?.lastStatusAt === 'number' ? sync.lastStatusAt : 0,
    typeof sync?.createdAt === 'number' ? sync.createdAt : 0,
  );
}

function bridgeStatus(sync: BridgeSyncRecord | null | undefined): string | null {
  if (!sync) return null;
  if (sync.status === 'used' || sync.bridgePhase === 'done') return 'success';
  if (sync.status === 'failed' || sync.bridgePhase === 'failed' || sync.error) return 'error';
  if (sync.bridgePhase && sync.bridgePhase !== 'created') return 'pending';
  return null;
}

export async function GET(request: NextRequest) {
  const auth = await verifyAuthToken(request);
  if (!auth) return unauthorizedResponse();
  try {
    const { start, end } = briefingRange();
    const identity = await getLinkedProductionIdentity(auth, { strict: true });
    const roots = [...new Set([auth.uid, ...identity.linkedUids, identity.profileId, identity.linkedContactId].filter((value): value is string => Boolean(value)))];
    const [personal, global, userSync, sharedSync, bridgeSyncGroups] = await Promise.all([
      Promise.all(roots.flatMap(root => getWeekIdsInRange(start, end).map(week => listDocuments<Production>(`productions/${root}/weeks/${week}/productions`)))),
      runQuery<GlobalProductionDoc>({
        from: [{ collectionId: 'global_productions' }],
        where: { compositeFilter: { op: 'AND', filters: [
          { fieldFilter: { field: { fieldPath: 'date' }, op: 'GREATER_THAN_OR_EQUAL', value: { stringValue: start } } },
          { fieldFilter: { field: { fieldPath: 'date' }, op: 'LESS_THAN_OR_EQUAL', value: { stringValue: end } } },
        ] } },
        limit: 2001,
      }),
      getDocument<SyncRecord>(`user_calendar_sync/${auth.uid}`),
      getDocument<SyncRecord>('system/calendarSync'),
      Promise.all(roots.map(root => runQuery<BridgeSyncRecord>({
        from: [{ collectionId: 'calendar_phone_bridge_tokens' }],
        where: { fieldFilter: { field: { fieldPath: 'targetUid' }, op: 'EQUAL', value: { stringValue: root } } },
        limit: 50,
      }).catch(() => []))),
    ]);
    // A truncated or failed read must not masquerade as a deleted assignment.
    if (global.length >= 2001) throw new Error('Briefing range exceeds safe read limit');
    const phones = new Set(identity.phones.map(normalizePhone).filter(Boolean));
    const mine = global.filter(production => (production.crew_list || []).some(member => {
      const phone = normalizePhone(member.normalizedPhone || member.phone_number || member.phone || '');
      return Boolean(phone && phones.has(phone));
    })).map(fromGlobalProduction);
    const personalMine = personal.flat().filter(production => production.isCurrentUserShift === true && !(production as Production & { missingCandidate?: boolean }).missingCandidate);
    const byKey = new Map<string, Production>();
    for (const production of [...personalMine, ...mine]) {
      if (!production.id || !production.date || production.date < start || production.date > end) continue;
      const key = production.herzliyaId ? `${production.herzliyaId}:${production.date}` : `${production.date}:${canonicalProductionName(production.name)}:${production.studio}:${production.startTime}`;
      const existing = byKey.get(key);
      if (!existing || (production.lastUpdatedAt || '') >= (existing.lastUpdatedAt || '')) byKey.set(key, production);
    }
    const bridgeSync = bridgeSyncGroups.flat().sort((a, b) => bridgeTime(b) - bridgeTime(a))[0] || null;
    const bridgeSyncAt = bridgeTime(bridgeSync);
    const directSyncAt = syncTime(userSync);
    const sharedSyncAt = syncTime(sharedSync);
    const syncSource: CalendarBriefingData['sync']['source'] =
      bridgeSyncAt > 0 && bridgeSyncAt >= directSyncAt ? 'phone' :
        directSyncAt > 0 || userSync?.lastSyncStatus ? 'personal' :
          sharedSyncAt > 0 || sharedSync?.lastSyncStatus ? 'shared' :
            'unknown';
    const data: CalendarBriefingData = {
      start, end, checkedAt: Date.now(),
      shifts: [...byKey.values()].map(production => toBriefingShift(production, identity.names, identity.phones)),
      sync: {
        source: syncSource,
        at: syncSource === 'phone' ? bridgeSyncAt : syncSource === 'personal' ? directSyncAt || null : syncSource === 'shared' ? sharedSyncAt || null : null,
        status: syncSource === 'phone' ? bridgeStatus(bridgeSync) : syncSource === 'personal' ? userSync?.lastSyncStatus || null : syncSource === 'shared' ? sharedSync?.lastSyncStatus || null : null,
        weekStart: syncSource === 'personal' && userSync?.weekStart && /^\d{4}-\d{2}-\d{2}$/.test(userSync.weekStart)
          ? userSync.weekStart
          : syncSource === 'shared' && sharedSync?.weekStart && /^\d{4}-\d{2}-\d{2}$/.test(sharedSync.weekStart)
            ? sharedSync.weekStart
            : null,
      },
    };
    return NextResponse.json(data, { headers });
  } catch (error) {
    console.error('[calendar-briefing]', error instanceof Error ? error.message : 'Read failed');
    return NextResponse.json({ error: 'לא ניתן לבדוק את היומן כרגע. המידע הקודם לא הוחלף.' }, { status: 503, headers });
  }
}
