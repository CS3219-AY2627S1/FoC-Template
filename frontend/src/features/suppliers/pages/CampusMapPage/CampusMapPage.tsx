import { lazy, Suspense, useState } from 'react'
import { SupplierSlideOver } from '../../components/SupplierSlideOver/SupplierSlideOver'
import { useSuppliers } from '../../hooks/useSuppliers'
import type { Supplier } from '../../types/supplier.types'
import { categoryLabels } from '../../utils/supplierFormat'
import { getOpenStatus } from '../../utils/openingHours'
import { SupplierLocationCard } from './components/SupplierLocationCard/SupplierLocationCard'
import { MapLoadingState } from './components/MapLoadingState/MapLoadingState'
import { LocationControls } from './components/LocationControls/LocationControls'
import type {
  FilterMode,
  SortMode,
} from './components/LocationControls/LocationControls'
import styles from './CampusMapPage.module.scss'
import { useNow } from '#/hooks/useNow'

const CampusMap = lazy(() =>
  import('./CampusMap').then((module) => ({ default: module.CampusMap })),
)

const hasCoordinates = (
  supplier: Supplier,
): supplier is Supplier & { latitude: number; longitude: number } =>
  supplier.latitude != null && supplier.longitude != null

const matchesQuery = (supplier: Supplier, query: string) => {
  const haystack = [
    supplier.name,
    supplier.building,
    supplier.floor,
    supplier.locationDescription,
    categoryLabels[supplier.category],
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase()
  return haystack.includes(query)
}

export const CampusMapPage = () => {
  const suppliers = useSuppliers()
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [sort, setSort] = useState<SortMode>('name')
  const [filter, setFilter] = useState<FilterMode>('all')
  const currentTime = useNow(60_000)
  const locations = (suppliers.data ?? []).filter((supplier) => supplier.active)
  const visible = locations
    .filter((supplier) => {
      const open = getOpenStatus(supplier.openingHours, currentTime).isOpen
      if (filter === 'open' && !open) return false
      if (
        filter !== 'all' &&
        filter !== 'open' &&
        supplier.category !== filter
      ) {
        return false
      }
      const needle = query.trim().toLowerCase()
      return needle ? matchesQuery(supplier, needle) : true
    })
    .sort((left, right) => {
      if (sort === 'open') {
        const leftOpen = getOpenStatus(left.openingHours, currentTime).isOpen
        const rightOpen = getOpenStatus(right.openingHours, currentTime).isOpen

        if (leftOpen !== rightOpen) return leftOpen ? -1 : 1
      }
      return left.name.localeCompare(right.name)
    })
  const mapped = visible.filter(hasCoordinates)
  const selected =
    visible.find((supplier) => supplier.id === selectedId) ?? null

  const selectedSupplierId = selected?.id ?? null
  const showEmptyState = suppliers.isSuccess && visible.length === 0
  const showLocations = suppliers.isSuccess && visible.length > 0
  const closeSupplier = () => setSelectedId(null)

  return (
    <section className={styles.stage} aria-label="Map">
      <h1 className={styles.heading}>Map</h1>
      <Suspense fallback={<MapLoadingState />}>
        <CampusMap
          suppliers={mapped}
          selectedId={selectedSupplierId}
          onSelect={setSelectedId}
        />
      </Suspense>
      <aside className={styles.panel}>
        <LocationControls
          query={query}
          sort={sort}
          filter={filter}
          onQueryChange={setQuery}
          onSortChange={setSort}
          onFilterChange={setFilter}
        />
        {suppliers.isPending ? (
          <p className={styles.feedback} role="status">
            Loading locations…
          </p>
        ) : null}
        {suppliers.isError ? (
          <p className={styles.feedback} role="alert">
            Unable to load locations. Please try again.
          </p>
        ) : null}
        {showEmptyState ? (
          <p className={styles.feedback}>No locations match your search.</p>
        ) : null}
        {showLocations ? (
          <ul className={styles.list} aria-label="Available locations">
            {visible.map((supplier) => (
              <SupplierLocationCard
                key={supplier.id}
                supplier={supplier}
                currentTime={currentTime}
                isSelected={selectedSupplierId === supplier.id}
                onSelect={setSelectedId}
              />
            ))}
          </ul>
        ) : null}
      </aside>
      <SupplierSlideOver
        supplier={selected}
        modal={false}
        from="map"
        onClose={closeSupplier}
      />
    </section>
  )
}
