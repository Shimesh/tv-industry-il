import { NextRequest, NextResponse } from 'next/server';
import { requireAdminRequest } from '@/lib/server/adminAuth';
import { runQuery } from '@/lib/server/firestoreAdminRest';

type ContactMin = {
  id: string;
  firstName?: string;
  lastName?: string;
  phone?: string | null;
  department?: string | null;
};

export async function GET(request: NextRequest) {
  const authCheck = await requireAdminRequest(request);
  if (authCheck instanceof NextResponse) return authCheck;

  const contacts = await runQuery<ContactMin>({ from: [{ collectionId: 'contacts' }] });

  return NextResponse.json({
    contacts: contacts.map((c) => ({
      id: c.id,
      firstName: c.firstName ?? '',
      lastName: c.lastName ?? '',
      phone: c.phone ?? '',
      department: c.department ?? '',
    })),
  });
}
