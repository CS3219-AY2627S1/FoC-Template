// AI Assistance Disclosure:
// Tool: Claude Code (model: Claude Opus 5.5), date: 2026-10-28, 2026-10-29
// Scope: Added Admin Dashboard component tests.
// Author review: I validated correctness and supplied additional boundary checks.

import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AdminDashboardPage } from "../../src/pages/admin-dashboard-page";

const auth = vi.hoisted(() => ({
  user: { userId: "admin", username: "ada", email: "ada@u.nus.edu", displayName: "Ada", systemRole: "ADMIN", accountStatus: "ACTIVE" },
  withCurrentAccess: vi.fn(),
}));

vi.mock("../../src/app/use-auth", () => ({ useAuth: () => auth }));

const USER_ID = "u1u1u1u1-0000-4000-8000-000000000001";
const noErrands = { OPEN: 0, ACCEPTED: 0, PICKED_UP: 0, DELIVERED: 0, COMPLETED: 0, CANCELLED: 0, EXPIRED: 0, FAILED: 0 };
const period = { from: "2026-10-20", to: "2026-10-21", timeZone: "Asia/Singapore", generatedAt: "2026-10-21T04:00:00Z" };
const emptyPeriod = {
  ...period,
  totalCreated: 0, byState: noErrands,
  rates: { completed: null, cancelled: null, expired: null, failed: null },
  daily: [{ day: "2026-10-20", created: 0 }, { day: "2026-10-21", created: 2 }],
  participants: { requesters: 0, couriers: 0, distinctParticipants: 0 },
  meanCompletionMinutes: null, suppliers: [],
};
const userActivity = {
  ...period, userId: USER_ID,
  asRequester: { total: 2, byState: { ...noErrands, COMPLETED: 1, CANCELLED: 1 } },
  asCourier: { total: 0, byState: noErrands },
};
const credits = { ...period, circulation: { available: 700, reserved: 40, total: 740 }, transfers: { count: 3, amount: 12 } };
const wallet = { userId: USER_ID, available: 15, reserved: 5, total: 20, updatedAt: "2026-10-21T04:00:00Z" };
const transactions = {
  items: [
    { transactionId: "t2", type: "RESERVATION", amount: 5, walletUserId: USER_ID, counterpartyUserId: null, orderId: "o1o1o1o1-0000", createdAt: "2026-10-21T03:00:00Z" },
    { transactionId: "t1", type: "ALLOCATION", amount: 20, walletUserId: USER_ID, counterpartyUserId: null, orderId: null, createdAt: "2026-10-20T03:00:00Z" },
  ],
  page: 1, pageSize: 10, total: 2,
};

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
const failure = (code: string, status: number) => json({ error: { code, message: code, correlationId: "c-1", fieldErrors: [] } }, status);

function routeFetch(routes: Record<string, () => Response>) {
  const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    const match = Object.keys(routes).find((path) => url.includes(path));
    return match ? routes[match]() : failure("NOT_FOUND", 404);
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

async function renderDashboard() {
  await act(async () => {
    render(<MemoryRouter initialEntries={["/admin/dashboard?from=2026-10-20&to=2026-10-21"]}><AdminDashboardPage /></MemoryRouter>);
  });
}

async function lookUpUser() {
  fireEvent.change(screen.getByLabelText("User ID"), { target: { value: ` ${USER_ID.toUpperCase()} ` } });
  await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Show activity" })); });
}

const tile = (region: HTMLElement, label: string) => within(region).getByText(label).nextElementSibling;

describe("Admin dashboard", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.stubGlobal("matchMedia", vi.fn(() => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() })));
    auth.withCurrentAccess.mockImplementation((operation: (token: string) => Promise<unknown>) => operation("current-token"));
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("shows the selected Singapore period with N/A rates and the newest day first", async () => {
    const fetchMock = routeFetch({
      "/admin/orders/analytics?": () => json(emptyPeriod),
      "/admin/credit/analytics?": () => json(credits),
    });
    await renderDashboard();
    const overview = await screen.findByRole("region", { name: "Errand overview" });
    expect(tile(overview, "Errands created")).toHaveTextContent("0");
    expect(tile(overview, "Completion rate")).toHaveTextContent("N/A");
    expect(tile(overview, "Mean time to complete")).toHaveTextContent("N/A");
    expect(within(overview).getByText(/^Updated \d{2}:\d{2} SGT$/)).toBeVisible();
    const perDay = screen.getByRole("region", { name: "Errands created per day" });
    expect(within(perDay).getAllByRole("rowheader").map((cell) => cell.textContent)).toEqual(["21 Oct", "20 Oct"]);
    expect(fetchMock.mock.calls.map(([url]) => String(url)).sort()).toEqual([
      "/v1/admin/credit/analytics?from=2026-10-20&to=2026-10-21",
      "/v1/admin/orders/analytics?from=2026-10-20&to=2026-10-21",
    ]);
    const platform = screen.getByRole("region", { name: "Platform credits" });
    expect(await within(platform).findByText("Total in circulation")).toBeVisible();
    expect(tile(platform, "Total in circulation")).toHaveTextContent("740");
    expect(tile(platform, "Credits transferred")).toHaveTextContent("12");
    expect(screen.queryByRole("region", { name: "Wallet" })).toBeNull();
  });

  it("keeps other panels usable and shows no zeros when platform credits are unavailable", async () => {
    routeFetch({
      "/admin/orders/analytics?": () => json({
        ...emptyPeriod,
        totalCreated: 2,
        byState: { ...noErrands, COMPLETED: 1, FAILED: 1 },
        rates: { completed: 0.5, cancelled: 0, expired: 0, failed: 0.5 },
      }),
      "/admin/credit/analytics?": () => failure("DATABASE_UNAVAILABLE", 503),
    });
    await renderDashboard();
    const platform = await screen.findByRole("region", { name: "Platform credits" });
    expect(await within(platform).findByRole("alert")).toHaveTextContent("unavailable");
    expect(within(platform).getByRole("button", { name: "Try again" })).toBeVisible();
    expect(within(platform).queryByText("Available")).toBeNull();
    const overview = screen.getByRole("region", { name: "Errand overview" });
    expect(tile(overview, "Completion rate")).toHaveTextContent("50%");
  });

  it("shows a looked-up user's errand activity, wallet and credit transactions", async () => {
    const fetchMock = routeFetch({
      "/admin/orders/analytics/users/": () => json(userActivity),
      "/admin/orders/analytics?": () => json(emptyPeriod),
      "/admin/credit/analytics?": () => json(credits),
      "/transactions?": () => json(transactions),
      "/admin/wallets/": () => json(wallet),
    });
    await renderDashboard();
    await lookUpUser();
    const activity = await screen.findByRole("region", { name: "User activity" });
    expect(await within(activity).findByText("As requester: 2 errands")).toBeVisible();
    const balances = await screen.findByRole("region", { name: "Wallet" });
    expect(await within(balances).findByText("Available")).toBeVisible();
    expect(tile(balances, "Available")).toHaveTextContent("15");
    expect(tile(balances, "Reserved")).toHaveTextContent("5");
    const ledger = screen.getByRole("region", { name: "Credit transactions" });
    expect(await within(ledger).findByText("Reserved for an errand")).toBeVisible();
    expect(within(ledger).getByText("−5 credits")).toBeVisible();
    expect(within(ledger).getByText("Welcome credits")).toBeVisible();
    expect(fetchMock.mock.calls.map(([url]) => String(url))).toEqual(expect.arrayContaining([
      `/v1/admin/wallets/${USER_ID}`,
      `/v1/admin/wallets/${USER_ID}/transactions?page=1&pageSize=10`,
    ]));
  });

  it("keeps errand activity visible and shows no zeros when the wallet is unavailable", async () => {
    routeFetch({
      "/admin/orders/analytics/users/": () => json(userActivity),
      "/admin/orders/analytics?": () => json(emptyPeriod),
      "/admin/credit/analytics?": () => json(credits),
      "/admin/wallets/": () => failure("DATABASE_UNAVAILABLE", 503),
    });
    await renderDashboard();
    await lookUpUser();
    const balances = await screen.findByRole("region", { name: "Wallet" });
    expect(await within(balances).findByRole("alert")).toHaveTextContent("unavailable");
    expect(within(balances).getByRole("button", { name: "Try again" })).toBeVisible();
    expect(within(balances).queryByText("Available")).toBeNull();
    const activity = screen.getByRole("region", { name: "User activity" });
    expect(await within(activity).findByText("As requester: 2 errands")).toBeVisible();
  });
});
