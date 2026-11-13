"use client"

import { useEffect, useState } from "react"
import { Combobox } from "@base-ui/react/combobox"
import { ChevronDownIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { useApi } from "@/hooks/use-api"
import { supplierOptionLabel, type Page, type Supplier } from "@/lib/suppliers"

type Results = {
  query: string; items: Supplier[]; page: number; totalPages: number; loading: boolean; error: string | null
}

type SupplierSelectorProps = {
  id: string; label: string; value: string; onChange: (id: string) => void
  disabled?: boolean; "aria-invalid"?: boolean; "aria-describedby"?: string
}

export function SupplierSelector({ id, label, value, onChange, disabled = false, ...aria }: SupplierSelectorProps) {
  const api = useApi()
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState("")
  const [page, setPage] = useState(1)
  const [revision, setRevision] = useState(0)
  const [selected, setSelected] = useState<Supplier | null>(null)
  const [results, setResults] = useState<Results | null>(null)
  const term = query.trim()
  const validSearch = term.length === 0 || term.length >= 2
  const current = results?.query === term ? results : null
  const items = validSearch ? current?.items ?? [] : []
  const loading = validSearch && (!current || current.loading)

  useEffect(() => {
    if (!open || disabled || !validSearch) return
    const controller = new AbortController()
    let active = true
    const timer = window.setTimeout(() => {
      const params = new URLSearchParams({ status: "active", page: String(page), size: "20", sort: "name", order: "asc" })
      if (term) params.set("q", term)
      api<Page<Supplier>>("/api/suppliers?" + params, { signal: controller.signal }).then((data) => {
        if (!active) return
        setResults((previous) => {
          const preceding = page > 1 && previous?.query === term ? previous.items : []
          return { query: term, items: Array.from(new Map([...preceding, ...data.items].map((item) => [item.id, item])).values()),
            page, totalPages: data.totalPages, loading: false, error: null }
        })
      }).catch((error: unknown) => {
        if (!active) return
        setResults((previous) => ({ query: term, items: previous?.query === term ? previous.items : [],
          page: previous?.query === term ? previous.page : 0, totalPages: previous?.query === term ? previous.totalPages : 0,
          loading: false, error: error instanceof Error ? error.message : "Could not load suppliers." }))
      })
    }, term && page === 1 ? 300 : 0)
    return () => { active = false; window.clearTimeout(timer); controller.abort() }
  }, [api, open, disabled, validSearch, term, page, revision])

  function search(next: string) {
    setQuery(next)
    if (next.trim() !== term) {
      setPage(1)
      setResults(null)
    }
  }

  return <Combobox.Root<Supplier> items={items} filter={null}
    value={selected?.id === value ? selected : null} inputValue={query} disabled={disabled}
    itemToStringLabel={supplierOptionLabel} itemToStringValue={(item) => item.id}
    isItemEqualToValue={(item, choice) => item.id === choice.id}
    open={open} onOpenChange={(next) => {
      if (next && !open) { setQuery(""); setPage(1); setResults(null) }
      setOpen(next)
    }}
    onInputValueChange={(next, details) => {
      if (details.reason === "input-change" || details.reason === "input-clear") search(next)
    }}
    onValueChange={(choice) => {
      if (choice) { setSelected(choice); onChange(choice.id) }
    }}>
    <Combobox.Trigger id={id} aria-label={label} {...aria} render={<Button type="button" variant="outline"
      className="h-9 w-full min-w-0 justify-between font-normal" />}>
      <span className={"truncate " + (value ? "" : "text-muted-foreground")}>
        {selected?.id === value ? supplierOptionLabel(selected) : value || `Select a ${label.toLowerCase()}`}
      </span><ChevronDownIcon className="shrink-0 text-muted-foreground" />
    </Combobox.Trigger>
    <Combobox.Portal>
      <Combobox.Positioner sideOffset={4} align="start" className="z-50">
        <Combobox.Popup className="max-h-(--available-height) w-(--anchor-width) max-w-[calc(100vw-2rem)] overflow-y-auto rounded-lg bg-popover p-2 text-popover-foreground shadow-md ring-1 ring-foreground/10">
          <div className="flex gap-2">
            <Combobox.Input render={<Input />} aria-label={"Search " + label.toLowerCase() + "s"}
              placeholder="Search by name or building" maxLength={100} className="h-9 min-w-0"
              onKeyDown={(event) => { if (event.key === "Enter") event.preventDefault() }} />
            {query && <Button type="button" variant="outline" disabled={disabled} onClick={() => search("")}>Clear</Button>}
          </div>
          <Combobox.List aria-label={label + " options"} aria-busy={loading}
            className="mt-2 max-h-60 overflow-y-auto overscroll-contain">
            {(item: Supplier) => <Combobox.Item key={item.id} value={item}
              className="cursor-default rounded-md px-3 py-2 text-sm break-words outline-none data-highlighted:bg-muted data-selected:bg-muted">
              {supplierOptionLabel(item)}
            </Combobox.Item>}
          </Combobox.List>
          {!validSearch && <p role="status" className="p-2 text-sm text-muted-foreground">Type at least 2 characters, or clear to browse.</p>}
          {loading && <p role="status" className="p-2 text-sm text-muted-foreground">Loading suppliers…</p>}
          {current?.error && <div className="space-y-2 p-2">
            <p role="alert" className="text-sm text-destructive">{current.error}</p>
            <Button type="button" variant="outline" disabled={disabled || loading} onClick={() => {
              setResults((previous) => previous && { ...previous, loading: true, error: null })
              setRevision((previous) => previous + 1)
            }}>Try again</Button>
          </div>}
          {validSearch && current && !loading && !current.error && !items.length &&
            <p role="status" className="p-2 text-sm text-muted-foreground">{term ? "No matching suppliers. Try another name or building." : "No active suppliers available."}</p>}
          {current && !loading && !current.error && current.page < current.totalPages &&
            <Button type="button" variant="ghost" className="mt-2 w-full" disabled={disabled} onClick={() => {
              setResults((previous) => previous && { ...previous, loading: true })
              setPage((previous) => previous + 1)
            }}>Show more</Button>}
        </Combobox.Popup>
      </Combobox.Positioner>
    </Combobox.Portal>
  </Combobox.Root>
}
