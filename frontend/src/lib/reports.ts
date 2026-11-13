import type { AdminOrder, AdminRequest } from "./admin-api"
import type { Page } from "./suppliers"
import type { ReportResponse, ReportPage } from "./reporting"
import type { Order } from "./orders"
export type ReportStatus = "AWAITING_COURIER_RESPONSE" | "READY_FOR_REVIEW" | "RESOLVED"
export type ReportEvidence = { name: string; contentType: string; dataUrl?: string; reportId?: string; attachmentId?: string }
export type DeliveryReport = {
  id: string; order: AdminOrder | null; reporterId: string; requesterId: string | null; courierId: string | null; respondentId?: string | null; status: ReportStatus
  violationCategory: string; requesterExplanation: string; requesterAttachments: ReportEvidence[]
  courierExplanation: string | null; courierAttachments: ReportEvidence[]; createdAt: string
  courierResponseSubmittedAt: string | null
  resolvedAt: string | null; resolvedBy: string | null; resolutionNote: string | null
  responseDeadlineAt?: string | null
}
export const REPORT_STATUSES: Record<ReportStatus, string> = {
  AWAITING_COURIER_RESPONSE: "Awaiting response", READY_FOR_REVIEW: "Ready for review", RESOLVED: "Resolved",
}
export const REPORT_CATEGORIES: Record<string, string> = {
  ITEM_MISHANDLING_OR_DAMAGE: "Parcel damaged or destroyed", WRONG_LOCATION_DELIVERY: "Delivered to the wrong location",
  ORDER: "Order", ERRAND: "Errand", COURIER: "Courier", CREDITS: "Credits", GENERAL: "General",
}
export type ReportResolution = { commandId: string; status: "PENDING" | "COMPENSATING" | "SUCCEEDED" | "COMPENSATED" | "REJECTED" | "RECONCILIATION_REQUIRED"; reason?: string }
export function createReportApi(request: AdminRequest) {
  const root = "/api/reports"
  async function adapt(report: ReportResponse, signal?: AbortSignal): Promise<DeliveryReport> {
    let order: AdminOrder | null = null
    if (report.orderId) {
      const value = await request<Order>("/api/orders/" + encodeURIComponent(report.orderId), { signal })
      order = { ...value, requesterName: null, courierName: null, pickupSupplierName: null, deliverySupplierName: null }
    }
    const evidence = (items: ReportResponse["attachments"]) => items.map(item => ({ name: item.filename, contentType: item.contentType, reportId: report.id, attachmentId: item.id }))
    return { id: report.id, order, reporterId: report.reporterId,
      requesterId: report.requesterId ?? (report.orderId && report.category !== "ERRAND" ? report.reporterId : null), courierId: report.courierId, respondentId: report.respondentId, status: report.status,
      violationCategory: report.category, requesterExplanation: report.description, requesterAttachments: evidence(report.attachments),
      courierExplanation: report.responseExplanation ?? report.courierResponse, courierAttachments: evidence(report.responseAttachments), createdAt: report.createdAt,
      courierResponseSubmittedAt: report.respondedAt, responseDeadlineAt: report.responseDeadlineAt,
      resolvedAt: report.resolvedAt, resolvedBy: report.resolvedBy ?? null, resolutionNote: report.resolutionNote ?? null }
  }
  return {
    list: async (_userId: string, _mode: "admin", page: number, status = "", signal?: AbortSignal, filters?: { orderId: string; status: string }): Promise<Page<DeliveryReport>> => {
      const params = new URLSearchParams({ page: String(page), size: "20" })
      if (filters?.orderId.trim()) params.set("orderId", filters.orderId.trim())
      if (filters?.status || status) params.set("status", filters?.status || status)
      const result = await request<ReportPage>(root + "?" + params, { signal })
      // Cards need Report fields only. Load the associated Order when opening the full case.
      return { ...result, items: result.items.map(report => ({ id: report.id, order: null, reporterId: report.reporterId,
        requesterId: report.requesterId ?? (report.orderId && report.category !== "ERRAND" ? report.reporterId : null), courierId: report.courierId, respondentId: report.respondentId,
        status: report.status, violationCategory: report.category, requesterExplanation: report.description,
        requesterAttachments: [], courierAttachments: [], courierExplanation: report.responseExplanation ?? report.courierResponse,
        courierResponseSubmittedAt: report.respondedAt, createdAt: report.createdAt, resolvedAt: report.resolvedAt,
        resolutionNote: null, resolvedBy: null, responseDeadlineAt: report.responseDeadlineAt })) }
    },
    detail: async (id: string, _userId: string, signal?: AbortSignal) =>
      adapt(await request<ReportResponse>(root + "/" + encodeURIComponent(id), { signal }), signal),
    resolve: (id: string, _userId: string, reply: string, commandId: string) => request<ReportResolution | ReportResponse>(root + "/" + encodeURIComponent(id) + "/resolve", { method: "POST", body: { commandId, reply } }),
    resolution: (commandId: string, signal?: AbortSignal) => request<ReportResolution>("/api/orders/admin/report-resolutions/" + encodeURIComponent(commandId), { signal }),
  }
}
