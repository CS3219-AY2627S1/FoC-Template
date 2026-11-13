export const CREDIT_BALANCE_INVALIDATED_EVENT = "foc:credit-balance-invalidated"

/** Notify the shared credit summary that a successful mutation changed its read model. */
export function invalidateCreditBalance() {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event(CREDIT_BALANCE_INVALIDATED_EVENT))
  }
}
