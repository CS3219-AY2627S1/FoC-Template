import { useState } from "react"
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

import { QuarterHourDateTimePicker } from "@/components/orders/quarter-hour-date-time-picker"

afterEach(cleanup)

function Picker() {
  const [value, setValue] = useState("2026-10-08T23:45")
  return <>
    <QuarterHourDateTimePicker id="expiry" label="Order expiry" value={value} onChange={setValue} required />
    <output aria-label="Chosen time">{value}</output>
  </>
}

describe("quarter-hour date and time picker", () => {
  it("offers exactly four minute choices and preserves the selected date and hour", async () => {
    render(<Picker />)
    fireEvent.click(screen.getByRole("combobox", { name: "Order expiry minutes" }))
    await waitFor(() => expect(screen.getAllByRole("option")).toHaveLength(4))
    expect(screen.getAllByRole("option").map(option => option.textContent)).toEqual(["00", "15", "30", "45"])
    fireEvent.pointerDown(screen.getByRole("option", { name: "15" }), { pointerType: "mouse" })
    fireEvent.click(screen.getByRole("option", { name: "15" }))
    await waitFor(() => expect(screen.getByLabelText("Chosen time")).toHaveTextContent("2026-10-08T23:15"))
    fireEvent.change(screen.getByLabelText("Order expiry date"), { target: { value: "2026-10-09" } })
    expect(screen.getByLabelText("Chosen time")).toHaveTextContent("2026-10-09T23:15")
  })

  it("keeps a disabled repost picker inactive and applies the minimum date", () => {
    render(<QuarterHourDateTimePicker id="repost" label="Repost time" value="2026-10-08T10:30"
      onChange={vi.fn()} disabled min="2026-10-08T10:15" />)
    expect(screen.getByLabelText("Repost time date")).toBeDisabled()
    expect(screen.getByLabelText("Repost time date")).toHaveAttribute("min", "2026-10-08")
    expect(screen.getByRole("combobox", { name: "Repost time hour" })).toBeDisabled()
    expect(screen.getByRole("combobox", { name: "Repost time minutes" })).toBeDisabled()
  })
})
