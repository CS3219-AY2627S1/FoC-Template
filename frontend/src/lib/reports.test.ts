import { describe, it, expect, vi } from "vitest"
import { createReportApi } from "./reports"
const report = { id: "report-1", reporterId: "owner", courierId: "courier", orderId: "order-1", category: "COURIER", description: "Issue", status: "READY_FOR_REVIEW", attachments: [{ id: "a", filename: "proof.png", contentType: "image/png" }], responseAttachments: [] }
describe("real Report transport", () => {
  it("keeps an Errand submitter distinct from the Order requester", async () => {
    const request = vi.fn().mockResolvedValue({ items: [{ ...report, category: "ERRAND", reporterId: "courier", requesterId: "owner" }], totalItems: 1, totalPages: 1 })
    const result = await createReportApi(request).list("admin", "admin", 1)
    expect(result.items[0].reporterId).toBe("courier")
    expect(result.items[0].requesterId).toBe("owner")
    expect(result.items[0].violationCategory).toBe("ERRAND")
  })
  it("uses real filtered Report pages without Order lookups or mode-dependent mocks", async () => {
    const request = vi.fn().mockResolvedValue({ items: [report], totalItems: 1, totalPages: 1 })
    const signal = new AbortController().signal
    const result = await createReportApi(request).list("admin", "admin", 2, "", signal, { orderId: "order/a", status: "READY_FOR_REVIEW" })
    expect(request).toHaveBeenCalledExactlyOnceWith("/api/reports?page=2&size=20&orderId=order%2Fa&status=READY_FOR_REVIEW", { signal })
    expect(result.items[0].order).toBeNull()
    expect(result.items[0].requesterId).toBe("owner")
  })
  it("loads the actual associated Order only for full details and maps private attachment handles", async () => {
    const request = vi.fn().mockResolvedValueOnce(report).mockResolvedValueOnce({ id: "order-1", requesterId: "owner" })
    const result = await createReportApi(request).detail("report-1", "admin")
    expect(request).toHaveBeenNthCalledWith(1, "/api/reports/report-1", { signal: undefined })
    expect(request).toHaveBeenNthCalledWith(2, "/api/orders/order-1", { signal: undefined })
    expect(result.requesterAttachments[0]).toMatchObject({ reportId: "report-1", attachmentId: "a", name: "proof.png" })
  })
  it("does not require an Order for general or credit reports", async () => {
    const request = vi.fn().mockResolvedValue({ ...report, orderId: null })
    expect((await createReportApi(request).detail("report-1", "admin")).order).toBeNull()
    expect(request).toHaveBeenCalledTimes(1)
  })
  it("submits only the reply and stable command ID then reads the Order recovery status", async () => {
    const request = vi.fn().mockResolvedValue({ commandId: "same-key", status: "COMPENSATING" })
    const api = createReportApi(request)
    await api.resolve("report/a", "admin", "Reviewed", "same-key")
    expect(request).toHaveBeenLastCalledWith("/api/reports/report%2Fa/resolve", { method: "POST", body: { commandId: "same-key", reply: "Reviewed" } })
    await api.resolution("same-key")
    expect(request).toHaveBeenLastCalledWith("/api/orders/admin/report-resolutions/same-key", { signal: undefined })
  })
  it("never substitutes sample cases when a real request fails", async () => {
    const request = vi.fn().mockRejectedValue(new Error("Service unavailable"))
    await expect(createReportApi(request).list("admin", "admin", 1)).rejects.toThrow("Service unavailable")
    expect(request).toHaveBeenCalledTimes(1)
  })
})
