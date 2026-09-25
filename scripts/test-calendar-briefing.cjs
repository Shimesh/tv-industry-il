require('./register-project-ts.cjs');
const assert = require('node:assert/strict');
const { briefingRange, israelToday, compareBriefing, nextBriefingShift, toBriefingShift } = require('../src/lib/calendarBriefing.ts');
const shift = { key: 'a', name: 'חדשות', date: '2026-09-24', studio: 'אולפן 2', startTime: '15:00', endTime: '19:00', role: 'צלם', status: 'scheduled' };
const snapshot = shifts => ({ start: '2026-09-20', end: '2026-10-17', checkedAt: 1, shifts });
assert.equal(israelToday(new Date('2026-09-23T22:30:00Z')), '2026-09-24');
assert.deepEqual(briefingRange(new Date('2026-09-24T10:00:00Z')), { start: '2026-09-20', end: '2026-10-17' });
assert.deepEqual(compareBriefing(snapshot([shift]), snapshot([shift]), '2026-09-24'), []);
const updated = { ...shift, key: 'new-hash', startTime: '16:00', studio: 'אולפן 3', role: 'צלם סטדי' };
const changes = compareBriefing(snapshot([shift]), snapshot([updated]), '2026-09-24');
assert.equal(changes.length, 1);
assert.equal(changes[0].kind, 'changed');
assert.equal(changes[0].details.length, 3);
assert.equal(compareBriefing(snapshot([]), snapshot([shift]), '2026-09-24')[0].kind, 'added');
assert.equal(compareBriefing(snapshot([shift]), snapshot([]), '2026-09-24')[0].kind, 'removed');
assert.equal(compareBriefing(snapshot([shift]), snapshot([{ ...shift, status: 'cancelled' }]), '2026-09-24')[0].details[0], 'ההפקה סומנה כמבוטלת');
assert.deepEqual(compareBriefing(snapshot([shift]), { ...snapshot([]), start: '2026-09-27', end: '2026-10-24' }, '2026-09-27'), []);
assert.deepEqual(compareBriefing(snapshot([]), { ...snapshot([{ ...shift, date: '2026-10-20' }]), end: '2026-10-24' }, '2026-09-24'), []);
assert.deepEqual(compareBriefing(snapshot([shift]), snapshot([]), '2026-09-25'), []);
assert.equal(nextBriefingShift([shift], new Date('2026-09-24T10:00:00Z')).key, 'a');
assert.equal(nextBriefingShift([shift], new Date('2026-09-24T14:00:00Z')), undefined);
assert.equal(nextBriefingShift([{ ...shift, status: 'cancelled' }], new Date('2026-09-24T10:00:00Z')), undefined);
assert.equal(nextBriefingShift([{ ...shift, status: 'completed' }], new Date('2026-09-24T10:00:00Z')), undefined);
const production = { id: 'a', ...shift, crew: [
  { name: 'ירון', phone: '0501234567', startTime: '16:00', endTime: '18:00', role: 'צלם' },
  { name: 'ירון', phone: '0507654321', startTime: '05:00', endTime: '23:00', role: 'במאי' },
] };
const own = toBriefingShift(production, ['ירון'], ['0501234567']);
assert.equal(own.role, 'צלם');
assert.equal(own.startTime, '16:00');
assert.equal(own.endTime, '18:00');
console.log('Calendar briefing: 19 date, identity, diff and next-shift assertions passed');

// Endpoint tests use only fixture data. Failures must be explicit, never empty success.
const auth = require('../src/lib/apiAuth.ts');
const rest = require('../src/lib/server/firestoreAdminRest.ts');
const identity = require('../src/lib/server/identityLink.ts');
auth.verifyAuthToken = async () => ({ uid: 'owner' });
identity.getLinkedProductionIdentity = async () => ({ phones: ['0501234567'], names: ['ירון'], linkedUids: ['owner'], profileId: null, linkedContactId: null });
const range = briefingRange();
rest.listDocuments = async () => [];
rest.getDocument = async path => path.startsWith('user_calendar_sync/') ? { lastSyncStatus: 'error', lastSyncAt: 123, weekStart: range.start } : { lastSyncStatus: 'success', lastSyncAt: 456 };
rest.runQuery = async query => {
  const collectionId = query.from?.[0]?.collectionId;
  if (collectionId === 'calendar_phone_bridge_tokens') return [];
  return [
    { id: 'mine', name: 'שלי', date: range.start, crew_list: [{ name: 'ירון', profession: 'צלם', phone_number: '0501234567' }], status: 'scheduled' },
    { id: 'other', name: 'לא שלי', date: range.start, crew_list: [{ name: 'ירון', profession: 'במאי', phone_number: '0507654321' }], status: 'scheduled' },
  ];
};
const { GET } = require('../src/app/api/productions/briefing/route.ts');
(async () => {
  const response = await GET({});
  assert.equal(response.status, 200);
  const data = await response.json();
  assert.equal(data.shifts.length, 1);
  assert.equal(data.shifts[0].name, 'שלי');
  assert.equal(data.sync.status, 'error');
  assert.equal(data.sync.source, 'personal');
  assert.ok(!JSON.stringify(data).includes('0501234567'));
  rest.runQuery = async query => query.from?.[0]?.collectionId === 'calendar_phone_bridge_tokens'
    ? [{ targetUid: 'owner', status: 'used', bridgePhase: 'done', usedAt: 789, productionCount: 4, personalCount: 1 }]
    : [
      { id: 'mine', name: 'שלי', date: range.start, crew_list: [{ name: 'ירון', profession: 'צלם', phone_number: '0501234567' }], status: 'scheduled' },
    ];
  const phoneData = await (await GET({})).json();
  assert.equal(phoneData.sync.source, 'phone');
  assert.equal(phoneData.sync.status, 'success');
  assert.equal(phoneData.sync.at, 789);
  rest.listDocuments = async () => { throw new Error('fixture read failed'); };
  assert.equal((await GET({})).status, 503);
  auth.verifyAuthToken = async () => null;
  assert.equal((await GET({})).status, 401);
  console.log('Calendar briefing endpoint: authorization, privacy, source status and failure checks passed');
})().catch(error => { console.error(error); process.exitCode = 1; });
