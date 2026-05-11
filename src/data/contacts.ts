import type { ContactDepartment, ContactSpecialty, ContactWorkArea } from '@/lib/contactsUtils';
import { INDUSTRY_DEPARTMENTS } from '@/constants/departments';

export interface Contact {
  id: string | number;
  firstName?: string;
  lastName?: string;
  email?: string;
  is_consented?: boolean;
  hiddenFromDirectory?: boolean;
  removedAt?: string;
  removalRequestedByUid?: string;
  removalReason?: string;
  department?: ContactDepartment | string;
  departments?: string[];
  workArea?: ContactWorkArea | string | null;
  specialty?: ContactSpecialty | string;
  role?: string;
  roles?: string[];
  availability?: string;
  phone?: string;
  skills?: string[];
  source?: string;
  credits?: string[];
  openToWork?: boolean;
  status?: 'available' | 'busy' | 'offline';
  isOnline?: boolean;
  city?: string | null;
  yearsOfExperience?: number | null;
  gear?: string[] | null;
  [key: string]: unknown;
}

export const contacts: Contact[] = [];

export const departments = INDUSTRY_DEPARTMENTS;
