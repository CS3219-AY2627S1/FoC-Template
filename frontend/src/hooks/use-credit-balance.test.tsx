import { act, cleanup, renderHook } from "@testing-library/react"
import { afterEach, beforeEach, expect, it, vi } from "vitest"
import { useCreditBalance } from "@/hooks/use-credit-balance"
import { CREDIT_BALANCE_INVALIDATED_EVENT } from "@/lib/credit-balance-events"

const mocks = vi.hoisted(() => ({
  api: vi.fn(), auth: { user: { uid: "a" } as { uid: string } | null, loading: false },
}))
vi.mock("@/hooks/use-api", () => ({ useApi: () => mocks.api }))
vi.mock("@/components/providers/auth-provider", () => ({ useAuth: () => mocks.auth }))
beforeEach(() => {
  vi.useFakeTimers()
  Object.defineProperty(document, "visibilityState", { configurable: true, value: "visible" })
  mocks.auth = { user: { uid: "a" }, loading: true }
  mocks.api.mockReset().mockResolvedValue({ userId: "a", usableBalance: 50 })
})
afterEach(() => { cleanup(); vi.useRealTimers() })

it("waits for auth, polls balances, and immediately refreshes after mutations", async () => {
  const { result, rerender } = renderHook(() => useCreditBalance())
  await act(() => vi.advanceTimersByTimeAsync(5_000))
  expect(mocks.api).not.toHaveBeenCalled()
  mocks.auth.loading = false
  rerender()
  await act(() => vi.advanceTimersByTimeAsync(0))
  expect(result.current.balance?.usableBalance).toBe(50)
  mocks.api.mockResolvedValue({ userId: "a", usableBalance: 49 })
  await act(async () => window.dispatchEvent(new Event(CREDIT_BALANCE_INVALIDATED_EVENT)))
  expect(result.current.balance?.usableBalance).toBe(49)
  await act(() => vi.advanceTimersByTimeAsync(5_000))
  expect(mocks.api).toHaveBeenCalledTimes(3)
})

it("clears old ownership on logout and never applies an aborted account response", async () => {
  mocks.auth.loading = false
  let resolve: (value: unknown) => void = () => {}
  mocks.api.mockImplementationOnce(() => new Promise((done) => { resolve = done }))
  const { result, rerender } = renderHook(() => useCreditBalance())
  await act(() => vi.advanceTimersByTimeAsync(0))
  const signal = mocks.api.mock.calls[0][1].signal
  mocks.auth.user = null
  rerender()
  expect(signal.aborted).toBe(true)
  await act(async () => resolve({ userId: "a", usableBalance: 50 }))
  expect(result.current.balance).toBeNull()
  expect(result.current.error).toBe(false)
  await act(() => vi.advanceTimersByTimeAsync(30_000))
  expect(mocks.api).toHaveBeenCalledTimes(1)
})
