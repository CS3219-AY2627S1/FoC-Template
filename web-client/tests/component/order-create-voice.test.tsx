/*
 * AI Assistance Disclosure (hwangjihun):
 * Tool: Claude Code (model: Claude Opus 5.5), date: 2026-10-30, 2026-10-31
 * Scope: Generated and refined Supplier/Voice Assist integration and browser regression checks.
 * Author review: I validated correctness, and added boundary checks.
 */

import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { OrderCreatePage } from "../../src/pages/order-create-page";
import { draftFields, installMicrophone, TOMORO } from "../voice-fakes";

const auth = vi.hoisted(() => ({
  user: { userId: "u-requester", username: "jo", email: "jo@u.nus.edu", displayName: "Jo", systemRole: "USER", accountStatus: "ACTIVE" },
  withCurrentAccess: vi.fn(async (operation: (token: string) => unknown) => operation("token")),
}));
vi.mock("../../src/app/use-auth", () => ({ useAuth: () => auth }));

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

function routeFetch(fields = draftFields()) {
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url.endsWith("/voice-assist/status")) {
      return json({ available: true, provider: "OpenAI", maxRecordingSeconds: 60, processingTimeoutSeconds: 30, retentionNotice: "Audio is sent to OpenAI." });
    }
    if (url.endsWith("/voice-assist/errand-drafts")) {
      const requestId = new Headers(init?.headers).get("X-Client-Request-Id");
      return json({ requestId, generatedAt: "2026-10-30T05:20:00Z", timeZone: "Asia/Singapore", outcome: "DRAFT", transcript: "Latte from Tomoro", fields });
    }
    if (url.includes(`/suppliers/${TOMORO}`)) {
      return json({ id: TOMORO, name: "TOMORO COFFEE", building_area: "Hon Sui Sen Memorial Library", floor: "2", status: "ACTIVE" });
    }
    return json({ items: [], page: 1, page_size: 20, total: 0 });
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

async function renderPage() {
  await act(async () => { render(<MemoryRouter><OrderCreatePage /></MemoryRouter>); });
}

async function click(name: string) {
  await act(async () => { fireEvent.click(screen.getByRole("button", { name })); });
}

describe("Voice drafting on the errand form", () => {
  beforeEach(() => { sessionStorage.clear(); installMicrophone(); });
  afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

  it("fills the ordinary form for review and creates nothing (N3F3.1.1, N3F3.1.3)", async () => {
    const fetchMock = routeFetch();
    await renderPage();
    await click("Start recording");
    await click("Stop and generate draft");

    expect(screen.getByLabelText("Instructions")).toHaveValue("an iced latte");
    expect(screen.getByLabelText("Delivery location")).toHaveValue("COM3 level 1");
    expect(screen.getByLabelText("Credit reward")).toHaveValue(5);
    expect(screen.getByLabelText("Latest delivery time (SGT)")).toHaveValue("2026-10-30T15:00");
    expect(screen.getByLabelText("Latest acceptance time (SGT)")).toHaveValue("");
    expect(screen.getByText("Taken as 5 credits.")).toBeInTheDocument();
    expect(screen.getByText(/TOMORO COFFEE · Hon Sui Sen Memorial Library, level 2 · Main counter/)).toBeInTheDocument();
    // N3F2.1.2 / N3F2.1.4: the missing acceptance time is highlighted, never copied from delivery.
    expect(screen.getByText("Enter the latest acceptance time. A delivery time is not used for it.")).toBeInTheDocument();
    expect(fetchMock.mock.calls.some(([url]) => String(url).includes("/orders"))).toBe(false);
  });

  it("clears a highlight once the requester edits that field", async () => {
    routeFetch();
    await renderPage();
    await click("Start recording");
    await click("Stop and generate draft");
    await act(async () => {
      fireEvent.change(screen.getByLabelText("Latest acceptance time (SGT)"), { target: { value: "2026-10-30T14:00" } });
    });
    expect(screen.queryByText("Enter the latest acceptance time. A delivery time is not used for it.")).not.toBeInTheDocument();
  });

  it("offers ambiguous supplier candidates for manual choice (N3F2.2.3)", async () => {
    routeFetch(draftFields({
      supplier: {
        value: null, status: "AMBIGUOUS", note: "More than one supplier matches. Choose the pickup supplier.", suggestion: null,
        candidates: [{ id: TOMORO, name: "TOMORO COFFEE", buildingArea: "Hon Sui Sen Memorial Library", floor: "2" }],
      },
    }));
    await renderPage();
    await click("Start recording");
    await click("Stop and generate draft");
    expect(screen.getByText("More than one supplier matches. Choose the pickup supplier.")).toBeInTheDocument();
    await click("TOMORO COFFEE · Hon Sui Sen Memorial Library, level 2");
    expect(screen.queryByRole("group", { name: "Possible pickup suppliers" })).not.toBeInTheDocument();
  });

  it("discards the draft, including edits, and creates nothing (N3F3.1.2, N3F3.1.3)", async () => {
    const fetchMock = routeFetch();
    await renderPage();
    await click("Start recording");
    await click("Stop and generate draft");
    await act(async () => { fireEvent.change(screen.getByLabelText("Delivery location"), { target: { value: "UTown" } }); });
    await click("Discard draft");

    expect(screen.getByLabelText("Instructions")).toHaveValue("");
    expect(screen.getByLabelText("Delivery location")).toHaveValue("");
    expect(screen.getByLabelText("Credit reward")).toHaveValue(null);
    expect(screen.getByLabelText("Latest delivery time (SGT)")).toHaveValue("");
    expect(screen.queryByText("Taken as 5 credits.")).not.toBeInTheDocument();
    expect(screen.queryByText("Enter the latest acceptance time. A delivery time is not used for it.")).not.toBeInTheDocument();
    expect(screen.queryByText("Latte from Tomoro")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Discard draft" })).not.toBeInTheDocument();
    // An empty form records straight away, without the replace confirmation.
    await click("Start recording");
    expect(screen.queryByText("Recording again replaces every detail in the form below.")).not.toBeInTheDocument();
    expect(fetchMock.mock.calls.some(([url]) => String(url).includes("/orders"))).toBe(false);
  });

  it("asks before a new recording replaces typed details", async () => {
    routeFetch();
    await renderPage();
    await act(async () => { fireEvent.change(screen.getByLabelText("Delivery location"), { target: { value: "UTown" } }); });
    await click("Start recording");
    expect(screen.getByText("Recording again replaces every detail in the form below.")).toBeInTheDocument();
    expect(screen.getByLabelText("Delivery location")).toHaveValue("UTown");
  });
});
