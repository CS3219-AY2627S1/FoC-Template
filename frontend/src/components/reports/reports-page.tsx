"use client"

import { useCallback, useRef, useState } from "react"
import Link from "next/link"
import { ArrowUpRightIcon } from "lucide-react"
import { toast } from "sonner"
import { useAuth } from "@/components/providers/auth-provider"
import { useOrderDisplayNames } from "@/hooks/use-order-display-names"
import { useReportApi, useReportResource } from "@/hooks/use-reports"
import { useVisiblePolling } from "@/hooks/use-visible-polling"
import { useApi } from "@/hooks/use-api"
import { ApiError } from "@/lib/api"
import { REPORT_CATEGORIES, REPORT_STATUSES, type DeliveryReport, type ReportEvidence } from "@/lib/reports"
import type { AdminOrder } from "@/lib/admin-api"
import { StatusSelect } from "@/components/orders/status-select"
import { formatOrderStatus } from "@/lib/orders"
import { Button, buttonVariants } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Textarea } from "@/components/ui/textarea"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { AdminFilterActions, AdminFilterForm, AdminHeading, AdminLoadState, AdminPagination, CopyId, adminDate } from "@/components/admin/admin-ui"

export function AdminReportsPage({ reportId }: { reportId?: string }) {
  return <section className="mx-auto w-full max-w-6xl space-y-6 px-4 py-8 sm:px-6">
    <AdminHeading title={reportId ? "Report details" : "Reports"} description="Review delivered-item issues, evidence and responses." />
    {reportId ? <ReportCase key={reportId} id={reportId} /> : <ReportList />}
  </section>
}

function ReportList() {
  const api = useReportApi()
  const { user, loading: authLoading } = useAuth()
  const [page, setPage] = useState(1)
  const [orderId, setOrderId] = useState("")
  const [query, setQuery] = useState({ orderId: "", status: "" })
  function changeFilters(next: typeof query) { setPage(1); setQuery(next) }
  const statuses = { all: "All statuses", ...REPORT_STATUSES }
  const load = useCallback((signal: AbortSignal) => api.list(user?.uid ?? "", "admin", page, "", signal, query), [api, user?.uid, page, query])
  const enabled = Boolean(user) && !authLoading
  const result = useReportResource(load, enabled)
  const root = "/admin/reports"
  return <>
    <AdminFilterForm hasToggle onSubmit={event => { event.preventDefault(); changeFilters({ ...query, orderId: orderId.trim() }) }}>
      <div className="flex min-w-0 flex-col gap-2"><Label htmlFor="report-status">Status</Label>
        <StatusSelect id="report-status" aria-label="Report status" className="w-full" value={query.status || "all"}
          onChange={event => changeFilters({ ...query, status: event.target.value === "all" ? "" : event.target.value })}>
          {Object.entries(statuses).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </StatusSelect>
      </div>
      <div className="flex min-w-0 flex-col gap-2"><Label htmlFor="report-order-id">Order ID</Label>
        <Input className="h-10 min-w-0" id="report-order-id" maxLength={128} value={orderId} onChange={event => setOrderId(event.target.value)} placeholder="Enter an exact Order ID" />
      </div>
      <Label className="col-span-2 flex h-10 w-fit cursor-pointer items-center gap-2 rounded-lg border px-2.5 text-sm font-normal sm:col-span-1">
        <Switch checked={query.status === "READY_FOR_REVIEW"} onCheckedChange={checked => changeFilters({
          ...query, status: checked ? "READY_FOR_REVIEW" : "",
        })} />
        Ready for review
      </Label>
      <AdminFilterActions>
        <Button className="h-10" type="submit">Search</Button>
        <Button className="h-10" type="button" variant="outline" onClick={() => { setOrderId(""); changeFilters({ orderId: "", status: "" }) }}>Clear</Button>
      </AdminFilterActions>
    </AdminFilterForm>
    <section className="space-y-4" aria-label="Report results">
      <AdminLoadState loading={result.loading} error={result.error} empty={result.data?.items.length === 0} retry={result.refresh} />
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{result.data?.items.map(report => <Card key={report.id} className={report.status === "RESOLVED" ? "min-w-0 bg-muted/50 text-muted-foreground" : "min-w-0"}>
          <CardHeader>
            <div className="flex items-start justify-between gap-3">
              <CardTitle className="min-w-0 flex-1"><h3>{REPORT_CATEGORIES[report.violationCategory]}</h3></CardTitle>
              <Badge variant="outline" className="h-auto! min-h-5 max-w-1/2 whitespace-normal! text-right leading-tight">{REPORT_STATUSES[report.status]}</Badge>
            </div>
          </CardHeader>
          <CardContent className="flex flex-1 flex-col gap-4 text-sm">
            <p className="line-clamp-3 text-muted-foreground [overflow-wrap:anywhere]">{report.requesterExplanation}</p>
            <p className="text-xs text-muted-foreground">{report.status === "RESOLVED" ? "Resolved " + adminDate(report.resolvedAt!) : "Submitted " + adminDate(report.createdAt)}</p>
            <div className="mt-auto"><Link href={root + "/" + encodeURIComponent(report.id)} className={buttonVariants({ variant: "outline", size: "sm" })}>View report</Link></div>
          </CardContent>
        </Card>)}</div>
      {result.data && result.data.totalPages > 1 && <AdminPagination page={page} totalPages={result.data.totalPages} totalItems={result.data.totalItems} onPage={setPage} />}
    </section>
  </>
}

function Evidence({ files }: { files: ReportEvidence[] }) {
  return files.length ? <ul className="space-y-2">{files.map((file, index) => <li key={index}><EvidenceDownload file={file} /></li>)}</ul>
    : <p className="text-sm text-muted-foreground">No attachments provided.</p>
}
function EvidenceDownload({ file }: { file: ReportEvidence }) {
  const api = useApi()
  const [busy, setBusy] = useState(false); const [error, setError] = useState("")
  async function download() {
    setBusy(true); setError("")
    try {
      const blob = await api<Blob>(`/api/reports/${encodeURIComponent(file.reportId!)}/attachments/${encodeURIComponent(file.attachmentId!)}`, { responseType: "blob" })
      const url = URL.createObjectURL(blob); const link = document.createElement("a")
      link.href = url; link.download = file.name; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000)
    } catch { setError("Attachment could not be downloaded. Try again.") } finally { setBusy(false) }
  }
  return <><Button size="sm" variant="link" disabled={busy} onClick={() => void download()}>{file.name}</Button>{error && <p role="alert">{error}</p>}</>
}

function SummaryFields({ rows }: { rows: [string, React.ReactNode][] }) {
  return <dl className="divide-y">{rows.map(([label, value]) => <div key={label} className="grid min-w-0 gap-1 py-3 text-sm sm:grid-cols-[11rem_minmax(0,1fr)] sm:gap-6">
    <dt className="text-muted-foreground">{label}</dt><dd className="min-w-0 whitespace-pre-wrap [overflow-wrap:anywhere]">{value}</dd>
  </div>)}</dl>
}
function ReportSection({ title, children }: { title: string; children: React.ReactNode }) {
  return <section className="min-w-0 space-y-3 border-t px-5 py-6 sm:px-8" aria-label={title}>
    <h2 className="text-base font-medium">{title}</h2>{children}
  </section>
}
function ReportOrderSummary({ order }: { order: AdminOrder }) {
  const displayName = useOrderDisplayNames([order])
  const content = <>
    <div className="flex items-center justify-between gap-3"><h2 className="text-base font-medium">Order</h2><ArrowUpRightIcon className="size-4 shrink-0 text-muted-foreground" aria-hidden /></div>
    <SummaryFields rows={[
      ["Order ID", order.id], ["Description", order.itemDescription], ["Order status", formatOrderStatus(order.status)],
      ["Requester", displayName("users", order.requesterId, order.requesterName)], ["Courier", displayName("users", order.courierId, order.courierName) || "Unassigned"],
      ["Pickup", displayName("suppliers", order.pickupSupplierId, order.pickupSupplierName)], ["Delivery", displayName("suppliers", order.deliverySupplierId, order.deliverySupplierName)],
      ["Offered credits", order.offeredCredits], ["Delivery time limit", order.deliveryTimeLimitMinutes + " minutes"],
      ["Expiry", adminDate(order.expiresAt)],
      ...(order.deliveryDeadlineAt ? [["Delivery deadline", adminDate(order.deliveryDeadlineAt)] as [string, React.ReactNode]] : []),
      ...(order.deliveredAt ? [["Delivered", adminDate(order.deliveredAt)] as [string, React.ReactNode]] : []),
      ["Completion hold", order.isCompletionHold ? "Yes" : "No"],
      ["Overdue", order.isOverdue == null ? "Not available" : order.isOverdue ? (order.overduePenaltyWaived ? "Yes — penalty waived" : "Yes") : "No"],
    ]} />
  </>
  return <Link href={"/admin/orders?orderId=" + encodeURIComponent(order.id)} aria-label={"Open order " + order.id + " in Orders"}
    className="block min-w-0 px-5 py-6 transition-colors hover:bg-muted/40 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring sm:px-8">{content}</Link>
}
function ReportCase({ id }: { id: string }) {
  const api = useReportApi(); const { user, loading: authLoading } = useAuth()
  const load = useCallback((signal: AbortSignal) => api.detail(id, user?.uid ?? "", signal), [api, id, user?.uid])
  const { data: report, error, loading, refresh } = useReportResource(load, Boolean(user) && !authLoading)
  const [resolving, setResolving] = useState(false)
  const displayName = useOrderDisplayNames(report?.order ? [report.order] : [], [report?.resolvedBy])
  if (!report) return <AdminLoadState loading={loading} error={error} empty={false} retry={refresh} />
  const root = "/admin/reports"
  const order = report.order ? { ...report.order, requesterName: displayName("users", report.order.requesterId, report.order.requesterName), courierName: displayName("users", report.order.courierId, report.order.courierName), pickupSupplierName: displayName("suppliers", report.order.pickupSupplierId, report.order.pickupSupplierName), deliverySupplierName: displayName("suppliers", report.order.deliverySupplierId, report.order.deliverySupplierName) } : null
  const creditContext = report.violationCategory === "CREDITS"
  const errandContext = report.reporterId === report.courierId
  const respondentId = report.respondentId ?? (errandContext ? report.requesterId : report.courierId)
  const respondentName = respondentId === order?.requesterId ? order.requesterName : order?.courierName
  const submitterContext = creditContext || errandContext
  const submitterName = report.reporterId === order?.requesterId ? order.requesterName : report.reporterId === order?.courierId ? order.courierName : null
  return <>
    <Link href={root} className={buttonVariants({ variant: "outline" })}>Back to reports</Link>
    {error && <p role="status" className="text-sm text-muted-foreground">Could not refresh. Showing the last available case.</p>}
    <Card className="gap-0 py-0" aria-label="Report case">
      {order && <ReportOrderSummary order={order} />}
      <ReportSection title="Report information">
        <SummaryFields rows={[
          ["Report ID", <CopyId key="id" id={report.id} />],
          ["Status", <Badge key="status" variant="outline">{REPORT_STATUSES[report.status]}</Badge>],
          ["Violation category", REPORT_CATEGORIES[report.violationCategory]],
          ["Submitted", adminDate(report.createdAt)],
          ["Response", creditContext ? "Not required for credit issues." : report.courierResponseSubmittedAt ? "Submitted " + adminDate(report.courierResponseSubmittedAt)
            : report.status === "AWAITING_COURIER_RESPONSE" ? "Awaiting response" : "No response submitted."],
        ]} />
      </ReportSection>
      <ReportSection title={submitterContext ? "Submitter account" : "Requester account"}>
        <SummaryFields rows={[[submitterContext ? "Submitter name" : "Requester name", <Participant key="requester" id={report.reporterId} name={submitterName ?? null} />],
          [submitterContext ? "Submitter ID" : "Requester ID", <CopyId key="requester-id" id={report.reporterId} />],
          ["Explanation", report.requesterExplanation], ["Attachments", <Evidence key="requester-evidence" files={report.requesterAttachments} />]]} />
      </ReportSection>
      {!creditContext && respondentId && <ReportSection title={errandContext ? "Requester account" : "Courier account"}>
        <SummaryFields rows={[[errandContext ? "Requester name" : "Courier name", <Participant key="respondent" id={respondentId} name={respondentName ?? null} />],
          [errandContext ? "Requester ID" : "Courier ID", <CopyId key="respondent-id" id={respondentId} />],
          ["Explanation", report.courierExplanation || "No response submitted."], ["Attachments", <Evidence key="courier-evidence" files={report.courierAttachments} />]]} />
      </ReportSection>}
      {report.status === "RESOLVED" && <ReportSection title="Resolution"><SummaryFields rows={[
        ["Admin name", report.resolvedBy ? <Participant key="admin" id={report.resolvedBy} name={displayName("users", report.resolvedBy)} /> : "Not available"],
        ["Admin ID", report.resolvedBy ? <CopyId key="admin-id" id={report.resolvedBy} /> : "Not available"],
        ["Admin reply", report.resolutionNote], ["Resolved", adminDate(report.resolvedAt!)],
      ]} /></ReportSection>}
      {(report.status !== "RESOLVED" || savedResolution(resolutionKey(report.id, user?.uid ?? ""))) && <div className="flex justify-end border-t px-5 py-5 sm:px-8"><Button onClick={() => setResolving(true)}>{report.status === "RESOLVED" ? "Resume resolution" : "Mark report resolved"}</Button></div>}
    </Card>
    {resolving && <ResolveReportDialog report={report} onClose={() => setResolving(false)} onDone={() => { setResolving(false); refresh() }} />}
  </>
}
function Participant({ id, name }: { id: string; name: string | null }) {
  return <Link href={"/admin/users/" + encodeURIComponent(id)} className="text-sm underline underline-offset-4">{name || "Deactivated user"}</Link>
}
function ResolveReportDialog({ report, onClose, onDone }: { report: DeliveryReport; onClose: () => void; onDone: () => void }) {
  const api = useReportApi(); const { user } = useAuth()
  const storageKey = resolutionKey(report.id, user?.uid ?? "")
  const [attempt, setAttempt] = useState<{ commandId: string; reply: string } | null>(() => {
    try { const saved = JSON.parse(savedResolution(storageKey) ?? "null"); return saved?.commandId && typeof saved.reply === "string" ? saved : null } catch { return null }
  })
  const [note, setNote] = useState(attempt?.reply ?? ""); const [busy, setBusy] = useState(false)
  const [pending, setPending] = useState(Boolean(attempt && report.order && report.violationCategory !== "CREDITS")); const [final, setFinal] = useState(false)
  const locked = useRef(false); const [error, setError] = useState<string | null>(null)
  const succeeded = useRef(false)
  const complete = useCallback(() => {
    if (succeeded.current) return
    succeeded.current = true; clearResolution(storageKey); toast.success("Report resolved."); onDone()
  }, [onDone, storageKey])
  const poll = useCallback(async (signal: AbortSignal) => {
    if (!attempt) return
    try {
      const result = await api.resolution(attempt.commandId, signal)
      if (signal.aborted) return
      if (result.status === "SUCCEEDED") complete()
      else if (result.status === "COMPENSATED" || result.status === "REJECTED") { setPending(false); setFinal(true); setError("The resolution did not complete. You can start a new request.") }
      else if (result.status === "RECONCILIATION_REQUIRED") { setPending(false); setError("This resolution needs operator review. The order remains on hold.") }
    } catch (cause) {
      if (signal.aborted) return
      if (cause instanceof ApiError && cause.status === 404) {
        setPending(false)
        setError("The resolution has not been confirmed. Retry your saved request to continue safely.")
      } else if (cause instanceof ApiError && (cause.status === 401 || cause.status === 403)) {
        setPending(false)
        setError("Sign in with an administrator account to continue checking this resolution.")
      } else {
        setError("Could not check the resolution yet. Your request has been kept and will be checked again.")
      }
    }
  }, [api, attempt, complete])
  useVisiblePolling(poll, pending && !!attempt && !!report.order && report.violationCategory !== "CREDITS", 5000)
  async function submit(event: React.FormEvent) {
    event.preventDefault(); if (!user || !note.trim() || locked.current) return
    locked.current = true; setBusy(true); setError(null)
    const current = attempt ?? { commandId: crypto.randomUUID(), reply: note.trim() }
    setAttempt(current)
    try {
      try { sessionStorage.setItem(storageKey, JSON.stringify(current)) }
      catch { throw new Error("Allow site storage so this resolution can be safely retried.") }
      const result = await api.resolve(report.id, user.uid, current.reply, current.commandId)
      if (result.status === "SUCCEEDED" || result.status === "RESOLVED") complete()
      else { setPending(true); setError("Resolution is being checked. The order stays on hold until confirmation.") }
    }
    catch (cause) {
      const canCheck = Boolean(report.order && report.violationCategory !== "CREDITS")
      const uncertain = cause instanceof ApiError && (cause.status === 0 || cause.status === 409 || cause.status >= 500)
      if (canCheck && uncertain) {
        setPending(true)
        setError("We could not confirm the resolution yet. We are checking your saved request; please do not submit a new one.")
      } else {
        setError(cause instanceof Error ? cause.message : "Could not resolve the report. Please try again.")
      }
    }
    finally { locked.current = false; setBusy(false) }
  }
  return <Dialog open onOpenChange={open => { if (!open && !busy) onClose() }}><DialogContent className="sm:max-w-lg"><form onSubmit={submit} className="space-y-4">
    <DialogHeader><DialogTitle>Resolve report</DialogTitle><DialogDescription>Your reply is only visible to the submitter. Reviewing admins can also view it. Resolving the case releases this report’s completion hold. Order and penalty actions remain separate.</DialogDescription></DialogHeader>
    {report.status === "AWAITING_COURIER_RESPONSE" && <p role="alert" className="rounded-md border p-3 text-sm">The other participant has not responded and their response deadline has not passed. Are you sure you want to resolve this report?</p>}
    <Label htmlFor="resolution-note">Admin reply</Label><Textarea id="resolution-note" maxLength={2000} required value={note} onChange={event => setNote(event.target.value)} disabled={busy || !!attempt} />
    {error && <p role="status" className="text-sm text-muted-foreground">{error}</p>}<DialogFooter><Button type="button" variant="outline" disabled={busy} onClick={onClose}>Back</Button>
      {final ? <Button type="button" onClick={() => { clearResolution(storageKey); setAttempt(null); setFinal(false); setError(null) }}>Start new request</Button>
        : <Button type="submit" disabled={busy || pending || !note.trim()}>{busy ? "Saving…" : attempt ? "Retry same request" : "Confirm resolved"}</Button>}
    </DialogFooter>
  </form></DialogContent></Dialog>
}
function resolutionKey(reportId: string, userId: string) { return `report-resolution:${userId}:${reportId}` }
function savedResolution(key: string) { try { return sessionStorage.getItem(key) } catch { return null } }
function clearResolution(key: string) { try { sessionStorage.removeItem(key) } catch { /* An already committed result remains successful. */ } }
