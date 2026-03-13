export interface Production {
  id: string;
  name: string;
  date: string; // YYYY-MM-DD
  startTime: string; // HH:MM
  endTime: string; // HH:MM
  location: string;
  studio: string;
  notes: string;
  status: 'scheduled' | 'in-progress' | 'completed' | 'cancelled';
  crew: CrewAssignment[];
  createdBy: string;
  createdAt: number;
  updatedAt: number;
  sourceFile?: string;
}

export interface CrewAssignment {
  contactId?: number;
  name: string;
  role: string;
  department: string;
  phone?: string;
  confirmed: boolean;
}

export interface ParsedProduction {
  name: string;
  date: string;
  startTime: string;
  endTime: string;
  location: string;
  studio: string;
  notes: string;
  crew: CrewAssignment[];
}

// Hebrew column name mappings for parsing uploaded files
export const columnMappings: Record<string, string> = {
  // Production name
  'שם הפקה': 'name',
  'הפקה': 'name',
  'שם התוכנית': 'name',
  'תוכנית': 'name',
  'שם פרויקט': 'name',
  'פרויקט': 'name',
  'production': 'name',
  'name': 'name',
  'show': 'name',

  // Date
  'תאריך': 'date',
  'date': 'date',
  'יום': 'date',
  'day': 'date',

  // Start time
  'שעת התחלה': 'startTime',
  'התחלה': 'startTime',
  'שעה': 'startTime',
  'start': 'startTime',
  'start time': 'startTime',
  'from': 'startTime',
  'משעה': 'startTime',

  // End time
  'שעת סיום': 'endTime',
  'סיום': 'endTime',
  'עד שעה': 'endTime',
  'end': 'endTime',
  'end time': 'endTime',
  'to': 'endTime',
  'עד': 'endTime',

  // Location
  'מיקום': 'location',
  'location': 'location',
  'כתובת': 'location',
  'address': 'location',

  // Studio
  'אולפן': 'studio',
  'studio': 'studio',
  'אולפן מספר': 'studio',

  // Notes
  'הערות': 'notes',
  'notes': 'notes',
  'הערה': 'notes',
  'פרטים': 'notes',
  'details': 'notes',

  // Crew / role columns
  'צלם': 'crew_צלם',
  'צלם 1': 'crew_צלם',
  'צלם 2': 'crew_צלם',
  'צלם 3': 'crew_צלם',
  'צלם 4': 'crew_צלם',
  'צלם רחף': 'crew_צלם רחף',
  'קול': 'crew_קול',
  'סאונד': 'crew_קול',
  'sound': 'crew_קול',
  'תאורן': 'crew_תאורן',
  'תאורה': 'crew_תאורן',
  'lighting': 'crew_תאורן',
  'במאי': 'crew_במאי',
  'director': 'crew_במאי',
  'מפיק': 'crew_מפיק',
  'producer': 'crew_מפיק',
  'עורך': 'crew_עורך',
  'editor': 'crew_עורך',
  'כתוביות': 'crew_כתוביות',
  'טלפרומפטר': 'crew_טלפרומפטר',
  'ניתוב': 'crew_ניתוב',
  'CCU': 'crew_CCU',
  'ccu': 'crew_CCU',
  'VTR': 'crew_VTR',
  'vtr': 'crew_VTR',
  'ניהול במה': 'crew_ניהול במה',
  'תפאורן': 'crew_תפאורן',
  'פיקוח קול': 'crew_פיקוח קול',
  'מנהל הפקה': 'crew_מנהל הפקה',
  'עוזר במאי': 'crew_עוזר במאי',
  'גרפיקה': 'crew_גרפיקה',
  'graphics': 'crew_גרפיקה',
};

// Map roles to departments
export const roleDepartmentMap: Record<string, string> = {
  'צלם': 'צילום',
  'צלם רחף': 'צילום',
  'קול': 'סאונד',
  'פיקוח קול': 'סאונד',
  'תאורן': 'תאורה',
  'כתוביות': 'טכני',
  'טלפרומפטר': 'טכני',
  'ניתוב': 'טכני',
  'CCU': 'טכני',
  'VTR': 'טכני',
  'ניהול במה': 'הפקה',
  'תפאורן': 'טכני',
  'במאי': 'הפקה',
  'מפיק': 'הפקה',
  'מנהל הפקה': 'הפקה',
  'עוזר במאי': 'הפקה',
  'עורך': 'טכני',
  'גרפיקה': 'טכני',
};

export const statusLabels: Record<Production['status'], string> = {
  'scheduled': 'מתוכנן',
  'in-progress': 'בהפקה',
  'completed': 'הושלם',
  'cancelled': 'בוטל',
};

export const statusColors: Record<Production['status'], string> = {
  'scheduled': '#3b82f6',
  'in-progress': '#f59e0b',
  'completed': '#22c55e',
  'cancelled': '#ef4444',
};
