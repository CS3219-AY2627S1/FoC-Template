import type { ReactNode } from "react"
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import NewRequestPage from "@/app/requests/new/page"
import { ApiError } from "@/lib/api"

const mocks = vi.hoisted(() => ({ api: vi.fn(), push: vi.fn(), user: { uid: "requester-1" } }))

vi.mock("@/hooks/use-api", () => ({ useApi: () => mocks.api }))
vi.mock("@/lib/order-command-storage", () => ({ readOrderIntent: async () => null }))
vi.mock("@/components/providers/auth-provider", () => ({ useAuth: () => ({ user: mocks.user, loading: false }) }))
vi.mock("@/components/require-auth", () => ({ RequireAuth: ({ children }: { children: ReactNode }) => children }))
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: mocks.push }) }))
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

beforeEach(() => {
  vi.clearAllMocks()
  vi.useFakeTimers({ toFake: ["Date"] })
  vi.setSystemTime(new Date(2026, 9, 8, 10, 1, 30))
  mocks.api.mockImplementation(async (path: string) => path.startsWith("/api/suppliers") ? {
    items: [{ id: "store", name: "Store", building: "A" }, { id: "hall", name: "Hall", building: "B" }],
  } : {})
})

afterEach(() => { cleanup(); vi.useRealTimers() })

// These controls have explicit ARIA labels. Select the exact control first to avoid
// JSDOM style/name walks over every date/time select, then check the same accessibility.
function combobox(name: string) {
  const matches = document.querySelectorAll<HTMLElement>(`[role="combobox"][aria-label=${JSON.stringify(name)}]`)
  expect(matches).toHaveLength(1)
  const control = matches.item(0)
  expect(control).toHaveAccessibleName(name)
  expect(control).toBeVisible()
  expect(control.closest('[aria-hidden="true"]')).toBeNull()
  return control
}

async function selectOption(name: string, option: string) {
  fireEvent.click(combobox(name))
  const item = await screen.findByRole("option", { name: option })
  fireEvent.pointerDown(item, { pointerType: "mouse" })
  fireEvent.click(item)
}

describe("request creation quarter-hour time integration", () => {
  it("loads only 20 suppliers when opened and browses later pages on demand", async () => {
    const first = Array.from({ length: 20 }, (_, i) => ({ id: `supplier-${i}`, name: `Campus ${i}`, building: "NUS" }))
    const later = [{ id: "vincent", name: "Vincent House", building: "NUS", openNow: false }]
    mocks.api.mockImplementation(async (path: string) => ({
      items: path.includes("page=2&") ? later : first, page: path.includes("page=2&") ? 2 : 1,
      size: 20, totalItems: 21, totalPages: 2,
    }))
    render(<NewRequestPage />)
    expect(mocks.api.mock.calls.filter(([path]) => path.startsWith("/api/suppliers?"))).toHaveLength(0)
    await waitFor(() => expect(combobox("Pickup supplier")).toBeEnabled())
    fireEvent.click(combobox("Pickup supplier"))
    await screen.findByRole("option", { name: "Campus 0 — NUS" })
    expect(mocks.api).toHaveBeenCalledWith("/api/suppliers?status=active&page=1&size=20&sort=name&order=asc",
      { signal: expect.any(AbortSignal) })
    expect(mocks.api.mock.calls.filter(([path]) => path.startsWith("/api/suppliers?"))).toHaveLength(1)
    fireEvent.click(screen.getByRole("button", { name: "Show more" }))
    fireEvent.click(await screen.findByRole("option", { name: "Vincent House — NUS" }))
    expect(mocks.api).toHaveBeenCalledWith("/api/suppliers?status=active&page=2&size=20&sort=name&order=asc",
      { signal: expect.any(AbortSignal) })
    expect(combobox("Pickup supplier")).toHaveTextContent("Vincent House")
    expect(mocks.api.mock.calls.filter(([path]) => path.startsWith("/api/suppliers?"))).toHaveLength(2)
  })

  it("shows a later-page error with retry while retaining previously loaded options", async () => {
    mocks.api.mockImplementation(async (path: string) => {
      if (path.includes("page=2&")) throw new Error("Supplier Service is temporarily unavailable.")
      return { items: [{ id: "store", name: "Store", building: "A" }], totalPages: 2 }
    })
    render(<NewRequestPage />)
    await waitFor(() => expect(combobox("Pickup supplier")).toBeEnabled())
    fireEvent.click(combobox("Pickup supplier"))
    await screen.findByRole("option", { name: "Store — A" })
    fireEvent.click(screen.getByRole("button", { name: "Show more" }))
    expect(await screen.findByRole("alert")).toHaveTextContent("Supplier Service is temporarily unavailable.")
    expect(screen.getByRole("button", { name: "Try again" })).toBeEnabled()
    expect(screen.getByRole("option", { name: "Store — A" })).toBeInTheDocument()
  })

  it("shows only the actual same-supplier error inline and does not post", async () => {
    render(<NewRequestPage />)
    await waitFor(() => expect(combobox("Pickup supplier")).not.toBeDisabled())
    fireEvent.change(screen.getByLabelText("What do you need?"), { target: { value: "Parcel" } })
    await selectOption("Pickup supplier", "Store — A")
    await selectOption("Delivery supplier", "Store — A")
    fireEvent.submit(screen.getByRole("form", { name: "Post request form" }))
    expect(await screen.findByRole("alert")).toHaveTextContent("Delivery supplier must differ from pickup supplier.")
    expect(combobox("Delivery supplier")).toHaveAttribute("aria-invalid", "true")
    expect(screen.getByRole("alert")).not.toHaveTextContent("Expiry")
    expect(mocks.api).not.toHaveBeenCalledWith("/api/orders", expect.anything())
  })

  it("preserves server field details instead of listing unrelated validation rules", async () => {
    mocks.api.mockImplementation(async (path: string) => {
      if (path === "/api/orders") throw new ApiError(400, "VALIDATION_ERROR", "Invalid request.", [
        { field: "expiresAt", message: "Order expiry must be at least 30 minutes from now." },
      ])
      return { items: [{ id: "store", name: "Store", building: "A" }, { id: "hall", name: "Hall", building: "B" }] }
    })
    render(<NewRequestPage />)
    await waitFor(() => expect(combobox("Pickup supplier")).not.toBeDisabled())
    fireEvent.change(screen.getByLabelText("What do you need?"), { target: { value: "Parcel" } })
    await selectOption("Pickup supplier", "Store — A")
    await selectOption("Delivery supplier", "Hall — B")
    fireEvent.submit(screen.getByRole("form", { name: "Post request form" }))
    expect(await screen.findByRole("alert")).toHaveTextContent("Order expiry must be at least 30 minutes from now.")
    expect(screen.getByLabelText("Order expiry date")).toHaveAttribute("aria-invalid", "true")
    expect(screen.getByRole("alert")).not.toHaveTextContent("suppliers must differ")
  })

  it("has a required automatic-repost expiry with quarter-hour minutes only", async () => {
    render(<NewRequestPage />)
    await waitFor(() => expect(combobox("Pickup supplier")).not.toBeDisabled())
    expect(combobox("Repost expiry minutes")).toBeDisabled()
    fireEvent.click(screen.getByRole("checkbox", { name: "Enable automatic repost if no courier accepts" }))
    expect(screen.getByLabelText("Repost expiry date")).toBeRequired()
    expect(combobox("Repost expiry minutes")).not.toBeDisabled()
    fireEvent.click(combobox("Repost expiry minutes"))
    expect((await screen.findAllByRole("option")).map(option => option.textContent)).toEqual(["00", "15", "30", "45"])
  })

  it("submits rounded local expiry and repost time using the existing ISO request body", async () => {
    render(<NewRequestPage />)
    await waitFor(() => expect(combobox("Pickup supplier")).not.toBeDisabled())
    expect(combobox("Order expiry minutes")).toHaveTextContent("15")
    expect(combobox("Repost time minutes")).toBeDisabled()
    fireEvent.change(screen.getByLabelText("What do you need?"), { target: { value: "Pick up a parcel" } })
    await selectOption("Pickup supplier", "Store — A")
    await selectOption("Delivery supplier", "Hall — B")
    fireEvent.click(screen.getByRole("checkbox", { name: "Enable automatic repost if no courier accepts" }))
    await selectOption("Repost time minutes", "30")
    fireEvent.submit(screen.getByRole("form", { name: "Post request form" }))
    await waitFor(() => expect(mocks.api).toHaveBeenCalledWith("/api/orders", {
      method: "POST", body: expect.objectContaining({
        requesterId: "requester-1", pickupSupplierId: "store", deliverySupplierId: "hall",
        expiresAt: new Date(2026, 9, 8, 11, 15).toISOString(),
        automaticRepost: true, repostDueAt: new Date(2026, 9, 8, 12, 30).toISOString(),
        repostExpiresAt: new Date(2026, 9, 8, 13, 15).toISOString(),
      }),
    }))
    expect(mocks.push).toHaveBeenCalledWith("/my-requests")
  })

  it("rejects a past expiry without posting", async () => {
    render(<NewRequestPage />)
    await waitFor(() => expect(screen.getByLabelText("Order expiry date")).not.toBeDisabled())
    fireEvent.change(screen.getByLabelText("Order expiry date"), { target: { value: "2026-10-07" } })
    fireEvent.submit(screen.getByRole("form", { name: "Post request form" }))
    expect(await screen.findByRole("alert")).toHaveTextContent("Order expiry must be at least 30 minutes from now")
    expect(mocks.api).not.toHaveBeenCalledWith("/api/orders", expect.anything())
  })
})
