// AI Assistance Disclosure:
// Tool: ChatGPT (model: GPT-5.6 Luna), date: 2026-09-22
// Scope: Generated initial implementation, decomposed App.tsx into separate components
// Author review: I validated correctness and edited for style.

import { ServiceType } from '@relay/contracts'
import { FilterIcon, IconButton, RelayButton } from '@relay/ui'

export type SupplierFilters = {
  status: 'all' | 'operational' | 'not-operational'
  serviceTypes: ServiceType[]
}
const serviceOptions: Array<{ value: ServiceType; label: string }> = [
  { value: ServiceType.Food, label: 'Food' },
  { value: ServiceType.Drink, label: 'Drink' },
  { value: ServiceType.Shopping, label: 'Shopping' },
  { value: ServiceType.Printing, label: 'Printing' },
  { value: ServiceType.Parcel, label: 'Parcel' },
]

export function SupplierFilterPanel({
  filters,
  onChange,
  onClose,
}: {
  filters: SupplierFilters
  onChange: (filters: SupplierFilters) => void
  onClose: () => void
}) {
  function toggleServiceType(serviceType: ServiceType) {
    const serviceTypes = filters.serviceTypes.includes(serviceType)
      ? filters.serviceTypes.filter((value) => value !== serviceType)
      : [...filters.serviceTypes, serviceType]
    onChange({ ...filters, serviceTypes })
  }
  return (
    <aside
      className="supplier-filter-panel glass-card relay-mobile-sheet-surface relay-mobile-toolbar-sheet"
      aria-label="Supplier filters"
    >
      <div className="relay-mobile-toolbar-sheet-content">
        <div className="supplier-filter-header">
          <div>
            <p className="supplier-filter-eyebrow">FILTERS</p>
            <h2>Filter suppliers</h2>
          </div>
          <IconButton label="Close filters" onClick={onClose}>
            ×
          </IconButton>
        </div>
        <fieldset>
          <legend>Operational status</legend>
          <div className="supplier-filter-chip-grid">
            {(['all', 'operational', 'not-operational'] as const).map((status) => (
              <button
                className={`supplier-filter-chip${filters.status === status ? ' selected' : ''}`}
                key={status}
                type="button"
                onClick={() => onChange({ ...filters, status })}
              >
                {status === 'all'
                  ? 'All suppliers'
                  : status === 'operational'
                    ? 'Operational'
                    : 'Not operational'}
              </button>
            ))}
          </div>
        </fieldset>
        <fieldset>
          <legend>Service type</legend>
          <div className="supplier-filter-chip-grid">
            {serviceOptions.map((option) => (
              <button
                className={`supplier-filter-chip${filters.serviceTypes.includes(option.value) ? ' selected' : ''}`}
                key={option.value}
                type="button"
                onClick={() => toggleServiceType(option.value)}
              >
                {option.label}
              </button>
            ))}
          </div>
        </fieldset>
        <RelayButton variant="primary" onClick={onClose}>
          <FilterIcon className="supplier-filter-button-icon" /> Done
        </RelayButton>
      </div>
    </aside>
  )
}
