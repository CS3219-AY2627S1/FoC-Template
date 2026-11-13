import 'leaflet/dist/leaflet.css'
import * as L from 'leaflet'
import { Plus } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'

export type MapPoint = {
  latitude: number
  longitude: number
}

export type DropOffPickerProps = {
  // Where the map opens. Without a point it opens at the requester's location, or over the campus.
  start: MapPoint | null
  // The supplier, drawn as a second dot so both ends of the walk are on the map.
  pickup: MapPoint | null
  onUse: (point: MapPoint) => void
  onCancel: () => void
}

const campus: MapPoint = { latitude: 1.2966, longitude: 103.7764 }

// The area of the supplier-service's walking map (supplier-service/map/nus-walk.json). A drop-off
// outside it only gets a straight-line estimate, so the map does not open there.
const walkingArea = { south: 1.2696, west: 103.7494, north: 1.3236, east: 103.8034 }

const onWalkingMap = ({ latitude, longitude }: MapPoint) =>
  latitude >= walkingArea.south &&
  latitude <= walkingArea.north &&
  longitude >= walkingArea.west &&
  longitude <= walkingArea.east

// Browsers share a position only with a page served over HTTPS, or from localhost.
const canLocate = window.isSecureContext && 'geolocation' in navigator

type Locating = 'asking' | 'found' | 'outside' | 'blocked' | 'failed' | 'off'

const locatingText: Record<Locating, string> = {
  asking: 'Finding your location…',
  found: 'The map shows where you are now.',
  outside: 'You are outside the campus map, so the map shows the Kent Ridge campus.',
  blocked: 'Location access is off for this site, so the map shows the Kent Ridge campus.',
  failed: 'Your location could not be found, so the map shows the Kent Ridge campus.',
  off: '',
}

// Six decimals are about 10 cm, finer than a click can aim.
function rounded(value: number): number {
  return Number(value.toFixed(6))
}

// A copy of features/supplier/components/LocationPicker.tsx, since features may not import each
// other. It also opens at the requester's own location and shows the supplier. OpenStreetMap
// through Leaflet needs no API key and no billing account. Tile URL and attribution as
// https://operations.osmfoundation.org/policies/tiles/ asks; map set-up after the Leaflet quick start
// guide (https://leafletjs.com/examples/quick-start/).
export function DropOffPicker({ start, pickup, onUse, onCancel }: DropOffPickerProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<L.Map | null>(null)
  // Only where the map opens. Changes while it is open do not move it.
  const [opening] = useState(start)
  const [point, setPoint] = useState<MapPoint | null>(start)
  const [locating, setLocating] = useState<Locating>(() => (start ? 'off' : canLocate ? 'asking' : 'failed'))

  // Leaflet draws into a DOM element of its own, so it is set up once the element exists.
  useEffect(() => {
    if (!containerRef.current) return
    const centre = opening ?? campus
    const map = L.map(containerRef.current, { center: [centre.latitude, centre.longitude], zoom: opening ? 18 : 16 })
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    }).addTo(map)
    map.on('click', (event) => setPoint({ latitude: rounded(event.latlng.lat), longitude: rounded(event.latlng.lng) }))
    mapRef.current = map

    // The browser asks the requester first. The position only moves the map; nothing is marked or kept.
    let current = true
    if (!opening && canLocate) {
      navigator.geolocation.getCurrentPosition(
        ({ coords }) => {
          if (!current) return
          const here = { latitude: coords.latitude, longitude: coords.longitude }
          if (onWalkingMap(here)) {
            map.setView([here.latitude, here.longitude], 18)
            setLocating('found')
          } else {
            setLocating('outside')
          }
        },
        (error) => {
          if (current) setLocating(error.code === error.PERMISSION_DENIED ? 'blocked' : 'failed')
        },
        { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 },
      )
    }
    return () => {
      current = false
      map.remove()
      mapRef.current = null
    }
  }, [opening])

  useEffect(() => {
    const map = mapRef.current
    if (!map || !pickup) return
    const marker = L.circleMarker([pickup.latitude, pickup.longitude], {
      radius: 7,
      weight: 3,
      fillOpacity: 1,
      className: 'fill-ink stroke-surface',
    })
      .bindTooltip('Pick up')
      .addTo(map)
    return () => {
      marker.remove()
    }
  }, [pickup])

  useEffect(() => {
    const map = mapRef.current
    if (!map || !point) return
    // An SVG circle needs no marker image, and theme classes colour it.
    const marker = L.circleMarker([point.latitude, point.longitude], {
      radius: 10,
      weight: 3,
      fillOpacity: 1,
      className: 'fill-accent stroke-on-accent',
    }).addTo(map)
    return () => {
      marker.remove()
    }
  }, [point])

  // Arrow keys move a focused Leaflet map, so keyboard users aim with the cross in the middle.
  function markCentre() {
    const centre = mapRef.current?.getCenter()
    if (centre) setPoint({ latitude: rounded(centre.lat), longitude: rounded(centre.lng) })
  }

  return (
    <div className="grid grid-cols-1 gap-3">
      <p id="dropoff-picker-help" className="text-muted">
        Click the map where the errand ends. {pickup && 'The dark dot is the pickup. '}With the keyboard, move the map
        with the arrow keys, zoom with + and -, and mark the centre.
      </p>
      {locating !== 'off' && (
        <p role="status" className="text-sm text-muted">
          {locatingText[locating]}
        </p>
      )}
      {/* isolate keeps Leaflet's own stacking order below the floating tab bar. */}
      <div className="relative isolate overflow-hidden rounded-inset">
        <div ref={containerRef} role="group" aria-label="Map" aria-describedby="dropoff-picker-help" className="h-80 w-full" />
        <Plus
          aria-hidden="true"
          className="pointer-events-none absolute top-1/2 left-1/2 z-500 size-6 -translate-x-1/2 -translate-y-1/2 text-ink"
        />
      </div>
      <p role="status" className="nums-tabular wrap-anywhere">
        {point ? `Marked: ${point.latitude}, ${point.longitude}` : 'Nothing marked yet'}
      </p>
      <div className="flex flex-wrap gap-2">
        <button type="button" className="ds-btn ds-btn--glass" onClick={markCentre}>
          Mark the centre
        </button>
        <button type="button" className="ds-btn ds-btn--glass" disabled={!point} onClick={() => point && onUse(point)}>
          Use this location
        </button>
        <button type="button" className="ds-btn ds-btn--text" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </div>
  )
}
