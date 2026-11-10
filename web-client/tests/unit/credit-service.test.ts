// AI Assistance Disclosure:
// Tool: Claude Code (model: Claude Opus 5.5), date: 2026-10-13
// Scope: Added wallet client unit tests.
// Author review: I validated correctness and supplied additional boundary checks.

import { afterEach, describe, expect, it, vi } from "vitest";
import { creditService } from "../../src/api/credit-service";

function respond(body: unknown, status = 200) {
  const fetchMock = vi.fn().mockImplementation(async () => new Response(JSON.stringify(body), {
    status, headers: { "content-type": "application/json" },
  }));
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

describe("Credit client", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("reads only the caller's own wallet with current auth", async () => {
    const fetchMock = respond({ userId: "me", available: 15, reserved: 5, total: 20, updatedAt: "2026-10-13T00:00:00Z" });
    const wallet = await creditService.myWallet("current-token");
    const [url, options] = fetchMock.mock.calls[0];
    expect(url).toBe("/v1/wallets/me");
    expect(options.method).toBe("GET");
    expect(options.headers.get("Authorization")).toBe("Bearer current-token");
    expect(wallet.total).toBe(20);
  });

  it("pages the caller's history without accepting a user ID", async () => {
    const fetchMock = respond({ items: [], page: 2, pageSize: 10, total: 0 });
    await creditService.myTransactions({ page: 2, pageSize: 10 }, "current-token");
    expect(fetchMock.mock.calls[0][0]).toBe("/v1/wallets/me/transactions?page=2&pageSize=10");
  });

  it("surfaces a wallet that is not ready as a typed API error", async () => {
    respond({ error: { code: "WALLET_NOT_READY", message: "Not ready", correlationId: "c", fieldErrors: [] } }, 404);
    await expect(creditService.myWallet("current-token")).rejects.toMatchObject({ status: 404, code: "WALLET_NOT_READY" });
  });
});
