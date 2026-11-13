// AI Assistance Disclosure:
// Tool: ChatGPT (model: GPT-5.6 Luna), date: 2026-09-22
// Scope: Generated initial implementation, decomposed App.tsx into separate components
// Author review: I validated correctness and edited for style.

import { useEffect, useLayoutEffect, useMemo, useState } from 'react'
import { CircleMarker, MapContainer, Marker, TileLayer, useMap, useMapEvents } from 'react-leaflet'
import L from 'leaflet'
import type { MapViewport, Supplier } from '@relay/contracts'
import { groupOverlappingPoints, type BubbleAnchor } from '@relay/ui'

export type MapPoint = { lat: number; lng: number }

const supplierIcon = L.divIcon({
  className: 'relay-leaflet-icon',
  html: '<span class="supplier-marker"></span>',
  iconSize: [36, 36],
  iconAnchor: [18, 36],
})

const markerSize = 36

export function getSupplierAnchor(map: L.Map, supplier: Supplier): BubbleAnchor {
  const point = map.latLngToContainerPoint([supplier.location.lat, supplier.location.lng])
  const mapBounds = map.getContainer().getBoundingClientRect()
  const left = mapBounds.left + point.x - markerSize / 2
  const top = mapBounds.top + point.y - markerSize
  return { top, left, right: left + markerSize, bottom: top + markerSize }
}

function MapCenterController({
  center,
  zoom,
  active,
}: {
  center: MapPoint
  zoom: number
  active: boolean
}) {
  const map = useMap()
  useLayoutEffect(() => {
    if (!active) return
    const frame = window.requestAnimationFrame(() => {
      map.invalidateSize({ pan: false, animate: false })
      map.setView(center, zoom, { animate: false })
    })
    return () => window.cancelAnimationFrame(frame)
  }, [active, center, map, zoom])
  useEffect(() => {
    if (!active) return
    const currentCenter = map.getCenter()
    const centerChanged =
      Math.abs(currentCenter.lat - center.lat) > 0.000001 ||
      Math.abs(currentCenter.lng - center.lng) > 0.000001
    const zoomChanged = map.getZoom() !== zoom
    if (centerChanged || zoomChanged) map.setView(center, zoom, { animate: false })
  }, [active, center, map, zoom])
  return null
}

function MapSizeController() {
  const map = useMap()

  useEffect(() => {
    const container = map.getContainer()
    const invalidateSize = () => map.invalidateSize({ pan: false })
    const observer = new ResizeObserver(invalidateSize)

    observer.observe(container)
    invalidateSize()

    return () => observer.disconnect()
  }, [map])

  return null
}

function MapReadyController({ onReady }: { onReady: (map: L.Map) => void }) {
  const map = useMap()

  useEffect(() => {
    onReady(map)
  }, [map, onReady])

  return null
}

function MapZoomController({ onChange }: { onChange?: (viewport: MapViewport) => void }) {
  const map = useMap()
  const reportViewport = () => {
    const center = map.getCenter()
    onChange?.({ center: { lat: center.lat, lng: center.lng }, zoom: map.getZoom() })
  }
  useEffect(() => {
    reportViewport()
  }, [map, onChange])
  useMapEvents({ zoomend: reportViewport, moveend: reportViewport })
  return null
}

function SupplierMarkers({
  suppliers,
  onSelect,
}: {
  suppliers: Supplier[]
  onSelect: (supplier: Supplier, anchor: BubbleAnchor, nearbySuppliers: Supplier[]) => void
}) {
  const map = useMap()
  const [zoomRevision, setZoomRevision] = useState(0)

  useMapEvents({
    zoomend: () => setZoomRevision((revision) => revision + 1),
  })

  const clusters = useMemo(
    () =>
      groupOverlappingPoints(suppliers, (supplier) =>
        map.latLngToContainerPoint([supplier.location.lat, supplier.location.lng]),
      ),
    [map, suppliers, zoomRevision],
  )

  function selectCluster(cluster: Supplier[], event: L.LeafletMouseEvent) {
    event.originalEvent.stopPropagation()
    const element = (event.target as L.Marker).getElement()
    if (!element) return
    const { top, left, right, bottom } = element.getBoundingClientRect()
    onSelect(cluster[0], { top, left, right, bottom }, cluster)
  }

  return (
    <>
      {clusters.map((cluster) => {
        const clusterKey = cluster
          .map((supplier) => supplier.id)
          .sort()
          .join('-')
        const position: [number, number] = [cluster[0].location.lat, cluster[0].location.lng]

        if (cluster.length === 1) {
          return (
            <Marker
              key={clusterKey}
              position={position}
              icon={supplierIcon}
              eventHandlers={{ click: (event) => selectCluster(cluster, event) }}
            />
          )
        }

        const clusterIcon = L.divIcon({
          className: 'relay-leaflet-icon relay-cluster-icon',
          html: `<span class="relay-cluster-marker"><span>${cluster.length}</span></span>`,
          iconSize: [42, 42],
          iconAnchor: [21, 42],
        })

        return (
          <Marker
            key={clusterKey}
            position={position}
            icon={clusterIcon}
            eventHandlers={{ click: (event) => selectCluster(cluster, event) }}
          />
        )
      })}
    </>
  )
}

export function SupplierMap({
  center,
  suppliers,
  userLocation,
  onSelect,
  onMapClick,
  onMapReady,
  zoom,
  onViewportChange,
  active,
}: {
  center: MapPoint
  suppliers: Supplier[]
  userLocation?: MapPoint
  onSelect: (supplier: Supplier, anchor: BubbleAnchor, nearbySuppliers: Supplier[]) => void
  onMapClick?: () => void
  onMapReady: (map: L.Map) => void
  zoom: number
  onViewportChange?: (viewport: MapViewport) => void
  active: boolean
}) {
  return (
    <MapContainer className="relay-map" center={center} zoom={zoom} zoomControl={false}>
      <MapCenterController center={center} zoom={zoom} active={active} />
      <MapSizeController />
      <MapReadyController onReady={onMapReady} />
      <MapZoomController onChange={onViewportChange} />
      <MapClickController onClick={onMapClick} />
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      {userLocation && (
        <CircleMarker
          center={userLocation}
          radius={8}
          pathOptions={{ color: '#fff', fillColor: '#007aff', fillOpacity: 1, weight: 3 }}
        />
      )}
      <SupplierMarkers suppliers={suppliers} onSelect={onSelect} />
    </MapContainer>
  )
}

function MapClickController({ onClick }: { onClick?: () => void }) {
  useMapEvents({ click: () => onClick?.() })
  return null
}
