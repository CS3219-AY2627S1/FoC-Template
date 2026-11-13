import { describe, expect, it } from 'vitest';

import {
  deliveryDetailsOf,
  dropOffValueOf,
  EMPTY_DROP_OFF,
  isOnCampus,
  labelFor,
  pinDropOff,
  presetAt,
  toDeliveryLocation,
} from '@/lib/drop-off';
import { newIdempotencyKey } from '@/lib/idempotency';
import type { Order } from '@/lib/order-service';
import { isNearExpiry } from '@/lib/orders';

describe('isNearExpiry', () => {
  const order = {
    created_at: '2026-10-28T10:00:00Z',
    expires_at: '2026-10-28T11:00:00Z',
  } as Order;

  it('turns true halfway through the order’s own lifetime', () => {
    expect(isNearExpiry(order, Date.parse('2026-10-28T10:29:00Z'))).toBe(false);
    expect(isNearExpiry(order, Date.parse('2026-10-28T10:30:00Z'))).toBe(true);
  });
});

describe('drop-off', () => {
  const order = {
    delivery_label: 'Near COM1',
    delivery_latitude: 1.2945,
    delivery_longitude: 103.774,
    delivery_details: '  Level 2  ',
  };

  it('round-trips an order’s pin and label and trims the details', () => {
    expect(toDeliveryLocation(dropOffValueOf(order))).toEqual({
      label: 'Near COM1',
      latitude: 1.2945,
      longitude: 103.774,
      details: 'Level 2',
    });
  });

  it('names pins after the nearest building', () => {
    const com1 = { latitude: 1.2949, longitude: 103.7737 };
    expect(pinDropOff(EMPTY_DROP_OFF, com1).label).toBe('COM1');
    expect(presetAt(com1)?.id).toBe('com1');
    expect(labelFor({ latitude: 1.2951, longitude: 103.7738 })).toBe('COM1');
    expect(labelFor({ latitude: 1.2955, longitude: 103.7737 })).toBe(
      'Near COM1',
    );
  });

  it('is incomplete without a pin on campus', () => {
    expect(toDeliveryLocation(EMPTY_DROP_OFF)).toBeNull();
    const offCampus = { latitude: 1.35, longitude: 103.82 };
    expect(isOnCampus(offCampus)).toBe(false);
    expect(
      toDeliveryLocation({ ...EMPTY_DROP_OFF, position: offCampus }),
    ).toBeNull();
  });

  it('falls back to the nearest building when the label is cleared', () => {
    const value = { ...dropOffValueOf(order), label: '  ' };
    expect(toDeliveryLocation(value)?.label).toBe('Near COM1');
  });

  it('sends the label as details when none are given, and hides it again', () => {
    const value = pinDropOff(
      { ...EMPTY_DROP_OFF, details: '  ' },
      { latitude: 1.2949, longitude: 103.7737 },
    );
    expect(toDeliveryLocation(value)?.details).toBe('COM1');
    expect(deliveryDetailsOf('COM1', 'COM1')).toBeNull();
    expect(
      dropOffValueOf({ ...order, delivery_details: 'Near COM1' }).details,
    ).toBe('');
  });
});

describe('newIdempotencyKey', () => {
  it('returns distinct v4 UUIDs', () => {
    const key = newIdempotencyKey();
    expect(key).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
    expect(newIdempotencyKey()).not.toBe(key);
  });
});
