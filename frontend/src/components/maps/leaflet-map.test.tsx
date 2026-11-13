import { cleanup, render } from "@testing-library/react"
import { afterEach, expect, it, vi } from "vitest"
import * as L from "leaflet"
import LeafletMap from "./leaflet-map"

const mocks = vi.hoisted(() => ({ instance: null as import("leaflet").Map | null }))
vi.mock("leaflet", async (original) => {
  const actual = await original<typeof import("leaflet")>()
  return { ...actual, map: (...args: Parameters<typeof actual.map>) => {
    mocks.instance = actual.map(...args)
    return mocks.instance
  } }
})
afterEach(cleanup)
const pins = [{ id: "one", name: "The Deck", latitude: 1.29, longitude: 103.77 }]

it("uses a real draggable marker, reports dragged coordinates and cleans up on unmount", () => {
  const onMove = vi.fn()
  const view = render(<LeafletMap label="Picker" pins={pins} editable onMove={onMove} />)
  let marker!: L.Marker
  mocks.instance!.eachLayer((layer) => { if (layer instanceof L.Marker) marker = layer })
  expect(marker.dragging?.enabled()).toBe(true)
  marker.setLatLng([1.30, 103.78]).fire("dragend")
  expect(onMove.mock.calls[0][0].latitude).toBeCloseTo(1.30, 6)
  expect(onMove.mock.calls[0][0].longitude).toBeCloseTo(103.78, 6)
  const remove = vi.spyOn(mocks.instance!, "remove")
  view.unmount()
  expect(remove).toHaveBeenCalledOnce()
})

it("keeps read-only pins non-draggable and exposes their correct Google Maps destination", () => {
  const onMove = vi.fn()
  render(<LeafletMap label="Supplier" pins={pins} onMove={onMove} />)
  let marker!: L.Marker
  mocks.instance!.eachLayer((layer) => { if (layer instanceof L.Marker) marker = layer })
  expect(marker.dragging?.enabled() ?? false).toBe(false)
  const popup = marker.getPopup()!.getContent() as HTMLElement
  expect(popup.querySelector("a")?.href).toBe("https://www.google.com/maps/search/?api=1&query=1.29,103.77")
  marker.fire("dragend")
  expect(onMove).not.toHaveBeenCalled()
})
