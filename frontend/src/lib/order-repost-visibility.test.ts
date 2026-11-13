import { describe, expect, it } from "vitest"
import { type Order, updateRequesterOrderList } from "@/lib/orders"

describe("requester repost visibility", () => {
  const old = { id: "old", status: "EXPIRED", originalOrderId: null } as Order
  const next = { id: "new", status: "OPEN", originalOrderId: "old" } as Order

  it("replaces the expired original immediately after a successful repost", () => {
    expect(updateRequesterOrderList([old], next)).toEqual([next])
  })

  it("keeps unrelated expired requests and deduplicates repeated successful responses", () => {
    const other = { ...old, id: "other" }
    expect(updateRequesterOrderList([old, other, next], next)).toEqual([next, other])
  })

  it("updates a normal lifecycle response without adding a duplicate", () => {
    const cancelled = { ...old, status: "CANCELLED" } as Order
    expect(updateRequesterOrderList([old], cancelled)).toEqual([cancelled])
  })
})
