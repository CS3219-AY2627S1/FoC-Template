/*
 * AI Assistance Disclosure (hwangjihun):
 * Tool: Claude Code (model: Claude Opus 5.5), date: 2026-10-30, 2026-10-31
 * Scope: Implemented the Voice Assist HTTP client and draft/error handling.
 * Author review: I validated correctness, and added boundary checks.
 */

import { requestJson } from "./client";

export type DraftFieldStatus = "FILLED" | "MISSING" | "AMBIGUOUS" | "CONFLICT";
export type DraftField<T> = { value: T | null; status: DraftFieldStatus; note: string | null; display?: string | null };
export type DraftSupplierOption = { id: string; name: string; buildingArea: string; floor: string | null };
export type DraftSupplierField = {
  value: string | null;
  status: DraftFieldStatus;
  note: string | null;
  suggestion: (DraftSupplierOption & { pickupLocationDescription: string }) | null;
  candidates: DraftSupplierOption[];
};
export type ErrandDraftFields = {
  itemDescription: DraftField<string>;
  deliveryLocation: DraftField<string>;
  reward: DraftField<number>;
  acceptanceDeadline: DraftField<string>;
  deliveryDeadline: DraftField<string>;
  supplier: DraftSupplierField;
};
export type ErrandDraft = {
  requestId: string;
  generatedAt: string;
  timeZone: "Asia/Singapore";
  outcome: "DRAFT" | "NO_SPEECH" | "NO_ERRAND" | "MULTIPLE_ERRANDS";
  transcript: string;
  fields: ErrandDraftFields | null;
};
export type VoiceAssistStatus = {
  available: boolean;
  provider: string;
  maxRecordingSeconds: number;
  processingTimeoutSeconds: number;
  retentionNotice: string;
};

export const voiceAssistService = {
  status(accessToken: string) {
    return requestJson<VoiceAssistStatus>("/voice-assist/status", {}, accessToken);
  },
  // Each recording is sent exactly once per user action; a retry needs a new recording (N3F4.1.1).
  draft(audio: Blob, requestId: string, accessToken: string, signal?: AbortSignal) {
    return requestJson<ErrandDraft>("/voice-assist/errand-drafts", {
      method: "POST",
      body: audio,
      headers: { "Content-Type": audio.type || "audio/webm", "X-Client-Request-Id": requestId },
      signal,
    }, accessToken);
  },
};
