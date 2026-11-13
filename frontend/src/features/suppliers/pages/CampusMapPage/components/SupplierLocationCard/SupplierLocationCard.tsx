import { getOpenStatus } from '../../../../utils/openingHours'
import { ChevronRight } from 'lucide-react'
import type { Supplier } from '../../../../types/supplier.types'
import { categoryLabels } from '../../../../utils/supplierFormat'
import styles from './SupplierLocationCard.module.scss'

type SupplierLocationCardProps = {
  supplier: Supplier
  currentTime: number
  isSelected: boolean
  onSelect: (id: string) => void
}

export const SupplierLocationCard = ({
  supplier,
  currentTime,
  isSelected,
  onSelect,
}: SupplierLocationCardProps) => {
  const status = getOpenStatus(supplier.openingHours, currentTime)
  const categoryLabel = categoryLabels[supplier.category]
  let statusLabel = 'Closed'
  if (status.isOpen && status.is24Hours) statusLabel = 'Open 24 hours'
  if (status.isOpen && !status.is24Hours)
    statusLabel = `Open now · Closes at ${status.closesAt}`
  const statusClassName = status.isOpen ? styles.open : styles.closed
  const cardClassName = isSelected ? styles.selected : styles.card
  const isUnmapped = supplier.latitude == null || supplier.longitude == null

  return (
    <li>
      <button
        type="button"
        className={cardClassName}
        aria-pressed={isSelected}
        onClick={() => onSelect(supplier.id)}
      >
        <span>
          <strong>{supplier.name}</strong>
          <span className={styles.category}>{categoryLabel}</span>
          <span className={statusClassName}>{statusLabel}</span>
          {isUnmapped && (
            <span className={styles.unmapped}>Not on the map</span>
          )}
        </span>
        <ChevronRight size={18} aria-hidden="true" />
      </button>
    </li>
  )
}
