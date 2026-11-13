"use client"

import { useEffect, useRef, useState } from "react"
import * as L from "leaflet"
import "leaflet/dist/leaflet.css"

import { MAP_PROVIDER } from "@/lib/map-provider"
import { mapsUrl } from "@/lib/suppliers"
import type { LocationMapProps } from "./location-map"

const pinIcon = L.divIcon({ className: "", iconSize: [28, 36], iconAnchor: [14, 32], popupAnchor: [0, -32],
  html: '<span style="display:block;width:28px;height:28px;background:#0f766e;border:3px solid white;border-radius:50% 50% 50% 0;transform:rotate(-45deg);box-shadow:0 2px 6px #0005"></span>' })

export default function LeafletMap({ pins, editable = false, disabled = false, onMove }: LocationMapProps) {
  const container = useRef<HTMLDivElement>(null)
  const map = useRef<L.Map | null>(null)
  const markers = useRef<L.LayerGroup | null>(null)
  const [tileError, setTileError] = useState(false)

  useEffect(() => {
    if (!container.current) return
    const instance = L.map(container.current, { scrollWheelZoom: false }).setView(
      [MAP_PROVIDER.center.latitude, MAP_PROVIDER.center.longitude], 15,
    )
    const tiles = L.tileLayer(MAP_PROVIDER.tiles, { maxZoom: 19, attribution: MAP_PROVIDER.attribution }).addTo(instance)
    tiles.on("tileerror", () => setTileError(true))
    tiles.on("tileload", () => setTileError(false))
    map.current = instance
    markers.current = L.layerGroup().addTo(instance)
    const observer = typeof ResizeObserver !== "undefined" ? new ResizeObserver(() => instance.invalidateSize()) : null
    observer?.observe(container.current)
    instance.invalidateSize()
    return () => {
      observer?.disconnect()
      instance.remove()
      map.current = null
      markers.current = null
    }
  }, [])

  useEffect(() => {
    const instance = map.current
    const group = markers.current
    if (!instance || !group) return
    group.clearLayers()
    for (const pin of pins) {
      const marker = L.marker([pin.latitude, pin.longitude], {
        icon: pinIcon, draggable: editable && !disabled, title: pin.name, alt: pin.name,
      }).addTo(group)
      const content = document.createElement("div")
      const title = document.createElement("p")
      title.textContent = pin.name
      const link = document.createElement("a")
      link.textContent = "Open in Google Maps"
      link.href = mapsUrl(pin)
      link.target = "_blank"
      link.rel = "noopener noreferrer"
      content.append(title, link)
      marker.bindPopup(content)
      marker.on("dragend", () => {
        const point = marker.getLatLng().wrap()
        if (editable && !disabled) onMove?.({ latitude: point.lat, longitude: point.lng })
      })
    }
    if (pins.length === 1) instance.setView([pins[0].latitude, pins[0].longitude], 16, { animate: false })
    else if (pins.length > 1) instance.fitBounds(pins.map((pin) => [pin.latitude, pin.longitude]), { padding: [30, 30], maxZoom: 16, animate: false })
    const place = (event: L.LeafletMouseEvent) => {
      if (editable && !disabled) {
        const point = event.latlng.wrap()
        onMove?.({ latitude: point.lat, longitude: point.lng })
      }
    }
    instance.on("click", place)
    return () => { instance.off("click", place); group.clearLayers() }
  }, [pins, editable, disabled, onMove])

  return <>
    <div ref={container} className="h-72 w-full bg-muted sm:h-80" aria-label="Interactive location map" />
    {tileError && <p role="status" className="bg-muted p-3 text-sm">Map tiles could not load. Coordinates and Google Maps links are still available.</p>}
  </>
}
