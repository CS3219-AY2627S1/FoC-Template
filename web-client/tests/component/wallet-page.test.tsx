// AI Assistance Disclosure:
// Tool: Claude Code (model: Claude Opus 5.5), date: 2026-10-13
// Scope: Added wallet page component tests.
// Author review: I validated correctness and supplied additional boundary checks.

import { act, cleanup, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { WalletPage } from "../../src/pages/wallet-page";

const auth = vi.hoisted(() => ({
  user: { userId: "me", username: "Alice", email: "alice@u.nus.edu", displayName: "Alice", systemRole: "USER", accountStatus: "ACTIVE" },
  withCurrentAccess: vi.fn(),
}));

vi.mock("../../src/app/use-auth", () => ({ useAuth: () => auth }));

const wallet = { userId: "me", available: 15, reserved: 5, total: 20, updatedAt: "2026-10-13T00:00:00Z" };
const history = {
  items: [
    { transactionId: "t3", type: "TRANSFER", amount: 5, walletUserId: "someone", counterpartyUserId: "me", orderId: "o1", createdAt: "2026-10-13T02:00:00Z" },
    { transactionId: "t2", type: "RESERVATION", amount: 5, walletUserId: "me", counterpartyUserId: null, orderId: "o2", createdAt: "2026-10-13T01:00:00Z" },
    { transactionId: "t1", type: "ALLOCATION", amount: 20, walletUserId: "me", counterpartyUserId: null, orderId: null, createdAt: "2026-10-13T00:00:00Z" },
  ],
  page: 1, pageSize: 10, total: 3,
};

function respondWith(...bodies: Array<[unknown, number]>) {
  const fetchMock = vi.fn();
  for (const [body, status] of bodies) {
    fetchMock.mockImplementationOnce(async () => new Response(JSON.stringify(body), {
      status, headers: { "content-type": "application/json" },
    }));
  }
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

async function renderPage() {
  await act(async () => { render(<MemoryRouter initialEntries={["/wallet"]}><WalletPage /></MemoryRouter>); });
}

const amounts = (entries: HTMLElement[]) => entries.map((entry) => entry.querySelector(".wallet-activity-amount > strong")?.textContent);

describe("Wallet page", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.stubGlobal("matchMedia", vi.fn(() => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() })));
    auth.withCurrentAccess.mockImplementation((operation: (token: string) => Promise<unknown>) => operation("current-token"));
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("shows available, reserved and total balances with signed history", async () => {
    const fetchMock = respondWith([wallet, 200], [history, 200]);
    await renderPage();
    expect(screen.getByRole("heading", { level: 1, name: "Credit wallet" })).toBeVisible();
    const balance = await screen.findByRole("region", { name: "Credit balance" });
    expect(Array.from(balance.querySelectorAll("article"), (stat) => stat.textContent)).toEqual([
      "Available15 creditsSpendable now",
      "Reserved5 credits",
      "Total20 creditsClosed campus economy",
    ]);
    const entries = within(screen.getByRole("region", { name: "Credit history" })).getAllByRole("listitem");
    expect(entries.map((entry) => entry.querySelector(".wallet-activity-detail strong")?.textContent)).toEqual([
      "Earned · #O1", "Reserved · #O2", "Welcome credits",
    ]);
    expect(amounts(entries)).toEqual(["+5", "−5", "+20"]);
    expect(within(entries[0]).getByRole("link", { name: /View errand/ })).toHaveAttribute("href", "/orders/o1");
    expect(within(entries[2]).queryByRole("link")).toBeNull();
    expect(screen.queryByRole("navigation", { name: "Result pages" })).toBeNull();
    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual([
      "/v1/wallets/me",
      "/v1/wallets/me/transactions?page=1&pageSize=10",
    ]);
  });

  it("labels a requester's outgoing transfer as paid and paginates long histories", async () => {
    const paid = { ...history, total: 25, items: [
      { transactionId: "t9", type: "TRANSFER", amount: 7, walletUserId: "me", counterpartyUserId: "courier", orderId: "abcdef12-0000", createdAt: "2026-10-13T03:00:00Z" },
    ] };
    respondWith([wallet, 200], [paid, 200]);
    await renderPage();
    const entries = await screen.findAllByRole("listitem");
    expect(entries[0]).toHaveTextContent("Paid · #ABCDEF12");
    expect(amounts(entries)).toEqual(["−7"]);
    expect(screen.getByRole("navigation", { name: "Result pages" })).toHaveTextContent("Page 1 of 3");
  });

  it("explains a wallet that is still being set up", async () => {
    respondWith([{ error: { code: "WALLET_NOT_READY", message: "Not ready", correlationId: "c", fieldErrors: [] } }, 404]);
    await renderPage();
    expect(await screen.findByRole("alert")).toHaveTextContent("Your wallet is being set up.");
  });

  it("shows a generic retry message when Credit is unavailable", async () => {
    respondWith([{ error: { code: "DATABASE_UNAVAILABLE", message: "Down", correlationId: "c", fieldErrors: [] } }, 503]);
    await renderPage();
    expect(await screen.findByRole("alert")).toHaveTextContent("Credits are unavailable right now.");
  });
});
