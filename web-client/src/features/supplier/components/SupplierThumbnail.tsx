import { Store } from 'lucide-react'
import { supplierImageUrl } from '@/api/supplier/photos'
import type { Supplier } from '@/api/supplier/types'

type SupplierThumbnailProps = {
  supplier: Supplier
}

// Decorative: the supplier's name is right next to it, so screen readers skip it.
export function SupplierThumbnail({ supplier }: SupplierThumbnailProps) {
  if (!supplier.photo) {
    return (
      <span aria-hidden="true" className="flex size-14 shrink-0 items-center justify-center rounded-inset bg-surface-sunken text-subtle">
        <Store className="size-6" />
      </span>
    )
  }
  return (
    <img
      src={supplierImageUrl(supplier.photo.thumbnailPath)}
      alt=""
      width={56}
      height={56}
      loading="lazy"
      decoding="async"
      className="size-14 shrink-0 rounded-inset object-cover"
    />
  )
}
