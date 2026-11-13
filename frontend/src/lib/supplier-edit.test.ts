import { describe, expect, it } from "vitest"

import { changedFields, type SupplierInput } from "@/lib/suppliers"

const original: SupplierInput = {
  name: "Cool Spot",
  type: "Food",
  building: "COM2",
  floor: "1",
  locationDescription: "Opposite LT16",
  latitude: 1.294,
  longitude: 103.7738,
  openingTime: "09:00",
  closingTime: "21:30",
  imageUrl: "",
}

describe("supplier edits", () => {
  it("sends only the fields that changed", () => {
    expect(changedFields(original, { ...original, closingTime: "22:00", floor: "" })).toEqual({
      closingTime: "22:00",
      floor: "",
    })
  })

  it("sends nothing when nothing changed", () => {
    expect(changedFields(original, { ...original })).toEqual({})
  })

  it("treats a moved location as a change", () => {
    expect(changedFields(original, { ...original, latitude: 1.3 })).toEqual({ latitude: 1.3 })
  })
})
