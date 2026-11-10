// AI Assistance Disclosure:
// Tool: ChatGPT (Codex, model: gpt-6-astra), date: 2026-10-09
// Scope: Implemented saved Order draft/retry handling and date/input conversion.
// Author review: I validated correctness and added boundary checks where needed.

import type { OrderCreation, OrderInput } from "./order-service";

export type OrderForm = { supplierId: string; itemDescription: string; deliveryLocation: string; reward: string; acceptanceDeadline: string; deliveryDeadline: string };
export type CreationAttempt = { key: string; input: OrderInput; operation?: OrderCreation; closed?: boolean };
export const emptyOrderForm: OrderForm = { supplierId: "", itemDescription: "", deliveryLocation: "", reward: "", acceptanceDeadline: "", deliveryDeadline: "" };

// datetime-local fields are explicitly labelled SGT, independent of the device timezone.
function singaporeTime(value: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) return null;
  const date = new Date(`${value}:00+08:00`);
  if (Number.isNaN(date.getTime())) return null;
  const roundTrip = new Date(date.getTime() + 8 * 60 * 60 * 1000).toISOString().slice(0, 16);
  return roundTrip === value ? date.toISOString() : null;
}

export function validateOrderForm(form: OrderForm, now = Date.now()): { input?: OrderInput; errors: Partial<Record<keyof OrderForm, string>> } {
  const errors: Partial<Record<keyof OrderForm, string>> = {};
  const description = form.itemDescription.trim();
  const location = form.deliveryLocation.trim();
  const reward = Number(form.reward);
  const acceptance = singaporeTime(form.acceptanceDeadline);
  const delivery = singaporeTime(form.deliveryDeadline);
  if (!form.supplierId) errors.supplierId = "Select an active supplier.";
  if (!description || description.length > 1000) errors.itemDescription = "Enter instructions between 1 and 1,000 characters.";
  if (!location || location.length > 300) errors.deliveryLocation = "Enter a delivery location between 1 and 300 characters.";
  if (!/^\d+$/.test(form.reward) || !Number.isSafeInteger(reward) || reward < 1 || reward > 2_147_483_647) errors.reward = "Enter a whole-number reward from 1 to 2,147,483,647.";
  if (!acceptance || Date.parse(acceptance) <= now) errors.acceptanceDeadline = "Choose a future acceptance time in Singapore time.";
  if (!delivery || (acceptance && Date.parse(delivery) <= Date.parse(acceptance))) errors.deliveryDeadline = "Delivery must be later than acceptance.";
  if (Object.keys(errors).length || !acceptance || !delivery) return { errors };
  return { errors, input: { supplierId: form.supplierId, itemDescription: description, deliveryLocation: location, reward, acceptanceDeadline: acceptance, deliveryDeadline: delivery } };
}

export function formFromInput(input: OrderInput): OrderForm {
  const sgt = (value: string) => new Date(Date.parse(value) + 8 * 60 * 60 * 1000).toISOString().slice(0, 16);
  return { ...input, reward: String(input.reward), acceptanceDeadline: sgt(input.acceptanceDeadline), deliveryDeadline: sgt(input.deliveryDeadline) };
}

export function attemptStorageKey(userId: string): string { return `foc.order-creation.v1.${userId}`; }

export function readAttempt(userId: string): CreationAttempt | null {
  const raw = sessionStorage.getItem(attemptStorageKey(userId));
  if (!raw) return null;
  const value = JSON.parse(raw) as CreationAttempt;
  if (!value || typeof value.key !== "string" || !/^[A-Za-z0-9._:-]{1,128}$/.test(value.key) || !value.input) throw new Error("Invalid saved attempt");
  // Validate saved data without imposing a future deadline: recovery must still
  // work after the original deadline. Never store a bearer token in this record.
  const form = formFromInput(value.input);
  if (Object.keys(validateOrderForm(form, -Infinity).errors).length) throw new Error("Invalid saved attempt");
  return { key: value.key, input: value.input, closed: value.closed === true };
}

export function saveAttempt(userId: string, attempt: CreationAttempt | null) {
  if (attempt) sessionStorage.setItem(attemptStorageKey(userId), JSON.stringify({ key: attempt.key, input: attempt.input, closed: attempt.closed }));
  else sessionStorage.removeItem(attemptStorageKey(userId));
}
