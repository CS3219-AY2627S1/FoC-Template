import { describe, expect, it } from "vitest"

import { buildCreateOrderPayload, buildOrderActionPayload, isQuarterHourDateTime, minOrderExpiryDateTimeLocal, quarterHourDateTimeLocal, orderMinePath, type CreateOrderForm, type Order, updateCourierOrderList, validateCreateOrderForm } from "@/lib/orders"

describe("Order Service frontend contract helpers", () => {
  it("builds a requester create payload with an automatic repost plan", () => {
    const form: CreateOrderForm = {
      itemDescription: "Pick up a parcel",
      pickupSupplierId: "store-a",
      deliverySupplierId: "hall-b",
      offeredCredits: 12,
      deliveryTimeLimitMinutes: 30,
      expiresAt: "2026-10-01T10:00:00.000Z",
      automaticRepost: true,
      repostDueAt: "2026-10-01T11:00:00.000Z",
      repostExpiresAt: "2026-10-01T12:00:00.000Z",
      repostCreditAmount: 14,
      repostDeliveryDurationMinutes: 35,
    }

    expect(buildCreateOrderPayload(form, "uid-1")).toEqual({
      commandId: expect.any(String),
      requesterId: "uid-1",
      itemDescription: "Pick up a parcel",
      pickupSupplierId: "store-a",
      deliverySupplierId: "hall-b",
      offeredCredits: 12,
      deliveryTimeLimitMinutes: 30,
      expiresAt: "2026-10-01T10:00:00.000Z",
      automaticRepost: true,
      repostDueAt: "2026-10-01T11:00:00.000Z",
      repostExpiresAt: "2026-10-01T12:00:00.000Z",
      repostCreditAmount: 14,
      repostDeliveryDurationMinutes: 35,
    })
  })

  it("creates an authenticated mine query for each approved mode", () => {
    expect(orderMinePath("requester", "uid-1")).toBe("/api/orders/mine?mode=requester&userId=uid-1&page=1&size=20")
    expect(orderMinePath("courier", "uid-2", 1)).toBe("/api/orders/mine?mode=courier&userId=uid-2&page=1&size=20")
  })

  it("uses the current order version and Firebase UID for actions", () => {
    expect(buildOrderActionPayload("uid-2", 4)).toEqual({
      commandId: expect.any(String),
      actorId: "uid-2",
      expectedVersion: 4,
    })
  })

  it("removes an aborted errand from the courier's assigned list", () => {
    const assignedOrder = { id: "order-1", status: "ACCEPTED" } as Order
    const abortedOrder = { id: "order-1", status: "ABORTED" } as Order

    expect(updateCourierOrderList([assignedOrder], abortedOrder)).toEqual([])
  })

  it("removes a reopened unassigned errand from the former courier's list", () => {
    const assignedOrder = { id: "order-1", status: "ACCEPTED", courierId: "courier-1" } as Order
    const reopenedOrder = { id: "order-1", status: "OPEN", courierId: null } as Order

    expect(updateCourierOrderList([assignedOrder], reopenedOrder)).toEqual([])
  })

  it("requires order expiry to be at least 30 minutes after creation", () => {
    const now = new Date("2026-09-30T07:00:00.000Z")

    expect(validateCreateOrderForm({
      itemDescription: "Pick up a parcel",
      pickupSupplierId: "store-a",
      deliverySupplierId: "hall-b",
      offeredCredits: 1,
      deliveryTimeLimitMinutes: 15,
      expiresAt: "2026-09-30T07:29:59.000Z",
      automaticRepost: false,
      repostDueAt: "2026-09-30T08:00:00.000Z",
      repostExpiresAt: "2026-09-30T09:00:00.000Z",
      repostCreditAmount: 1,
      repostDeliveryDurationMinutes: 15,
    }, now)).toBe("Order expiry must be at least 30 minutes from now. Choose a later time.")

    expect(validateCreateOrderForm({
      itemDescription: "Pick up a parcel",
      pickupSupplierId: "store-a",
      deliverySupplierId: "hall-b",
      offeredCredits: 1,
      deliveryTimeLimitMinutes: 15,
      expiresAt: "2026-09-30T07:30:00.000Z",
      automaticRepost: false,
      repostDueAt: "2026-09-30T08:00:00.000Z",
      repostExpiresAt: "2026-09-30T09:00:00.000Z",
      repostCreditAmount: 1,
      repostDeliveryDurationMinutes: 15,
    }, now)).toBeNull()
  })

  it("validates automatic repost details only when enabled at creation", () => {
    expect(validateCreateOrderForm({
      itemDescription: "Pick up a parcel",
      pickupSupplierId: "store-a",
      deliverySupplierId: "hall-b",
      offeredCredits: 1,
      deliveryTimeLimitMinutes: 15,
      expiresAt: "2026-09-30T08:00:00.000Z",
      automaticRepost: true,
      repostDueAt: "",
      repostExpiresAt: "",
      repostCreditAmount: 1,
      repostDeliveryDurationMinutes: 15,
    }, new Date("2026-09-30T07:00:00.000Z"))).toBe("Choose a repost time when automatic repost is enabled.")

    expect(validateCreateOrderForm({
      itemDescription: "Pick up a parcel",
      pickupSupplierId: "store-a",
      deliverySupplierId: "hall-b",
      offeredCredits: 1,
      deliveryTimeLimitMinutes: 15,
      expiresAt: "2026-09-30T08:00:00.000Z",
      automaticRepost: false,
      repostDueAt: "",
      repostExpiresAt: "",
      repostCreditAmount: 0,
      repostDeliveryDurationMinutes: 0,
    }, new Date("2026-09-30T07:00:00.000Z"))).toBeNull()
  })
})


describe("quarter-hour errand times", () => {
  it("requires explicit automatic expiry strictly after due, with due at or after the original expiry", () => {
    const now = new Date(2026, 9, 8, 10, 0)
    const form: CreateOrderForm = {
      itemDescription: "item", pickupSupplierId: "store", deliverySupplierId: "hall",
      offeredCredits: 1, deliveryTimeLimitMinutes: 15, expiresAt: "2026-10-08T11:00",
      automaticRepost: true, repostDueAt: "2026-10-08T11:00", repostExpiresAt: "2026-10-08T11:30",
      repostCreditAmount: 1, repostDeliveryDurationMinutes: 15,
    }
    expect(validateCreateOrderForm(form, now)).toBeNull()
    expect(validateCreateOrderForm({ ...form, repostDueAt: "2026-10-08T10:45" }, now))
      .toBe("Repost time must be at or after the original order expiry.")
    for (const repostExpiresAt of ["2026-10-08T11:00", "2026-10-08T10:45", "2026-10-08T11:15"]) {
      expect(validateCreateOrderForm({ ...form, repostExpiresAt }, now))
        .toBe("Repost expiry must be at least 30 minutes after the repost time.")
    }
    expect(validateCreateOrderForm({ ...form, repostExpiresAt: "" }, now))
      .toBe("Choose a repost expiry when automatic repost is enabled.")
    expect(validateCreateOrderForm({ ...form, repostExpiresAt: "2026-10-08T11:16" }, now))
      .toBe("Choose repost expiry minutes of 00, 15, 30, or 45.")
    expect(buildCreateOrderPayload({ ...form, automaticRepost: false, repostExpiresAt: "" }, "owner").repostExpiresAt)
      .toBeNull()
  })

  it("rounds defaults up across an hour and date boundary without rounding valid slots", () => {
    expect(quarterHourDateTimeLocal(new Date(2026, 9, 8, 23, 59, 1))).toBe("2026-10-09T00:00")
    expect(quarterHourDateTimeLocal(new Date(2026, 9, 8, 10, 15))).toBe("2026-10-08T10:15")
    expect(quarterHourDateTimeLocal(new Date(2026, 9, 8, 10, 15, 1))).toBe("2026-10-08T10:30")
    expect(minOrderExpiryDateTimeLocal(new Date(2026, 9, 8, 10, 1, 30))).toBe("2026-10-08T10:45")
  })

  it("accepts only quarter-hour clock minutes with no seconds", () => {
    for (const minutes of ["00", "15", "30", "45"]) {
      expect(isQuarterHourDateTime("2026-10-08T12:" + minutes)).toBe(true)
    }
    for (const value of ["", "invalid", "2026-10-08T12:14", "2026-10-08T12:30:01"]) {
      expect(isQuarterHourDateTime(value)).toBe(false)
    }
  })

  it("rejects off-slot expiry and enabled repost times before building the request", () => {
    const now = new Date(2026, 9, 8, 10, 0)
    const form: CreateOrderForm = {
      itemDescription: "Pick up a parcel", pickupSupplierId: "store-a", deliverySupplierId: "hall-b",
      offeredCredits: 1, deliveryTimeLimitMinutes: 15, expiresAt: "2026-10-08T11:07",
      automaticRepost: false, repostDueAt: "2026-10-08T12:07", repostExpiresAt: "2026-10-08T13:00",
      repostCreditAmount: 1, repostDeliveryDurationMinutes: 15,
    }
    expect(validateCreateOrderForm(form, now)).toBe("Choose expiry minutes of 00, 15, 30, or 45.")
    expect(validateCreateOrderForm({ ...form, expiresAt: "2026-10-08T11:15" }, now)).toBeNull()
    expect(validateCreateOrderForm({ ...form, expiresAt: "2026-10-08T11:15", automaticRepost: true }, now))
      .toBe("Choose repost minutes of 00, 15, 30, or 45.")
  })
})

it("sends optional status alongside owner and pagination instead of filtering a loaded page", () => {
  expect(orderMinePath("courier", "uid-2", 2, "ABORTED")).toBe("/api/orders/mine?mode=courier&userId=uid-2&page=2&size=20&status=ABORTED")
  expect(orderMinePath("requester", "uid-1", 1, null)).not.toContain("status=")
})
