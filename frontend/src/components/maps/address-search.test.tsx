import { act, cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, beforeEach, expect, it, vi } from "vitest"
import { AddressSearch } from "./address-search"
import type { AddressResult } from "@/lib/map-provider"

const mocks = vi.hoisted(() => ({ search: vi.fn() }))
vi.mock("@/lib/map-provider", async (original) => ({ ...await original<typeof import("@/lib/map-provider")>(), searchAddresses: mocks.search }))
const address = { id: "deck", label: "The Deck, NUS", latitude: 1.29, longitude: 103.77 }
beforeEach(() => { vi.useFakeTimers(); mocks.search.mockReset().mockResolvedValue([address]) })
afterEach(() => { cleanup(); vi.useRealTimers() })

it("debounces suggestions and selects coordinates using the keyboard", async () => {
  const onSelect = vi.fn()
  render(<AddressSearch onSelect={onSelect} />)
  const input = screen.getByRole("combobox", { name: "Address search" })
  fireEvent.change(input, { target: { value: "Deck" } })
  expect(mocks.search).not.toHaveBeenCalled()
  await act(async () => { await vi.advanceTimersByTimeAsync(650) })
  expect(screen.getByRole("option", { name: address.label })).toBeInTheDocument()
  fireEvent.keyDown(input, { key: "Enter" })
  expect(onSelect).toHaveBeenCalledWith(address)
  await act(async () => { await vi.advanceTimersByTimeAsync(1000) })
  expect(mocks.search).toHaveBeenCalledTimes(1)
})

it("ignores late suggestions after the address changes", async () => {
  let complete!: (items: AddressResult[]) => void
  mocks.search.mockImplementationOnce(() => new Promise((resolve) => { complete = resolve }))
  render(<AddressSearch onSelect={vi.fn()} />)
  const input = screen.getByRole("combobox")
  fireEvent.change(input, { target: { value: "first" } })
  await act(async () => { await vi.advanceTimersByTimeAsync(650) })
  const oldSignal = mocks.search.mock.calls[0][1] as AbortSignal
  fireEvent.change(input, { target: { value: "Library" } })
  await act(async () => { await vi.advanceTimersByTimeAsync(650) })
  await act(async () => { complete([{ ...address, label: "Stale location" }]) })
  expect(oldSignal.aborted).toBe(true)
  expect(screen.queryByText("Stale location")).not.toBeInTheDocument()
})

it("offers retry after search failure without removing coordinate entry", async () => {
  mocks.search.mockRejectedValueOnce(new Error("Unavailable"))
  render(<AddressSearch onSelect={vi.fn()} />)
  fireEvent.change(screen.getByRole("combobox"), { target: { value: "Library" } })
  await act(async () => { await vi.advanceTimersByTimeAsync(650) })
  expect(screen.getByRole("status")).toHaveTextContent("Enter coordinates manually")
  fireEvent.click(screen.getByRole("button", { name: "try again" }))
  await act(async () => { await vi.advanceTimersByTimeAsync(650) })
  expect(screen.getByRole("option", { name: address.label })).toBeInTheDocument()
})
