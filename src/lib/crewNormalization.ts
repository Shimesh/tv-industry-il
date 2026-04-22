import type { CrewMember } from '@/lib/productionDiff';
import { normalizeContactName } from '@/lib/contactsUtils';

export type NormalizedCrewMember = CrewMember & {
  normalizedName: string;
  normalizedPhone: string | null;
  identityKey: string;
};

export function normalizeName(name: string): string {
  return normalizeContactName(name || '');
}

export function normalizeRole(role: string): string {
  return (role || '')
    .replace(/[|,:;]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function normalizePhone(phone: string | null | undefined): string | null {
  if (!phone) return null;
  const digits = phone.replace(/\D/g, '');
  if (!digits) return null;

  if (digits.startsWith('972') && digits.length >= 12) {
    return `0${digits.slice(-9)}`;
  }
  if (digits.length === 9) {
    return `0${digits}`;
  }
  if (digits.length >= 10) {
    return digits.slice(-10);
  }
  return null;
}

export function buildCrewIdentity(
  input: Pick<CrewMember, 'name' | 'phone'>,
): { normalizedName: string; normalizedPhone: string | null; identityKey: string | null } {
  const normalizedName = normalizeName(input.name || '');
  const normalizedPhone = normalizePhone(input.phone);

  if (!normalizedName || normalizedName.length < 2) {
    return { normalizedName, normalizedPhone, identityKey: null };
  }

  return {
    normalizedName,
    normalizedPhone,
    identityKey: normalizedPhone ? `${normalizedName}::${normalizedPhone}` : normalizedName,
  };
}

function mergeCrewMember(
  existing: NormalizedCrewMember,
  incoming: CrewMember,
): NormalizedCrewMember {
  const incomingRole = normalizeRole(incoming.role || '');
  const incomingRoleDetail = normalizeRole(incoming.roleDetail || '');
  const incomingPhone = normalizePhone(incoming.phone);

  return {
    ...existing,
    name: existing.normalizedName,
    role: existing.role || incomingRole || '',
    roleDetail: existing.roleDetail || incomingRoleDetail || '',
    phone: existing.phone || incomingPhone,
    startTime: existing.startTime || incoming.startTime || '',
    endTime: existing.endTime || incoming.endTime || '',
    addedBy: existing.addedBy || incoming.addedBy,
    addedAt: existing.addedAt || incoming.addedAt,
    isCurrentUser: existing.isCurrentUser || incoming.isCurrentUser,
    normalizedName: existing.normalizedName,
    normalizedPhone: existing.normalizedPhone || incomingPhone,
    identityKey: existing.identityKey,
  };
}

export function deduplicateCrewEntries(crew: CrewMember[]): NormalizedCrewMember[] {
  const byIdentity = new Map<string, NormalizedCrewMember>();
  const byPhone = new Map<string, string>();
  const byComposite = new Map<string, string>();
  const byNameWithoutPhone = new Map<string, string>();

  for (const member of crew || []) {
    const { normalizedName, normalizedPhone, identityKey } = buildCrewIdentity(member);
    if (!identityKey) continue;

    let key = identityKey;

    if (normalizedPhone && byPhone.has(normalizedPhone)) {
      key = byPhone.get(normalizedPhone)!;
    } else if (normalizedPhone && byComposite.has(identityKey)) {
      key = byComposite.get(identityKey)!;
    } else if (normalizedPhone && byNameWithoutPhone.has(normalizedName)) {
      const partialKey = byNameWithoutPhone.get(normalizedName)!;
      const partialExisting = byIdentity.get(partialKey);
      if (partialExisting) {
        byIdentity.delete(partialKey);
        byNameWithoutPhone.delete(normalizedName);
        byIdentity.set(identityKey, {
          ...partialExisting,
          phone: normalizedPhone,
          normalizedPhone,
          identityKey,
        });
      }
      key = identityKey;
    } else if (!normalizedPhone && byNameWithoutPhone.has(normalizedName)) {
      key = byNameWithoutPhone.get(normalizedName)!;
    }

    const normalized: NormalizedCrewMember = {
      ...member,
      name: normalizedName,
      role: normalizeRole(member.role || ''),
      roleDetail: normalizeRole(member.roleDetail || ''),
      phone: normalizedPhone,
      startTime: member.startTime || '',
      endTime: member.endTime || '',
      normalizedName,
      normalizedPhone,
      identityKey: key,
    };

    if (!byIdentity.has(key)) {
      byIdentity.set(key, normalized);
      if (normalizedPhone) {
        byPhone.set(normalizedPhone, key);
        byComposite.set(`${normalizedName}::${normalizedPhone}`, key);
      } else {
        byNameWithoutPhone.set(normalizedName, key);
      }
      continue;
    }

    const merged = mergeCrewMember(byIdentity.get(key)!, normalized);
    byIdentity.set(key, merged);
    if (merged.normalizedPhone) {
      byPhone.set(merged.normalizedPhone, key);
      byComposite.set(`${merged.normalizedName}::${merged.normalizedPhone}`, key);
      byNameWithoutPhone.delete(merged.normalizedName);
    } else {
      byNameWithoutPhone.set(merged.normalizedName, key);
    }
  }

  return Array.from(byIdentity.values());
}
