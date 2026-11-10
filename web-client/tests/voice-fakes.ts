/*
 * AI Assistance Disclosure (hwangjihun):
 * Tool: Claude Code (model: Claude Opus 5.5), date: 2026-10-30
 * Scope: Generated and refined Voice Assist client, form or recording regression checks.
 * Author review: I validated correctness, and added boundary checks.
 */

import { vi } from "vitest";
import type { ErrandDraftFields } from "../src/api/voice-assist-service";

// Minimal MediaRecorder and microphone doubles: jsdom has neither.
export class FakeMediaRecorder {
  static instances: FakeMediaRecorder[] = [];
  static isTypeSupported = (type: string) => type === "audio/webm;codecs=opus";
  state: "inactive" | "recording" = "inactive";
  mimeType: string;
  ondataavailable: ((event: { data: Blob }) => void) | null = null;
  onstop: (() => void) | null = null;
  onerror: (() => void) | null = null;

  constructor(_stream: MediaStream, options?: { mimeType?: string }) {
    this.mimeType = options?.mimeType ?? "";
    FakeMediaRecorder.instances.push(this);
  }

  start() { this.state = "recording"; }

  stop() {
    if (this.state === "inactive") return;
    this.state = "inactive";
    this.ondataavailable?.({ data: new Blob(["voice"], { type: "audio/webm" }) });
    this.onstop?.();
  }
}

export function fakeMicrophone(result: "granted" | "denied" | "unavailable" = "granted") {
  const track = { stop: vi.fn() };
  const getUserMedia = vi.fn(async () => {
    if (result === "denied") throw Object.assign(new Error("denied"), { name: "NotAllowedError" });
    if (result === "unavailable") throw Object.assign(new Error("none"), { name: "NotFoundError" });
    return { getTracks: () => [track] } as unknown as MediaStream;
  });
  return { getUserMedia, track };
}

export function installMicrophone(result: "granted" | "denied" | "unavailable" = "granted") {
  const microphone = fakeMicrophone(result);
  FakeMediaRecorder.instances = [];
  vi.stubGlobal("MediaRecorder", FakeMediaRecorder);
  Object.defineProperty(globalThis.navigator, "mediaDevices", {
    configurable: true,
    value: { getUserMedia: microphone.getUserMedia },
  });
  return microphone;
}

export function removeMicrophone() {
  Object.defineProperty(globalThis.navigator, "mediaDevices", { configurable: true, value: undefined });
}

export const TOMORO = "5d1c3f6a-0000-4000-8000-000000000001";

export function draftFields(overrides: Partial<ErrandDraftFields> = {}): ErrandDraftFields {
  return {
    itemDescription: { value: "an iced latte", status: "FILLED", note: null },
    deliveryLocation: { value: "COM3 level 1", status: "FILLED", note: null },
    reward: { value: 5, status: "FILLED", note: "Taken as 5 credits." },
    acceptanceDeadline: { value: null, status: "MISSING", note: "Enter the latest acceptance time. A delivery time is not used for it." },
    deliveryDeadline: { value: "2026-10-30T07:00:00Z", status: "FILLED", note: null, display: "Today, 3:00 PM SGT" },
    supplier: {
      value: TOMORO, status: "FILLED", note: "Suggested from your recording. Change it if needed.",
      suggestion: { id: TOMORO, name: "TOMORO COFFEE", buildingArea: "Hon Sui Sen Memorial Library", floor: "2", pickupLocationDescription: "Main counter" },
      candidates: [],
    },
    ...overrides,
  };
}
