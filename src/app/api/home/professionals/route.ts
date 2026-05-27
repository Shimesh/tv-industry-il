import { NextResponse } from 'next/server';
import { runQuery } from '@/lib/server/firestoreAdminRest';

export const runtime = 'nodejs';

interface RawUser {
  uid?: string;
  displayName?: string;
  photoURL?: string;
  role?: string;
  roles?: string[];
  department?: string;
  departments?: string[];
  city?: string;
  approvalStatus?: string;
}

export async function GET() {
  try {
    const users = await runQuery<RawUser>({
      from: [{ collectionId: 'users' }],
      where: {
        fieldFilter: {
          field: { fieldPath: 'approvalStatus' },
          op: 'EQUAL',
          value: { stringValue: 'approved' },
        },
      },
      limit: 30,
    });

    const withPhotos = users
      .filter((u) => u.photoURL && u.displayName && u.displayName.trim().length > 1)
      .slice(0, 8)
      .map((u) => ({
        uid: u.uid ?? '',
        displayName: u.displayName ?? '',
        photoURL: u.photoURL ?? null,
        role: u.roles?.[0] ?? u.role ?? null,
        department: u.departments?.[0] ?? u.department ?? null,
        city: u.city ?? null,
      }));

    return NextResponse.json({ success: true, items: withPhotos });
  } catch (err) {
    console.error('[home/professionals]', err);
    return NextResponse.json({ success: false, items: [] });
  }
}
