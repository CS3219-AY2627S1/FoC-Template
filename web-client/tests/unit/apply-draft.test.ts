/*
 * AI Assistance Disclosure (hwangjihun):
 * Tool: Claude Code (model: Claude Opus 5.5), date: 2026-10-30
 * Scope: Generated and refined Voice Assist client, form or recording regression checks.
 * Author review: I validated correctness, and added boundary checks.
 */

import { describe, expect, it } from "vitest";
import { applyDraft, formHasValues } from "../../src/voice/apply-draft";
import { emptyOrderForm } from "../../src/api/order-draft";
import { draftFields, TOMORO } from "../voice-fakes";

describe("applyDraft (N3F2.1.2, N3F3.1.1, N3F3.1.2)", () => {
  it("fills what was said and highlights the rest", () => {
    const applied = applyDraft(draftFields());
    expect(applied.form).toEqual({
      supplierId: TOMORO,
      itemDescription: "an iced latte",
      deliveryLocation: "COM3 level 1",
      reward: "5",
      acceptanceDeadline: "",
      deliveryDeadline: "2026-10-30T15:00",
    });
    expect(applied.issues).toEqual({ acceptanceDeadline: "Enter the latest acceptance time. A delivery time is not used for it." });
    expect(applied.hints.reward).toBe("Taken as 5 credits.");
    expect(applied.supplierSuggestion).toBe("TOMORO COFFEE · Hon Sui Sen Memorial Library, level 2 · Main counter");
  });

  it("leaves an unconfirmed supplier unselected with its candidates", () => {
    const candidates = [{ id: "a", name: "Starbucks", buildingArea: "COM3", floor: "1" }];
    const applied = applyDraft(draftFields({
      supplier: { value: null, status: "AMBIGUOUS", note: "More than one supplier matches.", suggestion: null, candidates },
    }));
    expect(applied.form.supplierId).toBe("");
    expect(applied.issues.supplierId).toBe("More than one supplier matches.");
    expect(applied.supplierCandidates).toEqual(candidates);
    expect(applied.supplierSuggestion).toBeNull();
  });

  it("keeps a conflicting value visible for correction", () => {
    const long = "x".repeat(1200);
    const applied = applyDraft(draftFields({ itemDescription: { value: long, status: "CONFLICT", note: "Shorten the instructions." } }));
    expect(applied.form.itemDescription).toBe(long);
    expect(applied.issues.itemDescription).toBe("Shorten the instructions.");
  });

  it("knows when the form has values to protect", () => {
    expect(formHasValues(emptyOrderForm)).toBe(false);
    expect(formHasValues({ ...emptyOrderForm, reward: "3" })).toBe(true);
  });
});
