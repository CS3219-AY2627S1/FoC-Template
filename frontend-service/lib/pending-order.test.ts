import { describe, expect, it } from 'vitest';

import type { OrderCreate } from '@/lib/order-service';
import {
  clearPendingOrder,
  isUncertainFailure,
  loadPendingOrder,
  sameRequest,
  savePendingOrder,
} from '@/lib/pending-order';

const request: OrderCreate = {
  pickup_supplier_id: 'supplier-1',
  delivery: {
    label: 'COM1',
    latitude: 1.2949,
    longitude: 103.7737,
    details: 'Level 2',
  },
  item_description: 'Iced latte',
  credit_amount: 3,
};

function memoryStore() {
  const items = new Map<string, string>();
  return {
    getItem: (key: string) => items.get(key) ?? null,
    setItem: (key: string, value: string) => void items.set(key, value),
    removeItem: (key: string) => void items.delete(key),
  };
}

describe('isUncertainFailure', () => {
  it('treats server errors and timeouts as possibly posted', () => {
    expect(isUncertainFailure(503)).toBe(true);
    expect(isUncertainFailure(500)).toBe(true);
  });

  it('treats rejected requests as not posted', () => {
    expect(isUncertainFailure(422)).toBe(false);
    expect(isUncertainFailure(401)).toBe(false);
    expect(isUncertainFailure(409)).toBe(false);
  });
});

describe('sameRequest', () => {
  it('matches an identical request built separately', () => {
    expect(sameRequest(request, structuredClone(request))).toBe(true);
  });

  it('notices a change in any field', () => {
    expect(sameRequest(request, { ...request, credit_amount: 4 })).toBe(false);
    expect(
      sameRequest(request, { ...request, item_description: 'Hot latte' }),
    ).toBe(false);
    expect(
      sameRequest(request, {
        ...request,
        delivery: { ...request.delivery, latitude: 1.295 },
      }),
    ).toBe(false);
  });
});

describe('pending order storage', () => {
  it('survives a round trip and can be cleared', () => {
    const store = memoryStore();
    const pending = { key: 'k-1', request, form: { description: 'x' } };

    savePendingOrder(pending, store);
    expect(loadPendingOrder(store)).toEqual(pending);

    clearPendingOrder(store);
    expect(loadPendingOrder(store)).toBeNull();
  });

  it('ignores corrupt or incomplete entries', () => {
    const store = memoryStore();
    store.setItem('foc:pending-order', '{not json');
    expect(loadPendingOrder(store)).toBeNull();

    store.setItem('foc:pending-order', JSON.stringify({ key: 'k-1' }));
    expect(loadPendingOrder(store)).toBeNull();
  });

  it('copes with storage being unavailable', () => {
    const blocked = {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('blocked');
      },
      removeItem: () => {
        throw new Error('blocked');
      },
    };
    expect(() =>
      savePendingOrder({ key: 'k', request, form: {} }, blocked),
    ).not.toThrow();
    expect(loadPendingOrder(blocked)).toBeNull();
    expect(() => clearPendingOrder(blocked)).not.toThrow();
    expect(loadPendingOrder(null)).toBeNull();
  });
});
