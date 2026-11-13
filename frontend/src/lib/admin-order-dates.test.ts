import { describe, expect, it } from "vitest"
import { adminOrderDateBounds } from "./admin-order-dates"

describe("Admin calendar date boundaries", () => {
  it("includes the selected end day using the next local midnight as an exclusive bound", () => {
    const bounds = adminOrderDateBounds("2026-10-16", "2026-10-17")
    const from = new Date(bounds.createdFrom!)
    const before = new Date(bounds.createdBefore!)
    expect([from.getFullYear(), from.getMonth(), from.getDate(), from.getHours()]).toEqual([2026, 9, 16, 0])
    expect([before.getFullYear(), before.getMonth(), before.getDate(), before.getHours()]).toEqual([2026, 9, 18, 0])
    expect(bounds.createdFrom).toMatch(/Z$/)
    expect(bounds.createdBefore).toMatch(/Z$/)
  })
  it("supports empty and one-sided ranges", () => {
    expect(adminOrderDateBounds()).toEqual({ createdFrom: undefined, createdBefore: undefined })
    expect(adminOrderDateBounds("2026-10-16").createdBefore).toBeUndefined()
    expect(adminOrderDateBounds(undefined, "2026-10-16").createdFrom).toBeUndefined()
    expect(adminOrderDateBounds("2026-10-16", "2026-10-16").createdBefore).toBeDefined()
  })
  it("rejects inverted ranges and invalid or normalized-overflow calendar days", () => {
    expect(() => adminOrderDateBounds("2026-10-17", "2026-10-16")).toThrow("end date")
    for (const day of ["nonsense", "2026-02-30", "2026-10-16T00:00:00Z"]) {
      expect(() => adminOrderDateBounds(day)).toThrow("valid calendar date")
    }
  })
})
