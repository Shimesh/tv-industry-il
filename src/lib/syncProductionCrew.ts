import { auth } from '@/lib/firebase';

export type SyncResult = {
  currentContacts: number;
  canonicalContacts: number;
  diff: number;
  scannedProductions: number;
  crewFound: number;
  created: number;
  updated: number;
  skipped: number;
  partialWithoutPhone: number;
  deletedDuplicates?: number;
  sampleMissing: Array<{ name: string; phone: string | null; role: string }>;
};

async function callAdminContactsSync(method: 'GET' | 'POST'): Promise<SyncResult> {
  const currentUser = auth?.currentUser;
  if (!currentUser) {
    throw new Error('יש להתחבר כמנהל כדי לסנכרן אנשי צוות');
  }

  const token = await currentUser.getIdToken();
  const response = await fetch('/api/admin/contacts-sync', {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
  });

  const payload = (await response.json()) as SyncResult & { error?: string };
  if (!response.ok) {
    throw new Error(payload.error || `Contacts sync failed (${response.status})`);
  }

  return payload;
}

export async function previewProductionCrewSync(): Promise<SyncResult> {
  return callAdminContactsSync('GET');
}

export async function syncProductionCrew(): Promise<SyncResult> {
  return callAdminContactsSync('POST');
}
