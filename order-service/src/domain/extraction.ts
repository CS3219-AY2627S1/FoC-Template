/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (Claude Opus 5.5), date: 2026-11-09
 * Scope: N2 errand extraction: the POST /errands/extract body check and the checks applied to the model's reply
 *        (the POST /errands rules; a failing value becomes null), per the approved N2 spec.
 * Author review: Reviewed and approved by @mattis.
 */
import { CREATE_LIMITS, parseIsoTimestamp, type FieldError } from "./validation";

export const MAX_DESCRIPTION = 1000;

export type DescriptionCheck = { ok: true; description: string } | { ok: false; errors: FieldError[] };

/** Body must be exactly { description }, a string that is not blank and at most 1000 characters (string length). */
export function validateExtractRequest(body: unknown): DescriptionCheck {
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    return { ok: false, errors: [{ field: "body", message: "body must be a JSON object" }] };
  }
  const b = body as Record<string, unknown>;
  const errors: FieldError[] = [];
  for (const key of Object.keys(b)) if (key !== "description") errors.push({ field: key, message: "unknown field" });
  const d = b.description;
  if (typeof d !== "string") {
    errors.push({ field: "description", message: "description must be a string" });
  } else if (d.trim().length === 0) {
    errors.push({ field: "description", message: "description must not be blank" });
  } else if (d.length > MAX_DESCRIPTION) {
    errors.push({ field: "description", message: `description must be at most ${MAX_DESCRIPTION} characters` });
  }
  if (errors.length > 0) return { ok: false, errors };
  return { ok: true, description: d as string };
}

/** The 200 body: exactly the POST /errands field names, each null when it couldn't be worked out. */
export interface ExtractedErrand {
  supplierId: string | null;
  items: { name: string; quantity: number | null }[] | null;
  dropoffLocation: string | null;
  notes: string | null;
  creditAmount: number | null;
  listingDeadline: string | null;
  pickupDeadline: string | null;
  deliveryDeadline: string | null;
}

export const EXTRACTED_FIELDS = [
  "supplierId", "items", "dropoffLocation", "notes", "creditAmount",
  "listingDeadline", "pickupDeadline", "deliveryDeadline",
] as const satisfies readonly (keyof ExtractedErrand)[];

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const isWhole = (v: unknown): v is number => typeof v === "number" && Number.isInteger(v);

/**
 * Checks the model's reply value by value. Returns null when the reply isn't an object at all (unusable).
 * The description is untrusted, so nothing in the reply is believed: a Supplier must be one that was sent,
 * and every value must pass the POST /errands rule or it becomes null.
 */
export function checkExtraction(reply: unknown, supplierIds: ReadonlySet<string>, now: Date): ExtractedErrand | null {
  if (!isRecord(reply)) return null;
  const L = CREATE_LIMITS;

  // An id that wasn't in the list sent is no match
  const rawSupplier = typeof reply.supplierId === "string" ? reply.supplierId.toLowerCase() : null;
  const supplierId = rawSupplier !== null && supplierIds.has(rawSupplier) ? rawSupplier : null;

  // An item whose name fails is dropped; a quantity that fails, or was not stated, becomes null and the item is
  // kept. The 20-item limit is counted on the items left after dropping (round 4): more than 20, or none, is null.
  let items: ExtractedErrand["items"] = null;
  if (Array.isArray(reply.items)) {
    const kept: { name: string; quantity: number | null }[] = [];
    for (const raw of reply.items) {
      if (!isRecord(raw) || typeof raw.name !== "string") continue;
      const name = raw.name.trim();
      if (name.length < 1 || name.length > L.maxItemName) continue;
      const q = raw.quantity;
      kept.push({ name, quantity: isWhole(q) && q >= 1 && q <= L.maxItemQuantity ? q : null });
    }
    items = kept.length > 0 && kept.length <= L.maxItems ? kept : null;
  }

  const text = (v: unknown, max: number): string | null => {
    if (typeof v !== "string") return null;
    const t = v.trim();
    return t.length >= 1 && t.length <= max ? t : null;
  };

  const credit = reply.creditAmount;
  const creditAmount = isWhole(credit) && credit >= L.minCredit && credit <= L.maxCredit ? credit : null;

  const deadline = (v: unknown): { text: string; at: Date } | null => {
    const d = parseIsoTimestamp(v);
    if (d === "format" || d === "invalid" || d.getTime() <= now.getTime()) return null;
    return { text: v as string, at: d };
  };
  let listing = deadline(reply.listingDeadline);
  let pickup = deadline(reply.pickupDeadline);
  let delivery = deadline(reply.deliveryDeadline);
  // The deadlines that are left must run listing <= pickup <= delivery, or all three become null
  const before = (a: typeof listing, b: typeof listing) => a !== null && b !== null && b.at < a.at;
  if (before(listing, pickup) || before(pickup, delivery) || before(listing, delivery)) {
    listing = pickup = delivery = null;
  }

  return {
    supplierId,
    items,
    dropoffLocation: text(reply.dropoffLocation, L.maxDropoff),
    notes: text(reply.notes, L.maxNotes),
    creditAmount,
    listingDeadline: listing?.text ?? null,
    pickupDeadline: pickup?.text ?? null,
    deliveryDeadline: delivery?.text ?? null,
  };
}

/** Names of the fields that came back with a value, for the log line. */
export function filledFields(e: ExtractedErrand): string[] {
  return EXTRACTED_FIELDS.filter((f) => e[f] !== null);
}
