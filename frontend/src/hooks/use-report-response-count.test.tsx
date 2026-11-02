/* AI assistance: OpenAI Codex, 2026-10-30. Report credit context and response reminders; human review pending. */
import { act, cleanup, renderHook } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { useReportResponseCount } from "./use-report-response-count"

const mocks = vi.hoisted(() => ({ api: vi.fn(), uid: "courier", loading: false }))
vi.mock("@/hooks/use-api", () => ({ useApi: () => mocks.api }))
vi.mock("@/components/providers/auth-provider", () => ({ useAuth: () => ({
  user: mocks.uid ? { uid: mocks.uid } : null, loading: mocks.loading,
}) }))

beforeEach(() => {
  vi.useFakeTimers()
  mocks.uid = "courier"; mocks.loading = false; mocks.api.mockReset()
})
afterEach(() => { cleanup(); vi.useRealTimers() })

describe("report response reminder", () => {
  it("polls every five seconds and clears the badge when no response remains", async () => {
    mocks.api.mockResolvedValueOnce({ count: 3 }).mockResolvedValue({ count: 0 })
    const view = renderHook(() => useReportResponseCount())
    await act(async () => { await vi.advanceTimersByTimeAsync(0) })
    expect(view.result.current).toBe(3)
    expect(mocks.api).toHaveBeenCalledWith("/api/reports/mine/response-count", expect.objectContaining({ signal: expect.any(AbortSignal) }))
    await act(async () => { await vi.advanceTimersByTimeAsync(5_000) })
    expect(view.result.current).toBe(0)
  })
  it("keeps a confirmed count on failure but never carries it to another user", async () => {
    mocks.api.mockResolvedValueOnce({ count: 2 }).mockRejectedValue(new Error("Temporary failure"))
    const view = renderHook(() => useReportResponseCount())
    await act(async () => { await vi.advanceTimersByTimeAsync(0) })
    await act(async () => { await vi.advanceTimersByTimeAsync(5_000) })
    expect(view.result.current).toBe(2)
    mocks.uid = "different-user"; view.rerender()
    expect(view.result.current).toBe(0)
    mocks.uid = ""; view.rerender()
    expect(view.result.current).toBe(0)
  })
  it("does not poll while disabled or auth is loading and ignores invalid counts", async () => {
    mocks.loading = true; mocks.api.mockResolvedValue({ count: -1 })
    const view = renderHook(({ enabled }) => useReportResponseCount(enabled), { initialProps: { enabled: false } })
    await act(async () => { await vi.advanceTimersByTimeAsync(10_000) })
    expect(mocks.api).not.toHaveBeenCalled()
    mocks.loading = false; view.rerender({ enabled: true })
    await act(async () => { await vi.advanceTimersByTimeAsync(0) })
    expect(view.result.current).toBe(0)
  })
})
