import { getDepartmentForRole, normalizeRolesToCanonical } from '@/constants/departments';
import { classifyContactRole, normalizeDisplayRoleLabel } from '@/lib/contactsUtils';

export type ProfessionalFields = {
  departments: string[];
  roles: string[];
  department: string;
  role: string;
};

function clean(value: unknown): string {
  return typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : '';
}

function unique(values: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const rawValue of values) {
    const value = clean(rawValue);
    if (!value) continue;
    const key = value.toLocaleLowerCase('he');
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(value);
  }

  return result;
}

export function stringArray(value: unknown): string[] {
  if (Array.isArray(value)) {
    return unique(value.map((entry) => clean(entry)));
  }

  const single = clean(value);
  return single ? [single] : [];
}

export function normalizeRoleLabel(value: unknown): string {
  const cleaned = clean(value);
  if (!cleaned) return '';
  return normalizeDisplayRoleLabel(cleaned) || cleaned;
}

export function normalizeRoles(value: unknown, fallback?: unknown): string[] {
  return normalizeRolesToCanonical(value, fallback);
}

export function normalizeDepartments(value: unknown, fallback?: unknown): string[] {
  return unique([...stringArray(value), ...stringArray(fallback)]);
}

export function normalizeProfessionalFields(raw: object | null | undefined): ProfessionalFields {
  const source = (raw || {}) as Record<string, unknown>;
  const roles = normalizeRoles(source.roles, source.role);
  const departments = normalizeDepartments(source.departments, source.department);
  const inferredDepartments = roles
    .map((role) => getDepartmentForRole(role) || classifyContactRole(role).department)
    .filter(Boolean);
  const mergedDepartments = normalizeDepartments([...departments, ...inferredDepartments]);

  return {
    departments: mergedDepartments,
    roles,
    department: mergedDepartments[0] || '',
    role: roles[0] || '',
  };
}

export function professionalSearchText(raw: {
  firstName?: unknown;
  lastName?: unknown;
  displayName?: unknown;
  email?: unknown;
  role?: unknown;
  roles?: unknown;
  department?: unknown;
  departments?: unknown;
  workArea?: unknown;
  specialty?: unknown;
  city?: unknown;
}): string {
  const fields = normalizeProfessionalFields(raw as Record<string, unknown>);
  const specialty = normalizeRoleLabel(raw.specialty);
  const roleAliases = fields.roles.flatMap((role) => [role, normalizeRoleLabel(role)]);

  return unique([
    clean(raw.firstName),
    clean(raw.lastName),
    clean(raw.displayName),
    clean(raw.email),
    ...fields.departments,
    ...fields.roles,
    ...roleAliases,
    clean(raw.department),
    clean(raw.workArea),
    specialty,
    clean(raw.city),
  ]).join(' ').toLocaleLowerCase('he');
}
