import {
  collection,
  getDocsFromServer,
  enableNetwork,
  doc,
  writeBatch,
  serverTimestamp,
  type Firestore,
  type QuerySnapshot,
  type DocumentData,
} from 'firebase/firestore';
import { inferDepartment } from '@/lib/contactsUtils';
import { normalizeName, normalizePhone } from '@/lib/crewNormalization';

export interface PdfMigrationResult {
  added: number;
  skipped: number;
  total: number;
}

// All 187 contacts extracted from the professional TV industry directory PDF.
// Format: [fullName, role, phone | null]
// Roles are the raw role text from the PDF (before the | separator).
// inferDepartment() maps them to the correct app category.
const PDF_CONTACTS: [string, string, string | null][] = [
  // Page 1
  ['ירון אורבך', 'צלם', '0547603436'],
  ['איציק חנית', 'רחף', '0505762646'],
  ['עמית בן עזרא', 'CCU', '0505812004'],
  ['בני בן דוד', 'צלם', '0507949317'],
  ['ניב סגל', 'ע. צלם', '0508528616'],
  ['עמי גויטע', 'קול', '0528952258'],
  ['גיא און', 'טכנאי תורן', '0528573113'],
  ['תהילה גולדמן', 'מפעיל טלפרומפטר', '0528430099'],
  ['משה בנסון', 'ניהול במה', '0523641902'],
  ['עומר מליחי', 'מפעיל טלפרומפטר', '0524349050'],
  ['רמון לוסאנו', 'ניתוב', '0542002440'],
  ['מוחמד איברהים', 'ע. צלם', '0503012692'],
  // Page 2
  ['שחר סיליק', 'תאורה', '0528432231'],
  ['תומר אברהם', 'פיקוח קול', '0545692221'],
  ['יזהר טרמו', 'צלם', '0522779771'],
  ['שגיב מילר', 'הקמה', '0544431575'],
  ['יוסי כץ', 'צלם', '0522985208'],
  ['אילן בן אודיז', 'צלם', '0528949317'],
  ['אופיר פאר', 'פיקוח קול', '0584888877'],
  ['אסף אביזר', 'VTR', '0523510526'],
  ['אור קולר', 'ניתוב', '0547950073'],
  ['אבי עבו', 'CCU', '0506701977'],
  ['גילי רחום', 'VTR', '0507774207'],
  ['איתי רודן', 'צלם', '0545613009'],
  // Page 3
  ['מתן טורקיה', 'צלם', '0503342270'],
  ['אורן מרר', 'פיקוח קול', '0542141726'],
  ['מיכאל כץ', 'צלם', '0528969286'],
  ['סוריל אליהו', 'צלם', '0544735111'],
  ['אמיר זילבר', 'רחף', '0507311765'],
  ['אופיר שבתאי', 'סטדי', '0542349965'],
  ['איציק אסף', 'צלם', '0505413926'],
  ['סשה גרינבלט', 'מפעיל LSM', '0544810566'],
  ['אלון צרפתי פרנק', 'צלם', '0502237223'],
  ['איגור בזילנקו', 'צלם', '0545502751'],
  ['צביקה רוזן', 'צלם', '0547614599'],
  ['זיו לימור הבלגי', 'עיצוב תאורה', '0523388814'],
  // Page 4
  ['יואב גינדין', 'צלם', '0522396639'],
  ['ירון זילבר', 'רחף', '0508518083'],
  ['אדם גיוסי', 'ע. צלם', '0544697947'],
  ['בועז חזין', 'ניהול במה', '0546633095'],
  ['ערן דיין', 'צלם', '0502766400'],
  ['יוסי מחבובי', 'טכנאי תורן', '0523634895'],
  ['אופיר אריה', 'סטדי', '0525283470'],
  ['מוחמד שינוואי', 'צלם', '0527588906'],
  ['דודו דואק', 'ניהול במה', '0523277018'],
  ['ניסו עזרן', 'פיקוח קול', '0526070655'],
  ['שובל פיקסלר', 'פיקוח קול', '0506321800'],
  ['שלומי נמטייב', 'צלם', '0505390925'],
  // Page 5
  ['דניאל שפירא', 'ע. צלם', '0548393202'],
  ['אליעזר פלדמן', 'CCU', '0547899237'],
  ['ענר דולב', 'VTR', '0545244688'],
  ['הרצל כהן', 'צלם', '0522452925'],
  ['בר הרמן', 'צלם', '0529567588'],
  ['ירון פוגל', 'קול', '0544715360'],
  ['אורן אילוז', 'פיקוח טכני', '0545637306'],
  ['עמי ברום', 'חפיפה', '0542616656'],
  ['יונתן מרזל', 'מפעיל LSM', '0545618058'],
  ['דודו פרנקו', 'רחף', '0524494791'],
  ['מיכל לב', 'ניהול במה', '0526719711'],
  ['אלכס סברנסקי', 'רחף', '0506766899'],
  // Page 6
  ['דניאל בן עמי', 'קול', '0506919094'],
  ['יגאל וייסמן', 'CCU', '0505953152'],
  ['דניאל בוקס', 'מפעיל טלפרומפטר', '0508550453'],
  ['איתן להב', 'מפעיל LSM', '0525030771'],
  ['יוסי כהן', 'פיקוח קול', '0545877308'],
  ['חגי אמיר', 'ניתוב', '0544681623'],
  ['יובל רמרג\'קר', 'פיקוח טכני', '0506672992'],
  ['אורטל ציפאני', 'מפעיל טלפרומפטר', '0547339521'],
  ['אביב דרוקר', 'צלם', '0509306771'],
  ['יובל שפילמן', 'חפיפה', '0527467796'],
  ['יוסי מנקו', 'קול', '0546350880'],
  ['אודי לזר', 'פיקוח קול', '0508854338'],
  // Page 7
  ['עמית אלבז', 'כתוביות', '0523508868'],
  ['ירון סיטון', 'קול', '0542253224'],
  ['צחי סדרינה', 'פיקוח קול', '0544222674'],
  ['ניר טנדלר', 'VTR', '0543537242'],
  ['ירון שרון', 'צלם', null],
  ['גדעון סבן', 'צלם', '0532780220'],
  ['דרור למפל', 'קול', '0509987796'],
  ['בוריס בלנקין', 'צלם', '0543487278'],
  ['דניס פדוצ\'ב', 'רחף', '0547950425'],
  ['גל צ\'רנו', 'צלם', null],
  ['ניר עמר', 'תאורה', '0524604482'],
  ['מקס ניקולייב', 'CCU', '0542017476'],
  // Page 8
  ['להב סימן טוב', 'תפאורן', '0587609995'],
  ['שי ברזילי', 'מפעיל טלפרומפטר', '0528810044'],
  ['דורי לייטנר', 'מפעיל טלפרומפטר', '0545800389'],
  ['אסי איוס', 'צלם', '0544977223'],
  ['דור יעקובוביץ', 'פיקוח קול', '0504802885'],
  ['יוני ורזוב', 'קול', '0507125252'],
  ['צפריר שוראקי', 'ניתוב', '0547805152'],
  ['חוסאם אלסוס', 'ע. צלם', '0547907102'],
  ['מיכאל שלם', 'רחף', '0543205969'],
  ['עודד אברהמי', 'ניהול במה', '0526240442'],
  ['מוניר אברהים', 'ע. צלם', '0506595609'],
  ['אסי לוי', 'צלם', null],
  // Page 9
  ['עדי הופמן', 'כתוביות', '0525564313'],
  ['סתו עשת', 'פיקוח קול', '0544554797'],
  ['תומר יהודה צפריר', 'סוכן תרבות', '0549399090'],
  ['אבירן יפת', 'רחף', '0545654413'],
  ['אייל וענונו', 'דולי', '0545719991'],
  ['שרון בראון', 'כתוביות', '0522931585'],
  ['איהב חוסרי', 'צלם', null],
  ['רז כהן', 'קול', '0545640211'],
  ['יואב בנץ', 'צלם', '0546949311'],
  ['מיכאל צייטלין', 'צלם', '0544838173'],
  ['צביקה ברקוביץ\'', 'פיקוח קול', '0522536130'],
  ['עודד כרמלי', 'צלם', '0545829355'],
  // Page 10
  ['איתן טל', 'צלם', '0547976609'],
  ['מרט פלדמן', 'תאורה', '0523530315'],
  ['חסן עליאן', 'ע. צלם', '0527819181'],
  ['נועה וינר', 'ע. צלם', '0509570177'],
  ['שי רטוביץ\'', 'טכנאי תורן', '0505506661'],
  ['ודים וינוגרדוב', 'צלם', '0547954020'],
  ['ליאור נוימרק', 'VTR', '0547111130'],
  ['יוסי פוטוצקי', 'תאורה', '0522545642'],
  ['רונן וינטרגרין', 'פיקוח טכני', '0507802780'],
  ['שמי עמוס', 'צלם', '0525821100'],
  ['דפנה ליבשטיין', 'ניהול במה', '0508541401'],
  ['בני ונטורה', 'צלם', '0522741300'],
  // Page 11
  ['סמיון קציב', 'צלם', '0547737401'],
  ['אלכס לבנדובסקי', 'ניהול במה', '0522921536'],
  ['רזבן טומסקו', 'צלם', '0547409930'],
  ['איריס בכר', 'ניתוב', '0523310001'],
  ['תומר בירן', 'חפיפה', '0502250340'],
  ['יותם שפי', 'ניהול במה', '0547767114'],
  ['עומר וייס', 'קול', '0505665832'],
  ['אברהם עבו', 'CCU', '0526143821'],
  ['עדי עמרן', 'צלם', '0546921718'],
  ['יובל דקל', 'צלם', '0522715272'],
  ['דוד צולפאייב', 'שידור', '0545844178'],
  ['שי בכר', 'נתב במאי', '0523337257'],
  // Page 12
  ['בן פורמן', 'ניתוב', '0525715880'],
  ['אלון ליטבק', 'ניתוב', '0544889888'],
  ['דור נהיר', 'CCU', '0585400400'],
  ['שחר בלומנפלד', 'צלם', '0545717245'],
  ['ירון בניסטי', 'צלם', '0522915575'],
  ['רונן בן הרוש', 'תאורה', '0522317440'],
  ['אבי אורן', 'צלם', '0528600417'],
  ['הילאי דרי', 'קול', '0546891099'],
  ['ענת דולב', 'כתוביות', '0524698833'],
  ['גיא כץ', 'פיקוח טכני', '0544833366'],
  ['נריה פרנק', 'VTR', '0509662565'],
  ['דורין סיביליה', 'מפעיל טלפרומפטר', '0523725106'],
  // Page 13
  ['טל אזולאי', 'צלם', '0543154334'],
  ['אלכס עמנואל', 'תפאורן', '0529531212'],
  ['איאד עותמן', 'רחף', '0545604087'],
  ['לירון אייזנברג', 'מפעיל טלפרומפטר', '0542321982'],
  ['הרצל פור', 'צלם', '0528848365'],
  ['אורלי ברק', 'ניהול במה', '0525554702'],
  ['אייל קליין', 'רחף', '0526803029'],
  ['נועה הדס', 'כתוביות', '0526582777'],
  ['יואל מלכה', 'צלם', '0544703820'],
  ['בוריס קנדיבה', 'CCU', '0523634896'],
  ['שי שביט', 'צלם', '0527568889'],
  ['יוסי הרוש', 'צלם', '0549989550'],
  // Page 14
  ['נאור ברנס', 'תפאורן', '0522403984'],
  ['חוליו קורן', 'צלם', '0546676381'],
  ['עופר יעקובי', 'עיצוב תאורה', '0544211296'],
  ['אילן ברדה', 'צלם', '0544651767'],
  ['דאוד סלאיה', 'ע. צלם', '0527833310'],
  ['אייל גרוספלד', 'פיקוח קול', '0522201637'],
  ['צורי מימון', 'טכנאי תורן', '0523634897'],
  ['עידן ברכה', 'צלם', '0523623224'],
  ['אבינועם לוי', 'טכנאי תורן', '0523683337'],
  ['עידן שוקרון', 'צלם', '0542278678'],
  ['גיא שרון', 'ניתוב', '0526899791'],
  ['מיכאל ויינטרוב', 'CCU', '0544757126'],
  // Page 15
  ['גולה אבידור', 'פיקוח טכני', '0544222069'],
  ['סתיו חן', 'מפעיל LSM', '0507329903'],
  ['גבי מואטי', 'צלם', '0523631770'],
  ['חיים סיביליה', 'טכנאי תורן', '0522536128'],
  ['אלמוג כספי', 'מפעיל LSM', '0526866832'],
  ['קיריל ווזנסנסקי', 'כתוביות', '0545229462'],
  ['אור אורן', 'רחף', '0507520099'],
  ['יהודה גולן', 'ניהול במה', '0505284747'],
  ['אופיר כהן', 'VTR', '0547428535'],
  ['יוחאי אריה', 'עיצוב תאורה', '0505756219'],
  ['עמית להב', 'מפעיל טלפרומפטר', '0507010423'],
  ['גל כרובי', 'ניהול במה', '0528520435'],
  // Page 16
  ['דניאל רוטנברג', 'מפעיל טלפרומפטר', '0523966543'],
  ['איציק בן סניור', 'צלם', '0544710498'],
  ['שלומי בן הרוש', 'ע. צלם', '0533207516'],
  ['יוסי ברטוב', 'קול', '0547663610'],
  ['אמיר סגל', 'ניהול במה', '0542544005'],
  ['יואל רפפורט', 'ניתוב', '0546967996'],
  ['נוויל האריס', 'צלם', '0546510051'],
];

function splitName(fullName: string): { firstName: string; lastName: string } {
  const parts = fullName.trim().split(/\s+/);
  if (parts.length === 1) return { firstName: parts[0], lastName: '' };
  // Special case: known double first names
  if (parts.length === 3 && fullName === 'תומר יהודה צפריר') {
    return { firstName: 'תומר יהודה', lastName: 'צפריר' };
  }
  return { firstName: parts[0], lastName: parts.slice(1).join(' ') };
}

/**
 * Upserts all 187 PDF contacts into Firestore using deterministic doc IDs.
 * Dedup strategy:
 *   1. Exact raw-phone match against stored Firestore phone strings (no normalization —
 *      avoids format-mismatch false-positives that caused all 187 to be skipped).
 *   2. Lowercase full-name match as fallback (catches same person with different phone
 *      recorded in the original static migration).
 * Uses pdf-{phone} or pdf-{name-slug} as doc ID → fully idempotent on re-runs.
 */
/** Force a server read, retrying up to 3 times.
 *  The Firestore client may be in exponential-backoff mode after previous
 *  silent write failures — a short delay lets the WebSocket reconnect. */
async function readContactsFromServer(db: Firestore): Promise<QuerySnapshot<DocumentData>> {
  // Re-enable network in case the SDK went offline (e.g. after repeated errors)
  try { await enableNetwork(db); } catch { /* no-op if already enabled */ }

  let lastErr: unknown;
  for (let attempt = 0; attempt < 3; attempt++) {
    if (attempt > 0) {
      await new Promise(r => setTimeout(r, 1500 * attempt)); // 1.5s, 3s
    }
    try {
      return await getDocsFromServer(collection(db, 'contacts'));
    } catch (err) {
      lastErr = err;
    }
  }
  throw new Error(
    'לא ניתן להתחבר לשרת Firestore לאחר 3 ניסיונות. ' +
    'בדוק שיש חיבור לאינטרנט ונסה שוב. ' +
    `(${lastErr instanceof Error ? lastErr.message : String(lastErr)})`
  );
}

export async function migratePdfContacts(db: Firestore): Promise<PdfMigrationResult> {
  // Force server read — bypasses IndexedDB offline cache.
  // The cache may contain stale locally-committed docs from a previous run that
  // were never synced to the server; if we used getDocs() we'd see 187 "existing"
  // contacts and skip everything.  getDocsFromServer gives the true 90 we have.
  const snapshot = await readContactsFromServer(db);

  // Use RAW stored values — no normalization — to avoid format-mismatch bugs
  const existingPhones = new Set<string>();
  const existingNameKeys = new Set<string>();

  for (const d of snapshot.docs) {
    const data = d.data();
    const rawPhone = data.phone as string | null;
    if (rawPhone) existingPhones.add(rawPhone);

    const nameKey = `${data.firstName || ''} ${data.lastName || ''}`.trim().toLowerCase();
    if (nameKey) existingNameKeys.add(nameKey);
  }

  const BATCH_SIZE = 499;
  let batch = writeBatch(db);
  let batchCount = 0;
  let added = 0;
  let skipped = 0;

  for (const [fullName, role, rawPhone] of PDF_CONTACTS) {
    // 1. Skip if exact phone already in Firestore
    if (rawPhone && existingPhones.has(rawPhone)) { skipped++; continue; }

    // 2. Skip if exact (case-insensitive) name already in Firestore
    const nameKey = fullName.toLowerCase();
    if (existingNameKeys.has(nameKey)) { skipped++; continue; }

    const { firstName, lastName } = splitName(fullName);
    const nPhone = rawPhone ? normalizePhone(rawPhone) : null;
    const department = inferDepartment(role);

    // Deterministic doc ID so re-running is always safe
    const docId = rawPhone
      ? `pdf-${rawPhone}`
      : `pdf-${fullName.replace(/[\s'"\\]/g, '-')}`;
    const ref = doc(db, 'contacts', docId);

    batch.set(ref, {
      firstName,
      lastName,
      role,
      department,
      phone: nPhone ?? rawPhone ?? null,
      availability: 'available',
      openToWork: null,
      city: null,
      yearsOfExperience: null,
      credits: null,
      gear: null,
      skills: null,
      source: 'pdf-migration-2024',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });

    // Track in-session dedup
    if (rawPhone) existingPhones.add(rawPhone);
    existingNameKeys.add(nameKey);
    added++;
    batchCount++;

    if (batchCount >= BATCH_SIZE) {
      await batch.commit();
      batch = writeBatch(db);
      batchCount = 0;
    }
  }

  if (batchCount > 0) await batch.commit();

  return { added, skipped, total: PDF_CONTACTS.length };
}
