/*
 * AI Assistance Disclosure
 * Tool and date: OpenAI Codex (gpt-5.6-sol), 2026-09-26
 * Scope (AI-01): Implemented the requested supplier card fields and grid.
 * Tool and date: OpenAI Codex (gpt-5.6-sol), 2026-10-03
 * Scope (AI-02): Adjusted existing UI styling to match the supplied Figma mockup.
 * Tool and date: GitHub Copilot Autofix (model unrecorded), 2026-09-24
 * Scope (AI-09): Set the supplier image alternative text.
 * Tool and date: OpenAI Codex (gpt-5.6-sol), 2026-10-17
 * Scope (AI-18): Built and tested the requested errand creation preview and entry points.
 * Usage log: AI_USAGE_LOG.md
 * Author review: Changes validated and confirmed.
 */

import type { Supplier } from '../../features/suppliers/supplier.types'

type SupplierCardProps = {
  supplier: Supplier
  onSelect: (supplier: Supplier) => void
}

export function SupplierCard({ supplier, onSelect }: SupplierCardProps) {
  return (
    <article className="flex h-full flex-col gap-2.5">
      <div
        className="overflow-hidden rounded-[18px] border border-[#dde3de] bg-white shadow-[0_8px_24px_rgba(22,59,42,0.07)] transition"
      >
        {supplier.imageUrl ? (
          <img
            src={supplier.imageUrl}
            alt={`${supplier.name} storefront`}
            loading="lazy"
            decoding="async"
            className="h-48 w-full object-cover sm:h-52 xl:h-56"
          />
        ) : (
          <div
            className="flex h-48 items-center justify-center bg-[#e8efe9] text-4xl font-semibold text-[#7d9387] sm:h-52 xl:h-56"
            aria-label={`No image available for ${supplier.name}`}
          >
            {supplier.name.charAt(0)}
          </div>
        )}

        <div className="px-4 py-3.5">
          <h2 className="text-base font-semibold tracking-[-0.01em] text-[#17211d]">
            {supplier.name}
          </h2>
          <div className="mt-1.5 flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-xs font-medium text-[#4c5b53]">
                {supplier.building.name}
                {supplier.floor ? ` · Level ${supplier.floor}` : null}
              </p>
              <p className="mt-1 line-clamp-2 text-xs leading-5 text-[#68736c]">
                {supplier.description || 'No description is available for this supplier yet.'}
              </p>
            </div>
            <span className="shrink-0 rounded-full bg-[#ddf3e7] px-2.5 py-1 text-[11px] font-medium text-[#175c45]">
              {supplier.category.name}
            </span>
          </div>
        </div>
      </div>

      <button
        type="button"
        onClick={() => onSelect(supplier)}
        className="flex h-11 w-full cursor-pointer items-center justify-between rounded-lg bg-[#d8f06b] px-4 text-sm font-semibold text-[#0d3c2d] transition hover:bg-[#cce85b] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#175c45]"
      >
        <span>Create errand here</span>
        <span aria-hidden="true">→</span>
      </button>
    </article>
  )
}
