import { NextRequest, NextResponse } from 'next/server';
import { requireAdminRequest } from '@/lib/server/adminAuth';
import { runQuery } from '@/lib/server/firestoreAdminRest';
import { normalizeProfessionalFields } from '@/lib/professionalFields';

type ContactMin = {
  id: string;
  firstName?: string;
  lastName?: string;
  phone?: string | null;
  department?: string | null;
  departments?: unknown;
  role?: string | null;
  roles?: unknown;
  is_consented?: boolean;
};

export async function GET(request: NextRequest) {
  const authCheck = await requireAdminRequest(request);
  if (authCheck instanceof NextResponse) return authCheck;

  const contacts = await runQuery<ContactMin>({ from: [{ collectionId: 'contacts' }] });

  return NextResponse.json({
    contacts: contacts.map((c) => {
      const professional = normalizeProfessionalFields(c as Record<string, unknown>);
      return {
        id: c.id,
        firstName: c.firstName ?? '',
        lastName: c.lastName ?? '',
        phone: c.phone ?? '',
        is_consented: c.is_consented === true,
        department: professional.department,
        departments: professional.departments,
        role: professional.role,
        roles: professional.roles,
      };
    }),
  });
}
