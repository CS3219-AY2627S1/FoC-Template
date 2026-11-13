import { useEffect, useMemo } from 'react'
import {
  MapContainer,
  Marker,
  TileLayer,
  ZoomControl,
  useMap,
} from 'react-leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { nusBounds, nusCenter } from './campusBounds'
import type { Supplier } from '../../types/supplier.types'
import styles from './CampusMap.module.scss'

const pin = (selected: boolean) =>
  L.divIcon({
    className: selected ? styles.pinSelected : styles.pin,
    iconSize: [18, 18],
    iconAnchor: [9, 18],
  })

const Fit = ({ supplier }: { supplier: Supplier | undefined }) => {
  const map = useMap()
  useEffect(() => {
    map.invalidateSize()
  }, [map])
  useEffect(() => {
    if (supplier?.latitude == null || supplier.longitude == null) return
    map.flyTo([supplier.latitude, supplier.longitude], 17)
  }, [map, supplier])
  return null
}

export const CampusMap = ({
  suppliers,
  selectedId,
  onSelect,
}: {
  suppliers: Array<Supplier>
  selectedId: string | null
  onSelect: (id: string) => void
}) => {
  const icons = useMemo(() => ({ idle: pin(false), selected: pin(true) }), [])
  const selected = suppliers.find((supplier) => supplier.id === selectedId)
  const mapKey = import.meta.env.VITE_CARTO_API_KEY

  if (!mapKey) {
    return (
      <p className={styles.missingKey} role="status">
        Add a CARTO key as VITE_CARTO_API_KEY in frontend/.env, then restart the
        dev server.
      </p>
    )
  }

  return (
    <MapContainer
      center={nusCenter}
      zoom={15}
      minZoom={14}
      maxBounds={nusBounds}
      maxBoundsViscosity={1}
      className={styles.map}
      scrollWheelZoom
      zoomControl={false}
    >
      <ZoomControl position="bottomright" />
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>'
        url={`https://basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}.png?key=${mapKey}`}
      />
      <Fit supplier={selected} />
      {suppliers.map((supplier) =>
        supplier.latitude != null && supplier.longitude != null ? (
          <Marker
            key={supplier.id}
            position={[supplier.latitude, supplier.longitude]}
            icon={supplier.id === selectedId ? icons.selected : icons.idle}
            eventHandlers={{ click: () => onSelect(supplier.id) }}
          />
        ) : null,
      )}
    </MapContainer>
  )
}
