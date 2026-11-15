/*
 * AI Assistance Disclosure:
 * Tool: OpenAI Codex (GPT-6), date: 2026-09-27
 * Scope: Implemented the accessible Supplier image and missing-asset fallback
 * for issue #29.
 * Author review: Reviewed and approved by @ron.
 */
import { useState } from 'react'

interface SupplierImageProps {
  readonly imagePath: string | null
  readonly supplierName: string
  readonly className?: string
}

export function SupplierImage({ imagePath, supplierName, className = '' }: SupplierImageProps) {
  const [failed, setFailed] = useState(false)

  if (!imagePath || failed) {
    return (
      <div
        className={`flex items-center justify-center bg-gradient-to-br from-navy-100 to-slate-200 text-navy-700 ${className}`}
        role="img"
        aria-label={`No image available for ${supplierName}`}
      >
        <div className="text-center">
          <span className="block text-3xl" aria-hidden="true">⌂</span>
          <span className="mt-1 block text-xs font-medium">Image unavailable</span>
        </div>
      </div>
    )
  }

  return (
    <img
      src={imagePath}
      alt={`${supplierName} location`}
      className={`object-cover ${className}`}
      onError={() => setFailed(true)}
    />
  )
}
