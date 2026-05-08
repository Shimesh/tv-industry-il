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

  // Firestore IN queries support max 30 values per request
  const chunks: string[][] = [];
  for (let i = 0; i < names.length; i += 30) {
    chunks.push(names.slice(i, i + 30));
  }

  const phones: Record<string, string> = {};

  const processDocs = (docs: UserDoc[]) => {
    for (const doc of docs) {
      const phone = normalizePhone(doc.normalizedPhone || doc.phone || '');
      if (!phone) continue;
      if (doc.displayName) phones[normalizeName(doc.displayName)] = phone;
      if (doc.crewName) phones[normalizeName(doc.crewName)] = phone;
    }
  };

  await Promise.all(
    chunks.flatMap((chunk) => [
      runQuery<UserDoc>({
        from: [{ collectionId: 'users' }],
        where: buildInFilter('displayName', chunk),
        limit: 200,
      }).then(processDocs).catch(() => {}),
      runQuery<UserDoc>({
        from: [{ collectionId: 'users' }],
        where: buildInFilter('crewName', chunk),
        limit: 200,
      }).then(processDocs).catch(() => {}),
    ]),
  );

  return NextResponse.json({ phones });
}
