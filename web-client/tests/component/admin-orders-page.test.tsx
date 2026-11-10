// AI Assistance Disclosure:
// Tool: Claude Code (model: Claude Opus 5.5), date: 2026-10-28, 2026-11-10
// Scope: Added admin errand list component tests; covered the disputed view.
// Author review: I validated correctness and supplied additional boundary checks.

import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AdminOrdersPage } from "../../src/pages/admin-orders-page";

const auth = vi.hoisted(() => ({
  user: { userId: "admin", username: "ada", email: "ada@u.nus.edu", displayName: "Ada", systemRole: "ADMIN", accountStatus: "ACTIVE" },
  withCurrentAccess: vi.fn(),
}));

vi.mock("../../src/app/use-auth", () => ({ useAuth: () => auth }));

const errand = {
  orderId: "a1b2c3d4-0000-4000-8000-000000000001",
  supplierId: "s1", itemDescription: "Iced latte", deliveryLocation: "COM1", reward: 3,
  acceptanceDeadline: "2026-10-20T05:00:00Z", deliveryDeadline: "2026-10-20T06:00:00Z",
  pickup: { name: "Campus Cafe", buildingArea: "COM1", pickupLocationDescription: "Counter", floor: null, latitude: null, longitude: null, updatedAt: "2026-10-01T00:00:00Z" },
  state: "ACCEPTED", createdAt: "2026-10-20T04:00:00Z", updatedAt: "2026-10-20T04:10:00Z",
  requesterId: "r1r2r3r4-0000", courierId: null, overdueAt: "2026-10-20T06:00:00Z",
};

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

function stubFetch() {
  const fetchMock = vi.fn(async (input: RequestInfo | URL) => String(input).includes("/v1/admin/orders")
    ? json({ items: [errand], page: 1, pageSize: 20, total: 1 })
    : json({ items: [], page: 1, page_size: 20, total: 0 }));
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

const adminCalls = (fetchMock: ReturnType<typeof stubFetch>) =>
  fetchMock.mock.calls.map(([url]) => String(url)).filter((url) => url.startsWith("/v1/admin/orders"));

describe("Admin errands page", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.stubGlobal("matchMedia", vi.fn(() => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() })));
    auth.withCurrentAccess.mockImplementation((operation: (token: string) => Promise<unknown>) => operation("current-token"));
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("lists live errands by default and maps each view to Order filters", async () => {
    const fetchMock = stubFetch();
    await act(async () => { render(<MemoryRouter initialEntries={["/admin/orders"]}><AdminOrdersPage /></MemoryRouter>); });
    expect(await screen.findByText("Iced latte")).toBeVisible();
    expect(screen.getByText("Overdue", { selector: ".admin-flag" })).toBeVisible();
    expect(adminCalls(fetchMock).at(-1)).toBe("/v1/admin/orders?page=1&pageSize=20&state=OPEN&state=ACCEPTED&state=PICKED_UP&state=DELIVERED&state=DISPUTED");

    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Disputed" })); });
    await waitFor(() => expect(adminCalls(fetchMock).at(-1)).toBe("/v1/admin/orders?page=1&pageSize=20&state=DISPUTED"));

    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Past" })); });
    await waitFor(() => expect(adminCalls(fetchMock).at(-1)).toBe("/v1/admin/orders?page=1&pageSize=20&state=COMPLETED&state=CANCELLED&state=EXPIRED&state=FAILED"));

    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Overdue" })); });
    await waitFor(() => expect(adminCalls(fetchMock).at(-1)).toBe("/v1/admin/orders?page=1&pageSize=20&overdue=true"));
  });

  it("combines typed filters with the current view", async () => {
    const fetchMock = stubFetch();
    await act(async () => { render(<MemoryRouter initialEntries={["/admin/orders?view=failed"]}><AdminOrdersPage /></MemoryRouter>); });
    await screen.findByText("Iced latte");
    fireEvent.change(screen.getByLabelText("Requester or courier ID"), { target: { value: "  user-7  " } });
    fireEvent.change(screen.getByLabelText("Created from"), { target: { value: "2026-10-20" } });
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Apply filters" })); });
    await waitFor(() => expect(adminCalls(fetchMock).at(-1)).toBe(
      "/v1/admin/orders?page=1&pageSize=20&state=FAILED&participantId=user-7&createdFrom=2026-10-20",
    ));
  });
});
