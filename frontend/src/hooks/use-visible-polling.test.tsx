import { act, cleanup, renderHook } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { useVisiblePolling } from "@/hooks/use-visible-polling"

beforeEach(() => {
  vi.useFakeTimers()
  Object.defineProperty(document, "visibilityState", { configurable: true, value: "visible" })
})
afterEach(() => { cleanup(); vi.useRealTimers() })

describe("visible authenticated polling", () => {
  it("queues one immediate mutation refresh when a read is already in flight", async () => {
    let finish: () => void = () => {}
    const fetch = vi.fn().mockImplementationOnce(() => new Promise<void>((resolve) => { finish = resolve }))
      .mockResolvedValue(undefined)
    const { result } = renderHook(() => useVisiblePolling(fetch, true))
    await act(() => vi.advanceTimersByTimeAsync(0))
    await act(async () => { await result.current(); await result.current() })
    expect(fetch).toHaveBeenCalledTimes(1)
    await act(async () => finish())
    expect(fetch).toHaveBeenCalledTimes(2)
  })

  it("waits until enabled, then refreshes immediately and every 15 seconds", async () => {
    const fetch = vi.fn().mockResolvedValue(undefined)
    const { rerender } = renderHook(({ enabled }) => useVisiblePolling(fetch, enabled), { initialProps: { enabled: false } })
    await act(() => vi.advanceTimersByTimeAsync(30_000))
    expect(fetch).not.toHaveBeenCalled()
    rerender({ enabled: true })
    await act(() => vi.advanceTimersByTimeAsync(0))
    expect(fetch).toHaveBeenCalledTimes(1)
    await act(() => vi.advanceTimersByTimeAsync(15_000))
    expect(fetch).toHaveBeenCalledTimes(2)
  })

  it("pauses hidden tabs and refreshes on visibility or focus without overlapping", async () => {
    let finish: (() => void) | undefined
    const fetch = vi.fn().mockImplementation(() => new Promise<void>((resolve) => { finish = resolve }))
    const { unmount } = renderHook(() => useVisiblePolling(fetch, true))
    await act(() => vi.advanceTimersByTimeAsync(0))
    await act(() => vi.advanceTimersByTimeAsync(30_000))
    act(() => window.dispatchEvent(new Event("focus")))
    expect(fetch).toHaveBeenCalledTimes(1)
    await act(async () => finish?.())
    Object.defineProperty(document, "visibilityState", { configurable: true, value: "hidden" })
    await act(() => vi.advanceTimersByTimeAsync(30_000))
    expect(fetch).toHaveBeenCalledTimes(1)
    Object.defineProperty(document, "visibilityState", { configurable: true, value: "visible" })
    act(() => document.dispatchEvent(new Event("visibilitychange")))
    expect(fetch).toHaveBeenCalledTimes(2)
    unmount()
    expect(fetch.mock.calls[1][0].aborted).toBe(true)
    await act(() => vi.advanceTimersByTimeAsync(30_000))
    expect(fetch).toHaveBeenCalledTimes(2)
  })

  it("cancels the old session on disable and recovers after a failed request", async () => {
    const fetch = vi.fn().mockRejectedValue(new Error("offline"))
    const { rerender } = renderHook(({ enabled }) => useVisiblePolling(fetch, enabled), { initialProps: { enabled: true } })
    await act(() => vi.advanceTimersByTimeAsync(0))
    await act(() => vi.advanceTimersByTimeAsync(15_000))
    expect(fetch).toHaveBeenCalledTimes(2)
    rerender({ enabled: false })
    await act(() => vi.advanceTimersByTimeAsync(30_000))
    expect(fetch).toHaveBeenCalledTimes(2)
  })
})
