export interface NewsItem {
  id: string;
  title: string;
  summary: string;
  source: string;
  category: 'production' | 'deal' | 'event' | 'industry' | 'technology';
  date: string;
  imageUrl?: string;
  isBreaking?: boolean;
}

export interface IndustryEvent {
  id: string;
  title: string;
  description: string;
  date: string;
  time?: string;
  location: string;
  category: 'festival' | 'conference' | 'premiere' | 'workshop' | 'award';
  isUpcoming: boolean;
}

export const industryNews: NewsItem[] = [
  {
    id: 'news-1',
    title: 'עונה חדשה של "פאודה" בהפקה',
    summary: 'קשת מדיה מכריזה על תחילת הפקת העונה השישית של סדרת הדגל "פאודה". ההפקה תתחיל בחודשים הקרובים עם צוות שחקנים מורחב.',
    source: 'התעשייה',
    category: 'production',
    date: '2026-03-06',
    isBreaking: true,
  },
  {
    id: 'news-2',
    title: 'עסקת הפצה בינלאומית לסדרה ישראלית חדשה',
    summary: 'סדרת הדרמה הישראלית החדשה נרכשה על ידי רשת סטרימינג בינלאומית לשידור ב-190 מדינות. העסקה מהווה אבן דרך נוספת להצלחת תעשיית הטלוויזיה הישראלית.',
    source: 'ice',
    category: 'deal',
    date: '2026-03-05',
  },
  {
    id: 'news-3',
    title: 'פסטיבל הטלוויזיה הבינלאומי חוזר לירושלים',
    summary: 'פסטיבל הטלוויזיה הבינלאומי של ירושלים יתקיים השנה במתכונת מורחבת, עם השתתפות נציגים מ-40 מדינות ותחרות בינלאומית על הפרסים.',
    source: 'התעשייה',
    category: 'event',
    date: '2026-03-04',
  },
  {
    id: 'news-4',
    title: 'טכנולוגיית AI חדשה בשירות ההפקות',
    summary: 'חברת סטארט-אפ ישראלית פיתחה מערכת בינה מלאכותית שמייעלת את תהליכי העריכה והפוסט-פרודקשן, וחוסכת עד 40% מזמן העריכה.',
    source: 'ice',
    category: 'technology',
    date: '2026-03-03',
  },
  {
    id: 'news-5',
    title: 'קשת מדיה מרחיבה פעילות בינלאומית',
    summary: 'קשת מדיה הודיעה על הרחבת פעילות ההפקה הבינלאומית שלה עם פתיחת משרדים חדשים בלוס אנג\'לס ולונדון לקידום פורמטים ישראליים.',
    source: 'ice',
    category: 'deal',
    date: '2026-03-02',
  },
  {
    id: 'news-6',
    title: 'תחרות ריאליטי חדשה ברשת 13',
    summary: 'רשת 13 מכריזה על פורמט ריאליטי חדש ומקורי שיוגש על ידי מנחה מוכר. ההפקה כבר בשלבי פיתוח מתקדמים.',
    source: 'התעשייה',
    category: 'production',
    date: '2026-03-01',
  },
  {
    id: 'news-7',
    title: 'שיתוף פעולה בין כאן לערוצים אירופיים',
    summary: 'תאגיד השידור כאן חתם על הסכם שיתוף פעולה עם מספר ערוצי טלוויזיה אירופיים להפקה משותפת של סדרות תיעודיות.',
    source: 'ice',
    category: 'deal',
    date: '2026-02-28',
  },
  {
    id: 'news-8',
    title: 'אולפנים חדשים נפתחים בבאר שבע',
    summary: 'מתחם אולפנים חדש ומודרני נפתח בבאר שבע כחלק מיוזמה לפיתוח תעשיית התוכן בנגב. המתחם כולל שלושה אולמות צילום ומערכות פוסט מתקדמות.',
    source: 'התעשייה',
    category: 'industry',
    date: '2026-02-27',
  },
];

export const industryEvents: IndustryEvent[] = [
  {
    id: 'event-1',
    title: 'פסטיבל הטלוויזיה הבינלאומי - ירושלים',
    description: 'הפסטיבל השנתי לטלוויזיה בירושלים מציג הפקות ישראליות ובינלאומיות מובילות, עם פאנלים, הרצאות ואירועי נטוורקינג.',
    date: '2026-06-15',
    time: '10:00',
    location: 'בנייני האומה, ירושלים',
    category: 'festival',
    isUpcoming: true,
  },
  {
    id: 'event-2',
    title: 'כנס טכנולוגיות שידור 2026',
    description: 'כנס מקצועי על טכנולוגיות שידור חדשות, כולל 4K/8K, AI בהפקה, ומערכות שידור ענן.',
    date: '2026-04-20',
    time: '09:00',
    location: 'מרכז הכנסים, תל אביב',
    category: 'conference',
    isUpcoming: true,
  },
  {
    id: 'event-3',
    title: 'טקס פרסי האקדמיה לטלוויזיה',
    description: 'טקס פרסי האקדמיה הישראלית לטלוויזיה מכבד את ההפקות והיוצרים הטובים ביותר של השנה.',
    date: '2026-05-10',
    time: '20:00',
    location: 'היכל התרבות, תל אביב',
    category: 'award',
    isUpcoming: true,
  },
  {
    id: 'event-4',
    title: 'סדנת כתיבה לטלוויזיה',
    description: 'סדנה מעשית לכתיבת תסריטים לטלוויזיה בהנחיית כותבים מובילים מהתעשייה.',
    date: '2026-04-05',
    time: '14:00',
    location: 'בית אריאלה, תל אביב',
    category: 'workshop',
    isUpcoming: true,
  },
  {
    id: 'event-5',
    title: 'בכורת סדרת דרמה חדשה - כאן',
    description: 'אירוע בכורה לסדרת הדרמה החדשה של תאגיד כאן, בנוכחות צוות השחקנים והיוצרים.',
    date: '2026-03-25',
    time: '19:30',
    location: 'סינמטק תל אביב',
    category: 'premiere',
    isUpcoming: true,
  },
  {
    id: 'event-6',
    title: 'MIP TV - קאן',
    description: 'שוק הטלוויזיה הבינלאומי בקאן, צרפת. משלחת ישראלית גדולה תייצג את התעשייה המקומית.',
    date: '2026-04-14',
    time: '09:00',
    location: 'Palais des Festivals, קאן, צרפת',
    category: 'conference',
    isUpcoming: true,
  },
];

export const categoryLabels: Record<string, string> = {
  production: 'הפקה',
  deal: 'עסקאות',
  event: 'אירועים',
  industry: 'תעשייה',
  technology: 'טכנולוגיה',
  festival: 'פסטיבל',
  conference: 'כנס',
  premiere: 'בכורה',
  workshop: 'סדנה',
  award: 'פרסים',
};
