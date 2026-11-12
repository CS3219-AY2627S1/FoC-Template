import { Select } from '../ui/Select'
import type {
  ErrandCreditFilter,
  ErrandExpiryFilter,
  ErrandSort,
} from '../../features/errands/errand.types'
import type { SupplierReference } from '../../features/suppliers/supplier.types'

type ErrandFiltersProps = {
  deliveryBuildings: SupplierReference[]
  deliveryBuildingId: string
  credit: ErrandCreditFilter
  expiry: ErrandExpiryFilter
  sort: ErrandSort
  onDeliveryBuildingChange: (buildingId: string) => void
  onCreditChange: (credit: ErrandCreditFilter) => void
  onExpiryChange: (expiry: ErrandExpiryFilter) => void
  onSortChange: (sort: ErrandSort) => void
}

export function ErrandFilters({
  deliveryBuildings,
  deliveryBuildingId,
  credit,
  expiry,
  sort,
  onDeliveryBuildingChange,
  onCreditChange,
  onExpiryChange,
  onSortChange,
}: ErrandFiltersProps) {
  return (
    <div className="grid grid-cols-2 gap-2.5 xl:grid-cols-[minmax(11rem,1fr)_minmax(10rem,0.8fr)_minmax(11rem,0.9fr)_minmax(12rem,1fr)]">
      <Select
        label="Filter by delivery location"
        value={deliveryBuildingId}
        onChange={(event) => onDeliveryBuildingChange(event.target.value)}
        options={[
          { label: 'All delivery locations', value: '' },
          ...deliveryBuildings.map((building) => ({
            label: building.name,
            value: building.id,
          })),
        ]}
      />
      <Select
        label="Filter by credit value"
        value={credit}
        onChange={(event) => onCreditChange(event.target.value as ErrandCreditFilter)}
        options={[
          { label: 'Any credit value', value: 'all' },
          { label: 'Up to 5 credits', value: 'up-to-5' },
          { label: '6–10 credits', value: '6-to-10' },
          { label: '11+ credits', value: '11-plus' },
        ]}
      />
      <Select
        label="Filter by expiry"
        value={expiry}
        onChange={(event) => onExpiryChange(event.target.value as ErrandExpiryFilter)}
        options={[
          { label: 'Any expiry', value: 'all' },
          { label: 'Next 4 hours', value: 'next-4-hours' },
          { label: 'Today', value: 'today' },
          { label: 'Next 7 days', value: 'next-7-days' },
        ]}
      />
      <Select
        label="Sort errands"
        value={sort}
        onChange={(event) => onSortChange(event.target.value as ErrandSort)}
        options={[
          { label: 'Expiry: soonest', value: 'expires_at,asc' },
          { label: 'Expiry: latest', value: 'expires_at,desc' },
          { label: 'Credits: highest', value: 'credit_value,desc' },
          { label: 'Credits: lowest', value: 'credit_value,asc' },
        ]}
      />
    </div>
  )
}
