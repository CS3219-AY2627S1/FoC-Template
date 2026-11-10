/*
 * AI Assistance Disclosure (hwangjihun):
 * Tool: Claude Code (model: Claude Opus 5.5), date: 2026-10-30
 * Scope: Implemented voice recording and safe application of drafts to the errand form.
 * Author review: I validated correctness, and added boundary checks.
 */

import { emptyOrderForm, type OrderForm } from "../api/order-draft";
import type { DraftField, DraftSupplierOption, ErrandDraftFields } from "../api/voice-assist-service";

export type DraftNotes = Partial<Record<keyof OrderForm, string>>;
export type AppliedDraft = {
  form: OrderForm;
  // Missing, unclear or conflicting fields: shown as errors until the requester edits them.
  issues: DraftNotes;
  // Filled fields with something to point out, such as "Taken as 5 credits."
  hints: DraftNotes;
  supplierCandidates: DraftSupplierOption[];
  supplierSuggestion: string | null;
};

// The form shows Singapore time regardless of the device timezone.
function sgtLocal(value: string): string {
  const time = Date.parse(value);
  return Number.isNaN(time) ? "" : new Date(time + 8 * 60 * 60 * 1000).toISOString().slice(0, 16);
}

const fallback: Record<keyof OrderForm, string> = {
  supplierId: "Choose the pickup supplier.",
  itemDescription: "Enter the instructions.",
  deliveryLocation: "Enter the delivery location.",
  reward: "Enter a credit reward.",
  acceptanceDeadline: "Enter the latest acceptance time.",
  deliveryDeadline: "Enter the latest delivery time.",
};

// N3F3.1.2: a successful draft replaces every form value; anything not determined is left empty.
export function applyDraft(fields: ErrandDraftFields): AppliedDraft {
  const form: OrderForm = { ...emptyOrderForm };
  const issues: DraftNotes = {};
  const hints: DraftNotes = {};
  const entries: [keyof OrderForm, DraftField<string | number>, (value: string | number) => string][] = [
    ["itemDescription", fields.itemDescription, String],
    ["deliveryLocation", fields.deliveryLocation, String],
    ["reward", fields.reward, String],
    ["acceptanceDeadline", fields.acceptanceDeadline, (value) => sgtLocal(String(value))],
    ["deliveryDeadline", fields.deliveryDeadline, (value) => sgtLocal(String(value))],
  ];
  for (const [name, field, toForm] of entries) {
    if (field.value !== null && field.value !== undefined) form[name] = toForm(field.value);
    if (field.status !== "FILLED") issues[name] = field.note ?? fallback[name];
    else if (field.note) hints[name] = field.note;
  }
  const supplier = fields.supplier;
  if (supplier.status === "FILLED" && supplier.value) {
    form.supplierId = supplier.value;
    if (supplier.note) hints.supplierId = supplier.note;
  } else {
    issues.supplierId = supplier.note ?? fallback.supplierId;
  }
  const suggestion = supplier.status === "FILLED" ? supplier.suggestion : null;
  return {
    form,
    issues,
    hints,
    supplierCandidates: supplier.status === "FILLED" ? [] : supplier.candidates,
    supplierSuggestion: suggestion
      ? [suggestion.name, [suggestion.buildingArea, suggestion.floor ? `level ${suggestion.floor}` : ""].filter(Boolean).join(", "), suggestion.pickupLocationDescription].join(" · ")
      : null,
  };
}

export function formHasValues(form: OrderForm): boolean {
  return Object.values(form).some((value) => value.trim() !== "");
}
