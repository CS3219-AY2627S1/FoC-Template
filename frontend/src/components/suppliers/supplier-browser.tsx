"use client"

import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { useCallback, useEffect, useMemo, useState } from "react"
import { SearchXIcon } from "lucide-react"
import { toast } from "sonner"

import { SupplierFilters } from "@/components/suppliers/supplier-filters"
import { SupplierPagination } from "@/components/suppliers/supplier-pagination"
import { SupplierResults, SupplierResultsSkeleton } from "@/components/suppliers/supplier-results"
import { useAuth } from "@/components/providers/auth-provider"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty"
import { useApi } from "@/hooks/use-api"
import { ApiError } from "@/lib/api"
import {
  apiPathForQuery,
  paramsFromQuery,
  queryFromParams,
  type Page,
  type Supplier,
  type SupplierQuery,
} from "@/lib/suppliers"

type Result = { key: string; data?: Page<Supplier>; error?: string }

export function SupplierBrowser() {
  const api = useApi()
  const { user, loading: authLoading } = useAuth()
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const query = useMemo(() => queryFromParams(new URLSearchParams(searchParams.toString())), [searchParams])
  const requestPath = apiPathForQuery(query)

  const [result, setResult] = useState<Result | null>(null)
  const [types, setTypes] = useState<string[]>([])
  const [locating, setLocating] = useState(false)

  const hrefFor = useCallback(
    (changes: Partial<SupplierQuery>) => {
      const params = paramsFromQuery({ ...query, ...changes }).toString()
      return params ? `${pathname}?${params}` : pathname
    },
    [query, pathname],
  )
  const update = useCallback(
    (changes: Partial<SupplierQuery>) => router.replace(hrefFor(changes), { scroll: false }),
    [router, hrefFor],
  )

  // The catalogue page, re-fetched whenever the URL (and so the query) changes.
  useEffect(() => {
    if (authLoading || !user) return

    const controller = new AbortController()
    api<Page<Supplier>>(requestPath, { signal: controller.signal })
      .then((data) => setResult({ key: requestPath, data }))
      .catch((error: unknown) => {
        if (controller.signal.aborted) return
        const message = error instanceof ApiError ? error.message : "Could not load suppliers."
        setResult({ key: requestPath, error: message })
      })
    return () => controller.abort()
  }, [api, authLoading, requestPath, user])

  useEffect(() => {
    if (authLoading || !user) return

    api<{ items: string[] }>("/api/suppliers/types")
      .then((data) => setTypes(data.items))
      .catch(() => setTypes([]))
  }, [api, authLoading, user])

  function toggleNearMe() {
    if (query.near) {
      update({ near: null, sort: "name", page: 1 })
      return
    }
    if (!("geolocation" in navigator)) {
      toast.error("Location is not available in this browser.")
      return
    }
    setLocating(true)
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setLocating(false)
        update({ near: { lat: position.coords.latitude, lng: position.coords.longitude }, sort: "distance", page: 1 })
      },
      () => {
        setLocating(false)
        toast.error("Allow location access to sort suppliers by distance.")
      },
      { enableHighAccuracy: false, timeout: 10_000, maximumAge: 60_000 },
    )
  }

  const current = result?.key === requestPath ? result : null
  const page = current?.data

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-5 px-4 py-6 sm:py-8">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-semibold tracking-tight">Suppliers</h1>
          <p className="text-sm text-muted-foreground">
            Campus stores, facilities and landmarks you can pick up from or deliver to.
          </p>
        </div>
      </div>

      <SupplierFilters
        query={query}
        types={types}
        locating={locating}
        onChange={update}
        onToggleNearMe={toggleNearMe}
      />

      {current?.error ? (
        <Alert variant="destructive">
          <AlertTitle>Suppliers could not be loaded</AlertTitle>
          <AlertDescription>{current.error}</AlertDescription>
        </Alert>
      ) : !page ? (
        <SupplierResultsSkeleton />
      ) : page.items.length === 0 ? (
        <Empty className="border">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <SearchXIcon />
            </EmptyMedia>
            <EmptyTitle>No suppliers found</EmptyTitle>
            <EmptyDescription>{page.message ?? "Try a different search or clear the filters."}</EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <>
          <p className="text-sm text-muted-foreground" aria-live="polite">
            Showing {(page.page - 1) * page.size + 1}–{(page.page - 1) * page.size + page.items.length} of{" "}
            {page.totalItems} supplier{page.totalItems === 1 ? "" : "s"}
          </p>
          <SupplierResults suppliers={page.items} showDistance={Boolean(query.near)} />
          <SupplierPagination
            page={page.page}
            totalPages={page.totalPages}
            hrefFor={(p) => hrefFor({ page: p })}
            onNavigate={(p) => {
              update({ page: p })
              window.scrollTo({ top: 0, behavior: "smooth" })
            }}
          />
        </>
      )}
    </div>
  )
}
