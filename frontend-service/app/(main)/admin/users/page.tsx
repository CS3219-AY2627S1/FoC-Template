import type { Metadata } from 'next';

import {
  type AccountCounts,
  AccountSummary,
} from '@/components/admin/account-summary';
import { UserDirectory } from '@/components/admin/user-directory';
import { loadUsers } from '@/lib/admin-actions';
import { parseUserFilters } from '@/lib/admin-users';
import { requireAdminView } from '@/lib/session';

export const metadata: Metadata = { title: 'Users · Admin · Friend on Campus' };

/** Only a status's total is needed, so ask for a single account. */
const COUNT_ONLY = { offset: 0, limit: 1 };

export default async function AdminUsersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string | string[]; status?: string | string[] }>;
}) {
  const [, params] = await Promise.all([requireAdminView(), searchParams]);
  const filters = parseUserFilters(params);
  const [initial, all, active, suspended, deactivated] = await Promise.all([
    loadUsers(filters),
    loadUsers({}, COUNT_ONLY),
    loadUsers({ status: 'active' }, COUNT_ONLY),
    loadUsers({ status: 'suspended' }, COUNT_ONLY),
    loadUsers({ status: 'deactivated' }, COUNT_ONLY),
  ]);
  const total = (result: typeof all) => (result.ok ? result.total : null);
  const counts: AccountCounts = {
    all: total(all),
    active: total(active),
    suspended: total(suspended),
    deactivated: total(deactivated),
  };

  return (
    // A new filter remounts the list so paging starts over.
    <UserDirectory
      key={`${filters.q ?? ''}|${filters.status ?? ''}`}
      filters={filters}
      initial={initial}
      summary={<AccountSummary counts={counts} selected={filters.status} />}
    />
  );
}
