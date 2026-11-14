/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: claude-sonnet-5), date: 2026-11-05
 * Scope: Tests for MyErrands.jsx and MyDeliveries.jsx (the former Activity.jsx, split per
 *        instructions.md Stage 22's "My activity" row): each page shows only its own half of
 *        the combined order-service data, and the empty-state copy differs per page.
 *        listMyOrders/listActiveDeliveries and the lookup hooks are mocked; AuthContext is
 *        mocked logged-in.
 *        No requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review:
 * Scope (2026-11-08, Codex, model: GPT-6): Verified Open chat before and after acceptance.
 * Author review: tng wen xi
 */

import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import MyErrands from "../../src/pages/MyErrands";
import MyDeliveries from "../../src/pages/MyDeliveries";

vi.mock("../../src/context/AuthContext", () => ({
  useAuth: () => ({ isLoggedIn: true, sessionReady: true }),
}));

vi.mock("../../src/api/lookups", () => ({
  useLocationNames: () => () => "The Deck",
  useSupplier: () => null,
  useUserName: () => null,
}));

const ERRAND = {
  id: "o-1",
  status: "open",
  description: "Chicken rice",
  credits: 4,
  deliveryLocationId: 1,
  supplierId: "s-1",
};
const DELIVERY = {
  id: "o-2",
  status: "accepted",
  description: "Laksa",
  credits: 3,
  deliveryLocationId: 1,
  supplierId: "s-2",
};

vi.mock("../../src/api/orders", () => ({
  listMyOrders: vi.fn((as) =>
    Promise.resolve({ orders: as === "requester" ? [ERRAND] : [] }),
  ),
  listActiveDeliveries: vi.fn(() => Promise.resolve({ orders: [DELIVERY] })),
  orderErrorMessage: (err) => err.message,
  pickupOrder: vi.fn(),
  deliverOrder: vi.fn(),
  completeOrder: vi.fn(),
  cancelOrder: vi.fn(),
}));

function renderPage(Page) {
  return render(
    <MemoryRouter>
      <Page />
    </MemoryRouter>,
  );
}

describe("My errands / My deliveries split", () => {
  it("My errands shows the errand, not the delivery", async () => {
    renderPage(MyErrands);
    await waitFor(() =>
      expect(screen.getByText("Chicken rice")).toBeInTheDocument(),
    );
    expect(screen.queryByText("Laksa")).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Open chat" }),
    ).toBeInTheDocument();
  });

  it("My deliveries shows the delivery, not the errand", async () => {
    renderPage(MyDeliveries);
    await waitFor(() => expect(screen.getByText("Laksa")).toBeInTheDocument());
    expect(screen.queryByText("Chicken rice")).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Open chat" }),
    ).toBeInTheDocument();
  });

  it('My errands empty state reads "No errands yet"', async () => {
    const { listMyOrders, listActiveDeliveries } =
      await import("../../src/api/orders");
    listMyOrders.mockResolvedValue({ orders: [] });
    listActiveDeliveries.mockResolvedValue({ orders: [] });

    renderPage(MyErrands);
    await waitFor(() =>
      expect(screen.getByText("No errands yet")).toBeInTheDocument(),
    );
    expect(
      screen.getByText(
        "Errands you post will show up here with their progress.",
      ),
    ).toBeInTheDocument();
  });

  it('My deliveries empty state reads "No deliveries yet"', async () => {
    const { listMyOrders, listActiveDeliveries } =
      await import("../../src/api/orders");
    listMyOrders.mockResolvedValue({ orders: [] });
    listActiveDeliveries.mockResolvedValue({ orders: [] });

    renderPage(MyDeliveries);
    await waitFor(() =>
      expect(screen.getByText("No deliveries yet")).toBeInTheDocument(),
    );
    expect(
      screen.getByText("Errands you accept will show up here."),
    ).toBeInTheDocument();
  });
});
