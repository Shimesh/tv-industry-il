export type StudioRecord = {
  id: string;
  name: string;
  location: string;
  description: string;
  history: string;
  facilities: string[];
  phone?: string;
  website?: string;
  address: string;
  wazeLink: string;
  googleMapsLink: string;
};

function buildWazeLink(address: string) {
  return `https://www.waze.com/ul?q=${encodeURIComponent(address)}&navigate=yes`;
}

function buildGoogleMapsLink(address: string) {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`;
}

function createStudio(input: Omit<StudioRecord, 'wazeLink' | 'googleMapsLink'>): StudioRecord {
  return {
    ...input,
    wazeLink: buildWazeLink(input.address),
    googleMapsLink: buildGoogleMapsLink(input.address),
  };
}

export const studios: StudioRecord[] = [
  createStudio({
    id: 'neve-ilan',
    name: 'קריית התקשורת נווה אילן',
    location: 'נווה אילן, ירושלים',
    description: 'מתחם שידור מרכזי הכולל אולפני חדשות, אולפני שידור חי ותשתיות ברודקאסט רחבות.',
    history: 'נווה אילן נחשב לאחד ממתחמי השידור הבולטים בישראל, עם פעילות ארוכת שנים של ערוצי טלוויזיה, חדשות והפקות חוץ.',
    facilities: ['אולפני חדשות', 'חדרי בקרה', 'מתחם שידור חי', 'חדרי איפור', 'גישה למשאיות שידור'],
    website: 'https://www.neveilan.co.il',
    address: 'קריית התקשורת נווה אילן, נווה אילן',
  }),
  createStudio({
    id: 'kan',
    name: 'אולפני כאן',
    location: 'ירושלים',
    description: 'אולפני תאגיד השידור הישראלי עבור חדשות, מגזינים, אקטואליה והפקות טלוויזיה.',
    history: 'האולפנים משמשים את תאגיד השידור הציבורי ומרכזים פעילות חדשותית ותוכניתית שוטפת.',
    facilities: ['אולפן חדשות', 'קונטרול', 'גרפיקה', 'חדרי עריכה'],
    website: 'https://www.kan.org.il',
    address: 'תאגיד השידור הישראלי, ירושלים',
  }),
  createStudio({
    id: 'keshet12',
    name: 'אולפני קשת 12',
    location: 'נווה אילן',
    description: 'אולפני ברודקאסט של קשת לשידורי חדשות, בידור ותוכניות אולפן.',
    history: 'קשת מפעילה בנווה אילן מערכי שידור חיים והפקות אולפן בהיקף רחב.',
    facilities: ['אולפן גדול', 'קונטרול', 'עמדות גרפיקה', 'תשתיות רב-מצלמה'],
    website: 'https://www.mako.co.il',
    address: 'אולפני קשת 12, נווה אילן',
  }),
  createStudio({
    id: 'reshet13',
    name: 'אולפני רשת 13',
    location: 'נווה אילן',
    description: 'אולפני שידור של רשת עבור חדשות, אקטואליה, בידור והפקות מקור.',
    history: 'רשת מפעילה אולפנים פעילים לשידורים חיים ולהפקות טלוויזיה במערך חדשות ותוכניות.',
    facilities: ['אולפן שידור', 'קונטרול', 'חדרי תוכן', 'מערך הפקה'],
    website: 'https://13tv.co.il',
    address: 'אולפני רשת 13, נווה אילן',
  }),
  createStudio({
    id: 'now14',
    name: 'אולפני עכשיו 14',
    location: 'מודיעין',
    description: 'אולפני ערוץ 14 לשידורי חדשות, אקטואליה, מגזינים ושידורים חיים.',
    history: 'הערוץ מפעיל מערכי אולפן ושידור רציפים עבור חדשות ואקטואליה.',
    facilities: ['אולפן חדשות', 'עמדות גרפיקה', 'קונטרול', 'חדרי עריכה'],
    website: 'https://www.now14.co.il',
    address: 'ערוץ 14, מודיעין',
  }),
  createStudio({
    id: 'herzliya',
    name: 'אולפני הרצליה',
    location: 'הרצליה',
    description: 'מתחם אולפנים ותיק המשמש להפקות טלוויזיה, תוכניות אולפן, פרויקטים מסחריים והפקות חוץ.',
    history: 'אולפני הרצליה שימשו לאורך שנים מוקד מרכזי להפקות טלוויזיה ישראליות, עם מגוון אולפנים ושירותי הפקה.',
    facilities: ['אולפנים מגוונים', 'חדרי איפור', 'מחסני תפאורה', 'תשתיות הפקה'],
    address: 'אולפני הרצליה, הרצליה',
  }),
  createStudio({
    id: 'point2point',
    name: 'פוינט 2 פוינט',
    location: 'פתח תקווה',
    description: 'אולפן שידור והפקה המתמחה בפתרונות ברודקאסט, תוכן מצולם ושידור חי.',
    history: 'פוינט 2 פוינט פועל כמתחם הפקה ושידור עבור לקוחות טלוויזיה, דיגיטל ושידורים חיים.',
    facilities: ['אולפן שידור', 'קונטרול', 'צילום רב-מצלמה', 'פוסט בסיסי'],
    website: 'https://point2point.co.il',
    address: 'פוינט 2 פוינט, פתח תקווה',
  }),
  createStudio({
    id: 'mizmor',
    name: 'מזמור',
    location: 'כפר קאסם',
    description: 'מתחם אולפנים והפקות עם דגש על שידור, צילום, מוזיקה ותוכן במה.',
    history: 'מזמור מפעיל אולפנים ואירוח הפקות במתחם ייעודי, ומשמש לפרויקטים מצולמים ושידורים.',
    facilities: ['אולפן', 'במה', 'חדרי הפקה', 'מערך צילום'],
    website: 'https://mizmor.pro',
    address: 'מתחם מזמור, כפר קאסם',
  }),
];
