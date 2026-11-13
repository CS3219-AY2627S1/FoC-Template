import { describe, expect, it, vi } from "vitest"

import { CREDIT_BALANCE_INVALIDATED_EVENT, invalidateCreditBalance } from "@/lib/credit-balance-events"

describe("credit balance invalidation", () => {
  it("dispatches a browser event for shared balance consumers", () => {
    const listener = vi.fn()
    window.addEventListener(CREDIT_BALANCE_INVALIDATED_EVENT, listener)

    invalidateCreditBalance()

    expect(listener).toHaveBeenCalledOnce()
    window.removeEventListener(CREDIT_BALANCE_INVALIDATED_EVENT, listener)
  })
})
