/**
 * AI Assistance Disclosure: OpenAI Codex (GPT-6), 2026-09-25.
 * Scope: tested shared UUID syntax validation during issue #17 review
 * remediation.
 * Author review: Reviewed and approved by @ron.
 */
import { isUuid } from "./uuid";

describe("isUuid", () => {
  it.each([
    "ac2288df-661c-5d78-bcc1-ac6bca30fe51",
    "67EF02DC-814D-49E2-B6C2-9BDC433924C0",
  ])("accepts PostgreSQL UUID text %s", (value) => {
    expect(isUuid(value)).toBe(true);
  });

  it.each([undefined, null, 42, "not-a-uuid", "67ef02dc814d49e2b6c29bdc433924c0"])(
    "rejects malformed UUID input %p",
    (value) => {
      expect(isUuid(value)).toBe(false);
    },
  );
});
