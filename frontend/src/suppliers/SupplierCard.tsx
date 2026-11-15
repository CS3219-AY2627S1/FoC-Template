/*
 * AI Assistance Disclosure:
 * Tool: OpenAI Codex (GPT-6), date: 2026-09-27
 * Scope: Implemented responsive, accessible Supplier catalogue cards for
 * issue #29.
 * Author review: Reviewed and approved by @ron.
 */
import { Link, useLocation } from 'react-router'
import { formatSupplierCategory, formatTypicalHours } from './presentation'
import { SupplierImage } from './SupplierImage'
import type { Supplier } from './types'

export function SupplierCard({ supplier }: { readonly supplier: Supplier }) {
  const location = useLocation()
  const detailPath = `/suppliers/${supplier.id}`
  const returnPath = `${location.pathname}${location.search}`
  const building = supplier.floor
    ? `${supplier.buildingLabel}, floor ${supplier.floor}`
    : supplier.buildingLabel

  return (
    <article className="flex min-w-0 flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm transition hover:-translate-y-0.5 hover:shadow-md">
      <SupplierImage
        imagePath={supplier.imagePath}
        supplierName={supplier.name}
        className="aspect-[16/9] w-full"
      />
      <div className="flex flex-1 flex-col p-5">
        <div className="flex flex-wrap gap-2">
          {supplier.categories.map((category) => (
            <span
              key={category}
              className="rounded-full bg-navy-100 px-2.5 py-1 text-xs font-semibold text-navy-800"
            >
              {formatSupplierCategory(category)}
            </span>
          ))}
        </div>
        <h2 className="mt-3 break-words text-lg font-bold text-navy-900">
          <Link
            to={detailPath}
            state={{ from: returnPath }}
            className="rounded-sm hover:text-accent-600 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-500"
          >
            {supplier.name}
          </Link>
        </h2>
        <p className="mt-2 text-sm font-medium text-slate-700">{building}</p>
        <p className="mt-2 line-clamp-3 break-words text-sm leading-6 text-slate-600">
          {supplier.locationDescription}
        </p>
        <p className="mt-auto pt-4 text-sm text-slate-600">
          <span className="font-semibold text-slate-700">Typical hours: </span>
          {formatTypicalHours(supplier)}
        </p>
        <Link
          to={detailPath}
          state={{ from: returnPath }}
          className="mt-4 inline-flex min-h-11 items-center justify-center rounded-lg border border-navy-700 px-4 py-2 text-sm font-semibold text-navy-800 transition hover:bg-navy-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-500"
          aria-label={`View details for ${supplier.name}`}
        >
          View details
        </Link>
      </div>
    </article>
  )
}
