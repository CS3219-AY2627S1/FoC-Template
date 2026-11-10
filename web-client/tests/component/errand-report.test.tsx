// AI Assistance Disclosure:
// Tool: Claude Code (model: Claude Opus 5.5), date: 2026-10-29, 2026-11-08, 2026-11-10
// Scope: Added problem report panel component tests; covered selected problems, private details
// and withdrawal for disputed errands.
// Author review: I validated correctness and supplied additional boundary checks.

import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { OrderState } from "../../src/api/order-service";
import { ErrandReportPanel } from "../../src/components/errand-report";

const auth = vi.hoisted(() => ({ withCurrentAccess: vi.fn() }));

vi.mock("../../src/app/use-auth", () => ({ useAuth: () => auth }));

const ORDER_ID = "e2e2e2e2-0000-4000-8000-000000000002";
const report = (status: string, overrides: Record<string, unknown> = {}) => ({
  disputeId: `d-${status}`, orderId: ORDER_ID, ownReport: true, reporterRole: "REQUESTER",
  problem: "ITEM_DAMAGED", problemDetails: null, status, resolutionReason: null, statements: [],
  createdAt: "2026-10-20T04:00:00Z", updatedAt: "2026-10-20T05:00:00Z", version: 1, ...overrides,
});
const page = (items: unknown[]) => ({ items, page: 1, pageSize: 50, total: items.length });
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
const failure = (code: string, status: number) => json({ error: { code, message: code, correlationId: "c", fieldErrors: [] } }, status);

type Handler = (url: string, init?: RequestInit) => Response | Promise<Response>;

function routeFetch(existing: unknown[], post: Handler = () => json(report("OPEN"), 201)) {
  const fetchMock = vi.fn<(input: RequestInfo | URL, init?: RequestInit) => Promise<Response>>(async (input, init) =>
    init?.method === "POST" ? post(String(input), init) : json(page(existing)));
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

const posts = (fetchMock: ReturnType<typeof routeFetch>) =>
  fetchMock.mock.calls.filter(([, init]) => init?.method === "POST");

async function renderPanel(state: OrderState = "DELIVERED", onErrandChanged = vi.fn()) {
  await act(async () => { render(<ErrandReportPanel onErrandChanged={onErrandChanged} orderId={ORDER_ID} state={state} />); });
  return onErrandChanged;
}

async function choose(problem: string, details?: string) {
  fireEvent.change(screen.getByLabelText("What went wrong"), { target: { value: problem } });
  if (details !== undefined) fireEvent.change(screen.getByLabelText(/Describe the problem/), { target: { value: details } });
}

describe("Errand disputes for participants", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    sessionStorage.clear();
    auth.withCurrentAccess.mockImplementation((operation: (token: string) => Promise<unknown>) => operation("current-token"));
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("reports a selected problem, holds the errand and asks the page to reload it", async () => {
    const fetchMock = routeFetch([]);
    const reload = await renderPanel();
    expect(String(fetchMock.mock.calls[0][0])).toBe(`/v1/disputes?orderId=${ORDER_ID}&pageSize=50`);
    await choose("ITEM_DAMAGED");
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Report problem" })); });
    const [url, init] = posts(fetchMock)[0];
    expect(String(url)).toBe("/v1/disputes");
    expect(JSON.parse(String(init?.body))).toEqual({ orderId: ORDER_ID, problem: "ITEM_DAMAGED", problemDetails: null });
    expect(new Headers(init?.headers).get("Idempotency-Key")).toMatch(/^[0-9a-f-]{36}$/);
    expect(reload).toHaveBeenCalled();
    expect(sessionStorage.getItem(`errand-report-draft:${ORDER_ID}`)).toBeNull();
  });

  it("requires a description only for Other and sends it for both participants to see", async () => {
    const fetchMock = routeFetch([]);
    await renderPanel("PICKED_UP");
    await choose("OTHER");
    expect(screen.getByRole("button", { name: "Report problem" })).toBeDisabled();
    await choose("OTHER", "  Courier never replied  ");
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Report problem" })); });
    expect(JSON.parse(String(posts(fetchMock)[0][1]?.body))).toMatchObject({ problem: "OTHER", problemDetails: "Courier never replied" });
  });

  it("shows an open dispute with its problem, hides the report form and offers private details", async () => {
    routeFetch([report("OPEN", { problem: "OTHER", problemDetails: "Courier never replied" })]);
    await renderPanel("DISPUTED");
    expect(screen.getByText("Other: Courier never replied")).toBeVisible();
    expect(screen.getByText(/Waiting for an administrator to review it/)).toBeVisible();
    expect(screen.queryByRole("button", { name: "Report problem" })).toBeNull();
    expect(screen.getByLabelText("Details for the administrator")).toBeVisible();
    expect(screen.getByText(/the other participant does not/)).toBeVisible();
  });

  it("sends details with a key, shows them only to their author and keeps the draft on ambiguous failures", async () => {
    let attempt = 0;
    const fetchMock = routeFetch([report("UNDER_REVIEW")], () => (++attempt === 1
      ? Promise.reject(new TypeError("network"))
      : json(report("UNDER_REVIEW", { statements: [{ statementId: "s1", body: "Photo of the box.", createdAt: "2026-10-20T06:00:00Z" }] }), 201)));
    await renderPanel("DISPUTED");
    fireEvent.change(screen.getByLabelText("Details for the administrator"), { target: { value: "Photo of the box." } });
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Send details" })); });
    expect(screen.getByRole("alert")).toBeVisible();
    expect(sessionStorage.getItem("dispute-statement-draft:d-UNDER_REVIEW")).toBe(JSON.stringify("Photo of the box."));
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Send details" })); });
    const sent = posts(fetchMock);
    expect(String(sent[0][0])).toBe("/v1/disputes/d-UNDER_REVIEW/statements");
    expect(JSON.parse(String(sent[1][1]?.body))).toEqual({ body: "Photo of the box." });
    const keys = sent.map(([, init]) => new Headers(init?.headers).get("Idempotency-Key"));
    expect(keys[0]).toBe(keys[1]);
    expect(screen.getByText("Your details to the administrator")).toBeVisible();
    expect(screen.getByText("Photo of the box.")).toBeVisible();
  });

  it("lets the reporter withdraw an OPEN report with a reason and reloads the errand", async () => {
    const fetchMock = routeFetch([report("OPEN", { version: 1 })], () =>
      json(report("WITHDRAWN", { resolutionReason: "We sorted it out.", version: 2 })));
    const reload = await renderPanel("DISPUTED");
    fireEvent.click(screen.getByRole("button", { name: "Withdraw report" }));
    fireEvent.change(screen.getByLabelText(/Why are you withdrawing/), { target: { value: "  We sorted it out. " } });
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Withdraw and continue the errand" })); });
    const [url, init] = posts(fetchMock)[0];
    expect(String(url)).toBe("/v1/disputes/d-OPEN/withdraw");
    expect(JSON.parse(String(init?.body))).toEqual({ reason: "We sorted it out.", expectedVersion: 1 });
    expect(reload).toHaveBeenCalled();
  });

  it("does not offer withdrawal once under review, to the other participant, or for administrator disputes", async () => {
    routeFetch([
      report("UNDER_REVIEW"),
      report("OPEN", { disputeId: "other", ownReport: false, reporterRole: "COURIER" }),
      report("OPEN", { disputeId: "admin", ownReport: false, reporterRole: null }),
    ]);
    await renderPanel("DISPUTED");
    expect(screen.queryByRole("button", { name: "Withdraw report" })).toBeNull();
    expect(screen.getByText(/The courier reported a problem/)).toBeVisible();
    expect(screen.getByText(/An administrator raised a problem/)).toBeVisible();
  });

  it("explains a refused withdrawal after the review started", async () => {
    routeFetch([report("OPEN")], () => failure("WITHDRAWAL_NOT_ALLOWED", 409));
    await renderPanel("DISPUTED");
    fireEvent.click(screen.getByRole("button", { name: "Withdraw report" }));
    fireEvent.change(screen.getByLabelText(/Why are you withdrawing/), { target: { value: "Sorted." } });
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Withdraw and continue the errand" })); });
    expect(screen.getByRole("alert")).toHaveTextContent("can no longer be withdrawn. Send your update as details instead.");
  });

  it.each([
    ["ACCEPTED", "Decision:", "The errand was marked as failed, so the reward returns to the requester."],
    ["REJECTED", "Decision:", "The errand continues from where it was before the dispute."],
    ["WITHDRAWN", "Withdrawal reason:", "The errand continues from where it was before the dispute."],
  ])("shows both participants the %s outcome and its reason", async (status, label, outcome) => {
    routeFetch([report(status, { ownReport: false, reporterRole: "COURIER", resolutionReason: "Checked the photos." })]);
    await renderPanel(status === "ACCEPTED" ? "FAILED" : "PICKED_UP");
    expect(screen.getByText(label)).toBeVisible();
    expect(screen.getByText("Checked the photos.")).toBeVisible();
    expect(screen.getByText(outcome)).toBeVisible();
  });

  it("lets a participant report again once the earlier dispute ended and the errand is active", async () => {
    routeFetch([report("REJECTED", { resolutionReason: "Not supported." })]);
    await renderPanel("PICKED_UP");
    expect(screen.getByLabelText("What went wrong")).toBeVisible();
  });

  it("retries an ambiguous report with the same key and keeps the draft", async () => {
    let attempt = 0;
    const fetchMock = routeFetch([], () => (++attempt === 1 ? Promise.reject(new TypeError("network")) : json(report("OPEN"), 201)));
    await renderPanel();
    await choose("ITEM_UNAVAILABLE");
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Report problem" })); });
    expect(screen.getByRole("alert")).toBeVisible();
    expect(JSON.parse(sessionStorage.getItem(`errand-report-draft:${ORDER_ID}`) ?? "{}")).toMatchObject({ problem: "ITEM_UNAVAILABLE" });
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Report problem" })); });
    const keys = posts(fetchMock).map(([, init]) => new Headers(init?.headers).get("Idempotency-Key"));
    expect(keys).toHaveLength(2);
    expect(keys[0]).toBe(keys[1]);
  });

  it("explains a dispute someone else opened first", async () => {
    routeFetch([], () => failure("DISPUTE_ALREADY_OPEN", 409));
    await renderPanel();
    await choose("ITEM_DAMAGED");
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Report problem" })); });
    expect(screen.getByRole("alert")).toHaveTextContent("already being reviewed");
  });

  it.each(["COMPLETED", "FAILED", "CANCELLED"] as const)("offers no report form once the errand is %s", async (state) => {
    routeFetch([]);
    await renderPanel(state);
    expect(screen.getByText("No problems reported.")).toBeVisible();
    expect(screen.queryByRole("button", { name: "Report problem" })).toBeNull();
  });

  it("shows legacy disputes as earlier reports that neither block a new report nor can be withdrawn", async () => {
    routeFetch([
      report("OPEN", { disputeId: "legacy-open", legacy: true, problem: null }),
      report("RESOLVED", { disputeId: "legacy-done", legacy: true, problem: null, resolutionReason: "Refund agreed" }),
    ]);
    await renderPanel("PICKED_UP");
    expect(screen.getAllByText("Earlier report (no problem selected)")).toHaveLength(2);
    expect(screen.getByText("Reported before errands paused for disputes, so the errand was not changed.")).toBeVisible();
    expect(screen.queryByRole("button", { name: "Withdraw report" })).toBeNull();
    expect(screen.queryByText(/The errand is on hold/)).toBeNull();
    expect(screen.getByLabelText("What went wrong")).toBeVisible();
  });
});
