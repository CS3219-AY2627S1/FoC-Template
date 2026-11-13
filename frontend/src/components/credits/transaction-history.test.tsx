/*
 * AI Assistance Disclosure:
 * Tool: OpenAI Codex (GPT-5), date: 2026-10-10
 * Mode: Code generation.
 * Scope: Generated tests for credit transaction history rendering and interactions.
 * Author review: I reviewed for correctness and edited where needed.
 */

import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, beforeEach, expect, it, vi } from "vitest"

import { TransactionHistory } from "@/components/credits/transaction-history"

const mocks = vi.hoisted(() => ({ hook: vi.fn(), refresh: vi.fn() }))
vi.mock("@/hooks/use-credit-transactions", () => ({ useCreditTransactions: (page: number) => mocks.hook(page) }))

beforeEach(() => {
  mocks.refresh.mockReset().mockResolvedValue(undefined)
  mocks.hook.mockReset().mockReturnValue({
    items: [
      { transactionId: "cancelled", type: "REFUNDED_CANCELLATION", amount: 8, direction: "CREDIT", occurredAt: "2026-10-10T08:00:00Z", orderId: "order-cancelled" },
      { transactionId: "expired", type: "REFUNDED_EXPIRY", amount: 7, direction: "CREDIT", occurredAt: "2026-10-09T08:00:00Z", orderId: "order-expired" },
      { transactionId: "legacy", type: "REFUNDED", amount: 6, direction: "CREDIT", occurredAt: "2026-10-08T08:00:00Z", orderId: null },
      { transactionId: "paid", type: "PAID", amount: 5, direction: "DEBIT", occurredAt: "2026-10-07T08:00:00Z", orderId: "order-paid" },
      { transactionId: "reserved", type: "RESERVATION", amount: 4, direction: "DEBIT", occurredAt: "2026-10-06T08:00:00Z", orderId: "order-reserved" },
    ],
    totalItems: 25, totalPages: 2, error: false, loading: false, refreshing: false,
    refresh: mocks.refresh,
  })
})
afterEach(cleanup)

it("renders accessible labels, signed amounts, order IDs, and transaction colours", () => {
  render(<TransactionHistory />)
  expect(screen.getAllByText("Refunded (order cancelled)")).toHaveLength(2)
  expect(screen.getAllByText("Refunded (order expired)")).toHaveLength(2)
  expect(screen.getAllByText("Refunded")).toHaveLength(2)
  expect(screen.getAllByText("+8 credits")[0]).toHaveClass("text-emerald-700")
  expect(screen.getAllByText("−5 credits")[0]).toHaveClass("text-red-700")
  expect(screen.getAllByText("−4 credits")[0]).toHaveClass("text-amber-700")
  expect(screen.getAllByText("order-cancelled")).toHaveLength(2)
  expect(screen.getAllByText("—")).toHaveLength(2)
})

it("supports manual refresh and pagination", () => {
  render(<TransactionHistory />)
  fireEvent.click(screen.getByRole("button", { name: "Refresh" }))
  expect(mocks.refresh).toHaveBeenCalledOnce()
  fireEvent.click(screen.getByRole("button", { name: "Next" }))
  expect(mocks.hook).toHaveBeenLastCalledWith(2)
})

it("keeps rows visible during a background error", () => {
  mocks.hook.mockReturnValueOnce({ ...mocks.hook(), error: true })
  render(<TransactionHistory />)
  expect(screen.getByText("Transactions could not be refreshed")).toBeInTheDocument()
  expect(screen.getAllByText("order-paid")).toHaveLength(2)
})
