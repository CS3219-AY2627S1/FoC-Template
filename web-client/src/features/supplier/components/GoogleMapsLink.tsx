import { MapPin } from 'lucide-react'

type GoogleMapsLinkProps = {
  // From supplierMapUrl or pickupRouteUrl in @/api/supplier/maps.
  href: string
  label: string
}

export function GoogleMapsLink({ href, label }: GoogleMapsLinkProps) {
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className="ds-btn ds-btn--glass justify-self-start">
      <MapPin aria-hidden="true" className="size-5 shrink-0" />
      {label}
      <span className="sr-only"> (opens in a new tab)</span>
    </a>
  )
}
