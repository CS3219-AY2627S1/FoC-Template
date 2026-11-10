import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { afterEach, beforeEach, expect, it, vi } from "vitest"
import { CopyId } from "./admin-ui"

const copy = vi.fn().mockResolvedValue(undefined)
beforeEach(() => {
  copy.mockClear()
  Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText: copy } })
})
afterEach(cleanup)

it("copies only from its icon button and keeps ID text non-interactive", async () => {
  const select = vi.fn()
  render(<div onClick={select}><CopyId id="full-order-id" compact /></div>)
  const text = screen.getByText("full-order-id")
  expect(text.closest("button")).toBeNull()
  fireEvent.click(text)
  expect(copy).not.toHaveBeenCalled()
  select.mockClear()
  const button = screen.getByRole("button", { name: "Copy full-order-id ID" })
  expect(button).toHaveAttribute("title", "Copy ID: full-order-id")
  fireEvent.click(button)
  await waitFor(() => expect(copy).toHaveBeenCalledWith("full-order-id"))
  expect(select).not.toHaveBeenCalled()
  expect(button).toHaveAttribute("data-copied", "true")
})

it("renders separate navigation and copy controls and resets feedback for another ID", async () => {
  const { rerender } = render(<CopyId id="order-1" href="/admin/orders?orderId=order-1" />)
  const link = screen.getByRole("link", { name: "order-1" })
  expect(link).toHaveAttribute("href", "/admin/orders?orderId=order-1")
  expect(link).toHaveClass("underline")
  expect(link).toHaveClass("decoration-2")
  expect(link.querySelector("svg")).toBeNull()
  expect(link.querySelector("button")).toBeNull()
  fireEvent.click(screen.getByRole("button", { name: "Copy order-1 ID" }))
  await waitFor(() => expect(copy).toHaveBeenCalledWith("order-1"))
  rerender(<CopyId id="order-2" href="/admin/orders?orderId=order-2" />)
  expect(screen.getByRole("button", { name: "Copy order-2 ID" })).toHaveAttribute("data-copied", "false")
})
