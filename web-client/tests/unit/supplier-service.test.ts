/*
 * AI Assistance Disclosure (hwangjihun):
 * Tool: ChatGPT (Codex, model: gpt-6-sol), date: 2026-09-24
 * Tool: Claude Code (model: Claude Opus 5.5), date: 2026-11-02
 * Scope: Generated Supplier HTTP-client filtering and error-handling regression checks.
 * Author review: I validated correctness, and added boundary checks.
 */

import { afterEach, describe, expect, it, vi } from "vitest";
import { supplierRequestTimeoutMs, supplierService } from "../../src/api/supplier-service";

describe("Supplier Service client", () => {
  afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });

  it("sends bearer auth and repeated category filters to the same-origin API", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ items: [], page: 2, page_size: 6, total: 0 }), {
      headers: { "content-type": "application/json" },
    }));
    vi.stubGlobal("fetch", fetchMock);

    await supplierService.list({ q: " cafe ", categories: ["FOOD", "COFFEE"], page: 2, pageSize: 6 }, "test-token");

    const [url, options] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain("/api/v1/suppliers?");
    expect(new URL(url, "http://localhost").searchParams.getAll("category")).toEqual(["FOOD", "COFFEE"]);
    expect(new URL(url, "http://localhost").searchParams.get("q")).toBe("cafe");
    expect((options.headers as Headers).get("Authorization")).toBe("Bearer test-token");
  });

  it("maps Supplier validation fields into the shared API error", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({
      error: { code: "VALIDATION_ERROR", message: "Supplier data is invalid", fields: [{ field: "name", message: "Must not be blank" }] },
    }), { status: 422, headers: { "content-type": "application/json" } })));

    await expect(supplierService.create({ name: "", categories: [], building_area: "", pickup_location_description: "" }, "test-token"))
      .rejects.toMatchObject({ status: 422, fieldErrors: [{ field: "name", message: "Must not be blank" }] });
  });
  it("explains a gateway failure that has no JSON error body", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("<html>Bad Gateway</html>", {
      status: 502, headers: { "content-type": "text/html" },
    })));

    await expect(supplierService.list({}, "test-token")).rejects.toMatchObject({
      status: 502, message: "Supplier Service is unavailable right now. Try again in a moment.",
    });
  });

  it("reports a dropped connection as a network error", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("Failed to fetch")));

    await expect(supplierService.list({}, "test-token")).rejects.toMatchObject({ status: 0, code: "NETWORK_ERROR" });
  });

  it("rejects a successful response that is not the API's JSON", async () => {
    vi.stubGlobal("fetch", vi.fn()
      .mockResolvedValueOnce(new Response("<!doctype html>", { headers: { "content-type": "text/html" } }))
      .mockResolvedValueOnce(new Response("{\"items\":", { headers: { "content-type": "application/json" } })));

    await expect(supplierService.list({}, "test-token")).rejects.toMatchObject({ code: "BAD_RESPONSE" });
    await expect(supplierService.list({}, "test-token")).rejects.toMatchObject({ code: "BAD_RESPONSE" });
  });

  it("stops waiting for a stalled request", async () => {
    vi.useFakeTimers();
    vi.stubGlobal("fetch", vi.fn((_url: string, options: RequestInit) => new Promise((_resolve, reject) => {
      options.signal?.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")));
    })));

    const request = supplierService.list({}, "test-token");
    const outcome = expect(request).rejects.toMatchObject({ status: 0, code: "TIMEOUT" });
    await vi.advanceTimersByTimeAsync(supplierRequestTimeoutMs);
    await outcome;
  });
});
