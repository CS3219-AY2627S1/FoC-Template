// AI Assistance Disclosure:
// Tool: Claude Code (model: Claude Opus 5.5), date: 2026-10-28, 2026-10-29, 2026-11-08,
// 2026-11-10
// Scope: Added dispute detail component tests; covered participant statements and accept or
// reject decisions on disputed errands.
// Author review: I validated correctness and supplied additional boundary checks.

import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AdminDisputeDetailPage } from "../../src/pages/admin-dispute-detail-page";

const auth = vi.hoisted(() => ({
  user: { userId: "admin", username: "ada", email: "ada@u.nus.edu", displayName: "Ada", systemRole: "ADMIN", accountStatus: "ACTIVE" },
  withCurrentAccess: vi.fn(),
}));

vi.mock("../../src/app/use-auth", () => ({ useAuth: () => auth }));

const DISPUTE_ID = "d1d1d1d1-0000-4000-8000-000000000001";
const ORDER_ID = "e2e2e2e2-0000-4000-8000-000000000002";
const dispute = {
  disputeId: DISPUTE_ID, orderId: ORDER_ID, problem: "OTHER", problemDetails: "Courier never replied",
  description: null, status: "UNDER_REVIEW", resolutionReason: null, reporterRole: "REQUESTER",
  createdBy: "r1r1r1r1-requester", version: 2,
  createdAt: "2026-10-20T04:00:00Z", updatedAt: "2026-10-20T05:00:00Z", evidenceRefs: [],
  history: [
    { sequence: 1, fromStatus: null, toStatus: "OPEN", actorId: "r1r1r1r1-requester", reason: null, occurredAt: "2026-10-20T04:00:00Z" },
    { sequence: 2, fromStatus: "OPEN", toStatus: "UNDER_REVIEW", actorId: "a1a1a1a1-admin", reason: null, occurredAt: "2026-10-20T05:00:00Z" },
  ],
  statements: [
    { statementId: "s1", authorId: "r1r1r1r1-requester", authorRole: "REQUESTER", body: "Nothing arrived at COM1.", createdAt: "2026-10-20T04:10:00Z" },
    { statementId: "s2", authorId: "c1c1c1c1-courier", authorRole: "COURIER", body: "I left it at the counter.", createdAt: "2026-10-20T04:20:00Z" },
  ],
};
const errand = {
  orderId: ORDER_ID, supplierId: "s1", itemDescription: "Iced latte", deliveryLocation: "COM1", reward: 3,
  acceptanceDeadline: "2026-10-20T05:00:00Z", deliveryDeadline: "2026-10-20T06:00:00Z",
  pickup: { name: "Campus Cafe", buildingArea: "COM1", pickupLocationDescription: "Counter", floor: null, latitude: null, longitude: null, updatedAt: "2026-10-01T00:00:00Z" },
  state: "DISPUTED", disputeId: DISPUTE_ID, disputedFromState: "DELIVERED", disputedAt: "2026-10-20T04:00:00Z",
  createdAt: "2026-10-20T03:00:00Z", updatedAt: "2026-10-20T04:00:00Z", requesterId: "r1", courierId: "c1",
};
const settlement = { orderId: ORDER_ID, state: "RESERVED", amount: 3, updatedAt: "2026-10-20T04:00:00Z" };

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
const failure = (code: string, status: number) => json({ error: { code, message: code, correlationId: "c", fieldErrors: [] } }, status);

function routeFetch(transition: () => Response, current: object = dispute, related: { errand?: object; settlement?: object } = {}) {
  const fetchMock = vi.fn<(input: RequestInfo | URL, init?: RequestInit) => Promise<Response>>(async (input) => {
    const url = String(input);
    if (url.endsWith("/transitions")) return transition();
    if (url.includes("/admin/disputes/")) return json(current);
    if (url.includes("/admin/orders/")) return json(related.errand ?? errand);
    if (url.includes("/admin/credit/reservations/")) return json(related.settlement ?? settlement);
    return failure("NOT_FOUND", 404);
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

async function renderDispute() {
  await act(async () => {
    render(<MemoryRouter initialEntries={[`/admin/disputes/${DISPUTE_ID}`]}><Routes>
      <Route element={<AdminDisputeDetailPage />} path="/admin/disputes/:disputeId" />
    </Routes></MemoryRouter>);
  });
  await screen.findByRole("heading", { name: "Update status" });
}

const posts = (fetchMock: ReturnType<typeof routeFetch>) =>
  fetchMock.mock.calls.filter(([, init]) => init?.method === "POST");

async function decide(choice: "Accept" | "Reject", reason = "The courier showed no proof.") {
  fireEvent.click(await screen.findByRole("radio", { name: choice }));
  fireEvent.change(screen.getByLabelText(/Reason \(required/), { target: { value: reason } });
  await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Review decision" })); });
}

describe("Admin dispute detail", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    sessionStorage.clear();
    vi.stubGlobal("matchMedia", vi.fn(() => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() })));
    auth.withCurrentAccess.mockImplementation((operation: (token: string) => Promise<unknown>) => operation("current-token"));
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("shows the selected problem and both participants' details with their authors", async () => {
    routeFetch(() => json(dispute));
    await renderDispute();
    const casePanel = screen.getByRole("region", { name: "Case" });
    expect(within(casePanel).getByText("Other: Courier never replied")).toBeVisible();
    expect(within(casePanel).getByText("Reported by")).toBeVisible();
    expect(within(casePanel).queryByText("Admin notes")).toBeNull();
    const details = screen.getByRole("region", { name: "Details from participants" });
    expect(within(details).getByText("Nothing arrived at COM1.")).toBeVisible();
    expect(within(details).getByText("I left it at the counter.")).toBeVisible();
    expect(within(details).getByText(/^Courier C1C1C1C1/)).toBeVisible();
  });

  it("shows administrator notes and evidence only for disputes an administrator recorded", async () => {
    routeFetch(() => json(dispute), { ...dispute, reporterRole: null, description: "Requester phoned the help desk.", evidenceRefs: ["call:7"], statements: [] });
    await renderDispute();
    const casePanel = screen.getByRole("region", { name: "Case" });
    expect(within(casePanel).getByText("Requester phoned the help desk.")).toBeVisible();
    expect(within(casePanel).getByText("call:7")).toBeVisible();
    expect(within(casePanel).getByText("Recorded by")).toBeVisible();
    expect(screen.getByText("Neither participant has sent details yet.")).toBeVisible();
  });

  it("shows the held errand, where rejecting returns it, and its reserved credits", async () => {
    routeFetch(() => json(dispute));
    await renderDispute();
    const errandPanel = await screen.findByRole("region", { name: "Errand state" });
    expect(within(errandPanel).getByText("DISPUTED")).toBeVisible();
    expect(within(errandPanel).getByText("Held for this dispute. Rejecting returns it to delivered.")).toBeVisible();
    const creditPanel = screen.getByRole("region", { name: "Credit settlement" });
    expect(within(creditPanel).getByText("The reward stays reserved while the errand is disputed.")).toBeVisible();
  });

  it("starts a review from OPEN without asking for a reason or changing the errand", async () => {
    const fetchMock = routeFetch(() => json({ ...dispute, version: 2 }), { ...dispute, status: "OPEN", version: 1, history: dispute.history.slice(0, 1) });
    await renderDispute();
    expect(screen.queryByRole("radio", { name: "Accept" })).toBeNull();
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Start review" })); });
    expect(JSON.parse(String(posts(fetchMock)[0][1]?.body))).toEqual({ toStatus: "UNDER_REVIEW", reason: null, expectedVersion: 1 });
  });

  it("requires a reason before accepting or rejecting and sends nothing without one", async () => {
    const fetchMock = routeFetch(() => json(dispute));
    await renderDispute();
    fireEvent.click(screen.getByRole("radio", { name: "Reject" }));
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Review decision" })); });
    expect(screen.getByRole("alert")).toHaveTextContent("Give a reason to accept or reject this dispute.");
    expect(posts(fetchMock)).toHaveLength(0);
  });

  it("confirms accepting with the failure reason and credit effect, then sends the decision", async () => {
    const fetchMock = routeFetch(() => json({ ...dispute, status: "ACCEPTED", version: 3 }));
    await renderDispute();
    await decide("Accept");
    const confirm = screen.getByRole("group", { name: "Confirm your decision" });
    expect(within(confirm).getByText(/marked as failed \(Other\)\. 3 credits return to the requester\./)).toBeVisible();
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Confirm and apply" })); });
    expect(JSON.parse(String(posts(fetchMock)[0][1]?.body))).toEqual({
      toStatus: "ACCEPTED", reason: "The courier showed no proof.", expectedVersion: 2,
    });
  });

  it("confirms rejecting with where the errand returns, and can go back without sending", async () => {
    const fetchMock = routeFetch(() => json(dispute));
    await renderDispute();
    await decide("Reject", "Photo shows the delivery.");
    expect(screen.getByText(/returns to delivered and its lifecycle continues\. Credits stay reserved\./)).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Back" }));
    expect(screen.getByRole("radio", { name: "Reject" })).toBeChecked();
    expect(posts(fetchMock)).toHaveLength(0);
  });

  it("does not let an administrator decide when the errand is no longer held for the dispute", async () => {
    routeFetch(() => json(dispute), dispute, { errand: { ...errand, state: "DELIVERED", disputeId: null, disputedFromState: null } });
    await renderDispute();
    fireEvent.click(screen.getByRole("radio", { name: "Accept" }));
    expect(screen.getByText("The errand is no longer held for this dispute. Refresh before deciding.")).toBeVisible();
    expect(screen.getByRole("button", { name: "Review decision" })).toBeDisabled();
  });

  it.each([
    ["VERSION_CONFLICT", "This dispute was changed by someone else."],
    ["ERRAND_CHANGED", "The errand no longer matches this dispute."],
    ["DECISION_INCOMPLETE", "repeat the same decision to finish"],
  ])("asks the administrator to refresh after %s and keeps the reason", async (code, message) => {
    routeFetch(() => failure(code, 409));
    await renderDispute();
    await decide("Accept", "Keep this reason.");
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Confirm and apply" })); });
    expect(screen.getByRole("alert")).toHaveTextContent(message);
    expect(screen.getByRole("button", { name: "Refresh dispute" })).toBeVisible();
    expect(screen.getByLabelText(/Reason \(required/)).toHaveValue("Keep this reason.");
  });

  it.each([
    ["ACCEPTED", "Decision", "The errand was marked as failed, so the reward returns to the requester."],
    ["WITHDRAWN", "Withdrawal reason", "The errand continues from where it was before the dispute."],
  ])("shows a %s dispute as final with its reason and outcome", async (status, label, outcome) => {
    routeFetch(() => json(dispute), { ...dispute, status, resolutionReason: "Settled.", version: 3 });
    await renderDispute();
    expect(screen.getByText(new RegExp(`is ${status.toLowerCase()} and cannot change further`))).toBeVisible();
    expect(screen.getByText(label)).toBeVisible();
    expect(screen.getAllByText(outcome).length).toBeGreaterThan(0);
  });

  it("decides a legacy dispute without needing the errand held and says nothing changes on the errand", async () => {
    const legacy = { ...dispute, legacy: true, problem: null, problemDetails: null, description: "Arrived cold", statements: [] };
    const fetchMock = routeFetch(() => json({ ...legacy, status: "REJECTED", version: 3 }), legacy, { errand: { ...errand, state: "COMPLETED", disputeId: null } });
    await renderDispute();
    expect(screen.getByText("Earlier report (no problem selected)")).toBeVisible();
    expect(screen.getByText("Arrived cold")).toBeVisible();
    await decide("Reject", "Handled by phone.");
    expect(screen.getByText(/records your decision only\. The errand and its credits stay as they are\./)).toBeVisible();
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Confirm and apply" })); });
    expect(JSON.parse(String(posts(fetchMock)[0][1]?.body))).toMatchObject({ toStatus: "REJECTED", reason: "Handled by phone." });
  });
});
