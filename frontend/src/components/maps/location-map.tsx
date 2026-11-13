"use client"

import dynamic from "next/dynamic"
import { mapsUrl } from "@/lib/suppliers"
import { validPoint, type MapPin, type MapPoint } from "@/lib/map-provider"

const LeafletMap = dynamic(() => import("./leaflet-map"), {
  ssr: false, loading: () => <p role="status" className="flex h-72 items-center justify-center bg-muted text-sm">Loading map…</p>,
})

export type LocationMapProps = {
  pins: MapPin[]; label: string; editable?: boolean; disabled?: boolean
  onMove?: (point: MapPoint) => void
}

export function LocationMap(props: LocationMapProps) {
  const pins = props.pins.filter(validPoint)
  return <section aria-label={props.label} className="space-y-3">
    <div className="relative isolate overflow-hidden rounded-xl border">
      <LeafletMap {...props} pins={pins} />
    </div>
    {props.editable && <p className="text-xs text-muted-foreground">Click the map to place a pin, or drag the pin to adjust it. You can also edit the coordinates below.</p>}
    <div className="flex flex-wrap gap-x-4 gap-y-2">
      {pins.map((pin) => <a key={pin.id} href={mapsUrl(pin)} target="_blank" rel="noopener noreferrer"
        className="text-sm underline underline-offset-4">Open {pin.name} in Google Maps</a>)}
    </div>
  </section>
}
