"use client"

import { useState } from "react"
import Link from "next/link"
import { CheckIcon, CopyIcon } from "lucide-react"
import { toast } from "sonner"
import { cn } from "@/lib/utils"

import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import {
  AlertDialog, AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog"

export function AdminHeading({ title, description, children }: {
  title: string; description: string; children?: React.ReactNode
}) {
  return <div className="flex flex-wrap items-start justify-between gap-4">
    <div><h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
      <p className="mt-1 text-sm text-muted-foreground">{description}</p>
    </div>{children}
  </div>
}

export function AdminComingSoon({ title }: { title: string }) {
  return <Card>
    <CardHeader><CardTitle className="text-xl">{title}</CardTitle></CardHeader>
    <CardContent><p className="text-sm text-muted-foreground">Coming soon</p></CardContent>
  </Card>
}

export function AdminRecordLink({ children, className, underlineOnHover = false, ...props }: React.ComponentProps<typeof Link> & { underlineOnHover?: boolean }) {
  return <Link {...props} className={cn("inline-flex min-w-0 max-w-full font-normal decoration-2 underline-offset-4 focus-visible:outline-2 focus-visible:outline-ring",
    underlineOnHover ? "no-underline hover:underline focus-visible:underline" : "underline", className)}>
    <span className="min-w-0 truncate">{children}</span>
  </Link>
}

export function CopyId({ id, name, compact = false, href, linkLabel }: {
  id: string | null | undefined; name?: string | null; compact?: boolean; href?: string; linkLabel?: string
}) {
  const [copiedId, setCopiedId] = useState<string | null>(null)
  const copied = copiedId === id
  if (!id) return <span className="text-muted-foreground">Unassigned</span>
  async function copy() {
    try {
      await navigator.clipboard.writeText(id!)
      setCopiedId(id!)
      toast.success("ID copied to clipboard.")
    } catch {
      toast.error("Could not copy the ID. Select it manually: " + id)
    }
  }
  return <span className={"inline-flex max-w-full items-center gap-1.5 text-sm font-normal" + (compact ? " w-44 whitespace-nowrap" : "")}>
    {href ? <AdminRecordLink href={href} aria-label={linkLabel} title={name || id} className={compact ? "min-w-0 flex-1" : ""}>{name || id}</AdminRecordLink>
      : <span title={id} className={compact ? "min-w-0 flex-1 truncate" : "min-w-0 [overflow-wrap:anywhere]"}>{name || id}</span>}
    <Button type="button" variant="ghost" size="icon-xs" className="shrink-0" data-copied={copied}
      onClick={(event) => { event.stopPropagation(); void copy() }} title={"Copy ID: " + id} aria-label={"Copy " + (name || id) + " ID"}>
      {copied ? <CheckIcon className="size-3" aria-hidden="true" /> : <CopyIcon className="size-3 text-muted-foreground" aria-hidden="true" />}
    </Button>
  </span>
}

export function AdminFilterForm({ children, onSubmit, hasToggle = false }: {
  children: React.ReactNode; onSubmit: React.FormEventHandler<HTMLFormElement>; hasToggle?: boolean
}) {
  return <form className={"grid grid-cols-2 items-end gap-3 " + (hasToggle
    ? "lg:grid-cols-[10rem_minmax(0,1fr)_auto_auto]"
    : "sm:grid-cols-[10rem_minmax(0,1fr)_auto]")} onSubmit={onSubmit}>
    {children}
  </form>
}

export function AdminFilterActions({ children }: { children: React.ReactNode }) {
  return <div className="col-span-2 flex gap-2 sm:col-span-1">{children}</div>
}

export function AdminSearchForm({ label, onSearch, initialSearchBy = "name" }: {
  label: string; initialSearchBy?: "name" | "id"; onSearch: (searchBy: "name" | "id", q: string) => void
}) {
  const [searchBy, setSearchBy] = useState<"name" | "id">(initialSearchBy)
  const [query, setQuery] = useState("")
  return <AdminFilterForm onSubmit={(event) => {
    event.preventDefault(); onSearch(searchBy, query.trim())
  }}>
    <div className="flex min-w-0 flex-col gap-2"><Label>Search by</Label>
      <Select items={{ name: "Name", id: "ID" }} value={searchBy}
        onValueChange={(value) => setSearchBy(value === "id" ? "id" : "name")}>
        <SelectTrigger aria-label={label + " search type"} className="w-full min-w-0 data-[size=default]:h-10"><SelectValue /></SelectTrigger>
        <SelectContent><SelectItem value="name">Name</SelectItem><SelectItem value="id">ID</SelectItem></SelectContent>
      </Select>
    </div>
    <div className="flex min-w-0 flex-col gap-2">
      <Label htmlFor={label + "-search"}>Search {label.toLowerCase()}</Label>
      <Input className="h-10 min-w-0" id={label + "-search"} maxLength={initialSearchBy === "id" ? 128 : 100} value={query} onChange={(event) => setQuery(event.target.value)}
        placeholder={searchBy === "id" ? "Enter an exact ID" : "Enter a name"} />
    </div>
    <AdminFilterActions>
      <Button className="h-10" type="submit">Search</Button>
      <Button className="h-10" type="button" variant="outline" onClick={() => { setQuery(""); onSearch(searchBy, "") }}>Clear</Button>
    </AdminFilterActions>
  </AdminFilterForm>
}

export function AdminLoadState({ loading, error, empty, retry }: {
  loading: boolean; error: string | null; empty: boolean; retry: () => void
}) {
  if (loading) return <p role="status" className="py-10 text-center text-sm text-muted-foreground">Loading…</p>
  if (error) return <Alert variant="destructive"><AlertDescription>
    <p>{error}</p><Button className="mt-3" variant="outline" onClick={retry}>Try again</Button>
  </AlertDescription></Alert>
  if (empty) return <p className="rounded-xl border py-12 text-center text-sm text-muted-foreground">No results match your search.</p>
  return null
}

export function AdminPagination({ page, totalPages, totalItems, onPage }: {
  page: number; totalPages: number; totalItems: number; onPage: (page: number) => void
}) {
  return <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-4">
    <p className="text-sm text-muted-foreground">{totalItems} results · Page {page} of {Math.max(1, totalPages)}</p>
    <div className="flex gap-2">
      <Button variant="outline" disabled={page <= 1} onClick={() => onPage(page - 1)}>Previous</Button>
      <Button variant="outline" disabled={page >= totalPages} onClick={() => onPage(page + 1)}>Next</Button>
    </div>
  </div>
}

export function AdminConfirmation({ open, title, description, busy, error, onClose, onConfirm,
  confirmLabel = "Confirm deactivation", cancelLabel = "Keep active", busyLabel = "Deactivating…", confirmVariant = "destructive" }: {
  open: boolean; title: string; description: string; busy: boolean; error: string | null
  onClose: () => void; onConfirm: () => void
  confirmLabel?: string; cancelLabel?: string; busyLabel?: string; confirmVariant?: "default" | "destructive"
}) {
  return <AlertDialog open={open} onOpenChange={(next) => { if (!next && !busy) onClose() }}>
    <AlertDialogContent>
      <AlertDialogHeader><AlertDialogTitle>{title}</AlertDialogTitle>
        <AlertDialogDescription>{description}</AlertDialogDescription></AlertDialogHeader>
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      <AlertDialogFooter>
        <Button variant="outline" disabled={busy} onClick={onClose}>{cancelLabel}</Button>
        <Button variant={confirmVariant} disabled={busy} onClick={onConfirm}>{busy ? busyLabel : confirmLabel}</Button>
      </AlertDialogFooter>
    </AlertDialogContent>
  </AlertDialog>
}

export function AdminDetails({ fields }: { fields: [string, React.ReactNode][] }) {
  return <dl className="grid gap-3 sm:grid-cols-2">
    {fields.map(([label, value]) => <div key={label} className="min-w-0">
      <dt className="text-xs font-medium text-muted-foreground">{label}</dt>
      <dd className="mt-1 break-words text-sm">{value ?? "Not provided"}</dd>
    </div>)}
  </dl>
}

export function adminDate(value: string | null | undefined) {
  return value ? new Date(value).toLocaleString() : "Not provided"
}
