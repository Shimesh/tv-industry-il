import { NextRequest, NextResponse } from 'next/server';
import { verifyAuthToken, unauthorizedResponse } from '@/lib/apiAuth';
import { getDocument, patchDocument, runQuery } from '@/lib/server/firestoreAdminRest';
import { recordRouteMetric } from '@/lib/server/adminTelemetry';
import { loadAndRepairSessionProfile } from '@/lib/server/sessionBootstrap';
import { normalizeContactName, normalizePhone } from '@/lib/contactsUtils';
import { normalizeProfessionalFields } from '@/lib/professionalFields';

type ContactRecord = {
  id: string;
  firstName?: string;
  lastName?: string;
  phone?: string | null;
  normalizedName?: string;
  normalizedPhone?: string | null;
  availability?: string;
  openToWork?: boolean;
  status?: string;
  isOnline?: boolean;
  is_consented?: boolean;
};

function mapStatusToAvailability(status: unknown): 'available' | 'unavailable' {
  return status === 'available' ? 'available' : 'unavailable';
}

async function resolveLinkedContact(userUid: string): Promise<ContactRecord | null> {
  const userDoc = await getDocument<Record<string, unknown>>(`users/${userUid}`);
  if (!userDoc) return null;

  const linkedContactId = userDoc.linkedContactId;
  if (typeof linkedContactId === 'string' && linkedContactId.trim()) {
    const linked = await getDocument<ContactRecord>(`contacts/${linkedContactId.trim()}`);
    if (linked) return linked;
  }

  if (typeof linkedContactId === 'number') {
    const linked = await getDocument<ContactRecord>(`contacts/${String(linkedContactId)}`);
    if (linked) return linked;
  }

  const displayName = typeof userDoc.displayName === 'string' ? userDoc.displayName : '';
  const crewName = typeof userDoc.crewName === 'string' ? userDoc.crewName : '';
  const phone = typeof userDoc.phone === 'string' ? userDoc.phone : '';

  const normalizedPhone = normalizePhone(phone);
  const candidateNames = [displayName, crewName]
    .map((value) => normalizeContactName(value))
    .filter(Boolean);

  if (!candidateNames.length) return null;

  const contacts = await runQuery<ContactRecord>({
    from: [{ collectionId: 'contacts' }],
  });

  return contacts.find((contact) => {
    const contactName = normalizeContactName(
      contact.normalizedName || `${contact.firstName || ''} ${contact.lastName || ''}`,
    );
    const contactPhone = normalizePhone(contact.normalizedPhone || contact.phone || '');
    const matchesName = candidateNames.includes(contactName);

    if (!matchesName) return false;
    if (!normalizedPhone) return true;
    return contactPhone === normalizedPhone;
  }) || null;
}

async function syncLinkedContactFields(userUid: string, patch: Record<string, unknown>) {
  const contact = await resolveLinkedContact(userUid);
  if (!contact?.id) return;

  const contactPatch: Record<string, string | boolean | null> = {
    updatedAt: new Date().toISOString(),
  };

  if ('openToWork' in patch) {
    contactPatch.openToWork = patch.openToWork === true;
  }

  if ('status' in patch) {
    contactPatch.status = typeof patch.status === 'string' ? patch.status : 'available';
    contactPatch.availability = mapStatusToAvailability(patch.status);
  }

  if ('isOnline' in patch) {
    contactPatch.isOnline = patch.isOnline === true;
  }

  if ('departments' in patch || 'roles' in patch || 'department' in patch || 'role' in patch) {
    const professional = normalizeProfessionalFields(patch);
    contactPatch.department = professional.department;
    contactPatch.role = professional.role;
    (contactPatch as Record<string, unknown>).departments = professional.departments;
    (contactPatch as Record<string, unknown>).roles = professional.roles;
  }

  if (patch.is_consented === true) {
    contactPatch.is_consented = true;
    contactPatch.consentedAt = new Date().toISOString();
    contactPatch.consentedByUid = userUid;
  }

  if (Object.keys(contactPatch).length > 1) {
    await patchDocument(`contacts/${contact.id}`, contactPatch);
  }
}

export async function GET(request: NextRequest) {
  const authUser = await verifyAuthToken(request);
  if (!authUser) {
    return unauthorizedResponse();
  }

  try {
    const { profile, repaired } = await loadAndRepairSessionProfile(authUser);
    await recordRouteMetric({ route: '/api/me/profile', ok: true, statusCode: 200 });

    return NextResponse.json({
      profile,
      source: 'server',
      repaired,
    });
  } catch (error) {
    console.error('[api/me/profile] failed:', error);
    await recordRouteMetric({ route: '/api/me/profile', ok: false, statusCode: 500, error });
    return NextResponse.json({ error: 'Failed to load profile' }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  const authUser = await verifyAuthToken(request);
  if (!authUser) {
    return unauthorizedResponse();
  }

  try {
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const allowedKeys = [
      'displayName',
      'department',
      'departments',
      'role',
      'roles',
      'phone',
      'profileId',
      'profileSource',
      'linkedUids',
      'isAdmin',
      'bio',
      'city',
      'yearsOfExperience',
      'skills',
      'credits',
      'gear',
      'preferredRoles',
      'preferredRegions',
      'openToWork',
      'status',
      'isOnline',
      'is_consented',
      'termsAccepted',
      'notificationsEnabled',
      'soundEnabled',
      'showPhone',
      'photoURL',
      'linkedContactId',
      'onboardingComplete',
      'crewName',
    ] as const;

    const patch: Record<string, unknown> = {};
    for (const key of allowedKeys) {
      if (key in body) {
        patch[key] = body[key];
      }
    }
    patch.updatedAt = new Date().toISOString();
    if ('departments' in patch || 'roles' in patch || 'department' in patch || 'role' in patch) {
      Object.assign(patch, normalizeProfessionalFields(patch));
    }
    if (patch.termsAccepted === true) {
      patch.termsAcceptedAt = new Date().toISOString();
    }

    await patchDocument(`users/${authUser.uid}`, patch as Record<string, string | boolean | number | null | string[]>);
    await syncLinkedContactFields(authUser.uid, patch);

    // If consenting and no linkedContactId yet, try to find+link the contact by phone number.
    // This covers users who complete onboarding via phone match but have no contact link yet.
    if (patch.is_consented === true) {
      const freshUser = await getDocument<Record<string, unknown>>(`users/${authUser.uid}`);
      if (freshUser && !freshUser.linkedContactId) {
        const rawPhone = typeof patch.phone === 'string' ? patch.phone
          : typeof freshUser.phone === 'string' ? freshUser.phone : '';
        const normalizedUserPhone = normalizePhone(rawPhone);
        if (normalizedUserPhone && normalizedUserPhone.length >= 9) {
          const allContacts = await runQuery<{ id: string; normalizedPhone?: string | null; phone?: string | null }>({
            from: [{ collectionId: 'contacts' }],
          });
          const match = allContacts.find((c) => {
            const cp = normalizePhone(c.normalizedPhone || c.phone || '');
            return cp === normalizedUserPhone;
          });
          if (match?.id) {
            const now = new Date().toISOString();
            await patchDocument(`contacts/${match.id}`, {
              is_consented: true,
              consentedAt: now,
              consentedByUid: authUser.uid,
              updatedAt: now,
            });
            await patchDocument(`users/${authUser.uid}`, {
              linkedContactId: match.id,
              updatedAt: now,
            });
          }
        }
      }
    }
    await recordRouteMetric({ route: '/api/me/profile', ok: true, statusCode: 200 });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[api/me/profile] patch failed:', error);
    await recordRouteMetric({ route: '/api/me/profile', ok: false, statusCode: 500, error });
    return NextResponse.json({ error: 'Failed to update profile' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  const authUser = await verifyAuthToken(request);
  if (!authUser) {
    return unauthorizedResponse();
  }

  try {
    const now = new Date().toISOString();
    const linkedContact = await resolveLinkedContact(authUser.uid);

    if (linkedContact?.id) {
      await patchDocument(`contacts/${linkedContact.id}`, {
        hiddenFromDirectory: true,
        is_consented: false,
        phone: null,
        email: null,
        normalizedPhone: null,
        updatedAt: now,
        removedAt: now,
        removalRequestedByUid: authUser.uid,
        removalReason: 'user_requested_directory_delete',
      });
    }

    await patchDocument(`users/${authUser.uid}`, {
      linkedContactId: null,
      is_consented: false,
      onboardingComplete: false,
      showPhone: false,
      directoryDeletedAt: now,
      updatedAt: now,
    });

    await recordRouteMetric({ route: '/api/me/profile', ok: true, statusCode: 200 });
    return NextResponse.json({ success: true, removedContactId: linkedContact?.id ?? null });
  } catch (error) {
    console.error('[api/me/profile] delete failed:', error);
    await recordRouteMetric({ route: '/api/me/profile', ok: false, statusCode: 500, error });
    return NextResponse.json({ error: 'Failed to delete directory profile' }, { status: 500 });
  }
}
