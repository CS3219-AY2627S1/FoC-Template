// AI Assistance Disclosure:
// Tool: ChatGPT (Codex, model: gpt-6-astra), date: 2026-10-09
// Scope: Implemented Order draft persistence, input and retry tests.
// Author review: I validated correctness and added boundary checks where needed.

import { afterEach, describe, expect, it } from "vitest";
import { attemptStorageKey, formFromInput, readAttempt, saveAttempt, validateOrderForm, type OrderForm } from "../../src/api/order-draft";

const form: OrderForm = { supplierId: "supplier", itemDescription: " Sandwich ", deliveryLocation: " COM3 ", reward: "10", acceptanceDeadline: "2030-01-01T12:00", deliveryDeadline: "2030-01-01T13:00" };
const now = Date.parse("2029-01-01T00:00:00Z");

describe("Order form and recovery", () => {
  afterEach(() => sessionStorage.clear());
  it("converts explicitly Singapore times independent of the device timezone", () => {
    const result = validateOrderForm(form, now);
    expect(result.errors).toEqual({});
    expect(result.input).toMatchObject({ acceptanceDeadline: "2030-01-01T04:00:00.000Z", deliveryDeadline: "2030-01-01T05:00:00.000Z", reward: 10, itemDescription: "Sandwich", deliveryLocation: "COM3" });
    expect(formFromInput(result.input!).acceptanceDeadline).toBe(form.acceptanceDeadline);
  });
  it.each(["0", "-1", "1.5", "1e3", "2147483648", "", "Infinity"])("rejects invalid credit reward %s", (reward) => {
    expect(validateOrderForm({ ...form, reward }, now).errors.reward).toBeTruthy();
  });
  it("validates required fields, maximum lengths and deadline equality", () => {
    const result = validateOrderForm({ ...form, supplierId: "", itemDescription: " ", deliveryLocation: "x".repeat(301), deliveryDeadline: form.acceptanceDeadline }, Date.parse("2030-01-01T04:00:00Z"));
    expect(Object.keys(result.errors).sort()).toEqual(["acceptanceDeadline", "deliveryDeadline", "deliveryLocation", "itemDescription", "supplierId"]);
  });
  it("rejects calendar dates silently normalized by JavaScript", () => {
    expect(validateOrderForm({ ...form, acceptanceDeadline: "2030-02-30T12:00" }, now).errors.acceptanceDeadline).toBeTruthy();
  });
  it("saves a per-account request without tokens and recovers the original key/body", () => {
    const input = validateOrderForm(form, now).input!;
    saveAttempt("one", { key: "stable-key", input });
    expect(readAttempt("one")).toEqual({ key: "stable-key", input, closed: false });
    expect(readAttempt("two")).toBeNull();
    expect(Object.keys(JSON.parse(sessionStorage.getItem(attemptStorageKey("one"))!)).sort()).toEqual(["input", "key"]);
    saveAttempt("one", null);
    expect(readAttempt("one")).toBeNull();
  });
  it("does not silently discard a corrupted saved request and generate a duplicate", () => {
    sessionStorage.setItem(attemptStorageKey("one"), "broken json");
    expect(() => readAttempt("one")).toThrow();
    expect(sessionStorage.getItem(attemptStorageKey("one"))).toBe("broken json");
  });
});
