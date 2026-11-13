import { describe, expect, it } from "vitest"

import { supplierLookupPath, supplierLookupPayload, supplierOptionLabel } from "@/lib/suppliers"

describe("supplier selection helpers", () => {
  it("shows the supplier name and building while keeping the API value separate", () => {
    expect(supplierOptionLabel({ name: "Campus Store", building: "UTown" })).toBe("Campus Store — UTown")
  })

  it("does not add an empty location to a supplier label", () => {
    expect(supplierOptionLabel({ name: "Campus Store", building: "" })).toBe("Campus Store")
  })

  it("builds the Supplier Service lookup endpoint", () => {
    expect(supplierLookupPath()).toBe("/api/suppliers/lookup")
    expect(supplierLookupPayload(["store-a", "hall-b", "store-a", ""])).toEqual({ ids: ["store-a", "hall-b"] })
  })
})
