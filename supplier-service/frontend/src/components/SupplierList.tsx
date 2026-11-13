// AI Assistance Disclosure:
// Tool: ChatGPT (model: GPT-5.6 Luna), date: 2026-09-22
// Scope: Generated initial implementation, decomposed App.tsx into separate components
// Author review: I validated correctness and edited for style.

import type { ServiceType, Supplier } from '@relay/contracts'
import { MapSelectionList, StatusBadge } from '@relay/ui'
import type { CSSProperties } from 'react'

const serviceLabels: Record<ServiceType, string> = {
  0: 'Food',
  1: 'Drink',
  2: 'Shopping',
  3: 'Printing',
  4: 'Parcel',
}

export function SupplierList({
  suppliers,
  onSelect,
  onClose,
  style,
}: {
  suppliers: Supplier[]
  onSelect: (supplier: Supplier) => void
  onClose: () => void
  style?: CSSProperties
}) {
  return (
    <MapSelectionList
      title="Select a supplier"
      items={suppliers}
      getTitle={(supplier) => supplier.name}
      getSubtitle={(supplier) =>
        supplier.serviceTypes.map((type) => serviceLabels[type]).join(' · ')
      }
      getTrailing={(supplier) => (
        <StatusBadge tone={supplier.isOperational ? 'success' : 'danger'}>
          {supplier.isOperational ? 'Operational' : 'Not operational'}
        </StatusBadge>
      )}
      onSelect={onSelect}
      onClose={onClose}
      style={style}
    />
  )
}
