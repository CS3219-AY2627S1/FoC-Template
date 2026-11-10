/*
 * AI Assistance Disclosure (hwangjihun):
 * Tool: Claude Code (model: Claude Opus 5.5), date: 2026-10-30
 * Scope: Generated and refined Voice Assist client, form or recording regression checks.
 * Author review: I validated correctness, and added boundary checks.
 */

import { afterEach, expect, it, vi } from "vitest";
import { voiceAssistService } from "../../src/api/voice-assist-service";

afterEach(() => { vi.unstubAllGlobals(); });

it("sends the recording once, as audio, with its request id", async () => {
  const fetchMock = vi.fn(async () => new Response(JSON.stringify({ requestId: "r1" }), { headers: { "content-type": "application/json" } }));
  vi.stubGlobal("fetch", fetchMock);
  const audio = new Blob(["voice"], { type: "audio/webm" });
  const controller = new AbortController();
  await voiceAssistService.draft(audio, "r1", "token", controller.signal);
  expect(fetchMock).toHaveBeenCalledTimes(1);
  const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
  expect(url).toBe("/v1/voice-assist/errand-drafts");
  expect(init.method).toBe("POST");
  expect(init.body).toBe(audio);
  expect(init.signal).toBe(controller.signal);
  const headers = new Headers(init.headers);
  expect(headers.get("Content-Type")).toBe("audio/webm");
  expect(headers.get("X-Client-Request-Id")).toBe("r1");
  expect(headers.get("Authorization")).toBe("Bearer token");
});

it("still sends JSON bodies as JSON", async () => {
  const fetchMock = vi.fn(async () => new Response(null, { status: 204 }));
  vi.stubGlobal("fetch", fetchMock);
  const { requestJson } = await import("../../src/api/client");
  await requestJson("/x", { method: "POST", body: "{}" });
  const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
  expect(new Headers(init.headers).get("Content-Type")).toBe("application/json");
});
