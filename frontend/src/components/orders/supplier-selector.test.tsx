import { useState } from "react"
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { SupplierSelector } from "./supplier-selector"
import type { Page, Supplier } from "@/lib/suppliers"

const mocks = vi.hoisted(() => ({ api: vi.fn(), submit: vi.fn() }))
vi.mock("@/hooks/use-api", () => ({ useApi: () => mocks.api }))
const place = (id: string, name: string, building = "NUS"): Supplier => ({
  id, name, building, type: "Food", floor: null, locationDescription: null,
  latitude: 1.3, longitude: 103.8, openingTime: "09:00", closingTime: "18:00",
  imageUrl: null, active: true, openNow: false, createdAt: "", updatedAt: "",
})
const store = place("store", "Store")
const vincent = place("vincent", "Vincent House")
const woodland = place("woodland", "woodland")
const page = (items: Supplier[], current = 1, totalPages = 1): Page<Supplier> =>
  ({ items, page: current, size: 20, totalItems: totalPages * 20, totalPages })

function Harness({ disabled = false }: { disabled?: boolean }) {
  const [value, setValue] = useState("")
  return <form onSubmit={(event) => { event.preventDefault(); mocks.submit() }}>
    <SupplierSelector id="pickup" label="Pickup supplier" value={value} onChange={setValue} disabled={disabled} />
    <output aria-label="Selected supplier ID">{value}</output>
  </form>
}
const trigger = () => screen.getByRole("combobox", { name: "Pickup supplier" })
const search = () => screen.getByRole("combobox", { name: "Search pickup suppliers" })
async function open() {
  fireEvent.click(trigger())
  await screen.findByRole("option", { name: "Store — NUS" })
}
beforeEach(() => { vi.clearAllMocks(); mocks.api.mockResolvedValue(page([store])) })
afterEach(cleanup)

describe("bounded supplier selection", () => {
  it("fetches only on opening and only loads another page on Show more", async () => {
    mocks.api.mockImplementation(async (path: string) => path.includes("page=2&") ? page([store, vincent], 2, 3) : page([store], 1, 3))
    render(<Harness />)
    expect(mocks.api).not.toHaveBeenCalled()
    await open()
    expect(mocks.api).toHaveBeenCalledExactlyOnceWith("/api/suppliers?status=active&page=1&size=20&sort=name&order=asc", { signal: expect.any(AbortSignal) })
    fireEvent.click(screen.getByRole("button", { name: "Show more" }))
    const option = await screen.findByRole("option", { name: "Vincent House — NUS" })
    expect(screen.getAllByRole("option", { name: "Store — NUS" })).toHaveLength(1)
    expect(mocks.api).toHaveBeenCalledTimes(2)
    expect(mocks.api.mock.calls[1][0]).toContain("page=2&size=20")
    fireEvent.click(option)
    expect(screen.getByLabelText("Selected supplier ID")).toHaveTextContent("vincent")
    expect(trigger()).toHaveTextContent("Vincent House")
    expect(mocks.submit).not.toHaveBeenCalled()
  })

  it("debounces search, preserves selection during another search and clears back to browsing", async () => {
    mocks.api.mockImplementation(async (path: string) => page(path.includes("q=Vincent") ? [vincent] : path.includes("q=woodland") ? [woodland] : [store]))
    render(<Harness />)
    await open()
    fireEvent.change(search(), { target: { value: "Vi" } })
    fireEvent.change(search(), { target: { value: "Vincent" } })
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 150)) })
    expect(mocks.api).toHaveBeenCalledTimes(1)
    fireEvent.click(await screen.findByRole("option", { name: "Vincent House — NUS" }))
    expect(mocks.api.mock.calls[1][0]).toContain("q=Vincent")
    await open()
    fireEvent.change(search(), { target: { value: "woodland" } })
    await screen.findByRole("option", { name: "woodland — NUS" })
    expect(trigger()).toHaveTextContent("Vincent House")
    expect(screen.getByLabelText("Selected supplier ID")).toHaveTextContent("vincent")
    fireEvent.click(screen.getByRole("button", { name: "Clear" }))
    await screen.findByRole("option", { name: "Store — NUS" })
    expect(mocks.api.mock.calls.at(-1)?.[0]).toBe("/api/suppliers?status=active&page=1&size=20&sort=name&order=asc")
  })

  it("aborts an obsolete search and ignores its late response", async () => {
    let resolveLate!: (data: Page<Supplier>) => void
    let oldSignal!: AbortSignal
    mocks.api.mockImplementation((path: string, options: { signal: AbortSignal }) => {
      if (path.includes("q=vi")) {
        oldSignal = options.signal
        return new Promise<Page<Supplier>>((resolve) => { resolveLate = resolve })
      }
      return Promise.resolve(page(path.includes("q=wo") ? [woodland] : [store]))
    })
    render(<Harness />)
    await open()
    fireEvent.change(search(), { target: { value: "vi" } })
    await waitFor(() => expect(resolveLate).toBeDefined())
    fireEvent.change(search(), { target: { value: "wo" } })
    await screen.findByRole("option", { name: "woodland — NUS" })
    expect(oldSignal.aborted).toBe(true)
    await act(async () => { resolveLate(page([vincent])) })
    expect(screen.queryByRole("option", { name: "Vincent House — NUS" })).not.toBeInTheDocument()
    expect(screen.getByRole("option", { name: "woodland — NUS" })).toBeInTheDocument()
  })

  it("retries a failed first page and displays the server explanation", async () => {
    mocks.api.mockRejectedValueOnce(new Error("Sign in again to load suppliers."))
    render(<Harness />)
    fireEvent.click(trigger())
    expect(await screen.findByRole("alert")).toHaveTextContent("Sign in again to load suppliers.")
    fireEvent.click(screen.getByRole("button", { name: "Try again" }))
    await screen.findByRole("option", { name: "Store — NUS" })
    expect(mocks.api).toHaveBeenCalledTimes(2)
    expect(screen.queryByRole("alert")).not.toBeInTheDocument()
  })

  it("retains earlier options and retries the same failed page without skipping", async () => {
    mocks.api.mockResolvedValueOnce(page([store], 1, 3)).mockRejectedValueOnce(new Error("Temporarily unavailable"))
      .mockResolvedValueOnce(page([vincent], 2, 3))
    render(<Harness />)
    await open()
    fireEvent.click(screen.getByRole("button", { name: "Show more" }))
    await screen.findByRole("alert")
    expect(screen.getByRole("option", { name: "Store — NUS" })).toBeInTheDocument()
    fireEvent.click(screen.getByRole("button", { name: "Try again" }))
    await screen.findByRole("option", { name: "Vincent House — NUS" })
    expect(mocks.api.mock.calls.map(([path]) => new URL(path, "http://local").searchParams.get("page"))).toEqual(["1", "2", "2"])
  })

  it("resets to page one on search and handles minimum input and no matches", async () => {
    mocks.api.mockImplementation(async (path: string) => page(path.includes("q=missing") ? [] : [store], 1, path.includes("q=") ? 1 : 2))
    render(<Harness />)
    await open()
    fireEvent.change(search(), { target: { value: "x" } })
    expect(await screen.findByText("Type at least 2 characters, or clear to browse.")).toBeInTheDocument()
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 350)) })
    expect(mocks.api).toHaveBeenCalledTimes(1)
    fireEvent.change(search(), { target: { value: "missing" } })
    await screen.findByText("No matching suppliers. Try another name or building.")
    expect(mocks.api.mock.calls.at(-1)?.[0]).toContain("page=1&size=20")
    expect(screen.queryByRole("button", { name: "Show more" })).not.toBeInTheDocument()
  })

  it("keeps existing results when only whitespace around the query changes", async () => {
    mocks.api.mockImplementation(async (path: string) => page(path.includes("q=Vincent") ? [vincent] : [store]))
    render(<Harness />)
    await open()
    fireEvent.change(search(), { target: { value: "Vincent" } })
    await screen.findByRole("option", { name: "Vincent House — NUS" })
    fireEvent.change(search(), { target: { value: " Vincent " } })
    expect(screen.getByRole("option", { name: "Vincent House — NUS" })).toBeInTheDocument()
    expect(mocks.api).toHaveBeenCalledTimes(2)
  })

  it("aborts requests when the popup closes and refreshes browsing on reopen", async () => {
    let finish!: (data: Page<Supplier>) => void
    let signal!: AbortSignal
    mocks.api.mockImplementationOnce((_path: string, options: { signal: AbortSignal }) => {
      signal = options.signal
      return new Promise<Page<Supplier>>((resolve) => { finish = resolve })
    })
    render(<Harness />)
    fireEvent.click(trigger())
    await waitFor(() => expect(finish).toBeDefined())
    fireEvent.keyDown(search(), { key: "Escape" })
    expect(signal.aborted).toBe(true)
    await act(async () => { finish(page([vincent])) })
    await open()
    expect(screen.queryByRole("option", { name: "Vincent House — NUS" })).not.toBeInTheDocument()
    expect(mocks.api).toHaveBeenCalledTimes(2)
  })

  it("shows an empty active catalogue without automatically requesting more", async () => {
    mocks.api.mockResolvedValue(page([], 1, 0))
    render(<Harness />)
    fireEvent.click(trigger())
    await screen.findByText("No active suppliers available.")
    expect(screen.queryByRole("button", { name: "Show more" })).not.toBeInTheDocument()
    expect(mocks.api).toHaveBeenCalledTimes(1)
  })

  it("supports keyboard selection and Escape without submitting the form", async () => {
    render(<Harness />)
    await open()
    const input = search()
    fireEvent.focus(input)
    fireEvent.keyDown(input, { key: "ArrowDown" })
    fireEvent.keyDown(input, { key: "Enter" })
    await waitFor(() => expect(screen.getByLabelText("Selected supplier ID")).toHaveTextContent("store"))
    fireEvent.click(trigger())
    fireEvent.keyDown(search(), { key: "Escape" })
    await waitFor(() => expect(trigger()).toHaveAttribute("aria-expanded", "false"))
    expect(mocks.submit).not.toHaveBeenCalled()
  })

  it("does not request suppliers while disabled", () => {
    render(<Harness disabled />)
    expect(trigger()).toBeDisabled()
    fireEvent.click(trigger())
    expect(mocks.api).not.toHaveBeenCalled()
  })
})
