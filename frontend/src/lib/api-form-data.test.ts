/*
 * AI Assistance Disclosure:
 * Tool: OpenAI Codex (GPT-5), date: 2026-10-13
 * Mode: Implementation.
 * Scope: Generated or updated frontend code for the team-specified report form, order association, navigation, and completion reminder.
 * Author review: I reviewed for correctness
 */
import { afterEach, expect, it, vi } from "vitest"
import { apiRequest } from "@/lib/api"

afterEach(() => vi.unstubAllGlobals())

it("lets the browser set the multipart boundary for FormData", async () => {
  const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ ok: true }), { status: 200, headers: { "Content-Type": "application/json" } }))
  vi.stubGlobal("fetch", fetchMock)
  const form = new FormData(); form.append("report", new Blob(["{}"], { type: "application/json" }))
  await apiRequest("http://gateway", "/api/reports", { method: "POST", token: "token", body: form })
  const options = fetchMock.mock.calls[0][1] as RequestInit
  expect(options.body).toBe(form)
  expect(options.headers).toEqual({ Accept: "application/json", Authorization: "Bearer token" })
})
