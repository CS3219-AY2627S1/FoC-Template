import { Link, useParams } from '@tanstack/react-router'
import { SupplierForm } from '../../components/SupplierForm/SupplierForm'
import { useSupplierRealtimeUpdates } from '../../hooks/useSupplierRealtimeUpdates'
import { useSupplier, useUpdateSupplier } from '../../hooks/useSuppliers'
import { useSaveSupplier } from '../../hooks/useSaveSupplier'
import { useBackToSupplierList } from '../../hooks/useBackToSupplierList'
import {
  toSupplierFormValues,
  toSupplierRequest,
} from '../../schemas/supplier.schema'
import { getErrorMessage } from '../../utils/supplierFormat'
import ui from '../../styles/supplier.module.scss'

export const SupplierEditPage = () => {
  useSupplierRealtimeUpdates()

  const { supplierId } = useParams({
    from: '/admin/suppliers/$supplierId/edit',
  })
  const supplier = useSupplier(supplierId)
  const updateSupplier = useUpdateSupplier(supplierId)
  const { save, savingImage } = useSaveSupplier('updated')
  const backToList = useBackToSupplierList()

  return (
    <section className={ui.page}>
      <div>
        <Link to="/admin/suppliers" className={ui.backLink}>
          ← Suppliers
        </Link>
        <h1 className={ui.title}>Edit Supplier</h1>
      </div>
      {supplier.isPending && <p className={ui.muted}>Loading…</p>}
      {supplier.isError && (
        <p className={ui.alert} role="alert">
          {getErrorMessage(supplier.error)}
        </p>
      )}
      {supplier.data && (
        <SupplierForm
          defaultValues={toSupplierFormValues(supplier.data)}
          currentImageUrl={supplier.data.imageUrl}
          submitLabel="Save Changes"
          submitting={updateSupplier.isPending || savingImage}
          onCancel={backToList}
          onSubmit={(values, image) =>
            void save(
              () => updateSupplier.mutateAsync(toSupplierRequest(values)),
              image,
            )
          }
        />
      )}
    </section>
  )
}
