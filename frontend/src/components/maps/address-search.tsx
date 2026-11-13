"use client"

import { useEffect, useId, useState } from "react"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Button } from "@/components/ui/button"
import { searchAddresses, type AddressResult } from "@/lib/map-provider"

export function AddressSearch({ onSelect, disabled = false }: { onSelect: (address: AddressResult) => void; disabled?: boolean }) {
  const id = useId()
  const [query, setQuery] = useState("")
  const [selectedQuery, setSelectedQuery] = useState("")
  const [closed, setClosed] = useState(false)
  const [highlight, setHighlight] = useState(0)
  const [revision, setRevision] = useState(0)
  const [state, setState] = useState<{ query: string; items: AddressResult[]; loading: boolean; error: boolean } | null>(null)
  useEffect(() => {
    if (disabled || query.trim().length < 3 || query === selectedQuery) return
    const controller = new AbortController()
    let active = true
    const timer = window.setTimeout(() => {
      setState({ query, items: [], loading: true, error: false })
      searchAddresses(query, controller.signal).then((items) => {
        if (active) setState({ query, items, loading: false, error: false })
      }).catch(() => {
        if (active) setState({ query, items: [], loading: false, error: true })
      })
    }, 650)
    return () => { active = false; window.clearTimeout(timer); controller.abort() }
  }, [query, selectedQuery, disabled, revision])
  const current = state?.query === query ? state : null
  const items = !closed && !disabled && query !== selectedQuery ? current?.items ?? [] : []
  function select(address: AddressResult) {
    setQuery(address.label)
    setSelectedQuery(address.label)
    setClosed(true)
    onSelect(address)
  }
  return <div className="space-y-2">
    <Label htmlFor={id}>Address search</Label>
    <Input id={id} role="combobox" autoComplete="off" placeholder="Search an address or campus location" maxLength={200}
      value={query} disabled={disabled} aria-expanded={items.length > 0} aria-controls={id + "-results"}
      aria-autocomplete="list" aria-activedescendant={items[highlight] ? id + "-result-" + highlight : undefined}
      onChange={(event) => { setQuery(event.target.value); setClosed(false); setHighlight(0) }}
      onKeyDown={(event) => {
        if (event.key === "Escape") setClosed(true)
        if (event.key === "ArrowDown" && items.length) { event.preventDefault(); setHighlight((index) => (index + 1) % items.length) }
        if (event.key === "ArrowUp" && items.length) { event.preventDefault(); setHighlight((index) => (index - 1 + items.length) % items.length) }
        if (event.key === "Enter") { event.preventDefault(); if (items[highlight]) select(items[highlight]) }
      }} />
    {items.length > 0 && <ul id={id + "-results"} role="listbox" aria-label="Address suggestions" className="max-h-48 overflow-y-auto rounded-lg border">
      {items.map((address, index) => <li key={address.id} role="presentation"><button type="button" role="option"
        id={id + "-result-" + index} aria-selected={highlight === index} className="w-full px-3 py-2 text-left text-sm hover:bg-muted aria-selected:bg-muted"
        onClick={() => select(address)}>{address.label}</button></li>)}
    </ul>}
    {current?.loading && <p role="status" className="text-xs text-muted-foreground">Searching addresses…</p>}
    {current?.error && <p role="status" className="text-sm text-muted-foreground">Address search is unavailable. Enter coordinates manually or <Button type="button" variant="link" onClick={() => setRevision((value) => value + 1)}>try again</Button>.</p>}
    {current && !current.loading && !current.error && !items.length && !closed && query !== selectedQuery && <p className="text-xs text-muted-foreground">No matching addresses. Try a different search or place the pin manually.</p>}
    <p className="text-xs text-muted-foreground">Address suggestions by Photon / OpenStreetMap. Type at least 3 characters.</p>
  </div>
}
