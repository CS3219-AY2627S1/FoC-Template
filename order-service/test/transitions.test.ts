/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (Claude Opus 5.5), date: 2026-10-16
 * Scope: Tests for the errand transition table, written before the implementation per the approved plan.
 * Author review: Reviewed and approved by @mattis.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { TRANSITIONS } from "../src/domain/transitions";
import { TERMINAL_STATES } from "../src/domain/states";

const rules = Object.entries(TRANSITIONS);

test("every rule targets a state not in its from list", () => {
  for (const [action, r] of rules) {
    assert.ok(!r.from.includes(r.to), `${action} targets its own source state`);
  }
});

test("only rules that enter a terminal state other than RESERVATION_REJECTED have a closingMessage", () => {
  for (const [action, r] of rules) {
    assert.equal(
      TERMINAL_STATES.has(r.to) && r.to !== "RESERVATION_REJECTED",
      r.closingMessage !== undefined,
      action,
    );
  }
});

test("only reservationTimeout leaves PENDING_RESERVATION", () => {
  for (const [action, r] of rules) {
    assert.equal(r.from.includes("PENDING_RESERVATION"), action === "reservationTimeout", action);
  }
});

test("no rule starts from a terminal state", () => {
  for (const [action, r] of rules) {
    for (const s of r.from) assert.ok(!TERMINAL_STATES.has(s), `${action} starts from ${s}`);
  }
});
