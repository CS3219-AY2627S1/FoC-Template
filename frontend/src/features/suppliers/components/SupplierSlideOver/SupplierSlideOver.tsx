import { useNow } from '#/hooks/useNow'
import { Link } from '@tanstack/react-router'
import { Dialog } from '@base-ui/react/dialog'
import { X } from 'lucide-react'
import { categoryLabels, formatLocation } from '../../utils/supplierFormat'
import { getOpenStatus, formatWeeklyHours } from '../../utils/openingHours'
import type { Supplier, SupplierCategory } from '../../types/supplier.types'
import styles from './SupplierSlideOver.module.scss'

export const SupplierSlideOver = ({
  supplier,
  onClose,
  modal = true,
  from,
  category,
}: {
  supplier: Supplier | null
  onClose: () => void
  modal?: boolean
  from?: 'map' | 'request' | 'locations'
  category?: SupplierCategory
}) => {
  const now = useNow(60_000)
  const hours = supplier ? formatWeeklyHours(supplier.openingHours) : []
  const openStatus = supplier ? getOpenStatus(supplier.openingHours, now) : null
  let statusLabel = 'Closed'
  if (openStatus?.isOpen && openStatus.is24Hours) statusLabel = 'Open 24 hours'
  if (openStatus?.isOpen && !openStatus.is24Hours)
    statusLabel = `Open now · Closes at ${openStatus.closesAt}`
  const statusClassName = openStatus?.isOpen ? styles.open : styles.closed
  const located =
    supplier?.latitude != null && supplier.longitude != null
      ? `${supplier.latitude},${supplier.longitude}`
      : null

  return (
    <Dialog.Root
      modal={modal}
      disablePointerDismissal={!modal}
      open={supplier !== null}
      onOpenChange={(open) => {
        if (!open) onClose()
      }}
    >
      <Dialog.Portal>
        {modal ? <Dialog.Backdrop className={styles.backdrop} /> : null}
        <Dialog.Popup className={styles.popup}>
          {supplier && (
            <>
              <div className={styles.hero}>
                {supplier.imageUrl ? (
                  <img src={supplier.imageUrl} alt="" />
                ) : (
                  <span>{supplier.name.slice(0, 1).toUpperCase()}</span>
                )}
                <Dialog.Close className={styles.close} aria-label="Close">
                  <X size={16} strokeWidth={2.5} aria-hidden="true" />
                </Dialog.Close>
              </div>
              <div className={styles.body}>
                <p className={styles.category}>
                  {categoryLabels[supplier.category]}
                </p>
                <Dialog.Title className={styles.title}>
                  {supplier.name}
                </Dialog.Title>
                <p className={statusClassName}>{statusLabel}</p>
                <Dialog.Description className={styles.location}>
                  {formatLocation(supplier)}
                </Dialog.Description>
                {supplier.locationDescription && (
                  <p className={styles.directions}>
                    {supplier.locationDescription}
                  </p>
                )}
                {located && (
                  <a
                    className={styles.directionsLink}
                    href={`https://www.google.com/maps?q=${located}`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Get directions
                  </a>
                )}
                <details className={styles.hours}>
                  <summary>Weekly opening hours</summary>
                  <ul>
                    {hours.map((line) => (
                      <li key={line}>{line}</li>
                    ))}
                  </ul>
                </details>
              </div>
              <div className={styles.footer}>
                <Link
                  className={styles.request}
                  to="/errands/new"
                  search={{ supplier: supplier.id, from, category }}
                >
                  Request a pickup
                </Link>
                <p>Tell your courier what you need</p>
              </div>
            </>
          )}
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
