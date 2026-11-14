/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: claude-sonnet-5), date: 2026-11-09
 * Scope: Stage 28 c2 (instructions.md) - unit tests for computeSupplierOpenStatus: overnight
 *        windows, closed days (no row), day 8 (open 24/7), the 00:00/23:59 all-day pair, an
 *        empty hours list, and the exact open/close minute boundaries. No requirements,
 *        architecture, schema, or API decisions were made by the AI tool.
 * Author review:
 */

import { computeSupplierOpenStatus, type OpeningHour } from './openingHours.js';

// Singapore is UTC+8 with no DST, so SGT 00:00 Monday = UTC 2026-11-02T16:00:00Z (Sunday).
// 2026-11-02 is a Monday in SGT.
function sgt(dayOffset: number, hhmm: string): Date {
  const [h = '0', m = '0'] = hhmm.split(':');
  const base = Date.UTC(2026, 10, 2 - 1, 16, 0, 0); // 2026-11-02T00:00 SGT, in UTC
  return new Date(base + dayOffset * 86_400_000 + Number(h) * 3_600_000 + Number(m) * 60_000);
}

describe('computeSupplierOpenStatus', () => {
  it('is closed with no next opening when hours is empty', () => {
    expect(computeSupplierOpenStatus([], sgt(0, '12:00'))).toEqual({
      closed: true,
      nextOpeningAt: null,
    });
  });

  it('day 8 means always open, regardless of the current time', () => {
    const hours: OpeningHour[] = [{ day: 8, open: '00:00', close: '23:59' }];
    expect(computeSupplierOpenStatus(hours, sgt(0, '03:00'))).toEqual({
      closed: false,
      nextOpeningAt: null,
    });
  });

  it('a 00:00/23:59 pair on the current day means always open that day', () => {
    const hours: OpeningHour[] = [{ day: 1, open: '00:00', close: '23:59' }]; // Monday
    expect(computeSupplierOpenStatus(hours, sgt(0, '23:30'))).toEqual({
      closed: false,
      nextOpeningAt: null,
    });
  });

  it('no row for a day means closed that day', () => {
    const hours: OpeningHour[] = [{ day: 2, open: '09:00', close: '18:00' }]; // Tuesday only
    const result = computeSupplierOpenStatus(hours, sgt(0, '12:00')); // Monday noon
    expect(result.closed).toBe(true);
    expect(result.nextOpeningAt).toEqual(sgt(1, '09:00')); // next day, 09:00
  });

  it('is open at the exact open minute (inclusive)', () => {
    const hours: OpeningHour[] = [{ day: 1, open: '09:00', close: '18:00' }];
    expect(computeSupplierOpenStatus(hours, sgt(0, '09:00')).closed).toBe(false);
  });

  it('is closed at the exact close minute (exclusive)', () => {
    const hours: OpeningHour[] = [{ day: 1, open: '09:00', close: '18:00' }];
    const result = computeSupplierOpenStatus(hours, sgt(0, '18:00'));
    expect(result.closed).toBe(true);
    expect(result.nextOpeningAt).toEqual(sgt(7, '09:00')); // next Monday, a week later
  });

  it('overnight window: open before midnight is open, carries into the next day', () => {
    const hours: OpeningHour[] = [{ day: 1, open: '22:00', close: '04:00' }]; // Monday 22:00 -> Tue 04:00
    expect(computeSupplierOpenStatus(hours, sgt(0, '23:30')).closed).toBe(false); // Monday night
    expect(computeSupplierOpenStatus(hours, sgt(1, '02:00')).closed).toBe(false); // Tuesday early morning
    expect(computeSupplierOpenStatus(hours, sgt(1, '04:00')).closed).toBe(true); // closed at exact close
  });

  it('overnight window: closed between close and the next open, next opening is that evening', () => {
    const hours: OpeningHour[] = [{ day: 1, open: '22:00', close: '04:00' }];
    const result = computeSupplierOpenStatus(hours, sgt(1, '12:00')); // Tuesday noon, closed
    expect(result.closed).toBe(true);
    expect(result.nextOpeningAt).toEqual(sgt(7, '22:00')); // next Monday 22:00 (weekly cycle)
  });

  it('skips a same-day window that has already ended, finds the next week', () => {
    const hours: OpeningHour[] = [{ day: 1, open: '09:00', close: '18:00' }];
    const result = computeSupplierOpenStatus(hours, sgt(0, '20:00')); // Monday evening, past close
    expect(result.closed).toBe(true);
    expect(result.nextOpeningAt).toEqual(sgt(7, '09:00'));
  });

  it('finds the next opening across multiple open days, picking the nearest', () => {
    const hours: OpeningHour[] = [
      { day: 1, open: '09:00', close: '18:00' },
      { day: 3, open: '10:00', close: '20:00' },
    ];
    const result = computeSupplierOpenStatus(hours, sgt(0, '20:00')); // Monday evening
    expect(result.closed).toBe(true);
    expect(result.nextOpeningAt).toEqual(sgt(2, '10:00')); // Wednesday 10:00
  });
});
