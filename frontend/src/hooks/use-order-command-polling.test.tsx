import { act, cleanup, renderHook } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { useOrderCommand } from "@/hooks/use-order-command"
import { ApiError } from "@/lib/api"
import type { OrderCommandIntent, OrderCommandStatus } from "@/lib/order-commands"

const m = vi.hoisted(() => ({ api: vi.fn(), read: vi.fn(), write: vi.fn(), remove: vi.fn() }))
vi.mock("@/hooks/use-api", () => ({ useApi: () => m.api }))
vi.mock("@/components/providers/auth-provider", () => ({ useAuth: () => ({ user: { uid: "owner" }, loading: false }) }))
vi.mock("@/lib/order-command-storage", () => ({ readOrderIntent: m.read, writeOrderIntent: m.write, removeOrderIntent: m.remove }))

// Deliberately use the REAL useVisiblePolling: mocked polling missed this race.
function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason: unknown) => void
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no })
  return { promise, resolve, reject }
}

const pending: OrderCommandStatus = { commandId: "K", status: "PENDING", reason: "PROCESSING" }
const statusPath = "/api/orders/commands/K?userId=owner"
const reads = () => m.api.mock.calls.filter(([path]) => path === statusPath)
const posts = () => m.api.mock.calls.filter(([, options]) => options?.method === "POST")

beforeEach(() => {
  vi.useFakeTimers()
  vi.clearAllMocks()
  Object.defineProperty(document, "visibilityState", { configurable: true, value: "visible" })
  m.read.mockResolvedValue(null)
  m.write.mockImplementation(async (_account, _scope, intent) => intent)
  m.remove.mockResolvedValue(undefined)
  m.api.mockImplementation(async (path: string) => path.endsWith("capabilities") ? { enabled: true } : pending)
})
afterEach(() => { cleanup(); vi.useRealTimers() })

async function mount(scope = "create", success = vi.fn(), rejected = vi.fn()) {
  const hook = renderHook(() => useOrderCommand(scope, success, rejected))
  await act(async () => {})
  expect(hook.result.current.ready).toBe(true)
  return hook
}

describe("command submission ordering with actual visible polling", () => {
  it.each([
    ["CREATE", "create", "/api/orders"],
    ["ACCEPT", "accept:order-a", "/api/orders/order-a/accept"],
    ["ABORT", "abort:order-a", "/api/orders/order-a/cancel-accepted"],
    ["REPOST", "repost:order-a", "/api/orders/order-a/repost"],
  ] as const)("pauses polling throughout a delayed %s POST, then polls pending with the same key", async (kind, scope, path) => {
    const hook = await mount(scope)
    const response = deferred<OrderCommandStatus>()
    m.api.mockImplementation((url: string, options) => options?.method === "POST" ? response.promise : Promise.resolve(pending))
    let submission!: Promise<void>
    await act(async () => { submission = hook.result.current.run(kind, path, { commandId: "K", actorId: "owner" }) })
    expect(hook.result.current.pending).toBe(true)
    await act(() => vi.advanceTimersByTimeAsync(15_000))
    await act(async () => { window.dispatchEvent(new Event("focus")) })
    expect(reads()).toHaveLength(0)
    await act(async () => { await hook.result.current.run(kind, path, { commandId: "new-key" }) })
    expect(posts()).toHaveLength(1)
    expect(m.remove).not.toHaveBeenCalled()
    await act(async () => { response.resolve(pending); await submission })
    await act(() => vi.advanceTimersByTimeAsync(0))
    expect(reads()).toHaveLength(1)
    await act(() => vi.advanceTimersByTimeAsync(5_000))
    expect(reads()).toHaveLength(2)
    expect(posts()).toHaveLength(1)
    m.api.mockResolvedValue({ commandId: "K", status: "COMPLETED", outcome: "SUCCESS", result: { id: "new-order", status: "OPEN" } })
    await act(() => vi.advanceTimersByTimeAsync(5_000))
    expect(hook.result.current.pending).toBe(false)
    expect(m.remove).toHaveBeenCalledWith("owner", scope)
    await act(() => vi.advanceTimersByTimeAsync(15_000))
    expect(reads()).toHaveLength(3)
  })

  it.each(["SUCCESS", "REJECTED"] as const)("does not start a status GET after initial terminal %s", async (outcome) => {
    const success = vi.fn(), rejected = vi.fn()
    const hook = await mount("create", success, rejected)
    const response = deferred<OrderCommandStatus>()
    m.api.mockReturnValue(response.promise)
    let submission!: Promise<void>
    await act(async () => { submission = hook.result.current.run("CREATE", "/api/orders", { commandId: "K" }) })
    await act(() => vi.advanceTimersByTimeAsync(5_000))
    expect(reads()).toHaveLength(0)
    await act(async () => {
      response.resolve({ commandId: "K", status: "COMPLETED", outcome,
        ...(outcome === "SUCCESS" ? { result: { id: "new-order", status: "OPEN" } as OrderCommandStatus["result"] } : { message: "Insufficient credits." }) })
      await submission
    })
    await act(() => vi.advanceTimersByTimeAsync(15_000))
    expect(reads()).toHaveLength(0)
    expect(hook.result.current.pending).toBe(false)
    expect(m.remove).toHaveBeenCalledWith("owner", "create")
    expect(outcome === "SUCCESS" ? success : rejected).toHaveBeenCalledTimes(1)
  })

  it("retains frozen input after timeout and recovers a genuinely missing key without a fresh ID", async () => {
    const hook = await mount()
    const response = deferred<OrderCommandStatus>()
    m.api.mockImplementation((_path: string, options) => options?.method === "POST" ? response.promise
      : Promise.reject(new ApiError(404, "NOT_FOUND", "Command not found.")))
    let submission!: Promise<void>
    const input = { commandId: "K", itemDescription: "Frozen details" }
    await act(async () => { submission = hook.result.current.run("CREATE", "/api/orders", input) })
    await act(() => vi.advanceTimersByTimeAsync(5_000))
    expect(reads()).toHaveLength(0)
    input.itemDescription = "New edits"
    await act(async () => { response.reject(new ApiError(0, "NETWORK_ERROR", "timeout")); await submission })
    expect(hook.result.current.pending).toBe(true)
    expect(m.remove).not.toHaveBeenCalled()
    m.api.mockImplementation((path: string) => path === statusPath
      ? Promise.reject(new ApiError(404, "NOT_FOUND", "Command not found.")) : Promise.resolve(pending))
    await act(() => vi.advanceTimersByTimeAsync(0))
    expect(reads()).toHaveLength(1)
    expect(posts()).toHaveLength(2)
    expect(posts()[1]).toEqual(["/api/orders/commands/create", {
      method: "POST", body: { commandId: "K", itemDescription: "Frozen details" },
    }])
  })

  it("pauses individual status polling while Continue is in flight and resumes it afterward", async () => {
    const saved: OrderCommandIntent = { key: "K", kind: "ACCEPT", path: "/api/orders/commands/order-a/accept", body: { commandId: "K" } }
    m.read.mockResolvedValue(saved)
    m.api.mockImplementation(async (path: string) => path.endsWith("capabilities") ? { enabled: true }
      : { ...pending, reason: "AUTHORIZATION_REQUIRED" })
    const hook = await mount("accept:order-a")
    await act(() => vi.advanceTimersByTimeAsync(0))
    expect(hook.result.current.needsAuthorization).toBe(true)
    const previousReads = reads().length
    const response = deferred<OrderCommandStatus>()
    m.api.mockImplementation((_path: string, options) => options?.method === "POST" ? response.promise : Promise.resolve(pending))
    let resume!: Promise<void>
    await act(async () => { resume = hook.result.current.continueRecovery() })
    await act(() => vi.advanceTimersByTimeAsync(15_000))
    expect(reads()).toHaveLength(previousReads)
    expect(posts()).toHaveLength(1)
    expect(posts()[0]).toEqual(["/api/orders/commands/K/resume?userId=owner", { method: "POST" }])
    await act(async () => { response.resolve(pending); await resume })
    await act(() => vi.advanceTimersByTimeAsync(0))
    expect(reads()).toHaveLength(previousReads + 1)
    expect(hook.result.current.pending).toBe(true)
    expect(hook.result.current.needsAuthorization).toBe(false)
  })
})
