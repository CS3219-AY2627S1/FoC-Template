import { describe, expect, it } from 'vitest';

import { safeRedirectPath } from '@/lib/auth';

describe('safeRedirectPath', () => {
  it.each([
    ['/orders', '/orders'],
    ['/orders?tab=active#top', '/orders?tab=active#top'],
    ['/request/store', '/request/store'],
  ])('keeps same-origin path %j', (from, expected) => {
    expect(safeRedirectPath(from)).toBe(expected);
  });

  it.each([
    null,
    undefined,
    '',
    'orders',
    'https://evil.com',
    '//evil.com',
    '/\\evil.com',
    '/\t/evil.com',
    '/\n/evil.com',
    '/\r/evil.com',
  ])('falls back to /home for %j', (from) => {
    expect(safeRedirectPath(from)).toBe('/home');
  });
});
