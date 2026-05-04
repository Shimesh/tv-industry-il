import { NextRequest, NextResponse } from 'next/server';
import { verifyAuthToken, unauthorizedResponse } from '@/lib/apiAuth';
import { recordRouteMetric } from '@/lib/server/adminTelemetry';
import { loadContactsSnapshot } from '@/lib/server/sessionBootstrap';

function redactUnconsentedContact(contact: Record<string, unknown>) {
  const isConsented = contact.is_consented === true;
  if (isConsented) return { ...contact, is_consented: true };

  const safeContact = { ...contact };
  delete safeContact.phone;
  delete safeContact.email;
  delete safeContact.normalizedPhone;
  return {
    ...safeContact,
    is_consented: false,
  };
}

export async function GET(request: NextRequest) {
  const authUser = await verifyAuthToken(request);
  if (!authUser) {
    return unauthorizedResponse();
  }

  try {
    const snapshot = await loadContactsSnapshot();
    const contacts = snapshot.contacts
      .filter((contact) => contact.hiddenFromDirectory !== true)
      .map((contact) => redactUnconsentedContact(contact));
    await recordRouteMetric({ route: '/api/contacts/authoritative', ok: true, statusCode: 200 });
    return NextResponse.json({
      contacts,
      total: contacts.length,
      updatedAt: snapshot.updatedAt,
      source: 'server',
    });
  } catch (error) {
    console.error('[api/contacts/authoritative] failed:', error);
    await recordRouteMetric({ route: '/api/contacts/authoritative', ok: false, statusCode: 500, error });
    return NextResponse.json({ error: 'Failed to load contacts' }, { status: 500 });
  }
}
