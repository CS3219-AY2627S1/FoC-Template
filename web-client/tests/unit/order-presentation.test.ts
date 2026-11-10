// AI Assistance Disclosure:
// Tool: ChatGPT (Codex, model: gpt-6.1-sol), date: 2026-10-11
// Scope: Implemented tests for Order status and deadline display helpers.
// Author review: I validated correctness and added boundary checks where needed.

import { describe, expect, it } from "vitest";
import { ApiRequestError } from "../../src/api/client";
import { orderError } from "../../src/app/order-presentation";

describe("errand error presentation", () => {
  it("keeps authentication diagnostics out of Order screens without changing the error", () => {
    const error = new ApiRequestError(401, "Refresh token reuse detected.", { code: "REFRESH_TOKEN_REUSED", correlationId: "support-reference" });
    expect(orderError(error)).toBe("Please sign in again to continue.");
    expect(error).toMatchObject({ message: "Refresh token reuse detected.", code: "REFRESH_TOKEN_REUSED", correlationId: "support-reference" });
    expect(orderError(new ApiRequestError(503, "Database connection failed."))).toBe("We could not complete your request. Please try again.");
  });

  it("preserves actionable account and connection errors in Order screens", () => {
    expect(orderError(new ApiRequestError(401, "Invalid email or password.", { code: "INVALID_CREDENTIALS" }))).toBe("Invalid email or password.");
    expect(orderError(new ApiRequestError(0, "Check your connection and try again.", { code: "NETWORK_ERROR" }))).toBe("Check your connection and try again.");
  });

  it("explains changed errands without exposing internal state names or references", () => {
    const error = new ApiRequestError(409, "Failure requires ACCEPTED or PICKED_UP state.", { code: "INVALID_TRANSITION", correlationId: "internal-reference" });
    expect(orderError(error)).toBe("This errand has changed. Refresh to see what you can do next.");
    expect(error.message).toContain("PICKED_UP");
    expect(error.correlationId).toBe("internal-reference");
  });

  it("distinguishes a supplier no longer available from a temporary outage", () => {
    expect(orderError(new ApiRequestError(409, "Select an active supplier.", { code: "SUPPLIER_UNAVAILABLE" }))).toContain("Choose another supplier");
    expect(orderError(new ApiRequestError(503, "Upstream service unavailable.", { code: "SUPPLIER_UNAVAILABLE" }))).toContain("Please try again");
  });

  it("keeps uncertain creation recoverable without explaining retry keys", () => {
    expect(orderError(new ApiRequestError(503, "Credit contract is not configured; reuse the idempotency key.", { code: "CREDIT_UNAVAILABLE" }))).toBe("We could not check your credits. Try again here to check your request.");
    expect(orderError(new ApiRequestError(409, "Wallet balance too low.", { code: "INSUFFICIENT_CREDIT" }))).toBe("You do not have enough credits for this reward.");
  });
});
