/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: claude-sonnet-5), date: 2026-09-29
 * Scope: Implemented the is_open calculation described in SupplierServiceArchitecture.md §6.2:
 *        Singapore time (UTC+8), a dedicated check for a 00:00-23:59 entry, and overnight intervals
 *        continuing into the following day. The half-open close boundary is an implementation choice
 *        listed in the Phase 1 plan. No requirements, architecture, schema, or API decisions were
 *        made by the AI tool.
 * Author review: Congchen
 * Scope (2026-09-29, Claude Code, model: claude-sonnet-5): moved days to 1 = Monday .. 7 = Sunday and
 *        added the reserved day 8 (open 24/7), checked first, per SupplierServiceArchitecture.md
 *        §6.2 and §9 item 21. No requirements, architecture, schema, or API decisions were made by
 *        the AI tool.
 * Author review: Congchen
 */
export interface HourEntry {
  dayOfWeek: number; // 1 = Monday .. 7 = Sunday; 8 = reserved for a supplier open 24/7 (§6.2)
  open: string; // 'HH:MM'
  close: string; // 'HH:MM'
}

const SGT_OFFSET_MS = 8 * 60 * 60 * 1000;
const ALWAYS_OPEN_DAY = 8;
const ALL_DAY_OPEN = '00:00';
const ALL_DAY_CLOSE = '23:59';

export function toMinutes(hhmm: string): number {
  const [hours = '0', minutes = '0'] = hhmm.split(':');
  return Number(hours) * 60 + Number(minutes);
}

function sgtDayAndMinutes(now: Date): { dayOfWeek: number; minutes: number } {
  const sgt = new Date(now.getTime() + SGT_OFFSET_MS);
  const jsDay = sgt.getUTCDay(); // 0 = Sunday .. 6 = Saturday
  return { dayOfWeek: jsDay === 0 ? 7 : jsDay, minutes: sgt.getUTCHours() * 60 + sgt.getUTCMinutes() };
}

export function computeIsOpen(hours: HourEntry[], now: Date): boolean {
  const { dayOfWeek, minutes } = sgtDayAndMinutes(now);

  // A day-8 entry marks a supplier open 24/7 (§6.2): always open, checked before anything else.
  if (hours.some((entry) => entry.dayOfWeek === ALWAYS_OPEN_DAY)) {
    return true;
  }

  // 00:00-23:59 denotes 24-hour operation (§6.2): open for any time of that day.
  const isAllDay = hours.some(
    (entry) =>
      entry.dayOfWeek === dayOfWeek && entry.open === ALL_DAY_OPEN && entry.close === ALL_DAY_CLOSE,
  );
  if (isAllDay) {
    return true;
  }

  const previousDay = dayOfWeek === 1 ? 7 : dayOfWeek - 1;

  return hours.some((entry) => {
    const open = toMinutes(entry.open);
    const close = toMinutes(entry.close);

    // Equal open/close is rejected at write time (§6.2); defensively treated as closed.
    if (open === close) {
      return false;
    }
    if (open < close) {
      return entry.dayOfWeek === dayOfWeek && minutes >= open && minutes < close;
    }
    // Overnight: the evening part belongs to the row's own day, the early-morning part to the next.
    if (entry.dayOfWeek === dayOfWeek && minutes >= open) {
      return true;
    }
    return entry.dayOfWeek === previousDay && minutes < close;
  });
}
