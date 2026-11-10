/*
 * AI Assistance Disclosure (hwangjihun):
 * Tool: Claude Code (model: Claude Opus 5.5), date: 2026-10-30, 2026-10-31
 * Scope: Generated and refined Voice Assist client, form or recording regression checks.
 * Author review: I validated correctness, and added boundary checks.
 */

import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PROCESSING_TIMEOUT_MS, VoiceDraftPanel } from "../../src/components/voice-draft-panel";
import { draftFields, FakeMediaRecorder, installMicrophone, removeMicrophone } from "../voice-fakes";

const auth = vi.hoisted(() => ({ withCurrentAccess: vi.fn(async (operation: (token: string) => unknown) => operation("token")) }));
vi.mock("../../src/app/use-auth", () => ({ useAuth: () => auth }));

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
const failure = (code: string, status: number, message = code) => json({ error: { code, message, correlationId: "c", fieldErrors: [] } }, status);
const status = (available = true) => ({ available, provider: "OpenAI", maxRecordingSeconds: 60, processingTimeoutSeconds: 30, retentionNotice: "Audio is sent to OpenAI." });

type DraftReply = (requestId: string) => Response | Promise<Response>;

function routeFetch(reply: DraftReply, statusBody: unknown = status()) {
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    if (String(input).endsWith("/voice-assist/status")) return json(statusBody);
    const requestId = new Headers(init?.headers).get("X-Client-Request-Id")!;
    return new Promise<Response>((resolve, reject) => {
      init?.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")));
      Promise.resolve(reply(requestId)).then(resolve, reject);
    });
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

const drafts = (fetchMock: ReturnType<typeof routeFetch>) => fetchMock.mock.calls.filter(([, init]) => init?.method === "POST");
const draftReply = (outcome = "DRAFT") => (requestId: string) => json({
  requestId, generatedAt: "2026-10-30T05:20:00Z", timeZone: "Asia/Singapore", outcome,
  transcript: outcome === "NO_SPEECH" ? "" : "Get me an iced latte from Tomoro", fields: outcome === "DRAFT" ? draftFields() : null,
});

async function renderPanel(formHasValues = false) {
  const onDraft = vi.fn();
  const onDiscard = vi.fn();
  const onManual = vi.fn();
  await act(async () => { render(<VoiceDraftPanel formHasValues={formHasValues} onDraft={onDraft} onDiscard={onDiscard} onManual={onManual} />); });
  return { onDraft, onDiscard, onManual };
}

async function click(name: string) {
  await act(async () => { fireEvent.click(screen.getByRole("button", { name })); });
}

async function recordAndStop() {
  await click("Start recording");
  expect(screen.getByRole("status")).toHaveTextContent("Recording: 0:00 of 1:00");
  await click("Stop and generate draft");
}

describe("VoiceDraftPanel", () => {
  beforeEach(() => { installMicrophone(); });
  afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.useRealTimers(); });

  it("shows the provider disclosure before recording (N3NFR3.5)", async () => {
    routeFetch(draftReply());
    await renderPanel();
    expect(screen.getByText("Audio is sent to OpenAI.")).toBeInTheDocument();
    expect(FakeMediaRecorder.instances).toHaveLength(0);
  });

  it("drafts the errand after stop and shows what was heard (N3F1.1.4, N3F3.1.4)", async () => {
    const fetchMock = routeFetch(draftReply());
    const { onDraft } = await renderPanel();
    await recordAndStop();
    expect(drafts(fetchMock)).toHaveLength(1);
    expect(onDraft).toHaveBeenCalledWith(draftFields());
    expect(screen.getByRole("status")).toHaveTextContent("Draft ready.");
    expect(screen.getByText("Get me an iced latte from Tomoro")).toBeInTheDocument();
  });

  it("cancelling a recording sends nothing (N3F1.1.4)", async () => {
    const fetchMock = routeFetch(draftReply());
    await renderPanel();
    await click("Start recording");
    await click("Cancel recording");
    expect(drafts(fetchMock)).toHaveLength(0);
    expect(screen.getByRole("button", { name: "Start recording" })).toBeInTheDocument();
  });

  it("ignores a late response after the requester cancels (N3F4.1.3)", async () => {
    let release!: () => void;
    routeFetch((requestId) => new Promise((resolve) => { release = () => resolve(draftReply()(requestId) as Response); }));
    const { onDraft } = await renderPanel();
    await recordAndStop();
    expect(screen.getByRole("status")).toHaveTextContent("Generating your draft…");
    await click("Cancel");
    await act(async () => { release(); });
    expect(onDraft).not.toHaveBeenCalled();
  });

  it("times out after 30 seconds and keeps the form (N3NFR2.1, N3F4.1.2)", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    routeFetch(() => new Promise(() => {}));
    const { onDraft } = await renderPanel();
    await recordAndStop();
    await act(async () => { vi.advanceTimersByTime(PROCESSING_TIMEOUT_MS); });
    expect(screen.getByRole("alert")).toHaveTextContent("Drafting took too long.");
    expect(onDraft).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Record again" })).toBeInTheDocument();
  });

  it.each([
    ["NO_SPEECH", "No speech was recognised."],
    ["NO_ERRAND", "We did not hear an errand."],
    ["MULTIPLE_ERRANDS", "more than one errand"],
  ])("explains a %s recording without drafting", async (outcome, message) => {
    routeFetch(draftReply(outcome));
    const { onDraft } = await renderPanel();
    await recordAndStop();
    expect(screen.getByRole("alert")).toHaveTextContent(message);
    expect(onDraft).not.toHaveBeenCalled();
  });

  it("offers the ordinary form when a provider fails (N3F4.1.1)", async () => {
    routeFetch(() => failure("TRANSCRIPTION_FAILED", 502, "We could not transcribe your recording. Record again or fill in the form."));
    const { onManual } = await renderPanel();
    await recordAndStop();
    expect(screen.getByRole("alert")).toHaveTextContent("We could not transcribe your recording.");
    await click("Fill in the form myself");
    expect(onManual).toHaveBeenCalled();
  });

  it("explains a denied microphone (N3F1.1.5)", async () => {
    installMicrophone("denied");
    routeFetch(draftReply());
    await renderPanel();
    await click("Start recording");
    expect(screen.getByRole("alert")).toHaveTextContent("Microphone access was denied.");
    expect(screen.queryByRole("button", { name: "Record again" })).not.toBeInTheDocument();
  });

  it("asks before replacing entered details (N3F3.1.2)", async () => {
    routeFetch(draftReply());
    await renderPanel(true);
    await click("Start recording");
    expect(screen.getByText("Recording again replaces every detail in the form below.")).toBeInTheDocument();
    expect(FakeMediaRecorder.instances).toHaveLength(0);
    await click("Keep my details");
    await click("Start recording");
    await click("Replace and record");
    expect(FakeMediaRecorder.instances).toHaveLength(1);
  });

  it("keeps the draft discardable after Keep my details and a failed new recording (N3F3.1.2, N3F3.1.4)", async () => {
    let calls = 0;
    routeFetch((requestId) => (++calls === 1 ? draftReply()(requestId) : failure("DRAFT_FAILED", 502, "We could not draft your recording.")));
    const { onDiscard } = await renderPanel(true);
    await click("Start recording");
    await click("Replace and record");
    await click("Stop and generate draft");
    expect(screen.getByRole("button", { name: "Discard draft" })).toBeInTheDocument();

    await click("Record again");
    await click("Keep my details");
    // The draft state comes back, transcript included.
    expect(screen.getByRole("status")).toHaveTextContent("Draft ready.");
    expect(screen.getByText("Get me an iced latte from Tomoro")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Discard draft" })).toBeInTheDocument();

    await click("Record again");
    await click("Replace and record");
    await click("Stop and generate draft");
    expect(screen.getByRole("alert")).toHaveTextContent("We could not draft your recording.");
    await click("Discard draft");
    expect(onDiscard).toHaveBeenCalledOnce();
    expect(screen.queryByRole("button", { name: "Discard draft" })).not.toBeInTheDocument();
  });

  it("hides voice input when Voice Assist is unavailable (N3NFR2.2)", async () => {
    routeFetch(draftReply(), status(false));
    await renderPanel();
    expect(screen.getByText("Voice drafting is unavailable right now. Fill in the form below.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Start recording" })).not.toBeInTheDocument();
  });

  it("explains browsers without recording support (N3F1.1.5)", async () => {
    removeMicrophone();
    routeFetch(draftReply());
    await renderPanel();
    expect(screen.getByText(/not supported in this browser/)).toBeInTheDocument();
  });
});
