import type { User, UserStatus } from '@/lib/user-service';

export const USER_STATUSES: readonly UserStatus[] = [
  'active',
  'suspended',
  'deactivated',
];

export const STATUS_LABELS: Record<UserStatus, string> = {
  active: 'Active',
  suspended: 'Suspended',
  deactivated: 'Deactivated',
};

/** User Service rejects longer search terms. */
export const MAX_SEARCH_LENGTH = 254;

export type UserFilters = { q?: string; status?: UserStatus };

function first(value: unknown) {
  return Array.isArray(value) ? value[0] : value;
}

/**
 * Filters from the URL or a Server Action argument. Both come from the
 * browser, so anything User Service would reject is dropped here instead.
 */
export function parseUserFilters(input: {
  q?: unknown;
  status?: unknown;
}): UserFilters {
  const rawQ = first(input.q);
  const rawStatus = first(input.status);
  const q =
    typeof rawQ === 'string' ? rawQ.trim().slice(0, MAX_SEARCH_LENGTH) : '';
  const status = USER_STATUSES.find((s) => s === rawStatus);
  return { ...(q && { q }), ...(status && { status }) };
}

/** The account-list URL for a set of filters. */
export function usersHref({ q, status }: UserFilters) {
  const params = new URLSearchParams();
  if (q) params.set('q', q);
  if (status) params.set('status', status);
  const query = params.toString();
  return query ? `/admin/users?${query}` : '/admin/users';
}

export type ModerationAction = 'suspend' | 'reinstate';

/**
 * What an administrator may do to an account, mirroring User Service's rules
 * so the page only offers actions that can succeed. `reason` explains why
 * nothing is offered.
 */
export function availableModeration(
  target: Pick<User, 'id' | 'role' | 'status'>,
  actorId: string,
): { action: ModerationAction | null; reason?: string } {
  if (target.id === actorId) {
    return { action: null, reason: 'You cannot moderate your own account.' };
  }
  if (target.status === 'suspended') return { action: 'reinstate' };
  if (target.role === 'admin') {
    return { action: null, reason: 'Administrators cannot be suspended.' };
  }
  return { action: 'suspend' };
}

/**
 * Whether an administrator may promote this account. Mirrors User Service's
 * grant-admin rules: only another active account that isn't an admin yet.
 */
export function canPromote(
  target: Pick<User, 'id' | 'role' | 'status'>,
  actorId: string,
) {
  return (
    target.id !== actorId &&
    target.role !== 'admin' &&
    target.status === 'active'
  );
}

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(value: string) {
  return UUID_PATTERN.test(value);
}
