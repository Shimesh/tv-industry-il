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
  credits?: string[];
  openToWork?: boolean;
  [key: string]: any; 
}

export const contacts: Contact[] = [];

export const departments = [
  { id: 'photo', label: 'צילום', value: 'צילום', icon: '📷' },
  { id: 'tech', label: 'טכני', value: 'טכני', icon: '🛠️' },
  { id: 'production', label: 'הפקה', value: 'הפקה', icon: '🎬' },
  { id: 'sound', label: 'סאונד', value: 'סאונד', icon: '🎧' },
  { id: 'lighting', label: 'תאורה', value: 'תאורה', icon: '💡' },
];