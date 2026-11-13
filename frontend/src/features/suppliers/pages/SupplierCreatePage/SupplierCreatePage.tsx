import { Link } from '@tanstack/react-router'
import { SupplierForm } from '../../components/SupplierForm/SupplierForm'
import { useCreateSupplier } from '../../hooks/useSuppliers'
import { useSaveSupplier } from '../../hooks/useSaveSupplier'
import { useBackToSupplierList } from '../../hooks/useBackToSupplierList'
import {
  emptySupplierForm,
  toSupplierRequest,
} from '../../schemas/supplier.schema'
import ui from '../../styles/supplier.module.scss'

export const SupplierCreatePage = () => {
  const createSupplier = useCreateSupplier()
  const { save, savingImage } = useSaveSupplier('added')
  const backToList = useBackToSupplierList()

  return (
    <section className={ui.page}>
      <div>
        <Link to="/admin/suppliers" className={ui.backLink}>
          ← Suppliers
        </Link>
        <h1 className={ui.title}>Create Supplier</h1>
      </div>
      <SupplierForm
        defaultValues={emptySupplierForm}
        submitLabel="Add Supplier"
        submitting={createSupplier.isPending || savingImage}
        onCancel={backToList}
        onSubmit={(values, image) =>
          void save(
            () => createSupplier.mutateAsync(toSupplierRequest(values)),
            image,
          )
        }
      />
    </section>
  )
}
