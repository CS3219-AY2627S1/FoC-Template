import type { CSSProperties, ReactNode } from 'react'
import { RelayFormSurface, RelayList, RelayListItem } from './components'

export function MapSelectionList<T extends { id: string }>({
  title,
  items,
  getTitle,
  getSubtitle,
  getTrailing,
  onSelect,
  onClose,
  style,
}: {
  title: string
  items: T[]
  getTitle: (item: T) => ReactNode
  getSubtitle: (item: T) => ReactNode
  getTrailing: (item: T) => ReactNode
  onSelect: (item: T) => void
  onClose: () => void
  style?: CSSProperties
}) {
  return (
    <RelayFormSurface
      as="aside"
      className="relay-map-selection-list relay-mobile-sheet-surface relay-card-scroll-surface"
      title={title}
      onClose={onClose}
      style={style}
    >
      <RelayList className="relay-map-selection-items">
        {items.map((item) => (
          <RelayListItem
            key={item.id}
            title={getTitle(item)}
            subtitle={getSubtitle(item)}
            trailing={getTrailing(item)}
            onClick={() => onSelect(item)}
          />
        ))}
      </RelayList>
    </RelayFormSurface>
  )
}
