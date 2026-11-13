import 'leaflet/dist/leaflet.css'
import * as L from 'leaflet'
import { Plus } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'

export type MapPoint = {
  latitude: number
  longitude: number
}

export type LocationPickerProps = {
  // Where the map opens. Without a point it opens over the Kent Ridge campus.
  start: MapPoint | null
  onUse: (point: MapPoint) => void
  onCancel: () => void
}

const campus: MapPoint = { latitude: 1.2966, longitude: 103.7764 }

// Six decimals are about 10 cm, finer than a click can aim.
function rounded(value: number): number {
  return Number(value.toFixed(6))
}

// OpenStreetMap through Leaflet needs no API key and no billing account. Tile URL and attribution
// as https://operations.osmfoundation.org/policies/tiles/ asks; map set-up after the Leaflet quick
// start guide (https://leafletjs.com/examples/quick-start/).
export function LocationPicker({ start, onUse, onCancel }: LocationPickerProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<L.Map | null>(null)
  // Only where the map opens. Typing in the fields while it is open does not move it.
  const [opening] = useState(start)
  const [point, setPoint] = useState<MapPoint | null>(start)

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
    return () => {
      map.remove()
      mapRef.current = null
    }
  }, [opening])

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
      <p id="location-picker-help" className="text-muted">
        Click the map where the supplier is. With the keyboard, move the map with the arrow keys, zoom with + and -, and
        mark the centre.
      </p>
      {/* isolate keeps Leaflet's own stacking order below the floating tab bar. */}
      <div className="relative isolate overflow-hidden rounded-inset">
        <div ref={containerRef} role="group" aria-label="Map" aria-describedby="location-picker-help" className="h-80 w-full" />
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
