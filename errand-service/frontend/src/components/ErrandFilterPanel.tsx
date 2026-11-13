// AI Assistance Disclosure:
// Tool: ChatGPT (model: GPT-5.6 Luna), date: 2026-10-13
// Scope: Generated initial implementation, decomposed App.tsx into separate components
// Author review: I validated correctness and edited for style.

import { ServiceType } from '@relay/contracts'
import { FilterIcon, IconButton, RelayButton } from '@relay/ui'
import type { ErrandStatus } from '@relay/contracts/errand'
import { SERVICE_TYPE_LABELS } from '../types'

export type ErrandFilters = {
  statuses: ErrandStatus[]
  serviceTypes: ServiceType[]
  sort: 'lifecycle' | 'start' | 'deadline' | 'distance'
}

const statuses: Array<{ value: ErrandStatus; label: string }> = [
  { value: 'OPEN', label: 'Open' },
  { value: 'ACCEPTED', label: 'Accepted' },
  { value: 'PICKED_UP', label: 'Collected' },
  { value: 'DELIVERED', label: 'Delivered' },
  { value: 'CONFIRMED', label: 'Confirmed' },
  { value: 'EXPIRED', label: 'Expired' },
]

export function ErrandFilterPanel({
  filters,
  onChange,
  onClose,
}: {
  filters: ErrandFilters
  onChange: (filters: ErrandFilters) => void
  onClose: () => void
}) {
  function toggleStatus(status: ErrandStatus) {
    const values = filters.statuses.includes(status)
      ? filters.statuses.filter((value) => value !== status)
      : [...filters.statuses, status]
    onChange({ ...filters, statuses: values })
  }

  function toggleServiceType(serviceType: ServiceType) {
    const values = filters.serviceTypes.includes(serviceType)
      ? filters.serviceTypes.filter((value) => value !== serviceType)
      : [...filters.serviceTypes, serviceType]
    onChange({ ...filters, serviceTypes: values })
  }

  return (
    <aside
      className="errand-filter-panel glass-card relay-mobile-sheet-surface relay-mobile-toolbar-sheet"
      aria-label="Errand filters"
    >
      <div className="relay-mobile-toolbar-sheet-content">
        <div className="errand-panel-header">
          <div>
            <p className="errand-eyebrow">FILTERS</p>
            <h2>Find an errand</h2>
          </div>
          <IconButton label="Close filters" onClick={onClose}>
            ×
          </IconButton>
        </div>
        <fieldset>
          <legend>Lifecycle</legend>
          <div className="errand-chip-grid">
            {statuses.map((status) => (
              <button
                className={`errand-filter-chip${filters.statuses.includes(status.value) ? ' selected' : ''}`}
                key={status.value}
                type="button"
                onClick={() => toggleStatus(status.value)}
              >
                {status.label}
              </button>
            ))}
          </div>
        </fieldset>
        <fieldset>
          <legend>Service type</legend>
          <div className="errand-chip-grid">
            {Object.entries(SERVICE_TYPE_LABELS).map(([value, label]) => (
              <button
                className={`errand-filter-chip${filters.serviceTypes.includes(Number(value) as ServiceType) ? ' selected' : ''}`}
                key={value}
                type="button"
                onClick={() => toggleServiceType(Number(value) as ServiceType)}
              >
                {label}
              </button>
            ))}
          </div>
        </fieldset>
        <label className="errand-field">
          <span>Sort by</span>
          <select
            value={filters.sort}
            onChange={(event) =>
              onChange({ ...filters, sort: event.target.value as ErrandFilters['sort'] })
            }
          >
            <option value="lifecycle">Lifecycle</option>
            <option value="start">Start time</option>
            <option value="deadline">Deadline</option>
            <option value="distance">Distance</option>
          </select>
        </label>
        <RelayButton variant="primary" onClick={onClose}>
          <FilterIcon className="errand-button-icon" /> Done
        </RelayButton>
      </div>
    </aside>
  )
}
