"use client"

import { useEffect, useRef, useState } from "react"
import { ArrowDownIcon, ArrowUpIcon, LocateFixedIcon, LocateIcon, SearchIcon, XIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { SORT_LABELS, type SortKey, type SupplierQuery } from "@/lib/suppliers"

const ALL_TYPES = "__all__"

type Props = {
  query: SupplierQuery
  types: string[]
  locating: boolean
  onChange: (changes: Partial<SupplierQuery>) => void
  onToggleNearMe: () => void
}

/**
 * Filters wrap onto extra rows on narrow screens instead of hiding behind a drawer, so every
 * control is one tap away on both phone and desktop (NFR2.2.1).
 */
export function SupplierFilters({ query, types, locating, onChange, onToggleNearMe }: Props) {
  const [text, setText] = useState(query.q)
  const latest = useRef(query.q)

  // Keep the box in sync when the URL changes (back/forward, "Clear").
  useEffect(() => {
    if (query.q !== latest.current) {
      latest.current = query.q
      setText(query.q)
    }
  }, [query.q])

  // Debounce typing so we query the service at most every 300 ms.
  useEffect(() => {
    if (text === latest.current) return
    const timer = setTimeout(() => {
      latest.current = text
      onChange({ q: text, page: 1 })
    }, 300)
    return () => clearTimeout(timer)
  }, [text, onChange])

  const typeItems = { [ALL_TYPES]: "All types", ...Object.fromEntries(types.map((t) => [t, t])) }
  const sortItems = Object.fromEntries(
    Object.entries(SORT_LABELS).filter(([key]) => key !== "distance" || query.near),
  ) as Record<string, string>
  const hasFilters = Boolean(query.q || query.type || query.openNow || query.near)

  return (
    <div className="flex flex-col gap-3">
      <div className="relative">
        <SearchIcon className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          type="search"
          value={text}
          onChange={(event) => setText(event.target.value)}
          placeholder="Search by name, building or landmark"
          aria-label="Search suppliers"
          className="h-9 pl-8"
          maxLength={100}
        />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Select
          items={typeItems}
          value={query.type || ALL_TYPES}
          onValueChange={(value) => onChange({ type: value === ALL_TYPES || !value ? "" : String(value), page: 1 })}
        >
          <SelectTrigger aria-label="Filter by type" className="min-w-36">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {Object.entries(typeItems).map(([value, label]) => (
              <SelectItem key={value} value={value}>
                {label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select
          items={sortItems}
          value={query.sort}
          onValueChange={(value) => value && onChange({ sort: value as SortKey, page: 1 })}
        >
          <SelectTrigger aria-label="Sort by" className="min-w-36">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {Object.entries(sortItems).map(([value, label]) => (
              <SelectItem key={value} value={value}>
                {label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Button
          variant="outline"
          size="icon"
          aria-label={query.order === "asc" ? "Sort ascending (tap for descending)" : "Sort descending (tap for ascending)"}
          onClick={() => onChange({ order: query.order === "asc" ? "desc" : "asc", page: 1 })}
        >
          {query.order === "asc" ? <ArrowUpIcon /> : <ArrowDownIcon />}
        </Button>

        <Button
          variant={query.near ? "secondary" : "outline"}
          onClick={onToggleNearMe}
          disabled={locating}
          aria-pressed={Boolean(query.near)}
        >
          {query.near ? <LocateFixedIcon /> : <LocateIcon />}
          {locating ? "Locating…" : "Near me"}
        </Button>

        <Label className="flex h-8 cursor-pointer items-center gap-2 rounded-lg border px-2.5 text-sm font-normal">
          <Switch checked={query.openNow} onCheckedChange={(checked) => onChange({ openNow: checked, page: 1 })} />
          Open now
        </Label>

        {hasFilters && (
          <Button
            variant="ghost"
            onClick={() => onChange({ q: "", type: "", openNow: false, near: null, sort: "name", order: "asc", page: 1 })}
          >
            <XIcon />
            Clear
          </Button>
        )}
      </div>
    </div>
  )
}
