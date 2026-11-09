/*
 * AI Assistance Disclosure:
 * Tool: OpenAI Codex (GPT-6), date: 2026-09-27
 * Scope: Implemented the live responsive member Supplier detail page for
 * issue #29.
 * Author review: Reviewed and approved by @ron.
 * Additional AI assistance: Claude Code (Claude Opus 5.5), 2026-11-09. Scope: added
 * the link to post an errand from this Supplier. Author review: Reviewed and approved by @mattis.
 */
import { useEffect, useState } from 'react'
import { Link, useLocation, useParams } from 'react-router'
import { getSupplier } from '../api/supplierApi'
import { TopBar } from '../components/TopBar'
import { formatSupplierCategory, formatTypicalHours } from './presentation'
import { SupplierImage } from './SupplierImage'
import { SupplierRequestError } from './SupplierRequestError'
import type { Supplier } from './types'

interface DetailLocationState {
  readonly from?: string
}

export function SupplierDetailPage() {
  const { id } = useParams<{ id: string }>()
  const location = useLocation()
  const state = location.state as DetailLocationState | null
  const backPath = state?.from?.startsWith('/suppliers') ? state.from : '/suppliers'
  const [retry, setRetry] = useState(0)
  const requestKey = `${id ?? ''}:${retry}`
  const [requestState, setRequestState] = useState<{
    readonly key: string
    readonly supplier: Supplier | null
    readonly error: unknown
  }>({ key: '', supplier: null, error: null })
  const loading = requestState.key !== requestKey
  const supplier = loading ? null : requestState.supplier
  const error = loading ? null : requestState.error

  useEffect(() => {
    if (!id) return
    const controller = new AbortController()
    let current = true
    getSupplier(id, controller.signal)
      .then(({ supplier: result }) => {
        if (!current) return
        setRequestState({ key: requestKey, supplier: result, error: null })
      })
      .catch((requestError: unknown) => {
        if (!current || (requestError instanceof DOMException && requestError.name === 'AbortError')) return
        setRequestState({ key: requestKey, supplier: null, error: requestError })
      })

    return () => {
      current = false
      controller.abort()
    }
  }, [id, requestKey])

  return (
    <>
      <TopBar />
      <main className="mx-auto w-full max-w-5xl px-4 py-6 sm:px-6 sm:py-8">
        <Link
          to={backPath}
          className="inline-flex min-h-11 items-center rounded-lg px-2 text-sm font-semibold text-navy-700 hover:bg-navy-100"
        >
          ← Back to Suppliers
        </Link>

        {loading && <DetailSkeleton />}
        {!loading && error !== null && (
          <div className="mt-4">
            <SupplierRequestError error={error} onRetry={() => setRetry((value) => value + 1)} />
          </div>
        )}
        {!loading && !error && supplier && <SupplierDetail supplier={supplier} />}
      </main>
    </>
  )
}

function SupplierDetail({ supplier }: { readonly supplier: Supplier }) {
  const building = supplier.floor
    ? `${supplier.buildingLabel}, floor ${supplier.floor}`
    : supplier.buildingLabel
  const hasCoordinates = supplier.latitude !== null && supplier.longitude !== null

  return (
    <article className="mt-4 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="grid min-w-0 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)]">
        <SupplierImage
          imagePath={supplier.imagePath}
          supplierName={supplier.name}
          className="aspect-[16/10] h-full min-h-64 w-full"
        />
        <div className="min-w-0 p-6 sm:p-8">
          <div className="flex flex-wrap gap-2">
            {supplier.categories.map((category) => (
              <span key={category} className="rounded-full bg-navy-100 px-3 py-1 text-xs font-semibold text-navy-800">
                {formatSupplierCategory(category)}
              </span>
            ))}
          </div>
          <h1 className="mt-4 break-words text-3xl font-bold tracking-tight text-navy-900">{supplier.name}</h1>
          <p className="mt-2 text-base font-semibold text-slate-700">{building}</p>
          <p className="mt-5 break-words text-sm leading-7 text-slate-600">{supplier.locationDescription}</p>

          <dl className="mt-7 divide-y divide-slate-200 rounded-xl border border-slate-200">
            <DetailRow term="Typical hours" description={formatTypicalHours(supplier)} />
            <DetailRow term="Building" description={building} />
            <DetailRow
              term="Coordinates"
              description={hasCoordinates ? `${supplier.latitude}, ${supplier.longitude}` : 'Not available'}
            />
          </dl>
          <Link
            to={`/errands/new?supplierId=${encodeURIComponent(supplier.id)}`}
            className="mt-6 inline-flex min-h-11 items-center rounded-lg bg-accent-500 px-5 py-2 text-sm font-semibold text-white hover:bg-accent-600"
          >
            Request an errand from here
          </Link>
          <p className="mt-4 text-xs leading-5 text-slate-500">Typical hours are guidance only and may change.</p>
        </div>
      </div>
    </article>
  )
}

function DetailRow({ term, description }: { readonly term: string; readonly description: string }) {
  return (
    <div className="grid min-w-0 gap-1 px-4 py-3 sm:grid-cols-[9rem_minmax(0,1fr)] sm:gap-4">
      <dt className="text-sm font-semibold text-navy-900">{term}</dt>
      <dd className="min-w-0 break-words text-sm text-slate-600">{description}</dd>
    </div>
  )
}

function DetailSkeleton() {
  return (
    <div className="mt-4 animate-pulse overflow-hidden rounded-2xl border border-slate-200 bg-white" role="status">
      <span className="sr-only">Loading Supplier details…</span>
      <div className="grid lg:grid-cols-2">
        <div className="aspect-[16/10] bg-slate-200" />
        <div className="space-y-4 p-8">
          <div className="h-5 w-24 rounded bg-slate-200" />
          <div className="h-9 w-3/4 rounded bg-slate-200" />
          <div className="h-5 w-1/2 rounded bg-slate-200" />
          <div className="h-20 rounded bg-slate-200" />
        </div>
      </div>
    </div>
  )
}
