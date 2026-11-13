/*
 * AI Assistance Disclosure:
 * Tool: OpenAI Codex (GPT-5), date: 2026-10-27
 * Mode: Test generation and verification.
 * Scope: Generated tests for reporting tabs, scoped APIs, courier responses, retry preservation, and expired response UI.
 * Author review: I reviewed for correctness
 */
import type { ReactNode } from "react"
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { ReportingHub } from "@/components/reporting/reporting-hub"
import { ApiError } from "@/lib/api"
import type { ReportResponse } from "@/lib/reporting"

const mocks = vi.hoisted(() => ({ api: vi.fn(), uid: "courier-1", search: "", listeners: new Set<() => void>(), replace: vi.fn() }))
vi.mock("next/navigation", async () => {
  const { useSyncExternalStore } = await import("react")
  return {
    useSearchParams: () => new URLSearchParams(useSyncExternalStore(listener => {
      mocks.listeners.add(listener)
      return () => mocks.listeners.delete(listener)
    }, () => mocks.search)),
    useRouter: () => ({ replace: mocks.replace }),
  }
})
vi.mock("@/hooks/use-api", () => ({ useApi: () => mocks.api }))
vi.mock("@/components/providers/auth-provider", () => ({ useAuth: () => ({ user: { uid: mocks.uid }, loading: false }) }))
vi.mock("@/components/require-auth", () => ({ RequireAuth: ({ children }: { children: ReactNode }) => children }))

const baseReport: ReportResponse = {
  id: "report-1",
  reporterId: "requester-1",
  category: "COURIER",
  description: "The delivery was damaged.",
  orderId: "order-1",
  courierId: "courier-1",
  status: "AWAITING_COURIER_RESPONSE",
  createdAt: "2026-10-27T00:00:00Z",
  responseDeadlineAt: "2026-10-28T00:00:00Z",
  courierResponse: null,
  respondedAt: null,
  resolvedAt: null,
  attachments: [],
  responseAttachments: [],
}

const page = (items: ReportResponse[]) => ({ items, page: 1, size: 20, totalItems: items.length, totalPages: 1 })

beforeEach(() => {
  vi.clearAllMocks(); mocks.uid = "courier-1"; mocks.search = ""
  Object.defineProperty(URL, "createObjectURL", { configurable: true, value: vi.fn((file: File) => `blob:${file.name}`) })
  Object.defineProperty(URL, "revokeObjectURL", { configurable: true, value: vi.fn() })
  mocks.replace.mockImplementation((url: string) => {
    mocks.search = url.split("?")[1] ?? ""
    mocks.listeners.forEach(listener => listener())
  })
})
afterEach(cleanup)

describe("reporting hub", () => {
  it("opens Against me on explicit URL navigation and preserves the form until navigation", async () => {
    mocks.search = "category=GENERAL"
    mocks.api.mockResolvedValue(page([baseReport]))
    const view = render(<ReportingHub initialTab="create" initialCategory="GENERAL" />)
    fireEvent.change(screen.getByLabelText("Description (required)"), { target: { value: "Keep my draft" } })
    view.rerender(<ReportingHub initialTab="create" initialCategory="GENERAL" />)
    expect(screen.getByLabelText("Description (required)")).toHaveValue("Keep my draft")
    expect(mocks.replace).not.toHaveBeenCalled()
    act(() => {
      mocks.search = "tab=against-me&category=GENERAL"
      mocks.listeners.forEach(listener => listener())
    })
    expect(await screen.findByRole("button", { name: "Submit response" })).toBeInTheDocument()
    expect(screen.getByRole("tab", { name: "Against me" })).toHaveAttribute("aria-selected", "true")
    fireEvent.click(screen.getByRole("tab", { name: "Submitted" }))
    expect(mocks.replace).toHaveBeenCalledWith("/reporting?tab=submitted&category=GENERAL", { scroll: false })
  })
  it("loads submitted and against-me reports from their scoped endpoints", async () => {
    mocks.api.mockImplementation((path: string) => {
      if (path.includes("view=submitted")) return Promise.resolve(page([{ ...baseReport, courierResponse: "I packed it carefully.", respondedAt: "2026-10-27T01:00:00Z", status: "READY_FOR_REVIEW" }]))
      if (path.includes("view=against-me")) return Promise.resolve(page([baseReport]))
      return Promise.resolve(page([]))
    })

    render(<ReportingHub initialTab="submitted" initialCategory="GENERAL" />)
    expect(await screen.findByText("I packed it carefully.")).toBeInTheDocument()
    expect(mocks.api).toHaveBeenCalledWith("/api/reports/mine?view=submitted&page=1&size=20", expect.anything())

    fireEvent.click(screen.getByRole("tab", { name: "Against me" }))
    expect(await screen.findByRole("button", { name: "Submit response" })).toBeInTheDocument()
    expect(mocks.api).toHaveBeenCalledWith("/api/reports/mine?view=against-me&page=1&size=20", expect.anything())
  })

  it("previews and removes response photos, then keeps remaining fields after a failed attempt", async () => {
    let responseAttempts = 0
    mocks.api.mockImplementation((path: string) => {
      if (path === "/api/reports/report-1/response") {
        responseAttempts += 1
        return responseAttempts === 1
          ? Promise.reject(new ApiError(503, "SERVICE_UNAVAILABLE", "Evidence storage is unavailable."))
          : Promise.resolve({ ...baseReport, courierResponse: "The item was intact at delivery.", respondedAt: "2026-10-27T01:00:00Z", status: "READY_FOR_REVIEW" })
      }
      return Promise.resolve(page([baseReport]))
    })

    render(<ReportingHub initialTab="against-me" initialCategory="GENERAL" />)
    const explanation = await screen.findByLabelText("Your response (required)")
    fireEvent.change(explanation, { target: { value: "The item was intact at delivery." } })
    const photo = new File([new Uint8Array([1])], "handoff.webp", { type: "image/webp" })
    const receipt = new File([new Uint8Array([2])], "receipt.png", { type: "image/png" })
    const photoInput = screen.getByLabelText("Evidence photos")
    fireEvent.change(photoInput, { target: { files: [photo, receipt] } })
    expect(await screen.findByAltText("Preview of handoff.webp")).toBeInTheDocument()
    expect(screen.getByAltText("Preview of receipt.png")).toBeInTheDocument()
    fireEvent.click(screen.getByRole("button", { name: "Remove handoff.webp" }))
    expect(screen.queryByAltText("Preview of handoff.webp")).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole("button", { name: "Submit response" }))

    expect(await screen.findByText("Evidence storage is unavailable.")).toBeInTheDocument()
    expect(explanation).toHaveValue("The item was intact at delivery.")
    expect(screen.getByAltText("Preview of receipt.png")).toBeInTheDocument()
    fireEvent.click(screen.getByRole("button", { name: "Submit response" }))
    await waitFor(() => expect(responseAttempts).toBe(2))
    const responseCall = mocks.api.mock.calls.filter(([path]) => path === "/api/reports/report-1/response").at(-1)
    expect(responseCall?.[1]).toMatchObject({ method: "POST", body: expect.any(FormData) })
    expect((responseCall?.[1]?.body as FormData).getAll("photos")).toEqual([receipt])
  })

  it("shows an expired report as closed without a response form", async () => {
    mocks.api.mockResolvedValue(page([{ ...baseReport, status: "READY_FOR_REVIEW" }]))
    render(<ReportingHub initialTab="against-me" initialCategory="GENERAL" />)
    expect(await screen.findByText("Response window closed")).toBeInTheDocument()
    expect(screen.queryByRole("button", { name: "Submit response" })).not.toBeInTheDocument()
  })

  it("offers a requester the response form for a courier-submitted Errand report", async () => {
    mocks.uid = "requester-1"
    const complaint: ReportResponse = { ...baseReport, category: "ERRAND", reporterId: "courier-1",
      requesterId: "requester-1", respondentId: "requester-1", description: "Nothing at pickup" }
    mocks.api.mockResolvedValue(page([complaint]))
    render(<ReportingHub initialTab="against-me" initialCategory="ORDER" />)
    expect(await screen.findByText("Nothing at pickup")).toBeInTheDocument()
    expect(screen.getByText(/Response due by/)).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText("Your response (required)"), { target: { value: "It is at the counter" } })
    fireEvent.click(screen.getByRole("button", { name: "Submit response" }))
    await waitFor(() => expect(mocks.api).toHaveBeenCalledWith("/api/reports/report-1/response",
      expect.objectContaining({ method: "POST", body: expect.any(FormData) })))
    expect(screen.queryByText("Courier response")).not.toBeInTheDocument()
  })
})
