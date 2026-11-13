/*
 * AI Assistance Disclosure:
 * Tool: OpenAI Codex (GPT-5), date: 2026-10-10
 * Mode: Code generation.
 * Scope: Generated tests for credit transaction loading, polling, and state isolation.
 * Author review: I reviewed for correctness and edited where needed.
 */

import { act, cleanup, renderHook } from "@testing-library/react"
import { afterEach, beforeEach, expect, it, vi } from "vitest"

import { useCreditTransactions } from "@/hooks/use-credit-transactions"
import { CREDIT_BALANCE_INVALIDATED_EVENT } from "@/lib/credit-balance-events"

const mocks = vi.hoisted(() => ({
  api: vi.fn(), auth: { user: { uid: "a" } as { uid: string } | null, loading: false },
}))
vi.mock("@/hooks/use-api", () => ({ useApi: () => mocks.api }))
vi.mock("@/components/providers/auth-provider", () => ({ useAuth: () => mocks.auth }))

const page = {
  items: [{ transactionId: "one", type: "INITIAL_ALLOCATION", amount: 50,
    direction: "CREDIT", occurredAt: "2026-10-10T08:00:00Z", orderId: null }],
  page: 1, size: 20, totalItems: 1, totalPages: 1,
}

beforeEach(() => {
  vi.useFakeTimers()
  Object.defineProperty(document, "visibilityState", { configurable: true, value: "visible" })
  mocks.auth = { user: { uid: "a" }, loading: false }
  mocks.api.mockReset().mockResolvedValue(page)
})
afterEach(() => { cleanup(); vi.useRealTimers() })

it("polls every five seconds and refreshes immediately after credit mutations", async () => {
  const { result } = renderHook(() => useCreditTransactions(1))
  await act(() => vi.advanceTimersByTimeAsync(0))
  expect(result.current.items).toHaveLength(1)
  expect(mocks.api).toHaveBeenLastCalledWith(
    "/api/credits/me/transactions?page=1&size=20", expect.objectContaining({ signal: expect.any(AbortSignal) }))

  await act(() => vi.advanceTimersByTimeAsync(4_999))
  expect(mocks.api).toHaveBeenCalledTimes(1)
  await act(() => vi.advanceTimersByTimeAsync(1))
  expect(mocks.api).toHaveBeenCalledTimes(2)
  await act(async () => window.dispatchEvent(new Event(CREDIT_BALANCE_INVALIDATED_EVENT)))
  expect(mocks.api).toHaveBeenCalledTimes(3)
})

it("isolates page and account changes while retaining rows on background errors", async () => {
  const { result, rerender } = renderHook(({ pageNumber }) => useCreditTransactions(pageNumber), {
    initialProps: { pageNumber: 1 },
  })
  await act(() => vi.advanceTimersByTimeAsync(0))
  mocks.api.mockRejectedValue(new Error("offline"))
  await act(() => vi.advanceTimersByTimeAsync(5_000))
  expect(result.current.items).toHaveLength(1)
  expect(result.current.error).toBe(true)

  let resolve: (value: typeof page) => void = () => {}
  mocks.api.mockImplementationOnce(() => new Promise((done) => { resolve = done }))
  rerender({ pageNumber: 2 })
  await act(() => vi.advanceTimersByTimeAsync(0))
  const oldSignal = mocks.api.mock.calls.at(-1)?.[1].signal as AbortSignal
  mocks.auth.user = { uid: "b" }
  rerender({ pageNumber: 2 })
  expect(oldSignal.aborted).toBe(true)
  expect(result.current.items).toEqual([])
  await act(async () => resolve(page))
  expect(result.current.items).toEqual([])
})
