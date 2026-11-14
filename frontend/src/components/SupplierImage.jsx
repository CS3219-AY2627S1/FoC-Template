/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: claude-opus-5), date: 2026-09-08
 * Scope: Generated UI mockup component SupplierImage.jsx from team-authored blueprint.md.
 *        Visual/layout implementation only. No requirements, architecture, or
 *        schema decisions were made by the AI tool.
 * Author review: <pending — team member to sign>
 *
 * Tool: Claude Code (model: claude-sonnet-5-5), date: 2026-09-30
 * Scope: Read the cover image from supplier.photos[].photoLocation instead of supplier.image.
 *        No requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review: Congchen
 */

import { useState } from 'react'
import { ImageOff } from 'lucide-react'
import { coverPhoto } from '../data/suppliers'

// Never let a broken image icon render. A supplier with no photos, or a photoLocation that
// fails to load (for example an expired signed URL), shows this placeholder instead.
// The cover is the first entry of `supplier.photos` by displayOrder.
export default function SupplierImage({
  supplier,
  className = '',
  ratio = 'aspect-[4/3]',
  rounded = '',
  compact = false,
}) {
  const [failed, setFailed] = useState(false)
  const cover = coverPhoto(supplier)
  const shell = `relative w-full overflow-hidden bg-surface-alt ${ratio} ${rounded} ${className}`

  if (failed || !cover) {
    return (
      <div className={shell}>
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-1.5 px-3 text-center">
          <ImageOff size={compact ? 16 : 20} className="text-ink-40" aria-hidden="true" />
          {/* Thumbnails are too small for the label; the icon alone reads as deliberate. */}
          {!compact && (
            <>
              <span className="text-sm font-medium text-ink-40">{supplier.name}</span>
              <span className="text-xs text-ink-40">Image pending</span>
            </>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className={shell}>
      <img
        src={cover.photoLocation}
        alt={supplier.name}
        loading="lazy"
        onError={() => setFailed(true)}
        className="absolute inset-0 h-full w-full object-cover"
      />
    </div>
  )
}
