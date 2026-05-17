// One-shot bulk import of manually curated contacts into the 'contacts' collection.
// Deduplicates by normalized phone across both 'contacts' and 'users' collections.
// Safe to call multiple times — existing records are updated (role merge), not overwritten.
import { NextRequest, NextResponse } from 'next/server';
import { requirePrimaryAdminRequest } from '@/lib/server/primaryAdmin';
import { listDocuments, patchDocument, createDocument } from '@/lib/server/firestoreAdminRest';
import { normalizePhone, normalizeName } from '@/lib/crewNormalization';
import { normalizeRoleToCanonical, getDepartmentForRole } from '@/constants/departments';
import { splitName } from '@/lib/contactsUtils';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 60;

type ImportRecord = { name: string; phone: string; role: string };

// Matches the ghost avatar seed used throughout the app (ghostSeed in contactsSync.ts)
function ghostAvatarSeed(normalizedName: string): number {
  return normalizedName.split('').reduce((acc, c) => acc + c.charCodeAt(0), 0) % 8;
}

function nowIso(): string {
  return new Date().toISOString();
}

type RawContact = Record<string, unknown> & { id?: string; phone?: string | null; normalizedPhone?: string | null; role?: string; roles?: unknown };
type RawUser = Record<string, unknown> & { id?: string; phone?: string | null; normalizedPhone?: string | null };

export async function POST(request: NextRequest) {
  const auth = await requirePrimaryAdminRequest(request);
  if (auth instanceof NextResponse) return auth;

  // Accept either hardcoded list or a body override for flexibility
  const body = await request.json().catch(() => ({})) as { records?: ImportRecord[] };

  const DIRECTORS: ImportRecord[] = body.records ?? [
    { name: 'אלון אלוש',       phone: '054-4301530', role: 'במאי' },
    { name: 'איתן אשכנזי',     phone: '052-4695053', role: 'במאי' },
    { name: 'איתן כהן',        phone: '054-6676383', role: 'במאי' },
    { name: 'אדהם חוסרי',     phone: '054-6503150', role: 'במאי' },
    { name: 'ענר גינדין',      phone: '054-6602632', role: 'במאי' },
    { name: 'טלי זומר',        phone: '054-2200599', role: 'במאית' },
    { name: 'אלעד רובינשטיין', phone: '052-5413323', role: 'במאי' },
  ];

  const [contacts, users] = await Promise.all([
    listDocuments<RawContact>('contacts').catch(() => []),
    listDocuments<RawUser>('users').catch(() => []),
  ]);

  // Build phone lookup sets from existing data
  const contactByPhone = new Map<string, RawContact>();
  for (const c of contacts) {
    const p = normalizePhone(c.normalizedPhone as string ?? c.phone as string);
    if (p) contactByPhone.set(p, c);
  }

  const userPhones = new Set<string>();
  for (const u of users) {
    const p = normalizePhone(u.normalizedPhone as string ?? u.phone as string);
    if (p) userPhones.add(p);
  }

  const results: Array<{ name: string; phone: string; action: 'created' | 'updated' | 'skipped'; reason?: string }> = [];

  for (const record of DIRECTORS) {
    const normalizedPh = normalizePhone(record.phone);
    const normalizedN = normalizeName(record.name);
    const { firstName, lastName } = splitName(record.name);

    // Resolve canonical role ("במאי" → "במאי/ת", department → "בימוי וניתוב")
    const roleResult = normalizeRoleToCanonical(record.role);
    const canonicalRole = roleResult.canonicalRole || record.role;
    const department = roleResult.department || getDepartmentForRole(canonicalRole) || 'בימוי וניתוב';

    const existingByPhone = normalizedPh ? contactByPhone.get(normalizedPh) : null;

    if (existingByPhone) {
      // Already exists — merge role if not already present
      const existingRoles: string[] = Array.isArray(existingByPhone.roles) ? existingByPhone.roles.map(String) : [];
      const hasRole = existingRoles.includes(canonicalRole);

      if (hasRole) {
        results.push({ name: record.name, phone: record.phone, action: 'skipped', reason: 'already exists with correct role' });
        continue;
      }

      const mergedRoles = [...new Set([...(existingByPhone.role ? [String(existingByPhone.role)] : []), ...existingRoles, canonicalRole])];
      await patchDocument(`contacts/${existingByPhone.id}`, {
        role: canonicalRole,
        roles: mergedRoles,
        department,
        updatedAt: nowIso(),
      });
      results.push({ name: record.name, phone: record.phone, action: 'updated', reason: 'role merged' });
      continue;
    }

    // New contact — create with full ghost profile
    const id = `manual-${normalizedPh ?? normalizedN.replace(/\s+/g, '-')}-${Date.now()}`;
    const identityKey = normalizedPh ? `${normalizedN}::${normalizedPh}` : normalizedN;

    await createDocument('contacts', {
      id,
      firstName,
      lastName,
      phone: normalizedPh || record.phone,
      normalizedName: normalizedN,
      normalizedPhone: normalizedPh || null,
      identityKey,
      partialContact: !normalizedPh,
      role: canonicalRole,
      roles: [canonicalRole],
      department,
      departments: [department],
      workArea: null,
      specialty: '',
      is_consented: false,
      hiddenFromDirectory: false,
      removedAt: null,
      removalRequestedByUid: null,
      removalReason: null,
      source: 'manual',
      sources: ['manual'],
      // Ghost profile — matches the pattern in contactsSync.ts
      isGhost: true,
      ghostAvatarSeed: ghostAvatarSeed(normalizedN),
      createdAt: nowIso(),
      updatedAt: nowIso(),
    }, id);

    results.push({ name: record.name, phone: record.phone, action: 'created' });
  }

  const created = results.filter((r) => r.action === 'created').length;
  const updated = results.filter((r) => r.action === 'updated').length;
  const skipped = results.filter((r) => r.action === 'skipped').length;

  return NextResponse.json({ created, updated, skipped, results });
}
