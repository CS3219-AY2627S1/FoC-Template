// AI Assistance Disclosure:
// Tool: ChatGPT (Codex, model: gpt-6-astra), date: 2026-10-09
// Tool: ChatGPT (Codex, model: gpt-6.1-sol), date: 2026-10-11
// Scope: Implemented participant Order status, deadline and display formatting helpers.
// Author review: I validated correctness and added boundary checks where needed.

import { isApiRequestError } from "../api/client";

const messages: Record<string, string> = {
  AUTH_UNAVAILABLE: "We could not check your account. Please try again.",
  CREDIT_UNAVAILABLE: "We could not check your credits. Try again here to check your request.",
  CREDIT_CONTRACT_ERROR: "We could not check your credits. Try again here to check your request.",
  SUPPLIER_CONTRACT_ERROR: "We could not load this supplier. Please try again.",
  INVALID_TRANSITION: "This errand has changed. Refresh to see what you can do next.",
  ERRAND_DISPUTED: "This errand is on hold while a reported problem is reviewed. Refresh to see the latest update.",
  IDEMPOTENCY_CONFLICT: "This request was already submitted with different details. Check My errands before posting again.",
  INVALID_IDEMPOTENCY_KEY: "We could not prepare your request. Reload this page before posting again.",
  CREATION_ABORTED: "Your errand could not be posted. You can start a new request.",
  INSUFFICIENT_CREDIT: "You do not have enough credits for this reward.",
  WALLET_NOT_READY: "Your wallet is not ready yet. Please try again later.",
  VALIDATION_ERROR: "Check the highlighted fields and try again.",
};

export function orderError(failure: unknown): string {
  if (!isApiRequestError(failure)) return "We could not complete this request. Try again.";
  if (failure.code === "SUPPLIER_UNAVAILABLE") return failure.status === 409 ? "This supplier is no longer available. Choose another supplier." : "We could not load this supplier. Please try again.";
  if (messages[failure.code]) return messages[failure.code];
  if (["INVALID_ACCESS_TOKEN", "INVALID_REFRESH_TOKEN", "REFRESH_TOKEN_REUSED", "UNAUTHENTICATED", "AUTH_REQUIRED"].includes(failure.code)) return "Please sign in again to continue.";
  if (failure.status >= 500 || failure.code === "REQUEST_FAILED") return "We could not complete your request. Please try again.";
  return failure.message;
}

export function orderTime(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Time unavailable" : new Intl.DateTimeFormat("en-SG", {
    timeZone: "Asia/Singapore", day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit",
  }).format(date);
}
