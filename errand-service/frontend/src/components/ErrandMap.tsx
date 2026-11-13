// AI Assistance Disclosure:
// Tool: ChatGPT (model: GPT-5.6 Luna), date: 2026-10-13
// Scope: Generated initial implementation, decomposed App.tsx into separate components
// Author review: I validated correctness and edited for style.

import { useEffect, useLayoutEffect, useMemo, useState } from 'react'
import { CircleMarker, MapContainer, Marker, TileLayer, useMap, useMapEvents } from 'react-leaflet'
import L from 'leaflet'
import type { MapViewport, UserLocation } from '@relay/contracts'
import { groupOverlappingPoints, type BubbleAnchor } from '@relay/ui'
import type { Errand } from '@relay/contracts/errand'

export type MapPoint = { lat: number; lng: number }

const markerColors: Record<Errand['status'], string> = {
  OPEN: '#007aff',
  ACCEPTED: '#ff9500',
  PICKED_UP: '#ff9500',
  DELIVERED: '#34c759',
  CANCELLED: '#ff3b30',
  EXPIRED: '#8e8e93',
  CONFIRMED: '#34c759',
  DELETED: '#8e8e93',
}

function markerIcon(errand: Errand, selected: boolean) {
  const color = markerColors[errand.status]
  return L.divIcon({
    className: 'relay-leaflet-icon errand-leaflet-icon',
    html: `<span class="errand-marker${selected ? ' errand-marker-selected' : ''}" style="--marker:${color}"><b>!</b></span>`,
    iconSize: [38, 38],
    iconAnchor: [19, 38],
  })
}

export function getErrandAnchor(map: L.Map, errand: Errand): BubbleAnchor {
  const point = map.latLngToContainerPoint([errand.pickupLocation.lat, errand.pickupLocation.lng])
  const bounds = map.getContainer().getBoundingClientRect()
  const left = bounds.left + point.x - 19
  const top = bounds.top + point.y - 38
  return { top, left, right: left + 38, bottom: top + 38 }
}

function ErrandMarkers({
  errands,
  selectedId,
  groupOverlaps,
  onSelect,
}: {
  errands: Errand[]
  selectedId?: string
  groupOverlaps: boolean
  onSelect: (errand: Errand, anchor: BubbleAnchor, nearby: Errand[]) => void
}) {
  const map = useMap()
  const [zoomRevision, setZoomRevision] = useState(0)
  useMapEvents({ zoomend: () => setZoomRevision((revision) => revision + 1) })
  const clusters = useMemo(
    () =>
      groupOverlaps
        ? groupOverlappingPoints(errands, (errand) =>
            map.latLngToContainerPoint([errand.pickupLocation.lat, errand.pickupLocation.lng]),
          )
        : errands.map((errand) => [errand]),
    [errands, groupOverlaps, map, zoomRevision],
  )
  return (
    <>
      {clusters.map((cluster) => {
        const first = cluster[0]
        const icon =
          cluster.length === 1
            ? markerIcon(first, first.id === selectedId)
            : L.divIcon({
                className: 'relay-leaflet-icon relay-cluster-icon',
                html: `<span class="relay-cluster-marker"><span>${cluster.length}</span></span>`,
                iconSize: [42, 42],
                iconAnchor: [21, 42],
              })
        return (
          <Marker
            key={cluster
              .map((errand) => errand.id)
              .sort()
              .join('-')}
            position={[first.pickupLocation.lat, first.pickupLocation.lng]}
            icon={icon}
            eventHandlers={{
              click: (event) => {
                event.originalEvent.stopPropagation()
                const element = (event.target as L.Marker).getElement()
                if (!element) return
                const { top, left, right, bottom } = element.getBoundingClientRect()
                onSelect(first, { top, left, right, bottom }, cluster)
              },
            }}
          />
        )
      })}
    </>
  )
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
    const invalidate = () => map.invalidateSize({ pan: false })
    const observer = new ResizeObserver(invalidate)
    observer.observe(container)
    invalidate()
    return () => observer.disconnect()
  }, [map])
  return null
}

function MapReadyController({ onReady }: { onReady?: (map: L.Map) => void }) {
  const map = useMap()
  useEffect(() => {
    onReady?.(map)
  }, [map, onReady])
  return null
}

function ViewportController({ onChange }: { onChange?: (viewport: MapViewport) => void }) {
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

export function ErrandMap({
  errands,
  center,
  userLocation,
  selectedId,
  groupOverlaps = false,
  onSelect,
  onMapClick,
  onMapReady,
  zoom,
  onViewportChange,
  active,
}: {
  errands: Errand[]
  center: MapPoint
  userLocation?: UserLocation
  selectedId?: string
  groupOverlaps?: boolean
  onSelect: (errand: Errand, anchor: BubbleAnchor, nearby: Errand[]) => void
  onMapClick?: () => void
  onMapReady?: (map: L.Map) => void
  zoom: number
  onViewportChange?: (viewport: MapViewport) => void
  active: boolean
}) {
  return (
    <MapContainer className="relay-map" center={center} zoom={zoom} zoomControl={false}>
      <MapCenterController center={center} zoom={zoom} active={active} />
      <MapSizeController />
      <MapReadyController onReady={onMapReady} />
      <ViewportController onChange={onViewportChange} />
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
      <ErrandMarkers
        errands={errands}
        selectedId={selectedId}
        groupOverlaps={groupOverlaps}
        onSelect={onSelect}
      />
    </MapContainer>
  )
}

function MapClickController({ onClick }: { onClick?: () => void }) {
  useMapEvents({ click: () => onClick?.() })
  return null
}
