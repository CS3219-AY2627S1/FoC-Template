/**
 * AI Assistance Disclosure
 * Tool: Cursor (GPT-5.6 Sol Medium)
 * Scope: Assisted with frontend implementation, debugging and UI refinement.
 * Author review: The generated code was reviewed, tested, and iteratively refined by the author through follow-up instructions.
 *
 * Tool: Claude (Sonnet 5.5 Medium)
 * Scope: Assisted with integration with supplier service API.
 * Author review: The generated code was reviewed, tested, and iteratively refined by the author through follow-up instructions.
 *
 * Tool: Cursor (Composer)
 * Scope: Unified map markers to one blue pin/cluster style; location-first, no teal/supplier color split.
 * Author review: Empty nusLocations stay blue; covered landmarks hide; supplier coords unchanged.
 */

import { useEffect, useMemo, useRef, useState } from 'react'
import { Box, TextField } from '@mui/material'
import L from 'leaflet'
import { MapContainer, Marker, Popup, TileLayer, useMap, ZoomControl } from 'react-leaflet'
import markerIcon from 'leaflet/dist/images/marker-icon.png'
import markerIcon2x from 'leaflet/dist/images/marker-icon-2x.png'
import markerShadow from 'leaflet/dist/images/marker-shadow.png'
import 'leaflet/dist/leaflet.css'
import { kentRidgeCentre, nusLocations, type NusLocation } from '../data/nusLocations'
import { fetchSuppliers } from '../api/suppliers'
import type { Supplier } from '../interfaces'

const campusZoom = 15
const searchZoom = 16
const metersPerDegreeLat = 111_320
const LEAFLET_BLUE = '#2A81CB'

/**
 * Proximity / name match for “same place” as a predefined nusLocations entry.
 * ~50m covers Autocomplete drift; distinct nearby landmarks stay separate unless names match.
 */
const SAME_PLACE_METERS = 50

/** One blue pin style for every single location on the map. */
const locationPinIcon = L.icon({
  iconUrl: markerIcon,
  iconRetinaUrl: markerIcon2x,
  shadowUrl: markerShadow,
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41],
})

type MapPoint = NusLocation & {
  kind: 'place' | 'supplier'
  building?: string
}

type LocationCluster = {
  id: string
  latitude: number
  longitude: number
  locationLabel: string
  suppliers: MapPoint[]
  placeDetail?: string
}

type LatLngLike = {
  latitude: number
  longitude: number
}

function normalizeLocationName(value: string | undefined | null): string {
  return (value ?? '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ')
}

function locationNamesMatch(a: string | undefined | null, b: string | undefined | null): boolean {
  const left = normalizeLocationName(a)
  const right = normalizeLocationName(b)
  if (!left || !right) {
    return false
  }
  return left === right
}

function supplierPoints(suppliers: Supplier[]): MapPoint[] {
  return suppliers.map((supplier) => ({
    id: `supplier-${supplier.id}`,
    name: supplier.name,
    building: supplier.building,
    detail: `${supplier.type}${
      supplier.floor ? ` · Level ${supplier.floor}` : ''
    }${supplier.operatingHours ? `. ${supplier.operatingHours}` : ''}`,
    latitude: supplier.latitude,
    longitude: supplier.longitude,
    kind: 'supplier' as const,
  }))
}

function distanceMeters(a: LatLngLike, b: LatLngLike): number {
  const meanLatRad = ((a.latitude + b.latitude) / 2) * (Math.PI / 180)
  const dLat = (a.latitude - b.latitude) * metersPerDegreeLat
  const dLng = (a.longitude - b.longitude) * metersPerDegreeLat * Math.cos(meanLatRad)
  return Math.hypot(dLat, dLng)
}

/** Associated if normalized building/name matches, or coords are within ~50m. */
function supplierCoversLandmark(supplier: MapPoint, landmark: MapPoint): boolean {
  const nameMatch =
    locationNamesMatch(supplier.building, landmark.name) ||
    locationNamesMatch(supplier.name, landmark.name)
  if (nameMatch) {
    return true
  }
  return distanceMeters(supplier, landmark) <= SAME_PLACE_METERS
}

function landmarkHasCoveringSupplier(landmark: MapPoint, suppliers: MapPoint[]): boolean {
  return suppliers.some((supplier) => supplierCoversLandmark(supplier, landmark))
}

function clusterRadiusMeters(zoom: number): number {
  if (zoom >= 18) return 10
  if (zoom >= 17) return 28
  if (zoom >= 16) return 55
  if (zoom >= 15) return 110
  if (zoom >= 14) return 200
  if (zoom >= 13) return 320
  return 480
}

function sameSpot(points: MapPoint[]): boolean {
  if (points.length <= 1) return true
  const [first, ...rest] = points
  return rest.every((point) => distanceMeters(point, first) <= SAME_PLACE_METERS)
}

function sharedBuildingLabel(suppliers: MapPoint[]): string | null {
  const buildings = [
    ...new Set(
      suppliers
        .map((supplier) => supplier.building?.trim())
        .filter((building): building is string => Boolean(building)),
    ),
  ]
  return buildings.length === 1 ? buildings[0] : null
}

function matchedLandmarkName(suppliers: MapPoint[], places: MapPoint[]): string | null {
  for (const place of places) {
    if (suppliers.some((supplier) => supplierCoversLandmark(supplier, place))) {
      return place.name
    }
  }
  return null
}

function locationLabelForSuppliers(suppliers: MapPoint[], places: MapPoint[]): string {
  return (
    matchedLandmarkName(suppliers, places) ??
    sharedBuildingLabel(suppliers) ??
    (suppliers.length === 1 ? suppliers[0].name : `${suppliers.length} nearby locations`)
  )
}

/** Cluster nearby suppliers by zoom; marker uses mean only for display, never mutates records. */
function clusterSuppliersByZoom(
  points: MapPoint[],
  places: MapPoint[],
  zoom: number,
): LocationCluster[] {
  const radius = clusterRadiusMeters(zoom)
  const remaining = [...points]
  const clusters: LocationCluster[] = []

  while (remaining.length > 0) {
    const seed = remaining.shift()!
    const group = [seed]

    for (let index = remaining.length - 1; index >= 0; index -= 1) {
      const candidate = remaining[index]
      const nearGroup = group.some((member) => distanceMeters(member, candidate) <= radius)
      if (nearGroup) {
        group.push(candidate)
        remaining.splice(index, 1)
      }
    }

    const latitude = group.reduce((sum, point) => sum + point.latitude, 0) / group.length
    const longitude = group.reduce((sum, point) => sum + point.longitude, 0) / group.length
    const id = `location-cluster-${group
      .map((point) => point.id)
      .sort()
      .join('|')}`

    clusters.push({
      id,
      latitude,
      longitude,
      locationLabel: locationLabelForSuppliers(group, places),
      suppliers: group,
    })
  }

  return clusters
}

function blueClusterIcon(count: number) {
  const size = count >= 10 ? 42 : 36
  return L.divIcon({
    className: 'location-cluster-icon',
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
    popupAnchor: [0, -size / 2],
    html: `<div style="
      width:${size}px;height:${size}px;border-radius:50%;
      background:${LEAFLET_BLUE};color:#fff;font:700 13px/${size}px system-ui,sans-serif;
      text-align:center;border:2px solid #fff;
      box-shadow:0 2px 8px rgba(18,35,48,0.35);
    ">${count}</div>`,
  })
}

function matchesQuery(point: MapPoint, query: string) {
  const needle = query.trim().toLowerCase()
  if (!needle) {
    return true
  }

  const haystack = `${point.name} ${point.detail} ${point.building ?? ''}`.toLowerCase()
  return haystack.includes(needle)
}

function MapCamera({
  focus,
  resetToken,
}: {
  focus: MapPoint | null
  resetToken: number
}) {
  const map = useMap()
  const previousReset = useRef(resetToken)

  useEffect(() => {
    if (resetToken !== previousReset.current) {
      previousReset.current = resetToken
      map.fitBounds(
        L.latLngBounds(nusLocations.map((place) => [place.latitude, place.longitude])),
        { paddingTopLeft: [24, 56], paddingBottomRight: [24, 28], maxZoom: campusZoom },
      )
      return
    }

    if (!focus) {
      return
    }

    map.flyTo([focus.latitude, focus.longitude], searchZoom)
  }, [focus, map, resetToken])

  return null
}

function ZoomTracker({ onZoomChange }: { onZoomChange: (zoom: number) => void }) {
  const map = useMap()
  const onZoomChangeRef = useRef(onZoomChange)

  useEffect(() => {
    onZoomChangeRef.current = onZoomChange
  }, [onZoomChange])

  useEffect(() => {
    onZoomChangeRef.current(map.getZoom())
    const handleZoom = () => onZoomChangeRef.current(map.getZoom())
    map.on('zoomend', handleZoom)
    map.on('moveend', handleZoom)
    return () => {
      map.off('zoomend', handleZoom)
      map.off('moveend', handleZoom)
    }
  }, [map])

  return null
}

function BackToCampus({ onReset }: { onReset: () => void }) {
  const map = useMap()
  const onResetRef = useRef(onReset)

  useEffect(() => {
    onResetRef.current = onReset
  }, [onReset])

  useEffect(() => {
    const Control = L.Control.extend({
      onAdd() {
        const container = L.DomUtil.create('div', '')
        const button = L.DomUtil.create('button', '', container) as HTMLButtonElement
        button.type = 'button'
        button.title = 'Back to campus'
        button.textContent = 'Back to campus'
        button.style.display = 'inline-block'
        button.style.width = 'auto'
        button.style.height = '34px'
        button.style.lineHeight = '34px'
        button.style.padding = '0 12px'
        button.style.borderRadius = '8px'
        button.style.fontWeight = '700'
        button.style.setProperty('color', '#ffffff', 'important')
        button.style.setProperty('background', '#1F8A80', 'important')
        button.style.setProperty('background-color', '#1F8A80', 'important')
        button.style.setProperty('text-decoration', 'none', 'important')
        button.style.setProperty('border', '0', 'important')
        button.style.cursor = 'pointer'
        button.style.boxShadow = '0 2px 8px rgba(20, 94, 89, 0.35)'
        L.DomEvent.disableClickPropagation(container)
        L.DomEvent.on(button, 'click', (event) => {
          L.DomEvent.preventDefault(event)
          L.DomEvent.stop(event)
          onResetRef.current()
        })
        return container
      },
    })
    const control = new Control({ position: 'topleft' })
    control.addTo(map)
    return () => {
      control.remove()
    }
  }, [map])

  return null
}

/** Empty predefined place (no suppliers) — same blue pin as a single supplier. */
function EmptyPlaceMarker({ point }: { point: MapPoint }) {
  return (
    <Marker position={[point.latitude, point.longitude]} icon={locationPinIcon}>
      <Popup>
        <strong>{point.name}</strong>
        <br />
        {point.detail}
      </Popup>
    </Marker>
  )
}

function LocationClusterPopup({ cluster }: { cluster: LocationCluster }) {
  const { suppliers, locationLabel, placeDetail } = cluster

  if (suppliers.length === 0) {
    return (
      <Popup>
        <strong>{locationLabel}</strong>
        {placeDetail ? (
          <>
            <br />
            {placeDetail}
          </>
        ) : null}
      </Popup>
    )
  }

  if (suppliers.length === 1) {
    const supplier = suppliers[0]
    return (
      <Popup>
        <strong>{locationLabel}</strong>
        <br />
        {supplier.name}
        <br />
        {supplier.detail}
      </Popup>
    )
  }

  return (
    <Popup>
      <strong>{locationLabel}</strong>
      <ul style={{ margin: '8px 0 0', paddingLeft: 18 }}>
        {suppliers.map((supplier) => (
          <li key={supplier.id} style={{ marginBottom: 6 }}>
            <strong>{supplier.name}</strong>
            <br />
            <span>{supplier.detail}</span>
          </li>
        ))}
      </ul>
    </Popup>
  )
}

function LocationClusterMarker({ cluster }: { cluster: LocationCluster }) {
  const map = useMap()
  const count = cluster.suppliers.length
  const isSingle = count <= 1
  const isSameLocation = sameSpot(cluster.suppliers)
  const expandsOnClick = !isSingle && !isSameLocation

  return (
    <Marker
      position={[cluster.latitude, cluster.longitude]}
      icon={isSingle ? locationPinIcon : blueClusterIcon(count)}
      title={
        expandsOnClick
          ? `${count} locations nearby — click to zoom`
          : cluster.locationLabel
      }
      eventHandlers={{
        click: () => {
          if (!expandsOnClick) {
            return
          }

          const bounds = L.latLngBounds(
            cluster.suppliers.map((supplier) => [supplier.latitude, supplier.longitude]),
          )
          map.flyToBounds(bounds.pad(0.45), {
            maxZoom: Math.min(map.getZoom() + 2, 18),
            padding: [48, 48],
          })
        },
      }}
    >
      {expandsOnClick ? null : <LocationClusterPopup cluster={cluster} />}
    </Marker>
  )
}

function CampusMap() {
  const [query, setQuery] = useState('')
  const [focus, setFocus] = useState<MapPoint | null>(null)
  const [resetToken, setResetToken] = useState(0)
  const [zoom, setZoom] = useState(campusZoom)
  const places = useMemo(
    () => nusLocations.map((place) => ({ ...place, kind: 'place' as const })),
    [],
  )

  const [supplierRecords, setSupplierRecords] = useState<Supplier[]>([])

  useEffect(() => {
    let cancelled = false
    fetchSuppliers()
      .then((data) => {
        if (!cancelled) setSupplierRecords(data)
      })
      .catch((error) => console.error(error))
    return () => {
      cancelled = true
    }
  }, [])

  const suppliers = useMemo(() => supplierPoints(supplierRecords), [supplierRecords])
  const visibleSuppliers = suppliers.filter((supplier) => matchesQuery(supplier, query))

  // Predefined place markers only when no supplier already represents that place.
  const emptyPlaces = places.filter((place) => {
    if (!matchesQuery(place, query)) {
      return false
    }
    return !landmarkHasCoveringSupplier(place, visibleSuppliers)
  })

  const locationClusters = useMemo(
    () => clusterSuppliersByZoom(visibleSuppliers, places, zoom),
    [visibleSuppliers, places, zoom],
  )

  function resetCampusView() {
    setResetToken((token) => token + 1)
  }

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5, height: '100%' }}>
      <TextField
        fullWidth
        size="small"
        placeholder="Search a store or NUS place"
        value={query}
        onChange={(event) => {
          const nextQuery = event.target.value
          setQuery(nextQuery)
          const match = [...suppliers, ...places].find((point) =>
            matchesQuery(point, nextQuery),
          )
          setFocus(match && nextQuery.trim() ? match : null)
        }}
        slotProps={{ htmlInput: { 'aria-label': 'Search a store or NUS place' } }}
        sx={{ bgcolor: 'background.paper', borderRadius: 1 }}
      />
      <Box
        sx={{
          height: { xs: 360, md: 520 },
          borderRadius: 2,
          overflow: 'hidden',
          border: '1px solid',
          borderColor: 'divider',
          '& .leaflet-container': { height: '100%', width: '100%', fontFamily: 'inherit' },
          '& .location-cluster-icon': {
            background: 'transparent',
            border: 0,
          },
        }}
      >
        <MapContainer
          center={[kentRidgeCentre.latitude, kentRidgeCentre.longitude]}
          zoom={campusZoom}
          minZoom={12}
          maxZoom={19}
          scrollWheelZoom
          zoomControl={false}
          style={{ height: '100%', width: '100%' }}
        >
          <ZoomControl position="topright" />
          <BackToCampus onReset={resetCampusView} />
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            maxZoom={19}
          />
          <MapCamera focus={focus} resetToken={resetToken} />
          <ZoomTracker onZoomChange={setZoom} />
          {emptyPlaces.map((place) => (
            <EmptyPlaceMarker key={`${place.id}-pin`} point={place} />
          ))}
          {locationClusters.map((cluster) => (
            <LocationClusterMarker key={cluster.id} cluster={cluster} />
          ))}
        </MapContainer>
      </Box>
    </Box>
  )
}

export default CampusMap
