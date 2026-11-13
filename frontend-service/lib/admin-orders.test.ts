import { describe, expect, it } from 'vitest';

import {
  activityTotals,
  countAxis,
  orderFilterStatuses,
  ordersHref,
  parseOrderFilter,
} from '@/lib/admin-orders';

describe('order filters', () => {
  it('parses known keys and falls back to all', () => {
    expect(parseOrderFilter('open')).toBe('open');
    expect(parseOrderFilter(['expired', 'x'])).toBe('expired');
    expect(parseOrderFilter('active')).toBe('all');
    expect(parseOrderFilter('PICKED_UP')).toBe('all');
    expect(parseOrderFilter(undefined)).toBe('all');
  });

  it('maps open and accepted to their single status', () => {
    expect(orderFilterStatuses('open')).toEqual(['OPEN']);
    expect(orderFilterStatuses('accepted')).toEqual(['ACCEPTED']);
    expect(orderFilterStatuses('all')).toEqual([]);
  });

  it('builds list URLs', () => {
    expect(ordersHref('all')).toBe('/admin/orders');
    expect(ordersHref('completed')).toBe('/admin/orders?filter=completed');
  });
});

describe('activityTotals', () => {
  it('sums each series', () => {
    const bucket = { start: '', end: '' };
    expect(
      activityTotals([
        { ...bucket, created: 2, accepted: 1, completed: 0 },
        { ...bucket, created: 3, accepted: 2, completed: 1 },
      ]),
    ).toEqual({ created: 5, accepted: 3, completed: 1 });
  });
});

describe('countAxis', () => {
  it('keeps a usable axis when there is no activity', () => {
    expect(countAxis(0)).toEqual({ top: 4, ticks: [0, 1, 2, 3, 4] });
  });

  it('steps by whole numbers that cover the maximum', () => {
    const { top, ticks } = countAxis(9);
    expect(top).toBeGreaterThanOrEqual(9);
    expect(ticks).toEqual([0, 3, 6, 9, 12]);
    expect(ticks.every(Number.isInteger)).toBe(true);
  });
});
