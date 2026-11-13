import { ArrowRight, Clock3, MapPin } from 'lucide-react'
import { Link } from 'react-router-dom'
import type { Supplier } from '../api/supplierQueries'
import {
  formatBuilding,
  formatOperatingHours,
} from '../utils/supplierFormatting'
import { supplierPresentation } from '../utils/supplierPresentation'
import styles from './DirectoryComponents.module.css'

interface SupplierCardProps {
  supplier: Supplier
  returnTo: string
}

export function SupplierCard({ supplier, returnTo }: SupplierCardProps) {
  const { Icon, tone } = supplierPresentation(supplier.type)

  return (
    <article className={`${styles.card} ${styles[tone]}`}>
      <div className={styles.cardTop}>
        <span aria-hidden="true" className={styles.cardIcon}>
          <Icon />
        </span>
        <span className={styles.badge}>{supplier.type ?? 'Campus location'}</span>
      </div>
      <div className={styles.cardHeading}>
        <h2>{supplier.name}</h2>
        {supplier.locationDescription && (
          <p className={styles.cardDescription}>
            {supplier.locationDescription}
          </p>
        )}
      </div>
      <dl className={styles.cardDetails}>
        <div className={styles.metaRow}>
          <MapPin aria-hidden="true" />
          <div>
            <dt>Location</dt>
            <dd>{formatBuilding(supplier.building, supplier.floor)}</dd>
          </div>
        </div>
        <div className={styles.metaRow}>
          <Clock3 aria-hidden="true" />
          <div>
            <dt>Operating hours</dt>
            <dd>
              {formatOperatingHours(
                supplier.openingTime,
                supplier.closingTime,
              )}
            </dd>
          </div>
        </div>
      </dl>
      <Link
        className={styles.cardLink}
        state={{ from: returnTo }}
        to={`/suppliers/${supplier.id}`}
      >
        <span>View details</span>
        <ArrowRight aria-hidden="true" />
      </Link>
    </article>
  )
}
