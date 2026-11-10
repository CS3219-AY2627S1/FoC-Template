/*
 * AI Assistance Disclosure (hwangjihun):
 * Tool: Claude Code (model: Claude Opus 5.5), date: 2026-10-30, 2026-10-31
 * Scope: Implemented voice recording, draft feedback and draft discard controls.
 * Author review: I validated correctness, and added boundary checks.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { isApiRequestError } from "../api/client";
import { voiceAssistService, type ErrandDraftFields, type VoiceAssistStatus } from "../api/voice-assist-service";
import { useAuth } from "../app/use-auth";
import { VoiceRecorder, type RecorderFailure } from "../voice/recorder";

// N3NFR2.1: the requester waits at most 30 seconds once processing starts.
export const PROCESSING_TIMEOUT_MS = 30_000;

type Phase =
  | { kind: "idle" }
  | { kind: "confirm"; previous: Phase }
  | { kind: "requesting" }
  | { kind: "recording"; elapsed: number }
  | { kind: "processing"; limitReached: boolean }
  | { kind: "ready"; transcript: string }
  | { kind: "problem"; message: string; transcript?: string; canRecord: boolean };

const recorderMessages: Record<RecorderFailure, string> = {
  denied: "Microphone access was denied. Allow the microphone in your browser settings to record, or fill in the form below.",
  unsupported: "Voice recording is not supported in this browser. Fill in the form below instead.",
  failed: "The recording could not be completed. Record again or fill in the form below.",
};

const serverCodes = new Set([
  "RATE_LIMITED", "DAILY_LIMIT_REACHED", "VOICE_ASSIST_UNAVAILABLE", "TRANSCRIPTION_FAILED", "DRAFT_FAILED",
  "PROVIDER_TIMEOUT", "AUDIO_TOO_LARGE", "UNSUPPORTED_AUDIO", "EMPTY_AUDIO",
]);

function draftError(failure: unknown): { message: string; canRecord: boolean } {
  if (!isApiRequestError(failure)) return { message: "We could not draft your errand. Record again or fill in the form below.", canRecord: true };
  if (failure.code === "NETWORK_ERROR") return { message: "Check your connection, then record again or fill in the form below.", canRecord: true };
  if (failure.status === 401) return { message: "Please sign in again to use voice drafting.", canRecord: false };
  if (serverCodes.has(failure.code)) {
    return { message: failure.message, canRecord: !["DAILY_LIMIT_REACHED", "VOICE_ASSIST_UNAVAILABLE"].includes(failure.code) };
  }
  return { message: "Voice drafting is unavailable right now. Fill in the form below.", canRecord: false };
}

function clock(seconds: number) {
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

export function VoiceDraftPanel({ formHasValues, onDraft, onDiscard, onManual }: {
  formHasValues: boolean;
  onDraft: (fields: ErrandDraftFields) => void;
  onDiscard: () => void;
  onManual: () => void;
}) {
  const { withCurrentAccess } = useAuth();
  const [status, setStatus] = useState<VoiceAssistStatus | null | "loading">("loading");
  const [phase, setPhase] = useState<Phase>({ kind: "idle" });
  // A draft stays discardable until it is discarded, even after a later recording fails.
  const [drafted, setDrafted] = useState(false);
  const recorder = useRef<VoiceRecorder | null>(null);
  const sequence = useRef(0);
  const controller = useRef<AbortController | null>(null);
  const maxSeconds = status && status !== "loading" ? status.maxRecordingSeconds : 60;

  useEffect(() => {
    let active = true;
    withCurrentAccess((token) => voiceAssistService.status(token))
      .then((result) => { if (active) setStatus(result); })
      // N3NFR2.2: an unreachable Voice Assist service only hides voice input.
      .catch(() => { if (active) setStatus(null); });
    return () => { active = false; };
  }, [withCurrentAccess]);

  // Leaving the page discards any recording and ignores any late response (N3F4.1.3).
  useEffect(() => () => {
    sequence.current += 1;
    controller.current?.abort();
    recorder.current?.cancel();
  }, []);

  const process = useCallback(async (audio: Blob, limitReached: boolean) => {
    const current = ++sequence.current;
    controller.current?.abort();
    const abort = new AbortController();
    controller.current = abort;
    const requestId = globalThis.crypto?.randomUUID?.() ?? `voice-${Date.now()}`;
    let timedOut = false;
    const timer = window.setTimeout(() => { timedOut = true; abort.abort(); }, PROCESSING_TIMEOUT_MS);
    setPhase({ kind: "processing", limitReached });
    try {
      const draft = await withCurrentAccess((token) => voiceAssistService.draft(audio, requestId, token, abort.signal));
      if (current !== sequence.current || draft.requestId !== requestId) return;
      if (draft.outcome === "NO_SPEECH") {
        setPhase({ kind: "problem", message: "No speech was recognised. Record again or fill in the form below.", canRecord: true });
      } else if (draft.outcome === "NO_ERRAND") {
        setPhase({ kind: "problem", message: "We did not hear an errand. Say what you need, the pickup supplier and where to deliver it, or fill in the form below.", transcript: draft.transcript, canRecord: true });
      } else if (draft.outcome === "MULTIPLE_ERRANDS" || !draft.fields) {
        setPhase({ kind: "problem", message: "It sounds like more than one errand. Record one errand at a time, or fill in the form below.", transcript: draft.transcript, canRecord: true });
      } else {
        onDraft(draft.fields);
        setDrafted(true);
        setPhase({ kind: "ready", transcript: draft.transcript });
      }
    } catch (failure) {
      if (current !== sequence.current) return;
      // N3F4.1.2: on failure the form is left exactly as it was.
      setPhase(timedOut
        ? { kind: "problem", message: "Drafting took too long. Record again or fill in the form below.", canRecord: true }
        : { kind: "problem", ...draftError(failure) });
    } finally {
      window.clearTimeout(timer);
      if (controller.current === abort) controller.current = null;
    }
  }, [onDraft, withCurrentAccess]);

  const startRecording = useCallback(() => {
    setPhase({ kind: "requesting" });
    const next = new VoiceRecorder({
      onRecording: () => setPhase({ kind: "recording", elapsed: 0 }),
      onTick: (elapsed) => setPhase((current) => current.kind === "recording" ? { kind: "recording", elapsed } : current),
      onFinish: (audio, reason) => { recorder.current = null; void process(audio, reason === "limit"); },
      onError: (failure) => {
        recorder.current = null;
        setPhase({ kind: "problem", message: recorderMessages[failure], canRecord: failure === "failed" });
      },
    }, maxSeconds);
    recorder.current = next;
    void next.start();
  }, [maxSeconds, process]);

  function record() {
    // N3F3.1.2: a new draft replaces everything, so confirm before discarding entered details.
    if (formHasValues) setPhase((current) => ({ kind: "confirm", previous: current }));
    else startRecording();
  }

  function cancel() {
    sequence.current += 1;
    controller.current?.abort();
    recorder.current?.cancel();
    recorder.current = null;
    setPhase({ kind: "idle" });
  }

  // N3F3.1.2: discarding empties the form, including any edits made to the draft.
  function discard() {
    onDiscard();
    setDrafted(false);
    setPhase({ kind: "idle" });
  }

  if (status === "loading") return null;
  const canDiscard = drafted && formHasValues && ["idle", "ready", "problem"].includes(phase.kind);
  if (!status || !status.available || !VoiceRecorder.supported()) {
    return <section className="order-panel order-voice" aria-labelledby="voice-draft-heading">
      <h2 id="voice-draft-heading">Describe it by voice</h2>
      <p className="order-muted" role="status">{status && status.available
        ? recorderMessages.unsupported
        : "Voice drafting is unavailable right now. Fill in the form below."}</p>
    </section>;
  }

  return <section className="order-panel order-voice" aria-labelledby="voice-draft-heading">
    <h2 id="voice-draft-heading">Describe it by voice</h2>
    <p className="order-muted">Say one errand: what you need, the pickup supplier, where to deliver it, the reward and both deadlines. You can check every field before posting.</p>
    {phase.kind === "idle" ? <p className="order-voice-notice">{status.retentionNotice}</p> : null}
    <div className="order-voice-status" role="status" aria-live="polite">
      {phase.kind === "requesting" ? <p>Waiting for microphone permission…</p> : null}
      {phase.kind === "recording" ? <p><span className="order-voice-dot" aria-hidden="true" />Recording: {clock(phase.elapsed)} of {clock(maxSeconds)}</p> : null}
      {phase.kind === "processing" ? <p>{phase.limitReached ? `Recording stopped at the ${maxSeconds}-second limit. ` : ""}Generating your draft…</p> : null}
      {phase.kind === "ready" ? <p><strong>Draft ready.</strong> Check the highlighted fields below, then post your errand.</p> : null}
    </div>
    {phase.kind === "problem" ? <p className="order-voice-problem" role="alert">{phase.message}</p> : null}
    {phase.kind === "confirm" ? <p className="order-voice-notice">Recording again replaces every detail in the form below.</p> : null}
    {(phase.kind === "ready" || phase.kind === "problem") && phase.transcript ? <details className="order-voice-transcript">
      <summary>What we heard</summary>
      <p>{phase.transcript}</p>
    </details> : null}
    <div className="order-actions">
      {phase.kind === "idle" ? <button className="order-button" type="button" onClick={record}>Start recording</button> : null}
      {phase.kind === "confirm" ? <>
        <button className="order-button" type="button" onClick={startRecording}>Replace and record</button>
        <button className="order-button order-secondary" type="button" onClick={() => setPhase(phase.previous)}>Keep my details</button>
      </> : null}
      {phase.kind === "recording" ? <>
        <button className="order-button" type="button" onClick={() => recorder.current?.stop()}>Stop and generate draft</button>
        <button className="order-button order-secondary" type="button" onClick={cancel}>Cancel recording</button>
      </> : null}
      {phase.kind === "requesting" || phase.kind === "processing" ? <button className="order-button order-secondary" type="button" onClick={cancel}>Cancel</button> : null}
      {phase.kind === "ready" || (phase.kind === "problem" && phase.canRecord) ? <button className="order-button order-secondary" type="button" onClick={record}>Record again</button> : null}
      {canDiscard ? <button className="order-text-button" type="button" onClick={discard}>Discard draft</button> : null}      {phase.kind === "problem" ? <button className="order-text-button" type="button" onClick={onManual}>Fill in the form myself</button> : null}
    </div>
  </section>;
}
