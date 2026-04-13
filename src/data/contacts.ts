export interface Contact {
  id: string | number;
  firstName?: string;
  lastName?: string;
  email?: string;
  department?: string;
  role?: string;
  availability?: string;
  phone?: string;
  skills?: string[];
  source?: string;
  [key: string]: any; // מאפשר גמישות לשדות נוספים שאולי קיימים בפיירבייס
}

// אין פה מערך `contacts`! הדאטה מגיע עכשיו רק מ-Firestore.