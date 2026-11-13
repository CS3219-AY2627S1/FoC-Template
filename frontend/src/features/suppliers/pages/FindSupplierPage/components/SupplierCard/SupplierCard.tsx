import { Button } from '@base-ui/react/button'
import type { Supplier } from '../../../../types/supplier.types'
import { formatLocation } from '../../../../utils/supplierFormat'
import styles from './SupplierCard.module.scss'

type SupplierCardProps = {
  supplier: Supplier
  isOpen: boolean
  onSelect: (supplier: Supplier) => void
}

export const SupplierCard = ({
  supplier,
  isOpen,
  onSelect,
}: SupplierCardProps) => {
  return (
    <li>
      <Button className={styles.card} onClick={() => onSelect(supplier)}>
        <span className={styles.image} aria-hidden="true">
          {supplier.imageUrl ? (
            <img src={supplier.imageUrl} alt="" />
          ) : (
            supplier.name.slice(0, 1).toUpperCase()
          )}
        </span>
        <span className={styles.name}>{supplier.name}</span>
        <span className={styles.meta}>
          {formatLocation(supplier)} · {isOpen ? 'Open now' : 'Closed'}
        </span>
      </Button>
    </li>
  )
}
