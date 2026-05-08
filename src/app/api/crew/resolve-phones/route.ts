import { NextRequest, NextResponse } from 'next/server';
import { verifyAuthToken, unauthorizedResponse } from '@/lib/apiAuth';
import { runQuery } from '@/lib/server/firestoreAdminRest';
import { normalizePhone, normalizeName } from '@/lib/crewNormalization';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

interface UserDoc {
  displayName?: string;
  crewName?: string;
  phone?: string;
  normalizedPhone?: string;
}

interface ContactDoc {
  firstName?: string;
  lastName?: string;
  phone?: string;
}

function buildInFilter(fieldPath: string, values: string[]) {
  return {
    fieldFilter: {
      field: { fieldPath },
      op: 'IN',
      value: {
        arrayValue: {
          values: values.map((v) => ({ stringValue: v })),
        },
      },
    },
  };
}

export async function POST(request: NextRequest) {
  const authUser = await verifyAuthToken(request);
  if (!authUser) return unauthorizedResponse();

  let body: { names?: string[] };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const { names = [] } = body;
  if (!Array.isArray(names) || names.length === 0) {
    return NextResponse.json({ phones: {} });
  }

  const phones: Record<string, string> = {};

  // Include both raw names AND normalized forms so minor whitespace differences don't prevent a match
  const queryValues = [...new Set([...names, ...names.map(normalizeName)].filter(Boolean))];

  const addPhone = (nameKey: string | undefined, phone: string | null | undefined) => {
    const normalized = nameKey ? normalizeName(nameKey) : '';
    if (normalized && phone) phones[normalized] = phone;
  };

  const processUserDocs = (docs: UserDoc[]) => {
    for (const doc of docs) {
      const phone = normalizePhone(doc.normalizedPhone || doc.phone || '');
      if (!phone) continue;
      addPhone(doc.displayName, phone);
      addPhone(doc.crewName, phone);
    }
  };

  const chunks: string[][] = [];
  for (let i = 0; i < queryValues.length; i += 30) {
    chunks.push(queryValues.slice(i, i + 30));
  }

  const normalizedTargetNames = new Set(names.map(normalizeName).filter(Boolean));

  await Promise.all([
    // Source 1: users collection (displayName and crewName fields)
    ...chunks.flatMap((chunk) => [
      runQuery<UserDoc>({
        from: [{ collectionId: 'users' }],
        where: buildInFilter('displayName', chunk),
        limit: 200,
      }).then(processUserDocs).catch(() => {}),
      runQuery<UserDoc>({
        from: [{ collectionId: 'users' }],
        where: buildInFilter('crewName', chunk),
        limit: 200,
      }).then(processUserDocs).catch(() => {}),
    ]),

    // Source 2: contacts collection — query by firstName, then full-name-match in code
    // Admin SDK bypasses client-side consent redaction, so phones are accessible here
    (async () => {
      const firstNames = [
        ...new Set(
          names
            .map((n) => {
              const parts = normalizeName(n).split(/\s+/);
              return parts[0] || '';
            })
            .filter((f) => f.length >= 2),
        ),
      ];

      if (!firstNames.length) return;

      const fnChunks: string[][] = [];
      for (let i = 0; i < firstNames.length; i += 30) {
        fnChunks.push(firstNames.slice(i, i + 30));
      }

      const allContacts: ContactDoc[] = [];
      await Promise.all(
        fnChunks.map((chunk) =>
          runQuery<ContactDoc>({
            from: [{ collectionId: 'contacts' }],
            where: buildInFilter('firstName', chunk),
            limit: 500,
          })
            .then((docs) => allContacts.push(...docs))
            .catch(() => {}),
        ),
      );

      for (const contact of allContacts) {
        const phone = normalizePhone(contact.phone || '');
        if (!phone) continue;
        const fullName = normalizeName(`${contact.firstName || ''} ${contact.lastName || ''}`);
        if (fullName && normalizedTargetNames.has(fullName)) {
          phones[fullName] = phone;
        }
      }
    })(),
  ]);

  return NextResponse.json({ phones });
}
