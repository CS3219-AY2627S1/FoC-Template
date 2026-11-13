import { beforeEach, afterEach, expect, it, vi } from "vitest"
import { removeOrderIntent } from "@/lib/order-command-storage"

// Minimal event-driven IndexedDB fixture for the conditional delete transaction,
// not a substitute for browser durability/upgrade verification.
let stored: { key: string } | undefined
const deleted = vi.fn()
beforeEach(() => {
  stored = { key: "new-K" }; deleted.mockClear()
  vi.stubGlobal("indexedDB", { open: () => {
    const request: Record<string, unknown> = { result: { close: vi.fn(), transaction: () => {
      const tx: Record<string, unknown> = { objectStore: () => ({
        get: () => {
          const read: Record<string, unknown> = { result: stored }
          queueMicrotask(() => { (read.onsuccess as (() => void) | undefined)?.(); queueMicrotask(() => (tx.oncomplete as () => void)()) })
          return read
        },
        delete: (key: string) => {
          stored = undefined; deleted(key)
          queueMicrotask(() => (tx.oncomplete as () => void)())
        },
      }) }
      return tx
    } } }
    queueMicrotask(() => (request.onsuccess as () => void)())
    return request
  } })
})
afterEach(() => vi.unstubAllGlobals())
it("does not delete a newer browser intent when an older server command resolves", async () => {
  await removeOrderIntent("owner", "abort:order", "old-K")
  expect(deleted).not.toHaveBeenCalled()
  expect(stored?.key).toBe("new-K")
})
it("deletes the matching key atomically in the same readwrite transaction", async () => {
  await removeOrderIntent("owner", "abort:order", "new-K")
  expect(deleted).toHaveBeenCalledWith(JSON.stringify(["owner", "abort:order"]))
  expect(stored).toBeUndefined()
})
