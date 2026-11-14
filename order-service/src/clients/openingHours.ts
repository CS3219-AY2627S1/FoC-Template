/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: claude-sonnet-5), date: 2026-11-09
 * Scope: Stage 28 c2 (instructions.md) - "next opening time" computation for the
 *        scheduled-errands worker's fire-time supplier check. Mirrors the day/overnight/day-8/
 *        00:00-23:59 conventions in instructions.md's "Next opening time" table (the same rules
 *        supplier-service's own src/business/isOpen.ts implements for its `isOpen` field; this
 *        is order-service's own copy, computed from `now: Date` rather than the supplier
 *        service's wall clock, since the worker must be testable with fixed dates). No
 *        requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review:
 */

export interface OpeningHour {
  /** 1 = Monday .. 7 = Sunday; 8 = reserved for a supplier open 24/7. */
  day: number;
  /** 'HH:MM', 24h, Singapore time. */
  open: string;
  /** 'HH:MM', 24h, Singapore time; exclusive. */
  close: string;
}

export interface SupplierOpenStatus {
  closed: boolean;
  /** Next instant (strictly after `now`) the supplier opens; null when not closed, or never found. */
  nextOpeningAt: Date | null;
}

const SGT_OFFSET_MS = 8 * 60 * 60 * 1000;
const ALWAYS_OPEN_DAY = 8;
const ALL_DAY_OPEN = '00:00';
const ALL_DAY_CLOSE = '23:59';
const DAY_MS = 24 * 60 * 60 * 1000;

function toMinutes(hhmm: string): number {
  const [hours = '0', minutes = '0'] = hhmm.split(':');
  return Number(hours) * 60 + Number(minutes);
}

function isAllDay(entry: OpeningHour): boolean {
  return entry.open === ALL_DAY_OPEN && entry.close === ALL_DAY_CLOSE;
}

function sgtDayAndMinutes(now: Date): { day: number; minutes: number } {
  const sgt = new Date(now.getTime() + SGT_OFFSET_MS);
  const jsDay = sgt.getUTCDay(); // 0 = Sunday .. 6 = Saturday
  return {
    day: jsDay === 0 ? 7 : jsDay,
    minutes: sgt.getUTCHours() * 60 + sgt.getUTCMinutes(),
  };
}

/** The real (UTC) instant for `daysAhead` days from `now`'s SGT midnight, plus `minutesOfDay`. */
function sgtWallTimeToDate(now: Date, daysAhead: number, minutesOfDay: number): Date {
  const sgtNow = new Date(now.getTime() + SGT_OFFSET_MS);
  const sgtMidnightToday = Date.UTC(sgtNow.getUTCFullYear(), sgtNow.getUTCMonth(), sgtNow.getUTCDate());
  const sgtTarget = sgtMidnightToday + daysAhead * DAY_MS + minutesOfDay * 60_000;
  return new Date(sgtTarget - SGT_OFFSET_MS);
}

function isOpenNow(hours: OpeningHour[], day: number, minutes: number): boolean {
  const previousDay = day === 1 ? 7 : day - 1;

  return hours.some((entry) => {
    if (entry.day === day && isAllDay(entry)) return true;

    const open = toMinutes(entry.open);
    const close = toMinutes(entry.close);
    if (open === close) return false; // rejected at write time; defensively closed

    if (open < close) {
      return entry.day === day && minutes >= open && minutes < close;
    }
    // Overnight: the evening half belongs to the row's own day, the early morning to the next.
    if (entry.day === day && minutes >= open) return true;
    return entry.day === previousDay && minutes < close;
  });
}

/**
 * Computes whether a supplier is closed right now, and if so, the next instant it opens.
 * `hours` empty is the caller's concern (instructions.md: "handle an empty openingHours list as
 * a failure") — this function treats it as permanently closed.
 */
export function computeSupplierOpenStatus(hours: OpeningHour[], now: Date): SupplierOpenStatus {
  if (hours.length === 0) {
    return { closed: true, nextOpeningAt: null };
  }
  if (hours.some((entry) => entry.day === ALWAYS_OPEN_DAY)) {
    return { closed: false, nextOpeningAt: null };
  }

  const { day, minutes } = sgtDayAndMinutes(now);
  if (isOpenNow(hours, day, minutes)) {
    return { closed: false, nextOpeningAt: null };
  }

  // At most one window per day (instructions.md), so a plain day -> entry map is enough.
  const byDay = new Map<number, OpeningHour>();
  for (const entry of hours) {
    if (entry.day >= 1 && entry.day <= 7) byDay.set(entry.day, entry);
  }

  for (let k = 0; k <= 7; k++) {
    const candidateDay = ((day - 1 + k) % 7) + 1;
    const entry = byDay.get(candidateDay);
    if (!entry) continue;

    const openMinutes = isAllDay(entry) ? 0 : toMinutes(entry.open);
    // Today's own window, if any, has already started (we're closed, so either past its close,
    // or - for an overnight window - past its open, which would already make us open: excluded
    // by isOpenNow above). Either way it is not a future candidate for today.
    if (k === 0 && openMinutes <= minutes) continue;

    return { closed: true, nextOpeningAt: sgtWallTimeToDate(now, k, openMinutes) };
  }

  return { closed: true, nextOpeningAt: null };
}
