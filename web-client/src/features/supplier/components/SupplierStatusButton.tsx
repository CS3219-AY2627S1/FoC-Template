import { useSetSupplierStatus } from '@/api/supplier/suppliers'
import type { Supplier } from '@/api/supplier/types'
import { FormError } from '@/components/FormError'

type SupplierStatusButtonProps = {
  supplier: Supplier
  // 'text' sits in a table row or card, 'button' stands on its own on the detail page.
  look: 'text' | 'button'
  onChanged?: (supplier: Supplier) => void
}

const lookClasses: Record<SupplierStatusButtonProps['look'], string> = {
  text: 'ds-btn ds-btn--text',
  button: 'ds-btn ds-btn--glass justify-self-start',
}

// Deactivating is the supplier-service's delete: the record stays and can be reactivated.
export function SupplierStatusButton({ supplier, look, onChanged }: SupplierStatusButtonProps) {
  const setStatus = useSetSupplierStatus()
  const active = supplier.status === 'Active'
  const [label, pendingLabel] = active ? ['Deactivate', 'Deactivating…'] : ['Reactivate', 'Reactivating…']

  return (
    <div className="grid grid-cols-1 gap-2">
      <button
        type="button"
        className={lookClasses[look]}
        disabled={setStatus.isPending}
        aria-busy={setStatus.isPending || undefined}
        // A list has one of these per row, so the name tells them apart for screen readers.
        aria-label={`${label} ${supplier.name}`}
        onClick={() => setStatus.mutate({ id: supplier.id, active: !active }, { onSuccess: onChanged })}
      >
        {setStatus.isPending ? pendingLabel : label}
      </button>
      <FormError error={setStatus.error} />
    </div>
  )
}
