export interface Channel {
  id: string;
  name: string;
  number: number;
  logo: string;
  category: 'main' | 'sport' | 'news' | 'public' | 'international';
  color: string;
  group: string;
}

export interface ScheduleItem {
  time: string;
  title: string;
  description?: string;
  duration: string;
  isLive?: boolean;
  genre?: string;
}

export const channels: Channel[] = [
  // ערוצים ראשיים
  { id: 'kan11', name: 'כאן 11', number: 11, logo: '📺', category: 'main', color: '#1e40af', group: 'ערוצים ראשיים' },
  { id: 'keshet12', name: 'קשת 12', number: 12, logo: '📺', category: 'main', color: '#dc2626', group: 'ערוצים ראשיים' },
  { id: 'reshet13', name: 'רשת 13', number: 13, logo: '📺', category: 'main', color: '#059669', group: 'ערוצים ראשיים' },
  { id: 'now14', name: 'עכשיו 14', number: 14, logo: '📺', category: 'main', color: '#7c3aed', group: 'ערוצים ראשיים' },
  // חדשות ובינלאומי
  { id: 'i24', name: 'i24NEWS', number: 15, logo: '🌐', category: 'news', color: '#0891b2', group: 'חדשות' },
  // ציבורי
  { id: 'knesset', name: 'ערוץ הכנסת', number: 99, logo: '🏛️', category: 'public', color: '#6366f1', group: 'ציבורי' },
  { id: 'kan33', name: 'כאן 33', number: 33, logo: '🎭', category: 'public', color: '#8b5cf6', group: 'ציבורי' },
  // ספורט
  { id: 'sport55', name: 'ספורט 5', number: 55, logo: '⚽', category: 'sport', color: '#ea580c', group: 'ספורט' },
  { id: 'sport56', name: 'ספורט 5+', number: 56, logo: '⚽', category: 'sport', color: '#d97706', group: 'ספורט' },
  { id: 'gold', name: 'ספורט 5 GOLD', number: 0, logo: '🏆', category: 'sport', color: '#ca8a04', group: 'ספורט' },
  { id: 'live', name: 'ספורט 5 LIVE', number: 0, logo: '🔴', category: 'sport', color: '#e11d48', group: 'ספורט' },
  { id: 'charlton1', name: "צ'רלטון 1", number: 0, logo: '🏅', category: 'sport', color: '#2563eb', group: 'ספורט' },
  { id: 'charlton2', name: "צ'רלטון 2", number: 0, logo: '🏅', category: 'sport', color: '#4f46e5', group: 'ספורט' },
  { id: 'charlton3', name: "צ'רלטון 3", number: 0, logo: '🏅', category: 'sport', color: '#6d28d9', group: 'ספורט' },
  { id: 'charlton4', name: "צ'רלטון 4", number: 0, logo: '🏅', category: 'sport', color: '#7e22ce', group: 'ספורט' },
  { id: 'charlton6', name: "צ'רלטון 6", number: 0, logo: '🏅', category: 'sport', color: '#9333ea', group: 'ספורט' },
];

export const channelGroups = [
  { id: 'main', label: 'ערוצים ראשיים', channels: ['kan11', 'keshet12', 'reshet13', 'now14'] },
  { id: 'news', label: 'חדשות', channels: ['i24'] },
  { id: 'public', label: 'ציבורי', channels: ['knesset', 'kan33'] },
  { id: 'sport', label: 'ספורט', channels: ['sport55', 'sport56', 'gold', 'live', 'charlton1', 'charlton2', 'charlton3', 'charlton4', 'charlton6'] },
];

export function generateSchedule(channelId: string): ScheduleItem[] {
  const schedules: Record<string, ScheduleItem[]> = {
    kan11: [
      { time: '06:00', title: 'בוקר טוב ישראל', description: 'מגזין הבוקר של כאן', duration: '3 שעות', genre: 'מגזין' },
      { time: '09:00', title: 'חדשות כאן', description: 'מהדורת חדשות', duration: '30 דקות', genre: 'חדשות' },
      { time: '09:30', title: 'תיעודי - ישראל מבפנים', description: 'סדרה תיעודית', duration: '60 דקות', genre: 'תיעודי' },
      { time: '10:30', title: 'קולנוע ישראלי', description: 'סרט ישראלי', duration: '90 דקות', genre: 'קולנוע' },
      { time: '12:00', title: 'חדשות היום', description: 'מהדורת צהריים', duration: '30 דקות', genre: 'חדשות' },
      { time: '12:30', title: 'העולם הערבי', description: 'מגזין תרבות ערבית', duration: '30 דקות', genre: 'מגזין' },
      { time: '13:00', title: 'מבט לילדים', description: 'תכנית ילדים', duration: '60 דקות', genre: 'ילדים' },
      { time: '14:00', title: 'הפרלמנט', description: 'תכנית פוליטיקה', duration: '60 דקות', genre: 'אקטואליה' },
      { time: '15:00', title: 'תרבות כאן', description: 'מגזין תרבות', duration: '60 דקות', genre: 'תרבות' },
      { time: '16:00', title: 'חדשות 16:00', description: 'מהדורת אחר הצהריים', duration: '30 דקות', genre: 'חדשות' },
      { time: '16:30', title: 'סדרת דרמה', description: 'דרמה ישראלית', duration: '45 דקות', genre: 'דרמה' },
      { time: '17:15', title: 'חיים בסטודיו', description: 'תכנית אורח', duration: '45 דקות', genre: 'בידור' },
      { time: '18:00', title: 'מבט עם ירון דקל', description: 'מהדורת חדשות ערב', duration: '60 דקות', genre: 'חדשות', isLive: true },
      { time: '19:00', title: 'זמן אמת', description: 'תכנית אקטואליה', duration: '60 דקות', genre: 'אקטואליה' },
      { time: '20:00', title: 'מהדורת חדשות מרכזית', description: 'המהדורה המרכזית', duration: '45 דקות', genre: 'חדשות', isLive: true },
      { time: '20:45', title: 'כאן דרמה', description: 'סדרת דרמה מקורית', duration: '55 דקות', genre: 'דרמה' },
      { time: '21:40', title: 'תיעודי כאן', description: 'סרט תיעודי', duration: '50 דקות', genre: 'תיעודי' },
      { time: '22:30', title: 'חדשות לילה', description: 'מהדורת לילה', duration: '30 דקות', genre: 'חדשות' },
      { time: '23:00', title: 'סיפור ישראלי', description: 'סדרה תיעודית', duration: '60 דקות', genre: 'תיעודי' },
    ],
    keshet12: [
      { time: '06:30', title: 'העולם הבוקר', description: 'מגזין בוקר', duration: '3 שעות', genre: 'מגזין' },
      { time: '09:30', title: 'בית ספר למוזיקה', description: 'ריאליטי מוזיקלי', duration: '60 דקות', genre: 'ריאליטי' },
      { time: '10:30', title: 'MasterChef ישראל', description: 'תחרות בישול', duration: '90 דקות', genre: 'ריאליטי' },
      { time: '12:00', title: 'חדשות 12 צהריים', description: 'מהדורת צהריים', duration: '30 דקות', genre: 'חדשות' },
      { time: '12:30', title: 'סדרה טורקית', description: 'דרמה טורקית', duration: '60 דקות', genre: 'דרמה' },
      { time: '13:30', title: 'שופרסל - קונים חכם', description: 'תוכנית צרכנות', duration: '30 דקות', genre: 'מגזין' },
      { time: '14:00', title: 'הישרדות VIP', description: 'ריאליטי', duration: '90 דקות', genre: 'ריאליטי' },
      { time: '15:30', title: 'פאודה - עונה 5', description: 'סדרת אקשן', duration: '50 דקות', genre: 'דרמה' },
      { time: '16:20', title: 'חדשות הספורט', description: 'מהדורת ספורט', duration: '20 דקות', genre: 'ספורט' },
      { time: '16:40', title: 'הכוכב הבא', description: 'ריאליטי מוזיקלי', duration: '80 דקות', genre: 'ריאליטי' },
      { time: '18:00', title: 'חדשות 12 עם יונית לוי', description: 'מהדורת חדשות ערב', duration: '60 דקות', genre: 'חדשות', isLive: true },
      { time: '19:00', title: 'אולפן שישי', description: 'מגזין אקטואליה', duration: '60 דקות', genre: 'אקטואליה' },
      { time: '20:00', title: 'מהדורת חדשות מרכזית', description: 'המהדורה המרכזית של קשת', duration: '40 דקות', genre: 'חדשות', isLive: true },
      { time: '20:40', title: 'הישרדות VIP', description: 'ריאליטי הישרדות', duration: '80 דקות', genre: 'ריאליטי' },
      { time: '22:00', title: 'סדרת הדגל', description: 'דרמה מקורית קשת', duration: '55 דקות', genre: 'דרמה' },
      { time: '22:55', title: 'חדשות סוף היום', description: 'סיכום יומי', duration: '25 דקות', genre: 'חדשות' },
      { time: '23:20', title: 'לייט נייט', description: 'תוכנית לילה', duration: '60 דקות', genre: 'בידור' },
    ],
    reshet13: [
      { time: '06:00', title: 'פותחים יום', description: 'מגזין בוקר של רשת', duration: '3 שעות', genre: 'מגזין' },
      { time: '09:00', title: 'חדשות 13 בוקר', description: 'מהדורת בוקר', duration: '30 דקות', genre: 'חדשות' },
      { time: '09:30', title: 'מטבח ישראלי', description: 'תכנית בישול', duration: '60 דקות', genre: 'לייפסטייל' },
      { time: '10:30', title: 'חתונה ממבט ראשון', description: 'ריאליטי', duration: '60 דקות', genre: 'ריאליטי' },
      { time: '11:30', title: 'נינג\'ה ישראל', description: 'תחרות ספורטיבית', duration: '60 דקות', genre: 'ריאליטי' },
      { time: '12:30', title: 'חדשות 13 צהריים', description: 'מהדורת צהריים', duration: '30 דקות', genre: 'חדשות' },
      { time: '13:00', title: 'הקול הבא', description: 'ריאליטי מוזיקלי', duration: '90 דקות', genre: 'ריאליטי' },
      { time: '14:30', title: 'סדרה אמריקאית', description: 'דרמה', duration: '45 דקות', genre: 'דרמה' },
      { time: '15:15', title: 'עושים סדר', description: 'תכנית לייפסטייל', duration: '45 דקות', genre: 'לייפסטייל' },
      { time: '16:00', title: 'האח הגדול VIP', description: 'ריאליטי', duration: '60 דקות', genre: 'ריאליטי' },
      { time: '17:00', title: 'חדשות 13 אחה"צ', description: 'מהדורת אחר הצהריים', duration: '30 דקות', genre: 'חדשות' },
      { time: '17:30', title: 'המירוץ למיליון', description: 'תכנית משחקים', duration: '60 דקות', genre: 'בידור' },
      { time: '18:30', title: 'חדשות 13 עם עמית סגל', description: 'מהדורת ערב', duration: '60 דקות', genre: 'חדשות', isLive: true },
      { time: '19:30', title: 'לונדון את קירשנבאום', description: 'אקטואליה', duration: '30 דקות', genre: 'אקטואליה' },
      { time: '20:00', title: 'מהדורת חדשות מרכזית', description: 'המהדורה המרכזית', duration: '40 דקות', genre: 'חדשות', isLive: true },
      { time: '20:40', title: 'האח הגדול', description: 'ריאליטי ישיר', duration: '80 דקות', genre: 'ריאליטי', isLive: true },
      { time: '22:00', title: 'דרמת רשת', description: 'סדרת דרמה מקורית', duration: '50 דקות', genre: 'דרמה' },
      { time: '22:50', title: 'חדשות לילה', description: 'מהדורת לילה', duration: '20 דקות', genre: 'חדשות' },
      { time: '23:10', title: 'חוצה ישראל', description: 'תכנית ריאיון', duration: '50 דקות', genre: 'תרבות' },
    ],
    now14: [
      { time: '06:00', title: 'בוקר 14', description: 'מגזין בוקר', duration: '3 שעות', genre: 'מגזין' },
      { time: '09:00', title: 'חדשות 14', description: 'מהדורת חדשות', duration: '30 דקות', genre: 'חדשות' },
      { time: '09:30', title: 'אולפן פתוח', description: 'תכנית אקטואליה', duration: '90 דקות', genre: 'אקטואליה' },
      { time: '11:00', title: 'ישראל עכשיו', description: 'מגזין', duration: '60 דקות', genre: 'מגזין' },
      { time: '12:00', title: 'חדשות 14 צהריים', description: 'מהדורת צהריים', duration: '30 דקות', genre: 'חדשות' },
      { time: '12:30', title: 'פנים חדשות', description: 'תכנית ריאיון', duration: '30 דקות', genre: 'אקטואליה' },
      { time: '13:00', title: 'המטבח של עכשיו', description: 'תכנית בישול', duration: '30 דקות', genre: 'לייפסטייל' },
      { time: '13:30', title: 'סיפורי חיים', description: 'תכנית דוקו', duration: '60 דקות', genre: 'תיעודי' },
      { time: '14:30', title: 'אולפן חם', description: 'פאנלים', duration: '90 דקות', genre: 'אקטואליה' },
      { time: '16:00', title: 'חדשות אחה"צ', description: 'מהדורת אחר הצהריים', duration: '30 דקות', genre: 'חדשות' },
      { time: '16:30', title: 'דיון ישיר', description: 'דיון אקטואלי', duration: '90 דקות', genre: 'אקטואליה', isLive: true },
      { time: '18:00', title: 'חדשות הערב', description: 'מהדורת ערב', duration: '60 דקות', genre: 'חדשות', isLive: true },
      { time: '19:00', title: 'פגוש את העיתונות', description: 'תכנית אקטואליה', duration: '60 דקות', genre: 'אקטואליה' },
      { time: '20:00', title: 'מהדורה מרכזית', description: 'מהדורת החדשות המרכזית', duration: '45 דקות', genre: 'חדשות', isLive: true },
      { time: '20:45', title: 'פאנל פוליטי', description: 'דיון פוליטי', duration: '75 דקות', genre: 'אקטואליה' },
      { time: '22:00', title: 'תיעודי 14', description: 'סרט תיעודי', duration: '60 דקות', genre: 'תיעודי' },
      { time: '23:00', title: 'חדשות לילה', description: 'מהדורת לילה', duration: '30 דקות', genre: 'חדשות' },
    ],
    i24: [
      { time: '06:00', title: 'i24 Morning', description: 'Morning news bulletin', duration: '2 hours', genre: 'חדשות' },
      { time: '08:00', title: 'Global Eye', description: 'International affairs', duration: '60 min', genre: 'חדשות' },
      { time: '09:00', title: 'Zoom In', description: 'In-depth analysis', duration: '60 min', genre: 'אקטואליה' },
      { time: '10:00', title: 'Clearcut', description: 'Current affairs debate', duration: '60 min', genre: 'אקטואליה' },
      { time: '11:00', title: 'i24 Midday', description: 'Midday news', duration: '60 min', genre: 'חדשות', isLive: true },
      { time: '12:00', title: 'Tech & Innovation', description: 'Technology news', duration: '30 min', genre: 'טכנולוגיה' },
      { time: '14:00', title: 'i24 Afternoon', description: 'Afternoon news', duration: '2 hours', genre: 'חדשות' },
      { time: '18:00', title: 'Prime Edition', description: 'Evening news', duration: '60 min', genre: 'חדשות', isLive: true },
      { time: '20:00', title: 'i24 Debate', description: 'Evening debate', duration: '60 min', genre: 'אקטואליה' },
      { time: '22:00', title: 'i24 Late', description: 'Late night news', duration: '60 min', genre: 'חדשות' },
    ],
    knesset: [
      { time: '09:00', title: 'ישיבת מליאה', description: 'שידור חי מהכנסת', duration: '3 שעות', genre: 'פוליטיקה', isLive: true },
      { time: '12:00', title: 'ועדת חוקה', description: 'דיון בוועדה', duration: '2 שעות', genre: 'פוליטיקה' },
      { time: '14:00', title: 'ועדת הכספים', description: 'דיון תקציבי', duration: '2 שעות', genre: 'פוליטיקה' },
      { time: '16:00', title: 'ועדת החינוך', description: 'דיון בוועדה', duration: '2 שעות', genre: 'פוליטיקה' },
      { time: '18:00', title: 'סיכום יום פרלמנטרי', description: 'סיכום הפעילות', duration: '60 דקות', genre: 'פוליטיקה' },
      { time: '19:00', title: 'ישיבת מליאה ערב', description: 'שידור חי', duration: '3 שעות', genre: 'פוליטיקה', isLive: true },
    ],
    kan33: [
      { time: '08:00', title: 'מוזיקה ישראלית', description: 'קליפים ישראליים', duration: '2 שעות', genre: 'מוזיקה' },
      { time: '10:00', title: 'תרבות עכשיו', description: 'מגזין תרבות', duration: '60 דקות', genre: 'תרבות' },
      { time: '11:00', title: 'קולנוע דוקו', description: 'סרט תיעודי', duration: '90 דקות', genre: 'תיעודי' },
      { time: '12:30', title: 'ערבית', description: 'שיעורי ערבית', duration: '30 דקות', genre: 'חינוך' },
      { time: '14:00', title: 'אמנות ישראלית', description: 'תערוכות וגלריות', duration: '60 דקות', genre: 'תרבות' },
      { time: '16:00', title: 'במה מקומית', description: 'תיאטרון ומחול', duration: '90 דקות', genre: 'תרבות' },
      { time: '18:00', title: 'ג\'אז ועולם', description: 'מוזיקת ג\'אז', duration: '60 דקות', genre: 'מוזיקה' },
      { time: '20:00', title: 'סדרה בינלאומית', description: 'דרמה מהעולם', duration: '55 דקות', genre: 'דרמה' },
      { time: '21:00', title: 'פסטיבל הסרטים', description: 'קולנוע עולמי', duration: '2 שעות', genre: 'קולנוע' },
      { time: '23:00', title: 'לילה מוזיקלי', description: 'הופעות חיות', duration: '60 דקות', genre: 'מוזיקה' },
    ],
    sport55: [
      { time: '10:00', title: 'ספורט בוקר', description: 'סיכום ספורטיבי', duration: '60 דקות', genre: 'ספורט' },
      { time: '11:00', title: 'ליגת העל בכדורגל', description: 'שידור חי', duration: '2 שעות', genre: 'ספורט', isLive: true },
      { time: '13:00', title: 'NBA - סיכום', description: 'סיכום משחקי NBA', duration: '60 דקות', genre: 'ספורט' },
      { time: '14:00', title: 'פרמיירליג', description: 'שידור חי', duration: '2 שעות', genre: 'ספורט', isLive: true },
      { time: '16:00', title: 'אולפן הספורט', description: 'מגזין ספורט', duration: '60 דקות', genre: 'ספורט' },
      { time: '17:00', title: 'ליגה ספרדית', description: 'שידור חי', duration: '2 שעות', genre: 'ספורט', isLive: true },
      { time: '19:00', title: 'סיכום ספורטיבי', description: 'חדשות ספורט', duration: '60 דקות', genre: 'ספורט' },
      { time: '20:00', title: 'ליגת האלופות', description: 'שידור חי', duration: '2 שעות', genre: 'ספורט', isLive: true },
      { time: '22:00', title: 'ספורט לילה', description: 'סיכום יומי', duration: '60 דקות', genre: 'ספורט' },
    ],
    sport56: [
      { time: '10:00', title: 'טניס - ATP', description: 'שידור חי', duration: '3 שעות', genre: 'ספורט', isLive: true },
      { time: '13:00', title: 'כדורסל ישראלי', description: 'ליגת העל', duration: '2 שעות', genre: 'ספורט' },
      { time: '15:00', title: 'סרייה A', description: 'כדורגל איטלקי', duration: '2 שעות', genre: 'ספורט', isLive: true },
      { time: '17:00', title: 'UFC', description: 'קרבות MMA', duration: '3 שעות', genre: 'ספורט' },
      { time: '20:00', title: 'בונדסליגה', description: 'כדורגל גרמני', duration: '2 שעות', genre: 'ספורט', isLive: true },
      { time: '22:00', title: 'ספורט אמריקאי', description: 'NFL / NBA', duration: '2 שעות', genre: 'ספורט' },
    ],
  };

  return schedules[channelId] || schedules['kan11'] || [];
}

export function getCurrentProgram(schedule: ScheduleItem[]): ScheduleItem | null {
  const now = new Date();
  const currentTime = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;

  for (let i = schedule.length - 1; i >= 0; i--) {
    if (schedule[i].time <= currentTime) {
      return schedule[i];
    }
  }
  return schedule[0] || null;
}

export function getNextProgram(schedule: ScheduleItem[]): ScheduleItem | null {
  const now = new Date();
  const currentTime = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;

  for (const item of schedule) {
    if (item.time > currentTime) {
      return item;
    }
  }
  return null;
}
