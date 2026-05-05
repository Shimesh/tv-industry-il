export type StudioLocation = {
  type: string;
  address: string;
  description?: string;
};

export type StudioRecord = {
  id: string;
  name: string;
  nameEn?: string;
  heroGradient: string;
  accentColor: string;
  location: string;
  description: string;
  history: string;
  facilities: string[];
  phone?: string;
  email?: string;
  website?: string;
  address: string;
  locations?: StudioLocation[];
  yearFounded?: number;
  studioCount?: number;
  totalArea?: string;
  productions?: string[];
  notes?: string[];
  youtubeVideoId?: string;
  youtubeChannelUrl?: string;
  heroImage: string;
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

function createStudio(
  input: Omit<StudioRecord, 'wazeLink' | 'googleMapsLink' | 'mapsEmbedUrl'>,
): StudioRecord {
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
    nameEn: 'Neve Ilan Media City',
    heroGradient: 'linear-gradient(135deg, #1e1b4b 0%, #3730a3 42%, #7c3aed 100%)',
    accentColor: '#8b5cf6',
    heroImage: 'https://images.unsplash.com/photo-1495567720989-cebdbdd97913?auto=format&fit=crop&w=1400&q=80',
    location: 'נווה אילן, הרי ירושלים',
    description:
      'מתחם שידור והפקה גדול בהרי ירושלים, המשמש בין היתר את מערכות החדשות של קשת 12 ורשת 13, את ערוץ הכנסת וחברות הפקה נוספות. זהו מוקד חדשות חשוב, אבל לא הכתובת היחידה של קשת ורשת.',
    history:
      'המתחם מוכר כאחד ממרכזי השידור המרכזיים בישראל. לאורך השנים הוא עבר בעלויות, שיפוצים והרחבות, וכיום מזוהה במיוחד עם שידורי חדשות, אולפני טלוויזיה ותשתיות ברודקאסט.',
    facilities: [
      'אולפני טלוויזיה וקולנוע',
      'מערכות חדשות ושידור',
      'חדרי קונטרול',
      'שטחי הפקה ותפעול',
      'חניה ותשתיות אירוח',
    ],
    website: 'https://israsgroup.co.il',
    address: 'קריית התקשורת, נווה אילן',
    locations: [
      {
        type: 'מתחם ראשי',
        address: 'קריית התקשורת, נווה אילן',
        description: 'מתחם אולפנים ושידור מרכזי בהרי ירושלים.',
      },
      {
        type: 'חדשות קשת 12',
        address: 'קריית התקשורת, נווה אילן',
        description: 'מערכת החדשות ואולפן החדשות של קשת 12.',
      },
      {
        type: 'חדשות רשת 13',
        address: 'קריית התקשורת, נווה אילן',
        description: 'מערכת החדשות של רשת 13 בתוך המתחם.',
      },
    ],
    yearFounded: 1980,
    studioCount: 8,
    totalArea: 'כ-59,000 מ"ר',
    productions: ['חדשות קשת 12', 'חדשות רשת 13', 'ערוץ הכנסת', 'האח הגדול'],
    notes: ['נווה אילן הוא בעיקר מוקד חדשות ותשתיות, לא הכתובת המרכזית לכל שידורי קשת ורשת.'],
  }),

  createStudio({
    id: 'herzliya',
    name: 'אולפני הרצליה',
    nameEn: 'United Studios of Israel',
    heroGradient: 'linear-gradient(135deg, #451a03 0%, #92400e 48%, #f59e0b 100%)',
    accentColor: '#f59e0b',
    heroImage: 'https://img.youtube.com/vi/nA-5quBqW8k/maxresdefault.jpg',
    location: 'הקסם 12, הרצליה',
    description:
      'מתחם הפקה ותיק ומרכזי בהרצליה. קשת 12 שוכרת בו אולפנים להפקות גדולות: אולפן 1 משמש להפקות כמו “ארץ נהדרת”, ואולפן 2 משמש לרצועות בוקר וערב ולהפקות אולפן נוספות.',
    history:
      'אולפני הרצליה הוקמו ב-1949 והפכו לאחד מבתי ההפקה המזוהים ביותר עם קולנוע וטלוויזיה בישראל. כיום המתחם פועל תחת United Studios of Israel ומשמש הפקות בידור, דרמה, אקטואליה ותוכן מסחרי.',
    facilities: [
      '9 אולפני טלוויזיה',
      'אולפן 1 להפקות פריים טיים גדולות',
      'אולפן 2 לרצועות בוקר וערב',
      'חדרי עריכה ופוסט',
      'גרין סקרין',
      'חדרי איפור והלבשה',
      'מחסני תפאורה',
      'מרכז מבקרים - אולפן הקסם',
    ],
    phone: '09-9595100',
    email: 'avihays@hsil.tv',
    website: 'https://hsil.tv',
    address: 'הקסם 12, הרצליה',
    yearFounded: 1949,
    studioCount: 9,
    totalArea: 'כ-47,000 מ"ר',
    productions: ['ארץ נהדרת', 'רצועות הבוקר של קשת', 'רצועות הערב של קשת', 'זהו זה', 'גיא פינס', 'תאג"ד'],
    youtubeVideoId: 'nA-5quBqW8k',
    youtubeChannelUrl: 'https://www.youtube.com/channel/UCDahPl1Zf3nGwA9aAB06QBw',
  }),

  createStudio({
    id: 'kan',
    name: 'כאן - תאגיד השידור הישראלי',
    nameEn: 'KAN - Israeli Public Broadcasting Corporation',
    heroGradient: 'linear-gradient(135deg, #022c22 0%, #047857 48%, #10b981 100%)',
    accentColor: '#10b981',
    heroImage: 'https://images.unsplash.com/photo-1590602847861-f357a9332bbc?auto=format&fit=crop&w=1400&q=80',
    location: 'ירושלים | אור יהודה',
    description:
      'תאגיד השידור הציבורי מפעיל משכן ראשי בירושלים ומרכז שידורים נוסף באור יהודה. הפעילות כוללת טלוויזיה, רדיו, דיגיטל, חדשות ותוכן ציבורי בשפות שונות.',
    history:
      'כאן החל לשדר ב-2017 והחליף את רשות השידור. בשנים האחרונות התאגיד הרחיב את פעילות החדשות והדיגיטל, כולל מרכז שידורים מתקדם בפארק נעמי באור יהודה.',
    facilities: [
      'אולפני חדשות וטלוויזיה',
      'אולפני רדיו',
      'מערכת דיגיטל',
      'חדרי עריכה',
      'קונטרול ותשתיות שידור',
      'מרכז שידורים באור יהודה',
    ],
    phone: '076-8098000',
    website: 'https://www.kan.org.il',
    address: 'כנפי נשרים 35, ירושלים',
    locations: [
      {
        type: 'משכן ראשי',
        address: 'כנפי נשרים 35, ירושלים',
        description: 'מטה, אולפני טלוויזיה ורדיו.',
      },
      {
        type: 'מרכז שידורים',
        address: 'פארק נעמי, אור יהודה',
        description: 'מרכז חדשות, עריכה ודיגיטל שנפתח ב-2024.',
      },
    ],
    yearFounded: 2017,
    productions: ['כאן 11', 'כאן 33', 'כאן 88', 'כאן חדשות', 'כאן חינוכית', 'כאן דיגיטל'],
  }),

  createStudio({
    id: 'keshet12',
    name: 'קשת 12',
    nameEn: 'Keshet Broadcasting',
    heroGradient: 'linear-gradient(135deg, #1e0045 0%, #7c3aed 46%, #be185d 100%)',
    accentColor: '#a855f7',
    heroImage: 'https://images.unsplash.com/photo-1542744095-291d1f67b221?auto=format&fit=crop&w=1400&q=80',
    location: 'רמת החייל, תל אביב | נווה אילן | הרצליה',
    description:
      'קשת 12 פועלת מכמה מוקדים: המשרדים וההנהלה בראול ולנברג ברמת החייל, מערכת החדשות בנווה אילן, ואולפני הפקה שכורים באולפני הרצליה להפקות גדולות כמו “ארץ נהדרת” ורצועות הבוקר והערב.',
    history:
      'אחרי פיצול ערוץ 2 ב-2017 קשת הפכה לערוץ עצמאי. הפעילות שלה מפוצלת בין מטה ניהולי בתל אביב, מערכת חדשות בנווה אילן ושכירת אולפנים להפקות גדולות לפי צורך הפקתי.',
    facilities: [
      'מטה והנהלה בראול ולנברג',
      'אולפן קטן במטה רמת החייל',
      'מערכת חדשות בנווה אילן',
      'שכירת אולפן 1 באולפני הרצליה',
      'שכירת אולפן 2 באולפני הרצליה',
      'ניידות ותשתיות הפקה לפי פרויקט',
    ],
    website: 'https://www.mako.co.il',
    address: 'ראול ולנברג 14, רמת החייל, תל אביב',
    locations: [
      {
        type: 'מטה והנהלה',
        address: 'ראול ולנברג 14, רמת החייל, תל אביב',
        description: 'משרדים, הנהלה ואולפן קטן בתוך הבניין.',
      },
      {
        type: 'מערכת חדשות',
        address: 'קריית התקשורת, נווה אילן',
        description: 'מערכת החדשות ואולפן חדשות קשת.',
      },
      {
        type: 'אולפני הפקה שכורים',
        address: 'הקסם 12, הרצליה',
        description: 'אולפן 1 להפקות כמו “ארץ נהדרת”; אולפן 2 לרצועות בוקר וערב.',
      },
    ],
    productions: ['ארץ נהדרת', 'אולפן שישי', 'חדשות קשת', 'רצועות הבוקר', 'רצועות הערב', 'תוכניות פריים טיים'],
    notes: ['קשת אינה “יושבת” רק בנווה אילן; החדשות שם, ההנהלה ברמת החייל והפקות רבות בהרצליה.'],
  }),

  createStudio({
    id: 'reshet13',
    name: 'רשת 13',
    nameEn: 'Reshet 13',
    heroGradient: 'linear-gradient(135deg, #450a0a 0%, #b91c1c 48%, #ea580c 100%)',
    accentColor: '#ef4444',
    heroImage: 'https://images.unsplash.com/photo-1535016120720-40c646be5580?auto=format&fit=crop&w=1400&q=80',
    location: 'רחוב הברזל, רמת החייל | נווה אילן',
    description:
      'רשת 13 מפעילה את רוב שידורי הערוץ מהאולפנים והמטה שלה באזור רחוב הברזל ברמת החייל, תל אביב. חברת החדשות של רשת 13 פועלת מתוך קריית התקשורת בנווה אילן.',
    history:
      'רשת הפכה לערוץ עצמאי לאחר פיצול ערוץ 2 ב-2017. פעילות הערוץ משלבת מוקד שידור והפקה ברמת החייל לצד מערכת חדשות נפרדת בנווה אילן.',
    facilities: [
      'אולפני שידור ברמת החייל',
      'מטה ותוכן בערוץ 13',
      'קונטרול ותשתיות שידור',
      'מערכת חדשות בנווה אילן',
      'חדרי תוכן ועריכה',
      'מרכז מבקרים לקבוצות',
    ],
    website: 'https://13tv.co.il',
    address: 'הברזל, רמת החייל, תל אביב',
    locations: [
      {
        type: 'אולפנים ומטה',
        address: 'רחוב הברזל, רמת החייל, תל אביב',
        description: 'רוב שידורי הערוץ והפעילות השוטפת.',
      },
      {
        type: 'חברת החדשות',
        address: 'קריית התקשורת, נווה אילן',
        description: 'מערכת חדשות 13 בתוך קריית התקשורת.',
      },
    ],
    productions: ['חדשות 13', 'היום שהיה', 'המקור', 'תוכניות אקטואליה', 'תוכניות בידור', 'תוכניות דוקו'],
    notes: ['החדשות בנווה אילן; רוב שידורי רשת 13 אינם משם אלא מאזור הברזל ברמת החייל.'],
  }),

  createStudio({
    id: 'now14',
    name: 'עכשיו 14 - ליגד סנטר מודיעין',
    nameEn: 'Channel 14 - Modiin Studios',
    heroGradient: 'linear-gradient(135deg, #0c1445 0%, #1d4ed8 48%, #0284c7 100%)',
    accentColor: '#3b82f6',
    heroImage: 'https://images.unsplash.com/photo-1500530855697-b586d89ba3ee?auto=format&fit=crop&w=1400&q=80',
    location: 'מודיעין-מכבים-רעות',
    description:
      'מתחם האולפנים של ערוץ עכשיו 14 נמצא בליגד סנטר במודיעין וכולל אולפני טלוויזיה, חדרי עריכה, קונטרול ומשרדים.',
    history:
      'המתחם שימש בעבר גורמי שידור שונים, וב-2021 עבר אליו ערוץ 14 לקראת המיתוג והעלייה המחודשת לאוויר כ“עכשיו 14”.',
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
    productions: ['חדשות עכשיו 14', 'הפטריוטים', 'המהדורה המרכזית', 'פאנלים חיים', 'שידורים מהכנסת'],
  }),

  createStudio({
    id: 'point2point',
    name: 'POINT 2 POINT',
    nameEn: 'Point2Point TV Studios',
    heroGradient: 'linear-gradient(135deg, #020617 0%, #334155 48%, #64748b 100%)',
    accentColor: '#94a3b8',
    heroImage: 'https://images.unsplash.com/photo-1560169897-fc0cdbdfa4d5?auto=format&fit=crop&w=1400&q=80',
    location: 'הברזל 3, רמת החייל, תל אביב',
    description:
      'מתחם אולפני טלוויזיה מתקדם ברמת החייל, עם מספר אולפנים, ניידת שידור ושירותי הפקה מלאים לערוצים, חברות מסחריות והפקות דיגיטל.',
    history:
      'POINT 2 POINT פועלת בענף הברודקאסט מאז סוף שנות ה-80. בשנים האחרונות הרחיבה את פעילות האולפנים ברמת החייל ומספקת שירותי צילום, שידור והפקה למגוון גופי תוכן.',
    facilities: [
      '4 אולפנים בגדלים שונים',
      'אולפן A גדול',
      'אולפני B ו-C',
      'גרין סקרין',
      'ניידת שידור',
      'חדרי VIP',
      'חדרי איפור והלבשה',
      'מחסנים וחניה',
    ],
    website: 'https://www.point2point.co.il',
    address: 'הברזל 3, רמת החייל, תל אביב',
    yearFounded: 1989,
    studioCount: 4,
    totalArea: 'כ-3,000 מ"ר',
    productions: ['הפקות קשת 12', 'הפקות רשת 13', 'הפקות כאן 11', 'פרסומות', 'כנסים ושידורים חיים'],
  }),

  createStudio({
    id: 'kasem-media',
    name: 'מזמור הפקות - אולפני קסם',
    nameEn: 'Mizmor Productions - Kesem Studios',
    heroGradient: 'linear-gradient(135deg, #431407 0%, #ea580c 48%, #f97316 100%)',
    accentColor: '#f97316',
    heroImage: 'https://images.unsplash.com/photo-1516280440614-37939bbacd81?auto=format&fit=crop&w=1400&q=80',
    location: 'הדקלים 13, כפר קאסם',
    description:
      'מזמור הפקות מפעילה כיום את אולפני קסם בכפר קאסם, עם חללי אולפן, ניידות שידור ושירותי מולטימדיה. האולפן הישן בפתח תקווה אינו מוצג כפעיל כאן.',
    history:
      'מזמור הפקות הוקמה ב-1991 ומספקת שירותי טלוויזיה, פרסומות, כנסים ואירועים. לפי האתר הרשמי, פעילות האולפנים הנוכחית מרוכזת באולפני קסם בכפר קאסם, לצד פעילות ניידות שידור ושירותי מולטימדיה.',
    facilities: [
      '6 חללים בגדלים שונים',
      '5 ניידות שידור',
      'ניידת לוויינית',
      'קונטרול נייד',
      'שירותי מולטימדיה',
      'שידורי זום וכנסים',
      'עריכה ותפעול אירועים',
    ],
    phone: '077-5512211',
    email: 'info@mvp-tv.co.il',
    website: 'https://mvp-tv.co.il',
    address: 'הדקלים 13, כפר קאסם',
    locations: [
      {
        type: 'אולפני קסם',
        address: 'הדקלים 13, כפר קאסם',
        description: 'כתובת האולפנים המופיעה באתר הרשמי של מזמור הפקות.',
      },
      {
        type: 'אולפני האומה',
        address: 'בנייני האומה, ירושלים',
        description: 'מיקום נוסף המופיע באתר מזמור להפקות ואירועים.',
      },
    ],
    yearFounded: 1991,
    studioCount: 6,
    productions: ['שידורים חיים', 'פרסומות', 'כנסים ואירועים', 'שירותי מולטימדיה', 'הפקות טלוויזיה'],
    notes: ['לא הוצג אולפן פעיל בפתח תקווה; אם עדיין קיים מיקום בתל אביב, לא נמצא לו אימות ברור.'],
  }),
];
