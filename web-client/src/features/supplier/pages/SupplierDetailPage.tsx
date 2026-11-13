import { useParams } from 'react-router'
import { useFavoriteSupplierIds } from '@/api/supplier/favorites'
import { supplierMapUrl } from '@/api/supplier/maps'
import { supplierImageUrl } from '@/api/supplier/photos'
import { useSupplier } from '@/api/supplier/suppliers'
import { weekdays } from '@/api/supplier/types'
import type { Supplier, Weekday } from '@/api/supplier/types'
import { Notice } from '@/components/Notice'
import { Page } from '@/components/Page'
import { QueryView } from '@/components/QueryView'
import { AvailabilityText } from '../components/AvailabilityText'
import { BackButton } from '../components/BackButton'
import { FavoriteButton } from '../components/FavoriteButton'
import { GoogleMapsLink } from '../components/GoogleMapsLink'
import { OpenBadge } from '../components/OpenBadge'

const dayLabels: Record<Weekday, string> = {
  monday: 'Monday',
  tuesday: 'Tuesday',
  wednesday: 'Wednesday',
  thursday: 'Thursday',
  friday: 'Friday',
  saturday: 'Saturday',
  sunday: 'Sunday',
}

// The supplier-service lists only the days it opens, so a weekday it leaves out is closed.
function hoursOn(supplier: Supplier, day: Weekday): string | null {
  const ranges = supplier.hours.filter((hours) => hours.day === day)
  return ranges.length === 0 ? null : ranges.map(({ opens, closes }) => `${opens} to ${closes}`).join(', ')
}

export function SupplierDetailPage() {
  const { id = '' } = useParams()
  const supplier = useSupplier(id)
  const favoriteIds = useFavoriteSupplierIds()
  const mapUrl = supplier.data ? supplierMapUrl(supplier.data) : null

  return (
    <Page
      title={supplier.data?.name ?? 'Supplier'}
      subtitle={supplier.data ? `${supplier.data.type} · ${supplier.data.building}` : undefined}
      actions={
        <>
          {supplier.data && (
            <FavoriteButton supplier={supplier.data} favorite={favoriteIds.data?.has(supplier.data.id) ?? false} />
          )}
          <BackButton fallbackTo="/suppliers" fallbackLabel="Pick up from" />
        </>
      }
    >
      <QueryView query={supplier} loadingLabel="Loading supplier">
        {(current) => (
          <div className="grid grid-cols-1 items-start gap-4 md:grid-cols-2">
            {current.photo && (
              <img
                src={supplierImageUrl(current.photo.path)}
                alt={`Photo of ${current.name}`}
                className="h-56 w-full rounded-card object-cover md:col-span-2 md:h-72"
              />
            )}
            {current.status === 'Inactive' && (
              <div className="md:col-span-2">
                <Notice tone="info" title="You cannot pick this supplier">
                  It is no longer active, so new errands cannot use it. Errands that already use it still show it.
                </Notice>
              </div>
            )}

            <section aria-labelledby="supplier-hours" className="ds-surface grid grid-cols-1 gap-4 p-5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 id="supplier-hours">Opening hours</h2>
                <OpenBadge supplier={current} />
              </div>
              <p>
                <AvailabilityText availability={current.availability} />
              </p>
              <dl className="ds-rows grid grid-cols-1">
                {weekdays.map((day) => {
                  const hours = hoursOn(current, day)
                  return (
                    <div key={day} className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 py-2">
                      <dt>{dayLabels[day]}</dt>
                      <dd className={hours ? 'nums-tabular' : 'text-muted'}>{hours ?? 'Closed'}</dd>
                    </div>
                  )
                })}
              </dl>
              {/* "HH:MM" strings compare in time order. */}
              {current.hours.some(({ opens, closes }) => closes < opens) && (
                <p className="text-sm text-muted">A closing time earlier than the opening time is after midnight.</p>
              )}
            </section>

            <div className="grid grid-cols-1 gap-4">
              <section aria-labelledby="supplier-place" className="ds-surface grid grid-cols-1 gap-4 p-5">
                <h2 id="supplier-place">Where to find it</h2>
                <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div className="min-w-0">
                    <dt className="ds-label">Building</dt>
                    <dd className="mt-1 wrap-anywhere">{current.building}</dd>
                  </div>
                  <div className="min-w-0">
                    <dt className="ds-label">Zone</dt>
                    <dd className="mt-1 wrap-anywhere">{current.zone}</dd>
                  </div>
                  <div className="min-w-0 sm:col-span-2">
                    <dt className="ds-label">Address</dt>
                    <dd className="mt-1 wrap-anywhere">{current.address}</dd>
                  </div>
                  {current.description && (
                    <div className="min-w-0 sm:col-span-2">
                      <dt className="ds-label">How to find it</dt>
                      <dd className="mt-1 wrap-anywhere">{current.description}</dd>
                    </div>
                  )}
                </dl>
                {mapUrl ? (
                  <GoogleMapsLink href={mapUrl} label="Open in Google Maps" />
                ) : (
                  <p className="text-muted">No map location on record.</p>
                )}
              </section>

              <section aria-labelledby="supplier-contact" className="ds-surface grid grid-cols-1 gap-4 p-5">
                <h2 id="supplier-contact">Contact</h2>
                {current.contact.phone || current.contact.email ? (
                  <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    {current.contact.phone && (
                      <div className="min-w-0">
                        <dt className="ds-label">Phone</dt>
                        <dd className="mt-1 wrap-anywhere">
                          {/* A tel: link may not hold spaces. */}
                          <a href={`tel:${current.contact.phone.replace(/\s/g, '')}`}>{current.contact.phone}</a>
                        </dd>
                      </div>
                    )}
                    {current.contact.email && (
                      <div className="min-w-0">
                        <dt className="ds-label">Email</dt>
                        <dd className="mt-1 wrap-anywhere">
                          <a href={`mailto:${current.contact.email}`}>{current.contact.email}</a>
                        </dd>
                      </div>
                    )}
                  </dl>
                ) : (
                  <p className="text-muted">This supplier has no phone number or email address on record.</p>
                )}
              </section>
            </div>
          </div>
        )}
      </QueryView>
    </Page>
  )
}
