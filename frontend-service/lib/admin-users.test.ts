import { describe, expect, it } from 'vitest';

import {
  MAX_SEARCH_LENGTH,
  availableModeration,
  canPromote,
  isUuid,
  parseUserFilters,
  usersHref,
} from '@/lib/admin-users';

describe('parseUserFilters', () => {
  it('keeps a trimmed query and a known status', () => {
    expect(parseUserFilters({ q: '  alice ', status: 'suspended' })).toEqual({
      q: 'alice',
      status: 'suspended',
    });
  });

  it('drops blank queries and unknown statuses', () => {
    expect(parseUserFilters({ q: '   ', status: 'deleted' })).toEqual({});
    expect(parseUserFilters({ q: 42, status: undefined })).toEqual({});
  });

  it('takes the first value of repeated URL parameters', () => {
    expect(
      parseUserFilters({ q: ['bob', 'eve'], status: ['active', 'x'] }),
    ).toEqual({ q: 'bob', status: 'active' });
  });

  it('caps the query at the length User Service accepts', () => {
    const { q } = parseUserFilters({ q: 'a'.repeat(MAX_SEARCH_LENGTH + 10) });
    expect(q).toHaveLength(MAX_SEARCH_LENGTH);
  });
});

describe('usersHref', () => {
  it('omits empty filters', () => {
    expect(usersHref({})).toBe('/admin/users');
    expect(usersHref({ q: '' })).toBe('/admin/users');
  });

  it('encodes the query and status', () => {
    expect(usersHref({ q: 'a&b', status: 'active' })).toBe(
      '/admin/users?q=a%26b&status=active',
    );
  });
});

describe('availableModeration', () => {
  const actorId = 'actor';
  const user = { id: 'target', role: 'user', status: 'active' } as const;

  it('offers suspension for an active user', () => {
    expect(availableModeration(user, actorId).action).toBe('suspend');
  });

  it('offers suspension for a deactivated user', () => {
    expect(
      availableModeration({ ...user, status: 'deactivated' }, actorId).action,
    ).toBe('suspend');
  });

  it('offers reinstatement for a suspended user, even an admin', () => {
    expect(
      availableModeration({ ...user, status: 'suspended' }, actorId).action,
    ).toBe('reinstate');
    expect(
      availableModeration(
        { ...user, role: 'admin', status: 'suspended' },
        actorId,
      ).action,
    ).toBe('reinstate');
  });

  it('offers nothing for an active administrator or yourself', () => {
    expect(availableModeration({ ...user, role: 'admin' }, actorId)).toEqual({
      action: null,
      reason: 'Administrators cannot be suspended.',
    });
    expect(availableModeration({ ...user, id: actorId }, actorId).action).toBe(
      null,
    );
  });
});

describe('canPromote', () => {
  const user = { id: 'target', role: 'user', status: 'active' } as const;

  it('allows promoting another active regular user', () => {
    expect(canPromote(user, 'actor')).toBe(true);
  });

  it('refuses yourself, existing admins and inactive accounts', () => {
    expect(canPromote(user, 'target')).toBe(false);
    expect(canPromote({ ...user, role: 'admin' }, 'actor')).toBe(false);
    expect(canPromote({ ...user, status: 'suspended' }, 'actor')).toBe(false);
    expect(canPromote({ ...user, status: 'deactivated' }, 'actor')).toBe(false);
  });
});

describe('isUuid', () => {
  it('accepts UUIDs only', () => {
    expect(isUuid('3f2b8c1e-9d4a-4c7b-8e2f-1a2b3c4d5e6f')).toBe(true);
    expect(isUuid('../users/me')).toBe(false);
    expect(isUuid('')).toBe(false);
  });
});
