import { ArrowLeft } from 'lucide-react'
import { Link, useNavigate } from 'react-router'
import { useCreateSupplier } from '@/api/supplier/suppliers'
import { Page } from '@/components/Page'
import { SupplierForm } from '../components/SupplierForm'

export function AdminNewSupplierPage() {
  const create = useCreateSupplier()
  const navigate = useNavigate()

  return (
    <Page
      title="Add supplier"
      actions={
        <Link to="/admin/suppliers" className="ds-btn ds-btn--glass">
          <ArrowLeft aria-hidden="true" className="size-5 shrink-0" />
          Suppliers
        </Link>
      }
    >
      <SupplierForm
        onSubmit={(input) =>
          create.mutate(input, {
            // The new supplier's page says it was added. The flag travels in the router state, not the URL.
            onSuccess: (supplier) => navigate(`/admin/suppliers/${supplier.id}`, { state: { created: true } }),
          })
        }
        pending={create.isPending}
        error={create.error}
        submitLabel="Add supplier"
        pendingLabel="Adding supplier…"
      />
    </Page>
  )
}
