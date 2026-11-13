import type { ChangeEvent } from 'react'
import { SUPPLIER_CATEGORIES } from '../../../../types/supplier.types'
import type { SupplierCategory } from '../../../../types/supplier.types'
import { categoryLabels } from '../../../../utils/supplierFormat'
import styles from './LocationControls.module.scss'

export type SortMode = 'name' | 'open'
export type FilterMode = 'all' | 'open' | SupplierCategory

type LocationControlsProps = {
  query: string
  sort: SortMode
  filter: FilterMode
  onQueryChange: (query: string) => void
  onSortChange: (sort: SortMode) => void
  onFilterChange: (filter: FilterMode) => void
}

export const LocationControls = ({
  query,
  sort,
  filter,
  onQueryChange,
  onSortChange,
  onFilterChange,
}: LocationControlsProps) => {
  const handleSearchChange = (event: ChangeEvent<HTMLInputElement>) =>
    onQueryChange(event.target.value)
  const handleSortChange = (event: ChangeEvent<HTMLSelectElement>) =>
    onSortChange(event.target.value as SortMode)
  const handleFilterChange = (event: ChangeEvent<HTMLSelectElement>) =>
    onFilterChange(event.target.value as FilterMode)

  return (
    <>
      <label className={styles.search}>
        <span className={styles.srOnly}>Search locations</span>
        <input
          type="search"
          placeholder="Enter search"
          value={query}
          onChange={handleSearchChange}
        />
      </label>
      <div className={styles.tools}>
        <label>
          Sort
          <select aria-label="Sort" value={sort} onChange={handleSortChange}>
            <option value="name">Name</option>
            <option value="open">Open now</option>
          </select>
        </label>
        <label>
          Filter
          <select
            aria-label="Filter"
            value={filter}
            onChange={handleFilterChange}
          >
            <option value="all">All locations</option>
            <option value="open">Open now</option>
            {SUPPLIER_CATEGORIES.map((category) => (
              <option key={category} value={category}>
                {categoryLabels[category]}
              </option>
            ))}
          </select>
        </label>
      </div>
    </>
  )
}
