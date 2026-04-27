import { NextRequest, NextResponse } from 'next/server';
import { verifyAuthToken, unauthorizedResponse } from '@/lib/apiAuth';
import { getDocument, patchDocument, runQuery } from '@/lib/server/firestoreAdminRest';
import { recordRouteMetric } from '@/lib/server/adminTelemetry';
import { loadAndRepairSessionProfile } from '@/lib/server/sessionBootstrap';
import { normalizeContactName, normalizePhone } from '@/lib/contactsUtils';

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
      'role',
      'phone',
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

    await patchDocument(`users/${authUser.uid}`, patch as Record<string, string | boolean | number | null | string[]>);
    await syncLinkedContactFields(authUser.uid, patch);
    await recordRouteMetric({ route: '/api/me/profile', ok: true, statusCode: 200 });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[api/me/profile] patch failed:', error);
    await recordRouteMetric({ route: '/api/me/profile', ok: false, statusCode: 500, error });
    return NextResponse.json({ error: 'Failed to update profile' }, { status: 500 });
  }
}
