/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (Claude Opus 5.5), date: 2026-10-16
 * Scope: Pure validation of the create-errand request body, implementing the approved plan.
 * Author review: Reviewed and approved by @mattis.
 * Additional AI assistance: Claude Code (Claude Opus 5.5), date: 2026-11-09
 * Scope: moved the timestamp check into parseIsoTimestamp so N2 extraction checks deadlines with the
 *        same rule; messages unchanged.
 * Author review: Pending review by @mattis.
 */

export interface CreateErrandInput {
  supplierId: string;
  items: { name: string; quantity: number }[];
  dropoffLocation: string;
  notes: string | null;
  creditAmount: number;
  listingDeadline: Date;
  pickupDeadline: Date;
  deliveryDeadline: Date;
}

export interface FieldError {
  field: string;
  message: string;
}

export type CreateErrandValidation =
  | { ok: true; value: CreateErrandInput }
  | { ok: false; errors: FieldError[] };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const TIMESTAMP_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:\d{2})$/;
const ALLOWED_FIELDS = new Set([
  "supplierId", "items", "dropoffLocation", "notes", "creditAmount",
  "listingDeadline", "pickupDeadline", "deliveryDeadline",
]);

/** The POST /errands limits; N2 extraction checks the model's reply against the same values. */
export const CREATE_LIMITS = {
  maxItems: 20,
  maxItemName: 100,
  maxItemQuantity: 99,
  maxDropoff: 200,
  maxNotes: 500,
  minCredit: 1,
  maxCredit: 1000,
} as const;
const {
  maxItems: MAX_ITEMS, maxItemName: MAX_ITEM_NAME, maxItemQuantity: MAX_ITEM_QUANTITY, maxDropoff: MAX_DROPOFF,
  maxNotes: MAX_NOTES, minCredit: MIN_CREDIT, maxCredit: MAX_CREDIT,
} = CREATE_LIMITS;

/**
 * An ISO 8601 timestamp with a UTC offset, as POST /errands accepts it. "format" when the text has the wrong
 * shape, "invalid" for an impossible date or time (Feb 31, hour 24), otherwise the instant.
 */
export function parseIsoTimestamp(v: unknown): Date | "format" | "invalid" {
  if (typeof v !== "string" || !TIMESTAMP_RE.test(v)) return "format";
  const d = new Date(v);
  // Date silently rolls impossible values (Feb 31, hour 24) forward, so check the components too
  const [, y, mo, da, h, mi, sec] = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?/.exec(v)!;
  const daysInMonth = new Date(Date.UTC(Number(y), Number(mo), 0)).getUTCDate();
  const offset = /([+-])(\d{2}):(\d{2})$/.exec(v);
  if (
    Number(mo) < 1 || Number(mo) > 12 || Number(da) < 1 || Number(da) > daysInMonth ||
    Number(h) > 23 || Number(mi) > 59 || Number(sec ?? 0) > 59 ||
    (offset !== null && (Number(offset[2]) > 23 || Number(offset[3]) > 59)) ||
    Number.isNaN(d.getTime())
  ) {
    return "invalid";
  }
  return d;
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

export function validateCreateErrand(body: unknown, now: Date): CreateErrandValidation {
  if (!isPlainObject(body)) {
    return { ok: false, errors: [{ field: "body", message: "body must be a JSON object" }] };
  }
  const errors: FieldError[] = [];
  const fail = (field: string, message: string) => errors.push({ field, message });

  for (const key of Object.keys(body)) {
    if (!ALLOWED_FIELDS.has(key)) fail(key, "unknown field");
  }

  let supplierId = "";
  if (typeof body.supplierId === "string" && UUID_RE.test(body.supplierId)) {
    supplierId = body.supplierId.toLowerCase();
  } else {
    fail("supplierId", "supplierId must be a UUID");
  }

  const items: { name: string; quantity: number }[] = [];
  if (!Array.isArray(body.items) || body.items.length < 1 || body.items.length > MAX_ITEMS) {
    fail("items", `items must be an array of 1 to ${MAX_ITEMS} entries`);
  } else {
    body.items.forEach((raw: unknown, i) => {
      if (!isPlainObject(raw)) {
        fail(`items[${i}]`, "item must be an object");
        return;
      }
      for (const key of Object.keys(raw)) {
        if (key !== "name" && key !== "quantity") fail(`items[${i}].${key}`, "unknown field");
      }
      const name = typeof raw.name === "string" ? raw.name.trim() : "";
      if (name.length < 1 || name.length > MAX_ITEM_NAME) {
        fail(`items[${i}].name`, `name must be 1 to ${MAX_ITEM_NAME} characters`);
      }
      const q = raw.quantity;
      if (typeof q !== "number" || !Number.isInteger(q) || q < 1 || q > MAX_ITEM_QUANTITY) {
        fail(`items[${i}].quantity`, `quantity must be an integer from 1 to ${MAX_ITEM_QUANTITY}`);
      } else {
        items.push({ name, quantity: q });
      }
    });
  }

  const dropoffLocation = typeof body.dropoffLocation === "string" ? body.dropoffLocation.trim() : "";
  if (dropoffLocation.length < 1 || dropoffLocation.length > MAX_DROPOFF) {
    fail("dropoffLocation", `dropoffLocation must be 1 to ${MAX_DROPOFF} characters`);
  }

  let notes: string | null = null;
  if (body.notes !== undefined && body.notes !== null) {
    if (typeof body.notes !== "string" || body.notes.trim().length > MAX_NOTES) {
      fail("notes", `notes must be a string of at most ${MAX_NOTES} characters`);
    } else {
      notes = body.notes.trim() || null;
    }
  }

  const credit = body.creditAmount;
  if (typeof credit !== "number" || !Number.isInteger(credit) || credit < MIN_CREDIT || credit > MAX_CREDIT) {
    fail("creditAmount", `creditAmount must be an integer from ${MIN_CREDIT} to ${MAX_CREDIT}`);
  }

  const parseDeadline = (field: string): Date | undefined => {
    const d = parseIsoTimestamp(body[field]);
    if (d === "format") {
      fail(field, `${field} must be an ISO 8601 timestamp with a UTC offset`);
      return undefined;
    }
    if (d === "invalid") {
      fail(field, `${field} is not a valid timestamp`);
      return undefined;
    }
    if (d.getTime() <= now.getTime()) {
      fail(field, `${field} must be in the future`);
      return undefined;
    }
    return d;
  };
  const listing = parseDeadline("listingDeadline");
  const pickup = parseDeadline("pickupDeadline");
  const delivery = parseDeadline("deliveryDeadline");
  if (listing && pickup && pickup < listing) {
    fail("pickupDeadline", "pickupDeadline must not be before listingDeadline");
  }
  if (pickup && delivery && delivery < pickup) {
    fail("deliveryDeadline", "deliveryDeadline must not be before pickupDeadline");
  }

  if (errors.length > 0 || !listing || !pickup || !delivery) return { ok: false, errors };
  return {
    ok: true,
    value: {
      supplierId, items, dropoffLocation, notes, creditAmount: credit as number,
      listingDeadline: listing, pickupDeadline: pickup, deliveryDeadline: delivery,
    },
  };
}
