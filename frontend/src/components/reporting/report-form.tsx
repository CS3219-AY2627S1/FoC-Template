/*
 * AI Assistance Disclosure:
 * Tool: OpenAI Codex (GPT-5), date: 2026-10-13
 * Mode: Implementation.
 * Scope: Generated or updated frontend code for the team-specified report form, order association, navigation, and completion reminder.
 * Author review: I reviewed for correctness
 */
"use client"

import Image from "next/image"
import { useEffect, useMemo, useRef, useState } from "react"
import { CheckCircle2Icon, LoaderCircleIcon, XIcon } from "lucide-react"

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { useApi } from "@/hooks/use-api"
import type { Order } from "@/lib/orders"
import { ApiError } from "@/lib/api"
import { associatedOrderLabel, REPORT_CATEGORIES, reportCategoryRequiresOrder, validReportCategory, type AssociatedOrderPage, type ReportCategory, type ReportResponse } from "@/lib/reporting"

const MAX_FILES = 5
const MAX_FILE_BYTES = 5 * 1024 * 1024
const TYPES = new Set(["image/jpeg", "image/png", "image/webp"])

type Preview = { file: File; url: string }

export function ReportForm({ initialCategory, initialOrderId, onSubmitted }: { initialCategory: ReportCategory; initialOrderId?: string; onSubmitted?: (report: ReportResponse) => void }) {
  const api = useApi()
  const inputRef = useRef<HTMLInputElement>(null)
  const photosRef = useRef<Preview[]>([])
  const [category, setCategory] = useState(validReportCategory(initialCategory))
  const [description, setDescription] = useState("")
  const [orderId, setOrderId] = useState("")
  const [orders, setOrders] = useState<Order[]>([])
  const [ordersLoading, setOrdersLoading] = useState(false)
  const [ordersError, setOrdersError] = useState("")
  const [photos, setPhotos] = useState<Preview[]>([])
  const [formError, setFormError] = useState("")
  const [successId, setSuccessId] = useState("")
  const [submitting, setSubmitting] = useState(false)
  const required = reportCategoryRequiresOrder(category)

  useEffect(() => {
    if (!required) return
    const controller = new AbortController()
    async function loadAll() {
      setOrdersLoading(true)
      setOrders([])
      setOrdersError("")
      try {
        const collected: Order[] = []
        let page = 1
        let totalPages = 1
        do {
          const mode = category === "ERRAND" ? "mode=courier&" : ""
          const response = await api<AssociatedOrderPage>(`/api/orders/mine/active?${mode}page=${page}&size=100`, { signal: controller.signal })
          collected.push(...response.items.filter(order => ["ACCEPTED", "IN_PROGRESS", "PICKED_UP", "DELIVERED"].includes(order.status)))
          totalPages = response.totalPages
          page += 1
        } while (page <= totalPages)
        if (controller.signal.aborted) return
        setOrders(collected)
        if (category === initialCategory && initialOrderId && collected.some(order => order.id === initialOrderId
          && (initialCategory !== "COURIER" || !!order.courierId))) setOrderId(initialOrderId)
      } catch (error) {
        if (!(error instanceof DOMException && error.name === "AbortError")) setOrdersError("Your orders could not be loaded. Try again shortly.")
      } finally {
        if (!controller.signal.aborted) setOrdersLoading(false)
      }
    }
    void loadAll()
    return () => controller.abort()
  }, [api, category, initialCategory, initialOrderId, required])

  useEffect(() => { photosRef.current = photos }, [photos])
  useEffect(() => () => photosRef.current.forEach(photo => URL.revokeObjectURL(photo.url)), [])

  const selectableOrders = useMemo(() => category === "COURIER" ? orders.filter(order => !!order.courierId) : orders, [category, orders])
  const selectedOrder = useMemo(() => orders.find(order => order.id === orderId), [orders, orderId])
  const orderItems = useMemo(() => Object.fromEntries(selectableOrders.map(order => [order.id, associatedOrderLabel(order)])), [selectableOrders])

  function addPhotos(files: FileList | null) {
    if (!files) return
    setFormError("")
    const incoming = Array.from(files)
    if (photos.length + incoming.length > MAX_FILES) {
      setFormError("You can attach up to five photos.")
      return
    }
    const invalid = incoming.find(file => file.size === 0 || file.size > MAX_FILE_BYTES || !TYPES.has(file.type))
    if (invalid) {
      setFormError("Each photo must be a non-empty JPEG, PNG, or WebP file no larger than 5 MiB.")
      return
    }
    setPhotos(current => [...current, ...incoming.map(file => ({ file, url: URL.createObjectURL(file) }))])
    if (inputRef.current) inputRef.current.value = ""
  }

  function removePhoto(index: number) {
    setPhotos(current => current.filter((photo, currentIndex) => {
      if (currentIndex === index) URL.revokeObjectURL(photo.url)
      return currentIndex !== index
    }))
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    if (submitting) return
    setFormError("")
    setSuccessId("")
    if (!description.trim()) return setFormError("Describe what happened.")
    if (required && !orderId) return setFormError("Select an associated order for this category.")
    if (required && selectedOrder?.isCompletionHold) return setFormError("This order has an active report. Please resolve it before proceeding.")
    setSubmitting(true)
    try {
      const body = new FormData()
      body.append("report", new Blob([JSON.stringify({ category, description: description.trim(), orderId: orderId || null })], { type: "application/json" }))
      photos.forEach(photo => body.append("photos", photo.file))
      const result = await api<ReportResponse>("/api/reports", { method: "POST", body })
      setSuccessId(result.id)
      onSubmitted?.(result)
      photos.forEach(photo => URL.revokeObjectURL(photo.url))
      setDescription("")
      setOrderId("")
      setPhotos([])
    } catch (error) {
      setFormError(error instanceof ApiError ? error.message : "The report could not be submitted. Your form has been kept so you can retry.")
    } finally {
      setSubmitting(false)
    }
  }

  return <div className="mx-auto w-full max-w-3xl">
      <Card>
        <CardHeader><CardTitle>Report details</CardTitle><CardDescription>Fields marked required must be completed before submission.</CardDescription></CardHeader>
        <CardContent>
          <form className="space-y-6" onSubmit={submit} noValidate>
            <FieldGroup>
              <Field>
                <FieldLabel htmlFor="report-category">Category (required)</FieldLabel>
                <Select items={REPORT_CATEGORIES} value={category} onValueChange={value => {
                  const next = value as ReportCategory
                  setCategory(next)
                  setOrderId("")
                  setFormError("")
                }}>
                  <SelectTrigger id="report-category" className="w-full" aria-label="Report category"><SelectValue /></SelectTrigger>
                  <SelectContent>{Object.entries(REPORT_CATEGORIES).map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent>
                </Select>
              </Field>

              {required && <Field>
                <FieldLabel htmlFor="report-order">Associated order (required)</FieldLabel>
                <Select items={orderItems} value={orderId || null} onValueChange={value => setOrderId(value ?? "")} disabled={ordersLoading || !!ordersError}>
                  <SelectTrigger id="report-order" className="w-full" aria-label="Associated order"><SelectValue placeholder={ordersLoading ? "Loading associated orders..." : "Select an order"} /></SelectTrigger>
                  <SelectContent>{selectableOrders.map(order => <SelectItem key={order.id} value={order.id}>{associatedOrderLabel(order)}</SelectItem>)}</SelectContent>
                </Select>
                <FieldDescription>{category === "ERRAND" ? "Choose an accepted, in-progress, picked-up or delivered errand assigned to you. The requester has 24 hours to reply." : "Choose an accepted, in-progress, picked-up or delivered order you created. The assigned courier has 24 hours to reply."} Open and terminal orders cannot be reported.</FieldDescription>
                {ordersError && <FieldError>{ordersError}</FieldError>}
                {initialOrderId && category === initialCategory && !ordersLoading && !selectedOrder && <FieldError>The linked order is not eligible and was not preselected.</FieldError>}
              </Field>}

              <Field>
                <FieldLabel htmlFor="report-description">Description (required)</FieldLabel>
                <Textarea id="report-description" value={description} onChange={event => setDescription(event.target.value)} maxLength={2000} rows={7} placeholder="What happened, when did it happen, and what outcome do you need?" required />
                <FieldDescription>{description.length}/2000 characters</FieldDescription>
              </Field>

              <Field>
                <FieldLabel htmlFor="report-photos">Photos</FieldLabel>
                <Input ref={inputRef} id="report-photos" type="file" accept="image/jpeg,image/png,image/webp" multiple onChange={event => addPhotos(event.target.files)} disabled={photos.length >= MAX_FILES} />
                <FieldDescription>Up to five JPEG, PNG, or WebP files, 5 MiB each.</FieldDescription>
                {photos.length > 0 && <div className="grid grid-cols-2 gap-3 sm:grid-cols-3" aria-label="Photo previews">
                  {photos.map((photo, index) => <div key={`${photo.file.name}-${photo.file.lastModified}-${index}`} className="relative overflow-hidden rounded-lg border bg-muted">
                    <Image src={photo.url} alt={`Preview of ${photo.file.name}`} width={240} height={160} unoptimized className="h-28 w-full object-cover" />
                    <Button type="button" size="icon-xs" variant="destructive" className="absolute right-2 top-2" aria-label={`Remove ${photo.file.name}`} onClick={() => removePhoto(index)}><XIcon /></Button>
                    <p className="truncate px-2 py-1 text-xs" title={photo.file.name}>{photo.file.name}</p>
                  </div>)}
                </div>}
              </Field>
            </FieldGroup>

            {formError && <Alert variant="destructive"><AlertTitle>{formError}</AlertTitle>{formError.includes("active report") && <AlertDescription><a className="underline underline-offset-4" href="/reporting?tab=against-me">View reports against me and reply</a></AlertDescription>}</Alert>}
            {successId && <Alert><CheckCircle2Icon /><AlertTitle>Report submitted</AlertTitle><AlertDescription>Reference: {successId}</AlertDescription></Alert>}
            <Button type="submit" className="w-full sm:w-auto" disabled={submitting || (required && ordersLoading)}>
              {submitting ? <><LoaderCircleIcon className="animate-spin" />Submitting…</> : "Submit report"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
}
