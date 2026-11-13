import { ArrowLeft } from 'lucide-react'
import { Link, useLocation, useParams } from 'react-router'
import { useSupplier, useUpdateSupplier } from '@/api/supplier/suppliers'
import type { SupplierStatus } from '@/api/supplier/types'
import { Notice } from '@/components/Notice'
import { Page } from '@/components/Page'
import { QueryView } from '@/components/QueryView'
import { formatDateTime } from '@/lib/format'
import { AvailabilityText } from '../components/AvailabilityText'
import { PhotoEditor } from '../components/PhotoEditor'
import { SupplierForm } from '../components/SupplierForm'
import { SupplierStatusButton } from '../components/SupplierStatusButton'

const statusBadges: Record<SupplierStatus, { label: string; className: string }> = {
  Active: { label: 'Active', className: 'ds-badge ds-badge--success' },
  Inactive: { label: 'Inactive', className: 'ds-badge ds-badge--neutral' },
}

export function AdminSupplierDetailPage() {
  const { id = '' } = useParams()
  const supplier = useSupplier(id)
  const update = useUpdateSupplier(id)
  // Set by "Add supplier" when it sends the administrator here.
  const created = (useLocation().state as { created?: boolean } | null)?.created === true

  return (
    <Page
      title={supplier.data?.name ?? 'Supplier'}
      subtitle={supplier.data ? `${supplier.data.type} · ${supplier.data.building}` : undefined}
      actions={
        <Link to="/admin/suppliers" className="ds-btn ds-btn--glass">
          <ArrowLeft aria-hidden="true" className="size-5 shrink-0" />
          Suppliers
        </Link>
      }
    >
      <QueryView query={supplier} loadingLabel="Loading supplier">
        {(current) => (
          <div className="grid grid-cols-1 gap-6">
            {created && update.isIdle && (
              <Notice tone="success" role="status" title="Supplier added">
                You can add a photo below.
              </Notice>
            )}

            <section className="ds-surface grid grid-cols-1 gap-4 p-5">
              <h2>Status</h2>
              <dl className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                <div className="min-w-0">
                  <dt className="ds-label">Status</dt>
                  <dd className="mt-1">
                    <span className={statusBadges[current.status].className}>{statusBadges[current.status].label}</span>
                  </dd>
                </div>
                <div className="min-w-0">
                  <dt className="ds-label">Now</dt>
                  <dd className="mt-1">
                    <AvailabilityText availability={current.availability} />
                  </dd>
                </div>
                <div className="min-w-0">
                  <dt className="ds-label">Last changed</dt>
                  <dd className="mt-1 nums-tabular">{formatDateTime(current.updatedAt)}</dd>
                </div>
              </dl>
              <p className="text-muted">
                {current.status === 'Active'
                  ? 'Students can pick it for new errands. Deactivating keeps the record, so errands that already use it still show it.'
                  : 'New errands cannot use it. Reactivate it to make it available again.'}
              </p>
              <SupplierStatusButton supplier={current} look="button" />
            </section>

            {/* Saved on its own, apart from the form below, because it goes to its own endpoint. */}
            <PhotoEditor supplier={current} />

            <SupplierForm
              // A different supplier starts from its own values, not from what was typed for the last one.
              key={current.id}
              supplier={current}
              onSubmit={(input) => update.mutate(input)}
              pending={update.isPending}
              error={update.error}
              submitLabel="Save changes"
              pendingLabel="Saving…"
              notice={update.isSuccess && <Notice tone="success" role="status" title="Changes saved" />}
            />
          </div>
        )}
      </QueryView>
    </Page>
  )
}
