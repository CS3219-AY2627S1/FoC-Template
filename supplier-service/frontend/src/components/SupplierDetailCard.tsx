// AI Assistance Disclosure:
// Tool: ChatGPT (model: GPT-5.6 Luna), date: 2026-09-22
// Scope: Generated initial implementation, decomposed App.tsx into separate components
// Author review: I validated correctness and edited for style.

import { Day, ServiceType } from '@relay/contracts'
import { GlassCard, IconButton, StatusBadge } from '@relay/ui'
import type { Supplier } from '@relay/contracts'
import type { SupplierRemoteProps, SupplierErrandSummary } from '@relay/contracts'
import { SupplierErrandPanel } from './SupplierErrandPanel'
import type { CSSProperties } from 'react'

const serviceLabels: Record<ServiceType, string> = {
  [ServiceType.Food]: 'Food',
  [ServiceType.Drink]: 'Drink',
  [ServiceType.Shopping]: 'Shopping',
  [ServiceType.Printing]: 'Printing',
  [ServiceType.Parcel]: 'Parcel',
}

const dayLabels: Record<Day, string> = {
  [Day.Monday]: 'Mon',
  [Day.Tuesday]: 'Tue',
  [Day.Wednesday]: 'Wed',
  [Day.Thursday]: 'Thu',
  [Day.Friday]: 'Fri',
  [Day.Saturday]: 'Sat',
  [Day.Sunday]: 'Sun',
}

export function SupplierDetailCard({
  supplier,
  onClose,
  errandApi,
  onErrandSelect,
  style,
}: {
  supplier: Supplier
  onClose: () => void
  errandApi: SupplierRemoteProps['errandApi']
  onErrandSelect: (errand: SupplierErrandSummary) => void
  style?: CSSProperties
}) {
  return (
    <GlassCard
      as="aside"
      className="supplier-detail-card relay-mobile-sheet-surface relay-card-scroll-surface"
      style={style}
      aria-label={`${supplier.name} details`}
    >
      <div className="supplier-card-header">
        <div>
          <h2>{supplier.name}</h2>
        </div>
        <IconButton
          scale={1.5}
          className="icon-button"
          label="Close supplier details"
          onClick={onClose}
        >
          ×
        </IconButton>
      </div>
      <div className="supplier-status-row">
        <StatusBadge tone={supplier.isOperational ? 'success' : 'danger'}>
          {supplier.isOperational ? 'Operational' : 'Not operational'}
        </StatusBadge>
        <span>
          {supplier.location.buildingName} · Level {supplier.location.floorNumber}
        </span>
      </div>
      <p className="supplier-hours">
        Open {supplier.operatingHours.openingTime}–{supplier.operatingHours.closingTime},{' '}
        {supplier.operatingHours.daysOfWeek.map((day) => dayLabels[day]).join(', ')}
      </p>
      <div className="service-chip-row">
        {supplier.serviceTypes.map((type) => (
          <span className="service-chip" key={type}>
            {serviceLabels[type]}
          </span>
        ))}
      </div>
      <SupplierErrandPanel supplierId={supplier.id} api={errandApi} onSelect={onErrandSelect} />
    </GlassCard>
  )
}
