export type StudioRecord = {
  id: string;
  name: string;
  nameEn?: string;
  location: string;
  description: string;
  history: string;
  facilities: string[];
  phone?: string;
  email?: string;
  website?: string;
  address: string;
  yearFounded?: number;
  studioCount?: number;
  totalArea?: string;
  productions?: string[];
  youtubeVideoId?: string;
  youtubeChannelUrl?: string;
  wazeLink: string;
  googleMapsLink: string;
  mapsEmbedUrl: string;
};

function buildWazeLink(address: string) {
  return `https://www.waze.com/ul?q=${encodeURIComponent(address)}&navigate=yes`;
}

function buildGoogleMapsLink(address: string) {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`;
}

function buildMapsEmbedUrl(address: string) {
  return `https://maps.google.com/maps?q=${encodeURIComponent(address)}&output=embed&hl=he&z=15`;
}

function createStudio(input: Omit<StudioRecord, 'wazeLink' | 'googleMapsLink' | 'mapsEmbedUrl'>): StudioRecord {
  return {
    ...input,
    wazeLink: buildWazeLink(input.address),
    googleMapsLink: buildGoogleMapsLink(input.address),
    mapsEmbedUrl: buildMapsEmbedUrl(input.address),
  };
}

export const studios: StudioRecord[] = [
  createStudio({
    id: 'neve-ilan',
    name: 'קריית התקשורת נווה אילן',
    nameEn: 'Neve Ilan Media City (Isras Park)',
    location: 'נווה אילן, הרי ירושלים',
    description:
      'מתחם אולפני הדגל של תעשיית הטלוויזיה הישראלית, הכולל 8 אולפני טלוויזיה וקולנוע בהרי ירושלים. בית הקבוע של קשת 12, רשת 13, ערוץ הכנסת וחברות הפקה נוספות. המתחם פרוס על שטח קרקע של 59,000 מ"ר ועל 7 מבנים בשטח כולל של כ-22,000 מ"ר.',
    history:
      'האולפנים הוקמו בשנות ה-80 של המאה ה-20 ביוזמת בני הדודים מנחם גולן ויורם גלובוס, תחת השם "ג.ג. אולפני ישראל". בשנת 2014, לאחר שנקלעה קבוצת גלובוס לקשיים כספיים, נמכר המתחם לקרן הנדל"ן ריאליטי תמורת 180 מיליון שקל. ב-2018 רכשה קבוצת ישרס את המתחם תמורת 255 מיליון שקל, ושינתה את שמו לפארק התקשורת ישרס. ב-2008 הוקם בחלק הצפוני של המתחם "בית האח הגדול" לצורך הפקת תוכנית הריאליטי הידועה.',
    facilities: [
      '8 אולפני טלוויזיה וקולנוע',
      'חדרי קונטרול ושידור',
      'תשתיות ברודקאסט מתקדמות',
      'מרכזי הפקה',
      'חלל עבודה Breex',
      'חניון',
      'שירותי אירוח',
    ],
    website: 'https://israsgroup.co.il/projects/%D7%A4%D7%90%D7%A8%D7%A7-%D7%AA%D7%A7%D7%A9%D7%95%D7%A8%D7%AA/',
    address: 'קריית התקשורת, נווה אילן',
    yearFounded: 1980,
    studioCount: 8,
    totalArea: '59,000 מ"ר (קרקע)',
    productions: ['האח הגדול (ישראל)', 'שידורי קשת 12', 'שידורי רשת 13', 'ערוץ הכנסת'],
  }),

  createStudio({
    id: 'herzliya',
    name: 'אולפני הרצליה — United Studios of Israel',
    nameEn: 'Herzliya Studios (United Studios of Israel)',
    location: 'הרצליה',
    description:
      'בית ההפקה הגדול בישראל, עם 9 אולפני טלוויזיה על שטח של כ-47 דונם. פועל מאז 1949 ומוכר גם כ-United Studios of Israel (USI). כולל "אולפן הקסם" — מרכז מבקרים חווייתי לילדים ומשפחות.',
    history:
      'האולפנים הוקמו ב-1949 ביוזמת מרגוט קלאוזנר ובעלה יהושע ברנדשטטר (חברת "אורים"), אחת מחלוצות התיאטרון והקולנוע העברי. טקס הנחת אבן הפינה נערך ב-3 ביולי 1949. החברה חכרה מגרש בגודל 72 דונם בהרצליה. בסוף שנות ה-60, תחת הנהגת איציק קול, פרחו האולפנים והפיקו קלאסיקות קולנועיות. כיום האולפנים ידועים גם כ-United Studios of Israel ומהווים את מתחם ההפקה המוביל בישראל לדרמה ותוכניות אולפן.',
    facilities: [
      '9 אולפני טלוויזיה',
      'חדרי עריכה',
      'פוסט-פרודקשן',
      'אולפן הקסם (מרכז מבקרים)',
      'גרין סקרין',
      'חדרי איפור',
      'מלתחות',
      'מחסני תפאורה',
      'חניה',
    ],
    phone: '09-9595100',
    email: 'avihays@hsil.tv',
    website: 'https://hsil.tv',
    address: 'הקסם 12, הרצליה',
    yearFounded: 1949,
    studioCount: 9,
    totalArea: 'כ-47,000 מ"ר',
    productions: [
      'ארץ נהדרת',
      'כוכב נולד',
      'מועדון לילה',
      'אורלי וגיא',
      'גב האומה',
      'השוטר אזולאי',
      'הלהקה',
      'כאן גרים בכיף',
      'ארץ נהדרת',
    ],
    youtubeVideoId: 'nA-5quBqW8k',
    youtubeChannelUrl: 'https://www.youtube.com/channel/UCDahPl1Zf3nGwA9aAB06QBw',
  }),

  createStudio({
    id: 'kan',
    name: 'אולפני כאן — תאגיד השידור הישראלי',
    nameEn: 'KAN - Israeli Public Broadcasting Corporation',
    location: 'ירושלים (ומרכז שידורים באור יהודה)',
    description:
      'אולפני תאגיד השידור הישראלי הציבורי. המשכן הראשי ממוקם בירושלים (כנפי נשרים 35) ומרכז את שידורי הטלוויזיה, הרדיו והדיגיטל. ב-2024 נפתח מרכז שידורים נוסף בפארק נעימי, אור יהודה.',
    history:
      'תאגיד השידור הישראלי "כאן" הוקם בשנת 2017 והחליף את רשות השידור הישראלית. המשכן הראשי בירושלים משמש לרוב שידורי הטלוויזיה, הרדיו והפקות המטה. ביוני 2024 נחנך מרכז שידורים חדשני בפארק נעימי, אור יהודה, הכולל דסק חדשות, חדרי עריכה, אולפני טלוויזיה ורדיו ומחלקת דיגיטל.',
    facilities: [
      'אולפן חדשות',
      'חדרי עריכה',
      'אולפני רדיו',
      'קונטרול',
      'מחלקת דיגיטל',
      'חדרי פרומו',
      'מחלקת אקטואליה',
    ],
    phone: '076-8098000',
    website: 'https://www.kan.org.il',
    address: 'כנפי נשרים 35, ירושלים',
    yearFounded: 2017,
    productions: ['כאן 11', 'כאן 33', 'כאן רדיו', 'כאן חינוכית', 'כאן ערבית'],
  }),

  createStudio({
    id: 'keshet12',
    name: 'אולפני קשת 12',
    nameEn: 'Keshet 12 Studios',
    location: 'נווה אילן',
    description:
      'אולפני ברודקאסט של קשת — ערוץ 12, הפועלים ממתחם קריית התקשורת נווה אילן. כולל אולפן גדול, קונטרול ותשתיות שידור חי מתקדמות.',
    history:
      'קשת שוכרת ומפעילה אולפנים בקריית התקשורת נווה אילן, ומשדרת משם חדשות, אולפן ובידור. לאחר פיצול ערוץ 2 ב-2017, קשת 12 הפכה לזכיינית עצמאית ושכללה את מתקני השידור בנווה אילן.',
    facilities: [
      'אולפן שידור גדול',
      'קונטרול',
      'עמדות גרפיקה',
      'תשתיות רב-מצלמה',
      'ניידות שידור',
    ],
    website: 'https://www.mako.co.il',
    address: 'קריית התקשורת, נווה אילן',
    productions: ['אולפן שישי', 'תשעה בלילה', 'X Factor ישראל', 'רק אחד יישאר', 'חדשות קשת'],
  }),

  createStudio({
    id: 'reshet13',
    name: 'אולפני רשת 13',
    nameEn: 'Reshet 13 Studios',
    location: 'נווה אילן',
    description:
      'אולפני השידור של רשת 13, הפועלים מקריית התקשורת נווה אילן. כולל מרכז מבקרים פתוח לציבור.',
    history:
      'רשת מפעילה אולפנים בנווה אילן לשידורים חיים, חדשות והפקות מקור. לאחר פיצול ערוץ 2 ב-2017, רשת 13 הפכה לזכיינית עצמאית. מרכז המבקרים של רשת 13 פתוח לקבוצות מאורגנות.',
    facilities: [
      'אולפן שידור',
      'קונטרול',
      'חדרי תוכן',
      'מרכז מבקרים',
      'מערך הפקה',
    ],
    website: 'https://13tv.co.il',
    address: 'קריית התקשורת, נווה אילן',
    productions: ['חדשות 13', 'פריים טיים', 'אחד עשר', 'סרטי דוקו ישראלים'],
  }),

  createStudio({
    id: 'now14',
    name: 'קריית התקשורת מודיעין — עכשיו 14',
    nameEn: 'Modiin Media City — Channel 14',
    location: 'מודיעין-מכבים-רעות',
    description:
      'מתחם אולפני ערוץ עכשיו 14, הממוקם בפארק הטכנולוגי "ליגד סנטר" במודיעין. כולל 2 אולפני טלוויזיה, חדרי עריכה ומשרדים. ערוץ 14 עבר למקום בסוף 2021.',
    history:
      'המתחם הוקם תחילה עבור תאגיד השידור הישראלי וערוץ 9. באוגוסט 2021 שכר ערוץ עכשיו 14 את המתחם, ובנובמבר 2021 העביר אליו את רוב שידוריו ועובדיו מאולפני הבירה ירושלים. ב-28 בנובמבר 2021 שינה ערוץ 20 את שמו ל"עכשיו 14" ועלה לאוויר מהמתחם.',
    facilities: [
      '2 אולפני טלוויזיה',
      'חדרי עריכה',
      'עמדות גרפיקה',
      'קונטרול',
      'משרדים',
      'חניה',
    ],
    phone: '1700502020',
    website: 'https://www.c14.co.il',
    address: 'צלע ההר 44, מודיעין-מכבים-רעות',
    yearFounded: 2021,
    studioCount: 2,
    productions: ['חדשות עכשיו 14', 'פאנל 14', 'עימותים ישירים'],
  }),

  createStudio({
    id: 'point2point',
    name: 'POINT 2 POINT — אולפני טלוויזיה',
    nameEn: 'Point2Point TV Studios',
    location: 'רמת החייל, תל אביב',
    description:
      'מתחם אולפני טלוויזיה מתקדם של 3,000 מ"ר בלב מרכז תעשיית הטלוויזיה ברמת החייל, תל אביב. כולל 4 אולפנים בגדלים שונים, ניידת שידור ושירותי הפקה מלאים. משרת את ערוצים 12, 13, כאן ועוד.',
    history:
      'פוינט 2 פוינט נוסדה ב-1989 כחברת שירותים טכניים לכנסים ואירועים. לאחר שנים של פעילות בתחום, החברה שכרה ולאחר מכן רכשה (2020) את "אולפני מימד" ברמת החייל, תמורת כ-12 מיליון שקל, והפכה לאחד ממרכזי ההפקה המובילים בישראל. לאחר שיפוץ מקיף, המתחם כולל 4 אולפנים וכל שירותי הפקה הנדרשים.',
    facilities: [
      'אולפן A — 750 מ"ר (575 מ"ר נטו)',
      'אולפן B — 250 מ"ר (130 מ"ר נטו)',
      'אולפן C — 350 מ"ר (150 מ"ר נטו)',
      'גרין סקרין',
      'ניידת שידור',
      'חדרי VIP',
      'חדרי איפור והלבשה',
      'מחסנים',
      'עשרות חניות',
    ],
    website: 'https://www.point2point.co.il',
    address: 'הברזל 3, רמת החייל, תל אביב',
    yearFounded: 1989,
    studioCount: 4,
    totalArea: '3,000 מ"ר',
    productions: ['הפקות קשת 12', 'הפקות רשת 13', 'הפקות כאן 11', 'פרסומות', 'הפקות היי-טק'],
  }),

  createStudio({
    id: 'mizmor',
    name: 'מזמור הפקות — Mizmor Productions',
    nameEn: 'Mizmor Productions',
    location: 'פתח תקווה (ומתחם נוסף בתל אביב)',
    description:
      'חברת הפקה ואולפנים עם 30+ שנות ניסיון, המפעילה אולפנים בפתח תקווה ובתל אביב. מתמחה בשידורים חיים, פרסומות, כנסים ואירועים. מפעילה גם ניידות שידור OB לשידורי שטח.',
    history:
      'מזמור הפקות נוסדה ב-1991 ומספקת שירותי ברודקאסט מתקדמים לערוצי הטלוויזיה הגדולים בישראל. החברה שידרה תכנים חיים לערוצים 1, 2 ו-10 לאורך השנים, ומפעילה ניידות OB לשידורי שטח בכל רחבי הארץ.',
    facilities: [
      'אולפן 1,300 מ"ר (פתח תקווה)',
      'אולפן 935 מ"ר (פתח תקווה)',
      'אולפן 200 מ"ר (תל אביב)',
      'ניידות OB',
      'ציוד HD מתקדם',
      'תשתיות שידור חי',
    ],
    phone: '077-5512211',
    website: 'https://mvp-tv.co.il',
    address: 'ז\'בוטינסקי 90, פתח תקווה',
    yearFounded: 1991,
    studioCount: 3,
    totalArea: '2,235+ מ"ר',
    productions: ['שידורים חיים לערוצי טלוויזיה', 'פרסומות', 'כנסים ואירועים'],
  }),
];
