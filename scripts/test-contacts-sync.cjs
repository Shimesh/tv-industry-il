require('./register-project-ts.cjs');
const assert = require('node:assert/strict');
const rest = require('../src/lib/server/firestoreAdminRest.ts');
const admin = require('../src/lib/server/firebaseAdmin.ts');
let records = new Map();
let failGlobalRead = false;
rest.listDocuments = async collection => [...records].filter(([key]) => key.startsWith(`${collection}/`)).map(([key, value]) => ({ ...value, id: key.split('/').pop() }));
rest.createDocument = async () => ({});
rest.runQuery = async query => {
  if (failGlobalRead && query.from[0].collectionId === 'global_productions') throw new Error('global unavailable');
  return [];
};
admin.getFirebaseAdminFirestore = () => ({
  doc: path => path,
  batch: () => {
    const writes = [];
    return {
      set: (path, value) => writes.push([path, value]),
      update: (path, value) => { assert(records.has(path) || writes.some(([key]) => key === path)); writes.push([path, value]); },
      delete: () => { throw new Error('Discovery must not delete contacts'); },
      commit: async () => { for (const [path, value] of writes) records.set(path, { ...records.get(path), ...value }); },
    };
  },
});
const { syncContactsFromProductions: sync, syncContactsFromSavedProductions } = require('../src/lib/server/contactsSync.ts');
const { normalizeRoleToCanonical } = require('../src/constants/departments.ts');
async function main() {
  assert.equal(normalizeRoleToCanonical('מפעיל טלפרומפטר').canonicalRole, 'טלפרומפטר');
  const productions = [{ crew: [
    { name: 'בדיקת פרומפטר', role: 'מפעיל טלפרומפטר' },
    { name: 'בדיקת תפקידחדש', role: 'מפעיל מערכת חדשה' },
    { name: 'בדיקת ריבוי', role: 'צלם' },
    { name: 'בדיקת ריבוי', role: 'טלפרומפטר' },
    { name: 'בדיקת ריבוי', role: 'צלם' },
    { name: 'בדיקת ללאתפקיד', role: '' },
    { name: 'רצועת ערב', role: 'חדשות הוולנס+ גיא פינס צילום' },
  ] }];
  const preview = await sync(productions, false);
  assert.equal(preview.created, 4);
  assert.equal(records.size, 0, 'preview is read-only');
  await sync(productions, true);
  assert.equal(records.size, 4);
  const multi = [...records.values()].find(c => c.firstName === 'בדיקת' && c.lastName === 'ריבוי');
  assert.deepEqual(multi.roles, ['צלם/ת', 'טלפרומפטר']);
  assert([...records.values()].some(c => c.role === 'מפעיל מערכת חדשה'));
  let repeat = await sync(productions, true);
  assert.equal(repeat.created, 0);
  assert.equal(repeat.updated, 0);

  const firstId = [...records.keys()].find(id => records.get(id).lastName === 'פרומפטר');
  await sync([{ crew: [{ name: 'בדיקת פרומפטר', role: 'טלפרומפטר', phone: '0500000001' }] }], true);
  assert.equal(records.size, 4, 'later phone enriches the existing partial card');
  assert.equal(records.get(firstId).phone, '0500000001');

  records.get(firstId).hiddenFromDirectory = true;
  records.get(firstId).phone = null;
  records.get(firstId).normalizedPhone = null;
  await sync([{ crew: [{ name: 'בדיקת פרומפטר', role: 'טלפרומפטר', phone: '0500000001' }] }], true);
  assert.equal(records.get(firstId).hiddenFromDirectory, true);
  assert.equal(records.get(firstId).phone, null, 'removed contact stays hidden and phone is not republished');

  records = new Map();
  await sync([{ crew: [
    { name: 'בדיקת משולב', role: 'צלם' },
    { name: 'בדיקת משולב', role: 'טלפרומפטר', phone: '0500000002' },
  ] }], true);
  assert.equal(records.size, 1, 'mixed phone and no-phone evidence creates one card');
  assert.deepEqual(new Set([...records.values()][0].roles), new Set(['צלם/ת', 'טלפרומפטר']));

  records = new Map();
  await sync([], true, [{ crew_list: [{ name: 'בדיקת גלובלי', profession: 'מפעיל טלפרומפטר' }] }]);
  assert.equal(records.size, 1, 'global-only crews are included');
  records = new Map([['contacts/existing', {
    firstName: 'בדיקת', lastName: 'קיים', phone: '0500000003',
    role: 'צלם/ת', roles: ['צלם/ת'], department: 'צילום', departments: ['צילום'],
    source: 'static-migration', specialty: 'מפעיל טלפרומפטר',
  }]]);
  const legacy = [{ crew: [
    { name: 'בדיקת שםישן', phone: '0500000003', role: 'טלפרומפטר', roleDetail: 'עם צביקה' },
    { name: 'בדיקת שםישן', role: 'צלם' },
  ] }];
  await sync(legacy, true);
  assert.deepEqual(records.get('contacts/existing').roles, ['צלם/ת', 'טלפרומפטר']);
  assert.equal(records.get('contacts/existing').normalizedName, 'בדיקת קיים');
  assert.equal(records.size, 1, 'phone-backed spelling variants also resolve phone-less historical rows');
  repeat = await sync(legacy, true);
  assert.equal(repeat.updated + repeat.recategorized + repeat.created, 0, 'legacy aliases and annotations converge');
  failGlobalRead = true;
  await assert.rejects(syncContactsFromSavedProductions(false), /global unavailable/);

  const telemetry = require('../src/lib/server/adminTelemetry.ts');
  telemetry.recordJobMetric = async () => {};
  const service = require('../src/lib/server/contactsSync.ts');
  let complete;
  service.syncContactsFromProductions = () => new Promise(resolve => { complete = resolve; });
  const { syncSavedCrew } = require('../src/lib/server/syncSavedCrew.ts');
  let finished = false;
  const pending = syncSavedCrew([]).then(() => { finished = true; });
  await Promise.resolve();
  assert.equal(finished, false, 'calendar must await contact writes');
  complete({ created: 1, updated: 0 });
  await pending;
  assert.equal(finished, true);
  console.log('PASS: role variants, custom/missing roles, multiple roles, heading filtering, dry-run, idempotency, phone enrichment, hidden contacts, global-only discovery, read failures, awaited import.');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
