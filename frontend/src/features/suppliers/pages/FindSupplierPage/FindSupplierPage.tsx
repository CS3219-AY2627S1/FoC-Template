import { useState } from 'react'
import { CategoryTiles } from '../../components/CategoryTiles/CategoryTiles'
import { SupplierSlideOver } from '../../components/SupplierSlideOver/SupplierSlideOver'
import { useSuppliers } from '../../hooks/useSuppliers'
import { useSupplierRealtimeUpdates } from '../../hooks/useSupplierRealtimeUpdates'
import type { Supplier } from '../../types/supplier.types'
import { getOpenStatus } from '../../utils/openingHours'
import styles from './FindSupplierPage.module.scss'
import { useNow } from '#/hooks/useNow'
import { SupplierCard } from './components/SupplierCard/SupplierCard'

export const FindSupplierPage = () => {
  useSupplierRealtimeUpdates()
  const suppliers = useSuppliers()
  const [selected, setSelected] = useState<Supplier | null>(null)
  const now = useNow(60_000)

  return (
    <section className={styles.page}>
      <h1>Find a supplier</h1>
      <CategoryTiles />

      <div className={styles.results}>
        <div className={styles.resultsHeader}>
          <h2>Suppliers</h2>
        </div>
        {suppliers.isPending ? (
          <p className={styles.feedback} role="status">
            Loading suppliers…
          </p>
        ) : null}
        {suppliers.isError ? (
          <p className={`${styles.feedback} ${styles.error}`} role="alert">
            Unable to load suppliers. Please try again.
          </p>
        ) : null}
        {suppliers.isSuccess && suppliers.data.length === 0 ? (
          <p className={styles.feedback}>No suppliers found.</p>
        ) : null}
        {suppliers.isSuccess && suppliers.data.length > 0 ? (
          <ul className={styles.grid}>
            {suppliers.data.map((supplier) => (
              <SupplierCard
                key={supplier.id}
                supplier={supplier}
                isOpen={getOpenStatus(supplier.openingHours, now).isOpen}
                onSelect={setSelected}
              />
            ))}
          </ul>
        ) : null}
      </div>
      <SupplierSlideOver
        supplier={selected}
        from="request"
        onClose={() => setSelected(null)}
      />
    </section>
  )
}
