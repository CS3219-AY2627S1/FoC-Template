/*
 * AI Assistance Disclosure:
 * Tool: OpenAI Codex (GPT-5), date: 2026-10-27
 * Mode: Implementation.
 * Scope: Generated the authenticated reporting hub, caller-scoped report views, polling, and courier response workflow.
 * Author review: I reviewed for correctness
 */
"use client"

import Image from "next/image"
import { useCallback, useEffect, useRef, useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { LoaderCircleIcon, XIcon } from "lucide-react"

import { RequireAuth } from "@/components/require-auth"
import { ReportForm } from "@/components/reporting/report-form"
import { useAuth } from "@/components/providers/auth-provider"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { useApi } from "@/hooks/use-api"
import { ORDER_POLL_INTERVAL_MS, useVisiblePolling } from "@/hooks/use-visible-polling"
import { ApiError } from "@/lib/api"
import {
  REPORT_CATEGORY_LABELS,
  REPORT_STATUS_LABELS,
  type ReportCategory,
  type ReportPage,
  type ReportResponse,
} from "@/lib/reporting"

type ReportingTab = "create" | "submitted" | "against-me"
const MAX_FILES = 5
const MAX_FILE_BYTES = 5 * 1024 * 1024
const IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"])
type PhotoPreview = { file: File; url: string }

export function ReportingHub({ initialTab, initialCategory, initialOrderId }: {
  initialTab: ReportingTab
  initialCategory: ReportCategory
  initialOrderId?: string
}) {
  const api = useApi()
  const { user, loading: authLoading } = useAuth()
  const router = useRouter()
  const searchParams = useSearchParams()
  const requestedTab = searchParams.get("tab")
  const tab: ReportingTab = requestedTab === "submitted" || requestedTab === "against-me" || requestedTab === "create" ? requestedTab : initialTab
  const [page, setPage] = useState(1)
  const [reports, setReports] = useState<{ tab: ReportingTab; page: number; data: ReportPage } | null>(null)
  const [listError, setListError] = useState("")

  const loadReports = useCallback(async (signal: AbortSignal) => {
    if (tab === "create") return
    try {
      const view = tab === "submitted" ? "submitted" : "against-me"
      const result = await api<ReportPage>(`/api/reports/mine?view=${view}&page=${page}&size=20`, { signal })
      setReports({ tab, page, data: result })
      setListError("")
    } catch (error) {
      if (!(error instanceof DOMException && error.name === "AbortError")) {
        setListError(error instanceof ApiError ? error.message : "Reports could not be loaded. Try again shortly.")
      }
    }
  }, [api, page, tab])

  const refresh = useVisiblePolling(loadReports, !!user && !authLoading && tab !== "create", ORDER_POLL_INTERVAL_MS)

  function selectTab(next: ReportingTab) {
    const query = new URLSearchParams(searchParams.toString())
    query.set("tab", next)
    router.replace(`/reporting?${query}`, { scroll: false })
    setPage(1)
    setReports(null)
    setListError("")
  }

  return <RequireAuth>
    <main className="mx-auto w-full max-w-5xl px-4 py-8 sm:py-10">
      <div className="mb-6 space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Reporting</h1>
        <p className="text-muted-foreground">Choose Order for an active request you created, Errand for an active task assigned to you, or General for other issues. The other participant has 24 hours to reply.</p>
      </div>

      <div role="tablist" aria-label="Reporting sections" className="mb-6 grid grid-cols-3 gap-1 rounded-xl border bg-muted/40 p-1">
        <TabButton selected={tab === "create"} onClick={() => selectTab("create")}>Report issue</TabButton>
        <TabButton selected={tab === "submitted"} onClick={() => selectTab("submitted")}>Submitted</TabButton>
        <TabButton selected={tab === "against-me"} onClick={() => selectTab("against-me")}>Against me</TabButton>
      </div>

      <section role="tabpanel">
        {tab === "create" && <ReportForm
          initialCategory={initialCategory}
          initialOrderId={initialOrderId}
          onSubmitted={() => selectTab("submitted")}
        />}
        {tab !== "create" && <ReportList
          data={reports?.tab === tab && reports.page === page ? reports.data : null}
          error={listError}
          againstMe={tab === "against-me"}
          onPage={setPage}
          onResponded={() => void refresh()}
        />}
      </section>
    </main>
  </RequireAuth>
}

function TabButton({ selected, onClick, children }: { selected: boolean; onClick: () => void; children: React.ReactNode }) {
  return <button
    type="button"
    role="tab"
    aria-selected={selected}
    onClick={onClick}
    className={`min-h-10 rounded-lg px-2 text-sm font-medium transition-colors ${selected ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
  >{children}</button>
}

function ReportList({ data, error, againstMe, onPage, onResponded }: {
  data: ReportPage | null
  error: string
  againstMe: boolean
  onPage: (page: number) => void
  onResponded: () => void
}) {
  if (!data && !error) return <p className="py-12 text-center text-sm text-muted-foreground" aria-live="polite">Loading reports…</p>
  if (error && !data) return <Alert variant="destructive"><AlertTitle>Could not load reports</AlertTitle><AlertDescription>{error}</AlertDescription></Alert>
  if (!data?.items.length) return <Card><CardHeader><CardTitle>No reports here</CardTitle><CardDescription>{againstMe ? "No reports currently need your response as an order participant." : "You have not submitted any reports."}</CardDescription></CardHeader></Card>

  return <div className="space-y-4">
    {error && <Alert variant="destructive"><AlertTitle>Refresh failed</AlertTitle><AlertDescription>{error}</AlertDescription></Alert>}
    {data.items.map(report => <ReportCard key={report.id} report={report} againstMe={againstMe} onResponded={onResponded} />)}
    {data.totalPages > 1 && <div className="flex items-center justify-between gap-3 pt-2">
      <Button type="button" variant="outline" disabled={data.page <= 1} onClick={() => onPage(data.page - 1)}>Previous</Button>
      <span className="text-sm text-muted-foreground">Page {data.page} of {data.totalPages}</span>
      <Button type="button" variant="outline" disabled={data.page >= data.totalPages} onClick={() => onPage(data.page + 1)}>Next</Button>
    </div>}
  </div>
}

function ReportCard({ report, againstMe, onResponded }: { report: ReportResponse; againstMe: boolean; onResponded: () => void }) {
  return <Card>
    <CardHeader className="gap-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <CardTitle>{REPORT_CATEGORY_LABELS[report.category]} report</CardTitle>
          <CardDescription>Submitted {formatDate(report.createdAt)} · Reference {report.id}</CardDescription>
        </div>
        <Badge variant={report.status === "RESOLVED" ? "secondary" : "outline"}>{REPORT_STATUS_LABELS[report.status]}</Badge>
      </div>
    </CardHeader>
    <CardContent className="space-y-4">
      <p className="whitespace-pre-wrap text-sm">{report.description}</p>
      {report.orderId && <p className="text-sm text-muted-foreground">Order: {report.orderId}</p>}
      {!againstMe && report.resolutionNote && <div className="rounded-lg border p-3"><p className="text-sm font-medium">Admin reply</p><p className="whitespace-pre-wrap text-sm">{report.resolutionNote}</p></div>}
      {report.responseDeadlineAt && report.status === "AWAITING_COURIER_RESPONSE" && <p className="text-sm font-medium">Response due by {formatDate(report.responseDeadlineAt)}</p>}
      {(report.responseExplanation ?? report.courierResponse) && <div className="rounded-lg border bg-muted/30 p-3">
        <p className="mb-1 text-sm font-medium">Response</p>
        <p className="whitespace-pre-wrap text-sm">{report.responseExplanation ?? report.courierResponse}</p>
        {report.respondedAt && <p className="mt-2 text-xs text-muted-foreground">Responded {formatDate(report.respondedAt)}</p>}
        {report.responseAttachments.length > 0 && <p className="mt-2 text-xs text-muted-foreground">Evidence: {report.responseAttachments.map(item => item.filename).join(", ")}</p>}
      </div>}
      {report.attachments.length > 0 && <p className="text-xs text-muted-foreground">Reporter evidence: {report.attachments.map(item => item.filename).join(", ")}</p>}
      {againstMe && report.status === "AWAITING_COURIER_RESPONSE" && !report.respondedAt && <ParticipantResponseForm reportId={report.id} onResponded={onResponded} />}
      {againstMe && report.status === "READY_FOR_REVIEW" && !report.respondedAt && <Alert><AlertTitle>Response window closed</AlertTitle><AlertDescription>This report is ready for administrator review and can no longer receive a response.</AlertDescription></Alert>}
    </CardContent>
  </Card>
}

function ParticipantResponseForm({ reportId, onResponded }: { reportId: string; onResponded: () => void }) {
  const api = useApi()
  const inputRef = useRef<HTMLInputElement>(null)
  const photosRef = useRef<PhotoPreview[]>([])
  const [explanation, setExplanation] = useState("")
  const [photos, setPhotos] = useState<PhotoPreview[]>([])
  const [error, setError] = useState("")
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => { photosRef.current = photos }, [photos])
  useEffect(() => () => photosRef.current.forEach(photo => URL.revokeObjectURL(photo.url)), [])

  function choosePhotos(files: FileList | null) {
    if (!files) return
    const incoming = Array.from(files)
    if (photos.length + incoming.length > MAX_FILES) return setError("You can attach up to five photos.")
    if (incoming.some(file => !IMAGE_TYPES.has(file.type) || file.size === 0 || file.size > MAX_FILE_BYTES)) {
      return setError("Each photo must be a non-empty JPEG, PNG, or WebP file no larger than 5 MiB.")
    }
    setPhotos(current => [...current, ...incoming.map(file => ({ file, url: URL.createObjectURL(file) }))])
    if (inputRef.current) inputRef.current.value = ""
    setError("")
  }

  function removePhoto(index: number) {
    setPhotos(current => current.filter((photo, currentIndex) => {
      if (currentIndex === index) URL.revokeObjectURL(photo.url)
      return currentIndex !== index
    }))
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    if (!explanation.trim() || submitting) {
      if (!explanation.trim()) setError("Enter your response before submitting.")
      return
    }
    setSubmitting(true)
    setError("")
    try {
      const body = new FormData()
      body.append("response", new Blob([JSON.stringify({ explanation: explanation.trim() })], { type: "application/json" }))
      photos.forEach(photo => body.append("photos", photo.file))
      await api<ReportResponse>(`/api/reports/${reportId}/response`, { method: "POST", body })
      setExplanation("")
      photos.forEach(photo => URL.revokeObjectURL(photo.url))
      setPhotos([])
      if (inputRef.current) inputRef.current.value = ""
      onResponded()
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : "Your response could not be submitted. Your text and files have been kept so you can retry.")
    } finally {
      setSubmitting(false)
    }
  }

  return <form onSubmit={submit} className="space-y-3 rounded-lg border p-3">
    <Field>
      <FieldLabel htmlFor={`response-${reportId}`}>Your response (required)</FieldLabel>
      <Textarea id={`response-${reportId}`} value={explanation} maxLength={2000} rows={5} onChange={event => setExplanation(event.target.value)} placeholder="Explain what happened from your perspective." />
      <FieldDescription>{explanation.length}/2000 characters. You can respond once, within 24 hours.</FieldDescription>
    </Field>
    <Field>
      <FieldLabel htmlFor={`response-files-${reportId}`}>Evidence photos</FieldLabel>
      <Input ref={inputRef} id={`response-files-${reportId}`} type="file" accept="image/jpeg,image/png,image/webp" multiple onChange={event => choosePhotos(event.target.files)} disabled={photos.length >= MAX_FILES} />
      <FieldDescription>Up to five JPEG, PNG, or WebP files, 5 MiB each.</FieldDescription>
      {photos.length > 0 && <div className="grid grid-cols-2 gap-3 sm:grid-cols-3" aria-label="Response photo previews">
        {photos.map((photo, index) => <div key={`${photo.file.name}-${photo.file.lastModified}-${index}`} className="relative overflow-hidden rounded-lg border bg-muted">
          <Image src={photo.url} alt={`Preview of ${photo.file.name}`} width={240} height={160} unoptimized className="h-28 w-full object-cover" />
          <Button type="button" size="icon-xs" variant="destructive" className="absolute right-2 top-2" aria-label={`Remove ${photo.file.name}`} onClick={() => removePhoto(index)}><XIcon /></Button>
          <p className="truncate px-2 py-1 text-xs" title={photo.file.name}>{photo.file.name}</p>
        </div>)}
      </div>}
    </Field>
    {error && <Alert variant="destructive"><AlertTitle>Could not submit response</AlertTitle><AlertDescription>{error}</AlertDescription></Alert>}
    <Button type="submit" disabled={submitting}>{submitting ? <><LoaderCircleIcon className="animate-spin" />Submitting…</> : "Submit response"}</Button>
  </form>
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(new Date(value))
}

export type { ReportingTab }
