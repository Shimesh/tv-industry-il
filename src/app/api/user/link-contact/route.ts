import { NextRequest, NextResponse } from 'next/server';
import { verifyAuthToken } from '@/lib/apiAuth';
import { unauthorizedResponse } from '@/lib/apiAuth';
import { getDocument, patchDocument, runQuery } from '@/lib/server/firestoreAdminRest';
import { normalizePhone } from '@/lib/contactsUtils';

type RawContact = {
  id: string;
  firstName?: string;
  lastName?: string;
  phone?: string | null;
};

type RawUserDoc = {
  displayName?: string;
  phone?: string | null;
  linkedContactId?: string | number | null;
};

function normalizeName(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, ' ');
}

// Returns a score 0-3 for how well two names match (token overlap)
function nameScore(a: string, b: string): number {
  const ta = normalizeName(a).split(' ').filter((t) => t.length > 1);
  const tb = normalizeName(b).split(' ').filter((t) => t.length > 1);
  if (!ta.length || !tb.length) return 0;
  const overlap = ta.filter((t) => tb.includes(t)).length;
  return overlap;
}

export async function POST(request: NextRequest) {
  const authUser = await verifyAuthToken(request);
  if (!authUser) return unauthorizedResponse();

  // Don't re-link if already linked
  const userDoc = await getDocument<RawUserDoc>(`users/${authUser.uid}`);
  if (userDoc?.linkedContactId != null && String(userDoc.linkedContactId).trim()) {
    return NextResponse.json({ ok: true, alreadyLinked: true, linkedContactId: userDoc.linkedContactId });
  }

  const userPhone = normalizePhone(userDoc?.phone ?? null);
  const userName = userDoc?.displayName?.trim() ?? '';

  const contacts = await runQuery<RawContact>({ from: [{ collectionId: 'contacts' }] });

  // Phase 1: exact phone match
  if (userPhone) {
    const phoneMatch = contacts.find((c) => normalizePhone(c.phone ?? null) === userPhone);
    if (phoneMatch) {
      await patchDocument(`users/${authUser.uid}`, { linkedContactId: String(phoneMatch.id) });
      return NextResponse.json({ ok: true, linkedContactId: phoneMatch.id, method: 'phone' });
    }
  }

  // Phase 2: strong name match (both tokens present)
  if (userName) {
    const nameMatches = contacts
      .map((c) => {
        const fullName = `${c.firstName ?? ''} ${c.lastName ?? ''}`.trim();
        return { c, score: nameScore(userName, fullName) };
      })
      .filter(({ score }) => score >= 2)
      .sort((a, b) => b.score - a.score);

    if (nameMatches.length === 1) {
      await patchDocument(`users/${authUser.uid}`, { linkedContactId: String(nameMatches[0].c.id) });
      return NextResponse.json({ ok: true, linkedContactId: nameMatches[0].c.id, method: 'name' });
    }
  }

  return NextResponse.json({ ok: false, reason: 'no_match' });
}
