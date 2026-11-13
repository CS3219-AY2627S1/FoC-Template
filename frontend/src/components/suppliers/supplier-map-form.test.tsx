import { act, cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, expect, it, vi } from "vitest"
import { SupplierForm } from "./supplier-form"
import type { LocationMapProps } from "@/components/maps/location-map"

const mocks = vi.hoisted(() => ({ search: vi.fn() }))
vi.mock("@/lib/map-provider", async (original) => ({ ...await original<typeof import("@/lib/map-provider")>(), searchAddresses: mocks.search }))
vi.mock("@/components/maps/location-map", () => ({ LocationMap: ({ pins, onMove }: LocationMapProps) => <div>
  <output aria-label="Pin coordinates">{pins[0] ? pins[0].latitude + "," + pins[0].longitude : "No pin"}</output>
  <button type="button" onClick={() => onMove?.({ latitude: 1.3, longitude: 103.78 })}>Drag test pin</button>
</div> }))
afterEach(() => { cleanup(); vi.useRealTimers() })

it("synchronizes address selection, pin dragging and manual coordinates while preserving the payload", async () => {
  vi.useFakeTimers()
  mocks.search.mockResolvedValue([{ id: "deck", label: "The Deck, NUS", latitude: 1.29, longitude: 103.77 }])
  const submit = vi.fn().mockResolvedValue(undefined)
  render(<SupplierForm locationPicker types={[]} submitLabel="Save" onSubmit={submit} onCancel={vi.fn()} />)
  fireEvent.change(screen.getByRole("combobox", { name: "Address search" }), { target: { value: "Deck" } })
  await act(async () => { await vi.advanceTimersByTimeAsync(650) })
  fireEvent.click(screen.getByRole("option", { name: "The Deck, NUS" }))
  expect(screen.getByLabelText("Latitude")).toHaveValue("1.290000")
  expect(screen.getByLabelText("Longitude")).toHaveValue("103.770000")
  expect(screen.getByLabelText("Pin coordinates")).toHaveTextContent("1.29,103.77")
  fireEvent.click(screen.getByRole("button", { name: "Drag test pin" }))
  expect(screen.getByLabelText("Latitude")).toHaveValue("1.300000")
  expect(screen.getByText(/Pin adjusted from this address/)).toBeInTheDocument()
  fireEvent.change(screen.getByLabelText("Latitude"), { target: { value: "1.31" } })
  expect(screen.getByLabelText("Pin coordinates")).toHaveTextContent("1.31,103.78")
  for (const [name, value] of [["Name", "The Deck"], ["Type", "Food"], ["Building", "Arts"]]) {
    fireEvent.change(screen.getByLabelText(name), { target: { value } })
  }
  fireEvent.click(screen.getByRole("button", { name: "Save" }))
  await act(async () => {})
  expect(submit).toHaveBeenCalledWith(expect.objectContaining({ latitude: 1.31, longitude: 103.78, locationDescription: "The Deck, NUS" }))
  expect(submit.mock.calls[0][0]).not.toHaveProperty("address")
})

it("keeps normal supplier forms unchanged and rejects invalid coordinates in the map-enabled form", () => {
  const submit = vi.fn()
  const view = render(<SupplierForm types={[]} submitLabel="Save" onSubmit={submit} onCancel={vi.fn()} />)
  expect(screen.queryByRole("combobox", { name: "Address search" })).not.toBeInTheDocument()
  view.rerender(<SupplierForm locationPicker types={[]} submitLabel="Save" onSubmit={submit} onCancel={vi.fn()} />)
  for (const [name, value] of [["Name", "Deck"], ["Type", "Food"], ["Building", "Arts"], ["Latitude", "91"], ["Longitude", "103"]]) {
    fireEvent.change(screen.getByLabelText(name), { target: { value } })
  }
  fireEvent.click(screen.getByRole("button", { name: "Save" }))
  expect(submit).not.toHaveBeenCalled()
  expect(screen.getByText("Latitude must be between -90 and 90.")).toBeInTheDocument()
  expect(screen.getByLabelText("Pin coordinates")).toHaveTextContent("No pin")
})
