/*
 * AI Assistance Disclosure:
 * Tool: OpenAI Codex (GPT-5), date: 2026-10-13
 * Mode: Implementation.
 * Scope: Generated or updated frontend code for the team-specified report form, order association, navigation, and completion reminder.
 * Author review: I reviewed for correctness
 */
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import type { ComponentProps } from "react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { ReportForm } from "@/components/reporting/report-form"
import { ApiError } from "@/lib/api"
import type { Order } from "@/lib/orders"

const mocks = vi.hoisted(() => ({ api: vi.fn() }))
vi.mock("@/hooks/use-api", () => ({ useApi: () => mocks.api }))

let reportStorage: Pick<Storage, "getItem" | "setItem" | "removeItem">

function memoryStorage(): Pick<Storage, "getItem" | "setItem" | "removeItem"> {
  const values = new Map<string, string>()
  return {
    getItem: key => values.get(key) ?? null,
    setItem: (key, value) => { values.set(key, value) },
    removeItem: key => { values.delete(key) },
  }
}

function renderReportForm(props: Omit<ComponentProps<typeof ReportForm>, "submissionStorage">) {
  return render(<ReportForm {...props} submissionStorage={reportStorage} />)
}

const blobText = (blob: Blob) => new Promise<string>((resolve, reject) => {
  const reader = new FileReader()
  reader.onload = () => resolve(String(reader.result))
  reader.onerror = () => reject(reader.error)
  reader.readAsText(blob)
})

const order = (id: string, status: Order["status"]): Order => ({
  id, requesterId: "user", courierId: status === "OPEN" ? null : "courier",
  itemDescription: `Order ${id}`, pickupSupplierId: "a", deliverySupplierId: "b", offeredCredits: 2,
  status, createdAt: "2026-10-12T00:00:00Z", expiresAt: "2026-10-12T01:00:00Z",
  deliveryTimeLimitMinutes: 30, version: 0, originalOrderId: null, repostedOrderId: null,
})

it("Errand uses the courier-scoped active list and submits an assigned order", async () => {
  mocks.api.mockImplementation((path: string) => path.startsWith("/api/orders")
    ? Promise.resolve({ items: [order("assigned", "ACCEPTED")], page: 1, size: 100, totalItems: 1, totalPages: 1 })
    : Promise.resolve({ id: "errand-report" }))
  renderReportForm({ initialCategory: "ERRAND", initialOrderId: "assigned" })
  await waitFor(() => expect(mocks.api).toHaveBeenCalledWith("/api/orders/mine/active?mode=courier&page=1&size=100", expect.anything()))
  expect(screen.getByText(/The requester has 24 hours to reply/)).toBeInTheDocument()
  await waitFor(() => expect(screen.getByRole("combobox", { name: "Associated order" })).toHaveTextContent(/assigned/))
  fireEvent.change(screen.getByLabelText("Description (required)"), { target: { value: "Cannot contact requester" } })
  fireEvent.click(screen.getByRole("button", { name: "Submit report" }))
  await waitFor(() => expect(mocks.api.mock.calls.some(([path]) => path === "/api/reports")).toBe(true))
  const body = mocks.api.mock.calls.find(([path]) => path === "/api/reports")![1].body as FormData
  const json = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(reader.error)
    reader.readAsText(body.get("report") as Blob)
  })
  expect(JSON.parse(json)).toMatchObject({ category: "ERRAND", description: "Cannot contact requester", orderId: "assigned" })
  expect(JSON.parse(json).submissionId).toMatch(/^[0-9a-f-]{36}$/)
})

beforeEach(() => {
  vi.clearAllMocks()
  sessionStorage.clear()
  reportStorage = memoryStorage()
  Object.defineProperty(URL, "createObjectURL", { configurable: true, value: vi.fn(() => "blob:preview") })
  Object.defineProperty(URL, "revokeObjectURL", { configurable: true, value: vi.fn() })
})
afterEach(cleanup)

describe("report form", () => {
  it.each(["ORDER", "ERRAND"] as const)("shows the server's active-report reason for a stale %s selection and keeps the form", async category => {
    mocks.api.mockImplementation((path: string) => path.startsWith("/api/orders")
      ? Promise.resolve({ items: [order("stale", "ACCEPTED")], totalPages: 1 })
      : Promise.reject(new ApiError(409, "CONFLICT", "This order has an active report. Please resolve it before proceeding.")))
    renderReportForm({ initialCategory: category, initialOrderId: "stale" })
    await waitFor(() => expect(screen.getByRole("combobox", { name: "Associated order" })).toHaveTextContent(/stale/))
    fireEvent.change(screen.getByLabelText("Description (required)"), { target: { value: "Keep my explanation" } })
    fireEvent.click(screen.getByRole("button", { name: "Submit report" }))
    expect(await screen.findByText("This order has an active report. Please resolve it before proceeding.")).toBeInTheDocument()
    expect(screen.queryByText("Could not submit")).not.toBeInTheDocument()
    expect(screen.getByLabelText("Description (required)")).toHaveValue("Keep my explanation")
    expect(screen.getByRole("combobox", { name: "Associated order" })).toHaveTextContent(/stale/)
    expect(screen.queryByText(/Reference:/)).not.toBeInTheDocument()
  })
  it("uses only the active-order endpoint, follows its pages, and applies a valid prefill", async () => {
    mocks.api.mockImplementation((path: string) => path.includes("page=1")
      ? Promise.resolve({ items: [order("open", "OPEN"), order("progress", "IN_PROGRESS")], page: 1, size: 100, totalItems: 3, totalPages: 2 })
      : Promise.resolve({ items: [order("delivered", "DELIVERED")], page: 2, size: 100, totalItems: 3, totalPages: 2 }))
    renderReportForm({ initialCategory: "ORDER", initialOrderId: "delivered" })
    await waitFor(() => expect(mocks.api).toHaveBeenCalledWith("/api/orders/mine/active?page=2&size=100", expect.anything()))
    expect(mocks.api.mock.calls.every(([path]) => !String(path).includes("associated"))).toBe(true)
    expect(screen.queryByText("Private report")).not.toBeInTheDocument()
    expect(screen.getByText("Category (required)")).toBeInTheDocument()
    expect(screen.getByText("Associated order (required)")).toBeInTheDocument()
    expect(screen.getByText("Description (required)")).toBeInTheDocument()
    expect(screen.getByText("Photos")).toBeInTheDocument()
    expect(screen.getByRole("combobox", { name: "Associated order" })).toHaveTextContent(/DELIVERED/)
    fireEvent.click(screen.getByRole("combobox", { name: "Associated order" }))
    expect(screen.queryByRole("option", { name: /OPEN/ })).not.toBeInTheDocument()
    expect(screen.getByRole("option", { name: /IN PROGRESS/ })).toBeInTheDocument()
    expect(screen.getByRole("option", { name: /DELIVERED/ })).toBeInTheDocument()
    expect(screen.queryByRole("option", { name: /COMPLETED/ })).not.toBeInTheDocument()
  })

  it("requires an order for ORDER but submits unlinked GENERAL as FormData", async () => {
    mocks.api.mockImplementation((path: string) => path.startsWith("/api/orders")
      ? Promise.resolve({ items: [], page: 1, size: 100, totalItems: 0, totalPages: 0 })
      : Promise.resolve({ id: "report-1" }))
    renderReportForm({ initialCategory: "ORDER" })
    await waitFor(() => expect(mocks.api).toHaveBeenCalled())
    fireEvent.change(screen.getByLabelText("Description (required)"), { target: { value: "Missing package" } })
    fireEvent.click(screen.getByRole("button", { name: "Submit report" }))
    expect(await screen.findByText("Select an associated order for this category.")).toBeInTheDocument()
    expect(mocks.api.mock.calls.filter(([path]) => path === "/api/reports")).toHaveLength(0)

    fireEvent.click(screen.getByRole("combobox", { name: "Report category" }))
    expect(screen.queryByRole("option", { name: "Courier" })).not.toBeInTheDocument()
    expect(screen.queryByRole("option", { name: "Credits" })).not.toBeInTheDocument()
    fireEvent.pointerDown(await screen.findByRole("option", { name: "General" }), { pointerType: "mouse" })
    fireEvent.click(screen.getByRole("option", { name: "General" }))
    expect(screen.queryByRole("combobox", { name: "Associated order" })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole("button", { name: "Submit report" }))
    await waitFor(() => expect(mocks.api.mock.calls.some(([path]) => path === "/api/reports")).toBe(true))
    const options = mocks.api.mock.calls.find(([path]) => path === "/api/reports")?.[1]
    expect(options.body).toBeInstanceOf(FormData)
    expect((options.body as FormData).getAll("photos")).toHaveLength(0)
  })

  it("does not offer OPEN orders for an ORDER report", async () => {
    mocks.api.mockResolvedValue({ items: [order("open", "OPEN"), order("accepted", "ACCEPTED")], page: 1, size: 100, totalItems: 2, totalPages: 1 })
    renderReportForm({ initialCategory: "ORDER" })
    await waitFor(() => expect(mocks.api).toHaveBeenCalledWith("/api/orders/mine/active?page=1&size=100", expect.anything()))
    fireEvent.click(screen.getByRole("combobox", { name: "Associated order" }))
    expect(await screen.findByRole("option", { name: /ACCEPTED/ })).toBeInTheDocument()
    expect(screen.queryByRole("option", { name: /OPEN/ })).not.toBeInTheDocument()
  })

  it("previews and removes valid photos, rejects invalid files, and keeps contents for retry", async () => {
    let attempts = 0
    mocks.api.mockImplementation(() => {
      attempts += 1
      return attempts === 1 ? Promise.reject(new ApiError(503, "SERVICE_UNAVAILABLE", "Storage is unavailable.")) : Promise.resolve({ id: "report-2" })
    })
    renderReportForm({ initialCategory: "GENERAL" })
    expect(mocks.api).not.toHaveBeenCalled()
    fireEvent.change(screen.getByLabelText("Description (required)"), { target: { value: "Keep this description" } })
    const photos = screen.getByLabelText("Photos")
    fireEvent.change(photos, { target: { files: [new File([new Uint8Array([1])], "bad.gif", { type: "image/gif" })] } })
    expect(await screen.findByText(/non-empty JPEG, PNG, or WebP/)).toBeInTheDocument()
    const png = new File([new Uint8Array([0x89, 0x50, 0x4e, 0x47])], "receipt.png", { type: "image/png" })
    fireEvent.change(photos, { target: { files: [png] } })
    expect(await screen.findByAltText("Preview of receipt.png")).toBeInTheDocument()
    fireEvent.click(screen.getByRole("button", { name: "Remove receipt.png" }))
    expect(screen.queryByAltText("Preview of receipt.png")).not.toBeInTheDocument()
    fireEvent.change(photos, { target: { files: [png] } })
    fireEvent.click(screen.getByRole("button", { name: "Submit report" }))
    expect(await screen.findByText("Storage is unavailable.")).toBeInTheDocument()
    expect(screen.getByLabelText("Description (required)")).toHaveValue("Keep this description")
    expect(screen.getByAltText("Preview of receipt.png")).toBeInTheDocument()
    fireEvent.click(screen.getByRole("button", { name: "Retry submission" }))
    expect(await screen.findByText("Reference: report-2")).toBeInTheDocument()
  })

  it("does not accept a prefilled order absent from the authoritative response", async () => {
    mocks.api.mockResolvedValue({ items: [order("other", "OPEN")], page: 1, size: 100, totalItems: 1, totalPages: 1 })
    renderReportForm({ initialCategory: "ORDER", initialOrderId: "unrelated" })
    expect(await screen.findByText(/linked order is not eligible/)).toBeInTheDocument()
    expect(screen.queryByRole("option", { name: /unrelated/ })).not.toBeInTheDocument()
  })

  it("prevents duplicate submission while the first request is pending", async () => {
    let resolveReport!: (value: { id: string }) => void
    const pending = new Promise<{ id: string }>(resolve => { resolveReport = resolve })
    mocks.api.mockImplementation((path: string) => path.startsWith("/api/orders")
      ? Promise.resolve({ items: [], page: 1, size: 100, totalItems: 0, totalPages: 0 }) : pending)
    renderReportForm({ initialCategory: "GENERAL" })
    expect(mocks.api).not.toHaveBeenCalled()
    fireEvent.change(screen.getByLabelText("Description (required)"), { target: { value: "One report only" } })
    const submit = screen.getByRole("button", { name: "Submit report" })
    fireEvent.click(submit); fireEvent.click(submit)
    expect(mocks.api.mock.calls.filter(([path]) => path === "/api/reports")).toHaveLength(1)
    expect(screen.getByRole("button", { name: /Submitting/ })).toBeDisabled()
    resolveReport({ id: "once" })
    expect(await screen.findByText("Reference: once")).toBeInTheDocument()
  })
  it("stores one submission ID before sending and reuses it on an uncertain retry", async () => {
    const sent: string[] = []
    let reports = 0
    mocks.api.mockImplementation(async (path: string, options?: { body?: FormData }) => {
      if (!path.startsWith("/api/reports")) return { items: [], totalPages: 0 }
      const stored = JSON.parse(reportStorage.getItem("foc.reportSubmission.v1") || "{}")
      expect(stored.submissionId).toMatch(/^[0-9a-f-]{36}$/)
      const payload = JSON.parse(await blobText(options?.body?.get("report") as Blob))
      sent.push(payload.submissionId)
      reports += 1
      if (reports === 1) throw new ApiError(503, "SERVICE_UNAVAILABLE", "Uncertain response")
      return { id: "stable-report" }
    })
    renderReportForm({ initialCategory: "GENERAL" })
    fireEvent.change(screen.getByLabelText("Description (required)"), { target: { value: "Stable retry" } })
    fireEvent.click(screen.getByRole("button", { name: "Submit report" }))
    expect(await screen.findByText("Uncertain response")).toBeInTheDocument()
    fireEvent.click(screen.getByRole("button", { name: "Retry submission" }))
    expect(await screen.findByText("Reference: stable-report")).toBeInTheDocument()
    expect(sent).toHaveLength(2)
    expect(sent[1]).toBe(sent[0])
    expect(mocks.api.mock.calls.some(([path]) => String(path).includes(`/submissions/${sent[0]}/resume`))).toBe(true)
    expect(reportStorage.getItem("foc.reportSubmission.v1")).toBeNull()
  })

  it("fails before sending when session storage cannot retain the stable ID", async () => {
    const unavailable = {
      getItem: vi.fn(() => null), removeItem: vi.fn(), clear: vi.fn(),
      setItem: vi.fn(() => { throw new DOMException("denied") }),
    }
    mocks.api.mockResolvedValue({ id: "must-not-send" })
    render(<ReportForm initialCategory="GENERAL" submissionStorage={unavailable} />)
    fireEvent.change(screen.getByLabelText("Description (required)"), { target: { value: "Cannot persist" } })
    fireEvent.click(screen.getByRole("button", { name: "Submit report" }))
    expect(await screen.findByText(/cannot safely retain a report retry/)).toBeInTheDocument()
    expect(mocks.api).not.toHaveBeenCalled()
  })

  it("normalizes a retired Credits link to General without attaching its order ID", async () => {
    mocks.api.mockResolvedValue({ id: "credit-report" })
    renderReportForm({ initialCategory: "CREDITS", initialOrderId: "paid" })
    expect(screen.queryByRole("combobox", { name: "Associated order" })).not.toBeInTheDocument()
    expect(mocks.api).not.toHaveBeenCalled()
    fireEvent.change(screen.getByLabelText("Description (required)"), { target: { value: "Missing payment" } })
    fireEvent.click(screen.getByRole("button", { name: "Submit report" }))
    expect(await screen.findByText("Reference: credit-report")).toBeInTheDocument()
    expect(mocks.api).toHaveBeenCalledTimes(1)
    const body = mocks.api.mock.calls[0][1].body as FormData
    const payload = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(String(reader.result))
      reader.onerror = reject
      reader.readAsText(body.get("report") as Blob)
    })
    expect(JSON.parse(payload)).toMatchObject({ category: "GENERAL", orderId: null })
  })
  it("explains an existing active report without sending another submission", async () => {
    mocks.api.mockResolvedValue({ items: [{ ...order("held", "DELIVERED"), isCompletionHold: true }], totalPages: 1 })
    renderReportForm({ initialCategory: "ORDER", initialOrderId: "held" })
    await waitFor(() => expect(screen.getByRole("combobox", { name: "Associated order" })).toHaveTextContent(/DELIVERED/))
    expect(screen.queryByText("Active report")).not.toBeInTheDocument()
    fireEvent.change(screen.getByLabelText("Description (required)"), { target: { value: "Duplicate" } })
    fireEvent.click(screen.getByRole("button", { name: "Submit report" }))
    expect(await screen.findByText("This order has an active report. Please resolve it before proceeding.")).toBeInTheDocument()
    expect(mocks.api.mock.calls.some(([path]) => path === "/api/reports")).toBe(false)
  })

})
